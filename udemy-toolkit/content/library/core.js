// 내 학습 공통: 공유 상태, 데이터 불러오기, 필터·정렬
(() => {
  const UXK = globalThis.UXK;
  if (UXK.libraryShared) return;
  const P = (UXK.libraryShared = { parts: new Set(['core']) }); // 내 학습 파일들이 함께 쓰는 상태·함수 (파일 사이 호출은 P.이름)

  const SHOW_STEP = 200;

  P.S = null;
  P.cache = null;
  P.byId = new Map();
  P.meta = {};
  P.presets = {};
  P.mean = 4.4;
  P.fab = null;
  P.panel = null;
  P.observer = null;
  P.loadingProgress = null;
  const state = {
    scope: 'active',
    shown: SHOW_STEP,
    selected: new Set(),
    anchor: null, // 마지막으로 체크박스를 누른 강의 (Shift+클릭 범위 선택의 시작점)
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
    P.cache = c;
    P.byId = new Map((c ? c.data : []).map((x) => [x.id, x]));
    P.mean = c ? UXK.lib.globalMean(c.data.filter((x) => !x.archived)) : 4.4;
  }
  const allData = () => (P.cache ? P.cache.data : []);
  const scoped = () => allData().filter((c) => (state.scope === 'all' ? true : state.scope === 'archived' ? c.archived : !c.archived));

  async function ensureData(force) {
    if (!force && P.cache && !UXK.lib.isStale(P.cache, P.S.library.autoRefreshHours)) return P.cache;
    if (P.loadingProgress) return UXK.lib._refreshing;
    P.loadingProgress = { n: 0, t: 0 };
    updateFab();
    try {
      const c = await UXK.lib.refresh((n, t) => { P.loadingProgress = { n, t }; updateFab(); P.setStatus(`Loading... ${UXK.fmtNum(n)} / ${UXK.fmtNum(t)}`); });
      setCache(c);
      return c;
    } finally {
      P.loadingProgress = null;
      updateFab();
    }
  }

  function updateFab() {
    if (!P.fab) return;
    if (P.loadingProgress) {
      const pct = P.loadingProgress.t ? Math.round((P.loadingProgress.n / P.loadingProgress.t) * 100) : 0;
      P.fab.textContent = `Loading course data ${pct}%`;
    } else {
      P.fab.textContent = 'My Course Tools';
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
      const m = P.meta[c.id];
      if (q && !(c.title.toLowerCase().includes(q) || c.instructors.toLowerCase().includes(q) || (m && m.memo && m.memo.toLowerCase().includes(q)))) return false;
      if (c.rating < minr || c.reviews < minv || c.subs < mins) return false;
      if (c.hours < minh || c.hours > maxh) return false;
      if (f.prog === 'none' && c.progress !== 0) return false;
      if (f.prog === 'ing' && !(c.progress > 0 && c.progress < 100)) return false;
      if (f.prog === 'done' && c.progress < 100) return false;
      if (f.prog === 'notdone' && c.progress >= 100) return false;
      if (!c.updated) { if (!f.noupd) return false; }
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
      case 'bayes': return UXK.lib.bayes(c, P.mean);
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

  Object.assign(P, { SHOW_STEP, state, DEFAULT_FILTERS, setCache, allData, ensureData, currentRows });
})();
