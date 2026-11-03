// 플레이어 자막: 자막 불러오기·번역, 이중 자막 표시, 문장 반복·A-B 반복·문장 복사/수집
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('subs')) return;
  P.parts.add('subs');

  // ======================= 자막 (이중 자막 / 문장 기능) =======================
  const subs = { gen: 0, key: null, captions: [], primary: null, second: [], secondInfo: null, idx: -1, loading: null, loadingKey: null, loop: null, ab: { a: null, b: null }, shadowDone: -1 };
  const mtCache = new Map();
  const locOf = (c) => String(c.locale_id || (c.locale && (c.locale.locale || c.locale)) || c.language || c.srclang || '').replace('-', '_');
  const bySource = (arr) => arr.slice().sort((a, b) => (a.source === 'auto') - (b.source === 'auto'));
  async function courseLang() { const c = await P.courseFromCache(); return c ? c.langCode : ''; }

  async function choosePrimary(caps) {
    if (!caps.length) return null;
    const pref = String(P.S.subs.primaryLang || 'auto').toLowerCase();
    const orig = caps.filter((c) => !c.is_translation);
    const pool = orig.length ? orig : caps;
    if (pref !== 'auto') {
      const m = bySource(caps.filter((c) => locOf(c).toLowerCase().startsWith(pref)));
      if (m.length) return m[0];
    }
    const lc = await courseLang();
    if (lc) {
      const m = bySource(pool.filter((c) => locOf(c).toLowerCase().startsWith(lc)));
      if (m.length) return m[0];
    }
    return bySource(pool)[0];
  }
  function chooseSecondary(caps, primary) {
    const pref = String(P.S.subs.secondaryLang || 'none').toLowerCase();
    if (pref === 'none') return null;
    if (locOf(primary).toLowerCase().startsWith(pref)) return null;
    return bySource(caps.filter((c) => c !== primary && locOf(c).toLowerCase().startsWith(pref)))[0] || null;
  }

  async function fetchCaption(url) {
    try {
      const sameOrigin = url.startsWith(location.origin);
      const r = await fetch(url, { credentials: sameOrigin ? 'include' : 'omit' });
      if (r.ok) {
        const t = await r.text();
        if (/WEBVTT|-->/.test(t)) return t;
      }
    } catch (e) { /* CORS 등 → background로 재시도 */ }
    const res = await UXK.bg({ type: 'fetchText', url });
    if (res && res.ok && /WEBVTT|-->/.test(res.text)) return res.text;
    throw new Error('자막 파일을 가져오지 못했습니다' + (res && res.error ? ` (${res.error})` : ''));
  }

  async function translateCues(cues, tl, lectureId) {
    const key = `${lectureId}:${tl}:${cues.length}:${(cues[0] && cues[0].text) || ''}`; // 같은 강의라도 원문 자막 트랙이 바뀌면 다른 번역
    if (mtCache.has(key)) return mtCache.get(key);
    const res = await UXK.bg({ type: 'translate', texts: cues.map((c) => c.text.replace(/\n/g, ' ')), tl });
    if (!res || !res.ok) throw new Error('기계번역 실패: ' + ((res && res.error) || '알 수 없음'));
    // 일부 문장이 빈 채로 온 결과(요청 제한 등)는 캐시하지 않아 다음에 다시 시도하게 한다
    if (res.texts.length === cues.length && res.texts.every((t, i) => t || !cues[i].text.trim())) {
      mtCache.set(key, res.texts);
      if (mtCache.size > 30) mtCache.delete(mtCache.keys().next().value);
    }
    return res.texts;
  }

  function applyNativeCc() {
    // 우리 자막이 실제로 로드된 뒤에만 Udemy 기본 자막을 숨김
    document.documentElement.classList.toggle('uxk-hide-native-cc', !!(P.S && P.S.subs.enabled && P.S.subs.hideNative && subs.primary));
  }
  function resetSubs() {
    subs.gen++; subs.loading = null; subs.loadingKey = null; // 진행 중이던 불러오기는 낡은 것이 되어 결과가 버려진다 (강의·언어 설정이 바뀐 경우)
    subs.key = null; subs.primary = null; subs.second = []; subs.secondInfo = null; subs.captions = []; subs.idx = -1; subs.loop = null; subs.ab = { a: null, b: null }; subs.shadowDone = -1;
    if (P.sub1) { P.sub1.textContent = ''; P.sub2.textContent = ''; }
    if (P.subsBox) P.subsBox.dataset.i = '';
    applyNativeCc();
  }
  const staleError = () => { const e = new Error('강의가 바뀌어 취소됨'); e.stale = true; return e; };

  // 시작 시점의 강의를 고정해서 쓴다 (도중에 강의가 바뀌어도 다른 강의 데이터와 섞이지 않게)
  function currentLecture() {
    if (P.ctx.lectureType !== 'lecture' || !P.ctx.lectureId) throw new Error('영상 강의에서만 사용할 수 있습니다');
    if (!P.ctx.courseId) throw new Error('강의 정보를 아직 찾지 못했습니다. 잠시 후 다시 시도하세요');
    return { courseId: P.ctx.courseId, lectureId: P.ctx.lectureId };
  }

  // 원문 자막만 받아온다 (보조 자막·기계번역은 요청하지 않음). onList는 자막 목록을 받은 직후 호출
  async function loadPrimary(courseId, lectureId, onList = () => {}) {
    const j = await UXK.api.lecture(courseId, lectureId);
    const caps = ((j && j.asset && j.asset.captions) || []).filter((c) => c && c.url);
    onList(caps);
    const p = await choosePrimary(caps);
    if (!p) { const err = new Error('이 강의에는 자막이 없습니다'); err.noCaps = true; throw err; }
    let pText;
    try { pText = await fetchCaption(p.url); } catch (e) {
      // 서명 URL 만료 가능성 → 한 번 새로 받기
      const j2 = await UXK.api.lecture(courseId, lectureId);
      const p2 = ((j2 && j2.asset && j2.asset.captions) || []).find((c) => c.url && locOf(c) === locOf(p));
      if (!p2) throw e;
      pText = await fetchCaption(p2.url);
    }
    return { caps, primary: { cap: p, cues: UXK.vtt.parse(pText) } };
  }

  async function ensureCues({ quiet = false } = {}) {
    const { courseId, lectureId } = currentLecture();
    const key = `${courseId}:${lectureId}`;
    if (subs.key === key && subs.primary) return subs;
    if (subs.loading && subs.loadingKey === key) return subs.loading;
    subs.loadingKey = key;
    const gen = subs.gen;
    const stale = () => subs.gen !== gen || subs.loadingKey !== key;
    const t0 = quiet ? null : UXK.ui.toast('자막 불러오는 중...', { id: 'uxk-subs-load', timeout: 0 });
    const mine = (async () => {
      const { caps, primary } = await loadPrimary(courseId, lectureId, (list) => {
        if (stale()) throw staleError();
        subs.captions = list;
      });
      const p = primary.cap;
      let second = [], secondInfo = null;
      const sCap = chooseSecondary(caps, p);
      if (sCap) {
        try {
          second = UXK.vtt.align(primary.cues, UXK.vtt.parse(await fetchCaption(sCap.url)));
          secondInfo = { kind: 'udemy', label: sCap.video_label || locOf(sCap) };
        } catch (e) { second = []; }
      }
      const tl = P.S.subs.secondaryLang;
      if (!second.length && P.S.subs.translate && tl !== 'none' && !locOf(p).toLowerCase().startsWith(tl)) {
        try {
          second = await translateCues(primary.cues, tl, lectureId);
          secondInfo = { kind: 'mt', label: `기계번역(${tl})` };
        } catch (e) { if (!quiet) UXK.ui.toast(e.message, { kind: 'err', timeout: 6000 }); }
      }
      if (stale()) throw staleError();
      Object.assign(subs, { key, primary, second, secondInfo, idx: -1, shadowDone: -1 });
      return subs;
    })();
    subs.loading = mine;
    try {
      const r = await mine;
      applyNativeCc();
      if (t0) {
        const s2 = subs.secondInfo ? ` + ${subs.secondInfo.label}` : (P.S.subs.secondaryLang !== 'none' ? ' (보조 자막 없음)' : '');
        t0.update(`자막: ${subs.primary.cap.video_label || locOf(subs.primary.cap)}${s2} · ${subs.primary.cues.length}문장`, { timeout: 2500 });
      }
      return r;
    } catch (e) {
      if (t0) t0.close();
      throw e;
    } finally {
      if (subs.loading === mine) subs.loading = null;
    }
  }

  function currentCueIndex(allowPrev = true) {
    if (!subs.primary || !P.ctx.video) return -1;
    const t = P.ctx.video.currentTime;
    let i = UXK.vtt.find(subs.primary.cues, t, subs.idx);
    if (i < 0 && allowPrev) {
      i = UXK.vtt.prevIndex(subs.primary.cues, t);
      if (i >= 0 && t - subs.primary.cues[i].end > 5) i = -1; // 아주 오래전 문장은 '방금 문장'으로 보지 않는다 (긴 무음 구간에서 엉뚱한 곳으로 되돌아가지 않게)
    }
    return i;
  }

  function renderSubs() {
    if (!P.subsBox) return;
    if (!P.S.subs.enabled || !subs.primary || !P.ctx.video) { if (P.subsBox.dataset.i !== '-2') { P.sub1.textContent = ''; P.sub2.textContent = ''; P.subsBox.dataset.i = '-2'; P.subsBox.classList.add('uxk-empty'); } return; }
    const cues = subs.primary.cues;
    const i = UXK.vtt.find(cues, P.ctx.video.currentTime, subs.idx);
    if (String(i) === P.subsBox.dataset.i) return;
    subs.idx = i;
    P.subsBox.dataset.i = String(i);
    P.sub1.textContent = i >= 0 && P.S.subs.showPrimary ? cues[i].text : '';
    P.sub2.textContent = i >= 0 && P.S.subs.showSecondary ? subs.second[i] || '' : '';
    P.subsBox.classList.toggle('uxk-empty', !(P.sub1.textContent || P.sub2.textContent));
  }

  P.lastT = 0;
  function tick() {
    const v = P.ctx.video;
    if (!v) return;
    const t = v.currentTime;
    if (subs.ab.a != null && subs.ab.b != null && t >= subs.ab.b) v.currentTime = subs.ab.a;
    else if (subs.loop && (t >= subs.loop.end || t < subs.loop.start - 0.5)) v.currentTime = subs.loop.start;
    if (P.S.subs.shadowPause && subs.primary && !v.paused && t >= P.lastT && t - P.lastT < 2) {
      // 직전 시각이 속한 문장의 끝(−0.08초)을 지났는지로 판정 → rAF가 멈추는 PiP·백그라운드·고배속에서도 놓치지 않음
      const cues = subs.primary.cues;
      const i = UXK.vtt.find(cues, P.lastT, subs.idx);
      if (i >= 0 && t >= cues[i].end - 0.08 && subs.shadowDone !== i) {
        subs.shadowDone = i;
        v.pause();
        if (t > cues[i].end + 0.15) v.currentTime = Math.max(cues[i].start, cues[i].end - 0.05);
        P.indicator('따라 말해 보세요 · Space로 계속');
      }
    }
    P.lastT = v.currentTime;
    renderSubs();
  }
  let rafOn = false;
  function rafLoop() {
    if (!P.ctx.video || P.ctx.video.paused || document.hidden) { rafOn = false; return; }
    tick();
    requestAnimationFrame(rafLoop);
  }
  function startRaf() { if (!rafOn) { rafOn = true; requestAnimationFrame(rafLoop); } }

  const noCapsNotified = new Set();
  const needCues = (s) => !!(s && (s.subs.enabled || s.subs.shadowPause));
  // 이중 자막 표시 또는 따라 말하기에 필요한 자막을 준비
  async function startSubs() {
    if (!needCues(P.S)) return;
    P.applyLayerStyle();
    if (P.ctx.lectureType !== 'lecture' || !P.ctx.courseId) return; // 코스 ID 확인 후 다시 호출됨
    try {
      await ensureCues({ quiet: !P.S.subs.enabled });
      renderSubs();
    } catch (e) {
      if (e.stale) return;
      if (e.noCaps) {
        if (noCapsNotified.has(P.ctx.courseId)) return;
        noCapsNotified.add(P.ctx.courseId);
      }
      UXK.ui.toast(e.message, { kind: 'err', timeout: 4000 });
    }
  }

  async function replayCue() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    subs.shadowDone = -1;
    P.ctx.video.currentTime = c.start + 0.01;
    P.ctx.video.play().catch(() => {});
    P.indicator('↺ 문장 다시 듣기');
  }
  async function toggleLoopCue() {
    if (subs.loop) { subs.loop = null; P.indicator('문장 반복 OFF'); return; }
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    subs.loop = { start: c.start, end: c.end };
    subs.ab = { a: null, b: null };
    P.indicator('문장 반복 ON');
    P.ctx.video.play().catch(() => {});
  }
  function abLoop() {
    if (!P.ctx.video) return;
    const t = P.ctx.video.currentTime;
    if (subs.ab.a == null) { subs.ab = { a: t, b: null }; subs.loop = null; P.indicator(`A 지점 ${UXK.fmtClock(t)}`); }
    else if (subs.ab.b == null) {
      let a = subs.ab.a, b = t;
      if (b < a) [a, b] = [b, a];
      if (b - a < 0.5) b = a + 0.5;
      subs.ab = { a, b };
      P.ctx.video.currentTime = a;
      P.indicator(`A-B 반복 ${UXK.fmtClock(a)}–${UXK.fmtClock(b)}`);
    } else { subs.ab = { a: null, b: null }; P.indicator('A-B 반복 해제'); }
  }
  async function copyCue() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const text = subs.primary.cues[i].text + (subs.second[i] ? '\n' + subs.second[i] : '');
    P.indicator((await UXK.copyText(text)) ? '문장 복사됨' : '복사 실패');
  }
  async function saveSentence() {
    await ensureCues();
    const i = currentCueIndex(true);
    if (i < 0) return;
    const c = subs.primary.cues[i];
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      courseId: P.ctx.courseId, courseTitle: P.courseTitle(), lectureId: P.ctx.lectureId, lectureTitle: P.lectureTitle(),
      t: Math.floor(c.start), text: c.text.replace(/\n/g, ' '), trans: (subs.second[i] || '').replace(/\n/g, ' '),
      lang: locOf(subs.primary.cap), url: P.lectureUrl(P.ctx.lectureId, c.start), created: new Date().toISOString(),
    };
    const list = await UXK.local.update(UXK.KEYS.sentences, (arr) => {
      arr = Array.isArray(arr) ? arr : [];
      if (!arr.some((x) => x.lectureId === entry.lectureId && x.t === entry.t && x.text === entry.text)) arr.push(entry); // 같은 초에 시작하는 다른 문장은 따로 저장
      if (arr.length > 5000) arr = arr.slice(-5000);
      return arr;
    }, []);
    P.indicator(`문장 저장됨 (총 ${list.length})`);
  }

  Object.assign(P, { subs, locOf, choosePrimary, fetchCaption, applyNativeCc, resetSubs, staleError,
    currentLecture, loadPrimary, ensureCues, renderSubs, tick, startRaf, needCues, startSubs, replayCue,
    toggleLoopCue, abLoop, copyCue, saveSentence });
})();
