# AGENTS.md — for AI assistants

You are an AI assistant (Claude Code, Codex, Cursor, …) opened in the **Lecta** folder. Lecta is a local study app: lecture slides on the left, a study note for each slide on the right, a dictionary under every word, quizzes, and a spaced-repetition word book, all organised by course.

**You can be Lecta's AI.** The user doesn't need an API key: you read the slides, write the notes, quiz questions and word lists yourself, and save them with the commands below. The web app picks them up straight away.

Reply to the user in the language they write in. The detailed reference (file formats, every field) is [AI_GUIDE.md](AI_GUIDE.md), written in Chinese.

> The user's slides are usually copyrighted. Never upload them anywhere and never commit `library/` (it is in `.gitignore`).

---

## 1. Set it up (first time)

Run these from this folder and fix anything that fails before moving on:

```bash
python --version                     # needs 3.10+
pip install -r requirements.txt      # PyMuPDF (required); anthropic, openai (optional)
python -m kejian doctor              # checks Python, PyMuPDF, PPT→PDF converter, Claude Code, library
```

- Ask which language they study in: `python -m kejian config language zh` (Chinese notes and meanings) or `python -m kejian config language en` (English only).
- Start the app **in the background**: `python -m kejian serve --no-browser` (Windows users can double-click `启动.bat` instead). Then tell the user to open <http://127.0.0.1:8770>. If 8770 is busy the server picks the next free port and prints it.
- `.pptx` / `.ppt` import needs PowerPoint (Windows) or LibreOffice. If `doctor` finds neither, ask the user to export PDFs instead.

## 2. Build a course

```bash
python -m kejian course add "Principles of Microeconomics" --code ECON101     # prints the course id, e.g. econ101
python -m kejian import "path/to/Lecture 3.pptx" --title "Lecture 3 · Supply and Demand" --course econ101
python -m kejian list                                                         # courses → decks / quizzes, with ids
```

Import every file the user gives you into the course it belongs to. Deck ids are printed after each import and by `list`.

## 3. Write the study notes for a deck

Work in batches of about 8 slides:

```bash
python -m kejian prompt notes <deck-id> --pages 1-8 --out tmp-notes-prompt.md
```

1. Read the prompt file. It contains the writing brief, the deck outline, each slide's text and speaker notes, and the exact JSON format.
2. If you can read images, also look at `library/<deck-id>/pages/001.jpg` … (three-digit page numbers). Charts and diagrams are often only in the image.
3. Write the JSON array exactly as specified, in the study language, to a file, then save it:

```bash
python -m kejian save notes <deck-id> --file tmp-notes.json
```

Repeat for the next pages (`--pages missing` gives the slides that still have no notes). Delete your temp files when done.

## 4. Make a quiz from one or more decks

```bash
python -m kejian prompt quiz <deck-id> [<deck-id> …] --count 15 --focus "easily confused ideas" --out tmp-quiz-prompt.md
# write the quiz JSON as the prompt describes
python -m kejian save quiz <deck-id> [<deck-id> …] --file tmp-quiz.json
```

Pass the same deck ids to `prompt` and `save`. Lecta links each question's `chapter` and `page` to the right deck, so a wrong answer can jump straight back to its slide. The quiz goes into the decks' course automatically.

## 5. Build the word list

```bash
python -m kejian vocab collect <deck-id|quiz-id>     # no AI: saves the key terms already in the notes or quiz
python -m kejian prompt words <deck-id> --count 25 --out tmp-words-prompt.md
python -m kejian save words <deck-id> --file tmp-words.json
python -m kejian vocab add "opportunity cost" --m "机会成本" --d "n. the value of the next best alternative" --deck <deck-id> --page 5
python -m kejian vocab where "elasticity" --course econ101       # every slide and question that uses it
```

Each word keeps where it came from (deck page or quiz question, plus the original sentence). The web app underlines word-book words on the slides and lists, for every word, the other slides and questions in the same course where it appears.

## 6. Help the user study

| The user asks | Do this |
|---|---|
| "What am I weak at?" | `python -m kejian export <quiz-id>` (answers, wrong counts) and `python -m kejian export vocab` (lapses, levels) |
| "Explain this lecture" | `python -m kejian export <deck-id>`: slide text, notes and the user's own stars, notes and highlights |
| "Quiz me on what I got wrong" | Read the wrong questions, then `prompt quiz` with `--focus` on those concepts |
| "Make a revision sheet" | Use the starred pages and highlights from `export <deck-id>`; write Markdown for the user, not into `library/` |

`python -m kejian manifest` prints the whole library as JSON, including `"language"`. Write in that language: see the table in AI_GUIDE.md §1.

## 7. Rules

- Use the commands. If you must edit JSON in `library/` by hand, read [AI_GUIDE.md](AI_GUIDE.md) first, keep UTF-8, and run `python -m kejian check` afterwards.
- Never delete the user's review history (`_vocab.json` `srs`, `_progress/`), marks or notes unless they ask.
- Keep notes and questions faithful to the slides. Say so when a slide looks wrong instead of inventing facts.
- The example deck (`examples/`) is read-only.

---

## Developing Lecta itself

- Python standard library + PyMuPDF; frontend is plain JavaScript in `kejian/web/` with no build step.
- Tests: `python -m unittest discover -s tests -v`
- Map: `importer.py` (PPTX/PDF → pages, word boxes, notes) · `ai.py` (note generation engines) · `manual.py` (notes prompt and reply parsing) · `studio.py` (quiz and word prompts, linking words to slides and questions) · `quiz.py` · `userdata.py` (courses, word book, marks, progress) · `server.py` (HTTP API) · `__main__.py` (CLI)
- UI strings are written as `L('中文', 'English')`; keep both languages in sync.
