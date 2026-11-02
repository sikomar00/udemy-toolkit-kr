/* 내 학습(/home/my-courses/...) 페이지: 정렬·필터 패널, 일괄 작업, 카드 배지, 새로고침 없는 보관 */
(() => {
  const UXK = globalThis.UXK;
  if (UXK.libraryPage) return;
  const { el, esc, $, $$ } = UXK;

  const CARD_SEL = '[class*="enrolled-course-card--container"]';
  const SHOW_STEP = 200;

  let S = null;
  let cache = null;
  let byId = new Map();
  let meta = {};
  let presets = {};
  let mean = 4.4;
  let fab = null, panel = null, observer = null;
  let loadingProgress = null;
  const state = {
    scope: 'active',
    shown: SHOW_STEP,
    selected: new Set(),
    busy: false,
    filters: null,
    sort: { key: 'bayes', dir: 'desc' },
  };

  const DEFAULT_FILTERS = () => ({
    q: '', prog: 'all', minr: '', minv: '', upd: '0', mins: '', minh: '', maxh: '',
    cat: '', lang: '', cap: '', enr: '0', acc: '0', fav: false, queue: false, tag: '', noupd: true,
    sort: 'bayes', dir: 'desc',
  });
  state.filters = DEFAULT_FILTERS();

  // ---------------- 데이터 ----------------
  function setCache(c) {
    cache = c;
    byId = new Map((c ? c.data : []).map((x) => [x.id, x]));
    mean = c ? UXK.lib.globalMean(c.data.filter((x) => !x.archived)) : 4.4;
  }
  const allData = () => (cache ? cache.data : []);
  const scoped = () => allData().filter((c) => (state.scope === 'all' ? true : state.scope === 'archived' ? c.archived : !c.archived));

  async function ensureData(force) {
    if (!force && cache && !UXK.lib.isStale(cache, S.library.autoRefreshHours)) return cache;
    if (loadingProgress) return UXK.lib._refreshing;
    loadingProgress = { n: 0, t: 0 };
    updateFab();
    try {
      const c = await UXK.lib.refresh((n, t) => { loadingProgress = { n, t }; updateFab(); setStatus(`불러오는 중... ${UXK.fmtNum(n)} / ${UXK.fmtNum(t)}`); });
      setCache(c);
      return c;
    } finally {
      loadingProgress = null;
      updateFab();
    }
  }

  function updateFab() {
    if (!fab) return;
    if (loadingProgress) {
      const pct = loadingProgress.t ? Math.round((loadingProgress.n / loadingProgress.t) * 100) : 0;
      fab.textContent = `강의 데이터 불러오는 중 ${pct}%`;
    } else {
      fab.textContent = '내 강의 도구';
    }
  }

  // ---------------- 필터/정렬 ----------------
  const num = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
  function applyFilters(list) {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    const minr = num(f.minr, 0), minv = num(f.minv, 0), mins = num(f.mins, 0);
    const minh = num(f.minh, 0), maxh = num(f.maxh, Infinity);
    const now = Date.now();
    const updDays = parseInt(f.upd, 10) || 0;
    const cutoff = updDays ? now - updDays * 864e5 : 0;
    const cap = f.cap.trim().toLowerCase();
    return list.filter((c) => {
      const m = meta[c.id];
      if (q && !(c.title.toLowerCase().includes(q) || c.instructors.toLowerCase().includes(q) || (m && m.memo && m.memo.toLowerCase().includes(q)))) return false;
      if (c.rating < minr || c.reviews < minv || c.subs < mins) return false;
      if (c.hours < minh || c.hours > maxh) return false;
      if (f.prog === 'none' && c.progress !== 0) return false;
      if (f.prog === 'ing' && !(c.progress > 0 && c.progress < 100)) return false;
      if (f.prog === 'done' && c.progress < 100) return false;
      if (f.prog === 'notdone' && c.progress >= 100) return false;
      if (!c.updated) { if (!f.noupd || cutoff) return false; }
      else if (cutoff && new Date(c.updated).getTime() < cutoff) return false;
      if (f.cat && c.category !== f.cat) return false;
      if (f.lang && c.lang !== f.lang) return false;
      if (cap && !c.captions.some((x) => String(x).toLowerCase().includes(cap))) return false;
      if (f.enr !== '0') {
        if (!c.enrolled) return false;
        const age = (now - new Date(c.enrolled).getTime()) / 864e5;
        if (f.enr === '365' && age > 365) return false;
        if (f.enr === '365-1095' && (age <= 365 || age > 1095)) return false;
        if (f.enr === '1095+' && age <= 1095) return false;
      }
      if (f.acc !== '0') {
        const age = c.accessed ? (now - new Date(c.accessed).getTime()) / 864e5 : Infinity;
        if (f.acc === '30' && age > 30) return false;
        if (f.acc === '365+' && (age <= 365 || age === Infinity)) return false;
        if (f.acc === 'never' && age !== Infinity) return false;
      }
      if (f.fav && !c.favorite) return false;
      if (f.queue && !(m && m.queue)) return false;
      if (f.tag && !(m && m.tags && m.tags.includes(f.tag))) return false;
      return true;
    });
  }

  function sortValue(c, key) {
    switch (key) {
      case 'bayes': return UXK.lib.bayes(c, mean);
      case 'updated': case 'enrolled': case 'accessed': case 'created': return c[key] ? new Date(c[key]).getTime() : null;
      case 'title': return c.title;
      default: return c[key];
    }
  }
  function applySort(list) {
    const { key, dir } = state.sort;
    const d = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const x = sortValue(a, key), y = sortValue(b, key);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // 값 없는 항목은 방향과 무관하게 뒤로
      if (y == null) return -1;
      if (key === 'title') return d * String(x).localeCompare(String(y), 'ko');
      return d * (x - y);
    });
  }
  const currentRows = () => applySort(applyFilters(scoped()));

  // ---------------- 패널 UI ----------------
  function control(label, input) { return el('label', { class: 'uxk-field' }, [el('span', { text: label }), input]); }
  function sel(name, opts) {
    const s = el('select', { 'data-f': name, class: 'uxk-input' });
    opts.forEach(([v, t]) => s.appendChild(el('option', { value: v, text: t })));
    return s;
  }
  const inp = (name, attrs = {}) => el('input', { 'data-f': name, class: 'uxk-input', ...attrs });

  function buildPanel() {
    panel = el('div', { class: 'uxk-lib', id: 'uxk-lib' });
    const head = el('div', { class: 'uxk-lib-head' }, [
      el('h2', { text: '내 강의 도구' }),
      el('div', { class: 'uxk-seg', role: 'tablist' }, [
        el('button', { 'data-scope': 'active', class: 'uxk-seg-btn' }),
        el('button', { 'data-scope': 'archived', class: 'uxk-seg-btn' }),
        el('button', { 'data-scope': 'all', class: 'uxk-seg-btn' }),
      ]),
      el('span', { class: 'uxk-grow' }),
      el('button', { class: 'uxk-btn', 'data-act': 'refresh', text: '데이터 새로고침', title: 'Udemy에서 전체 목록을 다시 불러옵니다' }),
      el('button', { class: 'uxk-btn', 'data-act': 'close', text: '닫기' }),
    ]);
    const stats = el('div', { class: 'uxk-lib-stats' });

    const grid = el('div', { class: 'uxk-grid' }, [
      control('검색 (제목·강사·메모)', inp('q', { type: 'search', placeholder: '키워드' })),
      control('정렬 기준', sel('sort', [
        ['bayes', '신뢰 별점 (리뷰 수 보정)'], ['rating', '별점'], ['reviews', '리뷰 수'], ['updated', '최근 업데이트'],
        ['subs', '수강생 수'], ['hours', '강의 시간'], ['progress', '진행률'], ['enrolled', '구매일'], ['accessed', '최근 접속'],
        ['created', '최초 출시일'], ['title', '제목'],
      ])),
      control('방향', sel('dir', [['desc', '내림차순'], ['asc', '오름차순']])),
      control('진행 상태', sel('prog', [['all', '전체'], ['none', '시작 안 함 (0%)'], ['ing', '진행 중 (1~99%)'], ['done', '완료 (100%)'], ['notdone', '미완료 (0~99%)']])),
      control('최소 별점', inp('minr', { type: 'number', step: '0.1', min: '0', max: '5', placeholder: '예: 4.5' })),
      control('최소 리뷰 수', inp('minv', { type: 'number', min: '0', placeholder: '예: 500' })),
      control('업데이트 기간', sel('upd', [['0', '전체'], ['365', '최근 1년'], ['730', '최근 2년'], ['1095', '최근 3년']])),
      control('최소 수강생 수', inp('mins', { type: 'number', min: '0', placeholder: '예: 10000' })),
      control('최소 시간(h)', inp('minh', { type: 'number', min: '0', step: '0.5' })),
      control('최대 시간(h)', inp('maxh', { type: 'number', min: '0', step: '0.5' })),
      control('카테고리', sel('cat', [['', '전체']])),
      control('강의 언어', sel('lang', [['', '전체']])),
      control('자막 언어 포함', inp('cap', { type: 'text', placeholder: '예: Korean, 한국어', list: 'uxk-cap-list' })),
      control('구매 시기', sel('enr', [['0', '전체'], ['365', '최근 1년'], ['365-1095', '1~3년 전'], ['1095+', '3년 이상 전']])),
      control('마지막 접속', sel('acc', [['0', '전체'], ['30', '최근 30일'], ['365+', '1년 이상 미접속'], ['never', '접속 기록 없음']])),
      control('태그', sel('tag', [['', '전체']])),
      el('label', { class: 'uxk-chk' }, [inp('fav', { type: 'checkbox' }), ' 즐겨찾기만']),
      el('label', { class: 'uxk-chk' }, [inp('queue', { type: 'checkbox' }), ' 학습 큐만']),
      el('label', { class: 'uxk-chk' }, [inp('noupd', { type: 'checkbox', checked: true }), ' 업데이트 일자 없는 강의 포함']),
      el('datalist', { id: 'uxk-cap-list' }),
    ]);
    const presetSel = el('select', { class: 'uxk-input', 'data-preset': '1' }, [el('option', { value: '', text: '프리셋 불러오기' })]);
    const filterRow = el('div', { class: 'uxk-row' }, [
      presetSel,
      el('button', { class: 'uxk-btn', 'data-act': 'preset-save', text: '현재 조건 저장' }),
      el('button', { class: 'uxk-btn', 'data-act': 'preset-del', text: '프리셋 삭제' }),
      el('span', { class: 'uxk-grow' }),
      el('button', { class: 'uxk-btn', 'data-act': 'reset', text: '초기화' }),
      el('button', { class: 'uxk-btn uxk-btn-primary', 'data-act': 'apply', text: '적용' }),
    ]);
    const filters = el('details', { class: 'uxk-lib-filters', open: true }, [el('summary', { text: '필터 · 정렬 (설정 후 적용 또는 Enter)' }), grid, filterRow]);

    const bulk = el('div', { class: 'uxk-lib-bulk' }, [
      el('span', { class: 'uxk-bulk-count', text: '선택 0개' }),
      el('button', { class: 'uxk-btn uxk-btn-danger', 'data-act': 'archive', text: '보관' }),
      el('button', { class: 'uxk-btn', 'data-act': 'unarchive', text: '보관 해제' }),
      el('button', { class: 'uxk-btn', 'data-act': 'tag-add', text: '태그 추가' }),
      el('button', { class: 'uxk-btn', 'data-act': 'tag-del', text: '태그 제거' }),
      el('button', { class: 'uxk-btn', 'data-act': 'queue-add', text: '큐에 추가' }),
      el('button', { class: 'uxk-btn', 'data-act': 'queue-del', text: '큐에서 제거' }),
      el('button', { class: 'uxk-btn uxk-btn-ghost', 'data-act': 'sel-clear', text: '선택 해제' }),
      el('span', { class: 'uxk-grow' }),
      el('span', { class: 'uxk-muted', text: '내보내기' }),
      el('button', { class: 'uxk-btn', 'data-act': 'csv', text: 'CSV (Notion)', title: '현재 필터·정렬 결과' }),
      el('button', { class: 'uxk-btn', 'data-act': 'md', text: 'Markdown 체크리스트' }),
      el('button', { class: 'uxk-btn', 'data-act': 'json', text: 'JSON' }),
    ]);
    const status = el('div', { class: 'uxk-lib-status' });
    const list = el('div', { class: 'uxk-lib-list' });
    panel.append(head, stats, filters, bulk, status, list);
    document.body.appendChild(panel);

    // 이벤트
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input[data-f]')) { e.preventDefault(); applyForm(); }
      if (e.key === 'Escape') closePanel();
      e.stopPropagation(); // 패널 입력 중에는 페이지 단축키 차단
    });
    presetSel.addEventListener('change', () => {
      const p = presets[presetSel.value];
      if (p) { writeForm(p); applyForm(); }
    });
    list.addEventListener('change', onListChange);
  }

  function writeForm(f) {
    $$('[data-f]', panel).forEach((n) => {
      const k = n.getAttribute('data-f');
      if (!(k in f)) return;
      if (n.type === 'checkbox') n.checked = !!f[k];
      else n.value = f[k];
    });
  }
  function readForm() {
    const f = DEFAULT_FILTERS();
    $$('[data-f]', panel).forEach((n) => {
      const k = n.getAttribute('data-f');
      f[k] = n.type === 'checkbox' ? n.checked : n.value;
    });
    return f;
  }
  function applyForm() {
    state.filters = readForm();
    state.sort = { key: state.filters.sort, dir: state.filters.dir };
    state.shown = SHOW_STEP;
    render();
  }

  function fillOptions() {
    const data = allData();
    const fillSel = (name, values, keepFirst = true) => {
      const s = $(`select[data-f="${name}"]`, panel);
      if (!s) return;
      const cur = s.value;
      while (s.options.length > (keepFirst ? 1 : 0)) s.remove(keepFirst ? 1 : 0);
      values.forEach(([v, t]) => s.appendChild(el('option', { value: v, text: t })));
      s.value = values.some(([v]) => v === cur) ? cur : '';
    };
    const count = (arr) => { const m = new Map(); arr.forEach((v) => v && m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    fillSel('cat', count(data.map((c) => c.category)).map(([v, n]) => [v, `${v} (${n})`]));
    fillSel('lang', count(data.map((c) => c.lang)).map(([v, n]) => [v, `${v} (${n})`]));
    const tags = count(Object.values(meta).flatMap((m) => m.tags || []));
    fillSel('tag', tags.map(([v, n]) => [v, `${v} (${n})`]));
    const dl = $('#uxk-cap-list', panel);
    if (dl) {
      dl.textContent = '';
      count(data.flatMap((c) => c.captions)).slice(0, 80).forEach(([v]) => dl.appendChild(el('option', { value: v })));
    }
    // 확장 필드 미지원 시 해당 필터 비활성화
    const has = (f) => cache && cache.fields && cache.fields.includes(f);
    $(`select[data-f="cat"]`, panel).disabled = !has('primary_category');
    $(`select[data-f="lang"]`, panel).disabled = !has('locale');
    $(`input[data-f="cap"]`, panel).disabled = !has('caption_languages');
    const ps = $('select[data-preset]', panel);
    while (ps.options.length > 1) ps.remove(1);
    Object.keys(presets).sort().forEach((k) => ps.appendChild(el('option', { value: k, text: k })));
  }

  function setStatus(t) { const s = panel && $('.uxk-lib-status', panel); if (s) s.textContent = t; }

  function renderScopeButtons() {
    const data = allData();
    const nA = data.filter((c) => !c.archived).length, nB = data.length - nA;
    const labels = { active: `보관 안 됨 ${UXK.fmtNum(nA)}`, archived: `보관됨 ${UXK.fmtNum(nB)}`, all: `전체 ${UXK.fmtNum(data.length)}` };
    $$('[data-scope]', panel).forEach((b) => {
      const k = b.getAttribute('data-scope');
      b.textContent = labels[k];
      b.classList.toggle('uxk-on', state.scope === k);
    });
  }

  function renderStats(rows) {
    const box = $('.uxk-lib-stats', panel);
    if (!rows.length) { box.textContent = '조건에 맞는 강의가 없습니다.'; return; }
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
      `<b>${UXK.fmtNum(rows.length)}</b>개`,
      `총 <b>${UXK.fmtNum(Math.round(hours))}</b>시간`,
      `남은 분량 약 <b>${UXK.fmtNum(Math.round(remainH))}</b>시간`,
      `미시작 <b>${UXK.fmtNum(notStarted.length)}</b>개 (${UXK.fmtNum(Math.round(nsHours))}시간)`,
      `평균 별점 <b>${avg.toFixed(2)}</b>`,
      topCats ? `상위 카테고리: ${esc(topCats)}` : '',
    ].filter(Boolean).join('<span class="uxk-dot">·</span>');
  }

  function rowHtml(c) {
    const m = meta[c.id] || {};
    const tags = (m.tags || []).map((t) => `<span class="uxk-chip">${esc(t)}</span>`).join('');
    const sub = [c.instructors, c.category, c.lang].filter(Boolean).map(esc).join(' · ');
    const flags = [c.favorite ? '<span class="uxk-chip uxk-chip-fav" title="Udemy 즐겨찾기">즐겨찾기</span>' : '', c.archived ? '<span class="uxk-chip uxk-chip-arc">보관됨</span>' : ''].join('');
    const prog = Math.min(100, c.progress || 0);
    return `<tr data-id="${c.id}">
      <td class="uxk-c"><input type="checkbox" class="uxk-sel" ${state.selected.has(c.id) ? 'checked' : ''}></td>
      <td class="uxk-title"><a href="/course-dashboard-redirect/?course_id=${c.id}" target="_blank" rel="noopener">${esc(c.title)}</a>
        <div class="uxk-sub">${sub}${flags}${tags}${m.memo ? `<span class="uxk-memo" title="${esc(m.memo)}">메모</span>` : ''}</div></td>
      <td class="uxk-n">${c.rating ? c.rating.toFixed(2) : '-'}</td>
      <td class="uxk-n">${c.reviews ? UXK.lib.bayes(c, mean).toFixed(2) : '-'}</td>
      <td class="uxk-n">${UXK.fmtNum(c.reviews)}</td>
      <td class="uxk-n">${c.updated || '-'}</td>
      <td class="uxk-n">${c.hours ? c.hours.toFixed(1) + 'h' : '-'}</td>
      <td class="uxk-n">${UXK.fmtCompact(c.subs)}</td>
      <td class="uxk-n"><span class="uxk-bar"><i data-w="${prog}"></i></span>${prog}%</td>
      <td class="uxk-n">${c.enrolled || '-'}</td>
      <td class="uxk-n">${c.accessed || '-'}</td>
      <td class="uxk-c"><button class="uxk-icon ${m.queue ? 'uxk-on' : ''}" data-row="queue" title="학습 큐 추가/제거">${m.queue ? '★' : '☆'}</button>
        <button class="uxk-icon" data-row="edit" title="태그·메모 편집">✎</button></td>
    </tr>`;
  }

  const COLS = [
    ['', ''], ['title', '제목'], ['rating', '별점'], ['bayes', '신뢰'], ['reviews', '리뷰'], ['updated', '업데이트'],
    ['hours', '시간'], ['subs', '수강생'], ['progress', '진행'], ['enrolled', '구매일'], ['accessed', '최근 접속'], ['', '큐'],
  ];

  function render() {
    if (!panel) return;
    renderScopeButtons();
    if (!cache) { setStatus(loadingProgress ? '불러오는 중...' : '데이터가 없습니다. "데이터 새로고침"을 눌러 주세요.'); $('.uxk-lib-list', panel).textContent = ''; return; }
    const rows = currentRows();
    renderStats(rows);
    const slice = rows.slice(0, state.shown);
    const arrow = (k) => (state.sort.key === k ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const allChecked = rows.length > 0 && rows.every((c) => state.selected.has(c.id));
    const thead = COLS.map(([k, t], i) => (i === 0
      ? `<th class="uxk-c"><input type="checkbox" class="uxk-all" ${allChecked ? 'checked' : ''} title="현재 필터 결과 ${rows.length}개 전체 선택/해제 (화면에 안 보이는 행 포함)"></th>`
      : `<th ${k ? `data-k="${k}"` : ''}>${t}${arrow(k)}</th>`)).join('');
    $('.uxk-lib-list', panel).innerHTML = `<table><thead><tr>${thead}</tr></thead><tbody>${slice.map(rowHtml).join('')}</tbody></table>` +
      (rows.length > state.shown ? `<button class="uxk-btn uxk-more" data-act="more">더 보기 (${UXK.fmtNum(state.shown)} / ${UXK.fmtNum(rows.length)})</button>` : '');
    // CSP가 인라인 style 속성을 막을 수 있어 CSSOM으로 너비 지정
    $$('.uxk-bar i[data-w]', panel).forEach((n) => { n.style.width = n.getAttribute('data-w') + '%'; });
    const age = cache.t ? Math.round((Date.now() - cache.t) / 60000) : 0;
    setStatus(`조건 일치 ${UXK.fmtNum(rows.length)}개 · 데이터 기준 ${new Date(cache.t).toLocaleString('ko-KR')} (${age < 60 ? age + '분' : Math.round(age / 60) + '시간'} 전)` +
      (cache.fields && !cache.fields.includes('primary_category') ? ' · 카테고리/언어/자막 필드는 이 계정 API에서 미지원' : ''));
    updateBulk();
  }

  function updateBulk() {
    const n = state.selected.size;
    const c = $('.uxk-bulk-count', panel);
    if (c) c.textContent = `선택 ${UXK.fmtNum(n)}개`;
    const selData = [...state.selected].map((id) => byId.get(id)).filter(Boolean);
    const nActive = selData.filter((x) => !x.archived).length, nArch = selData.length - nActive;
    const set = (act, dis, label) => { const b = $(`[data-act="${act}"]`, panel); if (b) { b.disabled = state.busy || dis; if (label) b.textContent = label; } };
    set('archive', !nActive, `보관 (${nActive})`);
    set('unarchive', !nArch, `보관 해제 (${nArch})`);
    ['tag-add', 'tag-del', 'queue-add', 'queue-del', 'sel-clear'].forEach((a) => set(a, !n));
  }

  // ---------------- 이벤트 처리 ----------------
  function onPanelClick(e) {
    handlePanelClick(e).catch((err) => UXK.ui.toast(err && err.message ? err.message : String(err), { kind: 'err', timeout: 7000 }));
  }
  async function handlePanelClick(e) {
    const scopeBtn = e.target.closest('[data-scope]');
    if (scopeBtn) { state.scope = scopeBtn.getAttribute('data-scope'); state.shown = SHOW_STEP; render(); return; }
    const th = e.target.closest('th[data-k]');
    if (th) {
      const k = th.getAttribute('data-k');
      if (state.sort.key === k) state.sort.dir = state.sort.dir === 'desc' ? 'asc' : 'desc';
      else state.sort = { key: k, dir: k === 'title' ? 'asc' : 'desc' };
      $('select[data-f="sort"]', panel).value = state.sort.key;
      $('select[data-f="dir"]', panel).value = state.sort.dir;
      state.filters.sort = state.sort.key; state.filters.dir = state.sort.dir;
      state.shown = SHOW_STEP; render(); return;
    }
    const rowBtn = e.target.closest('[data-row]');
    if (rowBtn) {
      const id = +rowBtn.closest('tr').getAttribute('data-id');
      if (rowBtn.getAttribute('data-row') === 'queue') {
        meta = await UXK.lib.updateMeta([id], (m) => ({ ...m, queue: !m.queue }));
        render(); refreshBadges();
      } else editMeta(id);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.getAttribute('data-act');
    switch (a) {
      case 'close': closePanel(); break;
      case 'refresh': try { await ensureData(true); fillOptions(); render(); refreshBadges(); } catch (err) { setStatus('불러오기 실패: ' + err.message + ' (로그인 상태 확인)'); } break;
      case 'apply': applyForm(); break;
      case 'reset': writeForm(DEFAULT_FILTERS()); applyForm(); break;
      case 'more': state.shown += SHOW_STEP; render(); break;
      case 'preset-save': {
        const name = await UXK.ui.prompt('필터 프리셋 이름', { placeholder: '예: 미시작 고평점 최신' });
        if (name && name.trim()) {
          presets[name.trim()] = readForm();
          await UXK.local.set(UXK.KEYS.presets, presets);
          fillOptions();
          UXK.ui.toast(`프리셋 "${name.trim()}" 저장됨`);
        }
        break;
      }
      case 'preset-del': {
        const ps = $('select[data-preset]', panel);
        const name = ps.value;
        if (!name) { UXK.ui.toast('삭제할 프리셋을 먼저 선택하세요'); break; }
        delete presets[name];
        await UXK.local.set(UXK.KEYS.presets, presets);
        fillOptions();
        break;
      }
      case 'archive': bulkArchive(true); break;
      case 'unarchive': bulkArchive(false); break;
      case 'tag-add': case 'tag-del': {
        const t = await UXK.ui.prompt(a === 'tag-add' ? '추가할 태그' : '제거할 태그', { placeholder: '쉼표로 여러 개 (예: 데이터, 스페인어)' });
        if (!t) break;
        const list = t.split(',').map((s) => s.trim()).filter(Boolean);
        meta = await UXK.lib.updateMeta([...state.selected], (m) => ({
          ...m, tags: a === 'tag-add' ? Array.from(new Set(m.tags.concat(list))) : m.tags.filter((x) => !list.includes(x)),
        }));
        fillOptions(); render(); refreshBadges();
        break;
      }
      case 'queue-add': case 'queue-del':
        meta = await UXK.lib.updateMeta([...state.selected], (m) => ({ ...m, queue: a === 'queue-add' }));
        render(); refreshBadges();
        break;
      case 'sel-clear': state.selected.clear(); render(); break;
      case 'csv': exportCsv(); break;
      case 'md': exportMd(); break;
      case 'json': exportJson(); break;
    }
  }

  function onListChange(e) {
    const t = e.target;
    if (t.classList.contains('uxk-all')) {
      currentRows().forEach((c) => (t.checked ? state.selected.add(c.id) : state.selected.delete(c.id)));
      render();
    } else if (t.classList.contains('uxk-sel')) {
      const id = +t.closest('tr').getAttribute('data-id');
      t.checked ? state.selected.add(id) : state.selected.delete(id);
      updateBulk();
    }
  }

  async function editMeta(id) {
    const c = byId.get(id);
    const m = meta[id] || { tags: [], memo: '' };
    const wrap = el('div');
    const tagIn = el('input', { class: 'uxk-input', type: 'text', placeholder: '쉼표로 구분 (예: 데이터, 실무)' });
    tagIn.value = (m.tags || []).join(', ');
    const memoIn = el('textarea', { class: 'uxk-input', rows: 4, placeholder: '왜 이 강의를 들을지, 들을 부분 등' });
    memoIn.value = m.memo || '';
    wrap.append(el('div', { class: 'uxk-hint', text: c ? c.title : '' }), control('태그', tagIn), control('메모', memoIn));
    const ok = await UXK.ui.modal({ title: '태그 · 메모', body: wrap, buttons: [{ label: '취소', value: false }, { label: '저장', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const tags = tagIn.value.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      meta = await UXK.lib.updateMeta([id], (x) => ({ ...x, tags: Array.from(new Set(tags)), memo: memoIn.value.trim() }));
    } catch (err) {
      await UXK.copyText(memoIn.value);
      UXK.ui.toast(`${err.message} (입력한 메모는 클립보드에 복사했습니다)`, { kind: 'err', timeout: 9000 });
      return;
    }
    fillOptions(); render(); refreshBadges();
  }

  async function bulkArchive(toArchive) {
    if (state.busy) return;
    const ids = [...state.selected].filter((id) => { const c = byId.get(id); return c && c.archived !== toArchive; });
    if (!ids.length) return;
    const sample = ids.slice(0, 5).map((id) => '- ' + byId.get(id).title).join('\n');
    const verb = toArchive ? '보관' : '보관 해제';
    const extra = toArchive
      ? `보관됨 탭이나 Udemy의 보관됨 필터에서 되돌릴 수 있습니다. 약 ${Math.max(1, Math.round((ids.length * 0.6) / 60))}분 걸리며 도중에 중지할 수 있습니다.`
      : '보관 해제는 Udemy에서 아직 확인하지 못한 요청 방식을 씁니다. 첫 요청이 실패하면 바로 멈추고, 그때는 Udemy 화면에서 직접 해제해야 합니다.';
    const ok = await UXK.ui.confirm(`${ids.length}개 강의 ${verb}`, `${sample}${ids.length > 5 ? `\n... 외 ${ids.length - 5}개` : ''}\n\n${extra}`, { okLabel: verb, danger: toArchive });
    if (!ok) return;
    state.busy = true; updateBulk();
    let done = 0; const failed = [];
    let stopped = false;
    const stopAct = [{ label: '중지', close: false, onClick: () => { stopped = true; } }];
    const progress = UXK.ui.toast(`${verb} 중... 0 / ${ids.length}`, { id: 'uxk-bulk', timeout: 0, actions: stopAct });
    for (const id of ids) {
      if (stopped) break;
      try {
        if (toArchive) await UXK.api.archive(id); else await UXK.api.unarchive(id);
        done++;
        state.selected.delete(id);
        const c = byId.get(id);
        if (c) c.archived = toArchive;
        hideNativeCard(id, toArchive);
      } catch (err) {
        failed.push(id);
        if (done === 0) {
          progress.close();
          state.busy = false; updateBulk();
          setStatus(`첫 요청이 실패해 중단했습니다: ${err.message}${err.status === 403 ? ' (보안 토큰/로그인 확인)' : err.status === 404 || err.status === 405 ? ' (요청 방식이 Udemy와 다름)' : ''}`);
          return;
        }
        if (failed.length >= 5) break;
      }
      progress.update(`${verb} 중... ${done + failed.length} / ${ids.length}`, { timeout: 0, actions: stopAct });
      await UXK.sleep(400);
    }
    progress.close();
    state.busy = false;
    if (cache) await UXK.lib.save(cache);
    render();
    UXK.ui.toast(`${stopped ? '중지됨 · ' : ''}${verb} 완료 ${done}개${failed.length ? `, 실패 ${failed.length}개 (선택 유지)` : ''} · 새로고침 없이 처리됨`, { timeout: 6000 });
  }

  // ---------------- 내보내기 ----------------
  function exportRows() { return currentRows(); }
  const linkOf = (c) => `${location.origin}/course-dashboard-redirect/?course_id=${c.id}`;
  function exportCsv() {
    const rows = exportRows();
    const q = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const head = ['제목', '링크', '강사', '카테고리', '언어', '자막', '별점', '신뢰별점', '리뷰수', '최근업데이트', '시간(h)', '수강생수', '진행률(%)', '구매일', '최근접속', '즐겨찾기', '보관', '태그', '학습큐', '메모'];
    const lines = [head.map(q).join(',')];
    rows.forEach((c) => {
      const m = meta[c.id] || {};
      lines.push([q(c.title), q(linkOf(c)), q(c.instructors), q(c.category), q(c.lang), q(c.captions.join(' / ')),
        c.rating ? c.rating.toFixed(2) : '', c.reviews ? UXK.lib.bayes(c, mean).toFixed(2) : '', c.reviews, c.updated || '', c.hours.toFixed(1), c.subs, c.progress,
        c.enrolled || '', c.accessed || '', c.favorite ? 'Y' : '', c.archived ? 'Y' : '', q((m.tags || []).join(', ')), m.queue ? 'Y' : '', q(m.memo || '')].join(','));
    });
    UXK.download(`udemy-courses-${UXK.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    UXK.ui.toast(`CSV ${UXK.fmtNum(rows.length)}행 저장 (Notion: 가져오기 → CSV)`);
  }
  function exportMd() {
    const rows = exportRows();
    const md = [`# Udemy 학습 목록 (${UXK.today()})`, '', ...rows.map((c) => `- [ ] [${c.title.replace(/[[\]]/g, '')}](${linkOf(c)}) — ★${c.rating ? c.rating.toFixed(1) : '-'} · ${c.hours ? c.hours.toFixed(1) + 'h' : '-'} · 진행 ${c.progress}%${(meta[c.id] && meta[c.id].tags && meta[c.id].tags.length) ? ' · #' + meta[c.id].tags.join(' #') : ''}`)].join('\n');
    UXK.download(`udemy-checklist-${UXK.today()}.md`, md, 'text/markdown;charset=utf-8');
    UXK.ui.toast(`Markdown ${UXK.fmtNum(rows.length)}줄 저장 (Notion에 붙여넣으면 할 일 목록)`);
  }
  function exportJson() {
    const rows = exportRows().map((c) => ({ ...c, link: linkOf(c), meta: meta[c.id] || null }));
    UXK.download(`udemy-courses-${UXK.today()}.json`, JSON.stringify(rows, null, 2), 'application/json');
  }

  // ---------------- 카드 배지 (Udemy 기본 카드에 정보 추가) ----------------
  const cardCourseId = (card) => {
    const a = card.querySelector('a[href*="course_id="]');
    const m = a && a.getAttribute('href').match(/course_id=(\d+)/);
    return m ? +m[1] : null;
  };
  const ratingClass = (r) => (r >= 4.6 ? 'uxk-r4' : r >= 4.3 ? 'uxk-r3' : r >= 4.0 ? 'uxk-r2' : r > 0 ? 'uxk-r1' : 'uxk-r0');

  function processCards() {
    if (!S.library.cardBadges || !cache) return;
    $$(CARD_SEL).forEach((card) => {
      const id = cardCourseId(card);
      if (!id) return;
      const c = byId.get(id);
      let box = card.querySelector(':scope .uxk-card-badges');
      if (!c) { if (box) box.remove(); return; }
      const m = meta[id] || {};
      const sig = `${c.rating}|${c.reviews}|${c.hours}|${(m.tags || []).join(',')}|${m.queue}`;
      if (box && box.getAttribute('data-sig') === sig) return;
      if (!box) {
        box = el('div', { class: 'uxk-card-badges' });
        const main = card.querySelector('[class*="course-card-module--main-content"]') || card;
        main.appendChild(box);
      }
      box.setAttribute('data-sig', sig);
      box.className = 'uxk-card-badges ' + ratingClass(c.rating);
      box.innerHTML = [
        c.rating ? `<b class="uxk-rate">★${c.rating.toFixed(1)}</b> <span>(${UXK.fmtCompact(c.reviews)})</span>` : '',
        c.hours ? `<span>${c.hours.toFixed(1)}h</span>` : '',
        c.updated ? `<span>업데이트 ${c.updated.slice(0, 7)}</span>` : '',
        c.subs ? `<span>수강생 ${UXK.fmtCompact(c.subs)}</span>` : '',
        m.queue ? '<span class="uxk-chip uxk-chip-q">학습 큐</span>' : '',
        ...(m.tags || []).map((t) => `<span class="uxk-chip">${esc(t)}</span>`),
      ].filter(Boolean).join(' ');
    });
  }
  const processCardsSoon = UXK.throttle(() => processCards(), 400);
  function refreshBadges() { $$('.uxk-card-badges').forEach((n) => n.removeAttribute('data-sig')); processCards(); }

  function findNativeCard(id) {
    return $$(CARD_SEL).find((card) => cardCourseId(card) === id) || null;
  }
  function hideNativeCard(id, hide = true) {
    const card = findNativeCard(id);
    if (!card) return;
    const outer = card.parentElement && card.parentElement.children.length === 1 ? card.parentElement : card;
    outer.classList.toggle('uxk-card-hidden', !!hide);
  }

  // ---------------- 새로고침 없는 보관 (Udemy 카드 메뉴 가로채기) ----------------
  let lastCard = null;
  function onPointerDown(e) {
    const card = e.target.closest && e.target.closest(CARD_SEL);
    if (card) lastCard = { id: cardCourseId(card), t: Date.now() };
  }
  function closeMenus() {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true };
    try { (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
    try { document.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
  }
  function onArchiveClick(e) {
    if (!S.library.archiveNoReload) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.uxk-lib, .uxk-modal-back, .uxk-toasts')) return;
    const item = t.closest('[data-purpose="toggle-archived"], [role="menuitem"], button, a, li');
    if (!item) return;
    const isToggle = !!(item.matches('[data-purpose="toggle-archived"]') || item.closest('[data-purpose="toggle-archived"]'));
    const label = (item.innerText || item.textContent || '').replace(/\s+/g, ' ').trim();
    if (!isToggle && !/^(현 강의 보관|강의 보관|보관|archive this course|archive)$/i.test(label)) return;
    if (/해제|취소|복원|unarchive/i.test(label)) return; // 보관 해제는 Udemy 기본 동작 유지
    const card = item.closest(CARD_SEL);
    const id = card ? cardCourseId(card) : (lastCard && Date.now() - lastCard.t < 20000 ? lastCard.id : null);
    if (!id) return;
    const known = byId.get(id);
    if (known && known.archived) return; // 이미 보관된 강의면 Udemy에 맡김
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeMenus();
    archiveWithoutReload(id);
  }
  async function archiveWithoutReload(id) {
    const c = byId.get(id);
    const name = c ? `"${c.title.slice(0, 40)}"` : `강의 ${id}`;
    try {
      await UXK.api.archive(id);
      hideNativeCard(id, true);
      if (c) { c.archived = true; await UXK.lib.save(cache); }
      render();
      UXK.ui.toast(`${name} 보관됨 (새로고침 없음)`, {
        timeout: 7000,
        actions: [{ label: '되돌리기', onClick: async () => {
          try {
            await UXK.api.unarchive(id);
            hideNativeCard(id, false);
            if (c) { c.archived = false; await UXK.lib.save(cache); }
            render();
            UXK.ui.toast('보관을 되돌렸습니다');
          } catch (err) { UXK.ui.toast(`되돌리기 실패 (${err.message}). Udemy 보관됨 필터에서 직접 해제하세요.`, { timeout: 8000, kind: 'err' }); }
        } }],
      });
    } catch (err) {
      UXK.ui.toast(`보관 실패 (${err.message}). 옵션에서 "새로고침 없는 보관"을 끄면 Udemy 기본 동작을 씁니다.`, { timeout: 9000, kind: 'err' });
    }
  }

  // ---------------- 열기/닫기 ----------------
  async function openPanel() {
    if (!panel) buildPanel();
    panel.classList.add('uxk-open');
    fillOptions();
    writeForm(state.filters);
    render();
    if (!cache || UXK.lib.isStale(cache, S.library.autoRefreshHours)) {
      try { await ensureData(!cache ? false : true); fillOptions(); render(); processCards(); } catch (err) { setStatus('불러오기 실패: ' + err.message + ' (로그인 상태 확인)'); }
    }
  }
  function closePanel() { if (panel) panel.classList.remove('uxk-open'); }

  // ---------------- 생명주기 ----------------
  let started = false;
  async function init(settings) {
    S = settings;
    if (started) return;
    started = true;
    meta = await UXK.lib.meta();
    presets = await UXK.local.get(UXK.KEYS.presets, {});
    setCache(await UXK.lib.load());
    if (!started) return; // 초기화 도중 다른 페이지로 이동한 경우
    if (S.library.panel) {
      fab = el('button', { class: 'uxk-fab', id: 'uxk-fab', text: '내 강의 도구', title: '정렬·필터·일괄 작업 (Udemy Toolkit)' });
      fab.onclick = () => {
        if (!UXK.alive()) { UXK.ui.toast(new UXK.DeadError().message, { kind: 'err', timeout: 8000 }); return; }
        panel && panel.classList.contains('uxk-open') ? closePanel() : openPanel();
      };
      document.body.appendChild(fab);
    }
    observer = new MutationObserver(processCardsSoon);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('click', onArchiveClick, true);
    processCards();
    // 데이터가 없거나 오래되면 백그라운드로 갱신 (카드 배지·보유 표시용)
    if (UXK.lib.isStale(cache, S.library.autoRefreshHours) && (await UXK.lib.canAutoRefresh()) && started) {
      ensureData(!!cache).then(() => { processCards(); if (panel && panel.classList.contains('uxk-open')) { fillOptions(); render(); } }).catch((e) => UXK.log('auto refresh fail', e));
    }
  }
  function destroy() {
    if (!started) return;
    started = false;
    if (observer) observer.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('click', onArchiveClick, true);
    if (fab) fab.remove();
    if (panel) panel.remove();
    fab = panel = null;
  }
  function onSettings(s) { S = s; if (started) refreshBadges(); }

  UXK.libraryPage = { init, destroy, onSettings, _state: state, _rows: () => currentRows() };
})();
