/* 라우터: 현재 Udemy 페이지 종류에 맞는 모듈을 켜고 끈다 */
(() => {
  const UXK = globalThis.UXK;
  if (UXK.__main) return;
  UXK.__main = true;

  const modules = { library: UXK.libraryPage, player: UXK.playerPage, catalog: UXK.catalogPage, landing: UXK.catalogPage };
  let S = null;
  let active = null;

  function applyGlobal() {
    // 전체화면(top layer)에서는 html 필터가 적용되지 않아 영상만 반전되므로 해제
    document.documentElement.classList.toggle('uxk-dark', !!(S && S.ui.darkMode && !document.fullscreenElement));
  }
  document.addEventListener('fullscreenchange', () => { if (S) applyGlobal(); });

  async function switchTo(route) {
    const mod = modules[route];
    if (active && active !== mod) { try { active.destroy(); } catch (e) { console.warn('[UXK] destroy', e); } }
    active = mod || null;
    if (active) {
      try { await active.init(S); } catch (e) { console.warn('[UXK] init failed', route, e); }
    }
  }

  async function boot() {
    S = await UXK.getSettings();
    UXK.i18n.setLang(S.ui.lang);
    applyGlobal();
    let route = UXK.route();
    await switchTo(route);
    UXK.onUrlChange(async () => {
      const r = UXK.route();
      if (modules[r] !== modules[route]) { route = r; await switchTo(r); }
      else { route = r; if (active && active.onUrl) active.onUrl(); }
    });
    UXK.onSettings((s) => {
      S = s;
      UXK.i18n.setLang(s.ui.lang);
      applyGlobal();
      if (active && active.onSettings) active.onSettings(s);
    });
  }

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'ping') { sendResponse({ ok: true, route: UXK.route() }); return; }
      if (msg.type === 'diagnose') { sendResponse({ ok: true, ...UXK.diagnose() }); return; }
      if ((msg.type === 'command' || msg.type === 'player') && UXK.route() === 'player' && UXK.playerPage) {
        UXK.playerPage.onMessage(msg).then((r) => sendResponse(r || { ok: false })).catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      }
      if (msg.type === 'refreshLibrary') {
        UXK.lib.refresh().then((c) => sendResponse({ ok: true, n: c.data.length })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
        return true;
      }
    });
  } catch (e) {}

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
