// 영상 아래 도구 막대: 영상 영역 바로 아래에 끼워 넣는다. 자리가 어긋나면 영역 안쪽 → 영상 아래 가장자리에 띄움(float) 순으로 바꾼다. 전체화면에서는 걷는다
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('bar')) return;
  P.parts.add('bar');
  const { el } = UXK;

  let spacer = null, lastFloat = 0;
  // 같은 값을 다시 쓰면 DOM 변화로 잡혀 화면 감시가 계속 돌므로 바뀔 때만 쓴다
  const setStyle = (node, prop, value) => { if (node.style[prop] !== value) node.style[prop] = value; };

  // 기준 요소(기본 자막 띠·이중 자막 박스, 없으면 영상 틀)에서 위로 올라가며 아래쪽 끝이 같은 가장 바깥 요소 = 영상 영역 (그 아래가 막대 자리)
  function anchorFor(base) {
    const br = base.getBoundingClientRect();
    let best = base;
    for (let n = base.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (Math.abs(r.bottom - br.bottom) > 4 || r.width < br.width - 4) break;
      best = n;
    }
    return best;
  }
  // 막대 자리의 기준: 가로는 영상 틀, 세로(아래 끝)는 영상 영역 (옆 칸까지 품은 넓은 요소에 폭이 끌려가지 않게)
  function areaOf(anchor, host) {
    const h = host.getBoundingClientRect();
    return { left: h.left, right: h.right, width: h.width, bottom: anchor.getBoundingClientRect().bottom };
  }
  // 막대가 영상 영역 바로 아래에 가로로 겹쳐 있고, 잘려서 가려지지 않았는지
  function fits(bar, ar) {
    const r = bar.getBoundingClientRect();
    if (r.width < Math.min(200, ar.width) || r.height < 24) return false;
    if (r.top < ar.bottom - 6 || r.top > ar.bottom + 40) return false;
    if (Math.min(r.right, ar.right) - Math.max(r.left, ar.left) < ar.width * 0.8) return false;
    for (let n = bar.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n);
      if ((o.overflowY === 'hidden' || o.overflowY === 'clip') && r.bottom > n.getBoundingClientRect().bottom + 1) return false;
    }
    return true;
  }
  // 영상 영역과 같은 폭·같은 왼쪽 위치로 맞춘다 (부모가 더 넓거나 영상이 가운데 정렬이어도 영상 아래에 정렬)
  function alignTo(bar, ar) {
    setStyle(bar, 'width', `${Math.round(ar.width)}px`);
    const dx = Math.round(ar.left - bar.getBoundingClientRect().left);
    if (dx) bar.style.marginLeft = `${(parseFloat(bar.style.marginLeft) || 0) + dx}px`;
  }
  function dropSpacer() { if (spacer) { spacer.remove(); spacer = null; } }
  function mount(bar, anchor, host) {
    dropSpacer();
    for (const [mode, put] of [['below', () => anchor.after(bar)], ['inside', () => anchor.append(bar)]]) {
      bar.dataset.mode = mode;
      setStyle(bar, 'top', ''); setStyle(bar, 'left', ''); setStyle(bar, 'marginLeft', '');
      put();
      if (fits(bar, areaOf(anchor, host))) return;
    }
    bar.dataset.mode = 'float';
    document.body.appendChild(bar);
    lastFloat = Date.now();
  }
  // float: 화면에 고정하되 영상 영역의 아래 가장자리에 붙여 따라다닌다 (자리가 모자라면 화면 아래 끝). 아래 내용이 가려지지 않게 같은 높이의 빈 칸을 둔다
  function floatTo(bar, anchor, ar) { // ar = areaOf 결과
    const h = bar.offsetHeight || 36;
    setStyle(bar, 'left', `${Math.round(ar.left)}px`);
    setStyle(bar, 'width', `${Math.round(ar.width)}px`);
    setStyle(bar, 'top', `${Math.round(Math.min(ar.bottom, window.innerHeight - h))}px`);
    if (!spacer) spacer = el('div', { class: 'uxk-bar-spacer', 'aria-hidden': 'true' });
    if (spacer.previousElementSibling !== anchor) anchor.after(spacer);
    setStyle(spacer, 'height', `${h}px`);
  }

  function removeBar() {
    dropSpacer();
    if (P.toolbar && P.toolbar.isConnected) { P.toolbar.remove(); P.toolbar.dataset.mode = ''; }
    window.removeEventListener('scroll', placeBarSoon, true);
    window.removeEventListener('resize', placeBarSoon);
  }
  // 설정·영상·전체화면 상태에 맞춰 막대를 붙이고 자리를 잡는다 (자주 불려도 가볍게)
  function placeBar() {
    const v = P.ctx.video, bar = P.toolbar;
    if (!bar || !P.S.player.toolbar || !v || !v.isConnected || document.fullscreenElement) { removeBar(); return; }
    if (!bar.isConnected) { window.addEventListener('scroll', placeBarSoon, { capture: true, passive: true }); window.addEventListener('resize', placeBarSoon); }
    const host = P.ctx.host || v.parentElement;
    const anchor = anchorFor(P.captionEl() || host); // 자막 띠가 영상 아래에 있으면 그 아래에 붙인다 (영상 · 자막 · 도구 막대 순서)
    const ar = areaOf(anchor, host);
    const keep = bar.isConnected && (bar.dataset.mode === 'float' ? Date.now() - lastFloat < 3000 : fits(bar, ar));
    if (!keep) mount(bar, anchor, host);
    if (bar.dataset.mode === 'float') floatTo(bar, anchor, ar); else alignTo(bar, ar);
  }
  const placeBarSoon = UXK.throttle(placeBar, 80);

  Object.assign(P, { placeBar, removeBar });
})();
