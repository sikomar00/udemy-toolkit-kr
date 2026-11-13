# Toolkit for Udemy

Udemy 내 학습 페이지, 강의 플레이어, 검색·강의 소개 페이지를 강화하는 개인용 크롬 확장 프로그램(Manifest V3)입니다.
빌드 과정이 없는 순수 JavaScript 구현입니다.

## 스크린샷

아래 그림은 **실제 Udemy 화면**에서 확장을 켜고 직접 찍은 것입니다. 계정 정보가 보이는 머리글은 잘라 냈고, 강의 영상 장면은 저작권 때문에 흐리게 가렸습니다.

**영상 아래 도구 막대와 이중 자막** — Udemy 기본 자막(여기서는 한국어)은 숨기고, 영어 원문과 한국어 번역을 영상 안에 함께 보여 줍니다. 도구 막대는 영상 바로 아래에 붙고, Dual Subs·Loop·Wide는 한 번 클릭으로 켜고 끄며 켜진 것은 색으로 표시됩니다.

![영상 아래 도구 막대와 이중 자막](docs/images/player.png)

**My Course Tools** — 내 학습 페이지에서 수백~수천 개 강의를 정렬·필터하고, 태그·학습 큐·일괄 보관·내보내기를 합니다(그림은 강의 1,275개 계정).

![My Course Tools 패널](docs/images/my-course-tools.png)

| Subtitles 메뉴 | 툴바 팝업 |
|---|---|
| ![Subtitles 메뉴](docs/images/subtitles-menu.png) | ![툴바 팝업](docs/images/popup.png) |

**설정 페이지**

![설정 페이지](docs/images/settings.png)

> 이 그림들은 실제 계정 화면을 직접 찍어 `docs/images/`에 넣은 것입니다. 모의 화면용 그림은 `cd tests && npm run shots`로 `tests/shots/`에 만들 수 있습니다(저장소에는 올리지 않음).

## 구성

| 경로 | 내용 |
|---|---|
| `udemy-toolkit/` | 확장 프로그램 본체. 이 폴더를 크롬에 로드합니다 |
| `udemy-toolkit/README.md` | 기능, 단축키, 설치, 한계 |
| `udemy-toolkit/DESIGN.md` | 사용한 Udemy 내부 API·DOM의 근거 등급(실측 / 코드 / 추정), 리뷰 반영 내역 |
| `tests/` | 모의 Udemy 페이지·API로 확장을 Chromium에 올려 검증하는 테스트 |

## 설치

1. `chrome://extensions`에서 **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다**로 `udemy-toolkit/` 폴더를 선택합니다.

## 테스트

```bash
cd tests
npm install
npx playwright install chromium
npm test            # 단위 59개 + 통합 107개
npm run shots       # 화면 캡처 → tests/shots/
```

## 주의

- Udemy 공식 API가 아닌 웹사이트 내부 API와 화면 구조를 사용하므로, Udemy가 구조를 바꾸면 일부 기능이 멈출 수 있습니다.
- 메모·문장·태그·학습 기록·강의 목록은 이 브라우저 안에만 저장됩니다. 설정(단축키·옵션)은 크롬 동기화로 같은 계정의 다른 PC와 공유될 수 있습니다. 사용자가 켠 경우에 한해 기계번역만 자막 문장을 외부(구글)로 전송합니다.

> **화면 언어:** 확장 프로그램의 화면(도구 막대 버튼, 설정, 팝업, 알림)은 모두 영어입니다. 설명 문서(이 파일, DESIGN.md, docs/)는 한국어입니다. 백업 파일의 식별값 `udemy-toolkit-kr`은 이전 백업과 호환되도록 그대로 둡니다.
