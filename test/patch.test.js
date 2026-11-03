const assert = require('assert');
const { Patch } = require('../src/patch.js');
const st = (o = {}) => Object.assign({ tips: 0, fusions: 0, spikes: 0, clashes: 0, matCover: 0, fruitsTotal: 0 }, o);
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const p = new Patch();
// connect: no duplicates, unknown names rejected
assert.strictEqual(p.connect('flow', 'cutoff', 0.5), 0);
assert.strictEqual(p.connect('flow', 'cutoff', 0.9), 0, 'same pair returns existing cable');
assert.strictEqual(p.connect('nope', 'cutoff'), -1); assert.strictEqual(p.connect('flow', 'nope'), -1);
// sources settle toward their raw value (time constant 0.7 s)
for (let i = 0; i < 100; i++) p.sense(st({ tips: 200 }), 0.6, 0.1);
near(p.src.tips, 1 - Math.exp(-1), 1e-3); near(p.src.flow, 0.6, 1e-3);
// cutoff: + amount opens with the source, − closes with it
p.cables[0].amt = 1;
near(p.out().cutoffOpen, 0.6, 1e-3);
p.cables[0].amt = -0.5;
near(p.out().cutoffOpen, 1 - 0.5 * 0.6, 1e-3);
// additive destinations sum several cables
p.connect('tips', 'reverb', 0.5); p.connect('flow', 'reverb', -0.25);
near(p.out().reverb, 0.5 * p.src.tips - 0.25 * p.src.flow, 1e-9);
// rates: spikes per second
const q = new Patch(); q.sense(st({ spikes: 0 }), 0, 0.5);
for (let i = 0; i < 60; i++) q.sense(st({ spikes: (i + 1) * 1 }), 0, 0.1);   // 10 spikes/s
near(q.src.spikes, 0.5, 0.01);
// fruit: pulse on a new mushroom, then decays
q.sense(st({ fruitsTotal: 1 }), 0, 0.1); assert(q.src.fruit > 0.9, 'fruit pulse');
for (let i = 0; i < 100; i++) q.sense(st({ fruitsTotal: 1 }), 0, 0.1);
assert(q.src.fruit < 0.05, 'fruit pulse decays');
// chord destination fires once per upward crossing of 0.5
const r = new Patch(); r.connect('flow', 'chord', 1);
let steps = 0;
for (const f of [0.1, 0.3, 0.6, 0.9, 0.4, 0.2, 0.7, 0.8]) { for (let i = 0; i < 50; i++) r.sense(st(), f, 0.1); steps += r.out().chord; }
assert.strictEqual(steps, 2, 'two rising crossings → two chord steps');
// save / load, limits
const s = new Patch(); s.load(JSON.parse(JSON.stringify(p))); assert.strictEqual(s.cables.length, 3); near(s.cables[0].amt, -0.5);
s.load({ cables: [{ src: 'tips', dst: 'pitch', amt: 7 }, { src: 'x', dst: 'pitch' }, null] });
assert.strictEqual(s.cables.length, 1); assert.strictEqual(s.cables[0].amt, 1, 'amount clamped to ±1');
console.log('patch.js: all tests passed');
