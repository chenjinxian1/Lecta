"""把一门课的三样东西连起来：课件讲解 → 题库 → 单词本。

谁来当“AI”都可以，流程都是 提示词 → 回复 → 保存：
  * 网页版 ChatGPT / Claude / Kimi…：复制 prompt，把回复粘贴回来（网页里有向导）
  * Claude Code / Codex 等 AI 助手：python -m kejian prompt … 拿到提示词，自己写好 JSON，
    再 python -m kejian save … 存进课件库（见 AGENTS.md）
  * 设置成 Claude Code / API Key 时，网页里也可以一键自动生成

  quiz_prompt / save_quiz_reply     根据一份或几份课件出选择题，题目带课件页码，自动挂到同一门课
  words_prompt / save_words_reply   从课件里挑生词，带页码和原句，进单词本
  collect_from_notes / _from_quiz   不用 AI：把讲解卡片、题目里的关键术语收进单词本
  where(words)                      每个生词还出现在本课程的哪些课件页、哪些题里
"""
import json
import re
import time

from . import config, library, manual, quiz, userdata

PAGE_CHARS = 1500           # 每页文字最多带多少字符进提示词


# ---------------------------------------------------------------- 公用
def _lang() -> str:
    return config.load_settings().get("language", "zh")


def _deck(deck_id: str) -> dict:
    return library._read(library.deck_dir(deck_id) / "deck.json", {})


def _notes(deck_id: str) -> dict:
    return library.load_notes(library.deck_dir(deck_id))


def _clip(t: str, n: int = PAGE_CHARS) -> str:
    t = re.sub(r"[ \t]+", " ", (t or "").strip())
    return t if len(t) <= n else t[:n] + " …"


def _payload(text: str):
    """从 AI 回复里取出 JSON：优先 ```json 代码块，其次整段；被截断时尽量解析已有部分。"""
    for chunk in manual._candidates(text or ""):
        s = chunk.strip()
        try:
            return json.loads(s)
        except ValueError:
            pass
        for opener in "[{":
            i = s.find(opener)
            if i >= 0:
                try:
                    return json.JSONDecoder().raw_decode(s, i)[0]
                except ValueError:
                    continue
    # 数组被截断：逐个对象捞出来
    objs, dec, s, i = [], json.JSONDecoder(), text or "", 0
    while (i := s.find("{", i)) >= 0:
        try:
            obj, end = dec.raw_decode(s, i)
        except ValueError:
            i += 1
            continue
        if isinstance(obj, dict):
            objs.append(obj)
        i = end
    if objs:
        return objs
    raise ValueError("没有在回复里找到 JSON。请确认复制了 AI 的完整回复（包括 ```json 代码块）。")


def _chapter_keys(deck_ids: list[str]) -> dict[str, str]:
    """课件 → 章节键。标题里有 Ch.3 / Chapter 3 / Lecture 3 就用 3，否则按顺序编号。"""
    keys, used = {}, set()
    for i, did in enumerate(deck_ids, 1):
        m = re.search(r"(?:ch(?:apter)?|lecture|week|topic|unit)[\s._-]*0*(\d+)", _deck(did).get("title", ""), re.I)
        k = m.group(1) if m and m.group(1) not in used else str(i)
        while k in used:
            k += "b"
        used.add(k)
        keys[did] = k
    return keys


def _slides_block(deck_id: str, key: str | None = None, pages: list[int] | None = None) -> str:
    deck, notes = _deck(deck_id), _notes(deck_id)
    ps = deck.get("pages", [])
    head = f"=== {'Chapter ' + key + ' · ' if key else ''}{deck.get('title', deck_id)} (slides 1–{len(ps)}) ==="
    out = [head]
    for p in ps:
        n = p["n"]
        if pages and n not in pages:
            continue
        text = _clip(p.get("text"))
        if not text and not p.get("notes"):
            continue
        out.append(f"--- slide {n}{' · ' + p['title'] if p.get('title') else ''} ---")
        if text:
            out.append(text)
        if p.get("notes"):
            out.append("[speaker notes] " + _clip(p["notes"], 600))
        nt = notes.get(str(n)) or {}
        if nt.get("s"):
            out.append("[study note] " + nt["s"])
    return "\n".join(out)


# ---------------------------------------------------------------- 出题
_QUIZ_LANG = {
    "zh": """Language: the student studies this course in English and reads explanations in Simplified Chinese.
- Keep "q" and "opts" in English, worded like the course.
- Add "q_zh" and "opts_zh" (Simplified Chinese translations, same number of options).
- "exp_zh": a detailed explanation in Simplified Chinese — why the answer is right and why each other option is wrong; keep key English terms in brackets.
- "exp_en": one or two English sentences.
- "terms": [["English term", "中文释义", "short note in Chinese or empty"]].""",
    "en": """Language: English only. Do not write any Chinese.
- "exp_en": a clear explanation — why the answer is right and why each other option is wrong.
- "terms": [["term", "short English definition", "note or empty"]].
- Do not include q_zh, opts_zh or exp_zh.""",
}

_QUIZ_FORMAT = """Output only one ```json code block and nothing else:

```json
{
  "title": "short quiz title",
  "questions": [
    {
      "n": 1,
      "chapter": "chapter key from the slide headers",
      "page": 3,
      "q": "question text",
      "opts": ["option A", "option B", "option C", "option D"],
      "ans": "B",
      %LANG_FIELDS%
      "terms": [["term", "meaning", "note"]]
    }
  ]
}
```"""


def quiz_prompt(deck_ids: list[str], count: int = 10, focus: str = "", language: str | None = None) -> str:
    language = language or _lang()
    keys = _chapter_keys(deck_ids)
    fields = '"q_zh": "...", "opts_zh": ["...", "...", "...", "..."], "exp_zh": "...", "exp_en": "...",' if language == "zh" else '"exp_en": "...",'
    parts = [
        f"You are a university teaching assistant. Write a multiple-choice practice quiz of {count} questions from the lecture slides below.",
        "",
        "Rules:",
        "- Cover the most important, exam-relevant ideas. Spread the questions across the chapters roughly in proportion to their content. Skip title, agenda and reference slides.",
        "- Each question has 4 options and exactly one correct answer. Make the wrong options plausible (common misconceptions, near-miss definitions). No \"all of the above\" or \"none of the above\".",
        "- Mix question types: definitions, applying a concept to a short scenario, comparing two ideas, cause and effect.",
        "- Base every question on the slides; do not test facts that the slides do not support.",
        "- \"chapter\" is the chapter key from the slide headers (=== Chapter K · … ===); \"page\" is the slide number the question comes from.",
        "- \"ans\" is the letter of the correct option. Vary the position of the correct answer.",
        "",
        _QUIZ_LANG.get(language, _QUIZ_LANG["zh"]),
    ]
    if focus.strip():
        parts += ["", f"Focus: {focus.strip()}"]
    parts += ["", _QUIZ_FORMAT.replace("%LANG_FIELDS%", fields), "", "Slides:", ""]
    parts += [_slides_block(d, keys[d]) for d in deck_ids]
    return "\n".join(parts)


def save_quiz_reply(text: str, deck_ids: list[str], course: str | None = None, title: str | None = None) -> dict:
    data = _payload(text)
    if isinstance(data, list):
        data = {"questions": data}
    if not isinstance(data, dict):
        raise ValueError("回复里的 JSON 不是题库格式")
    keys = _chapter_keys(deck_ids)
    by_key = {k: d for d, k in keys.items()}
    chapters = {}
    for d, k in keys.items():
        chapters[k] = {"title": _deck(d).get("title", d), "deck": d}
    for q in data.get("questions") or []:
        if isinstance(q, dict):
            k = str(q.get("chapter") or "").strip()
            if k not in by_key:            # AI 写错章节键：只有一份课件时就归到它
                q["chapter"] = next(iter(keys.values())) if len(keys) == 1 else (k or next(iter(keys.values())))
    data["chapters"] = {**chapters, **{k: v for k, v in (data.get("chapters") or {}).items() if k not in chapters and isinstance(v, dict)}}
    if course is None and deck_ids:
        course = _deck(deck_ids[0]).get("course")
    if course:
        data["course"] = userdata.check_course(course)
    data["title"] = title or data.get("title") or f"{_deck(deck_ids[0]).get('title', 'Quiz')} · AI quiz"
    data["source"] = "AI · " + ", ".join(deck_ids)
    data["created"] = time.time()
    data.pop("id", None)
    norm, errs = quiz.validate(data)
    if errs:
        raise ValueError("题库有问题：\n  - " + "\n  - ".join(errs))
    qid = quiz.save_quiz(norm)
    return {"id": qid, "count": len(norm["questions"]), "title": norm["title"], "course": norm.get("course")}


# ---------------------------------------------------------------- 提取生词
_WORDS_FORMAT = """Output only one ```json code block and nothing else:

```json
[
  {"w": "equilibrium", "m": "均衡", "d": "n. a state in which opposing forces are balanced",
   "page": 4, "ctx": "Equilibrium is where quantity supplied equals quantity demanded.", "note": ""}
]
```"""


def words_prompt(deck_id: str, count: int = 20, pages: list[int] | None = None, language: str | None = None) -> str:
    deck = _deck(deck_id)
    known = sorted({v["w"] for v in userdata.load_vocab() if not deck.get("course") or v.get("course") in (None, deck.get("course"))})
    parts = [
        f"You are helping a student who studies this course in English as a second language. Pick up to {count} words or short phrases from the slides below that the student should learn.",
        "",
        "Rules:",
        "- Subject terms first (e.g. \"price elasticity\", \"opportunity cost\"), then academic or less common words needed to understand the slides.",
        "- Skip people's names, very common words, and abbreviations unless they are key terms.",
        "- \"w\": the word or phrase as used on the slide; use the base form for single words (\"allocate\", not \"allocated\").",
        "- \"m\": a short Simplified Chinese meaning, in this course's sense.",
        "- \"d\": a short English learner's definition starting with the part of speech, e.g. \"n. …\", \"v. …\", \"adj. …\".",
        "- \"page\": the slide where the word matters most; \"ctx\": the sentence or bullet from that slide, copied exactly.",
        "- \"note\": optional — a collocation, a contrast with a similar word, or a short example (\"\" if none).",
    ]
    if known:
        parts += ["", "Already in the student's word book (do not repeat): " + ", ".join(known[:300])]
    parts += ["", _WORDS_FORMAT, "", "Slides:", "", _slides_block(deck_id, None, pages)]
    return "\n".join(parts)


def _ctx_for(text: str, term: str) -> str:
    """从页面文字里找出包含这个词的那一行，当作原句。"""
    rx = _word_re(term)
    for line in re.split(r"[\n•▪●]+", text or ""):
        if rx.search(line):
            return re.sub(r"\s+", " ", line).strip()[:300]
    return ""


def save_words_reply(text: str, deck_id: str) -> dict:
    data = _payload(text)
    if isinstance(data, dict):
        data = data.get("words") or data.get("items") or [data]
    deck = _deck(deck_id)
    total = len(deck.get("pages", []))
    entries = []
    for x in data if isinstance(data, list) else []:
        if not isinstance(x, dict) or not str(x.get("w") or x.get("word") or "").strip():
            continue
        w = str(x.get("w") or x.get("word")).strip()
        try:
            page = int(x.get("page") or 0)
        except (TypeError, ValueError):
            page = 0
        page = page if 1 <= page <= total else 0
        ctx = str(x.get("ctx") or "").strip() or (_ctx_for(deck["pages"][page - 1].get("text"), w) if page else "")
        entries.append({"w": w, "m": str(x.get("m") or "").strip(), "d": str(x.get("d") or "").strip(),
                        "note": str(x.get("note") or "").strip(), "course": deck.get("course"),
                        "src": [{"kind": "deck", "id": deck_id, "page": page or None, "ctx": ctx}]})
    if not entries:
        raise ValueError("回复里没有找到单词列表")
    return userdata.add_words(entries)


# ---------------------------------------------------------------- 不用 AI：收集已有的关键术语
def _cjk(s: str) -> bool:
    return bool(re.search(r"[㐀-鿿]", s or ""))


def _term_entry(term: str, meaning: str, note: str) -> dict:
    term = re.sub(r"\s*[（(].*?[)）]\s*", " ", term).strip()      # "surplus (过剩)" → "surplus"
    e = {"w": term, "note": note}
    if meaning:
        e["m" if _cjk(meaning) else "d"] = meaning
    return e


def collect_from_notes(deck_id: str, pages: list[int] | None = None) -> dict:
    deck, notes = _deck(deck_id), _notes(deck_id)
    entries = []
    for k, nt in notes.items():
        n = int(k)
        if not nt or (pages and n not in pages):
            continue
        text = deck["pages"][n - 1].get("text", "") if n <= len(deck.get("pages", [])) else ""
        for t in nt.get("k") or []:
            if not t or not str(t[0]).strip() or _cjk(t[0]):
                continue
            e = _term_entry(str(t[0]), str(t[1] if len(t) > 1 else ""), str(t[2] if len(t) > 2 else ""))
            e.update(course=deck.get("course"), src=[{"kind": "deck", "id": deck_id, "page": n, "ctx": _ctx_for(text, e["w"])}])
            entries.append(e)
    if not entries:
        raise ValueError("这份课件的讲解里还没有关键术语")
    return userdata.add_words(entries)


def collect_from_quiz(quiz_id: str) -> dict:
    z = quiz.get_quiz(quiz_id)
    entries = []
    for q in z["questions"]:
        for t in q.get("terms") or []:
            if not t or not str(t[0]).strip() or _cjk(t[0]):
                continue
            e = _term_entry(str(t[0]), str(t[1] if len(t) > 1 else ""), str(t[2] if len(t) > 2 else ""))
            e.update(course=z.get("course"), src=[{"kind": "quiz", "id": quiz_id, "n": q["n"], "ctx": q["q"][:300]}])
            entries.append(e)
    if not entries:
        raise ValueError("这套题里没有关键术语")
    return userdata.add_words(entries)


# ---------------------------------------------------------------- 生词出现在哪里
def _word_re(w: str) -> re.Pattern:
    toks = [re.escape(t) for t in userdata._key(w).split(" ") if t]
    body = r"[\s\-]+".join(toks)
    tail = r"(?:s|es|ed|d|ing|'s)?" if len(toks) == 1 and len(toks[0]) > 3 else r"(?:s|es)?"
    return re.compile(r"(?<![A-Za-z])" + body + tail + r"(?![A-Za-z])", re.I)


def _scope(course):
    decks = [d for d in library.list_decks() if course is None or d.get("course") == course]
    quizzes = [z for z in quiz.list_quizzes() if course is None or z.get("course") == course]
    return decks, quizzes


def where(words: list[str], course: str | None = None) -> dict:
    """{单词: [{"kind": "deck", "id", "pages": [...]}, {"kind": "quiz", "id", "n": [...]}]}"""
    decks, quizzes = _scope(course)
    texts = []        # (kind, id, 编号, 小写文字)
    for d in decks:
        for p in _deck(d["id"]).get("pages", []):
            t = (p.get("text") or "") + "\n" + (p.get("notes") or "")
            texts.append(("deck", d["id"], p["n"], t.lower()))
    for z in quizzes:
        for q in quiz._raw(z["id"]).get("questions", []):
            texts.append(("quiz", z["id"], q.get("n"), (q.get("q", "") + "\n" + "\n".join(q.get("opts", []))).lower()))
    out = {}
    for w in words:
        key = userdata._key(w)
        if len(key) < 3:
            continue
        stem = key.split(" ")[0][:max(3, len(key.split(" ")[0]) - 2)]
        rx, hits = _word_re(w), {}
        for kind, iid, no, low in texts:
            if stem in low and rx.search(low):
                hits.setdefault((kind, iid), []).append(no)
        if hits:
            out[w] = [{"kind": k, "id": i, ("pages" if k == "deck" else "n"): sorted(set(v))} for (k, i), v in hits.items()]
    return out


def deck_words(deck_id: str) -> list[dict]:
    """单词本里所有出现在这份课件里的词（不管是在哪里收藏的）：[{w, pages}]。"""
    pages = _deck(deck_id).get("pages", [])
    low = [(p["n"], ((p.get("text") or "") + "\n" + (p.get("notes") or "")).lower()) for p in pages]
    out = []
    for v in userdata.load_vocab():
        key = userdata._key(v["w"])
        if len(key) < 3:
            continue
        stem = key.split(" ")[0][:max(3, len(key.split(" ")[0]) - 2)]
        rx = _word_re(v["w"])
        hit = [n for n, t in low if stem in t and rx.search(t)]
        if hit:
            out.append({"w": v["w"], "pages": hit})
    return out
