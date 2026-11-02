(async () => {
  const UXK = globalThis.UXK;
  const $ = (s) => document.querySelector(s);
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  let S = await UXK.getSettings();

  // 빠른 설정
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const build = (p, v) => p.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);
  document.querySelectorAll('[data-k]').forEach((n) => {
    n.checked = !!getPath(S, n.dataset.k);
    n.addEventListener('change', async () => { S = await UXK.saveSettings(build(n.dataset.k, n.checked)); });
  });

  // 오늘 학습
  const st = (await UXK.local.get(UXK.KEYS.stats, { days: {} })) || { days: {} };
  const goal = (S.stats.dailyGoalMin || 0) * 60;
  const dayKey = (o) => { const d = new Date(); d.setDate(d.getDate() - o); return UXK.today(d); };
  const secOf = (k) => (st.days && st.days[k] ? st.days[k].sec : 0);
  const today = secOf(dayKey(0));
  $('#today-txt').textContent = `${Math.round(today / 60)}분${goal ? ` / 목표 ${S.stats.dailyGoalMin}분` : ''}`;
  $('#today-bar').style.width = `${goal ? Math.min(100, (today / goal) * 100) : today ? 100 : 0}%`;
  const meets = (k) => (goal ? secOf(k) >= goal : secOf(k) >= 60);
  let streak = 0, i = meets(dayKey(0)) ? 0 : 1;
  while (meets(dayKey(i))) { streak++; i++; }
  let week = 0;
  for (let k = 0; k < 7; k++) week += secOf(dayKey(k));
  $('#streak').textContent = `연속 ${streak}일 · 최근 7일 ${UXK.fmtDur(week)}`;

  // 현재 탭이 Udemy 강의라면 제어
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLearn = tab && /^https:\/\/[^/]*udemy\.com\/course\/[^/]+\/learn\//.test(tab.url || '');
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
    $('#tab-remain').textContent = rem ? `남은 ${UXK.fmtDur(rem.remain)}${rem.exact ? ` · 완료 ${rem.nDone}/${rem.n}강` : ' (추정)'}` : '';
  }
  if (isLearn) {
    await refreshTab(null);
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => refreshTab(b.dataset.act)));
  }

  const openUdemy = (path) => chrome.tabs.create({ url: 'https://www.udemy.com' + path });
  $('#open-lib').onclick = () => openUdemy('/home/my-courses/learning/');
  $('#open-opt').onclick = () => chrome.runtime.openOptionsPage();
  $('#open-sent').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#sent') });
  $('#open-stats').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#stats') });
})();
