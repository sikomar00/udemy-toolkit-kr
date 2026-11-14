(async () => {
  const UXK = globalThis.UXK;
  const $ = (s) => document.querySelector(s);
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  let S = await UXK.getSettings();
  UXK.i18n.initPage(S);

  // 빠른 설정
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const build = (p, v) => p.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);
  document.querySelectorAll('[data-k]').forEach((n) => {
    n.checked = !!getPath(S, n.dataset.k);
    n.addEventListener('change', async () => { S = await UXK.saveSettings(build(n.dataset.k, n.checked)); });
  });

  // 오늘 학습
  const st = (await UXK.local.get(UXK.KEYS.stats, { days: {} })) || { days: {} };
  const goal = Math.max(0, S.stats.dailyGoalMin || 0) * 60;
  const dayKey = (o) => { const d = new Date(); d.setDate(d.getDate() - o); return UXK.today(d); };
  const secOf = (k) => (st.days && st.days[k] ? st.days[k].sec : 0);
  const today = secOf(dayKey(0));
  $('#today-txt').textContent = UXK.t('{0} min', Math.round(today / 60)) + (goal ? UXK.t(' / goal {0} min', S.stats.dailyGoalMin) : '');
  const pct = Math.round(goal ? Math.min(100, (today / goal) * 100) : today ? 100 : 0);
  $('#today-bar').style.width = `${pct}%`;
  $('#today-meter').setAttribute('aria-valuenow', String(pct));
  $('#today-meter').setAttribute('aria-valuetext', $('#today-txt').textContent);
  const meets = (k) => (goal ? secOf(k) >= goal : secOf(k) >= 60);
  let streak = 0, i = meets(dayKey(0)) ? 0 : 1;
  while (i < 3650 && meets(dayKey(i))) { streak++; i++; } // 잘못된 목표값이 와도 끝나도록 10년 상한
  let week = 0;
  for (let k = 0; k < 7; k++) week += secOf(dayKey(k));
  $('#streak').textContent = UXK.t('{0}-day streak · last 7 days {1}', streak, UXK.fmtDur(week));

  // 평가 요청: 많이 써 본 사람에게만 조용히 한 번 묻는다. 닫기·미루기를 존중하고, 평가를 대가로 기능을 막거나 열어 주지 않는다
  const fb = (await UXK.local.get(UXK.KEYS.feedback, {})) || {};
  if (UXK.reviewDue(st, fb)) $('#review').hidden = false;
  const closeReview = async (patch) => { $('#review').hidden = true; await UXK.local.update(UXK.KEYS.feedback, (o) => ({ ...(o || {}), ...patch }), {}); };
  $('#review-go').onclick = () => { chrome.tabs.create({ url: UXK.LINKS.reviews }); closeReview({ done: true }); };
  $('#review-issue').onclick = () => chrome.tabs.create({ url: UXK.LINKS.issues });
  $('#review-later').onclick = () => closeReview({ snoozeUntil: Date.now() + 30 * 864e5 });
  $('#review-never').onclick = () => closeReview({ done: true });

  // 현재 탭이 Udemy 강의라면 제어
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLearn = tab && /^https:\/\/([a-z0-9-]+\.)*udemy\.com\/course\/[^/]+\/learn\//.test(tab.url || '');
  async function send(action) {
    try { return await chrome.tabs.sendMessage(tab.id, { type: 'player', action }); } catch (e) { return null; }
  }
  async function refreshTab(action) {
    const r = await send(action);
    if (!r || !r.ok) return;
    $('#tab-box').hidden = false;
    $('#tab-lecture').textContent = r.lecture ? `${r.course} · ${r.lecture}` : r.course || '';
    $('#tab-speed').textContent = `${Number(r.speed).toFixed(2)}x`;
    const rem = r.remaining;
    $('#tab-remain').textContent = rem ? UXK.t('{0} left{1}{2}', UXK.fmtDur(rem.remain), '', rem.exact ? UXK.t(' · {0}/{1} done', rem.nDone, rem.n) : UXK.t(' (est.)')) : '';
  }
  if (isLearn) {
    await refreshTab(null);
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => refreshTab(b.dataset.act)));
  }

  // 화면 구조 점검: 지금 보는 Udemy 탭에서 확장이 기대는 화면 요소가 있는지 확인
  const isUdemy = tab && /^https:\/\/([a-z0-9-]+\.)*udemy\.com\//.test(tab.url || '');
  let diagFull = '';
  $('#diag').onclick = async () => {
    $('#diag-box').hidden = false;
    $('#diag-copy').textContent = 'Copy Result';
    let r = null;
    if (isUdemy) { try { r = await chrome.tabs.sendMessage(tab.id, { type: 'diagnose' }); } catch (e) {} }
    $('#diag-copy').hidden = !(r && r.ok);
    if (!r || !r.ok) {
      $('#diag-out').textContent = UXK.t(isUdemy ? 'Cannot check this tab. Make sure it is a Udemy lecture, My Learning or search page (www.udemy.com); if you just updated the extension, reload the tab and try again.' : 'Open a Udemy tab, then open this popup and press the button.');
      $('#diag-hint').textContent = '';
      return;
    }
    const line = (c) => {
      if (c.count) return `✓ ${c.name} (${c.count})`;
      return c.optional ? `– ${c.name} (0) · normal if this is not the matching page` : `✗ ${c.name} (0)\n    Impact: ${c.impact}`;
    };
    const head = `Toolkit for Udemy v${chrome.runtime.getManifest().version} · page type: ${r.route}${r.route === 'player' ? ` · dual subs: ${{ box: 'in caption band', overlay: 'over video' }[r.capMode] || 'off'}${r.nativeCc ? ` · hidden element: ${r.nativeCc}` : ''}` : ''}`;
    const body = r.checks.map(line).join('\n') || 'No checks for this page.';
    $('#diag-out').textContent = `${head}\n${body}`;
    $('#diag-hint').textContent = r.checks.some((c) => !c.count && !c.optional)
      ? 'If anything shows ✗, press "Copy Result" and paste it to the developer. It includes clues for a fix.'
      : 'All required items were found. Re-check the – items with the curriculum, a menu or search results open.';
    diagFull = [`${head}\n${body}`, 'Selectors:', ...r.checks.map((c) => `${c.name}: ${c.sel}`), '', `data-purpose list: ${r.purposes.join(', ')}`, '', `class prefix list: ${r.classes.join(', ')}`, '', 'Structure around the video:', ...r.layout].join('\n');
  };
  $('#diag-copy').onclick = async () => { $('#diag-copy').textContent = (await UXK.copyText(diagFull)) ? 'Copied' : 'Copy failed'; };

  const openUdemy = (path) => chrome.tabs.create({ url: 'https://www.udemy.com' + path });
  $('#open-lib').onclick = () => openUdemy('/home/my-courses/learning/');
  $('#open-opt').onclick = () => chrome.runtime.openOptionsPage();
  $('#open-sent').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#sent') });
  $('#open-stats').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#stats') });
})();
