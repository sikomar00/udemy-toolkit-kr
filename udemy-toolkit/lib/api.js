/* Udemy 내부 API 래퍼 (로그인 세션 쿠키로 same-origin 요청) */
(() => {
  const UXK = (globalThis.UXK = globalThis.UXK || {});
  if (UXK.api) return;

  const cookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  function headers(method) {
    const h = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
    // Udemy 웹 앱은 access_token 쿠키 값을 X-Udemy-Authorization 헤더로 보냄 (udemy-export README 근거).
    // 쿠키가 HttpOnly라 읽히지 않으면 생략하고 세션 쿠키만으로 요청한다.
    const token = cookie('access_token');
    if (token) h['X-Udemy-Authorization'] = 'Bearer ' + token;
    if (method !== 'GET') {
      h['Content-Type'] = 'application/json';
      const csrf = cookie('csrftoken');
      if (csrf) h['X-CSRFToken'] = csrf;
    }
    return h;
  }

  class ApiError extends Error {
    constructor(status, url, body) {
      super(`HTTP ${status}`);
      this.status = status;
      this.url = url;
      this.body = body;
    }
  }

  async function request(method, path, body, { retries = 3, signal } = {}) {
    const url = path.startsWith('http') ? path : location.origin + path;
    let attempt = 0;
    for (;;) {
      let res;
      try {
        res = await fetch(url, {
          method,
          credentials: 'include',
          headers: headers(method),
          body: body == null ? undefined : JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (signal && signal.aborted) throw e;
        if (attempt++ < retries) { await UXK.sleep(1000 * attempt); continue; }
        throw e;
      }
      if (res.status === 429 || res.status === 503 || res.status === 502) {
        if (attempt++ < retries) {
          const ra = parseFloat(res.headers.get('Retry-After'));
          await UXK.sleep(Number.isFinite(ra) ? Math.min(ra, 30) * 1000 : 1500 * Math.pow(2, attempt)); // 서버가 아주 긴 대기를 요구해도 30초까지만
          continue;
        }
      }
      if (!res.ok) {
        let txt = '';
        try { txt = (await res.text()).slice(0, 300); } catch (e) {}
        throw new ApiError(res.status, url, txt);
      }
      if (res.status === 204) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        const t = await res.text();
        try { return JSON.parse(t); } catch (e) { return t; }
      }
      return res.json();
    }
  }

  async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0, failed = false;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length && !failed) {
        const idx = i++;
        try { out[idx] = await fn(items[idx], idx); } catch (e) { failed = true; throw e; } // 한 곳이 실패하면 다른 작업자도 더 요청하지 않는다
      }
    });
    await Promise.all(workers);
    return out;
  }

  // 목록 API 필드: BASE는 실측 확인, EXTRA는 지원 여부 미확인(탐색 후 사용)
  const BASE_FIELDS = [
    'title', 'url', 'published_title', 'avg_rating', 'num_reviews', 'last_update_date', 'num_subscribers',
    'content_length_video', 'estimated_content_length', 'completion_ratio', 'enrollment_time', 'last_accessed_time',
    'favorite_time', 'archive_time', 'image_240x135', 'visible_instructors', 'num_collections',
  ];
  const EXTRA_FIELDS = ['primary_category', 'locale', 'caption_languages', 'has_closed_caption', 'created', 'num_published_lectures'];

  function listUrl(fields, { archived, page = 1, pageSize = 100 }) {
    const q = new URLSearchParams();
    q.set('page_size', String(pageSize));
    q.set('page', String(page));
    // 정렬 파라미터를 주지 않음: 서버 기본 순서는 v1에서 1,647개 전부 중복·누락 없이 수집됨을 확인
    q.set('fields[course]', fields.join(','));
    q.set('fields[user]', 'title');
    if (archived != null) q.set('is_archived', archived ? 'true' : 'false');
    return '/api-2.0/users/me/subscribed-courses/?' + q.toString().replace(/%2C/g, ',').replace(/%5B/g, '[').replace(/%5D/g, ']');
  }

  async function detectFields() {
    const key = UXK.KEYS.fieldsOk();
    const cached = await UXK.local.get(key);
    if (cached && Date.now() - cached.t < 7 * 864e5) return cached.fields;
    // 1) 기본 필드 요청이 먼저 성공해야 함 (로그아웃·권한 문제면 여기서 실패하고 아무것도 캐시하지 않음)
    await request('GET', listUrl(BASE_FIELDS, { archived: false, pageSize: 1 }), null, { retries: 1 });
    // 2) 확장 필드 전체 → 실패하면 하나씩
    let fields = BASE_FIELDS.concat(EXTRA_FIELDS);
    let transient = false; // 일시 오류(429·5xx·네트워크)로 확장 필드를 못 쓴 경우는 일주일간 캐시하지 않는다
    const noteFailure = (e) => {
      if (e.status === 401 || e.status === 403) throw e;
      if (!e.status || e.status === 429 || e.status >= 500) transient = true;
    };
    try {
      await request('GET', listUrl(fields, { archived: false, pageSize: 1 }), null, { retries: 0 });
    } catch (e) {
      noteFailure(e);
      fields = BASE_FIELDS.slice();
      for (const f of EXTRA_FIELDS) {
        try {
          await request('GET', listUrl(BASE_FIELDS.concat(f), { archived: false, pageSize: 1 }), null, { retries: 0 });
          fields.push(f);
        } catch (e2) {
          noteFailure(e2);
        }
      }
    }
    if (!transient) await UXK.local.set(key, { t: Date.now(), fields });
    return fields;
  }

  async function listCourses({ archived, fields, onPage, signal }) {
    const first = await request('GET', listUrl(fields, { archived, page: 1 }), null, { signal });
    // 로그인 안내 같은 HTML이 200으로 오면 목록이 비어 보여 기존 캐시를 덮어쓰게 되므로 형식을 확인
    if (!first || !Array.isArray(first.results)) throw new Error('강의 목록 응답 형식이 예상과 다릅니다 (로그인 상태를 확인하세요)');
    const total = first.count || (first.results || []).length;
    let results = (first.results || []).slice();
    onPage && onPage(results.length, total);
    const pages = Math.ceil(total / 100);
    if (pages > 1 && first.next) {
      const rest = [];
      for (let p = 2; p <= pages; p++) rest.push(p);
      await pool(rest, 2, async (p) => {
        const j = await request('GET', listUrl(fields, { archived, page: p }), null, { signal });
        results.push(...(j.results || []));
        onPage && onPage(results.length, total);
      });
    }
    const dedupe = (arr) => { const seen = new Set(); return arr.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))); };
    let unique = dedupe(results);
    if (unique.length < total) {
      // 병렬 수집 중 순서가 바뀌어 누락이 생기면 next 링크를 따라 순차 재수집
      UXK.log('병렬 수집 누락 → 순차 재수집', unique.length, total);
      const seq = [];
      let next = listUrl(fields, { archived, page: 1 });
      let guard = 0;
      while (next && guard++ < 200) {
        const j = await request('GET', next, null, { signal });
        seq.push(...(j.results || []));
        onPage && onPage(seq.length, total);
        next = j.next || null;
      }
      const seqUnique = dedupe(seq);
      if (seqUnique.length > unique.length) unique = seqUnique;
    }
    return unique;
  }

  UXK.api = {
    ApiError,
    request,
    pool,
    get: (p, o) => request('GET', p, null, o),
    BASE_FIELDS,
    EXTRA_FIELDS,
    detectFields,
    listCourses,

    async fetchLibrary(onProgress, signal) {
      const fields = await detectFields();
      let doneA = 0, totA = 0, doneB = 0, totB = 0;
      const report = () => onProgress && onProgress(doneA + doneB, totA + totB);
      const [active, archived] = await Promise.all([
        listCourses({ archived: false, fields, signal, onPage: (n, t) => { doneA = n; totA = t; report(); } }),
        listCourses({ archived: true, fields, signal, onPage: (n, t) => { doneB = n; totB = t; report(); } }),
      ]);
      return { active, archived, fields };
    },

    archive(courseId) {
      return request('POST', '/api-2.0/users/me/archived-courses/?fields[course]=archive_time', { course_id: courseId }, { retries: 1 });
    },
    unarchive(courseId) {
      // [추정] 실측 미확인. 실패하면 호출 측에서 중단한다.
      return request('DELETE', `/api-2.0/users/me/archived-courses/${courseId}/`, null, { retries: 0 });
    },

    async curriculum(courseId, { withCaptions = true } = {}) {
      const build = (caps) => {
        const q = new URLSearchParams();
        q.set('curriculum_types', 'chapter,lecture,quiz');
        q.set('page_size', '200');
        q.set('fields[lecture]', 'title,object_index,sort_order,asset,is_published');
        q.set('fields[quiz]', 'title,object_index,type');
        q.set('fields[chapter]', 'title,object_index');
        q.set('fields[asset]', caps ? 'title,asset_type,time_estimation,captions' : 'title,asset_type,time_estimation');
        q.set('caching_intent', 'True');
        return `/api-2.0/courses/${courseId}/subscriber-curriculum-items/?` + q.toString().replace(/%2C/g, ',').replace(/%5B/g, '[').replace(/%5D/g, ']');
      };
      const walk = async (url) => {
        const out = [];
        let next = url;
        let guard = 0;
        while (next && guard++ < 50) {
          const j = await request('GET', next);
          out.push(...(j.results || []));
          next = j.next || null;
        }
        return out;
      };
      try { return await walk(build(withCaptions)); } catch (e) {
        if (!withCaptions) throw e;
        return walk(build(false));
      }
    },

    lecture(courseId, lectureId) {
      return request('GET', `/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=title,asset&fields[asset]=asset_type,time_estimation,length,captions`);
    },

    async progress(courseId) {
      // [추정] 실패 시 null
      try {
        return await request('GET', `/api-2.0/users/me/subscribed-courses/${courseId}/progress/?fields[course]=completed_lecture_ids,completed_quiz_ids,completed_assignment_ids,last_seen_page`, null, { retries: 1 });
      } catch (e) { return null; }
    },

    courseInfo(courseId, fields = 'title,created,last_update_date,caption_languages,locale,has_closed_caption,avg_rating,num_reviews,num_subscribers,content_length_video') {
      return request('GET', `/api-2.0/courses/${courseId}/?fields[course]=${fields}`, null, { retries: 1 });
    },
  };

  // ---------------- 라이브러리 데이터 (내 강의 목록) ----------------
  const BAYES_M = 100;
  function normalize(c, archived) {
    const hours = (c.content_length_video || 0) / 3600 || (c.estimated_content_length || 0) / 60;
    const slug = c.published_title || ((c.url || '').match(/\/course\/([^/]+)/) || [])[1] || '';
    const loc = c.locale || null;
    return {
      id: c.id,
      title: c.title || '',
      slug,
      rating: c.avg_rating ?? 0,
      reviews: c.num_reviews ?? 0,
      updated: c.last_update_date || null,
      created: c.created ? String(c.created).slice(0, 10) : null,
      subs: c.num_subscribers ?? 0,
      hours,
      progress: c.completion_ratio ?? 0,
      enrolled: c.enrollment_time ? String(c.enrollment_time).slice(0, 10) : null,
      accessed: c.last_accessed_time ? String(c.last_accessed_time).slice(0, 10) : null,
      favorite: !!c.favorite_time,
      archived: archived || !!c.archive_time,
      img: c.image_240x135 || '',
      instructors: (c.visible_instructors || []).map((u) => u.title || u.display_name || u.name).filter(Boolean).join(', '),
      category: (c.primary_category && (c.primary_category.title || c.primary_category.title_cleaned)) || '',
      lang: loc ? (loc.simple_english_title || loc.title || loc.locale || '') : '',
      langCode: loc ? String(loc.locale || '').slice(0, 2) : '',
      captions: Array.isArray(c.caption_languages) ? c.caption_languages : [],
      hasCC: c.has_closed_caption,
      lectures: c.num_published_lectures ?? null,
      collections: c.num_collections ?? 0,
    };
  }

  UXK.lib = {
    BAYES_M,
    _mem: null,
    async load() {
      if (this._mem) return this._mem;
      this._mem = await UXK.local.get(UXK.KEYS.courses(), null);
      return this._mem;
    },
    async save(cache) {
      this._mem = cache;
      return UXK.local.set(UXK.KEYS.courses(), cache);
    },
    isStale(cache, hours) {
      return !cache || !cache.t || Date.now() - cache.t > (hours || 24) * 3600e3;
    },
    // 자동 갱신은 최근 1시간 안에 실패(로그아웃 등)했으면 건너뜀
    async canAutoRefresh() {
      const f = await UXK.local.get('uxk_refresh_fail:' + location.host, 0);
      return !f || Date.now() - f > 3600e3;
    },
    _refreshing: null,
    refresh(onProgress) {
      if (this._refreshing) return this._refreshing;
      const startedAt = Date.now();
      const run = async () => {
        // 다른 탭이 방금 갱신했다면 그 결과를 사용 (탭 여러 개에서 동시에 전체 요청하지 않도록)
        const fresh = await UXK.local.get(UXK.KEYS.courses(), null);
        if (fresh && fresh.t >= startedAt) { this._mem = fresh; return fresh; }
        try {
          const { active, archived, fields } = await UXK.api.fetchLibrary(onProgress);
          const data = active.map((c) => normalize(c, false)).concat(archived.map((c) => normalize(c, true)));
          const prev = await this.load();
          if (!data.length && prev && prev.data.length) throw new Error('빈 목록을 받아 기존 데이터를 유지했습니다');
          const cache = { t: Date.now(), fields, data };
          await this.save(cache);
          await UXK.local.remove('uxk_refresh_fail:' + location.host);
          return cache;
        } catch (e) {
          await UXK.local.set('uxk_refresh_fail:' + location.host, Date.now());
          throw e;
        }
      };
      this._refreshing = (async () => {
        try {
          if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('uxk-refresh:' + location.host, run);
          return await run();
        } finally {
          this._refreshing = null;
        }
      })();
      return this._refreshing;
    },
    async patch(id, changes) {
      const cache = await this.load();
      if (!cache) return;
      const c = cache.data.find((x) => x.id === id);
      if (c) Object.assign(c, changes);
      await this.save(cache);
    },
    globalMean(data) {
      const w = data.filter((c) => c.reviews > 0);
      return w.length ? w.reduce((s, c) => s + c.rating, 0) / w.length : 4.4;
    },
    bayes(c, mean) {
      return (c.reviews / (c.reviews + BAYES_M)) * c.rating + (BAYES_M / (c.reviews + BAYES_M)) * mean;
    },
    // 로컬 메타(태그·학습 큐·메모)
    async meta() { return UXK.local.get(UXK.KEYS.meta, {}); },
    async updateMeta(ids, fn) {
      return UXK.local.update(UXK.KEYS.meta, (m) => {
        m = m || {};
        ids.forEach((id) => {
          const cur = m[id] || { tags: [], queue: false, memo: '' };
          const next = fn({ tags: (cur.tags || []).slice(), queue: !!cur.queue, memo: cur.memo || '' });
          if (!next.tags.length && !next.queue && !next.memo) delete m[id];
          else m[id] = next;
        });
        return m;
      }, {});
    },
  };
})();
