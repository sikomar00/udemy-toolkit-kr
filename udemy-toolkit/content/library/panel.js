// 내 학습 패널 화면: 패널 만들기, 필터 입력, 목록·통계·일괄 선택 표시
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('panel')) return;
  P.parts.add('panel');
  const { el, esc, $, $$ } = UXK;

  // ---------------- 패널 UI ----------------
  function control(label, input) { return el('label', { class: 'uxk-field' }, [el('span', { text: label }), input]); }
  function sel(name, opts) {
    const s = el('select', { 'data-f': name, class: 'uxk-input' });
    opts.forEach(([v, t]) => s.appendChild(el('option', { value: v, text: t })));
    return s;
  }
  const inp = (name, attrs = {}) => el('input', { 'data-f': name, class: 'uxk-input', ...attrs });

  function buildPanel() {
    P.panel = el('div', { class: 'uxk-lib', id: 'uxk-lib', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'uxk-lib-title' }); // 화면 전체를 덮는 대화상자
    const head = el('div', { class: 'uxk-lib-head' }, [
      el('h2', { id: 'uxk-lib-title', tabindex: '-1', text: 'My Course Tools' }),
      el('div', { class: 'uxk-seg', role: 'group', 'aria-label': 'Course scope' }, [
        el('button', { 'data-scope': 'active', class: 'uxk-seg-btn' }),
        el('button', { 'data-scope': 'archived', class: 'uxk-seg-btn' }),
        el('button', { 'data-scope': 'all', class: 'uxk-seg-btn' }),
      ]),
      el('span', { class: 'uxk-grow' }),
      el('button', { class: 'uxk-btn', 'data-act': 'refresh', text: 'Refresh data', title: 'Reload the full course list from Udemy' }),
      el('button', { class: 'uxk-btn', 'data-act': 'close', text: 'Close' }),
    ]);
    const stats = el('div', { class: 'uxk-lib-stats' });

    const grid = el('div', { class: 'uxk-grid' }, [
      control('Search (title, instructor, notes)', inp('q', { type: 'search', placeholder: 'Keyword' })),
      control('Sort by', sel('sort', [
        ['bayes', 'Bayesian rating (adjusted for review count)'], ['rating', 'Rating'], ['reviews', 'Reviews'], ['updated', 'Last updated'],
        ['subs', 'Students'], ['hours', 'Duration'], ['progress', 'Progress'], ['enrolled', 'Purchase date'], ['accessed', 'Last accessed'],
        ['created', 'First published'], ['title', 'Title'],
      ])),
      control('Order', sel('dir', [['desc', 'Descending'], ['asc', 'Ascending']])),
      control('Progress', sel('prog', [['all', 'All'], ['none', 'Not started (0%)'], ['ing', 'In progress (1–99%)'], ['done', 'Completed (100%)'], ['notdone', 'Not completed (0–99%)']])),
      control('Min rating', inp('minr', { type: 'number', step: '0.1', min: '0', max: '5', placeholder: 'e.g. 4.5' })),
      control('Min reviews', inp('minv', { type: 'number', min: '0', placeholder: 'e.g. 500' })),
      control('Updated within', sel('upd', [['0', 'Any time'], ['365', 'Last year'], ['730', 'Last 2 years'], ['1095', 'Last 3 years']])),
      control('Min students', inp('mins', { type: 'number', min: '0', placeholder: 'e.g. 10000' })),
      control('Min hours', inp('minh', { type: 'number', min: '0', step: '0.5' })),
      control('Max hours', inp('maxh', { type: 'number', min: '0', step: '0.5' })),
      control('Category', sel('cat', [['', 'All']])),
      control('Course language', sel('lang', [['', 'All']])),
      control('Has caption language', inp('cap', { type: 'text', placeholder: 'e.g. Korean, English', list: 'uxk-cap-list' })),
      control('Purchased', sel('enr', [['0', 'Any time'], ['365', 'Last year'], ['365-1095', '1–3 years ago'], ['1095+', '3+ years ago']])),
      control('Last accessed', sel('acc', [['0', 'Any time'], ['30', 'Last 30 days'], ['365+', 'Not opened in 1+ year'], ['never', 'Never opened']])),
      control('Tag', sel('tag', [['', 'All']])),
      el('label', { class: 'uxk-chk' }, [inp('fav', { type: 'checkbox' }), ' Favorites only']),
      el('label', { class: 'uxk-chk' }, [inp('queue', { type: 'checkbox' }), ' Queue only']),
      el('label', { class: 'uxk-chk' }, [inp('noupd', { type: 'checkbox', checked: true }), ' Include courses with no update date']),
      el('datalist', { id: 'uxk-cap-list' }),
    ]);
    const presetSel = el('select', { class: 'uxk-input', 'data-preset': '1', 'aria-label': 'Filter presets' }, [el('option', { value: '', text: 'Load preset' })]);
    const filterRow = el('div', { class: 'uxk-row' }, [
      presetSel,
      el('button', { class: 'uxk-btn', 'data-act': 'preset-save', text: 'Save current filters' }),
      el('button', { class: 'uxk-btn', 'data-act': 'preset-del', text: 'Delete preset' }),
      el('span', { class: 'uxk-grow' }),
      el('button', { class: 'uxk-btn', 'data-act': 'reset', text: 'Reset' }),
      el('button', { class: 'uxk-btn uxk-btn-primary', 'data-act': 'apply', text: 'Apply' }),
    ]);
    const filters = el('details', { class: 'uxk-lib-filters', open: true }, [el('summary', { text: 'Filters & sorting (menus apply instantly; press Apply or Enter after typing)' }), grid, filterRow]);

    const bulk = el('div', { class: 'uxk-lib-bulk' }, [
      el('span', { class: 'uxk-bulk-count', 'aria-live': 'polite', text: '0 selected' }),
      el('button', { class: 'uxk-btn uxk-btn-danger', 'data-act': 'archive', text: 'Archive' }),
      el('button', { class: 'uxk-btn', 'data-act': 'unarchive', text: 'Unarchive' }),
      el('button', { class: 'uxk-btn', 'data-act': 'tag-add', text: 'Add tag' }),
      el('button', { class: 'uxk-btn', 'data-act': 'tag-del', text: 'Remove tag' }),
      el('button', { class: 'uxk-btn', 'data-act': 'queue-add', text: 'Add to queue' }),
      el('button', { class: 'uxk-btn', 'data-act': 'queue-del', text: 'Remove from queue' }),
      el('button', { class: 'uxk-btn uxk-btn-ghost', 'data-act': 'sel-clear', text: 'Clear selection' }),
      el('span', { class: 'uxk-grow' }),
      el('span', { class: 'uxk-muted', text: 'Export' }),
      el('button', { class: 'uxk-btn', 'data-act': 'csv', text: 'CSV (Notion)', title: 'Current filtered and sorted results' }),
      el('button', { class: 'uxk-btn', 'data-act': 'md', text: 'Markdown checklist' }),
      el('button', { class: 'uxk-btn', 'data-act': 'json', text: 'JSON' }),
    ]);
    const status = el('div', { class: 'uxk-lib-status', role: 'status' });
    const list = el('div', { class: 'uxk-lib-list' });
    P.selBanner = el('div', { class: 'uxk-selbanner', role: 'status', hidden: true }); // 보이는 줄을 모두 고르면 "조건에 맞는 전체 선택" 안내를 보인다
    P.panel.append(head, stats, filters, bulk, P.selBanner, status, list);
    document.body.appendChild(P.panel);

    // 이벤트
    P.panel.addEventListener('click', P.onPanelClick);
    P.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input[data-f]')) { e.preventDefault(); applyForm(); }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-k]')) { e.preventDefault(); e.target.click(); }
      if (e.key === 'Escape') P.closePanel();
      UXK.ui.trapTab(P.panel, e);
      e.stopPropagation(); // 패널 입력 중에는 페이지 단축키 차단
    });
    presetSel.addEventListener('change', () => {
      const p = P.presets[presetSel.value];
      if (p) { writeForm(p); applyForm(); }
    });
    // 선택 상자와 체크박스는 바꾸는 즉시 적용한다 (글자·숫자 입력은 Apply나 Enter)
    P.panel.addEventListener('change', (e) => { if (e.target.matches('select[data-f], input[type="checkbox"][data-f]')) applyForm(); });
    list.addEventListener('change', P.onListChange);
    list.addEventListener('click', P.onListClick);
    list.addEventListener('mousedown', P.onListMouseDown);
  }

  function writeForm(f) {
    $$('[data-f]', P.panel).forEach((n) => {
      const k = n.getAttribute('data-f');
      if (!(k in f)) return;
      if (n.type === 'checkbox') n.checked = !!f[k];
      else n.value = f[k];
    });
  }
  function readForm() {
    const f = P.DEFAULT_FILTERS();
    $$('[data-f]', P.panel).forEach((n) => {
      const k = n.getAttribute('data-f');
      f[k] = n.type === 'checkbox' ? n.checked : n.value;
    });
    return f;
  }
  function applyForm() {
    P.state.filters = readForm();
    P.state.sort = { key: P.state.filters.sort, dir: P.state.filters.dir };
    P.state.shown = P.SHOW_STEP;
    render();
  }

  function fillOptions() {
    const data = P.allData();
    const fillSel = (name, values, keepFirst = true) => {
      const s = $(`select[data-f="${name}"]`, P.panel);
      if (!s) return;
      const cur = s.value;
      while (s.options.length > (keepFirst ? 1 : 0)) s.remove(keepFirst ? 1 : 0);
      values.forEach(([v, t]) => s.appendChild(el('option', { value: v, 'data-no-i18n': true, text: t })));
      s.value = values.some(([v]) => v === cur) ? cur : '';
    };
    const count = (arr) => { const m = new Map(); arr.forEach((v) => v && m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    fillSel('cat', count(data.map((c) => c.category)).map(([v, n]) => [v, `${v} (${n})`]));
    fillSel('lang', count(data.map((c) => c.lang)).map(([v, n]) => [v, `${v} (${n})`]));
    const tags = count(Object.values(P.meta).flatMap((m) => m.tags || []));
    fillSel('tag', tags.map(([v, n]) => [v, `${v} (${n})`]));
    const dl = $('#uxk-cap-list', P.panel);
    if (dl) {
      dl.textContent = '';
      count(data.flatMap((c) => c.captions)).slice(0, 80).forEach(([v]) => dl.appendChild(el('option', { value: v })));
    }
    // 확장 필드 미지원 시 해당 필터 비활성화
    const has = (f) => P.cache && P.cache.fields && P.cache.fields.includes(f);
    $(`select[data-f="cat"]`, P.panel).disabled = !has('primary_category');
    $(`select[data-f="lang"]`, P.panel).disabled = !has('locale');
    $(`input[data-f="cap"]`, P.panel).disabled = !has('caption_languages');
    const ps = $('select[data-preset]', P.panel);
    while (ps.options.length > 1) ps.remove(1);
    Object.keys(P.presets).sort().forEach((k) => ps.appendChild(el('option', { value: k, 'data-no-i18n': true, text: k })));
  }

  function setStatus(msg) { const s = P.panel && $('.uxk-lib-status', P.panel); if (s) s.textContent = UXK.t(msg); }

  function renderScopeButtons() {
    const data = P.allData();
    const nA = data.filter((c) => !c.archived).length, nB = data.length - nA;
    const labels = { active: UXK.t('Active {0}', UXK.fmtNum(nA)), archived: UXK.t('Archived {0}', UXK.fmtNum(nB)), all: UXK.t('All {0}', UXK.fmtNum(data.length)) };
    $$('[data-scope]', P.panel).forEach((b) => {
      const k = b.getAttribute('data-scope');
      b.textContent = labels[k];
      b.classList.toggle('uxk-on', P.state.scope === k);
      b.setAttribute('aria-pressed', P.state.scope === k ? 'true' : 'false');
    });
  }

  function renderStats(rows) {
    const box = $('.uxk-lib-stats', P.panel);
    if (!rows.length) { box.textContent = UXK.t('No courses match the filters.'); return; }
    const hours = rows.reduce((s, c) => s + (c.hours || 0), 0);
    const notStarted = rows.filter((c) => c.progress === 0);
    const nsHours = notStarted.reduce((s, c) => s + (c.hours || 0), 0);
    const remainH = rows.reduce((s, c) => s + (c.hours || 0) * (1 - Math.min(100, c.progress) / 100), 0);
    const withR = rows.filter((c) => c.reviews > 0);
    const avg = withR.length ? withR.reduce((s, c) => s + c.rating, 0) / withR.length : 0;
    const cats = new Map();
    rows.forEach((c) => c.category && cats.set(c.category, (cats.get(c.category) || 0) + 1));
    const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(' · ');
    box.innerHTML = [
      UXK.t('<b>{0}</b> courses', UXK.fmtNum(rows.length)),
      UXK.t('<b>{0}</b> h total', UXK.fmtNum(Math.round(hours))),
      UXK.t('about <b>{0}</b> h left', UXK.fmtNum(Math.round(remainH))),
      UXK.t('<b>{0}</b> not started ({1} h)', UXK.fmtNum(notStarted.length), UXK.fmtNum(Math.round(nsHours))),
      UXK.t('avg rating <b>{0}</b>', avg.toFixed(2)),
      topCats ? UXK.t('top categories: {0}', esc(topCats)) : '',
    ].filter(Boolean).join('<span class="uxk-dot" aria-hidden="true">·</span>');
  }

  function rowHtml(c) {
    const m = P.meta[c.id] || {};
    const tags = (m.tags || []).map((t) => `<span class="uxk-chip">${esc(t)}</span>`).join('');
    const sub = [c.instructors, c.category, c.lang].filter(Boolean).map(esc).join(' · ');
    const flags = [c.favorite ? `<span class="uxk-chip uxk-chip-fav" title="${UXK.t('Udemy favorite')}">${UXK.t('Favorite')}</span>` : '', c.archived ? `<span class="uxk-chip uxk-chip-arc">${UXK.t('Archived')}</span>` : ''].join('');
    const prog = Math.min(100, c.progress || 0);
    return `<tr data-id="${Number(c.id)}">
      <td class="uxk-c"><input type="checkbox" class="uxk-sel" aria-label="${UXK.t('Select {0}', esc(c.title))}" title="${UXK.t('Shift+click another row to select the whole range')}" ${P.state.selected.has(c.id) ? 'checked' : ''}></td>
      <td class="uxk-title"><a href="/course-dashboard-redirect/?course_id=${Number(c.id)}" target="_blank" rel="noopener">${esc(c.title)}</a>
        <div class="uxk-sub">${sub}${flags}${tags}${m.memo ? `<span class="uxk-memo" title="${esc(m.memo)}">${UXK.t('Note')}</span>` : ''}</div></td>
      <td class="uxk-n">${c.rating ? c.rating.toFixed(2) : '-'}</td>
      <td class="uxk-n">${c.reviews ? UXK.lib.bayes(c, P.mean).toFixed(2) : '-'}</td>
      <td class="uxk-n">${UXK.fmtNum(c.reviews)}</td>
      <td class="uxk-n">${esc(c.updated || '-')}</td>
      <td class="uxk-n">${c.hours ? UXK.t('{0}h', c.hours.toFixed(1)) : '-'}</td>
      <td class="uxk-n">${UXK.fmtCompact(c.subs)}</td>
      <td class="uxk-n"><span class="uxk-bar" aria-hidden="true"><i data-w="${prog}"></i></span>${prog}%</td>
      <td class="uxk-n">${esc(c.enrolled || '-')}</td>
      <td class="uxk-n">${esc(c.accessed || '-')}</td>
      <td class="uxk-c"><button class="uxk-icon ${m.queue ? 'uxk-on' : ''}" data-row="queue" aria-pressed="${m.queue ? 'true' : 'false'}" aria-label="${UXK.t('Study queue: {0}', esc(c.title))}" title="${UXK.t('Add to / remove from queue')}">${m.queue ? '★' : '☆'}</button>
        <button class="uxk-icon" data-row="edit" aria-label="${UXK.t('Edit tags and notes: {0}', esc(c.title))}" title="${UXK.t('Edit tags & notes')}">✎</button></td>
    </tr>`;
  }

  const COLS = [
    ['', ''], ['title', 'Title'], ['rating', 'Rating'], ['bayes', 'Bayes'], ['reviews', 'Reviews'], ['updated', 'Updated'],
    ['hours', 'Hours'], ['subs', 'Students'], ['progress', 'Progress'], ['enrolled', 'Purchased'], ['accessed', 'Accessed'], ['', 'Queue'],
  ];

  function render() {
    if (!P.panel) return;
    renderScopeButtons();
    if (!P.cache) { setStatus(P.loadingProgress ? 'Loading...' : 'No data. Press "Refresh data".'); // setStatus가 번역한다
     $('.uxk-lib-list', P.panel).textContent = ''; return; }
    const rows = P.currentRows();
    renderStats(rows);
    const slice = rows.slice(0, P.state.shown);
    const arrow = (k) => (P.state.sort.key === k ? (P.state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const allChecked = slice.length > 0 && slice.every((c) => P.state.selected.has(c.id));
    const thead = COLS.map(([k, t], i) => (i === 0
      ? `<th class="uxk-c"><input type="checkbox" class="uxk-all" aria-label="${UXK.t('Select all shown courses')}" ${allChecked ? 'checked' : ''} title="${UXK.t('Select / deselect the {0} courses shown. Tip: Shift+click a row checkbox to select a range', slice.length)}"></th>`
      : `<th ${k ? `data-k="${k}" tabindex="0" aria-sort="${P.state.sort.key === k ? (P.state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${UXK.t(t)}${arrow(k)}</th>`)).join('');
    // 표를 새로 그리면 초점이 있던 머리글·전체 선택 칸이 사라지므로, 새로 그린 뒤 같은 칸으로 초점을 돌려준다
    const act = document.activeElement;
    const focusKey = act && P.panel.contains(act) ? (act.classList.contains('uxk-all') ? 'all' : act.closest('th[data-k]') ? act.closest('th[data-k]').getAttribute('data-k') : null) : null;
    $('.uxk-lib-list', P.panel).innerHTML = `<table aria-label="${UXK.t('Your courses')}"><thead><tr>${thead}</tr></thead><tbody>${slice.map(rowHtml).join('')}</tbody></table>` +
      (rows.length > P.state.shown ? `<button class="uxk-btn uxk-more" data-act="more">${UXK.t('Show more ({0} / {1})', UXK.fmtNum(P.state.shown), UXK.fmtNum(rows.length))}</button>` : '');
    if (focusKey) { const again = focusKey === 'all' ? $('.uxk-all', P.panel) : $(`th[data-k="${focusKey}"]`, P.panel); if (again) again.focus(); }
    // CSP가 인라인 style 속성을 막을 수 있어 CSSOM으로 너비 지정
    $$('.uxk-bar i[data-w]', P.panel).forEach((n) => { n.style.width = n.getAttribute('data-w') + '%'; });
    const age = P.cache.t ? Math.round((Date.now() - P.cache.t) / 60000) : 0;
    setStatus(UXK.t('{0} matches · data as of {1} ({2} ago)', UXK.fmtNum(rows.length), new Date(P.cache.t).toLocaleString(UXK.i18n.locale()), age < 60 ? UXK.t('{0} min', age) : UXK.t('{0} h', Math.round(age / 60))) +
      (P.cache.fields && !P.cache.fields.includes('primary_category') ? UXK.t(" · category/language/caption fields are not supported by this account's API") : ''));
    updateBulk();
    P.saveViewSoon(); // 탭·필터·정렬이 바뀌었으면 다음에 열 때 그대로 보이게 저장
  }

  // 보이는 줄을 모두 골랐는데 조건에 맞는 강의가 더 있으면, 전부 고르는 단추를 안내한다 (실수로 수백 개를 한꺼번에 고르지 않게 맨 위 체크박스는 보이는 줄만 고른다)
  function updateBanner() {
    const b = P.selBanner;
    if (!b) return;
    const rows = P.currentRows(), shown = rows.slice(0, P.state.shown);
    const has = (c) => P.state.selected.has(c.id);
    const more = rows.length > shown.length;
    const allShown = more && shown.length > 0 && shown.every(has);
    b.textContent = '';
    b.hidden = !allShown;
    if (!allShown) return;
    if (rows.every(has)) b.append(UXK.t('All {0} matching courses are selected.', UXK.fmtNum(rows.length)));
    else b.append(el('span', { text: UXK.t('All {0} shown courses are selected. ', UXK.fmtNum(shown.length)) }), el('button', { class: 'uxk-btn uxk-btn-ghost', 'data-act': 'sel-all-matches', text: UXK.t('Select all {0} matching courses', UXK.fmtNum(rows.length)) }));
  }

  function updateBulk() {
    const n = P.state.selected.size;
    const c = $('.uxk-bulk-count', P.panel);
    if (c) c.textContent = UXK.t('{0} selected', UXK.fmtNum(n));
    updateBanner();
    // 내보내기 단추: 고른 강의가 있으면 그것만 내보낸다는 것을 글자로 보인다
    const nExp = P.exportCount();
    [['csv', 'CSV (Notion)', 'CSV · {0} selected'], ['md', 'Markdown checklist', 'Markdown · {0} selected'], ['json', 'JSON', 'JSON · {0} selected']].forEach(([act, base, sel]) => {
      const b = $(`[data-act="${act}"]`, P.panel);
      if (b) { b.textContent = nExp ? UXK.t(sel, UXK.fmtNum(nExp)) : UXK.t(base); b.title = UXK.t(nExp ? 'Only the selected courses are exported' : 'All courses in the current filtered and sorted results'); }
    });
    const selData = [...P.state.selected].map((id) => P.byId.get(id)).filter(Boolean);
    const nActive = selData.filter((x) => !x.archived).length, nArch = selData.length - nActive;
    const set = (act, dis, label) => { const b = $(`[data-act="${act}"]`, P.panel); if (b) { b.disabled = P.state.busy || dis; if (label) b.textContent = label; } };
    set('archive', !nActive, UXK.t('Archive ({0})', nActive));
    set('unarchive', !nArch, UXK.t('Unarchive ({0})', nArch));
    ['tag-add', 'tag-del', 'queue-add', 'queue-del', 'sel-clear'].forEach((a) => set(a, !n));
  }

  Object.assign(P, { control, buildPanel, writeForm, readForm, applyForm, fillOptions, setStatus, render,
    updateBulk });
})();
