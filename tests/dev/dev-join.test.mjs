// Dev join end to end against `wrangler dev` (relay plus the stub games-guard
// NetLog from tests/latency). The test makes its own Ed25519 key, starts the
// relay with its public half as DEV_TEST_PUBLIC_KEY and signs passes with
// netdev.js's signDevPass. A dev joins a locked lobby, a full one, a running
// expedition (spawned into the world, one bot steps aside, lag-log seat) and a
// moved room by its old name (forwarded to the shard); everyone sees
// dev-joined. Forged, expired, other-host and bare-flag passes are ordinary
// players and are turned away as before.
//
//   node tests/dev/dev-join.test.mjs     (spawns wrangler dev on PORT, default 8841)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signDevPass } from '../../netdev.js';

const PORT = process.env.PORT || '8841', INSPECTOR = process.env.INSPECTOR_PORT || '9341';
const HOST = 'wildbound.andrenijman.com';
const relay = `http://127.0.0.1:${PORT}`, socketBase = relay.replace(/^http/, 'ws');
const wrangler = process.env.WRANGLER || 'node_modules/.bin/wrangler';

const b64url = bytes => Buffer.from(bytes).toString('base64url');
async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name:'Ed25519' }, true, ['sign', 'verify']);
  return { privateKey:b64url(await crypto.subtle.exportKey('pkcs8', pair.privateKey)), publicKey:b64url(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}
const test = await keyPair(), other = await keyPair();
const pass = async (name, options = {}) => (await signDevPass(options.key || test.privateKey, { name, host:options.host || HOST, ...(options.now ? { now:options.now } : {}) })).pass;

const state = mkdtempSync(join(tmpdir(), 'wildbound-dev-')), registry = mkdtempSync(join(tmpdir(), 'wildbound-dev-registry-'));
const dev = spawn(wrangler, ['dev', '-c', 'wrangler.jsonc', '-c', 'tests/latency/netlog-stub.jsonc', '--port', PORT, '--inspector-port', INSPECTOR, '--ip', '127.0.0.1', '--persist-to', state, '--var', `DEV_TEST_PUBLIC_KEY:${test.publicKey}`],
  { stdio:['ignore', 'pipe', 'pipe'], env:{ ...process.env, WRANGLER_REGISTRY_PATH:registry } });
let output = '';
dev.stdout.on('data', chunk => { output += chunk; });
dev.stderr.on('data', chunk => { output += chunk; });
const stop = () => { dev.kill('SIGTERM'); rmSync(state, { recursive:true, force:true }); rmSync(registry, { recursive:true, force:true }); };
process.on('exit', stop);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms, what) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(50)) { const value = await check(); if (value) return value; }
  throw new Error(`timed out waiting for ${what}`);
}

class Client {
  constructor(name, room, { shard = '', ticket = '' } = {}) {
    const url = new URL(`${socketBase}/ws`); url.searchParams.set('room', room);
    if (shard) url.searchParams.set('shard', shard);
    if (ticket) url.searchParams.set('ticket', ticket);
    this.name = name; this.room = room; this.messages = []; this.closed = null;
    this.socket = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
    this.socket.onmessage = event => this.messages.push(JSON.parse(event.data));
    this.socket.onclose = event => { this.closed = { code:event.code, reason:event.reason }; };
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  async hello(action, extra = {}) { await this.opened; this.send({ t:action, room:this.room, name:this.name, password:'fern', ...extra }); return this.next('welcome'); }
  /** A join that must be refused: the error message. */
  async refused(extra) { await this.opened; this.send({ t:'join', room:this.room, name:this.name, ...extra }); const reply = await until(() => this.messages.find(m => ['welcome', 'error', 'start'].includes(m.t)), 5000, `${this.name}: a reply`); assert.equal(reply.t, 'error', `${this.name} was let in`); return reply.message; }
  next(t, ms = 5000, after = 0) { return until(() => this.messages.slice(after).find(m => m.t === t), ms, `${this.name}: ${t}`); }
  /** Everyone on the range, from the first leaderboard that arrives after now (snapshots only cover the player's view). */
  async snapshot() {
    const { rows } = await this.next('lb', 5000, this.messages.length);
    return { world:{ players:Object.fromEntries(rows.map(([id, name, , age, , x, y]) => [id, { id, name, bot:id.startsWith('b'), age, x, y }])) } };
  }
  close() { this.socket.close(); }
}
const NEAR = { oc:30, apac:90, weur:250, wnam:200 }, FAR = { oc:300, apac:100, weur:180, wnam:210 };
const records = () => output.split('\n').filter(line => line.includes('NETLOG_RECORD ')).map(line => JSON.parse(line.slice(line.indexOf('NETLOG_RECORD ') + 14)));
const humans = world => Object.values(world.players).filter(p => !p.bot), bots = world => Object.values(world.players).filter(p => p.bot);
const sawDevJoined = (clients, name) => Promise.all(clients.map(c => c.next('dev-joined'))).then(all => all.forEach(m => assert.deepEqual(m, { t:'dev-joined', name })));

try {
  await until(() => fetch(`${relay}/health`).then(r => r.ok, () => false), 90_000, 'wrangler dev');
  const suffix = Date.now().toString(36);
  const good = await pass('Andre');
  // Ordinary players however the pass is wrong: forged, expired, for another game, or a bare flag.
  const bad = {
    forged:{ dev:await pass('Andre', { key:other.privateKey }) },
    expired:{ dev:await pass('Andre', { now:Date.now() - 20 * 60_000 }) },
    'other host':{ dev:await pass('Andre', { host:'fart.andrenijman.com' }) },
    'bare flag':{ dev:true, admin:1 },
    garbage:{ dev:'v1.e30.AAAA' },
  };
  async function turnedAway(room, expected) {
    for (const [what, extra] of Object.entries(bad)) {
      const c = new Client('Mallory', room);
      assert.equal(await c.refused({ password:'wrong', ...extra }), expected, `${what} pass in ${room}`);
      c.close();
    }
  }

  // Locked lobby first: if DEV_TEST_PUBLIC_KEY did not reach the relay, this is where it shows.
  async function locked() {
    const room = `Locked ${suffix}`;
    const host = new Client('Host', room); await host.hello('create', { settings:{ max:4, bots:0 } });
    const outsider = new Client('Outsider', room);
    assert.equal(await outsider.refused({ password:'nope' }), 'Wrong lobby password'); outsider.close();
    const andre = new Client('Andre', room), seat = await andre.hello('join', { password:'', dev:good });
    await sawDevJoined([host, andre], 'ANDRE');
    await until(() => host.messages.some(m => m.t === 'lobby' && m.players.some(p => p.id === seat.id)), 3000, 'the dev in the roster');
    await turnedAway(room, 'Wrong lobby password');
    // A dev who joined in the lobby is a normal player at the start.
    host.send({ t:'start' });
    const [hostStart, devStart] = await Promise.all([host.next('start'), andre.next('start')]);
    assert.ok(hostStart.world.players[seat.id] && devStart.world.players[seat.id], 'the lobby dev starts with everyone');
    assert.ok(!host.messages.some(m => m.t === 'move'), 'no room move');
    host.close(); andre.close();
    console.log('locked: ok');
  }

  async function full() {
    const room = `Full ${suffix}`;
    const host = new Client('Host', room), guest = new Client('Guest', room);
    await host.hello('create', { settings:{ max:2, bots:0 } }); await guest.hello('join');
    const third = new Client('Third', room);
    assert.equal(await third.refused({ password:'fern' }), 'That lobby is full'); third.close();
    const andre = new Client('Andre', room), seat = await andre.hello('join', { dev:good });
    await sawDevJoined([host, guest, andre], 'ANDRE');
    const lobby = await until(() => host.messages.findLast(m => m.t === 'lobby' && m.players.length === 3), 3000, 'three in the roster');
    assert.ok(lobby.players.some(p => p.id === seat.id));
    await turnedAway(room, 'That lobby is full');
    for (const c of [host, guest, andre]) c.close();
    console.log('full: ok');
  }

  async function running() {
    const room = `Running ${suffix}`;
    const host = new Client('Host', room), guest = new Client('Guest', room);
    await host.hello('create', { settings:{ max:4, bots:2 } }); await guest.hello('join');
    host.send({ t:'start' });
    const start = await host.next('start'); await guest.next('start');
    assert.equal(humans(start.world).length, 2); assert.equal(bots(start.world).length, 2, 'two humans and two bots fill the range');
    const late = new Client('Late', room);
    assert.equal(await late.refused({ password:'fern' }), 'That expedition has already started'); late.close();
    await turnedAway(room, 'That expedition has already started');

    const andre = new Client('Andre', room), seat = await andre.hello('join', { dev:good });
    const devStart = await andre.next('start');
    assert.equal(devStart.you, seat.id);
    const me = devStart.world.players[seat.id];
    assert.ok(me && !me.dead && me.hp > 0 && me.age === 0, 'the dev spawns as a fresh tamer');
    assert.ok(me.x > 0 && me.y > 0, 'somewhere on the range');
    await sawDevJoined([host, guest, andre], 'ANDRE');
    // The game adjusts: three humans, one bot left, so four tamers as the lobby allows; everyone sees it.
    for (const c of [host, guest, andre]) {
      const snap = await c.snapshot();
      assert.deepEqual(humans(snap.world).map(p => p.name).sort(), ['Andre', 'Guest', 'Host'], `${c.name} sees the dev`);
      assert.equal(bots(snap.world).length, 1, `${c.name} sees one bot step aside`);
    }
    assert.ok(host.messages.some(m => m.t === 'event' && /left the range to make room for Andre/.test(m.message)), 'the feed says why');
    for (const c of [host, guest]) { const count = t => c.messages.filter(m => m.t === t).length, started = c.messages.findIndex(m => m.t === 'start'); assert.equal(count('start'), 1, `${c.name}: no second start`); assert.equal(count('welcome'), 1); assert.ok(!c.messages.slice(started).some(m => m.t === 'lobby'), `${c.name}: no lobby message mid-expedition`); }
    // The dev plays at once: its tamer moves on input.
    const x0 = (await host.snapshot()).world.players[seat.id].x;
    const left = x0 > 1600 ? -1 : 1;
    for (let i = 0; i < 12; i++) { andre.send({ t:'input', x:left, y:0 }); await wait(50); }
    const x1 = (await host.snapshot()).world.players[seat.id].x;
    assert.ok(Math.abs(x1 - x0) > 40, `the dev's tamer moves (${x0} -> ${x1})`);
    // There is no kick in Wildbound: a host's kick message does nothing to the dev.
    host.send({ t:'kick', id:seat.id }); host.send({ t:'votekick', id:seat.id });
    await wait(300);
    assert.ok((await guest.snapshot()).world.players[seat.id], 'the dev is still there');
    assert.equal(andre.closed, null);
    // Past the lag log's 10 s minimum: the dev is an ordinary seat in the record.
    for (const end = Date.now() + 10_500; Date.now() < end; await wait(250)) for (const c of [host, guest, andre]) c.send({ t:'input', x:0, y:1 });
    for (const c of [host, guest, andre]) c.close();
    const record = (await until(() => records().find(r => r.record.code === room), 15_000, 'the lag record')).record;
    assert.deepEqual(record.seats.map(s => s.name).sort(), ['Andre', 'Guest', 'Host']);
    assert.equal(record.moved, null, 'a late dev does not move the room');
    assert.equal(record.mode, '3p + 1 bots · survival', 'the bot that stepped aside is not counted');
    console.log('running: ok', JSON.stringify({ mode:record.mode, seats:record.seats.map(s => s.name) }));
  }

  async function moved() {
    const room = `Moved ${suffix}`;
    const host = new Client('Host', room), guest = new Client('Guest', room);
    await host.hello('create', { settings:{ max:4, bots:0 } }); await guest.hello('join');
    host.send({ t:'regions', ms:NEAR }); guest.send({ t:'regions', ms:FAR });
    for (const [c, rtt] of [[host, 30], [guest, 300]]) for (let i = 1; i <= 3; i++) c.send({ t:'ping', c:i, rtt });
    await wait(300);
    host.send({ t:'start' });
    const [toHost, toGuest] = await Promise.all([host.next('move'), guest.next('move')]);
    const host2 = new Client('Host', room, toHost), guest2 = new Client('Guest', room, toGuest);
    await host2.hello('join'); await guest2.hello('join');
    await Promise.all([host2.next('start'), guest2.next('start')]);
    // The dev uses the room's old name: forwarded without a ticket, then let in on the shard mid-expedition.
    const andre = new Client('Andre', room);
    await andre.opened; andre.send({ t:'join', room, name:'Andre', dev:good });
    const toDev = await andre.next('move');
    assert.equal(toDev.shard, toHost.shard); assert.equal(toDev.ticket, undefined);
    const andre2 = new Client('Andre', room, { shard:toDev.shard }), seat = await andre2.hello('join', { dev:good });
    const devStart = await andre2.next('start');
    assert.ok(devStart.world.players[seat.id], 'the dev spawns on the shard');
    await sawDevJoined([host2, guest2, andre2], 'ANDRE');
    assert.ok((await host2.snapshot()).world.players[seat.id], 'the shard players see the dev');
    for (const c of [host2, guest2, andre, andre2]) c.close();
    console.log('moved: ok');
  }

  await locked();
  await Promise.all([full(), running(), moved()]);
  console.log('dev join test passed');
} catch (error) {
  console.error(output.split('\n').slice(-40).join('\n'));
  throw error;
} finally {
  stop();
}
