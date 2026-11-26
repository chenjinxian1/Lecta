"""划词查词：通过有道词典查中文释义与英式音标（浏览器直接请求会被跨域拦截，所以由本地服务转发）。"""
import json
import re
import urllib.parse
import urllib.request

_UA = {"User-Agent": "Mozilla/5.0"}
_cache: dict[str, dict] = {}


def _strings(x) -> list[str]:
    if isinstance(x, str):
        return [x]
    if isinstance(x, list):
        parts = [v if isinstance(v, str) else v.get("#text", "") for v in x if isinstance(v, (str, dict))]
        s = "".join(parts).strip()
        return [s] if s else []
    return []


def lookup(q: str) -> dict:
    q = q.strip()[:80]
    key = q.lower()
    if key in _cache:
        return _cache[key]
    url = "https://dict.youdao.com/jsonapi?q=" + urllib.parse.quote(q)
    with urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=8) as r:
        d = json.loads(r.read().decode("utf-8"))
    res = {"word": q, "uk": "", "us": "", "zh": [], "web": [], "en": []}
    try:
        w = d["ec"]["word"][0]
        res["uk"], res["us"] = w.get("ukphone", ""), w.get("usphone", "")
        rp = w.get("return-phrase", {}).get("l", {}).get("i")
        if isinstance(rp, str):
            res["word"] = rp
        for tr in w.get("trs", []):
            for t in tr.get("tr", []):
                res["zh"] += _strings(t.get("l", {}).get("i"))
    except (KeyError, IndexError, TypeError):
        pass
    try:
        res["web"] = [t["value"] for t in d["web_trans"]["web-translation"][0]["trans"][:4] if t.get("value")]
    except (KeyError, IndexError, TypeError):
        pass
    try:
        for tr in d["ee"]["word"]["trs"][:3]:
            pos = tr.get("pos", "").strip(" .:")
            pos = "" if pos == "abstract" else pos
            for t in tr.get("tr", [])[:1]:
                s = _strings(t.get("l", {}).get("i"))
                if s:
                    res["en"].append((pos + ". " if pos else "") + s[0])
    except (KeyError, IndexError, TypeError):
        pass
    _cache[key] = res
    return res


# ---------------------------------------------------------------- 整句翻译（论文划句）
_tcache: dict[str, dict] = {}


def _youdao_fanyi(q: str) -> str:
    url = "https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&le=en&q=" + urllib.parse.quote(q)
    with urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=10) as r:
        d = json.loads(r.read().decode("utf-8"))
    return ((d.get("fanyi") or {}).get("tran") or "").strip()


def _mymemory(q: str) -> str:
    out = []
    # MyMemory 每次最多 500 字符：按句子切开
    parts, cur = [], ""
    for s in re.split(r"(?<=[.!?;])\s+", q):
        if len(cur) + len(s) > 480 and cur:
            parts.append(cur)
            cur = ""
        cur = (cur + " " + s).strip()
    if cur:
        parts.append(cur)
    for p in parts[:8]:
        url = "https://api.mymemory.translated.net/get?langpair=en|zh-CN&q=" + urllib.parse.quote(p[:500])
        with urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=10) as r:
            d = json.loads(r.read().decode("utf-8"))
        out.append((d.get("responseData") or {}).get("translatedText") or "")
    return "".join(out).strip()


def translate(q: str) -> dict:
    """英文句子 / 段落 → 中文。先用有道，失败再用 MyMemory。"""
    q = re.sub(r"\s+", " ", q or "").strip()[:3000]
    if not q:
        raise ValueError("empty")
    if q in _tcache:
        return _tcache[q]
    for name, fn in (("有道翻译", _youdao_fanyi), ("MyMemory", _mymemory)):
        try:
            t = fn(q)
        except Exception:  # noqa: BLE001
            continue
        if t and t.lower() != q.lower():
            res = {"text": t, "by": name}
            _tcache[q] = res
            return res
    raise RuntimeError("翻译服务暂时连不上，请检查网络")
