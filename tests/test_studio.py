"""讲解 → 题库 → 单词本：出题 / 挑生词的提示词与保存、收集术语、生词出现在哪里、相关命令行。

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

from kejian import __main__ as cli, importer, library, quiz, studio, userdata  # noqa: E402
import make_demo_pdf  # noqa: E402

TMP = Path(os.environ["KEJIAN_LIBRARY"])


def _deck(title):
    p = TMP / "studio-demo.pdf"
    if not p.exists():
        make_demo_pdf.main(str(p))
    return importer.import_file(p, title=title)


def _run(*args) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        code = cli.main(list(args))
    assert code == 0, buf.getvalue()
    return buf.getvalue()


class StudioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = userdata.add_course("Studio Econ", code="ST101")["id"]
        cls.d1 = _deck("Lecture 3 · Supply")
        cls.d2 = _deck("Lecture 4 · Elasticity")
        for d in (cls.d1, cls.d2):
            library.set_course(d, cls.course)
        library.save_note(cls.d1, 2, {"t": "Demand", "s": "Price up, quantity down.", "p": [],
                                      "k": [["demand curve", "需求曲线", ""], ["ceteris paribus", "other things equal", ""], ["价格", "price", ""]],
                                      "tip": ""})

    def test_quiz_prompt_has_chapters_and_slides(self):
        p = studio.quiz_prompt([self.d1, self.d2], 7, "calculations", "en")
        self.assertIn("7 questions", p)
        self.assertIn("=== Chapter 3 · Lecture 3 · Supply", p)
        self.assertIn("=== Chapter 4 · Lecture 4 · Elasticity", p)
        self.assertIn("--- slide 2", p)
        self.assertIn("Focus: calculations", p)
        self.assertNotIn('"q_zh"', p)
        self.assertIn('"q_zh"', studio.quiz_prompt([self.d1], 5, "", "zh"))

    def test_save_quiz_reply_links_decks_and_course(self):
        reply = 'Here you go!\n```json\n{"title": "T", "questions": [' \
                '{"chapter": "3", "page": 2, "q": "Q1?", "opts": ["a","b","c","d"], "ans": "C", "exp_en": "x"},' \
                '{"chapter": "9", "page": 1, "q": "Q2?", "opts": ["a","b","c","d"], "ans": "A"}]}\n```'
        r = studio.save_quiz_reply(reply, [self.d1])            # 只有一份课件时，写错的章节键归到它
        z = quiz.get_quiz(r["id"])
        self.assertEqual(r["count"], 2)
        self.assertEqual(z["course"], self.course)
        self.assertEqual(z["chapters"]["3"]["deck"], self.d1)
        self.assertEqual({q["chapter"] for q in z["questions"]}, {"3"})
        self.assertEqual(z["questions"][0]["ans"], 2)
        with self.assertRaises(ValueError):
            studio.save_quiz_reply("no json here", [self.d1])

    def test_words_reply_and_collect(self):
        reply = '```json\n[{"w": "allocate", "m": "分配", "d": "v. to give out", "page": 2, "ctx": "", "note": ""},' \
                ' {"w": "", "m": "x"}]\n```'
        r = studio.save_words_reply(reply, self.d1)
        self.assertEqual(r["added"], ["allocate"])
        v = next(x for x in userdata.load_vocab() if x["w"] == "allocate")
        self.assertEqual((v["m"], v["d"], v["course"]), ("分配", "v. to give out", self.course))
        self.assertEqual(v["src"][0]["page"], 2)

        r = studio.collect_from_notes(self.d1)
        self.assertIn("demand curve", r["added"] + r["merged"])
        words = {x["w"] for x in userdata.load_vocab()}
        self.assertTrue({"ceteris paribus", "demand curve"} <= words)
        self.assertNotIn("价格", words)                       # 中文“术语”跳过
        v = next(x for x in userdata.load_vocab() if x["w"] == "ceteris paribus")
        self.assertEqual(v["d"], "other things equal")
        self.assertEqual(v["src"][0], {"kind": "deck", "id": self.d1, "page": 2, "ctx": v["src"][0].get("ctx", "")})

    def test_where_and_deck_words(self):
        page_text = library.get_deck(self.d2)["pages"][1]["text"]
        word = next(w for w in page_text.split() if len(w) > 6 and w.isalpha())
        userdata.add_word({"w": word.lower(), "course": self.course})
        hits = studio.where([word.lower()], self.course)[word.lower()]
        decks = {h["id"] for h in hits if h["kind"] == "deck"}
        self.assertIn(self.d2, decks)
        self.assertIn(word.lower(), [x["w"] for x in studio.deck_words(self.d2)])

    def test_word_regex(self):
        rx = studio._word_re("price elasticity")
        self.assertTrue(rx.search("the Price  Elasticity of demand"))
        self.assertFalse(rx.search("price elasticityx"))
        self.assertTrue(studio._word_re("allocate").search("resources are allocated"))
        self.assertFalse(studio._word_re("cat").search("category"))

    def test_cli_prompt_and_save(self):
        out = _run("prompt", "words", self.d1, "--count", "5")
        self.assertIn("up to 5 words", out)
        f = TMP / "reply.json"
        f.write_text(json.dumps([{"w": "elastic", "m": "有弹性的", "d": "adj. responsive", "page": 1}]), encoding="utf-8")
        self.assertIn("新加 1", _run("save", "words", self.d1, "--file", str(f)))
        f.write_text('[{"page": 1, "title": "T", "gist": "G", "points": [], "terms": [], "tip": ""}]', encoding="utf-8")
        self.assertIn("已保存 1 页讲解", _run("save", "notes", self.d1, "--file", str(f)))
        self.assertIn("单词本", _run("vocab", "collect", self.d1))
        self.assertIn("demand curve", _run("vocab", "list", "--course", self.course))
        self.assertIn("language", _run("config"))


if __name__ == "__main__":
    unittest.main()
