# Privacy Policy — Toolkit for Udemy

Effective date: 2026-11-13

Toolkit for Udemy ("the extension") is an unofficial, independent Chrome extension. It is not affiliated with, endorsed by, or sponsored by Udemy, Inc. "Udemy" is a trademark of Udemy, Inc.

The short version: **the extension has no server, no account and no analytics. The developer receives no data from you.**

## What the extension handles

| Data | Where it comes from | Where it is stored |
|---|---|---|
| Your course list, progress and curriculum | Udemy's own web pages and web APIs, read with your signed-in Udemy session in your browser | Cached in your browser (`chrome.storage.local`) |
| Subtitle files of lectures | Udemy's caption servers (`udemy-captions.s3.amazonaws.com`, `*.udemycdn.com`) | Not stored, except the sentences you choose to save |
| Notes, saved sentences, tags, study queue, course notes, filter presets | You create them | Your browser only (`chrome.storage.local`) |
| Study stats (time the video was playing, daily goal, streak) | Measured locally while a video plays | Your browser only (`chrome.storage.local`) |
| Settings (hotkeys and options) | You choose them | `chrome.storage.sync`, so Chrome may sync them to your other computers through your Google account. This sync is done by Chrome, not by the developer |

## What is sent over the network

- **To Udemy** (`udemy.com`): requests the extension needs to do its job, made from your browser with your own signed-in session. They read your course list, progress, curriculum and captions, and archive or unarchive courses only when you ask for it. These requests go to Udemy, never to the developer.
- **To Google Translate** (`translate.googleapis.com`): **only if you turn on machine translation** in Settings and allow the permission that Chrome then asks for. In that case the subtitle sentences that need translating are sent to Google Translate. Machine translation is off by default. Google's own privacy policy applies to that request.
- Nothing else. The extension does not contact any other server, and it contains no analytics, advertising or tracking code.

## What the developer does not do

- The developer does not collect, receive, store or have access to any of your data.
- Your data is not sold or transferred to third parties, and it is not used for advertising, for creditworthiness, or for any purpose unrelated to the extension's single purpose (making studying on Udemy easier).
- The extension does not run remote code. All code ships in the extension package.

## Chrome Web Store User Data Policy and Limited Use

The use of information the extension handles will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. Data is used only to provide the extension's single purpose that is described on its store page, and it is not transferred or sold except as described above (the optional machine-translation request you turn on yourself).

## Your choices and deleting your data

- Turn any feature off in Settings, or turn machine translation off at any time.
- Settings → Backup & reset lets you export your data, clear the course-list cache, and reset settings. Settings → Study stats has Clear stats, Settings → Saved sentences has Delete selected, and each note can be deleted (×) in the notes list of the lecture player.
- Removing the extension deletes the data it stored locally in your browser. Settings stored in Chrome sync can be removed from your Google account's Chrome sync data.

## Changes to this policy

If the way the extension handles data changes, this page will be updated and the effective date above will change. Changes that affect your data will also be shown inside the extension.

## Contact

Questions or requests: please open an issue at <https://github.com/sikomar00/udemy-toolkit-kr/issues>.

---

## 개인정보처리방침 요약 (한국어)

- 확장 프로그램에는 서버, 계정, 분석 도구가 없고, 개발자는 이용자의 데이터를 받지 않습니다.
- 내 강의 목록, 메모, 문장, 태그, 학습 기록 등은 이 브라우저에만 저장됩니다. 설정(단축키·옵션)은 Chrome 동기화로 같은 Google 계정의 다른 PC와 공유될 수 있습니다(동기화는 Chrome이 합니다).
- 네트워크 요청은 Udemy(로그인한 본인 세션으로 목록·자막 읽기, 요청한 경우에만 보관/보관 해제)와, **기계번역을 직접 켠 경우에만** 구글 번역(자막 문장 전송)으로 갑니다. 기본값은 꺼짐입니다.
- 데이터를 판매하거나 광고·신용 평가 등 목적과 무관하게 쓰지 않으며, 원격 코드를 실행하지 않습니다.
- 문의: <https://github.com/sikomar00/udemy-toolkit-kr/issues>
