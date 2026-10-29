// Multiplayer relay: a lobby registry plus one GameRoom Durable Object per lobby.
// GameRoom runs the same sim.js the browser uses for solo play.
import * as S from './sim.js';

const ROOM_TTL = 45 * 60_000, LB_MS = 1000;
const COMMANDS = new Set(['choose', 'tame', 'eat', 'respawn', 'skill', 'pets', 'hat', 'release']);
const GLOBAL_EVENTS = new Set(['season', 'bossup', 'boss', 'death']);
const encoder = new TextEncoder();

function cleanName(value, fallback = 'Wanderer', max = 16) {
  const name = String(value || '').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return name || fallback;
}
function roomKey(value) { return cleanName(value, '', 24).toLowerCase(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function json(data, status = 200) { return Response.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }); }
async function hash(value) { const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '').slice(0, 40))); return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join(''); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/lobbies') return env.REGISTRY.getByName('global').fetch(new Request('https://registry/list'));
    if (url.pathname !== '/ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Wildbound relay', { status: 404 });
    const key = roomKey(url.searchParams.get('room'));
    if (key.length < 3) return new Response('invalid lobby name', { status: 400 });
    return env.ROOMS.getByName(key).fetch(request);
  }
};

export class LobbyRegistry {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/list') {
      const entries = await this.ctx.storage.list({ prefix: 'room:' }); const now = Date.now(), lobbies = [];
      for (const [key, value] of entries) {
        if (!value.updated || now - value.updated > 120_000 || value.players >= value.max || value.started) await this.ctx.storage.delete(key);
        else lobbies.push(value);
      }
      lobbies.sort((a, b) => b.updated - a.updated); return json({ lobbies });
    }
    const body = await request.json(); const key = `room:${body.key}`;
    if (path === '/upsert') { await this.ctx.storage.put(key, body.lobby); return new Response(null, { status: 204 }); }
    if (path === '/remove') { await this.ctx.storage.delete(key); return new Response(null, { status: 204 }); }
    return new Response('not found', { status: 404 });
  }
}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sessions = new Map(); this.players = new Map();
    this.room = ''; this.key = ''; this.host = null; this.settings = { max: 8, bots: 4 }; this.password = '';
    this.started = false; this.world = null; this.nextId = 1; this.timer = null; this.lastTick = 0; this.acc = 0; this.lbAt = 0; this.touched = Date.now();
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('upgrade required', { status: 426 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1]; server.accept();
    const session = { socket: server, id: null, ready: false, lastChat: 0 }; this.sessions.set(server, session); this.touched = Date.now();
    const timeout = setTimeout(() => { if (!session.ready) server.close(1008, 'handshake timeout'); }, 10_000);
    server.addEventListener('message', event => this.onMessage(session, event.data).catch(error => { console.error(error); this.send(server, { t: 'error', message: 'Relay error' }); }));
    server.addEventListener('close', () => { clearTimeout(timeout); this.remove(session); });
    server.addEventListener('error', () => this.remove(session));
    this.ensureTimer();
    return new Response(null, { status: 101, webSocket: client });
  }
  send(socket, message) { if (socket.readyState === 1) socket.send(typeof message === 'string' ? message : JSON.stringify(message)); }
  broadcast(message) { const encoded = JSON.stringify(message); for (const session of this.sessions.values()) if (session.ready) this.send(session.socket, encoded); }

  async onMessage(session, raw) {
    if (typeof raw !== 'string' || raw.length > 8192) return;
    let message; try { message = JSON.parse(raw); } catch { return; }
    this.touched = Date.now();
    if (!session.ready) { await this.join(session, message); return; }
    const player = this.players.get(session.id);
    if (!player) return;
    switch (message.t) {
      case 'start': if (session.id === this.host && !this.started) this.start(); break;
      case 'input': if (this.started) S.setInput(this.world, session.id, message); break;
      case 'cmd': {
        const c = message.c;
        if (this.started && c && typeof c === 'object' && COMMANDS.has(c.t)) {
          const clean = { t: c.t, id: typeof c.id === 'string' ? c.id.slice(0, 40) : undefined, mode: typeof c.mode === 'string' ? c.mode.slice(0, 10) : undefined };
          if (Number.isInteger(c.slot)) clean.slot = clamp(c.slot, -1, 2);
          if (Number.isFinite(c.x) && Number.isFinite(c.y)) { clean.x = clamp(c.x, 0, this.world.w); clean.y = clamp(c.y, 0, this.world.h); }
          S.command(this.world, session.id, clean);
        }
        break;
      }
      case 'chat': {
        const now = Date.now();
        const text = String(message.message || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 100);
        if (text && now - session.lastChat > 600) { session.lastChat = now; this.broadcast({ t: 'chat', id: session.id, name: player.name, message: text }); }
        break;
      }
    }
  }
  async join(session, message) {
    if (!['create', 'join'].includes(message.t)) { this.send(session.socket, { t: 'error', message: 'Create or join first' }); session.socket.close(1008); return; }
    const requested = cleanName(message.room, '', 24), key = roomKey(requested);
    if (key.length < 3) { this.reject(session, 'Invalid lobby name'); return; }
    if (message.t === 'create') {
      if (this.room || this.players.size) { this.reject(session, 'A lobby with that name already exists'); return; }
      this.room = requested; this.key = key;
      this.settings = { max: clamp(Math.round(message.settings?.max || 8), 2, 16), bots: clamp(Math.round(message.settings?.bots || 0), 0, 8) };
      this.settings.bots = Math.min(this.settings.bots, this.settings.max - 1);
      this.password = await hash(message.password || '');
    } else {
      if (!this.room) { this.reject(session, 'No open lobby has that name'); return; }
      if (this.started) { this.reject(session, 'That world has already started'); return; }
      if (this.players.size >= this.settings.max) { this.reject(session, 'That lobby is full'); return; }
      if (this.password !== await hash(message.password || '')) { this.reject(session, 'Wrong lobby password'); return; }
    }
    const id = `p${this.nextId++}`;
    this.players.set(id, { id, name: cleanName(message.name), skin: clamp(Math.floor(+message.skin || 0), 0, 7) });
    session.id = id; session.ready = true;
    if (!this.host) this.host = id;
    this.send(session.socket, { t: 'welcome', id, host: id === this.host });
    this.sendLobby(); await this.syncRegistry();
  }
  reject(session, message) { this.send(session.socket, { t: 'error', message }); setTimeout(() => session.socket.close(1008, message), 20); }
  remove(session) {
    if (!this.sessions.delete(session.socket) || !session.id) return;
    const wasHost = session.id === this.host;
    this.players.delete(session.id);
    if (this.world) S.removePlayer(this.world, session.id);
    if (!this.players.size) { this.reset(); return; }
    if (wasHost) this.host = this.players.keys().next().value;
    if (!this.started) { this.sendLobby(); this.syncRegistry(); }
  }
  reset() {
    this.removeRegistry();
    this.room = ''; this.key = ''; this.host = null; this.players.clear(); this.started = false; this.world = null; this.password = '';
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  sendLobby() { this.broadcast({ t: 'lobby', name: this.room, host: this.host, settings: this.settings, players: [...this.players.values()] }); }
  async syncRegistry() {
    if (!this.key) return;
    const lobby = { name: this.room, key: this.key, players: this.players.size, max: this.settings.max, locked: this.password !== await hash(''), started: this.started, updated: Date.now() };
    await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/upsert', { method: 'POST', body: JSON.stringify({ key: this.key, lobby }) }));
  }
  async removeRegistry() {
    if (!this.key) return;
    await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/remove', { method: 'POST', body: JSON.stringify({ key: this.key }) }));
  }

  start() {
    this.started = true;
    const world = this.world = S.createWorld(Date.now() & 0x7fffffff);
    // friends in a lobby start together; bots spread out over the map
    let first = null, k = 0;
    for (const p of this.players.values()) {
      const added = S.addPlayer(world, { id: p.id, name: p.name, skin: p.skin });
      if (!first) { first = added; continue; }
      const angle = k++ * 2.4;
      added.x = clamp(first.x + Math.cos(angle) * 160, 100, world.w - 100); added.y = clamp(first.y + Math.sin(angle) * 160, 100, world.h - 100);
    }
    S.fillBots(world, Math.min(this.settings.bots, this.settings.max - this.players.size));
    this.removeRegistry();
    for (const session of this.sessions.values()) if (session.ready) this.send(session.socket, { t: 'start', you: session.id, seed: world.seed, time: world.time });
    this.lastTick = Date.now(); this.acc = 0; this.lbAt = 0;
    this.sendFrame(world.events.splice(0));
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), S.TICK * 1000); }
  tick() {
    const now = Date.now();
    if (now - this.touched > ROOM_TTL) { for (const session of this.sessions.values()) session.socket.close(1000, 'lobby idle'); this.reset(); return; }
    if (!this.started || !this.world) return;
    // the sim relies on a fixed step, so catch up on timer jitter in whole ticks
    this.acc = Math.min(this.acc + (now - this.lastTick) / 1000, S.TICK * 4); this.lastTick = now;
    if (this.acc < S.TICK) return;
    const events = [];
    while (this.acc >= S.TICK) { this.acc -= S.TICK; S.step(this.world, S.TICK); events.push(...this.world.events.splice(0)); }
    this.sendFrame(events);
  }
  sendFrame(events) {
    const world = this.world;
    const now = Date.now();
    const lb = now - this.lbAt >= LB_MS ? JSON.stringify({ t: 'lb', rows: S.leaderboard(world) }) : null;
    if (lb) this.lbAt = now;
    for (const session of this.sessions.values()) {
      if (!session.ready) continue;
      const me = world.players[session.id];
      const ev = events.filter(e => {
        if (e.to) return e.to === session.id;
        if (GLOBAL_EVENTS.has(e.k) || !me || !Number.isFinite(e.x)) return true;
        return Math.abs(e.x - me.x) < S.VIEW.w + 200 && Math.abs(e.y - me.y) < S.VIEW.h + 200;
      });
      const snap = S.snapshot(world, session.id);
      snap.t = 's'; snap.ev = ev;
      this.send(session.socket, JSON.stringify(snap));
      if (lb) this.send(session.socket, lb);
    }
  }
}
