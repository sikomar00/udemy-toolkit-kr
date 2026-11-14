# Chrome Web Store listing (English)

## Name
Toolkit for Udemy

## Short description (max 132 characters; same as manifest)
Dual subtitles, speed up to 16x, one-click transcript copy and bulk course cleanup for Udemy. Unofficial, free and open source.

## Detailed description
Free, open-source (MIT) helper for learning on Udemy. Unofficial: not affiliated with, endorsed by, or sponsored by Udemy, Inc.

Made for you if you:
- run several Udemy extensions (speed, subtitles, course management) that keep clashing
- want to see the original and the translated subtitles at the same time
- scroll the whole transcript panel just to copy a lecture's transcript
- find Udemy's 2x speed limit too slow
- own hundreds of courses, and the page reloads every time you archive one

**Dual subtitles (bilingual captions)**
- Show two subtitle languages at once, for example English + Korean, Spanish, Japanese and more. Works when the course has captions in both languages, including Udemy's auto-translated captions. Optional machine translation fills the gap when a second language is missing (off by default).
- Language-learning tools: replay or loop the current sentence (Q / L), copy it (Y), and save it with its translation and a link back to the moment (K). Export saved sentences as an Anki deck or CSV.

**Playback speed controller**
- Speed from 0.25x to 16x, remembered per course and re-applied when Udemy resets it.
- Hotkeys for everything: D / S speed, Z / X seek, N / P next or previous lecture, V dual subtitles, Alt+N note, Alt+S capture, Alt+P picture-in-picture, Alt+T wide view, H help. Every key can be changed, and Udemy's own keys keep working.

**Transcript, notes and capture**
- Copy the whole lecture transcript in one click. Export subtitles as TXT, SRT or Markdown (also bilingual), or the whole course as one Markdown file.
- Timestamped notes that link back to the exact second, exportable as Markdown. Frame capture, picture-in-picture, wide view.
- Time left per section at your current speed, and mark a whole section complete in one click.

**My Learning: organize hundreds of courses**
- "My Course Tools" panel: sort and filter by rating, reviews, students, duration, progress, last updated, purchase date and caption language. Tags, a study queue and notes.
- Archive without the page reloading. Select many courses (Shift+click for a range) and bulk archive with one-click Undo. Export the list to CSV (Notion) or Markdown.
- "Owned" badges in search results so you never buy a course twice.

**Study stats and settings**
- Daily watch time, goal and streak in the toolbar popup.
- English and Korean interface (follows your browser language). Keyboard and screen-reader friendly.
- Back up and restore everything as JSON.

**Privacy**
- No account, no ads, no analytics, no developer server. Notes, sentences, tags and stats stay in your browser.
- Settings may sync through your Chrome account. Subtitle sentences are sent to Google Translate only if you turn on machine translation.

Source code (MIT): https://github.com/sikomar00/udemy-toolkit-kr
Bug reports and ideas: https://github.com/sikomar00/udemy-toolkit-kr/issues
If it saves you time, you can buy me a coffee: https://buymeacoffee.com/ys_doing1

"Udemy" is a trademark of Udemy, Inc.

## Single purpose
Make studying on Udemy easier: course library tools, lecture playback tools and study tracking, all on udemy.com.

## Permission justifications
- **storage**: save settings, notes, saved sentences, tags, study stats and per-course speeds.
- **unlimitedStorage**: the cached list of your courses and curriculum can exceed the default storage quota. It is stored locally only.
- **activeTab**: capture the current video frame when you press Capture (uses `tabs.captureVisibleTab`).
- **clipboardWrite**: copy the transcript, a sentence or a captured image when you ask for it.
- **Host access to `https://*.udemy.com/*`**: add the tools to Udemy pages and read your own course list, progress and caption info from Udemy while you are signed in.
- **Host access to `https://udemy-captions.s3.amazonaws.com/*` and `https://*.udemycdn.com/*`**: download the caption (VTT) files that Udemy serves, for dual subtitles and transcript copy.
- **Optional host access to `https://translate.googleapis.com/*`**: only if you turn on machine translation in Settings.

## Privacy practices (answers)
- Data is not sold or used for advertising, credit or unrelated purposes.
- No remote code: all code ships in the package (no `eval`, no remote scripts).
- Data leaves the browser only when machine translation is turned on (subtitle sentences go to Google Translate) and for requests to Udemy's own servers made with your signed-in session.

## Images to prepare
- Icon 128x128: `udemy-toolkit/icons/128.png`.
- 1 to 5 screenshots (1280x800 or 640x400). Use real lecture screens that do not show private data.
- Small promo tile 440x280.
