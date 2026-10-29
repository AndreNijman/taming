// Client-side prediction for this player's own tamer. Online, the relay's
// snapshots arrive about a round trip after the input that caused them, so
// drawing the server's position makes movement trail the keys. Instead the
// client moves its tamer at once with the sim's own movement step, and on
// every snapshot rebuilds that guess from the server's position plus the
// inputs the server has not applied yet. Any disagreement is blended out
// over a fraction of a second rather than snapped.
import { TICK, moveTamer } from './sim.js';

/** Further apart than this (a respawn, a knockback, a trap) and the tamer is snapped to the server. */
export const SNAP_PX = 160;
/** Blend rate (1/s) for a small disagreement: about 70% is gone after 100 ms. */
const CORRECT_RATE = 12;
const MAX_PENDING = 40;

export class Predictor {
  constructor() { this.reset(); }

  reset() { this.seq = 0; this.pending = []; this.state = null; this.prev = null; this.error = { x: 0, y: 0 }; }

  /**
   * One client tick: number `input`, remember it until the server confirms it, and move the
   * guess by it. `world` is a mirror ({ grid, structures }) for collisions. Returns the input to send.
   */
  input(input, world) {
    const sent = { ...input, seq: ++this.seq };
    this.pending.push(sent);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.state) { this.prev = { x: this.state.x, y: this.state.y }; moveTamer(world, this.state, sent, this.state.spd, TICK, true); }
    return sent;
  }

  /**
   * A snapshot: the server has the tamer `id` (radius `r`) at x, y after applying input `seq`,
   * moving at `v` with top speed `spd`. Replays the inputs it has not seen; keeps the drawn
   * position where it was by moving the difference into `error`.
   */
  reconcile(world, { id, r, x, y, seq, v, spd }) {
    this.pending = this.pending.filter(i => i.seq > seq);
    const next = { id, r, x, y, vx: v[0], vy: v[1], spd };
    for (const i of this.pending) moveTamer(world, next, i, spd, TICK, true);
    if (!this.state) { this.state = next; this.prev = { x: next.x, y: next.y }; return; }
    const dx = this.state.x - next.x, dy = this.state.y - next.y;
    if (Math.hypot(dx + this.error.x, dy + this.error.y) > SNAP_PX) {
      this.state = next; this.prev = { x: next.x, y: next.y }; this.error = { x: 0, y: 0 };
      return;
    }
    this.state = next;
    this.prev = { x: this.prev.x - dx, y: this.prev.y - dy };
    this.error.x += dx; this.error.y += dy;
  }

  /** Blend out the disagreement over `dt` seconds. */
  settle(dt) {
    const k = Math.exp(-dt * CORRECT_RATE);
    this.error.x *= k; this.error.y *= k;
  }

  /** Where to draw the tamer, `alpha` of the way through the current client tick; null before the first snapshot. */
  position(alpha) {
    if (!this.state) return null;
    return { x: this.prev.x + (this.state.x - this.prev.x) * alpha + this.error.x, y: this.prev.y + (this.state.y - this.prev.y) * alpha + this.error.y };
  }

  /** Forget the guess (death, leaving); the next snapshot starts a fresh one. Input numbers keep counting. */
  drop() { this.state = null; this.prev = null; this.error = { x: 0, y: 0 }; this.pending = []; }
}
