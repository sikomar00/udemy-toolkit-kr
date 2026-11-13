# Udemy Toolkit KR v2 — 설계 메모 (내부)

## 근거 등급
- [실측] 2026-11-01 사용자 계정 Udemy 페이지에서 직접 확인
- [코드] 오픈소스 코드에서 확인 (실측 아님)
- [추정] 근거 약함, 실패 시 대체 경로 필수

## 엔드포인트
- [실측] GET /api-2.0/users/me/subscribed-courses/?page_size=100&page=N&is_archived=false|true&fields[course]=...
  - 정렬 파라미터 미사용(기본 순서로 v1에서 1,647개 중복·누락 없음 확인). 병렬 수집 후 개수가 모자라면 next 링크로 순차 재수집
  - 필드: title, avg_rating, num_reviews, last_update_date, num_subscribers, content_length_video,
    estimated_content_length, completion_ratio, archive_time, favorite_time, enrollment_time,
    last_accessed_time, num_collections, image_240x135, visible_instructors, published_title, url
  - 기본 목록(is_archived 미지정)은 보관 강의 포함
- [실측] POST /api-2.0/users/me/archived-courses/?fields[course]=archive_time  body {"course_id":N}
- [추정] DELETE /api-2.0/users/me/archived-courses/{id}/  (보관 해제)
- [코드] GET /api-2.0/courses/{id}/subscriber-curriculum-items/?page_size=..&fields[lecture]=title,sort_order,asset&fields[asset]=title,filename,asset_type,time_estimation,captions
- [코드] GET /api-2.0/users/me/subscribed-courses/{cid}/lectures/{lid}/?fields[lecture]=asset&fields[asset]=captions
  - captions[]: url(S3 presigned), locale_id 또는 locale.locale, video_label, source, is_translation
- [코드] GET /api-2.0/courses/{id}/?fields[course]=created,caption_languages,locale,has_closed_caption ...
- [추정] GET /api-2.0/users/me/subscribed-courses/{cid}/progress/?fields[course]=completed_lecture_ids,...
- [코드] 확장 필드 primary_category, locale, caption_languages 는 목록 API에서 지원 여부 미확인 → 탐색 후 실패 시 제외

## DOM
- [실측] 내 학습 카드: div[class*="enrolled-course-card--container"], 링크 a[href*="course-dashboard-redirect/?course_id="]
- [코드] 카드 메뉴 보관: [data-purpose="toggle-archived"], 보관 후 location.reload (실측: 새로고침 발생)
- [코드] 플레이어: [data-module-id="course-taking"][data-module-args] (courseId), video,
  [data-purpose="video-controls"], [data-purpose="playback-rate-button"], [data-purpose="playback-rate-menu"],
  #go-to-next-item / #go-to-previous-item / [data-purpose="go-to-next"],
  [data-purpose="curriculum-section-container"], div[data-purpose^="section-panel-"], input[type=checkbox],
  [data-purpose="transcript-panel"], [data-purpose="cue-text"], [class*="captions-display--captions-container"],
  [class*="curriculum-item-view--scaled-height-limiter"]
- Udemy 내장 단축키: Space, ←/→, Shift+←/→, ↑/↓, F, Esc, B, M, ?  → 충돌 금지

## 제외
- 영상 다운로드/DRM 우회, 전체 강의 일괄 완료(수료증), 쿠폰 크롤링, 볼륨 부스트(WebAudio로 음소거 위험)

## 리뷰 반영 (v2.0 출시 전)
- 로그아웃 상태 방문 시 확장 필드 오판·7일 캐시 → 기본 필드 성공 후에만 탐색, 실패 시 캐시 안 함, 자동 갱신 1시간 백오프
- 확장 업데이트 후 고아 탭에서 저장 실패를 '저장됨'으로 표시 → DeadError로 알리고 메모는 클립보드 보존, 읽기 실패로 덮어쓰기 방지(getStrict)
- 빠른 강의 전환 시 자막·번역 캐시 혼선 → 시작 시점 강의 ID 고정, stale 작업 취소
- 캡처가 같은 창의 다른 사이트를 잘라 저장할 위험 → Udemy 탭이 활성일 때만 캡처
- 개인/Business 계정 캐시 혼재 → 호스트별 키, 탭 간 갱신은 navigator.locks로 1회만
- 보유 강의 숨기기 범위 과다 → 알려진 카드 컨테이너만, 강의 링크 여러 개면 제외
- 남은 시간 표시가 Udemy 재생 버튼을 가림 → 영상 레이어 좌상단(호버 시 표시)
- 기본 PiP/넓게 보기 키를 Alt+P / Alt+T로 (Udemy의 I/T 사용 가능성 대비)
- 속도 강제 적용: 줄다리기(3초 안에 8회) 감지 시 지정 속도를 버리지 않고 5초 쉬었다 재적용. Udemy 자체 메뉴 변경 채택 창(1.5초)은 1회 사용 후 소모

## 종합 점검 반영 (v2.0 이후)
읽기 전용 점검 3건(플레이어 / 내 학습·API / 백그라운드·설정·테스트)의 지적을 코드로 확인한 뒤 고친 항목.
- 보안·데이터: CSV 수식 주입 차단(`UXK.csvCell`), 설정은 기본값과 자료형이 같은 값만 수용(`UXK.conform`, 복원 파일·동기화값이 설정을 망가뜨려 팝업이 멈추던 문제), 백업 복원은 쓰기 전에 전부 검사하고 저장 실패를 알림, 목록 응답이 JSON 목록이 아니거나 비면 기존 캐시를 덮어쓰지 않음, 필드 탐색의 일시 오류(429·5xx)는 7일 캐시하지 않음, Retry-After 상한 30초, 한 페이지 요청이 실패하면 나머지 작업자도 중단, innerHTML에 들어가는 API 문자열 이스케이프, 호스트 정규식을 `([a-z0-9-]+\.)*udemy\.com`으로 고정.
- 번역: 요청이 막히면 계속 두드리지 않고 중단, 하나도 못 옮기면 실패로 응답, 빈 문장이 섞인 결과와 다른 트랙의 결과는 캐시하지 않음, 이 PC에 권한이 없다는 이유로 동기화되는 `subs.translate` 값을 끄지 않음.
- 플레이어: 도구 막대·남은 시간·섹션 버튼 클릭 뒤 초점이 남아 Space가 다시 누르던 문제, 다른 코스로 재진입·이동 시 이전 코스 ID가 쓰이던 문제, 학습 시간 저장 실패 시 시간 유실, 단축키 캡처가 화면 캡처보다 깨끗한 프레임을 먼저 쓰도록, 같은 초 문장 저장 누락, 키보드로 고른 Udemy 속도 메뉴, 입력 중 강의가 바뀌면 다른 강의에 저장되던 메모·내보내기, 진행 API 응답 모양 검증, 연습 화면에서 N 키가 첫 강의로 가던 문제, 언어 변경 중 불러오기 결과가 낡은 채 남던 문제(`subs.gen`), 속도 변경이 늦은 저장값에 덮이던 문제, 긴 무음 구간에서 문장 반복이 아주 오래된 문장을 잡던 문제, 섹션 전체 완료의 중복 실행 방지.
- 화면: 메모 입력창은 바깥 클릭으로 닫히지 않음, 한글 입력 중 Enter로 제출되지 않음, 위험 확인창 초점, 닫으면 초점 복원, 키보드 초점이 도구 막대에 오면 보이게, 단축키 입력칸 Tab 통과, 이름표·`role=status`, 어두운 모드 위험색·기본 버튼 대비.

의도적으로 미룬 항목 (이유)
- 여러 탭이 동시에 캐시·메모를 쓸 때의 갱신 유실: 저장소 구조 변경이 필요해 별도 작업.
- 카드 메뉴 가로채기의 다른 코스 오인, 일괄 보관의 첫 실패 중단 정책, 재시도 POST의 멱등성: 실제 Udemy 동작 확인 없이는 안전한 기준을 정할 수 없음.
- `captureVisibleTab`(화면 캡처 대체 경로)이 activeTab 없이 동작하는지, 실제 새 강의 화면의 선택자: 실제 계정에서 확인 필요(팝업의 화면 구조 점검).
- `VTT find()`가 긴 큐에 겹친 짧은 큐를 놓치는 경우, `toggle-play`가 다른 Udemy 탭을 고르는 경우: 실제 자막·사용 패턴에서 드묾.
- `run()` 분기 표 전환: 회귀 위험이 있어 사용자 결정 필요. (`player.js`와 `library.js`는 아래 구조로 분할 완료)
- 작은 글씨 색 대비(`.uxk-owned`, 평점 색 등)와 모달 포커스 트랩: 디자인 결정 필요.

## 플레이어 파일 구조 (content/player/)
원래 한 파일(player.js, 약 1,290줄)이던 것을 기능별 파일로 나눔(이후 dock.js 추가). 각 파일은 500줄 이하(tests/unit.js가 검사). 로드 순서는 manifest.json이 정한다: core → speed → subs → transcript → lessons → notes → tools → dock → index → (catalog, diagnose, main).

| 파일 | 내용 |
|---|---|
| core.js | 공유 객체 `UXK.playerShared`(=P) 만들기, 강의 컨텍스트(`ctx`), 영상 찾기, 오버레이 레이어(도구 막대·자막 상자·알림 `indicator`) |
| speed.js | 배속 저장·복원, Udemy가 되돌릴 때 재적용, 줄다리기 감지 |
| subs.js | 자막 불러오기·번역, 이중 자막 표시, 문장 반복·A-B 반복·문장 복사/수집 |
| transcript.js | 대본 복사, 자막 메뉴, 이 강의/코스 전체 자막 내보내기 |
| lessons.js | 강의 이동, 커리큘럼·남은 시간, 섹션 전체 완료 |
| notes.js | 타임스탬프 메모, 메모 목록·내보내기, 메모 링크로 이동 |
| tools.js | PiP·화면 캡처, 더 보기 메뉴·도움말, 학습 시간 기록 |
| dock.js | 도크: 영상 바로 아래의 상시 도구 줄 + 자막 영역 (아래 "도크" 참고) |
| index.js | 단축키·`run()` 명령 처리, 영상 연결, `init`/`destroy`/`onSettings`/`onUrl`/`onMessage`, 공개 객체 `UXK.playerPage` |

공유 규칙
- 한 파일 안에서만 쓰는 함수·변수는 그 파일의 지역 이름을 그대로 쓴다.
- 다른 파일에서 부르는 함수·상수·객체는 자기 파일 끝의 `Object.assign(P, { … })`에 등록하고, 쓰는 쪽은 **호출하는 시점에** `P.이름`으로 부른다 (파일 로드 시점에 다른 파일의 이름을 쓰면 안 됨. 로드 순서가 보장되는 것은 앞선 파일뿐).
- 여러 파일이 읽고 쓰는 `let` 변수(`S`, `layer`, `subsBox`, `sub1`, `sub2`, `speedLabel`, `lastT`, `remaining`, `pill`, `exportAbort`)는 처음부터 `P.이름`에 두고 어디서나 `P.이름`으로 읽고 쓴다.
- 새로 함수를 다른 파일에서 쓰게 되면 등록(위 규칙)을 잊지 말 것. `P.이름`으로 쓰는 이름이 등록되지 않았거나 등록만 하고 쓰이지 않는 이름은 tests/unit.js가 잡는다. 다만 이름이 맞아도 동작이 맞는지는 통합 테스트가 다루는 경로만 확인된다.

## 내 학습 파일 구조 (content/library/)
원래 한 파일(library.js, 692줄)이던 것을 기능별 5개로 나눔. 공유 규칙은 플레이어와 같고(위 "공유 규칙"), 공유 객체 이름만 `UXK.libraryShared`(=P)다. 로드 순서는 manifest.json이 정한다: core → panel → actions → cards → index.

| 파일 | 내용 |
|---|---|
| core.js | 공유 상태, 데이터 불러오기(`ensureData`), 필터·정렬(`applyFilters`, `applySort`, `currentRows`) |
| panel.js | 패널 만들기, 필터 입력 읽기·쓰기, 목록·통계·일괄 선택 표시(`render`) |
| actions.js | 패널 클릭 처리, 태그·메모 편집, 일괄 보관, CSV·Markdown·JSON 내보내기 |
| cards.js | Udemy 기본 카드에 배지 추가, 카드 메뉴의 보관을 새로고침 없이 처리 |
| index.js | 패널 열기·닫기, `init`/`destroy`/`onSettings`, 공개 객체 `UXK.libraryPage` |

여러 파일이 읽고 쓰는 `let` 변수(`S`, `cache`, `byId`, `meta`, `presets`, `mean`, `fab`, `panel`, `observer`, `loadingProgress`)는 `P.이름`에 둔다. 파일 크기 제한(500줄 이하)과 `P.*` 이름 등록 검사는 tests/unit.js가 두 폴더(player, library)에 똑같이 적용한다.

## 도크 (content/player/dock.js)
영상 바로 아래에 항상 보이는 도구 줄(한 번 클릭으로 켜고 끄는 버튼, 켜짐은 `aria-pressed`와 색으로 표시)과 자막 영역(원문·번역 2줄, 높이 고정)을 둔다. 설정 `player.dock`(기본 켜짐)로 끌 수 있다.
- 위치(`data-mode`): ① `below` = 영상 요소에서 위로 올라가며 **아래쪽 끝이 같은 가장 바깥 요소**를 찾아 그 바로 뒤에 끼움 → 어긋나면(영상 옆 칸에 놓이거나 잘려서 가려짐) ② `inside` = 그 요소 안쪽 끝에 붙임 → 그래도 안 되면 ③ `fixed` = 화면 맨 아래 고정(3초마다 다시 시도). 어긋남은 위치(영상 바로 아래, 가로로 겹침)와 `overflow: hidden` 조상에 잘리는지로 판정한다. 실제 Udemy 화면 구조는 확인하지 못해서 이 판정과 대체 순서로 대응한다. 팝업의 "화면 구조 점검"이 현재 `data-mode`를 보여 준다.
- 도크가 켜져 있으면(전체화면 제외) 영상 위 도구 막대와 영상 위 자막 상자는 숨긴다(`html.uxk-dock-on`). **전체화면에서는 도크를 숨기고** 영상 위 도구 막대·자막을 쓴다(영상 아래 공간이 없으므로). 자막 글자는 영상 위 상자와 도크 양쪽에 항상 같이 쓴다.
- 도크 안의 동작은 단축키와 같은 `run(action)`을 부르고, 동작이 끝나면 `updateDock()`으로 켜짐 표시를 맞춘다.
- 주의: 화면 감시(MutationObserver)가 도크 안의 변화까지 잡으므로, 도크 안의 글자는 **바뀔 때만** 쓴다(`put()`). 그렇지 않으면 감시가 끝없이 돈다.
- 통합 테스트는 기본적으로 도크를 끄고(`player.dock=false`) 영상 위 도구 막대 기준으로 돌고, `dockTests`가 도크를 켜서 위치·클릭·자막 영역·전체화면·대체 위치를 확인한다.
