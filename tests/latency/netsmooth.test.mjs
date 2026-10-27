// SnapshotBuffer and LocalPredictor (netsmooth.js) on hand-made timelines.
//
//   node tests/latency/netsmooth.test.mjs
import assert from 'node:assert/strict';
import { SnapshotBuffer, LocalPredictor, MAX_EXTRAPOLATE_MS, MIN_DELAY_MS, MAX_DELAY_MS, SNAP_PX } from '../../netsmooth.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// Steady 100 ms snapshots arriving 50 ms late: the delay settles at the gap,
// and the drawn position is the server's at (now - 50 - 100) ms.
{
  const buffer = new SnapshotBuffer();
  for (let k = 0; k <= 20; k++) buffer.push(k / 10, { a:{ x:k * 10, y:0, angle:0 } }, k * 100 + 50);
  assert.equal(buffer.delay, 100);
  const sample = buffer.sample(2000 + 25);
  near(sample.t, 1.875);
  near(sample.get('a').x, 187.5);
  assert.equal(sample.get('missing'), undefined);
}

// The delay follows the 95th-percentile gap, within its clamp.
{
  const fast = new SnapshotBuffer(), slow = new SnapshotBuffer();
  for (let k = 0; k < 30; k++) { fast.push(k / 100, {}, k * 10); slow.push(k, {}, k * 1000); }
  assert.equal(fast.delay, MIN_DELAY_MS);
  assert.equal(slow.delay, MAX_DELAY_MS);
  const jittery = new SnapshotBuffer();
  const arrivals = [0, 100, 260, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
  arrivals.forEach((at, k) => jittery.push(k / 10, {}, at));
  assert.equal(jittery.delay, 100, 'one late snapshot in twenty does not move the 95th percentile');
}

// Angles turn the short way round.
{
  const buffer = new SnapshotBuffer();
  buffer.push(0, { a:{ x:0, y:0, angle:3.0 } }, 0);
  buffer.push(0.1, { a:{ x:0, y:0, angle:-3.0 } }, 100);
  const angle = buffer.sample(200).get('a').angle; // half way (t = 50 ms) with the start delay of 150 ms
  assert.ok(Math.abs(Math.abs(angle) - Math.PI) < 0.2, `angle ${angle} passes through π, not 0`);
}

// Late snapshots: extrapolate along the last motion, at most MAX_EXTRAPOLATE_MS.
{
  const buffer = new SnapshotBuffer();
  for (let k = 0; k <= 10; k++) buffer.push(k / 10, { a:{ x:k * 10, y:0, angle:0 } }, k * 100);
  const base = buffer.renderTime(0);
  const at = ms => buffer.sample(ms - base).get('a').x;
  near(at(1000), 100);
  near(at(1050), 105);
  near(at(1000 + MAX_EXTRAPOLATE_MS), 110);
  near(at(1000 + 5 * MAX_EXTRAPOLATE_MS), 110);
}

// Teleports (a respawn) are drawn at once, not slid across the map.
{
  const buffer = new SnapshotBuffer();
  for (let k = 0; k <= 10; k++) buffer.push(k / 10, { a:{ x:k < 6 ? k * 10 : 2000, y:0, angle:0 } }, k * 100);
  const base = buffer.renderTime(0);
  assert.equal(buffer.sample(510 - base).get('a').x, 2000);
  near(buffer.sample(450 - base).get('a').x, 45);
}

// A new entity shows where it is; a new world (time back to 0) starts the buffer over.
{
  const buffer = new SnapshotBuffer();
  for (let k = 0; k <= 10; k++) buffer.push(k / 10, k > 5 ? { a:{ x:k, y:0, angle:0 }, b:{ x:7, y:7, angle:0 } } : { a:{ x:k, y:0, angle:0 } }, k * 100);
  const base = buffer.renderTime(0);
  assert.deepEqual(buffer.sample(550 - base).get('b'), { x:7, y:7, angle:0 });
  buffer.push(0, { a:{ x:999, y:0, angle:0 } }, 5000);
  assert.equal(buffer.snaps.length, 1);
  assert.equal(buffer.sample(5000).get('a').x, 999);
  buffer.push(0, { a:{ x:1, y:0, angle:0 } }, 5100);
  assert.equal(buffer.snaps.length, 1, 'a repeat is ignored');
}

// The predictor moves at once and agrees with the server once it catches up.
{
  const predictor = new LocalPredictor(), move = (pos, dt) => { pos.x += 100 * dt; };
  predictor.step(0, 0.1, move);
  assert.equal(predictor.pos, null, 'nothing to predict before the first snapshot');
  predictor.reconcile({ x:0, y:0 }, 0, 200);
  for (let now = 100; now <= 1000; now += 100) predictor.step(now, 0.1, move);
  near(predictor.pos.x, 100);
  // A snapshot at 1000 ms reflects input up to one round trip and a tick ago (775 ms): the frames up to 700 ms, 70 px.
  predictor.reconcile({ x:70, y:0 }, 1000, 200);
  assert.ok(Math.abs(predictor.error.x) < 1e-6, 'prediction matched: no correction');
  // A disagreement is blended out over a few frames, not jumped.
  predictor.reconcile({ x:60, y:0 }, 1000, 200);
  near(predictor.error.x, -10);
  const before = predictor.pos.x;
  predictor.step(1016, 0.016, () => {});
  assert.ok(predictor.pos.x < before && predictor.pos.x > before - 10);
  for (let k = 0; k < 30; k++) predictor.step(1016 + k * 16, 0.016, () => {});
  near(predictor.pos.x, 90, 0.1);
  // A far disagreement (respawn) snaps.
  predictor.reconcile({ x:90 + SNAP_PX + 50, y:300 }, 2000, 200);
  assert.deepEqual(predictor.pos, { x:90 + SNAP_PX + 50, y:300 });
}

console.log('netsmooth test passed');
