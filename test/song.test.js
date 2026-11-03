const assert = require('assert');
const { Song } = require('../src/song.js');
// sim.stats()와 같은 이름: 고리 수는 fusions
const st = (o = {}) => Object.assign({ tips: 0, fusions: 0, loopsUsed: 0, colonies: 1, fruitsTotal: 0 }, o);
const s = new Song(); s.bpm = 120;   // 1 bar = 2 s
assert.strictEqual(s.start(st()), -1, 'empty song does not start');
s.add({ a: 1 }); s.add({ b: 2 }); s.add({ c: 3 });
assert.deepStrictEqual(s.scenes.map((x) => x.name), ['A', 'B', 'C']);
s.scenes[0].next = { type: 'bars', n: 2, max: 64 };
s.scenes[1].next = { type: 'tips', n: 100, max: 8 };
s.mode = 'song'; assert.strictEqual(s.start(st()), 0);
// A: 2 bars = 4 s
assert.strictEqual(s.tick(3.9, st()), -1); assert(Math.abs(s.progress - 0.975) < 1e-9);
assert.strictEqual(s.tick(0.2, st()), 1, 'A -> B after 2 bars');
// B: tips >= 100
assert.strictEqual(s.tick(1, st({ tips: 50 })), -1); assert.strictEqual(s.progress, 0.5);
assert.strictEqual(s.tick(0.1, st({ tips: 100 })), 2, 'B -> C when tips reach 100');
// C is last: stays
assert.strictEqual(s.tick(1000, st()), -1); assert.strictEqual(s.cur, 2); assert.strictEqual(s.progress, 1);
// max bars safety
s.enter(1, st()); assert.strictEqual(s.tick(15.9, st({ tips: 0 })), -1); assert.strictEqual(s.tick(0.2, st({ tips: 0 })), 2, 'B -> C after max 8 bars');
// loops condition reads stats.fusions (there is no stats.loops)
s.scenes[0].next = { type: 'loops', n: 5, max: 64 };
s.enter(0, st()); assert.strictEqual(s.tick(1, st({ fusions: 4 })), -1, 'loops 4 < 5 stays'); assert.strictEqual(s.tick(1, st({ fusions: 5 })), 1, 'loops 5 moves on');
// fruit counts only new mushrooms since entering
s.scenes[0].next = { type: 'fruit', n: 2, max: 64 };
s.enter(0, st({ fruitsTotal: 5 })); assert.strictEqual(s.tick(1, st({ fruitsTotal: 6 })), -1); assert.strictEqual(s.tick(1, st({ fruitsTotal: 7 })), 1);
// scene loop mode: never advances, bars restart
s.mode = 'scene'; s.scenes[0].next = { type: 'bars', n: 1, max: 64 }; s.enter(0, st());
assert.strictEqual(s.tick(2.5, st()), -1); assert.strictEqual(s.cur, 0); assert(s.beats < 4);
// stop mode: no clock
s.mode = 'stop'; const b0 = s.beats; s.tick(10, st()); assert.strictEqual(s.beats, b0);
// move / remove keep current index right
s.mode = 'song'; s.enter(1, st()); assert.strictEqual(s.move(1, -1), 0); assert.strictEqual(s.cur, 0);
s.remove(0); assert.strictEqual(s.cur, -1); assert.deepStrictEqual(s.scenes.map((x) => x.name), ['A', 'C']);
assert.strictEqual(s.add({}), 2); assert.strictEqual(s.scenes[2].name, 'B', 'reuses the first free letter');
// save / load round trip
const t = new Song(); t.load(JSON.parse(JSON.stringify(s))); assert.strictEqual(t.scenes.length, 3); assert.strictEqual(t.bpm, 120);
t.load({ scenes: [{ snap: {}, next: { type: 'nope' } }, null] }); assert.strictEqual(t.scenes.length, 0, 'drops broken scenes');
console.log('song.js: all tests passed');
