// 플레이어 메모: 타임스탬프 메모, 메모 목록·내보내기, 메모 링크로 이동
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('notes')) return;
  P.parts.add('notes');
  const { el, esc } = UXK;

  // ======================= 메모 (로컬, 타임스탬프) =======================
  async function getNotes() { const all = await UXK.local.get(UXK.KEYS.notes, {}); return (all && all[P.ctx.courseId]) || []; }
  function addNote(note, cid = P.ctx.courseId) {
    return UXK.local.update(UXK.KEYS.notes, (all) => { all = all || {}; all[cid] = (all[cid] || []).concat(note); return all; }, {});
  }
  function deleteNote(id) {
    const cid = P.ctx.courseId;
    return UXK.local.update(UXK.KEYS.notes, (all) => {
      all = all || {};
      const left = (all[cid] || []).filter((n) => n.id !== id);
      if (left.length) all[cid] = left; else delete all[cid];
      return all;
    }, {});
  }
  async function quickNote() {
    if (!P.ctx.courseId) throw new Error('강의 정보를 찾지 못했습니다');
    const v = P.ctx.video;
    const t = v ? v.currentTime : 0;
    const courseId = P.ctx.courseId, lectureId = P.ctx.lectureId, title = P.lectureTitle(); // 입력하는 동안 강의가 바뀌어도 메모는 시작한 강의에 저장
    const wasPlaying = v && !v.paused;
    if (wasPlaying && P.S.player.notePause) v.pause();
    const text = await UXK.ui.prompt(`메모 · ${title} · ${UXK.fmtClock(t)}`, { multiline: true, placeholder: '내용 입력 · Ctrl+Enter 저장', hint: 'Udemy에 저장되지 않고 이 브라우저에만 저장됩니다. 노트 목록에서 Markdown으로 내보낼 수 있습니다.' });
    if (text && text.trim()) {
      const note = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), lectureId, lectureTitle: title, t: Math.floor(t), text: text.trim(), created: new Date().toISOString() };
      try {
        await addNote(note, courseId);
        UXK.ui.toast('메모 저장됨', { actions: [{ label: '노트 보기', onClick: openNotes }] });
        if (notesDrawer && notesDrawer.isOpen()) renderNotes();
      } catch (err) {
        // 저장 실패 시 입력 내용을 잃지 않도록 클립보드에 보존
        await UXK.copyText(text);
        UXK.ui.toast(`${err.message} 입력한 메모는 클립보드에 복사했습니다.`, { kind: 'err', timeout: 12000 });
      }
    }
    if (wasPlaying && P.S.player.notePause && v) v.play().catch(() => {});
  }
  let notesDrawer = null;
  async function openNotes() {
    notesDrawer = UXK.ui.drawer('notes', { title: '내 메모 (이 코스)', width: 440 });
    if (!notesDrawer.tools.childElementCount) {
      notesDrawer.tools.append(
        el('button', { class: 'uxk-btn', text: 'Markdown 복사', onclick: async () => UXK.ui.toast((await UXK.copyText(await notesMarkdown())) ? '복사됨' : '복사 실패') }),
        el('button', { class: 'uxk-btn', text: '.md 저장', onclick: async () => UXK.download(`${UXK.safeFile(P.courseTitle())}_notes.md`, await notesMarkdown(), 'text/markdown;charset=utf-8') }),
      );
      notesDrawer.body.addEventListener('click', onNotesClick);
    }
    notesDrawer.open();
    renderNotes();
  }
  async function sortedNotes() {
    const list = await getNotes();
    const items = (await P.getCurriculum()) || [];
    const order = new Map(items.map((x, i) => [x.id, i]));
    return list.slice().sort((a, b) => ((order.get(a.lectureId) ?? 1e9) - (order.get(b.lectureId) ?? 1e9)) || a.t - b.t);
  }
  async function renderNotes() {
    if (!notesDrawer) return;
    const list = await sortedNotes();
    if (!list.length) { notesDrawer.body.innerHTML = `<div class="uxk-hint">아직 메모가 없습니다. 영상에서 ${esc(P.S.hotkeys.note)}를 누르면 현재 시각과 함께 메모합니다.</div>`; return; }
    let last = null;
    notesDrawer.body.innerHTML = list.map((n) => {
      const head = n.lectureId !== last ? `<div class="uxk-note-lec">${esc(n.lectureTitle)}</div>` : '';
      last = n.lectureId;
      return `${head}<div class="uxk-note" data-id="${esc(n.id)}"><button class="uxk-note-t" data-go="${Number(n.lectureId) || 0}:${Number(n.t) || 0}">${UXK.fmtClock(Number(n.t) || 0)}</button><div class="uxk-note-x">${esc(n.text).replace(/\n/g, '<br>')}</div><button class="uxk-icon" data-del="${esc(n.id)}" title="삭제">×</button></div>`;
    }).join('');
  }
  async function onNotesClick(e) {
    const go = e.target.closest('[data-go]');
    if (go) {
      const [lid, t] = go.getAttribute('data-go').split(':').map(Number);
      if (lid === P.ctx.lectureId && P.ctx.video) { P.ctx.video.currentTime = t; P.ctx.video.play().catch(() => {}); }
      else location.assign(P.lectureUrl(lid, t));
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.getAttribute('data-del');
      try { await deleteNote(id); } catch (err) { UXK.ui.toast(err.message, { kind: 'err', timeout: 8000 }); }
      renderNotes();
    }
  }
  async function notesMarkdown() {
    const list = await sortedNotes();
    const out = [`# ${P.courseTitle()} — 메모`, ''];
    let last = null;
    list.forEach((n) => {
      if (n.lectureId !== last) { out.push('', `## ${n.lectureTitle}`, ''); last = n.lectureId; }
      out.push(`- [${UXK.fmtClock(n.t)}](${P.lectureUrl(n.lectureId, n.t)}) ${n.text.replace(/\n/g, '  \n  ')}`);
    });
    return out.join('\n') + '\n';
  }

  function deepLinkSeek() {
    const p = new URLSearchParams(location.search);
    const t = parseFloat(p.get('uxk_t'));
    if (!Number.isFinite(t) || !P.ctx.video) return;
    const v = P.ctx.video;
    const go = () => { v.currentTime = t; P.indicator(`${UXK.fmtClock(t)}로 이동`); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    p.delete('uxk_t');
    const qs = p.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  Object.assign(P, { quickNote, openNotes, deepLinkSeek });
})();
