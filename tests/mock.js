// 모의 Udemy: 페이지 HTML + API 응답 (Playwright route로 제공)
const fs = require('fs');
const path = require('path');

const VIDEO = fs.readFileSync(path.join(__dirname, 'assets/video.webm'));

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function makeCourses() {
  const r = rng(42);
  const cats = ['Development', 'Business', 'Language', 'IT & Software'];
  const list = [];
  for (let i = 0; i < 280; i++) {
    const id = 101 + i;
    const archived = i >= 250;
    const rating = 3.4 + r() * 1.6;
    list.push({
      _class: 'course', id,
      title: id === 101 ? 'Python 부트캠프 테스트' : `Course ${id} ${['SQL', 'Python', 'Spanish', 'Excel'][i % 4]}`,
      url: `/course/slug-${id}/learn/`, published_title: `slug-${id}`,
      avg_rating: Math.round(rating * 100) / 100, num_reviews: Math.floor(r() * 20000), num_subscribers: Math.floor(r() * 300000),
      last_update_date: i % 9 === 0 ? null : `202${Math.floor(r() * 6)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`,
      content_length_video: Math.floor(1800 + r() * 200000), estimated_content_length: 100,
      completion_ratio: i % 10 === 0 ? 100 : i % 7 === 0 ? 35 : 0,
      enrollment_time: `20${19 + Math.floor(r() * 7)}-05-01T00:00:00Z`,
      last_accessed_time: i % 3 === 0 ? null : '2026-10-01T00:00:00Z',
      favorite_time: i % 25 === 0 ? '2026-01-01T00:00:00Z' : null,
      archive_time: archived ? '2026-02-01T00:00:00Z' : null,
      image_240x135: '', visible_instructors: [{ _class: 'user', title: `Instructor ${i % 13}` }], num_collections: 0,
      primary_category: { _class: 'course_category', title: cats[i % 4] },
      locale: i % 4 === 2 ? { locale: 'es_ES', simple_english_title: 'Spanish' } : { locale: 'en_US', simple_english_title: 'English' },
      caption_languages: i % 2 ? ['English [Auto]', 'Korean [Auto]'] : ['English [Auto]'],
      has_closed_caption: true, created: '2019-02-19T17:03:29Z', num_published_lectures: 50,
    });
  }
  return list;
}

const VTT_EN = `WEBVTT

00:00:00.000 --> 00:00:02.000
Hello world

00:00:02.000 --> 00:00:04.000
Second sentence here

00:00:04.500 --> 00:00:07.000
Third <i>sentence</i> &amp; more

00:00:07.000 --> 00:00:30.000
Long cue
`;
const VTT_KO = `WEBVTT

00:00:00.000 --> 00:00:02.000
안녕 세상

00:00:02.000 --> 00:00:04.000
두 번째 문장

00:00:04.500 --> 00:00:07.000
세 번째 문장

00:00:07.000 --> 00:00:30.000
긴 문장
`;

const LIB_HTML = (cards) => `<!doctype html><html><head><meta charset="utf-8"><title>내 학습 | Udemy</title></head><body>
<header>Udemy header <a href="/course/slug-101/">header link</a></header>
<main id="grid" style="display:grid;grid-template-columns:repeat(3,300px);gap:16px">
${cards.map((id) => `<div><div class="enrolled-course-card--container--WJYo9 details-done">
  <div class="course-card-module--container--3oS-F">
    <div class="course-card-module--main-content--pEiUr">
      <h3 data-purpose="course-title-url"><a href="/course-dashboard-redirect/?course_id=${id}">Course ${id}</a></h3>
      <button class="menu-btn" data-id="${id}">⋮</button>
      <ul class="menu" hidden><li><button data-purpose="toggle-archived">현 강의 보관</button></li></ul>
    </div>
  </div>
</div></div>`).join('')}
</main>
<script>
  // Udemy 흉내: 보관 클릭 → API 호출 후 새로고침
  sessionStorage.setItem('loads', String(+(sessionStorage.getItem('loads') || 0) + 1));
  document.addEventListener('click', (e) => {
    const m = e.target.closest('.menu-btn');
    if (m) { m.nextElementSibling.hidden = false; return; }
    const t = e.target.closest('[data-purpose="toggle-archived"]');
    if (t) {
      const id = +t.closest('.enrolled-course-card--container--WJYo9').querySelector('a').href.match(/course_id=(\\d+)/)[1];
      fetch('/api-2.0/users/me/archived-courses/?fields[course]=archive_time', { method: 'POST', body: JSON.stringify({ course_id: id, native: true }) })
        .then(() => setTimeout(() => location.reload(), 100));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu').forEach((m) => (m.hidden = true)); });
</script></body></html>`;

const PLAYER_HTML = (lectureId, clip = false) => `<!doctype html><html><head><meta charset="utf-8"><title>Python 부트캠프 테스트 | Udemy</title></head><body>
<div data-module-id="course-taking" data-module-args='{"courseId":101,"isMobile":false}'>
  <header><h1 data-purpose="course-header-title">Python 부트캠프 테스트</h1></header>
  <input id="page-input" placeholder="page input">
  ${clip ? '<div style="height:460px;overflow:hidden">' : ''}<div data-purpose="video-player" style="position:relative;width:800px;height:450px;background:#000">
    <video id="v" src="/mock/video.webm" muted autoplay playsinline style="width:100%;height:100%"></video>
    <div data-purpose="video-controls" style="position:absolute;left:0;bottom:0"><button data-purpose="playback-rate-button">1x</button></div>
    <div class="captions-display--captions-container--PqdGQ" style="position:absolute;left:0;bottom:30px;color:#fff">native caption</div>
  </div>${clip ? '</div>' : ''}
  <a id="go-to-next-item" href="#">next</a>
  <div data-purpose="curriculum-section-container" style="width:400px">
    <div data-purpose="section-panel-0"><button class="ud-accordion-panel-title">Section 1</button>
      <div role="group"><label><input type="checkbox" data-lid="1001"> L1</label><label><input type="checkbox" data-lid="1002" checked> L2</label></div></div>
    <div data-purpose="section-panel-1"><button class="ud-accordion-panel-title">Section 2</button>
      <div role="group"><label><input type="checkbox" data-lid="1003"> L3</label></div></div>
  </div>
</div>
<script>
  window.__completeCalls = [];
  const v = document.getElementById('v');
  // Udemy 흉내: 새 강의 로드 시 속도를 1로 초기화
  v.addEventListener('loadedmetadata', () => { setTimeout(() => { v.playbackRate = 1; }, 50); });
  document.getElementById('go-to-next-item').addEventListener('click', (e) => {
    e.preventDefault();
    const cur = +location.pathname.match(/lecture\\/(\\d+)/)[1];
    history.pushState({}, '', '/course/test-course/learn/lecture/' + (cur + 1));
    v.src = '/mock/video.webm?l=' + (cur + 1);
    v.play().catch(() => {});
  });
  document.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) window.__completeCalls.push([e.target.dataset.lid, e.target.checked]); });
</script></body></html>`;

const SEARCH_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>검색 | Udemy</title></head><body>
<header><div class="my-learning-dropdown"><a href="/course/slug-101/">header recent course</a></div></header>
<div class="course-list">
  <div data-purpose="course-card-container" id="card-owned"><a href="/course/slug-101/"><h3>Owned course</h3></a></div>
  <div data-purpose="course-card-container" id="card-archived"><a href="/course/slug-360/"><h3>Archived owned</h3></a></div>
  <div data-purpose="course-card-container" id="card-new"><a href="/course/brand-new/"><h3>New course</h3></a></div>
</div>
<ul id="desc"><li id="desc-li">설명문 속 링크: <a href="/course/slug-101/">이 강의</a>도 참고</li></ul>
<div class="course-list-2">
</div></body></html>`;

const LANDING_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Landing | Udemy</title></head><body data-clp-course-id="101">
<h1>Landing page of slug-101</h1></body></html>`;

function createMock(opts = {}) {
  const courses = makeCourses();
  const log = { archivePosts: [], archiveDeletes: [], requests: [] };
  const pick = (c, fields) => { const o = { _class: 'course', id: c.id }; fields.forEach((f) => { if (f in c) o[f] = c[f]; }); return o; };

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    log.requests.push(`${req.method()} ${p}${url.search}`);
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

    if (url.hostname === 'udemy-captions.s3.amazonaws.com') {
      log.captionFetches = (log.captionFetches || 0) + 1;
      return route.fulfill({ status: 200, contentType: 'text/vtt', headers: opts.noCors ? {} : { 'Access-Control-Allow-Origin': '*' }, body: p.includes('/ko') ? VTT_KO : VTT_EN });
    }
    if (p === '/mock/video.webm') {
      const range = req.headers()['range'];
      const total = VIDEO.length;
      if (range) {
        const m2 = range.match(/bytes=(\d*)-(\d*)/);
        let start = m2[1] ? +m2[1] : 0;
        let end = m2[2] ? Math.min(+m2[2], total - 1) : total - 1;
        if (!m2[1] && m2[2]) { start = total - +m2[2]; end = total - 1; }
        return route.fulfill({ status: 206, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) }, body: VIDEO.subarray(start, end + 1) });
      }
      return route.fulfill({ status: 200, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(total) }, body: VIDEO });
    }
    if (p.startsWith('/home/my-courses/')) return route.fulfill({ status: 200, contentType: 'text/html', body: LIB_HTML([101, 102, 103]) });
    if (/^\/course\/[^/]+\/learn\/lecture\/(\d+)/.test(p)) return route.fulfill({ status: 200, contentType: 'text/html', body: PLAYER_HTML(+RegExp.$1, opts.clipPlayer) });
    if (p.startsWith('/courses/search')) return route.fulfill({ status: 200, contentType: 'text/html', body: SEARCH_HTML });
    if (/^\/course\/slug-101\/?$/.test(p)) return route.fulfill({ status: 200, contentType: 'text/html', body: LANDING_HTML });

    if (p === '/api-2.0/users/me/subscribed-courses/') {
      const fields = (url.searchParams.get('fields[course]') || '').split(',');
      if (opts.rejectExtra && fields.some((f) => ['primary_category', 'locale', 'caption_languages'].includes(f))) return json({ detail: 'bad field' }, 400);
      const arch = url.searchParams.get('is_archived');
      const list = courses.filter((c) => (arch == null ? true : arch === 'true' ? !!c.archive_time : !c.archive_time));
      const page = +url.searchParams.get('page') || 1, size = +url.searchParams.get('page_size') || 12;
      const results = list.slice((page - 1) * size, page * size).map((c) => pick(c, fields));
      const next = page * size < list.length ? (() => { const u = new URL(url); u.searchParams.set('page', page + 1); return u.toString(); })() : null;
      await new Promise((r) => setTimeout(r, 30));
      return json({ count: list.length, next, previous: null, results });
    }
    if (p === '/api-2.0/users/me/archived-courses/' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      log.archivePosts.push({ body, headers: req.headers() });
      const c = courses.find((x) => x.id === body.course_id);
      if (c) c.archive_time = new Date().toISOString();
      return json({ _class: 'course', id: body.course_id, archive_time: new Date().toISOString() }, 201);
    }
    let m;
    if ((m = p.match(/^\/api-2.0\/users\/me\/archived-courses\/(\d+)\/$/)) && req.method() === 'DELETE') {
      log.archiveDeletes.push(+m[1]);
      const c = courses.find((x) => x.id === +m[1]);
      if (c) c.archive_time = null;
      return route.fulfill({ status: 204, body: '' });
    }
    if ((m = p.match(/^\/api-2.0\/users\/me\/subscribed-courses\/(\d+)\/lectures\/(\d+)\/$/))) {
      const lid = +m[2];
      return json({ _class: 'lecture', id: lid, title: `Lecture ${lid}`, asset: { _class: 'asset', asset_type: 'Video', time_estimation: 600, captions: [
        { _class: 'caption', locale_id: 'en_US', video_label: 'English [Auto]', source: 'auto', is_translation: false, url: `https://udemy-captions.s3.amazonaws.com/${lid}/en_US/x.vtt?Signature=a` },
        { _class: 'caption', locale: { locale: 'ko_KR' }, video_label: '한국어 [자동]', source: 'auto', is_translation: true, url: `https://udemy-captions.s3.amazonaws.com/${lid}/ko_KR/x.vtt?Signature=b` },
      ] } });
    }
    if ((m = p.match(/^\/api-2.0\/courses\/(\d+)\/subscriber-curriculum-items\/$/))) {
      const withCaps = (url.searchParams.get('fields[asset]') || '').includes('captions');
      const cap = (lid) => (withCaps ? [{ locale_id: 'en_US', video_label: 'English [Auto]', source: 'auto', url: `https://udemy-captions.s3.amazonaws.com/${lid}/en_US/x.vtt` }] : undefined);
      const lec = (id, sec, title) => ({ _class: 'lecture', id, title, object_index: id - 1000, asset: { asset_type: 'Video', time_estimation: sec, captions: cap(id) } });
      return json({ count: 5, next: null, results: [
        { _class: 'chapter', id: 1, title: 'Section 1' }, lec(1001, 600, 'Lecture 1001'), lec(1002, 300, 'Lecture 1002'),
        { _class: 'chapter', id: 2, title: 'Section 2' }, lec(1003, 900, 'Lecture 1003'),
      ] });
    }
    if ((m = p.match(/^\/api-2.0\/users\/me\/subscribed-courses\/(\d+)\/progress\/$/))) {
      if (opts.noProgress) return json({ detail: 'not found' }, 404);
      return json({ completed_lecture_ids: [1002], completed_quiz_ids: [] });
    }
    if ((m = p.match(/^\/api-2.0\/courses\/(\d+)\/$/))) {
      return json({ _class: 'course', id: +m[1], created: '2019-02-19T17:03:29Z', last_update_date: '2025-12-02', caption_languages: ['English [Auto]', 'Korean [Auto]'], content_length_video: 200000, num_reviews: 3695 });
    }
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'mock 404 ' + p });
  }
  return { handle, log, courses, setClip: (on) => { opts.clipPlayer = on; } }; // 영상 영역이 잘리는 화면 (도크 대체 위치 시험용)
}

module.exports = { createMock };
