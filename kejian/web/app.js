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
  return `<nav class="topnav">${a('home', '#/', 'book', L('课程', 'Courses'))}${a('quizzes', '#/quizzes', 'check', L('题库', 'Quizzes'))}${a('vocab', '#/vocab', 'cards', L('单词本', 'Words'), due ? `<em class="dot-n" title="${L('今天待复习', 'Due today')}">${due}</em>` : '')}</nav>`;
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
        <button class="btn sm" data-import="${esc(g.key)}">${icon('upload')}${L('导入课件', 'Import slides')}</button>
        ${g.loose ? '' : `<button class="ibtn" data-cedit="${esc(g.id)}" title="${L('课程设置', 'Course settings')}">${icon('dots')}</button>`}
      </div>
      ${g.quizzes.length ? `<div class="quiz-cards">${g.quizzes.map(quizCard).join('')}</div>` : ''}
      <div class="grid">${pend}${g.decks.slice().sort(byChapter).map(deckCard).join('')}
        ${!g.decks.length && !pend ? `<button class="drop small" data-import="${esc(g.key)}"><span class="big">${icon('upload')}</span><b>${L('导入第一份课件', 'Import your first deck')}</b><span>${L('拖进这里，或点击选择 .pptx / .pdf', 'Drop it here, or click to choose a .pptx / .pdf')}</span></button>` : ''}</div>
    </section>`;
  }).join('');

  $$('[data-import]', el).forEach(b => b.onclick = () => { HOME.course = b.dataset.import || null; $('#file').click(); });
  $$('[data-cedit]', el).forEach(b => b.onclick = () => courseDialog(m.courses.find(c => c.id === b.dataset.cedit)));
  $$('[data-dismiss]', el).forEach(b => b.onclick = () => { pendingImports.delete(b.dataset.dismiss); renderHome(); });
  const allDecks = [...m.courses.flatMap(c => c.decks.map(d => ({ ...d, course: c.id }))), ...un.decks];
  const allQuizzes = [...m.courses.flatMap(c => c.quizzes.map(z => ({ ...z, course: c.id }))), ...un.quizzes];
  $$('[data-dmenu]', el).forEach(b => b.onclick = e => { e.preventDefault(); deckMenu(allDecks.find(d => d.id === b.dataset.dmenu)); });
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
document.addEventListener('dragover', e => { if (!location.hash.startsWith('#/deck')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (location.hash.startsWith('#/deck') || e.target.closest('section.course')) return;
  e.preventDefault();
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

async function deckMenu(d) {
  const courses = await getCourses();
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-head"><h2>${L('课件设置', 'Deck settings')}</h2><button class="ibtn" value="cancel">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field"><span>${L('名称', 'Name')}</span><input type="text" id="dTitle" value="${esc(d.title)}"></label>
      <label class="field"><span>${L('所属课程', 'Course')}</span><select id="dCourse">${courseOptions(courses, d.course)}</select></label>
      <div class="note-box">${L('来源文件', 'Source file')}: ${esc(d.source)} · ${L(`${d.pages} 页 · 已有讲解 ${d.noted} 页`, `${d.pages} pages · notes on ${d.noted}`)}${d.marks ? ` · ${L(`${d.marks} 页有标注`, `${d.marks} annotated`)}` : ''}<br>${L('课件 ID', 'Deck ID')}: <code>${esc(d.id)}</code></div>
      <button class="btn" type="button" id="dCopy">${icon('copy')}${L('复制全部文字给 AI（含讲解和我的标注）', 'Copy all text for AI (with notes and my annotations)')}</button>
    </div>
    <div class="dlg-foot"><button class="btn danger ghost" type="button" id="dDel">${icon('trash')}${L('删除课件', 'Delete deck')}</button>
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="dSave">${L('保存', 'Save')}</button></div></form>`;
  $('#dCopy').onclick = () => copyExport(`decks/${encodeURIComponent(d.id)}/export`, L('课件内容', 'the deck'));
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
    </div>
    <div class="dlg-foot"><button class="btn danger ghost" type="button" id="zDel">${icon('trash')}${L('删除题库', 'Delete quiz')}</button>
      <span class="spacer"></span><button class="btn" value="cancel">${L('取消', 'Cancel')}</button><button class="btn primary" id="zSave">${L('保存', 'Save')}</button></div></form>`;
  const done = () => { dlg.close(); (after || renderHome)(); };
  $('#zCopy').onclick = () => copyExport(`quizzes/${encodeURIComponent(z.id)}/export`, L('题库和作答记录', 'the quiz and your answers'));
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
    NAMES = { decks, quizzes, courses: m.courses.map(({ decks: _d, quizzes: _q, ...c }) => c) };
  } catch {}
  return NAMES;
}
function srcChip(s) {
  if (s.kind === 'deck') {
    const t = NAMES.decks[s.id];
    return `<a class="src" href="#/deck/${encodeURIComponent(s.id)}/${s.page || 1}" data-back title="${esc(t || s.id)}">${icon('book')}${esc(shortTitle(t || s.id))}${s.page ? L(` · 第 ${s.page} 页`, ` · p.${s.page}`) : ''}</a>`;
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
        <div class="vc-src">${c ? `<span class="ctag" style="--cc:${esc(c.color)}">${esc(c.name)}</span>` : ''}${(v.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}${(v.src || []).map(srcChip).join('')}</div>
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
function updateCount() {
  const c = $('#vcount'); if (c) c.textContent = deckWords().length;
  const m = $('#mcount'); if (m && R) m.textContent = Object.keys(R.marks || {}).length;
}
function renderVocab() {
  const el = $('#vocab'); if (!el || !R) return;
  const list = deckWords();
  const head = `<div class="pane-head"><b>${L('本课件的生词', 'Saved here')} ${list.length}</b><span class="spacer"></span>
    <a class="btn sm" href="#/vocab/review${R.deck.course ? '?course=' + encodeURIComponent(R.deck.course) : ''}">${icon('cards')}${L('复习', 'Review')}</a><a class="btn sm ghost" href="#/vocab">${L('单词本', 'Word book')}</a></div>`;
  if (!list.length) { el.innerHTML = head + `<div class="vocab-empty"><b>${L('还没有生词', 'No words yet')}</b>${L('在课件上划词，查到的单词点“收藏”就会出现在这里，并记住是第几页。', 'Select a word on the slide and click “Save”. It appears here with its page number.')}</div>`; return; }
  el.innerHTML = head + list.map(({ v, pages }) => `<div class="vrow" data-w="${esc(v.w)}"><span class="w">${esc(v.w)}</span>
    <span class="ph">${v.uk ? '/' + esc(v.uk) + '/' : ''} ${pages.map(p => `<button class="pg ${p === R.cur ? 'on' : ''}" data-pg="${p}">${L(`第 ${p} 页`, `p.${p}`)}</button>`).join('')}</span>
    <div class="act"><button class="ibtn" data-vs title="${L('英式发音', 'British pronunciation')}">${icon('speak')}</button><button class="ibtn" data-ve title="${L('编辑', 'Edit')}">${icon('edit')}</button></div>
    <span class="m">${esc(meaningOf(v))}</span></div>`).join('');
  el.onclick = e => {
    const row = e.target.closest('[data-w]'); if (!row) return;
    const w = row.dataset.w;
    if (e.target.closest('[data-pg]')) return go(+e.target.closest('[data-pg]').dataset.pg);
    if (e.target.closest('[data-vs]')) return speak(w);
    if (e.target.closest('[data-ve]')) return wordDialog(findWord(w), renderVocab);
  };
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
  if ((!R && !QZ) || R?.editing || e.target.closest('.pop, .tools, .strip, .tabs, .nav, .topnav, [data-say], [data-act], button, input, textarea, select, dialog, a')) return;
  const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4;
  const wordSpan = e.target.closest('.tl span');
  const detail = e.detail;
  setTimeout(() => {
    const sel = getSelection();
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
