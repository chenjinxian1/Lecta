<p align="center">
  <img src="docs/images/banner.png" alt="Lecta — read your lecture slides closely" width="100%">
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

<p align="center">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-0e5d6f">
  <img alt="Runs locally" src="https://img.shields.io/badge/runs-locally-2e7d4f">
  <img alt="No build step" src="https://img.shields.io/badge/frontend-no%20build%20step-847e72">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-f3d27a">
</p>

**Lecta** turns lecture slides into a study page: the slide on the left, an AI-written explanation for that slide on the right, and a dictionary under every word. Import a `.pptx` or `.pdf`, then read, look up, highlight, practise with quizzes and review your words with spaced repetition. It is organised by course and runs entirely on your own computer.

It was built for students who study in English as a second language, so it has two study languages: **中文**, with Chinese explanations and Chinese meanings, or **English**, with English-only notes and English–English definitions.

<p align="center">
  <img src="docs/images/en-reader.png" alt="Reader: slide on the left, AI notes on the right, dictionary popup over a word" width="100%">
</p>

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Generating notes](#generating-notes)
- [Study language](#study-language)
- [Word book and review](#word-book-and-review)
- [Quizzes](#quizzes)
- [For AI assistants](#for-ai-assistants)
- [Command line](#command-line)
- [Your data, privacy and copyright](#your-data-privacy-and-copyright)
- [Project structure](#project-structure)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## Features

| | |
|---|---|
| 📥 **Import slides** | Drop in `.pptx`, `.ppt` or `.pdf`. Lecta renders each page, makes thumbnails, and records the exact position of every word plus the speaker notes. |
| ✨ **AI notes per slide** | Each slide gets a card with a one-line summary, key points, key terms and an exam tip. Generate one page, a range or the whole deck, regenerate, or edit by hand. |
| 🔑 **No API key needed** | Use the ChatGPT, Claude, Kimi or DeepSeek account you already have: Lecta writes the prompt, you paste the reply back, and it is split into per-slide notes. With [Claude Code](https://claude.com/claude-code) installed, notes are generated automatically on your Claude subscription. API keys also work (Claude, OpenAI and any OpenAI-compatible endpoint, including Ollama). |
| 👆 **Tap any word** | Click a word on the slide, or select a phrase, to see its meaning, British IPA and British audio. Terms that the course itself defines show the course meaning first. The invisible text layer is aligned word by word with the slide, so selections match the original exactly. |
| 🖍️ **Marks** | Star key pages, write page notes (saved automatically), and highlight text in four colours with comments. Thumbnails show which pages you marked. |
| 📝 **Quizzes** | Multiple-choice practice with explanations, key terms and a link back to the source slide. Filter by wrong, ever wrong or to-do, and see accuracy by chapter. |
| 📚 **Word book** | Every saved word remembers where you found it: which slide or question, and the sentence. Search, filter by course or by level, edit and export to CSV. |
| 🔁 **Spaced review** | Flashcards (Space flips, keys 1–4 grade). Forgotten cards come back in 10 minutes; remembered ones in 1 → 2 → 4 → 7 → 15 → 30 → 60 days. |
| 🌏 **中文 / English** | Pick a study language on first launch and switch any time. Each word stores both a Chinese meaning and an English definition, so switching needs no new lookups. |
| 🤖 **AI-readable library** | Plain JSON files plus [`AI_GUIDE.md`](AI_GUIDE.md), so an AI assistant can read your courses, notes, mistakes and words, or add a quiz to the right course. |
| 🌙 **Comfortable reading** | Arrow-key paging, thumbnail strip, resizable split, dark mode, and it remembers where you stopped. |

## Screenshots

| | |
|---|---|
| <img src="docs/images/en-home.png" alt="Courses home"> <br> **Courses.** Decks and quizzes grouped by course, with progress. | <img src="docs/images/en-quiz.png" alt="Quiz"> <br> **Quizzes.** Explanations, key terms and the source slide. |
| <img src="docs/images/en-words.png" alt="Word book"> <br> **Word book.** Where each word came from, and how well you know it. | <img src="docs/images/en-review.png" alt="Review"> <br> **Review.** Spaced-repetition flashcards. |
| <img src="docs/images/en-marks.png" alt="Marks"> <br> **Marks.** Starred pages, notes and highlights. | <img src="docs/images/dark.png" alt="Dark mode"> <br> **Dark mode.** |
| <img src="docs/images/zh-reader.png" alt="Chinese mode reader"> <br> **中文 mode.** Chinese notes and meanings, English terms kept. | <img src="docs/images/language.png" alt="Language picker"> <br> **First launch.** Choose your study language. |

All screenshots use the original demo courses in this README, not real course material.

## Quick start

You need **Python 3.10 or later**.

```bash
git clone https://github.com/chenjinxian1/Lecta.git
cd Lecta
```

**Windows:** double-click `启动.bat`. The first run installs the dependencies, then your browser opens <http://127.0.0.1:8770>.

**macOS / Linux:** run `./start.sh`, or do it by hand:

```bash
pip install -r requirements.txt
python -m kejian            # starts the server and opens the browser
```

> The Python package is called `kejian`, the project's original working name. All commands use `python -m kejian`.

The library starts with a fully annotated **example deck** (*Supply and Demand*), so you can try word lookup straight away.

### Importing PowerPoint files

PDFs import directly. `.ppt` and `.pptx` are converted to PDF first, using:

- **Windows:** Microsoft PowerPoint, if installed. Presentations you have open are left alone.
- **Other systems:** [LibreOffice](https://www.libreoffice.org/).

If you have neither, export to PDF from PowerPoint or Keynote and import the PDF. PDFs don't carry speaker notes.

## Generating notes

Open **AI settings** in the top-right corner and pick one of four modes:

| Mode | What you need | Good for |
|---|---|---|
| **Web chat** (default) | Any chatbot account: ChatGPT, Claude, Kimi, DeepSeek, Qwen… | Most people, no API key |
| **Claude Code** | [Claude Code](https://claude.com/claude-code) installed and logged in (Claude Pro / Max) | Fully automatic, without paying for an API |
| **API key** | A key from your provider | Bulk generation, fastest |
| **Offline outline** | Nothing | An outline now, AI notes later |

### Web chat: three steps per batch

Click **AI notes** in the reader. The wizard splits the deck into batches of 8 slides (you can change this).

1. **Copy the prompt.** It already contains the writing brief, the deck outline, the text and speaker notes of each slide in the batch, and the output format. Tick "I will upload the slide PDF to the AI too" and attach the PDF in the chat for better notes on charts.
2. **Paste it into the chatbot.** Start a new chat for the first batch and continue in the same chat for the rest. If the reply stops halfway, say "continue".
3. **Paste the whole reply back.** Lecta shows which slides it recognised and which are missing, then moves on to the next batch. Truncated replies, several replies pasted together and different page-number styles are all handled.

### Claude Code: use your subscription

Run `claude` once in a terminal and log in with your Claude account. Then choose **Claude Code** in AI settings and click "Test connection". From then on, **AI notes** generates in the background, two slides at a time. Lecta only calls your local `claude -p`, allows only the read-only Read tool so it can look at slide images, and never reads or stores your login.

### API keys

| Provider | Default model | Notes |
|---|---|---|
| Claude (Anthropic) | `claude-opus-5-5` | Official SDK with structured JSON output. The deck outline is a cached prompt prefix, so bulk runs cost less. |
| OpenAI | `gpt-5` | |
| DeepSeek / Qwen / Kimi | pre-filled | The base URL is filled in for you. |
| Ollama | `qwen2.5:14b` | Fully local. |
| Offline outline | — | No AI. The slide text is arranged into an outline. |

- Keys are stored only in `config.local.json` on your computer, which is in `.gitignore`. `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` environment variables also work.
- "Send slide images to the model" is on by default, which helps with charts and diagrams. Models that can't read images fall back to text only.

## Study language

On first launch Lecta asks which language you want to study in. Switch any time with the **EN / 中文** button in the header.

| | 中文 | English |
|---|---|---|
| Interface | Chinese | English |
| AI notes | Chinese, English terms kept | English only |
| Dictionary | Chinese meanings (Youdao) | English–English definitions |
| Word book and flashcards | Chinese meaning | English definition |
| Quizzes | Chinese translation on demand, explanations in both | English only |

Each saved word keeps both meanings (`m` for Chinese, `d` for English), so switching language doesn't need new lookups. If a deck's notes are in the other language, the reader offers to regenerate them.

## Word book and review

- **Save while reading.** Click ☆ in the dictionary popup, or next to a key term in a quiz. Lecta records the course, the slide or question, and the sentence it came from.
- **Word book page.** Search, filter by course or level (new, learning, mastered), edit the meaning, definition and tags, and export to CSV. "Add English definitions" (or, in 中文 mode, the Chinese equivalent) fills in any that are missing.
- **Review.** Press Space to flip, then grade 1–4 (*Forgot, Hard, Good, Easy*). Intervals grow 1 → 2 → 4 → 7 → 15 → 30 → 60 days; a forgotten card comes back after 10 minutes.

## Quizzes

Quizzes live inside a course. There are two ways to add one:

- **From a PowerPoint**: one question per slide, with `Answer: B` in the speaker notes.
- **From JSON**: the format is in [`AI_GUIDE.md`](AI_GUIDE.md). Ask any AI to write questions from your notes in this format, then import:

```bash
python -m kejian quiz my-quiz.json --course econ101 --check   # validate only
python -m kejian quiz my-quiz.json --course econ101
```

Each question can have a Chinese translation, explanations in both languages, key terms and the source slide. Answers are saved in the library, so the **Wrong** and **Ever wrong** filters still work next week.

## For AI assistants

Lecta's library is plain JSON, and [`AI_GUIDE.md`](AI_GUIDE.md) describes every file. You can point Claude, ChatGPT or any coding agent at this folder and ask, for example:

- "Make a 10-question quiz from Lecture 3 and add it to ECON101."
- "Which questions do I keep getting wrong? Explain the concepts behind them."
- "Turn my starred pages and highlights into a revision sheet."

Useful commands:

```bash
python -m kejian manifest          # the whole library as JSON: courses, decks, quizzes, progress
python -m kejian export <deck-id>  # one deck as Markdown: slide text, notes, your marks
python -m kejian export vocab      # your word book as Markdown
```

Using a chatbot in the browser instead? The **For AI** button on the home page copies the library overview or your word book, and each deck or quiz has **Copy for AI** in its ⋯ menu.

## Command line

```bash
python -m kejian                                        # start (same as: serve)
python -m kejian serve --port 8770 --no-browser
python -m kejian import lecture3.pptx --title "Lecture 3" --course econ101
python -m kejian list                                   # courses → decks / quizzes
python -m kejian course add "Principles of Microeconomics" --code ECON101
python -m kejian course assign econ101 <deck-or-quiz-id>
python -m kejian generate <deck-id> --pages 1-10        # only pages without notes
python -m kejian generate <deck-id> --pages all --overwrite
python -m kejian quiz quiz.json --course econ101
python -m kejian export <deck-id|quiz-id|vocab> --out notes.md
python -m kejian manifest
python -m kejian check                                  # check the library for problems
```

## Your data, privacy and copyright

```
library/
  _courses.json   courses
  _vocab.json     word book, including review state
  _quizzes/       quizzes
  _progress/      quiz answers
  <deck-id>/
    deck.json     slide titles, text, speaker notes, course
    words.json    position of every word (the invisible text layer)
    notes.json    AI notes per slide; safe to edit by hand
    marks.json    your stars, page notes and highlights
    pages/ thumbs/
```

- **Everything stays on your computer.** The server listens on `127.0.0.1` only. Move the `library/` folder to move your data, or set `KEJIAN_LIBRARY` to keep it elsewhere.
- **What leaves your computer:** slide text (and slide images, if enabled) goes to the AI provider *you* choose when you generate notes, and words you look up go to the dictionary (Youdao; in English mode also [Free Dictionary API](https://dictionaryapi.dev/)).
- **Copyright.** Lecture slides usually belong to your lecturer or a publisher. Import only material you have the right to use, and **never commit `library/` to a public repository**. It is in `.gitignore` for that reason. The example deck and every screenshot here use original demo content.

## Project structure

```
kejian/
  importer.py    PPTX/PDF → page images, word boxes, speaker notes (PowerPoint / LibreOffice + PyMuPDF)
  ai.py          note generation: Claude API, OpenAI-compatible, Claude Code, offline outline
  manual.py      web-chat mode: batch prompts and parsing pasted replies
  jobs.py        background jobs (import, bulk generation) and progress
  server.py      local HTTP server and JSON API
  library.py     library read/write
  userdata.py    courses, word book (spaced repetition), marks, quiz progress
  quiz.py        quizzes: PPT / JSON import, validation, export
  manifest.py    overview for AI, Markdown export, self-check
  dictionary.py  dictionary proxy (the browser can't call it directly because of CORS)
  web/           frontend: plain JavaScript, no build step
examples/        the example deck
scripts/         script that builds the example deck
tests/           unit tests
docs/images/     README images
```

## Development

```bash
python -m unittest discover -s tests -v
KEJIAN_DEBUG=1 python -m kejian serve --no-browser    # log requests
```

The backend is the Python standard library plus PyMuPDF; the frontend is plain JavaScript in `kejian/web/`. Edit and reload, no build needed. AI coding agents should read [`AGENTS.md`](AGENTS.md) first.

Issues and pull requests are welcome.

## Roadmap

- [ ] Export a deck with its notes as PDF
- [ ] Export the word book to Anki
- [ ] OCR for scanned PDFs
- [ ] More study languages

## License

[MIT](LICENSE) © Lecta contributors
