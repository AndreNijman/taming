// Hides network delay in online play. The relay's Durable Object runs the
// world and sends a snapshot about every 100 ms; drawn as they arrive, other
// tamers and animals step at 10 Hz and stall on every late packet, and your
// own tamer moves a full round trip after the key press.
//
// SnapshotBuffer draws everyone else a little in the past, interpolating
// between snapshots by server time. LocalPredictor moves your own tamer at
// once and reconciles with the server as snapshots arrive. Both take the
// clock as an argument (ms), so tests/latency/harness.mjs can drive them.

/** A jump larger than this between two snapshots is a teleport (respawn), drawn without sliding. */
export const TELEPORT_PX = 120;
/** How far past the newest snapshot an entity may be extrapolated when snapshots are late. */
export const MAX_EXTRAPOLATE_MS = 100;
/** Bounds for the render delay, which follows the 95th-percentile gap between snapshots. */
export const MIN_DELAY_MS = 80, MAX_DELAY_MS = 400;
const START_DELAY_MS = 150, GAPS = 40, OFFSETS = 50, SNAPS = 30;

const lerp = (a, b, f) => a + (b - a) * f;
const lerpAngle = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
const jumped = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_PX;

export class SnapshotBuffer {
  constructor() { this.reset(); }

  reset() { this.snaps = []; this.gaps = []; this.offsets = []; this.lastArrival = 0; }

  /**
   * A snapshot arrived: `serverTime` is its world.time (s), `entities` maps id
   * to { x, y, angle }, `now` is the local arrival time (ms).
   */
  push(serverTime, entities, now) {
    const t = serverTime * 1000, last = this.snaps[this.snaps.length - 1];
    if (last && t <= last.t) {
      if (t > last.t - 1000) return; // a repeat
      this.reset(); // a new world started
    }
    if (this.lastArrival) { this.gaps.push(now - this.lastArrival); if (this.gaps.length > GAPS) this.gaps.shift(); }
    this.lastArrival = now;
    this.offsets.push(now - t); if (this.offsets.length > OFFSETS) this.offsets.shift();
    this.snaps.push({ t, entities }); if (this.snaps.length > SNAPS) this.snaps.shift();
  }

  /** The render delay (ms): about the 95th-percentile gap between snapshot arrivals, clamped. */
  get delay() {
    if (this.gaps.length < 5) return START_DELAY_MS;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, sorted[Math.floor(0.95 * (sorted.length - 1))]));
  }

  /**
   * Server time (ms) to draw at `now`: the fastest recent snapshot's
   * arrival-minus-server-time offset maps local time to server time, then the
   * render delay leaves room for the next snapshot to arrive.
   */
  renderTime(now) { return now - Math.min(...this.offsets) - this.delay; }

  /** Interpolated { t (server seconds), get(id) → { x, y, angle } | undefined } at `now`, or null when empty. */
  sample(now) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const T = this.renderTime(now);
    let i = snaps.length - 1;
    while (i >= 0 && snaps[i].t > T) i--;
    const positions = new Map();
    if (i < 0) {
      for (const [id, e] of Object.entries(snaps[0].entities)) positions.set(id, e);
    } else if (i === snaps.length - 1) {
      // Snapshots are late: carry on along the last known motion, briefly.
      const b = snaps[i], a = snaps[i - 1], ahead = Math.min(T - b.t, MAX_EXTRAPOLATE_MS);
      for (const [id, e] of Object.entries(b.entities)) {
        const p = a?.entities[id];
        if (!p || jumped(p, e) || b.t <= a.t) { positions.set(id, e); continue; }
        const f = ahead / (b.t - a.t);
        positions.set(id, { x: e.x + (e.x - p.x) * f, y: e.y + (e.y - p.y) * f, angle: e.angle });
      }
    } else {
      const a = snaps[i], b = snaps[i + 1], f = (T - a.t) / (b.t - a.t);
      for (const [id, e] of Object.entries(b.entities)) {
        const p = a.entities[id];
        positions.set(id, !p || jumped(p, e) ? e : { x: lerp(p.x, e.x, f), y: lerp(p.y, e.y, f), angle: lerpAngle(p.angle, e.angle, f) });
      }
    }
    return { t: Math.max(0, T / 1000), get: id => positions.get(id) };
  }
}

/** Snaps instead of blending when the predicted and server positions disagree by more than this (respawn, shoved). */
export const SNAP_PX = 120;
/** Correction rate (1/s): about 80% of a small disagreement is blended out within 150 ms. */
const CORRECT_RATE = 10;
/**
 * Extra time an input waits on the server before it shows in a snapshot,
 * beyond the round trip: it is applied from the next 50 ms tick.
 */
export const SERVER_WAIT_MS = 25;

export class LocalPredictor {
  constructor() { this.reset(); }

  reset() { this.pos = null; this.history = []; this.error = { x: 0, y: 0 }; }

  /** Advance by one frame: `move(pos, dt)` moves `pos` in place by the game's own movement rule. */
  step(now, dt, move) {
    if (!this.pos) return;
    const x = this.pos.x, y = this.pos.y;
    move(this.pos, dt);
    this.history.push({ t: now, dx: this.pos.x - x, dy: this.pos.y - y });
    while (this.history.length && this.history[0].t < now - 2000) this.history.shift();
    const k = Math.min(1, dt * CORRECT_RATE);
    this.pos.x += this.error.x * k; this.pos.y += this.error.y * k;
    this.error.x *= 1 - k; this.error.y *= 1 - k;
  }

  /**
   * A snapshot put this player at `server` ({ x, y }) at `now`. It reflects
   * inputs sent up to about one round trip (`rtt`, ms) ago; adding this
   * client's own movement since then gives where the server will have it now.
   */
  reconcile(server, now, rtt) {
    const since = now - rtt - SERVER_WAIT_MS;
    let x = server.x, y = server.y;
    for (const h of this.history) if (h.t > since) { x += h.dx; y += h.dy; }
    if (!this.pos || Math.hypot(x - this.pos.x, y - this.pos.y) > SNAP_PX) {
      this.pos = { x, y }; this.error = { x: 0, y: 0 };
      return;
    }
    this.error = { x: x - this.pos.x, y: y - this.pos.y };
  }
}
