'use strict';
// 패치: 균사체 상태(소스)를 소리 파라미터(목적지)에 케이블로 잇는다. 케이블 = { src, dst, amt (−1 ~ +1) }.
// 소스는 모두 0 ~ 1로 맞추고 천천히 따라가게 거른다. 목적지마다 케이블 값을 더해 소리 엔진이 쓸 '모듈레이션'을 만든다.
// 화면 · 소리와 떨어진 순수 로직 (노드에서 시험한다).

// 소스: 통계(sim.stats())와 소리 엔진의 흐름 세기(flowLv)에서 0 ~ 1 값
const PATCH_SRC = ['tips', 'flow', 'loops', 'spikes', 'mat', 'fruit', 'clash'];
// 목적지: 무엇이 어떻게 움직이는지는 MyceliumSound.mod를 쓰는 쪽이 정한다
//   cutoff 마스터 저역 필터 (+: 소스가 클수록 열림, −: 소스가 클수록 닫힘) · tempo 격자 박자 배수 2^(±1)
//   density 성장음 밀도 배수 2^(±2) · reverb · echo 손잡이 값에 더함 · pitch 음계 칸 ±(한 옥타브)
//   chord 소스가 0.5를 위로 넘을 때마다 화음 진행 한 칸 (균사체 모드에서)
const PATCH_DST = ['cutoff', 'tempo', 'density', 'reverb', 'echo', 'pitch', 'chord'];
const PATCH_MAX = 16;

class Patch {
  constructor() {
    this.cables = [];
    this.src = Object.fromEntries(PATCH_SRC.map((k) => [k, 0]));   // 걸러진 소스 값
    this.last = null;   // 지난번 누적 통계 (속도 계산용)
    this.fruitSeen = 0;
    this.edge = {};     // chord 목적지: 케이블마다 지난 소스 값 (올라가며 0.5를 넘는 순간을 잡는다)
  }

  has(src, dst) { return this.cables.findIndex((c) => c.src === src && c.dst === dst); }
  connect(src, dst, amt = 0.5) {
    if (!PATCH_SRC.includes(src) || !PATCH_DST.includes(dst)) return -1;
    const i = this.has(src, dst);
    if (i >= 0) return i;
    if (this.cables.length >= PATCH_MAX) return -1;
    this.cables.push({ src, dst, amt });
    return this.cables.length - 1;
  }
  remove(i) { this.cables.splice(i, 1); }
  uses(dst) { return this.cables.some((c) => c.dst === dst); }

  // 통계로 소스 값을 갱신. dt 초. 누적 수(스파이크 · 대치 · 버섯)는 초당 속도로 바꾼다
  sense(stats, flowLv, dt) {
    const raw = {
      tips: 1 - Math.exp(-stats.tips / 200),
      flow: flowLv,
      loops: Math.min(1, Math.log2(1 + stats.fusions) / 8),
      mat: stats.matCover,
    };
    if (this.last && dt > 0) {
      raw.spikes = Math.min(1, (stats.spikes - this.last.spikes) / dt / 20);
      raw.clash = Math.min(1, (stats.clashes - this.last.clashes) / dt / 5);
    } else { raw.spikes = 0; raw.clash = 0; }
    this.last = { spikes: stats.spikes, clashes: stats.clashes };
    // 버섯: 새로 올라오면 1로 튀고 몇 초에 걸쳐 사라지는 펄스
    if (stats.fruitsTotal > this.fruitSeen) this.src.fruit = 1;
    this.fruitSeen = stats.fruitsTotal;
    raw.fruit = this.src.fruit * Math.exp(-dt / 3);
    // 거르기: 펄스는 그대로, 나머지는 시정수 약 0.7초로 따라간다
    const a = 1 - Math.exp(-dt / 0.7);
    for (const k of PATCH_SRC) {
      const v = Math.max(0, Math.min(1, raw[k] || 0));
      this.src[k] = k === 'fruit' ? v : this.src[k] + (v - this.src[k]) * a;
    }
  }

  // 목적지별 합. chord는 올라가며 0.5를 넘은 케이블 수(이번에 진행할 칸 수)
  out() {
    const o = Object.fromEntries(PATCH_DST.map((k) => [k, 0]));
    o.cutoffOpen = 1;
    this.cables.forEach((c, i) => {
      const s = this.src[c.src];
      if (c.dst === 'chord') {
        const prev = this.edge[i] ?? s;
        if (prev < 0.5 && s >= 0.5 && c.amt > 0) o.chord++;
        this.edge[i] = s;
      } else if (c.dst === 'cutoff') {
        // 기준이 '다 열림'이라 끌어내리기만 한다: +면 소스가 작을 때 닫히고 클수록 열리며, −면 클수록 닫힌다
        o.cutoffOpen -= c.amt > 0 ? c.amt * (1 - s) : -c.amt * s;
      } else o[c.dst] += c.amt * s;
    });
    o.cutoffOpen = Math.max(0, Math.min(1, o.cutoffOpen));
    return o;
  }

  toJSON() { return { v: 1, cables: this.cables }; }
  load(o) {
    this.cables = [];
    if (!o || !Array.isArray(o.cables)) return;
    for (const c of o.cables) if (c) { const i = this.connect(c.src, c.dst, +c.amt || 0); if (i >= 0) this.cables[i].amt = Math.max(-1, Math.min(1, +c.amt || 0)); }
  }
}

if (typeof module !== 'undefined') module.exports = { Patch, PATCH_SRC, PATCH_DST };
