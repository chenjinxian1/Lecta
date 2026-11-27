"""把题库导出成文件发给同学、在同学的电脑上导入：题目、答案、解析、对应课件页的讲解，以及自动对上课件。

python -m unittest discover -s tests -v
"""
import io
import json
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
sys.path.insert(0, str(ROOT / "scripts"))

from kejian import __main__ as cli, importer, library, quiz, userdata  # noqa: E402
import make_demo_pdf  # noqa: E402

TMP = Path(os.environ["KEJIAN_LIBRARY"])
NOTE = {"t": "需求", "s": "价格上升，需求量下降。", "p": ["需求曲线向下倾斜"], "k": [["demand", "需求", ""]], "tip": "别和供给混了"}


def _deck(title):
    p = TMP / "share-demo.pdf"
    if not p.exists():
        make_demo_pdf.main(str(p))
    return importer.import_file(p, title=title)


def _run(*args) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        code = cli.main(list(args))
    assert code == 0, buf.getvalue()
    return buf.getvalue()


def _quiz(deck):
    return quiz.save_quiz(quiz.validate({
        "title": "Share test",
        "chapters": {"3": {"title": "Supply", "deck": deck}},
        "questions": [
            {"n": 1, "chapter": "3", "q": "Q one?", "opts": ["a", "b", "c", "d"], "ans": "B", "page": 2,
             "exp_zh": "因为 B", "exp_en": "Because B", "terms": [["demand", "需求", ""]]},
            {"n": 2, "chapter": "3", "q": "Q two?", "opts": ["a", "b"], "ans": 0, "page": 4},
        ]})[0])


class ShareTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mine = _deck("Share · Lecture 3 Supply")
        library.save_note(cls.mine, 2, NOTE)
        cls.course = userdata.add_course("Share Econ", code="SH101")["id"]
        library.set_course(cls.mine, cls.course)
        cls.qid = _quiz(cls.mine)

    def _package(self):
        return quiz.export_package(self.qid)

    def test_export_has_answers_explanations_and_notes(self):
        p = self._package()
        self.assertEqual(p["format"], "lecta-quiz")
        q1 = p["questions"][0]
        self.assertEqual((q1["ans"], q1["exp_zh"], q1["exp_en"]), (1, "因为 B", "Because B"))
        ch = p["chapters"]["3"]
        self.assertEqual(ch["deck_title"], "Share · Lecture 3 Supply")
        self.assertEqual(ch["notes"], {"2": NOTE})          # 只带有讲解的页
        self.assertNotIn("progress", p)
        self.assertNotIn("id", p)

    def test_import_on_a_friends_computer_relinks_by_title(self):
        p = self._package()
        p["chapters"]["3"]["deck"] = "someone-elses-deck-id"    # 同学电脑上的课件 ID 不一样
        r = quiz.import_package(p)
        self.assertNotEqual(r["id"], self.qid)                   # 不会覆盖已有题库
        self.assertEqual(r["count"], 2)
        self.assertEqual(r["linked"][0]["deck"], self.mine)
        self.assertEqual(r["course"], self.course)               # 自动放进对上的课件所在的课程
        z = quiz.get_quiz(r["id"])
        self.assertEqual(z["chapters"]["3"]["deck"], self.mine)
        self.assertTrue(z["chapters"]["3"]["deck_ok"])
        self.assertEqual(z["slide_notes"]["3"]["2"]["t"], "需求")
        self.assertEqual(r["notes_filled"], 0)                   # 本机已有讲解，不覆盖
        quiz.delete_quiz(r["id"])

    def test_notes_fill_only_missing_pages(self):
        friend = _deck("Share · Friend Lecture")
        library.save_note(friend, 4, {"t": "我自己的讲解", "s": "x", "p": []})
        p = self._package()
        ch = p["chapters"]["3"]
        ch.update(deck="nope", deck_title="Share · Friend Lecture", deck_source="other.pdf")
        ch["notes"]["4"] = {"t": "同学的讲解", "s": "y", "p": []}
        r = quiz.import_package(p)
        self.assertEqual(r["notes_filled"], 1)
        notes = library._read(library.deck_dir(friend) / "notes.json", {})
        self.assertEqual(notes["2"]["t"], "需求")
        self.assertEqual(notes["4"]["t"], "我自己的讲解")
        quiz.delete_quiz(r["id"])

    def test_unlinked_chapter_still_works_and_links_later(self):
        p = self._package()
        ch = p["chapters"]["3"]
        ch.update(deck="nope", deck_title="Share · Lecture 99 Not Here Yet", deck_source="lecture99.pdf")
        r = quiz.import_package(p)
        self.assertEqual([x["chapter"] for x in r["unlinked"]], ["3"])
        z = quiz.get_quiz(r["id"])
        self.assertFalse(z["chapters"]["3"]["deck_ok"])
        self.assertEqual(z["slide_notes"]["3"]["2"]["s"], NOTE["s"])   # 讲解跟着题库走
        later = _deck("Share · Lecture 99 Not Here Yet")                  # 之后才导入这份课件
        z = quiz.get_quiz(r["id"])
        self.assertEqual(z["chapters"]["3"]["deck"], later)
        self.assertTrue(z["chapters"]["3"]["deck_ok"])
        quiz.delete_quiz(r["id"])

    def test_out_of_range_page_is_dropped(self):
        p = self._package()
        p["questions"][1]["page"] = 999
        r = quiz.import_package(p)
        qs = quiz.get_quiz(r["id"])["questions"]
        self.assertEqual(qs[0]["page"], 2)
        self.assertNotIn("page", qs[1])
        quiz.delete_quiz(r["id"])

    def test_rejects_other_json(self):
        with self.assertRaises(ValueError):
            quiz.import_package({"questions": []})

    def test_cli_export_and_import(self):
        out = TMP / "share.lecta-quiz.json"
        _run("export", self.qid, "--share", "--out", str(out))
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertTrue(quiz.is_package(data))
        text = _run("quiz", str(out))
        self.assertIn("对上了课件", text)
        new = [z["id"] for z in quiz.list_quizzes() if z["id"] != self.qid and z["title"] == "Share test"]
        self.assertTrue(new)
        for q in new:
            quiz.delete_quiz(q)


if __name__ == "__main__":
    unittest.main()
