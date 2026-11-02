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
