<p align="center">
  <img src="docs/images/banner.png" alt="Lecta — baca slaid kuliah dengan teliti" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>Bahasa Melayu</b>
</p>

<p align="center">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-0e5d6f">
  <img alt="Berjalan secara lokal" src="https://img.shields.io/badge/berjalan-secara%20lokal-2e7d4f">
  <img alt="Tiada langkah build" src="https://img.shields.io/badge/frontend-tiada%20build-847e72">
  <img alt="Lesen: MIT" src="https://img.shields.io/badge/lesen-MIT-f3d27a">
</p>

> Terjemahan ini disediakan untuk kemudahan. Jika ada percanggahan, rujuk [README dalam bahasa Inggeris](README.md).

**Lecta** menukar slaid kuliah menjadi halaman belajar: slaid di sebelah kiri, nota AI untuk slaid itu di sebelah kanan, dan kamus di bawah setiap perkataan. Import fail `.pptx` atau `.pdf`, kemudian baca, cari makna perkataan, serlahkan teks, berlatih dengan kuiz dan ulang kaji perkataan dengan ulangan berjarak (*spaced repetition*). Semuanya disusun mengikut kursus dan berjalan sepenuhnya di komputer anda sendiri.

Lecta dibina untuk pelajar yang belajar dalam bahasa Inggeris sebagai bahasa kedua. Ia ada dua bahasa pembelajaran: **中文** (nota dan makna dalam bahasa Cina) atau **English** (nota dalam bahasa Inggeris sahaja dan definisi Inggeris–Inggeris).

> Antara muka Lecta kini tersedia dalam bahasa Cina dan Inggeris. Bahasa Melayu ada dalam [pelan](#pelan-pembangunan).

<p align="center">
  <img src="docs/images/en-reader.png" alt="Pembaca: slaid di kiri, nota AI di kanan, kamus di atas perkataan" width="100%">
</p>

## Kandungan

- [Ciri-ciri](#ciri-ciri)
- [Tangkapan skrin](#tangkapan-skrin)
- [Mula pantas](#mula-pantas)
- [Satu kursus, semuanya berpaut](#satu-kursus-semuanya-berpaut)
- [Menjana nota](#menjana-nota)
- [Bahasa pembelajaran](#bahasa-pembelajaran)
- [Buku perkataan dan ulang kaji](#buku-perkataan-dan-ulang-kaji)
- [Kuiz](#kuiz)
- [Membaca kertas penyelidikan](#membaca-kertas-penyelidikan)
- [Untuk pembantu AI](#untuk-pembantu-ai)
- [Baris arahan](#baris-arahan)
- [Data, privasi dan hak cipta](#data-privasi-dan-hak-cipta)
- [Struktur projek](#struktur-projek)
- [Pembangunan](#pembangunan)
- [Pelan pembangunan](#pelan-pembangunan)
- [Lesen](#lesen)

## Ciri-ciri

| | |
|---|---|
| 📥 **Import slaid** | Seret masuk `.pptx`, `.ppt` atau `.pdf`. Lecta memaparkan setiap halaman, membuat gambar kecil, dan merekod kedudukan tepat setiap perkataan serta nota penceramah. |
| ✨ **Nota AI bagi setiap slaid** | Setiap slaid mendapat kad dengan ringkasan satu ayat, isi penting, istilah utama dan tip peperiksaan. Jana satu halaman, satu julat atau keseluruhan dek, jana semula, atau sunting sendiri. |
| 🔑 **Guna AI yang anda sudah ada** | Tidak perlu kunci API. Gunakan ChatGPT, Claude atau Kimi dalam pelayar (Lecta menulis prompt, anda tampal semula jawapannya), atau biar pembantu AI seperti Claude Code atau Codex membuat kerja itu terus dari folder ini. |
| 🔗 **Semuanya berpaut** | Nota AI, kuiz dan perkataan semuanya berada di bawah kursus yang sama. Setiap soalan memaut kembali ke slaidnya. Perkataan dalam buku perkataan digariskan pada slaid, dan setiap satu menyenaraikan semua slaid dan soalan dalam kursus yang menggunakannya. |
| 👆 **Klik mana-mana perkataan** | Klik perkataan pada slaid, atau pilih frasa, untuk melihat maknanya, sebutan IPA British dan audio British. Istilah yang ditakrifkan dalam kursus itu sendiri dipaparkan dahulu. Lapisan teks halimunan dijajarkan perkataan demi perkataan, jadi pilihan anda tepat dengan teks asal. |
| 🖍️ **Tanda** | Bintangkan halaman penting, tulis nota halaman (disimpan secara automatik), dan serlahkan teks dalam empat warna dengan komen. |
| 📝 **Kuiz** | Latihan aneka pilihan dengan penerangan, istilah utama dan pautan kembali ke slaid sumber. Tapis mengikut salah, pernah salah atau belum dijawab, dan lihat ketepatan mengikut bab. |
| 📄 **Baca kertas penyelidikan** | Perpustakaan kertas yang berasingan, dengan folder. Tambah PDF atau pautan arXiv; pilih mana-mana ayat untuk menterjemahkannya, bertanya kepada AI, menyerlah dan mengulas, atau tampal nota di mana-mana pada halaman. Panduan AI menerangkan masalah, pendekatan dan rangka kerja, menterjemah Abstrak dan Pengenalan, menghuraikan kaedah bahagian demi bahagian bersama rajahnya, dan membaca rajah rangka kerja secara terperinci. |
| 📚 **Buku perkataan** | Setiap perkataan yang disimpan mengingati tempat anda menjumpainya: slaid atau soalan mana, dan ayatnya. Cari, tapis mengikut kursus atau tahap, sunting dan eksport ke CSV. |
| 🔁 **Ulang kaji berjarak** | Kad imbas (Space untuk terbalikkan, kekunci 1–4 untuk menilai). Kad yang dilupakan kembali dalam 10 minit; yang diingati dalam 1 → 2 → 4 → 7 → 15 → 30 → 60 hari. |
| 🌏 **中文 / English** | Pilih bahasa pembelajaran semasa pelancaran pertama dan tukar bila-bila masa. Setiap perkataan menyimpan makna Cina dan definisi Inggeris. |
| 🤖 **Pembantu AI boleh menguruskannya** | [`AGENTS.md`](AGENTS.md) mengajar Claude Code, Codex dan ejen lain untuk memasang Lecta, mengimport slaid, menulis nota, membuat kuiz, membina senarai perkataan dan mencari kelemahan anda. |
| 🌙 **Selesa dibaca** | Tukar halaman dengan kekunci anak panah, jalur gambar kecil, panel boleh diubah saiz, mod gelap, dan ia mengingati di mana anda berhenti. |

## Tangkapan skrin

| | |
|---|---|
| <img src="docs/images/en-home.png" alt="Laman kursus"> <br> **Kursus.** Dek dan kuiz dikumpulkan mengikut kursus. | <img src="docs/images/en-quiz.png" alt="Kuiz"> <br> **Kuiz.** Penerangan, istilah utama dan slaid sumber. |
| <img src="docs/images/en-words.png" alt="Buku perkataan"> <br> **Buku perkataan.** Dari mana setiap perkataan datang, dan sejauh mana anda mengingatinya. | <img src="docs/images/en-review.png" alt="Ulang kaji"> <br> **Ulang kaji.** Kad imbas ulangan berjarak. |
| <img src="docs/images/zh-reader.png" alt="Mod 中文"> <br> **Mod 中文.** Nota dan makna dalam bahasa Cina. | <img src="docs/images/dark.png" alt="Mod gelap"> <br> **Mod gelap.** |

Semua tangkapan skrin menggunakan kursus demo asli, bukan bahan kuliah sebenar.

## Mula pantas

Anda perlukan **Python 3.10 atau lebih baharu**.

```bash
git clone https://github.com/chenjinxian1/Lecta.git
cd Lecta
```

### Pilihan A: biar AI memasangnya

Jika anda menggunakan [Claude Code](https://claude.com/claude-code), Codex atau pembantu AI lain yang boleh menjalankan arahan, bukanya dalam folder kosong dan tampal:

```text
Clone https://github.com/chenjinxian1/Lecta.git, read its AGENTS.md, then set Lecta up
for me and start it. My study language is English. Create a course called
"Principles of Microeconomics" (ECON101) and import the slides in <folder slaid anda>.
Then write the study notes for every slide, make a 15-question quiz, and build my word list.
```

Pembantu itu memasang semuanya, mengimport slaid anda dan membuat kerja AI sendiri, tanpa kunci API. Buka <http://127.0.0.1:8770> apabila ia sudah sedia.

Hanya ada ChatGPT atau Claude dalam pelayar? Minta: *"Read https://github.com/chenjinxian1/Lecta/blob/main/llms.txt and walk me through installing Lecta on my computer."*

### Pilihan B: pasang sendiri

**Windows:** klik dua kali `启动.bat`. Larian pertama memasang kebergantungan, kemudian pelayar anda membuka <http://127.0.0.1:8770>.

**macOS / Linux:** jalankan `./start.sh`, atau secara manual:

```bash
pip install -r requirements.txt
python -m kejian            # mulakan pelayan dan buka pelayar
```

> Pakej Python dinamakan `kejian`, nama asal projek ini. Semua arahan menggunakan `python -m kejian`.

Pustaka anda bermula dengan **dek contoh** yang lengkap dengan nota (*Supply and Demand*), jadi anda boleh terus mencuba carian perkataan.

### Mengimport fail PowerPoint

PDF boleh diimport terus. `.ppt` dan `.pptx` ditukar kepada PDF terlebih dahulu menggunakan:

- **Windows:** Microsoft PowerPoint, jika dipasang. Persembahan yang sedang dibuka tidak akan diganggu.
- **Sistem lain:** [LibreOffice](https://www.libreoffice.org/).

Jika anda tiada kedua-duanya, eksport ke PDF daripada PowerPoint atau Keynote dan import PDF itu. PDF tidak membawa nota penceramah.

## Satu kursus, semuanya berpaut

```
 slaid ──► nota AI setiap slaid ──► istilah utama ─────────┐
   │                                                        ▼
   └──► kuiz AI (setiap soalan memaut ke slaidnya) ──► buku perkataan ──► ulang kaji
                                                        │
        perkataan digariskan pada setiap slaid yang menggunakannya ◄─┘
```

| Langkah | Dalam aplikasi | Apa yang dipautkan |
|---|---|---|
| **Nota** | Pembaca → **AI notes** | Satu kad setiap slaid, dengan istilah utama |
| **Kuiz** | Pengepala kursus → **AI quiz**, atau menu ⋯ dek → **Make a quiz** | Soalan daripada satu atau beberapa dek; setiap satu ada bab dan nombor slaid, dan **Slides** melompat kembali ke slaid itu |
| **Perkataan** | Menu ⋯ dek atau tab **Words** dalam pembaca → **Pick words with AI** / **Save key terms from notes** | Istilah dan perkataan sukar, dengan makna Cina, definisi Inggeris, nombor slaid dan ayat asal |
| **Ulang kaji** | Buku perkataan → **Review** | Setiap kad menunjukkan sumbernya; buku perkataan juga menyenaraikan slaid dan soalan lain yang menggunakan perkataan itu |

Setiap langkah AI boleh dibuat dengan tiga cara. Pilih yang anda ada:

- **Sembang web** (ChatGPT, Claude, Kimi…): wizard menyalin prompt; anda tampal semula jawapannya.
- **Pembantu AI dalam folder ini** (Claude Code, Codex…): ia menjalankan `python -m kejian prompt …`, menulis JSON sendiri dan menyimpannya dengan `python -m kejian save …`. Lihat [AGENTS.md](AGENTS.md).
- **Satu klik**: jika **Claude Code** dipilih dalam AI settings, wizard yang sama ada butang **Generate** yang menggunakan langganan Claude anda.

## Menjana nota

Buka **AI settings** di penjuru kanan atas dan pilih satu daripada empat mod:

| Mod | Apa yang diperlukan | Sesuai untuk |
|---|---|---|
| **Sembang web** (lalai) | Mana-mana akaun chatbot: ChatGPT, Claude, Kimi, DeepSeek, Qwen… | Kebanyakan orang, tanpa kunci API |
| **Claude Code** | [Claude Code](https://claude.com/claude-code) dipasang dan log masuk (Claude Pro / Max) | Automatik sepenuhnya tanpa bayaran API |
| **Kunci API** | Kunci daripada penyedia anda | Penjanaan pukal, paling pantas |
| **Rangka luar talian** | Tiada | Rangka sekarang, nota AI kemudian |

### Sembang web: tiga langkah setiap kumpulan

Klik **AI notes** dalam pembaca. Wizard membahagikan dek kepada kumpulan 8 slaid (boleh diubah).

1. **Salin prompt.** Ia sudah mengandungi arahan penulisan, rangka dek, teks dan nota penceramah setiap slaid dalam kumpulan itu, serta format output. Tandakan "I will upload the slide PDF to the AI too" dan lampirkan PDF dalam sembang untuk nota yang lebih baik pada carta.
2. **Tampal ke dalam chatbot.** Mulakan sembang baharu untuk kumpulan pertama dan teruskan dalam sembang yang sama untuk yang lain. Jika jawapan terhenti, taip "continue".
3. **Tampal semula keseluruhan jawapan.** Lecta menunjukkan slaid yang dikenal pasti dan yang tertinggal, kemudian beralih ke kumpulan seterusnya.

### Claude Code: gunakan langganan anda

Jalankan `claude` sekali dalam terminal dan log masuk dengan akaun Claude anda. Kemudian pilih **Claude Code** dalam AI settings dan klik "Test connection". Selepas itu, **AI notes** menjana di latar belakang, dua slaid pada satu masa. Lecta hanya memanggil `claude -p` tempatan anda, membenarkan alat Read (baca sahaja) untuk melihat imej slaid, dan tidak pernah membaca atau menyimpan maklumat log masuk anda.

### Kunci API (pilihan)

Kebanyakan orang tidak memerlukannya. Jika anda ada kunci, Lecta menyokong Claude (Anthropic SDK), OpenAI, dan mana-mana titik akhir serasi OpenAI (DeepSeek, Qwen, Kimi, Ollama tempatan). Kunci disimpan hanya dalam `config.local.json` di komputer anda, yang ada dalam `.gitignore`.

## Bahasa pembelajaran

Semasa pelancaran pertama, Lecta bertanya bahasa yang anda mahu gunakan. Tukar bila-bila masa dengan butang **EN / 中文** di pengepala.

| | 中文 | English |
|---|---|---|
| Antara muka | Cina | Inggeris |
| Nota AI | Cina, istilah Inggeris dikekalkan | Inggeris sahaja |
| Kamus | Makna Cina (Youdao) | Definisi Inggeris–Inggeris |
| Buku perkataan dan kad imbas | Makna Cina | Definisi Inggeris |
| Kuiz | Terjemahan Cina jika perlu, penerangan dalam kedua-dua bahasa | Inggeris sahaja |

Setiap perkataan menyimpan kedua-dua makna (`m` untuk Cina, `d` untuk Inggeris), jadi menukar bahasa tidak memerlukan carian baharu.

## Buku perkataan dan ulang kaji

- **Simpan sambil membaca.** Klik ☆ dalam tetingkap kamus, atau di sebelah istilah utama dalam kuiz. Lecta merekod kursus, slaid atau soalan, dan ayat asalnya.
- **Halaman buku perkataan.** Cari, tapis mengikut kursus atau tahap (*New, Learning, Mastered*), sunting makna, definisi dan tag, dan eksport ke CSV.
- **Ulang kaji.** Tekan Space untuk terbalikkan kad, kemudian nilai 1–4 (*Forgot, Hard, Good, Easy*). Selang masa meningkat 1 → 2 → 4 → 7 → 15 → 30 → 60 hari; kad yang dilupakan kembali selepas 10 minit.

## Kuiz

Kuiz berada di dalam kursus. Ada tiga cara untuk menambahnya:

- **Kuiz AI**: pilih satu atau beberapa dek, bilangan soalan dan fokus pilihan ("pengiraan", "konsep yang mudah keliru"). Gunakan wizard sembang web, pembantu AI, atau satu klik dengan Claude Code (lihat [Satu kursus, semuanya berpaut](#satu-kursus-semuanya-berpaut)).
- **Daripada PowerPoint**: satu soalan setiap slaid, dengan `Answer: B` dalam nota penceramah.
- **Daripada JSON**: formatnya ada dalam [`AI_GUIDE.md`](AI_GUIDE.md).

```bash
python -m kejian quiz kuiz-saya.json --course econ101 --check   # semak sahaja
python -m kejian quiz kuiz-saya.json --course econ101
```

Jawapan disimpan dalam pustaka, jadi penapis **Wrong** dan **Ever wrong** masih berguna minggu depan.

## Membaca kertas penyelidikan

Tab **Papers** ialah perpustakaan kertas penyelidikan, berasingan daripada kursus anda.

- **Tambah**: seret masuk PDF, atau tampal ID atau pautan arXiv atau pautan PDF (`2504.15278`, `https://arxiv.org/abs/2504.15278`). Lecta membaca tajuk, pengarang dan abstrak, serta memotong setiap rajah dan jadual yang bernombor.
- **Susun**: buat folder, seret kertas ke dalamnya, dan tulis nota pada setiap kertas.
- **Baca**: kertas ditatal di sebelah kiri. Klik perkataan untuk mencarinya; pilih ayat untuk melihat terjemahannya, kemudian serlahkan, ulas, atau minta AI menerangkannya mengikut konteks. Tekan **N** untuk menampal nota di mana-mana pada halaman. Semua ulasan dan nota disenaraikan dalam **My notes**.
- **Panduan AI**: di sebelah kanan: masalah yang diselesaikan, cara penyelesaian, rangka kerja keseluruhan, terjemahan penuh Abstrak dan Pengenalan, kaedah bahagian demi bahagian bersama rajah dan formula utama, bacaan mendalam rajah rangka kerja, rajah dan jadual lain, keputusan, batasan dan soalan untuk difikirkan.

```bash
python -m kejian paper add https://arxiv.org/abs/2504.15278 --folder "3D reconstruction"
python -m kejian prompt paper <id-kertas> --out prompt.md
python -m kejian save paper <id-kertas> --file reply.md
```

## Untuk pembantu AI

Buka Claude Code, Codex atau pembantu AI lain dalam folder ini. Ia membaca [`AGENTS.md`](AGENTS.md) (Claude Code memuatkannya melalui `CLAUDE.md`) dan boleh membuat keseluruhan kerja, tanpa kunci API:

- "Pasang Lecta dan import semua fail dalam folder Downloads/ECON101 ke kursus baharu."
- "Tulis nota untuk Kuliah 4, kemudian buat kuiz 20 soalan daripada Kuliah 3–5."
- "Pilih perkataan yang patut saya pelajari daripada Kuliah 5 dan tambah ke buku perkataan."
- "Soalan mana yang saya selalu salah? Terangkan konsepnya dan uji saya lagi."

Arahan yang digunakannya:

```bash
python -m kejian prompt notes|quiz|words <id-dek>…   # arahan, teks slaid dan format JSON
python -m kejian save   notes|quiz|words <id-dek>… --file jawapan.json
python -m kejian vocab  collect|add|where|list
python -m kejian export <id-dek|id-kuiz|vocab>       # teks slaid, nota, tanda, jawapan, sejarah perkataan
python -m kejian manifest                            # seluruh pustaka sebagai JSON
```

[`llms.txt`](llms.txt) ialah ringkasan untuk chatbot yang membaca repositori dari web; [`AI_GUIDE.md`](AI_GUIDE.md) mendokumenkan setiap format fail.

Menggunakan chatbot dalam pelayar? Butang **For AI** di laman utama menyalin gambaran keseluruhan pustaka atau buku perkataan anda, dan setiap dek atau kuiz ada **Copy for AI** dalam menu ⋯.

## Baris arahan

```bash
python -m kejian                                        # mula (sama seperti: serve)
python -m kejian serve --port 8770 --no-browser
python -m kejian import kuliah3.pptx --title "Kuliah 3" --course econ101
python -m kejian list                                   # kursus → dek / kuiz
python -m kejian course add "Principles of Microeconomics" --code ECON101
python -m kejian course assign econ101 <id-dek-atau-kuiz>
python -m kejian generate <id-dek> --pages 1-10         # hanya halaman tanpa nota
python -m kejian generate <id-dek> --pages all --overwrite
python -m kejian quiz kuiz.json --course econ101
python -m kejian prompt quiz <id-dek>… --count 15       # prompt untuk mana-mana AI; juga: notes, words
python -m kejian save quiz <id-dek>… --file jawapan.json
python -m kejian vocab collect <id-dek|id-kuiz>          # istilah utama → buku perkataan, tanpa AI
python -m kejian vocab where "elasticity" --course econ101
python -m kejian export <id-dek|id-kuiz|vocab> --out nota.md
python -m kejian manifest
python -m kejian paper add <pdf|id-arxiv|url> --folder NAMA   # juga: list, folders, move, note, figures
python -m kejian config language en                      # bahasa pembelajaran: zh atau en
python -m kejian doctor                                  # semak Python, kebergantungan, penukar PPT
python -m kejian check                                  # semak pustaka
```

## Data, privasi dan hak cipta

```
library/
  _courses.json   kursus
  _vocab.json     buku perkataan, termasuk status ulang kaji
  _quizzes/       kuiz
  _progress/      jawapan kuiz
  <id-dek>/
    deck.json     tajuk slaid, teks, nota penceramah, kursus
    words.json    kedudukan setiap perkataan (lapisan teks halimunan)
    notes.json    nota AI setiap slaid; boleh disunting sendiri
    marks.json    bintang, nota halaman dan serlahan anda
    pages/ thumbs/
```

- **Semuanya kekal di komputer anda.** Pelayan hanya mendengar pada `127.0.0.1`. Pindahkan folder `library/` untuk memindahkan data anda, atau tetapkan `KEJIAN_LIBRARY` untuk menyimpannya di tempat lain.
- **Apa yang keluar dari komputer anda:** teks slaid (dan imej slaid, jika dihidupkan) dihantar kepada penyedia AI yang *anda* pilih semasa menjana nota, dan perkataan yang anda cari dihantar ke kamus (Youdao; dalam mod English juga [Free Dictionary API](https://dictionaryapi.dev/)).
- **Hak cipta.** Slaid kuliah biasanya milik pensyarah atau penerbit anda. Import hanya bahan yang anda berhak gunakan, dan **jangan sekali-kali commit `library/` ke repositori awam**. Ia ada dalam `.gitignore` atas sebab ini. Dek contoh dan setiap tangkapan skrin di sini menggunakan kandungan demo asli.

## Struktur projek

```
kejian/
  importer.py    PPTX/PDF → imej halaman, kotak perkataan, nota penceramah
  ai.py          penjanaan nota: Claude Code, Claude API, serasi OpenAI, rangka luar talian
  studio.py      kuiz dan senarai perkataan daripada slaid; memautkan perkataan ke slaid dan soalan
  manual.py      mod sembang web: prompt berkumpulan dan menghurai jawapan yang ditampal
  jobs.py        tugas latar belakang (import, penjanaan pukal) dan kemajuan
  server.py      pelayan HTTP tempatan dan API JSON
  library.py     baca/tulis pustaka
  userdata.py    kursus, buku perkataan (ulangan berjarak), tanda, kemajuan kuiz
  quiz.py        kuiz: import PPT / JSON, pengesahan, eksport
  manifest.py    gambaran keseluruhan untuk AI, eksport Markdown, semakan kendiri
  dictionary.py  proksi kamus (pelayar tidak dapat memanggilnya terus kerana CORS)
  web/           frontend: JavaScript biasa, tiada langkah build
examples/        dek contoh
scripts/         skrip yang membina dek contoh
tests/           ujian unit
docs/images/     imej README
```

## Pembangunan

```bash
python -m unittest discover -s tests -v
KEJIAN_DEBUG=1 python -m kejian serve --no-browser    # log permintaan
```

Backend ialah pustaka standard Python serta PyMuPDF; frontend ialah JavaScript biasa dalam `kejian/web/`. Sunting dan muat semula, tiada build diperlukan. Ejen pengekodan AI patut membaca [`AGENTS.md`](AGENTS.md) dahulu.

Isu dan *pull request* dialu-alukan.

## Pelan pembangunan

- [ ] Eksport dek bersama nota sebagai PDF
- [ ] Eksport buku perkataan ke Anki
- [ ] OCR untuk PDF yang diimbas
- [ ] Lebih banyak bahasa pembelajaran, termasuk antara muka Bahasa Melayu

## Lesen

[MIT](LICENSE) © Lecta contributors
