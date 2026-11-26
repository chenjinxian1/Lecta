/* Lecta 课读 —— 前端（无构建步骤，原生 JS） */
(() => {
'use strict';

/* ================================================================ 工具 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = n => String(n).padStart(3, '0');
const pad2 = n => String(n).padStart(2, '0');
const icon = id => `<svg class="icon"><use href="#i-${id}"/></svg>`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('kj.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kj.' + k, JSON.stringify(v)); } catch {} },
};

/* ================================================================ 语言（中文 / English） */
// 界面、词典释义、单词本、复习卡片、AI 讲解都跟着这个语言走。服务器设置里的 language 是准，localStorage 只是首屏缓存。
let LANG = store.get('lang', 'zh') === 'en' ? 'en' : 'zh';
const L = (zh, en) => LANG === 'en' ? en : zh;
const pl = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;  // 英文单复数
const hasCJK = s => /[㐀-鿿]/.test(s || '');
// 英文模式下只显示不含中文的文字
const forLang = s => (LANG === 'en' && hasCJK(s)) ? '' : (s || '');
function setLangLocal(l) {
  LANG = l === 'en' ? 'en' : 'zh';
  store.set('lang', LANG);
  document.documentElement.lang = L('zh-CN', 'en');
}
setLangLocal(LANG);
async function switchLang(to) {
  to = to || (LANG === 'en' ? 'zh' : 'en');
  try { await api('settings', { method: 'PUT', json: { language: to, lang_chosen: true } }); } catch (e) { return toast(e.message); }
  setLangLocal(to);
  route();
  toast(L('已切换到中文：界面、释义和 AI 讲解都用中文', 'Switched to English: interface, definitions and AI notes are now in English'));
}
const langBtnHTML = () => `<button class="chip-btn lang-btn" id="langBtn" title="${L('切换语言 / Switch to English', 'Switch language / 切换到中文')}">${LANG === 'en' ? 'EN' : '中'}<span class="lbl">${LANG === 'en' ? '中文' : 'English'}</span></button>`;
function langWelcome() {
  return new Promise(res => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form method="dialog" class="welcome">
      <div class="wl-logo"><span class="logo"><i></i></span><b>Lecta</b><small>课读</small></div>
      <h2>选择学习语言 <span>Choose your study language</span></h2>
      <p class="sub">之后随时可以在右上角切换 · You can switch any time from the top bar</p>
      <div class="wl-opts">
        <button type="button" class="wl-opt" data-l="zh"><b>中文</b>
          <ul><li>中文界面</li><li>查词、单词本、复习卡片显示中文释义</li><li>AI 用中文讲解课件（保留英文术语）</li><li>题目可以显示中文对照和中文解析</li></ul></button>
        <button type="button" class="wl-opt" data-l="en"><b>English</b>
          <ul><li>English interface</li><li>English–English definitions in the dictionary, word book and flashcards</li><li>AI writes slide notes in English</li><li>Quizzes in English only</li></ul></button>
      </div></form>`;
    dlg.addEventListener('cancel', e => e.preventDefault(), { once: true });
    $$('.wl-opt', dlg).forEach(b => b.onclick = async () => {
      try { await api('settings', { method: 'PUT', json: { language: b.dataset.l, lang_chosen: true } }); } catch {}
      setLangLocal(b.dataset.l); dlg.close(); res();
    });
    dlg.showModal();
  });
}
// 服务器返回的导入进度是中文，英文模式下翻一下
function srvMsg(m) {
  if (LANG !== 'en' || !m) return m;
  let x;
  if (m === '正在转换为 PDF…') return 'Converting to PDF…';
  if (m === '正在读取 PDF…') return 'Reading PDF…';
  if (m === '导入完成') return 'Import finished';
  if (m === '正在识别图表…') return 'Finding figures and tables…';
  if (m === '正在读取 arXiv 信息…') return 'Reading arXiv details…';
  if (m === '正在下载 PDF…') return 'Downloading the PDF…';
  if ((x = m.match(/正在下载 PDF… (\d+)%/))) return `Downloading the PDF… ${x[1]}%`;
  if (m === '这篇论文已经在论文库里了') return 'This paper is already in your library';
  if ((x = m.match(/正在处理第 (\d+) \/ (\d+) 页/))) return `Processing page ${x[1]} / ${x[2]}`;
  return m;
}
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; }
  if (opts.body) init.body = opts.body;
  const r = await fetch('/api/' + path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || L(`请求失败 (${r.status})`, `Request failed (${r.status})`));
  return data;
}
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ` <a>${esc(action.label)}</a>` : '');
  if (action) $('a', t).onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 1800);
}
function pollJob(id, onUpdate, interval = 800) {
  let stop = false;
  (async function tick() {
    if (stop) return;
    try {
      const j = await api('jobs/' + id);
      onUpdate(j);
      if (j.status === 'running') setTimeout(tick, interval);
    } catch (e) { onUpdate({ status: 'error', message: e.message, errors: [] }); }
  })();
  return () => { stop = true; };
}

/* ================================================================ 主题 */
const theme = store.get('theme', null);
if (theme) document.documentElement.dataset.theme = theme;
function toggleTheme() {
  const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  store.set('theme', document.documentElement.dataset.theme);
}
const APP = () => L('Lecta · 课读', 'Lecta');
const brandHTML = () => `<a class="brand" href="#/"><span class="logo"><i></i></span><b>Lecta</b>${LANG === 'zh' ? '<small>课读</small>' : ''}</a>`;

/* ================================================================ 导航 / 路由 */
let VSTAT = null;  // 单词本统计（导航上的待复习数字）
function navHTML(active) {
  const due = VSTAT?.due || 0;
  const a = (k, href, ic, label, extra = '') => `<a href="${href}" class="${active === k ? 'on' : ''}">${icon(ic)}<span>${label}</span>${extra}</a>`;
  return `<nav class="topnav">${a('home', '#/', 'book', L('课程', 'Courses'))}${a('papers', '#/papers', 'paper', L('论文', 'Papers'))}${a('quizzes', '#/quizzes', 'check', L('题库', 'Quizzes'))}${a('vocab', '#/vocab', 'cards', L('单词本', 'Words'), due ? `<em class="dot-n" title="${L('今天待复习', 'Due today')}">${due}</em>` : '')}</nav>`;
}
function pageBar(active) {
  return `<header class="bar">${brandHTML()}${navHTML(active)}<span class="spacer"></span>
    <div class="tools">${langBtnHTML()}<button class="chip-btn" id="setBtn">${icon('gear')}<span class="lbl">${L('AI 设置', 'AI settings')}</span></button>
      <button class="chip-btn" id="themeBtn" title="${L('切换深浅色', 'Light / dark')}">${icon('moon')}</button></div></header>`;
}
function wireBar() {
  $('#setBtn') && ($('#setBtn').onclick = openSettings);
  $('#themeBtn') && ($('#themeBtn').onclick = toggleTheme);
  $('#langBtn') && ($('#langBtn').onclick = () => switchLang());
}
function refreshNav(active) {
  loadVocab(true).then(() => { const n = $('.topnav'); if (n) n.outerHTML = navHTML(active); }).catch(() => {});
}

let cleanup = () => {};
function route() {
  cleanup(); cleanup = () => {};
  hidePop();
  const h = location.hash;
  const qs = new URLSearchParams(h.split('?')[1] || '');
  let m;
  if ((m = h.match(/^#\/deck\/([^/?]+)(?:\/(\d+))?/))) openReader(decodeURIComponent(m[1]), +(m[2] || 0));
  else if ((m = h.match(/^#\/quiz\/([^/?]+)(?:\/(\d+))?/))) openQuiz(decodeURIComponent(m[1]), +(m[2] || 0), qs.get('f'));
  else if ((m = h.match(/^#\/paper\/([^/?]+)(?:\/(\d+))?/))) openPaper(decodeURIComponent(m[1]), +(m[2] || 0));
  else if (h.startsWith('#/papers')) showPapers(qs.get('f') || '', qs.get('q') || '');
  else if (h.startsWith('#/quizzes')) showQuizzes();
  else if (h.startsWith('#/vocab/review')) openReview(qs.get('course') || '', qs.get('all') === '1');
  else if (h.startsWith('#/vocab')) showVocab(qs.get('course') || '');
  else { m = h.match(/^#\/course\/([^/?]+)/); showLibrary(m ? decodeURIComponent(m[1]) : ''); }
}
addEventListener('hashchange', route);

/* ================================================================ 课程首页 */
const pendingImports = new Map(); // key -> {name, job, course}
let HOME = null;
const courseName = (m, id) => (m?.courses || []).find(c => c.id === id)?.name || '';

async function showLibrary(cf) {
  document.body.classList.remove('reading');
  document.title = APP();
  $('#app').innerHTML = pageBar('home') + `
    <main class="lib">
      <div class="lib-head">
        <div><h1>${L('我的课程', 'My courses')}</h1><p>${L('按课程整理课件和题库。读课件时划词查词、高亮批注，生词自动进单词本。', 'Slides and quizzes, organised by course. Select any word on a slide to look it up, highlight and annotate; saved words go to your word book.')}</p></div>
        <div class="row"><button class="btn" id="aiBtn">${icon('spark')}${L('给 AI 用', 'For AI')}</button>
          <button class="btn primary" id="newCourse">${icon('plus')}${L('新建课程', 'New course')}</button></div>
      </div>
      <div class="cfilter" id="cfilter"></div>
      <div id="home"></div>
      <input type="file" id="file" accept=".pptx,.ppt,.pdf,.odp,.key" multiple hidden>
    </main>`;
  wireBar();
  HOME = { cf, course: null, m: null };
  $('#newCourse').onclick = () => courseDialog();
  $('#aiBtn').onclick = aiDialog;
  $('#file').onchange = e => { [...e.target.files].forEach(f => startImport(f, HOME.course)); e.target.value = ''; };
  $('#cfilter').onclick = e => {
    const b = e.target.closest('[data-cf]'); if (!b) return;
    location.hash = b.dataset.cf ? `#/course/${encodeURIComponent(b.dataset.cf)}` : '#/';
  };
  await renderHome();
  refreshNav('home');
  const t = setInterval(() => { if (pendingImports.size) renderHome(); }, 1200);
  cleanup = () => clearInterval(t);
}

function deckCard(d) {
  const pct = d.pages ? Math.round(d.noted / d.pages * 100) : 0;
  const href = `#/deck/${encodeURIComponent(d.id)}`;
  return `<article class="deck">
    <a class="cover" href="${href}" style="background-image:url('${d.base}thumbs/001.jpg')" aria-label="${esc(d.title)}"></a>
    ${d.example ? '' : `<button class="ibtn menu" data-dmenu="${esc(d.id)}" title="${L('课件设置', 'Deck settings')}">${icon('dots')}</button>`}
    <div class="body">
      <h3><a href="${href}">${esc(d.title)}</a></h3>
      <div class="meta">${d.example ? `<span class="badge">${L('示例', 'Sample')}</span>` : ''}<span>${L(`${d.pages} 页`, `${d.pages} pages`)}</span>
        <span class="meter" title="${L('已有讲解', 'Notes')} ${d.noted}/${d.pages}"><i style="width:${pct}%"></i></span><span>${L('讲解', 'Notes')} ${d.noted}/${d.pages}</span>
        ${d.marks ? `<span class="mk" title="${L(`${d.marks} 页有标注`, `${d.marks} annotated pages`)}">${icon('edit')}${d.marks}</span>` : ''}</div>
    </div></article>`;
}
// 课件按章节号排（标题里的 Ch.3 / Chapter_03），没有章节号的按标题
const chapterNo = t => { const m = String(t).match(/ch(?:apter)?[\s._-]*0*(\d+)/i); return m ? +m[1] : Infinity; };
const byChapter = (a, b) => chapterNo(a.title) - chapterNo(b.title) || a.title.localeCompare(b.title, 'zh');
function stackBar(st) {
  const w = x => (st.total ? x / st.total * 100 : 0) + '%';
  return `<span class="stack"><i class="ok" style="width:${w(st.right)}"></i><i class="bad" style="width:${w(st.wrong)}"></i></span>`;
}
function quizCard(z) {
  const st = z.stats, done = st.right + st.wrong;
  return `<article class="quiz-card">
    <a class="qc-link" href="#/quiz/${encodeURIComponent(z.id)}">
      <span class="qc-icon">${icon('check')}</span>
      <span class="qc-body"><b>${esc(z.title)}</b>
        <small>${L(`${z.count} 题`, pl(z.count, 'question'))} · ${z.chapters.map(c => 'Ch.' + esc(c.key)).join(' / ')} · ${L('已做', 'done')} ${done}/${z.count}${st.wrong ? ` · <span class="bad">${L('错', 'wrong')} ${st.wrong}</span>` : ''}</small>
        ${stackBar(st)}</span></a>
    <button class="ibtn" data-qmenu="${esc(z.id)}" title="${L('题库设置', 'Quiz settings')}">${icon('dots')}</button></article>`;
}
function pendingCards(course) {
  return [...pendingImports.values()].filter(p => (p.course || '') === (course || '')).map(p => {
    const j = p.job || {}; const pct = j.total ? Math.round(j.done / j.total * 100) : 4;
    const failed = j.status === 'error';
    return `<article class="deck pending ${failed ? 'failed' : ''}">
      <div class="cover">${esc(srvMsg(failed ? j.message : (j.message || L('正在上传…', 'Uploading…'))))}</div>
      <div class="body"><h3>${esc(p.name)}</h3>
        <div class="meta">${failed ? `<button class="btn sm" data-dismiss="${esc(p.id)}">${L('知道了', 'OK')}</button>` : `<span class="meter"><i style="width:${pct}%"></i></span><span>${pct}%</span>`}</div></div></article>`;
  }).join('');
}

async function renderHome() {
  const el = $('#home'); if (!el) return;
  let m, words = [];
  try { [m, words] = await Promise.all([api('manifest'), loadVocab()]); } catch (e) { toast(e.message); return; }
  if (!$('#home')) return;
  if (await migrateOldQuizzes(m)) return renderHome();
  HOME.m = m;
  const groups = m.courses.map(c => ({ ...c, key: c.id }));
  const un = m.unassigned;
  const loosePending = [...pendingImports.values()].some(p => !p.course);
  if (un.decks.length || un.quizzes.length || loosePending || !groups.length)
    groups.push({ key: '', id: '', name: L('未分类', 'Unsorted'), color: '#847e72', decks: un.decks, quizzes: un.quizzes, loose: true });
  const cf = HOME.cf;
  $('#cfilter').innerHTML = (groups.length > 1 ? `<button data-cf="" class="${!cf ? 'on' : ''}">${L('全部课程', 'All courses')}</button>` : '') +
    groups.filter(g => !g.loose).map(g => `<button data-cf="${esc(g.id)}" class="${cf === g.id ? 'on' : ''}"><i style="background:${esc(g.color)}"></i>${esc(g.name)}</button>`).join('');
  const shown = cf ? groups.filter(g => g.key === cf) : groups;
  if (cf && !shown.length) { location.hash = '#/'; return; }
  el.innerHTML = shown.map(g => {
    const nW = g.loose ? 0 : words.filter(v => v.course === g.id).length;
    const meta = [g.code, L(`${g.decks.length} 份课件`, pl(g.decks.length, 'deck')), L(`${g.quizzes.length} 套题`, pl(g.quizzes.length, 'quiz', 'quizzes')), nW ? `<a href="#/vocab?course=${encodeURIComponent(g.id)}">${L(`${nW} 个生词`, pl(nW, 'word'))}</a>` : ''].filter(Boolean).join(' · ');
    const pend = pendingCards(g.key);
    return `<section class="course" data-course="${esc(g.key)}" style="--cc:${esc(g.color)}">
      <div class="course-head">
        <span class="cbar"></span>
        <div class="ct"><h2>${esc(g.name)}</h2><p>${meta}${g.desc ? ` · ${esc(g.desc)}` : ''}</p></div>
        <span class="spacer"></span>
        ${g.decks.length ? `<button class="btn sm ghost" data-squiz="${esc(g.key)}" title="${L('根据这门课的课件出选择题', 'Write practice questions from this course’s slides')}">${icon('spark')}${L('AI 出题', 'AI quiz')}</button>` : ''}
        <button class="btn sm" data-import="${esc(g.key)}">${icon('upload')}${L('导入课件', 'Import slides')}</button>
        ${g.loose ? '' : `<button class="ibtn" data-cedit="${esc(g.id)}" title="${L('课程设置', 'Course settings')}">${icon('dots')}</button>`}
      </div>
      ${g.quizzes.length ? `<div class="quiz-cards">${g.quizzes.map(quizCard).join('')}</div>` : ''}
      <div class="grid">${pend}${g.decks.slice().sort(byChapter).map(deckCard).join('')}
        ${!g.decks.length && !pend ? `<button class="drop small" data-import="${esc(g.key)}"><span class="big">${icon('upload')}</span><b>${L('导入第一份课件', 'Import your first deck')}</b><span>${L('拖进这里，或点击选择 .pptx / .pdf', 'Drop it here, or click to choose a .pptx / .pdf')}</span></button>` : ''}</div>
    </section>`;
  }).join('');

  $$('[data-import]', el).forEach(b => b.onclick = () => { HOME.course = b.dataset.import || null; $('#file').click(); });
  $$('[data-squiz]', el).forEach(b => b.onclick = () => {
    const g = groups.find(x => x.key === b.dataset.squiz); if (!g) return;
    const ds = g.decks.slice().sort(byChapter);
    studioDialog('quiz', ds, ds.filter(d => d.noted).map(d => d.id), g.id || null);
  });
  $$('[data-cedit]', el).forEach(b => b.onclick = () => courseDialog(m.courses.find(c => c.id === b.dataset.cedit)));
  $$('[data-dismiss]', el).forEach(b => b.onclick = () => { pendingImports.delete(b.dataset.dismiss); renderHome(); });
  const allDecks = [...m.courses.flatMap(c => c.decks.map(d => ({ ...d, course: c.id }))), ...un.decks];
  const allQuizzes = [...m.courses.flatMap(c => c.quizzes.map(z => ({ ...z, course: c.id }))), ...un.quizzes];
  $$('[data-dmenu]', el).forEach(b => b.onclick = e => { e.preventDefault(); deckMenu(allDecks.find(d => d.id === b.dataset.dmenu), allDecks); });
  $$('[data-qmenu]', el).forEach(b => b.onclick = e => { e.preventDefault(); quizMenu(allQuizzes.find(z => z.id === b.dataset.qmenu)); });
  // 把文件拖到某门课上，就导入到那门课
  $$('section.course', el).forEach(sec => {
    sec.addEventListener('dragover', e => { e.preventDefault(); sec.classList.add('over'); });
    sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('over'); });
    sec.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); sec.classList.remove('over');
      [...e.dataTransfer.files].forEach(f => startImport(f, sec.dataset.course || null));
    });
  });
}
// 拖到页面其它地方：导入到当前筛选的课程（没有筛选就是未分类）
document.addEventListener('dragover', e => { if (!location.hash.startsWith('#/deck') && !location.hash.startsWith('#/paper/')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (location.hash.startsWith('#/deck') || e.target.closest('section.course')) return;
  e.preventDefault();
  if ($('#plist')) { [...(e.dataTransfer?.files || [])].forEach(f => importPaper(f, PL?.folder && PL.folder !== '-' ? PL.folder : null)); return; }
  if (!$('#home')) return;
  [...(e.dataTransfer?.files || [])].forEach(f => startImport(f, HOME?.cf || null));
});

async function startImport(file, course) {
  if (!/\.(pptx|ppt|pdf|odp|key)$/i.test(file.name)) return toast(L(`不支持的文件：${file.name}`, `Unsupported file: ${file.name}`));
  const key = 'up-' + Math.random().toString(36).slice(2);
  pendingImports.set(key, { id: key, name: file.name, job: { message: L('正在上传…', 'Uploading…') }, course: course || null });
  renderHome();
  try {
    const job = await api('import', { method: 'POST', body: file, headers: { 'X-Filename': encodeURIComponent(file.name) } });
    pendingImports.get(key).job = job;
    pollJob(job.id, async j => {
      const p = pendingImports.get(key); if (!p) return;
      p.job = j;
      if (j.status === 'done') {
        if (course) { try { await api('decks/' + encodeURIComponent(j.result), { method: 'PUT', json: { course } }); } catch {} }
        pendingImports.delete(key);
        renderHome();
        toast(L(`《${file.name}》导入完成`, `“${file.name}” imported`), { label: L('打开', 'Open'), fn: () => location.hash = `#/deck/${encodeURIComponent(j.result)}` });
      } else if (j.status === 'error') renderHome();
    });
  } catch (e) {
    pendingImports.get(key).job = { status: 'error', message: e.message };
    renderHome();
  }
}

function courseOptions(courses, cur) {
  return `<option value="">${L('未分类', 'Unsorted')}</option>` + courses.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
async function getCourses() { return (await api('courses')).courses; }
async function copyExport(path, label) {
  try {
    const r = await fetch('/api/' + path);
    if (!r.ok) throw new Error(L('导出失败', 'Export failed'));
    const t = await r.text();
    await copyText(t);
    toast(L(`已复制${label}（${t.length.toLocaleString()} 字），粘贴给 AI 即可`, `Copied ${label} (${t.length.toLocaleString()} characters). Paste it into your AI chat.`));
  } catch (e) { toast(e.message); }
}

async function deckMenu(d, all = []) {
  const courses = await getCourses();
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-head"><h2>${L('课件设置', 'Deck settings')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('名称', 'Name')}</span><input type="text" id="dTitle" value="${esc(d.title)}"></label>
      <label class="field"><span>${L('所属课程', 'Course')}</span><select id="dCourse">${courseOptions(courses, d.course)}</select></label>
      <div class="note-box">${L('来源文件', 'Source file')}: ${esc(d.source)} · ${L(`${d.pages} 页 · 已有讲解 ${d.noted} 页`, `${d.pages} pages · notes on ${d.noted}`)}${d.marks ? ` · ${L(`${d.marks} 页有标注`, `${d.marks} annotated`)}` : ''}<br>${L('课件 ID', 'Deck ID')}: <code>${esc(d.id)}</code></div>
      <div class="field"><span>${L('用这份课件', 'Study with this deck')}</span>
        <div class="row wrap"><button class="btn" type="button" id="dQuiz">${icon('spark')}${L('AI 出题', 'Make a quiz')}</button>
          <button class="btn" type="button" id="dWords">${icon('cards')}${L('AI 挑生词', 'Pick words')}</button>
          <button class="btn" type="button" id="dTerms" ${d.noted ? '' : 'disabled'} title="${L('把讲解卡片里的关键术语收进单词本，不用 AI', 'Save the key terms from the notes into your word book (no AI needed)')}">${icon('plus')}${L('收集讲解里的术语', 'Save key terms')}</button></div></div>
      <button class="btn" type="button" id="dCopy">${icon('copy')}${L('复制全部文字给 AI（含讲解和我的标注）', 'Copy all text for AI (with notes and my annotations)')}</button>
    </div>
    <div class="dlg-foot"><button class="btn danger ghost" type="button" id="dDel">${icon('trash')}${L('删除课件', 'Delete deck')}</button>
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="dSave">${L('保存', 'Save')}</button></div></form>`;
  $('#dCopy').onclick = () => copyExport(`decks/${encodeURIComponent(d.id)}/export`, L('课件内容', 'the deck'));
  const same = all.filter(x => (x.course || null) === (d.course || null)).sort(byChapter);
  $('#dQuiz').onclick = () => { dlg.close(); studioDialog('quiz', same.length ? same : [d], [d.id], d.course || null); };
  $('#dWords').onclick = () => { dlg.close(); studioDialog('words', [d], [d.id], d.course || null); };
  $('#dTerms').onclick = () => collectTerms({ deck: d.id });
  $('#dSave').onclick = async e => {
    e.preventDefault();
    try { await api('decks/' + encodeURIComponent(d.id), { method: 'PUT', json: { title: $('#dTitle').value, course: $('#dCourse').value || null } }); }
    catch (err) { return toast(err.message); }
    dlg.close(); renderHome();
  };
  $('#dDel').onclick = async () => {
    if (!confirm(L(`确定删除《${d.title}》吗？课件图片、讲解和标注都会被删除，无法恢复。`, `Delete “${d.title}”? Its slides, notes and annotations will be removed for good.`))) return;
    await api('decks/' + encodeURIComponent(d.id), { method: 'DELETE' }); dlg.close(); renderHome(); toast(L('已删除', 'Deleted'));
  };
  dlg.showModal();
}

async function quizMenu(z, after) {
  const courses = await getCourses();
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-head"><h2>${L('题库设置', 'Quiz settings')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('名称', 'Name')}</span><input type="text" id="zTitle" value="${esc(z.title)}"></label>
      <label class="field"><span>${L('所属课程', 'Course')}</span><select id="zCourse">${courseOptions(courses, z.course)}</select></label>
      <div class="note-box">${L(`${z.count} 题 · 答对 ${z.stats.right} · 答错 ${z.stats.wrong}`, `${z.count} questions · ${z.stats.right} right · ${z.stats.wrong} wrong`)}<br>${L('题库 ID', 'Quiz ID')}: <code>${esc(z.id)}</code></div>
      <button class="btn" type="button" id="zCopy">${icon('copy')}${L('复制题目和我的作答给 AI', 'Copy questions and my answers for AI')}</button>
      <button class="btn" type="button" id="zTerms">${icon('plus')}${L('把题目里的关键术语收进单词本', 'Save the key terms into my word book')}</button>
    </div>
    <div class="dlg-foot"><button class="btn danger ghost" type="button" id="zDel">${icon('trash')}${L('删除题库', 'Delete quiz')}</button>
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="zSave">${L('保存', 'Save')}</button></div></form>`;
  const done = () => { dlg.close(); (after || renderHome)(); };
  $('#zCopy').onclick = () => copyExport(`quizzes/${encodeURIComponent(z.id)}/export`, L('题库和作答记录', 'the quiz and your answers'));
  $('#zTerms').onclick = () => collectTerms({ quiz: z.id });
  $('#zSave').onclick = async e => {
    e.preventDefault();
    try { await api('quizzes/' + encodeURIComponent(z.id), { method: 'PUT', json: { title: $('#zTitle').value, course: $('#zCourse').value || null } }); }
    catch (err) { return toast(err.message); }
    done();
  };
  $('#zDel').onclick = async () => {
    if (!confirm(L(`确定删除题库《${z.title}》吗？题目和作答记录都会被删除，无法恢复。`, `Delete the quiz “${z.title}”? Its questions and your answers will be removed for good.`))) return;
    await api('quizzes/' + encodeURIComponent(z.id), { method: 'DELETE' }); done(); toast(L('已删除', 'Deleted'));
  };
  dlg.showModal();
}

const SWATCHES = ['#0e5d6f', '#a63d2f', '#6b4fa0', '#2e7d4f', '#b8791f', '#3d5a99', '#8a5a44', '#4a463e'];
function courseDialog(c) {
  const dlg = $('#dlg');
  let color = c?.color || SWATCHES[0];
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-head"><h2>${c ? L('课程设置', 'Course settings') : L('新建课程', 'New course')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('课程名称', 'Course name')}</span><input type="text" id="cName" value="${esc(c?.name || '')}" placeholder="${L('例如：微观经济学 Principles of Microeconomics', 'e.g. Principles of Microeconomics')}"></label>
      <div class="two">
        <label class="field"><span>${L('课程代码', 'Course code')}</span><input type="text" id="cCode" value="${esc(c?.code || '')}" placeholder="${L('例如', 'e.g.')} ECON101"></label>
        <div class="field"><span>${L('颜色', 'Colour')}</span><div class="swatches" id="cSw">${SWATCHES.map(s => `<button type="button" data-c="${s}" style="background:${s}" class="${s === color ? 'on' : ''}"></button>`).join('')}</div></div>
      </div>
      <label class="field"><span>${L('备注', 'Note')}</span><input type="text" id="cDesc" value="${esc(c?.desc || '')}" placeholder="${L('教材、老师、考试时间…（可空）', 'Textbook, lecturer, exam date… (optional)')}"></label>
      ${c ? `<div class="note-box">${L('课程 ID', 'Course ID')}: <code>${esc(c.id)}</code>${L('（AI 导入课件时用', ' (AI uses')} <code>--course ${esc(c.id)}</code>${L('）', ' when importing)')}</div>` : ''}
    </div>
    <div class="dlg-foot">${c ? `<button class="btn danger ghost" type="button" id="cDel">${icon('trash')}${L('删除课程', 'Delete course')}</button>` : ''}
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="cSave">${c ? L('保存', 'Save') : L('创建', 'Create')}</button></div></form>`;
  $('#cSw').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#cSw button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#cSave').onclick = async e => {
    e.preventDefault();
    const body = { name: $('#cName').value, code: $('#cCode').value, desc: $('#cDesc').value, color };
    try { await api(c ? 'courses/' + encodeURIComponent(c.id) : 'courses', { method: c ? 'PUT' : 'POST', json: body }); }
    catch (err) { return toast(err.message); }
    dlg.close(); renderHome(); toast(c ? L('已保存', 'Saved') : L('课程已创建，可以把课件拖进去了', 'Course created. Drop slides onto it to import.'));
  };
  $('#cDel') && ($('#cDel').onclick = async () => {
    if (!confirm(L(`删除课程《${c.name}》？里面的课件、题库和生词都会保留，变成“未分类”。`, `Delete the course “${c.name}”? Its decks, quizzes and words are kept and become “Unsorted”.`))) return;
    await api('courses/' + encodeURIComponent(c.id), { method: 'DELETE' }); dlg.close();
    if (HOME?.cf === c.id) location.hash = '#/'; else renderHome();
  });
  dlg.showModal();
  if (!c) $('#cName').focus();
}

function aiDialog() {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog" class="aiinfo">
    <div class="dlg-head"><div><h2>${L('让 AI 读懂和管理课件库', 'Let AI read and manage your library')}</h2><p class="sub">${L('把下面的说明交给 Claude / ChatGPT / Codex 等 AI 助手，它就能看懂课件、把新课件和题库放进对应课程。', 'Give this to an AI assistant (Claude, ChatGPT, Codex…) and it can read your slides and file new decks and quizzes under the right course.')}</p></div>
      <button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <ol class="steps">
        <li><div class="st-h"><b>${L('让 AI 先读说明书', 'Have the AI read the guide first')}</b></div>
          <p>${L('项目文件夹里的 <code>AI_GUIDE.md</code> 写清了课件库的结构、命令和题库格式。用本机的 AI 助手（如 Claude Code）打开这个文件夹即可。', '<code>AI_GUIDE.md</code> in the project folder explains the library layout, the commands and the quiz format. Open the folder with a local AI assistant such as Claude Code.')}</p>
          <p class="muted">${L('当前学习语言：<b>中文</b>。AI 会按这个语言写讲解、释义和解析（命令 <code>python -m kejian list</code> 会告诉它）。', 'Study language: <b>English</b>. The AI writes notes, definitions and explanations in this language (<code>python -m kejian list</code> tells it).')}</p></li>
        <li><div class="st-h"><b>${L('常用命令', 'Common commands')}</b></div>
          <pre>${L(`python -m kejian list                 # 课程、课件、题库总览
python -m kejian export &lt;课件ID&gt;        # 课件全文（含讲解、我的标注）
python -m kejian import 新课件.pptx --course &lt;课程ID&gt;
python -m kejian quiz 题库.json --course &lt;课程ID&gt;
python -m kejian export vocab          # 单词本和复习情况`, `python -m kejian list                  # courses, decks, quizzes
python -m kejian export &lt;deck-id&gt;      # full text (with notes and annotations)
python -m kejian import slides.pptx --course &lt;course-id&gt;
python -m kejian quiz quiz.json --course &lt;course-id&gt;
python -m kejian export vocab           # word book and review status`)}</pre></li>
        <li><div class="st-h"><b>${L('用网页版 AI？', 'Using AI in a browser?')}</b></div>
          <p>${L('直接复制内容粘贴过去：', 'Copy and paste:')}</p>
          <div class="row"><button class="btn sm" type="button" id="aiMan">${icon('copy')}${L('复制课件库总览（JSON）', 'Copy library overview (JSON)')}</button>
            <button class="btn sm" type="button" id="aiVoc">${icon('copy')}${L('复制单词本', 'Copy word book')}</button></div>
          <p class="muted">${L('单份课件或题库：在它的“⋯”菜单里点“复制给 AI”。', 'For one deck or quiz, use “Copy for AI” in its ⋯ menu.')}</p></li>
      </ol>
    </div>
    <div class="dlg-foot"><span class="spacer"></span><button class="btn primary" value="cancel">${L('知道了', 'Got it')}</button></div></form>`;
  $('#aiMan').onclick = async () => { const m = await api('manifest'); await copyText(JSON.stringify(m, null, 2)); toast(L('已复制课件库总览', 'Library overview copied')); };
  $('#aiVoc').onclick = () => copyExport('vocab/export', L('单词本', 'the word book'));
  dlg.showModal();
}

/* ================================================================ AI 设置 */
const MODES = () => [
  { id: 'web', name: L('网页版 AI', 'AI in browser'), tag: L('推荐 · 免 Key', 'Recommended · no key'), desc: L('用你已有的 ChatGPT / Claude / Kimi / DeepSeek 网页账号：复制提示词、粘贴回复，几分钟搞定一整章。', 'Use your ChatGPT / Claude / Kimi / DeepSeek account: copy a prompt, paste the reply back. A whole chapter takes minutes.') },
  { id: 'claude-cli', name: 'Claude Code', tag: L('订阅账号 · 自动', 'Subscription · automatic'), desc: L('电脑上装了 Claude Code 并登录了 Claude 订阅？一键自动批量生成，用的是订阅额度。', 'Claude Code installed and signed in to a Claude plan? Generate in one click using your plan’s usage.') },
  { id: 'api', name: 'API Key', tag: L('自动 · 按量付费', 'Automatic · pay per use'), desc: L('Claude、OpenAI、DeepSeek、通义、Kimi、Ollama… 填入 Key，全自动、可并发。', 'Claude, OpenAI, DeepSeek, Qwen, Kimi, Ollama… Enter a key; fully automatic and parallel.') },
  { id: 'outline', name: L('离线提纲', 'Offline outline'), tag: L('不用 AI', 'No AI'), desc: L('直接把页面文字整理成提纲，之后随时可以换成 AI 重写。', 'Turn the slide text into an outline. You can rewrite it with AI later.') },
];
const modeOf = prov => (prov === 'web' || prov === 'claude-cli' || prov === 'outline') ? prov : 'api';

async function openSettings() {
  const s = await api('settings');
  const dlg = $('#dlg');
  let mode = modeOf(s.provider);
  const apiProv = mode === 'api' ? s.provider : 'anthropic';
  const opts = Object.entries(s.presets).filter(([k]) => modeOf(k) === 'api')
    .map(([k, p]) => `<option value="${k}" ${k === apiProv ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  dlg.innerHTML = `<form method="dialog" class="settings">
    <div class="dlg-head"><h2>${L('讲解怎么生成？', 'How should notes be written?')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <div class="modes" role="radiogroup">${MODES().map(m => `
        <button type="button" class="mode" role="radio" data-mode="${m.id}">
          <b>${m.name}</b><em>${m.tag}</em><span>${m.desc}</span></button>`).join('')}</div>

      <div class="msec" data-for="web">
        <label class="field"><span>${L('每组几页', 'Pages per batch')}</span><select id="sBatch">
          ${[5, 8, 12, 20].map(v => `<option ${+s.batch === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <small>${L('一组复制粘贴一次。页数越多次数越少，但太多时网页版可能写不完，8 页左右最稳。', 'One copy-paste per batch. Bigger batches mean fewer rounds, but web chats may stop early; about 8 pages is safest.')}</small></label>
      </div>

      <div class="msec" data-for="claude-cli">
        <div class="status ${s.claude_cli ? 'ok' : 'bad'}">${s.claude_cli ? L('✓ 已检测到本机的 Claude Code。第一次用请点“测试连接”确认已登录。', '✓ Claude Code found on this computer. Click “Test connection” the first time to check you are signed in.') :
          L('没有检测到 Claude Code。安装后在终端运行一次 <code>claude</code> 用你的账号登录，再回来点“测试连接”。', 'Claude Code was not found. Install it, run <code>claude</code> once in a terminal to sign in, then click “Test connection”.')}</div>
        <div class="two">
          <label class="field"><span>${L('模型', 'Model')}</span><select id="sCliModel">
            ${[['', L('账号默认', 'Account default')], ['sonnet', L('Sonnet（快、省额度）', 'Sonnet (fast, light on usage)')], ['opus', L('Opus（更细致）', 'Opus (more thorough)')]].map(([v, l]) => `<option value="${v}" ${s.cli_model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" class="sImg" ${s.send_images ? 'checked' : ''}><span>${L('让它看幻灯片图片', 'Let it see slide images')}<br><small class="muted">${L('图表页更准，稍慢一些', 'Better on charts, a bit slower')}</small></span></label>
        </div>
        <small class="muted">${L('每页调用一次 Claude Code，最多同时 2 页，消耗的是你的订阅用量。', 'One Claude Code call per page, at most 2 at a time, using your plan’s usage.')}</small>
      </div>

      <div class="msec" data-for="api">
        <label class="field"><span>${L('服务商', 'Provider')}</span><select id="sProv">${opts}</select><small id="sProvHint"></small></label>
        <div class="two">
          <label class="field"><span>${L('模型', 'Model')}</span><input type="text" id="sModel" value="${esc(mode === 'api' ? s.model : '')}"></label>
          <label class="field" id="sBaseF"><span>${L('接口地址 Base URL', 'Base URL')}</span><input type="text" id="sBase" value="${esc(mode === 'api' ? s.base_url : '')}" placeholder="${L('留空使用官方地址', 'Leave empty for the official endpoint')}"></label>
        </div>
        <label class="field"><span>API Key</span>
          <input type="password" id="sKey" placeholder="${s.api_key_set ? L('已保存：', 'Saved: ') + esc(s.api_key_hint) + L('（留空保持不变）', ' (leave empty to keep)') : (s.env_key_set ? L('已从环境变量读取，可留空', 'Read from an environment variable; can stay empty') : L('粘贴你的 API Key', 'Paste your API key'))}" autocomplete="off">
          <small>${L('Key 只保存在本机的 config.local.json 里，不会上传到任何地方。', 'The key is stored only in config.local.json on this computer and is never uploaded.')}</small></label>
        <div class="two">
          <label class="field" id="sEffF"><span>${L('推理强度（Claude）', 'Effort (Claude)')}</span><select id="sEff">
            ${['low', 'medium', 'high'].map(v => `<option ${s.effort === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>${L('并发数', 'Parallel requests')}</span><input type="number" id="sConc" min="1" max="8" value="${s.concurrency}"></label>
        </div>
        <label class="check"><input type="checkbox" class="sImg" ${s.send_images ? 'checked' : ''}><span>${L('把幻灯片图片一起发给模型', 'Send slide images to the model')}<br><small class="muted">${L('图表页更准；模型不支持看图时自动退回纯文字', 'Better on charts; falls back to text if the model cannot read images')}</small></span></label>
      </div>

      <label class="field"><span>${L('学习语言（界面、查词释义、单词本和 AI 讲解）', 'Study language (interface, definitions, word book and AI notes)')}</span><select id="sLang">
        <option value="zh" ${s.language === 'zh' ? 'selected' : ''}>中文（保留英文术语）</option>
        <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option></select></label>
      <div class="test-msg" id="sMsg"></div>
    </div>
    <div class="dlg-foot"><button class="btn" type="button" id="sTest">${L('测试连接', 'Test connection')}</button><span class="spacer"></span>
      <button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="sSave">${L('保存', 'Save')}</button></div></form>`;

  const prov = $('#sProv');
  const syncProv = fill => {
    const p = s.presets[prov.value];
    $('#sEffF').style.visibility = prov.value === 'anthropic' ? 'visible' : 'hidden';
    $('#sBaseF').style.display = prov.value === 'anthropic' ? 'none' : '';
    if (fill) { $('#sModel').value = p.model; $('#sBase').value = p.base_url; }
    $('#sProvHint').textContent = prov.value === 'anthropic' ? L('官方 anthropic SDK，结构化输出 + 提示缓存。', 'Official anthropic SDK with structured output and prompt caching.') : L('OpenAI 及兼容接口（DeepSeek、通义、Kimi、Ollama 等）。', 'OpenAI and compatible APIs (DeepSeek, Qwen, Kimi, Ollama…).');
  };
  const setMode = m => {
    mode = m;
    dlg.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === m));
    dlg.querySelectorAll('.msec').forEach(x => { x.hidden = x.dataset.for !== m; });
    $('#sTest').style.visibility = (m === 'claude-cli' || m === 'api') ? 'visible' : 'hidden';
    $('#sMsg').textContent = '';
  };
  dlg.querySelectorAll('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  dlg.querySelectorAll('.sImg').forEach(c => c.onchange = () => dlg.querySelectorAll('.sImg').forEach(o => { o.checked = c.checked; }));
  prov.onchange = () => syncProv(true);
  syncProv(mode !== 'api');
  setMode(mode);

  const collect = () => {
    const base = { language: $('#sLang').value, lang_chosen: true, send_images: dlg.querySelector('.sImg').checked, batch: +$('#sBatch').value, cli_model: $('#sCliModel').value };
    if (mode !== 'api') return { ...base, provider: mode };
    return { ...base, provider: prov.value, model: $('#sModel').value.trim(), base_url: $('#sBase').value.trim(), effort: $('#sEff').value,
      concurrency: Math.max(1, Math.min(8, +$('#sConc').value || 3)), ...($('#sKey').value.trim() ? { api_key: $('#sKey').value.trim() } : {}) };
  };
  const applied = r => { if (R) { R.settings = r; if (!R.editing) renderNotes(); } };
  $('#sSave').onclick = async e => {
    e.preventDefault();
    const r = await api('settings', { method: 'PUT', json: collect() });
    applied(r);
    dlg.close();
    if (r.language !== LANG) { setLangLocal(r.language); route(); }
    toast(L('设置已保存', 'Settings saved'));
  };
  $('#sTest').onclick = async () => {
    const msg = $('#sMsg'); msg.className = 'test-msg'; msg.textContent = L('正在测试…（Claude Code 第一次启动可能要十几秒）', 'Testing… (Claude Code can take a few seconds to start the first time)');
    applied(await api('settings', { method: 'PUT', json: collect() }));
    const r = await api('settings/test', { method: 'POST', json: {} });
    msg.className = 'test-msg ' + (r.ok ? 'ok' : 'bad'); msg.textContent = r.message;
  };
  dlg.showModal();
}

/* ================================================================ 网页版 AI 向导 */
const CHATS = [['ChatGPT', 'https://chatgpt.com/'], ['Claude', 'https://claude.ai/new'], ['Kimi', 'https://kimi.com/'],
  ['DeepSeek', 'https://chat.deepseek.com/'], ['豆包 Doubao', 'https://www.doubao.com/chat/'], ['通义 Qwen', 'https://tongyi.aliyun.com/']];

function groupsOf(N, size) { const g = []; for (let i = 1; i <= N; i += size) g.push(Array.from({ length: Math.min(size, N - i + 1) }, (_, k) => i + k)); return g; }
const rangeLabel = g => g.length === 1 ? L(`第 ${g[0]} 页`, `page ${g[0]}`) : L(`第 ${g[0]}–${g[g.length - 1]} 页`, `pages ${g[0]}–${g[g.length - 1]}`);

function openWebWizard(focusPage) {
  const dlg = $('#dlg');
  const groups = groupsOf(R.N, +(R.settings?.batch) || 8);
  const doneIn = g => g.filter(n => R.notes[n]).length;
  let gi = focusPage ? groups.findIndex(g => g.includes(focusPage)) : groups.findIndex(g => doneIn(g) < g.length);
  if (gi < 0) gi = 0;
  let withPdf = !!(store.get('web.pdf', false) && R.deck.has_pdf);
  let lastChat = store.get('web.chat', 'ChatGPT');

  dlg.innerHTML = `<form method="dialog" class="wiz">
    <div class="dlg-head"><div><h2>${L('用网页版 AI 写讲解', 'Write notes with a web AI')}</h2><p class="sub">${L('不需要 API Key，用你自己的 AI 账号。每组三步：复制 → 发给 AI → 粘贴回来。', 'No API key needed; use your own AI account. Three steps per batch: copy → send to the AI → paste back.')}</p></div>
      <button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <div class="groups" id="wGroups"></div>
      <ol class="steps">
        <li><div class="st-h"><b>${L('复制提示词', 'Copy the prompt')}</b><span class="muted" id="wRange"></span></div>
          <div class="row"><button class="btn primary" type="button" id="wCopy">${icon('spark')}${L('复制提示词', 'Copy prompt')}</button>
            <span class="chats">${L('打开', 'Open')} ${CHATS.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener" data-chat="${n}" class="${n === lastChat ? 'on' : ''}">${n}</a>`).join('')}</span></div>
          ${R.deck.has_pdf ? `<label class="check"><input type="checkbox" id="wPdf" ${withPdf ? 'checked' : ''}><span>${L('我会把课件 PDF 一起上传给 AI', 'I will upload the slide PDF to the AI too')} <small class="muted">${L('图表页讲得更准', 'better on charts')} ·
            <a href="${R.deck.base}source.pdf" download="${esc(R.deck.title)}.pdf">${L('下载课件 PDF', 'Download PDF')}</a></small></span></label>` : ''}
        </li>
        <li><div class="st-h"><b>${L('在 AI 网页里粘贴并发送', 'Paste it into the AI chat and send')}</b></div>
          <p class="muted">${L('第一组建议新开一个对话，后面几组在同一个对话里接着发。等它写完；如果中途停了，对它说“继续”，再把几段回复一起复制回来。', 'Start a new chat for the first batch and keep using it for the rest. Wait until it finishes; if it stops, say “continue” and copy all parts back together.')}</p></li>
        <li><div class="st-h"><b>${L('把 AI 的完整回复粘贴到这里', 'Paste the full AI reply here')}</b><span class="parse" id="wParse"></span></div>
          <textarea id="wText" spellcheck="false" placeholder="${L('点 AI 回复下方的“复制”按钮，然后在这里 Ctrl+V', 'Click “Copy” under the AI reply, then press Ctrl+V here')}"></textarea></li>
      </ol>
      <div class="test-msg" id="wMsg"></div>
    </div>
    <div class="dlg-foot"><button class="btn ghost sm" type="button" id="wSet">${icon('gear')}${L('换成自动方式', 'Switch to automatic')}</button><span class="spacer"></span>
      <button class="btn" value="cancel">${L('关闭', 'Close')}</button><button class="btn primary" type="button" id="wSave" disabled>${L('保存讲解', 'Save notes')}</button></div></form>`;

  const renderGroups = () => {
    $('#wGroups').innerHTML = groups.map((g, i) => {
      const d = doneIn(g);
      return `<button type="button" data-i="${i}" class="${i === gi ? 'on' : ''} ${d === g.length ? 'full' : d ? 'part' : ''}" title="${L('已有讲解', 'Notes')} ${d}/${g.length}">${g[0]}${g.length > 1 ? '–' + g[g.length - 1] : ''}${d === g.length ? ' ✓' : ''}</button>`;
    }).join('');
    const g = groups[gi], d = doneIn(g);
    $('#wRange').textContent = rangeLabel(g) + (d ? L(` · 其中 ${d} 页已有讲解，保存后会替换`, ` · ${d} already have notes and will be replaced`) : '');
  };
  const parsePreview = () => {
    const t = $('#wText').value, g = groups[gi], el = $('#wParse');
    const found = [...new Set([...t.matchAll(/"page"\s*:\s*"?(\d+)/g)].map(m => +m[1]))];
    $('#wSave').disabled = !t.trim();
    if (!t.trim()) { el.textContent = ''; return; }
    if (!found.length) { el.className = 'parse bad'; el.textContent = L('还没认出页码，确认复制了完整回复', 'No page numbers found yet. Make sure you copied the whole reply.'); return; }
    const miss = g.filter(n => !found.includes(n));
    el.className = 'parse ' + (miss.length ? 'warn' : 'ok');
    el.textContent = L(`认出 ${found.length} 页`, `${found.length} pages found`) + (miss.length ? L(` · 缺第 ${miss.join('、')} 页`, ` · missing ${miss.join(', ')}`) : ' ✓');
  };
  renderGroups();

  $('#wGroups').onclick = e => { const b = e.target.closest('button'); if (!b) return; gi = +b.dataset.i; renderGroups(); parsePreview(); $('#wMsg').textContent = ''; };
  $('#wPdf') && ($('#wPdf').onchange = e => { withPdf = e.target.checked; store.set('web.pdf', withPdf); });
  dlg.querySelectorAll('[data-chat]').forEach(a => a.onclick = () => {
    lastChat = a.dataset.chat; store.set('web.chat', lastChat);
    dlg.querySelectorAll('[data-chat]').forEach(x => x.classList.toggle('on', x === a));
  });
  $('#wCopy').onclick = async () => {
    const g = groups[gi], msg = $('#wMsg');
    try {
      const r = await api(`decks/${encodeURIComponent(R.id)}/prompt`, { method: 'POST', json: { pages: g, with_pdf: withPdf } });
      await copyText(r.prompt);
      msg.className = 'test-msg ok';
      msg.textContent = L(`已复制${rangeLabel(g)}的提示词（${r.prompt.length.toLocaleString()} 字）。去 ${lastChat} 粘贴发送${withPdf ? '，记得把课件 PDF 一起拖进对话框' : ''}。`,
        `Prompt for ${rangeLabel(g)} copied (${r.prompt.length.toLocaleString()} characters). Paste it into ${lastChat} and send${withPdf ? ', and drag the slide PDF into the chat too' : ''}.`);
    } catch (e) { msg.className = 'test-msg bad'; msg.textContent = e.message; }
  };
  $('#wText').oninput = parsePreview;
  $('#wSet').onclick = () => { dlg.close(); openSettings(); };
  $('#wSave').onclick = async () => {
    const g = groups[gi], msg = $('#wMsg');
    try {
      const r = await api(`decks/${encodeURIComponent(R.id)}/paste`, { method: 'POST', json: { text: $('#wText').value, pages: g } });
      R.notes = await api(`decks/${encodeURIComponent(R.id)}/notes`);
      updateStrip(); if (!R.editing) renderNotes();
      $('#wText').value = ''; parsePreview();
      const next = groups.findIndex((x, i) => i > gi && doneIn(x) < x.length);
      msg.className = 'test-msg ' + (r.missing.length ? 'bad' : 'ok');
      msg.textContent = L(`已保存 ${r.saved.length} 页讲解`, `Saved notes for ${r.saved.length} pages`) + (r.missing.length ? L(`；第 ${r.missing.join('、')} 页没找到，可以让 AI 补写这几页，再把回复粘贴进来。`, `; pages ${r.missing.join(', ')} were missing. Ask the AI to write them and paste the reply again.`) :
        next >= 0 ? L(`。下一组：${rangeLabel(groups[next])}，点“复制提示词”，在同一个对话里发送。`, `. Next: ${rangeLabel(groups[next])}. Click “Copy prompt” and send it in the same chat.`) : L('。整份课件都有讲解了 🎉', '. Every page has notes now 🎉'));
      if (!r.missing.length && next >= 0) gi = next;
      renderGroups();
    } catch (e) { msg.className = 'test-msg bad'; msg.textContent = e.message; }
  };
  dlg.showModal();
}

/* ---------- 讲解 → 题库 → 单词本：AI 出题、AI 挑生词 ---------- */
// kind: 'quiz' | 'words'；decks: 可选的课件 [{id, title}]；pick: 预先勾选的课件 ID
async function studioDialog(kind, decks, pick, course) {
  const dlg = $('#dlg');
  let settings = {};
  try { settings = await api('settings'); } catch {}
  const auto = !!settings.provider && !['web', 'outline'].includes(settings.provider);   // Claude Code / API：可以一键生成
  const engine = settings.provider === 'claude-cli' ? 'Claude Code' : 'API';
  const isQuiz = kind === 'quiz';
  let lastChat = store.get('web.chat', 'ChatGPT');
  const sel = new Set(pick && pick.length ? pick : decks.slice(0, 1).map(d => d.id));
  dlg.innerHTML = `<form method="dialog" class="wiz studio">
    <div class="dlg-head"><div><h2>${isQuiz ? L('AI 出题', 'Make a quiz with AI') : L('AI 挑生词', 'Pick words with AI')}</h2>
      <p class="sub">${isQuiz ? L('根据课件出选择题：每道题都标好出自哪一页，自动放进同一门课，做错的题能一键跳回课件。', 'Multiple-choice questions from your slides. Each one links back to its slide, and the quiz goes into the same course.')
        : L('从课件里挑出该背的术语和难词：带中英释义、页码和原句，直接进单词本复习。', 'Subject terms and hard words from the slides, with meanings, page numbers and the original sentence, straight into your word book.')}</p></div>
      <button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <div class="st-opts">
        ${isQuiz ? `<div class="field"><span>${L('出自哪些课件', 'From these decks')}</span><div class="deck-picks">${decks.map(d => `<label class="check"><input type="checkbox" value="${esc(d.id)}" ${sel.has(d.id) ? 'checked' : ''}><span>${esc(d.title)}</span></label>`).join('')}</div></div>`
          : `<div class="note-box">${esc(decks.find(d => sel.has(d.id))?.title || '')}</div>`}
        <div class="row">
          <label class="field"><span>${isQuiz ? L('题数', 'Questions') : L('最多几个词', 'Up to')}</span><select id="sCount">${(isQuiz ? [5, 10, 15, 20, 30] : [10, 20, 30, 40]).map(n => `<option ${n === (isQuiz ? 10 : 20) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          ${isQuiz ? `<label class="field grow"><span>${L('侧重点（可不填）', 'Focus (optional)')}</span><input type="text" id="sFocus" placeholder="${L('例如：计算题、容易混淆的概念、第 3–5 页', 'e.g. calculations, easily confused ideas, slides 3–5')}"></label>`
            : `<label class="field grow"><span>${L('页码（可不填）', 'Pages (optional)')}</span><input type="text" id="sPages" placeholder="${L('例如 1-10；不填就是整份课件', 'e.g. 1-10; blank means all')}"></label>`}
        </div>
      </div>
      ${auto ? `<div class="auto-box"><button class="btn primary" type="button" id="sRun">${icon('spark')}${L(`用 ${engine} 自动生成`, `Generate with ${engine}`)}</button><span class="muted" id="sRunMsg">${L('或者用下面的网页版方式', 'or use a web AI below')}</span></div>` : ''}
      <ol class="steps">
        <li><div class="st-h"><b>${L('复制提示词', 'Copy the prompt')}</b></div>
          <div class="row"><button class="btn ${auto ? '' : 'primary'}" type="button" id="sCopy">${icon('copy')}${L('复制提示词', 'Copy prompt')}</button>
            <span class="chats">${L('打开', 'Open')} ${CHATS.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener" data-chat="${n}" class="${n === lastChat ? 'on' : ''}">${n}</a>`).join('')}</span></div></li>
        <li><div class="st-h"><b>${L('在 AI 网页里粘贴并发送', 'Paste it into the AI chat and send')}</b></div>
          <p class="muted">${L('新开一个对话。回复中途停了就说“继续”，再把几段一起复制回来。', 'Start a new chat. If the reply stops, say “continue” and copy all parts back together.')}</p></li>
        <li><div class="st-h"><b>${L('把 AI 的完整回复粘贴到这里', 'Paste the full AI reply here')}</b></div>
          <textarea id="sText" spellcheck="false" placeholder="${L('点 AI 回复下方的“复制”按钮，然后在这里 Ctrl+V', 'Click “Copy” under the AI reply, then press Ctrl+V here')}"></textarea></li>
      </ol>
      <div class="test-msg" id="sMsg"></div>
    </div>
    <div class="dlg-foot"><span class="spacer"></span><button class="btn" value="cancel">${L('关闭', 'Close')}</button>
      <button class="btn primary" type="button" id="sSave" disabled>${isQuiz ? L('保存题库', 'Save quiz') : L('加入单词本', 'Add to word book')}</button></div></form>`;

  const body = () => {
    const b = { count: +$('#sCount').value, course: course || null };
    if (isQuiz) { b.decks = $$('.deck-picks input:checked', dlg).map(x => x.value); b.focus = $('#sFocus').value; }
    else { b.decks = [...sel]; if ($('#sPages').value.trim()) b.pages = $('#sPages').value.trim(); }
    if (!b.decks.length) throw new Error(L('至少选一份课件', 'Pick at least one deck'));
    return b;
  };
  const msg = (cls, html) => { const m = $('#sMsg'); m.className = 'test-msg ' + cls; m.innerHTML = html; };
  let saved = false;
  dlg.addEventListener('close', () => { if (saved && $('#home')) renderHome(); }, { once: true });
  const done = r => {
    saved = true;
    if (isQuiz) msg('ok', L(`已生成题库《${esc(r.title)}》，${r.count} 题。`, `Saved “${esc(r.title)}”: ${pl(r.count, 'question')}.`) + ` <a href="#/quiz/${encodeURIComponent(r.id)}" data-close>${L('去做题 →', 'Start the quiz →')}</a>`);
    else {
      msg('ok', L(`单词本新加 ${r.added.length} 个词`, `${pl(r.added.length, 'new word')} added`) + (r.merged.length ? L(`，${r.merged.length} 个已有的词补上了出处`, `; ${r.merged.length} existing words got a new source`) : '') +
        `。 <a href="#/vocab${course ? '?course=' + encodeURIComponent(course) : ''}" data-close>${L('打开单词本 →', 'Open the word book →')}</a>`);
      VOCAB = null; loadVocab().then(() => { if (R) { updateCount(); if (R.tab === 'vocab') renderVocab(); } }).catch(() => {});
    }
  };
  dlg.querySelectorAll('[data-chat]').forEach(a => a.onclick = () => {
    lastChat = a.dataset.chat; store.set('web.chat', lastChat);
    dlg.querySelectorAll('[data-chat]').forEach(x => x.classList.toggle('on', x === a));
  });
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });
  $('#sCopy').onclick = async () => {
    try {
      const r = await api(`studio/${kind}/prompt`, { method: 'POST', json: body() });
      await copyText(r.prompt);
      msg('ok', L(`已复制提示词（${r.prompt.length.toLocaleString()} 字）。去 ${lastChat} 粘贴发送。`, `Prompt copied (${r.prompt.length.toLocaleString()} characters). Paste it into ${lastChat} and send.`));
    } catch (e) { msg('bad', esc(e.message)); }
  };
  $('#sText').oninput = () => { $('#sSave').disabled = !$('#sText').value.trim(); };
  $('#sSave').onclick = async () => {
    try {
      const r = await api(`studio/${kind}/save`, { method: 'POST', json: { ...body(), text: $('#sText').value } });
      $('#sText').value = ''; $('#sSave').disabled = true; done(r);
    } catch (e) { msg('bad', esc(e.message).replace(/\n/g, '<br>')); }
  };
  if ($('#sRun')) $('#sRun').onclick = async () => {
    const btn = $('#sRun'), note = $('#sRunMsg');
    try {
      const job = await api(`studio/${kind}/run`, { method: 'POST', json: body() });
      btn.disabled = true; note.textContent = L(`${engine} 正在写，一般需要 1–3 分钟…`, `${engine} is writing. This usually takes 1–3 minutes…`);
      pollJob(job.id, j => {
        if (j.status === 'running') return;
        btn.disabled = false; note.textContent = '';
        if (j.status === 'done') done(j.result); else msg('bad', esc(srvMsg(j.message)));
      });
    } catch (e) { msg('bad', esc(e.message)); }
  };
  dlg.showModal();
}

// 把讲解卡片 / 题目里的关键术语收进单词本（不用 AI）
async function collectTerms(json) {
  try {
    const r = await api('vocab/collect', { method: 'POST', json });
    VOCAB = null; await loadVocab().catch(() => {});
    toast(L(`单词本新加 ${r.added.length} 个术语`, `${pl(r.added.length, 'term')} added to your word book`) + (r.merged.length ? L(`，${r.merged.length} 个已有`, `, ${r.merged.length} already there`) : ''));
    if (R) { updateCount(); if (R.tab === 'vocab') renderVocab(); }
  } catch (e) { toast(e.message); }
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return; } catch {}
  const ta = Object.assign(document.createElement('textarea'), { value: t });
  ta.style.cssText = 'position:fixed;opacity:0'; $('#dlg').appendChild(ta); ta.select();
  document.execCommand('copy'); ta.remove();
}

/* ================================================================ 阅读器 */
let R = null; // 当前阅读状态

async function openReader(id, page) {
  document.body.classList.add('reading');
  const app = $('#app');
  app.innerHTML = `<header class="bar">${brandHTML()}<div class="crumb"><span class="muted">/</span><b>…</b></div></header>`;
  let deck, marks = {}, courses = [];
  try {
    [deck, marks, courses] = await Promise.all([api('decks/' + encodeURIComponent(id)), api(`decks/${encodeURIComponent(id)}/marks`).catch(() => ({})),
      getCourses().catch(() => []), loadVocab().catch(() => [])]);
  } catch (e) { app.innerHTML += `<main class="lib"><p>${esc(e.message)}</p><a class="btn" href="#/">${L('返回课程', 'Back to courses')}</a></main>`; return; }
  if (deck.type === 'paper') { location.replace(`#/paper/${encodeURIComponent(id)}${page ? '/' + page : ''}`); return; }
  const words = await fetch(deck.base + 'words.json').then(r => r.json()).catch(() => []);
  const N = deck.pages.length;
  const course = courses.find(c => c.id === deck.course);
  R = { id, deck, words, N, cur: Math.min(Math.max(1, page || store.get('page.' + id, 1)), N), notes: deck.notes || {}, marks: marks || {},
        editing: false, busy: new Set(), job: null, stopPoll: null, settings: null, tab: store.get('reader.tab', 'notes'), noteTimer: null };
  if (deck.example && R.tab === 'marks') R.tab = 'notes';
  api('settings').then(x => { if (R && R.id === id) { R.settings = x; renderNotes(); } }).catch(() => {});
  document.title = deck.title + ' · ' + APP();

  app.innerHTML = `
    <header class="bar">${brandHTML()}
      <div class="crumb"><span class="muted">/</span>${course ? `<a href="#/course/${encodeURIComponent(course.id)}" class="ccrumb" style="--cc:${esc(course.color)}">${esc(course.name)}</a><span class="muted">/</span>` : ''}<b title="${esc(deck.title)}">${esc(deck.title)}</b></div>
      <div class="progress"><i id="bar"></i></div>
      <div class="tools">
        ${backChip()}
        ${deck.example ? '' : `<button class="chip-btn" id="starBtn" title="${L('标为重点页（S）', 'Mark as key page (S)')}">${icon('star')}<span class="lbl">${L('重点', 'Key page')}</span></button>`}
        ${deck.example ? '' : `<button class="chip-btn" id="genAll" title="${L('为还没有讲解的页面批量生成', 'Generate notes for pages without them')}">${icon('spark')}<span class="lbl">${L('AI 讲解', 'AI notes')}</span></button>`}
        <button class="chip-btn" id="autoSpeak" title="${L('划词后自动播放英式发音', 'Play British pronunciation after selecting a word')}">${icon('speak')}<span class="lbl">${L('自动发音', 'Auto-speak')}</span></button>
        ${langBtnHTML()}
        <button class="chip-btn" id="setBtn" title="${L('AI 设置', 'AI settings')}">${icon('gear')}</button>
        <button class="chip-btn" id="themeBtn" title="${L('切换深浅色', 'Light / dark')}">${icon('moon')}</button>
      </div>
    </header>
    <main class="reader" id="reader">
      <section class="left">
        <div class="stage">
          <button class="nav prev" id="prev" aria-label="${L('上一页', 'Previous page')}">${icon('left')}</button>
          <div class="slide" id="slide"><img id="slideImg" alt=""><div class="hl" id="hl"></div><div class="tl" id="tl"></div></div>
          <button class="nav next" id="next" aria-label="${L('下一页', 'Next page')}">${icon('right')}</button>
        </div>
        <nav class="strip" id="strip"></nav>
      </section>
      <div class="split" id="split" title="${L('拖动调整宽度', 'Drag to resize')}"></div>
      <aside class="panel">
        <div class="tabs">
          <button data-tab="notes">${L('本页讲解', 'Notes')}</button>
          ${deck.example ? '' : `<button data-tab="marks">${L('我的标注', 'My marks')}<span class="count" id="mcount">0</span></button>`}
          <button data-tab="vocab">${L('本课生词', 'Words')}<span class="count" id="vcount">0</span></button>
        </div>
        <div id="jobbar"></div>
        <div class="pane" id="notes"></div>
        <div class="pane" id="marks" hidden></div>
        <div class="pane" id="vocab" hidden></div>
      </aside>
    </main>`;

  const p0 = deck.pages[0];
  $('#slide').style.aspectRatio = `${p0.w} / ${p0.h}`;
  $('#strip').innerHTML = deck.pages.map(p => `<button data-n="${p.n}" title="${esc(p.title)}"><img loading="lazy" src="${deck.base}thumbs/${pad3(p.n)}.jpg" alt="" style="aspect-ratio:${p.w}/${p.h}"><em>${p.n}</em><i class="st">${icon('star')}</i></button>`).join('');
  $('#strip').onclick = e => { const b = e.target.closest('button'); if (b) go(+b.dataset.n); };
  $('#prev').onclick = () => go(R.cur - 1);
  $('#next').onclick = () => go(R.cur + 1);
  $('#setBtn').onclick = openSettings;
  $('#themeBtn').onclick = toggleTheme;
  $('#langBtn').onclick = () => switchLang();
  $('#genAll') && ($('#genAll').onclick = () => generate('missing'));
  $('#starBtn') && ($('#starBtn').onclick = toggleStar);
  setupAutoSpeak();
  setupTabs();
  setupSplit();
  updateCount();
  $('#notes').addEventListener('click', onNotesClick);
  $('#marks').addEventListener('click', onMarksClick);
  $('#marks').addEventListener('input', onMarksInput);
  $('#marks').addEventListener('change', onMarksChange);

  const ro = new ResizeObserver(() => fitText());
  ro.observe($('#slide'));
  const onKey = e => {
    if (e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return hidePop();
    if (['ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); go(R.cur + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(R.cur - 1); }
    else if (e.key === 'Home') go(1); else if (e.key === 'End') go(R.N);
    else if (e.key.toLowerCase() === 's' && !R.deck.example) toggleStar();
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { flushNote(); ro.disconnect(); document.removeEventListener('keydown', onKey); R?.stopPoll?.(); R = null; };

  go(R.cur, true);
  showTab(R.tab);
  refreshInDeck();
  document.fonts?.ready.then(() => fitText());
  if (deck.jobs?.length) watchJob(deck.jobs[0]);
}

function go(n, first) {
  if (!R) return;
  n = Math.max(1, Math.min(R.N, n));
  const changed = n !== R.cur || first;
  if (changed) flushNote();
  R.cur = n; R.editing = false;
  const { deck } = R;
  $('#slideImg').src = `${deck.base}pages/${pad3(n)}.jpg`;
  buildTextLayer(n);
  renderHl();
  renderNotes();
  if (R.tab === 'marks') renderMarks();
  if (R.tab === 'vocab') renderVocab();
  $('#bar').style.width = (n / R.N * 100) + '%';
  $('#prev').disabled = n === 1; $('#next').disabled = n === R.N;
  updateStrip();
  if (changed) $(`#strip [data-n="${n}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: first ? 'auto' : 'smooth' });
  store.set('page.' + R.id, n);
  const h = `#/deck/${encodeURIComponent(R.id)}/${n}`;
  if (location.hash !== h) history.replaceState(null, '', h);
  hidePop();
  if (n < R.N) new Image().src = `${deck.base}pages/${pad3(n + 1)}.jpg`;
}

function updateStrip() {
  if (!R) return;
  $$('#strip button').forEach(b => {
    const n = +b.dataset.n, m = R.marks[n];
    b.classList.toggle('on', n === R.cur);
    b.classList.toggle('has', !!R.notes[n]);
    b.classList.toggle('busy', R.busy.has(n));
    b.classList.toggle('star', !!m?.star);
    b.classList.toggle('mk', !!m && !m.star);
  });
  const missing = R.N - Object.keys(R.notes).filter(k => R.notes[k]).length;
  const g = $('#genAll');
  if (g) $('.lbl', g).textContent = missing ? L(`AI 讲解（缺 ${missing} 页）`, `AI notes (${missing} missing)`) : L('AI 讲解', 'AI notes');
  const sb = $('#starBtn');
  if (sb) sb.setAttribute('aria-pressed', !!R.marks[R.cur]?.star);
}

/* ---------- 透明文字层：每个单词单独定位，划词高亮与原文重合 ---------- */
function buildTextLayer(n) {
  const tl = $('#tl'); tl.innerHTML = '';
  const page = R.deck.pages[n - 1], W = page.w, H = page.h;
  const frag = document.createDocumentFragment();
  (R.words[n - 1] || []).forEach(([x0, y0, x1, y1, text], i) => {
    const word = text.replace(/\s+$/, '');
    if (!word) return;
    const h = y1 - y0, fs = h * 0.86;
    const s = document.createElement('span');
    s.textContent = word;
    s.style.left = (x0 / W * 100) + '%';
    s.style.top = (y0 / H * 100) + '%';
    s.style.height = (h / H * 100) + '%';
    s.style.fontSize = (fs / W * 100) + 'cqw';
    s.style.lineHeight = h / fs;
    s.dataset.w = (x1 - x0) / W;
    s.dataset.i = i;
    frag.appendChild(s);
    // 单词之间的空格 / 换行放在 span 外：看不见，但复制和查词时会保留
    frag.appendChild(document.createTextNode(text.endsWith(' ') ? ' ' : '\n'));
  });
  tl.appendChild(frag);
  fitText();
  markKnown(n);
}

// 单词本里的词（不管在哪收藏的）出现在本课件的哪些页
async function refreshInDeck() {
  if (!R) return;
  const id = R.id;
  try {
    const r = await api(`decks/${encodeURIComponent(id)}/vocab`);
    if (!R || R.id !== id) return;
    R.inDeck = r.words; markKnown(R.cur); updateCount();
    if (R.tab === 'vocab') renderVocab();
  } catch {}
}
// 课件上的生词加一条淡淡的下划线：单击就能查到“我的单词本”释义
function markKnown(n) {
  if (!R || store.get('markWords', true) === false) return;
  const spans = $$('#tl span'); if (!spans.length) return;
  spans.forEach(s => s.classList.remove('kw'));
  const norm = s => s.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  const toks = spans.map(s => norm(s.textContent));
  const list = new Set([...(R.inDeck || []).filter(x => x.pages.includes(n)).map(x => x.w),
    ...deckWords().filter(x => x.pages.includes(n)).map(x => x.v.w)]);
  for (const w of list) {
    const parts = w.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
    if (!parts.length) continue;
    const eq = (t, p, last) => t === p || (last && p.length > 3 && t.startsWith(p) && t.length - p.length <= 3);
    for (let i = 0; i + parts.length <= toks.length; i++) {
      if (parts.every((p, k) => eq(toks[i + k], p, k === parts.length - 1)))
        for (let k = 0; k < parts.length; k++) spans[i + k].classList.add('kw');
    }
  }
}

function fitText() {
  const slide = $('#slide'); if (!slide || !R) return;
  const cw = slide.clientWidth; if (!cw) return;
  for (const s of $$('#tl span')) {
    s.style.transform = '';
    const natural = s.offsetWidth;
    if (natural > 0) s.style.transform = `scaleX(${(s.dataset.w * cw) / natural})`;
  }
}

/* ---------- 讲解面板 ---------- */
function renderNotes() {
  const el = $('#notes'); if (!el || !R) return;
  const n = R.cur, d = R.notes[n], page = R.deck.pages[n - 1];
  const head = `<div class="kicker"><span class="num">${pad2(n)}</span><span class="of">/ ${R.N}</span>
    ${d && !R.deck.example && !R.editing ? `<span class="acts">
      <button class="ibtn" data-act="edit" title="${L('编辑讲解', 'Edit notes')}">${icon('edit')}</button>
      <button class="ibtn" data-act="regen" title="${L('用 AI 重新生成本页', 'Regenerate this page with AI')}">${icon('redo')}</button></span>` : ''}</div>`;
  if (R.editing) {
    el.innerHTML = head + `<div class="editor"><h2>${L('编辑讲解', 'Edit notes')}</h2>
      <textarea id="edText" spellcheck="false">${esc(noteToText(d || { t: page.title, s: '', p: [], k: [], tip: '' }))}</textarea>
      <div class="help">${L(`格式：<code># 标题</code> <code>&gt; 一句话核心</code> <code>- 要点</code> <code>  - 子要点</code>，
        <code>## 术语</code> 下每行 <code>- 英文 | 中文 | 补充</code>，<code>## 提示</code> 下写考点。`, `Format: <code># Title</code> <code>&gt; one-line gist</code> <code>- point</code> <code>  - sub-point</code>;
        under <code>## Terms</code> one per line <code>- term | meaning | note</code>; under <code>## Tip</code> the exam tip.`)}</div>
      <div class="row">${d ? `<button class="btn ghost danger" data-act="delnote">${L('删除讲解', 'Delete notes')}</button><span class="spacer"></span>` : ''}
        <button class="btn" data-act="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" data-act="save">${L('保存', 'Save')}</button></div></div>`;
    $('#edText').focus();
    return;
  }
  if (R.busy.has(n) && !d) {
    el.innerHTML = head + `<div class="skel h"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div>
      <div class="skel" style="width:82%"></div><div class="skel" style="width:60%"></div><p class="muted" style="margin-top:24px">${L('AI 正在阅读这一页…', 'The AI is reading this page…')}</p>`;
    return;
  }
  if (!d) {
    el.innerHTML = head + `<div class="empty">
      <div class="art">${icon('book')}</div>
      <h3>${L('这一页还没有讲解', 'No notes for this page yet')}</h3>
      <p>${esc(page.title || '')}</p>
      ${R.deck.example ? `<p>${L('示例课件是只读的。', 'The sample deck is read-only.')}</p>` : `<div class="row">
        <button class="btn primary" data-act="gen">${icon('spark')}${isWeb() ? L('用 AI 写讲解', 'Write notes with AI') : L('AI 生成本页讲解', 'Generate notes for this page')}</button>
        ${isWeb() ? '' : `<button class="btn" data-act="genall">${L('为所有缺讲解的页面生成', 'Generate for all pages without notes')}</button>`}
        <button class="btn ghost" data-act="edit">${icon('edit')}${L('自己写', 'Write my own')}</button></div>
      <div class="hint">${isWeb() ? L('没有 API Key 也行：用你的 ChatGPT / Claude 网页账号，复制粘贴即可。也可以在 <a data-act="settings">AI 设置</a> 里修改。', 'No API key needed: copy and paste with your ChatGPT / Claude account. You can change this in <a data-act="settings">AI settings</a>.')
        : L('用哪个 AI、什么语言，可以在 <a data-act="settings">AI 设置</a> 里修改。', 'Change the AI or the language in <a data-act="settings">AI settings</a>.')}</div>`}</div>`;
    return;
  }
  const points = (d.p || []).map(p => {
    const sub = /^[　\s]*•/.test(p);
    return `<li class="${sub ? 'sub' : ''}">${esc(p.replace(/^[　\s]*•\s*/, ''))}</li>`;
  }).join('');
  const terms = (d.k || []).map(([en, zh, note]) => `<tr><td class="t-en"><button data-say="${esc(en)}" title="${L('查词并发音', 'Look up and pronounce')}">${esc(en)}${icon('speak')}</button></td>
    <td class="t-zh">${esc(zh)}${note ? `<span class="t-note">${esc(note)}</span>` : ''}</td></tr>`).join('');
  const when = d.at ? new Date(d.at * 1000).toLocaleDateString() : '';
  // 讲解是用另一种语言写的：提示可以重新生成
  const other = !R.deck.example && (LANG === 'en' ? hasCJK(d.t + d.s) : !hasCJK(d.t + d.s + (d.p || []).join('')));
  el.innerHTML = head + `
    ${other ? `<div class="lang-note">${L('这页讲解是英文写的。', 'These notes are in Chinese.')}<button class="btn sm ghost" data-act="regen">${icon('redo')}${L('用中文重新生成', 'Regenerate in English')}</button></div>` : ''}
    <h1 class="zh">${esc(d.t)}</h1>
    ${page.title && page.title !== d.t ? `<p class="en-title">${esc(page.title)}</p>` : '<div style="height:12px"></div>'}
    ${d.s ? `<p class="gist">${esc(d.s)}</p>` : ''}
    ${points ? `<h2>${L('要点', 'Key points')}</h2><ol class="points">${points}</ol>` : ''}
    ${terms ? `<h2>${L('关键术语', 'Key terms')}</h2><table class="terms">${terms}</table>` : ''}
    ${d.tip ? `<div class="tip">${icon('bulb')}<div><b>${L('考点提示', 'Exam tip')} · </b>${esc(d.tip)}</div></div>` : ''}
    ${d.by ? `<div class="byline">${esc(d.by)}${when ? ' · ' + when : ''}</div>` : ''}`;
}

function onNotesClick(e) {
  const say = e.target.closest('[data-say]');
  if (say) { const r = say.getBoundingClientRect(); return lookup(say.dataset.say, { x: r.left, y: r.bottom, top: r.top }); }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const n = R.cur;
  switch (b.dataset.act) {
    case 'gen': return generate([n]);
    case 'regen': return generate([n], true);
    case 'genall': return generate('missing');
    case 'settings': return openSettings();
    case 'edit': R.editing = true; return renderNotes();
    case 'cancel': R.editing = false; return renderNotes();
    case 'save': return saveNote(n, textToNote($('#edText').value, R.notes[n]));
    case 'delnote':
      if (confirm(L('删除这一页的讲解？', 'Delete the notes for this page?'))) saveNote(n, null);
      return;
  }
}

async function saveNote(n, note) {
  try {
    await api(`decks/${encodeURIComponent(R.id)}/notes/${n}`, { method: note ? 'PUT' : 'DELETE', json: note || undefined });
    if (note) R.notes[n] = note; else delete R.notes[n];
    R.editing = false; renderNotes(); updateStrip(); toast(note ? L('已保存', 'Saved') : L('已删除', 'Deleted'));
  } catch (e) { toast(e.message); }
}

// 讲解 <-> 可编辑文本
function noteToText(d) {
  const out = [`# ${d.t || ''}`, `> ${d.s || ''}`, ''];
  (d.p || []).forEach(p => out.push(/^[　\s]*•/.test(p) ? `  - ${p.replace(/^[　\s]*•\s*/, '')}` : `- ${p}`));
  out.push('', L('## 术语', '## Terms'));
  (d.k || []).forEach(([a, b, c]) => out.push(`- ${a} | ${b}${c ? ' | ' + c : ''}`));
  out.push('', L('## 提示', '## Tip'), d.tip || '');
  return out.join('\n');
}
function textToNote(text, old) {
  const EDITED = L('手动编辑', 'edited by hand');
  const d = { t: '', s: '', p: [], k: [], tip: '', by: EDITED, at: Date.now() / 1000 };
  let sec = 'p'; const tip = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^##\s*(术语|terms?)/i.test(line)) { sec = 'k'; continue; }
    if (/^##\s*(提示|考点|tips?|exam tip)/i.test(line)) { sec = 'tip'; continue; }
    if (/^#\s+/.test(line) && !d.t) { d.t = line.replace(/^#\s+/, ''); continue; }
    if (/^>\s?/.test(line) && !d.s) { d.s = line.replace(/^>\s?/, ''); continue; }
    if (sec === 'tip') { if (line.trim()) tip.push(line.trim()); continue; }
    const m = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (!m) continue;
    if (sec === 'k') { const [a, b = '', c = ''] = m[2].split('|').map(x => x.trim()); if (a) d.k.push([a, b, c]); }
    else d.p.push((m[1].length >= 2 ? '　• ' : '') + m[2]);
  }
  d.tip = tip.join(' ');
  if (old?.by && !/编辑|edited/i.test(old.by)) d.by = old.by + ' · ' + EDITED;
  return d;
}

/* ---------- AI 生成 ---------- */
const isWeb = () => (R?.settings?.provider || 'web') === 'web';
async function generate(pages, overwrite = false) {
  if (!R.settings) { try { R.settings = await api('settings'); } catch {} }
  if (isWeb()) return openWebWizard(Array.isArray(pages) ? pages[0] : null);
  if (R.job && R.job.status === 'running') return toast(L('已有生成任务在进行中', 'A generation job is already running'));
  try {
    const job = await api(`decks/${encodeURIComponent(R.id)}/generate`, { method: 'POST', json: { pages, overwrite } });
    if (!job.total) return toast(job.message || L('没有需要生成的页面', 'No pages need notes'));
    if (overwrite) pages.forEach(n => { delete R.notes[n]; });
    watchJob(job);
  } catch (e) { toast(e.message); }
}
function watchJob(job) {
  R.job = job;
  R.busy = new Set(job.pages || []);
  let seen = 0;
  renderJobBar(); renderNotes(); updateStrip();
  R.stopPoll?.();
  R.stopPoll = pollJob(job.id, async j => {
    if (!R) return;
    R.job = j;
    const fin = j.finished || [];
    if (fin.length > seen || j.status !== 'running') {
      seen = fin.length;
      try { R.notes = await api(`decks/${encodeURIComponent(R.id)}/notes`); } catch {}
      (j.errors || []).forEach(e => R.busy.delete(e.page));
      fin.forEach(n => R.busy.delete(n));
      if (j.status !== 'running') R.busy.clear();
      if (!R.editing) renderNotes();
      updateStrip();
    }
    renderJobBar();
  }, 1000);
}
function renderJobBar() {
  const el = $('#jobbar'); if (!el || !R) return;
  const j = R.job;
  if (!j) { el.innerHTML = ''; return; }
  const pct = j.total ? Math.round(j.done / j.total * 100) : 0;
  if (j.status === 'running') {
    el.innerHTML = `<div class="jobbar">${icon('spark')}<span>${L('AI 正在生成讲解', 'AI is writing notes')} ${j.done}/${j.total}</span><span class="meter"><i style="width:${pct}%"></i></span>
      <button class="btn sm ghost" id="jobCancel">${L('停止', 'Stop')}</button></div>`;
    $('#jobCancel').onclick = () => api('jobs/' + j.id, { method: 'DELETE' });
  } else if (j.errors?.length) {
    el.innerHTML = `<div class="jobbar err"><span>${L(`${j.errors.length} 页生成失败：`, `${j.errors.length} pages failed: `)}${esc(j.errors[0].error)}</span><span class="spacer"></span>
      <button class="btn sm" id="jobSet">${L('去设置', 'Settings')}</button><button class="btn sm ghost" id="jobX">${L('关闭', 'Close')}</button></div>`;
    $('#jobX').onclick = () => { R.job = null; renderJobBar(); };
    $('#jobSet').onclick = () => { R.job = null; renderJobBar(); openSettings(); };
  } else {
    el.innerHTML = '';
    if (j.status === 'done' && j.total > 1) toast(L(`已生成 ${j.finished.length} 页讲解`, `Notes written for ${j.finished.length} pages`));
    R.job = null;
  }
}

/* ---------- 面板 tab / 分栏 ---------- */
function showTab(t) {
  if (!$(`.tabs [data-tab="${t}"]`)) t = 'notes';
  R.tab = t; store.set('reader.tab', t);
  $$('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  ['notes', 'marks', 'vocab'].forEach(k => { $('#' + k).hidden = k !== t; });
  if (t === 'vocab') renderVocab();
  if (t === 'marks') renderMarks();
}
function setupTabs() {
  $$('.tabs [data-tab]').forEach(b => b.onclick = () => { flushNote(); showTab(b.dataset.tab); });
}

/* ---------- 我的标注：重点页 / 本页笔记 / 高亮 ---------- */
const HL = ['yellow', 'green', 'blue', 'pink'];
const HL_NAME = () => L({ yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色' }, { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' });
const pageMarks = n => (R.marks[n] = R.marks[n] || { star: false, note: '', hl: [] });
function marksEmpty(m) { return !m || (!m.star && !(m.note || '').trim() && !(m.hl || []).length); }
async function saveMarks(n) {
  if (!R) return;
  const id = R.id, m = R.marks[n];
  const empty = marksEmpty(m);
  if (empty) delete R.marks[n];
  try {
    await api(`decks/${encodeURIComponent(id)}/marks/${n}`, empty ? { method: 'DELETE' } : { method: 'PUT', json: m });
  } catch (e) { toast(L('标注没保存上：', 'Annotation not saved: ') + e.message); }
  if (!R || R.id !== id) return;
  updateStrip(); updateCount();
}
function toggleStar() {
  const m = pageMarks(R.cur);
  m.star = !m.star;
  saveMarks(R.cur);
  updateStrip();
  if (R.tab === 'marks') renderMarks();
  toast(m.star ? L(`第 ${R.cur} 页已标为重点 ★`, `Page ${R.cur} marked as key ★`) : L('已取消重点', 'Key mark removed'));
}
function flushNote() {
  if (!R?.noteTimer) return;
  clearTimeout(R.noteTimer.t); const n = R.noteTimer.n; R.noteTimer = null; saveMarks(n);
}
function renderHl() {
  const el = $('#hl'); if (!el || !R) return;
  const p = R.deck.pages[R.cur - 1], W = p.w, H = p.h, pad = 0.6;
  el.innerHTML = (R.marks[R.cur]?.hl || []).map(h => h.rects.map(([x0, y0, x1, y1]) =>
    `<i class="c-${h.color}" style="left:${(x0 - pad) / W * 100}%;top:${(y0 - pad) / H * 100}%;width:${(x1 - x0 + 2 * pad) / W * 100}%;height:${(y1 - y0 + 2 * pad) / H * 100}%"></i>`).join('')).join('');
}
// 把课件上的选区换算成页面坐标里的矩形（每行合并成一块）
function selHighlight(range) {
  const tl = $('#tl');
  if (!R || R.deck.example || !tl || !tl.contains(range.commonAncestorContainer)) return null;
  const ws = R.words[R.cur - 1] || [];
  const boxes = $$('#tl span').filter(s => range.intersectsNode(s)).map(s => ws[+s.dataset.i]).filter(Boolean);
  if (!boxes.length) return null;
  const rects = [];
  for (const [x0, y0, x1, y1] of boxes) {
    const last = rects[rects.length - 1], h = y1 - y0;
    if (last && Math.abs(last[1] - y0) < h * 0.5 && x0 >= last[0] && x0 - last[2] < h * 1.5) {
      last[1] = Math.min(last[1], y0); last[2] = Math.max(last[2], x1); last[3] = Math.max(last[3], y1);
    } else rects.push([x0, y0, x1, y1]);
  }
  return { text: tlText(range).slice(0, 500), rects };
}
// 课件文字层的选区文字：浏览器会吞掉单词之间看不见的空格，这里按单词 span 重新拼
function tlText(range) {
  return $$('#tl span').filter(s => range.intersectsNode(s)).map(s => {
    const tn = s.firstChild, t = s.textContent;
    const a = tn === range.startContainer ? range.startOffset : 0;
    const b = tn === range.endContainer ? range.endOffset : t.length;
    return t.slice(a, b);
  }).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function addHighlight(hl, color) {
  if (P && hl.page) return pAddHighlight(hl, color);
  if (!R) return;
  pageMarks(R.cur).hl.push({ id: 'h' + Date.now().toString(36), text: hl.text, rects: hl.rects, color, note: '', at: Date.now() / 1000 });
  saveMarks(R.cur);
  getSelection()?.removeAllRanges();
  hidePop(); renderHl(); updateStrip();
  if (R.tab === 'marks') renderMarks();
  toast(L('已高亮，可以在“我的标注”里写批注', 'Highlighted. Add a comment under “My marks”.'), { label: L('去写', 'Open'), fn: () => showTab('marks') });
}
const hlDots = (cur, attr = 'data-hl') => HL.map(c => `<button class="hlc c-${c} ${c === cur ? 'on' : ''}" ${attr}="${c}" title="${L(`${HL_NAME()[c]}高亮`, `${HL_NAME()[c]} highlight`)}"></button>`).join('');
function showHlPop(hl, at) {
  pop.innerHTML = `<div class="hlonly"><span>${L('高亮这段', 'Highlight')}</span>${hlDots()}<button class="x" title="${L('关闭', 'Close')} (Esc)">${icon('x')}</button></div>`;
  pop.hidden = false; placePop(at);
  $('.x', pop).onclick = hidePop;
  $$('[data-hl]', pop).forEach(b => b.onclick = () => addHighlight(hl, b.dataset.hl));
}

function renderMarks() {
  const el = $('#marks'); if (!el || !R) return;
  const n = R.cur, m = R.marks[n] || { star: false, note: '', hl: [] };
  const page = R.deck.pages[n - 1];
  const pages = Object.keys(R.marks).map(Number).sort((a, b) => a - b);
  const hls = (m.hl || []).map((h, i) => `<div class="hlitem c-${h.color}" data-i="${i}">
      <div class="hl-top"><span class="hl-text">${esc(h.text)}</span><span class="hl-dots">${hlDots(h.color, 'data-recolor')}</span>
        <button class="ibtn" data-mk="delhl" title="${L('删除这处高亮', 'Delete highlight')}">${icon('trash')}</button></div>
      <input type="text" class="hl-note" value="${esc(h.note)}" placeholder="${L('批注（可空）', 'Comment (optional)')}"></div>`).join('');
  el.innerHTML = `
    <div class="kicker"><span class="num">${pad2(n)}</span><span class="of">/ ${R.N}</span>
      <button class="chip-btn star-chip" data-mk="star" aria-pressed="${!!m.star}">${icon('star')}<span>${m.star ? L('重点页', 'Key page') : L('标为重点', 'Mark as key')}</span></button></div>
    <p class="en-title">${esc(page.title || '')}</p>
    <label class="field"><span>${L('本页笔记', 'Page notes')} <small class="muted">${L('自动保存', 'saved automatically')}</small></span>
      <textarea id="mkNote" rows="5" placeholder="${L('写下自己的理解、老师课上补充的内容、和其他章节的联系…', 'Your own understanding, what the lecturer added, links to other chapters…')}">${esc(m.note)}</textarea></label>
    <h2>${L('本页高亮', 'Highlights on this page')} <small class="muted">${(m.hl || []).length}</small></h2>
    ${hls || `<p class="muted small">${L('在左边课件上拖选一段文字，在弹出的小窗里选颜色就能高亮；单个单词查词时也可以顺手高亮。', 'Drag over text on the slide and pick a colour to highlight it. You can also highlight from the word lookup.')}</p>`}
    <h2>${L('整份课件的标注', 'Marks in this deck')} <small class="muted">${L(`${pages.length} 页`, `${pages.length} pages`)}</small><span class="spacer"></span>
      ${pages.length ? `<button class="btn sm ghost" data-mk="copy">${icon('copy')}${L('复制给 AI', 'Copy for AI')}</button>` : ''}</h2>
    ${pages.length ? `<div class="mklist">${pages.map(p => {
      const x = R.marks[p], t = R.deck.pages[p - 1]?.title || '';
      return `<button class="mkrow ${p === n ? 'on' : ''}" data-goto="${p}"><b>${p}</b>${x.star ? `<span class="st">${icon('star')}</span>` : ''}
        <span class="mk-t">${esc(x.note?.trim() ? x.note.trim().slice(0, 60) : t)}</span>
        ${(x.hl || []).length ? `<span class="mk-n">${x.hl.map(h => `<i class="c-${h.color}"></i>`).join('')}</span>` : ''}</button>`;
    }).join('')}</div>` : `<p class="muted small">${L('还没有标注。按 <kbd>S</kbd> 或点顶部 ☆ 可以把当前页标为重点。', 'No marks yet. Press <kbd>S</kbd> or the ☆ at the top to mark this page as key.')}</p>`}`;
}
function onMarksClick(e) {
  const g = e.target.closest('[data-goto]'); if (g) return go(+g.dataset.goto);
  const rc = e.target.closest('[data-recolor]');
  if (rc) {
    const i = +rc.closest('[data-i]').dataset.i;
    R.marks[R.cur].hl[i].color = rc.dataset.recolor; saveMarks(R.cur); renderHl(); return renderMarks();
  }
  const b = e.target.closest('[data-mk]'); if (!b) return;
  if (b.dataset.mk === 'star') return toggleStar();
  if (b.dataset.mk === 'copy') { flushNote(); return copyExport(`decks/${encodeURIComponent(R.id)}/export`, L('课件内容（含标注）', 'the deck with your marks')); }
  if (b.dataset.mk === 'delhl') {
    const i = +b.closest('[data-i]').dataset.i;
    R.marks[R.cur].hl.splice(i, 1); saveMarks(R.cur); renderHl(); renderMarks();
  }
}
function onMarksInput(e) {
  if (e.target.id !== 'mkNote') return;
  pageMarks(R.cur).note = e.target.value;
  if (R.noteTimer) clearTimeout(R.noteTimer.t);
  const n = R.cur;
  R.noteTimer = { n, t: setTimeout(() => { R && (R.noteTimer = null); saveMarks(n); }, 700) };
}
function onMarksChange(e) {
  if (!e.target.classList.contains('hl-note')) return;
  const i = +e.target.closest('[data-i]').dataset.i;
  R.marks[R.cur].hl[i].note = e.target.value.trim(); saveMarks(R.cur);
}

function setupSplit() {
  const main = $('#reader');
  const set = f => { f = Math.min(.8, Math.max(.45, f)); main.style.setProperty('--left', f * 100 + 'fr'); main.style.setProperty('--right', (1 - f) * 100 + 'fr'); };
  set(store.get('split', .64));
  $('#split').addEventListener('pointerdown', e => {
    const sp = e.currentTarget; sp.setPointerCapture(e.pointerId); sp.classList.add('drag');
    const move = ev => set(ev.clientX / innerWidth);
    const up = ev => { sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); store.set('split', ev.clientX / innerWidth); fitText(); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up, { once: true });
  });
}

/* ================================================================ 题库页 */
async function showQuizzes() {
  document.body.classList.remove('reading');
  document.title = L('题库', 'Quizzes') + ' · ' + APP();
  $('#app').innerHTML = pageBar('quizzes') + `
    <main class="lib">
      <div class="lib-head">
        <div><h1>${L('题库', 'Quizzes')}</h1><p>${L('所有练习题按课程分组。做题记录保存在课件库里，换浏览器、换电脑拷过去都还在。', 'All practice questions, grouped by course. Your answers are saved in the library, so they move with it to another browser or computer.')}</p></div>
        <div class="row"><button class="btn" id="qHow">${icon('spark')}${L('让 AI 出题', 'Ask AI for questions')}</button>
          <button class="btn primary" id="qImport">${icon('upload')}${L('导入题库', 'Import quiz')}</button></div>
      </div>
      <div id="qlist"><div class="skel h"></div></div>
      <input type="file" id="qfile" accept=".json,.pptx" hidden>
    </main>`;
  wireBar();
  $('#qImport').onclick = () => $('#qfile').click();
  $('#qHow').onclick = quizHowDialog;
  $('#qfile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const courses = await getCourses();
    const course = await pickCourse(courses, L(`把《${f.name}》放进哪门课？`, `Which course should “${f.name}” go in?`));
    if (course === undefined) return;
    try {
      const r = await api('quizzes/import', { method: 'POST', body: f, headers: { 'X-Filename': encodeURIComponent(f.name), 'X-Course': encodeURIComponent(course || '') } });
      toast(L(`已导入 ${r.count} 道题`, `${r.count} questions imported`), { label: L('开始做题', 'Start'), fn: () => location.hash = `#/quiz/${encodeURIComponent(r.id)}` });
      renderQuizzes();
    } catch (err) { toast(err.message); }
  };
  await renderQuizzes();
  refreshNav('quizzes');
}

async function renderQuizzes() {
  const el = $('#qlist'); if (!el) return;
  let m; try { m = await api('manifest'); } catch (e) { toast(e.message); return; }
  if (await migrateOldQuizzes(m)) return renderQuizzes();
  const groups = m.courses.filter(c => c.quizzes.length).map(c => ({ ...c, quizzes: c.quizzes.map(z => ({ ...z, course: c.id })) }));
  if (m.unassigned.quizzes.length) groups.push({ id: '', name: L('未分类', 'Unsorted'), color: '#847e72', quizzes: m.unassigned.quizzes });
  if (!groups.length) {
    el.innerHTML = `<div class="empty-big">${icon('check')}<h3>${L('还没有题库', 'No quizzes yet')}</h3>
      <p>${L('点右上角“导入题库”：支持选择题 PPT（演讲者备注写 <code>Answer: B</code>）或 AI 按格式写好的 JSON。', 'Click “Import quiz”: a multiple-choice PPT (speaker notes say <code>Answer: B</code>) or a JSON file written by AI in the quiz format.')}</p></div>`;
    return;
  }
  el.innerHTML = groups.map(g => `<section class="course" style="--cc:${esc(g.color)}">
    <div class="course-head"><span class="cbar"></span><div class="ct"><h2>${esc(g.name)}</h2><p>${L(`${g.quizzes.length} 套题 · ${g.quizzes.reduce((s, z) => s + z.count, 0)} 道`, `${pl(g.quizzes.length, 'quiz', 'quizzes')} · ${pl(g.quizzes.reduce((s, z) => s + z.count, 0), 'question')}`)}</p></div></div>
    <div class="qbank">${g.quizzes.map(z => {
      const st = z.stats, done = st.right + st.wrong, acc = done ? Math.round(st.right / done * 100) + '%' : '—';
      const href = `#/quiz/${encodeURIComponent(z.id)}`;
      return `<article class="qb-card">
        <div class="qb-top"><a href="${href}"><b>${esc(z.title)}</b></a><button class="ibtn" data-qmenu="${esc(z.id)}" title="${L('题库设置', 'Quiz settings')}">${icon('dots')}</button></div>
        <div class="qb-chs">${z.chapters.map(c => `<span title="${esc(c.title)}">Ch.${esc(c.key)} ${esc(chTitle(c).replace(/^.*?·\s*/, ''))}</span>`).join('')}</div>
        <div class="qnums sm"><div><b class="ok">${st.right}</b><span>${L('答对', 'Right')}</span></div><div><b class="bad">${st.wrong}</b><span>${L('答错', 'Wrong')}</span></div>
          <div><b>${st.todo}</b><span>${L('未做', 'To do')}</span></div><div><b>${acc}</b><span>${L('正确率', 'Accuracy')}</span></div></div>
        ${stackBar(st)}
        <div class="row">
          <a class="btn primary sm" href="${href}">${icon('right')}${done ? (st.todo ? L('继续做题', 'Continue') : L('再看一遍', 'Review again')) : L('开始做题', 'Start')}</a>
          ${st.wrong ? `<a class="btn sm" href="${href}?f=wrong">${icon('redo')}${L('错题重练', 'Retry wrong')} ${st.wrong}</a>` : ''}
          ${done && st.todo ? `<a class="btn sm ghost" href="${href}?f=todo">${L('只看未做', 'Only unanswered')} ${st.todo}</a>` : ''}
        </div></article>`;
    }).join('')}</div></section>`).join('');
  const all = groups.flatMap(g => g.quizzes);
  $$('[data-qmenu]', el).forEach(b => b.onclick = () => quizMenu(all.find(z => z.id === b.dataset.qmenu), renderQuizzes));
}

function pickCourse(courses, title) {
  return new Promise(res => {
    const dlg = $('#dlg');
    let out;
    dlg.innerHTML = `<form method="dialog">
      <div class="dlg-head"><h2>${esc(title)}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
      <div class="dlg-body"><label class="field"><span>${L('所属课程', 'Course')}</span><select id="pcSel">${courseOptions(courses, HOME?.cf || '')}</select></label></div>
      <div class="dlg-foot"><span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="pcOk">${L('导入', 'Import')}</button></div></form>`;
    $('#pcOk').onclick = e => { e.preventDefault(); out = $('#pcSel').value; dlg.close(); };
    dlg.addEventListener('close', () => res(out), { once: true });
    dlg.showModal();
  });
}

function quizHowDialog() {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog" class="aiinfo">
    <div class="dlg-head"><div><h2>${L('让 AI 帮你出题', 'Let AI write questions')}</h2><p class="sub">${L('AI 按固定格式写 JSON，导入后自动挂到对应课程，题目还能跳回课件原页。', 'The AI writes JSON in a fixed format. After import it is filed under the course, and each question links back to its slide.')}</p></div>
      <button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body"><ol class="steps">
      <li><div class="st-h"><b>${L('本机 AI 助手（Claude Code / Codex）', 'Local AI assistant (Claude Code / Codex)')}</b></div>
        <p>${L(`在项目文件夹里对它说：<em>“读 AI_GUIDE.md，根据课件 &lt;课件ID&gt; 出 20 道选择题，加到课程 &lt;课程ID&gt;。”</em> 它会写好 JSON 并运行
        <code>python -m kejian quiz 题库.json --course &lt;课程ID&gt;</code>。`, `In the project folder, tell it: <em>“Read AI_GUIDE.md, write 20 multiple-choice questions from deck &lt;deck-id&gt; and add them to course &lt;course-id&gt;.”</em> It writes the JSON and runs
        <code>python -m kejian quiz quiz.json --course &lt;course-id&gt;</code>.`)}</p></li>
      <li><div class="st-h"><b>${L('网页版 AI', 'AI in a browser')}</b></div>
        <p>${L('在课件的“⋯”菜单里点“复制全部文字给 AI”，连同下面的格式说明一起发给它，再把它写的 JSON 存成 <code>.json</code> 文件，点“导入题库”。', 'In the deck’s ⋯ menu choose “Copy all text for AI” and send it with the format below. Save its reply as a <code>.json</code> file and click “Import quiz”.')}</p>
        <div class="row"><button class="btn sm" type="button" id="qFmt">${icon('copy')}${L('复制题库格式说明', 'Copy the quiz format')}</button></div></li>
    </ol></div>
    <div class="dlg-foot"><span class="spacer"></span><button class="btn primary" value="cancel">${L('知道了', 'Got it')}</button></div></form>`;
  $('#qFmt').onclick = async () => {
    await copyText(LANG === 'en' ? QUIZ_FORMAT_EN : QUIZ_FORMAT); toast(L('已复制格式说明', 'Format copied'));
  };
  dlg.showModal();
}
const QUIZ_FORMAT_EN = `Write multiple-choice questions from the slides I sent you. Output only one JSON object (no other text) in this format:
{
  "title": "Quiz name",
  "chapters": {"1": {"title": "Chapter title"}},
  "questions": [
    {"n": 1, "chapter": "1", "page": 5,
     "q": "Question", "opts": ["Option A", "Option B", "Option C", "Option D"], "ans": "B",
     "exp_en": "Explanation: why the answer is right and why each distractor is wrong",
     "terms": [["Key term", "Short English definition", "Optional note or example"]]}
  ]
}
Rules: "page" is the slide number the question comes from (the slide text is marked “第 N 页” / page N); "ans" is a letter; 4 options per question; write everything in clear English.`;
const QUIZ_FORMAT = `请根据我发给你的课件内容出选择题，只输出一个 JSON（不要别的文字），格式：
{
  "title": "题库名称",
  "chapters": {"1": {"title": "英文章节名", "title_zh": "中文章节名"}},
  "questions": [
    {"n": 1, "chapter": "1", "page": 5,
     "q": "英文题干", "opts": ["选项A", "选项B", "选项C", "选项D"], "ans": "B",
     "q_zh": "中文题干", "opts_zh": ["A 的中文", "B 的中文", "C 的中文", "D 的中文"],
     "exp_zh": "中文详细解析：为什么对、干扰项为什么错", "exp_en": "English explanation",
     "terms": [["英文术语", "中文", "一句补充说明"]]}
  ]
}
要求：page 填这道题出自课件的第几页（课件文字里有“第 N 页”标记）；ans 用字母；每题 4 个选项；解析要讲清楚干扰项。`;

/* ================================================================ 做题 */
let QZ = null; // 当前做题状态
const LET = 'ABCDEFGH';
const chTitle = c => ((LANG === 'en' ? (c.title || c.title_zh) : (c.title_zh || c.title)) || '');
function quizStats(questions, ans) {
  let right = 0, wrong = 0;
  for (const q of questions) { const a = ans[q.n]; if (a == null) continue; a === q.ans ? right++ : wrong++; }
  return { right, wrong, todo: questions.length - right - wrong, total: questions.length };
}
const ansOf = prog => Object.fromEntries(Object.entries(prog || {}).filter(([, r]) => r.a != null).map(([k, r]) => [k, r.a]));

// 旧版把作答存在浏览器里，第一次打开时搬到课件库
async function migrateQuiz(id) {
  const old = store.get('quiz.' + id, null);
  if (!old || !Object.keys(old).length) return false;
  try { await api(`quizzes/${encodeURIComponent(id)}/migrate`, { method: 'POST', json: { answers: old } }); localStorage.removeItem('kj.quiz.' + id); return true; }
  catch { return false; }
}

async function migrateOldQuizzes(m) {
  const ids = [...m.courses.flatMap(c => c.quizzes), ...m.unassigned.quizzes].map(z => z.id);
  let moved = 0;
  for (const id of ids) if (await migrateQuiz(id)) moved++;
  if (moved) toast(L('已把浏览器里的旧作答记录搬进课件库', 'Old answers from this browser were moved into the library'));
  return moved > 0;
}

// 从课件页返回题目 / 单词本的小按钮
function setBack(label) { sessionStorage.setItem('kj.back', JSON.stringify({ hash: location.hash, label, at: Date.now() })); }
function backChip() {
  let b = null; try { b = JSON.parse(sessionStorage.getItem('kj.back') || 'null'); } catch {}
  if (!b || Date.now() - b.at > 3 * 3600e3) return '';
  return `<a class="chip-btn back" href="${esc(b.hash)}" title="${L('回到刚才的位置', 'Back to where you were')}">${icon('left')}<span class="lbl">${esc(b.label)}</span></a>`;
}

async function openQuiz(id, n, f) {
  document.body.classList.remove('reading');
  const app = $('#app');
  let quiz;
  try {
    if (await migrateQuiz(id)) toast(L('已把浏览器里的旧作答记录搬进课件库', 'Old answers from this browser were moved into the library'));
    quiz = await api('quizzes/' + encodeURIComponent(id));
  } catch (e) { app.innerHTML = pageBar('quizzes') + `<main class="lib"><p>${esc(e.message)}</p><a class="btn" href="#/quizzes">${L('返回题库', 'Back to quizzes')}</a></main>`; wireBar(); return; }
  const qs = quiz.questions;
  const filter = ['all', 'wrong', 'todo', 'weak'].includes(f) ? f : store.get('quiz.filter', 'all');
  QZ = { id, quiz, prog: quiz.progress || {}, ans: ansOf(quiz.progress), filter, ch: 'all', zh: LANG === 'zh' && store.get('quiz.zh', false), idx: 0 };
  let start = n ? qs.findIndex(q => q.n === n) : -1;
  if (start < 0) { const vis = visibleIdx(); start = vis.find(i => QZ.ans[qs[i].n] == null) ?? vis[0] ?? 0; }
  QZ.idx = Math.max(0, start);
  document.title = quiz.title + ' · ' + APP();
  const vocabReady = loadVocab().catch(() => {});      // 术语表要用到单词本（星标、英文释义）

  let cname = '';
  if (quiz.course) { try { cname = (await getCourses()).find(c => c.id === quiz.course)?.name || ''; } catch {} }
  await vocabReady;
  app.innerHTML = `
    <header class="bar">${brandHTML()}${navHTML('quizzes')}
      <div class="crumb"><span class="muted">/</span>${cname ? `<a href="#/course/${encodeURIComponent(quiz.course)}">${esc(cname)}</a><span class="muted">/</span>` : ''}<b title="${esc(quiz.title)}">${esc(quiz.title)}</b></div>
      <div class="progress"><i id="qbar"></i></div>
      <div class="tools">
        ${LANG === 'zh' ? `<button class="chip-btn" id="zhBtn" title="题干和选项显示中文对照">中<span class="lbl">中文对照</span></button>` : ''}
        ${langBtnHTML()}
        <button class="chip-btn" id="themeBtn" title="${L('切换深浅色', 'Light / dark')}">${icon('moon')}</button>
      </div>
    </header>
    <main class="quiz">
      <aside class="qside">
        <div class="qstats" id="qstats"></div>
        <div class="qfilters" id="qfilters"></div>
        <div class="qgrid" id="qgrid"></div>
        <div class="qside-foot">
          <button class="btn sm ghost" id="redoWrong">${icon('redo')}${L('重做错题', 'Redo wrong')}</button>
          <button class="btn sm ghost danger" id="resetAll">${icon('trash')}${L('清空记录', 'Clear answers')}</button>
        </div>
      </aside>
      <section class="qmain" id="qmain"></section>
    </main>`;
  $('#themeBtn').onclick = toggleTheme;
  $('#langBtn').onclick = () => switchLang();
  const zhBtn = $('#zhBtn');
  if (zhBtn) {
    zhBtn.setAttribute('aria-pressed', QZ.zh);
    zhBtn.onclick = () => { QZ.zh = !QZ.zh; store.set('quiz.zh', QZ.zh); zhBtn.setAttribute('aria-pressed', QZ.zh); renderQuestion(); };
  }
  $('#qgrid').onclick = e => { const b = e.target.closest('[data-qi]'); if (b) gotoQ(+b.dataset.qi); };
  $('#qfilters').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) { QZ.filter = b.dataset.f; store.set('quiz.filter', QZ.filter); }
    if (b.dataset.ch) QZ.ch = b.dataset.ch;
    renderSide();
    const vis = visibleIdx();
    if (vis.length && !vis.includes(QZ.idx)) gotoQ(vis[0]);
  };
  $('#redoWrong').onclick = async () => {
    const wrong = qs.filter(q => QZ.ans[q.n] != null && QZ.ans[q.n] !== q.ans);
    if (!wrong.length) return toast(L('没有错题，太棒了', 'No wrong answers. Nice!'));
    try { await api(`quizzes/${encodeURIComponent(id)}/reset`, { method: 'POST', json: { only: wrong.map(q => q.n) } }); }
    catch (e) { return toast(e.message); }
    wrong.forEach(q => delete QZ.ans[q.n]);
    QZ.filter = 'weak'; store.set('quiz.filter', 'all');
    gotoQ(qs.indexOf(wrong[0])); toast(L(`已清空 ${wrong.length} 道错题的作答，重新做一遍（“曾错”里能一直找到它们）`, `Cleared ${wrong.length} wrong answers. Try them again (they stay under “Ever wrong”).`));
  };
  $('#resetAll').onclick = async () => {
    if (!confirm(L('清空这套题的全部作答？（“曾错”的累计次数会保留，方便以后找薄弱点）', 'Clear all answers for this quiz? (The “ever wrong” counts are kept so you can find weak spots later.)'))) return;
    try { await api(`quizzes/${encodeURIComponent(id)}/reset`, { method: 'POST', json: {} }); } catch (e) { return toast(e.message); }
    QZ.ans = {}; QZ.filter = 'all'; store.set('quiz.filter', 'all'); gotoQ(0);
  };
  $('#qmain').addEventListener('click', onQuizClick);

  const onKey = e => {
    if (e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') return hidePop();
    const q = qs[QZ.idx];
    const pick = /^[1-8]$/.test(k) ? +k - 1 : LET.indexOf(k.toUpperCase());
    if (k.length === 1 && pick >= 0 && pick < q.opts.length && QZ.ans[q.n] == null) { answer(pick); return; }
    if (k === 'Enter' && e.target.closest('button, a')) return;
    if (k === 'ArrowRight' || k === 'Enter') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { document.removeEventListener('keydown', onKey); QZ = null; };
  gotoQ(QZ.idx, true);
}

const everWrong = q => (QZ.prog[q.n]?.wrong || 0) > 0;
function visibleIdx() {
  const { quiz: { questions: qs }, ans, filter, ch } = QZ;
  return qs.map((q, i) => i).filter(i => {
    const q = qs[i], a = ans[q.n];
    if (ch !== 'all' && q.chapter !== ch) return false;
    if (filter === 'wrong') return a != null && a !== q.ans;
    if (filter === 'todo') return a == null;
    if (filter === 'weak') return everWrong(q) || (a != null && a !== q.ans);
    return true;
  });
}
function step(d) {
  const vis = visibleIdx();
  if (!vis.length) return;
  let pos = vis.indexOf(QZ.idx);
  if (pos < 0) pos = d > 0 ? -1 : vis.length;   // 当前题已被筛掉：从附近继续
  const next = vis[pos + d];
  if (next == null) return toast(d > 0 ? L('已经是最后一题', 'This is the last question') : L('已经是第一题', 'This is the first question'));
  gotoQ(next);
}
function gotoQ(i, first) {
  if (!QZ) return;
  QZ.idx = Math.max(0, Math.min(QZ.quiz.questions.length - 1, i));
  const q = QZ.quiz.questions[QZ.idx];
  const h = `#/quiz/${encodeURIComponent(QZ.id)}/${q.n}`;
  if (location.hash !== h) history.replaceState(null, '', h);
  hidePop();
  renderSide(); renderQuestion();
  $(`#qgrid [data-qi="${QZ.idx}"]`)?.scrollIntoView({ block: 'nearest', behavior: first ? 'auto' : 'smooth' });
  if (!first) $('#qmain').scrollTop = 0;
}

function renderSide() {
  const { quiz, ans } = QZ, qs = quiz.questions;
  const s = quizStats(qs, ans), done = s.right + s.wrong;
  const weak = qs.filter(q => everWrong(q) || (ans[q.n] != null && ans[q.n] !== q.ans)).length;
  const pct = done ? Math.round(s.right / done * 100) : 0;
  $('#qbar').style.width = (done / s.total * 100) + '%';
  const chRows = Object.entries(quiz.chapters).map(([k, c]) => {
    const cs = quizStats(qs.filter(q => q.chapter === k), ans);
    const w = x => (x / cs.total * 100) + '%';
    const link = c.deck && c.deck_ok ? `<a href="#/deck/${encodeURIComponent(c.deck)}" data-chdeck title="${L('打开这一章的课件', 'Open this chapter’s slides')}">${icon('book')}</a>` : '';
    return `<div class="qch"><span title="${esc(c.title)}">Ch.${esc(k)} ${esc(chTitle(c).replace(/^.*?·\s*/, ''))}</span>
      <span class="stack"><i class="ok" style="width:${w(cs.right)}"></i><i class="bad" style="width:${w(cs.wrong)}"></i></span>
      <em>${cs.right}/${cs.total}</em>${link}</div>`;
  }).join('');
  $('#qstats').innerHTML = `
    <div class="qnums">
      <div><b class="ok">${s.right}</b><span>${L('答对', 'Right')}</span></div>
      <div><b class="bad">${s.wrong}</b><span>${L('答错', 'Wrong')}</span></div>
      <div><b>${s.todo}</b><span>${L('未做', 'To do')}</span></div>
      <div><b>${done ? pct + '%' : '—'}</b><span>${L('正确率', 'Accuracy')}</span></div>
    </div>${chRows}`;
  $$('[data-chdeck]', $('#qstats')).forEach(a => a.onclick = () => setBack(L('回到题目', 'Back to quiz')));
  const fbtn = (f, l, c, t = '') => `<button data-f="${f}" class="${QZ.filter === f ? 'on' : ''}" title="${t}">${l}<span>${c}</span></button>`;
  const cbtn = (k, l) => `<button data-ch="${k}" class="${QZ.ch === k ? 'on' : ''}">${l}</button>`;
  $('#qfilters').innerHTML = `<div class="seg">${fbtn('all', L('全部', 'All'), s.total)}${fbtn('wrong', L('错题', 'Wrong'), s.wrong)}${fbtn('weak', L('曾错', 'Ever wrong'), weak, L('做错过的题，重做对了也保留在这里', 'Questions you ever got wrong, even after redoing them correctly'))}${fbtn('todo', L('未做', 'To do'), s.todo)}</div>
    <div class="seg chs">${cbtn('all', L('全部章节', 'All chapters'))}${Object.keys(quiz.chapters).map(k => cbtn(k, 'Ch.' + esc(k))).join('')}</div>`;
  const vis = new Set(visibleIdx());
  $('#qgrid').innerHTML = qs.map((q, i) => {
    const a = ans[q.n], st = a == null ? '' : a === q.ans ? 'ok' : 'bad';
    return `<button data-qi="${i}" class="${st} ${i === QZ.idx ? 'on' : ''} ${vis.has(i) ? '' : 'dim'} ${everWrong(q) ? 'weak' : ''}" title="Ch.${esc(q.chapter)} · Q${q.n}">${q.n}</button>`;
  }).join('');
}

// 英文模式：术语表里没有英文释义的，用词典补上
function fillTermCells(el) {
  if (LANG !== 'en' || !el) return;
  $$('[data-fill]', el).forEach(async td => {
    const mine = findWord(td.dataset.fill)?.d;      // 单词本里已有英文释义就直接用
    if (mine) { td.insertAdjacentHTML('afterbegin', esc(mine)); return; }
    const d = await fetchDict(td.dataset.fill);
    // 只要词典式的释义（“n. …”），短语查到的往往是整句例子，不如不显示
    const def = (d.en || []).find(x => /^(n|v|vt|vi|adj|adv|prep|noun|verb|adjective|adverb|phrase)\.?\s/i.test(x) && x.length <= 160);
    if (td.isConnected && def) td.insertAdjacentHTML('afterbegin', esc(def));
  });
}
function renderQuestion() {
  const el = $('#qmain'); if (!el || !QZ) return;
  const { quiz } = QZ, q = quiz.questions[QZ.idx], a = QZ.ans[q.n], done = a != null;
  const ch = quiz.chapters[q.chapter] || {};
  const showZh = LANG === 'zh' && (QZ.zh || done);
  const rec = QZ.prog[q.n] || {};
  const opts = q.opts.map((t, i) => {
    const cls = !done ? '' : i === q.ans ? 'right' : i === a ? 'wrong' : 'other';
    const mark = !done ? '' : i === q.ans ? `<span class="tag ok">${L('正确答案', 'Correct')}</span>` : i === a ? `<span class="tag bad">${L('你的选择', 'Your answer')}</span>` : '';
    return `<button class="opt ${cls}" data-pick="${i}" ${done ? 'disabled' : ''}>
      <span class="key">${LET[i]}</span>
      <span class="txt"><span class="en">${esc(t)}</span>${showZh && q.opts_zh?.[i] ? `<span class="zh">${esc(q.opts_zh[i])}</span>` : ''}</span>${mark}</button>`;
  }).join('');
  const deckLink = ch.deck && ch.deck_ok && q.page
    ? `<button class="btn" data-act="deck">${icon('book')}${L(`看课件 · Ch.${esc(q.chapter)} 第 ${q.page} 页`, `Slides · Ch.${esc(q.chapter)} page ${q.page}`)}</button>` : '';
  // 术语第二列：中文模式是中文释义；英文模式只显示英文的那部分
  const terms = (q.terms || []).map(([en, zh, note]) => {
    const mean = forLang(zh), nt = forLang(note), saved = inVocab(termWord(en));
    return `<tr><td class="t-en"><button data-say="${esc(en)}" title="${L('查词并发音', 'Look up and pronounce')}">${esc(en)}${icon('speak')}</button></td>
    <td class="t-zh" ${mean ? '' : `data-fill="${esc(termWord(en))}"`}>${esc(mean)}${nt ? `<span class="t-note">${esc(nt)}</span>` : ''}</td>
    <td class="t-save"><button class="ibtn ${saved ? 'on' : ''}" data-term="${esc(termWord(en))}" data-zh="${esc(hasCJK(zh) ? zh : '')}" data-en="${esc(hasCJK(zh) ? '' : zh)}" title="${saved ? L('已在单词本', 'In your word book') : L('加入单词本', 'Add to word book')}">${icon('star')}</button></td></tr>`;
  }).join('');
  const verdict = !done ? '' : a === q.ans
    ? `<div class="verdict ok">${icon('check')}<b>${L('回答正确', 'Correct')}</b><span>${L('答案', 'Answer')} ${LET[q.ans]}${rec.wrong ? L(` · 之前错过 ${rec.wrong} 次`, ` · wrong ${rec.wrong}× before`) : ''}</span></div>`
    : `<div class="verdict bad">${icon('x')}<b>${L('回答错误', 'Wrong')}</b><span>${L(`你选了 ${LET[a]}，正确答案是 ${LET[q.ans]}`, `You chose ${LET[a]}; the answer is ${LET[q.ans]}`)}${rec.wrong > 1 ? L(` · 累计错 ${rec.wrong} 次`, ` · wrong ${rec.wrong}× in total`) : ''}</span></div>`;
  const expEn = q.exp_en || q.why;
  const total = quiz.questions.length;
  el.innerHTML = `<article class="qcard">
    <div class="kicker"><span class="num">${pad2(q.n)}</span><span class="of">/ ${total}</span>
      <span class="qch-tag">Ch.${esc(q.chapter)} · ${esc(ch.title || '')}</span>${rec.wrong ? `<span class="weak-tag" title="${L('做错过的题', 'You got this wrong before')}">${L('曾错', 'Ever wrong')} ${rec.wrong}</span>` : ''}</div>
    <h1 class="qtext">${esc(q.q)}</h1>
    ${showZh && q.q_zh ? `<p class="qzh">${esc(q.q_zh)}</p>` : ''}
    <div class="opts">${opts}</div>
    ${!done ? `<p class="qhint muted">${L('点选项作答，或按键盘 A–D / 1–4；← → 切换题目；题干里的生词可以划词查、收藏进单词本。', 'Click an option or press A–D / 1–4; ← → to move between questions. Select any word to look it up and save it.')}</p>` : ''}
    ${done ? `<section class="explain">
      ${verdict}
      ${LANG === 'zh' ? `${q.exp_zh ? `<h2>中文解析</h2><p class="exp-zh">${esc(q.exp_zh)}</p>` : ''}
        ${expEn ? `<h2>English</h2><p class="exp-en">${esc(expEn)}</p>` : ''}`
        : expEn ? `<h2>Explanation</h2><p class="exp-en">${esc(expEn)}</p>`
        : q.exp_zh ? `<h2>Explanation <small class="muted">(only in Chinese so far)</small></h2><p class="exp-zh">${esc(q.exp_zh)}</p>` : ''}
      ${terms ? `<h2>${L('关键词', 'Key terms')} <small class="muted">${L('点 ☆ 加入单词本', 'click ☆ to save')}</small></h2><table class="terms">${terms}</table>` : ''}
      ${deckLink ? `<div class="from">${icon('bulb')}<div><b>${L('题目出处', 'Source')} · </b>${L(`${esc(chTitle(ch))}，第 ${q.page} 页。去课件里看看这道题考的原文。`, `${esc(chTitle(ch))}, page ${q.page}. See the slide this question is based on.`)}<div class="row">${deckLink}</div></div></div>` : ''}
    </section>` : ''}
    <div class="qnav">
      <button class="btn" data-act="prev">${icon('left')}${L('上一题', 'Previous')}</button>
      ${done ? `<button class="btn ghost sm" data-act="redo">${icon('redo')}${L('重做这题', 'Redo')}</button>` : `${deckLink ? `<button class="btn ghost sm" data-act="deck">${icon('book')}${L('先看课件', 'See the slide first')}</button>` : ''}`}
      <span class="spacer"></span>
      <button class="btn ${done ? 'primary' : ''}" data-act="next">${L('下一题', 'Next')}${icon('right')}</button>
    </div>
  </article>`;
  fillTermCells(el);
}

function saveAnswer(n, a) {
  api(`quizzes/${encodeURIComponent(QZ.id)}/answer`, { method: 'POST', json: { n, a } })
    .catch(e => toast(L('作答没保存上：', 'Answer not saved: ') + e.message));
}
function answer(i) {
  const q = QZ.quiz.questions[QZ.idx];
  QZ.ans[q.n] = i;
  const rec = QZ.prog[q.n] = QZ.prog[q.n] || { tries: 0, wrong: 0 };
  rec.tries++; if (i !== q.ans) rec.wrong++;
  saveAnswer(q.n, i);
  renderSide(); renderQuestion();
  $('.explain')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function quizCtx(q, w) {
  const k = w.toLowerCase();
  const sents = t => String(t || '').split(/(?<=[.!?])\s+/);
  for (const t of [q.q, ...sents(q.exp_en), ...sents(q.why), ...q.opts]) if (t && t.toLowerCase().includes(k)) return t.trim();
  return q.q;
}
const termWord = en => en.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
function quizSrc(w) {
  const q = QZ.quiz.questions[QZ.idx];
  return { course: QZ.quiz.course || null, src: [{ kind: 'quiz', id: QZ.id, n: q.n, ctx: quizCtx(q, w) }] };
}

async function onQuizClick(e) {
  const say = e.target.closest('[data-say]');
  if (say) { const r = say.getBoundingClientRect(); return lookup(say.dataset.say, { x: r.left, y: r.bottom, top: r.top }); }
  const t = e.target.closest('[data-term]');
  if (t) {
    if (inVocab(t.dataset.term)) { location.hash = `#/vocab?q=${encodeURIComponent(t.dataset.term)}`; return; }
    await addWord({ w: t.dataset.term, m: t.dataset.zh, d: t.dataset.en, ...quizSrc(t.dataset.term) });
    t.classList.add('on'); t.title = L('已在单词本', 'In your word book'); toast(L('已加入单词本', 'Added to word book'));
    return;
  }
  const p = e.target.closest('[data-pick]');
  if (p && !p.disabled) return answer(+p.dataset.pick);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const q = QZ.quiz.questions[QZ.idx];
  switch (b.dataset.act) {
    case 'prev': return step(-1);
    case 'next': return step(1);
    case 'redo': delete QZ.ans[q.n]; saveAnswer(q.n, null); renderSide(); return renderQuestion();
    case 'deck': {
      const ch = QZ.quiz.chapters[q.chapter];
      setBack(L(`回到第 ${q.n} 题`, `Back to Q${q.n}`));
      location.hash = `#/deck/${encodeURIComponent(ch.deck)}/${q.page}`;
    }
  }
}

/* ================================================================ 发音（英式） */
const audio = new Audio();
let gbVoice = null;
const pickVoice = () => { const v = speechSynthesis.getVoices(); gbVoice = v.find(x => x.lang === 'en-GB' && /Google|Natural|Libby|Sonia|Ryan/i.test(x.name)) || v.find(x => x.lang === 'en-GB') || null; };
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(word) {
  const btn = $('#pop .speak');
  btn?.classList.add('playing');
  const done = () => btn?.classList.remove('playing');
  audio.onended = done;
  audio.onerror = () => { done(); tts(word); };
  audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`;
  audio.play().catch(() => { done(); tts(word); });
}
function tts(word) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-GB'; if (gbVoice) u.voice = gbVoice; u.rate = .9;
  speechSynthesis.speak(u);
}
let autoSpeak = store.get('autoSpeak', true);
function setupAutoSpeak() {
  const b = $('#autoSpeak');
  b.setAttribute('aria-pressed', autoSpeak);
  b.onclick = () => { autoSpeak = !autoSpeak; b.setAttribute('aria-pressed', autoSpeak); store.set('autoSpeak', autoSpeak); toast(autoSpeak ? L('已开启自动发音', 'Auto-speak on') : L('已关闭自动发音', 'Auto-speak off')); };
}

/* ================================================================ 词典 */
const dictCache = new Map();
async function fetchDict(q) {
  const key = q.toLowerCase();
  if (dictCache.has(key)) { const c = dictCache.get(key); if (LANG === 'en') await ensureEnglish(c, q); return c; }
  let res = null;
  try { res = await api('dict?q=' + encodeURIComponent(q)); } catch {}
  if (!res || res.error || (!res.zh?.length && !res.web?.length)) res = await fallbackDict(q);
  if (LANG === 'en') await ensureEnglish(res, q);
  dictCache.set(key, res);
  return res;
}
// 英文模式要英英释义：有道没给就再查一次 Free Dictionary
async function ensureEnglish(res, q) {
  if (res.en?.length >= 2 || res.enTried || /\s/.test(q)) return res;
  res.enTried = true;
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(q));
    const d = r.ok ? await r.json() : null;
    const seen = new Set((res.en = res.en || []).map(x => x.toLowerCase()));
    for (const m of (d?.[0]?.meanings || []).slice(0, 3)) {
      const def = m.definitions?.[0]?.definition; if (!def) continue;
      const line = `${m.partOfSpeech}. ${def}`;
      if (!seen.has(line.toLowerCase())) { res.en.push(line); seen.add(line.toLowerCase()); }
      if (!res.example && m.definitions[0].example) res.example = m.definitions[0].example;
    }
    if (!res.uk && d?.[0]) res.uk = ((d[0].phonetics || []).find(p => p.text) || {}).text?.replace(/^\/|\/$/g, '') || '';
  } catch {}
  return res;
}
async function fallbackDict(q) {
  const res = { word: q, uk: '', zh: [], web: [], en: [], fallback: true };
  const jobs = [];
  if (!/\s/.test(q)) jobs.push(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(q)).then(r => r.ok ? r.json() : null).then(d => {
    if (!d?.[0]) return;
    const ph = d[0].phonetics || [];
    res.uk = ((ph.find(p => /-uk\.mp3/.test(p.audio || '')) || ph.find(p => p.text) || {}).text || d[0].phonetic || '').replace(/^\/|\/$/g, '');
    (d[0].meanings || []).slice(0, 2).forEach(m => m.definitions?.[0] && res.en.push(`${m.partOfSpeech}. ${m.definitions[0].definition}`));
  }).catch(() => {}));
  jobs.push(fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`).then(r => r.json()).then(d => {
    const t = d?.responseData?.translatedText; if (t && t.toLowerCase() !== q.toLowerCase()) res.zh.push(t);
  }).catch(() => {}));
  await Promise.all(jobs);
  return res;
}
function courseMeaning(w) {
  const k = w.toLowerCase();
  const keys = [k, k.replace(/s$/, ''), k.replace(/ies$/, 'y')];
  const norm = en => en.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  if (QZ) {
    for (const q of QZ.quiz.questions) for (const [en, zh] of (q.terms || [])) if (keys.includes(norm(en)) && forLang(zh)) return zh;
    return null;
  }
  if (!R) return null;
  for (const n of Object.keys(R.notes)) for (const [en, zh] of (R.notes[n]?.k || [])) if (keys.includes(norm(en)) && forLang(zh)) return zh;
  return null;
}
function pageCtx(w) {
  // 课件文字按行存，表格单元格各占一行：命中的那行太短就接上后面几行
  const lines = (R.deck.pages[R.cur - 1]?.text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const k = w.toLowerCase(), i = lines.findIndex(l => l.toLowerCase().includes(k));
  if (i < 0) return '';
  let out = lines[i];
  for (let j = i + 1; out.length < 60 && j < lines.length && j < i + 4; j++) out += ' ' + lines[j];
  return out.slice(0, 300);
}
function srcEntry(w) {
  if (QZ) return quizSrc(w);
  if (P) return { course: null, src: [{ kind: 'deck', id: P.id, page: P.lastCtx?.page || P.cur, ctx: P.lastCtx?.ctx || '' }] };
  if (R) return { course: R.deck.course || null, src: [{ kind: 'deck', id: R.id, page: R.cur, ctx: pageCtx(w) }] };
  return {};
}

/* ================================================================ 单词本：数据 */
let VOCAB = null, vocabLoading = null;
const vkey = w => String(w || '').trim().toLowerCase().replace(/\s+/g, ' ');
const findWord = w => (VOCAB || []).find(v => vkey(v.w) === vkey(w));
const inVocab = w => !!findWord(w);
const SRS_DAYS = [0, 1, 2, 4, 7, 15, 30, 60];
const DAY = 86400;

async function migrateVocab() {
  const old = store.get('vocab', null);
  if (!old || !old.length) return;
  let decks = [];
  try { decks = (await api('decks')).decks; } catch {}
  const words = old.map(v => {
    const d = decks.find(x => x.title === v.d);
    return { w: v.w, m: v.m, uk: v.uk, src: d && v.p ? [{ kind: 'deck', id: d.id, page: v.p }] : [] };
  });
  try { await api('vocab/migrate', { method: 'POST', json: { words } }); localStorage.removeItem('kj.vocab'); toast(L(`已把浏览器里的 ${words.length} 个生词搬进单词本`, `${words.length} words from this browser were moved into the word book`)); } catch {}
}
async function loadVocab(force) {
  if (VOCAB && !force) return VOCAB;
  if (!vocabLoading) vocabLoading = (async () => {
    await migrateVocab();
    const r = await api('vocab');
    VOCAB = r.words; VSTAT = r.stats;
    return VOCAB;
  })().finally(() => { vocabLoading = null; });
  return vocabLoading;
}
function localStats() {
  const now = Date.now() / 1000, st = { total: VOCAB.length, due: 0, new: 0, learning: 0, mastered: 0 };
  for (const v of VOCAB) {
    const s = v.srs || {};
    if ((s.due || 0) <= now) st.due++;
    if (!s.reps) st.new++; else if ((s.level || 0) >= 5) st.mastered++; else st.learning++;
  }
  return (VSTAT = st);
}
function putLocal(v) {
  if (!VOCAB) return;
  const i = VOCAB.findIndex(x => vkey(x.w) === vkey(v.w));
  if (i >= 0) VOCAB[i] = v; else VOCAB.unshift(v);
  localStats();
}
async function addWord(entry) {
  const v = await api('vocab', { method: 'POST', json: entry });
  await loadVocab(); putLocal(v); updateCount();
  if (!v.m || !v.d || !v.uk) fillWord(v).catch(() => {});
  return v;
}
// 中文释义 m 和英文释义 d 两个都存：以后切换语言，单词本不用重查
const enDef = d => (d.en || []).slice(0, 2).join('; ');
async function fillWord(v) {
  const d = await fetchDict(v.w);
  await ensureEnglish(d, v.w);
  const patch = {};
  if (!v.m && (d.zh?.[0] || d.web?.[0])) patch.m = d.zh?.[0] || d.web[0];
  if (!v.d && enDef(d)) patch.d = enDef(d);
  if (!v.uk && d.uk) patch.uk = d.uk;
  if (!Object.keys(patch).length) return v;
  return patchWord(v.w, patch);
}
// 当前语言下显示的释义
const meaningOf = v => LANG === 'en' ? (v.d || forLang(v.m)) : (v.m || v.d || '');
async function removeWord(w) {
  await api('vocab/' + encodeURIComponent(w), { method: 'DELETE' });
  if (VOCAB) { VOCAB = VOCAB.filter(v => vkey(v.w) !== vkey(w)); localStats(); }
  updateCount();
}
async function patchWord(w, patch) {
  const v = await api('vocab/' + encodeURIComponent(w), { method: 'PUT', json: patch });
  putLocal(v); return v;
}

const srsOf = v => v.srs || { level: 0, due: 0, reps: 0, lapses: 0 };
const isDue = v => (srsOf(v).due || 0) <= Date.now() / 1000;
function statusOf(v) {
  const s = srsOf(v);
  if (!s.reps) return 'new';
  return s.level >= 5 ? 'mastered' : 'learning';
}
function fmtDays(d) {
  if (d < 1 / 24) return Math.max(1, Math.round(d * 1440)) + L(' 分钟', ' min');
  if (d < 1) return Math.round(d * 24) + L(' 小时', ' h');
  if (d < 30) { const n = Math.round(d); return n + L(' 天', n === 1 ? ' day' : ' days'); }
  const n = Math.round(d / 30); return n + L(' 个月', n === 1 ? ' month' : ' months');
}
function dueText(v) {
  const s = srsOf(v), d = ((s.due || 0) - Date.now() / 1000) / DAY;
  if (!s.reps) return L('新词', 'New');
  if (d <= 0) return L('今天复习', 'Due today');
  return L(fmtDays(d) + '后', 'in ' + fmtDays(d));
}
// 与 userdata.review_word 保持一致
function nextInterval(v, grade) {
  const lvl = srsOf(v).level || 0;
  if (grade === 'again') return 10 / 1440;
  if (grade === 'hard') return Math.max(0.5, SRS_DAYS[Math.max(1, lvl)] / 2);
  return SRS_DAYS[Math.min(SRS_DAYS.length - 1, lvl + (grade === 'good' ? 1 : 2))];
}
function levelDots(v) {
  const l = srsOf(v).level || 0;
  return `<span class="lvl" title="${L('熟练度', 'Level')} ${l}/7">${Array.from({ length: 7 }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
}
const markWord = (ctx, w) => {
  const s = esc(ctx), k = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(new RegExp(`(${k})`, 'ig'), '<mark>$1</mark>');
};

// 出处名称：课件 / 题库 ID → 标题
let NAMES = { decks: {}, quizzes: {}, courses: [] };
async function loadNames() {
  try {
    const m = await api('manifest');
    const decks = {}, quizzes = {};
    for (const g of [...m.courses, m.unassigned]) {
      g.decks.forEach(d => { decks[d.id] = d.title; });
      g.quizzes.forEach(z => { quizzes[z.id] = z.title; });
    }
    (m.papers || []).forEach(p => { decks[p.id] = p.title; });
    NAMES = { decks, quizzes, papers: new Set((m.papers || []).map(p => p.id)), courses: m.courses.map(({ decks: _d, quizzes: _q, ...c }) => c) };
  } catch {}
  return NAMES;
}
function srcChip(s) {
  if (s.kind === 'deck') {
    const t = NAMES.decks[s.id];
    return `<a class="src" href="#/${NAMES.papers?.has(s.id) ? 'paper' : 'deck'}/${encodeURIComponent(s.id)}/${s.page || 1}" data-back title="${esc(t || s.id)}">${icon(NAMES.papers?.has(s.id) ? 'paper' : 'book')}${esc(shortTitle(t || s.id))}${s.page ? L(` · 第 ${s.page} 页`, ` · p.${s.page}`) : ''}</a>`;
  }
  const t = NAMES.quizzes[s.id];
  return `<a class="src" href="#/quiz/${encodeURIComponent(s.id)}/${s.n || ''}" data-back title="${esc(t || s.id)}">${icon('check')}${esc(shortTitle(t || s.id))}${s.n ? L(` · 第 ${s.n} 题`, ` · Q${s.n}`) : ''}</a>`;
}
const shortTitle = t => t.length > 18 ? t.slice(0, 17) + '…' : t;

/* ================================================================ 单词本页面 */
let VB = null;
async function showVocab(course) {
  document.body.classList.remove('reading');
  document.title = L('单词本', 'Word book') + ' · ' + APP();
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  VB = { course: course || '', q: qs.get('q') || '', st: store.get('vb.st', 'all'), sort: store.get('vb.sort', 'new') };
  $('#app').innerHTML = pageBar('vocab') + `
    <main class="lib vb">
      <div class="lib-head">
        <div><h1>${L('单词本', 'Word book')}</h1><p>${L('读课件、做题时收藏的词都在这里，记着出处。按遗忘曲线安排复习：忘了的词很快再见，记住的词间隔越来越长。', 'Every word you saved from slides and quizzes, with where it came from. Reviews follow a forgetting curve: forgotten words come back soon, known words less and less often.')}</p></div>
        <div class="row"><button class="btn" id="vFill" style="display:none"></button><button class="btn" id="vExport">${icon('copy')}${L('复制给 AI', 'Copy for AI')}</button><button class="btn" id="vCsv">${L('导出 CSV', 'Export CSV')}</button></div>
      </div>
      <div class="vb-hero" id="vHero"></div>
      <div class="vb-tools">
        <input type="search" id="vQ" placeholder="${L('搜索单词、释义、备注、标签…', 'Search words, definitions, notes, tags…')}" value="${esc(VB.q)}">
        <select id="vCourse"></select>
        <div class="seg" id="vSt"></div>
        <select id="vSort">${[['new', L('最近加入', 'Recently added')], ['az', L('字母顺序', 'A–Z')], ['lapse', L('最常忘记', 'Most forgotten')], ['due', L('下次复习', 'Next review')]].map(([k, l]) => `<option value="${k}" ${VB.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div id="vList"><div class="skel h"></div></div>
    </main>`;
  wireBar();
  try { await Promise.all([loadVocab(true), loadNames()]); } catch (e) { toast(e.message); return; }
  if (!$('#vList')) return;
  $('#vCourse').innerHTML = `<option value="">${L('全部课程', 'All courses')}</option>` + NAMES.courses.map(c => `<option value="${esc(c.id)}" ${VB.course === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="-" ${VB.course === '-' ? 'selected' : ''}>${L('未分类', 'Unsorted')}</option>`;
  $('#vQ').oninput = e => { VB.q = e.target.value; renderVocabList(); };
  $('#vCourse').onchange = e => { VB.course = e.target.value; renderVocabPage(); };
  $('#vSort').onchange = e => { VB.sort = e.target.value; store.set('vb.sort', VB.sort); renderVocabList(); };
  $('#vSt').onclick = e => { const b = e.target.closest('[data-st]'); if (!b) return; VB.st = b.dataset.st; store.set('vb.st', VB.st); renderVocabPage(); };
  $('#vExport').onclick = () => copyExport('vocab/export', L('单词本', 'the word book'));
  $('#vCsv').onclick = exportCsv;
  $('#vFill').onclick = fillMissing;
  $('#vList').addEventListener('click', onVocabClick);
  renderVocabPage();
  refreshNav('vocab');
  api('vocab/where').then(w => { if (VB) { VB.where = w; renderVocabList(); } }).catch(() => {});
}
// 单词本卡片：除了收藏时的出处，还列出它在同一门课里出现的其他地方
function alsoChips(v) {
  const hits = VB?.where?.[v.w]; if (!hits) return '';
  const src = v.src || [];
  const chips = hits.map(h => {
    if (h.kind === 'deck') {
      const ps = h.pages.filter(p => !src.some(s => s.kind === 'deck' && s.id === h.id && s.page === p));
      if (!ps.length) return '';
      const t = NAMES.decks[h.id] || h.id;
      const shown = ps.slice(0, 4).join(', ') + (ps.length > 4 ? '…' : '');
      return `<a class="src also" href="#/deck/${encodeURIComponent(h.id)}/${ps[0]}" data-back title="${esc(t)}">${icon('book')}${esc(shortTitle(t))} · ${L(`第 ${shown} 页`, `p.${shown}`)}</a>`;
    }
    const ns = h.n.filter(n => !src.some(s => s.kind === 'quiz' && s.id === h.id && s.n === n));
    if (!ns.length) return '';
    const t = NAMES.quizzes[h.id] || h.id;
    return `<a class="src also" href="#/quiz/${encodeURIComponent(h.id)}/${ns[0]}" data-back title="${esc(t)}">${icon('check')}${esc(shortTitle(t))} · ${ns.slice(0, 4).map(n => 'Q' + n).join(', ')}${ns.length > 4 ? '…' : ''}</a>`;
  }).filter(Boolean);
  return chips.length ? `<span class="also-l">${L('也出现在', 'Also in')}</span>${chips.join('')}` : '';
}
const inCourse = v => !VB.course || (VB.course === '-' ? !v.course : v.course === VB.course);
function renderVocabPage() {
  const words = VOCAB.filter(inCourse);
  const due = words.filter(isDue).length;
  const cnt = k => words.filter(v => statusOf(v) === k).length;
  const lapse = words.filter(v => (srsOf(v).lapses || 0) >= 2).length;
  const cq = VB.course ? `course=${encodeURIComponent(VB.course)}&` : '';
  $('#vHero').innerHTML = `
    <div class="vb-due"><b>${due}</b><span>${L('今天要复习', 'due today')}</span></div>
    <div class="qnums sm"><div><b>${words.length}</b><span>${L('总数', 'Total')}</span></div><div><b>${cnt('new')}</b><span>${L('新词', 'New')}</span></div>
      <div><b>${cnt('learning')}</b><span>${L('学习中', 'Learning')}</span></div><div><b class="ok">${cnt('mastered')}</b><span>${L('已掌握', 'Mastered')}</span></div></div>
    <span class="spacer"></span>
    <div class="row">${due ? `<a class="btn primary" href="#/vocab/review?${cq}">${icon('cards')}${L(`开始复习 ${due} 个`, `Review ${due} now`)}</a>` : `<span class="muted">${L('今天的复习做完了 ✓', 'All done for today ✓')}</span>`}
      ${words.length ? `<a class="btn" href="#/vocab/review?${cq}all=1" title="${L('不管有没有到期，全部过一遍（考前突击）', 'Go through every word, due or not (exam cramming)')}">${L('全部过一遍', 'Review all')}</a>` : ''}</div>`;
  const sb = (k, l, c) => `<button data-st="${k}" class="${VB.st === k ? 'on' : ''}">${l}<span>${c}</span></button>`;
  $('#vSt').innerHTML = sb('all', L('全部', 'All'), words.length) + sb('due', L('待复习', 'Due'), due) + sb('new', L('新词', 'New'), cnt('new')) + sb('learning', L('学习中', 'Learning'), cnt('learning')) + sb('mastered', L('已掌握', 'Mastered'), cnt('mastered')) + sb('lapse', L('易忘', 'Often forgotten'), lapse);
  // 有词缺当前语言的释义：给一个一键补全
  const miss = missingWords().length, fb = $('#vFill');
  if (fb) { fb.style.display = miss ? '' : 'none'; fb.innerHTML = `${icon('spark')}${L(`补全中文释义 ${miss}`, `Add English definitions (${miss})`)}`; }
  renderVocabList();
}
const missingWords = () => (VOCAB || []).filter(v => LANG === 'en' ? !v.d : !v.m);
async function fillMissing() {
  const list = missingWords(), fb = $('#vFill');
  if (!list.length) return;
  fb.disabled = true;
  let done = 0, got = 0;
  for (const v of list) {
    fb.textContent = L(`正在查词 ${done + 1}/${list.length}…`, `Looking up ${done + 1}/${list.length}…`);
    try { const r = await fillWord(v); if (LANG === 'en' ? r.d : r.m) got++; } catch {}
    done++;
  }
  fb.disabled = false;
  if (!$('#vList')) return;
  renderVocabPage();
  toast(L(`补全了 ${got} 个词的释义`, `Definitions added for ${got} words`) + (got < list.length ? L(`，${list.length - got} 个没查到，可以手动编辑`, `; ${list.length - got} not found, edit them by hand`) : ''));
}
function filteredWords() {
  const q = VB.q.trim().toLowerCase();
  let list = VOCAB.filter(inCourse).filter(v => {
    if (VB.st === 'due' && !isDue(v)) return false;
    if (VB.st === 'lapse' && (srsOf(v).lapses || 0) < 2) return false;
    if (['new', 'learning', 'mastered'].includes(VB.st) && statusOf(v) !== VB.st) return false;
    if (!q) return true;
    return [v.w, v.m, v.d, v.note, ...(v.tags || [])].some(x => String(x || '').toLowerCase().includes(q));
  });
  const by = {
    new: (a, b) => (b.added || 0) - (a.added || 0),
    az: (a, b) => a.w.localeCompare(b.w, 'en', { sensitivity: 'base' }),
    lapse: (a, b) => (srsOf(b).lapses || 0) - (srsOf(a).lapses || 0) || (srsOf(a).level || 0) - (srsOf(b).level || 0),
    due: (a, b) => (srsOf(a).due || 0) - (srsOf(b).due || 0),
  }[VB.sort];
  return list.sort(by);
}
function renderVocabList() {
  const el = $('#vList'); if (!el) return;
  const list = filteredWords();
  if (!VOCAB.length) {
    el.innerHTML = `<div class="empty-big">${icon('cards')}<h3>${L('单词本还是空的', 'Your word book is empty')}</h3><p>${L('读课件或做题时划一下不认识的词，在弹出的词典里点“收藏”，它就会带着出处出现在这里。', 'Select an unfamiliar word on a slide or in a quiz and click “Save” in the dictionary. It shows up here with its source.')}</p></div>`;
    return;
  }
  if (!list.length) { el.innerHTML = `<p class="muted center">${L('没有符合条件的单词。', 'No words match.')}</p>`; return; }
  const cname = id => NAMES.courses.find(c => c.id === id);
  el.innerHTML = list.map(v => {
    const s = srsOf(v), c = cname(v.course);
    const ctx = (v.src || []).find(x => x.ctx)?.ctx;
    return `<article class="vcard ${isDue(v) ? 'due' : ''}" data-w="${esc(v.w)}">
      <div class="vc-main">
        <div class="vc-w"><b>${esc(v.w)}</b>${v.uk ? `<span class="ph">/${esc(v.uk)}/</span>` : ''}
          <button class="ibtn" data-v="say" title="${L('英式发音', 'British pronunciation')}">${icon('speak')}</button></div>
        <div class="vc-m">${esc(meaningOf(v)) || `<span class="muted">${L('（还没有释义，点“编辑”补上）', '(No English definition yet. Click “Edit” or “Add English definitions”.)')}</span>`}</div>
        ${ctx ? `<div class="vc-ctx">${markWord(ctx, v.w)}</div>` : ''}
        ${v.note ? `<div class="vc-note">${icon('edit')}${esc(v.note)}</div>` : ''}
        <div class="vc-src">${c ? `<span class="ctag" style="--cc:${esc(c.color)}">${esc(c.name)}</span>` : ''}${(v.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}${(v.src || []).map(srcChip).join('')}${alsoChips(v)}</div>
      </div>
      <div class="vc-side">
        ${levelDots(v)}
        <small class="${isDue(v) ? 'duet' : 'muted'}">${dueText(v)}${s.lapses ? L(` · 忘过 ${s.lapses} 次`, ` · forgotten ${s.lapses}×`) : ''}</small>
        <div class="row"><button class="btn sm ghost" data-v="edit">${icon('edit')}${L('编辑', 'Edit')}</button><button class="ibtn" data-v="del" title="${L('删除', 'Delete')}">${icon('trash')}</button></div>
      </div></article>`;
  }).join('');
}
async function onVocabClick(e) {
  const a = e.target.closest('a[data-back]');
  if (a) { setBack(L('回到单词本', 'Back to words')); return; }
  const b = e.target.closest('[data-v]'); if (!b) return;
  const w = b.closest('[data-w]').dataset.w, v = findWord(w);
  if (b.dataset.v === 'say') return speak(w);
  if (b.dataset.v === 'edit') return wordDialog(v, () => renderVocabPage());
  if (b.dataset.v === 'del') {
    if (!confirm(L(`从单词本删除 “${w}”？复习记录也会一起删除。`, `Remove “${w}” from your word book? Its review history goes too.`))) return;
    await removeWord(w); renderVocabPage(); toast(L('已删除', 'Deleted'));
  }
}
async function wordDialog(v, after) {
  if (!NAMES.courses.length) await loadNames();
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-head"><h2>${esc(v.w)}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      ${(() => {
        const mF = `<label class="field"><span>${L('中文释义', 'Chinese meaning')}</span><input type="text" id="wM" value="${esc(v.m)}"></label>`;
        const dF = `<label class="field"><span>${L('英文释义', 'English definition')}</span><textarea id="wD" rows="2">${esc(v.d)}</textarea></label>`;
        return LANG === 'en' ? dF + mF : mF + dF;   // 当前语言的释义放前面
      })()}
      <div class="two"><label class="field"><span>${L('英式音标', 'British IPA')}</span><input type="text" id="wUk" value="${esc(v.uk)}" placeholder="${L('可空', 'optional')}"></label>
        <label class="field"><span>${L('所属课程', 'Course')}</span><select id="wCourse">${courseOptions(NAMES.courses, v.course)}</select></label></div>
      <label class="field"><span>${L('备注 / 例句 / 记忆方法', 'Notes / example / memory aid')}</span><textarea id="wNote" rows="3">${esc(v.note)}</textarea></label>
      <label class="field"><span>${L('标签（空格分隔）', 'Tags (space separated)')}</span><input type="text" id="wTags" value="${esc((v.tags || []).join(' '))}" placeholder="${L('例如 Mintzberg 考点', 'e.g. Mintzberg exam')}"></label>
      ${(v.src || []).length ? `<div class="note-box">${L('出处', 'Sources')}: ${v.src.map(srcChip).join(' ')}</div>` : ''}
    </div>
    <div class="dlg-foot"><button class="btn ghost sm" type="button" id="wReset" title="${L('把这个词当成新词重新学', 'Learn this word again from scratch')}">${icon('redo')}${L('重新学', 'Relearn')}</button>
      <button class="btn ghost sm" type="button" id="wLook">${icon('spark')}${L('查词补全', 'Fill from dictionary')}</button>
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="wSave">${L('保存', 'Save')}</button></div></form>`;
  $('#wLook').onclick = async () => {
    const d = await fetchDict(v.w); await ensureEnglish(d, v.w);
    if (!$('#wM').value.trim() && (d.zh?.[0] || d.web?.[0])) $('#wM').value = d.zh?.[0] || d.web[0];
    if (!$('#wD').value.trim() && enDef(d)) $('#wD').value = enDef(d);
    if (!$('#wUk').value.trim() && d.uk) $('#wUk').value = d.uk;
  };
  $('#wSave').onclick = async e => {
    e.preventDefault();
    try {
      await patchWord(v.w, { m: $('#wM').value.trim(), d: $('#wD').value.trim(), uk: $('#wUk').value.trim(), note: $('#wNote').value.trim(),
        tags: $('#wTags').value.split(/[\s,，]+/).filter(Boolean), course: $('#wCourse').value || null });
    } catch (err) { return toast(err.message); }
    dlg.close(); after?.(); toast(L('已保存', 'Saved'));
  };
  $('#wReset').onclick = async () => {
    // 用一次“忘了”把它退回 0 级
    try { putLocal(await api(`vocab/${encodeURIComponent(v.w)}/review`, { method: 'POST', json: { grade: 'again' } })); } catch (err) { return toast(err.message); }
    dlg.close(); after?.(); toast(L('已退回新学阶段，10 分钟后出现在复习里', 'Reset to new. It will come up for review in 10 minutes.'));
  };
  $$('a[data-back]', dlg).forEach(a => a.onclick = () => { setBack(L('回到单词本', 'Back to words')); dlg.close(); });
  dlg.showModal();
}
function exportCsv() {
  const cell = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const rows = [['word', 'meaning_zh', 'definition_en', 'uk', 'note', 'tags', 'course', 'sources', 'level', 'lapses', 'due']];
  for (const v of filteredWords()) {
    const s = srsOf(v);
    rows.push([v.w, v.m, v.d, v.uk, v.note, (v.tags || []).join(' '), NAMES.courses.find(c => c.id === v.course)?.name || '',
      (v.src || []).map(x => x.kind === 'deck' ? `${NAMES.decks[x.id] || x.id} p${x.page}` : `${NAMES.quizzes[x.id] || x.id} Q${x.n}`).join('; '),
      s.level || 0, s.lapses || 0, s.due ? new Date(s.due * 1000).toLocaleDateString() : '']);
  }
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: L('单词本.csv', 'word-book.csv') });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================================================================ 复习（闪卡） */
let RV = null;
async function openReview(course, all) {
  document.body.classList.remove('reading');
  document.title = L('复习单词', 'Review') + ' · ' + APP();
  $('#app').innerHTML = pageBar('vocab') + `<main class="review" id="rv"><div class="skel h"></div></main>`;
  wireBar();
  try { await Promise.all([loadVocab(true), loadNames()]); } catch (e) { toast(e.message); return; }
  const pool = VOCAB.filter(v => !course || (course === '-' ? !v.course : v.course === course));
  let queue = all ? pool.slice().sort(() => Math.random() - .5) : pool.filter(isDue).sort((a, b) => (srsOf(a).due || 0) - (srsOf(b).due || 0));
  RV = { queue: queue.map(v => v.w), done: 0, total: queue.length, again: new Set(), grades: { again: 0, hard: 0, good: 0, easy: 0 },
         shown: false, rev: store.get('rv.rev', false), course, all, back: `#/vocab${course ? '?course=' + encodeURIComponent(course) : ''}` };
  const onKey = e => {
    if (e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!RV || !RV.queue.length) return;
    if ((e.key === ' ' || e.key === 'Enter') && !RV.shown) { e.preventDefault(); reveal(); }
    else if (RV.shown && /^[1-4]$/.test(e.key)) grade(['again', 'hard', 'good', 'easy'][+e.key - 1]);
    else if (e.key === 'Escape') location.hash = RV.back;
    else if (e.key.toLowerCase() === 'p') speak(RV.queue[0]);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { document.removeEventListener('keydown', onKey); RV = null; };
  $('#rv').addEventListener('click', onReviewClick);
  renderCard();
}
function renderCard() {
  const el = $('#rv'); if (!el || !RV) return;
  if (!RV.queue.length) return renderSummary();
  const v = findWord(RV.queue[0]);
  if (!v) { RV.queue.shift(); return renderCard(); }
  const pct = RV.total ? Math.round(RV.done / RV.total * 100) : 0;
  const ctxs = (v.src || []).filter(s => s.ctx).slice(0, 2);
  const mean = meaningOf(v);
  const front = RV.rev
    ? `<div class="fc-m big">${esc(mean) || `<span class="muted">${L('（没有释义）', '(no definition)')}</span>`}</div><p class="muted">${L('想一想英文怎么说', 'Which word is this?')}</p>`
    : `<div class="fc-w">${esc(v.w)}</div>${v.uk ? `<div class="ph">/${esc(v.uk)}/</div>` : ''}`;
  const back = `
    ${RV.rev ? `<div class="fc-w">${esc(v.w)}</div>${v.uk ? `<div class="ph">/${esc(v.uk)}/</div>` : ''}` : `<div class="fc-m">${esc(mean) || `<span class="muted">${L('（没有释义，复习完可以在单词本里补上）', '(No definition yet. Add one in the word book after reviewing.)')}</span>`}</div>`}
    ${v.note ? `<div class="vc-note">${icon('edit')}${esc(v.note)}</div>` : ''}
    ${ctxs.map(s => `<div class="vc-ctx">${markWord(s.ctx, v.w)}</div>`).join('')}
    <div class="vc-src">${(v.src || []).map(srcChip).join('')}</div>`;
  const g = (k, l, n) => `<button class="grade g-${k}" data-g="${k}"><b>${l}</b><small>${fmtDays(nextInterval(v, k))}</small><kbd>${n}</kbd></button>`;
  el.innerHTML = `
    <div class="rv-top"><a class="btn ghost sm" href="${RV.back}">${icon('left')}${L('结束', 'Finish')}</a>
      <span class="meter"><i style="width:${pct}%"></i></span><span class="muted">${RV.done} / ${RV.total}${RV.again.size ? L(` · 再来 ${RV.again.size}`, ` · again ${RV.again.size}`) : ''}</span>
      <button class="chip-btn" id="rvRev" aria-pressed="${RV.rev}" title="${L('先看中文，回想英文', 'See the definition first, recall the word')}">${L('中→英', 'Definition → word')}</button></div>
    <article class="flash ${RV.shown ? 'shown' : ''}">
      <div class="fc-front">${front}<button class="ibtn" data-r="say" title="${L('发音', 'Pronounce')} (P)">${icon('speak')}</button>${levelDots(v)}</div>
      ${RV.shown ? `<div class="fc-back">${back}</div>` : `<button class="btn primary reveal" data-r="show">${L('显示答案', 'Show answer')} <kbd>${L('空格', 'Space')}</kbd></button>`}
    </article>
    ${RV.shown ? `<div class="grades">${g('again', L('忘了', 'Forgot'), 1)}${g('hard', L('模糊', 'Hard'), 2)}${g('good', L('认识', 'Good'), 3)}${g('easy', L('太简单', 'Easy'), 4)}</div>` : ''}`;
  if (!RV.shown && !RV.rev && autoSpeak) speak(v.w);
  $('#rvRev').onclick = () => { RV.rev = !RV.rev; store.set('rv.rev', RV.rev); renderCard(); };
}
function reveal() { RV.shown = true; renderCard(); if (RV.rev && autoSpeak) speak(RV.queue[0]); }
async function grade(g) {
  const w = RV.queue[0];
  let v;
  try { v = await api(`vocab/${encodeURIComponent(w)}/review`, { method: 'POST', json: { grade: g } }); }
  catch (e) { return toast(e.message); }
  if (!RV) return;
  putLocal(v);
  RV.grades[g]++;
  RV.queue.shift();
  if (g === 'again') { RV.again.add(w); RV.queue.splice(Math.min(3, RV.queue.length), 0, w); }
  else { RV.done++; RV.again.delete(w); }
  RV.shown = false;
  renderCard();
}
function onReviewClick(e) {
  if (e.target.closest('a[data-back]')) return setBack(L('回到复习', 'Back to review'));
  const b = e.target.closest('[data-r], [data-g]'); if (!b) return;
  if (b.dataset.g) return grade(b.dataset.g);
  if (b.dataset.r === 'say') return speak(RV.queue[0]);
  if (b.dataset.r === 'show') return reveal();
}
function renderSummary() {
  const el = $('#rv'), G = RV.grades;
  const nav = $('.topnav'); if (nav) nav.outerHTML = navHTML('vocab');
  const left = VOCAB.filter(v => (!RV.course || (RV.course === '-' ? !v.course : v.course === RV.course)) && isDue(v)).length;
  el.innerHTML = `<div class="rv-done">
    <div class="art">${icon('check')}</div>
    <h2>${RV.total ? L(`复习完成：${RV.total} 个词`, `Review done: ${RV.total} words`) : L('现在没有要复习的词', 'Nothing to review right now')}</h2>
    ${RV.total ? `<div class="qnums sm"><div><b class="bad">${G.again}</b><span>${L('忘了', 'Forgot')}</span></div><div><b>${G.hard}</b><span>${L('模糊', 'Hard')}</span></div>
      <div><b class="ok">${G.good}</b><span>${L('认识', 'Good')}</span></div><div><b class="ok">${G.easy}</b><span>${L('太简单', 'Easy')}</span></div></div>
      <p class="muted">${L('忘了的词 10 分钟后会再出现；认识的词按 1 → 2 → 4 → 7 → 15 → 30 → 60 天的间隔复习。', 'Forgotten words come back in 10 minutes; known words are reviewed after 1 → 2 → 4 → 7 → 15 → 30 → 60 days.')}</p>` :
      `<p class="muted">${L('收藏的词会在到期那天出现在这里。也可以点“全部过一遍”考前突击。', 'Saved words appear here on the day they are due. Use “Review all” to cram before an exam.')}</p>`}
    <div class="row center">${left ? `<a class="btn primary" href="#/vocab/review?${RV.course ? 'course=' + encodeURIComponent(RV.course) + '&' : ''}t=${Date.now()}">${L(`再复习 ${left} 个`, `Review ${left} more`)}</a>` : ''}
      <a class="btn" href="${RV.back}">${L('回单词本', 'Back to words')}</a></div></div>`;
}

/* ---------- 阅读器侧栏：本课件生词 ---------- */
function deckWords() {
  if (!R || !VOCAB) return [];
  return VOCAB.filter(v => (v.src || []).some(s => s.kind === 'deck' && s.id === R.id))
    .map(v => ({ v, pages: [...new Set(v.src.filter(s => s.kind === 'deck' && s.id === R.id).map(s => s.page).filter(Boolean))].sort((a, b) => a - b) }))
    .sort((a, b) => (a.pages[0] || 0) - (b.pages[0] || 0));
}
function alsoInDeck() {
  if (!R || !R.inDeck) return [];
  const mine = new Set(deckWords().map(x => x.v.w.toLowerCase()));
  return R.inDeck.filter(x => !mine.has(x.w.toLowerCase())).map(x => ({ v: findWord(x.w), pages: x.pages })).filter(x => x.v);
}
function updateCount() {
  const c = $('#vcount'); if (c) c.textContent = deckWords().length + alsoInDeck().length;
  const m = $('#mcount'); if (m && R) m.textContent = Object.keys(R.marks || {}).length;
}
function renderVocab() {
  const el = $('#vocab'); if (!el || !R) return;
  const list = deckWords(), also = alsoInDeck();
  const hasTerms = Object.values(R.notes || {}).some(n => n && (n.k || []).length);
  const head = `<div class="pane-head"><b>${L('本课件的生词', 'Saved here')} ${list.length}</b><span class="spacer"></span>
    <a class="btn sm" href="#/vocab/review${R.deck.course ? '?course=' + encodeURIComponent(R.deck.course) : ''}">${icon('cards')}${L('复习', 'Review')}</a><a class="btn sm ghost" href="#/vocab">${L('单词本', 'Word book')}</a></div>
    <div class="pane-tools">${hasTerms ? `<button class="btn sm ghost" id="vTerms" title="${L('把讲解卡片里的关键术语收进单词本，不用 AI', 'Save the key terms from the notes (no AI needed)')}">${icon('plus')}${L('收集讲解里的术语', 'Save key terms from notes')}</button>` : ''}
      <button class="btn sm ghost" id="vAI">${icon('spark')}${L('AI 挑生词', 'Pick words with AI')}</button></div>`;
  const row = ({ v, pages }) => `<div class="vrow" data-w="${esc(v.w)}"><span class="w">${esc(v.w)}</span>
    <span class="ph">${v.uk ? '/' + esc(v.uk) + '/' : ''} ${pages.map(p => `<button class="pg ${p === R.cur ? 'on' : ''}" data-pg="${p}">${L(`第 ${p} 页`, `p.${p}`)}</button>`).join('')}</span>
    <div class="act"><button class="ibtn" data-vs title="${L('英式发音', 'British pronunciation')}">${icon('speak')}</button><button class="ibtn" data-ve title="${L('编辑', 'Edit')}">${icon('edit')}</button></div>
    <span class="m">${esc(meaningOf(v))}</span></div>`;
  el.innerHTML = head + (list.length ? list.map(row).join('') : `<div class="vocab-empty"><b>${L('还没有生词', 'No words yet')}</b>${L('在课件上划词，查到的单词点“收藏”就会出现在这里，并记住是第几页。也可以用上面的按钮一次收进一批。', 'Select a word on the slide and click “Save”, or use the buttons above to add a batch.')}</div>`) +
    (also.length ? `<div class="pane-sub">${L(`单词本里的其他词，也出现在这份课件 · ${also.length}`, `Also in these slides, from your word book · ${also.length}`)}</div>` + also.map(row).join('') : '');
  $('#vTerms') && ($('#vTerms').onclick = () => collectTerms({ deck: R.id }).then(refreshInDeck));
  $('#vAI').onclick = () => studioDialog('words', [{ id: R.id, title: R.deck.title }], [R.id], R.deck.course || null);
  el.onclick = e => {
    const row = e.target.closest('[data-w]'); if (!row) return;
    const w = row.dataset.w;
    if (e.target.closest('[data-pg]')) return go(+e.target.closest('[data-pg]').dataset.pg);
    if (e.target.closest('[data-vs]')) return speak(w);
    if (e.target.closest('[data-ve]')) return wordDialog(findWord(w), renderVocab);
  };
}

/* ================================================================ 论文库 */
const pendingPapers = new Map();   // key -> {id, name, job, folder}
let PL = null;                     // 论文库页面状态
const authorsText = (a, n = 4) => !a?.length ? '' : a.slice(0, n).join(', ') + (a.length > n ? L(' 等', ' et al.') : '');

async function showPapers(folder, q) {
  document.body.classList.remove('reading');
  document.title = L('论文库', 'Papers') + ' · ' + APP();
  $('#app').innerHTML = pageBar('papers') + `
    <main class="lib papers-lib">
      <div class="lib-head">
        <div><h1>${L('论文库', 'Papers')}</h1><p>${L('导入 PDF 或填 arXiv 编号，按文件夹收藏。读的时候划词、划句就能翻译，AI 帮你讲清楚问题、方法和框架图。', 'Import a PDF or an arXiv ID and keep papers in folders. Select any word or sentence to translate it, and let AI explain the problem, the method and the framework figure.')}</p></div>
        <div class="row"><button class="btn" id="pAdd">${icon('link')}${L('arXiv / 链接', 'arXiv / link')}</button>
          <button class="btn primary" id="pImport">${icon('upload')}${L('导入 PDF', 'Import PDF')}</button></div>
      </div>
      <div class="plib">
        <aside class="folders" id="folders"></aside>
        <section class="plist-wrap">
          <div class="ptools"><label class="psearch">${icon('search')}<input type="search" id="pq" placeholder="${L('搜索标题、作者、备注', 'Search titles, authors, notes')}"></label>
            <select id="psort"><option value="opened">${L('最近打开', 'Recently opened')}</option><option value="created">${L('最近添加', 'Recently added')}</option><option value="title">${L('标题', 'Title')}</option><option value="year">${L('年份', 'Year')}</option></select></div>
          <div id="plist"></div>
        </section>
      </div>
      <input type="file" id="pfile" accept=".pdf" multiple hidden>
    </main>`;
  wireBar();
  PL = { folder: folder || '', q: q || '', sort: store.get('papers.sort', 'opened'), data: null };
  $('#pq').value = PL.q; $('#psort').value = PL.sort;
  $('#pq').oninput = () => { PL.q = $('#pq').value; renderPaperList(); };
  $('#psort').onchange = () => { PL.sort = $('#psort').value; store.set('papers.sort', PL.sort); renderPaperList(); };
  $('#pImport').onclick = () => $('#pfile').click();
  $('#pAdd').onclick = () => addPaperDialog();
  $('#pfile').onchange = e => { [...e.target.files].forEach(f => importPaper(f, PL.folder && PL.folder !== '-' ? PL.folder : null)); e.target.value = ''; };
  await loadPapers();
  refreshNav('papers');
  const t = setInterval(() => { if (pendingPapers.size) renderPaperList(); }, 1200);
  cleanup = () => clearInterval(t);
}
async function loadPapers() {
  try { PL.data = await api('papers'); } catch (e) { toast(e.message); return; }
  if (PL.folder && PL.folder !== '-' && !PL.data.folders.some(f => f.id === PL.folder)) PL.folder = '';
  renderFolders(); renderPaperList();
}
const folderOf = id => (PL?.data?.folders || []).find(f => f.id === id);
function renderFolders() {
  const el = $('#folders'); if (!el || !PL.data) return;
  const ps = PL.data.papers, cnt = id => ps.filter(p => (p.folder || '') === id).length;
  const item = (id, label, n, color) => `<div class="fitem ${PL.folder === id ? 'on' : ''}" data-f="${esc(id)}" role="button" tabindex="0">
      ${color ? `<i style="background:${esc(color)}"></i>` : icon(id === '' ? 'paper' : 'folder')}<span class="fname">${esc(label)}</span><em>${n}</em>
      ${color ? `<button class="ibtn" data-fedit="${esc(id)}" title="${L('文件夹设置', 'Folder settings')}">${icon('dots')}</button>` : ''}</div>`;
  el.innerHTML = item('', L('全部论文', 'All papers'), ps.length) + item('-', L('未归档', 'Unfiled'), cnt('')) +
    `<div class="fhead"><span>${L('文件夹', 'Folders')}</span><button class="ibtn" id="newFolder" title="${L('新建文件夹', 'New folder')}">${icon('plus')}</button></div>` +
    PL.data.folders.map(f => item(f.id, f.name, cnt(f.id), f.color)).join('') +
    (PL.data.folders.length ? '' : `<p class="muted small fhint">${L('新建文件夹，按课题、项目或会议整理论文。把论文拖到文件夹上就能移动。', 'Create folders by topic, project or venue. Drag a paper onto a folder to move it.')}</p>`);
  el.onclick = e => {
    const ed = e.target.closest('[data-fedit]');
    if (ed) { e.stopPropagation(); return folderDialog(folderOf(ed.dataset.fedit)); }
    if (e.target.closest('#newFolder')) return folderDialog();
    const f = e.target.closest('[data-f]'); if (!f) return;
    PL.folder = f.dataset.f;
    history.replaceState(null, '', '#/papers' + (PL.folder ? '?f=' + encodeURIComponent(PL.folder) : ''));
    renderFolders(); renderPaperList();
  };
  // 把论文拖到文件夹上
  $$('[data-f]', el).forEach(f => {
    f.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-paper')) { e.preventDefault(); f.classList.add('over'); } });
    f.addEventListener('dragleave', () => f.classList.remove('over'));
    f.addEventListener('drop', async e => {
      const pid = e.dataTransfer.getData('text/x-paper'); f.classList.remove('over');
      if (!pid || f.dataset.f === '') return;
      e.preventDefault(); e.stopPropagation();
      const to = f.dataset.f === '-' ? null : f.dataset.f;
      try { await api('papers/' + encodeURIComponent(pid), { method: 'PUT', json: { folder: to } }); } catch (er) { return toast(er.message); }
      toast(to ? L(`已移到「${folderOf(to)?.name}」`, `Moved to “${folderOf(to)?.name}”`) : L('已移出文件夹', 'Moved out of the folder'));
      loadPapers();
    });
  });
}
function filteredPapers() {
  let ps = (PL.data?.papers || []).filter(p => !PL.folder || (PL.folder === '-' ? !p.folder : p.folder === PL.folder));
  const q = PL.q.trim().toLowerCase();
  if (q) ps = ps.filter(p => [p.title, p.note, (p.meta.authors || []).join(' '), p.meta.venue, p.meta.year, p.meta.arxiv].join(' ').toLowerCase().includes(q));
  const by = { opened: (a, b) => Math.max(b.opened, b.created) - Math.max(a.opened, a.created), created: (a, b) => b.created - a.created,
    title: (a, b) => a.title.localeCompare(b.title), year: (a, b) => (b.meta.year || '').localeCompare(a.meta.year || '') }[PL.sort];
  return ps.sort(by);
}
function paperRow(p) {
  const href = `#/paper/${encodeURIComponent(p.id)}`, f = folderOf(p.folder), m = p.meta || {};
  const marks = p.highlights + p.pins;
  return `<article class="prow" draggable="true" data-pid="${esc(p.id)}">
    <a class="pthumb" href="${href}" style="background-image:url('${p.base}thumbs/001.jpg')" aria-label="${esc(p.title)}" draggable="false"></a>
    <div class="pbody">
      <h3><a href="${href}" draggable="false">${esc(p.title)}</a></h3>
      <div class="pauth">${esc([authorsText(m.authors), m.year, m.venue && m.venue.length < 60 ? m.venue : ''].filter(Boolean).join(' · ')) || `<span class="muted">${esc(p.source)}</span>`}</div>
      <div class="pmeta">
        ${f ? `<span class="fchip" style="--fc:${esc(f.color)}"><i></i>${esc(f.name)}</span>` : ''}
        <span class="bchip ${p.brief ? 'on' : ''}">${icon('spark')}${p.brief ? L('已解读', 'Explained') : L('未解读', 'Not explained')}</span>
        <span>${L(`${p.pages} 页`, `${p.pages} pages`)}${p.figs ? L(` · ${p.figs} 个图表`, ` · ${p.figs} figures`) : ''}</span>
        ${marks ? `<span>${icon('note')}${L(`${marks} 处批注`, pl(marks, 'mark'))}</span>` : ''}
        ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener" class="plink" draggable="false">${icon('link')}${m.arxiv ? 'arXiv ' + esc(m.arxiv) : L('原文', 'Source')}</a>` : ''}
      </div>
      <div class="pnote ${p.note ? '' : 'empty'}" data-pnote="${esc(p.id)}" title="${L('点击编辑备注', 'Click to edit the note')}">${p.note ? esc(p.note) : L('+ 添加备注', '+ Add a note')}</div>
    </div>
    <button class="ibtn" data-pmenu="${esc(p.id)}" title="${L('论文设置', 'Paper settings')}">${icon('dots')}</button></article>`;
}
function pendingPaperRows() {
  return [...pendingPapers.values()].map(p => {
    const j = p.job || {}, failed = j.status === 'error', pct = j.total ? Math.round(j.done / j.total * 100) : 4;
    return `<article class="prow pending ${failed ? 'failed' : ''}"><div class="pthumb"></div><div class="pbody"><h3>${esc(p.name)}</h3>
      <div class="pauth">${esc(srvMsg(failed ? j.message : (j.message || L('正在上传…', 'Uploading…'))))}</div>
      ${failed ? `<div class="row"><button class="btn sm" data-pdismiss="${esc(p.id)}">${L('知道了', 'OK')}</button></div>` : `<span class="meter"><i style="width:${pct}%"></i></span>`}</div></article>`;
  }).join('');
}
function renderPaperList() {
  const el = $('#plist'); if (!el || !PL.data) return;
  const ps = filteredPapers(), pend = pendingPaperRows();
  const all = PL.data.papers.length;
  el.innerHTML = pend + ps.map(paperRow).join('') + (!ps.length && !pend ? (all && (PL.q || PL.folder)
    ? `<p class="vocab-empty">${PL.q ? L('没有找到匹配的论文。', 'No papers match.') : L('这个文件夹还是空的。把论文拖进来，或者在论文的 ⋯ 菜单里移动。', 'This folder is empty. Drag papers onto it, or move them from their ⋯ menu.')}</p>`
    : `<button class="drop" id="pDrop"><span class="big">${icon('paper')}</span><b>${L('导入第一篇论文', 'Add your first paper')}</b>
        <span>${L('把 PDF 拖到这里，或者点击选择文件', 'Drop a PDF here, or click to choose a file')}</span>
        <small>${L('也可以点右上角「arXiv / 链接」，比如填 2504.15278', 'Or use “arXiv / link” above, e.g. 2504.15278')}</small></button>`) : '');
  $('#pDrop') && ($('#pDrop').onclick = () => $('#pfile').click());
  $$('[data-pdismiss]', el).forEach(b => b.onclick = () => { pendingPapers.delete(b.dataset.pdismiss); renderPaperList(); });
  $$('[data-pmenu]', el).forEach(b => b.onclick = e => { e.preventDefault(); paperDialog(PL.data.papers.find(p => p.id === b.dataset.pmenu)); });
  $$('[data-pnote]', el).forEach(n => n.onclick = () => editRowNote(n));
  $$('.prow[draggable]', el).forEach(r => r.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-paper', r.dataset.pid); e.dataTransfer.effectAllowed = 'move'; }));
}
function editRowNote(n) {
  if (n.querySelector('textarea')) return;
  const p = PL.data.papers.find(x => x.id === n.dataset.pnote); if (!p) return;
  n.classList.remove('empty');
  n.innerHTML = `<textarea rows="3" placeholder="${L('为什么收藏这篇？读到哪了？和你的课题有什么关系？', 'Why you saved it, how far you got, how it relates to your work…')}">${esc(p.note)}</textarea>
    <div class="row"><span class="muted small">${L('Ctrl+Enter 保存 · Esc 取消', 'Ctrl+Enter to save · Esc to cancel')}</span><span class="spacer"></span><button class="btn sm" data-x>${L('取消', 'Cancel')}</button><button class="btn sm primary" data-ok>${L('保存', 'Save')}</button></div>`;
  const ta = $('textarea', n); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  const save = async () => {
    try { await api('papers/' + encodeURIComponent(p.id), { method: 'PUT', json: { note: ta.value } }); p.note = ta.value.trim() ? ta.value : ''; } catch (e) { toast(e.message); }
    renderPaperList();
  };
  $('[data-ok]', n).onclick = e => { e.stopPropagation(); save(); };
  $('[data-x]', n).onclick = e => { e.stopPropagation(); renderPaperList(); };
  ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); if (e.key === 'Escape') renderPaperList(); };
  n.onclick = null;
}
function watchPaperJob(key, job, open) {
  pendingPapers.get(key).job = job;
  pollJob(job.id, j => {
    const p = pendingPapers.get(key); if (!p) return;
    p.job = j;
    if (j.status === 'done') {
      pendingPapers.delete(key);
      if ($('#plist')) loadPapers();
      const go = () => location.hash = `#/paper/${encodeURIComponent(j.result)}`;
      if (j.existing) { toast(L('这篇论文已经在论文库里了', 'This paper is already in your library'), { label: L('打开', 'Open'), fn: go }); return; }
      toast(L(`《${j.name || p.name}》已导入`, `“${j.name || p.name}” imported`), { label: L('打开', 'Open'), fn: go });
      if (open) go();
    } else if (j.status === 'error' && $('#plist')) renderPaperList();
  });
}
async function importPaper(file, folder) {
  if (!/\.pdf$/i.test(file.name)) return toast(L(`论文请导入 PDF：${file.name}`, `Papers must be PDFs: ${file.name}`));
  const key = 'pp-' + Math.random().toString(36).slice(2);
  pendingPapers.set(key, { id: key, name: file.name, folder, job: { message: L('正在上传…', 'Uploading…') } });
  renderPaperList();
  try {
    const headers = { 'X-Filename': encodeURIComponent(file.name) };
    if (folder) headers['X-Folder'] = encodeURIComponent(folder);
    watchPaperJob(key, await api('papers/import', { method: 'POST', body: file, headers }));
  } catch (e) { pendingPapers.get(key).job = { status: 'error', message: e.message }; renderPaperList(); }
}
function folderSelect(cur, id = 'pFolder') {
  return `<select id="${id}"><option value="">${L('未归档', 'Unfiled')}</option>${(PL?.data?.folders || []).map(f => `<option value="${esc(f.id)}" ${f.id === cur ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`;
}
async function ensureFolders() { if (!PL?.data) { PL = PL || { folder: '', q: '', sort: 'opened' }; try { PL.data = await api('papers'); } catch {} } }
async function addPaperDialog() {
  await ensureFolders();
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><div class="dlg-head"><h2>${L('从 arXiv / 链接添加论文', 'Add a paper from arXiv or a link')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('arXiv 编号或链接', 'arXiv ID or link')}</span><input type="text" id="pUrl" placeholder="2504.15278  ·  https://arxiv.org/abs/2504.15278  ·  https://…/paper.pdf" autofocus>
        <small>${L('arXiv 论文会自动带上标题、作者、摘要。其它网站请填 PDF 的直接下载链接。', 'arXiv papers come with title, authors and abstract. For other sites, use a direct link to the PDF.')}</small></label>
      <label class="field"><span>${L('放进文件夹', 'Folder')}</span>${folderSelect(PL.folder && PL.folder !== '-' ? PL.folder : '')}</label>
      <div class="test-msg" id="pMsg"></div></div>
    <div class="dlg-foot"><span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="pGo" type="submit" value="ok">${L('添加', 'Add')}</button></div></form>`;
  $('#pGo').onclick = async e => {
    e.preventDefault();
    const url = $('#pUrl').value.trim(), folder = $('#pFolder').value || null;
    if (!url) return;
    try {
      const job = await api('papers/fetch', { method: 'POST', json: { url, folder } });
      const key = 'pp-' + Math.random().toString(36).slice(2);
      pendingPapers.set(key, { id: key, name: url, folder, job });
      dlg.close(); renderPaperList();
      watchPaperJob(key, job);
    } catch (er) { $('#pMsg').className = 'test-msg bad'; $('#pMsg').textContent = er.message; }
  };
  dlg.showModal();
}
async function folderDialog(f) {
  const dlg = $('#dlg');
  let color = f?.color || SWATCHES[(PL?.data?.folders.length || 0) % SWATCHES.length];
  dlg.innerHTML = `<form method="dialog"><div class="dlg-head"><h2>${f ? L('文件夹设置', 'Folder settings') : L('新建文件夹', 'New folder')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('名称', 'Name')}</span><input type="text" id="fName" value="${esc(f?.name || '')}" placeholder="${L('例如：3D 重建、毕业论文、CVPR 2025', 'e.g. 3D reconstruction, Thesis, CVPR 2025')}" autofocus></label>
      <div class="field"><span>${L('颜色', 'Colour')}</span><div class="swatches">${SWATCHES.map(c => `<button type="button" class="sw ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
      ${f ? `<p class="muted small">${L('删除文件夹不会删除论文，里面的论文会回到“未归档”。', 'Deleting a folder keeps its papers; they become unfiled.')}</p>` : ''}</div>
    <div class="dlg-foot">${f ? `<button class="btn ghost danger" type="button" id="fDel">${L('删除文件夹', 'Delete folder')}</button>` : ''}<span class="spacer"></span>
      <button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="fOk" value="ok">${L('保存', 'Save')}</button></div></form>`;
  $$('.sw', dlg).forEach(b => b.onclick = () => { color = b.dataset.c; $$('.sw', dlg).forEach(x => x.classList.toggle('on', x === b)); });
  $('#fOk').onclick = async e => {
    e.preventDefault();
    const name = $('#fName').value.trim(); if (!name) return $('#fName').focus();
    try {
      const r = f ? await api('folders/' + encodeURIComponent(f.id), { method: 'PUT', json: { name, color } }) : await api('folders', { method: 'POST', json: { name, color } });
      dlg.close();
      if (PL && $('#plist')) { if (!f) PL.folder = r.id; loadPapers(); }
      if (P) { P.folders = (await api('papers')).folders; renderPMarks(); }
    } catch (er) { toast(er.message); }
  };
  if ($('#fDel')) $('#fDel').onclick = async () => {
    if (!confirm(L(`删除文件夹「${f.name}」？里面的论文会回到“未归档”。`, `Delete the folder “${f.name}”? Its papers become unfiled.`))) return;
    try { await api('folders/' + encodeURIComponent(f.id), { method: 'DELETE' }); } catch (er) { return toast(er.message); }
    dlg.close(); if (PL.folder === f.id) PL.folder = ''; loadPapers();
  };
  dlg.showModal();
}
async function paperDialog(p, after) {
  await ensureFolders();
  const dlg = $('#dlg'), m = p.meta || {};
  dlg.innerHTML = `<form method="dialog"><div class="dlg-head"><h2>${L('论文信息', 'Paper details')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('标题', 'Title')}</span><input type="text" id="eTitle" value="${esc(p.title)}"></label>
      <label class="field"><span>${L('作者', 'Authors')} <small>${L('用逗号分隔', 'comma-separated')}</small></span><input type="text" id="eAuth" value="${esc((m.authors || []).join(', '))}"></label>
      <div class="two"><label class="field"><span>${L('年份', 'Year')}</span><input type="text" id="eYear" value="${esc(m.year || '')}"></label>
        <label class="field"><span>${L('发表在', 'Venue')}</span><input type="text" id="eVenue" value="${esc(m.venue || '')}" placeholder="CVPR 2025"></label></div>
      <div class="two"><label class="field"><span>${L('文件夹', 'Folder')}</span>${folderSelect(p.folder, 'eFolder')}</label>
        <label class="field"><span>${L('链接', 'Link')}</span><input type="text" id="eUrl" value="${esc(m.url || '')}"></label></div>
      <label class="field"><span>${L('备注', 'Note')}</span><textarea id="eNote" rows="4" placeholder="${L('为什么收藏这篇？读到哪了？和你的课题有什么关系？', 'Why you saved it, how far you got, how it relates to your work…')}">${esc(p.note || '')}</textarea></label>
    </div>
    <div class="dlg-foot"><button class="btn ghost danger" type="button" id="eDel">${icon('trash')}${L('删除', 'Delete')}</button>
      <button class="btn ghost" type="button" id="eCopy">${icon('copy')}${L('复制给 AI', 'Copy for AI')}</button><span class="spacer"></span>
      <button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="eOk" value="ok">${L('保存', 'Save')}</button></div></form>`;
  $('#eOk').onclick = async e => {
    e.preventDefault();
    try {
      await api('papers/' + encodeURIComponent(p.id), { method: 'PUT', json: { title: $('#eTitle').value, folder: $('#eFolder').value || null, note: $('#eNote').value,
        meta: { authors: $('#eAuth').value, year: $('#eYear').value, venue: $('#eVenue').value, url: $('#eUrl').value } } });
      dlg.close(); toast(L('已保存', 'Saved'));
      if ($('#plist')) loadPapers();
      after?.();
    } catch (er) { toast(er.message); }
  };
  $('#eCopy').onclick = () => copyExport(`papers/${encodeURIComponent(p.id)}/export`, L('论文内容（含解读和批注）', 'the paper with its notes and marks'));
  $('#eDel').onclick = async () => {
    if (!confirm(L(`删除《${p.title}》？论文、AI 解读和所有批注都会删除，无法恢复。`, `Delete “${p.title}”? The paper, its AI guide and all your marks will be deleted. This can’t be undone.`))) return;
    try { await api('papers/' + encodeURIComponent(p.id), { method: 'DELETE' }); } catch (er) { return toast(er.message); }
    dlg.close(); toast(L('已删除', 'Deleted'));
    if ($('#plist')) loadPapers(); else location.hash = '#/papers';
  };
  dlg.showModal();
}

/* ================================================================ 论文阅读器 */
let P = null;  // 当前论文

async function openPaper(id, page) {
  document.body.classList.add('reading');
  const app = $('#app');
  app.innerHTML = `<header class="bar">${brandHTML()}<div class="crumb"><span class="muted">/</span><b>…</b></div></header>`;
  let paper, marks = {}, lib = { folders: [] };
  try {
    [paper, marks, lib] = await Promise.all([api('papers/' + encodeURIComponent(id)), api(`decks/${encodeURIComponent(id)}/marks`).catch(() => ({})),
      api('papers').catch(() => ({ folders: [] })), loadVocab().catch(() => [])]);
  } catch (e) { app.innerHTML += `<main class="lib"><p>${esc(e.message)}</p><a class="btn" href="#/papers">${L('返回论文库', 'Back to papers')}</a></main>`; return; }
  const words = await fetch(paper.base + 'words.json').then(r => r.json()).catch(() => []);
  const N = paper.pages.length;
  P = { id, paper, words, N, cur: Math.min(Math.max(1, page || store.get('page.' + id, 1)), N), marks: marks || {}, folders: lib.folders || [],
        brief: paper.brief_data || {}, figs: paper.figs_list || [], tab: store.get('paper.tab', 'brief'), built: new Set(), pinMode: false,
        settings: null, job: null, noteTimer: null };
  api('settings').then(s => { if (P?.id === id) P.settings = s; }).catch(() => {});
  document.title = paper.title + ' · ' + APP();
  const f = P.folders.find(x => x.id === paper.folder);
  const toc = (paper.toc || []).filter(t => t[0] <= 2);
  app.innerHTML = `
    <header class="bar">${brandHTML()}
      <div class="crumb"><span class="muted">/</span><a href="#/papers" class="ccrumb">${L('论文库', 'Papers')}</a><span class="muted">/</span>
        ${f ? `<a href="#/papers?f=${encodeURIComponent(f.id)}" class="ccrumb" style="--cc:${esc(f.color)}">${esc(f.name)}</a><span class="muted">/</span>` : ''}<b title="${esc(paper.title)}">${esc(paper.title)}</b></div>
      <div class="progress"><i id="bar"></i></div>
      <div class="tools">
        ${toc.length ? `<select class="chip-sel" id="pToc" title="${L('跳到章节', 'Jump to a section')}"><option value="">${L('目录', 'Contents')}</option>${toc.map(t => `<option value="${t[2]}">${t[0] > 1 ? '　' : ''}${esc(t[1].slice(0, 60))}</option>`).join('')}</select>` : ''}
        <span class="pageno" id="pageNo"></span>
        <button class="chip-btn" id="pinBtn" title="${L('在论文上贴便签（N）', 'Stick a note on the paper (N)')}">${icon('note')}<span class="lbl">${L('便签', 'Note')}</span></button>
        <button class="chip-btn" id="briefBtn" title="${L('AI 解读这篇论文', 'Explain this paper with AI')}">${icon('spark')}<span class="lbl">${L('AI 解读', 'AI guide')}</span></button>
        <button class="chip-btn" id="autoSpeak" title="${L('划词后自动播放英式发音', 'Play British pronunciation after selecting a word')}">${icon('speak')}</button>
        ${langBtnHTML()}
        <button class="chip-btn" id="setBtn" title="${L('AI 设置', 'AI settings')}">${icon('gear')}</button>
        <button class="chip-btn" id="themeBtn" title="${L('切换深浅色', 'Light / dark')}">${icon('moon')}</button>
      </div>
    </header>
    <main class="reader paper-reader" id="reader">
      <section class="left"><div class="pscroll" id="pscroll">${paper.pages.map(p => `<div class="ppage" data-n="${p.n}" style="aspect-ratio:${p.w} / ${p.h}">
        <img alt="" draggable="false"><div class="hl"></div><div class="tl"></div><div class="pins"></div><em class="pnum">${p.n}</em></div>`).join('')}</div></section>
      <div class="split" id="split" title="${L('拖动调整宽度', 'Drag to resize')}"></div>
      <aside class="panel">
        <div class="tabs">
          <button data-tab="brief">${L('AI 解读', 'AI guide')}</button>
          <button data-tab="pmarks">${L('我的批注', 'My notes')}<span class="count" id="mcount">0</span></button>
          <button data-tab="figs">${L('图表', 'Figures')}<span class="count">${P.figs.length}</span></button>
        </div>
        <div id="jobbar"></div>
        <div class="pane" id="brief"></div>
        <div class="pane" id="pmarks" hidden></div>
        <div class="pane" id="figs" hidden></div>
      </aside>
    </main>`;
  $('#setBtn').onclick = openSettings;
  $('#themeBtn').onclick = toggleTheme;
  $('#langBtn').onclick = () => switchLang();
  $('#briefBtn').onclick = () => briefDialog();
  $('#pinBtn').onclick = () => setPinMode(!P.pinMode);
  $('#pToc') && ($('#pToc').onchange = e => { if (e.target.value) pGo(+e.target.value); e.target.value = ''; });
  setupAutoSpeak();
  setupSplit();
  $$('.tabs [data-tab]').forEach(b => b.onclick = () => { pFlushNote(); pShowTab(b.dataset.tab); });
  $('#brief').addEventListener('click', onBriefClick);
  $('#figs').addEventListener('click', onBriefClick);
  $('#pmarks').addEventListener('click', onPMarksClick);
  $('#pmarks').addEventListener('input', onPMarksInput);
  $('#pmarks').addEventListener('change', onPMarksChange);
  const sc = $('#pscroll');
  sc.addEventListener('click', onPageClick);
  // 页面进入视野附近才加载图片和文字层
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) pBuild(+e.target.dataset.n); }), { root: sc, rootMargin: '900px 0px' });
  $$('.ppage', sc).forEach(pg => io.observe(pg));
  let rt = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => P?.built.forEach(pFit), 120); });
  ro.observe(sc);
  let st = 0;
  sc.addEventListener('scroll', () => { if (!st) st = requestAnimationFrame(() => { st = 0; pTrack(); }); }, { passive: true });
  const onKey = e => {
    if (e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { hidePop(); if (P.pinMode) setPinMode(false); return; }
    if (e.key.toLowerCase() === 'n') setPinMode(!P.pinMode);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { pFlushNote(); io.disconnect(); ro.disconnect(); document.removeEventListener('keydown', onKey); P?.stopPoll?.(); P = null; };
  pShowTab(P.tab);
  updatePCount();
  requestAnimationFrame(() => { pGo(P.cur, true); pTrack(); });
}

function pPage(n) { return $(`#pscroll .ppage[data-n="${n}"]`); }
function pGo(n, instant) {
  const pg = pPage(Math.max(1, Math.min(P.N, n))); if (!pg) return;
  $('#pscroll').scrollTo({ top: pg.offsetTop - 12, behavior: instant ? 'auto' : 'smooth' });
}
// 让页面上的某个位置（页面坐标）出现在视野里，并闪一下
function pReveal(n, y, flash) {
  const pg = pPage(n); if (!pg) return;
  pBuild(n);
  const h = P.paper.pages[n - 1].h, top = pg.offsetTop + (y != null ? y / h * pg.offsetHeight - 140 : -12);
  $('#pscroll').scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  if (flash) setTimeout(() => { flash.classList?.add('flash'); setTimeout(() => flash.classList?.remove('flash'), 1600); }, 350);
}
function pTrack() {
  if (!P) return;
  const sc = $('#pscroll'), mid = sc.scrollTop + sc.clientHeight * 0.35;
  let cur = 1;
  for (const pg of $$('.ppage', sc)) { if (pg.offsetTop <= mid) cur = +pg.dataset.n; else break; }
  const max = sc.scrollHeight - sc.clientHeight;
  $('#bar').style.width = (max > 0 ? sc.scrollTop / max * 100 : 100) + '%';
  if (cur === P.cur && $('#pageNo').textContent) return;
  P.cur = cur;
  $('#pageNo').textContent = `${cur} / ${P.N}`;
  store.set('page.' + P.id, cur);
  const h = `#/paper/${encodeURIComponent(P.id)}/${cur}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function pBuild(n) {
  if (!P || P.built.has(n)) return;
  P.built.add(n);
  const pg = pPage(n); if (!pg) return;
  $('img', pg).src = `${P.paper.base}pages/${pad3(n)}.jpg`;
  const tl = $('.tl', pg), page = P.paper.pages[n - 1], W = page.w, H = page.h;
  const frag = document.createDocumentFragment();
  (P.words[n - 1] || []).forEach(([x0, y0, x1, y1, text], i) => {
    const word = text.replace(/\s+$/, '');
    if (!word) return;
    const h = y1 - y0, fs = h * 0.86;
    const s = document.createElement('span');
    s.textContent = word;
    s.style.left = (x0 / W * 100) + '%'; s.style.top = (y0 / H * 100) + '%'; s.style.height = (h / H * 100) + '%';
    s.style.fontSize = (fs / W * 100) + 'cqw'; s.style.lineHeight = h / fs;
    s.dataset.w = (x1 - x0) / W; s.dataset.i = i;
    frag.appendChild(s);
    frag.appendChild(document.createTextNode(text.endsWith(' ') ? ' ' : '\n'));
  });
  tl.appendChild(frag);
  pFit(n);
  pRenderMarks(n);
}
function pFit(n) {
  const pg = pPage(n); if (!pg) return;
  const cw = pg.clientWidth; if (!cw) return;
  const spans = $$('.tl span', pg);
  spans.forEach(s => { s.style.transform = ''; });
  const ws = spans.map(s => s.offsetWidth);          // 先统一量，再统一写，避免反复排版
  spans.forEach((s, i) => { if (ws[i] > 0) s.style.transform = `scaleX(${(s.dataset.w * cw) / ws[i]})`; });
}

/* ---------- 论文上的高亮、批注、便签 ---------- */
const pMarks = n => (P.marks[n] = P.marks[n] || { star: false, note: '', hl: [], pins: [] });
const pEmpty = m => !m || (!m.star && !(m.note || '').trim() && !(m.hl || []).length && !(m.pins || []).length);
async function pSave(n) {
  if (!P) return;
  const id = P.id, m = P.marks[n], empty = pEmpty(m);
  if (empty) delete P.marks[n];
  try { await api(`decks/${encodeURIComponent(id)}/marks/${n}`, empty ? { method: 'DELETE' } : { method: 'PUT', json: m }); }
  catch (e) { toast(L('批注没保存上：', 'Note not saved: ') + e.message); }
  if (P?.id === id) updatePCount();
}
function pFlushNote() { if (!P?.noteTimer) return; clearTimeout(P.noteTimer.t); const n = P.noteTimer.n; P.noteTimer = null; pSave(n); }
function pSaveSoon(n) { if (P.noteTimer) clearTimeout(P.noteTimer.t); P.noteTimer = { n, t: setTimeout(() => { if (P) { P.noteTimer = null; pSave(n); } }, 600) }; }
function updatePCount() {
  if (!P) return;
  const c = Object.values(P.marks).reduce((a, m) => a + (m.hl || []).length + (m.pins || []).length, 0);
  $('#mcount') && ($('#mcount').textContent = c);
}
function pRenderMarks(n) {
  const pg = pPage(n); if (!pg || !P.built.has(n)) return;
  const page = P.paper.pages[n - 1], W = page.w, H = page.h, pad = 0.6, m = P.marks[n] || {};
  $('.hl', pg).innerHTML = (m.hl || []).map(h => h.rects.map(([x0, y0, x1, y1]) =>
    `<i class="c-${h.color}" data-hid="${esc(h.id)}" style="left:${(x0 - pad) / W * 100}%;top:${(y0 - pad) / H * 100}%;width:${(x1 - x0 + 2 * pad) / W * 100}%;height:${(y1 - y0 + 2 * pad) / H * 100}%"></i>`).join('')).join('');
  $('.pins', pg).innerHTML = (m.hl || []).map(h => {
    const r = h.rects[h.rects.length - 1];
    return `<button class="hlmark c-${h.color} ${h.note ? 'has' : ''}" data-hmark="${esc(h.id)}" style="left:${Math.min(r[2] + 1, W - 4) / W * 100}%;top:${r[1] / H * 100}%"
      ${h.note ? `data-tip="${esc(h.note.slice(0, 160))}"` : `title="${L('写批注', 'Add a comment')}"`}>${h.note ? icon('note') : ''}</button>`;
  }).join('') + (m.pins || []).map(p => `<button class="pin c-${p.color}" data-pin="${esc(p.id)}" style="left:${p.x / W * 100}%;top:${p.y / H * 100}%" ${p.text ? `data-tip="${esc(p.text.slice(0, 160))}"` : ''}>${icon('note')}</button>`).join('');
}
function setPinMode(on) {
  P.pinMode = on;
  $('#reader').classList.toggle('pinning', on);
  $('#pinBtn').setAttribute('aria-pressed', on);
  if (on) toast(L('点论文上任意位置贴一张便签（Esc 取消）', 'Click anywhere on the paper to stick a note (Esc to cancel)'));
}
function pageXY(pg, e) {
  const r = pg.getBoundingClientRect(), page = P.paper.pages[+pg.dataset.n - 1];
  return { x: (e.clientX - r.left) / r.width * page.w, y: (e.clientY - r.top) / r.height * page.h };
}
function onPageClick(e) {
  const mk = e.target.closest('[data-hmark], [data-pin]');
  if (mk) { e.stopPropagation(); const n = +mk.closest('.ppage').dataset.n; return mk.dataset.pin ? editPin(n, mk.dataset.pin, mk) : editHl(n, mk.dataset.hmark, mk); }
  if (!P.pinMode) return;
  const pg = e.target.closest('.ppage'); if (!pg) return;
  const n = +pg.dataset.n, { x, y } = pageXY(pg, e);
  const pin = { id: 'p' + Date.now().toString(36), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, text: '', color: 'yellow', at: Date.now() / 1000 };
  const m = pMarks(n); (m.pins = m.pins || []).push(pin);
  setPinMode(false);
  getSelection()?.removeAllRanges();
  pRenderMarks(n);
  editPin(n, pin.id, $(`[data-pin="${pin.id}"]`, pg), true);
}
// 在论文上直接写批注的小窗（高亮批注和便签共用）
function noteEditor({ title, quote, text, color, at, onText, onColor, onDelete, onDone }) {
  const token = ++popToken;
  pop.innerHTML = `<div class="nedit">
    <div class="head"><b>${esc(title)}</b><span class="spacer"></span><span class="hl-dots">${hlDots(color, 'data-ncol')}</span><button class="x" title="${L('关闭', 'Close')} (Esc)">${icon('x')}</button></div>
    ${quote ? `<blockquote>${esc(quote)}</blockquote>` : ''}
    <textarea rows="4" placeholder="${L('写下你的想法、疑问、和别的论文的联系…', 'Your thoughts, questions, links to other papers…')}">${esc(text || '')}</textarea>
    <div class="row"><button class="btn sm ghost danger" data-ndel>${icon('trash')}${L('删除', 'Delete')}</button><span class="spacer"></span><span class="muted small">${L('自动保存', 'Saved automatically')}</span><button class="btn sm primary" data-nok>${L('完成', 'Done')}</button></div></div>`;
  pop.hidden = false; placePop(at);
  const ta = $('textarea', pop);
  setTimeout(() => ta.focus(), 30);
  ta.oninput = () => onText(ta.value);
  ta.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close(); };
  const close = () => { if (token === popToken) hidePop(); onDone?.(ta.value); };
  $('.x', pop).onclick = close; $('[data-nok]', pop).onclick = close;
  $('[data-ndel]', pop).onclick = () => { hidePop(); onDelete(); };
  $$('[data-ncol]', pop).forEach(b => b.onclick = () => { $$('[data-ncol]', pop).forEach(x => x.classList.toggle('on', x === b)); onColor(b.dataset.ncol); });
}
const atOf = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.bottom, top: r.top }; };
function editHl(n, hid, anchor) {
  const h = (P.marks[n]?.hl || []).find(x => x.id === hid); if (!h) return;
  noteEditor({ title: L(`第 ${n} 页 · 高亮批注`, `Page ${n} · comment`), quote: h.text, text: h.note, color: h.color, at: atOf(anchor),
    onText: v => { h.note = v; pSaveSoon(n); },
    onColor: c => { h.color = c; pSave(n); pRenderMarks(n); refreshPMarks(); },
    onDelete: () => { P.marks[n].hl = P.marks[n].hl.filter(x => x !== h); pSave(n); pRenderMarks(n); refreshPMarks(); },
    onDone: () => { pFlushNote(); pRenderMarks(n); refreshPMarks(); } });
}
function editPin(n, pid, anchor, fresh) {
  const p = (P.marks[n]?.pins || []).find(x => x.id === pid); if (!p) return;
  const drop = () => { P.marks[n].pins = P.marks[n].pins.filter(x => x !== p); pSave(n); pRenderMarks(n); refreshPMarks(); };
  noteEditor({ title: L(`第 ${n} 页 · 便签`, `Page ${n} · note`), text: p.text, color: p.color, at: atOf(anchor),
    onText: v => { p.text = v; pSaveSoon(n); },
    onColor: c => { p.color = c; pSave(n); pRenderMarks(n); },
    onDelete: drop,
    onDone: v => { if (fresh && !v.trim()) return drop(); pFlushNote(); pRenderMarks(n); refreshPMarks(); } });
}
function refreshPMarks() { if (P?.tab === 'pmarks') renderPMarks(); updatePCount(); }

// 论文里的选区：换算成页面坐标的高亮矩形
function pSelHighlight(range, pg) {
  const n = +pg.dataset.n, ws = P.words[n - 1] || [];
  const boxes = $$('.tl span', pg).filter(s => range.intersectsNode(s)).map(s => ws[+s.dataset.i]).filter(Boolean);
  if (!boxes.length) return null;
  const rects = [];
  for (const [x0, y0, x1, y1] of boxes) {
    const last = rects[rects.length - 1], h = y1 - y0;
    if (last && Math.abs(last[1] - y0) < h * 0.5 && x0 >= last[0] && x0 - last[2] < h * 1.5) {
      last[1] = Math.min(last[1], y0); last[2] = Math.max(last[2], x1); last[3] = Math.max(last[3], y1);
    } else rects.push([x0, y0, x1, y1]);
  }
  return { page: n, text: pText(range, pg).slice(0, 500), rects };
}
function pText(range, pg) {
  return $$('.tl span', pg).filter(s => range.intersectsNode(s)).map(s => {
    const tn = s.firstChild, t = s.textContent;
    return t.slice(tn === range.startContainer ? range.startOffset : 0, tn === range.endContainer ? range.endOffset : t.length);
  }).filter(Boolean).join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
}
function pAddHighlight(hl, color, withNote) {
  const n = hl.page, h = { id: 'h' + Date.now().toString(36), text: hl.text, rects: hl.rects, color, note: '', at: Date.now() / 1000 };
  pMarks(n).hl.push(h);
  pSave(n); getSelection()?.removeAllRanges(); hidePop(); pRenderMarks(n); refreshPMarks();
  if (withNote) { const mk = $(`[data-hmark="${h.id}"]`); if (mk) editHl(n, h.id, mk); }
  return h;
}
function pSentence(pg, range) {
  // 查词出处：取选中单词所在的那句话
  const spans = $$('.tl span', pg), i = spans.findIndex(s => range.intersectsNode(s));
  if (i < 0) return '';
  let a = i, b = i;
  while (a > 0 && i - a < 40 && !/[.!?]$/.test(spans[a - 1].textContent)) a--;
  while (b < spans.length - 1 && b - i < 40 && !/[.!?]$/.test(spans[b].textContent)) b++;
  return spans.slice(a, b + 1).map(s => s.textContent).join(' ').replace(/(\w)- (\w)/g, '$1$2').slice(0, 300);
}

/* ---------- 划句：翻译 / AI 解释 / 批注 ---------- */
async function transPop(text, at, hl) {
  const token = ++popToken;
  const zh = LANG === 'zh';
  const short = text.length > 220 ? text.slice(0, 217) + '…' : text;
  pop.innerHTML = `<div class="tpop">
    <div class="head"><div class="tsrc">${esc(short)}</div><button class="x" title="${L('关闭', 'Close')} (Esc)">${icon('x')}</button></div>
    ${zh ? `<div class="trans"><div class="skel" style="width:90%"></div><div class="skel" style="width:70%"></div></div>` : ''}
    <div class="aians" hidden></div>
    <div class="tfoot">${hl ? `<span class="hl-dots">${hlDots()}</span>` : ''}<span class="spacer"></span>
      ${hl ? `<button class="btn sm ghost" data-t="note">${icon('note')}${L('批注', 'Comment')}</button>` : ''}
      <button class="btn sm ghost" data-t="ai">${icon('spark')}${L('AI 解释', 'Explain')}</button>
      <button class="btn sm ghost" data-t="copy" title="${L('复制原文', 'Copy the text')}">${icon('copy')}</button></div>
    <div class="tby"></div></div>`;
  pop.hidden = false; placePop(at);
  $('.x', pop).onclick = hidePop;
  if (hl) $$('[data-hl]', pop).forEach(b => b.onclick = () => pAddHighlight(hl, b.dataset.hl));
  $('[data-t="copy"]', pop).onclick = async () => { await copyText(text); toast(L('已复制', 'Copied')); };
  if (hl) $('[data-t="note"]', pop).onclick = () => pAddHighlight(hl, 'yellow', true);
  $('[data-t="ai"]', pop).onclick = () => askAI(text, hl, token);
  if (!zh) return;
  try {
    const r = await api('translate', { method: 'POST', json: { q: text } });
    if (token !== popToken) return;
    $('.trans', pop).innerHTML = esc(r.text);
    $('.tby', pop).textContent = r.by;
  } catch (e) {
    if (token !== popToken) return;
    $('.trans', pop).innerHTML = `<span class="muted">${esc(e.message)}</span>`;
  }
  placePop(at);
}
async function askAI(text, hl, token) {
  if (!P.settings) { try { P.settings = await api('settings'); } catch {} }
  const web = ['web', 'outline'].includes(P.settings?.provider || 'web');
  const body = { text, page: hl?.page || P.cur };
  if (web) {
    try {
      const r = await api(`papers/${encodeURIComponent(P.id)}/ask/prompt`, { method: 'POST', json: body });
      await copyText(r.prompt);
      toast(L('已复制提问（带上下文），粘贴到 ChatGPT / Claude 即可', 'Question copied with its context. Paste it into ChatGPT or Claude.'));
    } catch (e) { toast(e.message); }
    return;
  }
  const box = $('.aians', pop); if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="muted small">${icon('spark')} ${L('AI 正在看这段…', 'The AI is reading this passage…')}</div>`;
  try {
    const job = await api(`papers/${encodeURIComponent(P.id)}/ask/run`, { method: 'POST', json: body });
    pollJob(job.id, j => {
      if (j.status === 'running' || token !== popToken) return;
      if (j.status !== 'done') { box.innerHTML = `<span class="bad">${esc(srvMsg(j.message))}</span>`; return; }
      const ans = j.result.answer;
      box.innerHTML = `<div class="md">${md(ans)}</div><div class="row">${hl ? `<button class="btn sm" data-save>${icon('note')}${L('存为批注', 'Save as a comment')}</button>` : ''}<span class="spacer"></span><small class="muted">${esc(j.result.by || '')}</small></div>`;
      const sv = $('[data-save]', box);
      if (sv) sv.onclick = () => { const h = pAddHighlight(hl, 'blue'); h.note = ans; pSave(hl.page); pRenderMarks(hl.page); refreshPMarks(); toast(L('已存为批注', 'Saved as a comment')); };
    }, 1500);
  } catch (e) { box.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
}
// 论文里 mouseup 之后：短的英文词查词典，长的句子翻译
function paperSelection(sel, wordSpan, moved, detail) {
  if (P.pinMode) return;
  if (wordSpan && !moved && detail === 1 && (!sel || sel.isCollapsed)) {
    const tn = wordSpan.firstChild, m = tn.data.match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/);
    if (!m) return;
    const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
    sel.removeAllRanges(); sel.addRange(r);
  }
  if (!sel || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const pg = node?.closest('.ppage'); if (!pg) return;
  snapToWords(sel);
  const hl = pSelHighlight(range, pg);
  const rect = range.getBoundingClientRect(), at = { x: rect.left, y: rect.bottom, top: rect.top };
  const text = hl?.text || sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return;
  const word = text.replace(/[‘’]/g, "'").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (word && /^[A-Za-z][A-Za-z'\- ]*$/.test(word) && word.split(' ').length <= 3 && word.length <= 40) {
    P.lastCtx = { page: +pg.dataset.n, ctx: pSentence(pg, range) };
    return lookup(word.replace(/'s$/i, ''), at, { hl });
  }
  transPop(text, at, hl);
}

/* ---------- AI 解读面板 ---------- */
function pShowTab(t) {
  if (!$(`.tabs [data-tab="${t}"]`)) t = 'brief';
  P.tab = t; store.set('paper.tab', t);
  $$('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  ['brief', 'pmarks', 'figs'].forEach(k => { $('#' + k).hidden = k !== t; });
  if (t === 'brief') renderBrief();
  if (t === 'pmarks') renderPMarks();
  if (t === 'figs') renderFigs();
}
// AI 回复里的一点点 Markdown：段落、加粗、行内代码、“图 3 / Figure 3” 链接
function md(s) {
  return String(s || '').split(/\n{2,}/).map(par => `<p>${esc(par)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(Figure|Fig\.|Table|Tab\.|图|表)\s?(\d+)/g, (m0, k, n) => `<a class="figref" data-fig="${n}" data-kind="${/^(Table|Tab|表)/.test(k) ? 'table' : 'figure'}">${m0}</a>`)
    .replace(/\n/g, '<br>')}</p>`).join('');
}
const figById = (id, kind) => {
  id = String(id ?? ''); if (/^T\d+$/i.test(id)) { kind = 'table'; id = id.slice(1); }
  kind = kind || 'figure';
  return P.figs.find(f => f.id === id && f.kind === kind) || P.figs.find(f => f.id === id);
};
function figHTML(f, big) {
  if (!f) return '';
  return `<figure class="pfig ${big ? 'big' : ''}"><button class="fimg" data-figgo="${f.page}" data-y="${f.rect[1]}" title="${L(`在论文第 ${f.page} 页查看`, `Show on page ${f.page}`)}"><img loading="lazy" src="${P.paper.base}${f.img}?v=${P.paper.figs_at || 0}" alt="" style="aspect-ratio:auto ${Math.max(1, f.rect[2] - f.rect[0]).toFixed(1)} / ${Math.max(1, f.rect[3] - f.rect[1]).toFixed(1)}"></button>
    <figcaption><b>${f.kind === 'table' ? L('表', 'Table') : L('图', 'Figure')} ${esc(f.id)}</b> · ${L(`第 ${f.page} 页`, `p.${f.page}`)} · ${esc(f.caption.replace(/^(Figure|Fig\.|Table|Tab\.)\s*\d+\s*[.:|]\s*/i, '').slice(0, 220))}</figcaption></figure>`;
}
/* 不联网的简易 LaTeX 显示：常见符号、上下标、分式、粗体；看不懂的命令原样留着 */
const TEX_SYM = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', infty: '∞',
  cdot: '·', times: '×', pm: '±', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', approx: '≈', sim: '∼', propto: '∝', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', mapsto: '↦', lVert: '‖', rVert: '‖', Vert: '‖', lvert: '|', rvert: '|', langle: '⟨', rangle: '⟩',
  ldots: '…', cdots: '⋯', dots: '…', quad: '\u2003', qquad: '\u2003\u2003', top: '⊤', circ: '∘', odot: '⊙', oplus: '⊕', otimes: '⊗', log: 'log', exp: 'exp', min: 'min', max: 'max', arg: 'arg', sin: 'sin', cos: 'cos' };
function tex(src) {
  let i = 0;
  const s = String(src || '');
  const group = () => {            // 读一个 {…} 或一个字符 / 命令
    while (s[i] === ' ') i++;
    if (s[i] === '{') { i++; const out = run('}'); i++; return out; }
    if (s[i] === '\\') return cmd();
    return esc(s[i++] || '');
  };
  const cmd = () => {
    i++;
    const m = /^[A-Za-z]+/.exec(s.slice(i));
    if (!m) { const c = s[i++] || ''; return c === ',' || c === ';' || c === ' ' ? ' ' : c === '!' ? '' : esc(c); }
    const name = m[0]; i += name.length;
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = group(), b = group(); return `<span class="tfrac"><span>${a}</span><span>${b}</span></span>`; }
    if (name === 'sqrt') { return `√<span class="tov">${group()}</span>`; }
    if (/^(mathbf|boldsymbol|bm)$/.test(name)) return `<b>${group()}</b>`;
    if (/^(mathrm|text|textrm|operatorname|mathsf)$/.test(name)) return `<span class="trm">${group()}</span>`;
    if (/^(mathcal|mathscr)$/.test(name)) return `<span class="tcal">${group()}</span>`;
    if (name === 'mathbb') { const g = group(); return ({ R: 'ℝ', N: 'ℕ', Z: 'ℤ', E: '𝔼', C: 'ℂ', Q: 'ℚ' })[g] || g; }
    if (name === 'hat' || name === 'widehat') return `${group()}\u0302`;
    if (name === 'bar' || name === 'overline') return `<span class="tov">${group()}</span>`;
    if (name === 'tilde' || name === 'widetilde') return `${group()}\u0303`;
    if (name === 'dot') return `${group()}\u0307`;
    if (name === 'vec') return `${group()}\u20d7`;
    if (/^(left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|displaystyle|limits|nolimits)$/.test(name)) return '';
    return TEX_SYM[name] ?? `\\${esc(name)}`;
  };
  const run = end => {
    let out = '';
    while (i < s.length && s[i] !== end) {
      const c = s[i];
      if (c === '\\') out += cmd();
      else if (c === '{') { i++; out += run('}'); i++; }
      else if (c === '_' || c === '^') { i++; const g = group(); out += c === '_' ? `<sub>${g}</sub>` : `<sup>${g}</sup>`; }
      else if (c === '&') { i++; out += ' '; }
      else { i++; out += /[A-Za-z]/.test(c) ? `<i>${c}</i>` : esc(c); }
    }
    return out;
  };
  try { return run(null); } catch { return esc(s); }
}
const pageLink = n => n ? `<a class="pglink" data-goto="${n}">${L(`第 ${n} 页`, `p.${n}`)}</a>` : '';
const ul = xs => xs?.length ? `<ul class="blist">${xs.map(x => `<li>${md(x).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : '';
const BRIEF_SECS = () => [
  ['problem', L('研究问题', 'The problem')], ['solution', L('解决思路', 'The approach')], ['framework', L('整体框架', 'The framework')],
  ['abstract', L('摘要翻译', 'Abstract, plainly')], ['introduction', L('引言翻译', 'Introduction, plainly')], ['method', L('方法详解', 'The method in detail')],
  ['figure', L('框架图精读', 'The framework figure')], ['figures', L('其他图表', 'Other figures')], ['results', L('实验结论', 'Results')],
  ['limitations', L('局限', 'Limitations')], ['questions', L('思考题', 'Questions')]];
function renderBrief() {
  const el = $('#brief'); if (!el || !P) return;
  const b = P.brief || {}, running = P.job?.status === 'running';
  const has = BRIEF_SECS().filter(([k]) => b[k] && (!Array.isArray(b[k]) || b[k].length));
  if (!has.length) {
    el.innerHTML = `<div class="empty">
      <div class="art">${icon('spark')}</div>
      <h3>${running ? L('AI 正在读这篇论文…', 'The AI is reading this paper…') : L('还没有 AI 解读', 'No AI guide yet')}</h3>
      <p>${L('AI 会通读全文，按这个顺序讲给你听：', 'The AI reads the whole paper and explains, in this order:')}</p>
      <ol class="bwill"><li>${L('论文要解决什么问题，现有方法差在哪', 'what problem it solves and where existing methods fall short')}</li>
        <li>${L('它是怎么解决的，核心思路和贡献', 'how it solves it: the core idea and contributions')}</li>
        <li>${L('整体框架：每个模块的输入、做法和输出', 'the framework: each module’s input, method and output')}</li>
        <li>${L('摘要和引言的完整翻译', 'the abstract and introduction, translated in full')}</li>
        <li>${L('方法部分逐节详解，配上对应的图', 'the method, section by section, with its figures')}</li>
        <li>${L('框架图逐块精读：数据怎么流、为什么这样设计', 'the framework figure, part by part: the data flow and why it is built this way')}</li></ol>
      ${running ? `<div class="skel" style="width:80%;margin:0 auto"></div>` : `<div class="row"><button class="btn primary" data-act="brief">${icon('spark')}${L('用 AI 解读这篇论文', 'Explain this paper with AI')}</button></div>
      <div class="hint">${L('不需要 API Key：可以用网页版 ChatGPT / Claude 复制粘贴，也可以让 Claude Code 自动完成。', 'No API key needed: copy and paste with ChatGPT or Claude, or let Claude Code do it automatically.')}</div>`}</div>`;
    return;
  }
  const missing = BRIEF_SECS().slice(0, 7).filter(([k]) => !b[k]).map(([, t]) => t);
  const fw = b.framework, fg = b.figure;
  const sec = (k, t, body) => body ? `<section class="bsec" id="b-${k}"><h2>${t}</h2>${body}</section>` : '';
  el.innerHTML = `
    <nav class="btoc">${has.map(([k, t]) => `<a data-sec="${k}">${t}</a>`).join('')}</nav>
    <h1 class="zh">${esc(b.title || P.paper.title)}</h1>
    ${b.title && b.title !== P.paper.title ? `<p class="en-title">${esc(P.paper.title)}</p>` : '<div style="height:12px"></div>'}
    ${b.one_line ? `<p class="gist">${esc(b.one_line)}</p>` : ''}
    ${missing.length ? `<div class="lang-note">${L(`还缺：${missing.join('、')}。`, `Missing: ${missing.join(', ')}.`)}<button class="btn sm ghost" data-act="brief">${L('补全', 'Fill in')}</button></div>` : ''}
    ${sec('problem', L('研究问题', 'The problem'), b.problem && `<div class="md">${md(b.problem.summary)}</div>${ul(b.problem.points)}`)}
    ${sec('solution', L('解决思路', 'The approach'), b.solution && `<div class="md">${md(b.solution.summary)}</div>${ul(b.solution.points)}`)}
    ${sec('framework', L('整体框架', 'The framework'), fw && `<div class="md">${md(fw.summary)}</div>
      <ol class="flow">${(fw.steps || []).map(s => `<li><b>${esc(s.name || '')}</b>
        ${s.input ? `<div class="io"><span>${L('输入', 'In')}</span>${esc(s.input)}</div>` : ''}<div class="md">${md(s.does)}</div>
        ${s.output ? `<div class="io"><span>${L('输出', 'Out')}</span>${esc(s.output)}</div>` : ''}</li>`).join('')}</ol>`)}
    ${sec('abstract', L('摘要翻译', 'Abstract, plainly'), b.abstract?.length && `<div class="md trans-text">${b.abstract.map(md).join('')}</div>`)}
    ${sec('introduction', L('引言翻译', 'Introduction, plainly'), b.introduction?.length && `<div class="md trans-text">${b.introduction.map(p => md(p.text).replace(/<\/p>$/, (p.page ? ' ' + pageLink(p.page) : '') + '</p>')).join('')}</div>`)}
    ${sec('method', L('方法详解', 'The method in detail'), b.method?.length && b.method.map(m => `<div class="msec">
      <h3>${esc(m.section || '')} ${pageLink(m.page)}</h3>
      ${(m.figures || []).map(id => figHTML(figById(id))).join('')}
      <div class="md">${md(m.text)}</div>
      ${(m.formulas || []).map(f => `<div class="formula"><div class="tex" title="${esc(f.tex)}">${tex(f.tex)}</div><div class="md">${md(f.meaning)}</div></div>`).join('')}</div>`).join(''))}
    ${sec('figure', L('框架图精读', 'The framework figure'), fg && `${figHTML(figById(fg.id), true)}
      <div class="md">${md(fg.summary)}</div>
      ${fg.parts?.length ? `<h3>${L('逐块看', 'Part by part')}</h3><dl class="parts">${fg.parts.map(p => `<dt>${esc(p.name)}</dt><dd>${md(p.explain)}</dd>`).join('')}</dl>` : ''}
      ${fg.flow?.length ? `<h3>${L('跟着箭头走', 'Follow the arrows')}</h3><ol class="steps-n">${fg.flow.map(x => `<li>${md(x).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>` : ''}
      ${fg.design?.length ? `<h3>${L('为什么这样设计', 'Why it is built this way')}</h3>${ul(fg.design)}` : ''}
      ${fg.details?.length ? `<h3>${L('容易忽略的细节', 'Easy-to-miss details')}</h3>${ul(fg.details)}` : ''}`)}
    ${sec('figures', L('其他图表', 'Other figures'), b.figures?.length && b.figures.map(f => `${figHTML(figById(f.id)) || `<h3>${/^T/.test(f.id) ? L('表', 'Table') + ' ' + esc(f.id.slice(1)) : L('图', 'Figure') + ' ' + esc(f.id)}</h3>`}<div class="md">${md(f.explain)}</div>`).join(''))}
    ${sec('results', L('实验结论', 'Results'), ul(b.results))}
    ${sec('limitations', L('局限', 'Limitations'), ul(b.limitations))}
    ${sec('questions', L('思考题', 'Questions'), ul(b.questions))}
    <div class="byline">${esc(b.by || '')}${b.at ? ' · ' + new Date(b.at * 1000).toLocaleDateString() : ''}
      · <a data-act="brief">${L('重新生成', 'Regenerate')}</a> · <a data-act="delbrief">${L('删除解读', 'Delete')}</a></div>`;
}
function renderFigs() {
  const el = $('#figs'); if (!el || !P) return;
  el.innerHTML = P.figs.length ? `<p class="muted small">${L('从 PDF 里自动裁出来的图和表。点图片跳到论文里对应的位置。', 'Figures and tables cut out of the PDF. Click one to jump to it in the paper.')}</p>` + P.figs.map(f => figHTML(f)).join('')
    : `<div class="vocab-empty"><b>${L('没有识别到图表', 'No figures found')}</b>${L('这篇 PDF 里没有找到 “Figure N.” 开头的图注。', 'No captions starting with “Figure N.” were found in this PDF.')}</div>`;
}
async function onBriefClick(e) {
  const s = e.target.closest('[data-sec]');
  if (s) {
    const t = $('#b-' + s.dataset.sec), toc = s.closest('.btoc');
    if (t) { t.style.scrollMarginTop = (toc ? toc.offsetHeight + 12 : 12) + 'px'; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  const g = e.target.closest('[data-goto]'); if (g) return pGo(+g.dataset.goto);
  const fg = e.target.closest('[data-figgo]'); if (fg) return pReveal(+fg.dataset.figgo, +fg.dataset.y);
  const fr = e.target.closest('[data-fig]');
  if (fr) { const f = figById(fr.dataset.fig, fr.dataset.kind); return f ? pReveal(f.page, f.rect[1]) : toast(L('没找到这张图', 'Figure not found')); }
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'brief') return briefDialog();
  if (a.dataset.act === 'delbrief' && confirm(L('删除这篇论文的 AI 解读？', 'Delete the AI guide for this paper?'))) {
    try { await api(`papers/${encodeURIComponent(P.id)}/brief`, { method: 'DELETE' }); P.brief = {}; renderBrief(); } catch (er) { toast(er.message); }
  }
}
function watchBrief(job, engine) {
  P.job = job; renderBrief();
  const bar = () => {
    const el = $('#jobbar'); if (!el || !P) return;
    el.innerHTML = P.job?.status === 'running' ? `<div class="jobbar">${icon('spark')}<span>${L(`${engine} 正在读论文、写解读，一般要 3–8 分钟…`, `${engine} is reading the paper. This usually takes 3–8 minutes…`)}</span></div>` : '';
  };
  bar();
  P.stopPoll?.();
  P.stopPoll = pollJob(job.id, async j => {
    if (!P) return;
    P.job = j; bar();
    if (j.status === 'running') return;
    if (j.status === 'done') { P.brief = j.result.brief; toast(L('AI 解读写好了', 'The AI guide is ready')); pShowTab('brief'); }
    else { toast(srvMsg(j.message)); renderBrief(); }
  }, 3000);
}
async function briefDialog() {
  const dlg = $('#dlg');
  let settings = {};
  try { settings = await api('settings'); } catch {}
  P.settings = settings;
  const auto = !!settings.provider && !['web', 'outline'].includes(settings.provider);
  const engine = settings.provider === 'claude-cli' ? 'Claude Code' : 'API';
  let lastChat = store.get('web.chat', 'ChatGPT');
  dlg.innerHTML = `<form method="dialog" class="wiz studio">
    <div class="dlg-head"><div><h2>${L('AI 解读论文', 'Explain this paper with AI')}</h2>
      <p class="sub">${L('研究问题 → 解决思路 → 整体框架 → 摘要和引言翻译 → 方法逐节详解（配图）→ 框架图精读。', 'Problem → approach → framework → abstract and introduction → the method section by section, with figures → the framework figure in depth.')}</p></div>
      <button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      ${auto ? `<div class="auto-box"><button class="btn primary" type="button" id="bRun">${icon('spark')}${L(`用 ${engine} 自动解读`, `Explain with ${engine}`)}</button><span class="muted">${L('会把框架图等几张图一起发给它看', 'The framework figure and a few others are sent along')}</span></div>` : ''}
      <ol class="steps">
        <li><div class="st-h"><b>${L('复制提示词', 'Copy the prompt')}</b></div>
          <div class="row"><button class="btn ${auto ? '' : 'primary'}" type="button" id="bCopy">${icon('copy')}${L('复制提示词', 'Copy prompt')}</button>
            <span class="chats">${L('打开', 'Open')} ${CHATS.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener" data-chat="${n}" class="${n === lastChat ? 'on' : ''}">${n}</a>`).join('')}</span></div></li>
        <li><div class="st-h"><b>${L('新开一个对话，把论文 PDF 拖进去，再粘贴提示词发送', 'Start a new chat, drop in the PDF, then paste the prompt and send')}</b></div>
          <p class="muted">${L('带上 PDF，AI 才看得到图，框架图会讲得好很多。', 'With the PDF attached the AI can see the figures, so the framework figure is explained much better.')}
            <a href="${P.paper.base}source.pdf" download="${esc((P.paper.meta?.arxiv || P.paper.title).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80))}.pdf">${L('下载这篇 PDF', 'Download this PDF')}</a></p></li>
        <li><div class="st-h"><b>${L('把 AI 的完整回复粘贴到这里', 'Paste the full AI reply here')}</b></div>
          <p class="muted">${L('回复里有两个 ```json 代码块。中途断了就说“继续”，两段可以分两次粘贴保存。', 'The reply has two ```json blocks. If it stops, say “continue”; you can paste and save the two parts separately.')}</p>
          <textarea id="bText" spellcheck="false" placeholder="${L('点 AI 回复下方的“复制”按钮，然后在这里 Ctrl+V', 'Click “Copy” under the AI reply, then press Ctrl+V here')}"></textarea></li>
      </ol>
      <div class="test-msg" id="bMsg"></div>
    </div>
    <div class="dlg-foot"><span class="spacer"></span><button class="btn" value="cancel">${L('关闭', 'Close')}</button>
      <button class="btn primary" type="button" id="bSave" disabled>${L('保存解读', 'Save')}</button></div></form>`;
  const msg = (cls, html) => { const m = $('#bMsg'); m.className = 'test-msg ' + cls; m.innerHTML = html; };
  $$('[data-chat]', dlg).forEach(a => a.onclick = () => { lastChat = a.dataset.chat; store.set('web.chat', lastChat); $$('[data-chat]', dlg).forEach(x => x.classList.toggle('on', x === a)); });
  $('#bCopy').onclick = async () => {
    try {
      const r = await api(`papers/${encodeURIComponent(P.id)}/brief/prompt`, { method: 'POST', json: {} });
      await copyText(r.prompt);
      msg('ok', L(`已复制提示词（${r.prompt.length.toLocaleString()} 字）。去 ${lastChat} 粘贴发送。`, `Prompt copied (${r.prompt.length.toLocaleString()} characters). Paste it into ${lastChat} and send.`));
    } catch (e) { msg('bad', esc(e.message)); }
  };
  $('#bText').oninput = () => { $('#bSave').disabled = !$('#bText').value.trim(); };
  $('#bSave').onclick = async () => {
    try {
      const r = await api(`papers/${encodeURIComponent(P.id)}/brief/save`, { method: 'POST', json: { text: $('#bText').value, by: lastChat } });
      P.brief = r.brief; $('#bText').value = ''; $('#bSave').disabled = true;
      const names = Object.fromEntries(BRIEF_SECS());
      msg(r.missing.length ? 'ok' : 'ok', L(`已保存：${r.saved.map(k => names[k] || k).join('、')}。`, `Saved: ${r.saved.map(k => names[k] || k).join(', ')}.`) +
        (r.missing.length ? L(` 还缺 ${r.missing.map(k => names[k] || k).join('、')}，把第二个代码块也粘贴进来。`, ` Still missing: ${r.missing.map(k => names[k] || k).join(', ')}. Paste the other code block too.`) : ''));
      pShowTab('brief');
    } catch (e) { msg('bad', esc(e.message)); }
  };
  if ($('#bRun')) $('#bRun').onclick = async () => {
    try {
      const job = await api(`papers/${encodeURIComponent(P.id)}/brief/run`, { method: 'POST', json: {} });
      dlg.close(); pShowTab('brief'); watchBrief(job, engine);
    } catch (e) { msg('bad', esc(e.message)); }
  };
  dlg.showModal();
}

/* ---------- 我的批注面板 ---------- */
function renderPMarks() {
  const el = $('#pmarks'); if (!el || !P) return;
  const items = [];
  Object.keys(P.marks).map(Number).sort((a, b) => a - b).forEach(n => {
    const m = P.marks[n];
    (m.hl || []).forEach(h => items.push({ n, kind: 'hl', y: h.rects[0][1], h }));
    (m.pins || []).forEach(p => items.push({ n, kind: 'pin', y: p.y, p }));
  });
  items.sort((a, b) => a.n - b.n || a.y - b.y);
  el.innerHTML = `
    <label class="field"><span>${L('论文备注', 'Paper note')} <small class="muted">${L('自动保存，也会显示在论文库里', 'Saved automatically; shown in the paper list')}</small></span>
      <textarea id="pNote" rows="4" placeholder="${L('为什么收藏这篇？读到哪了？和你的课题有什么关系？', 'Why you saved it, how far you got, how it relates to your work…')}">${esc(P.paper.note || '')}</textarea></label>
    <div class="row pfrow"><span class="muted small">${L('文件夹', 'Folder')}</span><select id="pMove"><option value="">${L('未归档', 'Unfiled')}</option>${P.folders.map(f => `<option value="${esc(f.id)}" ${f.id === P.paper.folder ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__new">${L('+ 新建文件夹…', '+ New folder…')}</option></select>
      <span class="spacer"></span><button class="btn sm ghost" data-pm="info">${icon('edit')}${L('论文信息', 'Details')}</button></div>
    <h2>${L('论文上的批注', 'Notes on the paper')} <small class="muted">${items.length}</small><span class="spacer"></span>
      ${items.length || P.paper.note ? `<button class="btn sm ghost" data-pm="copy">${icon('copy')}${L('复制给 AI', 'Copy for AI')}</button>` : ''}</h2>
    ${items.length ? items.map(it => it.kind === 'hl' ? `<div class="hlitem c-${it.h.color}" data-n="${it.n}" data-hid="${esc(it.h.id)}">
        <div class="hl-top"><button class="pgtag" data-jump>${L(`第 ${it.n} 页`, `p.${it.n}`)}</button><span class="hl-text">${esc(it.h.text)}</span>
          <button class="ibtn" data-pm="delhl" title="${L('删除', 'Delete')}">${icon('trash')}</button></div>
        <textarea class="hl-note" rows="1" placeholder="${L('批注（可空）', 'Comment (optional)')}">${esc(it.h.note || '')}</textarea></div>`
      : `<div class="hlitem pinitem c-${it.p.color}" data-n="${it.n}" data-pid="${esc(it.p.id)}">
        <div class="hl-top"><button class="pgtag" data-jump>${icon('note')}${L(`第 ${it.n} 页`, `p.${it.n}`)}</button><span class="spacer"></span>
          <button class="ibtn" data-pm="delpin" title="${L('删除', 'Delete')}">${icon('trash')}</button></div>
        <textarea class="hl-note" rows="2" placeholder="${L('便签内容', 'Note')}">${esc(it.p.text || '')}</textarea></div>`).join('')
    : `<p class="muted small">${L('在论文上划一段文字：可以翻译、高亮、写批注。点顶部「便签」（或按 N）可以在论文任意位置贴一张便签。', 'Select text on the paper to translate, highlight or comment on it. Use “Note” at the top (or press N) to stick a note anywhere on the paper.')}</p>`}`;
  $$('#pmarks textarea.hl-note').forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; });
}
function onPMarksClick(e) {
  const it = e.target.closest('[data-n]');
  const b = e.target.closest('[data-pm]');
  if (b?.dataset.pm === 'copy') { pFlushNote(); return copyExport(`papers/${encodeURIComponent(P.id)}/export`, L('论文内容（含解读和批注）', 'the paper with its notes and marks')); }
  if (b?.dataset.pm === 'info') return paperDialog(P.paper, async () => { const r = await api('papers/' + encodeURIComponent(P.id)); P.paper = { ...P.paper, ...r }; $('.crumb b').textContent = r.title; });
  if (!it) return;
  const n = +it.dataset.n;
  if (e.target.closest('.hl-text')) return e.target.closest('.hl-text').classList.toggle('open');
  if (b?.dataset.pm === 'delhl') { P.marks[n].hl = P.marks[n].hl.filter(h => h.id !== it.dataset.hid); pSave(n); pRenderMarks(n); return renderPMarks(); }
  if (b?.dataset.pm === 'delpin') { P.marks[n].pins = P.marks[n].pins.filter(p => p.id !== it.dataset.pid); pSave(n); pRenderMarks(n); return renderPMarks(); }
  if (e.target.closest('[data-jump]')) {
    const h = it.dataset.hid ? P.marks[n].hl.find(x => x.id === it.dataset.hid) : null, p = it.dataset.pid ? P.marks[n].pins.find(x => x.id === it.dataset.pid) : null;
    pReveal(n, h ? h.rects[0][1] : p?.y);
    setTimeout(() => { const el = $(h ? `[data-hmark="${h.id}"]` : `[data-pin="${p?.id}"]`); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } }, 500);
  }
}
let paperNoteTimer = 0;
function onPMarksInput(e) {
  if (e.target.id === 'pNote') {
    P.paper.note = e.target.value; clearTimeout(paperNoteTimer);
    const id = P.id, v = e.target.value;
    paperNoteTimer = setTimeout(() => api('papers/' + encodeURIComponent(id), { method: 'PUT', json: { note: v } }).catch(er => toast(er.message)), 700);
    return;
  }
  if (!e.target.classList.contains('hl-note')) return;
  e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 2 + 'px';
  const it = e.target.closest('[data-n]'), n = +it.dataset.n;
  const obj = it.dataset.hid ? P.marks[n].hl.find(h => h.id === it.dataset.hid) : P.marks[n].pins.find(p => p.id === it.dataset.pid);
  if (!obj) return;
  if (it.dataset.hid) obj.note = e.target.value; else obj.text = e.target.value;
  pSaveSoon(n);
}
async function onPMarksChange(e) {
  if (e.target.classList.contains('hl-note')) { pFlushNote(); const n = +e.target.closest('[data-n]').dataset.n; return pRenderMarks(n); }
  if (e.target.id !== 'pMove') return;
  let to = e.target.value || null;
  if (to === '__new') {
    const name = prompt(L('新文件夹名称', 'New folder name'));
    if (!name?.trim()) { e.target.value = P.paper.folder || ''; return; }
    try { const f = await api('folders', { method: 'POST', json: { name } }); P.folders.push(f); to = f.id; } catch (er) { return toast(er.message); }
  }
  try { await api('papers/' + encodeURIComponent(P.id), { method: 'PUT', json: { folder: to } }); } catch (er) { return toast(er.message); }
  P.paper.folder = to; renderPMarks();
  toast(to ? L(`已移到「${P.folders.find(f => f.id === to)?.name}」`, `Moved to “${P.folders.find(f => f.id === to)?.name}”`) : L('已移出文件夹', 'Moved out of the folder'));
}

/* ================================================================ 查词弹窗 */
const pop = $('#pop');
let popToken = 0;
function placePop(at) {
  const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 12;
  const x = Math.min(Math.max(m, at.x - 20), innerWidth - pw - m);
  let y = at.y + 10;
  if (y + ph > innerHeight - m) y = Math.max(m, at.top - ph - 10);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function hidePop() { pop.hidden = true; popToken++; }
const popHead = w => `<div class="head"><div class="word">${esc(w)}</div><button class="speak" title="${L('英式发音', 'British pronunciation')}">${icon('speak')}</button><button class="x" title="${L('关闭', 'Close')} (Esc)">${icon('x')}</button></div>`;
async function lookup(q, at, extra = {}) {
  const token = ++popToken;
  const course = courseMeaning(q);
  pop.innerHTML = popHead(q) + (course ? `<div class="course"><small>${L('本课释义', 'In this course')}</small>${esc(course)}</div>` : '') +
    `<div class="skel" style="width:70%"></div><div class="skel" style="width:90%"></div>`;
  pop.hidden = false; placePop(at); wirePop(q, null);
  if (autoSpeak) speak(q);
  const d = await fetchDict(q);
  if (token !== popToken) return;
  const word = d.word || q;
  const zh = (d.zh || []).slice(0, 4), web = (d.web || []).filter(w => !zh.join('').includes(w)).slice(0, 5);
  const en = (d.en || []).slice(0, 3);
  // 两种释义都存：中文 m、英文 d（课件术语表里的释义按语言放进对应字段）
  const zhMean = (hasCJK(course) ? course : '') || zh[0] || web[0] || '';
  const enMean = (course && !hasCJK(course) ? course : '') || enDef(d);
  const mine = findWord(word) || findWord(q);
  const myMean = mine ? meaningOf(mine) : '';
  const body = LANG === 'en'
    ? (en.length ? `<ul class="defs en">${en.map(z => `<li>${esc(z)}</li>`).join('')}</ul>` : '') +
      (d.example ? `<div class="ee">“${esc(d.example)}”</div>` : '') +
      (!en.length && !course ? `<div class="loading">No English definition found (maybe a network problem).</div>` : '')
    : (zh.length ? `<ul class="defs">${zh.map(z => `<li>${esc(z)}</li>`).join('')}</ul>` : '') +
      (web.length ? `<div class="web">${web.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : '') +
      (d.en?.[0] ? `<div class="ee">${esc(d.en[0])}</div>` : '') +
      (!zh.length && !web.length && !course && !d.en?.length ? `<div class="loading">没有查到释义（可能是网络问题）。</div>` : '');
  pop.innerHTML = popHead(word) +
    (d.uk ? `<div class="phon"><span class="tag">${L('英', 'UK')}</span>/${esc(d.uk)}/</div>` : '') +
    (course ? `<div class="course"><small>${L('本课释义', 'In this course')}</small>${esc(course)}</div>` : '') +
    (myMean && myMean !== course ? `<div class="course mine"><small>${L('我的单词本', 'My word book')}</small>${esc(myMean)}</div>` : '') +
    body +
    (extra.hl ? `<div class="hlrow"><span>${L('高亮', 'Highlight')}</span>${hlDots()}</div>` : '') +
    `<div class="foot"><span>${d.fallback ? L('备用词典', 'Backup dictionary') : L('有道词典', 'Youdao')}${LANG === 'en' && (d.enTried || d.fallback) ? ' + Free Dictionary' : ''} · ${L('英式发音', 'UK audio')}</span>
      ${mine ? `<button class="ibtn unsave" title="${L('移出单词本', 'Remove from word book')}">${icon('trash')}</button>` : ''}
      <button class="save ${mine ? 'on' : ''}">${icon('star')}<span>${mine ? L('已收藏', 'Saved') : L('收藏', 'Save')}</span></button></div>`;
  placePop(at);
  wirePop(mine?.w || word, { w: word, uk: d.uk, m: zhMean, d: enMean, ...srcEntry(word) }, extra);
}
function wirePop(word, entry, extra = {}) {
  $('.speak', pop).onclick = () => speak(word);
  $('.x', pop).onclick = hidePop;
  if (extra.hl) $$('[data-hl]', pop).forEach(b => b.onclick = () => addHighlight(extra.hl, b.dataset.hl));
  const s = $('.save', pop);
  if (s && entry) s.onclick = async () => {
    const was = inVocab(word);
    try { await addWord(entry); } catch (e) { return toast(e.message); }
    s.classList.add('on'); $('span', s).textContent = L('已收藏', 'Saved');
    if (R?.tab === 'vocab') renderVocab();
    toast(was ? L('已在单词本里，记下了这个出处', 'Already saved; this source was added') : L('已加入单词本', 'Added to word book'), { label: L('打开单词本', 'Open word book'), fn: () => { location.hash = `#/vocab?q=${encodeURIComponent(word)}`; } });
  };
  const u = $('.unsave', pop);
  if (u) u.onclick = async () => {
    try { await removeWord(word); } catch (e) { return toast(e.message); }
    hidePop(); if (R?.tab === 'vocab') renderVocab();
    toast(L('已移出单词本', 'Removed from word book'));
  };
}

/* ---------- 划词：拖选 / 双击 / 在课件上单击一个词 ---------- */
function snapToWords(sel) {
  const r = sel.getRangeAt(0).cloneRange();
  const isL = c => /[A-Za-z'’-]/.test(c || '');
  let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = r;
  if (sc.nodeType === 3) {
    while (so < sc.data.length && /\s/.test(sc.data[so])) so++;
    while (so > 0 && isL(sc.data[so - 1]) && isL(sc.data[so])) so--;
  }
  if (ec.nodeType === 3) {
    while (eo > 0 && /\s/.test(ec.data[eo - 1])) eo--;
    while (eo < ec.data.length && isL(ec.data[eo - 1]) && isL(ec.data[eo])) eo++;
  }
  try { r.setStart(sc, so); r.setEnd(ec, eo); if (!r.collapsed) { sel.removeAllRanges(); sel.addRange(r); } } catch {}
}
let downAt = null;
document.addEventListener('mousedown', e => { downAt = { x: e.clientX, y: e.clientY }; if (!pop.hidden && !e.target.closest('.pop')) hidePop(); });
document.addEventListener('mouseup', e => {
  if ((!R && !QZ && !P) || R?.editing || e.target.closest('.pop, .tools, .strip, .tabs, .nav, .topnav, [data-say], [data-act], button, input, textarea, select, dialog, a, aside.panel')) return;
  const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4;
  const wordSpan = e.target.closest('.tl span');
  const detail = e.detail;
  setTimeout(() => {
    const sel = getSelection();
    if (P) return paperSelection(sel, wordSpan, moved, detail);
    if (wordSpan && !moved && detail === 1 && (!sel || sel.isCollapsed)) {
      const tn = wordSpan.firstChild;
      const m = tn.data.match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/);
      if (!m) return;
      const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
      sel.removeAllRanges(); sel.addRange(r);
    }
    if (!sel || sel.isCollapsed) return;
    snapToWords(sel);
    const range = sel.getRangeAt(0);
    const hl = selHighlight(range);
    const rect = range.getBoundingClientRect();
    const at = { x: rect.left, y: rect.bottom, top: rect.top };
    const inTl = $('#tl')?.contains(range.commonAncestorContainer);
    let q = (inTl ? tlText(range) : sel.toString()).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').trim();
    if (!q || /[一-鿿]/.test(q) || q.length > 60 || q.split(' ').length > 6) { if (hl) showHlPop(hl, at); return; }
    q = q.replace(/'s$/i, '');
    lookup(q, at, { hl });
  }, 10);
});

// 启动：以服务器上的语言设置为准；第一次打开先选语言
(async function boot() {
  let s = null;
  try { s = await api('settings'); } catch {}
  if (s?.language) setLangLocal(s.language);
  if (s && !s.lang_chosen) await langWelcome();
  route();
})();
})();
