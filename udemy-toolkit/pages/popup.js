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
  const goal = Math.max(0, S.stats.dailyGoalMin || 0) * 60;
  const dayKey = (o) => { const d = new Date(); d.setDate(d.getDate() - o); return UXK.today(d); };
  const secOf = (k) => (st.days && st.days[k] ? st.days[k].sec : 0);
  const today = secOf(dayKey(0));
  $('#today-txt').textContent = `${Math.round(today / 60)}분${goal ? ` / 목표 ${S.stats.dailyGoalMin}분` : ''}`;
  $('#today-bar').style.width = `${goal ? Math.min(100, (today / goal) * 100) : today ? 100 : 0}%`;
  const meets = (k) => (goal ? secOf(k) >= goal : secOf(k) >= 60);
  let streak = 0, i = meets(dayKey(0)) ? 0 : 1;
  while (i < 3650 && meets(dayKey(i))) { streak++; i++; } // 잘못된 목표값이 와도 끝나도록 10년 상한
  let week = 0;
  for (let k = 0; k < 7; k++) week += secOf(dayKey(k));
  $('#streak').textContent = `연속 ${streak}일 · 최근 7일 ${UXK.fmtDur(week)}`;

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
    $('#tab-remain').textContent = rem ? `남은 ${UXK.fmtDur(rem.remain)}${rem.exact ? ` · 완료 ${rem.nDone}/${rem.n}강` : ' (추정)'}` : '';
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
    $('#diag-copy').textContent = '결과 복사';
    let r = null;
    if (isUdemy) { try { r = await chrome.tabs.sendMessage(tab.id, { type: 'diagnose' }); } catch (e) {} }
    $('#diag-copy').hidden = !(r && r.ok);
    if (!r || !r.ok) {
      $('#diag-out').textContent = isUdemy ? '이 탭에서는 점검할 수 없습니다. 강의·내 학습·검색 화면(www.udemy.com)인지 확인하고, 확장을 업데이트한 직후라면 탭을 새로고침한 뒤 다시 눌러 주세요.' : 'Udemy 탭을 연 상태에서 팝업을 열고 눌러 주세요.';
      $('#diag-hint').textContent = '';
      return;
    }
    const line = (c) => {
      if (c.count) return `✓ ${c.name} (${c.count})`;
      return c.optional ? `– ${c.name} (0) · 해당 화면이 아니면 없는 게 정상` : `✗ ${c.name} (0)\n    영향: ${c.impact}`;
    };
    const head = `Udemy Toolkit v${chrome.runtime.getManifest().version} · 화면 종류: ${r.route}${r.route === 'player' ? ` · 도구 줄: ${r.dock || '없음'}` : ''}`;
    const body = r.checks.map(line).join('\n') || '이 화면은 점검 항목이 없습니다.';
    $('#diag-out').textContent = `${head}\n${body}`;
    $('#diag-hint').textContent = r.checks.some((c) => !c.count && !c.optional)
      ? '✗가 있으면 "결과 복사"를 눌러 붙여 넣어 주세요. 고칠 단서가 함께 복사됩니다.'
      : '꼭 있어야 하는 항목은 모두 찾았습니다. – 항목은 목차·메뉴·검색 목록을 연 상태에서 다시 점검하세요.';
    diagFull = [`${head}\n${body}`, '선택자:', ...r.checks.map((c) => `${c.name}: ${c.sel}`), '', `data-purpose 목록: ${r.purposes.join(', ')}`, '', `class 접두어 목록: ${r.classes.join(', ')}`].join('\n');
  };
  $('#diag-copy').onclick = async () => { $('#diag-copy').textContent = (await UXK.copyText(diagFull)) ? '복사됨' : '복사 실패'; };

  const openUdemy = (path) => chrome.tabs.create({ url: 'https://www.udemy.com' + path });
  $('#open-lib').onclick = () => openUdemy('/home/my-courses/learning/');
  $('#open-opt').onclick = () => chrome.runtime.openOptionsPage();
  $('#open-sent').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#sent') });
  $('#open-stats').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#stats') });
})();
