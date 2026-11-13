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
    P.panel = el('div', { class: 'uxk-lib', id: 'uxk-lib' });
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
    P.panel.append(head, stats, filters, bulk, status, list);
    document.body.appendChild(P.panel);

    // 이벤트
    P.panel.addEventListener('click', P.onPanelClick);
    P.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input[data-f]')) { e.preventDefault(); applyForm(); }
      if (e.key === 'Escape') P.closePanel();
      e.stopPropagation(); // 패널 입력 중에는 페이지 단축키 차단
    });
    presetSel.addEventListener('change', () => {
      const p = P.presets[presetSel.value];
      if (p) { writeForm(p); applyForm(); }
    });
    list.addEventListener('change', P.onListChange);
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
      values.forEach(([v, t]) => s.appendChild(el('option', { value: v, text: t })));
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
    Object.keys(P.presets).sort().forEach((k) => ps.appendChild(el('option', { value: k, text: k })));
  }

  function setStatus(t) { const s = P.panel && $('.uxk-lib-status', P.panel); if (s) s.textContent = t; }

  function renderScopeButtons() {
    const data = P.allData();
    const nA = data.filter((c) => !c.archived).length, nB = data.length - nA;
    const labels = { active: `보관 안 됨 ${UXK.fmtNum(nA)}`, archived: `보관됨 ${UXK.fmtNum(nB)}`, all: `전체 ${UXK.fmtNum(data.length)}` };
    $$('[data-scope]', P.panel).forEach((b) => {
      const k = b.getAttribute('data-scope');
      b.textContent = labels[k];
      b.classList.toggle('uxk-on', P.state.scope === k);
    });
  }

  function renderStats(rows) {
    const box = $('.uxk-lib-stats', P.panel);
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
    const m = P.meta[c.id] || {};
    const tags = (m.tags || []).map((t) => `<span class="uxk-chip">${esc(t)}</span>`).join('');
    const sub = [c.instructors, c.category, c.lang].filter(Boolean).map(esc).join(' · ');
    const flags = [c.favorite ? '<span class="uxk-chip uxk-chip-fav" title="Udemy 즐겨찾기">즐겨찾기</span>' : '', c.archived ? '<span class="uxk-chip uxk-chip-arc">보관됨</span>' : ''].join('');
    const prog = Math.min(100, c.progress || 0);
    return `<tr data-id="${Number(c.id)}">
      <td class="uxk-c"><input type="checkbox" class="uxk-sel" ${P.state.selected.has(c.id) ? 'checked' : ''}></td>
      <td class="uxk-title"><a href="/course-dashboard-redirect/?course_id=${Number(c.id)}" target="_blank" rel="noopener">${esc(c.title)}</a>
        <div class="uxk-sub">${sub}${flags}${tags}${m.memo ? `<span class="uxk-memo" title="${esc(m.memo)}">메모</span>` : ''}</div></td>
      <td class="uxk-n">${c.rating ? c.rating.toFixed(2) : '-'}</td>
      <td class="uxk-n">${c.reviews ? UXK.lib.bayes(c, P.mean).toFixed(2) : '-'}</td>
      <td class="uxk-n">${UXK.fmtNum(c.reviews)}</td>
      <td class="uxk-n">${esc(c.updated || '-')}</td>
      <td class="uxk-n">${c.hours ? c.hours.toFixed(1) + 'h' : '-'}</td>
      <td class="uxk-n">${UXK.fmtCompact(c.subs)}</td>
      <td class="uxk-n"><span class="uxk-bar"><i data-w="${prog}"></i></span>${prog}%</td>
      <td class="uxk-n">${esc(c.enrolled || '-')}</td>
      <td class="uxk-n">${esc(c.accessed || '-')}</td>
      <td class="uxk-c"><button class="uxk-icon ${m.queue ? 'uxk-on' : ''}" data-row="queue" title="학습 큐 추가/제거">${m.queue ? '★' : '☆'}</button>
        <button class="uxk-icon" data-row="edit" title="태그·메모 편집">✎</button></td>
    </tr>`;
  }

  const COLS = [
    ['', ''], ['title', '제목'], ['rating', '별점'], ['bayes', '신뢰'], ['reviews', '리뷰'], ['updated', '업데이트'],
    ['hours', '시간'], ['subs', '수강생'], ['progress', '진행'], ['enrolled', '구매일'], ['accessed', '최근 접속'], ['', '큐'],
  ];

  function render() {
    if (!P.panel) return;
    renderScopeButtons();
    if (!P.cache) { setStatus(P.loadingProgress ? '불러오는 중...' : '데이터가 없습니다. "데이터 새로고침"을 눌러 주세요.'); $('.uxk-lib-list', P.panel).textContent = ''; return; }
    const rows = P.currentRows();
    renderStats(rows);
    const slice = rows.slice(0, P.state.shown);
    const arrow = (k) => (P.state.sort.key === k ? (P.state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const allChecked = rows.length > 0 && rows.every((c) => P.state.selected.has(c.id));
    const thead = COLS.map(([k, t], i) => (i === 0
      ? `<th class="uxk-c"><input type="checkbox" class="uxk-all" ${allChecked ? 'checked' : ''} title="현재 필터 결과 ${rows.length}개 전체 선택/해제 (화면에 안 보이는 행 포함)"></th>`
      : `<th ${k ? `data-k="${k}"` : ''}>${t}${arrow(k)}</th>`)).join('');
    $('.uxk-lib-list', P.panel).innerHTML = `<table><thead><tr>${thead}</tr></thead><tbody>${slice.map(rowHtml).join('')}</tbody></table>` +
      (rows.length > P.state.shown ? `<button class="uxk-btn uxk-more" data-act="more">더 보기 (${UXK.fmtNum(P.state.shown)} / ${UXK.fmtNum(rows.length)})</button>` : '');
    // CSP가 인라인 style 속성을 막을 수 있어 CSSOM으로 너비 지정
    $$('.uxk-bar i[data-w]', P.panel).forEach((n) => { n.style.width = n.getAttribute('data-w') + '%'; });
    const age = P.cache.t ? Math.round((Date.now() - P.cache.t) / 60000) : 0;
    setStatus(`조건 일치 ${UXK.fmtNum(rows.length)}개 · 데이터 기준 ${new Date(P.cache.t).toLocaleString('ko-KR')} (${age < 60 ? age + '분' : Math.round(age / 60) + '시간'} 전)` +
      (P.cache.fields && !P.cache.fields.includes('primary_category') ? ' · 카테고리/언어/자막 필드는 이 계정 API에서 미지원' : ''));
    updateBulk();
  }

  function updateBulk() {
    const n = P.state.selected.size;
    const c = $('.uxk-bulk-count', P.panel);
    if (c) c.textContent = `선택 ${UXK.fmtNum(n)}개`;
    const selData = [...P.state.selected].map((id) => P.byId.get(id)).filter(Boolean);
    const nActive = selData.filter((x) => !x.archived).length, nArch = selData.length - nActive;
    const set = (act, dis, label) => { const b = $(`[data-act="${act}"]`, P.panel); if (b) { b.disabled = P.state.busy || dis; if (label) b.textContent = label; } };
    set('archive', !nActive, `보관 (${nActive})`);
    set('unarchive', !nArch, `보관 해제 (${nArch})`);
    ['tag-add', 'tag-del', 'queue-add', 'queue-del', 'sel-clear'].forEach((a) => set(a, !n));
  }

  Object.assign(P, { control, buildPanel, writeForm, readForm, applyForm, fillOptions, setStatus, render,
    updateBulk });
})();
