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
    # 同学分享的题库：当时没对上的章节，如果后来导入了同名课件，就自动关联上
    late = {k: c for k, c in data.get("chapters", {}).items()
            if c.get("deck_title") and not (c.get("deck") and _deck_ok(c["deck"]))}
    if late:
        found = {k: d for k, d in ((k, _find_deck(c)) for k, c in late.items()) if d}
        if found:
            with library._lock:
                raw = _raw(quiz_id)
                for k, d in found.items():
                    raw["chapters"][k]["deck"] = data["chapters"][k]["deck"] = d
                library._write(quiz_path(quiz_id), raw)
    # 告诉前端每章对应的课件还在不在，方便决定是否显示“看课件”按钮
    for c in data.get("chapters", {}).values():
        deck = c.get("deck")
        c["deck_ok"] = bool(deck) and _deck_ok(deck)
    data["slide_notes"] = chapter_notes(data)      # 每题对应课件页的讲解，做完题时一起显示
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
    if is_package(data):
        return import_package(data, title=title, course=course)["id"]
    if title:
        data["title"] = title
    if course:
        data["course"] = course
    norm, errs = validate(data)
    if errs:
        raise ValueError("题库 JSON 有问题：\n  - " + "\n  - ".join(errs))
    return save_quiz(norm)


# ---------------------------------------------------------------- 分享给同学：导出 / 导入题库文件
PACKAGE = "lecta-quiz"
NOTE_KEYS = ("t", "s", "p", "k", "tip")


def _clean_note(n) -> dict | None:
    if not isinstance(n, dict):
        return None
    out = {}
    for k in NOTE_KEYS:
        v = n.get(k)
        if k == "p" and isinstance(v, list):
            out[k] = [str(x)[:2000] for x in v if isinstance(x, (str, int, float))][:20]
        elif k == "k" and isinstance(v, list):
            out[k] = [[str(x)[:300] for x in t[:3]] for t in v if isinstance(t, list) and t][:30]
        elif isinstance(v, str) and v.strip():
            out[k] = v[:4000]
    return out if (out.get("t") or out.get("s") or out.get("p")) else None


def _slide_notes(deck_id: str, pages) -> dict:
    """这些页的讲解 {"页码": note}（没有讲解的页不放）。"""
    notes = library._read(library.deck_dir(deck_id) / "notes.json", {})
    out = {}
    for p in sorted({int(x) for x in pages if x}):
        n = _clean_note(notes.get(str(p)))
        if n:
            out[str(p)] = n
    return out


def chapter_notes(data: dict) -> dict:
    """{章: {页码: 讲解}}：题库自带的（同学导出的）优先，其次取本机课件里的讲解。"""
    out = {}
    for k, c in (data.get("chapters") or {}).items():
        pages = [q.get("page") for q in data.get("questions", []) if q.get("chapter") == k and q.get("page")]
        notes = {}
        if c.get("deck") and _deck_ok(c["deck"]):
            notes = _slide_notes(c["deck"], pages)
        for p, n in (c.get("notes") or {}).items():
            if str(p) not in notes and _clean_note(n):
                notes[str(p)] = _clean_note(n)
        if notes:
            out[k] = notes
    return out


def export_package(quiz_id: str) -> dict:
    """导出给同学的题库文件：题目、答案、解析、术语，以及每题对应课件页的讲解。不含作答记录。"""
    data = _raw(quiz_id)
    if not data:
        raise KeyError(quiz_id)
    notes = chapter_notes(data)
    chapters = {}
    for k, c in (data.get("chapters") or {}).items():
        ch = {x: c[x] for x in ("title", "title_zh") if c.get(x)}
        deck = c.get("deck")
        if deck and _deck_ok(deck):
            s = library.summary(library.deck_dir(deck))
            ch.update(deck=deck, deck_title=s["title"], deck_source=s["source"], deck_pages=s["pages"])
        else:
            ch.update({x: c[x] for x in ("deck_title", "deck_source", "deck_pages") if c.get(x)})
        if notes.get(k):
            ch["notes"] = notes[k]
        chapters[k] = ch
    return {"format": PACKAGE, "version": 1, "exported": round(time.time()),
            "title": data.get("title", ""), "source": data.get("source", ""),
            "chapters": chapters, "questions": data.get("questions", [])}


def is_package(data) -> bool:
    return isinstance(data, dict) and data.get("format") == PACKAGE


def _norm_title(s: str) -> str:
    return re.sub(r"[\W_]+", "", (s or "").lower())


def _find_deck(c: dict) -> str | None:
    """在本机课件库里找这一章对应的课件：同一个 ID 且标题对得上 → 同名课件 → 同一个源文件名。"""
    decks = [d for d in library.list_decks() if not d.get("example")]
    want, src, pages = _norm_title(c.get("deck_title")), (c.get("deck_source") or "").lower(), c.get("deck_pages")
    deck = c.get("deck")
    if deck and _deck_ok(deck):
        s = library.summary(library.deck_dir(deck))
        if not want or _norm_title(s["title"]) == want or (src and s["source"].lower() == src):
            return deck
    for test in (lambda d: want and _norm_title(d["title"]) == want,
                 lambda d: src and d["source"].lower() == src,
                 lambda d: want and pages and d["pages"] == pages and (want in _norm_title(d["title"]) or _norm_title(d["title"]) in want)):
        hit = [d for d in decks if test(d)]
        if len(hit) == 1 or (hit and all(h["pages"] == hit[0]["pages"] for h in hit)):
            return hit[0]["id"]
    return None


def import_package(data: dict, title: str | None = None, course: str | None = None) -> dict:
    """导入同学分享的题库文件。每章自动对上本机的课件；对不上的章节照样能做题，只是没有“看课件”按钮。
    本机课件某页还没有讲解时，用文件里带的讲解补上（已有的讲解不会被覆盖）。"""
    if not is_package(data):
        raise ValueError("这不是 Lecta 导出的题库文件")
    linked, unlinked, filled = [], [], 0
    chapters = {}
    for k, c in (data.get("chapters") or {}).items():
        if not isinstance(c, dict):
            continue
        ch = {x: str(c[x])[:300] for x in ("title", "title_zh", "deck_title", "deck_source") if c.get(x)}
        if isinstance(c.get("deck_pages"), int):
            ch["deck_pages"] = c["deck_pages"]
        notes = {str(int(p)): n for p, n in ((p, _clean_note(n)) for p, n in (c.get("notes") or {}).items()
                                              if str(p).isdigit()) if n}
        if notes:
            ch["notes"] = notes
        deck = _find_deck(c)
        ch["deck"] = deck
        name = c.get("deck_title") or c.get("title") or f"Ch.{k}"
        if deck:
            linked.append({"chapter": k, "name": name, "deck": deck})
            d = library.deck_dir(deck)
            if not library.is_readonly(d):
                total = len(library._read(d / "deck.json", {}).get("pages", []))
                have = library._read(d / "notes.json", {})
                for p, n in notes.items():
                    if 1 <= int(p) <= total and not have.get(p):
                        library.save_note(deck, int(p), n)
                        filled += 1
        else:
            unlinked.append({"chapter": k, "name": name})
        chapters[k] = ch
    if not course:                      # 没指定课程：放进对上的课件所在的课程
        course = next((c for c in (library._read(library.deck_dir(x["deck"]) / "deck.json", {}).get("course")
                                   for x in linked) if c), None)
    body = {"title": title or data.get("title") or "同学分享的题库", "source": data.get("source") or "",
            "chapters": chapters, "questions": data.get("questions") or []}
    if course:
        body["course"] = course
    norm, errs = validate(body)
    # 对上的课件页数和原来不一样时，页码可能超出范围：去掉这些页码，不让整个导入失败
    bad = [e for e in errs if "超出课件" in e]
    if bad and len(bad) == len(errs):
        for q in norm["questions"]:
            deck = chapters.get(q["chapter"], {}).get("deck")
            if deck and q.get("page"):
                total = len(library._read(library.deck_dir(deck) / "deck.json", {}).get("pages", []))
                if not 1 <= q["page"] <= total:
                    q.pop("page")
        errs = []
    if errs:
        raise ValueError("题库文件有问题：\n  - " + "\n  - ".join(errs))
    norm.pop("id", None)
    qid = save_quiz(norm)
    return {"id": qid, "count": len(norm["questions"]), "linked": linked, "unlinked": unlinked, "notes_filled": filled,
            "course": course}


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
