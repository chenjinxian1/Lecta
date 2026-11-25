"""用户数据：课程、单词本、课件标注、做题进度。全部是课件库里的普通 JSON 文件，人和 AI 都能直接读写。

library/
    _courses.json              {"courses": [{"id", "name", "code", "color", "desc", "created"}]}
                               课件 / 题库属于哪门课，写在各自 deck.json / 题库 JSON 的 "course" 字段
    _vocab.json                {"words": [单词条目, ...]}，见 VOCAB_FIELDS
    _progress/<题库ID>.json     {"answers": {"<题号>": {"a": 选项下标, "at": 时间, "tries": 次数, "wrong": 答错次数}}}
    <课件ID>/marks.json         {"<页码>": {"star": bool, "note": "页笔记", "hl": [高亮, ...]}}
"""
import re
import time
from pathlib import Path

from . import library
from .config import LIBRARY

COLORS = ["#0e5d6f", "#a63d2f", "#6b4fa0", "#2e7d4f", "#b8791f", "#3d5a99", "#8a5a44", "#4a463e"]
HL_COLORS = ("yellow", "green", "blue", "pink")
# 间隔复习：level 0..7 对应的下次复习间隔（天）
SRS_DAYS = [0, 1, 2, 4, 7, 15, 30, 60]
DAY = 86400


def _p(name: str) -> Path:
    LIBRARY.mkdir(parents=True, exist_ok=True)
    return LIBRARY / name


def _now() -> float:
    return round(time.time(), 3)


# ================================================================ 课程
def _slug(name: str) -> str:
    s = re.sub(r"[^\w-]+", "-", name.lower()).strip("-")
    return s[:32] or "course"


def list_courses() -> list[dict]:
    return library._read(_p("_courses.json"), {}).get("courses", [])


def get_course(cid: str) -> dict:
    for c in list_courses():
        if c["id"] == cid:
            return c
    raise KeyError(cid)


def _save_courses(courses: list[dict]):
    library._write(_p("_courses.json"), {"courses": courses})


def add_course(name: str, code: str = "", color: str = "", desc: str = "", cid: str = "") -> dict:
    name = (name or "").strip()[:80]
    if not name:
        raise ValueError("课程名称不能为空")
    with library._lock:
        courses = list_courses()
        ids = {c["id"] for c in courses}
        base = _slug(cid or code or name)
        cid, i = base, 2
        while cid in ids:
            cid, i = f"{base}-{i}", i + 1
        c = {"id": cid, "name": name, "code": code.strip()[:30], "color": color or COLORS[len(courses) % len(COLORS)],
             "desc": desc.strip()[:500], "created": _now()}
        courses.append(c)
        _save_courses(courses)
        return c


def update_course(cid: str, patch: dict) -> dict:
    with library._lock:
        courses = list_courses()
        for c in courses:
            if c["id"] == cid:
                for k in ("name", "code", "color", "desc"):
                    if k in patch and patch[k] is not None:
                        c[k] = str(patch[k]).strip()[:500]
                if not c["name"]:
                    raise ValueError("课程名称不能为空")
                _save_courses(courses)
                return c
    raise KeyError(cid)


def delete_course(cid: str):
    """删除课程本身；里面的课件和题库保留，变成“未分类”。"""
    from . import quiz
    with library._lock:
        courses = [c for c in list_courses() if c["id"] != cid]
        _save_courses(courses)
        words = load_vocab()
        if any(v.get("course") == cid for v in words):
            for v in words:
                if v.get("course") == cid:
                    v["course"] = None
            _save_vocab(words)
    for d in library.list_decks():
        if d.get("course") == cid and not d["example"]:
            library.set_course(d["id"], None)
    for z in quiz.list_quizzes():
        if z.get("course") == cid:
            quiz.set_course(z["id"], None)


def check_course(cid):
    if cid in (None, ""):
        return None
    get_course(cid)          # 不存在时抛 KeyError
    return cid


# ================================================================ 单词本
VOCAB_FIELDS = {
    "w": "单词或短语（原样大小写）",
    "m": "中文释义",
    "d": "英文释义（English definition，可空）",
    "uk": "英式音标（可空）",
    "note": "自己的备注 / 例句",
    "tags": "标签列表",
    "course": "所属课程 ID（可空）",
    "src": "出处列表：{kind:'deck', id, page, ctx} 或 {kind:'quiz', id, n, ctx}",
    "added": "加入时间（Unix 秒）",
    "srs": "复习状态 {level 0-7, due 下次复习时间, reps 复习次数, lapses 忘记次数, last 上次复习}",
}


def _key(w: str) -> str:
    return re.sub(r"\s+", " ", (w or "").strip().lower())


def load_vocab() -> list[dict]:
    return library._read(_p("_vocab.json"), {}).get("words", [])


def _save_vocab(words: list[dict]):
    library._write(_p("_vocab.json"), {"words": words})


def _clean_src(s: dict) -> dict | None:
    if not isinstance(s, dict) or s.get("kind") not in ("deck", "quiz") or not s.get("id"):
        return None
    out = {"kind": s["kind"], "id": str(s["id"])}
    if s["kind"] == "deck" and s.get("page"):
        out["page"] = int(s["page"])
    if s["kind"] == "quiz" and s.get("n"):
        out["n"] = int(s["n"])
    if s.get("ctx"):
        out["ctx"] = str(s["ctx"])[:400]
    return out


def _same_src(a: dict, b: dict) -> bool:
    return a["kind"] == b["kind"] and a["id"] == b["id"] and a.get("page") == b.get("page") and a.get("n") == b.get("n")


def _merge(words: list[dict], entry: dict) -> tuple[dict, bool]:
    """把一个条目并进 words（原地修改）。返回 (条目, 是否新建)。"""
    w = re.sub(r"\s+", " ", str(entry.get("w", "")).strip())[:80]
    if not w:
        raise ValueError("单词不能为空")
    src = [s for s in (_clean_src(x) for x in (entry.get("src") or [])) if s]
    for v in words:
        if _key(v["w"]) == _key(w):
            for k in ("m", "d", "uk", "course", "note"):
                if entry.get(k) and not v.get(k):
                    v[k] = entry[k]
            for s in src:
                if not any(_same_src(s, o) for o in v.setdefault("src", [])):
                    v["src"].append(s)
            return v, False
    now = _now()
    v = {"w": w, "m": str(entry.get("m") or "")[:300], "d": str(entry.get("d") or "")[:500], "uk": str(entry.get("uk") or "")[:60],
         "note": str(entry.get("note") or "")[:1000], "tags": [str(t)[:20] for t in (entry.get("tags") or [])][:10],
         "course": entry.get("course") or None, "src": src, "added": entry.get("added") or now,
         "srs": {"level": 0, "due": now, "reps": 0, "lapses": 0, "last": 0}}
    words.insert(0, v)
    return v, True


def add_word(entry: dict) -> dict:
    """加入单词；已存在则合并出处、补全空字段。"""
    with library._lock:
        words = load_vocab()
        v, _ = _merge(words, entry)
        _save_vocab(words)
        return v


def add_words(entries: list[dict]) -> dict:
    """批量加入（AI 提取的生词、讲解里的术语）。返回 {"added": [...], "merged": [...]}。"""
    added, merged = [], []
    with library._lock:
        words = load_vocab()
        for e in entries:
            try:
                v, new = _merge(words, e)
            except ValueError:
                continue
            (added if new else merged).append(v["w"])
        _save_vocab(words)
    return {"added": added, "merged": merged}


def update_word(w: str, patch: dict) -> dict:
    with library._lock:
        words = load_vocab()
        for v in words:
            if _key(v["w"]) == _key(w):
                for k in ("m", "d", "uk", "note"):
                    if k in patch:
                        v[k] = str(patch[k] or "")[:1000]
                if "tags" in patch:
                    v["tags"] = [str(t).strip()[:20] for t in (patch["tags"] or []) if str(t).strip()][:10]
                if "course" in patch:
                    v["course"] = patch["course"] or None
                _save_vocab(words)
                return v
    raise KeyError(w)


def delete_word(w: str):
    with library._lock:
        _save_vocab([v for v in load_vocab() if _key(v["w"]) != _key(w)])


def review_word(w: str, grade: str) -> dict:
    """grade: again（忘了）/ hard（模糊）/ good（认识）/ easy（太简单）。"""
    if grade not in ("again", "hard", "good", "easy"):
        raise ValueError("grade 只能是 again / hard / good / easy")
    with library._lock:
        words = load_vocab()
        for v in words:
            if _key(v["w"]) != _key(w):
                continue
            s = v.setdefault("srs", {"level": 0, "due": 0, "reps": 0, "lapses": 0, "last": 0})
            now = _now()
            lvl = s.get("level", 0)
            if grade == "again":
                lvl, due = 0, now + 10 * 60          # 10 分钟后再见
                s["lapses"] = s.get("lapses", 0) + 1
            elif grade == "hard":
                lvl = max(1, lvl)
                due = now + max(0.5, SRS_DAYS[lvl] / 2) * DAY
            else:
                lvl = min(len(SRS_DAYS) - 1, lvl + (1 if grade == "good" else 2))
                due = now + SRS_DAYS[lvl] * DAY
            s.update(level=lvl, due=round(due, 3), reps=s.get("reps", 0) + 1, last=now)
            _save_vocab(words)
            return v
    raise KeyError(w)


def vocab_stats(words=None) -> dict:
    words = load_vocab() if words is None else words
    now = time.time()
    st = {"total": len(words), "due": 0, "new": 0, "learning": 0, "mastered": 0}
    for v in words:
        s = v.get("srs") or {}
        if s.get("due", 0) <= now:
            st["due"] += 1
        if not s.get("reps"):
            st["new"] += 1
        elif s.get("level", 0) >= 5:
            st["mastered"] += 1
        else:
            st["learning"] += 1
    return st


# ================================================================ 课件标注
def load_marks(deck_id: str) -> dict:
    return library._read(library.deck_dir(deck_id) / "marks.json", {})


def save_page_marks(deck_id: str, page: int, data: dict | None):
    d = library.deck_dir(deck_id)
    if library.is_readonly(d):
        raise PermissionError("示例课件是只读的")
    clean = None
    if data:
        hl = []
        for h in data.get("hl") or []:
            rects = [[round(float(x), 1) for x in r[:4]] for r in (h.get("rects") or []) if len(r) >= 4]
            if not rects:
                continue
            hl.append({"id": str(h.get("id") or f"h{int(time.time() * 1000)}")[:24], "rects": rects,
                       "text": str(h.get("text") or "")[:500],
                       "color": h.get("color") if h.get("color") in HL_COLORS else "yellow",
                       "note": str(h.get("note") or "")[:2000], "at": h.get("at") or _now()})
        clean = {"star": bool(data.get("star")), "note": str(data.get("note") or "")[:5000], "hl": hl}
        if not clean["star"] and not clean["note"].strip() and not hl:
            clean = None
    with library._lock:
        marks = library._read(d / "marks.json", {})
        if clean:
            marks[str(int(page))] = clean
        else:
            marks.pop(str(int(page)), None)
        library._write(d / "marks.json", marks)


def marks_summary(deck_id: str) -> dict:
    m = load_marks(deck_id)
    return {"starred": sorted(int(k) for k, v in m.items() if v.get("star")),
            "notes": sum(1 for v in m.values() if v.get("note", "").strip()),
            "highlights": sum(len(v.get("hl", [])) for v in m.values())}


# ================================================================ 做题进度
def _prog_path(quiz_id: str) -> Path:
    d = _p("_progress")
    d.mkdir(exist_ok=True)
    return d / f"{quiz_id}.json"


def load_progress(quiz_id: str) -> dict:
    return library._read(_prog_path(quiz_id), {}).get("answers", {})


def record_answer(quiz_id: str, n: int, a: int | None, correct: bool | None = None):
    """a=None 表示清空这题的作答（重做）；保留累计的 tries / wrong 方便找薄弱点。"""
    with library._lock:
        p = _prog_path(quiz_id)
        data = library._read(p, {})
        ans = data.setdefault("answers", {})
        rec = ans.get(str(n), {"tries": 0, "wrong": 0})
        if a is None:
            rec.pop("a", None)
            rec.pop("at", None)
        else:
            rec.update(a=int(a), at=_now(), tries=rec.get("tries", 0) + 1)
            if correct is False:
                rec["wrong"] = rec.get("wrong", 0) + 1
        ans[str(n)] = rec
        library._write(p, data)


def reset_progress(quiz_id: str, only: list[int] | None = None):
    with library._lock:
        p = _prog_path(quiz_id)
        data = library._read(p, {})
        ans = data.get("answers", {})
        for k, rec in ans.items():
            if only is None or int(k) in only:
                rec.pop("a", None)
                rec.pop("at", None)
        library._write(p, data)


def import_progress(quiz_id: str, answers: dict, questions: list[dict]):
    """把浏览器里旧的作答记录（{题号: 选项}）迁移进来，已有记录不覆盖。"""
    right = {q["n"]: q["ans"] for q in questions}
    with library._lock:
        p = _prog_path(quiz_id)
        data = library._read(p, {})
        ans = data.setdefault("answers", {})
        for k, a in (answers or {}).items():
            if str(k) in ans or not str(k).isdigit():
                continue
            ans[str(k)] = {"a": int(a), "at": _now(), "tries": 1, "wrong": int(int(a) != right.get(int(k)))}
        library._write(p, data)
