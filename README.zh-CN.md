<p align="center">
  <img src="docs/images/banner.png" alt="Lecta 课读" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

<p align="center">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-0e5d6f">
  <img alt="本地运行" src="https://img.shields.io/badge/%E6%9C%AC%E5%9C%B0-%E8%BF%90%E8%A1%8C-2e7d4f">
  <img alt="无需构建" src="https://img.shields.io/badge/%E5%89%8D%E7%AB%AF-%E6%97%A0%E9%9C%80%E6%9E%84%E5%BB%BA-847e72">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-f3d27a">
</p>

**Lecta 课读**把英文课件变成精读页面：左边看 PPT，右边看 AI 为这一页写的讲解，课件上每个单词点一下就能查。导入 `.pptx` / `.pdf` 之后，可以边读边查词、高亮批注、刷题，再用间隔复习把生词背下来。按课程整理，所有东西都在你自己的电脑上运行。

它是为用英语上课的中文学生做的，所以有两种学习语言：**中文**（中文讲解、中文释义）和 **English**（全英文讲解、英英释义），第一次打开时选，之后随时切换。

<p align="center">
  <img src="docs/images/zh-reader.png" alt="阅读页：左边课件，右边讲解，单词上弹出词典" width="100%">
</p>

## 目录

- [功能](#功能)
- [截图](#截图)
- [快速开始](#快速开始)
- [一门课，全部连在一起](#一门课全部连在一起)
- [讲解怎么生成](#讲解怎么生成)
- [学习语言](#学习语言)
- [单词本与背单词](#单词本与背单词)
- [题库](#题库)
- [读论文](#读论文)
- [给 AI 助手用](#给-ai-助手用)
- [命令行](#命令行)
- [数据、隐私与版权](#数据隐私与版权)
- [项目结构](#项目结构)
- [开发](#开发)
- [计划](#计划)
- [License](#license)

## 功能

| | |
|---|---|
| 📥 **导入课件** | 拖入 `.pptx` / `.ppt` / `.pdf` 即可。自动生成高清页面和缩略图，并记下每个单词的精确位置和演讲者备注。 |
| ✨ **逐页 AI 讲解** | 每页一张讲解卡片：一句话核心、要点、关键术语、考点提示。可以逐页、按范围或整份生成，也能重新生成或手动编辑。 |
| 🔑 **用你已有的 AI** | 不需要 API Key。可以用网页版 ChatGPT / Claude / Kimi（程序写好提示词，你把回复粘贴回来），也可以让 Claude Code、Codex 这类 AI 助手直接在项目文件夹里把活干完。 |
| 🔗 **全部连在一起** | AI 讲解、题库、生词都挂在同一门课下。每道题都能跳回出自的那一页；单词本里的词会在课件上标出下划线，每个词还会列出同一门课里所有用到它的课件页和题目。 |
| 👆 **点词就查** | 在课件上单击一个词或划选一个短语，弹出释义、英式音标和英式真人发音。课件里定义过的术语，优先显示“本课释义”。透明文字层按单词逐个对齐，选区和原文严丝合缝。 |
| 🖍️ **标注** | 标 ★ 重点页、写页面笔记（自动保存）、四色高亮原文并加批注；缩略图上能看到哪些页有标注。 |
| 📝 **题库** | 选择题练习，带解析、关键术语和“跳回课件原页”。可以按“错题”“曾错”“未做”筛选，按章节看正确率。 |
| 📄 **读论文** | 独立的论文库，可以建文件夹收藏。导入 PDF 或填 arXiv 链接；划句就能翻译、问 AI、高亮批注，也能在页面任意位置贴便签。AI 解读按顺序讲清：研究问题、解决思路、整体框架、摘要和引言全文翻译、方法逐节图文详解，以及对框架图的逐块深度解读。 |
| 📚 **单词本** | 收藏时自动记下出处（哪一页课件 / 哪道题）和原句。可以搜索、按课程或熟练度筛选、编辑、导出 CSV。 |
| 🔁 **背单词** | 闪卡复习（空格翻面，1–4 打分）。忘了的 10 分钟后再见，记住的间隔 1 → 2 → 4 → 7 → 15 → 30 → 60 天。 |
| 🌏 **中文 / English** | 每个词同时存中文释义和英文释义，切换语言不用重查。 |
| 🤖 **AI 助手能直接用** | [`AGENTS.md`](AGENTS.md) 教会 Claude Code、Codex 等 AI 助手：安装启动、导入课件、写讲解、出题、整理单词本、找出你的薄弱点。 |
| 🌙 **阅读体验** | 方向键翻页、缩略图导航、可拖动分栏、深色模式、记住阅读进度。 |

## 截图

| | |
|---|---|
| <img src="docs/images/zh-home.png" alt="课程首页"> <br> **课程首页**：课件和题库按课程分组，进度一目了然。 | <img src="docs/images/zh-quiz.png" alt="题库"> <br> **题库**：中文对照、中英解析、关键术语、跳回原页。 |
| <img src="docs/images/zh-words.png" alt="单词本"> <br> **单词本**：每个词从哪来、记得怎么样。 | <img src="docs/images/zh-review.png" alt="背单词"> <br> **背单词**：按遗忘曲线安排复习。 |
| <img src="docs/images/zh-marks.png" alt="我的标注"> <br> **我的标注**：重点页、笔记和高亮。 | <img src="docs/images/dark.png" alt="深色模式"> <br> **深色模式**（English 模式）。 |
| <img src="docs/images/en-reader.png" alt="English 模式"> <br> **English 模式**：英文讲解、英英释义。 | <img src="docs/images/language.png" alt="选择语言"> <br> **第一次打开**：选择学习语言。 |

截图里都是原创的演示课程，不含任何真实课件。

## 快速开始

需要 **Python 3.10 或更高版本**。

```bash
git clone https://github.com/chenjinxian1/Lecta.git
cd Lecta
```

### 方式一：让 AI 帮你装好

如果你用 [Claude Code](https://claude.com/claude-code)、Codex 或其它能运行命令的 AI 助手，在一个空文件夹里打开它，粘贴：

```text
克隆 https://github.com/chenjinxian1/Lecta.git，先读它的 AGENTS.md，然后帮我装好并启动 Lecta。
我的学习语言是中文。新建一门课“微观经济学”（ECON101），把 <你的课件文件夹> 里的课件都导入进去。
然后为每一页写讲解，出 15 道选择题，再帮我整理这门课的生词。
```

AI 助手会自己装好依赖、导入课件，并亲自完成讲解、出题和生词，不需要 API Key。它说好了之后，打开 <http://127.0.0.1:8770> 即可。

只有网页版 ChatGPT / Claude？对它说：*“读一下 https://github.com/chenjinxian1/Lecta/blob/main/llms.txt ，一步步教我在电脑上装好 Lecta。”*

### 方式二：自己安装

**Windows**：双击 `启动.bat`。第一次会自动安装依赖，然后浏览器打开 <http://127.0.0.1:8770>。

**macOS / Linux**：运行 `./start.sh`，或者手动：

```bash
pip install -r requirements.txt
python -m kejian            # 启动并自动打开浏览器
```

> Python 包名是 `kejian`（项目最初的名字），所有命令都是 `python -m kejian`。

课件库里自带一份讲解齐全的**示例课件**（Supply and Demand），打开就能试着点词。

### 导入 PPT 需要什么？

PDF 可以直接导入。`.ppt` / `.pptx` 要先转成 PDF，程序会自动调用：

- **Windows**：已安装的 Microsoft PowerPoint（不会关闭你正在打开的演示文稿）
- **其它系统**：[LibreOffice](https://www.libreoffice.org/)

两者都没有的话，在 PowerPoint / Keynote 里“导出为 PDF”再导入即可（PDF 不带演讲者备注）。

## 一门课，全部连在一起

```
 课件 ──► 每页 AI 讲解 ──► 关键术语 ─────────────────┐
   │                                                  ▼
   └──► AI 出题（每道题能跳回原页） ──► 单词本 ──► 间隔复习
                                                      │
          单词本里的词会在课件上标出下划线 ◄──────────┘
```

| 环节 | 在哪里 | 怎么连起来 |
|---|---|---|
| **讲解** | 阅读页 → **AI 讲解** | 每页一张卡片，带关键术语 |
| **出题** | 课程标题栏 → **AI 出题**，或课件“⋯”菜单 → **AI 出题** | 可以从一份或几份课件出题；每道题记着章节和页码，点“看课件”直接跳回原页 |
| **生词** | 课件“⋯”菜单，或阅读页 **生词** 栏 → **AI 挑生词** / **收集讲解里的术语** | 术语和难词，带中文释义、英文释义、页码和原句 |
| **复习** | 单词本 → **复习** | 每张卡片都有出处；单词本还会列出这个词在同一门课里出现的其它页和题 |

每一步 AI 工作都有三种做法，有哪个用哪个：

- **网页版 AI**（ChatGPT、Claude、Kimi…）：向导帮你复制提示词，你把回复粘贴回来。
- **在项目文件夹里的 AI 助手**（Claude Code、Codex…）：它运行 `python -m kejian prompt …` 拿到提示词，自己写好 JSON，再用 `python -m kejian save …` 存进来。详见 [AGENTS.md](AGENTS.md)。
- **一键生成**：AI 设置里选了 **Claude Code** 的话，这些向导里会多一个“自动生成”按钮，用的是你的 Claude 订阅。

## 讲解怎么生成

点右上角 **AI 设置**，四种方式任选：

| 方式 | 需要什么 | 适合 |
|---|---|---|
| **网页版 AI**（默认） | 任意网页版 AI 账号：ChatGPT、Claude、Kimi、DeepSeek、豆包、通义… | 大多数人，没有 API Key |
| **Claude Code** | 本机装好并登录 [Claude Code](https://claude.com/claude-code)（Claude Pro / Max 订阅） | 想全自动、又不想单独付 API 费用 |
| **API Key** | 各家的 API Key | 批量生成、最快 |
| **离线提纲** | 什么都不要 | 先有个提纲，以后再用 AI 重写 |

### 网页版 AI：每组三步

在阅读页点 **AI 讲解**，向导会把课件按每组 8 页（可调）分好：

1. **复制提示词**：里面已经有写作要求、整份课件目录、这一组每页的文字和演讲者备注，以及输出格式。勾选“我会把课件 PDF 一起上传给 AI”，再把 PDF 拖进对话框，图表页会讲得更准。
2. **在 AI 网页里粘贴发送**：第一组新开对话，后面几组在同一个对话里接着发。回复中途停了就说“继续”。
3. **把完整回复粘贴回来**：程序实时显示认出了哪几页、缺哪几页，保存后自动跳到下一组。回复被截断、几段回复拼在一起、页码写法不同都能识别。

### Claude Code：用订阅自动生成

先在终端运行一次 `claude`，用你的 Claude 账号登录。然后在 AI 设置里选 **Claude Code**，点“测试连接”。之后点 **AI 讲解** 就会在后台批量生成（同时 2 页）。程序只调用你本机的 `claude -p`，只开放只读的 Read 工具来看幻灯片图片，不会读取或保存你的登录凭据。

### API Key（可选）

大多数人用不到。如果你有 Key，也支持 Claude（Anthropic SDK）、OpenAI，以及 DeepSeek、通义千问、Kimi、本地 Ollama 等 OpenAI 兼容接口。Key 只保存在本机的 `config.local.json`（已加入 `.gitignore`）。

## 学习语言

第一次打开时选择学习语言，之后用顶栏的 **中 / EN** 按钮随时切换。

| | 中文 | English |
|---|---|---|
| 界面 | 中文 | 英文 |
| AI 讲解 | 中文，保留英文术语 | 全英文 |
| 查词 | 中文释义（有道词典） | 英英释义 |
| 单词本、闪卡 | 中文释义 | 英文释义 |
| 题库 | 可开“中文对照”，中英解析 | 只显示英文 |

单词本里每个词同时存中文释义（`m`）和英文释义（`d`），切换语言不用重查。如果某份课件的讲解是另一种语言，阅读页会提示你一键重新生成。

## 单词本与背单词

- **边读边收藏**：在查词弹窗里点 ☆，或在题目的关键术语旁点 ☆。程序记下课程、出处（课件页或题号）和原句。
- **单词本页面**：搜索，按课程或熟练度（新词、学习中、已掌握）筛选，编辑释义和标签，导出 CSV。缺释义的词可以用“补全中文释义”（English 模式下是补全英文释义）一次补齐。
- **背单词**：空格翻面，按 1–4 打分（忘了 / 模糊 / 认识 / 太简单）。间隔 1 → 2 → 4 → 7 → 15 → 30 → 60 天递增；忘了的 10 分钟后再出现。

## 题库

题库挂在课程下，有三种来源：

- **AI 出题**：选一份或几份课件、题数，可以写个侧重点（“计算题”“容易混淆的概念”）。用网页版向导、AI 助手，或者 Claude Code 一键生成（见[一门课，全部连在一起](#一门课全部连在一起)）。
- **从 PPT**：一页一道题，演讲者备注里写 `Answer: B`。
- **从 JSON**：格式见 [`AI_GUIDE.md`](AI_GUIDE.md)。

```bash
python -m kejian quiz 题库.json --course econ101 --check   # 只校验
python -m kejian quiz 题库.json --course econ101
```

每道题可以带中文翻译、中英解析、关键术语和对应的课件页。做题记录保存在课件库里，下周再来，“错题”“曾错”筛选照样有用。

## 读论文

顶部的「论文」是单独的论文库，和课程分开。

- **导入**：拖入 PDF，或者粘贴 arXiv 编号 / 链接 / PDF 链接（`2504.15278`、`https://arxiv.org/abs/2504.15278`）。Lecta 会读出标题、作者和摘要，并把每张带编号的图和表裁出来。
- **收藏**：建文件夹，把论文拖进去；每篇论文都可以写备注（为什么收藏、读到哪了）。
- **阅读**：左边连续滚动看论文。点单词查词典；划一句话马上看到翻译，还可以高亮、批注，或者让 AI 结合上下文解释。按 **N**（或点「便签」）可以在页面任意位置贴便签。所有批注和便签都汇总在「我的批注」里。
- **AI 解读**：右边按顺序给出：论文要解决什么问题、怎么解决、整体框架（输入 → 各模块 → 输出）、摘要和引言的全文翻译、方法部分逐节图文详解（配图和关键公式）、对框架图逐块的深度解读、其他图表、实验结论、局限和思考题。可以用网页版 AI（复制提示词、粘贴回复）、Claude Code / API 一键生成，或者让 AI 助手在这个文件夹里用 `prompt paper` / `save paper` 完成。

```bash
python -m kejian paper add https://arxiv.org/abs/2504.15278 --folder "3D 重建"
python -m kejian prompt paper <论文ID> --out 提示词.md     # 写作要求、图表清单和论文全文
python -m kejian save paper <论文ID> --file 回复.md
```

## 给 AI 助手用

用 Claude Code、Codex 等 AI 助手打开这个文件夹。它会读 [`AGENTS.md`](AGENTS.md)（Claude Code 通过 `CLAUDE.md` 自动读取），然后整套流程都能自己完成，不需要 API Key：

- “帮我装好 Lecta，把 Downloads/ECON101 文件夹里的课件都导入到一门新课里。”
- “给第 4 讲写讲解，再从第 3–5 讲出 20 道选择题。”
- “从第 5 讲挑出我该背的词，加进单词本。”
- “我老是错哪些题？把背后的概念讲一遍，再针对这些出几道题考我。”

它用到的命令：

```bash
python -m kejian prompt notes|quiz|words <课件ID>…   # 写作要求 + 课件原文 + JSON 格式
python -m kejian save   notes|quiz|words <课件ID>… --file 回复.json
python -m kejian vocab  collect|add|where|list
python -m kejian export <课件ID|题库ID|vocab>        # 原文、讲解、标注、作答、生词记录
python -m kejian manifest                            # 整个课件库（JSON）
```

[`llms.txt`](llms.txt) 是给网页版 AI 读仓库用的简介；[`AI_GUIDE.md`](AI_GUIDE.md) 写清了每种文件格式。

用网页版 AI？首页的 **给 AI 用** 按钮可以复制课件库总览或单词本；单份课件、题库在“⋯”菜单里点 **复制给 AI**。

## 命令行

```bash
python -m kejian                                        # 启动（等同于 serve）
python -m kejian serve --port 8770 --no-browser
python -m kejian import 第三讲.pptx --title "第三讲" --course econ101
python -m kejian list                                   # 课程 → 课件 / 题库
python -m kejian course add "微观经济学" --code ECON101
python -m kejian course assign econ101 <课件或题库ID>
python -m kejian generate <课件ID> --pages 1-10         # 只生成缺讲解的页
python -m kejian generate <课件ID> --pages all --overwrite
python -m kejian quiz 题库.json --course econ101
python -m kejian prompt quiz <课件ID>… --count 15      # 给任意 AI 的提示词；还有 notes、words
python -m kejian save quiz <课件ID>… --file 回复.json
python -m kejian vocab collect <课件ID|题库ID>          # 关键术语 → 单词本，不用 AI
python -m kejian vocab where "elasticity" --course econ101
python -m kejian export <课件ID|题库ID|vocab> --out notes.md
python -m kejian manifest
python -m kejian paper add <PDF|arXiv编号|链接> --folder 文件夹   # 还有 list、folders、move、note、figures
python -m kejian config language zh                     # 学习语言：zh 或 en
python -m kejian doctor                                 # 检查 Python、依赖、PPT 转换
python -m kejian check                                  # 自检课件库
```

## 数据、隐私与版权

```
library/
  _courses.json   课程
  _vocab.json     单词本（含复习进度）
  _quizzes/       题库
  _progress/      做题记录
  <课件ID>/
    deck.json     每页标题、正文、演讲者备注、所属课程
    words.json    每个单词的坐标（透明文字层）
    notes.json    每页讲解，可以直接手改
    marks.json    我的标注（重点页、笔记、高亮）
    pages/ thumbs/
```

- **数据都在你自己的电脑上**。程序只监听 `127.0.0.1`。换电脑时把 `library/` 整个拷走即可；用环境变量 `KEJIAN_LIBRARY` 可以把课件库放到别处。
- **哪些内容会发出去**：生成讲解时，页面文字（开启时还有页面图片）会发给*你选择的* AI 服务商；查词时，所查的单词会发给词典（有道；English 模式还会用 [Free Dictionary API](https://dictionaryapi.dev/)）。
- **版权**：课件通常属于老师或出版社。请只导入你有权使用的材料，**不要把 `library/` 提交到公开仓库**（它已经在 `.gitignore` 里）。仓库自带的示例课件和所有截图都是原创演示内容。

## 项目结构

```
kejian/
  importer.py    PPTX/PDF → 页面图 + 单词坐标 + 备注（PowerPoint / LibreOffice + PyMuPDF）
  ai.py          讲解生成：Claude Code / Claude API / OpenAI 兼容 / 离线提纲
  studio.py      从课件出题、挑生词；把生词和课件页、题目关联起来
  manual.py      网页版模式：分组提示词、解析粘贴回来的回复
  jobs.py        后台任务（导入、批量生成）与进度
  server.py      本地 HTTP 服务与 JSON API
  library.py     课件库读写
  userdata.py    课程、单词本（间隔复习）、标注、做题进度
  quiz.py        题库：PPT / JSON 导入、校验、导出
  manifest.py    给 AI 的总览、Markdown 导出、自检
  dictionary.py  词典代理（浏览器直连会被跨域拦截）
  web/           前端（原生 JS，无需构建）
examples/        示例课件
scripts/         生成示例课件的脚本
tests/           单元测试
docs/images/     README 用图
```

## 开发

```bash
python -m unittest discover -s tests -v
KEJIAN_DEBUG=1 python -m kejian serve --no-browser    # 打印请求日志
```

后端是 Python 标准库 + PyMuPDF，前端是 `kejian/web/` 下的原生 JavaScript，改完刷新即可，不用构建。AI 编程助手请先读 [`AGENTS.md`](AGENTS.md)。

欢迎提 Issue 和 PR。

## 计划

- [ ] 导出带讲解的 PDF
- [ ] 单词本导出到 Anki
- [ ] 扫描版 PDF 的 OCR
- [ ] 更多学习语言

## License

[MIT](LICENSE) © Lecta contributors
