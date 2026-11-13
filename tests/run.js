// Udemy Toolkit KR — Playwright 통합 테스트 (모의 Udemy)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createMock } = require('./mock');

const EXT = path.resolve(__dirname, '../udemy-toolkit');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(mockOpts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxk-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const mock = createMock(mockOpts);
  await context.route('https://www.udemy.com/**', mock.handle);
  await context.route('https://udemy-captions.s3.amazonaws.com/**', mock.handle);
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];
  // 기존 통합 테스트는 영상 위 도구 막대 기준이라 도크는 꺼 두고, 도크는 dockTests에서 켠다
  await sw.evaluate(() => chrome.storage.sync.set({ uxk_settings: { player: { dock: false }, _rev: 1 } }));
  // 첫 설치 시 열리는 옵션 탭 닫기
  await sleep(500);
  for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();
  return { context, mock, sw, extId };
}

async function readDownload(page, trigger) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), trigger()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), text: fs.readFileSync(p, 'utf8') };
}
const toastText = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.uxk-toast-text')).map((n) => n.textContent).join(' | '));
const waitToast = (page, re, timeout = 8000) => page.waitForFunction((src) => Array.from(document.querySelectorAll('.uxk-toast-text')).some((n) => new RegExp(src).test(n.textContent)), re.source, { timeout });

async function libraryTests(page, mock) {
  await page.goto('https://www.udemy.com/home/my-courses/learning/');
  await page.waitForSelector('#uxk-fab', { timeout: 10000 });
  check('내 학습: 플로팅 버튼 표시', true);
  await page.waitForSelector('.uxk-card-badges', { timeout: 30000 });
  const badges = await page.$$eval('.uxk-card-badges', (n) => n.map((x) => x.textContent));
  check('카드 배지 3개 삽입 (자동 데이터 로드)', badges.length === 3, badges[0]);

  // 새로고침 없는 보관 (Udemy 카드 메뉴 가로채기)
  const loads0 = await page.evaluate(() => sessionStorage.getItem('loads'));
  await page.click('.menu-btn[data-id="102"]');
  await page.click('.enrolled-course-card--container--WJYo9:has(a[href*="course_id=102"]) [data-purpose="toggle-archived"]');
  await sleep(1200);
  const loads1 = await page.evaluate(() => sessionStorage.getItem('loads'));
  const post = mock.log.archivePosts.find((x) => x.body.course_id === 102);
  check('카드 메뉴 보관 → 새로고침 없음', loads0 === loads1, `loads ${loads0}→${loads1}`);
  check('카드 메뉴 보관 → 확장이 API 호출 (Udemy 원래 핸들러 차단)', post && !post.body.native, JSON.stringify(post && post.body));
  check('보관 요청 헤더 X-Requested-With 포함', post && post.headers['x-requested-with'] === 'XMLHttpRequest');
  const hidden = await page.$eval('.enrolled-course-card--container--WJYo9:has(a[href*="course_id=102"])', (n) => !!n.closest('.uxk-card-hidden'));
  check('보관한 카드 흐리게 처리', hidden);
  const menuClosed = await page.$eval('.enrolled-course-card--container--WJYo9:has(a[href*="course_id=102"]) .menu', (n) => n.hidden);
  check('보관 후 메뉴 닫힘 (Escape 전달)', menuClosed);
  await page.click('.uxk-toast-btn:text("되돌리기")');
  await sleep(800);
  check('되돌리기 → DELETE 요청', mock.log.archiveDeletes.includes(102));

  // 패널
  await page.click('#uxk-fab');
  await page.waitForSelector('.uxk-lib.uxk-open tbody tr', { timeout: 10000 });
  const nRows = await page.$$eval('.uxk-lib tbody tr', (n) => n.length);
  check('패널: 첫 화면 200행', nRows === 200, String(nRows));
  const seg = await page.$$eval('[data-scope]', (n) => n.map((x) => x.textContent));
  check('보관/미보관 구분 개수', seg[0].includes('250') && seg[1].includes('30'), seg.join(' / '));
  const stats = await page.$eval('.uxk-lib-stats', (n) => n.textContent);
  check('요약 통계 표시', /250/.test(stats) && /미시작/.test(stats), stats.slice(0, 120));

  const ratingsOf = () => page.$$eval('.uxk-lib tbody tr', (rows) => rows.map((r) => parseFloat(r.children[2].textContent)));
  await page.fill('input[data-f="minr"]', '4.5');
  const before = await ratingsOf();
  check('적용 전에는 목록 그대로', before.some((r) => r < 4.5) && before.length === 200);
  await page.click('[data-act="apply"]');
  const after = await ratingsOf();
  check('적용 후 최소 별점 4.5 필터', after.length > 0 && after.every((r) => r >= 4.5), `${after.length}행`);
  await page.fill('input[data-f="minv"]', '10000');
  await page.press('input[data-f="minv"]', 'Enter');
  const reviewsOk = await page.$$eval('.uxk-lib tbody tr', (rows) => rows.every((r) => parseInt(r.children[4].textContent.replace(/,/g, ''), 10) >= 10000));
  check('Enter로 적용 (최소 리뷰 1만)', reviewsOk);
  await page.selectOption('select[data-f="cat"]', 'Language');
  await page.click('[data-act="apply"]');
  const catOk = await page.$$eval('.uxk-lib tbody tr .uxk-sub', (n) => n.length > 0 && n.every((x) => x.textContent.includes('Language')));
  check('카테고리 필터 (확장 필드)', catOk);
  await page.click('[data-act="reset"]');
  await page.click('th[data-k="reviews"]');
  const revs = await page.$$eval('.uxk-lib tbody tr', (rows) => rows.slice(0, 50).map((r) => parseInt(r.children[4].textContent.replace(/,/g, ''), 10)));
  check('헤더 클릭 정렬 (리뷰 내림차순)', revs.every((v, i) => i === 0 || revs[i - 1] >= v));

  // 프리셋
  await page.fill('input[data-f="minr"]', '4.7');
  await page.click('[data-act="apply"]');
  await page.click('[data-act="preset-save"]');
  await page.fill('.uxk-modal input', '고평점');
  await page.click('.uxk-modal .uxk-btn-primary');
  await page.click('[data-act="reset"]');
  await page.selectOption('select[data-preset]', '고평점');
  await sleep(200);
  const presetOk = (await ratingsOf()).every((r) => r >= 4.7);
  check('필터 프리셋 저장/불러오기', presetOk);
  await page.click('[data-act="reset"]');

  // 태그
  await page.locator('.uxk-lib tbody tr .uxk-sel').nth(0).check();
  await page.click('[data-act="tag-add"]');
  await page.fill('.uxk-modal input', '데이터, 실무');
  await page.click('.uxk-modal .uxk-btn-primary');
  await sleep(300);
  const chips = await page.$$eval('.uxk-lib tbody tr .uxk-chip', (n) => n.map((x) => x.textContent));
  check('태그 일괄 추가', chips.includes('데이터') && chips.includes('실무'), chips.slice(0, 4).join(','));
  await page.selectOption('select[data-f="tag"]', '데이터');
  await page.click('[data-act="apply"]');
  const tagRows = await page.$$eval('.uxk-lib tbody tr', (n) => n.length);
  check('태그 필터', tagRows === 1, String(tagRows));
  await page.click('[data-act="reset"]');
  await page.click('[data-act="sel-clear"]');

  // 학습 큐 토글
  await page.locator('.uxk-lib tbody tr [data-row="queue"]').nth(1).click();
  await page.check('input[data-f="queue"]');
  await page.click('[data-act="apply"]');
  check('학습 큐 토글 + 필터', (await page.$$eval('.uxk-lib tbody tr', (n) => n.length)) === 1);
  await page.click('[data-act="reset"]');

  // 일괄 보관
  const ids = await page.$$eval('.uxk-lib tbody tr', (rows) => rows.slice(2, 4).map((r) => +r.dataset.id));
  for (let i = 2; i < 4; i++) await page.locator('.uxk-lib tbody tr .uxk-sel').nth(i).check();
  const postsBefore = mock.log.archivePosts.length;
  await page.click('[data-act="archive"]');
  await page.waitForSelector('.uxk-modal');
  await page.click('.uxk-modal .uxk-btn-danger');
  await waitToast(page, /보관 완료 2개/, 10000);
  check('일괄 보관 2개', mock.log.archivePosts.length - postsBefore === 2, ids.join(','));
  const seg2 = await page.$$eval('[data-scope]', (n) => n.map((x) => x.textContent));
  check('일괄 보관 후 개수 갱신', seg2[0].includes('248') && seg2[1].includes('32'), seg2.join(' / '));
  // 보관됨 탭 → 보관 해제
  await page.click('[data-scope="archived"]');
  await page.locator('.uxk-lib tbody tr .uxk-sel').nth(0).check();
  await page.click('[data-act="unarchive"]');
  await page.click('.uxk-modal .uxk-btn-primary');
  await waitToast(page, /보관 해제 완료 1개/, 10000);
  check('보관 해제 (DELETE)', mock.log.archiveDeletes.length >= 2);
  await page.click('[data-scope="active"]');

  // 내보내기
  const csv = await readDownload(page, () => page.click('[data-act="csv"]'));
  check('CSV 내보내기 (BOM + 헤더 + 행)', csv.text.charCodeAt(0) === 0xfeff && csv.text.includes('"제목"') && csv.text.split('\r\n').length > 200, csv.name);
  const md = await readDownload(page, () => page.click('[data-act="md"]'));
  check('Markdown 체크리스트', md.text.includes('- [ ] [') && md.text.includes('course_id='), md.name);
  const js = await readDownload(page, () => page.click('[data-act="json"]'));
  check('JSON 내보내기', JSON.parse(js.text).length > 200);
  await page.click('[data-act="close"]');
}

async function playerTests(page, mock, sw) {
  await page.goto('https://www.udemy.com/course/test-course/learn/lecture/1001');
  await page.waitForSelector('.uxk-toolbar', { timeout: 15000, state: 'attached' });
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2, null, { timeout: 15000 });
  await sleep(500);
  const rate = () => page.evaluate(() => document.querySelector('video').playbackRate);
  const label = () => page.$eval('.uxk-tb-speed', (n) => n.textContent);
  check('플레이어: 도구 막대가 비디오 컨테이너 안에 삽입', await page.$eval('.uxk-layer', (n) => n.parentElement.matches('[data-purpose="video-player"]')));
  const diag = await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ url: 'https://www.udemy.com/course/*/learn/*' });
    return chrome.tabs.sendMessage(t.id, { type: 'diagnose' });
  });
  const found = Object.fromEntries(diag.checks.map((c) => [c.name, c.count]));
  check('화면 구조 점검: 모의 플레이어에서 영상·영상 틀·속도 메뉴를 찾음', diag.ok && diag.route === 'player' && found['영상'] === 1 && found['영상 틀'] >= 1 && found['Udemy 속도 메뉴'] >= 1, JSON.stringify(found));
  await page.mouse.click(1200, 800);
  await page.keyboard.press('d');
  check('D → 1.25배', (await rate()) === 1.25, String(await rate()));
  await page.keyboard.press('s');
  await page.keyboard.press('s');
  check('S ×2 → 0.75배', (await rate()) === 0.75);
  await page.keyboard.press('r');
  check('R → 1배', (await rate()) === 1);
  await page.keyboard.press('r');
  check('R 다시 → 이전 속도 0.75', (await rate()) === 0.75);
  for (let i = 0; i < 7; i++) await page.keyboard.press('d');
  check('2배 초과 (2.5배) 설정', (await rate()) === 2.5 && (await label()) === '2.50x', await label());
  await page.evaluate(() => { document.querySelector('video').playbackRate = 1; });
  await sleep(300);
  check('Udemy가 1배로 되돌리면 재적용', (await rate()) === 2.5, String(await rate()));
  await page.dispatchEvent('[data-purpose="playback-rate-button"]', 'pointerdown');
  await page.evaluate(() => { document.querySelector('video').playbackRate = 1.5; });
  await sleep(300);
  check('Udemy 자체 속도 메뉴 값은 채택 (1.5)', (await rate()) === 1.5 && (await label()) === '1.50x', await label());
  // 줄다리기: 페이지가 속도를 바꿀 때마다 1로 되돌리는 상황 → 5초 쉬고 사용자 속도 재적용 (지정 속도는 유지)
  await page.evaluate(() => {
    const v = document.querySelector('video');
    window.__fight = true;
    v.addEventListener('ratechange', () => { if (window.__fight && v.playbackRate !== 1) v.playbackRate = 1; });
    v.playbackRate = 1;
  });
  await sleep(1200);
  await page.evaluate(() => { window.__fight = false; });
  const duringFight = await label();
  await sleep(5500);
  check('속도 줄다리기 감지 → 5초 뒤 사용자 속도 재적용 (지정값 유지)', (await rate()) === 1.5 && duringFight === '1.50x', `${duringFight} → ${await rate()}`);
  await page.focus('#page-input');
  await page.keyboard.press('d');
  check('입력칸에서는 단축키 무시', (await rate()) === 1.5);
  await page.mouse.click(1200, 800);

  // 이중 자막
  await page.keyboard.press('v');
  await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1; });
  await page.waitForFunction(() => (document.querySelector('.uxk-sub1') || {}).textContent === 'Hello world', null, { timeout: 10000 });
  const sub2 = await page.$eval('.uxk-sub2', (n) => n.textContent);
  check('이중 자막 표시 (원문 + 한국어)', sub2 === '안녕 세상', sub2);
  const nativeHidden = await page.$eval('[class*="captions-display--captions-container"]', (n) => getComputedStyle(n).display === 'none');
  check('Udemy 기본 자막 숨김', nativeHidden);
  await page.evaluate(() => { document.querySelector('video').currentTime = 5; });
  await page.waitForFunction(() => document.querySelector('.uxk-sub1').textContent === 'Third sentence & more', null, { timeout: 5000 });
  check('VTT 태그/엔티티 정리 + 시간 이동 시 자막 갱신', true);
  await page.keyboard.press('q');
  await sleep(150);
  const t = await page.evaluate(() => document.querySelector('video').currentTime);
  check('Q → 현재 문장 처음으로', t >= 4.5 && t < 5.2, t.toFixed(2));
  await page.evaluate(() => document.querySelector('video').pause());
  await page.keyboard.press('k');
  await page.waitForFunction(() => /문장 저장됨/.test(document.querySelector('.uxk-indicator').textContent), null, { timeout: 5000 });
  check('K → 문장 수집함 저장', true);
  await page.keyboard.press('y');
  await page.waitForFunction(() => /문장 복사됨|복사 실패/.test(document.querySelector('.uxk-indicator').textContent), null, { timeout: 5000 });
  check('Y → 문장 복사 시도', true, await page.$eval('.uxk-indicator', (n) => n.textContent));
  await page.click('.uxk-toolbar button:text("대본")', { force: true });
  await page.waitForFunction(() => /대본 복사됨|복사 실패/.test(document.querySelector('.uxk-indicator').textContent), null, { timeout: 5000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('대본 버튼 → 강의 전체 자막이 클립보드에 복사', /^대본 복사됨 \(English \[Auto\] · 4문장\)$/.test(await page.$eval('.uxk-indicator', (n) => n.textContent)) && clip === 'Hello world Second sentence here Third sentence & more Long cue', JSON.stringify(clip));

  // 따라 말하기
  await page.keyboard.press('w');
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 0.3; v.play().catch(() => {}); });
  await page.waitForFunction(() => document.querySelector('video').paused, null, { timeout: 8000 });
  const tp = await page.evaluate(() => document.querySelector('video').currentTime);
  check('W 따라 말하기 → 문장 끝에서 자동 정지', tp > 1.7 && tp < 2.1, tp.toFixed(2));
  await page.keyboard.press('w');
  if (process.env.HANG_DEBUG) {
    const client = await page.context().newCDPSession(page);
    await client.send('Debugger.enable');
    client.on('Debugger.paused', (e) => {
      console.log('PAUSED', e.reason);
      e.callFrames.slice(0, 15).forEach((f) => console.log('  at', f.functionName || '(anon)', f.url.split('/').slice(-2).join('/'), f.location.lineNumber + 1, ':', f.location.columnNumber));
      client.send('Debugger.resume').catch(() => {});
    });
    const ok = await Promise.race([page.evaluate(() => 1).then(() => true), sleep(4000).then(() => false)]);
    console.log('HANG_DEBUG evaluate ok?', ok);
    if (!ok) { await client.send('Debugger.pause'); await sleep(3000); }
  }

  // A-B 반복
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 10; });
  await page.keyboard.press('a');
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 11; });
  await page.keyboard.press('a');
  await page.evaluate(() => { document.querySelector('video').play().catch(() => {}); });
  await sleep(1500);
  const tab = await page.evaluate(() => document.querySelector('video').currentTime);
  check('A-B 구간 반복 (10~11초 안에 머묾)', tab >= 9.9 && tab <= 11.3, tab.toFixed(2));
  await page.keyboard.press('a');
  await page.evaluate(() => document.querySelector('video').pause());

  // 메모
  await page.keyboard.press('Alt+n');
  await page.waitForSelector('.uxk-modal textarea');
  await page.fill('.uxk-modal textarea', '중요: 리스트 컴프리헨션 d s r 키 입력 테스트');
  const rateBeforeNote = await rate();
  await page.keyboard.press('Control+Enter');
  await waitToast(page, /메모 저장됨/);
  check('Alt+N 메모 저장 (Ctrl+Enter)', true);
  check('메모 입력 중 키가 단축키로 새지 않음', (await rate()) === rateBeforeNote);

  // 섹션 완료 버튼 / 남은 시간
  await page.waitForSelector('.uxk-sec-tools', { timeout: 5000 });
  check('섹션 완료 버튼 2개 섹션에 삽입', (await page.$$('.uxk-sec-tools')).length === 2);
  await page.waitForSelector('.uxk-pill', { timeout: 8000 });
  const pill = await page.$eval('.uxk-pill', (n) => n.textContent);
  check('남은 시간 표시 (25분, 1.5x 환산, 1/3강)', /남은 25분/.test(pill) && /1\.5x → 17분/.test(pill) && /완료 1\/3강/.test(pill), pill);
  const secLabels = await page.$$eval('.uxk-sec-remain', (n) => n.map((x) => x.textContent));
  check('섹션 제목 옆 남은 시간', secLabels[0] === '남은 10분' && secLabels[1] === '남은 15분', secLabels.join(','));
  await page.click('[data-purpose="section-panel-0"] .uxk-sec-btn:text("섹션 전체 완료")');
  await page.click('.uxk-modal .uxk-btn-primary');
  await waitToast(page, /완료로 표시했습니다/, 8000);
  const calls = await page.evaluate(() => window.__completeCalls);
  check('섹션 전체 완료 → 미완료 강의만 체크박스 클릭', calls.length === 1 && calls[0][0] === '1001' && calls[0][1] === true, JSON.stringify(calls));
  await page.click('.uxk-pill');
  await page.waitForSelector('.uxk-modal table');
  check('섹션별 남은 시간 상세', (await page.$$('.uxk-modal tbody tr')).length === 2);
  await page.keyboard.press('Escape');

  // 캡처
  await page.keyboard.press('Alt+s');
  await waitToast(page, /캡처/, 8000);
  check('Alt+S 캡처 (캔버스)', /캡처를 클립보드에|캡처 완료/.test(await toastText(page)), await toastText(page));

  // 도움말
  await page.keyboard.press('h');
  await page.waitForSelector('.uxk-modal kbd');
  check('H 단축키 도움말', (await page.$$('.uxk-modal kbd')).length >= 15);
  await page.keyboard.press('Escape');

  // 이 강의 자막 내보내기 (자막 메뉴)
  await page.click('.uxk-tb-subs', { force: true });
  await page.waitForSelector('.uxk-modal select');
  await page.click('.uxk-modal button:text("이 강의 자막 내보내기")');
  await page.waitForSelector('.uxk-modal button:text("SRT 이중")');
  const srt = await readDownload(page, () => page.click('.uxk-modal button:text("SRT 이중")'));
  check('이 강의 SRT 이중 자막 (+한글 파일명)', srt.text.includes('00:00:00,000 --> 00:00:02,000') && srt.text.includes('안녕 세상') && srt.name === 'Python 부트캠프 테스트 - Lecture 1001.bilingual.srt', srt.name);
  await page.keyboard.press('Escape');
  await sleep(200);
  // 코스 전체 자막
  check('Escape는 맨 위 모달만 닫음', (await page.$$('.uxk-modal')).length === 1);
  await page.click('.uxk-modal button:text("코스 전체 자막 (Markdown)")');
  await page.locator('.uxk-modal-back').last().locator('.uxk-btn-primary').click();
  const courseMd = await new Promise((resolve, reject) => {
    page.waitForEvent('download', { timeout: 20000 }).then(async (dl) => resolve({ name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') })).catch(reject);
  });
  check('코스 전체 자막 Markdown', courseMd.text.includes('# Python 부트캠프 테스트') && courseMd.text.includes('## Section 2') && courseMd.text.includes('Hello world') && courseMd.name.endsWith('_transcript.md'), courseMd.name);
  while (await page.$('.uxk-modal')) { await page.keyboard.press('Escape'); await sleep(100); }

  // 메모 드로어
  await page.click('.uxk-toolbar button:text("⋯")', { force: true });
  await page.click('.uxk-modal button:text("내 메모 보기 / 내보내기")');
  await page.waitForSelector('.uxk-drawer.uxk-open .uxk-note');
  check('메모 드로어에 메모 표시', (await page.$eval('.uxk-drawer .uxk-note-x', (n) => n.textContent)).includes('리스트 컴프리헨션'));
  const notesMd = await readDownload(page, () => page.click('.uxk-drawer button:text(".md 저장")'));
  check('메모 Markdown (타임스탬프 링크)', /\[\d\d:\d\d\]\(https:\/\/www\.udemy\.com\/course\/test-course\/learn\/lecture\/1001\?uxk_t=\d+\)/.test(notesMd.text), notesMd.text.split('\n').find((l) => l.startsWith('- ')));
  await page.click('.uxk-drawer button:text("닫기")');

  // 다음 강의 (SPA) + Udemy 속도 초기화 → 재적용 + 자막 재로딩
  await page.mouse.click(1200, 800);
  const reqBefore = mock.log.requests.length;
  await page.keyboard.press('n');
  await page.waitForFunction(() => location.pathname.endsWith('/1002'), null, { timeout: 5000 });
  await sleep(2500);
  check('N → 다음 강의 이동', true);
  check('강의 전환 후 Udemy 초기화를 이기고 속도 유지', (await rate()) === 1.5, String(await rate()));
  const newReqs = mock.log.requests.slice(reqBefore);
  check('강의 전환 후 새 강의 자막 요청', newReqs.some((r) => r.includes('/lectures/1002/')), newReqs.filter((r) => r.includes('lectures')).join(' '));

  // 팝업/설정에서 따라 말하기만 켠 경우 (이중 자막 OFF) — 새 페이지에서 자막이 조용히 로드되어야 함
  await page.context().serviceWorkers()[0].evaluate(async () => {
    const cur = (await chrome.storage.sync.get('uxk_settings')).uxk_settings || {};
    cur.subs = { ...(cur.subs || {}), enabled: false, shadowPause: true };
    cur._rev = Date.now() + 1000;
    await chrome.storage.sync.set({ uxk_settings: cur });
  });
  await page.goto('https://www.udemy.com/course/test-course/learn/lecture/1003');
  await page.waitForFunction(() => document.querySelector('video') && document.querySelector('video').readyState >= 2, null, { timeout: 10000 });
  await sleep(1500);
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 0.3; v.play().catch(() => {}); });
  const shadowOnly = await page.waitForFunction(() => document.querySelector('video').paused, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const tso = await page.evaluate(() => document.querySelector('video').currentTime);
  check('설정에서 따라 말하기만 켜도 동작 (이중 자막 OFF)', shadowOnly && tso > 1.7 && tso < 2.1, tso.toFixed(2));
  check('이중 자막 OFF면 자막 상자 숨김 + Udemy 기본 자막 유지', await page.evaluate(() => getComputedStyle(document.querySelector('.uxk-subs')).display === 'none' && getComputedStyle(document.querySelector('[class*="captions-display--captions-container"]')).display !== 'none'));
  await page.context().serviceWorkers()[0].evaluate(async () => {
    const cur = (await chrome.storage.sync.get('uxk_settings')).uxk_settings || {};
    cur.subs = { ...(cur.subs || {}), shadowPause: false };
    cur._rev = Date.now() + 2000;
    await chrome.storage.sync.set({ uxk_settings: cur });
  });
  await sleep(300);

  // 딥링크 ?uxk_t=
  await page.goto('https://www.udemy.com/course/test-course/learn/lecture/1001?uxk_t=12');
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1, null, { timeout: 10000 });
  await sleep(800);
  const tdl = await page.evaluate(() => document.querySelector('video').currentTime);
  check('메모 링크(?uxk_t=12)로 열면 해당 시각으로 이동', tdl >= 11.9 && tdl < 14, tdl.toFixed(2));
  check('속도 코스별 기억 (새로고침 후 1.5)', (await rate()) === 1.5, String(await rate()));
  // 대본 버튼: 자막이 아직 로드되지 않은 새 페이지에서도 원문만 받아 복사한다 (보조 자막 요청이 없어야 함)
  const fetches0 = mock.log.captionFetches || 0;
  await page.click('.uxk-toolbar button:text("대본")', { force: true });
  await page.waitForFunction(() => /대본 복사됨|복사 실패/.test(document.querySelector('.uxk-indicator').textContent), null, { timeout: 8000 });
  const cold = await page.evaluate(() => navigator.clipboard.readText());
  const fetched = (mock.log.captionFetches || 0) - fetches0;
  check('대본 버튼 (자막 미로드) → 원문만 받아 복사, 보조 자막 요청 없음', cold === 'Hello world Second sentence here Third sentence & more Long cue' && fetched === 1, `자막 요청 ${fetched}회 ${JSON.stringify(cold)}`);
  check('딥링크 파라미터는 주소에서 제거', !(await page.evaluate(() => location.search)).includes('uxk_t'));
}

async function catalogTests(page, sw) {
  await page.goto('https://www.udemy.com/courses/search/?q=python');
  await page.waitForSelector('#card-owned .uxk-owned', { timeout: 8000 });
  check('검색: 보유 강의 배지', true, await page.$eval('#card-owned .uxk-owned', (n) => n.textContent));
  check('검색: 미보유 강의엔 배지 없음', !(await page.$('#card-new .uxk-owned')));
  check('검색: 보관된 보유 강의 표시', (await page.$eval('#card-archived .uxk-owned', (n) => n.textContent)).includes('보관됨'));
  await sw.evaluate(async () => {
    const cur = (await chrome.storage.sync.get('uxk_settings')).uxk_settings || {};
    cur.catalog = { ...(cur.catalog || {}), hideOwned: true };
    cur._rev = Date.now() + 5000; // 실제 저장 경로(UXK.saveSettings)처럼 개정 번호 증가
    await chrome.storage.sync.set({ uxk_settings: cur });
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card-owned')).display === 'none', null, { timeout: 5000 });
  check('설정 변경 즉시 반영: 보유 강의 숨기기', true);
  check('카드가 아닌 설명문 속 링크는 숨기지 않음 (배지만)', await page.evaluate(() => getComputedStyle(document.getElementById('desc-li')).display !== 'none' && !!document.querySelector('#desc-li .uxk-owned')));
  check('헤더 링크는 숨기지 않음', await page.evaluate(() => getComputedStyle(document.querySelector('header .my-learning-dropdown')).display !== 'none'));
  await page.goto('https://www.udemy.com/course/slug-101/');
  await page.waitForFunction(() => /최초 출시 2019-02-19/.test((document.querySelector('.uxk-info') || {}).textContent || ''), null, { timeout: 8000 });
  const info = await page.$eval('.uxk-info', (n) => n.textContent);
  check('강의 소개: 보유 여부 + 최초 출시일 + 자막 언어', info.includes('이미 보유한 강의') && info.includes('Korean [Auto]'), info.slice(0, 140));
}

async function optionsTests(context, sw, extId) {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId}/pages/options.html`);
  await opt.waitForSelector('#hk-body tr');
  check('설정: 단축키 표 19행', (await opt.$$('#hk-body tr')).length === 19);
  await opt.waitForFunction(() => /총 1개/.test(document.getElementById('sent-count').textContent), null, { timeout: 5000 });
  check('설정: 문장 수집함 1개', true);
  const sentRow = await opt.$eval('#sent-body tr', (n) => n.textContent);
  check('문장에 원문+번역+출처', sentRow.includes('Third sentence & more') && sentRow.includes('세 번째 문장') && sentRow.includes('Python 부트캠프 테스트'), sentRow.replace(/\s+/g, ' ').slice(0, 120));
  const anki = await readDownload(opt, () => opt.click('#sent-anki'));
  check('Anki TSV', anki.text.startsWith('#separator:tab') && anki.text.split('\n')[3].split('\t').length === 3);
  const notesRow = await opt.$eval('#notes-body', (n) => n.textContent);
  check('설정: 코스별 메모 수', notesRow.includes('Python 부트캠프 테스트') && notesRow.includes('1'), notesRow.trim().slice(0, 80));
  await opt.fill('[data-k="speed.default"]', '1.75');
  await opt.dispatchEvent('[data-k="speed.default"]', 'change');
  await sleep(300);
  const s1 = await sw.evaluate(async () => (await chrome.storage.sync.get('uxk_settings')).uxk_settings);
  check('설정 저장 (기본 속도 1.75)', s1.speed.default === 1.75);
  const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
  check('강의 목록 캐시가 호스트별 키로 저장', keys.includes('uxk_courses_v3:www.udemy.com') && !keys.includes('uxk_courses_v3'), keys.filter((k) => k.startsWith('uxk_courses')).join(','));
  await opt.click('[data-hk="pip"]');
  await opt.keyboard.press('o');
  await sleep(300);
  const s2 = await sw.evaluate(async () => (await chrome.storage.sync.get('uxk_settings')).uxk_settings);
  check('단축키 변경 (PiP → O)', s2.hotkeys.pip === 'O');
  await opt.click('[data-hk="theater"]');
  await opt.keyboard.press('f');
  await sleep(300);
  check('Udemy 기본 키와 겹치면 경고', (await opt.$eval('[data-warn="theater"]', (n) => n.textContent)).includes('Udemy'));
  await opt.click('#hk-reset');
  await sleep(200);
  const stats = await opt.$eval('#kpis', (n) => n.textContent);
  check('학습 기록 KPI 표시', stats.includes('오늘') && stats.includes('연속'), stats);
  const backup = await readDownload(opt, () => opt.click('#backup'));
  const bj = JSON.parse(backup.text);
  check('백업 JSON (메모·문장·메타 포함)', bj.app === 'udemy-toolkit-kr' && bj.data.sentences.length === 1 && Object.keys(bj.data.notes).length === 1 && bj.data.meta);
  const pop = await context.newPage();
  await pop.goto(`chrome-extension://${extId}/pages/popup.html`);
  await pop.waitForFunction(() => document.getElementById('today-txt').textContent.length > 0);
  check('팝업 로드', true, await pop.$eval('#today-txt', (n) => n.textContent));
  await pop.click('#diag');
  check('팝업: Udemy 탭이 아니면 점검 안내', (await pop.$eval('#diag-out', (n) => n.textContent)).includes('Udemy 탭'));
  const errs = [];
  opt.on('pageerror', (e) => errs.push(e.message));
  await opt.reload();
  await sleep(800);
  check('설정 페이지 스크립트 오류 없음', errs.length === 0, errs.join(';'));
  await opt.close();
  await pop.close();
}

// 영상 아래 도크: 위치, 한 번 클릭 켜기/끄기, 자막 영역, 대본 복사, 대체 위치
async function dockTests(page, mock, sw) {
  const setDock = (on) => sw.evaluate(async (flag) => {
    const cur = (await chrome.storage.sync.get('uxk_settings')).uxk_settings || {};
    cur.player = { ...(cur.player || {}), dock: flag };
    cur._rev = Math.max(Date.now(), (cur._rev || 0) + 1); // 실제 저장(UXK.saveSettings)처럼 개정 번호를 최소한만 올린다 (너무 크면 뒤 테스트의 변경이 낡은 것으로 무시됨)
    await chrome.storage.sync.set({ uxk_settings: cur });
  }, on);
  const lecture = 'https://www.udemy.com/course/test-course/learn/lecture/1001';
  const geometry = () => page.evaluate(() => {
    const d = document.querySelector('.uxk-dock');
    const dr = d.getBoundingClientRect(), vr = document.querySelector('[data-purpose="video-player"]').getBoundingClientRect();
    return { mode: d.dataset.mode, dw: Math.round(dr.width), vw: Math.round(vr.width), dx: Math.round(dr.left - vr.left), gap: Math.round(dr.top - vr.bottom), prevIsVideo: !!d.previousElementSibling && d.previousElementSibling.matches('[data-purpose="video-player"]'), bottom: Math.round(dr.bottom), innerHeight: window.innerHeight, position: getComputedStyle(d).position };
  });
  const pressed = (label) => page.evaluate((l) => [...document.querySelectorAll('.uxk-dock button')].find((b) => b.textContent === l).getAttribute('aria-pressed'), label);
  const waitPressed = (label, value) => page.waitForFunction(([l, v]) => [...document.querySelectorAll('.uxk-dock button')].find((b) => b.textContent === l).getAttribute('aria-pressed') === v, [label, value], { timeout: 6000 });
  const overlayHidden = () => page.evaluate(() => ['.uxk-toolbar', '.uxk-subs'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none'));

  await setDock(true);
  await page.goto(lecture);
  await page.waitForSelector('.uxk-dock', { timeout: 15000 });
  const g1 = await geometry();
  check('도크: 영상 바로 아래에 영상과 같은 폭으로 끼워 넣음 (below)', g1.mode === 'below' && g1.gap >= -1 && g1.gap < 8 && g1.prevIsVideo && Math.abs(g1.dw - g1.vw) <= 2 && Math.abs(g1.dx) <= 2, JSON.stringify(g1));
  check('도크: 영상 위 도구 막대·자막 상자는 숨김', await overlayHidden());

  await page.click('.uxk-dock button:text("이중 자막")');
  await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1; });
  await page.waitForFunction(() => (document.querySelector('.uxk-dsub1') || {}).textContent === 'Hello world', null, { timeout: 10000 });
  const dsub2 = await page.$eval('.uxk-dsub2', (n) => n.textContent);
  const subsState = await page.$eval('.uxk-dock', (n) => n.dataset.subs);
  check('도크: 이중 자막 버튼 한 번 클릭 → 켜짐 표시 + 도크 자막 영역에 원문·번역', (await pressed('이중 자막')) === 'true' && subsState === 'on' && dsub2 === '안녕 세상', `${subsState} ${dsub2}`);
  check('도크: 자막이 켜져도 영상 위 자막 상자는 숨김 (영상을 가리지 않음)', await overlayHidden());

  await page.click('.uxk-dock button:text("따라 말하기")');
  await waitPressed('따라 말하기', 'true');
  await page.click('.uxk-dock button:text("따라 말하기")');
  await waitPressed('따라 말하기', 'false');
  check('도크: 따라 말하기는 클릭 한 번으로 켜고 다시 한 번으로 끔 (켜짐 표시)', true);

  const speedText = () => page.$eval('.uxk-dock .uxk-tb-speed', (n) => n.textContent);
  const s0 = parseFloat(await speedText());
  await page.click('.uxk-dock button:text-is("+")');
  await page.waitForFunction((x) => Math.abs(parseFloat(document.querySelector('.uxk-dock .uxk-tb-speed').textContent) - x) < 0.01, s0 + 0.25, { timeout: 6000 });
  check('도크: + 버튼 → 속도 표시가 0.25 올라감', true, `${s0} → ${await speedText()}`);

  await page.click('.uxk-dock button:text("대본 복사")');
  await page.waitForFunction(() => /대본 복사됨|복사 실패/.test(document.querySelector('.uxk-indicator').textContent), null, { timeout: 8000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('도크: 대본 복사 버튼 → 강의 전체 대본이 클립보드에 복사', clip === 'Hello world Second sentence here Third sentence & more Long cue', JSON.stringify(clip));

  // 전체화면: 도크는 숨기고 영상 위 자막·도구 막대를 쓰며, 나오면 도크가 돌아온다
  await page.evaluate(() => document.querySelector('[data-purpose="video-player"]').requestFullscreen());
  await page.waitForFunction(() => !!document.fullscreenElement && !document.documentElement.classList.contains('uxk-dock-on'), null, { timeout: 5000 });
  const inFs = await page.evaluate(() => ({ dock: getComputedStyle(document.querySelector('.uxk-dock')).display, subs: getComputedStyle(document.querySelector('.uxk-subs')).display, toolbar: getComputedStyle(document.querySelector('.uxk-toolbar')).display }));
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement && getComputedStyle(document.querySelector('.uxk-dock')).display !== 'none', null, { timeout: 5000 });
  check('도크: 전체화면에서는 도크를 숨기고 영상 위 자막·도구 막대를 쓰며, 나오면 도크가 돌아옴', inFs.dock === 'none' && inFs.subs !== 'none' && inFs.toolbar !== 'none', JSON.stringify(inFs));

  await setDock(false);
  await page.waitForFunction(() => !document.querySelector('.uxk-dock'), null, { timeout: 8000 });
  check('도크를 끄면 도크가 사라지고 영상 위 도구 막대가 돌아옴', await page.evaluate(() => getComputedStyle(document.querySelector('.uxk-toolbar')).display !== 'none'));

  mock.setClip(true);
  await setDock(true);
  await page.goto(lecture);
  await page.waitForSelector('.uxk-dock', { timeout: 15000 });
  const g2 = await geometry();
  check('도크: 영상 아래가 잘려 보이지 않으면 화면 맨 아래 고정(fixed)으로 전환', g2.mode === 'fixed' && g2.position === 'fixed' && Math.abs(g2.bottom - g2.innerHeight) <= 1, JSON.stringify(g2));
  const spacer = await page.evaluate(() => ({ after: parseFloat(getComputedStyle(document.body, '::after').height), dock: document.querySelector('.uxk-dock').offsetHeight }));
  check('도크: 고정 모드에서는 페이지 끝에 도크 높이만큼 여백을 둠 (끝 내용이 가려지지 않음)', spacer.dock > 20 && Math.abs(spacer.after - spacer.dock) <= 1, JSON.stringify(spacer));
  mock.setClip(false);
  await setDock(false);
}

async function fallbackTests() {
  process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // 서비스 워커 요청도 모의 서버로 라우팅
  const { context, mock } = await launch({ rejectExtra: true, noProgress: true, noCors: true });
  // Playwright의 route.fulfill은 CORS 헤더를 자동으로 붙이므로, 페이지(콘텐츠 스크립트) 요청은 실패시키고 서비스 워커 요청만 응답
  const capSeen = [];
  await context.route('https://udemy-captions.s3.amazonaws.com/**', (r) => { const sw = !!r.request().serviceWorker(); capSeen.push(sw ? 'SW' : 'page'); return sw ? mock.handle(r) : r.abort('failed'); });
  const page = await context.newPage();
  try {
    await page.goto('https://www.udemy.com/home/my-courses/learning/');
    await page.waitForSelector('.uxk-card-badges', { timeout: 30000 });
    await page.click('#uxk-fab');
    await page.waitForSelector('.uxk-lib tbody tr');
    const status = await page.$eval('.uxk-lib-status', (n) => n.textContent);
    check('대체 경로: 확장 필드 거부 시에도 목록 로드', (await page.$$('.uxk-lib tbody tr')).length === 200, status.slice(0, 100));
    check('대체 경로: 미지원 필터 비활성화', await page.$eval('select[data-f="cat"]', (n) => n.disabled));
    await page.goto('https://www.udemy.com/course/test-course/learn/lecture/1001');
    await page.waitForSelector('.uxk-pill', { timeout: 10000 });
    const pill = await page.$eval('.uxk-pill', (n) => n.textContent);
    check('대체 경로: 진행 API 실패 → 진행률 기준 추정', pill.includes('추정'), pill);
    await page.waitForFunction(() => document.querySelector('video') && document.querySelector('video').readyState >= 2, null, { timeout: 10000 });
    await page.mouse.click(1200, 800);
    await page.keyboard.press('v');
    await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1; });
    const ok = await page.waitForFunction(() => (document.querySelector('.uxk-sub1') || {}).textContent === 'Hello world', null, { timeout: 10000 }).then(() => true).catch(() => false);
    check('대체 경로: 콘텐츠 스크립트 요청이 막혀도 서비스 워커 경유로 자막 로드', ok && capSeen.includes('SW'), capSeen.join(','));
  } finally {
    await context.close();
  }
}

(async () => {
  const t0 = Date.now();
  const { context, mock, sw, extId } = await launch();
  const page = await context.newPage();
  if (process.env.UXK_DEBUG_LOG) {
    await page.addInitScript(() => localStorage.setItem('uxk_debug', '1'));
    page.on('console', (m) => { if (/\[UXK\] (ratechange|speed)/.test(m.text())) console.log('    dbg', m.text().slice(0, 160)); });
  }
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('crash', () => console.log('!!! PAGE CRASH'));
  page.on('close', () => console.log('!!! PAGE CLOSE'));
  context.on('close', () => console.log('!!! CONTEXT CLOSE'));
  context.on('page', (p) => console.log('+ new page', p.url()));
  page.on('console', (m) => { if (m.type() === 'error' || /\[UXK\]/.test(m.text())) pageErrors.push('console: ' + m.text()); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.udemy.com' });
  const sections = [['library', () => libraryTests(page, mock)], ['player', () => playerTests(page, mock, sw)], ['dock', () => dockTests(page, mock, sw)], ['catalog', () => catalogTests(page, sw)], ['options', () => optionsTests(context, sw, extId)]];
  for (const [name, fn] of sections) {
    try { await fn(); } catch (e) {
      check(`[${name}] 예외 없이 완료`, false, e.message.split('\n')[0]);
      await page.screenshot({ path: path.join(__dirname, `fail-${name}.png`) }).catch(() => {});
    }
  }
  const relevantErrors = pageErrors.filter((e) => !/mock 404|Failed to load resource/.test(e));
  check('페이지 콘솔 오류 없음', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' || '));
  await context.close();
  try { await fallbackTests(); } catch (e) { check('[fallback] 예외 없이 완료', false, e.message.split('\n')[0]); }
  const fail = results.filter((r) => !r.ok);
  console.log(`\n총 ${results.length}개 중 통과 ${results.length - fail.length}, 실패 ${fail.length} (${Math.round((Date.now() - t0) / 1000)}초)`);
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(fail.length ? 1 : 0);
})();
