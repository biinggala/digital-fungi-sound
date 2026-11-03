'use strict';
// 렌더링 & UI — 모델은 mycelium.js, 소리는 sound.js, 문구는 i18n.js

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const fieldCanvas = document.createElement('canvas');
const fctx = fieldCanvas.getContext('2d');
const matCanvas = document.createElement('canvas');
const mctx = matCanvas.getContext('2d');

const ui = { paused: false, speed: 1, tool: 'spore', view: 'colony', transport: 'local', showField: true, showMat: true, frame: 0, fieldDirty: true };
const TUNABLE = ['branch', 'chemo', 'avoid', 'adapt', 'flowExp', 'spontaneous', 'elecRecovery', 'fusionConduct', 'spikeResponse',
  'matGrowth', 'matSpread', 'fruitSat', 'fruitShare'];

// D(전도도) 구간별 선 굵기/불투명도: 가는 탐색 균사 → 굵은 균사삭(cord)
const BUCKETS = [
  { width: 0.35, alpha: 0.22 },
  { width: 0.6, alpha: 0.4 },
  { width: 1.1, alpha: 0.65 },
  { width: 2.0, alpha: 0.9 },
];
const FLOW_COLORS = ['36, 95%, 62%', '192, 85%, 66%'];  // 공급(흡수) / 소비(성장)
const STYLE_COLOR = { lab: '--lab', eno: '--eno', moss: '--moss', greenhouse: '--green', aphex: '--aphex', sunra: '--sunra' };
const scope = $('scope');
const sctx = scope.getContext('2d');
const sound = new MyceliumSound();

let sim, W, H, dpr, fieldImg, matImg, matGrain;
// 카메라: 월드 → 무대. 기본은 무대를 꽉 채우는 배율(cover)이고, zoom은 그 배율에 곱한다.
// (cx, cy) = 무대 가운데에 오는 월드 좌표. 무대 크기가 바뀌어도(조절 바 접기) 이 점과 zoom을 지키면 화면이 자연스럽다
const view = { s: 1, ox: 0, oy: 0, zoom: 1, cx: 0, cy: 0 };
const ZOOM_MAX = 8;

function readParams() {
  const params = { transport: ui.transport };
  for (const k of TUNABLE) params[k] = parseFloat($(k).value);
  return params;
}

function fitCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = stage.clientWidth, vh = stage.clientHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  applyView();
}

// 채우기(cover) 배율, 그리고 월드 전체가 보이는 zoom (contain / cover)
const coverScale = () => Math.max(stage.clientWidth / W, stage.clientHeight / H);
const wholeZoom = () => Math.min(stage.clientWidth / W, stage.clientHeight / H) / coverScale();

function applyView() {
  const vw = stage.clientWidth, vh = stage.clientHeight;
  view.zoom = clamp(view.zoom, wholeZoom(), ZOOM_MAX);
  view.s = coverScale() * view.zoom;
  // 월드 가장자리에서 멈춘다: 월드가 무대보다 크면 무대를 늘 다 덮고, 작으면(전체 보기) 가운데
  const fit = (c, size, span) => {
    const o = span / 2 - c * view.s, w = size * view.s;
    return w >= span ? clamp(o, span - w, 0) : (span - w) / 2;
  };
  view.ox = fit(view.cx, W, vw);
  view.oy = fit(view.cy, H, vh);
  view.cx = (vw / 2 - view.ox) / view.s;  // 막힌 만큼 중심도 되돌려 둔다
  view.cy = (vh / 2 - view.oy) / view.s;
  $('zoom').textContent = `${view.zoom.toFixed(1)}×`;
  updateScaleBar();
}

// 무대 위 점 (sx, sy)를 고정한 채 배율을 f배로
function zoomAt(sx, sy, f) {
  const wx = (sx - view.ox) / view.s, wy = (sy - view.oy) / view.s;
  view.zoom *= f;
  view.zoom = clamp(view.zoom, wholeZoom(), ZOOM_MAX);
  const s = coverScale() * view.zoom;
  view.cx = wx - (sx - stage.clientWidth / 2) / s;
  view.cy = wy - (sy - stage.clientHeight / 2) / s;
  applyView();
}
function panBy(dx, dy) { view.cx -= dx / view.s; view.cy -= dy / view.s; applyView(); }
// 채우기 ↔ 전체 보기
function toggleFit() {
  const whole = wholeZoom();
  view.zoom = Math.abs(view.zoom - whole) < 0.01 ? 1 : whole;
  view.cx = W / 2; view.cy = H / 2;
  applyView();
}

function reset() {
  if (stage.clientWidth < 50 || stage.clientHeight < 50) return;  // 창이 잠깐 0 크기면 (숨은 창 등) 지금 월드를 그대로 둔다
  W = stage.clientWidth;
  H = stage.clientHeight;
  Object.assign(view, { zoom: 1, cx: W / 2, cy: H / 2 });
  fitCanvas();
  sim = new Mycelium(W, H, readParams());
  sim.seedField();
  sim.addSpore(W * 0.5, H * 0.5);
  lapse.t = 0; lapse.at = performance.now();
  fieldCanvas.width = sim.FW;
  fieldCanvas.height = sim.FH;
  fieldImg = fctx.createImageData(sim.FW, sim.FH);
  matCanvas.width = sim.FW;
  matCanvas.height = sim.FH;
  matImg = mctx.createImageData(sim.FW, sim.FH);
  matGrain = Float32Array.from({ length: sim.FW * sim.FH }, () => 0.72 + 0.28 * Math.random());  // 솜 같은 결
  ui.fieldDirty = true;
}

// 토양 양분: 격자 무늬 위에 반투명한 흙빛으로 (많을수록 진하게)
function paintField() {
  const d = fieldImg.data, f = sim.field;
  for (let i = 0; i < f.length; i++) {
    const k = Math.min(1, Math.sqrt(f[i] / 0.9));
    d[i * 4] = 150;
    d[i * 4 + 1] = 112;
    d[i * 4 + 2] = 62;
    d[i * 4 + 3] = 12 + 120 * k;
  }
  fctx.putImageData(fieldImg, 0, 0);
}

// 균사 매트: 군체 빛깔의 옅은 솜. 짙을수록 불투명 (결은 칸마다 고정된 무작위)
const hslRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
};
function paintMat() {
  const d = matImg.data, m = sim.mat, own = sim.matOwner;
  const rgb = sim.colonies.map((c) => hslRgb(c.hue, 0.22, 0.86));
  for (let i = 0; i < m.length; i++) {
    const o = own[i], j = i * 4;
    if (o < 0 || m[i] < 0.01) { d[j + 3] = 0; continue; }
    const c = rgb[o];
    d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2];
    d[j + 3] = 255 * 0.62 * Math.pow(m[i], 0.8) * matGrain[i];
  }
  mctx.putImageData(matImg, 0, 0);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  if (ui.showField) {
    if (ui.fieldDirty || ui.frame % 6 === 0) { paintField(); ui.fieldDirty = false; }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas, 0, 0, sim.FW * 5, sim.FH * 5);
  }
  if (ui.showMat) {
    if (ui.frame % 3 === 0 || ui.fieldDirty) paintMat();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(matCanvas, 0, 0, sim.FW * 5, sim.FH * 5);
  }

  // 균사: (그룹 × 굵기 구간)별 Path2D 하나로 묶어서 그린다. 선 굵기는 확대해도 화면에서 그대로 (÷ zoom)
  const { x, y, par, alive, D, Q, col } = sim;
  const lw = 1 / view.zoom;
  const flow = ui.view === 'flow';
  const paths = [];
  for (let i = 0; i < sim.count; i++) {
    if (!alive[i]) continue;
    const p = par[i];
    if (p < 0) continue;
    const d = D[i];
    const b = d < 0.12 ? 0 : d < 0.35 ? 1 : d < 0.65 ? 2 : 3;
    const g = flow ? (Q[i] < 0 ? 0 : 1) : col[i];
    const key = g * 4 + b;
    const path = paths[key] || (paths[key] = new Path2D());
    path.moveTo(x[p], y[p]);
    path.lineTo(x[i], y[i]);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let key = 0; key < paths.length; key++) {
    if (!paths[key]) continue;
    const g = (key / 4) | 0, bk = BUCKETS[key % 4];
    const hsl = flow ? FLOW_COLORS[g] : `${sim.colonies[g].hue}, 45%, 82%`;
    ctx.strokeStyle = `hsla(${hsl}, ${bk.alpha})`;
    ctx.lineWidth = bk.width * lw;
    ctx.stroke(paths[key]);
  }

  // 융합 간선 (anastomosis): 고리를 닫는 간선. 트리 간선처럼 흐름만큼 굵어지거나 끊긴다
  const fusion = [];
  for (let e = 0; e < sim.fCount; e++) {
    const a = sim.fa[e], b = sim.fb[e], d = sim.fD[e];
    const bk = d < 0.12 ? 0 : d < 0.35 ? 1 : d < 0.65 ? 2 : 3;
    const path = fusion[bk] || (fusion[bk] = new Path2D());
    path.moveTo(x[a], y[a]);
    path.lineTo(x[b], y[b]);
  }
  for (let bk = 0; bk < 4; bk++) {
    if (!fusion[bk]) continue;
    ctx.strokeStyle = `hsla(52, 95%, 70%, ${0.35 + 0.15 * bk})`;
    ctx.lineWidth = (BUCKETS[bk].width + 1) * lw;
    ctx.stroke(fusion[bk]);
  }

  // 전기 신호: 새 색을 얹지 않고 균사 자체가 변한다. 막 흥분한 앞쪽(V 높음)은 그 군체 빛깔로 밝아지며 조금 굵어지고,
  // 지나간 뒤 불응기(회복 변수 Wr 높음)에는 잠깐 어두워졌다가 Wr가 빠지는 만큼 천천히 돌아온다
  const { V, Wr } = sim;
  const lit = [], dim = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < sim.count; i++) {
    if (!alive[i]) continue;
    const p = par[i];
    if (p < 0) continue;
    // 밝기 = 흥분 × 신선함: 회복 변수가 쌓일수록 빛이 빠진다 → 앞쪽 띠가 가장 밝고 뒤로 갈수록 옅어진다
    const e = V[i] * Math.max(0, 1 - Wr[i] / 0.25);
    if (e >= 0.12) {
      const k = e < 0.3 ? 0 : e < 0.6 ? 1 : 2, d = D[i], b = d < 0.12 ? 0 : d < 0.35 ? 1 : d < 0.65 ? 2 : 3;
      const key = ((flow ? 0 : col[i]) * 3 + k) * 4 + b;
      const path = lit[key] || (lit[key] = new Path2D());
      path.moveTo(x[p], y[p]); path.lineTo(x[i], y[i]);
    } else if (V[i] < 0.3 && Wr[i] > 0.06) {
      const w = Wr[i], k = w < 0.14 ? 0 : w < 0.24 ? 1 : 2;
      dim[k].moveTo(x[p], y[p]); dim[k].lineTo(x[i], y[i]);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  [0.18, 0.32, 0.46].forEach((a, k) => {
    ctx.strokeStyle = `rgba(11, 11, 11, ${a})`;
    ctx.lineWidth = 1.4 * lw;
    ctx.stroke(dim[k]);
  });
  ctx.globalCompositeOperation = 'lighter';
  for (let key = 0; key < lit.length; key++) {
    if (!lit[key]) continue;
    const b = key % 4, k = ((key / 4) | 0) % 3, g = ((key / 4) | 0) / 3 | 0;
    const hue = flow ? 40 : sim.colonies[g].hue;
    ctx.strokeStyle = `hsla(${hue}, 45%, 88%, ${[0.3, 0.55, 0.85][k]})`;
    ctx.lineWidth = (BUCKETS[b].width + 0.5 + 0.4 * k) * lw;
    ctx.stroke(lit[key]);
  }

  // 팁
  for (const tp of sim.tips) {
    const hue = flow ? 192 : sim.colonies[tp.col].hue;
    ctx.fillStyle = `hsla(${hue}, 80%, 92%, 0.95)`;
    ctx.fillRect(x[tp.node] - lw, y[tp.node] - lw, 2 * lw, 2 * lw);
  }
  ctx.globalCompositeOperation = 'source-over';

  // 기록 전극
  if (sim.probe >= 0 && alive[sim.probe]) {
    const px = x[sim.probe], py = y[sim.probe];
    ctx.strokeStyle = 'hsla(0, 0%, 100%, 0.9)';
    ctx.lineWidth = 1.2 * lw;
    ctx.beginPath();
    ctx.arc(px, py, 6 * lw, 0, Math.PI * 2);
    ctx.moveTo(px + 6 * lw, py - 6 * lw);
    ctx.lineTo(px + 14 * lw, py - 14 * lw);
    ctx.stroke();
  }
}

// 오실로스코프: 전극이 꽂힌 세그먼트의 막전위 V
function drawScope() {
  const w = scope.width, h = scope.height;
  sctx.fillStyle = '#151515';
  sctx.fillRect(0, 0, w, h);
  const yOf = (v) => h - 4 - ((v + 0.4) / 1.5) * (h - 8);
  sctx.strokeStyle = '#2c2c2c';
  sctx.lineWidth = 1;
  sctx.beginPath();
  sctx.moveTo(0, yOf(0)); sctx.lineTo(w, yOf(0));
  sctx.stroke();
  const tr = sim.trace, n = tr.length;
  sctx.strokeStyle = '#d6d0c4';  // 오실로스코프: 무대와 같은 따뜻한 흰빛
  sctx.lineWidth = 2;
  sctx.beginPath();
  let pen = false, any = false;
  for (let k = 0; k < n; k++) {
    const v = tr[(sim.traceIdx + k) % n];
    if (Number.isNaN(v)) { pen = false; continue; }
    const px = (k / (n - 1)) * w, py = yOf(v);
    if (pen) sctx.lineTo(px, py); else sctx.moveTo(px, py);
    pen = any = true;
  }
  sctx.stroke();
  if (!any) {
    sctx.fillStyle = '#5a5a5a';
    sctx.font = "17px 'DM Mono', ui-monospace, Menlo, monospace";
    sctx.fillText(t('scope.empty'), 10, h / 2 + 6);
  }
}

// 시간 경과 배율: 실제 1초에 시뮬레이션 며칠이 지나나 (1 tick = 수송 방식별로 보정한 분)
const simDays = (ticks) => (ticks * UNITS.minPerTick[sim.p.transport]) / 1440;
const lapse = { t: 0, at: performance.now(), daysPerSec: 0 };
function updateStats() {
  const now = performance.now();
  if (now - lapse.at > 1000) {
    const days = simDays(sim.t - lapse.t);
    lapse.daysPerSec = days > 0 ? days / ((now - lapse.at) / 1000) : 0;
    lapse.t = sim.t; lapse.at = now;
  }
  const st = sim.stats();
  st.day = simDays(sim.t);
  st.lapse = lapse.daysPerSec;
  st.hguMm = st.hgu * UNITS.mmPerPx;
  $('simStats').textContent = t('stats', st, sim.full);
}

// 축척 막대: 화면에서 60 ~ 160 px가 되는 깔끔한 길이 (1 px = UNITS.mmPerPx mm, 확대에 따라 바뀐다)
function updateScaleBar() {
  const pxPerMm = view.s / UNITS.mmPerPx;
  let mm = [1, 2, 5, 10, 20, 50, 100].filter((v) => v * pxPerMm <= 160).pop() || 1;
  $('scalebar').querySelector('i').style.width = `${mm * pxPerMm}px`;
  $('scalebar').querySelector('span').textContent = mm >= 10 ? `${mm / 10} cm` : `${mm} mm`;
}

function updateLegend() {
  const sw = (hsl) => `<span class="sw" style="background:hsl(${hsl})"></span>`;
  $('legend').innerHTML = ui.view === 'flow'
    ? t('help.legend.flow', sw(FLOW_COLORS[0]), sw(FLOW_COLORS[1]))
    : t('help.legend.colony');
}

function updateSoundStats() { $('soundStats').textContent = sound.enabled ? t('sound.stats', sound.info) : t('sound.off'); }

function loop() {
  if (!ui.paused) for (let k = 0; k < ui.speed; k++) sim.tick();
  sound.update(sim, ui.paused, ui.speed);
  draw();
  drawScope();
  if (rec.mr) recFrame();
  if (ui.frame % 2 === 0 && sound.enabled && $('bar').dataset.level === '2') {
    const lv = sound.levels();
    for (const k in lv) levelers[k](lv[k]);
  }
  if (ui.frame % 10 === 0) { updateStats(); updateSoundStats(); }
  ui.frame++;
  requestAnimationFrame(loop);
}

// ---------- 무대 입력 ----------

let lastFood = null;
function applyTool(e, first) {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left - view.ox) / view.s, py = (e.clientY - r.top - view.oy) / view.s;
  if (px < 0 || py < 0 || px > W || py > H) return;
  if (ui.tool === 'spore') {
    if (first) sim.addSpore(px, py);
    return;
  }
  if (ui.tool === 'stim') {
    if (first) sim.stimulateAt(px, py);
    return;
  }
  if (ui.tool === 'probe') {
    if (first) sim.setProbe(px, py);
    return;
  }
  if (!first && lastFood && Math.hypot(px - lastFood[0], py - lastFood[1]) < 10) return;
  sim.addFood(px, py, first ? 28 : 16, first ? 0.9 : 0.35);
  if (first) sound.onPlop(px);
  lastFood = [px, py];
  ui.fieldDirty = true;
}
// 끌기: 포자 · 자극 · 전극은 클릭이면 도구, 5px 넘게 끌면 화면 이동. 먹이는 왼쪽으로 끌면 칠하기.
// 오른쪽 · 가운데 버튼으로 끌면 어느 도구든 화면 이동
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  capture(canvas, e);
  const at = { clientX: e.clientX, clientY: e.clientY };
  if (e.button !== 0) drag = { mode: 'pan', x: e.clientX, y: e.clientY };
  else if (ui.tool === 'food') { drag = { mode: 'paint' }; lastFood = null; applyTool(at, true); }
  else drag = { mode: 'pending', x: e.clientX, y: e.clientY, at };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.mode === 'pending' && Math.hypot(e.clientX - drag.at.clientX, e.clientY - drag.at.clientY) > 5) drag.mode = 'pan';
  if (drag.mode === 'pan') {
    panBy(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    canvas.style.cursor = 'grabbing';
  } else if (drag.mode === 'paint') applyTool(e, false);
});
const endDrag = () => {
  if (drag && drag.mode === 'pending') applyTool(drag.at, true);
  drag = null;
  canvas.style.cursor = '';
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { drag = null; canvas.style.cursor = ''; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// 휠: 마우스 휠 · 트랙패드 핀치(ctrlKey)는 커서 기준 확대/축소, 트랙패드 두 손가락 스크롤은 화면 이동
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
  if (e.ctrlKey || mouseWheel) zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  else panBy(-e.deltaX, -e.deltaY);
}, { passive: false });
// 위쪽 조작 줄이 접히고 펴지면 무대 크기가 바뀐다
new ResizeObserver(() => { if (sim) fitCanvas(); }).observe(stage);

// ---------- 조작 줄 부품 ----------

// 끄는 동안 포인터가 막대 밖으로 나가도 계속 받는다 (포인터가 이미 사라졌으면 그냥 클릭으로 처리)
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* 없음 */ } }

// 블록 막대: 숨은 range 입력이 값의 주인이고, 막대는 그 값을 그리고 바꾼다 (끌기 · 휠)
const meters = [];
function makeMeter(input, n = 10) {
  const el = input.closest('.ctl').querySelector('.meter');
  el.innerHTML = '<i></i>'.repeat(n);
  const blocks = [...el.children];
  const min = +input.min, max = +input.max, step = +input.step;
  const dec = (input.step.split('.')[1] || '').length;
  const set = (v) => {
    v = clamp(Math.round((v - min) / step) * step + min, min, max);
    input.value = v.toFixed(dec);
    input.dispatchEvent(new Event('input'));
  };
  const fromX = (e) => { const r = el.getBoundingClientRect(); set(min + clamp((e.clientX - r.left) / r.width, 0, 1) * (max - min)); };
  el.addEventListener('pointerdown', (e) => { capture(el, e); fromX(e); el.onpointermove = fromX; });
  el.addEventListener('pointerup', () => { el.onpointermove = null; });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(+input.value - Math.sign(e.deltaY) * Math.max(step, (max - min) / 40));
  }, { passive: false });
  const render = () => {
    const f = (input.value - min) / (max - min), k = Math.max(Math.round(f * n), f > 0 ? 1 : 0);
    blocks.forEach((b, i) => b.classList.toggle('on', i < k));
  };
  input.addEventListener('input', render);
  meters.push(render);
  render();
}

// 시뮬레이션 막대: 값을 그대로 보여주고 모델 파라미터에 넣는다
for (const id of ['speed', ...TUNABLE]) {
  const input = $(id), out = input.closest('.ctl').querySelector('output');
  const sync = () => {
    out.textContent = input.value;
    if (id === 'speed') ui.speed = parseInt(input.value, 10);
    else if (sim) sim.p[id] = parseFloat(input.value);
  };
  input.addEventListener('input', sync);
  sync();
  makeMeter(input, id === 'speed' ? 12 : 10);
}

// 소리 막대: 퍼센트로 보여준다
for (const [id, apply] of [['volume', (v) => sound.setVolume(v)], ['reverb', (v) => sound.setReverb(v)], ['echo', (v) => sound.setEcho(v)]]) {
  const input = $(id), out = input.closest('.ctl').querySelector('output');
  input.addEventListener('input', () => { out.textContent = Math.round(input.value * 100); apply(parseFloat(input.value)); });
  out.textContent = Math.round(input.value * 100);
  makeMeter(input, 10);
}

// 도구 · 보기 · 토양
function setTool(tool) {
  ui.tool = tool;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
function setView(v) {
  ui.view = v;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  updateLegend();
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
// 수송 방식은 저장 양분이 놓인 자리가 달라서 도중에 바꿀 수 없다 → 바꾸면 같은 조건으로 새로 시작
document.querySelectorAll('[data-transport]').forEach((b) => b.addEventListener('click', () => {
  if (ui.transport === b.dataset.transport) return;
  ui.transport = b.dataset.transport;
  document.querySelectorAll('[data-transport]').forEach((o) => o.classList.toggle('on', o === b));
  reset();
}));
$('matToggle').addEventListener('click', () => {
  ui.showMat = !ui.showMat;
  $('matToggle').textContent = ui.showMat ? '■' : '□';
  $('matToggle').classList.toggle('on', ui.showMat);
});
$('soil').addEventListener('click', () => {
  ui.showField = !ui.showField;
  ui.fieldDirty = true;
  $('soil').textContent = ui.showField ? '■' : '□';
  $('soil').classList.toggle('on', ui.showField);
});

function togglePause() {
  ui.paused = !ui.paused;
  $('pause').textContent = ui.paused ? `▸ ${t('play')}` : `❚❚ ${t('pause')}`;
}
$('pause').addEventListener('click', togglePause);
$('fit').addEventListener('click', toggleFit);
$('reset').addEventListener('click', reset);
// 조절 바 단계: 0 첫 줄만 → 1 성장 · 전기 → 2 소리 · 믹서 → 다시 0. 무대 크기는 ResizeObserver가 따라간다. 단계는 브라우저에 기억
function setBarLevel(lv) {
  $('bar').dataset.level = lv;
  $('barToggle').textContent = ['▾', '▾ ♪', '▴'][lv];
  try { localStorage.setItem('fungi.barLevel', lv); } catch (e) { /* 이번 방문 동안만 */ }
}
const cycleBar = () => setBarLevel((+$('bar').dataset.level + 1) % 3);
$('barToggle').addEventListener('click', cycleBar);
try {
  const lv = localStorage.getItem('fungi.barLevel');
  setBarLevel(lv !== null ? +lv : localStorage.getItem('fungi.barCollapsed') ? 0 : 2);  // 예전 '접힘' 기록도 따른다
} catch (e) { setBarLevel(2); }

function toggleHelp() { $('help').hidden = !$('help').hidden; $('helpBtn').classList.toggle('on', !$('help').hidden); }
function toggleContact() { $('contact').hidden = !$('contact').hidden; $('contactBtn').classList.toggle('on', !$('contact').hidden); }
$('contactBtn').addEventListener('click', toggleContact);
// 이메일 복사: 클립보드가 막혀 있으면 주소를 선택해 둬서 바로 복사할 수 있게
$('copyMail').addEventListener('click', async () => {
  const done = () => { $('copyMail').textContent = t('copied'); setTimeout(() => { $('copyMail').textContent = t('copy'); }, 1500); };
  try { await navigator.clipboard.writeText($('mail').textContent); done(); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('mail')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
});
$('helpBtn').addEventListener('click', toggleHelp);

// 소리: 버튼 하나로 켜고 끈다. 첫 클릭은 오디오를 시작하고 (브라우저는 클릭 안에서만 허락), 그 뒤로는 음소거를 오간다
function soundLive() { return sound.enabled && !sound.muted; }
function paintSound() {
  $('soundOn').textContent = `♪ ${t(soundLive() ? 'soundOnDone' : 'soundOff')}`;
  $('soundOn').classList.toggle('live', soundLive());
}
async function toggleSound() {
  if (!sound.enabled) await sound.start();
  else sound.setMuted(!sound.muted);
  paintSound();
  updateSoundStats();
}
$('soundOn').addEventListener('click', toggleSound);

// 스타일 프리셋: 모든 채널이 한 스타일에 있으면 그 이름이 켜지고, 섞여 있으면 '섞임'
for (const k of STYLE_ORDER) {
  const b = document.createElement('button');
  b.className = 'opt';
  b.dataset.preset = k;
  b.dataset.i18nTitle = `style.${k}`;
  b.innerHTML = `<span class="sw" style="background:var(${STYLE_COLOR[k]})"></span>${STYLES[k].short}`;
  b.addEventListener('click', () => { sound.preset(k); showSoundControls(); });
  $('presets').append(b);
}
const mixedTag = document.createElement('span');
mixedTag.className = 'lbl';
mixedTag.dataset.i18n = 'style.mix';
$('presets').append(mixedTag);
function renderPresets() {
  const ps = Object.values(sound.pos), p0 = ps[0];
  const pure = ps.every((p) => p === p0) && Number.isInteger(p0) ? STYLE_ORDER[p0] : null;
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === pure));
  mixedTag.hidden = !!pure;
}

// 믹서: 채널마다 스타일 띠 (블록이 스타일 색, 손잡이 근처일수록 밝다) + 음량 막대
const TRACK_BLOCKS = 6 * STYLE_ORDER.length;
const tracks = [];
const levelers = {};  // 채널 → 지금 소리 크기를 그 줄에 비추는 함수
for (const ch of CHANNELS) {
  const row = document.createElement('div');
  row.className = 'chan ctl';
  row.innerHTML = `<span class="lbl" data-i18n="ch.${ch.key}"></span><span class="track"></span><output></output>` +
    (ch.noVol ? '<span></span>' : `<span class="meter"></span><input type="range" class="hidden" min="0" max="1.5" step="0.05" value="1">`);
  $('mixer').append(row);
  const track = row.querySelector('.track'), out = row.querySelector('output'), last = STYLE_ORDER.length - 1;
  track.innerHTML = Array.from({ length: TRACK_BLOCKS }, (_, i) =>
    `<i style="background:var(${STYLE_COLOR[STYLE_ORDER[Math.floor(i / 6)]]})"></i>`).join('') + '<b></b>';
  const blocks = [...track.querySelectorAll('i')], mark = track.querySelector('b'), lbl = row.querySelector('.lbl');
  const base = new Float32Array(TRACK_BLOCKS), near = new Float32Array(TRACK_BLOCKS);
  let shown = 0, drawn = -1;
  const render = () => {
    const pos = sound.pos[ch.key];
    blocks.forEach((b, i) => {
      const p = ((i + 0.5) / TRACK_BLOCKS) * STYLE_ORDER.length - 0.5;  // 블록 가운데의 스타일 위치
      base[i] = 0.16 + 0.84 * Math.max(0, 1 - Math.abs(p - pos) * 1.4);
      near[i] = Math.max(0, 1 - Math.abs(p - pos) * 0.9);
      b.style.opacity = base[i];
    });
    mark.style.left = `${((pos + 0.5) / STYLE_ORDER.length) * 100}%`;
    out.textContent = sound.mixLabel(ch.key);
    drawn = -1;  // 손잡이가 옮겨졌으니 반응도 새로 그린다
  };
  // 소리에 반응: 손잡이 근처 블록이 그 크기만큼 밝아지고 솟고, 채널 이름이 밝아진다 (바로 오르고 천천히 내려감)
  levelers[ch.key] = (lv) => {
    shown = Math.max(lv, shown * 0.85);
    const q = Math.round(shown * 40) / 40;
    if (q === drawn) return;
    drawn = q;
    blocks.forEach((b, i) => {
      const k = q * near[i];
      b.style.opacity = base[i] + (1 - base[i]) * k;
      b.style.transform = k > 0.01 ? `scaleY(${1 + 0.6 * k})` : '';
    });
    const c = Math.round(124 + (255 - 124) * q);
    lbl.style.color = q > 0.01 ? `rgb(${c}, ${c}, ${c})` : '';
    mark.style.boxShadow = q > 0.05 ? `0 0 ${2 + 8 * q}px rgba(255, 255, 255, ${0.3 + 0.6 * q})` : '';
  };
  const fromX = (e, snap) => {
    const r = track.getBoundingClientRect();
    let pos = clamp(((e.clientX - r.left) / r.width) * STYLE_ORDER.length - 0.5, 0, last);
    if (snap && Math.abs(pos - Math.round(pos)) < 0.12) pos = Math.round(pos);  // 놓을 때 스타일 근처면 딱 붙인다
    sound.setMix(ch.key, pos);
    render();
    renderPresets();
  };
  track.addEventListener('pointerdown', (e) => { capture(track, e); fromX(e); track.onpointermove = fromX; });
  track.addEventListener('pointerup', (e) => { track.onpointermove = null; fromX(e, true); });
  tracks.push(render);
  const vol = row.querySelector('input');
  if (vol) {
    vol.addEventListener('input', () => sound.setVol(ch.key, parseFloat(vol.value)));
    makeMeter(vol, 6);
  }
}

// 건반: 으뜸음 (흰 건반 7 + 검은 건반 5)
const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACK = { 1: 11, 3: 27, 6: 59, 8: 75, 10: 91 };
WHITE.forEach((pc, k) => $('keys').insertAdjacentHTML('beforeend', `<span class="w" data-pc="${pc}" style="left:${k * 16}px"></span>`));
for (const [pc, left] of Object.entries(BLACK)) $('keys').insertAdjacentHTML('beforeend', `<span class="b" data-pc="${pc}" style="left:${left}px"></span>`);
$('keys').addEventListener('click', (e) => {
  const pc = e.target.dataset.pc;
  if (pc === undefined) return;
  sound.setTonic(60 + +pc);
  renderKey();
});
function renderKey() {
  const pc = sound.tonic % 12;
  for (const k of $('keys').children) k.classList.toggle('on', +k.dataset.pc === pc);
  $('keyName').textContent = NOTE_NAMES[pc];
}
for (const k of Object.keys(SCALES)) $('soundScale').add(new Option(k, k));
$('soundScale').addEventListener('change', (e) => sound.setScale(e.target.value));

// 소리 쪽 상태를 조작 줄에 다시 그린다 (프리셋을 누른 뒤 등)
function showSoundControls() {
  CHANNELS.forEach((ch, i) => {
    const vol = $('mixer').children[i].querySelector('input');
    if (vol) vol.value = sound.vol[ch.key];
  });
  $('reverb').value = sound.reverbAmt;
  $('echo').value = sound.echoAmt;
  for (const id of ['reverb', 'echo']) $(id).closest('.ctl').querySelector('output').textContent = Math.round($(id).value * 100);
  $('soundScale').value = sound.scaleKey;
  meters.forEach((r) => r());
  tracks.forEach((r) => r());
  renderKey();
  renderPresets();
}

// ---------- 녹화 ----------
// 무대 캔버스를 녹화용 캔버스에 (바탕색 + 제목 · 날짜 자막과 함께) 매 프레임 옮겨 그리고, 그 영상과 최종 소리를 MediaRecorder로.
// 최대 60초. 멈추면 영상 파일(가능하면 mp4, 아니면 webm)로 저장한다. 다른 페이지 안에 끼워진 경우(아티팩트)는 파일 저장이 막혀서 끈다
const REC_MAX = 60;
const rec = { mr: null, chunks: [], at: 0, cv: null, cx: null };
let embedded = false;
try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
const recOK = !embedded && typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;

function recMime() {
  for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function recFrame() {
  const c = rec.cx, w = rec.cv.width, h = rec.cv.height, u = w / 1000;  // 자막 크기는 영상 폭에 비례
  c.fillStyle = '#0b0b0b';
  c.fillRect(0, 0, w, h);
  c.drawImage(canvas, 0, 0, w, h);
  c.font = `${Math.round(13 * u)}px 'DM Mono', ui-monospace, Menlo, monospace`;
  c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(224, 224, 224, 0.85)';
  c.fillText('DIGITAL FUNGI  ·  BY HEEGUN CHOI', 18 * u, h - 18 * u);
  const day = `DAY ${simDays(sim.t).toFixed(1)}`;
  c.fillText(day, w - 18 * u - c.measureText(day).width, h - 18 * u);
  const sec = (performance.now() - rec.at) / 1000;
  if (ui.frame % 10 === 0) $('rec').textContent = `■ ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  if (sec >= REC_MAX) stopRec();
}

function startRec() {
  const s = Math.min(1, 1920 / canvas.width);  // 영상은 가로 1920 이하, H.264를 위해 짝수 크기
  rec.cv = document.createElement('canvas');
  rec.cv.width = Math.max(2, Math.round((canvas.width * s) / 2) * 2);
  rec.cv.height = Math.max(2, Math.round((canvas.height * s) / 2) * 2);
  rec.cx = rec.cv.getContext('2d');
  rec.at = performance.now();
  recFrame();
  const stream = rec.cv.captureStream(30);
  const audio = sound.enabled ? sound.recStream() : null;
  if (audio) for (const tr of audio.getAudioTracks()) stream.addTrack(tr);
  const mime = recMime();
  rec.mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : { videoBitsPerSecond: 8e6 });
  rec.chunks = [];
  rec.mr.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = saveRec;
  rec.mr.start(1000);
  $('rec').classList.add('on');
}

function stopRec() {
  if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop();
}

function saveRec() {
  const type = rec.mr.mimeType || 'video/webm';
  const blob = new Blob(rec.chunks, { type });
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const name = `digital-fungi-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  rec.last = { name, type, size: blob.size, url: a.href };
  rec.mr = null;
  $('rec').classList.remove('on');
  $('rec').textContent = `● ${t('rec')}`;
}

$('rec').addEventListener('click', () => {
  if (!recOK) return;
  if (rec.mr) stopRec(); else startRec();
});

// ---------- MIDI ----------
// 연결을 누르면 Web MIDI 권한을 받고 출력 포트를 고르게 한다. 고른 포트 이름은 브라우저에 기억 (다음엔 같은 이름이 있으면 자동으로)
const midiOK = !embedded && typeof navigator.requestMIDIAccess === 'function';
let midiAccess = null;
function fillMidi() {
  const sel = $('midiOut'), outs = [...midiAccess.outputs.values()];
  let saved = '';
  try { saved = localStorage.getItem('fungi.midiOut') || ''; } catch (e) { /* 없음 */ }
  sel.innerHTML = '';
  sel.add(new Option(outs.length ? t('midi.off') : t('midi.none'), ''));
  for (const o of outs) sel.add(new Option(o.name, o.id));
  const keep = outs.find((o) => o.id === sound.midi?.id) || outs.find((o) => o.name === saved);
  sel.value = keep ? keep.id : '';
  selectMidi(sel.value, false);
}
function selectMidi(id, remember = true) {
  const out = id ? midiAccess.outputs.get(id) : null;
  sound.setMidi(out || null);
  $('midiOut').classList.toggle('on', !!out);
  if (remember) { try { localStorage.setItem('fungi.midiOut', out ? out.name : ''); } catch (e) { /* 이번만 */ } }
}
$('midiBtn').addEventListener('click', async () => {
  if (!midiOK) return;
  try { midiAccess = await navigator.requestMIDIAccess(); }
  catch (e) { $('midiBtn').title = t('midi.denied'); return; }
  midiAccess.onstatechange = fillMidi;  // 장치를 꽂거나 뽑으면 목록을 다시
  $('midiBtn').hidden = true;
  $('midiOut').hidden = false;
  fillMidi();
});
$('midiOut').addEventListener('change', (e) => selectMidi(e.target.value));

// ---------- 한/영 ----------

// 정적 문구는 applyI18n, 상태에 따라 바뀌는 문구와 선택지는 여기서 다시 쓴다
function relabel() {
  applyI18n();
  $('pause').textContent = ui.paused ? `▸ ${t('play')}` : `❚❚ ${t('pause')}`;
  $('reset').textContent = `↺ ${t('reset')}`;
  if (!rec.mr) $('rec').textContent = `● ${t('rec')}`;
  $('midiBtn').disabled = !midiOK;
  if (!midiOK) $('midiBtn').title = t('midi.na');
  if (midiAccess) { const v = $('midiOut').value; fillMidi(); $('midiOut').value = v; }
  $('rec').disabled = !recOK;
  if (!recOK) $('rec').title = t('rec.na');
  paintSound();
  for (const o of $('soundScale').options) o.text = t(`scale.${o.value}`);
  if (sim) { updateStats(); updateLegend(); }
  updateSoundStats();
}
function toggleLang() { setLang(LANG === 'ko' ? 'en' : 'ko'); relabel(); }
$('lang').addEventListener('click', toggleLang);

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.key === 'r') reset();
  else if (e.key === 'v') setView(ui.view === 'colony' ? 'flow' : 'colony');
  else if (e.key === 'm') toggleSound();
  else if (e.key === 'l') toggleLang();
  else if (e.key === 'h') toggleHelp();
  else if (e.key === 'Escape') { if (!$('help').hidden) toggleHelp(); if (!$('contact').hidden) toggleContact(); }
  else if (e.key === 'f') toggleFit();
  else if (e.key === 'c') cycleBar();
  else if (e.key === '1') setTool('spore');
  else if (e.key === '2') setTool('food');
  else if (e.key === '3') setTool('stim');
  else if (e.key === '4') setTool('probe');
});

relabel();
showSoundControls();

// 숨겨진 창에서 열리면 크기가 0일 수 있다 → 무대에 실제 크기가 생길 때까지 월드 생성을 미룬다
function start() {
  if (stage.clientWidth < 50 || stage.clientHeight < 50) {
    window.addEventListener('resize', start, { once: true });
    return;
  }
  reset();
  updateLegend();
  updateSoundStats();
  requestAnimationFrame(loop);
}
start();
