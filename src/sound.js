'use strict';
// 소리 — 균사체의 상태와 사건을 Web Audio로 들려준다 (모델은 mycelium.js, 화면은 main.js)
//
// 노드 수만 개를 소리 수만 개로 만들지 않는다. 프레임마다 네트워크를 한 번 훑어 숫자 몇 개(특징)로 모으고,
//   지속음 (드론 · 화음 · 파면)  → 특징으로 파라미터만 부드럽게 움직이고
//   사건음 (먹이 발견 · 파동 시작 · 전극 · 박동 · 성장) → 동시 발음 수 상한 안에서만 낸다.
// 무엇을 듣는지(특징 · 사건)는 고정이고, 어떻게 들리는지는 채널마다 따로 고른다:
// 채널 하나 = 소리 요소 하나 (성장, 먹이 발견, …). 채널의 스타일 손잡이는 STYLE_ORDER 순으로 이어진 선 위의 위치이고,
// 두 스타일 사이에 두면 두 악기를 같은 사건에 함께 (동일 파워로 나눠) 울린다. 모든 채널을 한쪽 끝에 두면 그 스타일 하나가 된다.

const SCALES = {
  minorPenta: { name: '단조 5음계', steps: [0, 3, 5, 7, 10] },
  majorPenta: { name: '장조 5음계', steps: [0, 2, 4, 7, 9] },
  lydian: { name: '리디안', steps: [0, 2, 4, 6, 7, 9, 11] },
  dorian: { name: '도리안', steps: [0, 2, 3, 5, 7, 9, 10] },
  wholeTone: { name: '온음 음계', steps: [0, 2, 4, 6, 8, 10] },
  slendro: { name: '슬렌드로 (5평균율)', steps: [0, 2.4, 4.8, 7.2, 9.6] },
  inScale: { name: '인 음계 (미야코부시)', steps: [0, 1, 5, 7, 8] },
  aeolian: { name: '자연 단음계', steps: [0, 2, 3, 5, 7, 8, 10] },
  chromatic: { name: '반음계', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

// 화음 종류: 근음에서 반음. 화음 모드에서는 이 구성음이 음계 자리를 대신한다 (옥타브 안으로 접어서)
const CHORDS = [
  ['maj', [0, 4, 7]], ['min', [0, 3, 7]], ['dom7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['min7', [0, 3, 7, 10]], ['min9', [0, 3, 7, 10, 14]],
  ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['add9', [0, 4, 7, 14]], ['6/9', [0, 4, 7, 9, 14]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]],
  ['quartal', [0, 5, 10, 15]], ['5th', [0, 7]],
];
const CHORD = Object.fromEntries(CHORDS);
const isMinor = (q) => CHORD[q].includes(3) && !CHORD[q].includes(4);
// 균사체가 진행시키는 화음: 고른 화음을 I로 두는 네 마디 진행. 장조 계열 I – vi – IV – V7, 단조 계열 i – VI – iv – V7
function progression(root, qual) {
  const r = (d) => (root + d) % 12;
  return isMinor(qual)
    ? [[root, qual], [r(8), 'maj7'], [r(5), 'min7'], [r(7), 'dom7']]
    : [[root, qual], [r(9), 'min7'], [r(5), 'maj7'], [r(7), 'dom7']];
}

// reg: 사건별 음역 (으뜸음 기준 반음). inst: 사건 → 악기. gap: 같은 사건 사이 최소 간격(초).
// grid: 있으면 이 스타일로 연주되는 사건을 그 박자 격자에 맞춰 낸다 (스타일마다 따로 도는 시계 → 섞으면 폴리리듬).
//   성장음은 격자 칸마다 확률적으로 친다. bpm 'flow'는 양분 흐름으로 빨라진다.
// grain: 성장음 밀도 = max · (1 − e^(−팁 수/tips)). 격자 스타일은 칸이 적으니 팁 몇십 개로도 꽉 차게.
//   mode는 음높이 고르는 법: 'noise'(무작위 고역) · 'scale'(음계 무작위, amp) · 'arp'(지금 화음 아르페지오, amp) · 'hat'(16분 강세) · 'offbeat'(뒷박 열린 햇)
// motor: { every, hold } 있으면 파면이 지나가는 동안 격자 every칸마다 재진입 채널 악기를 친다 (hold초까지 이어서).
// color: ds.css의 범주색 토큰 (var(--c-…)). 새 스타일은 토큰 하나를 ds.css에 더한다. title { en, ko }: 화면 이름. 프리셋을 누르면 scale · tonic · reverb · echo도 이 값으로 바뀐다.
// 스타일은 src/styles/*.js 파일 하나에 하나씩 defineStyle()로 등록된다 (index.html의 순서 = 손잡이 왼쪽 → 오른쪽, 이웃끼리 섞인다).
// 스타일이 만든 악기는 이름으로 등록되어 다른 스타일도 빌려 쓸 수 있다
const STYLES = {}, STYLE_ORDER = [], VOICES = {};
const STYLE_FIELDS = ['name', 'short', 'color', 'title', 'scale', 'tonic', 'room', 'reverb', 'echo', 'echoTimes', 'drone', 'pad', 'front', 'grain', 'gap', 'reg', 'inst'];
function defineStyle(key, def) {
  const { instruments = {}, voices = {}, ...st } = def;
  if (STYLES[key]) throw new Error(`style '${key}' is defined twice`);
  st.key = key;
  STYLES[key] = st;
  STYLE_ORDER.push(key);
  for (const [name, fn] of Object.entries(instruments)) {
    if (VOICES[name]) throw new Error(`instrument '${name}' (style '${key}') is already defined`);
    MyceliumSound.prototype[name] = fn;
    VOICES[name] = { send: [0.3, 0.3], unpitched: false, len: 0.25, analog: false, ...voices[name] };
  }
}
// 등록이 끝난 뒤 한 번: 빠진 값 · 없는 악기 · 없는 음계를 처음에 알려준다 (소리를 낼 때 조용히 깨지지 않게)
function checkStyles() {
  const bad = [];
  for (const k of STYLE_ORDER) {
    const st = STYLES[k];
    for (const f of STYLE_FIELDS) if (st[f] === undefined) bad.push(`${k}: missing ${f}`);
    if (st.scale && !SCALES[st.scale]) bad.push(`${k}: unknown scale ${st.scale}`);
    for (const [ev, name] of Object.entries(st.inst || {})) if (!VOICES[name]) bad.push(`${k}: inst.${ev} '${name}' is not defined`);
  }
  if (STYLE_ORDER.length < 2) bad.push('need at least two styles');
  if (bad.length) throw new Error('sound styles: ' + bad.join('; '));
}

// 믹서 채널: 소리 요소 하나씩. vol이 없는 채널(공간)은 스타일만 고른다
const CHANNELS = [
  { key: 'grow', name: '성장 (팁)' },
  { key: 'food', name: '먹이 발견' },
  { key: 'start', name: '파동 시작' },
  { key: 'tok', name: '스파이크' },
  { key: 'heart', name: '재진입 박동' },
  { key: 'probe', name: '기록 전극' },
  { key: 'drone', name: '드론 (우웅)' },
  { key: 'pad', name: '화음 · 파면' },
  { key: 'fruit', name: '버섯' },
  { key: 'space', name: '공간', noVol: true },
];

// MIDI 출력: 믹서 채널마다 MIDI 채널 하나 (0부터 → MIDI 1 ~ 9). 공간 채널은 음이 없다
const MIDI_CH = { grow: 0, food: 1, start: 2, tok: 3, heart: 4, probe: 5, drone: 6, pad: 7, fruit: 8 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAX_VOICES = 32;                                   // 사건음 전체 동시 발음 상한
const LIMIT = { bell: 6, stim: 4, pluck: 4, plop: 2, pulse: 8, heart: 6, grain: 10, fruit: 16 };  // 종류별 상한: 한 종류가 나머지를 굶기지 않게
const LISTEN_SLOTS = 16;     // 숨은 전극 수: 굵은 줄기 위 무작위 지점. 죽을 때까지 같은 자리를 듣는다
const RE_PERIOD = 400;       // tick: 한 지점이 이보다 짧은 주기로 규칙적으로(변동계수 < RE_CV) 다시 울리면 재진입
const RE_CV = 0.3;
const HEARTS = 2;            // 재진입 지점 중 가장 규칙적인 두 곳만 심장 박동을 친다 (나머지는 '톡'만)
const SHAPE_EVERY = 15;      // 프레임: 모양(크기·굵기·흐름·고리) 특징은 천천히 변하므로 가끔만 잰다
const DRONE_STEPS = 8;
const MOTOR_FRONT = 5;       // 파면 세그먼트가 이보다 많으면 '파동이 지나가는 중' (모터 스타일의 킥이 돈다)       // 드론이 내려갈 수 있는 음계 칸 수

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const noteName = (m) => { const r = Math.round(m); return NOTE_NAMES[r % 12] + (Math.floor(r / 12) - 1); };

// 손잡이 위치(0 ~ 스타일 수 − 1) → 이웃한 두 스타일의 무게 [[스타일, 무게], …]
function styleWeights(pos) {
  const p = clamp(pos, 0, STYLE_ORDER.length - 1), i = Math.min(Math.floor(p), STYLE_ORDER.length - 2), f = p - i;
  return [[STYLES[STYLE_ORDER[i]], 1 - f], [STYLES[STYLE_ORDER[i + 1]], f]].filter(([, w]) => w > 0.001);
}

class MyceliumSound {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.muted = false;
    this.volume = 0.7;
    this.sim = null;
    this.active = 0;       // 지금 울리고 있는 사건음 수
    this.activeBy = { bell: 0, stim: 0, pluck: 0, plop: 0, pulse: 0, heart: 0, grain: 0, fruit: 0 };
    this.lastFoodNote = 0;
    this.lastTok = 0;
    this.foodHeat = 0;     // 최근 발견 횟수 (3초 반감) — 발견이 쏟아질 땐 작게, 드문 발견은 크게
    this.lastNow = 0;
    this.frontAt = -1e9;   // 파면이 마지막으로 보인 시각
    this.frame = 0;
    this.arp = 0;
    this.bpm = 120;
    this.clocks = {};      // 격자 스타일마다 따로 도는 시계 { next: 다음 칸 시각, idx }
    this.grainAcc = {};
    for (const k of STYLE_ORDER) { if (STYLES[k].grid) this.clocks[k] = { next: 0, idx: 0 }; this.grainAcc[k] = 0; }
    checkStyles();
    this.pos = {};         // 채널 → 스타일 손잡이 위치
    this.vol = {};         // 채널 → 음량 (0 ~ 1.5)
    this.w = {};           // 채널 → styleWeights(pos)
    for (const ch of CHANNELS) this.vol[ch.key] = 1;
    this.info = { drone: '-', pad: 0, grains: 0, front: 0, reentry: 0, voices: 0, bpm: [], chord: '' };
    // 화음: mode 'scale' = 화음 없이 음계 그대로 (예전 소리) · 'hold' = 고른 화음에 고정 · 'network' = 균사체가 자라며 진행
    this.chord = { mode: 'scale', root: 7, qual: 'min7' };
    this.prog = 0;         // network 모드에서 진행표의 몇 번째 화음인지
    // 패치(src/patch.js)가 넣는 모듈레이션: 손잡이 값은 그대로 두고 그 위에 얹는다
    this.mod = { cutoffOpen: 1, tempo: 0, density: 0, reverb: 0, echo: 0, pitch: 0 };
    this.modDeg = 0;       // pitch → 음계 칸 (정수)
    this.flowLv = 0;
    this.preset('lab');
  }

  // ---------- 설정 ----------

  // 프리셋: 모든 채널을 그 스타일 자리에 두고 음계 · 으뜸음 · 잔향 · 에코도 그 스타일 값으로
  preset(key) {
    const st = STYLES[key], at = STYLE_ORDER.indexOf(key);
    for (const ch of CHANNELS) this.setMix(ch.key, at, false);
    this.scaleKey = st.scale;
    this.tonic = st.tonic;
    this.reverbAmt = st.reverb;
    this.echoAmt = st.echo;
    this.applyAll();
  }

  setMix(ch, pos, apply = true) {
    this.pos[ch] = pos;
    this.w[ch] = styleWeights(pos);
    if (apply) this.applyAll();
  }
  setVol(ch, v) { this.vol[ch] = v; if (ch === 'drone' || ch === 'pad') this.applyAll(); }
  setScale(key) { this.scaleKey = key; this.droneStep = -1; this.applyAll(); }
  setTonic(m) { this.tonic = m; this.droneStep = -1; this.applyAll(); }
  setReverb(v) { this.reverbAmt = v; this.applyMix(); }
  setEcho(v) { this.echoAmt = v; this.applyMix(); }

  // 채널의 무게로 스타일 값을 섞는다 (선형)
  blend(ch, fn) { let v = 0; for (const [st, w] of this.w[ch]) v += w * fn(st); return v; }
  // 채널 이름 표시: 순수하면 스타일 이름, 섞였으면 우세한 쪽과 비율
  mixLabel(ch) {
    const ws = this.w[ch];
    if (ws.length === 1 || ws[0][1] > 0.97) return ws[0][0].short;
    if (ws[1][1] > 0.97) return ws[1][0].short;
    const [a, b] = ws[0][1] >= ws[1][1] ? ws : [ws[1], ws[0]];
    return `${a[0].short} ${Math.round(a[1] * 100)}·${b[0].short.slice(0, 2)}`;
  }

  // ---------- 화음 ----------
  get chordOn() { return this.chord.mode !== 'scale'; }
  // 지금 울리는 화음 [근음 pc, 종류]
  get current() {
    const { mode, root, qual } = this.chord;
    if (mode === 'network') { const p = progression(root, qual); return p[this.prog % p.length]; }
    return [root, qual];
  }
  get progressionList() { return progression(this.chord.root, this.chord.qual); }
  // 화음 근음의 MIDI: 스타일 으뜸음과 같은 음역에 (−6 ~ +5 반음 안)
  get base() {
    if (!this.chordOn) return this.tonic;
    const [r] = this.current;
    return this.tonic + (((r - (this.tonic % 12)) % 12 + 18) % 12) - 6;
  }
  setChord(c) {
    const was = this.chordOn, home = `${this.chord.root}${this.chord.qual}`;
    Object.assign(this.chord, c);
    if (`${this.chord.root}${this.chord.qual}` !== home || !was) this.prog = 0;
    this.chordChanged();
  }
  // 진행 한 칸 (network 모드: 군체가 커져 드론 칸이 바뀔 때, 버섯이 올라올 때)
  advance() {
    if (this.chord.mode !== 'network') return;
    this.prog = (this.prog + 1) % this.progressionList.length;
    this.chordChanged();
  }
  chordChanged() {
    const [r, q] = this.current;
    this.info.chord = this.chordOn ? `${NOTE_NAMES[r]} ${q}` : '';
    if (this.ctx && this.droneStep >= 0) this.retune();
  }

  // 음계: 화음 모드면 지금 화음의 구성음 (옥타브 안으로 접고 정렬), 아니면 고른 음계
  get scale() {
    if (!this.chordOn) return SCALES[this.scaleKey].steps;
    const [, q] = this.current;
    return [...new Set(CHORD[q].map((i) => i % 12))].sort((a, b) => a - b);
  }
  // 1 · 3 · 5도에 해당하는 음계 칸 (화음 모드에서는 구성음 0 · 1 · 2번째)
  get triad() { return this.chordOn ? [0, 1, 2] : [0, 2, 4]; }
  // 드론 칸: 음계 모드에서는 군체가 클수록 아래로 걷고, 화음 모드에서는 늘 근음 (화음이 바뀌는 것은 진행이 맡는다)
  get rd() { return this.chordOn ? 0 : -Math.max(0, this.droneStep); }

  // 기준음(으뜸음 또는 화음 근음) + reg 반음에서 시작해 음계 k번째 칸 (음수면 아래로). 패치의 pitch가 칸을 옮긴다
  note(reg, k) {
    const s = this.scale, n = s.length;
    k += this.modDeg;
    return this.base + reg + 12 * Math.floor(k / n) + s[((k % n) + n) % n];
  }
  // 음계에서 완전5도(7반음)에 가장 가까운 칸
  get fifth() {
    const s = this.scale;
    let best = 0;
    for (let k = 1; k < s.length; k++) if (Math.abs(s[k] - 7) < Math.abs(s[best] - 7)) best = k;
    return best;
  }
  // 굵은 고리가 늘수록 이 순서로 쌓이는 화음 (드론 위 음계 칸): 옥타브, 옥타브+5도, 2옥타브, 그 위 2·3칸, 2옥타브+5도
  get padDegrees() {
    const n = this.scale.length, f = this.fifth;
    return [n, n + f, 2 * n, 2 * n + 1, 2 * n + 2, 2 * n + f];
  }

  // 브라우저는 사용자 동작(클릭) 안에서만 소리를 허락한다
  async start() {
    this.unmuteIOS();
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.enabled = true;
    this.applyGain();
  }

  // iOS는 Web Audio를 '벨소리' 채널로 내보내서 무음 스위치가 켜져 있으면 스피커가 침묵한다 (이어폰은 예외).
  // 오디오 세션을 '재생'으로 바꾸면 음악 앱처럼 무음 스위치를 무시한다. 신형 Safari는 audioSession API,
  // 구형은 클릭 안에서 소리 없는 <audio>를 반복 재생해 세션을 미디어 재생으로 끌어올리는 방법을 쓴다.
  unmuteIOS() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    if (this.silentEl) { this.silentEl.play().catch(() => {}); return; }
    const sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    const el = this.silentEl = document.createElement('audio');
    el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    el.loop = true; el.setAttribute('playsinline', ''); el.setAttribute('x-webkit-airplay', 'deny');
    el.play().catch(() => {});
  }

  setVolume(v) { this.volume = v; this.applyGain(); }

  // 녹화용 소리: 스피커로 가는 것과 같은 최종 출력(컴프레서 뒤)을 MediaStream으로. 볼륨 · 음소거도 그대로 따른다
  recStream() {
    if (!this.ctx) return null;
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.comp.connect(this.recDest);
    }
    return this.recDest.stream;
  }
  setMuted(m) { this.muted = m; this.applyGain(); }
  get audible() { return this.enabled && !this.muted && this.ctx.state === 'running'; }

  applyGain() {
    if (!this.ctx) return;
    const g = this.enabled && !this.muted ? this.volume * 0.9 : 0;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
  }

  // 잔향 · 에코: 손잡이 값 + 패치
  get reverbNow() { return clamp(this.reverbAmt + this.mod.reverb, 0, 1); }
  get echoNow() { return clamp(this.echoAmt + this.mod.echo, 0, 1); }
  applyMix() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, e = this.echoNow;
    this.wet.gain.setTargetAtTime(this.reverbNow, now, 0.3);
    this.echoIn.gain.setTargetAtTime(e * 0.9, now, 0.3);
    for (const fb of this.echoFb) fb.gain.setTargetAtTime(0.2 + 0.5 * e, now, 0.3);
  }
  // 패치 결과를 받는다 (main.js가 통계를 갱신할 때마다)
  setMod(o) {
    Object.assign(this.mod, o);
    const deg = Math.round(clamp(this.mod.pitch, -1, 1) * this.scale.length);
    if (deg !== this.modDeg) { this.modDeg = deg; if (this.ctx && this.droneStep >= 0) this.retune(); }
    if (!this.ctx) return;
    // 마스터 저역 필터: 다 열림 20 kHz, 다 닫힘 약 160 Hz (일곱 옥타브)
    this.lp.frequency.setTargetAtTime(20000 * Math.pow(2, -7 * (1 - clamp(this.mod.cutoffOpen, 0, 1))), this.ctx.currentTime, 0.25);
    this.applyMix();
  }

  // 지속음(드론 · 화음 · 파면)과 공간을 지금 채널 위치로 맞춘다
  applyAll() {
    // 지속음 채널의 섞인 값 (measureShape · listenElectric이 매번 쓴다)
    const d = (fn) => this.blend('drone', fn), p = (fn) => this.blend('pad', fn);
    this.toneD = {
      level: d((s) => s.drone.level) * this.vol.drone, saw: d((s) => s.drone.saw), sub: d((s) => s.drone.sub),
      bright: d((s) => s.drone.bright), wobble: d((s) => s.drone.wobble),
    };
    this.toneP = {
      level: p((s) => s.pad.level) * this.vol.pad, saw: p((s) => s.pad.saw), bright: p((s) => s.pad.bright),
      fade: p((s) => s.pad.fade), swell: p((s) => s.pad.swell), wobble: p((s) => s.pad.wobble), wobbleRate: p((s) => s.pad.wobbleRate),
      noise: p((s) => s.front.noise) * this.vol.pad, hum: p((s) => s.front.hum) * this.vol.pad,
      lo: p((s) => s.front.band[0]), hi: p((s) => s.front.band[1]), crush: p((s) => s.front.crush),
    };
    if (!this.ctx) return;
    const now = this.ctx.currentTime, sp = (fn) => this.blend('space', fn);
    this.shortIn.gain.setTargetAtTime(sp((s) => (s.room === 'short' ? 1 : 0)), now, 0.5);
    this.longIn.gain.setTargetAtTime(sp((s) => (s.room === 'long' ? 1 : 0)), now, 0.5);
    this.echoDelay.forEach((dl, k) => dl.delayTime.setTargetAtTime(sp((s) => s.echoTimes[k]), now, 0.6));  // 테이프처럼 음이 미끄러진다
    this.wobble.frequency.setTargetAtTime(this.toneP.wobbleRate, now, 0.5);
    this.padWobble.gain.setTargetAtTime(this.toneP.wobble, now, 0.5);
    this.droneWobble.gain.setTargetAtTime(this.toneD.wobble, now, 0.5);
    this.frontClean.gain.setTargetAtTime(1 - this.toneP.crush, now, 0.2);
    this.frontCrush.gain.setTargetAtTime(this.toneP.crush, now, 0.2);
    this.subGain.gain.setTargetAtTime(this.toneD.sub, now, 0.5);
    // 아날로그 질감: 드론 · 화음 채널의 아날로그 스타일 무게만큼 그 길로, 히스 · 험은 어느 채널이든 가장 많이 쓰는 만큼
    const wA = (ch) => this.blend(ch, (st) => (st.analog ? 1 : 0));
    const dA = wA('drone'), pA = wA('pad');
    this.droneClean.gain.setTargetAtTime(1 - dA, now, 0.3); this.droneAnalog.gain.setTargetAtTime(dA, now, 0.3);
    this.padClean.gain.setTargetAtTime(1 - pA, now, 0.3); this.padAnalog.gain.setTargetAtTime(pA, now, 0.3);
    const amt = Math.max(...CHANNELS.filter((c) => c.noVol || this.vol[c.key] > 0).map((c) => wA(c.key)));
    this.hissGain.gain.setTargetAtTime(0.018 * amt, now, 0.4);
    this.humGainA.gain.setTargetAtTime(0.0035 * amt, now, 0.4);
    this.applyMix();
    if (this.sim) this.measureShape(this.sim);
  }

  // ---------- 오디오 그래프 ----------

  build() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.lp = ctx.createBiquadFilter();   // 패치의 cutoff 목적지
    this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.7;
    this.master.connect(this.lp).connect(comp).connect(ctx.destination);
    this.comp = comp;
    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    // 채널마다 실제 소리를 엿듣는 분석기 (믹서가 소리에 반응하도록). 소리 없는 싱크에 이어 둬야 브라우저가 처리한다
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    this.taps = {};
    for (const ch of CHANNELS) {
      const a = ctx.createAnalyser();
      a.fftSize = 512;
      a.connect(sink);
      this.taps[ch.key] = a;
    }
    this.tapBuf = new Float32Array(512);
    this.tapCh = null;

    // 잔향: 짧은 방 / 긴 홀 두 개. 공간 채널이 섞는다
    this.verb = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.connect(this.master);
    this.wet.connect(this.taps.space);
    this.shortIn = ctx.createGain();
    this.longIn = ctx.createGain();
    for (const [input, dur, decay] of [[this.shortIn, 3.2, 2.6], [this.longIn, 7, 3.2]]) {
      const cv = ctx.createConvolver();
      cv.buffer = this.impulse(dur, decay);
      this.verb.connect(input).connect(cv).connect(this.wet);
    }

    // 테이프 에코: 좌우가 서로를 먹이는 두 지연선. 고리 안에서 고역이 깎이고(테이프), 느린 흔들림(wow)이 있다
    this.echoIn = ctx.createGain();
    const merge = ctx.createChannelMerger(2), echoOut = ctx.createGain();
    echoOut.gain.value = 0.8;
    this.echoDelay = [ctx.createDelay(6), ctx.createDelay(6)];
    this.echoFb = [ctx.createGain(), ctx.createGain()];
    this.echoDelay.forEach((dl, k) => {
      dl.delayTime.value = 0.5;
      const lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2600;
      hp.type = 'highpass'; hp.frequency.value = 140;
      dl.connect(lp).connect(hp).connect(this.echoFb[k]).connect(this.echoDelay[1 - k]);  // 핑퐁
      dl.connect(merge, 0, k);
      const wow = ctx.createOscillator(), wd = ctx.createGain();
      wow.frequency.value = 0.13 + 0.05 * k; wd.gain.value = 0.004;
      wow.connect(wd).connect(dl.delayTime); wow.start();
    });
    this.echoIn.connect(this.echoDelay[0]);
    merge.connect(echoOut);
    echoOut.connect(this.master);
    echoOut.connect(this.taps.space);
    const echoVerb = ctx.createGain();
    echoVerb.gain.value = 0.3;
    echoOut.connect(echoVerb).connect(this.verb);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.tanhCurve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(3 * (i / 511.5 - 1)));
    this.crushCurve = Float32Array.from({ length: 1024 }, (_, i) => Math.round((i / 511.5 - 1) * 6) / 6);  // 비트 깎기

    // 흔들림 LFO: 화음 · 드론 음높이를 몇 센트 흔든다 (Green-House 코러스, Aphex 테이프 워블). 깊이는 채널마다
    this.wobble = ctx.createOscillator();
    this.padWobble = ctx.createGain();
    this.droneWobble = ctx.createGain();
    this.padWobble.gain.value = this.droneWobble.gain.value = 0;
    this.wobble.connect(this.padWobble);
    this.wobble.connect(this.droneWobble);
    this.wobble.start();

    // 아날로그 녹음 버스 (Sun Ra 1963 클럽 녹음의 질감): 진공관 · 테이프 포화 → 좁은 대역 → 와우 · 플러터 → 스프링 리버브 + 방 잔향
    // 버스 자체는 늘 켜져 있고, 들어오는 소리가 없으면 조용하다. 히스 · 험은 Sun Ra를 쓰는 만큼(analogAmt) 섞인다
    this.analogIn = ctx.createGain();
    const sat = ctx.createWaveShaper();
    // 살짝 비대칭인 tanh → 짝수 배음(진공관 같은 따뜻함)
    sat.curve = Float32Array.from({ length: 2048 }, (_, i) => { const x = i / 1023.5 - 1; return Math.tanh(2.2 * x + 0.15 * x * x) / Math.tanh(2.2); });
    sat.oversample = '2x';
    const aHp = ctx.createBiquadFilter(), aLp = ctx.createBiquadFilter();
    aHp.type = 'highpass'; aHp.frequency.value = 90;
    aLp.type = 'lowpass'; aLp.frequency.value = 5500; aLp.Q.value = 0.5;
    const wf = ctx.createDelay(0.05);
    wf.delayTime.value = 0.012;
    for (const [rate, depth] of [[0.55, 0.0016], [6.3, 0.00025]]) {  // 와우(느린 흔들림) · 플러터(빠른 떨림)
      const lfo = ctx.createOscillator(), d = ctx.createGain();
      lfo.frequency.value = rate; d.gain.value = depth;
      lfo.connect(d).connect(wf.delayTime); lfo.start();
    }
    const aOut = ctx.createGain();
    aOut.gain.value = 0.9;
    this.analogIn.connect(sat).connect(aHp).connect(aLp).connect(wf).connect(aOut).connect(this.dry);
    // 스프링 리버브: 짧은 지연 두 개가 대역 필터를 지나며 되먹임 → 쇠 같은 '보잉' 울림
    const springOut = ctx.createGain();
    springOut.gain.value = 0.45;
    for (const [dt, fb] of [[0.0331, 0.62], [0.0467, 0.58]]) {
      const d = ctx.createDelay(0.1), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      d.delayTime.value = dt; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8; g.gain.value = fb;
      aOut.connect(d); d.connect(bp).connect(g).connect(d); bp.connect(springOut);
    }
    springOut.connect(this.dry);
    const aVerb = ctx.createGain(), aEcho = ctx.createGain();
    aVerb.gain.value = 0.45; aEcho.gain.value = 0.25;
    aOut.connect(aVerb).connect(this.verb);
    aOut.connect(aEcho).connect(this.echoIn);
    // 테이프 히스 + 전원 험(60 Hz와 배음)
    const hs = ctx.createBufferSource(), hbp = ctx.createBiquadFilter();
    hs.buffer = this.noise; hs.loop = true;
    hbp.type = 'bandpass'; hbp.frequency.value = 4200; hbp.Q.value = 0.35;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hs.connect(hbp).connect(this.hissGain).connect(this.master);
    hs.start();
    this.humGainA = ctx.createGain();
    this.humGainA.gain.value = 0;
    for (const [hz, a] of [[60, 1], [120, 0.5], [180, 0.25]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; g.gain.value = a;
      o.connect(g).connect(this.humGainA); o.start();
    }
    this.humGainA.connect(this.master);

    // 드론 (우웅): 크기 → 음높이, 굵은 균사삭 비율 → 음색(톱니파 비중 · 공명), 전체 흐름 → 음량 · 밝기
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 200;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.taps.drone);
    // 드론 · 화음은 Sun Ra 쪽 무게만큼 아날로그 버스로 (나머지는 깨끗한 길)
    this.droneClean = ctx.createGain(); this.droneAnalog = ctx.createGain();
    this.droneGain.connect(this.droneClean); this.droneGain.connect(this.droneAnalog);
    this.out(this.droneClean, 0.25, 0);
    this.droneAnalog.connect(this.analogIn);
    this.sawGain = ctx.createGain();
    this.sawGain.gain.value = 0;
    this.sawGain.connect(this.droneFilter);
    this.subGain = ctx.createGain();
    this.subGain.connect(this.droneFilter);
    this.droneOsc = [];
    for (const [type, detune, dest] of [['sine', 0, this.droneFilter], ['sine', -1200, this.subGain],
      ['sawtooth', -7, this.sawGain], ['sawtooth', 7, this.sawGain]]) {
      const o = ctx.createOscillator();
      o.type = type; o.detune.value = detune; o.frequency.value = 147;
      o.connect(dest); o.start();
      this.droneWobble.connect(o.detune);
      this.droneOsc.push(o);
    }

    // 화음: 굵은 고리 수 → 쌓이는 음 수. 삼각파 줄과 톱니파 줄을 섞는다. 파면이 크면 부푼다(swell)
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padOut = ctx.createGain();
    this.padFilter.connect(this.padOut);
    this.padOut.connect(this.taps.pad);
    this.padClean = ctx.createGain(); this.padAnalog = ctx.createGain();
    this.padOut.connect(this.padClean); this.padOut.connect(this.padAnalog);
    this.out(this.padClean, 0.7, 0.3);
    this.padAnalog.connect(this.analogIn);
    this.pad = Array.from({ length: 6 }, (_, k) => {
      const v = {};
      for (const type of ['triangle', 'sawtooth']) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = 294;
        o.detune.value = (k % 2 ? 1 : -1) * (3 + k);   // 살짝 어긋나 맥놀이가 생기게
        this.padWobble.connect(o.detune);
        g.gain.value = 0;
        o.connect(g).connect(this.padFilter); o.start();
        v[type] = { o, g };
      }
      return v;
    });

    // 파면: 흥분이 막 일어난 세그먼트 수 → 띠 잡음 크기 · 밝기, 그 무게중심 → 좌우 위치. 깨끗한 길 / 비트 깎은 길을 섞는다
    this.frontPan = ctx.createStereoPanner();
    this.out(this.frontPan, 0.4, 0);
    this.frontPan.connect(this.taps.pad);
    const ns = ctx.createBufferSource();
    ns.buffer = this.noise; ns.loop = true;
    this.frontBand = ctx.createBiquadFilter();
    this.frontBand.type = 'bandpass'; this.frontBand.Q.value = 1.4; this.frontBand.frequency.value = 600;
    this.frontNoise = ctx.createGain();
    this.frontNoise.gain.value = 0;
    this.frontClean = ctx.createGain();
    this.frontCrush = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.crushCurve;
    ns.connect(this.frontBand);
    this.frontBand.connect(this.frontClean).connect(this.frontNoise);
    this.frontBand.connect(shaper).connect(this.frontCrush).connect(this.frontNoise);
    this.frontNoise.connect(this.frontPan);
    ns.start();
    this.hum = ctx.createOscillator();
    this.hum.type = 'sine'; this.hum.frequency.value = 588;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(this.humGain).connect(this.frontPan);
    this.hum.start();

    this.applyAll();
  }

  impulse(dur, decay) {
    const ctx = this.ctx, len = (ctx.sampleRate * dur) | 0;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // 노드를 마른 소리 + 잔향 + 테이프 에코로 보낸다. analog면 아날로그 녹음 버스로만 (그 버스가 잔향 · 에코로 보낸다)
  out(node, verb, echo, analog = false) {
    if (analog) { node.connect(this.analogIn); return; }
    node.connect(this.dry);
    for (const [amt, bus] of [[verb, this.verb], [echo, this.echoIn]]) {
      if (!(amt > 0)) continue;
      const s = this.ctx.createGain();
      s.gain.value = amt;
      node.connect(s).connect(bus);
    }
  }

  // 새 시뮬레이션(리셋)이면 추적 상태를 처음부터
  attach(sim) {
    this.sim = sim;
    this.slots = [];
    this.lastCount = sim.count;
    this.lastTrace = sim.traceIdx;
    this.lastProbeV = NaN;
    this.lastFood = sim.foodSignals;
    this.droneStep = -1;
    this.shape = { nodes: 0, thick: 0, flow: 0, loops: 0 };
  }

  pan(x) { return Number.isFinite(x) ? clamp((x / this.sim.W) * 2 - 1, -1, 1) * 0.85 : 0; }

  // ---------- 시간: 사람 손맛 / 박자 격자 ----------

  stepLen(st) {
    const g = st.grid;
    return 60 / (g.bpm === 'flow' ? this.bpm : g.bpm) / g.div / Math.pow(2, clamp(this.mod.tempo, -1, 1));   // 패치 tempo: 반 ~ 두 배
  }
  // 스타일 st로 내는 사건음의 시각: 그 스타일 시계의 다음 칸에 맞추거나, humanize만큼 흐트린다
  when(st, delay = 0.005) {
    const t = this.ctx.currentTime + delay + Math.random() * st.humanize;
    const c = this.clocks[st.key];
    if (!c || !c.next) return t;
    const s = this.stepLen(st);
    return c.next + Math.ceil((t - c.next) / s) * s;
  }

  // ---------- 프레임마다 ----------

  update(sim, paused, speed) {
    if (sim !== this.sim) this.attach(sim);
    if (!this.enabled) { sim.events.length = 0; this.lastFood = sim.foodSignals; return; }
    const ctx = this.ctx, now = ctx.currentTime;
    const dt = clamp(now - this.lastNow, 0, 0.1);
    this.lastNow = now;
    this.frame++;

    // 1) 사건: 파동이 시작된 순간
    let food = 0;
    for (const ev of sim.events) {
      if (ev.size === 0) continue;  // 불응기라 불이 안 붙은 자극
      if (ev.kind === 'food') { food++; this.onFood(ev.x, ev.y); }
      else if (ev.kind === 'fruit' || ev.kind === 'spores' || ev.kind === 'germinate') this.onFruit(ev.x, ev.y, ev.kind);
      else this.onStart(ev.x, ev.y, ev.size, ev.kind === 'user');
    }
    sim.events.length = 0;
    // 사건 목록이 넘쳐 놓친 발견도 (위치는 모르니 가운데)
    const missed = sim.foodSignals - this.lastFood - food;
    if (missed > 0 && food === 0) this.onFood(sim.W / 2, sim.H / 2);
    this.lastFood = sim.foodSignals;

    // 2) 모양 (가끔)
    if (this.frame % SHAPE_EVERY === 1) this.measureShape(sim);

    // 3) 전기: 파면, 숨은 전극의 박동, 기록 전극
    this.listenElectric(sim, now);
    this.listenProbe(sim);

    // 4) 성장 중인 팁. 격자 스타일의 시계는 성장 채널이 안 써도 계속 돈다 (다른 채널이 그 격자에 맞추므로)
    const tips = paused ? 0 : sim.tips.length;
    let perSec = 0;
    this.info.bpm = [];
    for (const k of STYLE_ORDER) {
      const st = STYLES[k];
      const w = this.weightOf('grow', st);
      const density = st.grain.max * (1 - Math.exp(-tips / st.grain.tips)) * w * Math.pow(2, 2 * clamp(this.mod.density, -1, 1));   // 패치 density: ¼ ~ 4배
      const c = this.clocks[k];
      if (c) {
        const s = this.stepLen(st);
        if (c.next < now) c.next = now + 0.05;
        while (c.next < now + 0.12) {
          if (Math.random() < density) this.onGrow(sim, st, c.next, c.idx);
          if (st.motor && c.idx % st.motor.every === 0 && now - this.frontAt < st.motor.hold) this.onMotor(sim, st, c.next);
          c.next += s;
          c.idx++;
        }
        perSec += density / s;
        if (this.uses(st)) this.info.bpm.push(Math.round(60 / s / st.grid.div));
      } else {
        const rate = density * (st.grain.speed ? Math.sqrt(speed) : 1);
        perSec += rate;
        this.grainAcc[k] += rate * dt;
        while (this.grainAcc[k] >= 1) { this.grainAcc[k]--; this.onGrow(sim, st, now + Math.random() * dt, 0); }
      }
    }
    this.info.grains = Math.round(perSec * 10) / 10;
    this.info.voices = this.active;
  }

  weightOf(ch, st) { for (const [s, w] of this.w[ch]) if (s === st) return w; return 0; }
  // 어떤 사건 채널이든 이 스타일을 쓰고 있나 (격자 템포 표시용)
  uses(st) { return ['grow', 'food', 'start', 'tok', 'heart', 'probe', 'fruit'].some((ch) => this.weightOf(ch, st) > 0.03); }

  // 채널마다 지금 소리 크기 (0 ~ 1): 분석기의 RMS를 dB로 (−60 ~ −8 dBFS → 0 ~ 1)
  levels() {
    const out = {};
    for (const ch of CHANNELS) {
      if (!this.ctx || !this.audible) { out[ch.key] = 0; continue; }
      const b = this.tapBuf;
      this.taps[ch.key].getFloatTimeDomainData(b);
      let e = 0;
      for (let i = 0; i < b.length; i++) e += b[i] * b[i];
      const db = 10 * Math.log10(e / b.length + 1e-12);
      out[ch.key] = clamp((db + 60) / 52, 0, 1);
    }
    return out;
  }

  // 드론 · 화음 · 웅 소리의 음높이를 지금 드론 칸에 맞춘다
  retune() {
    if (!this.ctx || this.droneStep < 0) return;
    const now = this.ctx.currentTime, rd = this.rd;
    const root = this.note(-12, rd);
    for (const o of this.droneOsc) o.frequency.setTargetAtTime(mtof(root), now, 1.5);
    const degs = this.padDegrees;
    this.pad.forEach((v, k) => {
      const f = mtof(this.note(-12, rd + degs[k]));
      v.triangle.o.frequency.setTargetAtTime(f, now, 1.5);
      v.sawtooth.o.frequency.setTargetAtTime(f, now, 1.5);
    });
    this.hum.frequency.setTargetAtTime(mtof(this.note(-12, rd + 2 * this.scale.length)), now, 1.5);
    this.info.drone = noteName(root);
  }

  // 살아있는 노드 번호들. 배열은 compact() 전까지 죽은 칸이 쌓여 살아있는 수의 몇 배가 되므로,
  // 모델의 트리 순회 순서(살아있는 노드 + 그 뒤 생긴 노드)를 훑는다. compact() 직후 순서가 낡았으면 전체를 훑는다
  liveList(sim) {
    if (sim.orderDirty) return null;
    return sim.order.subarray(0, sim.orderLen);
  }

  measureShape(sim) {
    const { alive, par, D, Q, V, count, fCount, fD, fQ } = sim;
    const list = this.liveList(sim), n = list ? list.length : count;
    let nodes = 0, thick = 0, flow = 0;
    for (let q = 0; q < n; q++) {
      const i = list ? list[q] : q;
      if (!alive[i] || par[i] < 0) continue;
      nodes++;
      if (D[i] > 0.65) thick++;
      flow += Math.abs(Q[i]);
    }
    let loops = 0;
    for (let e = 0; e < fCount; e++) {
      flow += Math.abs(fQ[e]);
      if (fD[e] > 0.35) loops++;
    }
    const s = this.shape;
    s.nodes = nodes; s.thick = nodes ? thick / nodes : 0; s.flow = flow; s.loops = loops;

    // 숨은 전극: 죽은 자리만 굵은 줄기(D > 0.35) 위 새 무작위 지점으로 바꾼다. compact()로 번호가 바뀌면 전부 새로
    if (count < this.lastCount) this.slots = [];
    this.lastCount = count;
    this.slots = this.slots.filter((sl) => alive[sl.node]);
    for (let tries = 0; this.slots.length < LISTEN_SLOTS && tries < 300 && count > 0; tries++) {
      const i = (Math.random() * count) | 0;
      if (!alive[i] || par[i] < 0 || D[i] < 0.35 || this.slots.some((sl) => sl.node === i)) continue;
      this.slots.push({ node: i, on: V[i] > 0.5, fires: [], regular: false, cv: 1 });
    }

    if (!this.ctx) return;
    const td = this.toneD, tp = this.toneP, now = this.ctx.currentTime, T = 1.2;
    // 크기 → 드론 음높이 (두 배마다 음계 한 칸 아래로, 경계에서 떨지 않게 히스테리시스)
    if (nodes > 0) {
      const lv = Math.log2(Math.max(1, nodes / 300));
      let step = this.droneStep < 0 ? Math.floor(lv) : this.droneStep;
      if (lv >= step + 1.1) step = Math.floor(lv); else if (lv < step - 0.1) step = Math.floor(lv);
      step = clamp(step, 0, DRONE_STEPS - 1);
      if (step !== this.droneStep) {
        const first = this.droneStep < 0;
        this.droneStep = step;
        if (!first) this.advance();
        this.retune();
      }
    }
    const flowLv = clamp(Math.log10(1 + flow) / 2.7, 0, 1);   // Σ|Q|: 1 → 0.11, 30 → 0.55, 500 → 1
    this.flowLv = flowLv;
    const thickLv = clamp(s.thick / 0.2, 0, 1);               // 굵은 균사삭 비율 0 ~ 20%
    this.bpm = Math.round(100 + 60 * flowLv);                  // Aphex 격자: 많이 흐를수록 빠르게
    const root = mtof(this.note(-12, this.rd));
    this.droneGain.gain.setTargetAtTime(nodes ? (0.06 + 0.16 * flowLv) * td.level : 0, now, T);
    this.droneFilter.frequency.setTargetAtTime((root * 2 + 1400 * flowLv * flowLv + 900 * thickLv) * td.bright, now, T);
    this.droneFilter.Q.setTargetAtTime(0.7 + 7 * thickLv, now, T);
    this.sawGain.gain.setTargetAtTime((0.12 + 0.75 * thickLv) * td.saw, now, T);
    this.padFilter.frequency.setTargetAtTime((500 + 2500 * flowLv) * tp.bright, now, T);
    // 굵은 고리 1, 3, 7, 15, 31, 63개 → 화음 1~6성
    const voices = clamp(Math.floor(Math.log2(1 + s.loops)), 0, this.pad.length);
    this.pad.forEach((v, k) => {
      const g = k < voices ? tp.level * 0.045 / (1 + k * 0.15) : 0;
      v.triangle.g.gain.setTargetAtTime(g * (1 - tp.saw), now, tp.fade);
      v.sawtooth.g.gain.setTargetAtTime(g * tp.saw * 0.6, now, tp.fade);
    });
    this.info.pad = voices;
    if (this.midi) {
      // 드론: 지금 드론 음 하나, 화음: 쌓인 음들 (음량 0이면 끈다). 흐름 → CC74(밝기)
      const rd = this.rd, degs = this.padDegrees;
      this.midiHold('drone', nodes && this.vol.drone > 0 ? [this.note(-12, rd)] : []);
      this.midiHold('pad', this.vol.pad > 0 ? degs.slice(0, voices).map((d) => this.note(-12, rd + d)) : []);
      this.midiCC('drone', 74, flowLv);
    }
  }

  // ---------- MIDI ----------

  // out: Web MIDI 출력 포트 (MIDIOutput) 또는 null
  setMidi(out) {
    this.midiAllOff();
    this.midi = out;
    this.midiHeld = { drone: [], pad: [] };
    this.midiLastCC = {};
    if (out && this.sim) this.measureShape(this.sim);
  }

  midiSend(msg, at) {
    try { this.midi.send(msg, at); } catch (e) { /* 포트가 사라졌으면 조용히 */ }
  }

  // 사건 하나 → 음 하나. 소리와 같은 순간에 나가도록 AudioContext 시각을 MIDI 타임스탬프(performance.now 기준)로 옮긴다
  midiNote(ch, inst, f, amp, t) {
    if (!this.midi || MIDI_CH[ch] === undefined) return;
    const c = MIDI_CH[ch];
    const n = VOICES[inst].unpitched || !(f > 20) ? MIDI_FIXED[ch] : clamp(Math.round(69 + 12 * Math.log2(f / 440)), 0, 127);
    const vel = clamp(Math.round(127 * Math.sqrt(amp / 0.55)), 15, 127);
    const at = performance.now() + Math.max(0, t - this.ctx.currentTime) * 1000;
    this.midiSend([0x90 | c, n, vel], at);
    this.midiSend([0x80 | c, n, 0], at + VOICES[inst].len * 1000);
  }

  // 지속음: 원하는 음 목록과 지금 눌린 음을 비교해 바뀐 것만 떼고 누른다
  midiHold(ch, notes) {
    const c = MIDI_CH[ch], want = notes.map((m) => clamp(Math.round(m), 0, 127));
    const held = this.midiHeld[ch];
    for (const n of held) if (!want.includes(n)) this.midiSend([0x80 | c, n, 0]);
    for (const n of want) if (!held.includes(n)) this.midiSend([0x90 | c, n, 70]);
    this.midiHeld[ch] = want;
  }

  // 컨트롤 체인지 (0 ~ 1 → 0 ~ 127), 값이 바뀔 때만
  midiCC(ch, cc, v) {
    const key = ch + ':' + cc, val = clamp(Math.round(v * 127), 0, 127);
    if (this.midiLastCC[key] === val) return;
    this.midiLastCC[key] = val;
    this.midiSend([0xB0 | MIDI_CH[ch], cc, val]);
  }

  midiAllOff() {
    if (!this.midi) return;
    for (let c = 0; c < 9; c++) { this.midiSend([0xB0 | c, 123, 0]); this.midiSend([0xB0 | c, 120, 0]); }
  }

  listenElectric(sim, now) {
    const { V, Wr, x, alive, count } = sim;
    const tp = this.toneP;
    // 파면 = 흥분했지만 아직 회복 변수가 덜 쌓인 세그먼트 (꼬리가 아니라 앞쪽 띠)
    const list = this.liveList(sim), n = list ? list.length : count;
    let front = 0, sx = 0;
    for (let q = 0; q < n; q++) {
      const i = list ? list[q] : q;
      if (V[i] < 0.5 || Wr[i] >= 0.1 || !alive[i]) continue;
      front++; sx += x[i];
    }
    this.info.front = front;
    if (front >= MOTOR_FRONT) this.frontAt = now;
    const lv = clamp(Math.log10(1 + front) / 3.5, 0, 1);  // 30 → 0.43, 300 → 0.71, 3000 → 1
    this.frontNoise.gain.setTargetAtTime(0.22 * lv * lv * tp.noise, now, 0.06);
    this.frontBand.frequency.setTargetAtTime(tp.lo + (tp.hi - tp.lo) * lv, now, 0.06);
    this.humGain.gain.setTargetAtTime(0.07 * lv * tp.hum, now, 0.1);
    if (this.midi && this.frame % 3 === 0) this.midiCC('pad', 1, lv);  // 파면 크기 → CC1 (모듈레이션)
    this.padOut.gain.setTargetAtTime(1 + tp.swell * lv, now, 0.8);
    if (front) this.frontPan.pan.setTargetAtTime(this.pan(sx / front), now, 0.08);

    // 숨은 전극을 지나가는 스파이크 → '톡'. 같은 지점이 짧고 일정한 주기로 계속 울리면 재진입 → 심장 박동
    const hearts = this.slots.filter((sl) => sl.regular && sim.t - sl.fires[sl.fires.length - 1] < 2 * RE_PERIOD);
    hearts.sort((a, b) => a.cv - b.cv);
    const fired = [];
    for (const sl of this.slots) {
      if (!alive[sl.node]) continue;
      const on = V[sl.node] > 0.5;
      if (on && !sl.on) {
        const f = sl.fires;
        f.push(sim.t);
        if (f.length > 5) f.shift();
        sl.regular = false;
        if (f.length >= 4) {
          let m = 0, m2 = 0;
          for (let k = 1; k < f.length; k++) { const d = f[k] - f[k - 1]; m += d; m2 += d * d; }
          m /= f.length - 1;
          sl.cv = Math.sqrt(Math.max(0, m2 / (f.length - 1) - m * m)) / m;
          sl.regular = m < RE_PERIOD && sl.cv < RE_CV;
        }
        fired.push(sl);
      }
      sl.on = on;
    }
    // 한 프레임에 최대 3개, 심장 박동 지점이 먼저 (재진입이면 전극들이 한꺼번에 울리므로)
    const rank = (sl) => { const h = hearts.indexOf(sl); return h >= 0 && h < HEARTS ? h + 1 : 0; };
    fired.sort((a, b) => (rank(a) || 9) - (rank(b) || 9));
    for (const sl of fired.slice(0, 3)) this.onTok(sim.x[sl.node], sim.y[sl.node], rank(sl));
    this.info.reentry = hearts.length;
  }

  // 기록 전극: 이번 프레임에 쌓인 trace 샘플 중 0.5를 위로 넘는 순간마다
  listenProbe(sim) {
    const tr = sim.trace, n = tr.length;
    let k = this.lastTrace, prev = this.lastProbeV, hits = 0;
    while (k !== sim.traceIdx) {
      const v = tr[k];
      if (v > 0.5 && !(prev > 0.5) && hits++ < 2) this.onProbe(sim.x[sim.probe]);
      prev = v;
      k = (k + 1) % n;
    }
    this.lastTrace = k;
    this.lastProbeV = prev;
  }

  // ---------- 사건 → 채널 → 악기 ----------

  // 채널의 각 스타일로 한 번씩 (두 스타일 사이면 둘 다, 세기는 √무게로 나눠 전체 크기가 같게). 너무 작은 쪽은 생략
  each(ch, fn) {
    const v = this.vol[ch];
    if (!(v > 0)) return;
    this.tapCh = ch;  // 이 안에서 나는 소리는 이 채널의 분석기에도 이어진다
    for (const [st, w] of this.w[ch]) if (w > 0.03) fn(st, Math.sqrt(w) * v);
    this.tapCh = null;
  }

  // y가 위쪽일수록 높은 음계 칸
  degreeAt(y, span) { return Math.round((1 - y / this.sim.H) * span * this.scale.length); }

  onFood(x, y) {
    const now = this.ctx.currentTime;
    if (now - this.lastFoodNote < this.blend('food', (s) => s.gap.food)) return;
    this.foodHeat = this.foodHeat * Math.exp(-(now - this.lastFoodNote) / 4.3) + 1;
    this.lastFoodNote = now;
    const amp = 0.26 / (1 + 0.35 * (this.foodHeat - 1));
    this.each('food', (st, g) => {
      const f = mtof(this.note(st.reg.food, this.degreeAt(y, 1.8)));
      this.play('bell', st.inst.food, x, f, amp * g, this.when(st, 0.01));
    });
  }

  onStart(x, y, size, user) {
    const amp = (user ? 0.5 : 0.22) * (0.55 + 0.45 * clamp(size / 120, 0, 1));
    this.each('start', (st, g) => {
      const f = mtof(this.note(st.reg.start, this.degreeAt(y, 0.6)));
      this.play('stim', st.inst.start, x, f, amp * g, this.when(st), { user, cluster: true });
    });
  }

  onProbe(x) {
    this.each('probe', (st, g) => this.play('pluck', st.inst.probe, x, mtof(this.note(st.reg.probe, 0)), 0.2 * g, this.when(st)));
  }

  onTok(x, y, heart) {
    if (heart) {
      this.each('heart', (st, g) => {
        if (st.motor) return;  // 모터 스타일은 박동을 onMotor가 박자에 맞춰 친다
        const f = mtof(this.note(st.reg.heart, heart === 1 ? 0 : this.fifth));
        const lag = heart === 2 ? (st.grid ? this.stepLen(st) : 0.13) : 0;  // 두 번째 심장은 살짝 늦게: 쿵-쿵
        this.play('heart', st.inst.heart, x, f, (heart === 1 ? 0.55 : 0.35) * g, this.when(st) + lag, { heart });
      });
    }
    const now = this.ctx.currentTime;
    if (now - this.lastTok < this.blend('tok', (s) => s.gap.tok)) return;
    this.lastTok = now;
    this.each('tok', (st, g) => {
      const f = mtof(this.note(st.reg.tok, this.degreeAt(y, 1.4)));
      const amp = (heart ? 0.16 : 0.09) * g, t = this.when(st);
      if (st.stutter && Math.random() < st.stutter) {
        // drill'n'bass: 같은 타격을 반 칸 간격으로 몇 번 연타, 점점 높고 작게
        const reps = 3 + ((Math.random() * 4) | 0), sub = this.stepLen(st) / 2;
        for (let r = 0; r < reps; r++) this.play('pulse', st.inst.tok, x, f * (1 + 0.12 * r), amp * (1 - 0.6 * r / reps), t + r * sub);
      } else this.play('pulse', st.inst.tok, x, f, amp, t);
    });
  }

  // 모터 스타일(st.motor)의 박동: 파면이 어딘가를 지나가는 동안만 격자의 매 박에 킥 (재진입 채널의 음량 · 무게를 따른다).
  // 파동이 끝나면 킥도 멈춘다. 재진입처럼 스스로 도는 파동이 있으면 끝없이 이어진다
  onMotor(sim, st, t) {
    const w = this.weightOf('heart', st), v = this.vol.heart;
    if (w <= 0.03 || !(v > 0)) return;
    this.tapCh = 'heart';
    this.play('heart', st.inst.heart, sim.W / 2, mtof(this.note(st.reg.heart, 0)), 0.5 * Math.sqrt(w) * v, t, { heart: 1 });
    this.tapCh = null;
  }

  // 버섯: 원기가 생기면 위로 오르는 아르페지오, 포자를 날리기 시작하면 높은 음이 흩어지고, 포자가 싹트면 한 음
  onFruit(x, y, kind) {
    if (kind === 'fruit') this.advance();
    this.each('fruit', (st, g) => {
      const n = this.scale.length, inst = st.inst.fruit, t0 = this.when(st, 0.01);
      const step = st.grid ? this.stepLen(st) : 0.17;
      if (kind === 'fruit') {
        const [a, b, c] = this.triad;
        [a, b, c, n + a, n + b].forEach((d, k) => this.play('fruit', inst, x, mtof(this.note(st.reg.fruit, d)), 0.2 * g, t0 + k * step));
      } else if (kind === 'spores') {
        for (let k = 0; k < 7; k++) {
          const d = n + ((Math.random() * n * 1.5) | 0);
          this.play('fruit', inst, x + (Math.random() - 0.5) * 120, mtof(this.note(st.reg.fruit + 12, d)), 0.09 * g, t0 + k * step * 0.6 + Math.random() * 0.05);
        }
      } else this.play('fruit', inst, x, mtof(this.note(st.reg.fruit + 12, 0)), 0.12 * g, t0);
    });
  }

  // 사용자가 먹이를 놓음 (먹이 채널의 스타일을 따른다)
  onPlop(x) {
    if (!this.sim || !this.ctx) return;
    this.each('food', (st, g) => this.play('plop', st.inst.plop, x, mtof(this.note(st.reg.probe, this.fifth)), 0.18 * g, this.when(st)));
  }

  // 성장 중인 팁 하나를 스타일 st로 (무작위 팁의 위치에서). idx: 그 스타일 격자의 몇 번째 칸인지
  onGrow(sim, st, t, idx) {
    if (!sim.tips.length || !(this.vol.grow > 0)) return;
    this.tapCh = 'grow';
    const tp = sim.tips[(Math.random() * sim.tips.length) | 0];
    const inst = st.inst.grain, v = this.vol.grow, mode = st.grain.mode;
    let f = 0, amp = 0.06 + Math.random() * 0.08, opt = {};
    if (mode === 'arp') {
      // 아르페지오: 지금 화음(드론 칸 기준 1·3·5도 위로 두 옥타브)을 대체로 올라가며 걷는다
      const n = this.scale.length, rd = ((this.rd % n) + n) % n, [a, b, c] = this.triad;
      const chord = [a, b, c, n + a, n + b, n + c];
      this.arp = (this.arp + (Math.random() < 0.75 ? 1 : chord.length - 1)) % chord.length;
      f = mtof(this.note(st.reg.grain, rd + chord[this.arp]));
      amp = st.grain.amp;
    } else if (mode === 'scale') {
      f = mtof(this.note(st.reg.grain, (Math.random() * this.scale.length * 1.5) | 0));
      amp = st.grain.amp;
    } else if (mode === 'hat') {
      amp = idx % 4 === 0 ? 0.16 : 0.08;
      if (Math.random() < 0.12) this.play('grain', inst, sim.x[tp.node], 0, amp * 0.6 * v, t + this.stepLen(st) / 2);  // 32분 덧박
    } else if (mode === 'offbeat') {
      // 4박 사이 뒷박(16분 격자의 3번째 칸)은 열린 하이햇으로 크게, 나머지 칸은 닫힌 하이햇으로 작게
      opt = { open: idx % 4 === 2 };
      amp = opt.open ? 0.13 : 0.05;
    } else f = 2200 + Math.random() * 4800;  // 'noise'
    this.play('grain', inst, sim.x[tp.node], f, amp * v, t, opt);
    this.tapCh = null;
  }

  // ---------- 발음 ----------

  // 동시 발음 상한: 전체 상한 + 종류별 상한. 넘치면 그 소리는 그냥 건너뛴다
  play(kind, inst, x, f, amp, t, opt = {}) {
    if (this.tapCh) this.midiNote(this.tapCh, inst, f, amp, t);  // MIDI는 음소거 · 발음 상한과 상관없이 보낸다
    if (!this.audible || this.active >= MAX_VOICES || this.activeBy[kind] >= LIMIT[kind]) return;
    this.active++;
    this.activeBy[kind]++;
    const p = this.ctx.createStereoPanner();
    p.pan.value = this.pan(x);
    const vc = VOICES[inst], [verb, echo] = vc.send;
    this.out(p, verb, echo, vc.analog);
    if (this.tapCh) p.connect(this.taps[this.tapCh]);
    const src = this[inst](t, f, amp, p, opt);
    src.onended = () => { this.active--; this.activeBy[kind]--; };
  }

  env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
    return g;
  }

  osc(type, f, t, end) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t); o.stop(end);
    return o;
  }

  noiseHit(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.start(t, Math.random() * 1.8); n.stop(t + dur);
    return n;
  }

  filter(type, f, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  // 악기 자체는 src/styles/*.js에 있다. 여기는 악기들이 함께 쓰는 엔벨로프

  // 누른 채 있다가 놓는 엔벨로프 (오르간처럼 지속되는 소리)
  envHold(t, peak, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + hold + release);
    return g;
  }
}

if (typeof module !== 'undefined') module.exports = { MyceliumSound, STYLES, STYLE_ORDER, VOICES, SCALES, CHANNELS, defineStyle, checkStyles, styleWeights };
