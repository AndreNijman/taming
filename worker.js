// Multiplayer relay: a lobby registry plus one GameRoom Durable Object per lobby.
// GameRoom runs the same sim.js the browser uses for solo play.
import * as S from './sim.js';
import { NetStats, sendNetLog, coloOf } from './netstats.js';
import { REGIONS, playerWhere, withWhere, whereOf, chooseRegion, newShard, shardRegion, roomStub, regionOfColo } from './netplace.js';
import { verifyDevPass } from './netdev.js';

const ROOM_TTL = 45 * 60_000, LB_MS = 1000;
const ADOPT_WAIT_MS = 6000, MOVE_CLOSE_MS = 1000; // a moved room waits this long for its players; the old one closes their sockets after this
const COMMANDS = new Set(['choose', 'tame', 'eat', 'respawn', 'skill', 'pets', 'hat', 'release']);
const GLOBAL_EVENTS = new Set(['boss', 'death']);
const DEV_HOST = 'wildbound.andrenijman.com'; // dev passes (netdev.js) are only valid for this host
const encoder = new TextEncoder();

function cleanName(value, fallback = 'Wanderer', max = 16) {
  const name = String(value || '').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return name || fallback;
}
function roomKey(value) { return cleanName(value, '', 24).toLowerCase(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function json(data, status = 200) { return Response.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }); }
async function hash(value) { const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '').slice(0, 40))); return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join(''); }
// A client's netprobe.js results ({ weur: 38, apac: 290 }), known regions only, or null.
function cleanProbes(ms) {
  if (!ms || typeof ms !== 'object') return null;
  const out = {};
  for (const region of REGIONS) { const value = Number(ms[region]); if (value > 0 && value < 10000) out[region] = Math.round(value); }
  return Object.keys(out).length ? out : null;
}
const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
function newTicket() { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); }
// Everyone on the range in brief: sent once with the start for tools and tests; play uses the per-client snapshots.
function roster(world) {
  return Object.fromEntries(Object.values(world.players).map(p => [p.id, { id: p.id, name: p.name, bot: p.bot, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, age: p.age, dead: p.dead }]));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/lobbies') return env.REGISTRY.getByName('global').fetch(new Request('https://registry/list'));
    // Only a room's socket and its /ping are forwarded; the rooms' internal routes (/_adopt, /_released) never are.
    if (url.pathname !== '/ping' && (url.pathname !== '/ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')) return new Response('Wildbound relay', { status: 404 });
    const key = roomKey(url.searchParams.get('room')), shard = url.searchParams.get('shard') || '';
    if (key.length < 3) return new Response('invalid lobby name', { status: 400 });
    if (shard && !shardRegion(shard)) return new Response('invalid shard', { status: 400 });
    // A moved room lives on a shard (netplace.js); where the player connects from rides along for the lag log.
    return roomStub(env.ROOMS, key, shard).fetch(withWhere(request, playerWhere(request)));
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
    this.net = null; this.netLoopAt = 0; this.netBots = 0; this.colo = ''; this.coloP = null; // lag stats for the expedition in progress
    // Placement (netplace.js): moved is the shard this room moved to (persisted; undefined until loaded), moving the move in flight;
    // a shard knows its shard, the colo it came from, and the tickets of the players still to reconnect.
    this.moved = undefined; this.moving = null; this.adopted = false; this.shard = ''; this.movedFrom = ''; this.tickets = null; this.adoptTimer = null;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ping') { const colo = await this.whereColo(); return json({ colo, region: regionOfColo(colo) }); }
    if (url.pathname === '/_adopt' && request.method === 'POST') return this.adopt(await request.json());
    if (url.pathname === '/_alive') return json({ alive: !!(this.room || this.players.size || this.tickets) });
    if (url.pathname === '/_released' && request.method === 'POST') {
      const { shard } = await request.json(); await this.loadMoved();
      if (this.moved && this.moved === shard) await this.clearMoved();
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('upgrade required', { status: 426 });
    await this.loadMoved();
    const pair = new WebSocketPair(), client = pair[0], server = pair[1]; server.accept();
    const session = { socket: server, id: null, ready: false, lastChat: 0, where: whereOf(request), ticket: url.searchParams.get('ticket') || '', regions: null, rtts: [] };
    this.sessions.set(server, session); this.touched = Date.now();
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
    if (this.moved) return;
    const player = this.players.get(session.id);
    if (!player) return;
    switch (message.t) {
      case 'start': if (session.id === this.host && !this.started && !this.tickets) await this.startOrMove(); break;
      case 'regions': session.regions = cleanProbes(message.ms); break;
      case 'ping': {
        if (typeof message.rtt === 'number' && message.rtt >= 0 && message.rtt < 60000) { const rtts = session.rtts ??= []; rtts.push(message.rtt); if (rtts.length > 5) rtts.shift(); }
        this.net?.ping(session.id, message.rtt, message.fps, message.frameMax);
        this.send(session.socket, { t: 'pong', c: message.c });
        break;
      }
      case 'input':
        if (!this.started) break;
        this.net?.message(session.id);
        // x/y is the older field name for the move vector; tests and tools still send it
        S.setInput(this.world, session.id, { ...message, mx: message.mx ?? message.x, my: message.my ?? message.y });
        break;
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
    if (this.moving) await this.moving;
    if (this.moved && !await this.shardAlive(roomKey(message.room))) await this.clearMoved();
    if (this.moved) { this.redirect(session); return; }
    const seat = session.ticket && this.tickets?.get(session.ticket);
    if (seat) { this.tickets.delete(session.ticket); this.seatPlayer(session, seat.id, seat.name, seat.skin); if (!this.tickets.size) this.startAdopted(); return; }
    const requested = cleanName(message.room, '', 24), key = roomKey(requested);
    if (key.length < 3) { this.reject(session, 'Invalid lobby name'); return; }
    // A dev (a valid games-guard pass in message.dev) joins past the password, the player limit and a running expedition; anything else is an ordinary player.
    const dev = await verifyDevPass(message.dev, DEV_HOST, { publicKey: this.env.DEV_TEST_PUBLIC_KEY || undefined });
    if (message.t === 'create') {
      if (this.room || this.players.size) { this.reject(session, 'A lobby with that name already exists'); return; }
      this.room = requested; this.key = key;
      this.settings = { max: clamp(Math.round(message.settings?.max || 8), 2, 16), bots: clamp(Math.round(message.settings?.bots || 0), 0, 8) };
      this.settings.bots = Math.min(this.settings.bots, this.settings.max - 1);
      this.password = message.password ? await hash(message.password) : ''; // no password: an open lobby
    } else {
      if (!this.room) { this.reject(session, 'No open lobby has that name'); return; }
      if (!dev) {
        if (this.started) { this.reject(session, 'That expedition has already started'); return; }
        if (this.players.size >= this.settings.max) { this.reject(session, 'That lobby is full'); return; }
        if (this.password && this.password !== await hash(message.password || '')) { this.reject(session, 'Wrong lobby password'); return; }
      }
    }
    const id = `p${this.nextId++}`, name = cleanName(message.name), skin = clamp(Math.floor(+message.skin || 0), 0, 7);
    if (this.started && this.world) this.seatLate(session, id, name, skin); else this.seatPlayer(session, id, name, skin);
    if (dev) this.broadcast({ t: 'dev-joined', name: dev.name });
    await this.syncRegistry();
  }
  seatPlayer(session, id, name, skin) {
    this.players.set(id, { id, name, skin });
    session.id = id; session.ready = true;
    if (!this.host) this.host = id;
    this.send(session.socket, { t: 'welcome', id, host: id === this.host });
    this.sendLobby();
  }
  // Only a dev gets into a running expedition: a fresh tamer spawned as a respawn would be, and an ordinary
  // seat in the lag log. The range keeps its population: when tamers would now outnumber the lobby's max,
  // one bot leaves with its pets and buildings. Everyone else is playing, so no lobby message.
  seatLate(session, id, name, skin) {
    const world = this.world;
    this.players.set(id, { id, name, skin });
    S.addPlayer(world, { id, name, skin });
    session.id = id; session.ready = true;
    const bots = Object.values(world.players).filter(p => p.bot);
    if (bots.length && Object.keys(world.players).length > this.settings.max) {
      const bot = bots[bots.length - 1];
      S.removePlayer(world, bot.id); this.netBots = Math.max(0, this.netBots - 1);
      this.broadcast({ t: 'event', message: `${bot.name} left the range to make room for ${name}` });
    }
    this.net?.seat(id, name, session.where);
    this.send(session.socket, { t: 'welcome', id, host: false });
    this.send(session.socket, { t: 'start', you: id, seed: world.seed, time: world.time, world: { players: roster(world) } });
  }
  reject(session, message) { this.send(session.socket, { t: 'error', message }); setTimeout(() => session.socket.close(1008, message), 20); }
  remove(session) {
    this.sessions.delete(session.socket);
    if (!session.id) { if (!this.sessions.size && !this.players.size && !this.tickets) this.stopTimer(); return; }
    if (!this.players.has(session.id)) return;
    const wasHost = session.id === this.host;
    this.players.delete(session.id);
    if (this.world) S.removePlayer(this.world, session.id);
    if (!this.players.size) { this.reset(); return; }
    if (this.moved) return;
    if (wasHost) this.host = this.players.keys().next().value;
    if (!this.started) { this.sendLobby(); this.syncRegistry(); }
  }
  reset() {
    this.endNetLog('closed');
    this.removeRegistry(); this.release();
    this.room = ''; this.key = ''; this.host = null; this.players.clear(); this.started = false; this.world = null; this.password = '';
    this.tickets = null; clearTimeout(this.adoptTimer); this.adoptTimer = null;
    this.stopTimer();
  }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  sendLobby() { this.broadcast({ t: 'lobby', name: this.room, host: this.host, settings: this.settings, players: [...this.players.values()] }); }
  async syncRegistry() {
    if (!this.key || this.moved || this.tickets) return;
    const lobby = { name: this.room, key: this.key, players: this.players.size, max: this.settings.max, locked: !!this.password, started: this.started, updated: Date.now() };
    await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/upsert', { method: 'POST', body: JSON.stringify({ key: this.key, lobby }) }));
  }
  async removeRegistry() {
    if (!this.key) return;
    await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/remove', { method: 'POST', body: JSON.stringify({ key: this.key }) }));
  }

  // Placement, at match start: a mixed group whose worst ping would clearly improve elsewhere
  // (chooseRegion) moves first to a fresh Durable Object in that region, once; otherwise, or if
  // the move fails, the expedition starts here as before.
  async startOrMove() {
    if (this.moving) return;
    const sessions = [...this.sessions.values()].filter(s => s.ready && this.players.has(s.id));
    const choice = !this.adopted && sessions.length >= 2 ? chooseRegion(sessions.map(s => ({ probes: s.regions, rtt: median(s.rtts || []) }))) : null;
    if (choice) { this.moving = this.move(choice.region, sessions); await this.moving; this.moving = null; }
    if (!this.moved) this.start();
  }
  async move(region, sessions) {
    const shard = newShard(region), tickets = {}, ticketOf = new Map();
    const state = { room: this.room, settings: this.settings, password: this.password, host: this.host, nextId: this.nextId };
    for (const session of sessions) {
      const ticket = newTicket(), player = this.players.get(session.id);
      tickets[ticket] = { id: player.id, name: player.name, skin: player.skin }; ticketOf.set(session, ticket);
    }
    try {
      const response = await roomStub(this.env.ROOMS, this.key, shard).fetch(new Request('https://room/_adopt', { method: 'POST', body: JSON.stringify({ code: this.key, shard, from: await this.whereColo(), state, tickets }) }));
      if (!response.ok) throw new Error(`adopt answered ${response.status}`);
    } catch (error) { console.error('room move failed, starting here', error); return; }
    this.moved = shard; this.ctx.storage?.put('moved', shard); this.removeRegistry();
    for (const [session, ticket] of ticketOf) this.redirect(session, ticket);
  }
  // Send a socket on to the shard (a ticket keeps its seat; without one it joins as anyone would), then close it.
  redirect(session, ticket) {
    this.send(session.socket, { t: 'move', shard: this.moved, region: shardRegion(this.moved), ...(ticket ? { ticket } : {}) });
    setTimeout(() => session.socket.close(4000, 'moved'), MOVE_CLOSE_MS);
  }
  // On the shard: the old room's state and a ticket per player. Starts when every ticket is back, or after ADOPT_WAIT_MS with whoever made it.
  adopt({ code, shard, from, state, tickets }) {
    if (this.room || this.players.size || !state || !shardRegion(shard)) return new Response('room busy', { status: 409 });
    this.adopted = true; this.key = code; this.shard = shard; this.movedFrom = String(from || '');
    this.room = state.room; this.settings = state.settings; this.password = state.password; this.host = state.host; this.nextId = state.nextId;
    this.tickets = new Map(Object.entries(tickets || {})); this.touched = Date.now();
    this.adoptTimer = setTimeout(() => this.startAdopted(), ADOPT_WAIT_MS); this.whereColo();
    return new Response(null, { status: 204 });
  }
  startAdopted() {
    clearTimeout(this.adoptTimer); this.adoptTimer = null;
    if (!this.tickets) return;
    this.tickets = null;
    if (!this.players.size) { this.reset(); return; }
    if (!this.players.has(this.host)) this.host = this.players.keys().next().value;
    this.start();
  }
  // When a shard empties, its room's name is free again at the original Durable Object.
  release() {
    if (!this.shard) return;
    const shard = this.shard; this.shard = ''; this.movedFrom = '';
    const done = roomStub(this.env.ROOMS, this.key).fetch(new Request('https://room/_released', { method: 'POST', body: JSON.stringify({ shard }) })).catch(error => console.error('room release failed', error));
    this.ctx.waitUntil?.(done);
  }
  // A shard that lost its room without releasing the name (a restart mid-expedition) must not hold it forever.
  async shardAlive(code) {
    try { const response = await roomStub(this.env.ROOMS, code, this.moved).fetch(new Request('https://room/_alive')); return !response.ok || (await response.json()).alive; }
    catch { return true; }
  }
  async clearMoved() { this.moved = null; await this.ctx.storage?.delete('moved'); }
  async loadMoved() { if (this.moved === undefined) this.moved = (await this.ctx.storage?.get('moved')) || null; }
  whereColo() { return this.coloP ??= this.colo ? Promise.resolve(this.colo) : coloOf().then(colo => { this.colo = colo; if (!colo) this.coloP = null; return colo; }); }
  sessionOf(id) { for (const session of this.sessions.values()) if (session.id === id) return session; return null; }

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
    const players = roster(world);
    for (const session of this.sessions.values()) if (session.ready) this.send(session.socket, { t: 'start', you: session.id, seed: world.seed, time: world.time, world: { players } });
    this.lastTick = Date.now(); this.acc = 0; this.lbAt = 0;
    this.startNetLog();
    this.sendFrame(world.events.splice(0));
  }
  // One lag record per expedition, from the host's start until the room empties
  // (only a dev can join a started expedition), sent to games-guard's NetLog.
  startNetLog() {
    this.endNetLog('abandoned');
    this.net = new NetStats(); this.netLoopAt = 0;
    for (const player of this.players.values()) this.net.seat(player.id, player.name, this.sessionOf(player.id)?.where);
    this.netBots = Object.values(this.world.players).filter(p => p.bot).length;
    this.whereColo();
  }
  endNetLog(outcome) {
    const net = this.net; this.net = null;
    if (!net) return;
    const record = net.record({ code: this.room, mode: `${net.seats.size}p + ${this.netBots} bots · survival`, outcome, colo: this.colo, region: shardRegion(this.shard) || regionOfColo(this.colo), moved: this.shard ? { from: this.movedFrom, to: shardRegion(this.shard) } : null });
    if (record.runTime < 10) return;
    sendNetLog(this.env, this.ctx, 'wildbound', record);
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), S.TICK * 1000); }
  tick() {
    const now = Date.now();
    if (now - this.touched > ROOM_TTL) { for (const session of this.sessions.values()) session.socket.close(1000, 'lobby idle'); this.reset(); return; }
    if (!this.started || !this.world) return;
    const gap = now - this.lastTick;
    if (this.net) { if (this.netLoopAt) this.net.loop(gap, Math.min(gap, 100), Math.max(0, gap - 100)); this.netLoopAt = now; }
    // the sim relies on a fixed step, so catch up on timer jitter in whole ticks
    this.acc = Math.min(this.acc + gap / 1000, S.TICK * 4); this.lastTick = now;
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
