"""网页版 AI 模式：不需要 API Key，用你自己的 ChatGPT / Claude / Kimi… 订阅。

流程：程序把若干页课件整理成一段提示词 → 你粘贴到网页版对话框（可同时上传课件 PDF）
→ 把 AI 的回复整段复制回来 → 程序解析出每一页的讲解并保存。
"""
import json
import re

from . import ai, library

BY = "网页版 AI"

_FORMAT = """请严格按下面的格式输出：只输出一个 ```json 代码块，里面是一个数组，每页一个对象，不要省略任何一页，代码块外不要写任何文字。

```json
[
  {
    "page": 页码数字,
    "title": "本页标题（讲解语言）",
    "gist": "一句话核心",
    "points": [{"text": "要点", "level": 1}, {"text": "子要点", "level": 2}],
    "terms": [{"term": "课件原文术语", "meaning": "释义", "note": "补充，没有就写空字符串"}],
    "tip": "考点提示，没有就写空字符串"
  }
]
```"""


def batches(total: int, size: int) -> list[list[int]]:
    size = max(1, min(30, int(size or 8)))
    return [list(range(i, min(i + size, total + 1))) for i in range(1, total + 1, size)]


def build_prompt(deck: dict, pages: list[int], language: str = "zh", with_pdf: bool = False) -> str:
    first, last = pages[0], pages[-1]
    rng = f"第 {first} 页" if first == last else f"第 {first}–{last} 页"
    sys = ai.system_prompt(language).replace("为某一页写“讲解卡片”", "为每一页写“讲解卡片”").replace("直接输出 JSON，不要寒暄。", "")
    out = [sys.strip(), ""]
    if with_pdf:
        out += [f"我已经上传了这份课件的 PDF。请对照 PDF 中对应页的图片（尤其是图表、流程图）来讲解，下面也附上每页提取出的文字。", ""]
    out += [ai.deck_context(deck), "", f"这次请为 {rng}（共 {len(pages)} 页）各写一张讲解卡片。", ""]
    for n in pages:
        p = deck["pages"][n - 1]
        out.append(f"===== 第 {n} 页 =====")
        out.append(p.get("text") or "（本页没有可提取的文字" + ("，请看 PDF 里这一页的图片" if with_pdf else "") + "）")
        if p.get("notes"):
            out += ["【演讲者备注】", p["notes"]]
        out.append("")
    out.append(_FORMAT)
    return "\n".join(out)


def _candidates(text: str):
    """从回复里找出所有 JSON 片段：代码块优先，再退回整段文本。"""
    blocks = re.findall(r"```(?:json|JSON)?\s*(.*?)```", text, re.S)
    # 回复被截断时最后一个代码块可能没有收尾的 ```
    tail = re.search(r"```(?:json|JSON)?\s*((?:(?!```).)*)$", text, re.S)
    if tail and text.count("```") % 2 == 1:
        blocks.append(tail.group(1))
    return blocks or [text]


def _objects(chunk: str):
    """尽量从文本里取出页面对象：先整体解析，失败（比如被截断）时逐个对象解析。"""
    s = chunk.strip()
    try:
        data = json.loads(s)
        if isinstance(data, dict):
            data = data.get("pages") or data.get("slides") or [data]
        if isinstance(data, list):
            yield from (x for x in data if isinstance(x, dict))
            return
    except ValueError:
        pass
    dec = json.JSONDecoder()
    i = 0
    while True:
        i = s.find("{", i)
        if i < 0:
            return
        try:
            obj, end = dec.raw_decode(s, i)
        except ValueError:
            i += 1
            continue
        if isinstance(obj, dict) and ("page" in obj or "gist" in obj or "points" in obj):
            yield obj
            i = end
        else:
            i += 1


def _page_no(obj) -> int | None:
    v = obj.get("page", obj.get("n", obj.get("slide")))
    if isinstance(v, int):
        return v
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else None


def parse_reply(text: str, total: int, expected: list[int] | None = None) -> dict:
    """返回 {"notes": {页码: 讲解}, "missing": [...], "invalid": [...] }"""
    notes, invalid = {}, []
    order = list(expected or [])
    k = 0
    for chunk in _candidates(text or ""):
        for obj in _objects(chunk):
            n = _page_no(obj)
            if n is None and k < len(order):     # 没写页码就按顺序对应
                n = order[k]
            k += 1
            if not n or not 1 <= n <= total:
                invalid.append(n)
                continue
            # 兼容：terms 写成 [["en","zh"]]，points 写成字符串
            obj["terms"] = [t if isinstance(t, dict) else {"term": (t + ["", ""])[0], "meaning": (t + ["", ""])[1], "note": (t + ["", "", ""])[2]}
                            for t in obj.get("terms", []) if isinstance(t, (dict, list))]
            note = ai._normalize(obj, BY)
            if note["t"] or note["s"] or note["p"]:
                notes[n] = note
    missing = [n for n in order if n not in notes]
    return {"notes": notes, "missing": missing, "invalid": invalid}


def save_reply(deck_id: str, text: str, expected: list[int] | None, overwrite: bool = True) -> dict:
    d = library.deck_dir(deck_id)
    if library.is_readonly(d):
        raise ValueError("示例课件是只读的")
    deck = library.get_deck(deck_id)
    r = parse_reply(text, len(deck["pages"]), expected)
    if not r["notes"]:
        raise ValueError("没有在回复里找到讲解。请确认复制了 AI 的完整回复（包括 ```json 代码块）。")
    existing = deck.get("notes", {})
    saved, kept = [], []
    for n, note in sorted(r["notes"].items()):
        if not overwrite and str(n) in existing:
            kept.append(n)
            continue
        library.save_note(deck_id, n, note)
        saved.append(n)
    return {"saved": saved, "kept": kept, "missing": r["missing"]}
