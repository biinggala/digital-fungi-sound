'use strict';
// 기본 소리: 실험실 계측기처럼 사건을 그대로 들려준다
defineStyle('lab', {
  color: '#c9b48a', title: { en: 'Lab', ko: '연구실' },
  name: '연구실', short: 'Lab', scale: 'minorPenta', tonic: 62, room: 'short', reverb: 0.55, echo: 0, echoTimes: [0.4, 0.6],
  drone: { level: 1, saw: 1, sub: 1, bright: 1, wobble: 0 },
  pad: { level: 1, saw: 0, bright: 1, fade: 2, swell: 0, wobble: 0, wobbleRate: 0.2 },
  front: { noise: 1, hum: 1, band: [300, 3100], crush: 0 },
  grid: null, grain: { max: 50, tips: 250, speed: true, mode: 'noise' },
  gap: { food: 0.15, tok: 0 }, humanize: 0, stutter: 0,
  reg: { fruit: 0, food: 0, start: 0, probe: 12, tok: -12, grain: 0, heart: -24 },
  inst: { fruit: 'bell', food: 'bell', start: 'thump', probe: 'pluck', tok: 'tok', heart: 'kick', plop: 'plop', grain: 'crackle' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    bell: { send: [0.8, 0.6], len: 1.2 },
    thump: { send: [0.3, 0.2], unpitched: true },
    pluck: { send: [0.35, 0.5] },
    tok: { send: [0.25, 0.3] },
    kick: { send: [0.25, 0], unpitched: true },
    plop: { send: [0.4, 0.4], unpitched: true },
    crackle: { send: [0.15, 0], unpitched: true },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // FM 종 (비정수배 변조 → 금속성)
    bell(t, f, amp, out) {
      const car = this.osc('sine', f, t, t + 2.5), mod = this.osc('sine', f * 1.4, t, t + 2.5);
      const idx = this.ctx.createGain();
      idx.gain.setValueAtTime(f * 2.4, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.03, t + 1.6);
      mod.connect(idx).connect(car.frequency);
      car.connect(this.env(t, amp, 0.004, 2.4)).connect(out);
      this.osc('sine', f * 2.76, t, t + 2.5).connect(this.env(t, amp * 0.2, 0.002, 1.1)).connect(out);
      return car;
    },

    // 아래로 떨어지는 '쿵'. 클릭한 자극이 자발 발화보다 높게 시작
    thump(t, f, amp, out, { user }) {
      const o = this.osc('sine', 1, t, t + 0.7);
      o.frequency.setValueAtTime(user ? 200 : 150, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.35);
      o.connect(this.env(t, amp, 0.004, 0.6)).connect(out);
      this.noiseHit(t, 0.06).connect(this.filter('lowpass', 1500)).connect(this.env(t, amp * 0.5, 0.001, 0.04)).connect(out);
      return o;
    },

    // 짧은 퉁김 (톱니파 + 닫히는 필터)
    pluck(t, f, amp, out) {
      const o = this.osc('sawtooth', f, t, t + 0.45), lp = this.filter('lowpass', 7000, 6);
      lp.frequency.setValueAtTime(7000, t);
      lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.18);
      o.connect(lp).connect(this.env(t, amp, 0.002, 0.4)).connect(out);
      return o;
    },

    // 나무 '톡'
    tok(t, f, amp, out) {
      const o = this.osc('triangle', f, t, t + 0.5);
      o.connect(this.env(t, amp, 0.002, 0.22)).connect(out);
      return o;
    },

    // 심장 박동 같은 저음 킥
    kick(t, f, amp, out, { heart }) {
      const o = this.osc('sine', 1, t, t + 0.5);
      o.frequency.setValueAtTime(heart === 2 ? 165 : 110, t);
      o.frequency.exponentialRampToValueAtTime(heart === 2 ? 63 : 42, t + 0.22);
      o.connect(this.env(t, amp, 0.003, 0.35)).connect(out);
      return o;
    },

    // 물방울 '퐁'
    plop(t, f, amp, out) {
      const o = this.osc('sine', 1, t, t + 0.25);
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(640, t + 0.09);
      o.connect(this.env(t, amp, 0.005, 0.18)).connect(out);
      return o;
    },

    // 흙 속 바스락: 아주 짧은 띠 잡음
    crackle(t, f, amp, out) {
      const dur = 0.008 + Math.random() * 0.02;
      const s = this.noiseHit(t, dur + 0.01);
      s.connect(this.filter('bandpass', f, 7)).connect(this.env(t, amp, 0.001, dur)).connect(out);
      return s;
    },
  },
});
