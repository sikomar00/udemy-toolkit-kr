/* 공용 UI: 토스트, 모달, 드로어 (모든 요소는 uxk- 접두사) */
(() => {
  const UXK = (globalThis.UXK = globalThis.UXK || {});
  if (UXK.ui) return;
  const { el } = UXK;

  // 전체화면 요소가 <video> 자체면 자식을 그릴 수 없으므로 body 사용
  const layer = () => { const fs = document.fullscreenElement; return (fs && fs.tagName !== 'VIDEO' ? fs : null) || document.body || document.documentElement; };

  // ---------- 토스트 ----------
  let toastBox = null;
  function ensureToastBox() {
    if (!toastBox) toastBox = el('div', { class: 'uxk-toasts', 'aria-live': 'polite' });
    const host = layer();
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
    return toastBox;
  }
  document.addEventListener('fullscreenchange', () => { if (toastBox) ensureToastBox(); });

  const toasts = new Map();
  function toast(msg, opts = {}) {
    const { timeout = 3500, actions = [], id, kind = '' } = opts;
    const box = ensureToastBox();
    let t = id && toasts.get(id);
    if (!t) {
      const node = el('div', { class: 'uxk-toast ' + (kind ? 'uxk-toast-' + kind : ''), role: kind === 'err' ? 'alert' : 'status' }); // 오류는 바로 읽어 주고 나머지는 하던 말이 끝난 뒤 읽는다
      const text = el('span', { class: 'uxk-toast-text' });
      const acts = el('span', { class: 'uxk-toast-acts' });
      const x = el('button', { class: 'uxk-toast-x', title: 'Close', 'aria-label': 'Close', text: '×' });
      node.append(text, acts, x);
      box.appendChild(node);
      t = { node, text, acts, timer: null, close() { clearTimeout(this.timer); node.remove(); if (id) toasts.delete(id); } };
      x.onclick = () => t.close();
      if (id) toasts.set(id, t);
    }
    t.text.textContent = UXK.t(msg);
    t.acts.textContent = '';
    actions.forEach((a) => {
      const b = el('button', { class: 'uxk-toast-btn', text: a.label });
      b.onclick = () => { try { a.onClick && a.onClick(); } finally { if (a.close !== false) t.close(); } };
      t.acts.appendChild(b);
    });
    clearTimeout(t.timer);
    if (timeout > 0) t.timer = setTimeout(() => t.close(), timeout);
    t.update = (m, o = {}) => toast(m, { ...opts, ...o, id: id || undefined });
    return t;
  }

  // ---------- 모달 ----------
  // 여러 모달이 겹치면 Escape는 맨 위 모달만 닫는다
  const modalStack = [];
  let modalSeq = 0;
  document.addEventListener('keydown', (e) => {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); top.finish(top.closeValue); return; }
    // 모달 밖 대상의 키 입력은 페이지 단축키로 가지 않게 차단 (모달 안 입력은 box 리스너가 처리)
    if (!top.box.contains(e.target)) e.stopPropagation();
  }, true);
  const isModalOpen = () => modalStack.length > 0;

  // Tab·Shift+Tab이 대화상자 밖(뒤의 Udemy 화면)으로 나가지 않고 안에서 돌게 한다
  function trapTab(container, e) {
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((n) => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length > 0 && !n.closest('[hidden]'));
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], cur = document.activeElement;
    if (!container.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('fullscreenchange', () => {
    modalStack.forEach((m) => { const host = layer(); if (m.back.parentNode !== host) host.appendChild(m.back); });
  });

  function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width = 460, onOpen, closeValue = null, dismissOnBackdrop = true }) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const back = el('div', { class: 'uxk-modal-back' });
      const titleId = 'uxk-modal-title-' + (++modalSeq);
      const box = el('div', { class: 'uxk-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: { width: `min(${width}px, calc(100vw - 32px))` } });
      const head = el('div', { class: 'uxk-modal-head' }, [el('strong', { id: titleId, text: title || '' })]);
      const content = el('div', { class: 'uxk-modal-body' });
      if (body instanceof Node) content.appendChild(body); else if (body != null) content.innerHTML = body;
      const foot = el('div', { class: 'uxk-modal-foot' });
      let done = false;
      const entry = { box, back, closeValue, finish: null };
      const finish = (v) => {
        if (done) return;
        done = true;
        const i = modalStack.indexOf(entry);
        if (i >= 0) modalStack.splice(i, 1);
        back.remove();
        if (prevFocus && prevFocus.isConnected && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} } // 닫으면 열기 전 위치로 키보드 초점 복원
        resolve(v);
      };
      entry.finish = finish;
      modalStack.push(entry);
      buttons.forEach((b) => {
        const btn = el('button', { class: 'uxk-btn' + (b.primary ? ' uxk-btn-primary' : '') + (b.danger ? ' uxk-btn-danger' : ''), text: b.label });
        btn.onclick = () => finish(typeof b.value === 'function' ? b.value(content) : b.value);
        foot.appendChild(btn);
      });
      // 모달 안에서 입력한 키가 Udemy 단축키(Space 재생 등)로 전달되지 않게 버블 단계에서 차단
      box.addEventListener('keydown', (e) => { trapTab(box, e); e.stopPropagation(); });
      box.addEventListener('keyup', (e) => e.stopPropagation());
      box.addEventListener('keypress', (e) => e.stopPropagation());
      back.addEventListener('mousedown', (e) => { if (dismissOnBackdrop && e.target === back) finish(closeValue); });
      box.append(head, content, foot);
      back.appendChild(box);
      layer().appendChild(back);
      if (onOpen) onOpen(content, finish);
      const first = content.querySelector('textarea, input, select, button') || foot.querySelector('.uxk-btn-primary') || foot.querySelector('.uxk-btn'); // 위험 확인창은 기본 강조 버튼이 없으므로 첫 버튼(취소)에 초점
      if (first) setTimeout(() => first.focus(), 0);
    });
  }

  function prompt(title, { value = '', placeholder = '', multiline = false, hint = '', okLabel = 'Save' } = {}) {
    const wrap = el('div');
    if (hint) wrap.appendChild(el('div', { class: 'uxk-hint', text: hint }));
    const input = multiline
      ? el('textarea', { class: 'uxk-input', rows: 5, placeholder })
      : el('input', { class: 'uxk-input', type: 'text', placeholder });
    input.value = value;
    wrap.appendChild(input);
    return modal({
      title,
      body: wrap,
      buttons: [
        { label: 'Cancel', value: null },
        { label: okLabel, value: () => input.value, primary: true },
      ],
      dismissOnBackdrop: false, // 입력 중인 내용이 바깥 클릭 한 번에 사라지지 않게 (Esc·취소는 그대로)
      onOpen: (content, finish) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(input.value); }
        });
      },
    });
  }

  function confirm(title, message, { okLabel = 'Continue', danger = false } = {}) {
    const body = el('div', { class: 'uxk-pre' });
    body.textContent = UXK.t(message);
    return modal({ title, body, buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: !danger, danger }], closeValue: false });
  }

  // ---------- 드로어 ----------
  const drawers = new Map();
  function drawer(id, { title = '', width = 420 } = {}) {
    if (drawers.has(id)) return drawers.get(id);
    const root = el('div', { class: 'uxk-drawer', id: 'uxk-drawer-' + id, role: 'complementary', 'aria-label': title, style: { width: `min(${width}px, 100vw)` } });
    const head = el('div', { class: 'uxk-drawer-head' });
    const h = el('strong', { text: title });
    const tools = el('div', { class: 'uxk-drawer-tools' });
    const x = el('button', { class: 'uxk-btn uxk-btn-ghost', text: 'Close' });
    head.append(h, tools, x);
    const body = el('div', { class: 'uxk-drawer-body' });
    root.append(head, body);
    const d = {
      root, body, tools,
      setTitle(t) { h.textContent = UXK.t(t); root.setAttribute('aria-label', UXK.t(t)); },
      open() { const host = layer(); if (root.parentNode !== host) host.appendChild(root); root.classList.add('uxk-open'); },
      close() { root.classList.remove('uxk-open'); },
      toggle() { root.classList.contains('uxk-open') && root.isConnected ? d.close() : d.open(); },
      isOpen() { return root.isConnected && root.classList.contains('uxk-open'); },
    };
    x.onclick = d.close;
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); d.close(); } }); // 키보드로 서랍 안에 있을 때 Esc로 닫는다
    drawers.set(id, d);
    return d;
  }
  document.addEventListener('fullscreenchange', () => {
    drawers.forEach((d) => { if (d.isOpen()) { const host = layer(); if (d.root.parentNode !== host) host.appendChild(d.root); } });
  });

  // 선 아이콘(24×24 SVG). ☆ ✎ ⋯ 같은 글자 기호는 글꼴마다 크기·굵기가 달라 SVG로 통일한다. 화면 낭독기에는 단추 이름만 읽히게 숨긴다
  const ICONS = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    pencil: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  };
  const icon = (name, filled = false) => `<svg class="uxk-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  // 만족한 순간에 한 번 평가를 부탁하는 알림 (UXK.reviewMomentDue가 때를 정한다). value가 없으면 kind별 횟수를 세어서 쓴다
  async function askReview(kind, value) {
    const save = (patch) => UXK.local.update(UXK.KEYS.feedback, (o) => ({ ...(o || {}), ...patch }), {});
    try {
      let fb = (await UXK.local.get(UXK.KEYS.feedback, {})) || {};
      if (value == null) {
        const key = kind + 'Count';
        fb = await save({ [key]: (fb[key] || 0) + 1 });
        value = fb[key];
      }
      if (!UXK.reviewMomentDue(fb, kind, value)) return false;
      await save({ askedAt: Date.now() });
      toast('Glad that helped! If Toolkit for Udemy saves you time, a short review helps other learners find it.', {
        id: 'uxk-review', timeout: 20000, actions: [
          { label: 'Leave a review', onClick: () => { window.open(UXK.LINKS.reviews, '_blank', 'noopener'); save({ done: true }); } },
          { label: 'Maybe later', onClick: () => save({ snoozeUntil: Date.now() + 30 * 864e5 }) },
          { label: "Don't ask again", onClick: () => save({ done: true }) },
        ],
      });
      return true;
    } catch (e) {
      // 평가 요청은 덧붙이는 기능이라 저장소 오류가 나도 방금 끝난 본 작업(보관·복사·저장)을 실패로 보이지 않게 한다
      if (UXK.log) UXK.log('review prompt skipped', e && e.message);
      return false;
    }
  }

  UXK.ui = { toast, modal, prompt, confirm, drawer, layer, isModalOpen, trapTab, icon, askReview };
})();
