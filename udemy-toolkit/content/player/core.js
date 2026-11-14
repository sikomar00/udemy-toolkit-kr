// 플레이어 공통: 공유 상태, 강의 컨텍스트, 영상 찾기, 오버레이 레이어(도구 막대·자막 상자·알림)
(() => {
  const UXK = globalThis.UXK;
  if (UXK.playerShared) return;
  const P = (UXK.playerShared = { parts: new Set(['core']) }); // 플레이어 파일들이 함께 쓰는 상태·함수 (파일 사이 호출은 P.이름)
  const { el, $$ } = UXK;

  P.S = null;
  const ctx = { courseId: null, slug: null, lectureId: null, lectureType: null, video: null, host: null };

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
    if (!id) UXK.log('courseId not found');
    return id;
  }
  async function courseFromCache() {
    const cache = await UXK.lib.load();
    return cache && ctx.courseId ? cache.data.find((x) => x.id === ctx.courseId) : null;
  }
  function courseTitle() {
    const h = document.querySelector('[data-purpose="course-header-title"], h1[data-purpose="course-title"], header h1');
    if (h && h.textContent.trim()) return h.textContent.trim();
    return (document.title || '').split('|')[0].trim() || 'Udemy course';
  }
  function lectureTitle() {
    const it = P.cur.items && P.cur.items.find((x) => x.id === ctx.lectureId && x._class === 'lecture');
    if (it) return it.title;
    const n = document.querySelector('[data-purpose="lead-title"], [class*="curriculum-item-link--is-current"] [data-purpose="item-title"]');
    if (n && n.textContent.trim()) return n.textContent.trim();
    return `Lecture ${ctx.lectureId || ''}`.trim();
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

  let indicatorEl = null, toolbar = null;
  const toggles = {}; // 켜짐 표시가 필요한 도구 막대 버튼
  P.layer = null;
  P.toolbar = null; // 영상 아래에 붙는 도구 막대 (자리는 bar.js가 잡는다)
  P.subsBox = null;
  P.sub1 = null;
  P.sub2 = null;
  P.speedLabel = null;
  function buildLayer() {
    if (P.layer) return;
    indicatorEl = el('div', { class: 'uxk-indicator', role: 'status' }); // 단축키로 켜고 끈 결과(속도, Dual subtitles ON 등)를 스크린리더가 읽는다
    P.sub1 = el('div', { class: 'uxk-sub1' });
    P.sub2 = el('div', { class: 'uxk-sub2' });
    P.subsBox = el('div', { class: 'uxk-subs', title: 'Drag to move' }, [P.sub1, P.sub2]);
    P.speedLabel = el('button', { class: 'uxk-tb-speed', title: 'Click: 1x ↔ previous speed' });
    const b = (label, title, fn, cls = '', toggleKey = '') => {
      const glyph = !/[\p{L}\p{N}]/u.test(label); // − + ⋯ 처럼 글자가 없는 단추
      const n = el('button', { type: 'button', class: 'uxk-tb-btn ' + cls, title, 'aria-label': glyph ? title : null, text: label === '⋯' ? null : label });
      if (label === '⋯') n.innerHTML = UXK.ui.icon('more');
      n.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
      if (toggleKey) { n.setAttribute('aria-pressed', 'false'); toggles[toggleKey] = n; }
      return n;
    };
    const tip = (text, action) => (P.S.hotkeys[action] ? `${UXK.t(text)} (${P.S.hotkeys[action]})` : text);
    const sep = () => el('span', { class: 'uxk-tb-sep', 'aria-hidden': 'true' });
    toolbar = el('div', { class: 'uxk-toolbar', role: 'toolbar', 'aria-label': 'Toolkit for Udemy tools' }, [
      b('−', tip('Slower', 'speedDown'), () => P.run('speedDown')),
      P.speedLabel,
      b('+', tip('Faster', 'speedUp'), () => P.run('speedUp')),
      sep(),
      b('Dual Subs', tip('Dual subtitles on/off', 'subs'), () => P.run('subs'), '', 'subs'),
      b('Loop', tip('Loop current sentence on/off', 'loopCue'), () => P.run('loopCue'), '', 'loop'),
      sep(),
      b('Copy Transcript', 'Copy the whole transcript of this lecture to the clipboard', () => P.run('copyTranscript')),
      b('Note', tip('Timestamped note', 'note'), () => P.run('note')),
      b('Capture', tip('Capture the current frame', 'screenshot'), () => P.run('screenshot')),
      b('PiP', tip('Picture-in-picture', 'pip'), () => P.run('pip')),
      b('Wide', tip('Remove the video height limit', 'theater'), () => P.run('theater'), '', 'theater'),
      sep(),
      b('Subtitles', 'Subtitle languages & export', () => P.openSubsMenu().catch((e) => UXK.ui.toast(e.message, { kind: 'err' })), 'uxk-tb-subs'),
      b('⋯', 'More', (e) => P.openMoreMenu(e)),
    ]);
    P.speedLabel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); P.run('speedReset'); });
    // 툴바·자막 클릭이 Udemy 재생/일시정지로 전달되지 않게 차단
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach((ev) => {
      toolbar.addEventListener(ev, (e) => e.stopPropagation());
      P.subsBox.addEventListener(ev, (e) => e.stopPropagation());
    });
    toolbar.addEventListener('mousedown', (e) => e.preventDefault()); // 눌러도 버튼에 초점이 남지 않게 (남으면 이어서 누른 Space가 그 버튼을 또 누른다)
    enableSubsDrag();
    P.toolbar = toolbar;
    P.layer = el('div', { class: 'uxk-layer' }, [indicatorEl, P.subsBox]);
    applyLayerStyle();
  }
  function placeLayer() {
    if (!P.layer || !ctx.video) return;
    const fs = document.fullscreenElement;
    let target = ctx.host;
    if (fs && fs !== ctx.video && fs.contains(ctx.video) && !fs.contains(ctx.host)) target = fs;
    if (!target) return;
    if (getComputedStyle(target).position === 'static') target.classList.add('uxk-host-rel');
    target.classList.add('uxk-host');
    if (P.layer.parentNode !== target) target.appendChild(P.layer);
  }
  function applyLayerStyle() {
    P.applyNativeCc();
    document.documentElement.classList.toggle('uxk-theater', !!P.S.player.theater);
    if (!P.layer) return;
    P.layer.style.setProperty('--uxk-sub-size', P.S.subs.fontSize + 'px');
    P.layer.style.setProperty('--uxk-sub-bottom', P.S.subs.bottom + '%');
    P.layer.style.setProperty('--uxk-sub-bg', `rgba(0,0,0,${P.S.subs.bgOpacity})`);
    P.subsBox.style.display = P.S.subs.enabled ? '' : 'none';
    updateToolbar();
  }
  // 켜짐 표시를 현재 설정과 상태에 맞춘다
  function updateToolbar() {
    if (!toolbar) return;
    const mark = (key, on) => { toggles[key].classList.toggle('uxk-on', !!on); toggles[key].setAttribute('aria-pressed', on ? 'true' : 'false'); };
    mark('subs', P.S.subs.enabled);
    mark('loop', P.subs.loop);
    mark('theater', P.S.player.theater);
  }
  let indTimer = null;
  function indicator(text) {
    if (!indicatorEl) return;
    if (!P.S.speed.overlay && /x$/.test(text)) return;
    indicatorEl.textContent = UXK.t(text);
    indicatorEl.classList.add('uxk-show');
    clearTimeout(indTimer);
    indTimer = setTimeout(() => indicatorEl.classList.remove('uxk-show'), 1100);
    if (P.pill) { P.pill.classList.add('uxk-flash'); setTimeout(() => P.pill && P.pill.classList.remove('uxk-flash'), 1500); } // 남은 시간 표시도 잠깐 보여 준다
  }

  function enableSubsDrag() {
    let startY = 0, startBottom = 0, dragging = false, moved = false, hostH = 1, cur = 0;
    P.subsBox.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false; startY = e.clientY; startBottom = P.S.subs.bottom; cur = startBottom;
      hostH = (P.layer.parentNode && P.layer.parentNode.getBoundingClientRect().height) || 1;
      try { P.subsBox.setPointerCapture(e.pointerId); } catch (err) {}
    });
    P.subsBox.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = ((startY - e.clientY) / hostH) * 100;
      if (Math.abs(startY - e.clientY) > 3) moved = true;
      cur = UXK.clamp(Math.round(startBottom + d), 4, 85); // 4% 아래로는 진행바를 가리므로 제한
      P.layer.style.setProperty('--uxk-sub-bottom', cur + '%');
    });
    const end = (save) => {
      if (!dragging) return;
      dragging = false;
      if (save && moved && cur !== P.S.subs.bottom) UXK.saveSettings({ subs: { bottom: cur } }).catch(() => {});
      else P.layer.style.setProperty('--uxk-sub-bottom', P.S.subs.bottom + '%');
    };
    P.subsBox.addEventListener('pointerup', () => end(true));
    P.subsBox.addEventListener('pointercancel', () => end(false));
  }

  Object.assign(P, { ctx, parseUrl, resolveCourseId, courseFromCache, courseTitle, lectureTitle, lectureUrl,
    findVideo, hostOf, buildLayer, placeLayer, applyLayerStyle, updateToolbar, indicator });
})();
