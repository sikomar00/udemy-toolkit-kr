/* WebVTT 파싱 / SRT·텍스트 변환 / 이중 자막 정렬 */
(() => {
  const UXK = (globalThis.UXK = globalThis.UXK || {});
  if (UXK.vtt) return;

  const TS = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
  function toSec(s) {
    const m = String(s).trim().match(TS);
    if (!m) return NaN;
    const h = parseInt(m[1] || '0', 10), mi = parseInt(m[2], 10), se = parseInt(m[3], 10);
    const ms = parseInt((m[4] + '00').slice(0, 3), 10);
    return h * 3600 + mi * 60 + se + ms / 1000;
  }
  const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&lrm;': '', '&rlm;': '' };
  function clean(t) {
    return t
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp|lrm|rlm);/g, (m) => ENT[m] ?? m)
      .replace(/[ \t]+/g, ' ')
      .split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
  }

  function parse(text) {
    if (!text) return [];
    const src = String(text).replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    const blocks = src.split(/\n(?:[ \t]*\n)+/); // 공백만 있는 줄도 큐 구분으로 인정
    const cues = [];
    for (const b of blocks) {
      const lines = b.split('\n');
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i < 0) continue;
      const [a, rest] = lines[i].split('-->');
      const start = toSec(a);
      const end = toSec((rest || '').trim().split(/\s+/)[0]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const body = clean(lines.slice(i + 1).join('\n'));
      if (!body) continue;
      cues.push({ start, end: Math.max(end, start + 0.2), text: body });
    }
    cues.sort((x, y) => x.start - y.start);
    // 완전히 같은 연속 큐(롤링 자막 중복) 병합
    const out = [];
    for (const c of cues) {
      const p = out[out.length - 1];
      if (p && p.text === c.text && c.start - p.end < 0.5) p.end = Math.max(p.end, c.end);
      else out.push({ ...c });
    }
    return out;
  }

  // 시간 t에 해당하는 큐 인덱스 (없으면 -1). hint로 직전 인덱스를 주면 빠름
  function find(cues, t, hint = -1) {
    if (!cues || !cues.length) return -1;
    if (hint >= 0 && hint < cues.length) {
      const c = cues[hint];
      if (t >= c.start && t < c.end) return hint;
      const n = cues[hint + 1];
      if (n && t >= n.start && t < n.end) return hint + 1;
    }
    let lo = 0, hi = cues.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (ans >= 0 && t < cues[ans].end) return ans;
    return -1;
  }
  // t 이전에 시작한 마지막 큐 (공백 구간에서 '방금 문장' 찾기)
  function prevIndex(cues, t) {
    let lo = 0, hi = cues.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // 보조 자막을 원문 큐에 시간 겹침 기준으로 매칭
  function align(primary, secondary) {
    if (!secondary || !secondary.length) return primary.map(() => '');
    let j = 0;
    return primary.map((p) => {
      while (j < secondary.length && secondary[j].end <= p.start) j++;
      const parts = [];
      for (let k = Math.max(0, j - 1); k < secondary.length && secondary[k].start < p.end; k++) {
        const s = secondary[k];
        const ov = Math.min(p.end, s.end) - Math.max(p.start, s.start);
        if (ov > 0.15 * Math.min(p.end - p.start, s.end - s.start)) parts.push(s.text);
      }
      return Array.from(new Set(parts)).join(' ');
    });
  }

  const srtTime = (s) => {
    const ms = Math.round((s % 1) * 1000);
    const t = Math.floor(s);
    const p = (x, n = 2) => String(x).padStart(n, '0');
    return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)},${p(ms, 3)}`;
  };

  function toSRT(cues, second) {
    return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}${second && second[i] ? '\n' + second[i] : ''}\n`).join('\n');
  }
  function toText(cues, second) {
    if (second) return cues.map((c, i) => (second[i] ? `${c.text}\n${second[i]}` : c.text)).join('\n\n');
    // 원문만: 문장 흐름대로 이어 붙이고 문장 끝에서 줄바꿈
    return cues.map((c) => c.text.replace(/\n/g, ' ')).join(' ').replace(/\s+/g, ' ').replace(/([.!?。？！])\s+/g, '$1\n').trim();
  }
  function toMarkdown(cues, second, linkFn) {
    return cues.map((c, i) => {
      const ts = UXK.fmtClock(c.start);
      const t = linkFn ? `[${ts}](${linkFn(c.start)})` : `\`${ts}\``;
      return `- ${t} ${c.text.replace(/\n/g, ' ')}${second && second[i] ? `  \n  ${second[i].replace(/\n/g, ' ')}` : ''}`;
    }).join('\n');
  }

  UXK.vtt = { parse, find, prevIndex, align, toSRT, toText, toMarkdown, toSec };
})();
