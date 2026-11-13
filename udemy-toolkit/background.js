/* Toolkit for Udemy — 서비스 워커: 교차 출처 자막 요청, 기계번역(옵트인), 화면 캡처, 단축키 명령 */
const TRANSLATE_ORIGIN = 'https://translate.googleapis.com/*';

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});

// 오래된 커리큘럼 캐시 정리 (14일 이상 지난 코스)
async function pruneCaches() {
  try {
    const all = await chrome.storage.local.get(null);
    const old = Object.keys(all).filter((k) => k.startsWith('uxk_cur_') && (!all[k] || Date.now() - (all[k].t || 0) > 14 * 864e5));
    if (old.length) await chrome.storage.local.remove(old);
  } catch (e) {}
}
chrome.runtime.onStartup.addListener(pruneCaches);
chrome.runtime.onInstalled.addListener(pruneCaches);

// 자막 파일 호스트만 허용
const ALLOWED_HOSTS = [/(^|\.)udemy\.com$/, /(^|\.)udemycdn\.com$/, /^udemy-captions\.s3\.amazonaws\.com$/];
async function fetchText(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Only https is allowed');
  if (!ALLOWED_HOSTS.some((re) => re.test(u.hostname))) throw new Error('Host not allowed: ' + u.hostname);
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// ---- 기계번역 (구글 번역 비공식 gtx 엔드포인트, 사용자가 옵션에서 허용한 경우에만) ----
async function gtx(text, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'q=' + encodeURIComponent(text),
  });
  if (!r.ok) throw new Error('Translate HTTP ' + r.status);
  const j = await r.json();
  return (j && j[0] ? j[0].map((seg) => (seg && seg[0]) || '').join('') : '');
}
async function translateAll(texts, tl) {
  const out = new Array(texts.length).fill('');
  // 줄 단위로 묶어서 요청 (최대 3500자 / 80줄)
  const chunks = [];
  let cur = [];
  let len = 0;
  texts.forEach((t, i) => {
    const s = String(t || '').replace(/\n/g, ' ');
    if (cur.length && (len + s.length > 3500 || cur.length >= 80)) { chunks.push(cur); cur = []; len = 0; }
    cur.push(i); len += s.length + 1;
  });
  if (cur.length) chunks.push(cur);
  for (const idxs of chunks) {
    const joined = idxs.map((i) => String(texts[i] || '').replace(/\n/g, ' ')).join('\n');
    let lines = null;
    try {
      const res = await gtx(joined, tl);
      lines = res.split('\n');
    } catch (e) { break; } // 요청이 막히거나 제한된 경우 계속 두드리지 않는다 (남은 문장은 빈 칸으로 두고 호출 쪽이 실패로 처리)
    if (lines.length === idxs.length) {
      idxs.forEach((i, k) => { out[i] = lines[k].trim(); });
    } else {
      // 줄 수가 어긋나면 문장별로 다시 요청 (동시 4개)
      let p = 0;
      const worker = async () => {
        while (p < idxs.length) {
          const i = idxs[p++];
          try { out[i] = (await gtx(String(texts[i] || ''), tl)).trim(); } catch (e) { out[i] = ''; }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    }
  }
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'fetchText') {
    fetchText(msg.url).then((text) => sendResponse({ ok: true, text })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'translate') {
    (async () => {
      const has = await chrome.permissions.contains({ origins: [TRANSLATE_ORIGIN] });
      if (!has) throw new Error('Allow the machine-translation permission on the options page');
      const texts = Array.isArray(msg.texts) ? msg.texts.slice(0, 5000) : [];
      const out = await translateAll(texts, String(msg.tl || 'ko'));
      // 번역된 문장이 하나도 없으면 성공으로 응답하지 않는다 (빈 번역이 캐시되어 보조 자막이 영영 비는 것을 막음)
      if (texts.some((t) => String(t || '').trim()) && out.every((t) => !t)) throw new Error('All translation requests failed (Google Translate may be blocked or rate-limited)');
      return out;
    })().then((texts) => sendResponse({ ok: true, texts })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'hasTranslatePermission') {
    chrome.permissions.contains({ origins: [TRANSLATE_ORIGIN] }).then((has) => sendResponse({ ok: true, has })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'capture') {
    // 같은 창에 다른 사이트가 보이는 상태에서 그 화면을 잘라 저장하는 일이 없도록, 요청한 Udemy 탭이 활성 탭일 때만 캡처
    if (!sender.tab || !sender.tab.active) { sendResponse({ ok: false, error: 'Capture works only while the Udemy tab is visible' }); return; }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'openOptions') {
    if (msg.hash) chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#' + String(msg.hash).replace(/[^a-z]/gi, '')) });
    else chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }
});

const LEARN_RE = /^https:\/\/([a-z0-9-]+\.)*udemy\.com\/course\/[^/]+\/learn\//;
chrome.commands.onCommand.addListener(async (command, tab) => {
  let target = tab && LEARN_RE.test(tab.url || '') ? tab : null;
  if (!target) {
    const tabs = await chrome.tabs.query({ url: 'https://*.udemy.com/course/*/learn/*' });
    target = tabs.find((t) => t.audible) || tabs.find((t) => t.active) || tabs[0] || null;
  }
  if (!target) return;
  const msg = { type: 'command', command };
  // 메모·캡처는 화면이 보여야 하므로 대상 Udemy 탭을 앞으로 가져옴
  if ((command === 'quick-note' || command === 'screenshot') && !(tab && target.id === tab.id)) {
    try {
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(target.windowId, { focused: true });
    } catch (e) {}
  }
  if (command === 'screenshot' && tab && target.id === tab.id) {
    // 단축키로 호출된 경우 activeTab 권한이 부여되어 현재 탭을 캡처할 수 있음
    try { msg.dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }); } catch (e) { /* 콘텐츠 쪽에서 캔버스 방식 재시도 */ }
  }
  try { await chrome.tabs.sendMessage(target.id, msg); } catch (e) { /* 탭이 준비되지 않음 */ }
});
