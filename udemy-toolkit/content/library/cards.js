// 내 학습 카드: Udemy 기본 카드에 배지 추가, 카드 메뉴의 보관을 새로고침 없이 처리
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('cards')) return;
  P.parts.add('cards');
  const { el, esc, $$ } = UXK;

  const CARD_SEL = '[class*="enrolled-course-card--container"]';

  // ---------------- 카드 배지 (Udemy 기본 카드에 정보 추가) ----------------
  const cardCourseId = (card) => {
    const a = card.querySelector('a[href*="course_id="]');
    const m = a && a.getAttribute('href').match(/course_id=(\d+)/);
    return m ? +m[1] : null;
  };
  const ratingClass = (r) => (r >= 4.6 ? 'uxk-r4' : r >= 4.3 ? 'uxk-r3' : r >= 4.0 ? 'uxk-r2' : r > 0 ? 'uxk-r1' : 'uxk-r0');

  function processCards() {
    if (!P.S.library.cardBadges || !P.cache) return;
    $$(CARD_SEL).forEach((card) => {
      const id = cardCourseId(card);
      if (!id) return;
      const c = P.byId.get(id);
      let box = card.querySelector(':scope .uxk-card-badges');
      if (!c) { if (box) box.remove(); return; }
      const m = P.meta[id] || {};
      const sig = `${c.rating}|${c.reviews}|${c.hours}|${(m.tags || []).join(',')}|${m.queue}`;
      if (box && box.getAttribute('data-sig') === sig) return;
      if (!box) {
        box = el('div', { class: 'uxk-card-badges' });
        const main = card.querySelector('[class*="course-card-module--main-content"]') || card;
        main.appendChild(box);
      }
      box.setAttribute('data-sig', sig);
      box.className = 'uxk-card-badges ' + ratingClass(c.rating);
      box.innerHTML = [
        c.rating ? `<b class="uxk-rate">★${c.rating.toFixed(1)}</b> <span>(${UXK.fmtCompact(c.reviews)})</span>` : '',
        c.hours ? `<span>${c.hours.toFixed(1)}h</span>` : '',
        c.updated ? `<span>Updated ${esc(c.updated.slice(0, 7))}</span>` : '',
        c.subs ? `<span>${UXK.fmtCompact(c.subs)} students</span>` : '',
        m.queue ? '<span class="uxk-chip uxk-chip-q">Queue</span>' : '',
        ...(m.tags || []).map((t) => `<span class="uxk-chip">${esc(t)}</span>`),
      ].filter(Boolean).join(' ');
    });
  }
  const processCardsSoon = UXK.throttle(() => processCards(), 400);
  function refreshBadges() { $$('.uxk-card-badges').forEach((n) => n.removeAttribute('data-sig')); processCards(); }

  function findNativeCard(id) {
    return $$(CARD_SEL).find((card) => cardCourseId(card) === id) || null;
  }
  function hideNativeCard(id, hide = true) {
    const card = findNativeCard(id);
    if (!card) return;
    const outer = card.parentElement && card.parentElement.children.length === 1 ? card.parentElement : card;
    outer.classList.toggle('uxk-card-hidden', !!hide);
  }

  // ---------------- 새로고침 없는 보관 (Udemy 카드 메뉴 가로채기) ----------------
  let lastCard = null;
  function onPointerDown(e) {
    const card = e.target.closest && e.target.closest(CARD_SEL);
    if (card) lastCard = { id: cardCourseId(card), t: Date.now() };
  }
  function closeMenus() {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true };
    try { (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
    try { document.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
  }
  function onArchiveClick(e) {
    if (!P.S.library.archiveNoReload) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.uxk-lib, .uxk-modal-back, .uxk-toasts')) return;
    const item = t.closest('[data-purpose="toggle-archived"], [role="menuitem"], button, a, li');
    if (!item) return;
    const isToggle = !!(item.matches('[data-purpose="toggle-archived"]') || item.closest('[data-purpose="toggle-archived"]'));
    const label = (item.innerText || item.textContent || '').replace(/\s+/g, ' ').trim();
    if (!isToggle && !/^(현 강의 보관|강의 보관|보관|archive this course|archive)$/i.test(label)) return;
    if (/해제|취소|복원|unarchive/i.test(label)) return; // 보관 해제는 Udemy 기본 동작 유지
    const card = item.closest(CARD_SEL);
    const id = card ? cardCourseId(card) : (lastCard && Date.now() - lastCard.t < 20000 ? lastCard.id : null);
    if (!id) return;
    const known = P.byId.get(id);
    if (known && known.archived) return; // 이미 보관된 강의면 Udemy에 맡김
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeMenus();
    archiveWithoutReload(id);
  }
  async function archiveWithoutReload(id) {
    const c = P.byId.get(id);
    const name = c ? `"${c.title.slice(0, 40)}"` : `Course ${id}`;
    try {
      await UXK.api.archive(id);
      hideNativeCard(id, true);
      if (c) { c.archived = true; await UXK.lib.save(P.cache); }
      P.render();
      UXK.ui.toast(`${name} archived (no reload)`, {
        timeout: 7000,
        actions: [{ label: 'Undo', onClick: async () => {
          try {
            await UXK.api.unarchive(id);
            hideNativeCard(id, false);
            if (c) { c.archived = false; await UXK.lib.save(P.cache); }
            P.render();
            UXK.ui.toast('Archive undone');
          } catch (err) { UXK.ui.toast(`Undo failed (${err.message}). Unarchive it from Udemy\'s Archived filter.`, { timeout: 8000, kind: 'err' }); }
        } }],
      });
    } catch (err) {
      UXK.ui.toast(`Archive failed (${err.message}). Turn off "Archive without reload" in Settings to use Udemy\'s default behavior.`, { timeout: 9000, kind: 'err' });
    }
  }

  Object.assign(P, { processCards, processCardsSoon, refreshBadges, hideNativeCard, onPointerDown,
    onArchiveClick });
})();
