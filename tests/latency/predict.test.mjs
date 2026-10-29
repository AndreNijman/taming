// Own-tamer prediction (predict.js) against the real sim as the server, on a
// virtual clock: inputs reach the server LATENCY ms after they are sent (plus
// jitter), snapshots reach the client LATENCY ms after each tick. The client's
// guess for each input should match where the server puts the tamer after
// applying it, walls included, while the plain server echo trails far behind.
// Reconciling never moves the drawn tamer.
//
//   node tests/latency/predict.test.mjs
import assert from 'node:assert/strict';
import * as S from '../../sim.js';
import { Predictor } from '../../predict.js';

function run({ latency, jitter, phase, seed = 99 }) {
  const world = S.createWorld(seed);
  const me = S.addPlayer(world, { id: 'me', name: 'Tester' });
  // the middle of the map, then a stranger's line of walls across the eastward path; trees and rocks stay where they are
  Object.assign(me, { x: 1500, y: 1500, vx: 0, vy: 0 });
  for (let k = -2; k <= 2; k++) world.structures.push({ id: `sw${k}`, item: 'wood-wall', x: 1500 + 420, y: 1500 + k * 84, r: 42, rot: 0, hp: 400, maxHp: 400, owner: 'stranger', cd: 0, aim: 0, born: 0 });
  world.animals = [];

  const predictor = new Predictor(), mirror = { grid: null, structures: [] };
  let sk = null;
  // east into the wall, stop, north, diagonal, west
  const schedule = t => t < 1800 ? { mx: 1, my: 0 } : t < 2300 ? { mx: 0, my: 0 } : t < 3300 ? { mx: 0, my: -1 } : t < 4300 ? { mx: 1, my: 1 } : { mx: -1, my: 0 };
  let random = seed;
  const rand = () => ((random = (random * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const toServer = [], toClient = [], guessAt = new Map(), serverAt = new Map(), echoAt = new Map();
  let lastArrival = 0, echo = null, jumps = 0, eastmost = 0;

  for (let t = 0; t <= 6000; t++) {
    while (toServer.length && toServer[0].at <= t) S.setInput(world, 'me', toServer.shift().input);
    while (toClient.length && toClient[0].at <= t) {
      const snap = toClient.shift().snap, mine = snap.p.map(S.decodePlayer).find(p => p.id === 'me');
      mirror.structures = snap.s.map(S.decodeStructure);
      // the client builds the resource grid from the seed, as game.js does
      if (snap.sk !== sk) { sk = snap.sk; mirror.grid = S.generateResources(seed, sk); }
      const before = predictor.position(.5);
      predictor.reconcile(mirror, { id: 'me', r: mine.r, x: mine.x, y: mine.y, seq: snap.me.seq, v: snap.me.v, spd: snap.me.spd });
      const after = predictor.position(.5);
      if (before && Math.hypot(after.x - before.x, after.y - before.y) > 1e-6) jumps++;
      echo = { x: mine.x, y: mine.y };
    }
    if (t % 50 === 0) {
      S.step(world, S.TICK); world.events.length = 0;
      if (!serverAt.has(me.seq)) serverAt.set(me.seq, { x: me.x, y: me.y });
      if (t < 2300) eastmost = Math.max(eastmost, me.x);
      toClient.push({ at: t + latency, snap: S.snapshot(world, 'me') });
    }
    if (t % 50 === phase) {
      const sent = predictor.input({ ...schedule(t), angle: 0, attack: false, sel: 0 }, mirror);
      if (predictor.state) guessAt.set(sent.seq, { x: predictor.state.x, y: predictor.state.y });
      if (echo) echoAt.set(sent.seq, echo);
      lastArrival = Math.max(lastArrival, t + latency + Math.round(rand() * jitter));
      toServer.push({ at: lastArrival, input: sent });
    }
    predictor.settle(.001);
  }

  const errors = [], echoErrors = [];
  for (const [seq, guess] of guessAt) {
    const truth = serverAt.get(seq);
    if (!truth || seq < 10) continue;
    errors.push(Math.hypot(guess.x - truth.x, guess.y - truth.y));
    const e = echoAt.get(seq); if (e) echoErrors.push(Math.hypot(e.x - truth.x, e.y - truth.y));
  }
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  return { mean: mean(errors), max: Math.max(...errors), echoMean: mean(echoErrors), count: errors.length, jumps, wallX: eastmost };
}

for (const options of [{ latency: 60, jitter: 0, phase: 17 }, { latency: 100, jitter: 20, phase: 33 }, { latency: 160, jitter: 40, phase: 5 }]) {
  const r = run(options);
  const label = `${options.latency} ms each way, ${options.jitter} ms jitter`;
  assert.ok(r.count > 80, `${label}: enough confirmed inputs (${r.count})`);
  assert.ok(r.wallX < 1500 + 420 - 42 - 30, `${label}: the wall stopped the tamer on the server (x ${r.wallX})`);
  assert.equal(r.jumps, 0, `${label}: reconciling never moves the drawn tamer`);
  assert.ok(r.mean < 6, `${label}: the guess matches the server (mean ${r.mean.toFixed(1)} px)`);
  assert.ok(r.max < 40, `${label}: and never strays far (max ${r.max.toFixed(1)} px)`);
  assert.ok(r.echoMean > 4 * r.mean + 20, `${label}: far closer than drawing the server echo (${r.echoMean.toFixed(1)} px)`);
  console.log(`${label}: prediction mean ${r.mean.toFixed(1)} px, max ${r.max.toFixed(1)} px; server echo mean ${r.echoMean.toFixed(1)} px`);
}

// A respawn (or anything that moves the tamer far) snaps instead of sliding across the map.
{
  const p = new Predictor(), mirror = { grid: { grid: new Map(), cell: 200, list: [] }, structures: [] };
  p.reconcile(mirror, { id: 'me', r: 35, x: 100, y: 100, seq: 0, v: [0, 0], spd: 340 });
  p.reconcile(mirror, { id: 'me', r: 35, x: 2000, y: 1800, seq: 0, v: [0, 0], spd: 340 });
  assert.deepEqual(p.position(0), { x: 2000, y: 1800 });
}
console.log('predict test passed');
