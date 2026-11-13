// 플레이어 배속: 저장된 속도, Udemy가 되돌릴 때 재적용, 줄다리기 감지
(() => {
  const UXK = globalThis.UXK;
  const P = UXK.playerShared;
  if (!P || P.parts.has('speed')) return;
  P.parts.add('speed');

  // ======================= 속도 =======================
  const speed = {
    intended: 1,
    touched: false, // 이 페이지에서 사용자가 이미 속도를 바꿨는지 (저장된 속도 불러오기가 덮어쓰지 않게)
    lastNative: 0,
    reapplies: [],
    beforeReset: 1.5,
    cooldownUntil: 0, // Udemy와 속도 줄다리기가 감지되면 잠시 재적용을 멈추는 시각
    warned: false,
    clampRate(v) { return UXK.clamp(Math.round(v * 100) / 100, Math.max(0.0625, P.S.speed.min), Math.min(16, P.S.speed.max)); },
    async load() {
      const map = (await UXK.local.get(UXK.KEYS.speeds, {})) || {};
      let v;
      if (P.S.speed.remember === 'course') v = P.ctx.courseId && map[P.ctx.courseId] != null ? map[P.ctx.courseId] : P.S.speed.default;
      else v = map._global != null ? map._global : P.S.speed.default;
      UXK.log('speed.load', { courseId: P.ctx.courseId, loaded: v, before: this.intended, touched: this.touched });
      if (this.touched) return;
      this.intended = this.clampRate(v);
      if (this.intended !== 1) this.beforeReset = this.intended;
    },
    saveSoon: UXK.debounce(async () => {
      const v = speed.intended;
      try {
        await UXK.local.update(UXK.KEYS.speeds, (m) => {
          m = m || {};
          if (P.S.speed.remember === 'course') { if (!P.ctx.courseId) return m; m[P.ctx.courseId] = v; } else m._global = v; // 코스를 아직 모르면 엉뚱하게 전역 값으로 저장하지 않는다
          return m;
        }, {});
      } catch (e) { UXK.log('speed save', e); }
    }, 600),
    set(v, { show = true } = {}) {
      v = this.clampRate(v);
      this.intended = v;
      this.touched = true;
      this.cooldownUntil = 0;
      this.reapplies = [];
      if (P.ctx.video && Math.abs(P.ctx.video.playbackRate - v) > 0.001) P.ctx.video.playbackRate = v;
      if (show) P.indicator(`${v.toFixed(2).replace(/0$/, '')}x`);
      this.saveSoon();
      updateSpeedLabel();
      P.updatePill();
    },
    applyNow() {
      const v = P.ctx.video;
      if (!v || !P.S.speed.enabled) return;
      if (Math.abs(v.playbackRate - this.intended) > 0.001) v.playbackRate = this.intended;
    },
    onRateChange() {
      const v = P.ctx.video;
      if (!v) return;
      const r = v.playbackRate;
      UXK.log('ratechange', { r, intended: this.intended, sinceNative: Date.now() - this.lastNative, cooldown: Math.max(0, this.cooldownUntil - Date.now()), reapplies: this.reapplies.length });
      if (Math.abs(r - this.intended) < 0.001) return;
      // 사용자가 Udemy 자체 속도 메뉴/Shift+화살표로 바꾼 경우: 그 값을 채택
      if (Date.now() - this.lastNative < 1500 || !P.S.speed.enabled) {
        this.lastNative = 0; // 한 번 채택하면 소모 (같은 1.5초 안의 다른 변경까지 채택하지 않게)
        this.touched = true;
        this.intended = this.clampRate(r);
        if (this.intended !== 1) this.beforeReset = this.intended;
        this.saveSoon();
        updateSpeedLabel();
        P.updatePill();
        return;
      }
      if (!P.S.speed.enforce) { this.intended = this.clampRate(r); updateSpeedLabel(); return; }
      // Udemy가 강의 전환 등으로 속도를 되돌린 경우: 다시 적용
      const now = Date.now();
      if (now < this.cooldownUntil) return; // 줄다리기 감지 후 대기 중 (사용자 지정 속도는 유지)
      this.reapplies = this.reapplies.filter((t) => now - t < 3000);
      if (this.reapplies.length >= 8) {
        // 무한 반복 방지: 5초 쉬었다가 사용자가 지정한 속도를 다시 적용 (지정 속도를 Udemy 값으로 바꾸지 않음)
        this.cooldownUntil = now + 5000;
        this.reapplies = [];
        if (!this.warned) { this.warned = true; UXK.ui.toast('Udemy가 속도를 계속 되돌리고 있어 5초 뒤 다시 적용합니다.', { timeout: 5000 }); }
        setTimeout(() => this.applyNow(), 5100);
        return;
      }
      this.reapplies.push(now);
      setTimeout(() => this.applyNow(), 30);
    },
  };
  function updateSpeedLabel() {
    if (P.speedLabel) P.speedLabel.textContent = `${speed.intended.toFixed(2)}x`;
  }
  function applySpeedSoon() {
    speed.applyNow();
    setTimeout(() => speed.applyNow(), 300);
    setTimeout(() => speed.applyNow(), 1200);
  }

  Object.assign(P, { speed, updateSpeedLabel, applySpeedSoon });
})();
