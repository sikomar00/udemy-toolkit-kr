// 강의 플레이어(/course/<slug>/learn/...): 속도·단축키·PiP·캡처·이중자막·문장 반복·메모·문장 수집·남은 시간·섹션 완료·학습 시간 기록
(() => {
  const UXK = globalThis.UXK;
  if (UXK.playerPage) return;
  const { el, esc, $, $$ } = UXK;

  let S = null;
  let started = false;
  let observer = null;
  let hotkeys = {};
  const ctx = { courseId: null, slug: null, lectureId: null, lectureType: null, video: null, host: null };
  let videoAC = null;

  // ======================= 컨텍스트 =======================
  function parseUrl() {
    const p = location.pathname;
    ctx.slug = (p.match(/^\/course\/([^/]+)/) || [])[1] || null;
    const m = p.match(/\/learn\/(lecture|quiz|practice|assignment|coding-exercise)\/(\d+)/);
    ctx.lectureType = m ? m[1] : null;
    ctx.lectureId = m ? +m[2] : null;
  }
  function readCourseIdFromDom() {
    const n = document.querySelector('[data-module-id="course-taking"][data-module-args]');
    if (n) {
      try {
        const a = JSON.parse(n.getAttribute('data-module-args'));
        const id = a && (a.courseId || a.course_id || (a.course && a.course.id));
        if (id) return +id;
      } catch (e) {}
    }
    const b = document.querySelector('[data-clp-course-id], [data-course-id]');
    if (b) return +(b.getAttribute('data-clp-course-id') || b.getAttribute('data-course-id')) || null;
    return null;
  }
  let triedLibRefresh = false;
  async function resolveCourseId() {
    let id = readCourseIdFromDom();
    const bySlug = async () => {
      const cache = await UXK.lib.load();
      const c = cache && ctx.slug && cache.data.find((x) => x.slug === ctx.slug);
      return c ? c.id : null;
    };
    if (!id) id = await bySlug();
    if (!id && ctx.slug && !triedLibRefresh) {
      // 마지막 수단: 내 강의 목록을 새로 받아 slug로 찾기 (페이지당 1회, 수 초 소요)
      triedLibRefresh = true;
      try { await UXK.lib.refresh(); id = await bySlug(); } catch (e) { UXK.log('course id lookup failed', e); }
    }
    if (!id) UXK.log('courseId를 찾지 못함');
    return id;
  }
  async function courseFromCache() {
    const cache = await UXK.lib.load();
    return cache && ctx.courseId ? cache.data.find((x) => x.id === ctx.courseId) : null;
  }
  function courseTitle() {
    const h = document.querySelector('[data-purpose="course-header-title"], h1[data-purpose="course-title"], header h1');
    if (h && h.textContent.trim()) return h.textContent.trim();
    return (document.title || '').split('|')[0].trim() || 'Udemy 강의';
  }
  function lectureTitle() {
    const it = cur.items && cur.items.find((x) => x.id === ctx.lectureId && x._class === 'lecture');
    if (it) return it.title;
    const n = document.querySelector('[data-purpose="lead-title"], [class*="curriculum-item-link--is-current"] [data-purpose="item-title"]');
    if (n && n.textContent.trim()) return n.textContent.trim();
    return `강의 ${ctx.lectureId || ''}`.trim();
  }
  const lectureUrl = (lectureId, t) => `${location.origin}/course/${ctx.slug}/learn/lecture/${lectureId}${t != null ? `?uxk_t=${Math.floor(t)}` : ''}`;

  // ======================= 비디오 찾기 / 레이어 =======================
  function findVideo() {
    const vids = $$('video').filter((v) => v.isConnected);
    if (!vids.length) return null;
    let best = null, area = -1;
    vids.forEach((v) => {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area) { area = a; best = v; }
    });
    return best;
  }
  function hostOf(v) {
    return v.closest('[data-purpose="video-player"], [class*="video-player--container"], [class*="video-viewer--container"], [data-purpose="video-display"]') || v.parentElement;
  }

  let layer = null, indicatorEl = null, subsBox = null, sub1 = null, sub2 = null, toolbar = null, speedLabel = null;
  function buildLayer() {
    if (layer) return;
    indicatorEl = el('div', { class: 'uxk-indicator' });
    sub1 = el('div', { class: 'uxk-sub1' });
    sub2 = el('div', { class: 'uxk-sub2' });
    subsBox = el('div', { class: 'uxk-subs', title: '드래그해서 위치 이동' }, [sub1, sub2]);
    speedLabel = el('button', { class: 'uxk-tb-speed', title: '클릭: 1배속 ↔ 이전 속도' });
    const b = (label, title, fn, cls = '') => {
      const n = el('button', { class: 'uxk-tb-btn ' + cls, title, text: label });
      n.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
      return n;
    };
    toolbar = el('div', { class: 'uxk-toolbar' }, [
      b('−', `속도 낮추기 (${S.hotkeys.speedDown})`, () => run('speedDown')),
      speedLabel,
      b('+', `속도 높이기 (${S.hotkeys.speedUp})`, () => run('speedUp')),
      el('span', { class: 'uxk-tb-sep' }),
      b('PiP', `화면 속 화면 (${S.hotkeys.pip})`, () => run('pip')),
      b('캡처', `현재 화면 캡처 (${S.hotkeys.screenshot})`, () => run('screenshot')),
      b('메모', `타임스탬프 메모 (${S.hotkeys.note})`, () => run('note')),
      b('자막', `이중 자막 켜기/끄기 (${S.hotkeys.subs})`, () => openSubsMenu(), 'uxk-tb-subs'),
      b('⋯', '더 보기', (e) => openMoreMenu(e)),
    ]);
    speedLabel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run('speedReset'); });
    // 툴바·자막 클릭이 Udemy 재생/일시정지로 전달되지 않게 차단
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach((ev) => {
      toolbar.addEventListener(ev, (e) => e.stopPropagation());
      subsBox.addEventListener(ev, (e) => e.stopPropagation());
    });
    enableSubsDrag();
    layer = el('div', { class: 'uxk-layer' }, [indicatorEl, subsBox, toolbar]);
    applyLayerStyle();
  }
  function placeLayer() {
    if (!layer || !ctx.video) return;
    const fs = document.fullscreenElement;
    let target = ctx.host;
    if (fs && fs !== ctx.video && fs.contains(ctx.video) && !fs.contains(ctx.host)) target = fs;
    if (!target) return;
    if (getComputedStyle(target).position === 'static') target.classList.add('uxk-host-rel');
    target.classList.add('uxk-host');
    if (layer.parentNode !== target) target.appendChild(layer);
    toolbar.style.display = S.player.toolbar ? '' : 'none';
  }
  function applyLayerStyle() {
    applyNativeCc();
    document.documentElement.classList.toggle('uxk-theater', !!S.player.theater);
    if (!layer) return;
    layer.style.setProperty('--uxk-sub-size', S.subs.fontSize + 'px');
    layer.style.setProperty('--uxk-sub-bottom', S.subs.bottom + '%');
    layer.style.setProperty('--uxk-sub-bg', `rgba(0,0,0,${S.subs.bgOpacity})`);
    subsBox.style.display = S.subs.enabled ? '' : 'none';
    const sb = toolbar && toolbar.querySelector('.uxk-tb-subs');
    if (sb) sb.classList.toggle('uxk-on', !!S.subs.enabled);
  }
  let indTimer = null;
  function indicator(text) {
    if (!indicatorEl) return;
    if (!S.speed.overlay && /x$/.test(text)) return;
    indicatorEl.textContent = text;
    indicatorEl.classList.add('uxk-show');
    clearTimeout(indTimer);
    indTimer = setTimeout(() => indicatorEl.classList.remove('uxk-show'), 1100);
    if (toolbar) { toolbar.classList.add('uxk-flash'); setTimeout(() => toolbar && toolbar.classList.remove('uxk-flash'), 1500); }
  }

  function enableSubsDrag() {
    let startY = 0, startBottom = 0, dragging = false, moved = false, hostH = 1, cur = 0;
    subsBox.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false; startY = e.clientY; startBottom = S.subs.bottom; cur = startBottom;
      hostH = (layer.parentNode && layer.parentNode.getBoundingClientRect().height) || 1;
      try { subsBox.setPointerCapture(e.pointerId); } catch (err) {}
    });
    subsBox.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = ((startY - e.clientY) / hostH) * 100;
      if (Math.abs(startY - e.clientY) > 3) moved = true;
      cur = UXK.clamp(Math.round(startBottom + d), 4, 85); // 4% 아래로는 진행바를 가리므로 제한
      layer.style.setProperty('--uxk-sub-bottom', cur + '%');
    });
    const end = (save) => {
      if (!dragging) return;
      dragging = false;
      if (save && moved && cur !== S.subs.bottom) UXK.saveSettings({ subs: { bottom: cur } }).catch(() => {});
      else layer.style.setProperty('--uxk-sub-bottom', S.subs.bottom + '%');
    };
    subsBox.addEventListener('pointerup', () => end(true));
    subsBox.addEventListener('pointercancel', () => end(false));
  }

  // ======================= 속도 =======================
  const speed = {
    intended: 1,
    lastNative: 0,
    reapplies: [],
    beforeReset: 1.5,
    cooldownUntil: 0, // Udemy와 속도 줄다리기가 감지되면 잠시 재적용을 멈추는 시각
    warned: false,
    clampRate(v) { return UXK.clamp(Math.round(v * 100) / 100, Math.max(0.0625, S.speed.min), Math.min(16, S.speed.max)); },
    async load() {
      const map = (await UXK.local.get(UXK.KEYS.speeds, {})) || {};
      let v;
      if (S.speed.remember === 'course') v = ctx.courseId && map[ctx.courseId] != null ? map[ctx.courseId] : S.speed.default;
      else v = map._global != null ? map._global : S.speed.default;
      UXK.log('speed.load', { courseId: ctx.courseId, loaded: v, before: this.intended, userTouched: this.userTouched });
      this.intended = this.clampRate(v);
      if (this.intended !== 1) this.beforeReset = this.intended;
    },
    saveSoon: UXK.debounce(async () => {
      const v = speed.intended;
      try {
        await UXK.local.update(UXK.KEYS.speeds, (m) => {
          m = m || {};
          if (S.speed.remember === 'course' && ctx.courseId) m[ctx.courseId] = v; else m._global = v;
          return m;
        }, {});
      } catch (e) { UXK.log('speed save', e); }
    }, 600),
    set(v, { show = true } = {}) {
      v = this.clampRate(v);
      this.intended = v;
      this.cooldownUntil = 0;
      this.reapplies = [];
      if (ctx.video && Math.abs(ctx.video.playbackRate - v) > 0.001) ctx.video.playbackRate = v;
      if (show) indicator(`${v.toFixed(2).replace(/0$/, '')}x`);
      this.saveSoon();
      updateSpeedLabel();
      updatePill();
    },
    applyNow() {
      const v = ctx.video;
      if (!v || !S.speed.enabled) return;
      if (Math.abs(v.playbackRate - this.intended) > 0.001) v.playbackRate = this.intended;
    },
    onRateChange() {
      const v = ctx.video;
      if (!v) return;
      const r = v.playbackRate;
      UXK.log('ratechange', { r, intended: this.intended, sinceNative: Date.now() - this.lastNative, cooldown: Math.max(0, this.cooldownUntil - Date.now()), reapplies: this.reapplies.length });
      if (Math.abs(r - this.intended) < 0.001) return;
      // 사용자가 Udemy 자체 속도 메뉴/Shift+화살표로 바꾼 경우: 그 값을 채택
      if (Date.now() - this.lastNative < 1500 || !S.speed.enabled) {
        this.lastNative = 0; // 한 번 채택하면 소모 (같은 1.5초 안의 다른 변경까지 채택하지 않게)
        this.intended = this.clampRate(r);
        if (this.intended !== 1) this.beforeReset = this.intended;
        this.saveSoon();
        updateSpeedLabel();
        updatePill();
        return;
      }
      if (!S.speed.enforce) { this.intended = this.clampRate(r); updateSpeedLabel(); return; }
      // Udemy가 강의 전환 등으로 속도를 되돌린 경우: 다시 적용
      const now = Date.now();
      if (now < this.cooldownUntil) return; // 줄다리기 감지 후 대기 중 (사용자 지정 속도는 유지)
      this.reapplies = this.reapplies.filter((t) => now - t < 3000);
      if (this.reapplies.length >= 8) {
        // 무한 반복 방지: 5초 쉬었다가 사용자가 지정한 속도를 다시 적용 (지정 속도를 Udemy 값으로 바꾸지 않음)
        this.cooldownUntil = now + 5000;
        this.reapplies = [];
        if (!this.warned) { this.warned = true; UXK.ui.toast('Udemy가 속도를 계속 되돌리고 있어 5초 뒤 다시 적용합니다.', { timeout: 5000 }); }
        setTimeout(() => this.applyNow(), 5100);
        return;
      }
      this.reapplies.push(now);
      setTimeout(() => this.applyNow(), 30);
    },
  };
  function updateSpeedLabel() {
    if (speedLabel) speedLabel.textContent = `${speed.intended.toFixed(2)}x`;
  }
  function applySpeedSoon() {
    speed.applyNow();
    setTimeout(() => speed.applyNow(), 300);
    setTimeout(() => speed.applyNow(), 1200);
  }

  // ======================= 단축키 =======================
  function parseHotkeys() {
    hotkeys = {};
    Object.entries(S.hotkeys || {}).forEach(([k, v]) => { const h = UXK.parseHotkey(v); if (h) hotkeys[k] = h; });
  }
  const REPEATABLE = new Set(['speedUp', 'speedDown', 'back', 'forward']);
  let deadNotified = false;
  function onKey(e) {
    if (UXK.isTyping(e)) return;
    if (!UXK.alive()) {
      // 확장이 업데이트되어 이 탭의 스크립트가 고아가 됨: Udemy 동작은 건드리지 않고 한 번만 안내
      if (!deadNotified && Object.values(hotkeys).some((hk) => UXK.matchHotkey(e, hk))) { deadNotified = true; UXK.ui.toast(new UXK.DeadError().message, { kind: 'err', timeout: 10000 }); }
      return;
    }
    if (UXK.ui.isModalOpen()) return; // 모달이 열려 있으면 영상 단축키 중지
    if (e.target && e.target.closest && e.target.closest('.uxk-modal-back, .uxk-drawer, .uxk-lib')) return;
    // Udemy 자체 속도 단축키(Shift+←/→) 감지
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) speed.lastNative = Date.now();
    for (const [action, hk] of Object.entries(hotkeys)) {
      if (!UXK.matchHotkey(e, hk)) continue;
      const needsVideo = !['note', 'help', 'next', 'prev', 'theater'].includes(action);
      if (needsVideo && !ctx.video) return;
      if (e.repeat && !REPEATABLE.has(action)) { e.preventDefault(); return; }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      run(action);
      return;
    }
  }
  function onNativeSpeedPointer(e) {
    if (e.target && e.target.closest && e.target.closest('[data-purpose*="playback-rate"]')) speed.lastNative = Date.now();
  }

  async function run(action) {
    const v = ctx.video;
    const step = S.speed.step || 0.25;
    try {
      switch (action) {
        case 'speedUp': speed.set(speed.intended + step); break;
        case 'speedDown': speed.set(speed.intended - step); break;
        case 'speedReset':
          if (Math.abs(speed.intended - 1) > 0.001) { speed.beforeReset = speed.intended; speed.set(1); } else speed.set(speed.beforeReset || 1.5);
          break;
        case 'back': if (v) { v.currentTime = Math.max(0, v.currentTime - S.speed.seekSec); indicator(`◀ ${S.speed.seekSec}초`); } break;
        case 'forward': if (v) { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + S.speed.seekSec); indicator(`${S.speed.seekSec}초 ▶`); } break;
        case 'next': navigate('next'); break;
        case 'prev': navigate('prev'); break;
        case 'pip': await togglePip(); break;
        case 'theater': await UXK.saveSettings({ player: { theater: !S.player.theater } }); indicator(S.player.theater ? '넓게 보기 ON' : '넓게 보기 OFF'); break;
        case 'subs': await UXK.saveSettings({ subs: { enabled: !S.subs.enabled } }); indicator(S.subs.enabled ? '이중 자막 ON' : '이중 자막 OFF'); break;
        case 'replayCue': await replayCue(); break;
        case 'loopCue': await toggleLoopCue(); break;
        case 'abLoop': abLoop(); break;
        case 'shadow': await UXK.saveSettings({ subs: { shadowPause: !S.subs.shadowPause } }); indicator(S.subs.shadowPause ? '따라 말하기 ON (문장마다 멈춤)' : '따라 말하기 OFF'); break;
        case 'saveSentence': await saveSentence(); break;
        case 'copyCue': await copyCue(); break;
        case 'note': await quickNote(); break;
        case 'screenshot': await screenshot(); break;
        case 'help': showHelp(); break;
      }
    } catch (err) {
      if (err && err.stale) return; // 강의 전환으로 취소된 작업
      UXK.ui.toast(String(err && err.message ? err.message : err), { kind: 'err', timeout: 5000 });
    }
  }

  // ======================= 강의 이동 =======================
  function navigate(dir) {
    const sels = dir === 'next'
      ? ['[data-purpose="go-to-next"]', '#go-to-next-item', '[class*="next-and-previous--next"]']
      : ['[data-purpose="go-to-previous"]', '#go-to-previous-item', '[class*="next-and-previous--previous"]'];
    for (const s of sels) {
      const n = document.querySelector(s);
      if (n) {
        (n.closest('a, button') || n).click();
        indicator(dir === 'next' ? '다음 강의 ▶' : '◀ 이전 강의');
        return;
      }
    }
    navByCurriculum(dir);
  }
  async function navByCurriculum(dir) {
    const items = await getCurriculum();
    if (!items) return UXK.ui.toast('이동할 강의를 찾지 못했습니다');
    const list = items.filter((i) => i._class === 'lecture' || i._class === 'quiz');
    const idx = list.findIndex((i) => i.id === ctx.lectureId);
    const target = list[idx + (dir === 'next' ? 1 : -1)];
    if (!target) return UXK.ui.toast(dir === 'next' ? '마지막 강의입니다' : '첫 강의입니다');
    location.assign(`${location.origin}/course/${ctx.slug}/learn/${target._class === 'quiz' ? 'quiz' : 'lecture'}/${target.id}`);
  }

  // ======================= PiP / 캡처 =======================
  async function togglePip() {
    const v = ctx.video;
    if (!v) return;
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
    v.removeAttribute('disablepictureinpicture');
    try { v.disablePictureInPicture = false; } catch (e) {}
    await v.requestPictureInPicture();
  }

  function isMostlyBlack(ctx2d, w, h) {
    const pts = 64;
    let bright = 0;
    for (let i = 0; i < pts; i++) {
      const x = Math.floor(((i % 8) + 0.5) * (w / 8)), y = Math.floor((Math.floor(i / 8) + 0.5) * (h / 8));
      const d = ctx2d.getImageData(x, y, 1, 1).data;
      if (d[0] + d[1] + d[2] > 36) bright++;
    }
    return bright < 2;
  }
  async function frameFromCanvas(v) {
    try {
      if (!v.videoWidth) return null;
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(v, 0, 0, c.width, c.height);
      if (isMostlyBlack(g, c.width, c.height)) return null;
      return await new Promise((r) => c.toBlob(r, 'image/png'));
    } catch (e) { return null; } // DRM/교차 출처로 캔버스가 오염된 경우
  }
  async function cropDataUrl(dataUrl, rect) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const sx = img.width / window.innerWidth;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(rect.width * sx));
    c.height = Math.max(1, Math.round(rect.height * sx));
    c.getContext('2d').drawImage(img, rect.left * sx, rect.top * sx, rect.width * sx, rect.height * sx, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
  async function screenshot(dataUrlFromCommand) {
    const v = ctx.video;
    if (!v) return;
    let blob = null;
    if (dataUrlFromCommand) blob = await cropDataUrl(dataUrlFromCommand, v.getBoundingClientRect());
    if (!blob) blob = await frameFromCanvas(v);
    if (!blob) {
      const res = await UXK.bg({ type: 'capture' });
      if (res && res.ok) blob = await cropDataUrl(res.dataUrl, v.getBoundingClientRect());
    }
    if (!blob) {
      UXK.ui.toast('캡처 실패: 보호된 영상이거나 권한이 없습니다. 확장 단축키 Alt+Shift+S로 다시 시도하세요.', { kind: 'err', timeout: 7000 });
      return;
    }
    const name = `${UXK.safeFile(lectureTitle())}_${UXK.fmtClock(v.currentTime).replace(/:/g, '-')}.png`;
    let copied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } catch (e) {}
    UXK.ui.toast(copied ? '캡처를 클립보드에 복사했습니다' : '캡처 완료', {
      timeout: 6000,
      actions: [{ label: '파일로 저장', onClick: () => UXK.download(name, blob) }],
    });
  }

  // ======================= 자막 (이중 자막 / 문장 기능) =======================
  const subs = { key: null, captions: [], primary: null, second: [], secondInfo: null, idx: -1, loading: null, loadingKey: null, loop: null, ab: { a: null, b: null }, shadowDone: -1 };
  const mtCache = new Map();
  const locOf = (c) => String(c.locale_id || (c.locale && (c.locale.locale || c.locale)) || c.language || c.srclang || '').replace('-', '_');
  const bySource = (arr) => arr.slice().sort((a, b) => (a.source === 'auto') - (b.source === 'auto'));
  async function courseLang() { const c = await courseFromCache(); return c ? c.langCode : ''; }

  async function choosePrimary(caps) {
    if (!caps.length) return null;
    const pref = String(S.subs.primaryLang || 'auto').toLowerCase();
    const orig = caps.filter((c) => !c.is_translation);
    const pool = orig.length ? orig : caps;
    if (pref !== 'auto') {
      const m = bySource(caps.filter((c) => locOf(c).toLowerCase().startsWith(pref)));
      if (m.length) return m[0];
    }
    const lc = await courseLang();
    if (lc) {
      const m = bySource(pool.filter((c) => locOf(c).toLowerCase().startsWith(lc)));
      if (m.length) return m[0];
    }
    return bySource(pool)[0];
  }
  function chooseSecondary(caps, primary) {
    const pref = String(S.subs.secondaryLang || 'none').toLowerCase();
    if (pref === 'none') return null;
    if (locOf(primary).toLowerCase().startsWith(pref)) return null;
    return bySource(caps.filter((c) => c !== primary && locOf(c).toLowerCase().startsWith(pref)))[0] || null;
  }

  async function fetchCaption(url) {
    try {
      const sameOrigin = url.startsWith(location.origin);
      const r = await fetch(url, { credentials: sameOrigin ? 'include' : 'omit' });
      if (r.ok) {
        const t = await r.text();
        if (/WEBVTT|-->/.test(t)) return t;
      }
    } catch (e) { /* CORS 등 → background로 재시도 */ }
    const res = await UXK.bg({ type: 'fetchText', url });
    if (res && res.ok && /WEBVTT|-->/.test(res.text)) return res.text;
    throw new Error('자막 파일을 가져오지 못했습니다' + (res && res.error ? ` (${res.error})` : ''));
  }

  async function translateCues(cues, tl, lectureId) {
    const key = `${lectureId}:${tl}`;
    if (mtCache.has(key)) return mtCache.get(key);
    const res = await UXK.bg({ type: 'translate', texts: cues.map((c) => c.text.replace(/\n/g, ' ')), tl });
    if (!res || !res.ok) throw new Error('기계번역 실패: ' + ((res && res.error) || '알 수 없음'));
    mtCache.set(key, res.texts);
    if (mtCache.size > 30) mtCache.delete(mtCache.keys().next().value);
    return res.texts;
  }

  function applyNativeCc() {
    // 우리 자막이 실제로 로드된 뒤에만 Udemy 기본 자막을 숨김
    document.documentElement.classList.toggle('uxk-hide-native-cc', !!(S && S.subs.enabled && S.subs.hideNative && subs.primary));
  }
  function resetSubs() {
    subs.key = null; subs.primary = null; subs.second = []; subs.secondInfo = null; subs.captions = []; subs.idx = -1; subs.loop = null; subs.ab = { a: null, b: null }; subs.shadowDone = -1;
    if (sub1) { sub1.textContent = ''; sub2.textContent = ''; }
    if (subsBox) subsBox.dataset.i = '';
    applyNativeCc();
  }
  const staleError = () => { const e = new Error('강의가 바뀌어 취소됨'); e.stale = true; return e; };

  async function ensureCues({ quiet = false } = {}) {
    if (ctx.lectureType !== 'lecture' || !ctx.lectureId) throw new Error('영상 강의에서만 사용할 수 있습니다');
    if (!ctx.courseId) throw new Error('강의 정보를 아직 찾지 못했습니다. 잠시 후 다시 시도하세요');
    // 시작 시점의 강의를 고정 (도중에 강의가 바뀌어도 다른 강의 데이터와 섞이지 않게)
    const courseId = ctx.courseId, lectureId = ctx.lectureId;
    const key = `${courseId}:${lectureId}`;
    if (subs.key === key && subs.primary) return subs;
    if (subs.loading && subs.loadingKey === key) return subs.loading;
    subs.loadingKey = key;
    const t0 = quiet ? null : UXK.ui.toast('자막 불러오는 중...', { id: 'uxk-subs-load', timeout: 0 });
    const mine = (async () => {
      const j = await UXK.api.lecture(courseId, lectureId);
      const caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c && c.url);
      if (subs.loadingKey !== key) throw staleError();
      subs.captions = caps;
      const p = await choosePrimary(caps);
      if (!p) { const err = new Error('이 강의에는 자막이 없습니다'); err.noCaps = true; throw err; }
      let pText;
      try { pText = await fetchCaption(p.url); } catch (e) {
        // 서명 URL 만료 가능성 → 한 번 새로 받기
        const j2 = await UXK.api.lecture(courseId, lectureId);
        const p2 = ((j2 && j2.asset && j2.asset.captions) || []).find((c) => c.url && locOf(c) === locOf(p));
        if (!p2) throw e;
        pText = await fetchCaption(p2.url);
      }
      const primary = { cap: p, cues: UXK.vtt.parse(pText) };
      let second = [], secondInfo = null;
      const sCap = chooseSecondary(caps, p);
      if (sCap) {
        try {
          second = UXK.vtt.align(primary.cues, UXK.vtt.parse(await fetchCaption(sCap.url)));
          secondInfo = { kind: 'udemy', label: sCap.video_label || locOf(sCap) };
        } catch (e) { second = []; }
      }
      const tl = S.subs.secondaryLang;
      if (!second.length && S.subs.translate && tl !== 'none' && !locOf(p).toLowerCase().startsWith(tl)) {
        try {
          second = await translateCues(primary.cues, tl, lectureId);
          secondInfo = { kind: 'mt', label: `기계번역(${tl})` };
        } catch (e) { if (!quiet) UXK.ui.toast(e.message, { kind: 'err', timeout: 6000 }); }
      }
      if (subs.loadingKey !== key) throw staleError();
      Object.assign(subs, { key, primary, second, secondInfo, idx: -1, shadowDone: -1 });
      return subs;
    })();
    subs.loading = mine;
    try {
      const r = await mine;
      applyNativeCc();
      if (t0) {
        const s2 = subs.secondInfo ? ` + ${subs.secondInfo.label}` : (S.subs.secondaryLang !== 'none' ? ' (보조 자막 없음)' : '');
        t0.update(`자막: ${subs.primary.cap.video_label || locOf(subs.primary.cap)}${s2} · ${subs.primary.cues.length}문장`, { timeout: 2500 });
      }
      return r;
    } catch (e) {
      if (t0) t0.close();
      throw e;
    } finally {
      if (subs.loading === mine) subs.loading = null;
    }
  }

  function currentCueIndex(allowPrev = true) {
    if (!subs.primary || !ctx.video) return -1;
    const t = ctx.video.currentTime;
    let i = UXK.vtt.find(subs.primary.cues, t, subs.idx);
    if (i < 0 && allowPrev) i = UXK.vtt.prevIndex(subs.primary.cues, t);
    return i;
  }

  function renderSubs() {
    if (!subsBox) return;
    if (!S.subs.enabled || !subs.primary || !ctx.video) { if (subsBox.dataset.i !== '-2') { sub1.textContent = ''; sub2.textContent = ''; subsBox.dataset.i = '-2'; subsBox.classList.add('uxk-empty'); } return; }
    const cues = subs.primary.cues;
    const i = UXK.vtt.find(cues, ctx.video.currentTime, subs.idx);
    if (String(i) === subsBox.dataset.i) return;
    subs.idx = i;
    subsBox.dataset.i = String(i);
    sub1.textContent = i >= 0 && S.subs.showPrimary ? cues[i].text : '';
    sub2.textContent = i >= 0 && S.subs.showSecondary ? subs.second[i] || '' : '';
    subsBox.classList.toggle('uxk-empty', !(sub1.textContent || sub2.textContent));
  }

  let lastT = 0;
  function tick() {
    const v = ctx.video;
    if (!v) return;
    const t = v.currentTime;
    if (subs.ab.a != null && subs.ab.b != null && t >= subs.ab.b) v.currentTime = subs.ab.a;
    else if (subs.loop && (t >= subs.loop.end || t < subs.loop.start - 0.5)) v.currentTime = subs.loop.start;
    if (S.subs.shadowPause && subs.primary && !v.paused && t >= lastT && t - lastT < 2) {
      // 직전 시각이 속한 문장의 끝(−0.08초)을 지났는지로 판정 → rAF가 멈추는 PiP·백그라운드·고배속에서도 놓치지 않음
      const cues = subs.primary.cues;
      const i = UXK.vtt.find(cues, lastT, subs.idx);
      if (i >= 0 && t >= cues[i].end - 0.08 && subs.shadowDone !== i) {
        subs.shadowDone = i;
        v.pause();
        if (t > cues[i].end + 0.15) v.currentTime = Math.max(cues[i].start, cues[i].end - 0.05);
        indicator('따라 말해 보세요 · Space로 계속');
      }
    }
    lastT = v.currentTime;
    renderSubs();
  }
  let rafOn = false;
  function rafLoop() {
    if (!ctx.video || ctx.video.paused || document.hidden) { rafOn = false; return; }
    tick();
    requestAnimationFrame(rafLoop);
  }
  function startRaf() { if (!rafOn) { rafOn = true; requestAnimationFrame(rafLoop); } }

  const noCapsNotified = new Set();
  const needCues = (s) => !!(s && (s.subs.enabled || s.subs.shadowPause));
  // 이중 자막 표시 또는 따라 말하기에 필요한 자막을 준비
  async function startSubs() {
    if (!needCues(S)) return;
    applyLayerStyle();
    if (ctx.lectureType !== 'lecture' || !ctx.courseId) return; // 코스 ID 확인 후 다시 호출됨
    try {
      await ensureCues({ quiet: !S.subs.enabled });
      renderSubs();
    } catch (e) {
      if (e.stale) return;
      if (e.noCaps) {
        if (noCapsNotified.has(ctx.courseId)) return;
        noCapsNotified.add(ctx.courseId);
      }
      UXK.ui.toast(e.message, { kind: 'err', timeout: 4000 });
    }
  }

  async function replayCue() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    subs.shadowDone = -1;
    ctx.video.currentTime = c.start + 0.01;
    ctx.video.play().catch(() => {});
    indicator('↺ 문장 다시 듣기');
  }
  async function toggleLoopCue() {
    if (subs.loop) { subs.loop = null; indicator('문장 반복 OFF'); return; }
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    subs.loop = { start: c.start, end: c.end };
    subs.ab = { a: null, b: null };
    indicator('문장 반복 ON');
    ctx.video.play().catch(() => {});
  }
  function abLoop() {
    const t = ctx.video.currentTime;
    if (subs.ab.a == null) { subs.ab = { a: t, b: null }; subs.loop = null; indicator(`A 지점 ${UXK.fmtClock(t)}`); }
    else if (subs.ab.b == null) {
      let a = subs.ab.a, b = t;
      if (b < a) [a, b] = [b, a];
      if (b - a < 0.5) b = a + 0.5;
      subs.ab = { a, b };
      ctx.video.currentTime = a;
      indicator(`A-B 반복 ${UXK.fmtClock(a)}–${UXK.fmtClock(b)}`);
    } else { subs.ab = { a: null, b: null }; indicator('A-B 반복 해제'); }
  }
  async function copyCue() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const text = subs.primary.cues[i].text + (subs.second[i] ? '\n' + subs.second[i] : '');
    indicator((await UXK.copyText(text)) ? '문장 복사됨' : '복사 실패');
  }
  async function saveSentence() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      courseId: ctx.courseId, courseTitle: courseTitle(), lectureId: ctx.lectureId, lectureTitle: lectureTitle(),
      t: Math.floor(c.start), text: c.text.replace(/\n/g, ' '), trans: (subs.second[i] || '').replace(/\n/g, ' '),
      lang: locOf(subs.primary.cap), url: lectureUrl(ctx.lectureId, c.start), created: new Date().toISOString(),
    };
    const list = await UXK.local.update(UXK.KEYS.sentences, (arr) => {
      arr = Array.isArray(arr) ? arr : [];
      if (!arr.some((x) => x.lectureId === entry.lectureId && x.t === entry.t)) arr.push(entry);
      if (arr.length > 5000) arr = arr.slice(-5000);
      return arr;
    }, []);
    indicator(`문장 저장됨 (총 ${list.length})`);
  }

  // 자막 메뉴: 언어 선택, 켜기/끄기, 내보내기
  async function openSubsMenu() {
    const wrap = el('div', { class: 'uxk-menu-body' });
    const onoff = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: S.subs.enabled }), ' 이중 자막 표시']);
    wrap.appendChild(onoff);
    let caps = subs.captions;
    if (!caps.length && ctx.lectureType === 'lecture' && ctx.courseId) {
      try { const j = await UXK.api.lecture(ctx.courseId, ctx.lectureId); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); subs.captions = caps; } catch (e) {}
    }
    const langs = Array.from(new Map(caps.map((c) => [locOf(c).slice(0, 2).toLowerCase(), c.video_label || locOf(c)])).entries());
    const mk = (label, cur, includeAuto, includeNone) => {
      const s = el('select', { class: 'uxk-input' });
      if (includeAuto) s.appendChild(el('option', { value: 'auto', text: '자동 (강의 원어)' }));
      if (includeNone) s.appendChild(el('option', { value: 'none', text: '사용 안 함' }));
      langs.forEach(([code, lab]) => s.appendChild(el('option', { value: code, text: `${lab} (${code})` })));
      if (![...s.options].some((o) => o.value === cur)) s.appendChild(el('option', { value: cur, text: `${cur} (이 강의엔 없음)` }));
      s.value = cur;
      return el('label', { class: 'uxk-field' }, [el('span', { text: label }), s]);
    };
    const pSel = mk('원문 자막', S.subs.primaryLang, true, false);
    const sSel = mk('보조 자막', S.subs.secondaryLang, false, true);
    wrap.append(pSel, sSel);
    wrap.appendChild(el('div', { class: 'uxk-hint', text: caps.length ? `이 강의 자막 ${caps.length}종: ${caps.map((c) => c.video_label || locOf(c)).join(', ')}` : '이 강의의 자막 목록을 가져오지 못했습니다.' }));
    const mt = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: S.subs.translate }), ' 보조 자막이 없으면 기계번역 (옵션에서 권한 허용 필요)']);
    const shadow = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: S.subs.shadowPause }), ' 따라 말하기: 문장마다 일시정지']);
    wrap.append(mt, shadow);
    const exp = el('div', { class: 'uxk-row' }, [
      el('button', { class: 'uxk-btn', text: '이 강의 자막 내보내기', onclick: () => exportLecture().catch((e) => { if (!e.stale) UXK.ui.toast(e.message, { kind: 'err' }); }) }),
      el('button', { class: 'uxk-btn', text: '코스 전체 자막 (Markdown)', onclick: () => exportCourseTranscript() }),
    ]);
    wrap.appendChild(exp);
    const ok = await UXK.ui.modal({ title: '자막', body: wrap, width: 520, buttons: [{ label: '닫기', value: false }, { label: '적용', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const next = {
      enabled: onoff.querySelector('input').checked,
      primaryLang: pSel.querySelector('select').value,
      secondaryLang: sSel.querySelector('select').value,
      translate: mt.querySelector('input').checked,
      shadowPause: shadow.querySelector('input').checked,
    };
    if (next.translate && !S.subs.translate) {
      const perm = await UXK.bg({ type: 'hasTranslatePermission' });
      if (!perm || !perm.ok || !perm.has) {
        next.translate = false;
        UXK.ui.toast('기계번역은 설정 페이지에서 켜야 사이트 접근 권한을 허용할 수 있습니다.', { timeout: 8000, actions: [{ label: '설정 열기', onClick: () => UXK.bg({ type: 'openOptions', hash: 'subs' }) }] });
      }
    }
    const langChanged = next.primaryLang !== S.subs.primaryLang || next.secondaryLang !== S.subs.secondaryLang || next.translate !== S.subs.translate;
    await UXK.saveSettings({ subs: next });
    if (langChanged) resetSubs();
    if (needCues(S)) startSubs();
  }

  async function exportLecture() {
    await ensureCues();
    const cues = subs.primary.cues;
    const second = subs.second.length ? subs.second : null;
    const base = UXK.safeFile(`${courseTitle()} - ${lectureTitle()}`);
    const wrap = el('div', { class: 'uxk-menu-body' }, [el('div', { class: 'uxk-hint', text: `${cues.length}문장 · 원문 ${subs.primary.cap.video_label || locOf(subs.primary.cap)}${subs.secondInfo ? ' · 보조 ' + subs.secondInfo.label : ''}` })]);
    const act = (label, fn) => el('button', { class: 'uxk-btn', text: label, onclick: fn });
    wrap.appendChild(el('div', { class: 'uxk-row uxk-wrap' }, [
      act('클립보드 복사 (원문)', async () => UXK.ui.toast((await UXK.copyText(UXK.vtt.toText(cues))) ? '복사됨' : '복사 실패')),
      act('TXT 원문', () => UXK.download(base + '.txt', UXK.vtt.toText(cues))),
      second && act('TXT 이중', () => UXK.download(base + '.bilingual.txt', UXK.vtt.toText(cues, second))),
      act('SRT 원문', () => UXK.download(base + '.srt', UXK.vtt.toSRT(cues))),
      second && act('SRT 이중', () => UXK.download(base + '.bilingual.srt', UXK.vtt.toSRT(cues, second))),
      act('Markdown (타임스탬프 링크)', () => UXK.download(base + '.md', `# ${lectureTitle()}\n\n${UXK.vtt.toMarkdown(cues, second, (t) => lectureUrl(ctx.lectureId, t))}\n`, 'text/markdown;charset=utf-8')),
    ]));
    await UXK.ui.modal({ title: '이 강의 자막 내보내기', body: wrap, width: 560, buttons: [{ label: '닫기', value: true }] });
  }

  let exportAbort = null;
  async function exportCourseTranscript() {
    if (!ctx.courseId) return UXK.ui.toast('강의 정보를 찾지 못했습니다', { kind: 'err' });
    if (exportAbort) return UXK.ui.toast('이미 내보내는 중입니다');
    const ok = await UXK.ui.confirm('코스 전체 자막 내보내기', '모든 영상 강의의 자막을 순서대로 받아 Markdown 한 파일로 저장합니다.\n요청 간격을 두고 진행하므로 강의 수에 따라 몇 분 걸릴 수 있습니다. 개인 학습용으로만 사용하세요.', { okLabel: '시작' });
    if (!ok) return;
    exportAbort = { stop: false };
    const prog = UXK.ui.toast('커리큘럼 불러오는 중...', { id: 'uxk-course-export', timeout: 0, actions: [{ label: '중지', close: false, onClick: () => { exportAbort.stop = true; } }] });
    try {
      const items = await UXK.api.curriculum(ctx.courseId, { withCaptions: true });
      const lectures = items.filter((i) => i._class === 'lecture' && i.asset && /video/i.test(i.asset.asset_type || ''));
      const out = [`# ${courseTitle()}`, '', `> 자막 원문 · 내보낸 날짜 ${UXK.today()} · 개인 학습용`, ''];
      let chapterTitle = null, done = 0, missing = 0, failedN = 0;
      const chapterOf = new Map();
      let ch = null;
      items.forEach((i) => { if (i._class === 'chapter') ch = i.title; else chapterOf.set(i.id, ch); });
      for (const lec of lectures) {
        if (exportAbort.stop) break;
        const chT = chapterOf.get(lec.id);
        if (chT && chT !== chapterTitle) { chapterTitle = chT; out.push(`## ${chT}`, ''); }
        out.push(`### ${lec.title}`, '', `[강의로 이동](${lectureUrl(lec.id)})`, '');
        let caps = ((lec.asset && lec.asset.captions) || []).filter((c) => c.url);
        if (!caps.length) {
          try { const j = await UXK.api.lecture(ctx.courseId, lec.id); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); } catch (e) {}
          await UXK.sleep(500);
        }
        const p = await choosePrimary(caps);
        if (!p) { out.push('_자막 없음_', ''); missing++; }
        else {
          try { out.push(UXK.vtt.toText(UXK.vtt.parse(await fetchCaption(p.url))), ''); } catch (e) { out.push('_자막을 가져오지 못함_', ''); failedN++; }
        }
        done++;
        prog.update(`코스 자막 내보내는 중... ${done} / ${lectures.length}`, { timeout: 0 });
        await UXK.sleep(300 + Math.random() * 300);
      }
      UXK.download(`${UXK.safeFile(courseTitle())}_transcript.md`, out.join('\n'), 'text/markdown;charset=utf-8');
      prog.update(`${exportAbort.stop ? '중지됨 · ' : ''}강의 ${done}개 저장${missing ? ` · 자막 없음 ${missing}` : ''}${failedN ? ` · 가져오기 실패 ${failedN}` : ''}`, { timeout: 7000, actions: [] });
    } catch (e) {
      prog.update('코스 자막 내보내기 실패: ' + e.message, { timeout: 7000, actions: [], kind: 'err' });
    } finally {
      exportAbort = null;
    }
  }

  // ======================= 커리큘럼 / 남은 시간 =======================
  const cur = { courseId: null, items: null, loading: null };
  async function getCurriculum(force = false) {
    if (!ctx.courseId) return null;
    if (!force && cur.items && cur.courseId === ctx.courseId) return cur.items;
    if (cur.loading) return cur.loading;
    cur.loading = (async () => {
      const key = UXK.KEYS.curriculum(ctx.courseId);
      const cached = await UXK.local.get(key);
      if (!force && cached && Date.now() - cached.t < 24 * 3600e3) { cur.items = cached.items; cur.courseId = ctx.courseId; return cur.items; }
      try {
        const raw = await UXK.api.curriculum(ctx.courseId, { withCaptions: false });
        const items = raw.map((i) => ({ _class: i._class, id: i.id, title: i.title, type: i.type || null, sec: (i.asset && i.asset.time_estimation) || 0, atype: (i.asset && i.asset.asset_type) || null }));
        await UXK.local.set(key, { t: Date.now(), items });
        cur.items = items; cur.courseId = ctx.courseId;
        return items;
      } catch (e) {
        if (cached) { cur.items = cached.items; cur.courseId = ctx.courseId; return cur.items; }
        return null;
      }
    })();
    try { return await cur.loading; } finally { cur.loading = null; }
  }

  let remaining = null;
  async function computeRemaining() {
    const items = await getCurriculum();
    if (!items) return null;
    const prog = await UXK.api.progress(ctx.courseId);
    const done = new Set((prog && prog.completed_lecture_ids) || []);
    const chapters = [];
    let ch = { title: '(섹션 없음)', total: 0, remain: 0, n: 0, done: 0 };
    let pushed = false;
    for (const it of items) {
      if (it._class === 'chapter') { ch = { title: it.title, total: 0, remain: 0, n: 0, done: 0 }; chapters.push(ch); pushed = true; continue; }
      if (it._class !== 'lecture') continue;
      if (!pushed) { chapters.push(ch); pushed = true; }
      ch.total += it.sec; ch.n++;
      if (done.has(it.id)) ch.done++; else ch.remain += it.sec;
    }
    let total = chapters.reduce((s, c) => s + c.total, 0);
    let remain = chapters.reduce((s, c) => s + c.remain, 0);
    const n = chapters.reduce((s, c) => s + c.n, 0), nDone = chapters.reduce((s, c) => s + c.done, 0);
    let exact = !!prog;
    if (!prog) {
      const c = await courseFromCache();
      if (c) remain = total * (1 - Math.min(100, c.progress) / 100);
    }
    remaining = { total, remain, chapters, exact, n, nDone };
    return remaining;
  }
  let pill = null;
  function updatePill() {
    if (!S || !S.player.remaining || !remaining || !layer) { if (pill) pill.style.display = 'none'; return; }
    if (!pill) {
      pill = el('button', { class: 'uxk-pill', title: '섹션별 남은 시간 보기' });
      pill.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showRemainingDetail(); });
      ['pointerdown', 'mousedown', 'mouseup', 'dblclick'].forEach((ev) => pill.addEventListener(ev, (e) => e.stopPropagation()));
    }
    if (pill.parentNode !== layer) layer.appendChild(pill);
    pill.style.display = '';
    const r = remaining;
    const rate = speed.intended || 1;
    const sp = Math.abs(rate - 1) > 0.01 ? ` (${rate}x → ${UXK.fmtDur(r.remain / rate)})` : '';
    pill.textContent = `남은 ${UXK.fmtDur(r.remain)}${sp}${r.exact ? ` · 완료 ${r.nDone}/${r.n}강` : ' · 진행률 기준 추정'}`;
  }
  const refreshRemaining = UXK.debounce(async () => { try { await computeRemaining(); updatePill(); updateSectionLabels(); } catch (e) { UXK.log('remaining', e); } }, 1500);
  async function showRemainingDetail() {
    if (!remaining) return;
    const rate = speed.intended || 1;
    const rows = remaining.chapters.map((c, i) => `<tr><td>${i + 1}. ${esc(c.title)}</td><td class="uxk-n">${c.done}/${c.n}</td><td class="uxk-n">${UXK.fmtDur(c.total)}</td><td class="uxk-n">${c.remain ? UXK.fmtDur(c.remain) : '완료'}</td><td class="uxk-n">${c.remain ? UXK.fmtDur(c.remain / rate) : '-'}</td></tr>`).join('');
    await UXK.ui.modal({
      title: '섹션별 남은 시간',
      width: 640,
      body: `<div class="uxk-hint">총 ${UXK.fmtDur(remaining.total)} · 남은 ${UXK.fmtDur(remaining.remain)} · 현재 ${rate}x 기준 ${UXK.fmtDur(remaining.remain / rate)}${remaining.exact ? '' : ' · 진행 기록 API를 쓰지 못해 전체 진행률로 추정'}</div>
        <div class="uxk-scroll"><table class="uxk-table"><thead><tr><th>섹션</th><th>완료</th><th>전체</th><th>남은</th><th>${rate}x</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      buttons: [{ label: '닫기', value: true }],
    });
  }
  function updateSectionLabels() {
    if (!remaining || !S.player.remaining) return;
    const panels = $$('div[data-purpose^="section-panel-"]');
    const chs = remaining.chapters.filter((c) => c.n > 0 || c.title !== '(섹션 없음)');
    if (!panels.length || panels.length !== chs.length) return; // 개수가 다르면 잘못 표시될 수 있어 생략
    panels.forEach((p, i) => {
      const c = chs[i];
      const title = p.querySelector('.ud-accordion-panel-title, [data-purpose="section-heading"], h3, button');
      if (!title) return;
      let lab = title.querySelector('.uxk-sec-remain');
      if (!lab) { lab = el('span', { class: 'uxk-sec-remain' }); title.appendChild(lab); }
      const txt = c.remain ? `남은 ${UXK.fmtDur(c.remain)}` : '완료';
      if (lab.textContent !== txt) lab.textContent = txt;
    });
  }

  // ======================= 섹션 전체 완료/해제 =======================
  function injectSectionToggles() {
    if (!S.player.sectionToggles) { $$('.uxk-sec-tools').forEach((n) => n.remove()); return; }
    $$('div[data-purpose^="section-panel-"]').forEach((panel) => {
      const boxes = panel.querySelectorAll('input[type="checkbox"]');
      const bar = panel.querySelector('.uxk-sec-tools');
      if (!boxes.length) { if (bar) bar.remove(); return; }
      if (bar) return;
      const mk = (label, check) => {
        const b = el('button', { class: 'uxk-sec-btn', text: label });
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSection(panel, check); });
        return b;
      };
      const tools = el('div', { class: 'uxk-sec-tools' }, [mk('✓ 섹션 전체 완료', true), mk('↺ 전체 미완료', false)]);
      const group = panel.querySelector('[role="group"]') || panel;
      group.insertBefore(tools, group.firstChild);
    });
  }
  async function toggleSection(panel, check) {
    const pending = () => $$('input[type="checkbox"]', panel).filter((b) => b.checked !== check);
    const first = pending();
    if (!first.length) return UXK.ui.toast('바꿀 강의가 없습니다');
    const ok = await UXK.ui.confirm(check ? '섹션 전체 완료 표시' : '섹션 전체 미완료로 되돌리기', `이 섹션의 강의 ${first.length}개를 ${check ? '완료' : '미완료'}로 표시합니다.\nUdemy 화면의 체크박스를 차례로 누르는 방식입니다.`, { okLabel: '진행' });
    if (!ok) return;
    for (let pass = 0; pass < 3; pass++) {
      const list = pending();
      if (!list.length) break;
      for (const b of list) { b.click(); await UXK.sleep(350); }
      await UXK.sleep(900);
    }
    const left = pending().length;
    UXK.ui.toast(left ? `${left}개는 바뀌지 않았습니다. 다시 시도하세요.` : `이 섹션 강의 ${first.length}개를 ${check ? '완료' : '미완료'}로 표시했습니다`, { kind: left ? 'err' : '' });
    refreshRemaining();
  }

  // ======================= 메모 (로컬, 타임스탬프) =======================
  async function getNotes() { const all = await UXK.local.get(UXK.KEYS.notes, {}); return (all && all[ctx.courseId]) || []; }
  function addNote(note) {
    const cid = ctx.courseId;
    return UXK.local.update(UXK.KEYS.notes, (all) => { all = all || {}; all[cid] = (all[cid] || []).concat(note); return all; }, {});
  }
  function deleteNote(id) {
    const cid = ctx.courseId;
    return UXK.local.update(UXK.KEYS.notes, (all) => {
      all = all || {};
      const left = (all[cid] || []).filter((n) => n.id !== id);
      if (left.length) all[cid] = left; else delete all[cid];
      return all;
    }, {});
  }
  async function quickNote() {
    if (!ctx.courseId) throw new Error('강의 정보를 찾지 못했습니다');
    const v = ctx.video;
    const t = v ? v.currentTime : 0;
    const wasPlaying = v && !v.paused;
    if (wasPlaying && S.player.notePause) v.pause();
    const text = await UXK.ui.prompt(`메모 · ${lectureTitle()} · ${UXK.fmtClock(t)}`, { multiline: true, placeholder: '내용 입력 · Ctrl+Enter 저장', hint: 'Udemy에 저장되지 않고 이 브라우저에만 저장됩니다. 노트 목록에서 Markdown으로 내보낼 수 있습니다.' });
    if (text && text.trim()) {
      const note = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), lectureId: ctx.lectureId, lectureTitle: lectureTitle(), t: Math.floor(t), text: text.trim(), created: new Date().toISOString() };
      try {
        await addNote(note);
        UXK.ui.toast('메모 저장됨', { actions: [{ label: '노트 보기', onClick: openNotes }] });
        if (notesDrawer && notesDrawer.isOpen()) renderNotes();
      } catch (err) {
        // 저장 실패 시 입력 내용을 잃지 않도록 클립보드에 보존
        await UXK.copyText(text);
        UXK.ui.toast(`${err.message} 입력한 메모는 클립보드에 복사했습니다.`, { kind: 'err', timeout: 12000 });
      }
    }
    if (wasPlaying && S.player.notePause && v) v.play().catch(() => {});
  }
  let notesDrawer = null;
  async function openNotes() {
    notesDrawer = UXK.ui.drawer('notes', { title: '내 메모 (이 코스)', width: 440 });
    if (!notesDrawer.tools.childElementCount) {
      notesDrawer.tools.append(
        el('button', { class: 'uxk-btn', text: 'Markdown 복사', onclick: async () => UXK.ui.toast((await UXK.copyText(await notesMarkdown())) ? '복사됨' : '복사 실패') }),
        el('button', { class: 'uxk-btn', text: '.md 저장', onclick: async () => UXK.download(`${UXK.safeFile(courseTitle())}_notes.md`, await notesMarkdown(), 'text/markdown;charset=utf-8') }),
      );
      notesDrawer.body.addEventListener('click', onNotesClick);
    }
    notesDrawer.open();
    renderNotes();
  }
  async function sortedNotes() {
    const list = await getNotes();
    const items = (await getCurriculum()) || [];
    const order = new Map(items.map((x, i) => [x.id, i]));
    return list.slice().sort((a, b) => ((order.get(a.lectureId) ?? 1e9) - (order.get(b.lectureId) ?? 1e9)) || a.t - b.t);
  }
  async function renderNotes() {
    if (!notesDrawer) return;
    const list = await sortedNotes();
    if (!list.length) { notesDrawer.body.innerHTML = `<div class="uxk-hint">아직 메모가 없습니다. 영상에서 ${esc(S.hotkeys.note)}를 누르면 현재 시각과 함께 메모합니다.</div>`; return; }
    let last = null;
    notesDrawer.body.innerHTML = list.map((n) => {
      const head = n.lectureId !== last ? `<div class="uxk-note-lec">${esc(n.lectureTitle)}</div>` : '';
      last = n.lectureId;
      return `${head}<div class="uxk-note" data-id="${esc(n.id)}"><button class="uxk-note-t" data-go="${Number(n.lectureId) || 0}:${Number(n.t) || 0}">${UXK.fmtClock(Number(n.t) || 0)}</button><div class="uxk-note-x">${esc(n.text).replace(/\n/g, '<br>')}</div><button class="uxk-icon" data-del="${esc(n.id)}" title="삭제">×</button></div>`;
    }).join('');
  }
  async function onNotesClick(e) {
    const go = e.target.closest('[data-go]');
    if (go) {
      const [lid, t] = go.getAttribute('data-go').split(':').map(Number);
      if (lid === ctx.lectureId && ctx.video) { ctx.video.currentTime = t; ctx.video.play().catch(() => {}); }
      else location.assign(lectureUrl(lid, t));
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.getAttribute('data-del');
      try { await deleteNote(id); } catch (err) { UXK.ui.toast(err.message, { kind: 'err', timeout: 8000 }); }
      renderNotes();
    }
  }
  async function notesMarkdown() {
    const list = await sortedNotes();
    const out = [`# ${courseTitle()} — 메모`, ''];
    let last = null;
    list.forEach((n) => {
      if (n.lectureId !== last) { out.push('', `## ${n.lectureTitle}`, ''); last = n.lectureId; }
      out.push(`- [${UXK.fmtClock(n.t)}](${lectureUrl(n.lectureId, n.t)}) ${n.text.replace(/\n/g, '  \n  ')}`);
    });
    return out.join('\n') + '\n';
  }

  function deepLinkSeek() {
    const p = new URLSearchParams(location.search);
    const t = parseFloat(p.get('uxk_t'));
    if (!Number.isFinite(t) || !ctx.video) return;
    const v = ctx.video;
    const go = () => { v.currentTime = t; indicator(`${UXK.fmtClock(t)}로 이동`); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    p.delete('uxk_t');
    const qs = p.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  // ======================= 더 보기 메뉴 / 도움말 =======================
  async function openMoreMenu() {
    const wrap = el('div', { class: 'uxk-menu-body' });
    const act = (label, fn) => el('button', { class: 'uxk-btn uxk-menu-item', text: label, onclick: () => { close(); fn(); } });
    let close = () => {};
    const tabsHint = el('div', { class: 'uxk-hint', text: `현재 속도 ${speed.intended}x · 단축키 도움말: ${S.hotkeys.help}` });
    wrap.append(
      tabsHint,
      act('내 메모 보기 / 내보내기', openNotes),
      act('섹션별 남은 시간', async () => { await computeRemaining(); updatePill(); showRemainingDetail(); }),
      act('이 강의 자막 내보내기', () => exportLecture().catch((e) => UXK.ui.toast(e.message, { kind: 'err' }))),
      act('코스 전체 자막 Markdown', exportCourseTranscript),
      act(`넓게 보기 ${S.player.theater ? '끄기' : '켜기'}`, () => run('theater')),
      act('단축키 도움말', showHelp),
      act('설정 열기 (문장 수집함 · 학습 기록)', () => UXK.bg({ type: 'openOptions' })),
    );
    UXK.ui.modal({ title: 'Udemy Toolkit', body: wrap, width: 380, buttons: [{ label: '닫기', value: true }], onOpen: (c, finish) => { close = () => finish(true); } });
  }
  const ACTION_LABELS = UXK.ACTION_LABELS;
  function showHelp() {
    const rows = Object.entries(S.hotkeys).filter(([, v]) => v).map(([k, v]) => `<tr><td><kbd>${esc(v)}</kbd></td><td>${esc(ACTION_LABELS[k] || k)}</td></tr>`).join('');
    UXK.ui.modal({
      title: '단축키',
      width: 520,
      body: `<div class="uxk-scroll"><table class="uxk-table">${rows}</table></div>
        <div class="uxk-hint">Udemy 기본 단축키(그대로 동작): Space 재생/정지 · ←/→ 5초 · Shift+←/→ 속도 · ↑/↓ 볼륨 · F 전체화면 · M 음소거 · B Udemy 노트 · ? 도움말</div>
        <div class="uxk-hint">탭 밖에서도 쓰는 확장 단축키는 chrome://extensions/shortcuts 에서 바꿀 수 있습니다. 키 변경은 설정 페이지에서 합니다.</div>`,
      buttons: [{ label: '닫기', value: true }],
    });
  }

  // ======================= 학습 시간 기록 =======================
  const tracker = {
    acc: 0,
    timer: null,
    start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 5000); },
    tick() {
      const v = ctx.video;
      const playing = v && !v.paused && !v.ended && v.readyState > 2;
      const visible = document.visibilityState === 'visible' || document.pictureInPictureElement === v;
      if (S.stats.enabled && playing && visible) this.acc += 5;
      if (this.acc >= 30) this.flush();
    },
    async flush() {
      const add = this.acc;
      this.acc = 0;
      if (!add) return;
      const day = UXK.today();
      const goal = (S.stats.dailyGoalMin || 0) * 60;
      let reached = false;
      await UXK.local.update(UXK.KEYS.stats, (st) => {
        st = st && st.days ? st : { days: {} };
        const d = st.days[day] || (st.days[day] = { sec: 0, courses: {} });
        const before = d.sec;
        d.sec += add;
        if (ctx.courseId) d.courses[ctx.courseId] = (d.courses[ctx.courseId] || 0) + add;
        if (goal && before < goal && d.sec >= goal) reached = true;
        const keys = Object.keys(st.days).sort();
        while (keys.length > 400) delete st.days[keys.shift()];
        return st;
      }, { days: {} });
      if (reached) UXK.ui.toast(`오늘 학습 목표 ${S.stats.dailyGoalMin}분 달성`, { timeout: 6000 });
    },
  };

  // ======================= 비디오 연결 =======================
  function attachVideo(v) {
    if (videoAC) videoAC.abort();
    videoAC = null;
    ctx.video = v;
    if (!v) { if (layer) layer.remove(); return; }
    ctx.host = hostOf(v);
    buildLayer();
    placeLayer();
    updateSpeedLabel();
    const ac = new AbortController();
    videoAC = ac;
    const o = { signal: ac.signal };
    v.addEventListener('ratechange', () => speed.onRateChange(), o);
    ['loadedmetadata', 'loadeddata', 'play'].forEach((ev) => v.addEventListener(ev, applySpeedSoon, o));
    v.addEventListener('timeupdate', tick, o);
    // 탐색 후에는 같은 문장도 다시 따라 말하기 정지가 되도록 초기화
    v.addEventListener('seeked', () => { subs.idx = -1; subs.shadowDone = -1; lastT = v.currentTime; if (subsBox) subsBox.dataset.i = ''; tick(); }, o);
    v.addEventListener('play', () => { lastT = v.currentTime; startRaf(); }, o);
    applySpeedSoon();
    deepLinkSeek();
    updatePill();
    if (needCues(S)) startSubs();
  }

  // 강의 전환 감지 (URL 기준) — scan()과 onUrl() 양쪽에서 호출
  function checkLecture() {
    const prev = ctx.lectureId;
    parseUrl();
    if (ctx.lectureId === prev) return false;
    resetSubs();
    applySpeedSoon();
    refreshRemaining();
    if (needCues(S) && ctx.video && ctx.video.isConnected) startSubs();
    return true;
  }

  function scan() {
    checkLecture();
    const v = findVideo();
    if (v !== ctx.video) attachVideo(v);
    else if (v && layer && !layer.isConnected) placeLayer();
    injectSectionToggles();
    updateSectionLabels();
  }
  const scanSoon = UXK.throttle(scan, 400);

  let checkboxWatch = null;
  function onDocChange(e) {
    if (e.target && e.target.matches && e.target.matches('input[type="checkbox"]') && e.target.closest('[data-purpose="curriculum-section-container"], div[data-purpose^="section-panel-"]')) refreshRemaining();
  }

  // ======================= 생명주기 =======================
  let pageAC = null;
  async function init(settings) {
    S = settings;
    if (started) return;
    started = true;
    pageAC = new AbortController();
    const o = { signal: pageAC.signal };
    const oc = { signal: pageAC.signal, capture: true };
    parseHotkeys();
    parseUrl();
    window.addEventListener('keydown', onKey, oc);
    document.addEventListener('pointerdown', onNativeSpeedPointer, oc);
    document.addEventListener('change', onDocChange, oc);
    document.addEventListener('fullscreenchange', () => placeLayer(), o);
    window.addEventListener('pagehide', () => tracker.flush(), o);
    document.addEventListener('visibilitychange', () => { if (document.hidden) tracker.flush(); else if (ctx.video && !ctx.video.paused) startRaf(); }, o);
    observer = new MutationObserver(scanSoon);
    observer.observe(document.body, { childList: true, subtree: true });
    tracker.start();
    scan();
    // 코스 ID 확인은 최초 1회 목록 갱신이 필요할 수 있어 수 초 걸릴 수 있음 → 단축키는 먼저 동작
    ctx.courseId = await resolveCourseId();
    if (!started) return;
    await speed.load();
    if (!started) return;
    updateSpeedLabel();
    applySpeedSoon();
    if (ctx.courseId) {
      refreshRemaining();
      if (ctx.video && needCues(S)) startSubs();
    }
  }
  async function onUrl() {
    if (!ctx.courseId) {
      ctx.courseId = await resolveCourseId();
      if (ctx.courseId) { await speed.load(); applySpeedSoon(); }
    }
    if (checkLecture()) scan();
  }
  function destroy() {
    if (!started) return;
    started = false;
    if (pageAC) pageAC.abort();
    if (observer) observer.disconnect();
    if (videoAC) videoAC.abort();
    if (layer) layer.remove();
    tracker.flush();
    clearInterval(tracker.timer); tracker.timer = null;
    layer = pill = null;
    ctx.video = null;
    document.documentElement.classList.remove('uxk-hide-native-cc', 'uxk-theater');
  }
  function onSettings(s) {
    const prev = S;
    S = s;
    if (!started) return;
    parseHotkeys();
    applyLayerStyle();
    placeLayer();
    updatePill();
    injectSectionToggles();
    const langChanged = prev && (prev.subs.primaryLang !== s.subs.primaryLang || prev.subs.secondaryLang !== s.subs.secondaryLang || prev.subs.translate !== s.subs.translate);
    if (langChanged) resetSubs();
    if (needCues(s) && (!needCues(prev) || langChanged || !subs.primary)) startSubs();
    if (subsBox) subsBox.dataset.i = '';
    renderSubs();
  }
  async function onMessage(msg) {
    if (msg.type === 'command') {
      const map = { 'toggle-play': null, 'seek-back': 'back', 'seek-forward': 'forward', 'speed-up': 'speedUp', 'speed-down': 'speedDown', 'next-lecture': 'next', 'quick-note': 'note' };
      if (msg.command === 'toggle-play') { const v = ctx.video; if (v) { v.paused ? v.play().catch(() => {}) : v.pause(); } return { ok: true }; }
      if (msg.command === 'screenshot') { await screenshot(msg.dataUrl); return { ok: true }; }
      if (map[msg.command]) { await run(map[msg.command]); return { ok: true }; }
    }
    if (msg.type === 'player') {
      if (msg.action) await run(msg.action);
      return { ok: true, speed: speed.intended, hasVideo: !!ctx.video, lecture: lectureTitle(), course: courseTitle(), remaining };
    }
    return null;
  }

  UXK.playerPage = { init, destroy, onSettings, onUrl, onMessage, _ctx: ctx, _speed: speed, _subs: subs, _run: run, _remaining: () => remaining };
})();
