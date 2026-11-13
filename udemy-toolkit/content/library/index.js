// 내 학습 진입점: 패널 열기·닫기, 생명주기, 공개 객체 UXK.libraryPage
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('index')) return;
  P.parts.add('index');
  const { el } = UXK;

  // ---------------- 열기/닫기 ----------------
  async function openPanel() {
    if (!P.panel) P.buildPanel();
    P.panel.classList.add('uxk-open');
    P.fillOptions();
    P.writeForm(P.state.filters);
    P.render();
    if (!P.cache || UXK.lib.isStale(P.cache, P.S.library.autoRefreshHours)) {
      try { await P.ensureData(!P.cache ? false : true); P.fillOptions(); P.render(); P.processCards(); } catch (err) { P.setStatus('Load failed: ' + err.message + ' (check that you are signed in)'); }
    }
  }
  function closePanel() { if (P.panel) P.panel.classList.remove('uxk-open'); }

  // ---------------- 생명주기 ----------------
  let started = false;
  async function init(settings) {
    P.S = settings;
    if (started) return;
    started = true;
    P.meta = await UXK.lib.meta();
    P.presets = await UXK.local.get(UXK.KEYS.presets, {});
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
