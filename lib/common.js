/* Udemy Toolkit KR — 공통 유틸 (content script / extension page 공용) */
(() => {
  const UXK = (globalThis.UXK = globalThis.UXK || {});
  if (UXK.__common) return;
  UXK.__common = true;
  UXK.VERSION = '2.0.0';

  // ---------------- 기본 설정 ----------------
  UXK.DEFAULTS = {
    speed: {
      enabled: true,
      default: 1,
      step: 0.25,
      min: 0.25,
      max: 16,
      remember: 'course', // 'course' | 'global'
      enforce: true, // Udemy가 속도를 되돌리면 다시 적용
      overlay: true, // 속도 변경 시 화면 표시
      seekSec: 10, // Z / X 탐색 초
    },
    hotkeys: {
      speedUp: 'D',
      speedDown: 'S',
      speedReset: 'R',
      back: 'Z',
      forward: 'X',
      next: 'N',
      prev: 'P',
      pip: 'Alt+P',
      theater: 'Alt+T',
      subs: 'V',
      replayCue: 'Q',
      loopCue: 'L',
      abLoop: 'A',
      shadow: 'W',
      saveSentence: 'K',
      copyCue: 'Y',
      note: 'Alt+N',
      screenshot: 'Alt+S',
      help: 'H',
    },
    subs: {
      enabled: false,
      primaryLang: 'auto', // 'auto' 또는 언어 코드 접두사(en, es, ko...)
      secondaryLang: 'ko', // 'none' 또는 언어 코드 접두사
      translate: false, // 보조 언어 자막이 없을 때 기계번역(구글 비공식 엔드포인트, 옵트인)
      fontSize: 22,
      bottom: 12, // 영상 하단에서 % 위치
      bgOpacity: 0.55,
      showPrimary: true,
      showSecondary: true,
      hideNative: true,
      shadowPause: false, // 문장 끝마다 일시정지(따라 말하기)
    },
    player: {
      toolbar: true,
      remaining: true,
      sectionToggles: true,
      theater: false,
      notePause: true, // 메모 작성 중 일시정지
    },
    library: {
      panel: true,
      cardBadges: true,
      archiveNoReload: true,
      autoRefreshHours: 24,
    },
    catalog: {
      ownedBadges: true,
      hideOwned: false,
      landingInfo: true,
    },
    stats: {
      enabled: true,
      dailyGoalMin: 30,
    },
    ui: {
      darkMode: false,
    },
  };

  UXK.ACTION_LABELS = {
    speedUp: '속도 +', speedDown: '속도 −', speedReset: '1배속 ↔ 이전 속도', back: '뒤로 이동 (초는 재생 설정)', forward: '앞으로 이동',
    next: '다음 강의', prev: '이전 강의', pip: 'PiP (화면 속 화면)', theater: '넓게 보기', subs: '이중 자막 켜기/끄기',
    replayCue: '현재 문장 다시 듣기', loopCue: '현재 문장 반복', abLoop: 'A-B 구간 반복 (3번째 누르면 해제)',
    shadow: '따라 말하기 (문장마다 멈춤)', saveSentence: '문장 수집함에 저장', copyCue: '현재 문장 복사',
    note: '타임스탬프 메모', screenshot: '화면 캡처', help: '단축키 도움말',
  };
  // Udemy 플레이어 기본 단축키 (충돌 경고용)
  UXK.UDEMY_RESERVED = ['Left', 'Right', 'Up', 'Down', 'Shift+Left', 'Shift+Right', 'F', 'M', 'B', 'Shift+Slash'];

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (Array.isArray(v) ? v.map(clone) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
  // 깊은 병합 (결과는 항상 새 객체: DEFAULTS 등 원본을 공유·변경하지 않음)
  UXK.merge = function merge(base, over) {
    const out = clone(base);
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) {
      if (isObj(out[k]) && isObj(over[k])) out[k] = merge(out[k], over[k]);
      else if (over[k] !== undefined) out[k] = clone(over[k]);
    }
    return out;
  };

  // ---------------- 확장 컨텍스트 상태 ----------------
  // 확장이 업데이트·재로드되면 열려 있던 탭의 콘텐츠 스크립트는 고아가 되어 저장소를 쓸 수 없다
  UXK.alive = () => { try { return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  class DeadError extends Error {
    constructor() { super('확장 프로그램이 업데이트되었습니다. 이 페이지를 새로고침한 뒤 다시 시도하세요.'); this.dead = true; }
  }
  UXK.DeadError = DeadError;

  // ---------------- 저장소 ----------------
  const hasChrome = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const SETTINGS_KEY = 'uxk_settings';
  let settingsCache = null;
  const settingsListeners = new Set();
  const syncArea = () => chrome.storage.sync || chrome.storage.local;

  UXK.getSettings = async function () {
    if (settingsCache) return settingsCache;
    let saved = {};
    try {
      if (hasChrome() && UXK.alive()) {
        const v = await syncArea().get(SETTINGS_KEY);
        saved = (v && v[SETTINGS_KEY]) || {};
      }
    } catch (e) { /* 저장소 접근 실패 시 기본값 사용 */ }
    settingsCache = UXK.merge(UXK.DEFAULTS, saved);
    return settingsCache;
  };

  const notify = (s) => settingsListeners.forEach((fn) => { try { fn(s); } catch (e) { console.warn('[UXK] settings listener', e); } });

  UXK.saveSettings = async function (partial) {
    const cur = await UXK.getSettings();
    const next = UXK.merge(cur, partial);
    // 개정 번호: 늦게 도착한 이전 변경(onChanged)이 최신 값을 덮지 않게 함
    next._rev = Math.max(Date.now(), (cur._rev || 0) + 1);
    if (hasChrome()) {
      if (!UXK.alive()) throw new DeadError();
      await syncArea().set({ [SETTINGS_KEY]: next });
    }
    settingsCache = next;
    notify(next);
    return next;
  };

  UXK.onSettings = function (fn) { settingsListeners.add(fn); return () => settingsListeners.delete(fn); };

  try {
    if (hasChrome() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        const ch = changes[SETTINGS_KEY];
        if (!ch) return;
        const nv = ch.newValue || {};
        const curRev = (settingsCache && settingsCache._rev) || 0;
        if (nv._rev != null && nv._rev < curRev) return; // 오래된 변경 무시
        if (nv._rev != null && nv._rev === curRev) return; // 이미 반영한 자기 변경
        settingsCache = UXK.merge(UXK.DEFAULTS, nv);
        notify(settingsCache);
      });
    }
  } catch (e) {}

  UXK.local = {
    // 일반 읽기: 실패하면 기본값 (화면 표시용)
    async get(key, def = null) {
      try {
        if (!hasChrome() || !UXK.alive()) return def;
        const v = await chrome.storage.local.get(key);
        return v && v[key] !== undefined ? v[key] : def;
      } catch (e) { return def; }
    },
    // 엄격한 읽기: 실패를 그대로 던짐 (읽기 실패를 빈 값으로 오인해 덮어쓰는 사고 방지)
    async getStrict(key, def = null) {
      if (!hasChrome()) return def;
      if (!UXK.alive()) throw new DeadError();
      const v = await chrome.storage.local.get(key);
      return v && v[key] !== undefined ? v[key] : def;
    },
    async set(key, val) {
      try {
        if (!hasChrome() || !UXK.alive()) return false;
        await chrome.storage.local.set({ [key]: val });
        return true;
      } catch (e) { console.warn('[UXK] 저장 실패', key, e); return false; }
    },
    async remove(key) {
      try { if (hasChrome() && UXK.alive()) await chrome.storage.local.remove(key); } catch (e) {}
    },
    // 직렬 업데이트 (읽기-수정-쓰기). 실패하면 예외를 던져 호출 측이 사용자에게 알리게 한다
    _q: Promise.resolve(),
    update(key, fn, def) {
      const run = async () => {
        const cur = await UXK.local.getStrict(key, def);
        const next = await fn(cur);
        if (!hasChrome()) return next;
        if (!UXK.alive()) throw new DeadError();
        await chrome.storage.local.set({ [key]: next });
        return next;
      };
      const p = UXK.local._q.then(run, run);
      UXK.local._q = p.catch(() => {});
      return p;
    },
  };

  const hostKey = (h) => h || (typeof location !== 'undefined' ? location.host : 'default');
  UXK.KEYS = {
    // 개인 계정(www)과 Udemy Business(회사.udemy.com)의 강의 목록이 섞이지 않게 호스트별로 분리
    courses: (host) => 'uxk_courses_v3:' + hostKey(host),
    coursesPrefix: 'uxk_courses_v3:',
    fieldsOk: (host) => 'uxk_fields_ok:' + hostKey(host),
    meta: 'uxk_meta', // {courseId: {tags:[], queue:bool, memo:''}}
    presets: 'uxk_presets',
    notes: 'uxk_notes', // {courseId: [note]}
    sentences: 'uxk_sentences', // [sentence]
    speeds: 'uxk_speeds', // {courseId: rate, _global: rate}
    stats: 'uxk_stats', // {days: {YYYY-MM-DD: {sec, courses:{id:sec}}}}
    curriculum: (id) => 'uxk_cur_' + id,
  };

  // ---------------- DOM/문자열 유틸 ----------------
  UXK.$ = (s, r = document) => r.querySelector(s);
  UXK.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  UXK.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UXK.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  UXK.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // 변화가 계속 일어나도 ms마다 최소 한 번은 실행 (debounce는 Udemy처럼 DOM이 끊임없이 바뀌면 영영 실행되지 않을 수 있음)
  UXK.throttle = (fn, ms) => {
    let last = 0, timer = null;
    return (...a) => {
      const now = Date.now();
      const wait = ms - (now - last);
      if (wait <= 0) { clearTimeout(timer); timer = null; last = now; fn(...a); }
      else if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(...a); }, wait);
    };
  };
  UXK.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  UXK.el = function (tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return n;
  };

  UXK.fmtClock = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
  UXK.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (h && m === 60) return `${h + 1}시간`;
    if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
    return `${m}분`;
  };
  UXK.fmtNum = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
  UXK.fmtCompact = function (n) {
    if (n == null) return '-';
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
    return Number(n).toLocaleString('ko-KR');
  };
  UXK.today = function (d = new Date()) {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  UXK.safeFile = (s) => String(s || 'untitled').replace(/[\\/:*?"<>|\n\r\t]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

  UXK.download = function (filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  UXK.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e2) { return false; }
    }
  };

  // ---------------- 단축키 ----------------
  const KEY_ALIASES = {
    LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown',
    SPACE: 'Space', ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
    '[': 'BracketLeft', ']': 'BracketRight', '-': 'Minus', '=': 'Equal', '`': 'Backquote', '\\': 'Backslash',
    ENTER: 'Enter', ESC: 'Escape', TAB: 'Tab',
  };
  UXK.parseHotkey = function (spec) {
    if (!spec) return null;
    const parts = String(spec).split('+').map((s) => s.trim()).filter(Boolean);
    const hk = { ctrl: false, alt: false, shift: false, meta: false, code: null, label: spec };
    for (const p of parts) {
      const u = p.toUpperCase();
      if (u === 'CTRL' || u === 'CONTROL') hk.ctrl = true;
      else if (u === 'ALT' || u === 'OPTION') hk.alt = true;
      else if (u === 'SHIFT') hk.shift = true;
      else if (u === 'META' || u === 'CMD' || u === 'COMMAND') hk.meta = true;
      else if (/^[A-Z]$/.test(u)) hk.code = 'Key' + u;
      else if (/^[0-9]$/.test(u)) hk.code = 'Digit' + u;
      else if (/^F([1-9]|1[0-2])$/.test(u)) hk.code = u;
      else if (KEY_ALIASES[u]) hk.code = KEY_ALIASES[u];
      else if (KEY_ALIASES[p]) hk.code = KEY_ALIASES[p];
      else hk.code = p; // 이미 code 형태(KeyA 등)
    }
    return hk.code ? hk : null;
  };
  UXK.matchHotkey = function (e, spec) {
    const hk = typeof spec === 'string' ? UXK.parseHotkey(spec) : spec;
    if (!hk) return false;
    return e.code === hk.code && !!e.ctrlKey === hk.ctrl && !!e.altKey === hk.alt && !!e.shiftKey === hk.shift && !!e.metaKey === hk.meta;
  };
  // 키 이벤트를 사람이 읽을 수 있는 단축키 문자열로 (옵션 페이지에서 사용)
  UXK.eventToHotkey = function (e) {
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');
    let key = null;
    const c = e.code || '';
    if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
    else if (/^Digit[0-9]$/.test(c)) key = c.slice(5);
    else if (/^F([1-9]|1[0-2])$/.test(c)) key = c;
    else if (c.startsWith('Arrow')) key = c.slice(5);
    else if (['Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Minus', 'Equal', 'Backquote', 'Backslash'].includes(c)) key = c;
    if (!key) return null;
    return [...mods, key].join('+');
  };
  UXK.isTyping = function (e) {
    const t = e.target;
    if (!t || t === document.body) return false;
    if (t.isContentEditable) return true;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      const type = (t.type || 'text').toLowerCase();
      return !['checkbox', 'radio', 'button', 'submit', 'range', 'reset', 'color', 'file'].includes(type);
    }
    return !!(t.closest && t.closest('[contenteditable="true"], .monaco-editor, .CodeMirror, .ace_editor'));
  };

  // ---------------- 라우팅/URL 변화 ----------------
  UXK.onUrlChange = function (cb) {
    let last = location.href;
    const check = () => {
      if (location.href !== last) {
        const prev = last;
        last = location.href;
        try { cb(location.href, prev); } catch (e) { console.warn('[UXK] url cb', e); }
      }
    };
    try { if (window.navigation) window.navigation.addEventListener('navigatesuccess', () => setTimeout(check, 0)); } catch (e) {}
    window.addEventListener('popstate', () => setTimeout(check, 0));
    setInterval(check, 800);
  };

  UXK.route = function (path = location.pathname) {
    if (/^\/home\/my-courses(\/|$)/.test(path)) return 'library';
    if (/^\/course\/[^/]+\/learn(\/|$)/.test(path)) return 'player';
    if (/^\/course\/[^/]+\/?$/.test(path)) return 'landing';
    return 'catalog';
  };

  UXK.log = (...a) => { try { if (localStorage.getItem('uxk_debug')) console.log('[UXK]', ...a); } catch (e) {} };

  // ---------------- 메시지 (background) ----------------
  UXK.bg = function (msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: 'no response' });
        });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  };
})();
