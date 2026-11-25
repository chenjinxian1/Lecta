"""v2 功能测试：课程、单词本复习、课件标注、做题进度、题库校验、给 AI 的 manifest / 导出、HTTP 接口。

python -m unittest discover -s tests -v
"""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("KEJIAN_LIBRARY", tempfile.mkdtemp(prefix="kejian-test-"))   # 必须在导入 kejian 之前
os.environ.setdefault("KEJIAN_CONFIG", str(Path(os.environ["KEJIAN_LIBRARY"]) / "config.json"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from kejian import importer, library, manifest, quiz, server, userdata  # noqa: E402
import make_demo_pdf  # noqa: E402

TMP = Path(os.environ["KEJIAN_LIBRARY"])


def _deck() -> str:
    """导入一份测试课件（每个测试类各导入一份，互不影响）。"""
    p = TMP / "v2-demo.pdf"
    if not p.exists():
        make_demo_pdf.main(str(p))
    return importer.import_file(p, title="V2 Demo")


def _quiz_json(deck_id: str, **extra) -> dict:
    return {"title": "Demo Quiz", "chapters": {"1": {"title": "Ch1", "deck": deck_id}},
            "questions": [{"q": "Q one?", "opts": ["a", "b", "c", "d"], "ans": "B", "page": 1},
                          {"q": "Q two?", "opts": {"A": "x", "B": "y"}, "ans": 0}], **extra}


class CourseTest(unittest.TestCase):
    def test_add_update_delete(self):
        c = userdata.add_course("组织行为学", code="OB101")
        self.assertEqual(c["id"], "ob101")
        c2 = userdata.add_course("Another", code="OB101")
        self.assertNotEqual(c2["id"], c["id"])                     # 重名自动加后缀
        self.assertEqual(userdata.update_course(c["id"], {"desc": "考试 12 月"})["desc"], "考试 12 月")
        with self.assertRaises(ValueError):
            userdata.add_course("  ")
        with self.assertRaises(KeyError):
            userdata.check_course("nope")
        self.assertIsNone(userdata.check_course(""))

        deck_id = _deck()
        library.set_course(deck_id, c["id"])
        qid = quiz.import_json(self._write(_quiz_json(deck_id)), course=c["id"])
        userdata.add_word({"w": "leader", "course": c["id"]})
        userdata.delete_course(c["id"])
        self.assertNotIn(c["id"], [x["id"] for x in userdata.list_courses()])
        self.assertIsNone(next(d for d in library.list_decks() if d["id"] == deck_id).get("course"))
        self.assertIsNone(quiz.get_quiz(qid).get("course"))
        self.assertIsNone(next(v for v in userdata.load_vocab() if v["w"] == "leader")["course"])

    @staticmethod
    def _write(data) -> Path:
        p = TMP / f"q-{time.time_ns()}.json"
        p.write_text(json.dumps(data), encoding="utf-8")
        return p


class VocabTest(unittest.TestCase):
    def test_add_merges_sources(self):
        userdata.add_word({"w": "Liaison", "m": "联络人", "src": [{"kind": "deck", "id": "d1", "page": 3, "ctx": "Liaison ..."}]})
        v = userdata.add_word({"w": "liaison ", "uk": "liˈeɪzn", "src": [{"kind": "quiz", "id": "q1", "n": 7},
                                                                         {"kind": "deck", "id": "d1", "page": 3}]})
        self.assertEqual(v["m"], "联络人")                         # 已有释义不被覆盖
        self.assertEqual(v["uk"], "liˈeɪzn")                       # 空字段被补上
        self.assertEqual(len(v["src"]), 2)                         # 同一出处不重复
        self.assertEqual(sum(1 for x in userdata.load_vocab() if x["w"].lower() == "liaison"), 1)
        with self.assertRaises(ValueError):
            userdata.add_word({"w": ""})

    def test_english_definition_field(self):
        userdata.add_word({"w": "figurehead", "m": "挂名首脑"})
        v = userdata.add_word({"w": "Figurehead", "d": "n. a head in name only"})
        self.assertEqual((v["m"], v["d"]), ("挂名首脑", "n. a head in name only"))   # 两种释义都保留
        v = userdata.update_word("figurehead", {"d": "n. a symbolic leader"})
        self.assertEqual(v["d"], "n. a symbolic leader")
        self.assertIn("n. a symbolic leader", manifest.export_vocab())

    def test_review_schedule(self):
        userdata.add_word({"w": "monitor"})
        now = time.time()
        v = userdata.review_word("monitor", "good")
        self.assertEqual(v["srs"]["level"], 1)
        self.assertAlmostEqual(v["srs"]["due"] - now, userdata.SRS_DAYS[1] * 86400, delta=5)
        v = userdata.review_word("MONITOR", "easy")
        self.assertEqual(v["srs"]["level"], 3)
        v = userdata.review_word("monitor", "again")
        self.assertEqual((v["srs"]["level"], v["srs"]["lapses"], v["srs"]["reps"]), (0, 1, 3))
        self.assertLess(v["srs"]["due"] - time.time(), 11 * 60)
        v = userdata.review_word("monitor", "hard")
        self.assertEqual(v["srs"]["level"], 1)
        with self.assertRaises(ValueError):
            userdata.review_word("monitor", "meh")
        with self.assertRaises(KeyError):
            userdata.review_word("nope", "good")

    def test_stats_and_update(self):
        userdata.add_word({"w": "spokesperson"})
        st = userdata.vocab_stats()
        self.assertGreaterEqual(st["due"], 1)
        self.assertEqual(st["total"], st["new"] + st["learning"] + st["mastered"])
        v = userdata.update_word("spokesperson", {"note": "发言人", "tags": ["Mintzberg", " ", "考点"]})
        self.assertEqual(v["tags"], ["Mintzberg", "考点"])
        userdata.delete_word("spokesperson")
        self.assertFalse(any(x["w"] == "spokesperson" for x in userdata.load_vocab()))


class MarksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck_id = _deck()

    def test_save_clean_and_remove(self):
        userdata.save_page_marks(self.deck_id, 2, {"star": True, "note": "重点", "hl": [
            {"text": "abc", "color": "purple", "rects": [[1, 2, 3, 4]]},
            {"text": "no rects", "rects": []}]})
        m = userdata.load_marks(self.deck_id)["2"]
        self.assertTrue(m["star"])
        self.assertEqual(len(m["hl"]), 1)                          # 没有矩形的高亮被丢掉
        self.assertEqual(m["hl"][0]["color"], "yellow")            # 未知颜色回落成黄色
        self.assertEqual(library.summary(library.deck_dir(self.deck_id))["marks"], 1)
        md = manifest.export_deck(self.deck_id)
        self.assertIn("★ 重点页", md)
        self.assertIn("“abc”", md)
        userdata.save_page_marks(self.deck_id, 2, {"star": False, "note": "  ", "hl": []})
        self.assertNotIn("2", userdata.load_marks(self.deck_id))   # 空标注直接删除


class ProgressAndQuizTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck_id = _deck()

    def test_validate(self):
        norm, errs = quiz.validate(_quiz_json(self.deck_id))
        self.assertEqual(errs, [])
        self.assertEqual([q["ans"] for q in norm["questions"]], [1, 0])
        self.assertEqual(norm["questions"][1]["n"], 2)             # 缺省题号按顺序
        self.assertEqual(norm["questions"][1]["opts"], ["x", "y"])
        bad = _quiz_json(self.deck_id)
        bad["questions"][0]["page"] = 999
        bad["questions"][1]["ans"] = "Z"
        bad["chapters"]["1"]["deck"] = "missing-deck"
        _, errs = quiz.validate(bad)
        self.assertTrue(any("missing-deck" in e for e in errs), errs)
        self.assertTrue(any("ans" in e for e in errs), errs)

    def test_progress(self):
        p = TMP / "prog.json"
        p.write_text(json.dumps(_quiz_json(self.deck_id)), encoding="utf-8")
        qid = quiz.import_json(p)
        userdata.record_answer(qid, 1, 0, correct=False)
        userdata.record_answer(qid, 1, 1, correct=True)
        userdata.record_answer(qid, 2, 0, correct=True)
        rec = userdata.load_progress(qid)
        self.assertEqual((rec["1"]["a"], rec["1"]["tries"], rec["1"]["wrong"]), (1, 2, 1))
        self.assertEqual(quiz.stats(qid, quiz.get_quiz(qid)["questions"])["right"], 2)
        userdata.reset_progress(qid, only=[1])
        rec = userdata.load_progress(qid)
        self.assertNotIn("a", rec["1"])
        self.assertEqual(rec["1"]["wrong"], 1)                     # 重做不清除“曾错”
        self.assertIn("a", rec["2"])
        userdata.import_progress(qid, {"1": 3, "2": 1}, quiz.get_quiz(qid)["questions"])
        self.assertNotIn("a", userdata.load_progress(qid)["1"])    # 已有记录不被旧数据覆盖
        md = quiz.export_markdown(qid)
        self.assertIn("Q two?", md)
        quiz.delete_quiz(qid)
        with self.assertRaises(KeyError):
            quiz.quiz_path(qid)


class ManifestTest(unittest.TestCase):
    def test_manifest_groups_and_check(self):
        deck_id = _deck()
        c = userdata.add_course("Manifest Course")
        library.set_course(deck_id, c["id"])
        m = manifest.manifest()
        self.assertEqual(m["schema_version"], 2)
        self.assertIn(m["language"], ("zh", "en"))                  # 给 AI 的学习语言
        group = next(x for x in m["courses"] if x["id"] == c["id"])
        self.assertIn(deck_id, [d["id"] for d in group["decks"]])
        self.assertNotIn(deck_id, [d["id"] for d in m["unassigned"]["decks"]])
        library.set_course(deck_id, "ghost-course")
        self.assertTrue(any("ghost-course" in p for p in manifest.check()))
        library.set_course(deck_id, None)
        self.assertIn("# 单词本", manifest.export_vocab())


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = server.Server(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}/api/"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.deck_id = _deck()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def call(self, path, method="GET", json_body=None, data=None, headers=None):
        body = json.dumps(json_body).encode() if json_body is not None else data
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=headers or {})
        if json_body is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read().decode()
                return r.status, (json.loads(raw) if r.headers.get_content_type() == "application/json" else raw)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "{}")

    def test_course_vocab_marks_quiz_flow(self):
        st, c = self.call("courses", "POST", {"name": "HTTP 课程", "code": "HT1"})
        self.assertEqual(st, 200)
        self.assertEqual(self.call(f"decks/{self.deck_id}", "PUT", {"course": c["id"]})[0], 200)
        self.assertEqual(self.call(f"decks/{self.deck_id}", "PUT", {"course": "nope"})[0], 404)
        self.assertEqual(self.call(f"decks/{self.deck_id}/marks/1", "PUT", {"star": True})[0], 200)
        self.assertTrue(self.call(f"decks/{self.deck_id}/marks")[1]["1"]["star"])
        st, text = self.call(f"decks/{self.deck_id}/export")
        self.assertIn("★ 重点页", text)

        st, v = self.call("vocab", "POST", {"w": "disseminator", "m": "传播者", "course": c["id"],
                                            "src": [{"kind": "deck", "id": self.deck_id, "page": 1}]})
        self.assertEqual(v["srs"]["level"], 0)
        st, v = self.call("vocab/disseminator/review", "POST", {"grade": "good"})
        self.assertEqual(v["srs"]["level"], 1)
        self.assertEqual(self.call("vocab/disseminator/review", "POST", {"grade": "bad"})[0], 400)
        st, data = self.call("vocab")
        self.assertIn("stats", data)

        payload = json.dumps(_quiz_json(self.deck_id)).encode()
        st, r = self.call("quizzes/import", "POST", data=payload,
                          headers={"X-Filename": "demo.json", "X-Course": c["id"]})
        self.assertEqual((st, r["count"]), (200, 2))
        qid = urllib.parse.quote(r["id"])
        self.assertEqual(self.call(f"quizzes/{qid}/answer", "POST", {"n": 1, "a": 0})[0], 200)
        st, z = self.call(f"quizzes/{qid}")
        self.assertEqual(z["progress"]["1"]["wrong"], 1)
        self.assertEqual(z["course"], c["id"])
        st, r = self.call("quizzes/import", "POST", data=b"{oops", headers={"X-Filename": "x.json"})
        self.assertEqual(st, 400)

        st, m = self.call("manifest")
        group = next(x for x in m["courses"] if x["id"] == c["id"])
        self.assertEqual(len(group["quizzes"]), 1)

        self.assertEqual(self.call("courses", "POST", {"name": "x"}, headers={"Origin": "http://evil.example"})[0], 403)


if __name__ == "__main__":
    unittest.main()
