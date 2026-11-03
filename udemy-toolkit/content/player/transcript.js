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
      const t0 = UXK.ui.toast('대본 불러오는 중...', { id: 'uxk-transcript-load', timeout: 0 });
      try { primary = (await P.loadPrimary(courseId, lectureId)).primary; } finally { t0.close(); }
    }
    if (P.ctx.lectureId !== lectureId) throw P.staleError();
    const cues = primary.cues;
    if (!cues.length) throw new Error('자막 내용이 비어 있습니다');
    const label = primary.cap.video_label || P.locOf(primary.cap);
    P.indicator((await UXK.copyText(UXK.vtt.toText(cues))) ? `대본 복사됨 (${label} · ${cues.length}문장)` : '복사 실패');
  }

  // 자막 메뉴: 언어 선택, 켜기/끄기, 내보내기
  async function openSubsMenu() {
    const wrap = el('div', { class: 'uxk-menu-body' });
    const onoff = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: P.S.subs.enabled }), ' 이중 자막 표시']);
    wrap.appendChild(onoff);
    let caps = P.subs.captions;
    if (!caps.length && P.ctx.lectureType === 'lecture' && P.ctx.courseId) {
      try { const j = await UXK.api.lecture(P.ctx.courseId, P.ctx.lectureId); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); P.subs.captions = caps; } catch (e) {}
    }
    const langs = Array.from(new Map(caps.map((c) => [P.locOf(c).slice(0, 2).toLowerCase(), c.video_label || P.locOf(c)])).entries());
    const mk = (label, cur, includeAuto, includeNone) => {
      const s = el('select', { class: 'uxk-input' });
      if (includeAuto) s.appendChild(el('option', { value: 'auto', text: '자동 (강의 원어)' }));
      if (includeNone) s.appendChild(el('option', { value: 'none', text: '사용 안 함' }));
      langs.forEach(([code, lab]) => s.appendChild(el('option', { value: code, text: `${lab} (${code})` })));
      if (![...s.options].some((o) => o.value === cur)) s.appendChild(el('option', { value: cur, text: `${cur} (이 강의엔 없음)` }));
      s.value = cur;
      return el('label', { class: 'uxk-field' }, [el('span', { text: label }), s]);
    };
    const pSel = mk('원문 자막', P.S.subs.primaryLang, true, false);
    const sSel = mk('보조 자막', P.S.subs.secondaryLang, false, true);
    wrap.append(pSel, sSel);
    wrap.appendChild(el('div', { class: 'uxk-hint', text: caps.length ? `이 강의 자막 ${caps.length}종: ${caps.map((c) => c.video_label || P.locOf(c)).join(', ')}` : '이 강의의 자막 목록을 가져오지 못했습니다.' }));
    const mt = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: P.S.subs.translate }), ' 보조 자막이 없으면 기계번역 (옵션에서 권한 허용 필요)']);
    const shadow = el('label', { class: 'uxk-chk' }, [el('input', { type: 'checkbox', checked: P.S.subs.shadowPause }), ' 따라 말하기: 문장마다 일시정지']);
    wrap.append(mt, shadow);
    const exp = el('div', { class: 'uxk-row' }, [
      el('button', { class: 'uxk-btn', text: '이 강의 자막 내보내기', onclick: () => exportLecture().catch((e) => { if (!e.stale) UXK.ui.toast(e.message, { kind: 'err' }); }) }),
      el('button', { class: 'uxk-btn', text: '코스 전체 자막 (Markdown)', onclick: () => exportCourseTranscript() }),
    ]);
    wrap.appendChild(exp);
    const ok = await UXK.ui.modal({ title: '자막', body: wrap, width: 520, buttons: [{ label: '닫기', value: false }, { label: '적용', value: true, primary: true }], closeValue: false });
    if (!ok) return;
    const next = {
      enabled: onoff.querySelector('input').checked,
      primaryLang: pSel.querySelector('select').value,
      secondaryLang: sSel.querySelector('select').value,
      translate: mt.querySelector('input').checked,
      shadowPause: shadow.querySelector('input').checked,
    };
    if (next.translate && !P.S.subs.translate) {
      const perm = await UXK.bg({ type: 'hasTranslatePermission' });
      if (!perm || !perm.ok || !perm.has) {
        next.translate = false;
        UXK.ui.toast('기계번역은 설정 페이지에서 켜야 사이트 접근 권한을 허용할 수 있습니다.', { timeout: 8000, actions: [{ label: '설정 열기', onClick: () => UXK.bg({ type: 'openOptions', hash: 'subs' }) }] });
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
    const wrap = el('div', { class: 'uxk-menu-body' }, [el('div', { class: 'uxk-hint', text: `${cues.length}문장 · 원문 ${P.subs.primary.cap.video_label || P.locOf(P.subs.primary.cap)}${P.subs.secondInfo ? ' · 보조 ' + P.subs.secondInfo.label : ''}` })]);
    const act = (label, fn) => el('button', { class: 'uxk-btn', text: label, onclick: fn });
    wrap.appendChild(el('div', { class: 'uxk-row uxk-wrap' }, [
      act('클립보드 복사 (원문)', async () => UXK.ui.toast((await UXK.copyText(UXK.vtt.toText(cues))) ? '복사됨' : '복사 실패')),
      act('TXT 원문', () => UXK.download(base + '.txt', UXK.vtt.toText(cues))),
      second && act('TXT 이중', () => UXK.download(base + '.bilingual.txt', UXK.vtt.toText(cues, second))),
      act('SRT 원문', () => UXK.download(base + '.srt', UXK.vtt.toSRT(cues))),
      second && act('SRT 이중', () => UXK.download(base + '.bilingual.srt', UXK.vtt.toSRT(cues, second))),
      act('Markdown (타임스탬프 링크)', () => UXK.download(base + '.md', `# ${title}\n\n${UXK.vtt.toMarkdown(cues, second, (t) => P.lectureUrl(lectureId, t))}\n`, 'text/markdown;charset=utf-8')),
    ]));
    await UXK.ui.modal({ title: '이 강의 자막 내보내기', body: wrap, width: 560, buttons: [{ label: '닫기', value: true }] });
  }

  P.exportAbort = null;
  async function exportCourseTranscript() {
    if (!P.ctx.courseId) return UXK.ui.toast('강의 정보를 찾지 못했습니다', { kind: 'err' });
    if (P.exportAbort) return UXK.ui.toast('이미 내보내는 중입니다');
    const ok = await UXK.ui.confirm('코스 전체 자막 내보내기', '모든 영상 강의의 자막을 순서대로 받아 Markdown 한 파일로 저장합니다.\n요청 간격을 두고 진행하므로 강의 수에 따라 몇 분 걸릴 수 있습니다. 개인 학습용으로만 사용하세요.', { okLabel: '시작' });
    if (!ok) return;
    P.exportAbort = { stop: false };
    const prog = UXK.ui.toast('커리큘럼 불러오는 중...', { id: 'uxk-course-export', timeout: 0, actions: [{ label: '중지', close: false, onClick: () => { P.exportAbort.stop = true; } }] });
    try {
      const items = await UXK.api.curriculum(P.ctx.courseId, { withCaptions: true });
      const lectures = items.filter((i) => i._class === 'lecture' && i.asset && /video/i.test(i.asset.asset_type || ''));
      const out = [`# ${P.courseTitle()}`, '', `> 자막 원문 · 내보낸 날짜 ${UXK.today()} · 개인 학습용`, ''];
      let chapterTitle = null, done = 0, missing = 0, failedN = 0;
      const chapterOf = new Map();
      let ch = null;
      items.forEach((i) => { if (i._class === 'chapter') ch = i.title; else chapterOf.set(i.id, ch); });
      for (const lec of lectures) {
        if (P.exportAbort.stop) break;
        const chT = chapterOf.get(lec.id);
        if (chT && chT !== chapterTitle) { chapterTitle = chT; out.push(`## ${chT}`, ''); }
        out.push(`### ${lec.title}`, '', `[강의로 이동](${P.lectureUrl(lec.id)})`, '');
        let caps = ((lec.asset && lec.asset.captions) || []).filter((c) => c.url);
        if (!caps.length) {
          try { const j = await UXK.api.lecture(P.ctx.courseId, lec.id); caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c.url); } catch (e) {}
          await UXK.sleep(500);
        }
        const p = await P.choosePrimary(caps);
        if (!p) { out.push('_자막 없음_', ''); missing++; }
        else {
          try { out.push(UXK.vtt.toText(UXK.vtt.parse(await P.fetchCaption(p.url))), ''); } catch (e) { out.push('_자막을 가져오지 못함_', ''); failedN++; }
        }
        done++;
        prog.update(`코스 자막 내보내는 중... ${done} / ${lectures.length}`, { timeout: 0 });
        await UXK.sleep(300 + Math.random() * 300);
      }
      UXK.download(`${UXK.safeFile(P.courseTitle())}_transcript.md`, out.join('\n'), 'text/markdown;charset=utf-8');
      prog.update(`${P.exportAbort.stop ? '중지됨 · ' : ''}강의 ${done}개 저장${missing ? ` · 자막 없음 ${missing}` : ''}${failedN ? ` · 가져오기 실패 ${failedN}` : ''}`, { timeout: 7000, actions: [] });
    } catch (e) {
      prog.update('코스 자막 내보내기 실패: ' + e.message, { timeout: 7000, actions: [], kind: 'err' });
    } finally {
      P.exportAbort = null;
    }
  }

  Object.assign(P, { copyTranscript, openSubsMenu, exportLecture, exportCourseTranscript });
})();
