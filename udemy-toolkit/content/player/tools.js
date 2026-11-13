// 플레이어 도구: PiP·화면 캡처, 더 보기 메뉴·도움말, 학습 시간 기록
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('tools')) return;
  P.parts.add('tools');
  const { el, esc } = UXK;

  // ======================= PiP / 캡처 =======================
  async function togglePip() {
    const v = P.ctx.video;
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
    const v = P.ctx.video;
    if (!v) return;
    // 깨끗한 영상 프레임(캔버스)을 먼저 시도: 화면 캡처는 컨트롤 막대·확장 도구·자막이 함께 찍힌다
    let blob = await frameFromCanvas(v);
    if (!blob && dataUrlFromCommand) blob = await cropDataUrl(dataUrlFromCommand, v.getBoundingClientRect());
    if (!blob) {
      const res = await UXK.bg({ type: 'capture' });
      if (res && res.ok) blob = await cropDataUrl(res.dataUrl, v.getBoundingClientRect());
    }
    if (!blob) {
      UXK.ui.toast('Capture failed: the video is protected or permission is missing. Try the extension shortcut Alt+Shift+S.', { kind: 'err', timeout: 7000 });
      return;
    }
    const name = `${UXK.safeFile(P.lectureTitle())}_${UXK.fmtClock(v.currentTime).replace(/:/g, '-')}.png`;
    let copied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } catch (e) {}
    UXK.ui.toast(copied ? 'Capture copied to the clipboard' : 'Captured', {
      timeout: 6000,
      actions: [{ label: 'Save as file', onClick: () => UXK.download(name, blob) }],
    });
  }

  // ======================= 더 보기 메뉴 / 도움말 =======================
  async function openMoreMenu() {
    const wrap = el('div', { class: 'uxk-menu-body' });
    const act = (label, fn) => el('button', { class: 'uxk-btn uxk-menu-item', text: label, onclick: () => { close(); fn(); } });
    let close = () => {};
    const tabsHint = el('div', { class: 'uxk-hint', text: `Current speed ${P.speed.intended}x · Shortcut help: ${P.S.hotkeys.help}` });
    wrap.append(
      tabsHint,
      act('View / export my notes', P.openNotes),
      act('Time left by section', async () => { await P.computeRemaining(); P.updatePill(); P.showRemainingDetail(); }),
      act('Export this lecture\'s subtitles', () => P.exportLecture().catch((e) => UXK.ui.toast(e.message, { kind: 'err' }))),
      act('Whole-course subtitles (Markdown)', P.exportCourseTranscript),
      act(`Turn ${P.S.player.theater ? 'off' : 'on'} wide view`, () => P.run('theater')),
      act('Shortcut help', showHelp),
      act('Open settings (saved sentences · study stats)', () => UXK.bg({ type: 'openOptions' })),
    );
    UXK.ui.modal({ title: 'Toolkit for Udemy', body: wrap, width: 380, buttons: [{ label: 'Close', value: true }], onOpen: (c, finish) => { close = () => finish(true); } });
  }
  const ACTION_LABELS = UXK.ACTION_LABELS;
  function showHelp() {
    const rows = Object.entries(P.S.hotkeys).filter(([, v]) => v).map(([k, v]) => `<tr><td><kbd>${esc(v)}</kbd></td><td>${esc(UXK.t(ACTION_LABELS[k] || k))}</td></tr>`).join('');
    UXK.ui.modal({
      title: 'Hotkeys',
      width: 520,
      body: `<div class="uxk-scroll"><table class="uxk-table">${rows}</table></div>
        <div class="uxk-hint">${UXK.t("Udemy's own shortcuts (still work): Space play/pause · ←/→ 5 s · Shift+←/→ speed · ↑/↓ volume · F fullscreen · M mute · B Udemy note · ? help")}</div>
        <div class="uxk-hint">${UXK.t('Global extension shortcuts that work outside the tab can be changed at chrome://extensions/shortcuts. Change the other keys on the settings page.')}</div>`,
      buttons: [{ label: 'Close', value: true }],
    });
  }

  // ======================= 학습 시간 기록 =======================
  const tracker = {
    acc: 0,
    timer: null,
    start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 5000); },
    tick() {
      const v = P.ctx.video;
      const playing = v && !v.paused && !v.ended && v.readyState > 2;
      const visible = document.visibilityState === 'visible' || document.pictureInPictureElement === v;
      if (P.S.stats.enabled && playing && visible) this.acc += 5;
      if (this.acc >= 30) this.flush();
    },
    async flush() {
      const add = this.acc;
      this.acc = 0;
      if (!add) return;
      try { await this.save(add); } catch (e) { this.acc += add; UXK.log('failed to save watch time', e); } // 저장에 실패해도 시간을 잃지 않고 다음에 다시 시도
    },
    async save(add) {
      const day = UXK.today();
      const goal = (P.S.stats.dailyGoalMin || 0) * 60;
      let reached = false;
      await UXK.local.update(UXK.KEYS.stats, (st) => {
        st = st && st.days ? st : { days: {} };
        const d = st.days[day] || (st.days[day] = { sec: 0, courses: {} });
        const before = d.sec;
        d.sec += add;
        if (P.ctx.courseId) d.courses[P.ctx.courseId] = (d.courses[P.ctx.courseId] || 0) + add;
        if (goal && before < goal && d.sec >= goal) reached = true;
        const keys = Object.keys(st.days).sort();
        while (keys.length > 400) delete st.days[keys.shift()];
        return st;
      }, { days: {} });
      if (reached) UXK.ui.toast(`Daily goal of ${P.S.stats.dailyGoalMin} min reached`, { timeout: 6000 });
    },
  };

  Object.assign(P, { togglePip, screenshot, openMoreMenu, showHelp, tracker });
})();
