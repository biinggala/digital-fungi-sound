'use strict';
// Sun Ra "Adventure-Equation" (Cosmic Tones for Mental Therapy, 1963 녹음): 브루클린 Tip Top 클럽의 Hammond B-3, Clavioline(진공관 단음 건반),
// 타악기, Tommy Hunter의 리버브. 미니무그(1969~)보다 앞선 시기라 무그는 쓰지 않는다. 악기 소리는 모두 아날로그 녹음 버스(analog)를 지난다
defineStyle('sunra', {
  color: 'var(--c-ra)', title: { en: 'Sun Ra · Cosmic Tones (1963)', ko: 'Sun Ra · Cosmic Tones (1963)' },
  name: 'Sun Ra', short: 'Ra', scale: 'chromatic', tonic: 62, room: 'long', reverb: 0.45, echo: 0.25, echoTimes: [0.19, 0.27],
  analog: true,
  drone: { level: 0.6, saw: 0.1, sub: 0.7, bright: 0.7, wobble: 14 },
  pad: { level: 0.9, saw: 0.15, bright: 0.6, fade: 1.2, swell: 0.8, wobble: 16, wobbleRate: 6.7 },
  front: { noise: 0.5, hum: 0.6, band: [300, 2500], crush: 0 },
  grid: null, grain: { max: 6, tips: 150, speed: false, mode: 'scale', amp: 0.05 },
  gap: { food: 0.3, tok: 0.08 }, humanize: 0.4, stutter: 0,
  reg: { fruit: -12, food: 0, start: -12, probe: 12, tok: 0, grain: 12, heart: -24 },
  inst: { fruit: 'hammond', food: 'clavioline', start: 'hammond', probe: 'clavioline', tok: 'logdrum', heart: 'timpani', plop: 'smallBell', grain: 'smallBell' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    hammond: { send: [0, 0], len: 0.6, analog: true },
    clavioline: { send: [0, 0], len: 0.5, analog: true },
    smallBell: { send: [0, 0], analog: true },
    logdrum: { send: [0, 0], analog: true },
    timpani: { send: [0, 0], unpitched: true, analog: true },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // Hammond B-3: 톤휠 사인들의 드로바 합 (16' 8' 5⅓' 4' 2⅔' 2'), 키 클릭, 2배음 퍼커션, 레슬리(음량 떨림 + 살짝 음높이 떨림).
    // cluster면 반음씩 붙은 세 음을 팔뚝으로 누르듯이 (파동 시작)
    hammond(t, f, amp, out, { cluster } = {}) {
      const hold = cluster ? 0.55 : 0.32, end = t + 0.006 + hold + 0.3;
      const sum = this.ctx.createGain(), leslie = this.ctx.createGain();
      leslie.gain.value = 0.75;
      const lfo = this.osc('sine', 6.7, t, end), ld = this.ctx.createGain(), vib = this.ctx.createGain();
      ld.gain.value = 0.25; vib.gain.value = 9;  // 음량 ±25%, 음높이 ±9센트
      lfo.connect(ld).connect(leslie.gain);
      sum.connect(leslie).connect(this.envHold(t, amp * 0.22, 0.006, hold, 0.3)).connect(out);
      let last;
      for (const fr of cluster ? [1, 1.0595, 1.1225] : [1]) {
        for (const [r, a] of [[0.5, 0.7], [1, 1], [1.5, 0.55], [2, 0.6], [3, 0.3], [4, 0.25]]) {
          last = this.osc('sine', f * fr * r, t, end);
          lfo.connect(vib).connect(last.detune);
          const g = this.ctx.createGain();
          g.gain.value = a;
          last.connect(g).connect(sum);
        }
      }
      // 퍼커션: 누르는 순간 2배음이 빠르게 사라짐
      this.osc('sine', f * 2, t, t + 0.35).connect(this.env(t, amp * 0.12, 0.002, 0.3)).connect(out);
      // 키 클릭: 접점이 닿는 순간의 짧은 잡음
      this.noiseHit(t, 0.006).connect(this.filter('highpass', 2500)).connect(this.env(t, amp * 0.2, 0.0005, 0.004)).connect(out);
      return last;
    },

    // Clavioline: 진공관 단음 건반. 사각파 → 코맹맹이 대역 필터, 5.5 Hz 비브라토, 처음에 살짝 아래서 미끄러져 올라온다
    clavioline(t, f, amp, out) {
      const end = t + 0.75, o = this.osc('square', f * 0.97, t, end);
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const vib = this.osc('sine', 5.5, t, end), vd = this.ctx.createGain();
      vd.gain.value = 14;
      vib.connect(vd).connect(o.detune);
      const bp = this.filter('bandpass', Math.min(f * 3, 5000), 1.6), lp = this.filter('lowpass', 2800, 0.7);
      o.connect(bp).connect(lp).connect(this.envHold(t, amp * 0.9, 0.02, 0.32, 0.35)).connect(out);
      return o;
    },

    // 작은 종 · 방울 (아케스트라의 작은 타악기): 비정수배 두 사인이 짧게
    smallBell(t, f, amp, out) {
      const o = this.osc('sine', f * 2, t, t + 0.7);
      o.connect(this.env(t, amp, 0.001, 0.6)).connect(out);
      this.osc('sine', f * 2 * 2.76, t, t + 0.3).connect(this.env(t, amp * 0.4, 0.001, 0.25)).connect(out);
      return o;
    },

    // 통나무 북: 짧게 떨어지는 음높이 + 딸깍 (박자 없이)
    logdrum(t, f, amp, out) {
      const p = clamp(f, 120, 520), o = this.osc('sine', p * 1.3, t, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(p, t + 0.02);
      o.connect(this.env(t, amp * 1.5, 0.001, 0.28)).connect(out);
      this.noiseHit(t, 0.01).connect(this.filter('bandpass', p * 4, 3)).connect(this.env(t, amp * 0.6, 0.0005, 0.008)).connect(out);
      return o;
    },

    // 팀파니: 낮은 북의 둥근 울림, 처음엔 살짝 높았다가 내려앉는다
    timpani(t, f, amp, out) {
      const o = this.osc('sine', 98, t, t + 1.8);
      o.frequency.exponentialRampToValueAtTime(82, t + 0.3);
      o.connect(this.env(t, amp * 0.8, 0.004, 1.6)).connect(out);
      this.osc('sine', 82 * 1.5, t, t + 0.8).connect(this.env(t, amp * 0.2, 0.004, 0.6)).connect(out);
      this.noiseHit(t, 0.08).connect(this.filter('lowpass', 900)).connect(this.env(t, amp * 0.5, 0.001, 0.06)).connect(out);
      return o;
    },
  },
});
