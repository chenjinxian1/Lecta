"""划词查词：通过有道词典查中文释义与英式音标（浏览器直接请求会被跨域拦截，所以由本地服务转发）。"""
import json
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
