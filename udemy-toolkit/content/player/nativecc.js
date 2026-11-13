// Udemy 기본 자막 숨기기: 영상 안(아래쪽)에 있는 기본 자막을 찾아 숨긴다. 실제 클래스 이름은 자주 바뀌므로 알려진 이름(style.css)에 더해 화면 모양으로도 찾는다
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('nativecc')) return;
  P.parts.add('nativecc');

  const SKIP = '.uxk-layer, .uxk-toolbar, button, a, input, select, textarea, [role="button"], [role="slider"], [role="menu"], [role="menuitem"], [role="tooltip"], [role="dialog"], [aria-hidden="true"]';
  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="slider"]';
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const letters = (s) => (s.match(/\p{L}/gu) || []).length;
  let marked = null;

  // 영상 영역 안에서 아래쪽 절반에 있는, 단어가 여러 개인 글자 중 가장 긴 것 = 기본 자막 (언어와 상관없이 찾는다)
  function candidateIn(root, hr) {
    let best = null, bestLen = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = norm(t.nodeValue);
      if (letters(text) < 4 || (!/\s/.test(text) && text.length < 12) || text.length <= bestLen) continue;
      const e = t.parentElement;
      if (!e || e.closest(SKIP)) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
      if (cy < hr.top + hr.height * 0.45 || cy > hr.bottom || cx < hr.left || cx > hr.right) continue;
      best = e; bestLen = text.length;
    }
    return best;
  }
  // 그 글자만 담은 가장 바깥 요소까지 올라간다 (검은 상자 전체를 숨기려고). 영상·단추를 품은 요소는 절대 고르지 않는다
  function boxOf(e, root, video) {
    const full = norm(e.textContent);
    let box = e;
    for (let p = e.parentElement; p && p !== root && p !== document.body; p = p.parentElement) {
      if (p.contains(video) || p.querySelector('.uxk-layer, .uxk-toolbar') || p.querySelector(INTERACTIVE) || norm(p.textContent) !== full) break;
      box = p;
    }
    return box;
  }
  function findNativeCc() {
    const v = P.ctx.video, host = P.ctx.host;
    if (!v || !host || v.ended) return null;
    const hr = host.getBoundingClientRect();
    if (hr.height < 100) return null;
    let root = host, e = candidateIn(host, hr);
    if (!e && host.parentElement) { root = host.parentElement; e = candidateIn(root, hr); } // 기본 자막이 영상 틀 바깥 형제에 있는 구조
    return e ? boxOf(e, root, v) : null;
  }

  function unmark() {
    if (marked) { marked.removeAttribute('data-uxk-native-cc'); marked = null; }
  }
  // want = 지금 기본 자막을 숨겨야 하는가. 이미 찾아 둔 요소가 살아 있으면 다시 찾지 않는다 (자막이 비는 순간에는 찾을 수 없으므로 문장이 바뀔 때마다 다시 시도)
  function syncNativeCc(want) {
    if (!want) { unmark(); return; }
    if (marked && marked.isConnected) return;
    marked = null;
    const found = findNativeCc();
    if (found) { found.setAttribute('data-uxk-native-cc', ''); marked = found; }
  }
  const syncNativeCcSoon = UXK.throttle(() => P.applyNativeCc(), 150);

  Object.assign(P, { syncNativeCc, syncNativeCcSoon });
})();
