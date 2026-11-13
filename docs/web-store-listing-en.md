# Chrome Web Store listing (English)

## Name
Toolkit for Udemy

## Short description (max 132 characters; same as manifest)
Unofficial Udemy toolkit: library tools, speed & hotkeys, dual subtitles, sentence loop, notes, PiP, capture, study stats.

## Detailed description
Toolkit for Udemy is an unofficial, independent tool. It is not affiliated with, endorsed by, or sponsored by Udemy, Inc. "Udemy" is a trademark of Udemy, Inc.

**Player (lecture pages)**
- Playback speed from 0.25x to 16x, remembered per course, with hotkeys (D / S / R, Z / X to seek, N / P for next / previous lecture).
- A toolbar attached right below the video: Dual Subs, Loop, Copy Transcript, Note, Capture, PiP, Wide, Subtitles. One click to turn a feature on or off.
- Dual subtitles: show two caption languages at once. If Udemy shows its captions in a band under the video, the extension replaces that band with an original + translation box; if the captions are inside the video, it hides them and shows the two lines over the video. Optional machine translation when a second language is not available.
- Language-learning tools: replay or loop the current sentence, copy a sentence, and save sentences to a collection you can export for Anki.
- Copy the whole lecture transcript to the clipboard in one click. Export subtitles as TXT, SRT or Markdown (also bilingual).
- Timestamped notes (stored only in your browser), time left per section, mark a whole section complete, picture-in-picture, frame capture, optional dark mode.
- Mark a whole curriculum section complete or incomplete with one click, and jump to the next or previous lecture with N / P.
- Hotkeys for everything (D / S speed, Z / X seek, V dual subtitles, L loop, Q replay, Y copy, K save sentence, Alt+N note, Alt+S capture, Alt+P PiP, Alt+T wide view, H help). All keys can be changed, and Udemy's own keys keep working.

**My Learning and search**
- "My Course Tools" panel: sort and filter your courses (rating, reviews, students, duration, progress, last updated, purchase date, caption language), tags, a study queue, notes, bulk archive, and export to CSV or Markdown.
- Badges on course cards and "Owned" labels in search results to avoid buying a course twice.

**Popup, settings and backup**
- The toolbar popup shows today's study time, the speed and time left of the current lecture, and quick switches (Dual subtitles, Hide owned courses, Toolbar below video, Dark mode).
- Check Page Structure tells you if a Udemy page change broke a feature, and lets you copy a report.
- Back up and restore settings, notes, saved sentences, tags, presets and stats as JSON.

**Study stats**
- Daily watch time, goal and streak. Everything is stored locally.

**Privacy**
- No account, no analytics, no developer server. Your notes, sentences, tags and stats stay in your browser.
- Settings (hotkeys and options) may sync through your Chrome account.
- If you turn on machine translation, the subtitle sentences being translated are sent to Google Translate. This is off by default and asks for permission first.

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
