'use strict';
// 곡: 장면(설정 스냅샷)을 차례로 늘어놓고, 장면마다 '다음으로 넘어가는 조건'을 둔다.
// 조건은 마디 수(시계) 또는 균사체 상태(팁 · 고리 · 군체 수, 새 버섯 수). 상태 조건은 최대 마디 수를 넘으면 그래도 넘어간다.
// 화면 · 소리와 떨어진 순수 로직: 무엇을 스냅샷하고 어떻게 적용하는지는 main.js가 넘겨준다.

const NEXT_TYPES = {
  bars: { min: 1, max: 64, step: 1, def: 16 },
  tips: { min: 10, max: 2000, step: 10, def: 200 },
  loops: { min: 1, max: 500, step: 1, def: 20 },
  colonies: { min: 2, max: 20, step: 1, def: 2 },
  fruit: { min: 1, max: 10, step: 1, def: 1 },   // 이 장면에 들어온 뒤 새로 올라온 버섯 수
};
const SCENE_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

class Song {
  constructor() {
    this.scenes = [];   // { name, snap, next: { type, n, max } }
    this.bpm = 88;
    this.mode = 'stop'; // 'stop' 수동 · 'song' 조건대로 넘어감 · 'scene' 지금 장면 반복 (조건 무시)
    this.cur = -1;      // 지금 장면
    this.beats = 0;     // 지금 장면에 들어온 뒤 지난 박
    this.songBeats = 0; // 곡 시작 뒤 지난 박
    this.enterFruit = 0;
    this.progress = 0;  // 지금 장면 조건까지 0 ~ 1
  }

  get barLen() { return 4; }   // 4/4
  get bar() { return this.songBeats / this.barLen; }
  get sceneBar() { return this.beats / this.barLen; }

  nextName() {
    for (const c of SCENE_NAMES) if (!this.scenes.some((s) => s.name === c)) return c;
    return `S${this.scenes.length + 1}`;
  }
  add(snap) {
    const s = { name: this.nextName(), snap, next: { type: 'bars', n: NEXT_TYPES.bars.def, max: 64 } };
    this.scenes.push(s);
    return this.scenes.length - 1;
  }
  remove(i) {
    this.scenes.splice(i, 1);
    if (this.cur === i) this.cur = -1; else if (this.cur > i) this.cur--;
  }
  move(i, d) {
    const j = i + d;
    if (j < 0 || j >= this.scenes.length) return i;
    [this.scenes[i], this.scenes[j]] = [this.scenes[j], this.scenes[i]];
    if (this.cur === i) this.cur = j; else if (this.cur === j) this.cur = i;
    return j;
  }
  setNextType(i, type) {
    const nx = this.scenes[i].next;
    if (nx.type === type) return;
    nx.type = type;
    nx.n = NEXT_TYPES[type].def;
  }

  // 장면에 들어간다: 시계를 0으로, 들어온 순간의 버섯 수를 기억
  enter(i, stats) {
    this.cur = i;
    this.beats = 0;
    this.progress = 0;
    this.enterFruit = stats ? stats.fruitsTotal : 0;
  }
  start(stats) {
    if (!this.scenes.length) return -1;
    this.songBeats = 0;
    this.enter(0, stats);
    return 0;
  }

  // dt 초가 지났다. 다음 장면으로 넘어가야 하면 그 번호, 아니면 −1
  tick(dt, stats) {
    if (this.cur < 0 || this.mode === 'stop') return -1;
    const beats = (dt * this.bpm) / 60;
    this.beats += beats;
    this.songBeats += beats;
    const s = this.scenes[this.cur];
    if (!s) return -1;
    const { type, n, max } = s.next, bars = this.sceneBar;
    let p;
    if (type === 'bars') p = bars / n;
    else {
      const v = type === 'fruit' ? stats.fruitsTotal - this.enterFruit : stats[type];
      p = Math.max(v / n, bars / max);
    }
    this.progress = Math.min(1, p);
    if (this.mode === 'scene') {
      if (p >= 1 && type === 'bars') this.beats = 0;   // 장면 반복: 마디 조건이면 다시 처음부터
      return -1;
    }
    if (p < 1) return -1;
    if (this.cur + 1 >= this.scenes.length) { this.progress = 1; return -1; }   // 마지막 장면에 머문다
    const next = this.cur + 1;
    this.enter(next, stats);
    return next;
  }

  // 실제 걸린 시간을 모르는 상태 조건 장면은 최대 마디의 절반을 길이로 가정해 막대를 그린다
  weight(s) { return s.next.type === 'bars' ? s.next.n : Math.max(4, s.next.max / 2); }

  toJSON() { return { v: 1, bpm: this.bpm, scenes: this.scenes }; }
  load(o) {
    if (!o || !Array.isArray(o.scenes)) return;
    this.bpm = o.bpm || 88;
    this.scenes = o.scenes.filter((s) => s && s.snap && s.next && NEXT_TYPES[s.next.type]);
    this.cur = -1;
  }
}

if (typeof module !== 'undefined') module.exports = { Song, NEXT_TYPES };
