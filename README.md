# Udemy Toolkit KR

Udemy 내 학습 페이지, 강의 플레이어, 검색·강의 소개 페이지를 강화하는 개인용 크롬 확장 프로그램(Manifest V3)입니다.
빌드 과정이 없는 순수 JavaScript 구현입니다.

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
npm test            # 단위 49개 + 통합 95개
npm run shots       # 화면 캡처 → tests/shots/
```

## 주의

- Udemy 공식 API가 아닌 웹사이트 내부 API와 화면 구조를 사용하므로, Udemy가 구조를 바꾸면 일부 기능이 멈출 수 있습니다.
- 메모·문장·태그·학습 기록·강의 목록은 이 브라우저 안에만 저장됩니다. 설정(단축키·옵션)은 크롬 동기화로 같은 계정의 다른 PC와 공유될 수 있습니다. 사용자가 켠 경우에 한해 기계번역만 자막 문장을 외부(구글)로 전송합니다.
