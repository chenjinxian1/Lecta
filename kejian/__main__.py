"""命令行入口（AI 也用这些命令管理课件库，详见 AI_GUIDE.md）。

  python -m kejian                                 启动网页（默认）
  python -m kejian serve --port 8770               指定端口
  python -m kejian import 课件.pptx --course econ101   导入课件（可直接放进某门课）
  python -m kejian quiz 题目.pptx|题目.json --course econ101   导入题库（PPT 或 AI 写好的 JSON）
  python -m kejian course list | add 名称 [--code] | assign 课程ID 课件或题库ID...
  python -m kejian list [--json]                   列出课件库
  python -m kejian manifest                        整个课件库结构（JSON）
  python -m kejian export <课件ID|题库ID|vocab>      导出成 Markdown（给 AI 阅读）
  python -m kejian check                           自检课件库
  python -m kejian generate <课件ID> --pages 1-5 --overwrite

  给 AI 助手（Claude Code / Codex…）用：自己当“AI”，写好 JSON 再存进来
  python -m kejian prompt notes|quiz|words <课件ID…>    打印提示词（写作要求 + 课件文字 + 输出格式）
  python -m kejian save   notes|quiz|words <课件ID…> --file 回复.json
  python -m kejian vocab list | add | collect | where     单词本
  python -m kejian doctor                                  检查环境（Python、依赖、PPT 转换、Claude Code）
  python -m kejian config [键 [值]]                        查看 / 修改设置（如 language zh|en）
"""
import argparse
import json
import sys
import time
from pathlib import Path

from . import __version__, ai, config, importer, jobs, library, manifest, manual, quiz, server, studio, userdata


def _bar(done, total, msg):
    width = 28
    fill = int(width * done / total) if total else 0
    sys.stdout.write(f"\r[{'#' * fill}{'.' * (width - fill)}] {msg:<40}")
    sys.stdout.flush()


def _course_arg(ap, cid):
    if not cid:
        return None
    try:
        return userdata.check_course(cid)
    except KeyError:
        ap.error(f"课程 {cid!r} 不存在。先运行：python -m kejian course list / course add 名称")


def _kind(item_id: str) -> str:
    try:
        library.deck_dir(item_id)
        return "deck"
    except KeyError:
        pass
    try:
        quiz.quiz_path(item_id)
        return "quiz"
    except KeyError:
        return ""


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(prog="kejian", description="Lecta 课读：导入课件、AI 生成讲解、划词查词、刷题、背单词")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd")

    s = sub.add_parser("serve", help="启动网页（默认命令）")
    s.add_argument("--port", type=int, default=8770)
    s.add_argument("--no-browser", action="store_true")

    i = sub.add_parser("import", help="导入 .pptx / .ppt / .pdf 课件")
    i.add_argument("file")
    i.add_argument("--title")
    i.add_argument("--course", help="放进哪门课（课程 ID）")

    g = sub.add_parser("generate", help="为课件生成讲解")
    g.add_argument("deck", help="课件 ID（见 list）")
    g.add_argument("--pages", default="missing", help="例如 1-5,8；默认只生成还没有讲解的页")
    g.add_argument("--overwrite", action="store_true", help="覆盖已有讲解")

    ls = sub.add_parser("list", help="列出课程、课件和题库")
    ls.add_argument("--json", action="store_true", help="输出 JSON（同 manifest）")

    q = sub.add_parser("quiz", help="导入题库：选择题 PPT（备注写 Answer: X）或按 AI_GUIDE.md 格式写的 JSON")
    q.add_argument("file")
    q.add_argument("--title")
    q.add_argument("--course", help="放进哪门课（课程 ID）")
    q.add_argument("--check", action="store_true", help="只校验 JSON，不导入")

    c = sub.add_parser("course", help="管理课程")
    csub = c.add_subparsers(dest="ccmd")
    csub.add_parser("list", help="列出课程")
    ca = csub.add_parser("add", help="新建课程")
    ca.add_argument("name")
    ca.add_argument("--code", default="", help="课程代码，例如 ECON101")
    ca.add_argument("--id", default="", help="自定义课程 ID（默认由代码或名称生成）")
    ca.add_argument("--color", default="")
    ca.add_argument("--desc", default="")
    cs = csub.add_parser("assign", help="把课件 / 题库放进某门课（课程 ID 写 none 表示移出）")
    cs.add_argument("course")
    cs.add_argument("items", nargs="+", help="课件 ID 或题库 ID")

    sub.add_parser("manifest", help="输出整个课件库结构（JSON，给 AI 读）")
    ex = sub.add_parser("export", help="导出成 Markdown：课件 ID / 题库 ID / vocab")
    ex.add_argument("item")
    ex.add_argument("--out", help="写入文件（默认打印）")
    sub.add_parser("check", help="自检课件库（坏引用、题库格式错误）")

    pr = sub.add_parser("prompt", help="打印给 AI 的提示词：notes 讲解 / quiz 出题 / words 提取生词")
    pr.add_argument("kind", choices=["notes", "quiz", "words"])
    pr.add_argument("ids", nargs="+", help="课件 ID（quiz 可以给多份课件）")
    pr.add_argument("--pages", default="", help="页码范围，如 1-8；notes 默认 missing（还没有讲解的页）")
    pr.add_argument("--count", type=int, default=0, help="题数 / 生词数")
    pr.add_argument("--focus", default="", help="出题侧重点，如“计算题”“容易混淆的概念”")
    pr.add_argument("--out", help="写入文件（默认打印）")

    sv = sub.add_parser("save", help="把 AI 写好的回复（JSON）存进课件库")
    sv.add_argument("kind", choices=["notes", "quiz", "words"])
    sv.add_argument("ids", nargs="+", help="课件 ID（和 prompt 时一样）")
    sv.add_argument("--file", required=True, help="回复文件；- 表示从标准输入读")
    sv.add_argument("--course", help="quiz：放进哪门课（默认跟课件同一门课）")
    sv.add_argument("--title", help="quiz：题库名称")
    sv.add_argument("--keep", action="store_true", help="notes：已有讲解的页不覆盖")

    vb = sub.add_parser("vocab", help="单词本：list / add / collect / where")
    vsub = vb.add_subparsers(dest="vcmd")
    vl = vsub.add_parser("list", help="列出单词")
    vl.add_argument("--course")
    vl.add_argument("--due", action="store_true", help="只看到期该复习的")
    vl.add_argument("--json", action="store_true")
    va = vsub.add_parser("add", help="加入一个词（已存在就合并出处、补全释义）")
    va.add_argument("word")
    va.add_argument("--m", default="", help="中文释义")
    va.add_argument("--d", default="", help="英文释义")
    va.add_argument("--note", default="")
    va.add_argument("--course")
    va.add_argument("--deck", help="出处课件 ID")
    va.add_argument("--page", type=int)
    va.add_argument("--quiz", help="出处题库 ID")
    va.add_argument("--n", type=int, help="题号")
    va.add_argument("--ctx", default="", help="原句")
    vc = vsub.add_parser("collect", help="把课件讲解 / 题目里的关键术语收进单词本（不用 AI）")
    vc.add_argument("item", help="课件 ID 或题库 ID")
    vw = vsub.add_parser("where", help="这个词出现在哪些课件页、哪些题里")
    vw.add_argument("word")
    vw.add_argument("--course")

    sub.add_parser("doctor", help="检查运行环境")
    cf = sub.add_parser("config", help="查看 / 修改设置（API Key 不在这里显示）")
    cf.add_argument("key", nargs="?")
    cf.add_argument("value", nargs="?")

    a = ap.parse_args(argv)
    cmd = a.cmd or "serve"

    if cmd == "serve":
        server.serve(port=getattr(a, "port", 8770), open_browser=not getattr(a, "no_browser", False))
    elif cmd == "import":
        course = _course_arg(ap, a.course)
        p = Path(a.file)
        if not p.is_file():
            ap.error(f"找不到文件：{p}")
        try:
            deck_id = importer.import_file(p, title=a.title, progress=_bar)
        except importer.ImportError_ as e:
            print(f"\n导入失败：{e}")
            return 1
        if course:
            library.set_course(deck_id, course)
        print(f"\n已导入：{deck_id}" + (f"（课程 {course}）" if course else ""))
    elif cmd == "list":
        m = manifest.manifest()
        if a.json:
            print(json.dumps(m, ensure_ascii=False, indent=2))
            return 0
        groups = [(f"{c['name']}  [{c['id']}]", c["decks"], c["quizzes"]) for c in m["courses"]]
        groups.append(("未分类", m["unassigned"]["decks"], m["unassigned"]["quizzes"]))
        for title, decks, quizzes in groups:
            if not decks and not quizzes and title == "未分类":
                continue
            print(f"\n■ {title}")
            for d in decks:
                tag = "  [示例]" if d["example"] else ""
                print(f"  课件 {d['id']:<46} 讲解 {d['noted']:>3}/{d['pages']:<3} {d['title']}{tag}")
            for z in quizzes:
                st = z["stats"]
                print(f"  题库 {z['id']:<46} {z['count']} 题，对 {st['right']} 错 {st['wrong']}  {z['title']}")
        v = m["vocab"]
        print(f"\n单词本：{v['total']} 个，待复习 {v['due']}")
    elif cmd == "manifest":
        print(json.dumps(manifest.manifest(), ensure_ascii=False, indent=2))
    elif cmd == "export":
        if a.item == "vocab":
            text = manifest.export_vocab()
        else:
            kind = _kind(a.item)
            if not kind:
                ap.error(f"找不到课件或题库：{a.item}")
            text = manifest.export_deck(a.item) if kind == "deck" else quiz.export_markdown(a.item)
        if a.out:
            Path(a.out).write_text(text, encoding="utf-8")
            print(f"已写入 {a.out}")
        else:
            print(text)
    elif cmd == "check":
        problems = manifest.check()
        for p in problems:
            print("  ✗ " + p)
        print("课件库没有发现问题 ✓" if not problems else f"共 {len(problems)} 个问题")
        return 1 if problems else 0
    elif cmd == "course":
        if a.ccmd == "add":
            try:
                cobj = userdata.add_course(a.name, a.code, a.color, a.desc, a.id)
            except ValueError as e:
                ap.error(str(e))
            print(f"已新建课程：{cobj['id']}  {cobj['name']}")
        elif a.ccmd == "assign":
            course = None if a.course.lower() == "none" else _course_arg(ap, a.course)
            for item in a.items:
                kind = _kind(item)
                if kind == "deck":
                    library.set_course(item, course)
                elif kind == "quiz":
                    quiz.set_course(item, course)
                else:
                    print(f"  ✗ 找不到 {item}")
                    continue
                print(f"  {'课件' if kind == 'deck' else '题库'} {item} → {course or '未分类'}")
        else:
            for cobj in userdata.list_courses():
                print(f"{cobj['id']:<20} {cobj.get('code', ''):<10} {cobj['name']}")
    elif cmd == "quiz":
        course = _course_arg(ap, a.course)
        p = Path(a.file)
        if not p.is_file():
            ap.error(f"找不到文件：{p}")
        try:
            if p.suffix.lower() == ".json":
                if a.check:
                    _, errs = quiz.validate(json.loads(p.read_text(encoding="utf-8")))
                    print("格式正确 ✓" if not errs else "\n".join("  ✗ " + e for e in errs))
                    return 1 if errs else 0
                qid = quiz.import_json(p, title=a.title, course=course)
            else:
                qid = quiz.import_pptx(p, title=a.title, course=course)
        except (ValueError, OSError) as e:
            print(f"导入失败：{e}")
            return 1
        print(f"已导入题库：{qid}（{len(quiz.get_quiz(qid)['questions'])} 题）" + (f"，课程 {course}" if course else ""))
    elif cmd == "prompt":
        return _prompt(ap, a)
    elif cmd == "save":
        return _save(ap, a)
    elif cmd == "vocab":
        return _vocab(ap, a)
    elif cmd == "doctor":
        return _doctor()
    elif cmd == "config":
        return _config(ap, a)
    elif cmd == "generate":
        deck = library.get_deck(a.deck)
        pages = server._parse_pages(a.pages, len(deck["pages"]))
        s = config.load_settings()
        print(f"引擎：{ai.engine_of(s)}  模型：{s.get('model') or '-'}")
        job = jobs.start_generate(a.deck, pages, overwrite=a.overwrite)
        while job["status"] == "running":
            _bar(job["done"], job["total"] or 1, job["message"])
            time.sleep(0.5)
        _bar(job["done"], job["total"] or 1, job["message"])
        print()
        for e in job["errors"]:
            print(f"  第 {e['page']} 页失败：{e['error']}")
    return 0



def _decks(ap, ids):
    for i in ids:
        if _kind(i) != "deck":
            ap.error(f"找不到课件：{i}（用 python -m kejian list 查看课件 ID）")
    return ids


def _emit(text, out):
    if out:
        Path(out).write_text(text, encoding="utf-8")
        print(f"已写入 {out}（{len(text):,} 字符）")
    else:
        print(text)


def _pages(ns):
    return ", ".join(map(str, ns)) or "-"


def _prompt(ap, a):
    ids = _decks(ap, a.ids)
    lang = config.load_settings().get("language", "zh")
    if a.kind == "notes":
        deck = library.get_deck(ids[0])
        pages = server._parse_pages(a.pages or "missing", len(deck["pages"]))
        if not pages:
            print("这份课件每一页都已经有讲解了（要重写就加 --pages all）")
            return 0
        text = manual.build_prompt(deck, pages, lang)
        text += f"\n\n（页面图片在 {library.deck_dir(ids[0]).as_posix()}/pages/NNN.jpg，能看图就对照图片写，图表页更准。）"
    elif a.kind == "quiz":
        text = studio.quiz_prompt(ids, a.count or 10, a.focus, lang)
    else:
        total = len(library.get_deck(ids[0])["pages"])
        text = studio.words_prompt(ids[0], a.count or 20, server._parse_pages(a.pages, total) if a.pages else None, lang)
    _emit(text, a.out)
    return 0


def _save(ap, a):
    ids = _decks(ap, a.ids)
    text = sys.stdin.read() if a.file == "-" else Path(a.file).read_text(encoding="utf-8-sig")
    try:
        if a.kind == "notes":
            r = manual.save_reply(ids[0], text, None, overwrite=not a.keep)
            print(f"已保存 {len(r['saved'])} 页讲解：{_pages(r['saved'])}" + (f"；保留原有 {_pages(r['kept'])}" if r["kept"] else ""))
        elif a.kind == "quiz":
            course = _course_arg(ap, a.course) if a.course else None
            r = studio.save_quiz_reply(text, ids, course, a.title)
            print(f"已导入题库：{r['id']}（{r['count']} 题）" + (f"，课程 {r['course']}" if r.get("course") else ""))
        else:
            r = studio.save_words_reply(text, ids[0])
            print(f"单词本：新加 {len(r['added'])} 个，合并 {len(r['merged'])} 个已有的")
            if r["added"]:
                print("  " + ", ".join(r["added"]))
    except ValueError as e:
        print(f"保存失败：{e}")
        return 1
    return 0


def _vocab(ap, a):
    if a.vcmd == "add":
        src = []
        if a.deck:
            src.append({"kind": "deck", "id": a.deck, "page": a.page, "ctx": a.ctx})
        if a.quiz:
            src.append({"kind": "quiz", "id": a.quiz, "n": a.n, "ctx": a.ctx})
        course = _course_arg(ap, a.course) if a.course else None
        if not course and a.deck and _kind(a.deck) == "deck":
            course = library.get_deck(a.deck).get("course")
        v = userdata.add_word({"w": a.word, "m": a.m, "d": a.d, "note": a.note, "course": course, "src": src})
        print(f"已加入：{v['w']}  {v.get('m') or ''} {v.get('d') or ''}".rstrip())
    elif a.vcmd == "collect":
        kind = _kind(a.item)
        if not kind:
            ap.error(f"找不到课件或题库：{a.item}")
        try:
            r = studio.collect_from_notes(a.item) if kind == "deck" else studio.collect_from_quiz(a.item)
        except ValueError as e:
            print(e)
            return 1
        print(f"单词本：新加 {len(r['added'])} 个，合并 {len(r['merged'])} 个已有的")
    elif a.vcmd == "where":
        hits = studio.where([a.word], a.course).get(a.word, [])
        if not hits:
            print("课件和题库里都没有找到")
        for h in hits:
            if h["kind"] == "deck":
                print(f"  课件 {h['id']}  第 {_pages(h['pages'])} 页")
            else:
                print(f"  题库 {h['id']}  第 {_pages(h['n'])} 题")
    else:
        words = userdata.load_vocab()
        if a.course:
            words = [v for v in words if v.get("course") == a.course]
        if a.due:
            now = time.time()
            words = [v for v in words if (v.get("srs") or {}).get("due", 0) <= now]
        if a.json:
            print(json.dumps(words, ensure_ascii=False, indent=2))
            return 0
        for v in words:
            s = v.get("srs") or {}
            print(f"{v['w']:<28} L{s.get('level', 0)} 忘{s.get('lapses', 0)}  {v.get('m') or v.get('d') or ''}")
        print(f"共 {len(words)} 个")
    return 0


def _doctor():
    def ok(b):
        return "✓" if b else "✗"
    print(f"{ok(sys.version_info >= (3, 10))} Python {sys.version.split()[0]}（需要 3.10+）")
    try:
        import fitz
        print(f"✓ PyMuPDF {getattr(fitz, 'VersionBind', '')}")
    except ImportError:
        print("✗ PyMuPDF 未安装：pip install -r requirements.txt")
    conv = importer.converter_name()
    print(f"{'✓' if conv else '·'} PPT 转 PDF：{conv or '没有找到 PowerPoint / LibreOffice（PDF 仍可直接导入）'}")
    cli = ai.find_claude_cli()
    print(f"{'✓' if cli else '·'} Claude Code：{cli or '未安装（可选：用 Claude 订阅在网页里一键生成讲解）'}")
    s = config.load_settings()
    print(f"· 学习语言：{s.get('language', 'zh')}    网页里的 AI 方式：{ai.engine_of(s)}")
    print(f"· 课件库：{config.LIBRARY}")
    m = manifest.manifest()
    nd = sum(len(c["decks"]) for c in m["courses"]) + len(m["unassigned"]["decks"])
    print(f"· {len(m['courses'])} 门课程，{nd} 份课件，单词本 {m['vocab']['total']} 个")
    probs = manifest.check()
    print(f"{ok(not probs)} 课件库自检：" + ("没有问题" if not probs else f"{len(probs)} 个问题（python -m kejian check）"))
    return 0


SAFE_KEYS = ("language", "provider", "model", "base_url", "cli_model", "send_images", "batch", "concurrency", "effort")


def _config(ap, a):
    s = config.load_settings()
    if not a.key:
        for k in SAFE_KEYS:
            print(f"{k:<14} {s.get(k)!r}")
        print(f"{'api_key':<14} {'（已设置）' if s.get('api_key') else '（未设置）'}")
        return 0
    if a.key not in SAFE_KEYS:
        ap.error(f"只能改这些设置：{', '.join(SAFE_KEYS)}（API Key 请在网页的 AI 设置里填）")
    if a.value is None:
        print(s.get(a.key))
        return 0
    val = a.value
    if a.key == "language" and val not in ("zh", "en"):
        ap.error("language 只能是 zh 或 en")
    if isinstance(config.DEFAULTS.get(a.key), bool):
        val = val.lower() in ("1", "true", "yes", "on")
    elif isinstance(config.DEFAULTS.get(a.key), int):
        val = int(val)
    patch = {a.key: val}
    if a.key == "language":
        patch["lang_chosen"] = True
    config.save_settings(patch)
    print(f"{a.key} = {val!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
