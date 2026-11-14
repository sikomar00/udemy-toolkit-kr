# Chrome 웹 스토어 등록 튜토리얼 (Toolkit for Udemy)

처음 등록하는 사람이 순서대로 따라 할 수 있게 정리했습니다. 이 프로젝트에서 이미 준비된 파일은 **굵게** 표시했습니다. 대시보드 화면 이름과 문항은 바뀔 수 있으니, 실제 화면과 다르면 화면을 기준으로 하세요.

> 이 문서는 제가(Claude) 만든 안내이며 실제 심사를 통과한다는 보장은 없습니다. Google 공식 문서([게시 안내](https://developer.chrome.com/docs/webstore/publish/), [개인정보 항목](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [2026 정책 변경](https://developer.chrome.com/blog/cws-policy-updates-2026))를 함께 보세요.

## 0. 시작 전 체크리스트

| 준비물 | 위치·상태 |
|---|---|
| 업로드용 zip | **`dist/udemy-toolkit-2.0.0.zip`** (git에는 올라가지 않으니, 지웠다면 아래 "zip 다시 만들기") |
| 스토어 설명(영어) | **`docs/web-store-listing-en.md`** |
| 스크린샷 5장 (1280×800) | **`docs/store-assets/*-1280x800.png`** |
| 소형 홍보 타일 (440×280) | **`docs/store-assets/promo-tile-440x280.png`** |
| 아이콘 128×128 | **`udemy-toolkit/icons/128.png`** (zip 안에도 들어 있음) |
| 개인정보처리방침 공개 주소 | **`docs/privacy-policy.md`** → 공개 주소는 아래 3단계 참고 |
| Google 계정 + 2단계 인증 | 직접 준비 |
| 등록비 | 직접 결제 (보통 5달러, 1회. 결제 화면의 금액을 확인하세요) |
| 개발자 연락 이메일 | 직접 정하기 (심사 알림이 옵니다. 공개 저장소에는 쓰지 마세요) |

**zip 다시 만들기** (PowerShell, 프로젝트 폴더에서)

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
$v = (Get-Content udemy-toolkit\manifest.json -Raw | ConvertFrom-Json).version
Remove-Item "dist\udemy-toolkit-$v.zip" -ErrorAction SilentlyContinue
Push-Location udemy-toolkit
Compress-Archive -Path manifest.json, background.js, content, icons, lib, pages, _locales -DestinationPath "..\dist\udemy-toolkit-$v.zip"
Pop-Location
```

zip을 열었을 때 맨 위에 `manifest.json`이 바로 보여야 합니다(폴더 하나로 감싸지 않기).

## 1. 개발자 계정 만들기

1. 확장을 소유할 Google 계정으로 [개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 로그인합니다. 나중에 계정을 바꾸기 어려우니 개인 계정이면 그 계정을 계속 쓸 것인지 먼저 정하세요.
2. 개발자 계약과 정책에 동의하고 **등록비**를 냅니다.
3. **2단계 인증**을 켭니다. 게시와 업데이트 전에 필수입니다.
4. 대시보드의 **Account** 쪽에서 개발자 **연락 이메일**을 넣고 확인합니다.
5. **Trader / Non-trader** 선언 항목이 있으면 답합니다. EU 소비자 보호법(DSA) 때문에 묻는 항목입니다.
   - 취미·무료 도구를 혼자 올리는 개인이면 보통 non-trader를 고르지만, **법적 판단은 본인 몫**입니다([안내](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)).
   - trader로 선언하면 이름·전화번호(SMS 인증)·주소가 목록에 공개될 수 있습니다.

## 2. 새 항목 올리기

1. 대시보드에서 **Add new item**을 누르고 `dist/udemy-toolkit-2.0.0.zip`을 올립니다.
2. 올리면 manifest 검사를 한 뒤 편집 화면이 열립니다. 오류가 나면 메시지대로 고치고 zip을 다시 만듭니다.
3. 이 확장의 manifest 값: 이름 `Toolkit for Udemy`, 버전 `2.0.0`, 설명 122자(한도 132자), 권한 `storage`, `unlimitedStorage`, `activeTab`, `clipboardWrite`.
4. 처음 올리는 개발자는 게시할 수 있는 확장 수에 상한(예: 2개)이 있습니다. 대시보드에서 확인하세요.

## 3. 개인정보처리방침 공개 주소 만들기

대시보드는 **공개된 웹 주소**를 요구합니다. 가장 쉬운 방법 두 가지입니다.

- **방법 A. GitHub 파일 주소 쓰기(가장 간단):** `docs/privacy-policy.md`가 `main`에 병합된 뒤 아래 주소를 씁니다.
  `https://github.com/sikomar00/udemy-toolkit-kr/blob/main/docs/privacy-policy.md`
- **방법 B. GitHub Pages:** 저장소 Settings → Pages에서 `main` / `docs` 폴더를 켜면 `https://sikomar00.github.io/udemy-toolkit-kr/privacy-policy` 같은 주소가 생깁니다. (공개 설정을 바꾸는 작업이니 직접 하세요.)

2026년부터 Chrome 웹 스토어는 **Limited Use 준수 문구**가 확장 소유의 웹사이트에 있어야 한다고 요구합니다. 이 방침 문서의 "Chrome Web Store User Data Policy and Limited Use" 절이 그 문구입니다. 저장소 첫 화면(README)에서 이 문서로 가는 링크를 두면 더 안전합니다.

> `docs/privacy-policy.md`는 이 확장의 실제 동작(로컬 저장, Udemy 요청, 선택 사항인 구글 번역)에 맞춰 쓴 **초안**입니다. 공개 전에 직접 읽고 고칠 곳이 없는지 확인하세요.

## 4. Store listing 탭

[`docs/web-store-listing-en.md`](web-store-listing-en.md)의 문구를 그대로 붙여 넣습니다.

| 칸 | 넣을 값 |
|---|---|
| Description | 문서의 "Detailed description". 첫 줄에 "Not affiliated with Udemy"가 들어 있습니다. |
| Category | Education 또는 Productivity 중 선택 (기능이 학습 도구이므로 Education 추천) |
| Language | English (한국어 설명을 추가하려면 번역 목록을 따로 올립니다) |
| Store icon | `udemy-toolkit/icons/128.png` |
| Screenshots | `docs/store-assets/`의 `1-player` ~ `5-popup` (1280×800) |
| Small promo tile | `docs/store-assets/promo-tile-440x280.png` (필수로 표시되면 반드시 올림) |
| Marquee tile (1400×560) | 선택 사항. 지금은 없어도 됩니다. |
| Homepage / Support URL | `https://github.com/sikomar00/udemy-toolkit-kr` / `.../issues` |

주의: 스크린샷 안의 **강의 영상은 흐리게 가려져 있고** 내 강의 목록 그림에는 실제 강의 제목이 보입니다(`docs/store-assets/2-...`). 올리기 전에 한 번 더 보고, 가리고 싶은 제목이 있으면 말씀해 주세요.

## 5. Privacy practices 탭 (심사에서 가장 자주 막히는 곳)

| 칸 | 넣을 값 |
|---|---|
| Single purpose | "Make studying on Udemy easier: course library tools, lecture playback tools and study tracking, all on udemy.com." |
| Permission justification | `docs/web-store-listing-en.md`의 "Permission justifications" 항목별 문장을 칸마다 붙여 넣습니다(`storage`, `unlimitedStorage`, `activeTab`, `clipboardWrite`, `https://*.udemy.com/*`, 자막 서버 두 곳, 선택 호스트 `translate.googleapis.com`). |
| Remote code | "No, I am not using remote code" (모든 코드가 패키지 안에 있음, `eval` 없음) |
| Data usage | 아래 표 참고 |
| Privacy policy URL | 3단계에서 만든 주소 |

**Data usage 체크 가이드** (문항이 바뀌면 의미에 맞게 고르세요)

| 질문 | 이 확장의 답 |
|---|---|
| 개발자가 이용자 데이터를 수집하는가 | 서버가 없고 개발자는 받지 않습니다. 대시보드가 "브라우저에서 처리하는 데이터"까지 묻는다면 "웹사이트 콘텐츠"(강의 목록·자막)를 기능 수행에만 쓴다고 답합니다. |
| 판매 / 목적과 무관한 사용 / 신용 평가 | 모두 해당 없음(체크) |
| 구글 번역 전송 | 사용자가 직접 켠 경우에만 자막 문장이 구글로 감. 방침 문서와 설정 화면에 같은 설명이 있음 |

## 6. Distribution 탭

- Visibility: **Public**(누구나), **Unlisted**(링크가 있는 사람만), **Private**(지정한 사용자만). 첫 심사 통과 전까지 **Unlisted**로 시작해 보고 싶다면 이 항목을 고릅니다.
- Regions: 전체 지역 또는 원하는 지역
- Pricing: Free

## 7. Test instructions 탭 (필요할 때만)

Udemy 로그인이 있어야 기능이 보이므로, 심사자가 확인할 수 있도록 적는 것을 권합니다. **계정 정보나 비밀번호를 대신 적지 마세요**(제가 대신 입력하지도 않습니다). 예:

> The extension adds tools to udemy.com pages. A Udemy account that has at least one enrolled course is needed to see them: the "My Course Tools" button appears on My Learning, and the toolbar appears below the video on a lecture page. Test credentials can be provided on request through the support contact.

## 8. 제출하기

1. 모든 탭에 표시(경고)가 없는지 확인합니다.
2. **Submit for review**를 누르고 확인 창에서 **게시 시점**을 고릅니다(승인되면 바로 게시, 또는 승인 뒤 직접 게시하도록 보류).
3. 심사 결과는 연락 이메일로 옵니다. 보통 몇 시간~며칠이지만 `https://*.udemy.com/*` 같은 넓은 권한은 더 오래 걸리거나 추가 소명을 요청받을 수 있습니다.

## 9. 반려되면 확인할 것

| 흔한 이유 | 이 프로젝트에서 볼 곳 |
|---|---|
| 아이콘·이름이 Udemy를 사칭 | 아이콘의 "U"와 모자 모양이 Udemy 로고와 닮았습니다. 반려되면 로고를 닮은 부분을 빼고 재생 버튼+렌치처럼 독자 디자인으로 바꾸세요. 이름은 이미 "Toolkit for Udemy", 설명에 비제휴 문구가 있습니다. |
| 권한이 너무 넓다 | 권한별 사용 이유 문구를 더 구체적으로 적고, 쓰지 않는 권한이 있으면 manifest에서 빼고 zip을 다시 올립니다. |
| 개인정보 항목이 불충분 | 방침 문서의 내용과 대시보드의 답이 같은지 확인합니다. |
| 단일 목적이 모호 | 기능을 Udemy 학습이라는 하나의 목적으로 설명합니다. |

## 10. 업데이트할 때

1. `udemy-toolkit/manifest.json`의 `version`과 `lib/common.js`의 `UXK.VERSION`을 함께 올립니다(예: `2.1.0`). zip에는 `_locales` 폴더가 꼭 들어가야 합니다(위 명령에 포함).
2. zip을 다시 만들어 대시보드의 같은 항목에서 **Package → Upload new package**로 올립니다.
3. 바뀐 내용이 개인정보 항목에 영향을 주면(예: 새 권한, 새 외부 서버) 방침과 소명을 함께 고칩니다.
4. **Submit for review**.

## 11. 내가 직접 해야 하는 것 (요약)

1. 개발자 계정 등록, 등록비 결제, 2단계 인증, 연락 이메일
2. trader / non-trader 선언
3. 개인정보처리방침 공개 주소 만들기(`docs/privacy-policy.md`를 `main`에 병합한 뒤)
4. 대시보드에 zip·문구·이미지·답변 입력하고 제출
5. 계정 정보, 비밀번호, 결제 정보는 저에게 주지 마세요. 입력은 본인이 합니다.
