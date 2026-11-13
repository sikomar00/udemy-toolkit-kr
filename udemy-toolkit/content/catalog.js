/* 검색·카테고리·강의 소개 페이지: 보유 강의 표시/숨기기, 강의 정보 상자 */
(() => {
  const UXK = globalThis.UXK;
  if (UXK.catalogPage) return;
  const { el, esc, $$ } = UXK;

  let S = null;
  let started = false;
  let observer = null;
  let bySlug = new Map();
  let infoBox = null;
  let shownFor = null; // 정보 상자를 이미 띄운 강의 slug (같은 페이지에서 다시 요청하거나 닫은 상자를 되살리지 않게)

  // 알려진 강의 카드 컨테이너만 인정 (일반 li/article/부모 요소로 넓히면 설명문·목록까지 숨길 수 있음)
  const CARD_ROOT = '[data-purpose="course-card-container"], [data-purpose="search-course-card"], [class*="course-card--container"], [class*="course-card-module--container"], [class*="browse-course-card"]';
  const countCourseLinks = (root) => new Set(Array.from(root.querySelectorAll('a[href*="/course/"]')).map((x) => slugOf(x.getAttribute('href'))).filter(Boolean)).size;

  async function loadOwned() {
    const cache = await UXK.lib.load();
    bySlug = new Map((cache ? cache.data : []).filter((c) => c.slug).map((c) => [c.slug, c]));
    return cache;
  }
  const slugOf = (href) => {
    try {
      const u = new URL(href, location.origin);
      if (!/udemy\.com$/.test(u.hostname)) return null;
      const m = u.pathname.match(/^\/course\/([^/]+)\/?$/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  };

  function markCards() {
    if (!S.catalog.ownedBadges && !S.catalog.hideOwned) return;
    if (!bySlug.size) return;
    const here = UXK.route() === 'landing' ? decodeURIComponent((location.pathname.match(/^\/course\/([^/]+)/) || [])[1] || '') : null;
    $$('a[href*="/course/"]').forEach((a) => {
      if (a.closest('.uxk-lib, .uxk-info, .uxk-drawer, header, nav, [data-purpose="header"]')) return;
      const slug = slugOf(a.getAttribute('href'));
      if (!slug || slug === here) return;
      const c = bySlug.get(slug);
      if (!c) return;
      let root = a.closest(CARD_ROOT);
      // 카드 안에 서로 다른 강의 링크가 여럿이면 카드가 아니라 목록 컨테이너로 보고 건너뜀
      if (root && countCourseLinks(root) > 1) root = null;
      const mark = root || a;
      if (mark.getAttribute('data-uxk-owned') === String(c.id)) return;
      mark.setAttribute('data-uxk-owned', String(c.id));
      if (root) root.classList.toggle('uxk-owned-hidden', !!S.catalog.hideOwned); // 숨기기는 카드로 확인된 경우만
      if (S.catalog.ownedBadges && !(root || a.parentElement || a).querySelector('.uxk-owned')) {
        const badge = el('span', { class: 'uxk-owned', title: 'Course you already own (Toolkit for Udemy)' }, [UXK.t('Owned · {0}% done{1}', Math.min(100, c.progress), c.archived ? UXK.t(' · archived') : '')]);
        (a.querySelector('h3, h2, [data-purpose="course-title-url"]') || a).after(badge);
      }
    });
  }
  const markSoon = UXK.throttle(markCards, 500);

  function unmarkAll() {
    $$('[data-uxk-owned]').forEach((n) => { n.removeAttribute('data-uxk-owned'); n.classList.remove('uxk-owned-hidden'); });
    $$('.uxk-owned').forEach((n) => n.remove());
  }

  // ---------------- 강의 소개 페이지 정보 상자 ----------------
  async function landingInfo() {
    if (!S.catalog.landingInfo || UXK.route() !== 'landing') { if (infoBox) { infoBox.remove(); infoBox = null; } shownFor = null; return; }
    const slug = (location.pathname.match(/^\/course\/([^/]+)/) || [])[1];
    if (shownFor === slug) return;
    const owned = slug ? bySlug.get(decodeURIComponent(slug)) : null;
    const idAttr = document.querySelector('[data-clp-course-id]');
    const courseId = owned ? owned.id : idAttr ? +idAttr.getAttribute('data-clp-course-id') : null;
    if (!owned && !courseId) return;
    shownFor = slug;
    if (!infoBox) {
      infoBox = el('div', { class: 'uxk-info' });
      document.body.appendChild(infoBox);
    }
    const parts = [];
    if (owned) {
      parts.push(`<b>${UXK.t('You own this course')}</b> · ${UXK.t('{0}% done', Math.min(100, Number(owned.progress) || 0))}${owned.archived ? UXK.t(' · archived') : ''}${owned.enrolled ? UXK.t(' · purchased {0}', esc(owned.enrolled)) : ''}`);
      parts.push(`<a class="uxk-btn uxk-btn-primary" href="/course-dashboard-redirect/?course_id=${Number(owned.id) || 0}">${UXK.t('Continue course')}</a>`);
    }
    infoBox.innerHTML = `<div class="uxk-info-main">${parts.join(' ')}</div><div class="uxk-info-extra">${UXK.t('Loading info...')}</div><button class="uxk-info-x" title="${UXK.t('Close')}" aria-label="${UXK.t('Close')}">×</button>`;
    infoBox.querySelector('.uxk-info-x').onclick = () => { infoBox.remove(); infoBox = null; };
    if (!courseId) return;
    try {
      const j = await UXK.api.courseInfo(courseId);
      if (!infoBox || shownFor !== slug) return; // 기다리는 동안 닫았거나 다른 강의로 이동함
      const caps = Array.isArray(j.caption_languages) ? j.caption_languages : [];
      const extra = [
        j.created ? UXK.t('First published {0}', esc(String(j.created).slice(0, 10))) : '',
        j.last_update_date ? UXK.t('Last updated {0}', esc(j.last_update_date)) : '',
        j.content_length_video ? UXK.t('Video {0}', UXK.fmtDur(j.content_length_video)) : '',
        j.num_reviews ? UXK.t('{0} reviews', UXK.fmtNum(j.num_reviews)) : '',
        caps.length ? UXK.t('{0} caption languages: {1}{2}', caps.length, caps.slice(0, 12).map(esc).join(', '), caps.length > 12 ? ' …' : '') : (j.has_closed_caption === false ? UXK.t('No captions') : ''),
      ].filter(Boolean).join(' · ');
      infoBox.querySelector('.uxk-info-extra').innerHTML = extra || UXK.t('No extra info');
    } catch (e) {
      if (infoBox && shownFor === slug) infoBox.querySelector('.uxk-info-extra').textContent = UXK.t('Could not load extra info');
    }
  }

  async function init(settings) {
    S = settings;
    if (started) return;
    started = true;
    const cache = await loadOwned();
    observer = new MutationObserver(markSoon);
    observer.observe(document.body, { childList: true, subtree: true });
    markCards();
    landingInfo();
    // 보유 강의 데이터가 오래되었으면 조용히 갱신 (하루 1회 수준)
    if (UXK.lib.isStale(cache, Math.max(24, S.library.autoRefreshHours)) && (await UXK.lib.canAutoRefresh()) && started) {
      UXK.lib.refresh().then(async () => { await loadOwned(); unmarkAll(); markCards(); shownFor = null; landingInfo(); }).catch((e) => UXK.log('catalog refresh', e));
    }
  }
  function onUrl() { if (started) { markSoon(); landingInfo(); } }
  function destroy() {
    if (!started) return;
    started = false;
    if (observer) observer.disconnect();
    unmarkAll();
    if (infoBox) { infoBox.remove(); infoBox = null; }
    shownFor = null;
  }
  function onSettings(s) { S = s; if (started) { unmarkAll(); markCards(); shownFor = null; landingInfo(); } }

  UXK.catalogPage = { init, destroy, onSettings, onUrl };
})();
