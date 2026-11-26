"""给 AI（和人）看的课件库总览、导出与自检。

  manifest()          整个课件库的结构：课程 → 课件 / 题库，加上单词本概况
  （论文：papers.export_paper）
  export_deck(id)     一份课件的全部文字：每页标题、正文、演讲者备注、讲解、自己的标注
  export_vocab()      单词本（Markdown 表格）
  check()             自检：找出坏掉的引用（课件被删、课程不存在等）
"""
import time

from . import config, library, papers, quiz, userdata

SCHEMA_VERSION = 2


def manifest() -> dict:
    courses = userdata.list_courses()
    decks = library.list_decks()
    quizzes = quiz.list_quizzes()
    known = {c["id"] for c in courses}

    def deck_brief(d):
        return {k: d[k] for k in ("id", "title", "pages", "noted", "source", "base", "example", "marks")}

    def quiz_brief(z):
        return {"id": z["id"], "title": z["title"], "count": z["count"], "stats": z["stats"],
                "chapters": z["chapters"]}

    out = []
    for c in courses:
        out.append({**c, "decks": [deck_brief(d) for d in decks if d.get("course") == c["id"]],
                    "quizzes": [quiz_brief(z) for z in quizzes if z.get("course") == c["id"]]})
    return {
        "schema_version": SCHEMA_VERSION,
        "language": config.load_settings().get("language", "zh"),
        "generated": time.time(),
        "library": str(library.LIBRARY),
        "courses": out,
        "unassigned": {"decks": [deck_brief(d) for d in decks if d.get("course") not in known],
                       "quizzes": [quiz_brief(z) for z in quizzes if z.get("course") not in known]},
        "vocab": userdata.vocab_stats(),
        "paper_folders": papers.list_folders(),
        "papers": [{k: p[k] for k in ("id", "title", "folder", "pages", "brief", "brief_parts", "figs", "highlights", "pins")}
                   | {"authors": p["meta"].get("authors", [])[:6], "year": p["meta"].get("year", ""), "note": p["note"][:300]}
                   for p in papers.list_papers()],
    }


def _rel(d) -> str:
    try:
        return d.relative_to(config.ROOT).as_posix()
    except ValueError:
        return d.as_posix()


def export_deck(deck_id: str) -> str:
    d = library.deck_dir(deck_id)
    deck = library._read(d / "deck.json", {})
    notes = library._read(d / "notes.json", {})
    marks = library._read(d / "marks.json", {})
    lines = [f"# 课件：{deck.get('title', deck_id)}", "", f"- ID: `{deck_id}`", f"- 课程: {deck.get('course') or '未分类'}",
             f"- 来源文件: {deck.get('source', '')}", f"- 页数: {len(deck.get('pages', []))}",
             f"- 页面图片: `{_rel(d)}/pages/NNN.jpg`（NNN 为三位页码，如 001）", ""]
    for p in deck.get("pages", []):
        n = p["n"]
        lines += [f"## 第 {n} 页 · {p.get('title', '')}", ""]
        if p.get("text"):
            lines += ["### 页面文字", "", p["text"].strip(), ""]
        if p.get("notes", "").strip():
            lines += ["### 演讲者备注", "", p["notes"].strip(), ""]
        note = notes.get(str(n))
        if note:
            lines += ["### 讲解", "", f"**{note.get('t', '')}** — {note.get('s', '')}", ""]
            lines += [f"- {x}" for x in note.get("p", [])]
            if note.get("k"):
                lines += ["", "术语：" + "；".join(f"{k[0]} = {k[1]}" for k in note["k"])]
            if note.get("tip"):
                lines += ["", f"考点：{note['tip']}"]
            lines.append("")
        m = marks.get(str(n))
        if m:
            lines += ["### 我的标注", ""]
            if m.get("star"):
                lines.append("- ★ 重点页")
            if m.get("note"):
                lines.append(f"- 笔记：{m['note']}")
            for h in m.get("hl", []):
                lines.append(f"- 高亮（{h['color']}）：“{h['text']}”" + (f" —— {h['note']}" if h.get("note") else ""))
            lines.append("")
    return "\n".join(lines) + "\n"


def export_vocab() -> str:
    words = userdata.load_vocab()
    st = userdata.vocab_stats(words)
    lines = ["# 单词本", "", f"共 {st['total']} 个 · 待复习 {st['due']} · 新词 {st['new']} · 学习中 {st['learning']} · 已掌握 {st['mastered']}", "",
             "| 单词 | 中文释义 | English definition | 课程 | 出处 | 复习等级 | 忘记次数 | 备注 |", "|---|---|---|---|---|---|---|---|"]
    for v in words:
        src = "；".join((f"{s['id']} 第{s.get('page')}页" if s["kind"] == "deck" else f"{s['id']} 第{s.get('n')}题") for s in v.get("src", []))
        s = v.get("srs", {})
        cell = lambda x: str(x or "").replace("|", "／").replace("\n", " ")  # noqa: E731
        lines.append(f"| {cell(v['w'])} | {cell(v.get('m'))} | {cell(v.get('d'))} | {cell(v.get('course'))} | {cell(src)} | {s.get('level', 0)} | {s.get('lapses', 0)} | {cell(v.get('note'))} |")
    return "\n".join(lines) + "\n"


def check() -> list[str]:
    problems = []
    known = {c["id"] for c in userdata.list_courses()}
    for d in library.list_decks():
        if d.get("course") and d["course"] not in known:
            problems.append(f"课件 {d['id']} 的 course={d['course']!r} 不存在")
    for z in quiz.list_quizzes():
        if z.get("course") and z["course"] not in known:
            problems.append(f"题库 {z['id']} 的 course={z['course']!r} 不存在")
        _, errs = quiz.validate(quiz._raw(z["id"]))
        problems += [f"题库 {z['id']}：{e}" for e in errs]
    for v in userdata.load_vocab():
        for s in v.get("src", []):
            try:
                if s["kind"] == "deck":
                    library.deck_dir(s["id"])
                else:
                    quiz.quiz_path(s["id"])
            except KeyError:
                problems.append(f"单词 {v['w']!r} 的出处 {s['kind']}:{s['id']} 已不存在")
    return problems
