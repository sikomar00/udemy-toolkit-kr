/* 설정 페이지 */
(async () => {
  const UXK = globalThis.UXK;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = UXK.esc;
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

  let S = await UXK.getSettings();
  const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const build = (path, val) => path.split('.').reduceRight((acc, k) => ({ [k]: acc }), val);
  const savedEl = $('#saved');
  let savedT = null;
  const flash = (msg = 'Saved') => { savedEl.textContent = msg; savedEl.classList.add('show'); clearTimeout(savedT); savedT = setTimeout(() => savedEl.classList.remove('show'), 1000); };

  // ---------------- 일반 설정 바인딩 ----------------
  let mtGranted = true; // 이 PC에 번역 권한이 있는지 (없으면 설정값과 상관없이 꺼진 것으로 표시)
  function bindAll() {
    $$('[data-k]').forEach((n) => {
      const v = getPath(S, n.dataset.k);
      if (n.type === 'checkbox') n.checked = !!v;
      else n.value = v == null ? '' : String(v);
    });
    if (!mtGranted) $('#mt-toggle').checked = false;
    updateRangeLabels();
  }
  function updateRangeLabels() {
    $('#v-font').textContent = `${$('[data-k="subs.fontSize"]').value}px`;
    $('#v-bottom').textContent = `${$('[data-k="subs.bottom"]').value}%`;
    $('#v-bg').textContent = `${Math.round(parseFloat($('[data-k="subs.bgOpacity"]').value) * 100)}%`;
  }
  const NUMERIC_SELECTS = new Set(['speed.step', 'library.autoRefreshHours']);
  async function onChange(n) {
    const k = n.dataset.k;
    let v;
    if (n.type === 'checkbox') v = n.checked;
    else if (n.type === 'number' || n.type === 'range' || NUMERIC_SELECTS.has(k)) {
      v = parseFloat(n.value);
      if (!Number.isFinite(v)) return;
      if (n.min !== '' && v < parseFloat(n.min)) v = parseFloat(n.min);
      if (n.max !== '' && v > parseFloat(n.max)) v = parseFloat(n.max);
    } else v = n.value;
    S = await UXK.saveSettings(build(k, v));
    flash();
  }
  $$('[data-k]').forEach((n) => {
    if (n.type === 'range') n.addEventListener('input', updateRangeLabels);
    if (n.id === 'mt-toggle') return; // 권한 요청이 필요해 별도 처리
    n.addEventListener('change', () => onChange(n));
  });
  // 기계번역: 켤 때 사이트 접근 권한 요청 (사용자 클릭 직후 호출해야 함)
  $('#mt-toggle').addEventListener('change', async (e) => {
    const n = e.target;
    if (n.checked) {
      let ok = false;
      try { ok = await chrome.permissions.request({ origins: ['https://translate.googleapis.com/*'] }); } catch (err) { ok = false; }
      if (!ok) { n.checked = false; flash('Permission not granted; turned off'); return; }
    } else {
      try { await chrome.permissions.remove({ origins: ['https://translate.googleapis.com/*'] }); } catch (err) {}
    }
    mtGranted = n.checked || mtGranted; // 방금 권한을 허용했다면 이제 있음
    S = await UXK.saveSettings({ subs: { translate: n.checked } });
    flash();
  });
  bindAll();
  // 이 PC에 번역 권한이 없으면 화면에서만 꺼진 것으로 보여 준다 (동기화되는 설정값은 바꾸지 않아, 권한이 있는 다른 PC의 설정까지 끄지 않음)
  try {
    mtGranted = await chrome.permissions.contains({ origins: ['https://translate.googleapis.com/*'] });
    bindAll();
  } catch (e) {}

  // ---------------- 단축키 ----------------
  function renderHotkeys() {
    const body = $('#hk-body');
    body.innerHTML = '';
    Object.keys(UXK.DEFAULTS.hotkeys).forEach((action) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(UXK.ACTION_LABELS[action] || action)}</td><td><input type="text" readonly class="hk" data-hk="${action}" aria-label="${esc(UXK.ACTION_LABELS[action] || action)} hotkey"></td><td class="warn" data-warn="${action}"></td>`;
      body.appendChild(tr);
    });
    refreshHotkeys();
  }
  const norm = (s) => { const h = UXK.parseHotkey(s); return h ? `${h.ctrl}${h.alt}${h.shift}${h.meta}${h.code}` : ''; };
  const RESERVED = new Set(UXK.UDEMY_RESERVED.map(norm));
  function refreshHotkeys() {
    const counts = new Map();
    Object.values(S.hotkeys).forEach((v) => { const k = norm(v); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
    $$('[data-hk]').forEach((inp) => {
      const a = inp.dataset.hk;
      const v = S.hotkeys[a];
      inp.value = v || '(none)';
      const k = norm(v);
      const warn = $(`[data-warn="${a}"]`);
      warn.textContent = !k ? '' : RESERVED.has(k) ? 'Clashes with a Udemy key' : counts.get(k) > 1 ? 'Clashes with another action' : '';
    });
  }
  document.addEventListener('focusin', (e) => { if (e.target.matches('[data-hk]')) { e.target.classList.add('listening'); e.target.value = 'Press a key'; } });
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-hk]')) { e.target.classList.remove('listening'); refreshHotkeys(); } });
  document.addEventListener('keydown', async (e) => {
    const inp = e.target;
    if (!inp.matches || !inp.matches('[data-hk]')) return;
    if (e.key === 'Tab') return; // 키보드 사용자가 이 칸에 갇히지 않게 Tab은 그대로 통과
    e.preventDefault();
    if (e.key === 'Escape') { inp.blur(); return; }
    let v;
    if (e.key === 'Backspace' || e.key === 'Delete') v = '';
    else {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      v = UXK.eventToHotkey(e);
      if (!v) { inp.value = 'Unsupported key'; return; }
    }
    S = await UXK.saveSettings({ hotkeys: { [inp.dataset.hk]: v } });
    flash();
    inp.blur();
  });
  $('#hk-reset').onclick = async () => { S = await UXK.saveSettings({ hotkeys: UXK.DEFAULTS.hotkeys }); refreshHotkeys(); flash('Defaults restored'); };
  $('#open-shortcuts').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  renderHotkeys();

  // ---------------- 캐시 정보 / 강의 제목 ----------------
  // 강의 목록 캐시는 Udemy 호스트별(개인 www / Business 회사.udemy.com)로 저장됨 → 모두 합쳐 제목 조회
  const allLocal = await chrome.storage.local.get(null);
  const caches = Object.keys(allLocal).filter((k) => k.startsWith(UXK.KEYS.coursesPrefix)).map((k) => ({ host: k.slice(UXK.KEYS.coursesPrefix.length), ...allLocal[k] }));
  const courseById = new Map();
  caches.forEach((c) => (c.data || []).forEach((x) => { if (!courseById.has(String(x.id))) courseById.set(String(x.id), { ...x, host: c.host }); }));
  $('#lib-cache').textContent = caches.length
    ? 'Course-list cache: ' + caches.map((c) => `${c.host} ${UXK.fmtNum((c.data || []).length)} courses (as of ${new Date(c.t).toLocaleString('en-US')})`).join(' · ')
    : 'No course-list cache (created when you open My Learning)';
  const titleOf = (id) => (courseById.get(String(id)) || {}).title || `Course ${id}`;
  const lectureLink = (courseId, lectureId, t) => {
    const c = courseById.get(String(courseId));
    const host = (c && c.host) || 'www.udemy.com';
    return c && c.slug ? `https://${host}/course/${c.slug}/learn/lecture/${lectureId}?uxk_t=${Math.floor(t || 0)}` : `https://${host}/course-dashboard-redirect/?course_id=${courseId}`;
  };

  // ---------------- 학습 기록 ----------------
  async function renderStats() {
    const st = (await UXK.local.get(UXK.KEYS.stats, { days: {} })) || { days: {} };
    const days = st.days || {};
    const goal = Math.max(0, S.stats.dailyGoalMin || 0) * 60;
    const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return UXK.today(d); };
    const secOf = (k) => (days[k] ? days[k].sec : 0);
    const sum = (n) => { let s = 0; for (let i = 0; i < n; i++) s += secOf(dayKey(i)); return s; };
    const meets = (k) => (goal ? secOf(k) >= goal : secOf(k) >= 60);
    let streak = 0;
    let i = meets(dayKey(0)) ? 0 : 1;
    while (i < 3650 && meets(dayKey(i))) { streak++; i++; } // 잘못된 목표값이 와도 끝나도록 10년 상한
    const today = secOf(dayKey(0));
    $('#kpis').innerHTML = [
      ['Today', `${Math.round(today / 60)} min${goal ? ` / ${S.stats.dailyGoalMin} min` : ''}`],
      ['Last 7 days', UXK.fmtDur(sum(7))],
      ['Last 30 days', UXK.fmtDur(sum(30))],
      ['Goal streak', `${streak} days`],
    ].map(([a, b]) => `<div class="kpi"><span class="muted">${a}</span><b>${b}</b></div>`).join('');
    const N = 14;
    const vals = Array.from({ length: N }, (_, k) => secOf(dayKey(N - 1 - k)));
    const max = Math.max(goal, ...vals, 60);
    $('#bars').innerHTML = vals.map((v) => `<div class="b ${goal && v >= goal ? 'goal' : ''}" style="height:${Math.max(2, (v / max) * 100)}%" title="${Math.round(v / 60)} min"></div>`).join('');
    $('#bars-labels').innerHTML = Array.from({ length: N }, (_, k) => `<span>${dayKey(N - 1 - k).slice(5)}</span>`).join('');
    const per = new Map();
    for (let k = 0; k < 7; k++) { const d = days[dayKey(k)]; if (d && d.courses) Object.entries(d.courses).forEach(([id, s]) => per.set(id, (per.get(id) || 0) + s)); }
    const rows = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    $('#stat-courses').innerHTML = rows.length ? rows.map(([id, s]) => `<tr><td>${esc(titleOf(id))}</td><td class="n">${UXK.fmtDur(s)}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">No records</td></tr>';
    $('#stats-csv').onclick = () => {
      const lines = ['date,minutes'];
      Object.keys(days).sort().forEach((k) => lines.push(`${k},${Math.round(days[k].sec / 60)}`));
      UXK.download(`udemy-study-${UXK.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    };
  }
  $('#stats-clear').onclick = async () => { if (confirm('Clear all study stats?')) { await UXK.local.set(UXK.KEYS.stats, { days: {} }); renderStats(); } };
  renderStats();

  // ---------------- 문장 수집함 ----------------
  let sentences = (await UXK.local.get(UXK.KEYS.sentences, [])) || [];
  const selected = new Set();
  function filteredSentences() {
    const q = $('#sent-q').value.trim().toLowerCase();
    return sentences.slice().reverse().filter((s) => !q || (s.text + ' ' + s.trans + ' ' + s.courseTitle + ' ' + s.lectureTitle).toLowerCase().includes(q));
  }
  function renderSentences() {
    const list = filteredSentences();
    $('#sent-body').innerHTML = list.slice(0, 500).map((s) => `<tr><td><input type="checkbox" data-sid="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}></td>
      <td>${esc(s.text)}${s.trans ? `<div class="muted">${esc(s.trans)}</div>` : ''}</td>
      <td class="muted"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.lectureTitle || '')} · ${UXK.fmtClock(s.t)}</a><br>${esc(s.courseTitle || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No saved sentences</td></tr>';
    $('#sent-count').textContent = `${sentences.length} total${list.length !== sentences.length ? ` · ${list.length} match the search` : ''}${list.length > 500 ? ' · only the latest 500 are shown (exports include all)' : ''}`;
  }
  $('#sent-q').addEventListener('input', renderSentences);
  $('#sent-body').addEventListener('change', (e) => { const id = e.target.dataset.sid; if (!id) return; e.target.checked ? selected.add(id) : selected.delete(id); });
  $('#sent-all').addEventListener('change', (e) => { filteredSentences().forEach((s) => (e.target.checked ? selected.add(s.id) : selected.delete(s.id))); renderSentences(); });
  const tsvCell = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
  $('#sent-anki').onclick = () => {
    const list = filteredSentences().reverse();
    const lines = ['#separator:tab', '#html:true', '#columns:Front\tBack\tSource'];
    list.forEach((s) => lines.push([tsvCell(esc(s.text)), tsvCell(esc(s.trans)), tsvCell(`<a href="${esc(s.url)}">${esc(s.courseTitle)} · ${esc(s.lectureTitle)} · ${UXK.fmtClock(s.t)}</a>`)].join('\t')));
    UXK.download(`udemy-sentences-anki-${UXK.today()}.txt`, lines.join('\n'), 'text/tab-separated-values;charset=utf-8');
  };
  $('#sent-csv').onclick = () => {
    const q = UXK.csvCell;
    const lines = ['Sentence,Translation,Course,Lecture,Time,Link,Saved on'];
    filteredSentences().reverse().forEach((s) => lines.push([q(s.text), q(s.trans), q(s.courseTitle), q(s.lectureTitle), q(UXK.fmtClock(s.t)), q(s.url), q(s.created)].join(',')));
    UXK.download(`udemy-sentences-${UXK.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('#sent-del').onclick = async () => {
    if (!selected.size) return flash('No sentences selected');
    if (!confirm(`Delete ${selected.size} sentences?`)) return;
    sentences = await UXK.local.update(UXK.KEYS.sentences, (arr) => (arr || []).filter((s) => !selected.has(s.id)), []);
    selected.clear();
    renderSentences();
  };
  renderSentences();

  // ---------------- 메모 ----------------
  async function renderNotes() {
    const all = (await UXK.local.get(UXK.KEYS.notes, {})) || {};
    const ids = Object.keys(all).filter((k) => all[k] && all[k].length);
    $('#notes-body').innerHTML = ids.length ? ids.map((id) => `<tr><td>${esc(titleOf(id))}</td><td class="n">${all[id].length}</td><td><button data-note-md="${esc(id)}">Markdown</button></td></tr>`).join('') : '<tr><td colspan="3" class="muted">No notes</td></tr>';
    return all;
  }
  const notesMd = (all, ids) => {
    const out = [];
    ids.forEach((id) => {
      out.push(`# ${titleOf(id)}`, '');
      let last = null;
      (all[id] || []).slice().sort((a, b) => (a.lectureId - b.lectureId) || (a.t - b.t)).forEach((n) => {
        if (n.lectureId !== last) { out.push('', `## ${n.lectureTitle}`, ''); last = n.lectureId; }
        out.push(`- [${UXK.fmtClock(n.t)}](${lectureLink(id, n.lectureId, n.t)}) ${String(n.text).replace(/\n/g, '  \n  ')}`);
      });
      out.push('');
    });
    return out.join('\n');
  };
  let notesAll = await renderNotes();
  $('#notes-body').addEventListener('click', (e) => {
    const id = e.target.dataset.noteMd;
    if (id) UXK.download(`${UXK.safeFile(titleOf(id))}_notes.md`, notesMd(notesAll, [id]), 'text/markdown;charset=utf-8');
  });
  $('#notes-all').onclick = async () => {
    notesAll = await renderNotes();
    const ids = Object.keys(notesAll).filter((k) => notesAll[k] && notesAll[k].length);
    if (!ids.length) return flash('No notes');
    UXK.download(`udemy-notes-${UXK.today()}.md`, notesMd(notesAll, ids), 'text/markdown;charset=utf-8');
  };

  // ---------------- 백업 / 초기화 ----------------
  const BACKUP_KEYS = ['notes', 'sentences', 'meta', 'presets', 'stats', 'speeds'];
  $('#backup').onclick = async () => {
    const data = {};
    for (const k of BACKUP_KEYS) data[k] = await UXK.local.get(UXK.KEYS[k], null);
    const out = { app: 'udemy-toolkit-kr', version: chrome.runtime.getManifest().version, exported: new Date().toISOString(), settings: S, data };
    UXK.download(`udemy-toolkit-backup-${UXK.today()}.json`, JSON.stringify(out, null, 2), 'application/json');
  };
  $('#restore').onclick = () => $('#restore-file').click();
  const BACKUP_ARRAYS = new Set(['sentences']); // 나머지 항목은 일반 객체여야 한다
  const hasShape = (k, v) => (BACKUP_ARRAYS.has(k) ? Array.isArray(v) : !!v && typeof v === 'object' && !Array.isArray(v));
  $('#restore-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== 'udemy-toolkit-kr') throw new Error('This is not a backup file from this extension');
      const data = j.data || {};
      // 쓰기 전에 전부 검사: 잘못된 파일이 저장소를 일부만 덮어쓰지 않게
      for (const k of BACKUP_KEYS) if (data[k] != null && !hasShape(k, data[k])) throw new Error(`The "${k}" entry in the backup file has an invalid format`);
      if (!confirm('This overwrites your current data with the backup. Continue?')) return;
      for (const k of BACKUP_KEYS) if (data[k] != null && !(await UXK.local.set(UXK.KEYS[k], data[k]))) throw new Error(`Could not save "${k}"`);
      if (j.settings) S = await UXK.saveSettings(j.settings); // 기본값과 모양·자료형이 다른 값은 saveSettings가 걸러낸다
      flash('Restore complete');
      setTimeout(() => location.reload(), 600);
    } catch (err) { alert('Restore failed: ' + err.message); } finally { e.target.value = ''; } // 같은 파일을 다시 골라도 change가 일어나게
  });
  $('#clear-cache').onclick = async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(UXK.KEYS.coursesPrefix) || k.startsWith('uxk_fields_ok') || k.startsWith('uxk_refresh_fail') || k.startsWith('uxk_cur_'));
    await chrome.storage.local.remove(keys);
    flash(`${keys.length} cache entries deleted`);
    $('#lib-cache').textContent = 'No course-list cache (created when you open My Learning)';
  };
  $('#reset-settings').onclick = async () => {
    if (!confirm('Reset all settings to defaults? (Notes, sentences and stats are kept)')) return;
    await chrome.storage.sync.remove('uxk_settings');
    location.reload();
  };

  // 다른 탭에서 바뀐 설정 반영
  UXK.onSettings((s) => { S = s; bindAll(); refreshHotkeys(); });
  if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
})();
