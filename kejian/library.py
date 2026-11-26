"""课件库：每份课件一个目录。

library/<deck-id>/
    deck.json     元数据 + 每页标题、正文、演讲者备注
    words.json    每页单词坐标（用于透明文字层）
    notes.json    每页讲解 {"1": {...}, "2": {...}}
    pages/001.jpg 高清页面图    thumbs/001.jpg 缩略图
"""
import json
import shutil
import threading
import time
from pathlib import Path

from .config import EXAMPLES, LIBRARY

_lock = threading.RLock()


def _read(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write(p: Path, data):
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # Windows 上别的线程正在读这个文件时 replace 会被拒绝，稍等再试
    for i in range(20):
        try:
            tmp.replace(p)
            return
        except PermissionError:
            if i == 19:
                raise
            time.sleep(0.02 * (i + 1))


def roots():
    """(根目录, 是否只读)。examples/ 里的示例课件只读。"""
    LIBRARY.mkdir(parents=True, exist_ok=True)
    yield LIBRARY, False
    if EXAMPLES.is_dir():
        yield EXAMPLES, True


def deck_dir(deck_id: str) -> Path:
    if not deck_id or "/" in deck_id or "\\" in deck_id or deck_id.startswith("."):
        raise KeyError(deck_id)
    for root, _ in roots():
        d = root / deck_id
        if (d / "deck.json").is_file():
            return d
    raise KeyError(deck_id)


def is_readonly(d: Path) -> bool:
    return EXAMPLES in d.parents


def url_base(d: Path) -> str:
    return ("/examples/" if is_readonly(d) else "/library/") + d.name + "/"


def summary(d: Path) -> dict:
    deck = _read(d / "deck.json", {})
    notes = _read(d / "notes.json", {})
    n = len(deck.get("pages", []))
    return {
        "id": d.name,
        "title": deck.get("title", d.name),
        "source": deck.get("source", ""),
        "created": deck.get("created", 0),
        "opened": deck.get("opened", 0),
        "pages": n,
        "noted": sum(1 for k in notes if notes[k]),
        "aspect": deck["pages"][0]["w"] / deck["pages"][0]["h"] if n else 4 / 3,
        "base": url_base(d),
        "example": is_readonly(d),
        "course": deck.get("course") or None,
        "marks": len(_read(d / "marks.json", {})),
        "type": deck.get("type") or "deck",
    }


def list_decks(papers: bool = False) -> list[dict]:
    """课件列表。论文（deck.json 里 type=paper）也用同样的目录结构，但默认不算课件。"""
    out = []
    for root, _ in roots():
        for d in root.iterdir():
            if (d / "deck.json").is_file():
                s = summary(d)
                if (s["type"] == "paper") == papers:
                    out.append(s)
    out.sort(key=lambda x: (x["example"], -max(x["opened"], x["created"])))
    return out


def get_deck(deck_id: str) -> dict:
    d = deck_dir(deck_id)
    deck = _read(d / "deck.json", {})
    s = summary(d)
    s.pop("pages")          # 保留 deck["pages"] 列表，不要被页数覆盖
    deck.update(s)
    deck["notes"] = _read(d / "notes.json", {})
    if not is_readonly(d):
        with _lock:
            raw = _read(d / "deck.json", {})
            raw["opened"] = time.time()
            _write(d / "deck.json", raw)
    return deck


def load_notes(d: Path) -> dict:
    return _read(d / "notes.json", {})


def save_note(deck_id: str, n: int, note: dict | None):
    d = deck_dir(deck_id)
    if is_readonly(d):
        raise PermissionError("示例课件是只读的")
    with _lock:
        notes = _read(d / "notes.json", {})
        if note:
            notes[str(n)] = note
        else:
            notes.pop(str(n), None)
        _write(d / "notes.json", notes)


def rename(deck_id: str, title: str):
    d = deck_dir(deck_id)
    if is_readonly(d):
        raise PermissionError("示例课件是只读的")
    with _lock:
        deck = _read(d / "deck.json", {})
        deck["title"] = title.strip()[:200] or deck.get("title")
        _write(d / "deck.json", deck)


def set_course(deck_id: str, course: str | None):
    d = deck_dir(deck_id)
    if is_readonly(d):
        raise PermissionError("示例课件是只读的")
    with _lock:
        deck = _read(d / "deck.json", {})
        if course:
            deck["course"] = course
        else:
            deck.pop("course", None)
        _write(d / "deck.json", deck)


def delete(deck_id: str):
    d = deck_dir(deck_id)
    if is_readonly(d) or LIBRARY not in d.parents:
        raise PermissionError("示例课件不能删除")
    shutil.rmtree(d)


def write_deck(d: Path, deck: dict, words: list):
    with _lock:
        _write(d / "deck.json", deck)
        _write(d / "words.json", words)
        if not (d / "notes.json").exists():
            _write(d / "notes.json", {})
