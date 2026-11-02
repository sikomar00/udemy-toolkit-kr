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
        const badge = el('span', { class: 'uxk-owned', title: '이미 구매한 강의 (Udemy Toolkit)' }, [`보유 중 · 진행 ${Math.min(100, c.progress)}%${c.archived ? ' · 보관됨' : ''}`]);
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
    if (!S.catalog.landingInfo || UXK.route() !== 'landing') { if (infoBox) { infoBox.remove(); infoBox = null; } return; }
    const slug = (location.pathname.match(/^\/course\/([^/]+)/) || [])[1];
    const owned = slug ? bySlug.get(decodeURIComponent(slug)) : null;
    const idAttr = document.querySelector('[data-clp-course-id]');
    const courseId = owned ? owned.id : idAttr ? +idAttr.getAttribute('data-clp-course-id') : null;
    if (!owned && !courseId) return;
    if (!infoBox) {
      infoBox = el('div', { class: 'uxk-info' });
      document.body.appendChild(infoBox);
    }
    const parts = [];
    if (owned) {
      parts.push(`<b>이미 보유한 강의</b> · 진행 ${Math.min(100, Number(owned.progress) || 0)}%${owned.archived ? ' · 보관됨' : ''}${owned.enrolled ? ` · 구매 ${esc(owned.enrolled)}` : ''}`);
      parts.push(`<a class="uxk-btn uxk-btn-primary" href="/course-dashboard-redirect/?course_id=${Number(owned.id) || 0}">강의 이어보기</a>`);
    }
    infoBox.innerHTML = `<div class="uxk-info-main">${parts.join(' ')}</div><div class="uxk-info-extra">정보 불러오는 중...</div><button class="uxk-info-x" title="닫기">×</button>`;
    infoBox.querySelector('.uxk-info-x').onclick = () => { infoBox.remove(); infoBox = null; };
    if (!courseId) return;
    try {
      const j = await UXK.api.courseInfo(courseId);
      if (!infoBox) return;
      const caps = Array.isArray(j.caption_languages) ? j.caption_languages : [];
      const extra = [
        j.created ? `최초 출시 ${esc(String(j.created).slice(0, 10))}` : '',
        j.last_update_date ? `최근 업데이트 ${esc(j.last_update_date)}` : '',
        j.content_length_video ? `영상 ${UXK.fmtDur(j.content_length_video)}` : '',
        j.num_reviews ? `리뷰 ${UXK.fmtNum(j.num_reviews)}` : '',
        caps.length ? `자막 ${caps.length}종: ${caps.slice(0, 12).map(esc).join(', ')}${caps.length > 12 ? ' 외' : ''}` : (j.has_closed_caption === false ? '자막 없음' : ''),
      ].filter(Boolean).join(' · ');
      infoBox.querySelector('.uxk-info-extra').innerHTML = extra || '추가 정보 없음';
    } catch (e) {
      if (infoBox) infoBox.querySelector('.uxk-info-extra').textContent = '추가 정보를 가져오지 못했습니다';
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
      UXK.lib.refresh().then(async () => { await loadOwned(); unmarkAll(); markCards(); landingInfo(); }).catch((e) => UXK.log('catalog refresh', e));
    }
  }
  function onUrl() { if (started) { markSoon(); landingInfo(); } }
  function destroy() {
    if (!started) return;
    started = false;
    if (observer) observer.disconnect();
    unmarkAll();
    if (infoBox) { infoBox.remove(); infoBox = null; }
  }
  function onSettings(s) { S = s; if (started) { unmarkAll(); markCards(); landingInfo(); } }

  UXK.catalogPage = { init, destroy, onSettings, onUrl };
})();
