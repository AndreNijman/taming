// Item-1 harness: how much network delay shows, old client path against new,
// at 200 ms round trip with ±40 ms jitter. Deterministic (seeded); no relay.
//
// A model of the relay (worker.js: 50 ms ticks, a snapshot every 100 ms, the
// held input applied each tick at 175 px/s) and of the client (60 fps frames,
// input sent every 50 ms, a ping a second for the round trip) exchange
// messages over a link with 100 ms ± 40 ms one-way delay per message,
// delivered in order like a websocket. One remote tamer wanders (turns,
// stops); the local tamer follows a scripted walk.
//
// Old path (game.js before this change, still there with ?smooth=0): draw
// every entity, your own included, at the newest snapshot. New path:
// SnapshotBuffer for remote entities, LocalPredictor for your own.
//
//   node tests/latency/harness.mjs
import { SnapshotBuffer, LocalPredictor } from '../../netsmooth.js';

const SPEED = 175, TICK = 50, SNAPSHOT = 100, FRAME = 1000 / 60, SEND = 50, PING = 1000;
const ONE_WAY = 100, JITTER = 40, DURATION = 120_000;

function rng(seed) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed)), ((seed ^ seed >>> 14) >>> 0) / 4294967296); }

/** A one-way link: messages arrive in order, each delayed ONE_WAY ± JITTER. */
function link(random) {
  let last = 0; const queue = [];
  return {
    send(now, message) { last = Math.max(last, now + ONE_WAY + (random() * 2 - 1) * JITTER); queue.push({ at: last, message }); },
    receive(now) { const out = []; while (queue.length && queue[0].at <= now) out.push(queue.shift().message); return out; },
  };
}

function run(seed) {
  const random = rng(seed), up = link(random), down = link(random);
  // Server state.
  const remote = { x: 1600, y: 1200, heading: 0, moving: true, turnAt: 0 };
  const me = { x: 1000, y: 1200 };
  let heldInput = { x: 0, y: 0 }, serverTime = 0, nextTick = 0, lastSnapshot = -SNAPSHOT;
  // Client state.
  const buffer = new SnapshotBuffer(), predictor = new LocalPredictor();
  let latest = null, rtt = -1, sendAt = -SEND, pingAt = -PING;
  const pingsSent = new Map();
  // The local script: walk in one of eight directions for 0.6–2 s, stand 0.7–1.2 s (long enough for the old path to settle).
  let input = { x: 0, y: 0 }, scriptAt = 0, stoppedAt = 0;
  const truthRemote = [], drawnRemote = [], results = { old: newStats(), new: newStats() };
  let prevMeOld = null, prevMeNew = null;

  for (let frame = 0, now = 0; now < DURATION; frame++, now = frame * FRAME) {
    // Server ticks up to now.
    while (nextTick <= now) {
      const t = nextTick, dt = TICK / 1000;
      for (const message of up.receive(t)) {
        if (message.t === 'input') heldInput = message.input;
        if (message.t === 'ping') down.send(t, { t: 'pong', c: message.c });
      }
      serverTime += dt;
      if (t >= remote.turnAt) { remote.turnAt = t + 500 + random() * 1500; remote.moving = random() > 0.2; remote.heading += (random() - 0.5) * 2.4; }
      if (remote.moving) { remote.x += Math.cos(remote.heading) * SPEED * dt; remote.y += Math.sin(remote.heading) * SPEED * dt; }
      const length = Math.hypot(heldInput.x, heldInput.y);
      if (length > 0.05) { me.x += heldInput.x / length * SPEED * dt; me.y += heldInput.y / length * SPEED * dt; }
      truthRemote.push({ t, x: remote.x, y: remote.y });
      if (t - lastSnapshot >= SNAPSHOT) { lastSnapshot = t; down.send(t, { t: 'snapshot', time: serverTime, remote: { x: remote.x, y: remote.y, angle: remote.heading }, me: { x: me.x, y: me.y } }); }
      nextTick += TICK;
    }
    // Client: script, then messages, then frame (the order game.js uses).
    if (now >= scriptAt) {
      const walking = input.x === 0 && input.y === 0;
      if (walking) { const a = Math.floor(random() * 8) * Math.PI / 4; input = { x: Math.round(Math.cos(a)), y: Math.round(Math.sin(a)) }; results.old.pending = results.new.pending = now; scriptAt = now + 600 + random() * 1400; }
      else { input = { x: 0, y: 0 }; stoppedAt = now; scriptAt = now + 700 + random() * 500; }
    }
    for (const message of down.receive(now)) {
      if (message.t === 'pong') rtt = Math.round(now - pingsSent.get(message.c));
      if (message.t === 'snapshot') {
        latest = message;
        buffer.push(message.time, { r: message.remote, m: message.me }, now);
        predictor.reconcile(message.me, now, rtt >= 0 ? rtt : 150);
      }
    }
    if (!latest) continue;
    predictor.step(now, FRAME / 1000, (pos, dt) => { const length = Math.hypot(input.x, input.y); if (length > 0.05) { pos.x += input.x / length * SPEED * dt; pos.y += input.y / length * SPEED * dt; } });
    if (now - sendAt >= SEND) { sendAt = now; up.send(now, { t: 'input', input: { ...input } }); }
    if (now - pingAt >= PING) { pingAt = now; const c = frame; pingsSent.set(c, now); up.send(now, { t: 'ping', c }); }

    // What each path draws this frame (the remote tamer is scored after the run, against its whole path).
    drawnRemote.push({ now, old: { ...latest.remote }, new: { ...buffer.sample(now).get('r') } });
    const meOld = latest.me, meNew = predictor.pos;
    // Input to visible: first frame after a press where your own tamer has moved.
    for (const [stats, prev, drawn] of [[results.old, prevMeOld, meOld], [results.new, prevMeNew, meNew]]) {
      if (stats.pending !== null && prev && Math.hypot(drawn.x - prev.x, drawn.y - prev.y) > 0.5) { stats.inputDelay.push(now - stats.pending); stats.pending = null; }
    }
    // Your own tamer against the server: how far apart once standing still for 600 ms.
    if (input.x === 0 && input.y === 0 && now - stoppedAt > 600 && now > 2000) {
      results.old.restError.push(Math.hypot(meOld.x - me.x, meOld.y - me.y));
      results.new.restError.push(Math.hypot(meNew.x - me.x, meNew.y - me.y));
    }
    prevMeOld = { ...meOld }; prevMeNew = { ...meNew };
  }
  for (let i = 1; i < drawnRemote.length - 1; i++) {
    const a = drawnRemote[i - 1], b = drawnRemote[i], prevTruth = truthAt(truthRemote, a.now), truth = truthAt(truthRemote, b.now);
    for (const path of ['old', 'new']) score(results[path], a[path], b[path], prevTruth, truth, truthRemote, b.now);
  }
  return results;
}

function newStats() { return { frames: 0, stutter: 0, speedError: 0, behind: 0, presentError: 0, inputDelay: [], restError: [], pending: null }; }

/** The remote tamer's true position at server ms `t` (linear between ticks). */
function truthAt(path, t) {
  let i = path.length - 1;
  while (i > 0 && path[i].t > t) i--;
  const a = path[i], b = path[i + 1];
  if (!b) return { x: a.x, y: a.y };
  const f = (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * Per frame while the remote tamer really moves: a stutter frame is one where
 * the drawn step is under 25% or over 175% of the true step (frozen, or a
 * catch-up jump). Also the drawn speed error, how far in the past it is drawn
 * (the matching point on the true path), and the distance from where it is now.
 */
function score(stats, prev, drawn, prevTruth, truth, path, now) {
  const trueStep = Math.hypot(truth.x - prevTruth.x, truth.y - prevTruth.y);
  if (trueStep < SPEED * FRAME / 1000 * 0.5) return;
  const step = Math.hypot(drawn.x - prev.x, drawn.y - prev.y);
  stats.frames++;
  if (step < trueStep * 0.25 || step > trueStep * 1.75) stats.stutter++;
  stats.speedError += Math.abs(step - trueStep) / (FRAME / 1000);
  stats.presentError += Math.hypot(drawn.x - truth.x, drawn.y - truth.y);
  let best = Infinity, behind = 0;
  for (let back = 0; back <= 600; back += 5) { const p = truthAt(path, now - back), d = Math.hypot(p.x - drawn.x, p.y - drawn.y); if (d < best) { best = d; behind = back; } }
  stats.behind += behind;
}

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const seeds = [1, 2, 3, 4, 5];
const all = seeds.map(run);
const sum = (path, f) => mean(all.map(r => f(r[path])));
const row = (label, f, unit, digits = 0) => console.log(`${label.padEnd(44)} ${sum('old', f).toFixed(digits).padStart(7)} → ${sum('new', f).toFixed(digits).padStart(7)} ${unit}`);

console.log(`Wildbound item 1, ${seeds.length} seeds × ${DURATION / 1000} s, RTT ${ONE_WAY * 2} ms, ±${JITTER} ms jitter per message (old → new)`);
row('Remote tamer: stutter frames', s => 100 * s.stutter / s.frames, '%', 1);
row('Remote tamer: drawn speed error', s => s.speedError / s.frames, 'px/s');
row('Remote tamer: drawn this far in the past', s => s.behind / s.frames, 'ms');
row('Remote tamer: distance from where it is now', s => s.presentError / s.frames, 'px', 1);
row('Own tamer: input to visible movement', s => mean(s.inputDelay), 'ms');
row('Own tamer: off the server position at rest', s => mean(s.restError), 'px', 1);
