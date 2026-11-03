'use strict';
// David Bowie "Moss Garden" (Heroes, 1977, Eno와 함께): 코토 뜯는 소리와 가끔 밀어 올리는 음(오시데), 아주 느리게 부푸는 신스 패드, 일본 음계
defineStyle('moss', {
  color: '#5f8f62', title: { en: 'Moss Garden (David Bowie)', ko: 'Moss Garden (David Bowie)' },
  name: 'Moss Garden', short: 'Moss', scale: 'inScale', tonic: 62, room: 'long', reverb: 0.75, echo: 0.4, echoTimes: [1.7, 2.3],
  drone: { level: 0.8, saw: 0.15, sub: 0.7, bright: 0.5, wobble: 3 },
  pad: { level: 1.3, saw: 0.35, bright: 0.5, fade: 8, swell: 1, wobble: 4, wobbleRate: 0.07 },
  front: { noise: 0.2, hum: 0.3, band: [150, 700], crush: 0 },
  grid: null, grain: { max: 0.8, tips: 200, speed: false, mode: 'scale', amp: 0.08 },
  gap: { food: 0.7, tok: 0.8 }, humanize: 0.3, stutter: 0,
  reg: { fruit: -12, food: 0, start: -12, probe: 12, tok: -12, grain: 0, heart: -24 },
  inst: { fruit: 'koto', food: 'koto', start: 'koto', probe: 'koto', tok: 'koto', heart: 'bloom', plop: 'koto', grain: 'koto' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    koto: { send: [0.7, 0.8], len: 1.2 },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // 코토: 뜯는 순간 밝았다가 금방 어두워지는 현. 셋 중 하나는 뜯은 뒤 줄을 눌러 반음 밀어 올린다(오시데)
    koto(t, f, amp, out) {
      const end = t + 1.9, o = this.osc('sawtooth', f, t, end), lp = this.filter('lowpass', 4200, 2);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.4);
      if (Math.random() < 0.33) {
        o.frequency.setValueAtTime(f, t + 0.22);
        o.frequency.linearRampToValueAtTime(f * 1.06, t + 0.4);
      }
      o.connect(lp).connect(this.env(t, amp * 0.9, 0.002, 1.8)).connect(out);
      this.osc('triangle', f * 2, t, t + 0.3).connect(this.env(t, amp * 0.25, 0.001, 0.2)).connect(out);
      return o;
    },
  },
});
