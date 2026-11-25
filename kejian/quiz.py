"""练习题库：每套题一个 JSON 文件，放在 library/_quizzes/ 下（和课件一样不进 git）。

library/_quizzes/<quiz-id>.json
{
  "id": "...", "title": "...", "source": "xxx.pptx", "created": 0,
  "chapters": {"1": {"title": "What Is OB?", "deck": "<课件ID>"}, ...},
  "questions": [{
     "n": 1, "chapter": "1",
     "q": "英文题干", "q_zh": "中文题干",
     "opts": ["选项A", "选项B", ...], "opts_zh": ["A 的中文", ...],
     "ans": 1,                      # 正确选项下标（0 = A）
     "why": "原题包自带的英文简析",
     "exp_zh": "中文详细解析", "exp_en": "English explanation",
     "terms": [["英文术语", "中文", "补充说明"], ...],
     "page": 5                      # 对应课件页码（课件见 chapters[chapter].deck）
  }]
}

import_pptx() 能直接解析“每页一道题、选项 A–D、演讲者备注写 Answer: X”的练习题 PPT；
中文翻译、详细解析和课件页码可以之后再补进 JSON。
"""
import hashlib
import html
import json
import re
import time
import zipfile
from pathlib import Path

from . import library
from .config import LIBRARY

LETTERS = "ABCDEFGH"


def quiz_root() -> Path:
    d = LIBRARY / "_quizzes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def quiz_path(quiz_id: str) -> Path:
    if not re.fullmatch(r"[\w一-鿿-]{1,80}", quiz_id or ""):
        raise KeyError(quiz_id)
    p = quiz_root() / f"{quiz_id}.json"
    if not p.is_file():
        raise KeyError(quiz_id)
    return p


def _deck_ok(deck_id) -> bool:
    try:
        library.deck_dir(deck_id)
        return True
    except KeyError:
        return False


def stats(quiz_id: str, questions: list[dict]) -> dict:
    from .userdata import load_progress
    prog = load_progress(quiz_id)
    right = wrong = 0
    for q in questions:
        rec = prog.get(str(q["n"])) or {}
        if "a" in rec:
            if rec["a"] == q["ans"]:
                right += 1
            else:
                wrong += 1
    return {"right": right, "wrong": wrong, "todo": len(questions) - right - wrong, "total": len(questions)}


def list_quizzes() -> list[dict]:
    out = []
    for p in sorted(quiz_root().glob("*.json")):
        data = library._read(p, None)
        if not data or not data.get("questions"):
            continue
        out.append({
            "id": p.stem,
            "title": data.get("title", p.stem),
            "source": data.get("source", ""),
            "created": data.get("created", 0),
            "course": data.get("course") or None,
            "count": len(data["questions"]),
            "chapters": [{"key": k, "title": c.get("title", ""), "title_zh": c.get("title_zh", ""), "deck": c.get("deck")}
                         for k, c in data.get("chapters", {}).items()],
            "stats": stats(p.stem, data["questions"]),
        })
    out.sort(key=lambda x: -x["created"])
    return out


def get_quiz(quiz_id: str) -> dict:
    from .userdata import load_progress
    data = library._read(quiz_path(quiz_id), None)
    if not data:
        raise KeyError(quiz_id)
    data["id"] = quiz_id
    # 告诉前端每章对应的课件还在不在，方便决定是否显示“看课件”按钮
    for c in data.get("chapters", {}).values():
        deck = c.get("deck")
        c["deck_ok"] = bool(deck) and _deck_ok(deck)
    data["progress"] = load_progress(quiz_id)
    return data


def _raw(quiz_id: str) -> dict:
    return library._read(quiz_path(quiz_id), {})


def update_meta(quiz_id: str, title: str | None = None, course: str | None = "__keep__"):
    with library._lock:
        data = _raw(quiz_id)
        if title is not None and title.strip():
            data["title"] = title.strip()[:200]
        if course != "__keep__":
            if course:
                data["course"] = course
            else:
                data.pop("course", None)
        library._write(quiz_path(quiz_id), data)


def set_course(quiz_id: str, course: str | None):
    update_meta(quiz_id, course=course)


def delete_quiz(quiz_id: str):
    quiz_path(quiz_id).unlink()
    prog = LIBRARY / "_progress" / f"{quiz_id}.json"
    if prog.is_file():
        prog.unlink()


def save_quiz(data: dict) -> str:
    quiz_id = data.get("id") or _slug(data.get("title", "quiz"))
    data["id"] = quiz_id
    data.pop("progress", None)
    library._write(quiz_root() / f"{quiz_id}.json", data)
    return quiz_id


# ---------------------------------------------------------------- 校验 / 从 JSON 导入（给 AI 用）
def validate(data: dict) -> tuple[dict, list[str]]:
    """检查并规范化题库 JSON。返回 (规范化后的数据, 错误列表)。错误列表为空才算合格。

    宽松接受：ans 可以写成 "B" 或 1；opts 可以写成 {"A": "...", "B": "..."}；n 缺省时按顺序编号；
    chapter 缺省为 "1"。
    """
    errs = []
    if not isinstance(data, dict):
        return {}, ["顶层必须是 JSON 对象"]
    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        return data, ["缺少 questions 数组，或数组为空"]
    out_q, seen = [], set()
    for i, q in enumerate(qs, 1):
        where = f"第 {i} 题"
        if not isinstance(q, dict):
            errs.append(f"{where}：必须是对象")
            continue
        opts = q.get("opts", q.get("options"))
        if isinstance(opts, dict):
            opts = [opts[k] for k in sorted(opts)]
        if not isinstance(opts, list) or not 2 <= len(opts) <= len(LETTERS) or not all(isinstance(o, str) and o.strip() for o in opts):
            errs.append(f"{where}：opts 需要 2–8 个非空字符串选项")
            continue
        ans = q.get("ans", q.get("answer"))
        if isinstance(ans, str) and len(ans.strip()) == 1 and ans.strip().upper() in LETTERS:
            ans = LETTERS.index(ans.strip().upper())
        if not isinstance(ans, int) or not 0 <= ans < len(opts):
            errs.append(f"{where}：ans 必须是选项下标（0 起）或字母 A–H，且在选项范围内")
            continue
        text = str(q.get("q", q.get("question", ""))).strip()
        if not text:
            errs.append(f"{where}：q（题干）不能为空")
            continue
        n = int(q.get("n") or i)
        if n in seen:
            errs.append(f"{where}：题号 n={n} 重复")
            continue
        seen.add(n)
        item = {"n": n, "chapter": str(q.get("chapter") or "1"), "q": text, "opts": [o.strip() for o in opts], "ans": ans}
        for k in ("why", "q_zh", "exp_zh", "exp_en"):
            if q.get(k):
                item[k] = str(q[k])
        if isinstance(q.get("opts_zh"), list) and len(q["opts_zh"]) == len(opts):
            item["opts_zh"] = [str(x) for x in q["opts_zh"]]
        if isinstance(q.get("terms"), list):
            item["terms"] = [[str(x) for x in t[:3]] + [""] * (3 - len(t[:3])) for t in q["terms"] if isinstance(t, list) and t]
        if q.get("page"):
            try:
                item["page"] = int(q["page"])
            except (TypeError, ValueError):
                errs.append(f"{where}：page 必须是整数")
        out_q.append(item)
    chapters = data.get("chapters") if isinstance(data.get("chapters"), dict) else {}
    for q in out_q:
        chapters.setdefault(q["chapter"], {"title": f"Chapter {q['chapter']}", "deck": None})
    for k, c in chapters.items():
        deck = c.get("deck")
        if deck and not _deck_ok(deck):
            errs.append(f"chapters.{k}.deck = {deck!r} 在课件库里不存在（用 `python -m kejian list` 查看课件 ID）")
        for q in out_q:
            if q["chapter"] == k and q.get("page") and deck and _deck_ok(deck):
                total = len(library._read(library.deck_dir(deck) / "deck.json", {}).get("pages", []))
                if not 1 <= q["page"] <= total:
                    errs.append(f"第 {q['n']} 题：page={q['page']} 超出课件 {deck} 的页数 1–{total}")
    norm = {"title": str(data.get("title") or "未命名题库").strip(), "source": str(data.get("source") or ""),
            "created": data.get("created") or time.time(), "chapters": chapters, "questions": sorted(out_q, key=lambda x: x["n"])}
    if data.get("course"):
        norm["course"] = data["course"]
    if data.get("id"):
        norm["id"] = data["id"]
    return norm, errs


def import_json(path: Path, title: str | None = None, course: str | None = None) -> str:
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if title:
        data["title"] = title
    if course:
        data["course"] = course
    norm, errs = validate(data)
    if errs:
        raise ValueError("题库 JSON 有问题：\n  - " + "\n  - ".join(errs))
    return save_quiz(norm)


def _slug(name: str) -> str:
    s = re.sub(r"[^\w一-鿿-]+", "-", name).strip("-")[:40] or "quiz"
    return f"{s}-{hashlib.sha1(f'{name}{time.time()}'.encode()).hexdigest()[:6]}"


# ---------------------------------------------------------------- 从 PPT 解析
def _slide_paras(xml: str) -> list[str]:
    out = []
    for p in re.findall(r"<a:p[ >].*?</a:p>", xml, re.S):
        t = "".join(re.findall(r"<a:t>(.*?)</a:t>", p, re.S))
        t = html.unescape(t).strip()
        if t:
            out.append(t)
    return out


def _slide_files(z: zipfile.ZipFile) -> list[str]:
    names = [n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    return sorted(names, key=lambda n: int(re.findall(r"\d+", n)[0]))


def parse_pptx(path: Path) -> dict:
    """解析选择题 PPT：题干页含 “Q12” 和 A/B/C/D 选项，备注写 “Answer: B. …”。"""
    z = zipfile.ZipFile(path)
    questions, chapters = [], {}
    for name in _slide_files(z):
        paras = _slide_paras(z.read(name).decode("utf-8"))
        qi = next((i for i, t in enumerate(paras) if re.fullmatch(r"Q\d+", t)), None)
        if qi is None or qi + 1 >= len(paras):
            continue
        n = int(paras[qi][1:])
        head = paras[0] if qi > 0 else ""
        m = re.match(r"Chapter\s+(\w+)\s*[·:\-–]\s*(.+)", head)
        ch_key, ch_title = (m.group(1), m.group(2).strip()) if m else ("1", head)
        chapters.setdefault(ch_key, {"title": ch_title, "deck": None})
        q = paras[qi + 1]
        opts, i = [], qi + 2
        while i + 1 < len(paras) and paras[i] == LETTERS[len(opts)]:
            opts.append(paras[i + 1])
            i += 2
        if len(opts) < 2:
            continue
        notes_name = name.replace("slides/slide", "notesSlides/notesSlide")
        notes = ""
        if notes_name in z.namelist():
            notes = "\n".join(_slide_paras(z.read(notes_name).decode("utf-8")))
        am = re.search(r"Answer\s*:\s*([A-H])\b\.?\s*(.*)", notes)
        if not am:
            continue
        ans = LETTERS.index(am.group(1))
        rest = notes[am.end():].strip()
        why = re.sub(r"\s*\d+\s*$", "", rest).strip()   # 去掉备注末尾的页码
        questions.append({"n": n, "chapter": ch_key, "q": q, "opts": opts, "ans": ans, "why": why})
    questions.sort(key=lambda x: x["n"])
    if not questions:
        raise ValueError("没有在这个 PPT 里认出选择题（需要题号 Q1、选项 A–D，备注里写 Answer: X）")
    title = path.stem.replace("_", " ")
    return {"title": title, "source": path.name, "created": time.time(), "chapters": chapters, "questions": questions}


def import_pptx(path: Path, title: str | None = None, course: str | None = None) -> str:
    data = parse_pptx(Path(path))
    if title:
        data["title"] = title
    if course:
        data["course"] = course
    return save_quiz(data)


def export_markdown(quiz_id: str) -> str:
    """把题库（含答案、解析、作答情况）导出成 Markdown，方便 AI 阅读。"""
    q = get_quiz(quiz_id)
    prog = q.get("progress", {})
    lines = [f"# 题库：{q['title']}", "", f"- ID: `{quiz_id}`", f"- 课程: {q.get('course') or '未分类'}",
             f"- 题数: {len(q['questions'])}", ""]
    for k, c in q.get("chapters", {}).items():
        lines.append(f"- Chapter {k}: {c.get('title', '')}" + (f" → 课件 `{c['deck']}`" if c.get("deck") else ""))
    for x in q["questions"]:
        rec = prog.get(str(x["n"])) or {}
        state = "未做" if "a" not in rec else ("答对" if rec["a"] == x["ans"] else f"答错（选了 {LETTERS[rec['a']]}）")
        lines += ["", f"## Q{x['n']}（Ch.{x['chapter']}{'，第 ' + str(x['page']) + ' 页' if x.get('page') else ''}）· {state}"
                  + (f" · 累计答错 {rec['wrong']} 次" if rec.get("wrong") else ""), "", x["q"]]
        lines += [f"- {LETTERS[i]}. {o}" for i, o in enumerate(x["opts"])]
        lines += ["", f"答案：{LETTERS[x['ans']]}"]
        if x.get("exp_zh") or x.get("why"):
            lines.append(f"解析：{x.get('exp_zh') or x.get('why')}")
    return "\n".join(lines) + "\n"
