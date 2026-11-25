"""核心流程测试：python -m unittest discover -s tests -v

不依赖网络和 AI Key：导入用脚本现场生成的 PDF，讲解用离线提纲引擎和本地假接口。
"""
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import zipfile
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = tempfile.mkdtemp(prefix="kejian-test-")
os.environ["KEJIAN_LIBRARY"] = TMP                       # 必须在导入 kejian 之前
os.environ["KEJIAN_CONFIG"] = str(Path(TMP) / "config.json")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from kejian import ai, config, importer, library, manual, server  # noqa: E402
import make_demo_pdf  # noqa: E402


def _demo_pdf() -> Path:
    p = Path(TMP) / "Demo Deck.pdf"
    if not p.exists():
        make_demo_pdf.main(str(p))
    return p


class ImportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck_id = importer.import_file(_demo_pdf(), title="Demo")
        cls.d = library.deck_dir(cls.deck_id)

    def test_files(self):
        for name in ("deck.json", "words.json", "notes.json", "pages/001.jpg", "thumbs/005.jpg"):
            self.assertTrue((self.d / name).is_file(), name)

    def test_pages_and_titles(self):
        deck = json.loads((self.d / "deck.json").read_text(encoding="utf-8"))
        self.assertEqual(len(deck["pages"]), 5)
        self.assertEqual(deck["pages"][1]["title"], "The Law of Demand")

    def test_words_have_spacing(self):
        words = json.loads((self.d / "words.json").read_text(encoding="utf-8"))
        joined = "".join(w[4] for w in words[1])
        self.assertIn("Ceteris paribus, when the price", joined)
        x0, y0, x1, y1 = words[1][0][:4]
        self.assertLess(x0, x1)
        self.assertLess(y0, y1)

    def test_outline_engine(self):
        note = ai.generate_page(self.deck_id, 2, {"provider": "outline"})
        self.assertEqual(note["t"], "The Law of Demand")
        self.assertFalse(any("demo deck" in p for p in note["p"]), "页脚不应出现在提纲里")
        self.assertNotEqual(note["s"], "DEMAND")

    def test_save_and_list(self):
        library.save_note(self.deck_id, 1, {"t": "x", "s": "", "p": [], "k": [], "tip": ""})
        summ = next(d for d in library.list_decks() if d["id"] == self.deck_id)
        self.assertEqual(summ["noted"], 1)
        self.assertIsInstance(library.get_deck(self.deck_id)["pages"], list)

    def test_rejects_bad_type(self):
        bad = Path(TMP) / "x.txt"
        bad.write_text("hi")
        with self.assertRaises(importer.ImportError_):
            importer.import_file(bad)


class HelpersTest(unittest.TestCase):
    def test_parse_pages(self):
        self.assertEqual(server._parse_pages("1-3,5", 10), [1, 2, 3, 5])
        self.assertEqual(server._parse_pages("missing", 3), [1, 2, 3])
        self.assertEqual(server._parse_pages([2, 99], 5), [2])

    def test_normalize(self):
        n = ai._normalize({"title": "T", "gist": "G", "tip": "",
                           "points": [{"text": "a", "level": 1}, {"text": "b", "level": 2}],
                           "terms": [{"term": "x", "meaning": "y", "note": ""}]}, "test")
        self.assertEqual(n["p"], ["a", "　• b"])
        self.assertEqual(n["k"], [["x", "y", ""]])

    def test_parse_json_fenced(self):
        self.assertEqual(ai._parse_json('```json\n{"a": 1}\n```'), {"a": 1})

    def test_speaker_notes(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("ppt/presentation.xml", '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst>')
            z.writestr("ppt/_rels/presentation.xml.rels",
                       '<Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/>')
            z.writestr("ppt/slides/slide1.xml", "<p:sld/>")
            z.writestr("ppt/slides/slide2.xml", "<p:sld/>")
            z.writestr("ppt/slides/_rels/slide1.xml.rels", '<Relationship Target="../notesSlides/notesSlide1.xml"/>')
            z.writestr("ppt/notesSlides/notesSlide1.xml", "<a:p><a:r><a:t>Hello &amp; welcome</a:t></a:r></a:p>")
        p = Path(TMP) / "n.pptx"
        p.write_bytes(buf.getvalue())
        self.assertEqual(importer.speaker_notes(p), ["Hello & welcome", ""])


class WebModeTest(unittest.TestCase):
    """网页版（复制粘贴）模式：提示词与回复解析。"""

    @classmethod
    def setUpClass(cls):
        cls.deck_id = importer.import_file(_demo_pdf(), title="Web")

    def test_prompt(self):
        deck = library.get_deck(self.deck_id)
        p = manual.build_prompt(deck, [2, 3], "zh", with_pdf=True)
        self.assertIn("===== 第 2 页 =====", p)
        self.assertIn("===== 第 3 页 =====", p)
        self.assertNotIn("===== 第 4 页 =====", p)
        self.assertIn("```json", p)
        self.assertIn("PDF", p)
        self.assertEqual(manual.batches(42, 8)[-1], [41, 42])

    def test_parse_full_and_truncated(self):
        reply = ('好的，下面是讲解：\n```json\n[{"page": 2, "title": "需求定律", "gist": "价格升需求降", '
                 '"points": [{"text": "a", "level": 1}, "b"], "terms": [["demand", "需求"]], "tip": ""},\n'
                 ' {"page": "第3页", "title": "需求曲线移动", "gist": "g", "points": [], "terms": [], "tip": "t"},\n'
                 ' {"page": 4, "title": "被截断')            # 最后一页被截断，没有收尾
        r = manual.parse_reply(reply, 5, [2, 3, 4])
        self.assertEqual(sorted(r["notes"]), [2, 3])
        self.assertEqual(r["missing"], [4])
        self.assertEqual(r["notes"][2]["k"], [["demand", "需求", ""]])
        self.assertEqual(r["notes"][2]["p"], ["a", "b"])

    def test_parse_two_replies_pasted_together(self):
        a = '```json\n[{"page": 1, "title": "A", "gist": "", "points": ["x"], "terms": [], "tip": ""}]\n```'
        b = '继续：\n```json\n[{"page": 2, "title": "B", "gist": "", "points": ["y"], "terms": [], "tip": ""}]\n```'
        r = manual.parse_reply(a + "\n\n" + b, 5, [1, 2])
        self.assertEqual(sorted(r["notes"]), [1, 2])

    def test_save_reply(self):
        reply = '[{"page": 5, "title": "弹性", "gist": "g", "points": ["p"], "terms": [], "tip": ""}]'
        r = manual.save_reply(self.deck_id, reply, [5])
        self.assertEqual(r["saved"], [5])
        self.assertEqual(library.load_notes(library.deck_dir(self.deck_id))["5"]["by"], manual.BY)
        with self.assertRaises(ValueError):
            manual.save_reply(self.deck_id, "抱歉，我无法完成", [1])

    def test_web_mode_refuses_auto_job(self):
        from kejian import jobs
        config.save_settings({"provider": "web"})
        with self.assertRaises(ValueError):
            jobs.start_generate(self.deck_id, [1])


class ClaudeCliTest(unittest.TestCase):
    """用一个假的 claude 可执行文件验证 Claude Code 引擎的调用与解析。"""

    def test_fake_cli(self):
        deck_id = importer.import_file(_demo_pdf())
        fake = Path(TMP) / "fakeclaude.py"
        fake.write_text(
            "import sys, json\n"
            "args = sys.argv[1:]; prompt = sys.stdin.read()\n"
            "assert '-p' in args and '--json-schema' in args\n"
            "assert 'Market Equilibrium' in prompt\n"
            "print(json.dumps({'type': 'result', 'is_error': False, 'result': '',\n"
            "  'structured_output': {'title': 'T', 'gist': 'G', 'points': [], 'terms': [], 'tip': ''},\n"
            "  'modelUsage': {'claude-sonnet-5-5': {}}}))\n", encoding="utf-8")
        orig = ai.find_claude_cli
        import subprocess
        real_run = subprocess.run
        ai.find_claude_cli = lambda: "FAKE"
        subprocess.run = lambda cmd, **kw: real_run([sys.executable, str(fake), *cmd[1:]], **kw)
        try:
            note = ai.generate_page(deck_id, 4, {"provider": "claude-cli", "send_images": False})
        finally:
            ai.find_claude_cli = orig
            subprocess.run = real_run
        self.assertEqual(note["t"], "T")
        self.assertEqual(note["by"], "Claude Code · claude-sonnet-5-5")

    def test_login_error_is_friendly(self):
        import subprocess
        real_run = subprocess.run
        out = json.dumps({"is_error": True, "result": "Failed to authenticate: OAuth session expired"})
        orig = ai.find_claude_cli
        ai.find_claude_cli = lambda: "FAKE"
        subprocess.run = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, out, "")
        try:
            with self.assertRaises(ai.AIError) as cm:
                ai.test_connection({"provider": "claude-cli"})
        finally:
            ai.find_claude_cli = orig
            subprocess.run = real_run
        self.assertEqual(str(cm.exception), ai.CLI_LOGIN)


class FakeOpenAICompatTest(unittest.TestCase):
    """用本地假接口验证 OpenAI 兼容引擎的请求与解析。"""

    def test_roundtrip(self):
        try:
            import openai  # noqa: F401
        except ImportError:
            self.skipTest("openai 未安装")
        note = {"title": "标题", "gist": "核心", "points": [{"text": "p", "level": 1}], "terms": [], "tip": "t"}
        seen = {}

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                seen["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                out = json.dumps({"id": "1", "object": "chat.completion", "created": 0, "model": "m",
                                  "choices": [{"index": 0, "finish_reason": "stop",
                                               "message": {"role": "assistant", "content": json.dumps(note)}}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        deck_id = importer.import_file(_demo_pdf())
        try:
            r = ai.generate_page(deck_id, 4, {"provider": "deepseek", "model": "m", "api_key": "k",
                                              "base_url": f"http://127.0.0.1:{srv.server_address[1]}/v1", "send_images": True})
        finally:
            srv.shutdown()
            srv.server_close()
        self.assertEqual(r["t"], "标题")
        self.assertEqual(seen["body"]["response_format"]["type"], "json_schema")
        self.assertIn("Market Equilibrium", json.dumps(seen["body"], ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
