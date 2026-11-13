// 내 학습 동작: 패널 클릭 처리, 태그·메모 편집, 일괄 보관, CSV·Markdown·JSON 내보내기
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('actions')) return;
  P.parts.add('actions');
  const { el, $, $$ } = UXK;

  // ---------------- 이벤트 처리 ----------------
  function onPanelClick(e) {
    handlePanelClick(e).catch((err) => UXK.ui.toast(err && err.message ? err.message : String(err), { kind: 'err', timeout: 7000 }));
  }
  async function handlePanelClick(e) {
    const scopeBtn = e.target.closest('[data-scope]');
    if (scopeBtn) { P.state.scope = scopeBtn.getAttribute('data-scope'); P.state.shown = P.SHOW_STEP; P.render(); return; }
    const th = e.target.closest('th[data-k]');
    if (th) {
      const k = th.getAttribute('data-k');
      if (P.state.sort.key === k) P.state.sort.dir = P.state.sort.dir === 'desc' ? 'asc' : 'desc';
      else P.state.sort = { key: k, dir: k === 'title' ? 'asc' : 'desc' };
      $('select[data-f="sort"]', P.panel).value = P.state.sort.key;
      $('select[data-f="dir"]', P.panel).value = P.state.sort.dir;
      P.state.filters.sort = P.state.sort.key; P.state.filters.dir = P.state.sort.dir;
      P.state.shown = P.SHOW_STEP; P.render(); return;
    }
    const rowBtn = e.target.closest('[data-row]');
    if (rowBtn) {
      const id = +rowBtn.closest('tr').getAttribute('data-id');
      if (rowBtn.getAttribute('data-row') === 'queue') {
        P.meta = await UXK.lib.updateMeta([id], (m) => ({ ...m, queue: !m.queue }));
        P.render(); P.refreshBadges();
      } else editMeta(id);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.getAttribute('data-act');
    switch (a) {
      case 'close': P.closePanel(); break;
      case 'refresh': if (P.state.busy) { P.setStatus('Cannot refresh during a bulk action'); break; } try { await P.ensureData(true); P.fillOptions(); P.render(); P.refreshBadges(); } catch (err) { P.setStatus('Load failed: ' + err.message + ' (check that you are signed in)'); } break;
      case 'apply': P.applyForm(); break;
      case 'reset': P.writeForm(P.DEFAULT_FILTERS()); P.applyForm(); break;
      case 'more': P.state.shown += P.SHOW_STEP; P.render(); break;
      case 'preset-save': {
        const name = await UXK.ui.prompt('Filter preset name', { placeholder: 'e.g. Not started, top rated, newest' });
        if (name && name.trim()) {
          P.presets[name.trim()] = P.readForm();
          const saved = await UXK.local.set(UXK.KEYS.presets, P.presets);
          P.fillOptions();
          UXK.ui.toast(saved ? `Preset "${name.trim()}" saved` : 'Could not save the preset. Reload the page and try again.', { kind: saved ? '' : 'err', timeout: saved ? 3500 : 7000 });
        }
        break;
      }
      case 'preset-del': {
        const ps = $('select[data-preset]', P.panel);
        const name = ps.value;
        if (!name) { UXK.ui.toast('Select a preset to delete first'); break; }
        delete P.presets[name];
        await UXK.local.set(UXK.KEYS.presets, P.presets);
        P.fillOptions();
        break;
      }
      case 'archive': bulkArchive(true); break;
      case 'unarchive': bulkArchive(false); break;
      case 'tag-add': case 'tag-del': {
        const t = await UXK.ui.prompt(a === 'tag-add' ? 'Tags to add' : 'Tags to remove', { placeholder: 'Comma-separated (e.g. data, spanish)' });
        if (!t) break;
        const list = t.split(',').map((s) => s.trim()).filter(Boolean);
        P.meta = await UXK.lib.updateMeta([...P.state.selected], (m) => ({
          ...m, tags: a === 'tag-add' ? Array.from(new Set(m.tags.concat(list))) : m.tags.filter((x) => !list.includes(x)),
        }));
        P.fillOptions(); P.render(); P.refreshBadges();
        break;
      }
      case 'queue-add': case 'queue-del':
        P.meta = await UXK.lib.updateMeta([...P.state.selected], (m) => ({ ...m, queue: a === 'queue-add' }));
        P.render(); P.refreshBadges();
        break;
      case 'sel-clear': P.state.selected.clear(); P.render(); break;
      case 'sel-all-matches': P.currentRows().forEach((c) => P.state.selected.add(c.id)); P.updateBulk(); break;
      case 'csv': exportCsv(); break;
      case 'md': exportMd(); break;
      case 'json': exportJson(); break;
    }
  }

  function onListChange(e) {
    const t = e.target;
    if (t.classList.contains('uxk-all')) {
      // 보이는 줄만 고른다. 조건에 맞는 전체를 고르려면 나타나는 "Select all N matching courses"를 누른다
      P.currentRows().slice(0, P.state.shown).forEach((c) => (t.checked ? P.state.selected.add(c.id) : P.state.selected.delete(c.id)));
      P.render();
    } else if (t.classList.contains('uxk-sel')) {
      const id = +t.closest('tr').getAttribute('data-id');
      t.checked ? P.state.selected.add(id) : P.state.selected.delete(id);
      P.updateBulk();
    }
  }

  // 체크박스를 누르면 그 줄이 기준점이 되고, Shift를 누른 채 다른 줄의 체크박스를 누르면 기준점부터 그 줄까지(보이는 순서대로) 누른 줄과 같은 상태로 한꺼번에 바뀐다. 기준점이 목록에 없으면 한 줄만 바뀐다
  function onListClick(e) {
    const t = e.target;
    if (!t.classList || !t.classList.contains('uxk-sel')) return;
    const id = +t.closest('tr').getAttribute('data-id');
    const from = P.state.anchor;
    P.state.anchor = id;
    if (!e.shiftKey || from == null || from === id) return;
    const ids = P.currentRows().map((c) => c.id);
    const a = ids.indexOf(from), b = ids.indexOf(id);
    if (a < 0 || b < 0) return;
    const range = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
    range.forEach((rid) => (t.checked ? P.state.selected.add(rid) : P.state.selected.delete(rid)));
    $$('tbody tr[data-id]', P.panel).forEach((tr) => { if (range.has(+tr.getAttribute('data-id'))) tr.querySelector('.uxk-sel').checked = t.checked; });
    const all = $('.uxk-all', P.panel);
    if (all) { const shownIds = ids.slice(0, P.state.shown); all.checked = shownIds.length > 0 && shownIds.every((rid) => P.state.selected.has(rid)); }
    P.updateBulk();
  }
  // Shift+클릭이 글자 범위 선택(파란 칠)으로 번지지 않게 막는다
  function onListMouseDown(e) {
    if (e.shiftKey && e.target.classList && e.target.classList.contains('uxk-sel')) e.preventDefault();
  }

  async function editMeta(id) {
    const c = P.byId.get(id);
    const m = P.meta[id] || { tags: [], memo: '' };
    const wrap = el('div');
    const tagIn = el('input', { class: 'uxk-input', type: 'text', placeholder: 'Comma-separated (e.g. data, work)' });
    tagIn.value = (m.tags || []).join(', ');
    const memoIn = el('textarea', { class: 'uxk-input', rows: 4, placeholder: 'Why you take this course, which parts, etc.' });
    memoIn.value = m.memo || '';
    wrap.append(el('div', { class: 'uxk-hint', text: c ? c.title : '' }), P.control('Tags', tagIn), P.control('Notes', memoIn));
    const ok = await UXK.ui.modal({ title: 'Tags & notes', body: wrap, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const tags = tagIn.value.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      P.meta = await UXK.lib.updateMeta([id], (x) => ({ ...x, tags: Array.from(new Set(tags)), memo: memoIn.value.trim() }));
    } catch (err) {
      await UXK.copyText(memoIn.value);
      UXK.ui.toast(`${err.message} (your note was copied to the clipboard)`, { kind: 'err', timeout: 9000 });
      return;
    }
    P.fillOptions(); P.render(); P.refreshBadges();
  }

  async function bulkArchive(toArchive) {
    if (P.state.busy) return;
    const ids = [...P.state.selected].filter((id) => { const c = P.byId.get(id); return c && c.archived !== toArchive; });
    if (!ids.length) return;
    const sample = ids.slice(0, 5).map((id) => '- ' + P.byId.get(id).title).join('\n');
    const verb = toArchive ? 'Archive' : 'Unarchive';
    const extra = toArchive
      ? `You can undo this from the Archived tab or Udemy\'s Archived filter. It takes about ${Math.max(1, Math.round((ids.length * 0.6) / 60))} min and can be stopped midway.`
      : 'Unarchiving uses a request format not yet verified against Udemy. If the first request fails it stops immediately; then unarchive manually on Udemy.';
    const ok = await UXK.ui.confirm(`${verb} ${ids.length} courses`, `${sample}${ids.length > 5 ? `\n... and ${ids.length - 5} more` : ''}\n\n${extra}`, { okLabel: verb, danger: toArchive });
    if (!ok) return;
    await runBulk(ids, toArchive, false);
  }

  // 보관/보관 해제를 한 강의씩 요청한다. 끝나면 되돌리기(Undo) 단추가 있는 알림을 띄우고, 되돌리기는 이 함수를 반대 방향으로 다시 부른다
  async function runBulk(ids, toArchive, isUndo) {
    const verb = toArchive ? 'Archive' : 'Unarchive';
    P.state.busy = true; P.updateBulk();
    let done = 0; const failed = []; const doneIds = [];
    let stopped = false;
    const stopAct = [{ label: 'Stop', close: false, onClick: () => { stopped = true; } }];
    const progress = UXK.ui.toast(`${verb}... 0 / ${ids.length}`, { id: 'uxk-bulk', timeout: 0, actions: stopAct });
    for (const id of ids) {
      if (stopped) break;
      try {
        if (toArchive) await UXK.api.archive(id); else await UXK.api.unarchive(id);
        done++; doneIds.push(id);
        P.state.selected.delete(id);
        const c = P.byId.get(id);
        if (c) c.archived = toArchive;
        P.hideNativeCard(id, toArchive);
      } catch (err) {
        failed.push(id);
        if (done === 0) {
          progress.close();
          P.state.busy = false; P.updateBulk();
          P.setStatus(`Stopped because the first request failed: ${err.message}${err.status === 403 ? ' (check security token / sign-in)' : err.status === 404 || err.status === 405 ? ' (request format differs from Udemy)' : ''}`);
          return;
        }
        if (failed.length >= 5) break;
      }
      progress.update(`${verb}... ${done + failed.length} / ${ids.length}`, { timeout: 0, actions: stopAct });
      await UXK.sleep(400);
    }
    progress.close();
    P.state.busy = false;
    if (P.cache) await UXK.lib.save(P.cache);
    P.render();
    const undo = !isUndo && doneIds.length ? [{ label: `Undo (${doneIds.length})`, onClick: () => { runBulk(doneIds, !toArchive, true).catch((err) => UXK.ui.toast(err && err.message ? err.message : String(err), { kind: 'err', timeout: 7000 })); } }] : [];
    UXK.ui.toast(`${isUndo ? 'Undo: ' : ''}${stopped ? 'Stopped · ' : ''}${verb} done: ${done}${failed.length ? `, ${failed.length} failed (selection kept)` : ''} · no reload needed`, { timeout: undo.length ? 15000 : 6000, actions: undo });
  }

  // ---------------- 내보내기 ----------------
  // 고른 강의가 있으면 그것만(현재 필터에 보이는 것 중), 없으면 필터·정렬 결과 전체를 내보낸다. 단추 글자(panel.js updateBulk)가 어느 쪽인지 보여 준다
  function exportRows() {
    const rows = P.currentRows();
    const picked = rows.filter((c) => P.state.selected.has(c.id));
    return picked.length ? picked : rows; // 고른 강의가 모두 지금 필터 밖이면 전체를 내보낸다 (단추 글자도 그때는 원래 글자)
  }
  const exportCount = () => { const n = exportRows().filter((c) => P.state.selected.has(c.id)).length; return n; };
  const linkOf = (c) => `${location.origin}/course-dashboard-redirect/?course_id=${c.id}`;
  function exportCsv() {
    const rows = exportRows();
    const q = UXK.csvCell;
    const head = ['Title', 'Link', 'Instructor', 'Category', 'Language', 'Captions', 'Rating', 'Bayesian rating', 'Reviews', 'Last updated', 'Hours', 'Students', 'Progress (%)', 'Purchased', 'Last accessed', 'Favorite', 'Archived', 'Tags', 'Queue', 'Notes'];
    const lines = [head.map(q).join(',')];
    rows.forEach((c) => {
      const m = P.meta[c.id] || {};
      lines.push([q(c.title), q(linkOf(c)), q(c.instructors), q(c.category), q(c.lang), q(c.captions.join(' / ')),
        c.rating ? c.rating.toFixed(2) : '', c.reviews ? UXK.lib.bayes(c, P.mean).toFixed(2) : '', c.reviews, c.updated || '', c.hours.toFixed(1), c.subs, c.progress,
        c.enrolled || '', c.accessed || '', c.favorite ? 'Y' : '', c.archived ? 'Y' : '', q((m.tags || []).join(', ')), m.queue ? 'Y' : '', q(m.memo || '')].join(','));
    });
    UXK.download(`udemy-courses-${UXK.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    UXK.ui.toast(`CSV saved: ${UXK.fmtNum(rows.length)} rows (Notion: Import → CSV)`);
  }
  function exportMd() {
    const rows = exportRows();
    const md = [`# Udemy learning list (${UXK.today()})`, '', ...rows.map((c) => `- [ ] [${c.title.replace(/[[\]]/g, '')}](${linkOf(c)}) — ★${c.rating ? c.rating.toFixed(1) : '-'} · ${c.hours ? c.hours.toFixed(1) + 'h' : '-'} · ${c.progress}% done${(P.meta[c.id] && P.meta[c.id].tags && P.meta[c.id].tags.length) ? ' · #' + P.meta[c.id].tags.join(' #') : ''}`)].join('\n');
    UXK.download(`udemy-checklist-${UXK.today()}.md`, md, 'text/markdown;charset=utf-8');
    UXK.ui.toast(`Markdown saved: ${UXK.fmtNum(rows.length)} lines (paste into Notion for a to-do list)`);
  }
  function exportJson() {
    const rows = exportRows().map((c) => ({ ...c, link: linkOf(c), meta: P.meta[c.id] || null }));
    UXK.download(`udemy-courses-${UXK.today()}.json`, JSON.stringify(rows, null, 2), 'application/json');
  }

  Object.assign(P, { onPanelClick, onListChange, onListClick, onListMouseDown, exportCount });
})();
