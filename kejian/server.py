"""本地 Web 服务（只监听 127.0.0.1）：静态页面 + JSON API。"""
import http.server
import json
import mimetypes
import os
import re
import socketserver
import tempfile
import threading
import urllib.parse
import webbrowser
from pathlib import Path

from . import ai, config, dictionary, jobs, library, manifest, manual, quiz, studio, userdata

MAX_UPLOAD = 400 * 1024 * 1024
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def _parse_pages(spec, total: int) -> list[int]:
    if spec in (None, "all", "missing"):
        return list(range(1, total + 1))
    if isinstance(spec, list):
        return sorted({int(x) for x in spec if 1 <= int(x) <= total})
    out = set()
    for part in str(spec).split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        elif part:
            out.add(int(part))
    return sorted(n for n in out if 1 <= n <= total)


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "KejianReader"

    def log_message(self, fmt, *args):
        if os.environ.get("KEJIAN_DEBUG"):
            super().log_message(fmt, *args)

    # ------------------------------------------------------------ helpers
    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _text(self, text: str, ctype="text/markdown"):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ApiError(413, "请求太大")
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            raise ApiError(400, "请求格式错误")

    def _same_origin(self):
        """拒绝其它网站发来的写请求（防 CSRF）。"""
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            raise ApiError(403, "forbidden")

    def _static(self, root: Path, rel: str):
        rel = urllib.parse.unquote(rel)
        target = (root / rel).resolve()
        if root.resolve() not in target.parents and target != root.resolve() or not target.is_file():
            return self._json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith(("text/", "application/javascript", "application/json")) else ""))
        self.send_header("Content-Length", str(len(data)))
        # 课件图片内容不变，允许缓存；页面与数据不缓存
        cacheable = target.suffix in (".jpg", ".png", ".woff2")
        self.send_header("Cache-Control", "max-age=86400" if cacheable else "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _dispatch(self, method):
        url = urllib.parse.urlparse(self.path)
        path, qs = url.path, urllib.parse.parse_qs(url.query)
        try:
            if method != "GET":
                self._same_origin()
            if path.startswith("/api/"):
                return self._api(method, path[5:], qs)
            if method != "GET":
                raise ApiError(405, "method not allowed")
            if path.startswith("/library/"):
                return self._static(config.LIBRARY, path[len("/library/"):])
            if path.startswith("/examples/"):
                return self._static(config.EXAMPLES, path[len("/examples/"):])
            if path in ("/", "/index.html") or path.startswith(("/deck/", "/quiz/", "/vocab", "/quizzes", "/course/")):
                return self._static(config.WEB_DIR, "index.html")
            return self._static(config.WEB_DIR, path.lstrip("/"))
        except ApiError as e:
            self._json({"error": str(e)}, e.status)
        except KeyError as e:
            self._json({"error": f"找不到：{e.args[0] if e.args else ''}"}, 404)
        except ValueError as e:
            self._json({"error": str(e)}, 400)
        except PermissionError as e:
            self._json({"error": str(e)}, 403)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    # ------------------------------------------------------------ API
    def _api(self, method, route, qs):
        parts = [p for p in route.split("/") if p]

        if parts == ["decks"] and method == "GET":
            return self._json({"decks": library.list_decks()})

        if parts == ["import"] and method == "POST":
            return self._import()

        if len(parts) >= 2 and parts[0] == "decks":
            deck_id = urllib.parse.unquote(parts[1])
            rest = parts[2:]
            if not rest and method == "GET":
                deck = library.get_deck(deck_id)
                deck["jobs"] = jobs.active_for(deck_id)
                deck["has_pdf"] = (library.deck_dir(deck_id) / "source.pdf").is_file()
                return self._json(deck)
            if not rest and method == "PUT":
                body = self._body_json()
                if body.get("title"):
                    library.rename(deck_id, str(body["title"]))
                if "course" in body:
                    library.set_course(deck_id, userdata.check_course(body["course"]))
                return self._json({"ok": True})
            if rest == ["marks"] and method == "GET":
                return self._json(userdata.load_marks(deck_id))
            if len(rest) == 2 and rest[0] == "marks" and method in ("PUT", "DELETE"):
                userdata.save_page_marks(deck_id, int(rest[1]), self._body_json() if method == "PUT" else None)
                return self._json({"ok": True})
            if rest == ["export"] and method == "GET":
                return self._text(manifest.export_deck(deck_id))
            if not rest and method == "DELETE":
                library.delete(deck_id)
                return self._json({"ok": True})
            if rest == ["notes"] and method == "GET":
                return self._json(library.load_notes(library.deck_dir(deck_id)))
            if len(rest) == 2 and rest[0] == "notes" and method in ("PUT", "DELETE"):
                n = int(rest[1])
                note = None
                if method == "PUT":
                    note = self._body_json()
                    note = {k: note.get(k) for k in ("t", "s", "p", "k", "tip", "by", "at")}
                library.save_note(deck_id, n, note)
                return self._json({"ok": True})
            if rest == ["prompt"] and method == "POST":          # 网页版模式：生成提示词
                body = self._body_json()
                deck = library.get_deck(deck_id)
                pages = _parse_pages(body.get("pages", "all"), len(deck["pages"]))
                if not pages:
                    raise ApiError(400, "没有选中页面")
                lang = config.load_settings().get("language", "zh")
                return self._json({"pages": pages, "prompt": manual.build_prompt(deck, pages, lang, bool(body.get("with_pdf")))})
            if rest == ["paste"] and method == "POST":           # 网页版模式：解析粘贴回来的回复
                body = self._body_json()
                exp = body.get("pages")
                try:
                    r = manual.save_reply(deck_id, str(body.get("text", "")), exp if isinstance(exp, list) else None,
                                          overwrite=body.get("overwrite", True) is not False)
                except ValueError as e:
                    raise ApiError(400, str(e)) from e
                return self._json(r)
            if rest == ["generate"] and method == "POST":
                body = self._body_json()
                total = len(library.get_deck(deck_id)["pages"])
                pages = _parse_pages(body.get("pages", "missing"), total)
                try:
                    job = jobs.start_generate(deck_id, pages, overwrite=bool(body.get("overwrite")))
                except ValueError as e:
                    raise ApiError(400, str(e)) from e
                return self._json(jobs.public(job))

        if parts == ["manifest"] and method == "GET":
            return self._json(manifest.manifest())

        # ---- 讲解 → 题库 → 单词本（studio.py）
        if len(parts) == 3 and parts[0] == "studio" and parts[1] in ("quiz", "words") and method == "POST":
            return self._studio(parts[1], parts[2], self._body_json())
        if parts == ["vocab", "collect"] and method == "POST":
            b = self._body_json()
            try:
                r = studio.collect_from_notes(str(b["deck"])) if b.get("deck") else studio.collect_from_quiz(str(b.get("quiz", "")))
            except ValueError as e:
                raise ApiError(400, str(e)) from e
            return self._json(r)
        if parts == ["vocab", "where"] and method == "GET":
            # 每个词只在它自己那门课的课件和题库里找（没分课程的词在全部里找）
            want = (qs.get("course") or [""])[0] or None
            groups = {}
            for v in userdata.load_vocab():
                if not want or v.get("course") == want:
                    groups.setdefault(v.get("course") or None, []).append(v["w"])
            out = {}
            for c, ws in groups.items():
                out.update(studio.where(ws, c))
            return self._json(out)
        if len(parts) == 3 and parts[0] == "decks" and parts[2] == "vocab" and method == "GET":
            return self._json({"words": studio.deck_words(urllib.parse.unquote(parts[1]))})

        # ---- 课程
        if parts == ["courses"]:
            if method == "POST":
                b = self._body_json()
                return self._json(userdata.add_course(str(b.get("name", "")), str(b.get("code", "")),
                                                      str(b.get("color", "")), str(b.get("desc", ""))))
            return self._json({"courses": userdata.list_courses()})
        if len(parts) == 2 and parts[0] == "courses":
            cid = urllib.parse.unquote(parts[1])
            if method == "PUT":
                return self._json(userdata.update_course(cid, self._body_json()))
            if method == "DELETE":
                userdata.get_course(cid)
                userdata.delete_course(cid)
                return self._json({"ok": True})

        # ---- 题库
        if parts == ["quizzes"] and method == "GET":
            return self._json({"quizzes": quiz.list_quizzes()})
        if parts == ["quizzes", "import"] and method == "POST":
            return self._import_quiz()
        if len(parts) >= 2 and parts[0] == "quizzes":
            qid = urllib.parse.unquote(parts[1])
            rest = parts[2:]
            if not rest and method == "GET":
                return self._json(quiz.get_quiz(qid))
            if not rest and method == "PUT":
                b = self._body_json()
                quiz.quiz_path(qid)
                quiz.update_meta(qid, title=b.get("title"),
                                 course=userdata.check_course(b["course"]) if "course" in b else "__keep__")
                return self._json({"ok": True})
            if not rest and method == "DELETE":
                quiz.delete_quiz(qid)
                return self._json({"ok": True})
            if rest == ["answer"] and method == "POST":
                b = self._body_json()
                q = quiz.get_quiz(qid)
                item = next((x for x in q["questions"] if x["n"] == int(b["n"])), None)
                if not item:
                    raise ApiError(404, "题目不存在")
                a = b.get("a")
                userdata.record_answer(qid, item["n"], None if a is None else int(a),
                                       None if a is None else int(a) == item["ans"])
                return self._json({"ok": True})
            if rest == ["reset"] and method == "POST":
                b = self._body_json()
                quiz.quiz_path(qid)
                userdata.reset_progress(qid, [int(x) for x in b["only"]] if isinstance(b.get("only"), list) else None)
                return self._json({"ok": True})
            if rest == ["migrate"] and method == "POST":
                q = quiz.get_quiz(qid)
                userdata.import_progress(qid, self._body_json().get("answers") or {}, q["questions"])
                return self._json({"ok": True})
            if rest == ["export"] and method == "GET":
                return self._text(quiz.export_markdown(qid))

        # ---- 单词本
        if parts == ["vocab"]:
            if method == "POST":
                return self._json(userdata.add_word(self._body_json()))
            words = userdata.load_vocab()
            return self._json({"words": words, "stats": userdata.vocab_stats(words)})
        if parts == ["vocab", "export"] and method == "GET":
            return self._text(manifest.export_vocab())
        if parts == ["vocab", "migrate"] and method == "POST":
            n = 0
            for v in self._body_json().get("words") or []:
                if isinstance(v, dict) and v.get("w"):
                    userdata.add_word({"w": v["w"], "m": v.get("m"), "uk": v.get("uk"), "src": v.get("src") or []})
                    n += 1
            return self._json({"ok": True, "imported": n})
        if len(parts) >= 2 and parts[0] == "vocab":
            w = urllib.parse.unquote(parts[1])
            if len(parts) == 3 and parts[2] == "review" and method == "POST":
                return self._json(userdata.review_word(w, str(self._body_json().get("grade", ""))))
            if len(parts) == 2 and method == "PUT":
                return self._json(userdata.update_word(w, self._body_json()))
            if len(parts) == 2 and method == "DELETE":
                userdata.delete_word(w)
                return self._json({"ok": True})

        if len(parts) == 2 and parts[0] == "jobs":
            job = jobs.get(parts[1])
            if not job:
                raise ApiError(404, "任务不存在")
            if method == "DELETE":
                jobs.cancel(parts[1])
            return self._json(jobs.public(job))

        if parts == ["settings"]:
            if method == "PUT":
                body = self._body_json()
                patch = {k: v for k, v in body.items() if k in config.DEFAULTS and k != "api_key"}
                if body.get("api_key"):
                    patch["api_key"] = str(body["api_key"]).strip()
                if body.get("clear_key"):
                    patch["api_key"] = ""
                return self._json(self._settings(config.save_settings(patch)))
            return self._json(self._settings())

        if parts == ["settings", "test"] and method == "POST":
            try:
                return self._json({"ok": True, "message": ai.test_connection(config.load_settings())})
            except ai.AIError as e:
                return self._json({"ok": False, "message": str(e)})

        if parts == ["dict"] and method == "GET":
            q = (qs.get("q") or [""])[0]
            if not q.strip():
                raise ApiError(400, "empty")
            try:
                return self._json(dictionary.lookup(q))
            except Exception as e:  # noqa: BLE001
                return self._json({"error": str(e)}, 502)

        raise ApiError(404, "not found")

    def _studio(self, kind, action, b):
        """POST /api/studio/<quiz|words>/<prompt|save|run>"""
        decks = [str(x) for x in (b.get("decks") or ([b["deck"]] if b.get("deck") else []))]
        if not decks:
            raise ApiError(400, "没有选择课件")
        for d in decks:
            library.deck_dir(d)
        count = max(3, min(60, int(b.get("count") or (10 if kind == "quiz" else 20))))
        if kind == "quiz":
            prompt = lambda: studio.quiz_prompt(decks, count, str(b.get("focus") or ""))
            save = lambda text: studio.save_quiz_reply(text, decks, b.get("course") or None, b.get("title") or None)
        else:
            total = len(library.get_deck(decks[0])["pages"])
            pages = _parse_pages(b["pages"], total) if b.get("pages") else None
            prompt = lambda: studio.words_prompt(decks[0], count, pages)
            save = lambda text: studio.save_words_reply(text, decks[0])
        try:
            if action == "prompt":
                return self._json({"prompt": prompt()})
            if action == "save":
                return self._json(save(str(b.get("text", ""))))
            if action == "run":
                return self._json(jobs.public(jobs.start_task(kind, prompt(), save)))
        except (ValueError, KeyError) as e:
            raise ApiError(400, str(e).strip("'")) from e
        raise ApiError(404, "not found")

    @staticmethod
    def _settings(s=None):
        out = config.public_settings(s)
        out["claude_cli"] = bool(ai.find_claude_cli())
        return out

    def _import(self):
        name = urllib.parse.unquote(self.headers.get("X-Filename") or "upload.pdf")
        name = Path(name).name
        title = urllib.parse.unquote(self.headers.get("X-Title") or "") or None
        ext = Path(name).suffix.lower()
        if ext not in (".pptx", ".ppt", ".pdf", ".odp", ".key"):
            raise ApiError(400, "只支持 .pptx / .ppt / .pdf")
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= MAX_UPLOAD:
            raise ApiError(413, "文件为空或超过 400 MB")
        fd, tmp = tempfile.mkstemp(suffix=ext, prefix="kejian-")
        with os.fdopen(fd, "wb") as f:
            left = n
            while left:
                chunk = self.rfile.read(min(left, 1 << 20))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)
        job = jobs.start_import(Path(tmp), original_name=name, title=title)
        return self._json(jobs.public(job))

    def _import_quiz(self):
        """上传题库：AI 写好的 .json，或选择题 .pptx（备注里写 Answer: X）。"""
        name = Path(urllib.parse.unquote(self.headers.get("X-Filename") or "quiz.json")).name
        course = userdata.check_course(urllib.parse.unquote(self.headers.get("X-Course") or "") or None)
        ext = Path(name).suffix.lower()
        if ext not in (".json", ".pptx"):
            raise ApiError(400, "题库只支持 .json 或 .pptx")
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= 50 * 1024 * 1024:
            raise ApiError(413, "文件为空或超过 50 MB")
        data = self.rfile.read(n)
        fd, tmp = tempfile.mkstemp(suffix=ext, prefix="kejian-quiz-")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            title = Path(name).stem
            try:
                if ext == ".json" and json.loads(data.decode("utf-8-sig")).get("title"):
                    title = None
                qid = quiz.import_json(Path(tmp), title=title, course=course) if ext == ".json" else quiz.import_pptx(Path(tmp), title=title, course=course)
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                if isinstance(e, UnicodeDecodeError):
                    raise ApiError(400, "JSON 文件要用 UTF-8 编码") from e
                raise ApiError(400, f"JSON 格式错误：第 {e.lineno} 行 {e.msg}") from e
            except ValueError as e:
                raise ApiError(400, str(e)) from e
        finally:
            os.unlink(tmp)
        return self._json({"id": qid, "count": len(quiz.get_quiz(qid)["questions"])})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(port: int = 8770, open_browser: bool = True):
    config.LIBRARY.mkdir(parents=True, exist_ok=True)
    srv = None
    for p in range(port, port + 20):
        try:
            srv = Server(("127.0.0.1", p), Handler)
            break
        except OSError:
            continue
    if srv is None:
        raise SystemExit(f"端口 {port}-{port + 19} 都被占用了，请用 --port 指定其它端口")
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"Lecta 课读已启动：{url}\n课件库位置：{config.LIBRARY}\n按 Ctrl+C 退出")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")
