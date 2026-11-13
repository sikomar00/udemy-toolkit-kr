// 순수 로직 단위 테스트 (Node vm)
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '../udemy-toolkit');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const ctx = {
  console, setTimeout, clearTimeout, setInterval, URLSearchParams, URL, Promise, Map, Set, Date, Math, JSON,
  location: { href: 'https://www.udemy.com/x', pathname: '/x', origin: 'https://www.udemy.com' },
  document: { addEventListener() {}, cookie: '', documentElement: { classList: { toggle() {}, contains: () => false } }, body: null },
  window: { addEventListener() {} }, navigator: {}, history: {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['lib/common.js', 'lib/vtt.js']) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
const U = ctx.UXK;

// ---------- VTT ----------
const vtt = `WEBVTT
Kind: captions
Language: en

NOTE 주석 블록은 무시

1
00:00:01.000 --> 00:00:03.500 align:start position:0%
<v Speaker>First</v> line
continues

2
01:02:03,250 --> 01:02:05,000
Hour <c.yellow>cue</c> &lt;tag&gt;

00:00:03.500 --> 00:00:04.000
Third
`;
const cues = U.vtt.parse(vtt);
check('VTT: NOTE/헤더 무시, 큐 개수', cues.length === 3, JSON.stringify(cues.map((c) => c.text)));
check('VTT: 큐 설정(align/position) 무시하고 시간 파싱', cues[0].start === 1 && cues[0].end === 3.5);
check('VTT: 여러 줄 + 화자 태그 제거', cues[0].text === 'First line\ncontinues', JSON.stringify(cues[0].text));
check('VTT: 시 단위 + 쉼표 소수 + 엔티티', cues[2].start === 3723.25 && cues[2].text === 'Hour cue <tag>', `${cues[2].start} ${cues[2].text}`);
const roll = U.vtt.parse('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA\n\n00:00:01.000 --> 00:00:02.000\nA\n\n00:00:02.000 --> 00:00:03.000\nB\n');
check('VTT: 연속 중복 큐 병합', roll.length === 2 && roll[0].end === 2, JSON.stringify(roll));
check('VTT: BOM/CRLF 처리', U.vtt.parse('﻿WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nX\r\n').length === 1);
check('VTT: 빈 입력', U.vtt.parse('').length === 0 && U.vtt.parse(null).length === 0);

const many = Array.from({ length: 500 }, (_, i) => ({ start: i * 2, end: i * 2 + 1.5, text: 't' + i }));
check('find: 큐 안', U.vtt.find(many, 401) === 200);
check('find: 큐 사이 공백 → -1', U.vtt.find(many, 401.7) === -1);
check('find: hint 사용', U.vtt.find(many, 403, 200) === 201);
check('prevIndex: 공백에서 직전 큐', U.vtt.prevIndex(many, 401.7) === 200);
check('find: 범위 밖', U.vtt.find(many, -1) === -1 && U.vtt.find(many, 5000) === -1);

const p = [{ start: 0, end: 2, text: 'a' }, { start: 2, end: 4, text: 'b' }, { start: 4, end: 6, text: 'c' }];
const s2 = [{ start: 0.1, end: 2.1, text: '가' }, { start: 2.1, end: 3.0, text: '나1' }, { start: 3.0, end: 4.0, text: '나2' }];
const al = U.vtt.align(p, s2);
check('align: 시간 겹침으로 보조 자막 매칭 (분할된 문장 합침)', al[0] === '가' && al[1] === '나1 나2' && al[2] === '', JSON.stringify(al));
const srt = U.vtt.toSRT(p, al);
check('SRT 형식', srt.startsWith('1\n00:00:00,000 --> 00:00:02,000\na\n가\n') && srt.includes('3\n00:00:04,000 --> 00:00:06,000\nc\n'), JSON.stringify(srt.slice(0, 60)));
check('텍스트: 문장 끝 줄바꿈', U.vtt.toText([{ start: 0, end: 1, text: 'Hi there.' }, { start: 1, end: 2, text: 'Next\none!' }]) === 'Hi there.\nNext one!');

// ---------- 단축키 ----------
const ev = (code, mods = {}) => ({ code, key: '?', ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta });
check('단축키: 한글 IME 상태(key=ㅇ)여도 code=KeyD로 매칭', U.matchHotkey({ ...ev('KeyD'), key: 'ㅇ' }, 'D'));
check('단축키: 수정키가 다르면 불일치', !U.matchHotkey(ev('KeyD', { shift: true }), 'D') && U.matchHotkey(ev('KeyN', { alt: true }), 'Alt+N'));
check('단축키: 화살표/기호', U.matchHotkey(ev('ArrowLeft', { shift: true }), 'Shift+Left') && U.matchHotkey(ev('BracketLeft'), '['));
check('단축키: 이벤트 → 문자열', U.eventToHotkey(ev('KeyO')) === 'O' && U.eventToHotkey(ev('KeyS', { alt: true })) === 'Alt+S' && U.eventToHotkey(ev('Slash', { shift: true })) === 'Shift+Slash' && U.eventToHotkey(ev('ShiftLeft', { shift: true })) === null);
const defaults = Object.values(U.DEFAULTS.hotkeys).map((s) => JSON.stringify(U.parseHotkey(s)));
check('기본 단축키 중복 없음', new Set(defaults).size === defaults.length);
const reserved = new Set(U.UDEMY_RESERVED.map((s) => JSON.stringify(U.parseHotkey(s))));
check('기본 단축키가 Udemy 기본 키와 겹치지 않음', defaults.every((d) => !reserved.has(d)));

// ---------- 기타 ----------
const m = U.merge(U.DEFAULTS, { speed: { max: 4 }, hotkeys: { pip: '' }, unknown: 1 });
check('설정 병합: 부분 덮어쓰기, 빈 문자열 보존', m.speed.max === 4 && m.speed.step === 0.25 && m.hotkeys.pip === '' && m.hotkeys.next === 'N');
const poisoned = JSON.parse('{"__proto__":{"polluted":1},"subs":null,"stats":{"dailyGoalMin":"x"},"speed":{"max":null,"step":0.5},"hotkeys":{"pip":5},"junk":1,"_rev":7}');
const conformed = U.conform(U.DEFAULTS, poisoned);
check('설정 방어: 잘못된 자료형은 기본값으로, 맞는 값은 유지', conformed.subs.fontSize === 22 && conformed.stats.dailyGoalMin === 30 && conformed.speed.max === 16 && conformed.speed.step === 0.5 && conformed.hotkeys.pip === 'Alt+P', JSON.stringify(conformed.speed));
check('설정 방어: 모르는 키·__proto__는 버림', Object.keys(conformed).join() === Object.keys(U.DEFAULTS).join() && ({}).polluted === undefined);
check('CSV 셀: 수식 시작 문자는 \'로 막고 따옴표는 이스케이프', U.csvCell('=1+1') === '"\'=1+1"' && U.csvCell('@x') === '"\'@x"' && U.csvCell('-5 tips') === '"\'-5 tips"' && U.csvCell('a"b') === '"a""b"' && U.csvCell(null) === '""' && U.csvCell('Hello') === '"Hello"');
check('VTT: 공백만 있는 줄로 구분된 큐도 분리', U.vtt.parse('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA\n \n00:00:01.000 --> 00:00:02.000\nB\n').length === 2);
check('시간 표시', U.fmtClock(3723) === '1:02:03' && U.fmtClock(65) === '01:05' && U.fmtDur(1500) === '25m' && U.fmtDur(3600 * 2 + 60 * 5) === '2h 5m');
check('숫자 축약', U.fmtCompact(22100) === '22.1K' && U.fmtCompact(1500000) === '1.5M' && U.fmtCompact(999) === '999');
check('라우팅', U.route('/home/my-courses/learning/') === 'library' && U.route('/course/abc/learn/lecture/12') === 'player' && U.route('/course/abc/') === 'landing' && U.route('/courses/search/') === 'catalog');
check('파일명 정리', U.safeFile('a/b:c*?"<>|d') === 'a_b_c_d');

// ---------- 화면 구조 점검 ----------
vm.runInContext(fs.readFileSync(path.join(EXT, 'content/diagnose.js'), 'utf8'), ctx, { filename: 'content/diagnose.js' });
const attr = (v) => ({ getAttribute: () => v });
const dom = { video: [{}, {}], '[data-purpose]': ['b', 'a', 'b'].map(attr), '[class*="--"]': [attr('video-player--container--YZ3dK x'), attr('ud-btn--large video-player--container--Qw9Zp')] };
ctx.document.querySelectorAll = (s) => dom[s] || [];
const diagAt = (p) => { ctx.location.pathname = p; return U.diagnose(); };
const PAGES = ['/course/abc/learn/lecture/1', '/home/my-courses/learning/', '/course/abc/', '/courses/search/'];
const dp = diagAt(PAGES[0]);
check('점검: 플레이어는 영상 2개를 세고 없는 요소는 0', dp.route === 'player' && dp.checks[0].count === 2 && dp.checks.slice(1).every((c) => c.count === 0), JSON.stringify(dp.checks.map((c) => c.count)));
check('점검: data-purpose 값은 중복 없이 정렬', dp.purposes.join() === 'a,b');
check('점검: 숨긴 기본 자막(nativeCc)은 없으면 빈 문자열, 영상 안 글자 목록은 배열', dp.capMode === '' && dp.nativeCc === '' && Array.isArray(dp.layout));
check('삭제한 기능(따라 말하기·A-B 반복·도크)의 설정·단축키가 기본값에 남아 있지 않음', !('shadowPause' in U.DEFAULTS.subs) && !('dock' in U.DEFAULTS.player) && !U.DEFAULTS.hotkeys.shadow && !U.DEFAULTS.hotkeys.abLoop);
check('점검: class 접두어는 해시 조각을 떼고 중복 없이', dp.classes.join() === 'ud-btn,video-player--container', dp.classes.join());
check('점검: 목차·메뉴처럼 열어야 보이는 항목은 선택 항목으로 표시', dp.checks.filter((c) => c.optional).length === 2 && diagAt(PAGES[1]).checks.filter((c) => c.optional).length === 1 && diagAt(PAGES[3]).checks.every((c) => c.optional));
check('점검: 화면 종류별 항목 수', [9, 3, 3, 2].every((n, i) => diagAt(PAGES[i]).checks.length === n));
const filesIn = (dir) => fs.readdirSync(path.join(EXT, dir)).filter((f) => f.endsWith('.js')).map((f) => dir + '/' + f);
const SPLITS = [['플레이어', 'content/player', filesIn('content/player')], ['내 학습', 'content/library', filesIn('content/library')]]; // 기능별로 나눈 폴더
const src = [...SPLITS.flatMap((s) => s[2]), 'content/catalog.js', 'content/style.css'].map((f) => fs.readFileSync(path.join(EXT, f), 'utf8')).join('\n');
const missing = PAGES.flatMap((p) => diagAt(p).checks.flatMap((c) => c.sel.split(/,\s*|\s+/))).filter((t) => !src.includes(t));
check('점검: 선택자가 실제 코드와 같음 (어긋나면 엉뚱한 요소를 확인함)', !missing.length, missing.join(' | '));
let onMsg = null, reply = null;
ctx.chrome = { runtime: { onMessage: { addListener: (fn) => { onMsg = fn; } } } };
vm.runInContext(fs.readFileSync(path.join(EXT, 'content/main.js'), 'utf8'), ctx, { filename: 'content/main.js' });
ctx.location.pathname = PAGES[0];
onMsg({ type: 'diagnose' }, {}, (r) => { reply = r; });
check('점검: main.js가 diagnose 메시지에 응답', reply && reply.ok && reply.route === 'player' && reply.checks.length === 9, JSON.stringify(reply && reply.route));
const loadOrder = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).content_scripts[0].js;
check('점검: manifest에서 diagnose.js가 main.js보다 먼저 로드', loadOrder.includes('content/diagnose.js') && loadOrder.indexOf('content/diagnose.js') < loadOrder.indexOf('content/main.js'));
// 파일 사이 호출은 P.이름: 쓰는 이름은 어딘가에서 등록(P.x = … 또는 Object.assign(P, { x }))되어야 하고, 등록만 하고 안 쓰는 이름은 없어야 한다
for (const [label, dir, files] of SPLITS) {
  const loaded = loadOrder.filter((f) => f.startsWith(dir + '/'));
  check(`${label} 분할: 폴더의 파일이 모두 매니페스트에 있고 core가 처음, index가 마지막`, loaded.length === files.length && loaded[0] === `${dir}/core.js` && loaded[loaded.length - 1] === `${dir}/index.js` && loadOrder.indexOf(`${dir}/index.js`) < loadOrder.indexOf('content/main.js'), loaded.join(','));
  const tooLong = files.filter((f) => fs.readFileSync(path.join(EXT, f), 'utf8').split('\n').length > 500);
  check(`${label} 분할: 파일마다 500줄 이하 (코드 규칙)`, !tooLong.length, tooLong.join(','));
  const joined = files.map((f) => fs.readFileSync(path.join(EXT, f), 'utf8')).join('\n');
  const used = new Set([...joined.matchAll(/\bP\.(\w+)/g)].map((m) => m[1]));
  const defined = new Set(['parts']);
  for (const m of joined.matchAll(/\bP\.(\w+)\s*=(?!=)/g)) defined.add(m[1]);
  for (const m of joined.matchAll(/Object\.assign\(P, \{([^}]*)\}\)/g)) m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => defined.add(n));
  const missing = [...used].filter((n) => !defined.has(n));
  const dead = [...defined].filter((n) => !used.has(n));
  check(`${label} 분할: P.이름으로 쓰는 이름이 모두 등록되어 있음 (오타·등록 누락 방지)`, !missing.length, missing.join(','));
  check(`${label} 분할: 등록만 하고 쓰이지 않는 P 이름 없음`, !dead.length, dead.join(','));
}

(async () => {
  // throttle: 50ms 간격 연속 호출 1초 → 최소 여러 번 실행
  let n = 0;
  const th = U.throttle(() => n++, 200);
  const t0 = Date.now();
  await new Promise((resolve) => { const iv = setInterval(() => { th(); if (Date.now() - t0 > 1000) { clearInterval(iv); resolve(); } }, 50); });
  await new Promise((r) => setTimeout(r, 250));
  check('throttle: 연속 변화 중에도 주기적으로 실행 (debounce 고갈 방지)', n >= 5 && n <= 7, `실행 ${n}회`);

  // ---------- background: 번역 묶음/줄 수 불일치 처리 ----------
  const calls = [];
  const bgctx = {
    console, URL, setTimeout, Promise,
    chrome: { storage: { local: { get: async () => ({}), remove: async () => {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} }, openOptionsPage() {} }, commands: { onCommand: { addListener() {} } }, permissions: { contains: async () => true }, tabs: {}, windows: {} },
    fetch: async (url, opts) => {
      const q = decodeURIComponent(String(opts.body).slice(2));
      calls.push(q);
      // 묶음 요청 중 '#' 포함 묶음은 줄 수가 어긋나게 응답 (구글이 줄을 합치는 상황 재현)
      const out = q.includes('#') && q.includes('\n') ? q.replace(/\n/g, ' ') : q.split('\n').map((l) => 'KO:' + l).join('\n');
      return { ok: true, json: async () => [[[out, q]]] };
    },
  };
  vm.createContext(bgctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8') + '\nglobalThis.__t = translateAll;', bgctx);
  const texts = Array.from({ length: 170 }, (_, i) => `line ${i}`);
  const res = await bgctx.__t(texts, 'ko');
  check('번역: 80줄 단위 묶음 요청', calls.length === 3 && res.length === 170 && res[169] === 'KO:line 169', `요청 ${calls.length}회`);
  calls.length = 0;
  const res2 = await bgctx.__t(['a#1', 'b', 'c'], 'ko');
  check('번역: 줄 수 불일치 시 문장별 재요청', calls.length === 4 && res2.join('|') === 'KO:a#1|KO:b|KO:c', `${calls.length}회 ${res2.join('|')}`);

  // 번역 요청이 막힌 경우: 계속 두드리지 않고, 하나도 못 옮기면 실패로 응답
  let failCalls = 0, blockedListener = null, blockedReply = null;
  const failctx = {
    console, URL, setTimeout, Promise,
    chrome: { storage: { local: { get: async () => ({}), remove: async () => {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { blockedListener = fn; } }, openOptionsPage() {} }, commands: { onCommand: { addListener() {} } }, permissions: { contains: async () => true }, tabs: {}, windows: {} },
    fetch: async () => { failCalls++; throw new Error('blocked'); },
  };
  vm.createContext(failctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8') + '\nglobalThis.__t = translateAll;', failctx);
  const rFail = await failctx.__t(texts, 'ko');
  check('번역: 요청이 막히면 계속 두드리지 않고 중단', failCalls === 1 && rFail.every((t) => !t), `요청 ${failCalls}회`);
  blockedListener({ type: 'translate', texts: ['a', 'b'], tl: 'ko' }, {}, (r) => { blockedReply = r; });
  await new Promise((r) => setTimeout(r, 50));
  check('번역: 하나도 못 옮기면 실패로 응답 (빈 번역 캐시 방지)', blockedReply && blockedReply.ok === false, JSON.stringify(blockedReply));

  // ---------- 고아 컨텍스트(확장 업데이트 후 열린 탭) ----------
  const store = { uxk_notes: { 1: [{ id: 'a' }] } };
  const mk = (alive) => ({
    console, setTimeout, clearTimeout, setInterval, URLSearchParams, URL, Promise, Map, Set, Date, Math, JSON,
    location: { href: 'https://www.udemy.com/x', pathname: '/x', origin: 'https://www.udemy.com', host: 'www.udemy.com' },
    document: { addEventListener() {}, cookie: '', documentElement: { classList: { toggle() {} } }, body: null },
    window: { addEventListener() {} }, navigator: {}, history: {},
    chrome: {
      runtime: alive ? { id: 'ext' } : {},
      storage: {
        local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o), remove: async () => {} },
        sync: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener() {} },
      },
    },
  });
  const dead = mk(false); dead.globalThis = dead; vm.createContext(dead);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'lib/common.js'), 'utf8'), dead);
  let threw = null;
  try { await dead.UXK.local.update('uxk_notes', (a) => ({ ...a, 2: [] }), {}); } catch (e) { threw = e; }
  check('고아 컨텍스트: update가 DeadError를 던짐 (조용한 실패 방지)', threw && threw.dead === true, threw && threw.message);
  check('고아 컨텍스트: 기존 데이터 보존', JSON.stringify(store.uxk_notes) === JSON.stringify({ 1: [{ id: 'a' }] }));
  let threw2 = null;
  try { await dead.UXK.saveSettings({ speed: { max: 3 } }); } catch (e) { threw2 = e; }
  check('고아 컨텍스트: 설정 저장도 오류를 알림', threw2 && threw2.dead === true);
  const live = mk(true); live.globalThis = live; vm.createContext(live);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'lib/common.js'), 'utf8'), live);
  await live.UXK.local.update('uxk_notes', (a) => { a[2] = [{ id: 'b' }]; return a; }, {});
  check('정상 컨텍스트: update 저장', store.uxk_notes[2] && store.uxk_notes[2][0].id === 'b');
  const d0 = JSON.stringify(live.UXK.DEFAULTS.subs);
  const s1 = live.UXK.merge(live.UXK.DEFAULTS, {});
  s1.subs.bottom = 99;
  check('merge 결과를 바꿔도 DEFAULTS는 그대로', JSON.stringify(live.UXK.DEFAULTS.subs) === d0);
  check('호스트별 캐시 키', live.UXK.KEYS.courses() === 'uxk_courses_v3:www.udemy.com' && live.UXK.KEYS.courses('acme.udemy.com') === 'uxk_courses_v3:acme.udemy.com');

  console.log(`\n단위 테스트: 통과 ${pass}, 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
