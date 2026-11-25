"""命令行入口（AI 也用这些命令管理课件库，详见 AI_GUIDE.md）。

  python -m kejian                                 启动网页（默认）
  python -m kejian serve --port 8770               指定端口
  python -m kejian import 课件.pptx --course ob     导入课件（可直接放进某门课）
  python -m kejian quiz 题目.pptx|题目.json --course ob   导入题库（PPT 或 AI 写好的 JSON）
  python -m kejian course list | add 名称 [--code] | assign 课程ID 课件或题库ID...
  python -m kejian list [--json]                   列出课件库
  python -m kejian manifest                        整个课件库结构（JSON）
  python -m kejian export <课件ID|题库ID|vocab>      导出成 Markdown（给 AI 阅读）
  python -m kejian check                           自检课件库
  python -m kejian generate <课件ID> --pages 1-5 --overwrite
"""
import argparse
import json
import sys
import time
from pathlib import Path

from . import __version__, ai, config, importer, jobs, library, manifest, quiz, server, userdata


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


if __name__ == "__main__":
    sys.exit(main())
