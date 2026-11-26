"""论文库：读论文、收藏进文件夹、写备注、AI 解读。

论文和课件用同一种目录结构，所以划词翻译、高亮、批注都直接复用阅读器：

library/
    _papers.json              {"folders": [{"id", "name", "color", "created"}]}
    <论文ID>/deck.json         同课件，另有 "type": "paper", "folder", "note"（论文备注）,
                              "meta": {"authors": [...], "year", "venue", "arxiv", "url", "abstract"}, "toc"
    <论文ID>/figs.json         [{"id": "2", "kind": "figure"|"table", "page": 2, "caption", "rect", "img": "figs/figure-2.png"}]
    <论文ID>/figs/*.png        从 PDF 裁出来的图和表
    <论文ID>/brief.json        AI 解读（格式见 BRIEF_FORMAT / AGENTS.md）
    <论文ID>/marks.json        高亮、批注、页面便签（"pins"）

论文不属于课程，不会出现在课程首页、题库和单词本统计里（library.list_decks 默认跳过）。
"""
import json
import re
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from . import config, importer, library, manual, userdata

PAGE_WIDTH_PX = 2000          # 论文是竖版小字，页面图比课件清晰一些
FIG_ZOOM = 2.5
MAX_DOWNLOAD = 80 * 1024 * 1024
PROMPT_CHARS = 150_000        # 提示词里论文正文最多多少字符
_UA = {"User-Agent": "Mozilla/5.0 (Lecta paper reader)"}
FOLDER_COLORS = ["#0e5d6f", "#a63d2f", "#6b4fa0", "#2e7d4f", "#b8791f", "#3d5a99", "#8a5a44", "#4a463e"]


# ================================================================ 文件夹
def _folders_path() -> Path:
    config.LIBRARY.mkdir(parents=True, exist_ok=True)
    return config.LIBRARY / "_papers.json"


def list_folders() -> list[dict]:
    return library._read(_folders_path(), {}).get("folders", [])


def _save_folders(folders: list[dict]):
    data = library._read(_folders_path(), {})
    data["folders"] = folders
    library._write(_folders_path(), data)


def check_folder(fid):
    if not fid:
        return None
    if not any(f["id"] == fid for f in list_folders()):
        raise KeyError(fid)
    return fid


def add_folder(name: str, color: str = "") -> dict:
    name = (name or "").strip()[:60]
    if not name:
        raise ValueError("文件夹名称不能为空")
    with library._lock:
        folders = list_folders()
        for f in folders:
            if f["name"].lower() == name.lower():
                return f
        ids = {f["id"] for f in folders}
        base = re.sub(r"[^\w-]+", "-", name.lower()).strip("-")[:24] or "folder"
        fid, i = base, 2
        while fid in ids:
            fid, i = f"{base}-{i}", i + 1
        f = {"id": fid, "name": name, "color": color or FOLDER_COLORS[len(folders) % len(FOLDER_COLORS)],
             "created": round(time.time(), 3)}
        folders.append(f)
        _save_folders(folders)
        return f


def update_folder(fid: str, patch: dict) -> dict:
    with library._lock:
        folders = list_folders()
        for f in folders:
            if f["id"] == fid:
                if (patch.get("name") or "").strip():
                    f["name"] = patch["name"].strip()[:60]
                if patch.get("color"):
                    f["color"] = str(patch["color"])[:20]
                _save_folders(folders)
                return f
    raise KeyError(fid)


def delete_folder(fid: str):
    """删文件夹不删论文：里面的论文回到“未归档”。"""
    with library._lock:
        folders = list_folders()
        if not any(f["id"] == fid for f in folders):
            raise KeyError(fid)
        _save_folders([f for f in folders if f["id"] != fid])
        for p in list_papers():
            if p.get("folder") == fid:
                update_paper(p["id"], {"folder": None})


# ================================================================ 论文
def paper_dir(pid: str) -> Path:
    d = library.deck_dir(pid)
    if library._read(d / "deck.json", {}).get("type") != "paper":
        raise KeyError(pid)
    return d


def _summary(d: Path) -> dict:
    s = library.summary(d)
    deck = library._read(d / "deck.json", {})
    marks = library._read(d / "marks.json", {})
    brief = library._read(d / "brief.json", {})
    return {
        **{k: s[k] for k in ("id", "title", "source", "created", "opened", "pages", "aspect", "base")},
        "folder": deck.get("folder") or None,
        "note": deck.get("note", ""),
        "meta": deck.get("meta") or {},
        "brief": bool(brief), "brief_parts": [k for k in BRIEF_KEYS if brief.get(k)],
        "figs": len(library._read(d / "figs.json", [])),
        "highlights": sum(len(m.get("hl", [])) for m in marks.values()),
        "pins": sum(len(m.get("pins", [])) for m in marks.values()),
        "marked_pages": len(marks),
    }


def list_papers() -> list[dict]:
    out = []
    for s in library.list_decks(papers=True):
        out.append(_summary(library.deck_dir(s["id"])))
    out.sort(key=lambda x: -max(x["opened"], x["created"]))
    return out


def get_paper(pid: str) -> dict:
    d = paper_dir(pid)
    deck = library.get_deck(pid)
    deck.update({k: v for k, v in _summary(d).items() if k != "pages"})   # pages 保留页面列表，不要换成页数
    deck["figs_list"] = library._read(d / "figs.json", [])
    deck["figs_at"] = int((d / "figs.json").stat().st_mtime) if (d / "figs.json").is_file() else 0
    deck["brief_data"] = library._read(d / "brief.json", {})
    return deck


def update_paper(pid: str, patch: dict) -> dict:
    d = paper_dir(pid)
    with library._lock:
        deck = library._read(d / "deck.json", {})
        if (patch.get("title") or "").strip():
            deck["title"] = patch["title"].strip()[:300]
        if "folder" in patch:
            f = check_folder(patch["folder"] or None)
            if f:
                deck["folder"] = f
            else:
                deck.pop("folder", None)
        if "note" in patch:
            deck["note"] = str(patch["note"] or "")[:20000]
        if isinstance(patch.get("meta"), dict):
            meta = deck.get("meta") or {}
            for k in ("year", "venue", "url", "arxiv", "abstract"):
                if k in patch["meta"]:
                    meta[k] = str(patch["meta"][k] or "").strip()[:5000]
            if "authors" in patch["meta"]:
                a = patch["meta"]["authors"]
                meta["authors"] = [x.strip() for x in (a if isinstance(a, list) else re.split(r"[,，;；]", str(a or ""))) if x.strip()][:60]
            deck["meta"] = meta
        library._write(d / "deck.json", deck)
    return _summary(d)


def delete_paper(pid: str):
    paper_dir(pid)
    library.delete(pid)


# ================================================================ 导入
_ARXIV = re.compile(r"(?:arxiv\.org/(?:abs|pdf|html)/)?(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?$|^(?:arxiv:)?(\d{4}\.\d{4,5})(v\d+)?$", re.I)


def arxiv_id(s: str) -> str | None:
    s = (s or "").strip().rstrip("/")
    m = re.search(r"arxiv\.org/(?:abs|pdf|html)/([\w.-]+?/?\d{4}\.\d{4,5}|[a-z-]+/\d{7}|\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?(?:[?#].*)?$", s, re.I)
    if m:
        return m.group(1) + (m.group(2) or "")
    m = re.fullmatch(r"(?:arxiv:\s*)?(\d{4}\.\d{4,5})(v\d+)?", s, re.I)
    return (m.group(1) + (m.group(2) or "")) if m else None


def arxiv_meta(aid: str) -> dict:
    """arXiv 官方接口拿标题、作者、摘要、年份。失败就返回空，不影响导入。"""
    try:
        url = "https://export.arxiv.org/api/query?id_list=" + urllib.parse.quote(aid)
        with urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=15) as r:
            root = ET.fromstring(r.read())
    except Exception:  # noqa: BLE001
        return {}
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    e = root.find("a:entry", ns)
    if e is None or e.find("a:title", ns) is None:
        return {}
    clean = lambda t: re.sub(r"\s+", " ", t or "").strip()  # noqa: E731
    out = {"title": clean(e.findtext("a:title", "", ns)),
           "authors": [clean(a.findtext("a:name", "", ns)) for a in e.findall("a:author", ns)],
           "abstract": clean(e.findtext("a:summary", "", ns)),
           "year": (e.findtext("a:published", "", ns) or "")[:4],
           "arxiv": re.sub(r"v\d+$", "", aid), "url": f"https://arxiv.org/abs/{re.sub(r'v\d+$', '', aid)}"}
    venue = clean(e.findtext("x:journal_ref", "", ns))
    comment = clean(e.findtext("x:comment", "", ns))
    if not venue and _VENUE.search(comment):
        venue = comment
    if venue:
        out["venue"] = venue[:200]
    return out


_VENUE = re.compile(r"accepted|to appear|published|conference|proceedings|journal|workshop|\b(?:CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|"
                    r"AAAI|IJCAI|ACL|EMNLP|NAACL|COLING|SIGGRAPH|KDD|WWW|SIGIR|CHI|TPAMI|IJCV|IROS|ICRA|CoRL|RSS|MICCAI|"
                    r"OSDI|SOSP|NSDI|USENIX|VLDB|SIGMOD|Nature|Science)\b", re.I)


def find_by_arxiv(aid: str) -> str | None:
    base = re.sub(r"v\d+$", "", aid or "")
    for p in list_papers():
        if base and (p["meta"].get("arxiv") or "") == base:
            return p["id"]
    return None


def download(url_or_id: str, progress=lambda done, total, msg: None) -> tuple[Path, str, dict]:
    """下载论文 PDF。返回 (临时文件, 文件名, 元数据)。支持 arXiv 编号 / 链接和直接的 PDF 链接。"""
    s = (url_or_id or "").strip()
    aid = arxiv_id(s)
    meta = {}
    if aid:
        progress(0, 1, "正在读取 arXiv 信息…")
        meta = arxiv_meta(aid)
        url, name = f"https://arxiv.org/pdf/{aid}", f"{aid}.pdf"
    else:
        if not re.match(r"^https?://", s, re.I):
            raise ValueError("请输入 arXiv 编号（如 2504.15278）、arXiv 链接，或者以 .pdf 结尾的论文链接")
        url = s
        name = Path(urllib.parse.urlparse(s).path).name or "paper.pdf"
        if not name.lower().endswith(".pdf"):
            name += ".pdf"
        meta = {"url": s}
    progress(0, 1, "正在下载 PDF…")
    fd, tmp = tempfile.mkstemp(suffix=".pdf", prefix="lecta-paper-")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=60) as r, open(fd, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            got = 0
            while chunk := r.read(1 << 16):
                got += len(chunk)
                if got > MAX_DOWNLOAD:
                    raise ValueError("PDF 超过 80 MB")
                f.write(chunk)
                if total:
                    progress(got, total, f"正在下载 PDF… {got * 100 // total}%")
        with open(tmp, "rb") as f:
            if f.read(5) != b"%PDF-":
                raise ValueError("这个链接打开的不是 PDF。arXiv 论文直接填编号即可，其它网站请用 PDF 的直接下载链接。")
    except Exception as e:
        Path(tmp).unlink(missing_ok=True)
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"下载失败：{e}") from e
    return Path(tmp), name, meta


def _pdf_meta(pdf: Path, pages: list[dict]) -> dict:
    """没有 arXiv 信息时，从 PDF 里猜标题和摘要。"""
    fitz = importer._fitz()
    out = {}
    with fitz.open(pdf) as doc:
        t = (doc.metadata or {}).get("title", "").strip()
        if t and len(t) > 8 and not re.search(r"\.(dvi|tex|pdf|docx?)$|^untitled|^microsoft word", t, re.I):
            out["title"] = t
        elif doc.page_count:
            out["title"] = _first_page_title(doc[0])
        toc = doc.get_toc(simple=True)
    text = pages[0].get("text", "") if pages else ""
    m = re.search(r"\bAbstract\b[\s.:—-]*(.+?)(?:\n\s*(?:1\.?|I\.?)\s*Introduction\b|\n\s*Introduction\b|\n\s*Keywords?\b|$)", text, re.S | re.I)
    if m:
        out["abstract"] = re.sub(r"-\n(?=[a-z])", "", m.group(1))
        out["abstract"] = re.sub(r"\s+", " ", out["abstract"]).strip()[:4000]
    out["toc"] = [[int(lv), str(t).strip(), int(p)] for lv, t, p in toc if str(t).strip()][:200]
    return out


def _first_page_title(page) -> str:
    """第一页字号最大的几行（论文标题）。"""
    spans = []
    for b in page.get_text("dict").get("blocks", []):
        for line in b.get("lines", []):
            for s in line.get("spans", []):
                if s["text"].strip() and line["bbox"][1] < page.rect.height * 0.5:
                    spans.append((round(s["size"], 1), line["bbox"][1], s["text"].strip()))
    if not spans:
        return ""
    big = max(s[0] for s in spans)
    parts, seen = [], set()
    for size, y, t in sorted((s for s in spans if s[0] >= big - 0.6), key=lambda s: s[1]):
        if (y, t) not in seen:
            parts.append(t)
            seen.add((y, t))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()[:300]


def import_paper(src: Path, original_name: str, folder: str | None = None, meta: dict | None = None,
                 progress=lambda done, total, msg: None) -> str:
    folder = check_folder(folder)
    meta = dict(meta or {})
    if Path(original_name).suffix.lower() != ".pdf":
        raise importer.ImportError_("论文请导入 PDF 文件")
    pid = importer.import_file(src, title=meta.get("title") or None, progress=progress, original_name=original_name,
                               page_width=PAGE_WIDTH_PX, extra={"type": "paper"})
    d = library.deck_dir(pid)
    try:
        progress(0, 1, "正在识别图表…")
        deck = library._read(d / "deck.json", {})
        guess = _pdf_meta(d / "source.pdf", deck.get("pages", []))
        toc = guess.pop("toc", [])
        if not meta.get("title") and guess.get("title"):
            deck["title"] = guess["title"]
        for k, v in guess.items():
            if k != "title" and v and not meta.get(k):
                meta[k] = v
        meta.pop("title", None)
        deck.update(meta={k: v for k, v in meta.items() if v}, toc=toc)
        if folder:
            deck["folder"] = folder
        library._write(d / "deck.json", deck)
        extract_figures(pid)
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise
    progress(1, 1, "导入完成")
    return pid


# ================================================================ 图表裁剪
_CAP = re.compile(r"^\s*(Figure|Fig\.|Table|Tab\.)\s*(\d+)\s*[.:|]", re.I)


def find_figures(page) -> list[dict]:
    """在一页里找出带编号图注的图和表，返回 [{kind, id, caption, rect}]（PDF 坐标）。

    做法：先找 “Figure N.” / “Table N.” 开头的图注，再从图注往上（表格也试往下）把挨着的
    图片、矢量图形和短标签一块块并进来，碰到正文段落或别的图注就停。
    """
    fitz = importer._fitz()
    W, H = page.rect.width, page.rect.height
    blocks = [b for b in page.get_text("dict")["blocks"] if b["type"] == 0]
    caps, items, body, small = [], [], [], []   # small[i]：第 i 个文字行字号很小（图里的标签）
    for b in blocks:
        lines = [ln for ln in b["lines"] if abs(ln["dir"][0] - 1) < 0.01]
        texts = ["".join(s["text"] for s in ln["spans"]) for ln in lines]
        ci = next((i for i, t in enumerate(texts) if _CAP.match(t)), None)
        r = fitz.Rect(b["bbox"])
        if ci is None and sum(len(t) for t in texts) >= 180 and len(lines) >= 3 and r.width > 150:
            body.append(r)               # 正文段落：图的边界
            continue
        for ln, t in zip(lines[:ci] if ci is not None else lines, texts):
            if t.strip():
                items.append(fitz.Rect(ln["bbox"]))
                small.append(max((sp["size"] for sp in ln["spans"]), default=0) < 7.5)
        if ci is not None:
            cr = fitz.Rect(lines[ci]["bbox"])
            for ln in lines[ci + 1:]:
                cr |= fitz.Rect(ln["bbox"])
            m = _CAP.match(texts[ci])
            caps.append({"kind": "table" if m.group(1).lower().startswith("tab") else "figure", "id": m.group(2),
                         "rect": cr, "caption": re.sub(r"\s+", " ", " ".join(texts[ci:])).strip()[:1500]})
    if not caps:
        return []
    ntext = len(items)                   # items 里前 ntext 个是文字行，后面是图片和矢量图形
    items += [fitz.Rect(i["bbox"]) for i in page.get_image_info()]
    white = lambda c: c is None or all(x > 0.97 for x in c)  # noqa: E731
    for dr in page.get_drawings():
        r = fitz.Rect(dr["rect"])
        if white(dr.get("fill")) and white(dr.get("color")):
            continue                     # 看不见的白底 / 裁剪框
        if not (r.width > W * 0.9 and r.height > H * 0.9):
            items.append(r)
    keep = [i for i, r in enumerate(items) if r.width > 0.5 or r.height > 0.5]
    is_text = {id(items[i]): (small[i] if i < ntext else None) for i in keep}   # None = 图形
    items = [items[i] for i in keep]
    out = []
    for c in caps:
        cr = c["rect"]
        full = cr.width > W * 0.55
        lo, hi = (0, W) if full else ((0, W / 2) if cr.x1 <= W / 2 + 10 else (W / 2, W))
        inc = lambda r: lo - 2 <= (r.x0 + r.x1) / 2 <= hi + 2 and not r.intersects(cr)  # noqa: E731
        others = [o["rect"] for o in caps if o is not c]

        def grow(up, only_graphics=False):
            edge, got, gap = (cr.y0 if up else cr.y1), [], 14
            stop = [r for r in body + others if inc(r) and (r.y1 <= cr.y0 + 1 if up else r.y0 >= cr.y1 - 1)]
            limit = max((r.y1 for r in stop), default=0) if up else min((r.y0 for r in stop), default=H)
            pool = [r for r in items if inc(r) and (r.y1 <= cr.y0 + 3 and r.y0 >= limit - 1 if up
                                                   else r.y0 >= cr.y1 - 3 and r.y1 <= limit + 1)]
            if only_graphics:
                pool = [r for r in pool if is_text[id(r)] is not False]
            changed = True
            while changed:
                changed = False
                for r in pool:
                    if r in got:
                        continue
                    if (up and r.y1 >= edge - gap) or (not up and r.y0 <= edge + gap):
                        got.append(r)
                        edge = min(edge, r.y0) if up else max(edge, r.y1)
                        changed = True
            dist = min(((cr.y0 - r.y1) if up else (r.y0 - cr.y1) for r in got), default=999)
            return got, dist

        above, da = grow(True)
        below, db = grow(False)
        got = above if (above and (c["kind"] == "figure" or da <= db or not below)) else below
        if not got:
            continue
        up = got is above
        if c["kind"] == "figure" and up:
            # 先只用图形和小字标签聚成一块，再把落在这块里的正常字号文字补进来；
            # 这样论文标题、作者、单位、上一段的尾巴不会被当成图的一部分
            g, _ = grow(True, only_graphics=True)
            if any(is_text[id(r)] is None for r in g):
                gtop = min(r.y0 for r in g)
                got = g + [r for r in above if is_text[id(r)] is False and r.y0 >= gtop - 2]
        u = fitz.Rect(got[0])
        for r in got[1:]:
            u |= r
        if u.height < 20 or u.width < 40:
            continue
        top = u.y0
        u = u + (-4, -4, 4, 4)
        for r in items:                  # 留边距时不要把图上方没选中的文字切一半进来
            if is_text[id(r)] is not None and r.y1 <= top + 1 and r.y1 > u.y0 and r.x1 > u.x0 and r.x0 < u.x1 \
                    and not any(r is g for g in got):
                u.y0 = r.y1 + 0.5
        if not full:
            u.x0, u.x1 = max(u.x0, lo), min(u.x1, hi)
        if up:
            u.y1 = min(u.y1, cr.y0 - 0.5)
        else:
            u.y0 = max(u.y0, cr.y1 + 0.5)
        u &= page.rect
        out.append({"kind": c["kind"], "id": c["id"], "caption": c["caption"],
                    "rect": [round(u.x0, 1), round(u.y0, 1), round(u.x1, 1), round(u.y1, 1)]})
    return out


def extract_figures(pid: str) -> list[dict]:
    fitz = importer._fitz()
    d = library.deck_dir(pid)
    pdf = d / "source.pdf"
    out, seen = [], set()
    figs = d / "figs"
    figs.mkdir(exist_ok=True)
    fitz.TOOLS.mupdf_display_errors(False)
    try:
        with fitz.open(pdf) as doc:
            for pno, page in enumerate(doc, 1):
                for f in find_figures(page):
                    key = (f["kind"], f["id"])
                    if key in seen:          # 正文里 “Figure 3. …” 这种引用只认第一次
                        continue
                    seen.add(key)
                    name = f"{f['kind']}-{f['id']}.png"
                    page.get_pixmap(matrix=fitz.Matrix(FIG_ZOOM, FIG_ZOOM), clip=fitz.Rect(f["rect"]), alpha=False).save(figs / name)
                    out.append({**f, "page": pno, "img": f"figs/{name}"})
    finally:
        fitz.TOOLS.mupdf_display_errors(True)
    library._write(d / "figs.json", out)
    return out


def figures(pid: str) -> list[dict]:
    return library._read(paper_dir(pid) / "figs.json", [])


_FRAMEWORK = re.compile(r"overview|pipeline|framework|architecture|illustration of (?:our|the proposed)|the proposed (?:method|model|system)", re.I)


def framework_candidates(figs: list[dict]) -> list[str]:
    c = [f["id"] for f in figs if f["kind"] == "figure" and _FRAMEWORK.search(f.get("caption", "")[:120])]
    return c or [f["id"] for f in figs if f["kind"] == "figure"][:2]


# ================================================================ AI 解读
BRIEF_KEYS = ("title", "one_line", "problem", "solution", "framework", "abstract", "introduction",
              "method", "figure", "figures", "results", "limitations", "questions")

_BRIEF_LANG = {
    "zh": """Language: the reader is a Chinese student. Write every explanation in Simplified Chinese.
Keep technical terms in English the first time they appear, like 符号距离场（signed distance field, SDF）.
"title": translate the paper title into Chinese.
"abstract" and "introduction": translate into Chinese COMPLETELY and faithfully, paragraph by paragraph. Do not summarise or skip sentences.""",
    "en": """Language: English only, in plain words for a student who is not a specialist. Do not write any Chinese.
"title": the paper title.
"abstract" and "introduction": rewrite each paragraph in plain English, keeping every point and every number. Do not skip paragraphs.""",
}

BRIEF_FORMAT = """Output exactly TWO ```json code blocks and nothing else.

Block 1 — the overview and the framework figure:
```json
{
  "title": "...",
  "one_line": "one sentence: what the paper does and why it matters",
  "problem": {
    "summary": "2–4 sentences: the problem the paper tackles, and why it is hard",
    "points": ["what existing approaches do, and exactly where they fall short", "..."]
  },
  "solution": {
    "summary": "2–4 sentences: the core idea of how they solve it",
    "points": ["each key contribution or design choice, and which shortcoming it fixes", "..."]
  },
  "framework": {
    "summary": "how the whole system is organised, from input to final output",
    "steps": [{"name": "module name as in the paper", "input": "what goes in", "does": "what it does and how", "output": "what comes out"}]
  },
  "figure": {
    "id": "2",
    "summary": "what the framework figure shows as a whole",
    "parts": [{"name": "a region or block of the figure, e.g. left: Dual Scene Representation", "explain": "what is drawn there and what it means"}],
    "flow": ["follow the arrows: step 1 …", "step 2 …"],
    "design": ["why it is built this way, and what would break without this part"],
    "details": ["easy-to-miss details: colours, dashed lines, symbols, insets, notation"]
  },
  "figures": [{"id": "3", "explain": "what this figure or table shows, and what to conclude from it"}],
  "results": ["main experimental findings, with the key numbers"],
  "limitations": ["limitations and open questions"],
  "questions": ["3–5 questions worth thinking about after reading"]
}
```

Block 2 — the translations and the method in detail:
```json
{
  "abstract": ["paragraph 1", "..."],
  "introduction": [{"page": 1, "text": "one paragraph of the Introduction"}],
  "method": [
    {
      "section": "section number and title as in the paper, e.g. 3.2 Dual Scene Representation",
      "page": 4,
      "figures": ["5"],
      "text": "detailed explanation: what this part does, how it works step by step, and why it is designed this way. Several paragraphs separated by \\n\\n.",
      "formulas": [{"tex": "LaTeX of a key equation", "meaning": "what each symbol means and what the equation does"}]
    }
  ]
}
```

If your reply is cut off, the user will say "continue": then write the unfinished block again in full."""

_BRIEF_RULES = """Rules:
- Read the whole paper before writing. Be concrete: name the actual modules, inputs, outputs, losses and numbers from the paper. Do not invent anything; if the paper is unclear about something, say so.
- "method" is the most important part. Cover every subsection of the method section in order, in detail (roughly 200–400 words per subsection). In "figures" give the numbers of the figures/tables that subsection relies on, and say in "text" what to look at in them ("in Figure 5, the left half shows …").
- "formulas": only the key equations, written in LaTeX, with every symbol explained. Leave it out when a subsection has none.
- "figure": choose the paper's main framework / overview / pipeline figure{cands}. Explain it region by region, follow the data flow along the arrows, and think about why each part exists and how the parts depend on each other. This should be the deepest part of your answer.
- "figures": the other important figures and tables, one short paragraph each.
- Refer to figures by their number as a string ("2") and tables by "T" plus their number ("T1" for Table 1), using the list below. Tables go in the same "figures" lists.
- "page" is the page number in the paper text below."""


def _paper_text(pid: str, limit: int = PROMPT_CHARS) -> str:
    deck = library._read(paper_dir(pid) / "deck.json", {})
    out, total = [], 0
    for p in deck.get("pages", []):
        t = re.sub(r"[ \t]+", " ", p.get("text") or "").strip()
        # 参考文献之后的内容（附录除外）不用发给 AI
        m = re.search(r"\n\s*(?:References|REFERENCES|Bibliography)\s*\n", t)
        if m and p["n"] > 1:
            t = t[:m.start()] + "\n[References omitted]"
        if total + len(t) > limit:
            out.append(f"=== page {p['n']} ===\n{t[:max(0, limit - total)]}\n[… the rest of the paper is cut]")
            break
        out.append(f"=== page {p['n']} ===\n{t}")
        total += len(t)
        if m and p["n"] > 1:
            break
    return "\n\n".join(out)


def _figure_list(figs: list[dict]) -> str:
    cands = set(framework_candidates(figs))
    lines = []
    for f in figs:
        star = " ★" if f["kind"] == "figure" and f["id"] in cands else ""
        ref = f["id"] if f["kind"] == "figure" else "T" + f["id"]
        lines.append(f"- [{ref}] {'Figure' if f['kind'] == 'figure' else 'Table'} {f['id']} (page {f['page']}){star}: {f['caption'][:300]}")
    return "\n".join(lines) or "(no numbered figures were found)"


def brief_prompt(pid: str, language: str | None = None) -> str:
    language = language or config.load_settings().get("language", "zh")
    deck = library._read(paper_dir(pid) / "deck.json", {})
    meta = deck.get("meta") or {}
    figs = figures(pid)
    cands = framework_candidates(figs)
    head = [f"Paper: {deck.get('title', pid)}"]
    if meta.get("authors"):
        head.append("Authors: " + ", ".join(meta["authors"][:12]))
    if meta.get("venue") or meta.get("year"):
        head.append("Published: " + " · ".join(x for x in (meta.get("venue"), meta.get("year")) if x))
    return "\n\n".join([
        "You are helping a student read a research paper closely. Read the paper below (and the attached PDF or figure images, if you have them), then write a reading guide.",
        _BRIEF_LANG.get(language, _BRIEF_LANG["zh"]),
        BRIEF_FORMAT,
        _BRIEF_RULES.replace("{cands}", f" (most likely Figure {' or '.join(cands)}, marked ★ below)" if cands else ""),
        "\n".join(head),
        "Figures and tables in this paper:\n" + _figure_list(figs),
        "The paper text (extracted from the PDF; equations may look garbled, so use the PDF if you have it):\n\n" + _paper_text(pid),
    ])


def brief_images(pid: str, limit: int = 5) -> list[Path]:
    """一键生成时一起发给模型的图：先框架图，再按顺序补几张。"""
    d = paper_dir(pid)
    figs = figures(pid)
    cands = framework_candidates(figs)
    order = [f for f in figs if f["kind"] == "figure" and f["id"] in cands] + \
            [f for f in figs if not (f["kind"] == "figure" and f["id"] in cands)]
    return [d / f["img"] for f in order if (d / f["img"]).is_file()][:limit]


def _dicts(text: str) -> list[dict]:
    """回复里的所有 JSON 对象（两个代码块各一个；被截断的块尽量解析）。"""
    out = []
    for chunk in manual._candidates(text or ""):
        s = chunk.strip()
        i = s.find("{")
        if i < 0:
            continue
        try:
            obj = json.JSONDecoder().raw_decode(s, i)[0]
        except ValueError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def _s(x, n=20000) -> str:
    return re.sub(r"[ \t]+\n", "\n", str(x or "")).strip()[:n]


def _strs(x, n=40, each=4000) -> list[str]:
    if isinstance(x, str):
        x = [p for p in re.split(r"\n\s*\n", x) if p.strip()]
    return [_s(v, each) for v in (x or []) if isinstance(v, (str, int, float)) and _s(v)][:n]


def _fid(x) -> str:
    """图的编号 "2"；表格写成 "T2"（AI 写 "Table 2"、"Tab. 2"、"T2" 都认）。"""
    t = str(x or "").strip()
    m = re.search(r"\d+", t)
    if not m:
        return ""
    return ("T" if re.match(r"(?i)\s*(?:tab(?:le)?\.?|t)\s*\d", t) else "") + m.group(0)


def normalize_brief(data: dict) -> dict:
    """把 AI 的回复整理成固定格式，缺的字段就不要。"""
    b = {}
    if data.get("title"):
        b["title"] = _s(data["title"], 400)
    if data.get("one_line"):
        b["one_line"] = _s(data["one_line"], 1000)
    for k in ("problem", "solution"):
        v = data.get(k)
        if isinstance(v, str):
            v = {"summary": v}
        if isinstance(v, dict) and (v.get("summary") or v.get("points")):
            b[k] = {"summary": _s(v.get("summary"), 3000), "points": _strs(v.get("points"))}
    fw = data.get("framework")
    if isinstance(fw, str):
        fw = {"summary": fw}
    if isinstance(fw, dict) and (fw.get("summary") or fw.get("steps")):
        steps = []
        for st in fw.get("steps") or []:
            if isinstance(st, str):
                st = {"does": st}
            if isinstance(st, dict) and (st.get("name") or st.get("does")):
                steps.append({k: _s(st.get(k), 3000) for k in ("name", "input", "does", "output") if st.get(k)})
        b["framework"] = {"summary": _s(fw.get("summary"), 4000), "steps": steps[:30]}
    if data.get("abstract"):
        b["abstract"] = _strs(data["abstract"], 20, 6000)
    intro = []
    for p in data.get("introduction") or []:
        if isinstance(p, str):
            p = {"text": p}
        if isinstance(p, dict) and _s(p.get("text")):
            intro.append({"page": int(p["page"]) if str(p.get("page", "")).isdigit() else None, "text": _s(p["text"], 8000)})
    if intro:
        b["introduction"] = intro[:60]
    method = []
    for m in data.get("method") or []:
        if not isinstance(m, dict) or not _s(m.get("text")):
            continue
        item = {"section": _s(m.get("section"), 300), "text": _s(m["text"], 20000),
                "page": int(m["page"]) if str(m.get("page", "")).isdigit() else None,
                "figures": [f for f in (_fid(x) for x in (m.get("figures") or [])) if f][:8]}
        fs = [{"tex": _s(f.get("tex"), 2000), "meaning": _s(f.get("meaning"), 3000)}
              for f in (m.get("formulas") or []) if isinstance(f, dict) and f.get("tex")]
        if fs:
            item["formulas"] = fs[:12]
        method.append(item)
    if method:
        b["method"] = method[:40]
    fg = data.get("figure")
    if isinstance(fg, dict) and (fg.get("summary") or fg.get("parts")):
        parts = []
        for p in fg.get("parts") or []:
            if isinstance(p, str):
                p = {"explain": p}
            if isinstance(p, dict) and p.get("explain"):
                parts.append({"name": _s(p.get("name"), 300), "explain": _s(p["explain"], 4000)})
        b["figure"] = {"id": _fid(fg.get("id")), "summary": _s(fg.get("summary"), 4000), "parts": parts[:30],
                       "flow": _strs(fg.get("flow")), "design": _strs(fg.get("design")), "details": _strs(fg.get("details"))}
    others = []
    for f in data.get("figures") or []:
        if isinstance(f, dict) and _fid(f.get("id")) and f.get("explain"):
            others.append({"id": _fid(f["id"]), "explain": _s(f["explain"], 4000)})
    if others:
        b["figures"] = others[:40]
    for k in ("results", "limitations", "questions"):
        if data.get(k):
            b[k] = _strs(data[k], 30, 3000)
    return b


def load_brief(pid: str) -> dict:
    return library._read(paper_dir(pid) / "brief.json", {})


def save_brief(text: str, pid: str, by: str = "") -> dict:
    """保存 AI 解读。两个代码块可以分两次粘贴，后存的会补上前面缺的部分。"""
    d = paper_dir(pid)
    objs = _dicts(text)
    if not objs:
        raise ValueError("没有在回复里找到 JSON。请确认复制了 AI 的完整回复（两个 ```json 代码块）。")
    new = {}
    for o in objs:
        new.update(normalize_brief(o))
    if not new:
        raise ValueError("回复里的 JSON 没有可用的内容（需要 problem / framework / method 等字段，见提示词里的格式）。")
    with library._lock:
        brief = library._read(d / "brief.json", {})
        brief.update(new)
        brief["by"] = by or brief.get("by") or ""
        brief["at"] = round(time.time(), 3)
        library._write(d / "brief.json", brief)
    missing = [k for k in ("problem", "solution", "framework", "abstract", "introduction", "method", "figure") if not brief.get(k)]
    return {"saved": [k for k in BRIEF_KEYS if k in new], "missing": missing, "brief": brief}


def delete_brief(pid: str):
    (paper_dir(pid) / "brief.json").unlink(missing_ok=True)


# ================================================================ 划句提问
def ask_prompt(pid: str, text: str, page: int | None = None, language: str | None = None) -> str:
    language = language or config.load_settings().get("language", "zh")
    deck = library._read(paper_dir(pid) / "deck.json", {})
    text = re.sub(r"\s+", " ", text or "").strip()[:3000]
    if not text:
        raise ValueError("没有选中文字")
    ctx = ""
    pages = deck.get("pages", [])
    if page and 1 <= page <= len(pages):
        ctx = re.sub(r"[ \t]+", " ", pages[page - 1].get("text") or "").strip()[:4000]
    want = ("In Simplified Chinese: 1) translate the passage accurately; 2) explain what it means in the context of this paper, "
            "in simple words; 3) explain any technical terms, symbols or equations in it. Keep English terms in brackets. "
            "Keep it short (under 300 Chinese characters). Plain text, no JSON.") if language == "zh" else \
           ("In plain English: 1) explain what the passage means in the context of this paper, in simple words; "
            "2) explain any technical terms, symbols or equations in it. Keep it short (under 150 words). Plain text, no JSON.")
    return "\n\n".join(x for x in [
        f"I am reading the paper \"{deck.get('title', pid)}\".",
        f"The passage I selected{f' (page {page})' if page else ''}:\n\"\"\"{text}\"\"\"",
        f"The text of that page, for context:\n\"\"\"{ctx}\"\"\"" if ctx else "",
        want,
    ] if x)


# ================================================================ 导出（给 AI 读）
def export_paper(pid: str) -> str:
    d = paper_dir(pid)
    deck = library._read(d / "deck.json", {})
    meta = deck.get("meta") or {}
    brief = library._read(d / "brief.json", {})
    marks = library._read(d / "marks.json", {})
    folder = next((f["name"] for f in list_folders() if f["id"] == deck.get("folder")), "未归档")
    lines = [f"# 论文：{deck.get('title', pid)}", "", f"- ID: `{pid}`", f"- 文件夹: {folder}"]
    for k, label in (("authors", "作者"), ("year", "年份"), ("venue", "发表"), ("url", "链接")):
        v = meta.get(k)
        if v:
            lines.append(f"- {label}: {', '.join(v) if isinstance(v, list) else v}")
    lines.append(f"- PDF: `{(d / 'source.pdf').as_posix()}`，页面图片 `{d.as_posix()}/pages/NNN.jpg`，图表 `{d.as_posix()}/figs/`")
    if deck.get("note", "").strip():
        lines += ["", "## 我的备注", "", deck["note"].strip()]
    if brief:
        lines += ["", "## AI 解读（摘要）", ""]
        if brief.get("one_line"):
            lines.append(f"**一句话：** {brief['one_line']}")
        for k, label in (("problem", "问题"), ("solution", "解决思路")):
            if brief.get(k):
                lines += ["", f"**{label}：** {brief[k].get('summary', '')}"] + [f"- {x}" for x in brief[k].get("points", [])]
        if brief.get("framework"):
            lines += ["", f"**框架：** {brief['framework'].get('summary', '')}"]
            lines += [f"- {s.get('name', '')}：{s.get('does', '')}" for s in brief["framework"].get("steps", [])]
    pages = sorted(marks, key=int)
    if pages:
        lines += ["", "## 我的高亮和批注", ""]
        for n in pages:
            m = marks[n]
            for h in m.get("hl", []):
                lines.append(f"- 第 {n} 页 高亮（{h['color']}）：“{h['text']}”" + (f" —— {h['note']}" if h.get("note") else ""))
            for p in m.get("pins", []):
                lines.append(f"- 第 {n} 页 便签：{p['text']}")
            if m.get("note", "").strip():
                lines.append(f"- 第 {n} 页 笔记：{m['note'].strip()}")
    lines += ["", "## 论文正文", "", _paper_text(pid)]
    return "\n".join(lines) + "\n"
