/* 화면 구조 점검: 확장이 기대는 Udemy 화면 요소가 지금 화면에 있는지 센다 (Udemy가 화면을 바꿨는지 확인하는 용도) */
(() => {
  const UXK = globalThis.UXK;
  if (UXK.diagnose) return;

  // [이름, 선택자, 못 찾으면 영향, 정상 화면에서도 없을 수 있음(true)]. 선택자는 player/*.js / library/*.js / catalog.js / style.css 와 같게 유지한다 (tests/unit.js가 어긋남을 검사)
  const SECTION = 'div[data-purpose^="section-panel-"]';
  const CHECKS = {
    player: [
      ['영상', 'video', '속도·자막·메모 등 플레이어 기능 전체'],
      ['영상 틀', '[data-purpose="video-player"], [class*="video-player--container"], [class*="video-viewer--container"], [data-purpose="video-display"]', '도구 막대 위치 (못 찾으면 영상의 부모 요소에 붙임)'],
      ['코스 번호', '[data-module-id="course-taking"][data-module-args], [data-clp-course-id], [data-course-id]', '내 강의 목록으로 대신 찾음 (첫 방문은 수 초 지연)'],
      ['Udemy 속도 메뉴', '[data-purpose*="playback-rate"]', 'Udemy 메뉴로 바꾼 속도를 따라가는 기능'],
      ['다음 강의 버튼', '[data-purpose="go-to-next"], #go-to-next-item, [class*="next-and-previous--next"]', 'N 키 (못 찾으면 커리큘럼 정보로 이동)'],
      ['이전 강의 버튼', '[data-purpose="go-to-previous"], #go-to-previous-item, [class*="next-and-previous--previous"]', 'P 키 (못 찾으면 커리큘럼 정보로 이동)'],
      ['커리큘럼 섹션 (목차를 연 상태에서 점검)', SECTION, '섹션 전체 완료 버튼, 섹션별 남은 시간 표시', true],
      ['섹션 완료 체크박스 (목차를 연 상태에서 점검)', SECTION + ' input[type="checkbox"]', '섹션 전체 완료 버튼, 완료 변화에 따른 남은 시간 갱신', true],
      ['Udemy 기본 자막 틀', '[class*="captions-display--captions-container"]', 'Udemy 기본 자막 숨기기 (이중 자막과 겹침)'],
    ],
    library: [
      ['강의 카드', '[class*="enrolled-course-card--container"]', '카드 배지, 새로고침 없는 보관'],
      ['카드의 강의 링크', '[class*="enrolled-course-card--container"] a[href*="course_id="]', '카드 배지, 새로고침 없는 보관'],
      ['카드 메뉴의 보관 항목 (메뉴를 연 상태에서만 보임)', '[data-purpose="toggle-archived"]', '없어도 "보관" 글자로 인식함', true],
    ],
    catalog: [
      ['강의 카드 (검색·목록 화면에서 점검)', '[data-purpose="course-card-container"], [data-purpose="search-course-card"], [class*="course-card--container"], [class*="course-card-module--container"], [class*="browse-course-card"]', '보유 강의 숨기기 (배지는 링크 옆에 표시)', true],
      ['강의 링크 (검색·목록 화면에서 점검)', 'a[href*="/course/"]', '"보유 중" 배지 전체', true],
    ],
  };
  CHECKS.landing = CHECKS.catalog.concat([['강의 번호 속성', '[data-clp-course-id]', '보유하지 않은 강의의 정보 상자']]);

  UXK.diagnose = function () {
    const route = UXK.route();
    const checks = (CHECKS[route] || []).map(([name, sel, impact, optional = false]) => ({ name, sel, impact, optional, count: document.querySelectorAll(sel).length }));
    // 새 화면의 요소 이름을 찾는 단서: data-purpose 값, 그리고 class 접두어 (class 끝의 해시 조각 `--abc12`는 빌드마다 바뀌므로 뗀다)
    const names = (sel, pick) => [...new Set(Array.from(document.querySelectorAll(sel)).flatMap(pick))].sort();
    const purposes = names('[data-purpose]', (n) => [n.getAttribute('data-purpose')]).slice(0, 500);
    const classes = names('[class*="--"]', (n) => String(n.getAttribute('class')).split(/\s+/).filter((c) => c.includes('--')).map((c) => c.replace(/--\w{4,8}$/, ''))).slice(0, 300);
    const dockEl = document.querySelectorAll('.uxk-dock')[0]; // 도구 줄이 놓인 방식: below(영상 바로 아래) / inside / fixed(화면 맨 아래)
    return { route, checks, purposes, classes, dock: dockEl ? dockEl.dataset.mode || '' : '' };
  };
})();
