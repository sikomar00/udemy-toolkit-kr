// 플레이어 대본: 대본 복사, 자막 메뉴, 이 강의/코스 전체 자막 내보내기
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('transcript')) return;
  P.parts.add('transcript');
  const { el } = UXK;

  // 복사할 때는 원문만 필요하므로 보조 자막·기계번역을 일으키는 ensureCues는 쓰지 않는다 (이미 로드된 자막이 있으면 재사용)
  async function copyTranscript() {
    const { courseId, lectureId } = P.currentLecture();
    let primary = P.subs.key === `${courseId}:${lectureId}` ? P.subs.primary : null;
    if (!primary) {
      // indicator는 1초쯤에 사라지므로 오래 걸릴 수 있는 불러오기는 토스트로 알린다
      const t0 = UXK.ui.toast('Loading transcript...', { id: 'uxk-transcript-load', timeout: 0 });
      try { primary = (await P.loadPrimary(courseId, lectureId)).primary; } finally { t0.close(); }
    }
    if (P.ctx.lectureId !== lectureId) throw P.staleError();
    const cues = primary.cues;
    if (!cues.length) throw new Error('The subtitle file is empty');
    const label = primary.cap.video_label || P.locOf(primary.cap);
    P.indicator((await UXK.copyText(UXK.vtt.toText(cues))) ? `Transcript copied (${label} · ${cues.length} sentences)` : 'Copy failed');
  }

  // 자막 메뉴: 언어 선택, 켜기/끄기, 내보내기
  async function openSubsMenu() {
    const wrap = el('div', { class: 'uxk-menu-body' });
    const onoff = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: P.S.subs.enabled }), ' Show dual subtitles']);
    wrap.appendChild(onoff);
    let caps = P.subs.captions;
    if (!caps.length && P.ctx.lectureType === 'lecture' && P.ctx.courseId) {
      try { const j = await UXK.api.lecture(P.ctx.courseId, P.ctx.lectureId); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); P.subs.captions = caps; } catch (e) {}
    }
    const langs = Array.from(new Map(caps.map((c) => [P.locOf(c).slice(0, 2).toLowerCase(), c.video_label || P.locOf(c)])).entries());
    const mk = (label, cur, includeAuto, includeNone) => {
      const s = el('select', { class: 'uxk-input' });
      if (includeAuto) s.appendChild(el('option', { value: 'auto', text: 'Auto (course language)' }));
      if (includeNone) s.appendChild(el('option', { value: 'none', text: 'None' }));
      langs.forEach(([code, lab]) => s.appendChild(el('option', { value: code, text: `${lab} (${code})` })));
      if (![...s.options].some((o) => o.value === cur)) s.appendChild(el('option', { value: cur, text: `${cur} (not in this course)` }));
      s.value = cur;
      return el('label', { class: 'uxk-field' }, [el('span', { text: label }), s]);
    };
    const pSel = mk('Primary subtitles', P.S.subs.primaryLang, true, false);
    const sSel = mk('Secondary subtitles', P.S.subs.secondaryLang, false, true);
    wrap.append(pSel, sSel);
    wrap.appendChild(el('div', { class: 'uxk-hint', text: caps.length ? `${caps.length} caption languages in this course: ${caps.map((c) => c.video_label || P.locOf(c)).join(', ')}` : 'Could not load this course\'s caption list.' }));
    const mt = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: P.S.subs.translate }), ' Machine-translate if no secondary subtitles exist (permission must be allowed in Settings)']);
    wrap.append(mt);
    const exp = el('div', { class: 'uxk-row' }, [
      el('button', { class: 'uxk-btn', text: 'Export this lecture\'s subtitles', onclick: () => exportLecture().catch((e) => { if (!e.stale) UXK.ui.toast(e.message, { kind: 'err' }); }) }),
      el('button', { class: 'uxk-btn', text: 'Whole-course subtitles (Markdown)', onclick: () => exportCourseTranscript() }),
    ]);
    wrap.appendChild(exp);
    const ok = await UXK.ui.modal({ title: 'Subtitles', body: wrap, width: 520, buttons: [{ label: 'Close', value: false }, { label: 'Apply', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const next = {
      enabled: onoff.querySelector('input').checked,
      primaryLang: pSel.querySelector('select').value,
      secondaryLang: sSel.querySelector('select').value,
      translate: mt.querySelector('input').checked,
    };
    if (next.translate && !P.S.subs.translate) {
      const perm = await UXK.bg({ type: 'hasTranslatePermission' });
      if (!perm || !perm.ok || !perm.has) {
        next.translate = false;
        UXK.ui.toast('Turn on machine translation on the settings page to grant site access.', { timeout: 8000, actions: [{ label: 'Open settings', onClick: () => UXK.bg({ type: 'openOptions', hash: 'subs' }) }] });
      }
    }
    const langChanged = next.primaryLang !== P.S.subs.primaryLang || next.secondaryLang !== P.S.subs.secondaryLang || next.translate !== P.S.subs.translate;
    await UXK.saveSettings({ subs: next });
    if (langChanged) P.resetSubs();
    if (P.needCues(P.S)) P.startSubs();
  }

  async function exportLecture() {
    await P.ensureCues();
    const lectureId = P.ctx.lectureId, title = P.lectureTitle(); // 창을 열어 둔 사이 강의가 바뀌어도 이 강의의 제목·링크로 내보낸다
    const cues = P.subs.primary.cues;
    const second = P.subs.second.length ? P.subs.second : null;
    const base = UXK.safeFile(`${P.courseTitle()} - ${P.lectureTitle()}`);
    const wrap = el('div', { class: 'uxk-menu-body' }, [el('div', { class: 'uxk-hint', text: `${cues.length} sentences · primary ${P.subs.primary.cap.video_label || P.locOf(P.subs.primary.cap)}${P.subs.secondInfo ? ' · secondary ' + P.subs.secondInfo.label : ''}` })]);
    const act = (label, fn) => el('button', { class: 'uxk-btn', text: label, onclick: fn });
    wrap.appendChild(el('div', { class: 'uxk-row uxk-wrap' }, [
      act('Copy to clipboard (primary)', async () => UXK.ui.toast((await UXK.copyText(UXK.vtt.toText(cues))) ? 'Copied' : 'Copy failed')),
      act('TXT (primary)', () => UXK.download(base + '.txt', UXK.vtt.toText(cues))),
      second && act('TXT (dual)', () => UXK.download(base + '.bilingual.txt', UXK.vtt.toText(cues, second))),
      act('SRT (primary)', () => UXK.download(base + '.srt', UXK.vtt.toSRT(cues))),
      second && act('SRT (dual)', () => UXK.download(base + '.bilingual.srt', UXK.vtt.toSRT(cues, second))),
      act('Markdown (timestamp links)', () => UXK.download(base + '.md', `# ${title}\n\n${UXK.vtt.toMarkdown(cues, second, (t) => P.lectureUrl(lectureId, t))}\n`, 'text/markdown;charset=utf-8')),
    ]));
    await UXK.ui.modal({ title: 'Export this lecture\'s subtitles', body: wrap, width: 560, buttons: [{ label: 'Close', value: true }] });
  }

  P.exportAbort = null;
  async function exportCourseTranscript() {
    if (!P.ctx.courseId) return UXK.ui.toast('Course info not found', { kind: 'err' });
    if (P.exportAbort) return UXK.ui.toast('Export already in progress');
    const ok = await UXK.ui.confirm('Export whole-course subtitles', 'Downloads the subtitles of every video lecture in order and saves them as one Markdown file.\nRequests are spaced out, so it may take several minutes depending on the number of lectures. For personal study only.', { okLabel: 'Start' });
    if (!ok) return;
    P.exportAbort = { stop: false };
    const prog = UXK.ui.toast('Loading curriculum...', { id: 'uxk-course-export', timeout: 0, actions: [{ label: 'Stop', close: false, onClick: () => { P.exportAbort.stop = true; } }] });
    try {
      const items = await UXK.api.curriculum(P.ctx.courseId, { withCaptions: true });
      const lectures = items.filter((i) => i._class === 'lecture' && i.asset && /video/i.test(i.asset.asset_type || ''));
      const out = [`# ${P.courseTitle()}`, '', `> Primary subtitles · exported ${UXK.today()} · for personal study`, ''];
      let chapterTitle = null, done = 0, missing = 0, failedN = 0;
      const chapterOf = new Map();
      let ch = null;
      items.forEach((i) => { if (i._class === 'chapter') ch = i.title; else chapterOf.set(i.id, ch); });
      for (const lec of lectures) {
        if (P.exportAbort.stop) break;
        const chT = chapterOf.get(lec.id);
        if (chT && chT !== chapterTitle) { chapterTitle = chT; out.push(`## ${chT}`, ''); }
        out.push(`### ${lec.title}`, '', `[Go to lecture](${P.lectureUrl(lec.id)})`, '');
        let caps = ((lec.asset && lec.asset.captions) || []).filter((c) => c.url);
        if (!caps.length) {
          try { const j = await UXK.api.lecture(P.ctx.courseId, lec.id); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); } catch (e) {}
          await UXK.sleep(500);
        }
        const p = await P.choosePrimary(caps);
        if (!p) { out.push('_No subtitles_', ''); missing++; }
        else {
          try { out.push(UXK.vtt.toText(UXK.vtt.parse(await P.fetchCaption(p.url))), ''); } catch (e) { out.push('_Could not fetch subtitles_', ''); failedN++; }
        }
        done++;
        prog.update(`Exporting course subtitles... ${done} / ${lectures.length}`, { timeout: 0 });
        await UXK.sleep(300 + Math.random() * 300);
      }
      UXK.download(`${UXK.safeFile(P.courseTitle())}_transcript.md`, out.join('\n'), 'text/markdown;charset=utf-8');
      prog.update(`${P.exportAbort.stop ? 'Stopped · ' : ''}${done} lectures saved${missing ? ` · ${missing} without subtitles` : ''}${failedN ? ` · ${failedN} failed to fetch` : ''}`, { timeout: 7000, actions: [] });
    } catch (e) {
      prog.update('Course subtitle export failed: ' + e.message, { timeout: 7000, actions: [], kind: 'err' });
    } finally {
      P.exportAbort = null;
    }
  }

  Object.assign(P, { copyTranscript, openSubsMenu, exportLecture, exportCourseTranscript });
})();
