# AI_GUIDE · 给 AI 助手的说明

这份文件写给帮用户管理「Lecta 课读」的 AI（Claude、ChatGPT、Codex 等）。读完它，你应该能：看懂课件库里有什么、
把新课件和题库放进正确的课程、按用户的学习记录（错题、生词、标注）出题和复习。

> 课件和题库受版权保护，只供用户个人学习：**不要上传到网上、不要提交到 git**（`library/` 已在 .gitignore 里）。

---

## 1. 先看全局

在项目根目录（本文件所在目录）运行：

```bash
python -m kejian list            # 人看的：课程 → 课件 / 题库，单词本数量
python -m kejian manifest        # 机器看的：完整 JSON（课程、课件、题库、做题统计、单词本统计）
python -m kejian check           # 自检：坏引用、题库格式错误
```

网页运行时也有同样的 HTTP 接口：`GET http://127.0.0.1:8770/api/manifest`。

### 学习语言（重要）

manifest 顶层的 `"language"` 是用户选的学习语言（首次打开网页时选，之后可在右上角切换；也存在 `config.local.json`）：

| language | 你写的讲解 / 释义 / 解析用什么语言 | 题库里重点填哪些字段 | 单词释义写进 |
|---|---|---|---|
| `zh` | 简体中文，专业术语保留英文 | `q_zh`、`opts_zh`、`exp_zh`（`exp_en` 可选），术语 `[英文, 中文, 补充]` | `m`（中文释义） |
| `en` | 纯英文，不要出现中文 | `exp_en` 必填；不用写 `*_zh`；术语 `[term, English definition, note]` | `d`（English definition） |

不确定时先运行 `python -m kejian manifest` 看 `language`，再按上表写。网页在英文模式下会隐藏所有含中文的释义和解析。

## 2. 读内容（全部导出为 Markdown）

```bash
python -m kejian export <课件ID>    # 每页：标题、页面文字、演讲者备注、讲解、用户自己的标注（重点页 / 笔记 / 高亮）
python -m kejian export <题库ID>    # 每题：题干、选项、答案、解析、用户作答情况（答对 / 答错 / 累计答错次数）
python -m kejian export vocab       # 单词本：释义、出处、复习等级、忘记次数
python -m kejian export <ID> --out 文件.md
```

需要看图（图表页）时，页面图片在 `library/<课件ID>/pages/NNN.jpg`（三位页码）。

**找用户的薄弱点**：题库导出里“答错”“累计答错 N 次”的题；单词本里 `lapses`（忘记次数）高、`level` 低的词；
课件标注里标了 ★ 的页和高亮。

## 3. 课件库结构

```
library/
  _courses.json                 课程列表
  _vocab.json                   单词本
  _quizzes/<题库ID>.json         题库
  _progress/<题库ID>.json        做题记录
  <课件ID>/
    deck.json                   每页 title / text / notes（演讲者备注），以及 "course"
    notes.json                  每页讲解 {"页码": {t, s, p, k, tip}}
    marks.json                  用户标注 {"页码": {star, note, hl:[{text, color, note, rects}]}}
    words.json                  每页单词坐标（划词用，一般不用管）
    pages/NNN.jpg  thumbs/NNN.jpg  source.pdf
```

### 课程 `_courses.json`

```json
{"courses": [{"id": "econ101", "name": "Principles of Microeconomics", "code": "ECON101",
              "color": "#0e5d6f", "desc": "", "created": 1764000000}]}
```

课件和题库属于哪门课，写在它们自己的 `"course"` 字段里（`deck.json` / 题库 JSON）。没有这个字段就是“未分类”。

### 单词条目（`_vocab.json` 里的 `words` 数组）

```json
{"w": "inferior good", "m": "劣等品", "d": "n. a good whose demand falls as income rises", "uk": "", "note": "e.g. instant noodles", "tags": ["Ch.3"], "course": "econ101",
 "src": [{"kind": "deck", "id": "Lecture-3-Supply-and-Demand-sd438e", "page": 3, "ctx": "Income: normal goods rise with income, inferior goods fall."},
         {"kind": "quiz", "id": "ECON101-Practice-…", "n": 2, "ctx": "Instant noodles are an inferior good."}],
 "added": 1764000000, "srs": {"level": 2, "due": 1764100000, "reps": 3, "lapses": 1, "last": 1764000000}}
```

`m` 是中文释义，`d` 是英文释义（English definition）；两个都可以有，网页按学习语言显示其中一个。
`srs.level` 0–7 对应下次复习间隔 0/1/2/4/7/15/30/60 天；level ≥ 5 算“已掌握”。

## 4. 加入新课件

```bash
python -m kejian course list                                   # 看有哪些课程 ID
python -m kejian course add "宏观经济学" --code ECO201 --id eco201   # 没有就新建
python -m kejian import 第3讲.pptx --title "Lecture 3 · Supply and Demand" --course econ101
```

- 支持 .pptx / .ppt / .pdf。PPT 转 PDF 需要本机有 PowerPoint 或 LibreOffice；不行就先另存为 PDF 再导入。
- 导入后得到课件 ID（打印在最后一行）。之后可以让网页里的 AI 讲解功能，或 `python -m kejian generate <课件ID>` 写每页讲解。
- 已有课件换课程：`python -m kejian course assign <课程ID> <课件ID> …`（课程 ID 写 `none` 表示移出）。

## 5. 加入题库（推荐：AI 直接写 JSON）

先写一个 JSON 文件，再校验、导入：

```bash
python -m kejian quiz 题库.json --check                     # 只校验，不导入
python -m kejian quiz 题库.json --course econ101             # 导入
```

最小格式（只有 `questions` 是必需的）：

```json
{
  "title": "ECON101 第 3 讲自测 · 20 题",
  "course": "econ101",
  "chapters": {
    "3": {"title": "Supply and Demand", "title_zh": "第 3 讲 · 供给与需求", "deck": "<第3讲的课件ID>"}
  },
  "questions": [
    {
      "n": 1,
      "chapter": "3",
      "q": "Instant noodles are an inferior good. If consumers' incomes rise, the demand curve for instant noodles will:",
      "opts": ["Shift to the right", "Shift to the left", "Stay the same", "Become perfectly elastic"],
      "ans": "B",
      "page": 3,
      "q_zh": "方便面是劣等品。如果消费者收入上升，方便面的需求曲线会：",
      "opts_zh": ["右移", "左移", "不变", "变成完全弹性"],
      "exp_zh": "劣等品的需求随收入上升而下降，所以整条需求曲线左移……",
      "exp_en": "For an inferior good, demand falls as income rises, so the whole curve shifts left …",
      "terms": [["inferior good", "劣等品", "收入越高买得越少"], ["normal good", "正常品", ""]],
      "why": "一句话英文简析（可选）"
    }
  ]
}
```

字段说明：

| 字段 | 必需 | 说明 |
|---|---|---|
| `q` | ✓ | 英文题干 |
| `opts` | ✓ | 2–8 个选项（数组；也接受 `{"A": "...", "B": "..."}`） |
| `ans` | ✓ | 正确选项：字母 `"B"` 或下标 `1`（0 起） |
| `n` |  | 题号，缺省按顺序 1、2、3… |
| `chapter` |  | 章节键，缺省 `"1"`；对应 `chapters` 里的条目 |
| `page` |  | 这题出自课件第几页（配合 `chapters.<章>.deck`，网页里会出现“看课件”按钮直接跳过去） |
| `q_zh` / `opts_zh` |  | 中文题干 / 选项翻译（`opts_zh` 长度要和 `opts` 一致） |
| `exp_zh` / `exp_en` |  | 中英文详细解析：讲清为什么对、干扰项为什么错 |
| `terms` |  | 关键词 `[英文, 中文, 补充]`，网页里点击可以查词发音 |

写题时请用 `python -m kejian export <课件ID>` 读课件原文，`page` 填真实页码；`--check` 会检查页码是否超出课件页数、`deck` 是否存在。

另一种方式：选择题 PPT（每页一题，题号写 `Q12`，选项 A–D，演讲者备注写 `Answer: B. …`）可以直接
`python -m kejian quiz 练习.pptx --course econ101`，之后再补中文解析（直接编辑 `library/_quizzes/<题库ID>.json`）。

## 6. 直接改文件时的规则

- 所有 JSON 用 UTF-8；改之前先读，改完运行 `python -m kejian check`。
- 不要改 `pages/`、`thumbs/`、`words.json`（由导入程序生成）。
- `_progress/` 和 `_vocab.json` 里的复习记录是用户自己的学习历史，除非用户要求，不要清空。
- 网页打开时也可以通过 HTTP 接口修改（同源请求）：
  - `POST /api/courses`、`PUT /api/decks/<id>` `{"course": "econ101"}`、`PUT /api/quizzes/<id>` `{"course": …}`
  - `POST /api/vocab` `{"w", "m", "d", "src": [...]}`
  - `PUT /api/decks/<id>/marks/<页码>` `{"star", "note", "hl"}`
  - `POST /api/quizzes/import`：请求体是 `.json` / `.pptx` 文件本身，请求头 `X-Filename: 文件名`、`X-Course: 课程ID`
  - `GET /api/vocab`、`POST /api/vocab/<单词>/review` `{"grade": "again|hard|good|easy"}`
