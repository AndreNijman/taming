// Room placement end to end against `wrangler dev` (relay plus a stub
// games-guard NetLog that prints each lag record). Clients with fake probe
// results (one far away) join, start and are moved; they reconnect with
// tickets and the expedition starts on the shard; a late joiner to the old
// name lands there too. Also /ping (region, CORS), the lag record's
// country/region/moved, and a same-region group that stays put.
//
//   node tests/latency/rooms.test.mjs          (spawns wrangler dev on PORT, default 8840)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT || '8840', INSPECTOR = process.env.INSPECTOR_PORT || '9340';
const relay = `http://127.0.0.1:${PORT}`, socketBase = relay.replace(/^http/, 'ws');
const wrangler = process.env.WRANGLER || 'node_modules/.bin/wrangler';
const state = mkdtempSync(join(tmpdir(), 'wildbound-latency-'));
const dev = spawn(wrangler, ['dev', '-c', 'wrangler.jsonc', '-c', 'tests/latency/netlog-stub.jsonc', '--port', PORT, '--inspector-port', INSPECTOR, '--ip', '127.0.0.1', '--persist-to', state], { stdio:['ignore', 'pipe', 'pipe'] });
let output = '';
dev.stdout.on('data', chunk => { output += chunk; });
dev.stderr.on('data', chunk => { output += chunk; });
const stop = () => { dev.kill('SIGTERM'); rmSync(state, { recursive:true, force:true }); };
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
  async hello(action, settings) { await this.opened; this.send({ t:action, room:this.room, name:this.name, password:'fern', settings }); return this.next('welcome'); }
  next(t, ms = 5000) { return until(() => this.messages.find(m => m.t === t), ms, `${this.name}: ${t}`); }
  pings(rtt) { for (let c = 1; c <= 3; c++) this.send({ t:'ping', c, rtt }); return until(() => this.messages.filter(m => m.t === 'pong').length >= 3, 3000, `${this.name}: pongs`); }
  close() { this.socket.close(); }
}
const NEAR = { oc:30, apac:90, weur:250, wnam:200 }, FAR = { oc:300, apac:100, weur:180, wnam:210 };
const records = () => output.split('\n').filter(line => line.includes('NETLOG_RECORD ')).map(line => JSON.parse(line.slice(line.indexOf('NETLOG_RECORD ') + 14)));

try {
  await until(() => fetch(`${relay}/health`).then(r => r.ok, () => false), 60_000, 'wrangler dev');
  const suffix = Date.now().toString(36);

  async function moved() {
    const name = `Far ${suffix}`;
    const host = new Client('Host', name), guest = new Client('Guest', name);
    const hostSeat = await host.hello('create', { max:4, bots:1 });
    const guestSeat = await guest.hello('join');
    host.send({ t:'regions', ms:NEAR }); guest.send({ t:'regions', ms:FAR });
    await host.pings(30); await guest.pings(300);
    // /ping for the lobby: region and CORS, without creating a room.
    const ping = await fetch(`${relay}/ping?room=${encodeURIComponent(name)}`);
    assert.equal(ping.headers.get('access-control-allow-origin'), '*');
    assert.equal(ping.headers.get('cache-control'), 'no-store');
    const where = await ping.json();
    assert.match(where.colo, /^[A-Z]{3}$/, 'the room knows its colo');
    assert.match(where.region, /^(wnam|enam|sam|weur|eeur|apac|oc|afr|me)$/);
    assert.equal((await fetch(`${relay}/ping?room=no`)).status, 400, 'room names are validated');
    assert.equal((await fetch(`${relay}/_adopt?room=${encodeURIComponent(name)}`, { method:'POST', body:'{}' })).status, 404, 'internal routes are not reachable');

    host.send({ t:'start' });
    const [toHost, toGuest] = await Promise.all([host.next('move'), guest.next('move')]);
    assert.match(toHost.shard, /^apac-[a-z0-9]{6}$/);
    assert.equal(toHost.region, 'apac');
    assert.equal(toGuest.shard, toHost.shard);
    assert.ok(toHost.ticket && toGuest.ticket && toHost.ticket !== toGuest.ticket);
    assert.ok(!host.messages.some(m => m.t === 'start'), 'the old room does not start');
    // A late joiner to the old name is sent on, without a ticket.
    const late = new Client('Late', name);
    await late.opened; late.send({ t:'join', room:name, name:'Late', password:'fern' });
    const toLate = await late.next('move');
    assert.equal(toLate.shard, toHost.shard); assert.equal(toLate.ticket, undefined);
    await until(() => host.closed && guest.closed, 3000, 'old sockets to close');
    assert.deepEqual(host.closed, { code:4000, reason:'moved' });
    // Everyone reconnects to the shard; the late joiner first, as a normal joiner.
    const late2 = new Client('Late', name, { shard:toLate.shard });
    await late2.hello('join');
    const host2 = new Client('Host', name, { shard:toHost.shard, ticket:toHost.ticket });
    const guest2 = new Client('Guest', name, { shard:toGuest.shard, ticket:toGuest.ticket });
    assert.equal((await host2.hello('join')).id, hostSeat.id, 'the host keeps its seat');
    assert.equal((await guest2.hello('join')).id, guestSeat.id, 'the guest keeps its seat');
    const starts = await Promise.all([host2, guest2, late2].map(c => c.next('start')));
    const humans = Object.keys(starts[0].world.players).filter(id => id.startsWith('p'));
    assert.equal(humans.length, 3, 'the expedition starts on the shard with everyone');
    const shardPing = await (await fetch(`${relay}/ping?room=${encodeURIComponent(name)}&shard=${toHost.shard}`)).json();
    assert.ok(shardPing.colo, 'the shard answers /ping');
    // After the start, a joiner to the old name lands on the shard and is refused as usual.
    const tardy = new Client('Tardy', name);
    await tardy.opened; tardy.send({ t:'join', room:name, name:'Tardy', password:'fern' });
    const tardy2 = new Client('Tardy', name, { shard:(await tardy.next('move')).shard });
    await tardy2.opened; tardy2.send({ t:'join', room:name, name:'Tardy', password:'fern' });
    assert.equal((await tardy2.next('error')).message, 'That expedition has already started');
    // Play past the lag log's 10 s minimum, then leave.
    for (const end = Date.now() + 10_500; Date.now() < end; await wait(250)) for (const c of [host2, guest2, late2]) c.send({ t:'input', x:1, y:0 });
    for (const c of [host2, guest2, late2]) c.close();
    const record = (await until(() => records().find(r => r.record.code === name), 10_000, 'the moved lag record')).record;
    assert.equal(record.region, 'apac');
    assert.equal(record.moved.to, 'apac');
    assert.match(record.moved.from, /^[A-Z]{3}$/);
    console.log('moved lag record:', JSON.stringify({ region:record.region, moved:record.moved, seats:record.seats.map(({ name, country, edge }) => ({ name, country, edge })) }));
    for (const seat of record.seats) { assert.match(seat.country, /^[A-Z]{2}$/, `${seat.name} has a country`); assert.ok(seat.edge, `${seat.name} has an edge`); }
    // The shard released the name: it can be created again at the old room.
    const again = await until(async () => {
      const c = new Client('Again', name);
      try { await c.opened; c.send({ t:'create', room:name, name:'Again', password:'', settings:{} }); return (await until(() => c.messages.find(m => ['welcome', 'move', 'error'].includes(m.t)), 3000, 'a reply')).t === 'welcome'; }
      catch { return false; } finally { c.close(); }
    }, 8000, 'the name to be released');
    assert.ok(again);
  }

  async function stays() {
    const name = `Near ${suffix}`;
    const a = new Client('Ana', name), b = new Client('Ben', name);
    await a.hello('create', { max:4, bots:0 }); await b.hello('join');
    a.send({ t:'regions', ms:NEAR }); b.send({ t:'regions', ms:{ ...NEAR, oc:35 } });
    await a.pings(30); await b.pings(35);
    a.send({ t:'start' });
    await Promise.all([a.next('start'), b.next('start')]);
    assert.ok(![a, b].some(c => c.messages.some(m => m.t === 'move')), 'a same-region group does not move');
    for (const end = Date.now() + 10_500; Date.now() < end; await wait(250)) for (const c of [a, b]) c.send({ t:'input', x:0, y:1 });
    a.close(); b.close();
    const record = (await until(() => records().find(r => r.record.code === name), 10_000, 'the lag record')).record;
    assert.equal(record.moved, null);
    assert.match(record.region, /^(wnam|enam|sam|weur|eeur|apac|oc|afr|me)$/);
    assert.ok(record.seats.every(seat => /^[A-Z]{2}$/.test(seat.country)));
  }

  await Promise.all([moved(), stays()]);
  console.log('rooms test passed');
} catch (error) {
  console.error(output.split('\n').slice(-40).join('\n'));
  throw error;
} finally {
  stop();
}
