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
      const node = el('div', { class: 'uxk-toast ' + (kind ? 'uxk-toast-' + kind : '') });
      const text = el('span', { class: 'uxk-toast-text' });
      const acts = el('span', { class: 'uxk-toast-acts' });
      const x = el('button', { class: 'uxk-toast-x', title: 'Close', text: '×' });
      node.append(text, acts, x);
      box.appendChild(node);
      t = { node, text, acts, timer: null, close() { clearTimeout(this.timer); node.remove(); if (id) toasts.delete(id); } };
      x.onclick = () => t.close();
      if (id) toasts.set(id, t);
    }
    t.text.textContent = msg;
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
  document.addEventListener('keydown', (e) => {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); top.finish(top.closeValue); return; }
    // 모달 밖 대상의 키 입력은 페이지 단축키로 가지 않게 차단 (모달 안 입력은 box 리스너가 처리)
    if (!top.box.contains(e.target)) e.stopPropagation();
  }, true);
  const isModalOpen = () => modalStack.length > 0;
  document.addEventListener('fullscreenchange', () => {
    modalStack.forEach((m) => { const host = layer(); if (m.back.parentNode !== host) host.appendChild(m.back); });
  });

  function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width = 460, onOpen, closeValue = null, dismissOnBackdrop = true }) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const back = el('div', { class: 'uxk-modal-back' });
      const box = el('div', { class: 'uxk-modal', role: 'dialog', 'aria-modal': 'true', style: { width: `min(${width}px, calc(100vw - 32px))` } });
      const head = el('div', { class: 'uxk-modal-head' }, [el('strong', { text: title || '' })]);
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
      box.addEventListener('keydown', (e) => e.stopPropagation());
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
    body.textContent = message;
    return modal({ title, body, buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: !danger, danger }], closeValue: false });
  }

  // ---------- 드로어 ----------
  const drawers = new Map();
  function drawer(id, { title = '', width = 420 } = {}) {
    if (drawers.has(id)) return drawers.get(id);
    const root = el('div', { class: 'uxk-drawer', id: 'uxk-drawer-' + id, style: { width: `min(${width}px, 100vw)` } });
    const head = el('div', { class: 'uxk-drawer-head' });
    const h = el('strong', { text: title });
    const tools = el('div', { class: 'uxk-drawer-tools' });
    const x = el('button', { class: 'uxk-btn uxk-btn-ghost', text: 'Close' });
    head.append(h, tools, x);
    const body = el('div', { class: 'uxk-drawer-body' });
    root.append(head, body);
    const d = {
      root, body, tools,
      setTitle(t) { h.textContent = t; },
      open() { const host = layer(); if (root.parentNode !== host) host.appendChild(root); root.classList.add('uxk-open'); },
      close() { root.classList.remove('uxk-open'); },
      toggle() { root.classList.contains('uxk-open') && root.isConnected ? d.close() : d.open(); },
      isOpen() { return root.isConnected && root.classList.contains('uxk-open'); },
    };
    x.onclick = d.close;
    drawers.set(id, d);
    return d;
  }
  document.addEventListener('fullscreenchange', () => {
    drawers.forEach((d) => { if (d.isOpen()) { const host = layer(); if (d.root.parentNode !== host) host.appendChild(d.root); } });
  });

  UXK.ui = { toast, modal, prompt, confirm, drawer, layer, isModalOpen };
})();
