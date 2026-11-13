/* 번역 (영어 / 한국어). 영어 문장을 그대로 열쇠로 쓰고, 한국어 사전(lib/ko.js)에 있으면 한국어로 바꾼다. 사전에 없으면 영어 그대로 보인다.
   - UXK.t('Close')                       → 한국어면 '닫기'
   - UXK.t('{0} selected', n)            → 틀 안의 {0}, {1}을 채워서 번역
   - UXK.t('Archive done: 2')            → 사전에 'Archive done: {0}' 같은 틀이 있으면 이미 만들어진 영어 문장도 번역 (숫자 등 가변 부분을 골라냄)
   언어는 설정 ui.lang(auto/en/ko)이고, auto는 브라우저 표시 언어를 따른다. */
(() => {
  const UXK = (globalThis.UXK = globalThis.UXK || {});
  if (UXK.i18n) return;

  const dict = { ko: new Map() };
  const patterns = { ko: [] }; // [{ re, tpl, n }]
  const cache = new Map();
  const missing = new Set();

  const detect = () => {
    try { const l = String((typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage()) || navigator.language || 'en').toLowerCase(); return l.startsWith('ko') ? 'ko' : 'en'; } catch (e) { return 'en'; }
  };
  let lang = detect();

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // opts.exact: UXK.t('틀', 값...)으로만 쓰는 틀. 이미 만들어진 문장을 틀로 맞춰 보는 데에는 쓰지 않는다 ('{0}h'처럼 너무 넓게 맞는 틀용)
  function add(l, entries, opts = {}) {
    for (const [en, tr] of Object.entries(entries)) {
      dict[l].set(en, tr);
      if (!opts.exact && /\{\d\}/.test(en)) {
        // 'Archive done: {0}' → ^Archive done: (.+?)$ . 가장 긴 글(구체적인 틀)부터 맞추려고 길이순으로 정렬한다
        const re = new RegExp('^' + escRe(en).replace(/\\\{(\d)\\\}/g, '(.+?)') + '$', 's');
        patterns[l].push({ re, tpl: tr, n: en.replace(/\{\d\}/g, '').length });
      }
    }
    patterns[l].sort((a, b) => b.n - a.n);
    cache.clear();
  }

  const fill = (tpl, args) => tpl.replace(/\{(\d)\}/g, (m, i) => (args[+i] == null ? '' : String(args[+i])));

  // 사전에 있는 글 그대로(앞뒤 공백은 무시) 찾는다. 없으면 undefined
  function exactOf(text) {
    const hit = dict[lang].get(text);
    if (hit !== undefined) return hit;
    const core = text.trim();
    if (!core || core === text) return undefined;
    const tr = dict[lang].get(core);
    if (tr === undefined) return undefined;
    const i = text.indexOf(core);
    return text.slice(0, i) + tr + text.slice(i + core.length);
  }
  function translate(text) {
    if (lang === 'en' || typeof text !== 'string' || !text) return text;
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    let out = exactOf(text);
    if (out === undefined) {
      const core = text.trim();
      for (const p of patterns[lang]) {
        // 틀에 앞뒤 공백이 들어 있는 경우(' · {0} done')가 있어 원문 → 공백 뗀 글 순서로 맞춰 본다
        let m = p.re.exec(text), whole = true;
        if (!m && core !== text) { m = p.re.exec(core); whole = false; }
        if (!m) continue;
        // 틀 속 가변 부분(숫자·동사 등)은 사전에 그대로 있을 때만 번역한다: 강의 제목 같은 사용자 글을 틀로 잘못 바꾸지 않게
        const filled = fill(p.tpl, m.slice(1).map((g) => { const e = exactOf(g); return e === undefined ? g : e; }));
        out = whole ? filled : text.replace(core, () => filled);
        break;
      }
    }
    if (out === undefined) { out = text; noteMissing(text); }
    cache.set(text, out);
    return out;
  }
  function noteMissing(text) {
    if (!/[A-Za-z]{3,}/.test(text) || /[가-힣]/.test(text)) return; // 영어 단어가 없거나 이미 한글이 섞인 글은 기록하지 않는다
    if (missing.has(text)) return;
    missing.add(text);
    try { if (globalThis.localStorage && localStorage.getItem('uxk_i18n_missing')) console.debug('[UXK i18n missing]', JSON.stringify(text)); } catch (e) { /* 저장소를 못 읽는 화면은 기록하지 않는다 */ }
  }

  // t('틀 {0}', 값...) 또는 t('이미 만든 문장')
  UXK.t = (text, ...args) => {
    if (!args.length) return translate(text);
    const tpl = lang === 'en' ? text : (dict[lang].get(text) !== undefined ? dict[lang].get(text) : (noteMissing(text), text));
    return fill(tpl, args);
  };

  function setLang(pref) { lang = pref === 'ko' || pref === 'en' ? pref : detect(); cache.clear(); }

  // 화면(DOM)을 통째로 번역: 글자와 title·placeholder·aria-label 속성. data-no-i18n 안쪽(내 강의 제목, 메모, 문장 등 사용자 글)은 건드리지 않는다
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  function translateNode(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      if (!v.trim() || (n.parentElement && n.parentElement.closest('[data-no-i18n], script, style, textarea'))) return;
      const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0], core = v.trim();
      const out = translate(core);
      if (out !== core) n.nodeValue = lead + out + trail;
    } else if (n.nodeType === 1) {
      if (n.closest('[data-no-i18n]')) return;
      for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const o = translate(v); if (o !== v) n.setAttribute(a, o); } }
    }
  }
  function translateDom(root) {
    if (lang === 'en') return;
    const r = root || document.body;
    translateNode(r);
    const w = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) translateNode(n);
  }
  // 이후 동적으로 바뀌는 화면도 번역한다 (확장 프로그램 자체 페이지용)
  function watchDom(root) {
    if (lang === 'en' || typeof MutationObserver !== 'function') return;
    const target = root || document.body;
    let busy = false;
    new MutationObserver((muts) => {
      if (busy) return;
      busy = true;
      try {
        for (const m of muts) {
          if (m.type === 'characterData') translateNode(m.target);
          else if (m.type === 'attributes') translateNode(m.target);
          else m.addedNodes.forEach((a) => { if (a.nodeType === 3) translateNode(a); else if (a.nodeType === 1) translateDom(a); });
        }
      } finally { busy = false; }
    }).observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // 확장 프로그램 자체 페이지(팝업·설정)용: 설정의 언어를 적용하고 화면 글자를 번역한다 (이후 바뀌는 글자도 따라 번역)
  function initPage(settings) {
    setLang(settings && settings.ui && settings.ui.lang);
    document.documentElement.lang = lang;
    if (lang !== 'ko') return;
    document.title = translate(document.title);
    translateDom(document.body);
    watchDom(document.body);
  }

  UXK.i18n = {
    add, setLang, translateDom, watchDom, initPage,
    lang: () => lang,
    locale: () => (lang === 'ko' ? 'ko-KR' : 'en-US'),
    missing: () => [...missing],
  };
})();
