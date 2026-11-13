// 내 학습 진입점: 패널 열기·닫기, 생명주기, 공개 객체 UXK.libraryPage
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('index')) return;
  P.parts.add('index');
  const { el } = UXK;

  // ---------------- 열기/닫기 ----------------
  let opener = null; // 패널을 열기 직전에 초점이 있던 곳 (닫으면 돌려준다)
  async function openPanel() {
    if (!P.panel) P.buildPanel();
    opener = document.activeElement;
    P.panel.classList.add('uxk-open');
    P.fillOptions();
    P.writeForm(P.state.filters);
    P.state.filters = P.readForm(); // 저장돼 있던 카테고리·태그가 지금 목록에 없으면 빈 값으로 정리 (보이지 않는 조건으로 목록이 걸러지는 일 방지)
    P.render();
    const title = P.panel.querySelector('#uxk-lib-title');
    if (title) title.focus(); // 키보드·스크린리더 사용자가 패널 안에서 시작하도록 제목으로 초점을 옮긴다
    if (!P.cache || UXK.lib.isStale(P.cache, P.S.library.autoRefreshHours)) {
      try { await P.ensureData(!P.cache ? false : true); P.fillOptions(); P.render(); P.processCards(); } catch (err) { P.setStatus(UXK.t('Load failed: {0} (check that you are signed in)', UXK.t(err.message))); }
    }
  }
  function closePanel() {
    if (!P.panel) return;
    const wasOpen = P.panel.classList.contains('uxk-open');
    P.panel.classList.remove('uxk-open');
    const back = opener && opener.isConnected ? opener : P.fab;
    if (wasOpen && back && back.focus) back.focus();
    opener = null;
  }

  // ---------------- 생명주기 ----------------
  let started = false;
  async function init(settings) {
    P.S = settings;
    if (started) return;
    started = true;
    P.meta = await UXK.lib.meta();
    P.presets = await UXK.local.get(UXK.KEYS.presets, {});
    P.restoreView(await UXK.local.get(UXK.KEYS.libraryView, null));
    P.setCache(await UXK.lib.load());
    if (!started) return; // 초기화 도중 다른 페이지로 이동한 경우
    if (P.S.library.panel) {
      P.fab = el('button', { class: 'uxk-fab', id: 'uxk-fab', text: 'My Course Tools', title: 'Sort, filter and bulk actions (Toolkit for Udemy)' });
      P.fab.onclick = () => {
        if (!UXK.alive()) { UXK.ui.toast(new UXK.DeadError().message, { kind: 'err', timeout: 8000 }); return; }
        P.panel && P.panel.classList.contains('uxk-open') ? closePanel() : openPanel();
      };
      document.body.appendChild(P.fab);
    }
    P.observer = new MutationObserver(P.processCardsSoon);
    P.observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', P.onPointerDown, true);
    window.addEventListener('click', P.onArchiveClick, true);
    P.processCards();
    // 데이터가 없거나 오래되면 백그라운드로 갱신 (카드 배지·보유 표시용)
    if (UXK.lib.isStale(P.cache, P.S.library.autoRefreshHours) && (await UXK.lib.canAutoRefresh()) && started) {
      P.ensureData(!!P.cache).then(() => { P.processCards(); if (P.panel && P.panel.classList.contains('uxk-open')) { P.fillOptions(); P.render(); } }).catch((e) => UXK.log('auto refresh fail', e));
    }
  }
  function destroy() {
    if (!started) return;
    started = false;
    if (P.observer) P.observer.disconnect();
    document.removeEventListener('pointerdown', P.onPointerDown, true);
    window.removeEventListener('click', P.onArchiveClick, true);
    if (P.fab) P.fab.remove();
    if (P.panel) P.panel.remove();
    P.fab = P.panel = null;
  }
  function onSettings(s) { P.S = s; if (started) P.refreshBadges(); }

  UXK.libraryPage = { init, destroy, onSettings, _state: P.state, _rows: () => P.currentRows() };

  Object.assign(P, { closePanel });
})();
