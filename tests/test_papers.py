"""论文库：导入、图表识别、文件夹、备注与便签、AI 解读的提示词与保存。

python -m unittest discover -s tests -v
"""
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("KEJIAN_LIBRARY", tempfile.mkdtemp(prefix="kejian-test-"))   # 必须在导入 kejian 之前
os.environ.setdefault("KEJIAN_CONFIG", str(Path(os.environ["KEJIAN_LIBRARY"]) / "config.json"))
sys.path.insert(0, str(ROOT))

import fitz  # noqa: E402

from kejian import __main__ as cli, library, manifest, papers, userdata  # noqa: E402

TMP = Path(os.environ["KEJIAN_LIBRARY"])

BODY = ("We study how to rebuild a room from a video. " * 6).strip()


def _make_paper(path: Path):
    """两页的小论文：第 1 页有标题、摘要和一张带图注的框架图，第 2 页有一张表和参考文献。"""
    doc = fitz.open()
    p = doc.new_page(width=612, height=792)
    p.insert_text((72, 80), "A Tiny Paper About Rooms", fontsize=18)
    p.insert_textbox(fitz.Rect(72, 110, 540, 200), "Abstract\n" + BODY, fontsize=9)
    p.insert_text((220, 224), "1 University of Somewhere", fontsize=8)   # 紧贴着图的单位行，不能算进图里
    # 框架图：几个色块和箭头
    for i, c in enumerate([(0.9, 0.5, 0.2), (0.2, 0.5, 0.9), (0.3, 0.8, 0.4)]):
        r = fitz.Rect(90 + i * 150, 230, 200 + i * 150, 330)
        p.draw_rect(r, color=(0, 0, 0), fill=c)
        if i:
            p.draw_line((r.x0 - 40, 280), (r.x0, 280), color=(0, 0, 0), width=2)
    p.insert_text((72, 352), "Figure 1. Overview of our pipeline: video in, room out.", fontsize=9)
    p.insert_textbox(fitz.Rect(72, 380, 540, 700), "1. Introduction\n" + BODY + "\n\n" + BODY, fontsize=9)
    p = doc.new_page(width=612, height=792)
    p.insert_text((72, 80), "Table 1. Results on rooms.", fontsize=9)
    for row in range(4):
        for col in range(3):
            p.insert_text((90 + col * 120, 104 + row * 16), f"{row}.{col}", fontsize=9)
    p.draw_line((80, 92), (440, 92), color=(0, 0, 0))
    p.draw_line((80, 162), (440, 162), color=(0, 0, 0))
    p.insert_textbox(fitz.Rect(72, 200, 540, 400), BODY + "\n\nReferences\n[1] Someone. A book.", fontsize=9)
    doc.save(str(path))


def _run(*args) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        code = cli.main(list(args))
    assert code == 0, buf.getvalue()
    return buf.getvalue()


BRIEF_1 = """Here is block 1:
```json
{"title": "小论文", "one_line": "从视频重建房间。",
 "problem": {"summary": "房间是静态的。", "points": ["不能交互"]},
 "solution": "用三个模块。",
 "framework": {"summary": "视频 → 房间", "steps": [{"name": "A", "does": "读视频"}, "B 直接写成字符串"]},
 "figure": {"id": "Figure 1", "summary": "总览图", "parts": [{"name": "左", "explain": "输入"}], "flow": ["先 A 再 B"]},
 "figures": [{"id": "Table 1", "explain": "结果表"}, {"id": "x", "explain": "没有编号的丢掉"}],
 "results": ["好"], "questions": "问题一\\n\\n问题二"}
```"""

BRIEF_2 = """```json
{"abstract": ["我们研究如何重建房间。"],
 "introduction": [{"page": 1, "text": "第一段"}, "第二段"],
 "method": [{"section": "3.1 A", "page": "1", "figures": ["1", "T1"], "text": "细节",
             "formulas": [{"tex": "x = y", "meaning": "相等"}, {"meaning": "没有 tex 的丢掉"}]},
            {"section": "空的丢掉"}]}
```"""


class PapersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf = TMP / "tiny-paper.pdf"
        _make_paper(cls.pdf)
        cls.folder = papers.add_folder("3D 重建")["id"]
        cls.pid = papers.import_paper(cls.pdf, "tiny-paper.pdf", folder=cls.folder)

    # ---------------------------------------------------------------- 导入与图表
    def test_import_reads_title_abstract_and_type(self):
        p = papers.get_paper(self.pid)
        self.assertEqual(p["type"], "paper")
        self.assertEqual(p["title"], "A Tiny Paper About Rooms")
        self.assertIn("rebuild a room", p["meta"].get("abstract", ""))
        self.assertEqual(p["folder"], self.folder)

    def test_figures_found_and_cropped(self):
        figs = papers.figures(self.pid)
        kinds = {(f["kind"], f["id"]) for f in figs}
        self.assertIn(("figure", "1"), kinds)
        self.assertIn(("table", "1"), kinds)
        d = papers.paper_dir(self.pid)
        for f in figs:
            self.assertTrue((d / f["img"]).is_file(), f)
        fig1 = next(f for f in figs if f["kind"] == "figure")
        x0, y0, x1, y1 = fig1["rect"]
        # 裁出来的图要盖住色块，但不能把图注下面的正文也带进来
        self.assertLessEqual(y0, 232)
        self.assertGreater(y0, 224)
        self.assertGreaterEqual(y1, 328)
        self.assertLess(y1, 380)
        self.assertEqual(papers.framework_candidates(figs), ["1"])

    def test_papers_are_not_decks(self):
        self.assertNotIn(self.pid, [d["id"] for d in library.list_decks()])
        self.assertIn(self.pid, [d["id"] for d in library.list_decks(papers=True)])
        m = manifest.build() if hasattr(manifest, "build") else manifest.manifest()
        self.assertIn(self.pid, [p["id"] for p in m["papers"]])
        self.assertTrue(any(f["id"] == self.folder for f in m["paper_folders"]))
        self.assertNotIn(self.pid, [d["id"] for c in m["courses"] for d in c.get("decks", [])])
        with self.assertRaises(KeyError):
            papers.paper_dir("no-such-paper")

    def test_non_pdf_is_refused(self):
        with self.assertRaises(Exception):
            papers.import_paper(self.pdf, "slides.pptx")

    # ---------------------------------------------------------------- 文件夹、备注
    def test_folders(self):
        again = papers.add_folder("3d 重建")
        self.assertEqual(again["id"], self.folder)            # 同名不重复建
        f = papers.add_folder("Robotics")
        papers.update_folder(f["id"], {"name": "Robot learning", "color": "#123456"})
        self.assertEqual(next(x for x in papers.list_folders() if x["id"] == f["id"])["name"], "Robot learning")
        pid2 = papers.import_paper(self.pdf, "copy.pdf", folder=f["id"])
        papers.delete_folder(f["id"])                          # 删文件夹不删论文
        self.assertIsNone(papers.get_paper(pid2)["folder"])
        with self.assertRaises(KeyError):
            papers.update_paper(pid2, {"folder": f["id"]})
        papers.delete_paper(pid2)

    def test_note_and_meta(self):
        papers.update_paper(self.pid, {"note": "先看图 1", "meta": {"year": "2025", "venue": "CVPR"}})
        p = papers.get_paper(self.pid)
        self.assertEqual(p["note"], "先看图 1")
        self.assertEqual(p["meta"]["venue"], "CVPR")
        self.assertIn("rebuild a room", p["meta"]["abstract"])   # 改 meta 不会丢掉别的字段

    def test_pins_and_highlight_notes(self):
        userdata.save_page_marks(self.pid, 1, {
            "hl": [{"id": "h1", "rects": [[10, 10, 50, 20]], "text": "video", "note": "解释" * 1000}],
            "pins": [{"id": "p1", "x": 100, "y": 200.04, "text": "这里看不懂"}, {"x": "bad"}],
        })
        m = userdata.load_marks(self.pid)["1"]
        self.assertEqual(len(m["pins"]), 1)
        self.assertEqual(m["pins"][0]["y"], 200.0)
        self.assertEqual(len(m["hl"][0]["note"]), 2000)
        s = papers.list_papers()
        me = next(p for p in s if p["id"] == self.pid)
        self.assertEqual((me["pins"], me["highlights"]), (1, 1))
        # 只有便签的一页也要留着
        userdata.save_page_marks(self.pid, 2, {"pins": [{"x": 1, "y": 1, "text": "x"}]})
        self.assertIn("2", userdata.load_marks(self.pid))
        self.assertIn("这里看不懂", papers.export_paper(self.pid))

    # ---------------------------------------------------------------- AI 解读
    def test_brief_prompt(self):
        p = papers.brief_prompt(self.pid, "zh")
        self.assertIn("[1] Figure 1", p)
        self.assertIn("[T1] Table 1", p)
        self.assertIn("★", p)
        self.assertIn("=== page 1 ===", p)
        self.assertIn("[References omitted]", p)
        self.assertNotIn("Someone. A book", p)
        self.assertTrue(papers.brief_images(self.pid))

    def test_fid(self):
        self.assertEqual([papers._fid(x) for x in ("2", "Figure 3", "Fig. 4", "Table 1", "Tab. 2", "T5", "x")],
                         ["2", "3", "4", "T1", "T2", "T5", ""])

    def test_save_brief_in_two_parts(self):
        papers.delete_brief(self.pid)
        r = papers.save_brief(BRIEF_1, self.pid, by="test")
        self.assertIn("method", r["missing"])
        b = r["brief"]
        self.assertEqual(b["solution"], {"summary": "用三个模块。", "points": []})
        self.assertEqual(b["framework"]["steps"][1], {"does": "B 直接写成字符串"})
        self.assertEqual(b["figure"]["id"], "1")
        self.assertEqual(b["figures"], [{"id": "T1", "explain": "结果表"}])
        self.assertEqual(b["questions"], ["问题一", "问题二"])

        r = papers.save_brief(BRIEF_2, self.pid)
        b = r["brief"]
        self.assertEqual(r["missing"], [])
        self.assertEqual(b["title"], "小论文")                # 第一次存的还在
        self.assertEqual(b["by"], "test")
        self.assertEqual([i["text"] for i in b["introduction"]], ["第一段", "第二段"])
        self.assertEqual(len(b["method"]), 1)
        self.assertEqual(b["method"][0]["page"], 1)
        self.assertEqual(b["method"][0]["figures"], ["1", "T1"])
        self.assertEqual(len(b["method"][0]["formulas"]), 1)
        self.assertTrue(papers.get_paper(self.pid)["brief"])
        with self.assertRaises(ValueError):
            papers.save_brief("no json here", self.pid)

    def test_ask_prompt(self):
        p = papers.ask_prompt(self.pid, "  rebuild   a room ", 1, "zh")
        self.assertIn("rebuild a room", p)
        self.assertIn("A Tiny Paper About Rooms", p)
        with self.assertRaises(ValueError):
            papers.ask_prompt(self.pid, "   ")

    # ---------------------------------------------------------------- 命令行
    def test_cli(self):
        out = _run("paper", "list")
        self.assertIn(self.pid, out)
        _run("paper", "note", self.pid, "命令行备注")
        self.assertEqual(papers.get_paper(self.pid)["note"], "命令行备注")
        _run("paper", "move", self.pid, "新文件夹")
        fid = papers.get_paper(self.pid)["folder"]
        self.assertEqual(next(f for f in papers.list_folders() if f["id"] == fid)["name"], "新文件夹")
        _run("paper", "move", self.pid, self.folder)
        self.assertIn("Table 1", _run("paper", "figures", self.pid))
        self.assertIn("Figures and tables", _run("prompt", "paper", self.pid))


class ArxivTest(unittest.TestCase):
    def test_arxiv_id(self):
        for s in ("https://arxiv.org/pdf/2504.15278", "https://arxiv.org/pdf/2504.15278.pdf", "arXiv:2504.15278", "2504.15278"):
            self.assertEqual(papers.arxiv_id(s), "2504.15278", s)
        self.assertEqual(papers.arxiv_id("https://arxiv.org/abs/2504.15278v2"), "2504.15278v2")
        self.assertFalse(papers.arxiv_id("https://example.com/paper.pdf"))


if __name__ == "__main__":
    unittest.main()
