// 플레이어 진입점: 단축키·명령 처리, 영상 연결, 생명주기, 공개 객체 UXK.playerPage
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('index')) return;
  P.parts.add('index');

  let started = false;
  let observer = null;
  let hotkeys = {};
  let videoAC = null;

  // ======================= 단축키 =======================
  function parseHotkeys() {
    hotkeys = {};
    Object.entries(P.S.hotkeys || {}).forEach(([k, v]) => { const h = UXK.parseHotkey(v); if (h) hotkeys[k] = h; });
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
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) P.speed.lastNative = Date.now();
    for (const [action, hk] of Object.entries(hotkeys)) {
      if (!UXK.matchHotkey(e, hk)) continue;
      const needsVideo = !['note', 'help', 'next', 'prev', 'theater'].includes(action);
      if (needsVideo && !P.ctx.video) return;
      if (e.repeat && !REPEATABLE.has(action)) { e.preventDefault(); return; }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      run(action);
      return;
    }
  }
  function onNativeSpeedPointer(e) {
    if (e.target && e.target.closest && e.target.closest('[data-purpose*="playback-rate"]')) P.speed.lastNative = Date.now();
  }

  async function run(action) {
    const v = P.ctx.video;
    const step = P.S.speed.step || 0.25;
    try {
      switch (action) {
        case 'speedUp': P.speed.set(P.speed.intended + step); break;
        case 'speedDown': P.speed.set(P.speed.intended - step); break;
        case 'speedReset':
          if (Math.abs(P.speed.intended - 1) > 0.001) { P.speed.beforeReset = P.speed.intended; P.speed.set(1); } else P.speed.set(P.speed.beforeReset || 1.5);
          break;
        case 'back': if (v) { v.currentTime = Math.max(0, v.currentTime - P.S.speed.seekSec); P.indicator(`◀ ${P.S.speed.seekSec} s`); } break;
        case 'forward': if (v) { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + P.S.speed.seekSec); P.indicator(`${P.S.speed.seekSec} s ▶`); } break;
        case 'next': P.navigate('next'); break;
        case 'prev': P.navigate('prev'); break;
        case 'pip': await P.togglePip(); break;
        case 'theater': await UXK.saveSettings({ player: { theater: !P.S.player.theater } }); P.indicator(P.S.player.theater ? 'Wide view ON' : 'Wide view OFF'); break;
        case 'subs': await UXK.saveSettings({ subs: { enabled: !P.S.subs.enabled } }); P.indicator(P.S.subs.enabled ? 'Dual subtitles ON' : 'Dual subtitles OFF'); break;
        case 'replayCue': await P.replayCue(); break;
        case 'loopCue': await P.toggleLoopCue(); break;
        case 'saveSentence': await P.saveSentence(); break;
        case 'copyCue': await P.copyCue(); break;
        case 'copyTranscript': await P.copyTranscript(); break;
        case 'note': await P.quickNote(); break;
        case 'screenshot': await P.screenshot(); break;
        case 'help': P.showHelp(); break;
      }
    } catch (err) {
      if (err && err.stale) return; // 강의 전환으로 취소된 작업
      UXK.ui.toast(String(err && err.message ? err.message : err), { kind: 'err', timeout: 5000 });
    } finally {
      P.updateToolbar(); // 켜짐 표시를 동작 뒤의 상태에 맞춘다
    }
  }

  // ======================= 비디오 연결 =======================
  function attachVideo(v) {
    if (videoAC) videoAC.abort();
    videoAC = null;
    P.ctx.video = v;
    if (!v) { if (P.layer) P.layer.remove(); P.removeBar(); P.removeCapBox(); return; }
    P.ctx.host = P.hostOf(v);
    P.buildLayer();
    P.placeLayer();
    P.updateSpeedLabel();
    const ac = new AbortController();
    videoAC = ac;
    const o = { signal: ac.signal };
    v.addEventListener('ratechange', () => P.speed.onRateChange(), o);
    ['loadedmetadata', 'loadeddata', 'play'].forEach((ev) => v.addEventListener(ev, P.applySpeedSoon, o));
    v.addEventListener('timeupdate', P.tick, o);
    v.addEventListener('seeked', () => { P.subs.idx = -1; if (P.subsBox) P.subsBox.dataset.i = ''; P.tick(); }, o);
    v.addEventListener('play', P.startRaf, o);
    P.applySpeedSoon();
    if (!v.paused) P.startRaf(); // 이미 재생 중인 영상에 붙으면 play 이벤트가 오지 않으므로 직접 시작
    P.deepLinkSeek();
    P.updatePill();
    if (P.needCues(P.S)) P.startSubs();
  }

  // 강의 전환 감지 (URL 기준) — scan()과 onUrl() 양쪽에서 호출
  function checkLecture() {
    const prev = P.ctx.lectureId;
    P.parseUrl();
    if (P.ctx.lectureId === prev) return false;
    P.resetSubs();
    P.applySpeedSoon();
    P.refreshRemaining();
    if (P.needCues(P.S) && P.ctx.video && P.ctx.video.isConnected) P.startSubs();
    return true;
  }

  function scan() {
    checkLecture();
    const v = P.findVideo();
    if (v !== P.ctx.video) attachVideo(v);
    else if (v && P.layer && !P.layer.isConnected) P.placeLayer();
    P.injectSectionToggles();
    P.updateSectionLabels();
    P.placeCapBox();
    P.placeBar();
  }
  const scanSoon = UXK.throttle(scan, 400);
  function onDocChange(e) {
    if (e.target && e.target.matches && e.target.matches('input[type="checkbox"]') && e.target.closest('[data-purpose="curriculum-section-container"], div[data-purpose^="section-panel-"]')) P.refreshRemaining();
  }

  // ======================= 생명주기 =======================
  let pageAC = null;
  async function init(settings) {
    P.S = settings;
    if (started) return;
    started = true;
    P.ctx.courseId = null; P.remaining = null; P.speed.touched = false; // 이전 코스 정보가 남아 새 강의에 쓰이지 않게
    pageAC = new AbortController();
    const o = { signal: pageAC.signal };
    const oc = { signal: pageAC.signal, capture: true };
    parseHotkeys();
    P.parseUrl();
    window.addEventListener('keydown', onKey, oc);
    document.addEventListener('pointerdown', onNativeSpeedPointer, oc);
    document.addEventListener('click', onNativeSpeedPointer, oc); // 키보드(Tab·Enter)로 Udemy 속도 메뉴를 고른 경우도 사용자 변경으로 인식
    document.addEventListener('change', onDocChange, oc);
    document.addEventListener('fullscreenchange', () => { P.placeLayer(); P.placeCapBox(); P.placeBar(); }, o);
    window.addEventListener('pagehide', () => P.tracker.flush(), o);
    document.addEventListener('visibilitychange', () => { if (document.hidden) P.tracker.flush(); else if (P.ctx.video && !P.ctx.video.paused) P.startRaf(); }, o);
    observer = new MutationObserver(scanSoon);
    observer.observe(document.body, { childList: true, subtree: true });
    P.tracker.start();
    scan();
    // 코스 ID 확인은 최초 1회 목록 갱신이 필요할 수 있어 수 초 걸릴 수 있음 → 단축키는 먼저 동작
    P.ctx.courseId = await P.resolveCourseId();
    if (!started) return;
    await P.speed.load();
    if (!started) return;
    if (P.speed.touched) P.speed.saveSoon(); // 코스를 찾기 전에 바꾼 속도를 이제 알게 된 코스에 저장
    P.updateSpeedLabel();
    P.applySpeedSoon();
    if (P.ctx.courseId) {
      P.refreshRemaining();
      if (P.ctx.video && P.needCues(P.S)) P.startSubs();
    }
  }
  async function onUrl() {
    const slug = (location.pathname.match(/^\/course\/([^/]+)/) || [])[1] || null;
    if (slug !== P.ctx.slug) { P.ctx.slug = slug; P.ctx.courseId = null; P.remaining = null; P.speed.touched = false; } // 같은 탭에서 다른 코스로 이동: 이전 코스 정보를 버리고 다시 찾는다
    if (!P.ctx.courseId) {
      P.ctx.courseId = await P.resolveCourseId();
      if (P.ctx.courseId) { await P.speed.load(); P.applySpeedSoon(); }
    }
    if (checkLecture()) scan();
  }
  function destroy() {
    if (!started) return;
    started = false;
    if (pageAC) pageAC.abort();
    if (observer) observer.disconnect();
    if (videoAC) videoAC.abort();
    if (P.exportAbort) P.exportAbort.stop = true; // 코스 전체 내보내기는 화면을 떠나면 멈춘다
    if (P.layer) P.layer.remove();
    P.removeBar();
    P.removeCapBox();
    P.tracker.flush();
    clearInterval(P.tracker.timer); P.tracker.timer = null;
    P.layer = P.pill = null;
    P.ctx.video = null;
    document.documentElement.classList.remove('uxk-hide-native-cc', 'uxk-theater');
    P.syncNativeCc(false); // 모양으로 찾아 숨긴 기본 자막도 되돌린다
  }
  function onSettings(s) {
    const prev = P.S;
    P.S = s;
    if (!started) return;
    parseHotkeys();
    P.applyLayerStyle();
    P.placeLayer();
    P.updateToolbar();
    P.placeCapBox();
    P.placeBar();
    P.updatePill();
    P.injectSectionToggles();
    const langChanged = prev && (prev.subs.primaryLang !== s.subs.primaryLang || prev.subs.secondaryLang !== s.subs.secondaryLang || prev.subs.translate !== s.subs.translate);
    if (langChanged) P.resetSubs();
    if (P.needCues(s) && (!P.needCues(prev) || langChanged || !P.subs.primary)) P.startSubs();
    if (P.subsBox) P.subsBox.dataset.i = '';
    P.renderSubs();
  }
  async function onMessage(msg) {
    if (msg.type === 'command') {
      const map = { 'toggle-play': null, 'seek-back': 'back', 'seek-forward': 'forward', 'speed-up': 'speedUp', 'speed-down': 'speedDown', 'next-lecture': 'next', 'quick-note': 'note' };
      if (msg.command === 'toggle-play') { const v = P.ctx.video; if (v) { v.paused ? v.play().catch(() => {}) : v.pause(); } return { ok: true }; }
      if (msg.command === 'screenshot') { await P.screenshot(msg.dataUrl); return { ok: true }; }
      if (map[msg.command]) { await run(map[msg.command]); return { ok: true }; }
    }
    if (msg.type === 'player') {
      if (msg.action) await run(msg.action);
      return { ok: true, speed: P.speed.intended, hasVideo: !!P.ctx.video, lecture: P.lectureTitle(), course: P.courseTitle(), remaining: P.remaining };
    }
    return null;
  }

  UXK.playerPage = { init, destroy, onSettings, onUrl, onMessage, _ctx: P.ctx, _speed: P.speed, _subs: P.subs, _run: run, _remaining: () => P.remaining };

  Object.assign(P, { run });
})();
