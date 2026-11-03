'use strict';
// Music for Airports / Discreet Music: 드문 음, 부드러운 음색, 서로 나누어떨어지지 않는 긴 테이프 에코, 긴 잔향
defineStyle('eno', {
  color: 'var(--c-eno)', title: { en: 'Eno ambient', ko: 'Eno 앰비언트' },
  name: 'Eno 앰비언트', short: 'Eno', scale: 'majorPenta', tonic: 65, room: 'long', reverb: 0.8, echo: 0.6, echoTimes: [3.1, 4.3],
  drone: { level: 0.55, saw: 0, sub: 0.4, bright: 0.45, wobble: 0 },
  pad: { level: 1.4, saw: 0, bright: 0.45, fade: 6, swell: 1.5, wobble: 0, wobbleRate: 0.1 },
  front: { noise: 0.12, hum: 0, band: [200, 900], crush: 0 },
  grid: null, grain: { max: 0.7, tips: 250, speed: false, mode: 'scale', amp: 0.05 },
  gap: { food: 0.9, tok: 1.1 }, humanize: 0.25, stutter: 0,
  reg: { fruit: -12, food: 0, start: -12, probe: 12, tok: -12, grain: 12, heart: -24 },
  inst: { fruit: 'epiano', food: 'epiano', start: 'epiano', probe: 'glass', tok: 'epiano', heart: 'bloom', plop: 'glass', grain: 'glass' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    epiano: { send: [0.7, 1], len: 1.6 },
    glass: { send: [0.9, 1], len: 1.4 },
    bloom: { send: [0.6, 0.4], len: 1.6 },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // 전자 피아노 (로즈): 1:1 FM 몸통 + 14배 변조의 짧은 쇠 소리(tine)
    epiano(t, f, amp, out) {
      const end = t + 4.8;
      const car = this.osc('sine', f, t, end), body = this.osc('sine', f, t, end), tine = this.osc('sine', f * 14, t, end);
      const i1 = this.ctx.createGain(), i2 = this.ctx.createGain();
      i1.gain.setValueAtTime(f * 1.2, t);
      i1.gain.exponentialRampToValueAtTime(f * 0.08, t + 2.5);
      i2.gain.setValueAtTime(f * 0.7, t);
      i2.gain.exponentialRampToValueAtTime(1, t + 0.15);
      body.connect(i1).connect(car.frequency);
      tine.connect(i2).connect(car.frequency);
      car.connect(this.filter('lowpass', 3000)).connect(this.env(t, amp * 0.8, 0.006, 4.6)).connect(out);
      return car;
    },

    // 유리: 천천히 피어나는 사인 배음
    glass(t, f, amp, out) {
      const end = t + 2.8;
      let last;
      for (const [m, a] of [[1, 1], [2, 0.35], [3, 0.12]]) {
        last = this.osc('sine', f * m, t, end);
        last.connect(this.env(t, amp * a, 0.08, 2.6)).connect(out);
      }
      return last;
    },

    // 숨: 느리게 부풀었다 가라앉는 저음 (재진입 박동)
    bloom(t, f, amp, out) {
      const end = t + 2.6, lp = this.filter('lowpass', 600);
      const g = this.env(t, amp * 0.6, 0.25, 2.3);
      lp.connect(g).connect(out);
      this.osc('sine', f * 2, t, end).connect(lp);
      this.osc('triangle', f * 1.5, t, end).connect(this.env(t, 0.25, 0.3, 2)).connect(lp);
      const o = this.osc('sine', f, t, end);
      o.connect(lp);
      return o;
    },
  },
});
