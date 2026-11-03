// 플레이어 학습 흐름: 강의 이동, 커리큘럼·남은 시간, 섹션 전체 완료
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('lessons')) return;
  P.parts.add('lessons');
  const { el, esc, $$ } = UXK;

  // ======================= 강의 이동 =======================
  function navigate(dir) {
    const sels = dir === 'next'
      ? ['[data-purpose="go-to-next"]', '#go-to-next-item', '[class*="next-and-previous--next"]']
      : ['[data-purpose="go-to-previous"]', '#go-to-previous-item', '[class*="next-and-previous--previous"]'];
    for (const s of sels) {
      const n = document.querySelector(s);
      if (n) {
        (n.closest('a, button') || n).click();
        P.indicator(dir === 'next' ? '다음 강의 ▶' : '◀ 이전 강의');
        return;
      }
    }
    navByCurriculum(dir);
  }
  async function navByCurriculum(dir) {
    const items = await getCurriculum();
    if (!items) return UXK.ui.toast('이동할 강의를 찾지 못했습니다');
    const list = items.filter((i) => i._class === 'lecture' || i._class === 'quiz');
    const idx = list.findIndex((i) => i.id === P.ctx.lectureId);
    if (idx < 0) return UXK.ui.toast('현재 강의를 목차에서 찾지 못했습니다'); // 연습·과제 화면 등: 엉뚱하게 첫 강의로 가지 않게
    const target = list[idx + (dir === 'next' ? 1 : -1)];
    if (!target) return UXK.ui.toast(dir === 'next' ? '마지막 강의입니다' : '첫 강의입니다');
    location.assign(`${location.origin}/course/${P.ctx.slug}/learn/${target._class === 'quiz' ? 'quiz' : 'lecture'}/${target.id}`);
  }

  // ======================= 커리큘럼 / 남은 시간 =======================
  const cur = { courseId: null, items: null, loading: null };
  async function getCurriculum(force = false) {
    if (!P.ctx.courseId) return null;
    if (!force && cur.items && cur.courseId === P.ctx.courseId) return cur.items;
    if (cur.loading) return cur.loading;
    cur.loading = (async () => {
      const key = UXK.KEYS.curriculum(P.ctx.courseId);
      const cached = await UXK.local.get(key);
      if (!force && cached && Date.now() - cached.t < 24 * 3600e3) { cur.items = cached.items; cur.courseId = P.ctx.courseId; return cur.items; }
      try {
        const raw = await UXK.api.curriculum(P.ctx.courseId, { withCaptions: false });
        const items = raw.map((i) => ({ _class: i._class, id: i.id, title: i.title, type: i.type || null, sec: (i.asset && i.asset.time_estimation) || 0, atype: (i.asset && i.asset.asset_type) || null }));
        await UXK.local.set(key, { t: Date.now(), items });
        cur.items = items; cur.courseId = P.ctx.courseId;
        return items;
      } catch (e) {
        if (cached) { cur.items = cached.items; cur.courseId = P.ctx.courseId; return cur.items; }
        return null;
      }
    })();
    try { return await cur.loading; } finally { cur.loading = null; }
  }

  P.remaining = null;
  async function computeRemaining() {
    const items = await getCurriculum();
    if (!items) return null;
    const prog = await UXK.api.progress(P.ctx.courseId);
    const doneIds = prog && prog.completed_lecture_ids;
    const hasProgress = Array.isArray(doneIds); // 추정 API가 다른 모양으로 200을 주면 정확한 값처럼 표시하지 않는다
    const done = new Set(hasProgress ? doneIds : []);
    const chapters = [];
    let ch = { title: '(섹션 없음)', total: 0, remain: 0, n: 0, done: 0 };
    let pushed = false;
    for (const it of items) {
      if (it._class === 'chapter') { ch = { title: it.title, total: 0, remain: 0, n: 0, done: 0 }; chapters.push(ch); pushed = true; continue; }
      if (it._class !== 'lecture') continue;
      if (!pushed) { chapters.push(ch); pushed = true; }
      ch.total += it.sec; ch.n++;
      if (done.has(it.id)) ch.done++; else ch.remain += it.sec;
    }
    let total = chapters.reduce((s, c) => s + c.total, 0);
    let remain = chapters.reduce((s, c) => s + c.remain, 0);
    const n = chapters.reduce((s, c) => s + c.n, 0), nDone = chapters.reduce((s, c) => s + c.done, 0);
    let exact = hasProgress;
    if (!hasProgress) {
      const c = await P.courseFromCache();
      if (c) remain = total * (1 - Math.min(100, c.progress) / 100);
    }
    P.remaining = { total, remain, chapters, exact, n, nDone };
    return P.remaining;
  }
  P.pill = null;
  function updatePill() {
    if (!P.S || !P.S.player.remaining || !P.remaining || !P.layer) { if (P.pill) P.pill.style.display = 'none'; return; }
    if (!P.pill) {
      P.pill = el('button', { class: 'uxk-pill', title: '섹션별 남은 시간 보기' });
      P.pill.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showRemainingDetail(); });
      ['pointerdown', 'mousedown', 'mouseup', 'dblclick'].forEach((ev) => P.pill.addEventListener(ev, (e) => e.stopPropagation()));
      P.pill.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (P.pill.parentNode !== P.layer) P.layer.appendChild(P.pill);
    P.pill.style.display = '';
    const r = P.remaining;
    const rate = P.speed.intended || 1;
    const sp = Math.abs(rate - 1) > 0.01 ? ` (${rate}x → ${UXK.fmtDur(r.remain / rate)})` : '';
    P.pill.textContent = `남은 ${UXK.fmtDur(r.remain)}${sp}${r.exact ? ` · 완료 ${r.nDone}/${r.n}강` : ' · 진행률 기준 추정'}`;
  }
  const refreshRemaining = UXK.debounce(async () => { try { await computeRemaining(); updatePill(); updateSectionLabels(); } catch (e) { UXK.log('remaining', e); } }, 1500);
  async function showRemainingDetail() {
    if (!P.remaining) return;
    const rate = P.speed.intended || 1;
    const rows = P.remaining.chapters.map((c, i) => `<tr><td>${i + 1}. ${esc(c.title)}</td><td class="uxk-n">${c.done}/${c.n}</td><td class="uxk-n">${UXK.fmtDur(c.total)}</td><td class="uxk-n">${c.remain ? UXK.fmtDur(c.remain) : '완료'}</td><td class="uxk-n">${c.remain ? UXK.fmtDur(c.remain / rate) : '-'}</td></tr>`).join('');
    await UXK.ui.modal({
      title: '섹션별 남은 시간',
      width: 640,
      body: `<div class="uxk-hint">총 ${UXK.fmtDur(P.remaining.total)} · 남은 ${UXK.fmtDur(P.remaining.remain)} · 현재 ${rate}x 기준 ${UXK.fmtDur(P.remaining.remain / rate)}${P.remaining.exact ? '' : ' · 진행 기록 API를 쓰지 못해 전체 진행률로 추정'}</div>
        <div class="uxk-scroll"><table class="uxk-table"><thead><tr><th>섹션</th><th>완료</th><th>전체</th><th>남은</th><th>${rate}x</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      buttons: [{ label: '닫기', value: true }],
    });
  }
  function updateSectionLabels() {
    if (!P.remaining || !P.S.player.remaining) return;
    const panels = $$('div[data-purpose^="section-panel-"]');
    const chs = P.remaining.chapters.filter((c) => c.n > 0 || c.title !== '(섹션 없음)');
    if (!panels.length || panels.length !== chs.length) return; // 개수가 다르면 잘못 표시될 수 있어 생략
    panels.forEach((p, i) => {
      const c = chs[i];
      const title = p.querySelector('.ud-accordion-panel-title, [data-purpose="section-heading"], h3, button');
      if (!title) return;
      let lab = title.querySelector('.uxk-sec-remain');
      if (!lab) { lab = el('span', { class: 'uxk-sec-remain' }); title.appendChild(lab); }
      const txt = c.remain ? `남은 ${UXK.fmtDur(c.remain)}` : '완료';
      if (lab.textContent !== txt) lab.textContent = txt;
    });
  }

  // ======================= 섹션 전체 완료/해제 =======================
  function injectSectionToggles() {
    if (!P.S.player.sectionToggles) { $$('.uxk-sec-tools').forEach((n) => n.remove()); return; }
    $$('div[data-purpose^="section-panel-"]').forEach((panel) => {
      const boxes = panel.querySelectorAll('input[type="checkbox"]');
      const bar = panel.querySelector('.uxk-sec-tools');
      if (!boxes.length) { if (bar) bar.remove(); return; }
      if (bar) return;
      const mk = (label, check) => {
        const b = el('button', { class: 'uxk-sec-btn', text: label });
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSection(panel, check); });
        return b;
      };
      const tools = el('div', { class: 'uxk-sec-tools' }, [mk('✓ 섹션 전체 완료', true), mk('↺ 전체 미완료', false)]);
      const group = panel.querySelector('[role="group"]') || panel;
      group.insertBefore(tools, group.firstChild);
    });
  }
  let sectionBusy = false;
  async function toggleSection(panel, check) {
    if (sectionBusy) return UXK.ui.toast('이미 섹션을 처리하는 중입니다'); // 겹쳐 실행하면 서로 체크를 되돌린다
    sectionBusy = true;
    try { await toggleSectionNow(panel, check); } finally { sectionBusy = false; }
  }
  async function toggleSectionNow(panel, check) {
    const pending = () => $$('input[type="checkbox"]', panel).filter((b) => b.checked !== check);
    const first = pending();
    if (!first.length) return UXK.ui.toast('바꿀 강의가 없습니다');
    const ok = await UXK.ui.confirm(check ? '섹션 전체 완료 표시' : '섹션 전체 미완료로 되돌리기', `이 섹션의 강의 ${first.length}개를 ${check ? '완료' : '미완료'}로 표시합니다.\nUdemy 화면의 체크박스를 차례로 누르는 방식입니다.`, { okLabel: '진행' });
    if (!ok) return;
    for (let pass = 0; pass < 3; pass++) {
      const list = pending();
      if (!list.length) break;
      for (const b of list) { if (b.checked !== check) b.click(); await UXK.sleep(350); } // 그 사이 이미 바뀐 체크박스는 다시 누르지 않는다
      await UXK.sleep(900);
    }
    const left = pending().length;
    UXK.ui.toast(left ? `${left}개는 바뀌지 않았습니다. 다시 시도하세요.` : `이 섹션 강의 ${first.length}개를 ${check ? '완료' : '미완료'}로 표시했습니다`, { kind: left ? 'err' : '' });
    refreshRemaining();
  }

  Object.assign(P, { navigate, cur, getCurriculum, computeRemaining, updatePill, refreshRemaining,
    showRemainingDetail, updateSectionLabels, injectSectionToggles });
})();
