'use strict';
// 식물 음악: 리디안, 칼림바 아르페지오(성장), 새소리(먹이 발견), 물방울, 따뜻한 코러스 패드, 느린 템포. 드론은 거의 없다
defineStyle('greenhouse', {
  color: 'var(--c-green)', title: { en: 'Green-House', ko: 'Green-House' },
  name: 'Green-House', short: 'Green', scale: 'lydian', tonic: 64, room: 'long', reverb: 0.6, echo: 0.35, echoTimes: [0.536, 0.714],
  drone: { level: 0.25, saw: 0, sub: 0, bright: 0.7, wobble: 6 },
  pad: { level: 1.1, saw: 0, bright: 0.8, fade: 3, swell: 0.6, wobble: 8, wobbleRate: 0.8 },
  front: { noise: 0.45, hum: 0, band: [400, 1400], crush: 0 },
  grid: { bpm: 84, div: 2 }, grain: { max: 0.85, tips: 40, mode: 'arp', amp: 0.12 },
  gap: { food: 0.4, tok: 0.3 }, humanize: 0, stutter: 0,
  reg: { fruit: 0, food: 12, start: -12, probe: 12, tok: 0, grain: 0, heart: -24 },
  inst: { fruit: 'kalimba', food: 'chirp', start: 'marimba', probe: 'drip', tok: 'marimba', heart: 'softKick', plop: 'drip', grain: 'kalimba' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    kalimba: { send: [0.5, 0.7], len: 0.8 },
    marimba: { send: [0.45, 0.5] },
    chirp: { send: [0.6, 0.6] },
    drip: { send: [0.6, 0.8] },
    softKick: { send: [0.2, 0], unpitched: true },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // 칼림바: 맑은 기음 + 높은 쇠 배음이 금방 사라짐
    kalimba(t, f, amp, out) {
      const o = this.osc('sine', f, t, t + 1.5);
      o.connect(this.env(t, amp, 0.002, 1.4)).connect(out);
      this.osc('sine', f * 1.002, t, t + 1.5).connect(this.env(t, amp * 0.4, 0.002, 1.2)).connect(out);
      this.osc('sine', f * 5.9, t, t + 0.2).connect(this.env(t, amp * 0.3, 0.001, 0.12)).connect(out);
      return o;
    },

    // 마림바: 기음 + 4배 배음(나무 건반 조율)
    marimba(t, f, amp, out) {
      const o = this.osc('sine', f, t, t + 1);
      o.connect(this.env(t, amp * 1.4, 0.002, 0.9)).connect(out);
      this.osc('sine', f * 4, t, t + 0.15).connect(this.env(t, amp * 0.3, 0.001, 0.08)).connect(out);
      return o;
    },

    // 새소리: 위로 튀는 짧은 지저귐 두세 번
    chirp(t, f, amp, out) {
      const n = 2 + ((Math.random() * 2) | 0);
      let o;
      for (let k = 0; k < n; k++) {
        const s = t + k * (0.09 + Math.random() * 0.05);
        o = this.osc('sine', f * 2, s, s + 0.12);
        o.frequency.setValueAtTime(f * 2, s);
        o.frequency.exponentialRampToValueAtTime(f * 3.3, s + 0.05);
        o.frequency.exponentialRampToValueAtTime(f * 2.4, s + 0.1);
        o.connect(this.env(s, amp * 0.5, 0.004, 0.09)).connect(out);
      }
      return o;
    },

    // 물방울: 위로 미끄러지는 짧은 사인
    drip(t, f, amp, out) {
      const o = this.osc('sine', f, t, t + 0.2);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.06);
      o.connect(this.env(t, amp, 0.002, 0.14)).connect(out);
      return o;
    },

    // 흙 속 심장: 부드럽고 둥근 킥
    softKick(t, f, amp, out) {
      const o = this.osc('sine', 1, t, t + 0.6);
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.15);
      o.connect(this.filter('lowpass', 300)).connect(this.env(t, amp * 0.8, 0.01, 0.45)).connect(out);
      return o;
    },
  },
});
