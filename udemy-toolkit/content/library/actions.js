// 내 학습 동작: 패널 클릭 처리, 태그·메모 편집, 일괄 보관, CSV·Markdown·JSON 내보내기
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.libraryShared;
  if (!P || P.parts.has('actions')) return;
  P.parts.add('actions');
  const { el, $ } = UXK;

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
      case 'refresh': if (P.state.busy) { P.setStatus('일괄 처리 중에는 새로고침할 수 없습니다'); break; } try { await P.ensureData(true); P.fillOptions(); P.render(); P.refreshBadges(); } catch (err) { P.setStatus('불러오기 실패: ' + err.message + ' (로그인 상태 확인)'); } break;
      case 'apply': P.applyForm(); break;
      case 'reset': P.writeForm(P.DEFAULT_FILTERS()); P.applyForm(); break;
      case 'more': P.state.shown += P.SHOW_STEP; P.render(); break;
      case 'preset-save': {
        const name = await UXK.ui.prompt('필터 프리셋 이름', { placeholder: '예: 미시작 고평점 최신' });
        if (name && name.trim()) {
          P.presets[name.trim()] = P.readForm();
          const saved = await UXK.local.set(UXK.KEYS.presets, P.presets);
          P.fillOptions();
          UXK.ui.toast(saved ? `프리셋 "${name.trim()}" 저장됨` : '프리셋을 저장하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.', { kind: saved ? '' : 'err', timeout: saved ? 3500 : 7000 });
        }
        break;
      }
      case 'preset-del': {
        const ps = $('select[data-preset]', P.panel);
        const name = ps.value;
        if (!name) { UXK.ui.toast('삭제할 프리셋을 먼저 선택하세요'); break; }
        delete P.presets[name];
        await UXK.local.set(UXK.KEYS.presets, P.presets);
        P.fillOptions();
        break;
      }
      case 'archive': bulkArchive(true); break;
      case 'unarchive': bulkArchive(false); break;
      case 'tag-add': case 'tag-del': {
        const t = await UXK.ui.prompt(a === 'tag-add' ? '추가할 태그' : '제거할 태그', { placeholder: '쉼표로 여러 개 (예: 데이터, 스페인어)' });
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
      case 'csv': exportCsv(); break;
      case 'md': exportMd(); break;
      case 'json': exportJson(); break;
    }
  }

  function onListChange(e) {
    const t = e.target;
    if (t.classList.contains('uxk-all')) {
      P.currentRows().forEach((c) => (t.checked ? P.state.selected.add(c.id) : P.state.selected.delete(c.id)));
      P.render();
    } else if (t.classList.contains('uxk-sel')) {
      const id = +t.closest('tr').getAttribute('data-id');
      t.checked ? P.state.selected.add(id) : P.state.selected.delete(id);
      P.updateBulk();
    }
  }

  async function editMeta(id) {
    const c = P.byId.get(id);
    const m = P.meta[id] || { tags: [], memo: '' };
    const wrap = el('div');
    const tagIn = el('input', { class: 'uxk-input', type: 'text', placeholder: '쉼표로 구분 (예: 데이터, 실무)' });
    tagIn.value = (m.tags || []).join(', ');
    const memoIn = el('textarea', { class: 'uxk-input', rows: 4, placeholder: '왜 이 강의를 들을지, 들을 부분 등' });
    memoIn.value = m.memo || '';
    wrap.append(el('div', { class: 'uxk-hint', text: c ? c.title : '' }), P.control('태그', tagIn), P.control('메모', memoIn));
    const ok = await UXK.ui.modal({ title: '태그 · 메모', body: wrap, buttons: [{ label: '취소', value: false }, { label: '저장', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const tags = tagIn.value.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      P.meta = await UXK.lib.updateMeta([id], (x) => ({ ...x, tags: Array.from(new Set(tags)), memo: memoIn.value.trim() }));
    } catch (err) {
      await UXK.copyText(memoIn.value);
      UXK.ui.toast(`${err.message} (입력한 메모는 클립보드에 복사했습니다)`, { kind: 'err', timeout: 9000 });
      return;
    }
    P.fillOptions(); P.render(); P.refreshBadges();
  }

  async function bulkArchive(toArchive) {
    if (P.state.busy) return;
    const ids = [...P.state.selected].filter((id) => { const c = P.byId.get(id); return c && c.archived !== toArchive; });
    if (!ids.length) return;
    const sample = ids.slice(0, 5).map((id) => '- ' + P.byId.get(id).title).join('\n');
    const verb = toArchive ? '보관' : '보관 해제';
    const extra = toArchive
      ? `보관됨 탭이나 Udemy의 보관됨 필터에서 되돌릴 수 있습니다. 약 ${Math.max(1, Math.round((ids.length * 0.6) / 60))}분 걸리며 도중에 중지할 수 있습니다.`
      : '보관 해제는 Udemy에서 아직 확인하지 못한 요청 방식을 씁니다. 첫 요청이 실패하면 바로 멈추고, 그때는 Udemy 화면에서 직접 해제해야 합니다.';
    const ok = await UXK.ui.confirm(`${ids.length}개 강의 ${verb}`, `${sample}${ids.length > 5 ? `\n... 외 ${ids.length - 5}개` : ''}\n\n${extra}`, { okLabel: verb, danger: toArchive });
    if (!ok) return;
    P.state.busy = true; P.updateBulk();
    let done = 0; const failed = [];
    let stopped = false;
    const stopAct = [{ label: '중지', close: false, onClick: () => { stopped = true; } }];
    const progress = UXK.ui.toast(`${verb} 중... 0 / ${ids.length}`, { id: 'uxk-bulk', timeout: 0, actions: stopAct });
    for (const id of ids) {
      if (stopped) break;
      try {
        if (toArchive) await UXK.api.archive(id); else await UXK.api.unarchive(id);
        done++;
        P.state.selected.delete(id);
        const c = P.byId.get(id);
        if (c) c.archived = toArchive;
        P.hideNativeCard(id, toArchive);
      } catch (err) {
        failed.push(id);
        if (done === 0) {
          progress.close();
          P.state.busy = false; P.updateBulk();
          P.setStatus(`첫 요청이 실패해 중단했습니다: ${err.message}${err.status === 403 ? ' (보안 토큰/로그인 확인)' : err.status === 404 || err.status === 405 ? ' (요청 방식이 Udemy와 다름)' : ''}`);
          return;
        }
        if (failed.length >= 5) break;
      }
      progress.update(`${verb} 중... ${done + failed.length} / ${ids.length}`, { timeout: 0, actions: stopAct });
      await UXK.sleep(400);
    }
    progress.close();
    P.state.busy = false;
    if (P.cache) await UXK.lib.save(P.cache);
    P.render();
    UXK.ui.toast(`${stopped ? '중지됨 · ' : ''}${verb} 완료 ${done}개${failed.length ? `, 실패 ${failed.length}개 (선택 유지)` : ''} · 새로고침 없이 처리됨`, { timeout: 6000 });
  }

  // ---------------- 내보내기 ----------------
  function exportRows() { return P.currentRows(); }
  const linkOf = (c) => `${location.origin}/course-dashboard-redirect/?course_id=${c.id}`;
  function exportCsv() {
    const rows = exportRows();
    const q = UXK.csvCell;
    const head = ['제목', '링크', '강사', '카테고리', '언어', '자막', '별점', '신뢰별점', '리뷰수', '최근업데이트', '시간(h)', '수강생수', '진행률(%)', '구매일', '최근접속', '즐겨찾기', '보관', '태그', '학습큐', '메모'];
    const lines = [head.map(q).join(',')];
    rows.forEach((c) => {
      const m = P.meta[c.id] || {};
      lines.push([q(c.title), q(linkOf(c)), q(c.instructors), q(c.category), q(c.lang), q(c.captions.join(' / ')),
        c.rating ? c.rating.toFixed(2) : '', c.reviews ? UXK.lib.bayes(c, P.mean).toFixed(2) : '', c.reviews, c.updated || '', c.hours.toFixed(1), c.subs, c.progress,
        c.enrolled || '', c.accessed || '', c.favorite ? 'Y' : '', c.archived ? 'Y' : '', q((m.tags || []).join(', ')), m.queue ? 'Y' : '', q(m.memo || '')].join(','));
    });
    UXK.download(`udemy-courses-${UXK.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    UXK.ui.toast(`CSV ${UXK.fmtNum(rows.length)}행 저장 (Notion: 가져오기 → CSV)`);
  }
  function exportMd() {
    const rows = exportRows();
    const md = [`# Udemy 학습 목록 (${UXK.today()})`, '', ...rows.map((c) => `- [ ] [${c.title.replace(/[[\]]/g, '')}](${linkOf(c)}) — ★${c.rating ? c.rating.toFixed(1) : '-'} · ${c.hours ? c.hours.toFixed(1) + 'h' : '-'} · 진행 ${c.progress}%${(P.meta[c.id] && P.meta[c.id].tags && P.meta[c.id].tags.length) ? ' · #' + P.meta[c.id].tags.join(' #') : ''}`)].join('\n');
    UXK.download(`udemy-checklist-${UXK.today()}.md`, md, 'text/markdown;charset=utf-8');
    UXK.ui.toast(`Markdown ${UXK.fmtNum(rows.length)}줄 저장 (Notion에 붙여넣으면 할 일 목록)`);
  }
  function exportJson() {
    const rows = exportRows().map((c) => ({ ...c, link: linkOf(c), meta: P.meta[c.id] || null }));
    UXK.download(`udemy-courses-${UXK.today()}.json`, JSON.stringify(rows, null, 2), 'application/json');
  }

  Object.assign(P, { onPanelClick, onListChange });
})();
