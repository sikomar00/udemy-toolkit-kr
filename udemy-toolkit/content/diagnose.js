/* 화면 구조 점검: 확장이 기대는 Udemy 화면 요소가 지금 화면에 있는지 센다 (Udemy가 화면을 바꿨는지 확인하는 용도) */
(() => {
  const UXK = globalThis.UXK;
  if (UXK.diagnose) return;

  // [이름, 선택자, 못 찾으면 영향, 정상 화면에서도 없을 수 있음(true)]. 선택자는 player/*.js / library/*.js / catalog.js / style.css 와 같게 유지한다 (tests/unit.js가 어긋남을 검사)
  const SECTION = 'div[data-purpose^="section-panel-"]';
  const CHECKS = {
    player: [
      ['Video', 'video', 'All player features (speed, subtitles, notes…)'],
      ['Video frame', '[data-purpose="video-player"], [class*="video-player--container"], [class*="video-viewer--container"], [data-purpose="video-display"]', 'Toolbar position (falls back to the video\'s parent element)'],
      ['Course ID', '[data-module-id="course-taking"][data-module-args], [data-clp-course-id], [data-course-id]', 'Looked up via your course list instead (a few seconds slower on the first visit)'],
      ['Udemy speed menu', '[data-purpose*="playback-rate"]', 'Following speed changes made in the Udemy menu'],
      ['Next lecture button', '[data-purpose="go-to-next"], #go-to-next-item, [class*="next-and-previous--next"]', 'N key (falls back to curriculum data)'],
      ['Previous lecture button', '[data-purpose="go-to-previous"], #go-to-previous-item, [class*="next-and-previous--previous"]', 'P key (falls back to curriculum data)'],
      ['Curriculum sections (check with the curriculum open)', SECTION, 'Mark-section-complete buttons, per-section time left', true],
      ['Section completion checkboxes (check with the curriculum open)', SECTION + ' input[type="checkbox"]', 'Mark-section-complete buttons, time-left updates when completion changes', true],
      ['Udemy native caption frame', '[class*="captions-display--captions-container"]', 'Hiding Udemy captions (they would overlap dual subtitles)'],
    ],
    library: [
      ['Course card', '[class*="enrolled-course-card--container"]', 'Card badges, archive without reload'],
      ['Course link in card', '[class*="enrolled-course-card--container"] a[href*="course_id="]', 'Card badges, archive without reload'],
      ['Archive item in card menu (visible only with the menu open)', '[data-purpose="toggle-archived"]', 'Also recognized by its "Archive" label', true],
    ],
    catalog: [
      ['Course card (check on search/list pages)', '[data-purpose="course-card-container"], [data-purpose="search-course-card"], [class*="course-card--container"], [class*="course-card-module--container"], [class*="browse-course-card"]', 'Hiding owned courses (badges appear next to links)', true],
      ['Course link (check on search/list pages)', 'a[href*="/course/"]', 'All "Owned" badges', true],
    ],
  };
  CHECKS.landing = CHECKS.catalog.concat([['Course ID attribute', '[data-clp-course-id]', 'Info box for courses you do not own']]);

  const nameOf = (n) => `${n.tagName.toLowerCase()}${n.getAttribute('data-purpose') ? `[${n.getAttribute('data-purpose')}]` : ''}.${String(n.getAttribute('class') || '').split(/s+/)[0].replace(/--w{4,8}$/, '')}`;
  // 영상 바로 아래에 무엇이 있는지 (이중 자막 박스가 놓일 자리를 찾는 단서): 영상 아래 몇 군데에서 찾은 요소와 위로 올라가는 부모들의 이름·위치
  function layoutBelowVideo() {
    try {
      const v = document.querySelectorAll('video')[0];
      const vr = v.getBoundingClientRect();
      const rect = (r) => `top ${Math.round(r.top)} h ${Math.round(r.height)} w ${Math.round(r.width)}`;
      const out = [`video ${rect(vr)}`];
      for (const dy of [10, 30, 60, 90]) {
        let n = document.elementFromPoint(vr.left + vr.width / 2, vr.bottom + dy);
        const chain = [];
        for (let i = 0; n && n !== document.body && i < 5; i++, n = n.parentElement) chain.push(`${nameOf(n)} (${rect(n.getBoundingClientRect())})`);
        out.push(`+${dy}px: ${chain.join(' < ')}`);
      }
      return out;
    } catch (e) { return []; }
  }
  // 영상 영역 안에서 글자를 가진 요소 목록 (기본 자막을 찾는 단서): 이름 · 위치(영상 영역 안 세로 %) · 글자 앞부분. 숨긴 것은 [숨김]으로 표시
  function playerTexts() {
    try {
      const v = document.querySelectorAll('video')[0];
      const host = v.closest('[data-purpose="video-player"], [class*="video-player--container"], [class*="video-viewer--container"], [data-purpose="video-display"]') || v.parentElement;
      const hr = host.getBoundingClientRect();
      const out = [`Video area ${nameOf(host)} (top ${Math.round(hr.top)} h ${Math.round(hr.height)} w ${Math.round(hr.width)})`];
      const seen = new Set();
      const walker = document.createTreeWalker(host.parentElement || host, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t && out.length < 16; t = walker.nextNode()) {
        const text = t.nodeValue.replace(/s+/g, ' ').trim(), e = t.parentElement;
        if (text.length < 3 || !e || seen.has(e) || e.closest('.uxk-layer, .uxk-toolbar')) continue;
        seen.add(e);
        const r = e.getBoundingClientRect(), hidden = !!e.closest('[data-uxk-native-cc]');
        const pct = hr.height ? Math.round(((r.top + r.height / 2 - hr.top) / hr.height) * 100) : 0;
        if (!hidden && (pct < -5 || pct > 105 || r.left > hr.right || r.right < hr.left)) continue; // 영상 영역 밖의 글자는 뺀다
        out.push(`${hidden ? '[hidden] ' : ''}${nameOf(e)} ${pct}% · ${text.slice(0, 28)}`);
      }
      return out;
    } catch (e) { return []; }
  }

  UXK.diagnose = function () {
    const route = UXK.route();
    const checks = (CHECKS[route] || []).map(([name, sel, impact, optional = false]) => ({ name, sel, impact, optional, count: document.querySelectorAll(sel).length }));
    // 새 화면의 요소 이름을 찾는 단서: data-purpose 값, 그리고 class 접두어 (class 끝의 해시 조각 `--abc12`는 빌드마다 바뀌므로 뗀다)
    const names = (sel, pick) => [...new Set(Array.from(document.querySelectorAll(sel)).flatMap(pick))].sort();
    const purposes = names('[data-purpose]', (n) => [n.getAttribute('data-purpose')]).slice(0, 500);
    const classes = names('[class*="--"]', (n) => String(n.getAttribute('class')).split(/\s+/).filter((c) => c.includes('--')).map((c) => c.replace(/--\w{4,8}$/, ''))).slice(0, 300);
    // 이중 자막이 놓인 방식: box(영상 아래 기본 자막 띠 자리) / overlay(영상 위) / 비어 있음(이중 자막 꺼짐)
    const capMode = document.querySelectorAll('.uxk-capbox')[0] ? 'box' : document.documentElement.classList.contains('uxk-hide-native-cc') || document.querySelectorAll('[data-uxk-native-cc]')[0] ? 'overlay' : '';
    // 모양으로 찾아 숨긴 Udemy 기본 자막 요소 (없으면 빈 문자열)
    const hid = document.querySelectorAll('[data-uxk-native-cc]')[0];
    const nativeCc = hid ? nameOf(hid) : '';
    return { route, checks, purposes, classes, capMode, nativeCc, layout: layoutBelowVideo().concat(playerTexts()) };
  };
})();
