// 이중 자막 박스: 영상 바로 아래의 Udemy 기본 자막 띠(검은 띠)를 찾아 그 자리에 원문+번역 2줄을 보여 준다. 못 찾으면 영상 위 자막(기존 방식)을 쓴다
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('capbox')) return;
  P.parts.add('capbox');
  const { el } = UXK;

  const NATIVE_CC = '[class*="captions-display--captions-container"]'; // 예전 화면에서 확인한 영상 안쪽 기본 자막 요소
  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="slider"], [role="tab"]';
  const PATIENCE_MS = 3000; // 기본 자막 띠를 못 찾아도 이 시간까지는 계속 찾아 본다 (화면이 아직 그려지는 중일 수 있으므로)
  let box = null, line1 = null, line2 = null, native = null;
  let text1 = '', text2 = '';
  let tryStart = 0, overlayMode = false;

  // 같은 글자를 다시 쓰면 DOM 변화로 잡혀 화면 감시가 계속 돌므로 바뀔 때만 쓴다
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  function buildBox() {
    if (box) return;
    line1 = el('div', { class: 'uxk-cap1' });
    line2 = el('div', { class: 'uxk-cap2' });
    box = el('div', { class: 'uxk-capbox', 'aria-label': 'Dual subtitles' }, [line1, line2]);
  }
  function syncText() {
    if (!box) return;
    box.style.setProperty('--uxk-sub-size', P.S.subs.fontSize + 'px');
    put(line1, text1);
    put(line2, text2);
  }
  function setCapBox(first, second) { text1 = first; text2 = second; syncText(); }

  const isDark = (n) => {
    const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
    return !!m && (m.length > 3 ? +m[3] : 1) >= 0.5 && 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 90;
  };
  // 스크롤되는 목록 안의 줄(대본 패널 등)은 자막 띠가 아니다
  const inList = (n) => { for (let a = n; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if ((o === 'auto' || o === 'scroll') && a.scrollHeight > a.clientHeight + 4) return true; } return false; };

  // hit에서 위로 올라가며 영상 바로 아래에 있는 가장 바깥 요소를 고른다. 영상·단추를 품으면 거기서 멈춘다. 글자 내용·언어와 상관없이 모양(영상 아래, 영상 폭 근처, 어두운 바탕)으로만 판정한다
  function bandAt(hit, v, vr) {
    let best = null, dark = false;
    for (let n = hit; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n === box) return null;
      const r = n.getBoundingClientRect();
      if (n.contains(v)) { dark = dark || isDark(n); break; } // 띠 뒤에 깔린 바탕(영상 줄)이 어두운 경우도 인정
      if (r.height > 300 || r.top < vr.bottom - 6 || n.matches(INTERACTIVE) || n.querySelector(INTERACTIVE)) break;
      dark = dark || isDark(n);
      best = n;
    }
    if (!best || !dark) return null;
    const r = best.getBoundingClientRect();
    return r.width >= vr.width * 0.8 && r.height >= 20 && !inList(best) ? best : null;
  }
  function findBand() {
    const v = P.ctx.video;
    if (!v) return null;
    const vr = v.getBoundingClientRect();
    if (!vr.width) return null;
    for (const dy of [10, 30, 60, 90]) {
      const y = vr.bottom + dy;
      if (y < 0 || y >= window.innerHeight) continue;
      const band = bandAt(document.elementFromPoint(vr.left + vr.width / 2, y), v, vr);
      if (band) return band;
    }
    return null;
  }
  // 도구 막대 자리의 기준: 이중 자막 박스, 없으면 기본 자막 띠 (이중 자막이 꺼져 있어도 찾는다)
  function captionEl() {
    if (box && box.isConnected) return box;
    return native && native.isConnected ? native : findBand();
  }

  function dropBox() {
    if (native) { native.removeAttribute('data-uxk-native-cc'); native = null; }
    if (box) { box.remove(); box = null; line1 = line2 = null; }
    document.documentElement.classList.remove('uxk-capbox-on');
  }
  function removeCapBox() {
    dropBox();
    tryStart = 0;
    if (overlayMode) { overlayMode = false; P.applyNativeCc(); }
  }
  function mount(band) {
    buildBox();
    native = band;
    if (P.S.subs.hideNative) native.setAttribute('data-uxk-native-cc', '');
    native.before(box);
    document.documentElement.classList.add('uxk-capbox-on');
    tryStart = 0;
    if (overlayMode) { overlayMode = false; P.applyNativeCc(); }
    syncText();
  }

  // 이중 자막이 켜져 있으면 기본 자막 띠 자리에 박스를 두고, 못 찾으면(영상 안쪽 자막이거나 구조가 다름) 영상 위 자막을 쓴다. 영상 위 자막으로 바꾼 뒤에도 띠가 나타나면 박스로 옮긴다
  function placeCapBox() {
    const v = P.ctx.video;
    if (!(P.S.subs.enabled && P.subs.primary && v && v.isConnected)) { removeCapBox(); return; }
    const fs = document.fullscreenElement;
    if (native && (!native.isConnected || (fs && !fs.contains(native)))) dropBox(); // 띠가 사라졌거나 전체화면 밖에 남음 → 다시 찾는다
    if (native) { buildBox(); if (!box.isConnected) native.before(box); syncText(); return; }
    const band = findBand();
    if (band) { mount(band); return; }
    if (overlayMode) return;
    const known = document.querySelector(NATIVE_CC);
    if (known && known.getBoundingClientRect().top < v.getBoundingClientRect().bottom - 6) { overlayMode = true; P.applyNativeCc(); return; } // 기본 자막이 영상 안쪽에 겹쳐 있음
    if (!tryStart) { tryStart = Date.now(); setTimeout(placeCapBox, PATIENCE_MS + 100); } // 화면이 조용해도 기다린 시간이 지나면 판정이 나도록 스스로 다시 부른다
    if (Date.now() - tryStart > PATIENCE_MS) { overlayMode = true; P.applyNativeCc(); }
  }
  const placeCapBoxSoon = UXK.throttle(placeCapBox, 400);
  const nativeOverlayMode = () => overlayMode;

  Object.assign(P, { setCapBox, placeCapBox, placeCapBoxSoon, removeCapBox, nativeOverlayMode, captionEl });
})();
