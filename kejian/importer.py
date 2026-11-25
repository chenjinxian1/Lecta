"""课件导入：PPTX/PPT/PDF → 页面图片 + 单词坐标 + 文字 + 演讲者备注。

流程：
  1. PPT(X) 先转成 PDF（Windows 上用 PowerPoint，其它系统用 LibreOffice）
  2. 用 PyMuPDF 逐页渲染高清图和缩略图，并取出每个单词的精确坐标
  3. PPTX 额外读取演讲者备注，供 AI 生成讲解时参考
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from . import library
from .config import LIBRARY

PAGE_WIDTH_PX = 1600     # 页面图宽度
THUMB_WIDTH_PX = 240     # 缩略图宽度
SUPPORTED = {".pptx", ".ppt", ".pdf", ".odp", ".key"}


class ImportError_(Exception):
    pass


def _fitz():
    try:
        import fitz  # PyMuPDF
        return fitz
    except ImportError as e:
        raise ImportError_("缺少 PyMuPDF，请先运行：pip install -r requirements.txt") from e


# ---------------------------------------------------------------- 转 PDF
_PS_EXPORT = r"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
$had = $app.Presentations.Count
$p = $app.Presentations.Open($env:KJ_SRC, $true, $false, $false)
try { $p.SaveAs($env:KJ_OUT, 32) } finally { $p.Close() }
if ($had -eq 0) { $app.Quit() }
"""


def _via_powerpoint(src: Path, out: Path) -> bool:
    if sys.platform != "win32":
        return False
    env = dict(os.environ, KJ_SRC=str(src), KJ_OUT=str(out))
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", _PS_EXPORT],
                           env=env, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0 and out.is_file()


def _find_soffice():
    for name in ("soffice", "libreoffice"):
        p = shutil.which(name)
        if p:
            return p
    for p in (r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if os.path.exists(p):
            return p
    return None


def _via_libreoffice(src: Path, out: Path) -> bool:
    soffice = _find_soffice()
    if not soffice:
        return False
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(src)],
                           capture_output=True, timeout=600)
        except (OSError, subprocess.TimeoutExpired):
            return False
        pdfs = list(Path(tmp).glob("*.pdf"))
        if not pdfs:
            return False
        shutil.move(str(pdfs[0]), out)
    return out.is_file()


def converter_name() -> str | None:
    """doctor 用：本机能用哪种方式把 PPT 转成 PDF。"""
    if sys.platform == "win32":
        try:
            import winreg
            winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"PowerPoint.Application"))
            return "Microsoft PowerPoint"
        except OSError:
            pass
    soffice = _find_soffice()
    return f"LibreOffice（{soffice}）" if soffice else None


def to_pdf(src: Path, out: Path):
    if src.suffix.lower() == ".pdf":
        shutil.copyfile(src, out)
        return
    if _via_powerpoint(src, out) or _via_libreoffice(src, out):
        return
    raise ImportError_("无法把演示文稿转换为 PDF：需要安装 Microsoft PowerPoint（Windows）或 LibreOffice。"
                       "也可以先在 PowerPoint 里“另存为 PDF”，再导入 PDF。")


# ---------------------------------------------------------------- 演讲者备注
def speaker_notes(pptx: Path) -> list[str]:
    """按放映顺序返回每页演讲者备注（没有则为空字符串）。"""
    try:
        z = zipfile.ZipFile(pptx)
    except (OSError, zipfile.BadZipFile):
        return []
    def rd(name):
        try:
            return z.read(name).decode("utf-8")
        except KeyError:
            return ""
    pres, rels = rd("ppt/presentation.xml"), rd("ppt/_rels/presentation.xml.rels")
    rmap = {}
    for m in re.finditer(r"<Relationship\b[^>]*>", rels):
        tag = m.group(0)
        i, t = re.search(r'Id="([^"]+)"', tag), re.search(r'Target="([^"]+)"', tag)
        if i and t:
            rmap[i.group(1)] = t.group(1)
    out = []
    for m in re.finditer(r"<p:sldId\b[^>]*>", pres):
        rid = re.search(r'r:id="([^"]+)"', m.group(0))
        target = rmap.get(rid.group(1), "") if rid else ""
        slide = "ppt/" + target.lstrip("/").replace("../", "")
        if re.search(r'<p:sld\b[^>]*\bshow="0"', rd(slide)[:2000]):   # 隐藏页不会导出到 PDF
            continue
        srel = rd(os.path.dirname(slide) + "/_rels/" + os.path.basename(slide) + ".rels")
        nm = re.search(r'Target="\.\./notesSlides/([^"]+)"', srel)
        text = ""
        if nm:
            x = rd("ppt/notesSlides/" + nm.group(1))
            paras = []
            for p in re.findall(r"<a:p>.*?</a:p>|<a:p .*?</a:p>", x, re.S):
                if "<a:fld " in p and 'type="slidenum"' in p:
                    continue
                t = "".join(re.findall(r"<a:t>([^<]*)</a:t>", p)).strip()
                if t:
                    paras.append(t)
            text = _unescape("\n".join(paras))
        out.append(text)
    return out


def _unescape(s: str) -> str:
    return (s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
             .replace("&apos;", "'").replace("&amp;", "&"))


# ---------------------------------------------------------------- 渲染与取词
def _page_title(page) -> str:
    """取页面上半部分字号最大的一段文字作为标题。"""
    best, size = "", 0
    h = page.rect.height
    for b in page.get_text("dict").get("blocks", []):
        for line in b.get("lines", []):
            spans = [s for s in line.get("spans", []) if s["text"].strip()]
            if not spans or line["bbox"][1] > h * 0.45:
                continue
            sz = max(s["size"] for s in spans)
            txt = " ".join(s["text"].strip() for s in spans)
            if sz > size + 0.5:
                best, size = txt, sz
            elif abs(sz - size) <= 0.5 and best and len(best) < 120:
                best += " " + txt
    return re.sub(r"\s+", " ", best).strip()


def _words(page) -> list:
    """[[x0, y0, x1, y1, "word ", lineKey], ...]，单词后若同一行还有词则带一个空格。"""
    raw = page.get_text("words")
    out = []
    for i, w in enumerate(raw):
        x0, y0, x1, y1, text, b, l, _ = w
        nxt = raw[i + 1] if i + 1 < len(raw) else None
        same_line = nxt is not None and nxt[5] == b and nxt[6] == l
        out.append([round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1),
                    text + (" " if same_line else ""), b * 1000 + l])
    return out


def import_file(src: Path, title: str | None = None, progress=lambda done, total, msg: None,
                original_name: str | None = None) -> str:
    fitz = _fitz()
    src = Path(src)
    name = original_name or src.name
    ext = Path(name).suffix.lower()
    if ext not in SUPPORTED:
        raise ImportError_(f"不支持的文件类型 {ext}，请导入 .pptx / .ppt / .pdf")

    stem = Path(name).stem
    slug = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", stem).strip("-")[:40] or "deck"
    deck_id = f"{slug}-{hashlib.sha1(f'{name}{time.time()}'.encode()).hexdigest()[:6]}"
    d = LIBRARY / deck_id
    (d / "pages").mkdir(parents=True)
    (d / "thumbs").mkdir()

    try:
        progress(0, 1, "正在转换为 PDF…" if ext != ".pdf" else "正在读取 PDF…")
        pdf = d / "source.pdf"
        if src.suffix.lower() != ext:
            raise ImportError_("文件扩展名与文件名不一致")
        to_pdf(src.resolve(), pdf)
        notes = speaker_notes(src) if ext == ".pptx" else []

        doc = fitz.open(pdf)
        total = doc.page_count
        if total == 0:
            raise ImportError_("文件里没有页面")
        if len(notes) != total:
            notes = [""] * total
        pages, words = [], []
        for i, page in enumerate(doc):
            progress(i, total, f"正在处理第 {i + 1} / {total} 页")
            w, h = page.rect.width, page.rect.height
            z = PAGE_WIDTH_PX / w
            page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False).save(d / "pages" / f"{i + 1:03d}.jpg", jpg_quality=86)
            zt = THUMB_WIDTH_PX / w
            page.get_pixmap(matrix=fitz.Matrix(zt, zt), alpha=False).save(d / "thumbs" / f"{i + 1:03d}.jpg", jpg_quality=80)
            pages.append({
                "n": i + 1, "w": round(w, 2), "h": round(h, 2),
                "title": _page_title(page),
                "text": page.get_text("text").strip(),
                "notes": notes[i],
            })
            words.append(_words(page))
        doc.close()
        library.write_deck(d, {
            "id": deck_id, "title": (title or stem).strip(), "source": name,
            "kind": ext.lstrip("."), "created": time.time(), "pages": pages,
        }, words)
        progress(total, total, "导入完成")
        return deck_id
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise
