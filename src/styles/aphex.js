'use strict';
// Selected Ambient Works의 흔들리는 테이프 패드 + drill'n'bass: 16분 격자, 하이햇(성장), 스네어 연타(스파이크), 애시드 베이스(먹이)
defineStyle('aphex', {
  color: '#e8553f', title: { en: 'Aphex Twin', ko: 'Aphex Twin' },
  name: 'Aphex Twin', short: 'Aphex', scale: 'dorian', tonic: 62, room: 'short', reverb: 0.3, echo: 0.2, echoTimes: [0.33, 0.5],
  drone: { level: 0.9, saw: 1.2, sub: 1, bright: 1.3, wobble: 22 },
  pad: { level: 0.8, saw: 1, bright: 0.7, fade: 1.5, swell: 0, wobble: 22, wobbleRate: 0.31 },
  front: { noise: 0.6, hum: 0, band: [800, 6000], crush: 1 },
  grid: { bpm: 'flow', div: 4 }, grain: { max: 0.9, tips: 40, mode: 'hat' },
  gap: { food: 0.12, tok: 0.06 }, humanize: 0, stutter: 0.15,
  reg: { fruit: -12, food: -12, start: 0, probe: 12, tok: 0, grain: 0, heart: -24 },
  inst: { fruit: 'acid', food: 'acid', start: 'kick909', probe: 'blip', tok: 'snare', heart: 'kick909', plop: 'blip', grain: 'hat' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    acid: { send: [0.2, 0.6] },
    kick909: { send: [0.1, 0], unpitched: true },
    snare: { send: [0.25, 0.3], unpitched: true },
    hat: { send: [0.1, 0.2], unpitched: true },
    blip: { send: [0.2, 0.7] },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // 애시드 베이스 (303 흉내): 톱니파 + 공명 큰 필터의 빠른 엔벨로프 + 살짝 찌그러뜨림
    acid(t, f, amp, out) {
      const o = this.osc('sawtooth', f, t, t + 0.4), lp = this.filter('lowpass', 180, 14);
      lp.frequency.setValueAtTime(180, t);
      lp.frequency.linearRampToValueAtTime(Math.min(f * 12, 6000), t + 0.012);
      lp.frequency.exponentialRampToValueAtTime(220, t + 0.25);
      const sh = this.ctx.createWaveShaper();
      sh.curve = this.tanhCurve;
      o.connect(lp).connect(sh).connect(this.env(t, amp * 0.7, 0.003, 0.32)).connect(out);
      return o;
    },

    // 909 킥: 빠르게 떨어지는 사인 + 딸깍 + 포화
    kick909(t, f, amp, out) {
      const o = this.osc('sine', 1, t, t + 0.5), sh = this.ctx.createWaveShaper();
      sh.curve = this.tanhCurve;
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
      o.connect(sh).connect(this.env(t, amp, 0.001, 0.42)).connect(out);
      this.noiseHit(t, 0.01).connect(this.env(t, amp * 0.4, 0.0005, 0.006)).connect(out);
      return o;
    },

    // 스네어: 높은 잡음 + 짧은 몸통음 (연타하면 음높이가 오른다)
    snare(t, f, amp, out) {
      const n = this.noiseHit(t, 0.2);
      n.connect(this.filter('highpass', 1200)).connect(this.env(t, amp * 1.6, 0.001, 0.16)).connect(out);
      this.osc('triangle', clamp(f, 140, 600), t, t + 0.1).connect(this.env(t, amp, 0.001, 0.08)).connect(out);
      return n;
    },

    // 하이햇: 아주 짧은 고역 잡음
    hat(t, f, amp, out) {
      const dur = 0.025 + Math.random() * 0.035;
      const n = this.noiseHit(t, dur + 0.01);
      n.connect(this.filter('highpass', 7500)).connect(this.env(t, amp, 0.0005, dur)).connect(out);
      return n;
    },

    // 삑: 짧은 사각파
    blip(t, f, amp, out) {
      const o = this.osc('square', f * 2, t, t + 0.1);
      o.connect(this.filter('lowpass', 4000)).connect(this.env(t, amp * 0.5, 0.001, 0.07)).connect(out);
      return o;
    },
  },
});
