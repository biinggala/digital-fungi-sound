'use strict';
// Digital Fungi — 균사체 모델 (렌더링과 분리된 순수 시뮬레이션)
//
// 기본 단위는 "균사 팁(hyphal tip)" 하나다. 퍼셉트론이 y = σ(w·x + b) 라면,
// 균사 팁은 매 tick마다  감지 → 조향 → 성장 → (분기 | 융합 | 정지)  를 수행한다.
// 팁이 지나간 자리는 노드(세그먼트)로 남아 트리 + 융합 간선으로 된 네트워크가 된다.
// 전기 신호: 각 세그먼트는 흥분성 단위 (FitzHugh–Nagumo, Hodgkin–Huxley의 단순화판)이고 굵기만큼 이웃과 이어진다:
//   dv/dt = c·v(v − α)(1 − v) − w + Σ_j k(g0 + D_ij)(v_j − v_i),   dw/dt = ε(γv − w)
//   굵은 균사삭일수록 신호가 빠르다 (케이블 이론). 결합 항은 트리 위에서 암묵적으로 푼다 (Hines 방법, O(N)).
//
// 학습되는 것은 가중치가 아니라 각 간선의 전도도 D (굵기)다:
//   L(D) · P = −b                              (키르히호프: 네트워크 전체를 저항 회로로 보고 '압력' P를 푼다)
//   Q_ij = D_ij (P_i − P_j)                     (간선 흐름: 융합으로 생긴 고리도 실제 우회로가 된다)
//   D ← D + λ ( f(|Q|) − D ),  f(q) = (q/Q0)^μ / (1 + (q/Q0)^μ)   (쓰면 굵어지고, 안 쓰면 가늘어진다)
//
// 균사 매트: 하나하나 계산하기엔 너무 촘촘한 가는 균사는 토양 격자 위의 밀도 m ∈ [0, 1]로 다룬다 (이산 + 연속 혼합, Boswell · Davidson 류).
//   ∂m/∂t = ∇·(D_m(P) ∇m) + [ r m (1 − m) + s·χ (1 − m) ] · N/(N + K) − λ m   (Fisher–KPP + 명시적 균사가 씨를 뿌림 χ, Monod 양분 제한, 자가분해 λ)
//   D_m(P) = D · P/(P + P½): 퍼짐도 군체 저장 양분 P에 달렸다 (균사 끝의 신장은 내부 양분에 기댄다)
//   매트가 흡수 · 소비하는 양분은 그 칸의 명시적 노드에 부하로 붙어서 키르히호프 회로를 그대로 지난다.
// 결실: 매트가 더 넓어지지 않고(다 채움) 저장 양분이 넉넉하면 짙은 매트 + 굵은 줄기가 모이는 곳에 버섯이 생긴다 (판정 규칙은 가설).
//   버섯은 크기에 비례해 당기는 싱크(로지스틱)이고, 결실 동안 영양 매트는 스스로 분해되어 그 양분이 버섯으로 흐른다.
// 질량 장부: 양분은 토양 · 저장고 · 균사 · 매트 · 버섯 · 포자 사이를 옮겨 다닐 뿐이고, 호흡과 화면 밖으로 날아간 포자로만 빠져나간다 (massBalance()).

const FUNGI_DEFAULTS = {
  step: 1.2,          // 팁이 한 tick에 자라는 거리 (px)
  senseDist: 9,       // 감지 탐침 거리
  senseAngle: 0.5,    // 감지 탐침 각도 (rad)
  turnGain: 2.5,      // 좌/우 탐침 차이 → 회전량
  maxTurn: 0.35,
  noise: 0.18,        // 무작위 굴곡
  chemo: 1.0,         // 화학굴성: 양분 쪽으로 휜다
  avoid: 0.3,         // 음성 자기굴성: 기존 균사를 피한다
  branch: 0.04,       // 측면 분기 기본 확률 (양분이 많을수록 증가)
  growCost: 0.002,    // 세그먼트 하나를 만드는 비용
  absorb: 0.0005,     // 노드당 흡수율 (토양 양분의 비율)
  maintain: 0.000012, // 노드당 유지비 (굵을수록 비쌈)
  flowScale: 0.008,   // Q0: 이만큼 흐르면 D가 절반까지 굵어진다
  flowExp: 1.5,       // μ: 적응 함수 (|Q|/Q0)^μ / (1 + (|Q|/Q0)^μ). μ>1 이면 평행한 길끼리 경쟁해 굵은 줄기로 모이고, μ<1 이면 여러 갈래로 퍼진다
  regen: 0.0003,      // 토양 재생 속도 (낙엽이 쌓이듯 바탕 양분이 천천히 회복)
  adapt: 0.02,        // 전도도 적응 속도 λ
  pruneBelow: 0.03,   // 이보다 가는 말단 세그먼트는 자가분해
  fuseDist: 2.6,      // 융합(anastomosis) 거리
  maxTipsPerColony: 1500,
  elecCoupling: 200,  // k: 세그먼트 사이 전기 결합 세기. 신호 속도 ∝ √k (결합을 암묵적으로 풀어서 크게 잡아도 안정)
  elecBase: 0.3,      // g0: 가장 가는 균사도 이만큼은 전도한다
  elecDt: 0.8,        // 전기 시간 간격 (결합을 암묵적으로 풀어서 크게 잡아도 안정)
  elecSubsteps: 3,    // tick당 전기 계산 횟수 → 신호가 성장보다 15배쯤 빠르다
  fusionConduct: 1,   // 융합 접합부의 전기 전도 배수 (0이면 고리가 전기적으로 끊겨 신호가 돌지 못한다)
  elecRecovery: 0.003, // ε: 회복 속도. 작을수록 불응기가 길어져 파장이 길어진다 (ε≈0.01이면 파장보다 긴 고리에서 신호가 끝없이 돈다: 재진입)
  spontaneous: 0.004, // tick당 어딘가에서 저절로 스파이크가 날 확률
  spikeResponse: 3,   // 스파이크를 맞은 팁의 분기 확률 증가 배수 (가설적 규칙: "어딘가 먹이가 있다 → 더 탐색")
  swapRatio: 1.5,     // 융합 간선이 고리 위 가장 약한 트리 간선보다 이만큼 굵으면 역할을 바꾼다
  flowEvery: 4,       // 회로를 몇 tick마다 다시 풀지 (D는 천천히 변하므로 매 tick 풀 필요는 없다)
  recycle: 0.4,       // 자가분해 · 분해 때 양분으로 돌아오는 비율 (나머지는 호흡으로 빠져나간다)

  // 균사 매트 (연속체 밀도 m, FIELD_CELL 칸의 포화 밀도 대비)
  matGrowth: 0.02,    // r: 로지스틱 자람 속도 (/tick)
  matSpread: 0.12,    // D_m: 확산 계수 (칸²/tick). 명시적 오일러라 MAT_D_MAX 이하로 자른다 (안정 · 0 ≤ m ≤ 1 유지)
  matSeed: 0.05,      // s: 명시적 균사가 지나간 칸에서 매트가 생기는 속도
  matHalfN: 0.02,     // K: 매트 자람의 양분 반포화 상수 (Monod)
  matCost: 0.05,      // 매트 밀도 1을 만드는 양분 (칸당). 실행 중엔 바꾸지 않는다 (장부가 Σm · matCost로 매트 질량을 잰다)
  matAbsorb: 0.002,   // 매트 밀도 1이 칸의 토양 양분을 tick당 흡수하는 비율
  matMaintain: 0.00002, // 매트 밀도 1의 tick당 유지비 (호흡)

  // 결실 (버섯)
  fruitSat: 0.03,     // '다 채움' 판정: 최근 SAT_WINDOW · SAT_EVERY tick 동안 매트 면적이 이 비율보다 덜 늘면
  fruitShare: 0.5,    // 결실 한 번(flush)에 저장 양분의 몇 할을 버섯에 쓰나
  fruitRate: 0.033,   // 버섯 싱크 세기: 로지스틱 성장률 (/tick). 원기 → 성숙 ≈ 220 tick ≈ 5일 (실제: 며칠 ~ 1주)
  fruitAutolysis: 0.0003, // 결실 동안 영양 매트가 스스로 분해되는 속도 (/tick)
  sporeYield: 0.3,    // 다 자란 버섯 바이오매스 중 포자로 가는 비율
};

// 물리 척도 (보정, README 9장): 1 px = 0.26 mm (화면 가로 ≈ 24 cm 토양 미세계), 1 tick ≈ 33분.
// 근거: 모델의 균사 전선 속도 0.73 px/tick (무작위 토양 5판 평균, 0.41 ~ 0.88) = 실측 8.4 mm/day
// (Phanerochaete velutina, 비멸균 토양, Bretherton et al. 2006). 이 척도에서 땅을 90% 채우는 데 ≈ 18일 (배양 기질 2 ~ 3주와 맞음)
const UNITS = { mmPerPx: 0.26, minPerTick: 33 };

const G_EPS = 1e-3;     // 굵기가 0이 되어도 회로가 끊기지 않게 하는 최소 전도도

const MAT_D_MAX = 0.2;     // 4·D + r + s ≤ 1 이면 명시적 갱신이 양수성 · 상한(m ≤ 1)을 지킨다 (r ≤ 0.06, s = 0.05에서)
const MAT_MIN = 1e-4;      // 이보다 옅은 매트는 정리 (그 양은 호흡으로 장부에)
const MAT_RESERVE = 3;     // 저장 양분이 이 아래면 매트를 새로 만들지 않는다 (명시적 균사의 유지비가 먼저)
const MAT_STARVE = 0.002;  // 매트 자가분해 최대 속도 (/tick): 파산하면 이 속도, 적자면 (적자 / 유지비)만큼. 가는 균사가 줄기보다 먼저 분해된다
const MAT_ALLOC = 0.01;    // 매트 자람에 쓸 수 있는 저장 양분의 비율 (/tick): 투자 ≤ α·(P − 비축). 나머지는 저장으로 쌓인다
const MAT_P_HALF = 5;      // 퍼짐(확산)의 저장 양분 반포화: D_eff = D · P/(P + P½). 저장이 바닥나면 더 넓히지 않는다
const SAT_EVERY = 50;      // 결실 판정 주기 (tick)
const SAT_WINDOW = 6;      // 매트 면적 기록 개수 → 300 tick 동안의 증가율을 본다
const LIMIT_FRAC = 0.25;   // 순수입이 최고치의 이 비율 아래로 떨어지면 '기질이 바닥나기 시작함'
const NET_EMA = 0.01;      // 군체 순수입(흡수 − 유지비)의 지수 이동 평균 계수 (≈ 100 tick)
const FLUSH_MIN_AREA = 120;  // 결실하려면 매트가 최소 이만큼 (Σm, 칸 수 단위)
const FLUSH_MIN_POOL = 5;    // … 저장 양분도 최소 이만큼
const FLUSH_COOLDOWN = 440;  // 결실이 끝난 뒤 다음 결실까지 (tick ≈ 10일, 재배에서 흔한 flush 간격)
const FRUIT_UNIT = 40;       // 예산 이만큼마다 버섯 하나 (1 ~ 3개)
const FRUIT_SPACING = 10;    // 버섯끼리 최소 간격 (칸)
const FRUIT_STALL = 150;     // 이만큼(≈ 3.4일) 못 자라면 원기가 말라 죽는다 (abortion)
const FRUIT_DECAY = 0.004;   // 포자를 다 날린 버섯이 분해되는 속도 (/tick)
const SPORES_PER_FRUIT = 10;
const SPORE_TICKS = 200;     // 포자를 날리는 기간 (≈ 4.6일)
const SPORE_MEAN = 90;       // 포자 비행 거리의 평균 (px, 지수 분포 — 바람 없는 근거리 산포라는 가정)
const GERM_N = 0.01;         // 포자가 싹트려면 그 칸의 토양 양분이 이 이상이고 매트가 없어야
const GERM_P = 0.5;          // 조건이 맞을 때 GERM_EVERY tick마다 싹틀 확률
const GERM_EVERY = 25;
const SPORE_LIFE = 4000;     // 휴면 포자의 수명 (tick). 그 안에 자리가 나면 싹트고, 못 나면 분해된다 (포자 은행)
const STAGE = { GROW: 0, SPORE: 1, DONE: 2 };
const FUSION_CAP = 60000;

const clampv = (v, a, b) => Math.max(a, Math.min(b, v));
const FIELD_CELL = 5;  // 토양 양분 격자
const OCC_CELL = 3;    // 접촉 검사 격자
const DENS_CELL = 6;   // 균사 밀도 격자
const COLONY_HUES = [42, 188, 325, 100, 18, 265, 160, 0];
const FHN = { alpha: 0.06, c: 1.5, gamma: 0.5 };  // α: 문턱 (낮을수록 분기점에서도 잘 퍼짐)
const TRACE_LEN = 600;

class Mycelium {
  constructor(width, height, params = {}, cap = 220000) {
    this.W = width;
    this.H = height;
    this.p = { ...FUNGI_DEFAULTS, ...params };
    this.cap = cap;
    this.t = 0;

    // 노드 = 균사 세그먼트의 끝점. 부모 간선(par → i)의 전도도/흐름을 노드에 저장한다.
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.par = new Int32Array(cap);
    this.col = new Uint8Array(cap);
    this.alive = new Uint8Array(cap);
    this.isTip = new Uint8Array(cap);
    this.nch = new Uint8Array(cap);      // 살아있는 자식 수
    this.nfu = new Uint8Array(cap);      // 붙어있는 융합 간선 수
    this.D = new Float32Array(cap);      // 부모 간선의 전도도 (굵기)
    this.Q = new Float32Array(cap);      // 부모 → i 방향 흐름 (+ 소비 쪽으로, − 공급 쪽에서)
    this.bal = new Float32Array(cap);    // 이번 tick 노드의 수요 − 공급
    this.born = new Int32Array(cap);
    this.owner = new Int32Array(cap);    // 이 노드를 만든 팁 id
    this.pinned = new Uint8Array(cap);   // 버섯이 붙은 노드 (가지치기하지 않는다)
    this.count = 0;
    this.liveNodes = 0;

    // 수송 솔버 작업 공간
    this.T = new Float64Array(cap);       // 서브트리 소비 합
    this.X = new Float64Array(cap);       // 융합 간선으로 빠져나가는 양 (남길 노드 기준)
    this.mchild = new Int32Array(cap);
    this.mbot = new Int32Array(cap);
    this.bot = new Int32Array(cap);
    this.needed = new Uint8Array(cap);
    this.accA = new Float64Array(cap);
    this.accR = new Float64Array(cap);
    this.top = new Int32Array(cap);
    this.rid = new Int32Array(cap);
    this.coreSize = 0;

    // 전기 상태: V = 막전위 (휴지 0, 흥분 ~1), Wr = 회복 변수 (this.W는 월드 폭이라 이름을 피한다)
    this.V = new Float32Array(cap);
    this.Wr = new Float32Array(cap);
    this.eg = new Float64Array(cap);   // Hines 소거용 대각/우변
    this.er = new Float64Array(cap);
    this.spikes = 0;
    this.foodSignals = 0;
    this.events = [];                  // 파동 시작 사건 { kind, x, y, size } — 소리 쪽이 프레임마다 비운다
    this.probe = -1;                   // 기록 전극이 꽂힌 노드
    this.trace = new Float32Array(TRACE_LEN).fill(NaN);
    this.traceIdx = 0;
    this.swaps = 0;

    // 트리 순회 순서 (부모가 항상 자식보다 앞). 간선 교환으로 부모가 바뀌면 BFS로 다시 만든다.
    this.order = new Int32Array(cap);
    this.orderLen = 0;
    this.orderDirty = false;
    this.kidStart = new Int32Array(cap + 1);
    this.kids = new Int32Array(cap);
    this.stamp = new Int32Array(cap);
    this.stampId = 0;

    // 융합 간선 a ↔ b: 트리 간선과 똑같이 전도도/흐름을 가진다
    this.fa = new Int32Array(FUSION_CAP);
    this.fb = new Int32Array(FUSION_CAP);
    this.fD = new Float32Array(FUSION_CAP);
    this.fQ = new Float32Array(FUSION_CAP);  // a → b 방향 흐름
    this.fCount = 0;

    this.tips = [];
    this.nextTipId = 1;
    this.colonies = [];
    this.clashes = 0;
    this.full = false;

    this.FW = Math.ceil(width / FIELD_CELL);
    this.FH = Math.ceil(height / FIELD_CELL);
    this.field = new Float32Array(this.FW * this.FH);
    this.base = new Float32Array(this.FW * this.FH);  // 재생 목표치 (바탕 양분)
    this.OW = Math.ceil(width / OCC_CELL);
    this.OH = Math.ceil(height / OCC_CELL);
    this.occ = new Int32Array(this.OW * this.OH).fill(-1);
    this.DW = Math.ceil(width / DENS_CELL);
    this.DH = Math.ceil(height / DENS_CELL);
    this.dens = new Uint16Array(this.DW * this.DH);

    // 균사 매트 (토양 격자와 같은 칸). 질량 장부를 정확히 맞추려고 64비트
    const NF = this.FW * this.FH;
    this.mat = new Float64Array(NF);
    this.matNext = new Float64Array(NF);
    this.matOwner = new Int8Array(NF).fill(-1);   // 칸을 차지한 군체 (다른 군체 칸으로는 번지지 않는다)
    this.ownPrev = new Int8Array(NF);
    this.frep = new Int32Array(NF).fill(-1);      // 칸에 마지막으로 생긴 명시적 노드
    this.matRep = new Int32Array(NF).fill(-1);    // 매트 부하를 붙일 노드 (칸에 노드가 없으면 번져 온 칸의 것을 물려받는다)
    this.cordScratch = new Float32Array(NF);
    this.fruits = [];
    this.spores = [];                             // 날아가는 포자
    this.nextFruitId = 1;
    this.fruitCount = 0;
    this.sporeColonies = 0;

    // 질량 장부: 들어온 것(먹이 · 사용자 포자 · 처음 토양), 토양 재생, 호흡, 화면 밖으로 나간 포자
    this.ledger = { input: 0, regen: 0, respired: 0, exported: 0 };
    this.netBiomass = 0;                          // 명시적 균사에 들어간 양분 (마디당 growCost)
  }

  // ---------- 토양 ----------

  seedField(nFood = 7) {
    const g = 14;
    const cw = Math.ceil(this.FW / g) + 2;
    const coarse = Float32Array.from({ length: cw * (Math.ceil(this.FH / g) + 2) }, Math.random);
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let fy = 0; fy < this.FH; fy++) {
      for (let fx = 0; fx < this.FW; fx++) {
        const gx = fx / g, gy = fy / g;
        const ix = gx | 0, iy = gy | 0;
        const tx = smooth(gx - ix), ty = smooth(gy - iy);
        const a = coarse[iy * cw + ix], b = coarse[iy * cw + ix + 1];
        const c = coarse[(iy + 1) * cw + ix], d = coarse[(iy + 1) * cw + ix + 1];
        const v = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
        this.field[fy * this.FW + fx] = this.base[fy * this.FW + fx] = Math.pow(v, 2.2) * 0.16;
      }
    }
    for (let i = 0; i < this.field.length; i++) this.ledger.input += this.field[i];
    for (let k = 0, tries = 0; k < nFood && tries < 200; tries++) {
      const x = this.W * (0.05 + Math.random() * 0.9);
      const y = this.H * (0.05 + Math.random() * 0.9);
      if (Math.hypot(x - this.W / 2, y - this.H / 2) < 130) continue;
      this.addFood(x, y, 18 + Math.random() * 28, 0.6 + Math.random() * 0.5);
      k++;
    }
  }

  addFood(cx, cy, r = 30, amp = 1) {
    const s = r / FIELD_CELL;
    const R = Math.ceil(s * 2.5);
    const fx0 = Math.floor(cx / FIELD_CELL), fy0 = Math.floor(cy / FIELD_CELL);
    for (let dy = -R; dy <= R; dy++) {
      const fy = fy0 + dy;
      if (fy < 0 || fy >= this.FH) continue;
      for (let dx = -R; dx <= R; dx++) {
        const fx = fx0 + dx;
        if (fx < 0 || fx >= this.FW) continue;
        const i = fy * this.FW + fx;
        const v = amp * Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
        const before = this.field[i];
        this.field[i] = Math.min(1.2, before + v);
        this.ledger.input += this.field[i] - before;  // float32에 실제로 들어간 만큼
      }
    }
  }

  fieldIndex(x, y) {
    const fx = Math.min(this.FW - 1, Math.max(0, (x / FIELD_CELL) | 0));
    const fy = Math.min(this.FH - 1, Math.max(0, (y / FIELD_CELL) | 0));
    return fy * this.FW + fx;
  }

  densIndex(x, y) {
    const dx = Math.min(this.DW - 1, Math.max(0, (x / DENS_CELL) | 0));
    const dy = Math.min(this.DH - 1, Math.max(0, (y / DENS_CELL) | 0));
    return dy * this.DW + dx;
  }

  occIndex(x, y) {
    return ((y / OCC_CELL) | 0) * this.OW + ((x / OCC_CELL) | 0);
  }

  // 팁이 느끼는 매력도: 양분은 끌어당기고, 이미 있는 균사는 밀어낸다
  sense(x, y) {
    return this.p.chemo * this.field[this.fieldIndex(x, y)]
      - this.p.avoid * this.dens[this.densIndex(x, y)] * 0.25;
  }

  // ---------- 네트워크 구성 ----------

  addNode(x, y, parent, col, owner) {
    if (this.count >= this.cap) return -1;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y;
    this.par[i] = parent; this.col[i] = col;
    this.alive[i] = 1; this.isTip[i] = 0; this.nch[i] = 0; this.nfu[i] = 0;
    this.D[i] = 0.35; this.Q[i] = 0; this.bal[i] = 0;
    this.born[i] = this.t; this.owner[i] = owner;
    this.V[i] = parent >= 0 ? this.V[parent] : 0;
    this.Wr[i] = parent >= 0 ? this.Wr[parent] : 0;
    this.order[this.orderLen++] = i;
    if (parent >= 0 && this.nch[parent] < 255) this.nch[parent]++;
    this.occ[this.occIndex(x, y)] = i;
    this.dens[this.densIndex(x, y)]++;
    this.frep[this.fieldIndex(x, y)] = i;
    this.pinned[i] = 0;
    this.liveNodes++;
    this.colonies[col].nodes++;
    return i;
  }

  // pool: 처음 저장 양분. 사용자가 심은 포자는 밖에서 들어온 양분(장부의 input), 버섯 포자는 부모 버섯의 양분을 옮겨 온 것
  addSpore(x, y, pool = 3, fromFruit = false) {
    if (this.colonies.length >= COLONY_HUES.length) return null;
    const cid = this.colonies.length;
    this.colonies.push({ id: cid, hue: COLONY_HUES[cid], pool, tips: 0, nodes: 0, root: -1,
      matArea: 0, areaHist: [], fruiting: false, budget: 0, nextFlush: 0, income: 0, cost: 0, netEMA: 0, netPeak: 0, costEMA: 0, matWant: 0, matScale: 1 });
    if (!fromFruit) this.ledger.input += pool;
    const root = this.addNode(x, y, -1, cid, 0);
    this.colonies[cid].root = root;
    this.D[root] = 1;
    const n = 5 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) this.spawnTip(root, cid, (k / n) * Math.PI * 2 + Math.random() * 0.4);
    return this.colonies[cid];
  }

  spawnTip(node, col, th) {
    // 먹이 안에서 태어난 가지는 이미 '먹이 안'이다 → 새로 먹이에 들어선 팁만 신호를 보낸다
    const inFood = this.field[this.fieldIndex(this.x[node], this.y[node])] > 0.15;
    this.tips.push({ id: this.nextTipId++, node, th, col, age: 0, starve: 0, alive: true,
      inFood, hit: false, boost: 0 });
    this.isTip[node] = 1;
    this.colonies[col].tips++;
  }

  killTip(tp) {
    if (!tp.alive) return;
    tp.alive = false;
    this.isTip[tp.node] = 0;
    this.colonies[tp.col].tips--;
  }

  addFusion(a, b) {
    if (this.fCount >= FUSION_CAP || this.nfu[a] === 255 || this.nfu[b] === 255) return;
    const e = this.fCount++;
    this.fa[e] = a; this.fb[e] = b;
    this.fD[e] = 0.35; this.fQ[e] = 0;
    this.nfu[a]++; this.nfu[b]++;
  }

  removeFusion(e) {
    this.nfu[this.fa[e]]--; this.nfu[this.fb[e]]--;
    const last = --this.fCount;
    this.fa[e] = this.fa[last]; this.fb[e] = this.fb[last];
    this.fD[e] = this.fD[last]; this.fQ[e] = this.fQ[last];
  }

  prune(i) {
    this.alive[i] = 0;
    this.liveNodes--;
    this.colonies[this.col[i]].nodes--;
    const pi = this.par[i];
    if (pi >= 0 && this.nch[pi] > 0) this.nch[pi]--;
    const di = this.densIndex(this.x[i], this.y[i]);
    if (this.dens[di] > 0) this.dens[di]--;
    const oi = this.occIndex(this.x[i], this.y[i]);
    if (this.occ[oi] === i) this.occ[oi] = -1;
    // 자가분해(autolysis): 버린 균사의 일부를 회수, 나머지는 호흡
    const g = this.p.growCost;
    this.colonies[this.col[i]].pool += g * this.p.recycle;
    this.ledger.respired += g * (1 - this.p.recycle);
    this.netBiomass -= g;
  }

  // ---------- 기본 단위: 균사 팁 하나의 한 걸음 ----------

  growTip(tp) {
    const p = this.p;
    const colony = this.colonies[tp.col];
    const i = tp.node;
    if (colony.pool < p.growCost || this.full) {
      if (++tp.starve > 90) this.killTip(tp);
      return;
    }

    // 1) 감지 & 조향: 좌/우 탐침의 매력도 차이만큼 휜다
    const x0 = this.x[i], y0 = this.y[i];
    let th = tp.th;
    const sd = p.senseDist, sa = p.senseAngle;
    const sL = this.sense(x0 + sd * Math.cos(th - sa), y0 + sd * Math.sin(th - sa));
    const sR = this.sense(x0 + sd * Math.cos(th + sa), y0 + sd * Math.sin(th + sa));
    const turn = Math.max(-p.maxTurn, Math.min(p.maxTurn, p.turnGain * (sR - sL)));
    th += turn + (Math.random() * 2 - 1) * p.noise;

    // 2) 성장
    const nx = x0 + p.step * Math.cos(th);
    const ny = y0 + p.step * Math.sin(th);
    if (nx < 1 || ny < 1 || nx > this.W - 1 || ny > this.H - 1) { this.killTip(tp); return; }

    // 3) 접촉: 같은 군체면 융합(고리 생성), 다른 군체면 대치선에서 멈춤
    if (tp.age > 6) {
      const hit = this.contact(nx, ny, tp);
      if (hit >= 0) {
        if (this.col[hit] === tp.col) this.addFusion(i, hit);
        else this.clashes++;
        this.killTip(tp);
        return;
      }
    }

    const m = this.addNode(nx, ny, i, tp.col, tp.id);
    if (m < 0) { this.full = true; return; }
    this.bal[m] += p.growCost;
    colony.pool -= p.growCost;
    this.netBiomass += p.growCost;
    this.isTip[i] = 0;
    this.isTip[m] = 1;
    tp.node = m; tp.th = th; tp.age++; tp.starve = 0;

    // 4) 분기: 양분이 풍부한 곳일수록 촘촘하게 (탐색 ↔ 착취 전환)
    const f = this.field[this.fieldIndex(nx, ny)];
    // 아직 아무도 차지하지 않은 먹이에 처음 닿은 팁은 스파이크를 쏜다 ("새 먹이 발견")
    if (f > 0.35 && !tp.inFood) {
      tp.inFood = true;
      if (this.dens[this.densIndex(nx, ny)] <= 2) { this.foodSignals++; this.stimulate(m, 'food'); }
    } else if (f < 0.15) tp.inFood = false;
    const boost = tp.boost > 0 ? 1 + p.spikeResponse : 1;
    if (tp.boost > 0) tp.boost--;
    if (colony.tips < p.maxTipsPerColony && Math.random() < p.branch * (0.3 + 2.5 * f) * boost) {
      this.branchBehind(m, tp.col);
    }
  }

  // 팁 몇 마디 뒤에서 옆으로 새 팁을 낸다 (subapical lateral branching)
  branchBehind(m, col) {
    let k = m;
    for (let s = 0; s < 5; s++) { k = this.par[k]; if (k < 0) return; }
    const pk = this.par[k];
    if (pk < 0 || this.isTip[k] || this.nch[k] !== 1) return;
    if (this.dens[this.densIndex(this.x[k], this.y[k])] > 6) return;
    const hd = Math.atan2(this.y[k] - this.y[pk], this.x[k] - this.x[pk]);
    const side = Math.random() < 0.5 ? -1 : 1;
    this.spawnTip(k, col, hd + side * (0.75 + Math.random() * 0.55));
  }

  contact(nx, ny, tp) {
    const ox = (nx / OCC_CELL) | 0, oy = (ny / OCC_CELL) | 0;
    const fd2 = this.p.fuseDist * this.p.fuseDist;
    let anc = null;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = oy + dy;
      if (cy < 0 || cy >= this.OH) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ox + dx;
        if (cx < 0 || cx >= this.OW) continue;
        const h = this.occ[cy * this.OW + cx];
        if (h < 0 || !this.alive[h]) continue;
        const ddx = this.x[h] - nx, ddy = this.y[h] - ny;
        if (ddx * ddx + ddy * ddy > fd2) continue;
        if (this.col[h] !== tp.col) return h;
        if (this.owner[h] === tp.id) continue;
        if (!anc) {
          anc = [];
          for (let a = tp.node, s = 0; a >= 0 && s < 12; s++) { anc.push(a); a = this.par[a]; }
        }
        if (anc.includes(h)) continue;
        return h;
      }
    }
    return -1;
  }

  // ---------- 수송: 키르히호프 회로 ----------
  //
  // 간선 흐름 Q = g ΔP (g = D + ε), 노드마다 (들어온 흐름 − 나간 흐름) = b_i (소비량).
  // 군체마다 뿌리(포자)를 P = 0으로 접지하고, 뿌리가 저장고와 차액을 주고받는다.
  //
  // 노드 수만 개를 통째로 풀지 않는다. 트리 간선의 흐름은
  //     Q_i = T_i + X_i      T_i = 서브트리 소비 합 (바로 계산됨),  X_i = 서브트리에서 융합 간선으로 빠져나가는 양
  // 이고, X가 0이 아닌 곳은 융합 간선 끝점들을 잇는 경로뿐이다. 그래서
  //   1) 융합 끝점 + 그 경로들이 갈라지는 분기점만 남기고 (축약 그래프, 보통 수천 개 이하)
  //   2) 그 사이 사슬은 직렬 저항 R과 부하 항 A로 접어서
  //   3) 축약 그래프를 최소 차수 순서 가우스 소거로 정확히 푼 뒤
  //   4) X를 사슬과 서브트리로 되돌려 모든 간선의 Q를 채운다.
  // 키르히호프 전류 법칙(노드)과 전압 법칙(고리) 둘 다 정확히 만족한다.

  rebuildOrder() {
    const n = this.count, { alive, par, kidStart, kids, order, stamp } = this;
    kidStart.fill(0, 0, n + 1);
    for (let i = 0; i < n; i++) if (alive[i] && par[i] >= 0) kidStart[par[i] + 1]++;
    for (let i = 0; i < n; i++) kidStart[i + 1] += kidStart[i];
    const cursor = stamp;  // 임시 작업 공간으로 빌려 쓴다
    for (let i = 0; i < n; i++) cursor[i] = kidStart[i];
    for (let i = 0; i < n; i++) if (alive[i] && par[i] >= 0) kids[cursor[par[i]]++] = i;
    let len = 0;
    for (let i = 0; i < n; i++) if (alive[i] && par[i] < 0) order[len++] = i;
    for (let h = 0; h < len; h++) {
      const v = order[h];
      for (let k = kidStart[v]; k < kidStart[v + 1]; k++) order[len++] = kids[k];
    }
    this.orderLen = len;
    this.orderDirty = false;
    stamp.fill(0, 0, n);
    this.stampId = 0;
  }

  // 고리 경쟁: 융합 간선이 자기 고리 위 가장 약한 트리 간선보다 충분히 굵어지면 둘의 역할을 바꾼다.
  // 밀려난 약한 길은 융합 간선이 되어 가늘어지다 끊기고, 그 뒤로 말단부터 후퇴한다.
  rebalanceLoops() {
    const { par, D, fa, fb, fD, stamp } = this;
    for (let e = 0; e < this.fCount; e++) {
      if (fD[e] < 0.1) continue;
      const a = fa[e], b = fb[e];
      const id = ++this.stampId;
      let steps = 0;
      for (let v = a; v >= 0 && steps < 4000; v = par[v], steps++) stamp[v] = id;
      let lca = b;
      for (steps = 0; lca >= 0 && stamp[lca] !== id && steps < 4000; lca = par[lca], steps++);
      if (lca < 0 || stamp[lca] !== id) continue;
      let minD = Infinity, c = -1, onA = true;
      for (let v = a; v !== lca; v = par[v]) if (D[v] < minD) { minD = D[v]; c = v; onA = true; }
      for (let v = b; v !== lca; v = par[v]) if (D[v] < minD) { minD = D[v]; c = v; onA = false; }
      if (c < 0 || fD[e] < this.p.swapRatio * minD) continue;
      this.swapEdge(e, onA ? a : b, onA ? b : a, c);
    }
  }

  // 융합 간선 e = (u, w)를 트리 간선 (w → u)로, 트리 간선 (par[c] → c)를 융합 간선으로 바꾼다.
  // c는 u에서 뿌리 쪽으로 올라가는 경로 위에 있으므로, u → c 경로의 부모 방향을 뒤집는다.
  swapEdge(e, u, w, c) {
    const { par, D, Q, nch, nfu, fa, fb, fD, fQ } = this;
    const oldPar = par[c], oldD = D[c], oldQ = Q[c];
    let prev = w, prevD = fD[e], prevQ = fa[e] === u ? -fQ[e] : fQ[e];  // Q는 부모 → 자식 방향
    for (let v = u; ; ) {
      const next = par[v], vD = D[v], vQ = Q[v];
      par[v] = prev; D[v] = prevD; Q[v] = prevQ;
      if (v === c) break;
      prev = v; prevD = vD; prevQ = -vQ;
      v = next;
    }
    fa[e] = c; fb[e] = oldPar; fD[e] = oldD; fQ[e] = -oldQ;
    nch[w]++; nch[oldPar]--;
    if (u !== c) { nch[u]++; nch[c]--; }
    nfu[u]--; nfu[w]--; nfu[c]++; nfu[oldPar]++;
    this.swaps++;
    this.orderDirty = true;
  }

  solveFlow() {
    if (this.orderDirty) this.rebuildOrder();
    const n = this.count;
    const { alive, par, bal, D, Q, nfu, order, orderLen, T, X, mchild, mbot, bot, needed,
      accA, accR, top, rid, fa, fb, fD, fQ } = this;

    // 1) 뒤에서부터: 서브트리 소비 합 T, 융합 끝점을 품은 자식 수, 축약 그래프에 남길 노드 판정
    T.fill(0, 0, n);
    mchild.fill(0, 0, n);
    for (let k = orderLen - 1; k >= 0; k--) {
      const i = order[k];
      if (!alive[i]) continue;
      T[i] += bal[i];
      const marked = nfu[i] > 0;
      needed[i] = par[i] < 0 || marked || mchild[i] >= 2 ? 1 : 0;
      bot[i] = needed[i] ? i : mchild[i] === 1 ? mbot[i] : -1;  // 아래쪽에서 이 사슬을 끝내는 남길 노드
      const pi = par[i];
      if (pi >= 0) {
        T[pi] += T[i];
        if (bot[i] >= 0) { mchild[pi]++; mbot[pi] = bot[i]; }
      }
    }

    // 2) 앞에서부터: 사슬을 직렬 저항 R과 부하 항 A = Σ T/g 로 접는다
    let m = 0;
    for (let k = 0; k < orderLen; k++) {
      const i = order[k];
      if (!alive[i]) continue;
      const pi = par[i];
      rid[i] = needed[i] && pi >= 0 ? m++ : -1;
      if (pi < 0 || bot[i] < 0) continue;
      const r = 1 / (D[i] + G_EPS);
      if (needed[pi]) { accA[i] = T[i] * r; accR[i] = r; top[i] = pi; }
      else { accA[i] = accA[pi] + T[i] * r; accR[i] = accR[pi] + r; top[i] = top[pi]; }
    }
    this.coreSize = m;

    // 3) 축약 그래프: 사슬 = 저항 R의 간선 + 오른쪽 변 항, 융합 간선은 그대로. 뿌리(P = 0)는 소거.
    const diag = new Float64Array(m), rhs = new Float64Array(m);
    const off = new Array(m);
    for (let j = 0; j < m; j++) off[j] = new Map();
    const link = (a, b, g) => {
      off[a].set(b, (off[a].get(b) || 0) - g);
      off[b].set(a, (off[b].get(a) || 0) - g);
    };
    for (let k = 0; k < orderLen; k++) {
      const u = order[k], ru = rid[u];
      if (ru < 0 || !alive[u]) continue;
      const g = 1 / accR[u], rv = rid[top[u]], a = accA[u] * g;
      diag[ru] += g;
      rhs[ru] -= a;
      if (rv >= 0) { diag[rv] += g; rhs[rv] += a; link(ru, rv, g); }
    }
    for (let e = 0; e < this.fCount; e++) {
      const ra = rid[fa[e]], rb = rid[fb[e]], g = fD[e] + G_EPS;
      if (ra >= 0) diag[ra] += g;
      if (rb >= 0) diag[rb] += g;
      if (ra >= 0 && rb >= 0) link(ra, rb, g);
    }
    const Pc = this.eliminate(m, diag, rhs, off);

    // 4) 되돌리기: 남긴 노드마다 X, 사슬은 아래쪽 끝의 X를 공유, 나머지는 X = 0
    for (let k = 0; k < orderLen; k++) {
      const u = order[k], ru = rid[u];
      if (ru < 0 || !alive[u]) continue;
      const rv = rid[top[u]];
      X[u] = ((rv >= 0 ? Pc[rv] : 0) - Pc[ru] - accA[u]) / accR[u];
    }
    for (let i = 0; i < n; i++) {
      Q[i] = alive[i] && par[i] >= 0 ? T[i] + (bot[i] >= 0 ? X[bot[i]] : 0) : 0;
    }
    for (let e = 0; e < this.fCount; e++) {
      const ra = rid[fa[e]], rb = rid[fb[e]];
      fQ[e] = (fD[e] + G_EPS) * ((ra >= 0 ? Pc[ra] : 0) - (rb >= 0 ? Pc[rb] : 0));
    }
  }

  // 대칭 양의 정부호 희소 행렬의 가우스 소거 (최소 차수 순서 → 채움이 적다)
  eliminate(m, diag, rhs, off) {
    // 힙 원소는 (차수, 노드)를 숫자 하나로: 차수 * 2^21 + 노드
    const SHIFT = 2097152;
    const heap = [];
    const push = (deg, v) => {
      heap.push(deg * SHIFT + v);
      for (let c = heap.length - 1; c > 0; ) {
        const p = (c - 1) >> 1;
        if (heap[p] <= heap[c]) break;
        const t = heap[p]; heap[p] = heap[c]; heap[c] = t;
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let c = 0; ; ) {
          const l = 2 * c + 1, r = l + 1;
          let s = c;
          if (l < heap.length && heap[l] < heap[s]) s = l;
          if (r < heap.length && heap[r] < heap[s]) s = r;
          if (s === c) break;
          const t = heap[s]; heap[s] = heap[c]; heap[c] = t;
          c = s;
        }
      }
      return top;
    };
    const done = new Uint8Array(m);
    for (let v = 0; v < m; v++) push(off[v].size, v);
    const steps = [];
    while (heap.length) {
      const key = pop(), v = key % SHIFT;
      if (done[v] || (key - v) / SHIFT !== off[v].size) continue;
      done[v] = 1;
      const nb = [...off[v]], piv = diag[v], rv = rhs[v];
      for (const [a, av] of nb) {
        const f = av / piv;
        diag[a] -= f * av;
        rhs[a] -= f * rv;
        off[a].delete(v);
      }
      for (let x = 0; x < nb.length; x++) {
        const [a, av] = nb[x];
        for (let y = x + 1; y < nb.length; y++) {
          const [b, bv] = nb[y];
          const val = -av * bv / piv;
          off[a].set(b, (off[a].get(b) || 0) + val);
          off[b].set(a, (off[b].get(a) || 0) + val);
        }
      }
      for (const [a] of nb) push(off[a].size, a);
      steps.push(v, nb, piv, rv);
    }
    const P = new Float64Array(m);
    for (let s = steps.length - 4; s >= 0; s -= 4) {
      const v = steps[s], nb = steps[s + 1];
      let acc = steps[s + 3];
      for (const [a, av] of nb) acc -= av * P[a];
      P[v] = acc / steps[s + 2];
    }
    return P;
  }

  // ---------- 한 tick ----------

  tick() {
    const p = this.p;
    const { alive, bal, par, D, Q } = this;
    this.t++;

    // 흡수 & 유지비
    const n0 = this.count;
    for (let i = 0; i < n0; i++) {
      if (!alive[i]) continue;
      const fi = this.fieldIndex(this.x[i], this.y[i]);
      const before = this.field[fi];
      this.field[fi] = before - before * p.absorb;
      const a = before - this.field[fi];  // float32에서 실제로 빠진 만큼
      const colony = this.colonies[this.col[i]];
      // 파산한 군체는 유지비를 못 낸다 → 유지비 흐름이 사라져 굵기가 줄고, 결국 가지치기된다
      const m = colony.pool > 0 ? p.maintain * (0.5 + D[i]) : 0;
      bal[i] = m - a;
      colony.pool += a - m;
      colony.income += a; colony.cost += m;
      this.ledger.respired += m;
    }

    // 토양 재생
    if (p.regen > 0) {
      const { field, base } = this;
      let added = 0;
      for (let k = 0; k < field.length; k++) {
        if (field[k] >= base[k]) continue;
        const before = field[k];
        field[k] = before + p.regen * (base[k] - before);
        added += field[k] - before;
      }
      this.ledger.regen += added;
    }

    // 휴면 발아: 기존 균사가 풍부한 양분에 닿아 있거나, 군체에 잉여 양분이 넉넉하면 새 팁이 돋는다
    for (let s = 0; s < 24 && n0 > 0; s++) {
      const i = (Math.random() * n0) | 0;
      if (!alive[i] || this.isTip[i] || this.nch[i] > 2 || par[i] < 0) continue;
      const colony = this.colonies[this.col[i]];
      if (colony.pool < 0.5 || colony.tips >= p.maxTipsPerColony) continue;
      const rich = this.field[this.fieldIndex(this.x[i], this.y[i])] > 0.25;
      if (!rich && !(colony.pool > 3 && Math.random() < 0.05)) continue;
      if (this.dens[this.densIndex(this.x[i], this.y[i])] > 4) continue;
      this.spawnTip(i, this.col[i], Math.random() * Math.PI * 2);
    }

    // 팁 성장 (순서 편향을 없애려고 무작위 오프셋에서 시작)
    const L = this.tips.length;
    const off = (Math.random() * L) | 0;
    for (let j = 0; j < L; j++) {
      const tp = this.tips[(j + off) % L];
      if (tp.alive) this.growTip(tp);
    }
    this.tips = this.tips.filter((tp) => tp.alive);

    // 전기 신호
    if (Math.random() < p.spontaneous && this.liveNodes > 50) {
      for (let tries = 0; tries < 20; tries++) {
        const i = (Math.random() * this.count) | 0;
        if (this.alive[i]) { this.stimulate(i, 'spont'); break; }
      }
    }
    this.stepElectric();
    for (const tp of this.tips) {
      const v = this.V[tp.node];
      if (v > 0.5 && !tp.hit) { tp.hit = true; tp.boost = 40; }
      else if (v < 0.1) tp.hit = false;
    }
    this.trace[this.traceIdx] = this.probe >= 0 && alive[this.probe] ? this.V[this.probe] : NaN;
    this.traceIdx = (this.traceIdx + 1) % TRACE_LEN;

    // 매트 · 버섯 · 포자: 그 부하(bal)가 아래 회로 풀이에 함께 들어간다
    this.stepMat();
    this.stepFruits();
    this.stepSpores();

    // 수송 & 적응
    if (this.t % 8 === 0) this.rebalanceLoops();
    if (this.t % p.flowEvery === 0) this.solveFlow();
    const n = this.count;
    const Q0 = p.flowScale, mu = p.flowExp;
    const target = (q) => { const r = Math.pow(Math.abs(q) / Q0, mu); return r / (1 + r); };
    const pending = [];
    for (let i = 0; i < n; i++) {
      if (!alive[i] || par[i] < 0) continue;
      D[i] += p.adapt * (target(Q[i]) - D[i]);
      if (!this.isTip[i] && !this.pinned[i] && this.nch[i] === 0 && this.nfu[i] === 0 &&
          D[i] < p.pruneBelow && this.t - this.born[i] > 60) {
        pending.push(i);
      }
    }
    // 고리 경쟁: 흐름을 못 받는 융합 간선은 가늘어지다 끊긴다
    const { fD, fQ } = this;
    for (let e = this.fCount - 1; e >= 0; e--) {
      fD[e] += p.adapt * (target(fQ[e]) - fD[e]);
      if (fD[e] < p.pruneBelow) this.removeFusion(e);
    }
    // 같은 tick 안에서 연쇄 가지치기가 일어나지 않도록 모아서 적용 (한 tick에 한 마디씩 후퇴)
    for (const i of pending) this.prune(i);

    if (this.count > this.cap * 0.9) this.compact();
  }

  // ---------- 전기 신호 ----------

  // 노드 주변을 (부모·자식 양방향으로) 한 덩어리 흥분시킨다. 결합이 강할수록 이웃이 전류를 빨아가므로
  // 불이 붙으려면 전기적 길이 λ ∝ √k 만큼은 한꺼번에 흥분해야 한다 (임계 핵).
  // kind: 'user' (클릭) · 'spont' (자발 발화) · 'food' (새 먹이 발견)
  stimulate(i, kind = 'user') {
    this.rebuildOrder();  // 마지막 재구성 뒤에 생긴 노드까지 자식 목록에 넣는다 (자극은 드물어서 O(N)이어도 괜찮다)
    const { par, kids, kidStart, alive, V, Wr } = this;
    const radius = Math.ceil(2 * Math.sqrt(this.p.elecCoupling));  // 마디 수로 잰 반경 (허브에서는 모든 방향으로)
    const seen = new Map([[i, 0]]), queue = [i];
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h], d = seen.get(v);
      if (d >= radius) continue;
      const nb = par[v] >= 0 ? [par[v]] : [];
      for (let k = kidStart[v]; k < kidStart[v + 1]; k++) nb.push(kids[k]);
      for (const u of nb) if (alive[u] && !seen.has(u)) { seen.set(u, d + 1); queue.push(u); }
    }
    let fired = 0;
    for (const v of queue) if (Wr[v] < 0.1) { V[v] = 1; fired++; }  // 불응기 중이면 반응하지 않는다
    this.spikes++;
    if (this.events.length < 64) this.events.push({ kind, x: this.x[i], y: this.y[i], size: fired });
  }

  // 반응 항은 명시적, 트리 결합은 암묵적 (I − dt·k·L_tree) v = rhs 를 잎 → 뿌리 소거, 뿌리 → 잎 대입으로 푼다.
  // 신경 시뮬레이터 NEURON이 가지 친 뉴런에 쓰는 Hines(1984) 방법과 같다. 융합 간선은 반쯤 암묵적으로 더한다.
  stepElectric() {
    if (this.orderDirty) this.rebuildOrder();
    const p = this.p, n = this.count;
    const { alive, par, D, V, Wr, eg, er, order, orderLen, fa, fb, fD } = this;
    const k = p.elecCoupling, dt = p.elecDt, g0 = p.elecBase;
    const { alpha, c, gamma } = FHN, eps = p.elecRecovery;
    for (let s = 0; s < p.elecSubsteps; s++) {
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        const v = V[i], w = Wr[i];
        er[i] = v + dt * (c * v * (v - alpha) * (1 - v) - w);
        eg[i] = 1;
        Wr[i] = w + dt * eps * (gamma * v - w);
      }
      // 융합 간선: 자기 쪽은 암묵적(대각), 상대 쪽 값은 직전 값 → 이웃의 가중 평균이 되어 항상 안정
      for (let e = 0; e < this.fCount; e++) {
        const a = fa[e], b = fb[e], g = dt * k * p.fusionConduct * (g0 + fD[e]);
        eg[a] += g; er[a] += g * V[b];
        eg[b] += g; er[b] += g * V[a];
      }
      for (let i = 0; i < n; i++) {
        if (!alive[i] || par[i] < 0) continue;
        const a = dt * k * (g0 + D[i]);
        eg[i] += a;
        eg[par[i]] += a;
      }
      for (let q = orderLen - 1; q >= 0; q--) {
        const i = order[q], pi = par[i];
        if (!alive[i] || pi < 0) continue;
        const a = dt * k * (g0 + D[i]), f = a / eg[i];
        eg[pi] -= f * a;
        er[pi] += f * er[i];
      }
      for (let q = 0; q < orderLen; q++) {
        const i = order[q], pi = par[i];
        if (!alive[i]) continue;
        V[i] = pi < 0 ? er[i] / eg[i] : (er[i] + dt * k * (g0 + D[i]) * V[pi]) / eg[i];
      }
    }
  }

  nearestNode(x, y, maxDist = 14) {
    let best = -1, bd = maxDist * maxDist;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const dx = this.x[i] - x, dy = this.y[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  setProbe(x, y) {
    const i = this.nearestNode(x, y);
    if (i < 0) return false;
    this.probe = i;
    this.trace.fill(NaN);
    return true;
  }

  stimulateAt(x, y) {
    const i = this.nearestNode(x, y);
    if (i >= 0) this.stimulate(i, 'user');
    return i >= 0;
  }

  // 죽은 노드를 걷어내고 배열을 앞으로 당긴다 (부모 포인터와 융합 간선, 팁, 전극은 새 번호로 옮긴다)
  compact() {
    const n = this.count;
    const remap = new Int32Array(n);
    const arrays = [this.x, this.y, this.par, this.col, this.alive, this.isTip,
      this.nch, this.nfu, this.D, this.Q, this.born, this.owner, this.V, this.Wr, this.pinned];
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) { remap[i] = -1; continue; }
      remap[i] = j;
      if (i !== j) for (const arr of arrays) arr[j] = arr[i];
      j++;
    }
    for (let k = 0; k < j; k++) if (this.par[k] >= 0) this.par[k] = remap[this.par[k]];
    this.alive.fill(0, j, n);
    this.count = j;
    for (const tp of this.tips) tp.node = remap[tp.node];
    if (this.probe >= 0) this.probe = this.probe < n ? remap[this.probe] : -1;
    // 융합 간선이 붙은 노드는 가지치기되지 않으므로 끝점은 항상 살아있다
    for (let e = 0; e < this.fCount; e++) {
      this.fa[e] = remap[this.fa[e]];
      this.fb[e] = remap[this.fb[e]];
    }
    const re = (v) => (v >= 0 && v < n ? remap[v] : -1);
    for (let k = 0; k < this.frep.length; k++) { this.frep[k] = re(this.frep[k]); this.matRep[k] = re(this.matRep[k]); }
    for (const c of this.colonies) c.root = remap[c.root];  // 뿌리는 가지치기되지 않는다
    for (const f of this.fruits) f.node = re(f.node);       // 버섯 노드는 고정(pinned)이라 살아있다
    this.occ.fill(-1);
    for (let k = 0; k < j; k++) this.occ[this.occIndex(this.x[k], this.y[k])] = k;
    this.orderDirty = true;
    if (j > this.cap * 0.85) this.full = true;
  }

  stats() {
    let pool = 0;
    for (const c of this.colonies) pool += c.pool;
    let loopsUsed = 0;
    for (let e = 0; e < this.fCount; e++) if (this.fD[e] > 0.35) loopsUsed++;
    return {
      t: this.t,
      tips: this.tips.length,
      nodes: this.liveNodes,
      colonies: this.colonies.length,
      fusions: this.fCount,
      loopsUsed,
      clashes: this.clashes,
      pool,
      core: this.coreSize,
      swaps: this.swaps,
      spikes: this.spikes,
      foodSignals: this.foodSignals,
      matCover: this.matCover(),
      fruits: this.fruits.filter((f) => f.stage !== STAGE.DONE).length,
      fruitsTotal: this.fruitCount,
      sporeColonies: this.sporeColonies,
    };
  }

  // 매트가 덮은 비율 (m > 0.3인 칸)
  matCover() {
    let k = 0;
    for (let i = 0; i < this.mat.length; i++) if (this.mat[i] > 0.3) k++;
    return k / this.mat.length;
  }

  // ---------- 균사 매트 ----------

  // 칸 i의 매트 부하를 붙일 군체 o의 노드: 칸의 명시적 노드 → 물려받은 노드 → 뿌리
  loadNode(i, o) {
    const { alive, col } = this;
    let r = this.frep[i];
    if (r >= 0 && alive[r] && col[r] === o) return r;
    r = this.matRep[i];
    if (r >= 0 && alive[r] && col[r] === o) return r;
    return this.colonies[o].root;
  }

  // 명시적 오일러 한 걸음. 확산은 이전 tick의 칸 주인으로 막고 열어서 쌍마다 대칭 → Σm 보존 (자람 · 분해만 Σm을 바꾼다)
  stepMat() {
    const p = this.p, { FW, FH, mat, matNext: next, matOwner: own, ownPrev, matRep, frep, field, bal, col, alive, colonies, ledger } = this;
    const Dmax = Math.min(p.matSpread, MAT_D_MAX), r = p.matGrowth, s = p.matSeed, K = p.matHalfN, cost = p.matCost;
    ownPrev.set(own);
    // 군체마다 퍼짐 계수. 칸 사이 흐름은 두 칸 계수의 평균으로 → 쌍마다 대칭이라 Σm 보존, 평균 ≤ Dmax라 안정 조건도 그대로
    const Dc = colonies.map((c) => Dmax * Math.max(0, c.pool) / (Math.max(0, c.pool) + MAT_P_HALF));
    const Dof = (o) => (o >= 0 ? Dc[o] : 0);
    // 자람 투자 한도: 지난 tick에 모든 칸이 원한 양(matWant)이 α·(P − 비축)을 넘으면 모든 칸을 같은 비율로 줄인다 (칸 순서 편향 없음)
    for (const c of colonies) {
      const cap = MAT_ALLOC * Math.max(0, c.pool - MAT_RESERVE);
      c.matScale = c.matWant > cap ? cap / c.matWant : 1;
      c.matWant = 0;
      c.matArea = 0;
    }
    for (let fy = 0; fy < FH; fy++) {
      for (let fx = 0; fx < FW; fx++) {
        const i = fy * FW + fx, m = mat[i], op = ownPrev[i];
        // 확산: 경계 밖과 다른 군체 칸으로는 흐름 없음 (영 플럭스)
        let flux = 0, src = -1, srcM = 0;
        const Di = Dof(op);
        for (let k = 0; k < 4; k++) {
          const jx = fx + (k === 0 ? 1 : k === 1 ? -1 : 0), jy = fy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (jx < 0 || jy < 0 || jx >= FW || jy >= FH) continue;
          const j = jy * FW + jx, oj = ownPrev[j];
          if (op >= 0 && oj >= 0 && oj !== op) continue;
          flux += 0.5 * (Di + Dof(oj)) * (mat[j] - m);
          if (oj >= 0 && mat[j] > srcM) { srcM = mat[j]; src = j; }
        }
        let nm = m + flux;
        // 칸 차지: 명시적 균사가 지나갔거나(씨), 이웃 매트가 번져 왔으면
        let o = own[i];
        const e = frep[i];
        const seeded = e >= 0 && alive[e] && (o < 0 || col[e] === o);
        if (o < 0 && nm > MAT_MIN) {
          if (seeded) o = col[e];
          else if (src >= 0) o = ownPrev[src];
          if (o >= 0) { own[i] = o; matRep[i] = seeded ? e : matRep[src]; }
        }
        if (o < 0 && seeded) { o = col[e]; own[i] = o; }
        if (o < 0) { next[i] = nm; continue; }
        if (seeded) matRep[i] = e;
        const colony = colonies[o], node = this.loadNode(i, o), N = field[i];
        // 자람 (저장고에서 비용, 그 양분이 이 노드까지 회로로 흘러온다). 결실 중엔 영양 생장을 멈춘다
        if (!colony.fruiting && colony.pool > MAT_RESERVE) {
          const g = (r * m * (1 - m) + (seeded ? s * (1 - m) : 0)) * N / (N + K);
          colony.matWant += g * cost;
          const pay = Math.min(g * cost * colony.matScale, colony.pool - MAT_RESERVE);
          if (pay > 0) { nm += pay / cost; colony.pool -= pay; bal[node] += pay; }
        }
        // 흡수
        if (m > 0) {
          const before = field[i];
          field[i] = before - before * p.matAbsorb * m;
          const a = before - field[i];
          colony.pool += a; bal[node] -= a; colony.income += a;
          // 유지비 (호흡)
          if (colony.pool > 0) { const c2 = p.matMaintain * m; colony.pool -= c2; bal[node] += c2; ledger.respired += c2; colony.cost += c2; }
          // 자가분해: 적자(순수입 < 0)면 그 비율만큼, 파산하면 최대로, 결실 중이면 추가로.
          // 회수한 양분은 이 노드에서 회로로 들어가 줄기 유지비나 버섯으로 흐른다
          const deficit = colony.pool <= 0 ? 1 : clampv(-colony.netEMA / (colony.costEMA || 1), 0, 1);
          const lam = MAT_STARVE * deficit + (colony.fruiting ? p.fruitAutolysis : 0);
          if (lam > 0) {
            const d = lam * m, back = d * cost * p.recycle;
            nm -= d; colony.pool += back; bal[node] -= back; ledger.respired += d * cost * (1 - p.recycle);
          }
        }
        if (nm < MAT_MIN) { ledger.respired += Math.max(0, nm) * cost; nm = 0; own[i] = -1; matRep[i] = -1; }
        next[i] = nm;
        colony.matArea += nm;
      }
    }
    this.mat = next; this.matNext = mat;
  }

  // ---------- 결실 (버섯) ----------

  // 결실 판정 (가설적 규칙): 양분 제한이 시작될 때 — 더 넓힐 곳이 없거나(최근 300 tick 매트 면적 증가율 < fruitSat)
  // 순수입이 최고치의 LIMIT_FRAC 아래로 떨어졌을 때(기질이 바닥나기 시작) — 저장 양분이 남아 있으면 결실한다.
  // 환경 신호(빛 · 온도 · CO₂)는 모델에 없다
  checkFlush(colony) {
    const h = colony.areaHist;
    h.push(colony.matArea);
    if (h.length > SAT_WINDOW) h.shift();
    if (colony.fruiting || this.t < colony.nextFlush || h.length < SAT_WINDOW) return;
    const A = colony.matArea;
    if (A < FLUSH_MIN_AREA || colony.pool < FLUSH_MIN_POOL) return;
    const saturated = (A - h[0]) / A < this.p.fruitSat, starving = colony.netEMA < LIMIT_FRAC * colony.netPeak;
    if (saturated || starving) this.startFlush(colony);
  }

  // 자리: 매트가 짙고 굵은 줄기(D 합)가 모이는 칸 — 균사가 뭉쳐 원기(hyphal knot)가 생기는 곳이라는 가정
  startFlush(colony) {
    const { FW, mat, matOwner: own, alive, col, D, cordScratch: cord } = this;
    cord.fill(0);
    for (let i = 0; i < this.count; i++) if (alive[i] && col[i] === colony.id) cord[this.fieldIndex(this.x[i], this.y[i])] += D[i];
    const cand = [];
    for (let i = 0; i < mat.length; i++) if (own[i] === colony.id && mat[i] > 0.5) cand.push(i);
    if (!cand.length) { colony.nextFlush = this.t + FLUSH_COOLDOWN / 4; return; }
    cand.sort((a, b) => mat[b] * (1 + cord[b]) - mat[a] * (1 + cord[a]));
    const budget = this.p.fruitShare * colony.pool;
    const k = clampv(Math.round(budget / FRUIT_UNIT), 1, 3);
    const sites = [];
    for (const i of cand) {
      if (sites.length >= k) break;
      const fx = i % FW, fy = (i / FW) | 0;
      if (sites.some((j) => Math.hypot(fx - (j % FW), fy - ((j / FW) | 0)) < FRUIT_SPACING)) continue;
      sites.push(i);
    }
    for (const i of sites) {
      const node = this.loadNode(i, colony.id);
      this.pinned[node] = 1;
      const f = { id: this.nextFruitId++, col: colony.id, node, x: this.x[node], y: this.y[node],
        target: budget / sites.length, biomass: 0, stage: STAGE.GROW, stall: 0, age: 0, sporeMass: 0, released: 0 };
      this.fruits.push(f);
      this.fruitCount++;
      if (this.events.length < 64) this.events.push({ kind: 'fruit', x: f.x, y: f.y, size: sites.length });
    }
    colony.fruiting = true;
    colony.budget = budget;
  }

  stepFruits() {
    const p = this.p, { bal, colonies, ledger } = this;
    for (const c of colonies) {
      c.netEMA += NET_EMA * (c.income - c.cost - c.netEMA);
      if (c.netEMA > c.netPeak) c.netPeak = c.netEMA;
      c.costEMA += NET_EMA * (c.cost - c.costEMA);
      c.income = 0; c.cost = 0;
    }
    if (this.t % SAT_EVERY === 0) for (const c of colonies) this.checkFlush(c);
    if (!this.fruits.length) return;

    // 자라는 버섯: 싱크 세기 ∝ 크기 · 남은 여지 (로지스틱). 군체 저장고 · 남은 예산 안에서 세기대로 나눈다 → 큰 것이 더 받는다
    const want = new Map();
    for (const f of this.fruits) {
      if (f.stage !== STAGE.GROW) continue;
      f.demand = p.fruitRate * (f.biomass + 0.02 * f.target) * (1 - f.biomass / f.target);
      want.set(f.col, (want.get(f.col) || 0) + f.demand);
    }
    for (const f of this.fruits) {
      f.age++;
      const colony = colonies[f.col];
      if (f.stage === STAGE.GROW) {
        const total = want.get(f.col), avail = Math.max(0, Math.min(colony.pool, colony.budget));
        const give = total > 0 ? f.demand * Math.min(1, avail / total) : 0;
        colony.pool -= give; colony.budget -= give; f.biomass += give;
        bal[f.node >= 0 ? f.node : colony.root] += give;
        f.stall = give < 1e-4 * f.target ? f.stall + 1 : 0;
        if (f.biomass >= 0.97 * f.target) {
          // 다 자람 → 포자 방출 시작
          f.stage = STAGE.SPORE;
          f.sporeMass = p.sporeYield * f.biomass;
          if (this.events.length < 64) this.events.push({ kind: 'spores', x: f.x, y: f.y, size: 1 });
        } else if (f.stall > FRUIT_STALL && f.biomass < 0.5 * f.target) {
          f.stage = STAGE.DONE;  // 원기가 말라 죽음 (abortion): 그대로 분해된다
        }
      } else if (f.stage === STAGE.SPORE) {
        if (Math.random() < SPORES_PER_FRUIT / SPORE_TICKS && f.released < SPORES_PER_FRUIT) {
          const mass = f.sporeMass / SPORES_PER_FRUIT;
          f.biomass -= mass;
          f.released++;
          const ang = Math.random() * Math.PI * 2, dist = -SPORE_MEAN * Math.log(1 - Math.random());
          this.spores.push({ x0: f.x, y0: f.y, x1: f.x + Math.cos(ang) * dist, y1: f.y + Math.sin(ang) * dist,
            t: 0, T: 40 + dist * 0.5, mass, col: f.col });
        }
        if (f.released >= SPORES_PER_FRUIT) f.stage = STAGE.DONE;
      } else {
        // 노화: 분해되어 토양으로 (일부는 분해자 호흡)
        const d = Math.min(f.biomass, FRUIT_DECAY * f.biomass + 1e-4);
        f.biomass -= d;
        this.decompose(f.x, f.y, d);
      }
    }
    // 다 분해된 버섯을 치우고, 군체마다 결실이 끝났으면 쉬는 시간
    this.fruits = this.fruits.filter((f) => {
      if (f.stage !== STAGE.DONE || f.biomass > 1e-6) return true;
      if (f.biomass > 0) this.decompose(f.x, f.y, f.biomass);
      if (f.node >= 0) this.pinned[f.node] = 0;
      return false;
    });
    for (const c of colonies) {
      if (!c.fruiting || this.fruits.some((f) => f.col === c.id && f.stage !== STAGE.DONE)) continue;
      c.fruiting = false;
      c.budget = 0;
      c.nextFlush = this.t + FLUSH_COOLDOWN;
      c.areaHist.length = 0;
    }
  }

  // 분해: 양분의 recycle 비율이 주변 3×3 칸의 토양으로, 나머지는 분해자의 호흡
  decompose(x, y, mass) {
    const { FW, FH, field, ledger } = this;
    const fx = clampv((x / FIELD_CELL) | 0, 1, FW - 2), fy = clampv((y / FIELD_CELL) | 0, 1, FH - 2);
    const each = mass * this.p.recycle / 9;
    let put = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = (fy + dy) * FW + fx + dx, before = field[i];
      field[i] = before + each;
      put += field[i] - before;
    }
    ledger.respired += mass - put;  // float32 반올림까지 포함해 장부를 정확히
  }

  // 포자: 날아가서(sp.t < sp.T) 착지하면 휴면. 그 칸에 매트가 없고 토양 양분이 있으면 확률적으로 싹터 새 군체가 된다
  // (포자는 감수분열로 생긴 새 개체 → 부모 군체와도 대치한다). 수명 안에 자리가 안 나면 분해
  stepSpores() {
    if (!this.spores.length) return;
    const keep = [];
    for (const sp of this.spores) {
      sp.t++;
      if (sp.t < sp.T) { keep.push(sp); continue; }
      const { x1: x, y1: y, mass } = sp;
      if (x < 1 || y < 1 || x > this.W - 1 || y > this.H - 1) { this.ledger.exported += mass; continue; }  // 화면 밖으로
      if (sp.t - sp.T > SPORE_LIFE) { this.decompose(x, y, mass); continue; }
      if ((sp.t - sp.T) % GERM_EVERY === 0) {
        const i = this.fieldIndex(x, y);
        if (this.matOwner[i] < 0 && this.field[i] > GERM_N && Math.random() < GERM_P && this.colonies.length < COLONY_HUES.length) {
          this.addSpore(x, y, mass, true);
          this.sporeColonies++;
          if (this.events.length < 64) this.events.push({ kind: 'germinate', x, y, size: 1 });
          continue;
        }
      }
      keep.push(sp);
    }
    this.spores = keep;
  }

  // 질량 장부 점검: 지금 있는 양 = 들어온 양 + 토양 재생 − 호흡 − 밖으로 나간 양
  massBalance() {
    let soil = 0, pool = 0, mat = 0, fruit = 0, spore = 0;
    for (let i = 0; i < this.field.length; i++) soil += this.field[i];
    for (const c of this.colonies) pool += c.pool;
    for (let i = 0; i < this.mat.length; i++) mat += this.mat[i];
    mat *= this.p.matCost;
    for (const f of this.fruits) fruit += f.biomass;
    for (const s of this.spores) spore += s.mass;
    const L = this.ledger;
    const stock = soil + pool + this.netBiomass + mat + fruit + spore;
    const expected = L.input + L.regen - L.respired - L.exported;
    return { soil, pool, network: this.netBiomass, mat, fruit, spore, stock, expected, err: stock - expected, rel: (stock - expected) / expected };
  }
}

if (typeof module !== 'undefined') module.exports = { Mycelium, FUNGI_DEFAULTS, UNITS };
