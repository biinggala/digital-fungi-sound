'use strict';
// 90년대 테크노 (디트로이트 · 베를린, 1990~1999): 130 BPM 4박 909 킥, 뒷박 열린 하이햇, 손뼉, 마이너 9화음 스탭(디트로이트), 303 애시드(Plastikman),
// 점8분 · 4분 덥 에코와 어두운 화음 잔향(Basic Channel). 킥은 '모터'다: 파면이 어딘가를 지나가는 동안만 매 박에 뛰고, 파동이 끝나면 브레이크다운.
// 재진입처럼 스스로 도는 파동이 생기면 그루브가 끝나지 않는다
defineStyle('techno', {
  color: '#5b7be6', title: { en: '90s Techno · Detroit / Berlin', ko: '90년대 테크노 (디트로이트 · 베를린)' },
  name: '90년대 테크노', short: 'Techno', scale: 'aeolian', tonic: 57, room: 'short', reverb: 0.35, echo: 0.45, echoTimes: [0.346, 0.462],
  drone: { level: 0.75, saw: 0.6, sub: 1.3, bright: 0.45, wobble: 0 },
  pad: { level: 0.75, saw: 0.7, bright: 0.5, fade: 2, swell: 1.2, wobble: 3, wobbleRate: 0.25 },
  front: { noise: 0.5, hum: 0, band: [1500, 8000], crush: 0.3 },
  grid: { bpm: 130, div: 4 }, grain: { max: 0.9, tips: 40, mode: 'offbeat' },
  motor: { every: 4, hold: 0.6 },
  gap: { food: 0.2, tok: 0.1 }, humanize: 0, stutter: 0,
  reg: { fruit: 0, food: -12, start: 0, probe: 12, tok: 0, grain: 0, heart: -24 },
  inst: { fruit: 'stab', food: 'acid', start: 'stab', probe: 'rim', tok: 'clap', heart: 'kick909', plop: 'rim', grain: 'metalHat' },
  // 이 스타일이 만든 악기: send [잔향, 에코], unpitched (MIDI는 채널 고정 음), len (MIDI 음 길이, 초), analog (아날로그 녹음 버스)
  voices: {
    stab: { send: [0.35, 0.9], len: 0.3 },
    metalHat: { send: [0.05, 0.15], unpitched: true },
    clap: { send: [0.35, 0.3], unpitched: true },
    rim: { send: [0.2, 0.6], unpitched: true },
  },
  // 악기는 (시각, 주파수, 세기, 출력, 옵션)을 받아 소리를 걸고, 가장 늦게 끝나는 소스를 돌려준다. this는 MyceliumSound
  instruments: {
    // 화음 스탭: 신스의 코드 메모리처럼 같은 마이너 9화음(0 3 7 10 14)을 근음만 바꿔 평행 이동. 톱니파 → 금방 닫히는 저역 필터
    stab(t, f, amp, out) {
      const end = t + 0.45, lp = this.filter('lowpass', 3200, 2.5), sum = this.ctx.createGain();
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
      sum.gain.value = 0.3;
      let last;
      for (const st of [0, 3, 7, 10, 14]) {
        last = this.osc('sawtooth', f * Math.pow(2, st / 12), t, end);
        last.detune.value = (Math.random() - 0.5) * 12;
        last.connect(sum);
      }
      sum.connect(lp).connect(this.env(t, amp, 0.002, 0.38)).connect(out);
      return last;
    },

    // 금속 하이햇 (TR-808 방식): 서로 맞지 않는 여섯 사각파를 더해 높은 대역만. opt.open이면 길게(열린 햇)
    metalHat(t, f, amp, out, { open } = {}) {
      const dur = open ? 0.22 : 0.035, end = t + dur + 0.02, sum = this.ctx.createGain();
      sum.gain.value = 0.4;
      let last;
      for (const fr of [205.3, 304.4, 369.6, 522.7, 540, 800]) { last = this.osc('square', fr, t, end); last.connect(sum); }
      sum.connect(this.filter('bandpass', 10000, 1)).connect(this.filter('highpass', 7000))
        .connect(this.env(t, amp * 1.6, 0.0008, dur)).connect(out);
      return last;
    },

    // 손뼉 (909): 10 ms 간격의 짧은 잡음 셋 + 뒤따르는 꼬리, 1.1 kHz 언저리 대역
    clap(t, f, amp, out) {
      const bp = this.filter('bandpass', 1100, 1.2), g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) {
        g.gain.setValueAtTime(amp * 1.8, t + k * 0.01);
        g.gain.exponentialRampToValueAtTime(amp * 0.3, t + k * 0.01 + 0.009);
      }
      g.gain.setValueAtTime(amp * 1.2, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2);
      const n = this.noiseHit(t, 0.22);
      n.connect(bp).connect(g).connect(out);
      return n;
    },

    // 림샷 (909): 두 삼각파의 아주 짧은 딱
    rim(t, f, amp, out) {
      const o = this.osc('triangle', 1667, t, t + 0.05);
      o.connect(this.filter('highpass', 400)).connect(this.env(t, amp * 0.9, 0.0005, 0.03)).connect(out);
      this.osc('triangle', 455, t, t + 0.05).connect(this.env(t, amp * 0.6, 0.0005, 0.025)).connect(out);
      return o;
    },
  },
});
