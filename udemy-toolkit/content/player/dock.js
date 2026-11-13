// 플레이어 도크: 영상 바로 아래의 상시 도구 줄과 자막 영역. 전체화면에서는 숨기고 영상 위 도구 막대·자막을 쓴다
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('dock')) return;
  P.parts.add('dock');
  const { el } = UXK;

  let dock = null, dsub1 = null, dsub2 = null, speedBtn = null, sizeWatch = null;
  let lastFixedTry = 0;
  const toggles = {}; // 켜짐 표시가 필요한 버튼

  // 같은 글자를 다시 쓰면 DOM 변화로 잡혀 화면 감시가 계속 돌므로 바뀔 때만 쓴다
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const syncHeight = () => document.documentElement.style.setProperty('--uxk-dock-h', `${dock ? dock.offsetHeight : 0}px`);

  function buildDock() {
    if (dock) return;
    const tip = (text, action) => (P.S.hotkeys[action] ? `${text} (${P.S.hotkeys[action]})` : text);
    const btn = (label, title, onClick, toggleKey) => {
      const n = el('button', { type: 'button', class: 'uxk-tb-btn', title, text: label });
      n.addEventListener('click', onClick);
      if (toggleKey) { n.setAttribute('aria-pressed', 'false'); toggles[toggleKey] = n; }
      return n;
    };
    const act = (name) => () => P.run(name);
    const sep = () => el('span', { class: 'uxk-tb-sep' });
    speedBtn = el('button', { type: 'button', class: 'uxk-tb-speed', title: '클릭: 1배속 ↔ 이전 속도' });
    speedBtn.addEventListener('click', act('speedReset'));
    const bar = el('div', { class: 'uxk-dock-bar', role: 'toolbar', 'aria-label': 'Udemy Toolkit 도구' }, [
      btn('−', tip('속도 낮추기', 'speedDown'), act('speedDown')), speedBtn, btn('+', tip('속도 높이기', 'speedUp'), act('speedUp')), sep(),
      btn('이중 자막', tip('이중 자막 켜기/끄기', 'subs'), act('subs'), 'subs'),
      btn('따라 말하기', tip('문장마다 멈추기', 'shadow'), act('shadow'), 'shadow'),
      btn('문장 반복', tip('현재 문장 반복', 'loopCue'), act('loopCue'), 'loop'),
      btn('A-B 반복', tip('A-B 구간 반복 (누를 때마다 A → B → 해제)', 'abLoop'), act('abLoop'), 'ab'), sep(),
      btn('대본 복사', '이 강의 원문 대본 전체를 클립보드에 복사', act('copyTranscript')),
      btn('메모', tip('타임스탬프 메모', 'note'), act('note')),
      btn('캡처', tip('현재 화면 캡처', 'screenshot'), act('screenshot')),
      btn('PiP', tip('화면 속 화면', 'pip'), act('pip')),
      btn('넓게 보기', tip('영상 높이 제한 해제', 'theater'), act('theater'), 'theater'), sep(),
      btn('자막 설정', '자막 언어·내보내기', () => P.openSubsMenu().catch((e) => UXK.ui.toast(e.message, { kind: 'err' }))),
      btn('⋯', '더 보기', () => P.openMoreMenu()),
    ]);
    dsub1 = el('div', { class: 'uxk-dsub1' });
    dsub2 = el('div', { class: 'uxk-dsub2' });
    dock = el('div', { class: 'uxk-dock', 'data-mode': 'below', 'data-subs': 'off' }, [el('div', { class: 'uxk-dock-subs' }, [dsub1, dsub2]), bar]);
    dock.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // 눌러도 버튼에 초점이 남지 않게 (남으면 이어서 누른 Space가 그 버튼을 또 누른다)
    if (typeof ResizeObserver === 'function') { sizeWatch = new ResizeObserver(syncHeight); sizeWatch.observe(dock); }
    window.addEventListener('resize', placeSoon);
  }

  // 켜짐 표시·속도·자막 영역을 현재 설정과 상태에 맞춘다
  function updateDock() {
    if (!dock) return;
    const mark = (key, on) => { toggles[key].classList.toggle('uxk-on', !!on); toggles[key].setAttribute('aria-pressed', on ? 'true' : 'false'); };
    mark('subs', P.S.subs.enabled);
    mark('shadow', P.S.subs.shadowPause);
    mark('loop', P.subs.loop);
    mark('ab', P.subs.ab.a != null);
    mark('theater', P.S.player.theater);
    put(speedBtn, `${P.speed.intended.toFixed(2)}x`);
    dock.dataset.subs = P.S.subs.enabled ? 'on' : 'off';
    dock.style.setProperty('--uxk-sub-size', P.S.subs.fontSize + 'px');
    if (P.sub1) { put(dsub1, P.sub1.textContent); put(dsub2, P.sub2.textContent); }
    syncHeight();
  }
  function setDockSubs(first, second) { if (dsub1) { put(dsub1, first); put(dsub2, second); } }

  // ---- 위치: 영상 영역 전체의 바로 아래에 끼우고, 어긋나면 안쪽 → 화면 맨 아래 고정 순으로 바꾼다 ----
  // 영상 요소에서 위로 올라가며 아래쪽 끝이 같은 가장 바깥 요소 = 영상 영역 (그 아래가 도크 자리)
  function anchorFor(host) {
    const hr = host.getBoundingClientRect();
    let best = host;
    for (let n = host.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (Math.abs(r.bottom - hr.bottom) > 4 || r.width < hr.width - 4) break;
      best = n;
    }
    return best;
  }
  // 도크가 영상 바로 아래에 가로로 겹쳐 있고, 잘려서 가려지지 않았는지
  function fits(vr) {
    const r = dock.getBoundingClientRect();
    if (r.width < Math.min(200, vr.width) || r.height < 24) return false;
    if (r.top < vr.bottom - 6 || r.top > vr.bottom + 80) return false;
    if (Math.min(r.right, vr.right) - Math.max(r.left, vr.left) < vr.width * 0.8) return false;
    for (let n = dock.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n);
      if ((o.overflowY === 'hidden' || o.overflowY === 'clip') && r.bottom > n.getBoundingClientRect().bottom + 1) return false;
    }
    return true;
  }
  // 영상과 같은 폭·같은 왼쪽 위치로 맞춘다 (영상이 가운데 정렬이거나 부모가 더 넓어도 영상 아래에 정렬)
  function alignToVideo(vr) {
    if (dock.dataset.mode === 'fixed') { dock.style.width = ''; dock.style.marginLeft = ''; return; }
    const w = `${Math.round(vr.width)}px`;
    if (dock.style.width !== w) dock.style.width = w;
    const dx = Math.round(vr.left - dock.getBoundingClientRect().left);
    if (dx) dock.style.marginLeft = `${(parseFloat(dock.style.marginLeft) || 0) + dx}px`;
  }
  function mount(vr) {
    const anchor = anchorFor(P.ctx.host || P.ctx.video.parentElement);
    const tries = [['below', () => anchor.after(dock)], ['inside', () => anchor.append(dock)]];
    for (const [mode, put2] of tries) {
      dock.dataset.mode = mode;
      put2();
      if (fits(vr)) return;
    }
    dock.dataset.mode = 'fixed';
    document.body.appendChild(dock);
    lastFixedTry = Date.now();
  }

  function removeDock() {
    if (sizeWatch) { sizeWatch.disconnect(); sizeWatch = null; }
    window.removeEventListener('resize', placeSoon);
    if (dock) { dock.remove(); dock = null; }
    document.documentElement.classList.remove('uxk-dock-on', 'uxk-dock-fixed');
    document.documentElement.style.removeProperty('--uxk-dock-h');
  }

  // 설정·영상·전체화면 상태에 맞춰 도크를 만들고 자리를 잡는다 (자주 불려도 가볍게)
  function placeDock() {
    const v = P.ctx.video;
    if (!P.S.player.dock || !v || !v.isConnected) { removeDock(); return; }
    buildDock();
    const fullscreen = !!document.fullscreenElement;
    document.documentElement.classList.toggle('uxk-dock-on', !fullscreen);
    if (fullscreen) { syncHeight(); return; }
    const vr = v.getBoundingClientRect();
    const keep = dock.isConnected && (dock.dataset.mode === 'fixed' ? Date.now() - lastFixedTry < 3000 : fits(vr));
    if (!keep) mount(vr);
    alignToVideo(vr);
    document.documentElement.classList.toggle('uxk-dock-fixed', dock.dataset.mode === 'fixed'); // 맨 아래 고정이면 페이지 끝에 도크 높이만큼 여백을 둔다
    updateDock();
  }
  const placeSoon = UXK.throttle(placeDock, 200); // 창 크기가 바뀌면 영상 폭에 다시 맞춘다

  Object.assign(P, { placeDock, removeDock, updateDock, setDockSubs });
})();
