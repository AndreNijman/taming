// Room placement in plain Node: probes, the move decision, tickets, the
// shard's start, release, the lag record's country/region/moved and the
// Worker's routing. Rooms are GameRoom instances behind a fake namespace;
// sockets are injected as in tools/netlog-test.mjs.
//
//   node tests/latency/move.test.mjs
import assert from 'node:assert/strict';
import worker, { GameRoom } from '../../worker.js';

const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

function makeEnv({ failAdopt = false } = {}) {
  const logs = [], rooms = new Map(), hints = new Map(), removed = [];
  const registry = { fetch: async request => { if (new URL(request.url).pathname === '/remove') removed.push(1); return new Response(null, { status:204 }); } };
  const env = { REGISTRY:{ getByName:() => registry }, NETLOG:{ record:async (game, log) => { logs.push({ game, log }); return { ok:true }; } } };
  env.ROOMS = {
    idFromName: name => name,
    get(id, options) {
      if (options?.locationHint) hints.set(id, options.locationHint);
      return { fetch: async request => {
        if (failAdopt && new URL(request.url).pathname === '/_adopt') return new Response('nope', { status:500 });
        return room(id).fetch(request);
      } };
    },
  };
  function room(name) {
    if (!rooms.has(name)) {
      const storage = new Map();
      const ctx = { waitUntil() {}, storage:{ get:async key => storage.get(key), put:async (key, value) => { storage.set(key, value); }, delete:async key => { storage.delete(key); } }, stored:storage };
      const created = new GameRoom(ctx, env);
      created.colo = 'PER';
      rooms.set(name, created);
    }
    return rooms.get(name);
  }
  return { env, logs, rooms, hints, removed, room };
}
function connect(room, { ticket = '', country = 'AU', edge = 'PER' } = {}) {
  const socket = { readyState:1, sent:[], closed:null, send(message) { this.sent.push(JSON.parse(message)); }, close(code, reason) { this.readyState = 3; this.closed = { code, reason }; room.remove(session); } };
  const session = { socket, id:null, ready:false, where:{ country, edge }, ticket, regions:null, rtts:[] };
  room.sessions.set(socket, session);
  return session;
}
const say = (room, session, message) => room.onMessage(session, JSON.stringify(message));
const last = (session, t) => session.socket.sent.filter(m => m.t === t).at(-1);
const NEAR = { oc:30, apac:90, weur:250, wnam:200 }, FAR = { oc:300, apac:100, weur:180, wnam:210 };
async function lobby(room, name, players) {
  const sessions = [];
  for (const [index, player] of players.entries()) {
    const session = connect(room, player);
    await say(room, session, { t:index ? 'join' : 'create', room:name, name:player.name, password:'moss', settings:{ max:4, bots:1 } });
    if (player.probes) await say(room, session, { t:'regions', ms:player.probes });
    for (const rtt of player.rtts || []) await say(room, session, { t:'ping', c:rtt, rtt });
    sessions.push(session);
  }
  return sessions;
}

// Pings: the relay keeps the median of each player's last five.
{
  const { room } = makeEnv(), r = room('quiet');
  const [solo] = await lobby(r, 'Quiet', [{ name:'Solo', rtts:[500, 10, 20, 30, 40, 50, 60] }]);
  assert.deepEqual(solo.rtts, [20, 30, 40, 50, 60]);
  await say(r, solo, { t:'ping', c:1 }); // before the first pong there is no rtt
  assert.equal(solo.rtts.length, 5);
}

// A mixed group moves at start; tickets keep seats; a late joiner follows; the record says where.
{
  const { env, logs, rooms, hints, removed, room } = makeEnv(), root = room('far meadow');
  const [host, guest] = await lobby(root, 'Far Meadow', [
    { name:'Host', probes:NEAR, rtts:[30, 31, 29], country:'AU', edge:'PER' },
    { name:'Guest', probes:FAR, rtts:[300, 310, 290], country:'JP', edge:'NRT' },
  ]);
  const ids = [host.id, guest.id];
  await say(root, host, { t:'start' });
  const moveHost = last(host, 'move'), moveGuest = last(guest, 'move');
  assert.ok(moveHost && moveGuest, 'both players are told to move');
  assert.match(moveHost.shard, /^apac-[a-z0-9]{6}$/);
  assert.equal(moveHost.region, 'apac');
  assert.equal(moveGuest.shard, moveHost.shard);
  assert.match(moveHost.ticket, /^[a-z0-9]{16}$/);
  assert.notEqual(moveHost.ticket, moveGuest.ticket);
  assert.equal(root.started, false, 'the old room does not start');
  assert.equal(root.moved, moveHost.shard);
  assert.equal(root.ctx.stored.get('moved'), moveHost.shard, 'moved is persisted');
  assert.ok(removed.length, 'the lobby leaves the list');
  const shardName = `far meadow~${moveHost.shard}`, shard = rooms.get(shardName);
  assert.ok(shard, 'the shard was created');
  assert.equal(hints.get(shardName), 'apac', 'the shard is placed in its region');
  assert.equal(shard.tickets.size, 2);
  // Old sockets ignore further messages and close with 4000 "moved" after about a second.
  await say(root, host, { t:'start' });
  assert.equal(rooms.size, 2);
  await wait(1100);
  assert.deepEqual(host.socket.closed, { code:4000, reason:'moved' });
  assert.deepEqual(guest.socket.closed, { code:4000, reason:'moved' });
  assert.equal(root.players.size, 0);
  assert.equal(root.moved, moveHost.shard, 'emptying the old room keeps moved');
  // A late joiner to the old name is sent on without a ticket and joins the shard normally.
  const late = connect(root);
  await say(root, late, { t:'join', room:'Far Meadow', name:'Late', password:'moss' });
  assert.deepEqual(last(late, 'move'), { t:'move', shard:moveHost.shard, region:'apac' });
  const lateShard = connect(shard);
  await say(shard, lateShard, { t:'join', room:'Far Meadow', name:'Late', password:'moss' });
  assert.ok(last(lateShard, 'welcome'), 'the late joiner is in');
  assert.equal(shard.started, false, 'still waiting for tickets');
  // Ticket holders get their seats back; the shard starts when the last one is in.
  const host2 = connect(shard, { ticket:moveHost.ticket, country:'AU', edge:'PER' });
  await say(shard, host2, { t:'join', room:'Far Meadow', name:'Host', password:'' });
  assert.deepEqual(last(host2, 'welcome'), { t:'welcome', id:ids[0], host:true }, 'the host keeps seat and role');
  await say(shard, host2, { t:'start' });
  assert.equal(shard.started, false, 'a shard starts itself once everyone is back');
  const guest2 = connect(shard, { ticket:moveGuest.ticket, country:'JP', edge:'NRT' });
  await say(shard, guest2, { t:'join', room:'Far Meadow', name:'Guest', password:'' });
  assert.equal(last(guest2, 'welcome').id, ids[1]);
  assert.equal(shard.started, true);
  assert.equal(shard.tickets, null);
  for (const session of [host2, guest2, lateShard]) assert.ok(last(session, 'start'), 'everyone gets the start');
  assert.deepEqual(Object.keys(last(host2, 'start').world.players).filter(id => id.startsWith('p')).sort(), [...ids, lateShard.id].sort());
  // A used ticket is spent; joining a started shard is refused as usual.
  const again = connect(shard, { ticket:moveHost.ticket });
  await say(shard, again, { t:'join', room:'Far Meadow', name:'Again', password:'moss' });
  assert.equal(last(again, 'error').message, 'That expedition has already started');
  // The shard never moves again, and its lag record says where it ran and why.
  shard.net.startedAt -= 30_000;
  for (const session of [lateShard, guest2]) shard.remove(session);
  assert.equal(root.moved, moveHost.shard);
  shard.remove(host2);
  await wait(10);
  assert.equal(logs.length, 1);
  const { log } = logs[0];
  assert.equal(log.region, 'apac');
  assert.deepEqual(log.moved, { from:'PER', to:'apac' });
  assert.deepEqual(log.seats.map(seat => [seat.name, seat.country, seat.edge]), [['Late', 'AU', 'PER'], ['Host', 'AU', 'PER'], ['Guest', 'JP', 'NRT']]);
  // Released: the old name works normally again.
  assert.equal(root.moved, null);
  assert.equal(root.ctx.stored.has('moved'), false);
  const fresh = connect(root);
  await say(root, fresh, { t:'create', room:'Far Meadow', name:'Fresh', settings:{ max:2, bots:0 } });
  assert.ok(last(fresh, 'welcome'));
  // A stale release (another shard) changes nothing.
  root.moved = 'oc-zzzzzz';
  await root.fetch(new Request('https://room/_released', { method:'POST', body:JSON.stringify({ shard:'apac-aaaaaa' }) }));
  assert.equal(root.moved, 'oc-zzzzzz');
  void env;
}

// A shard that lost its room without releasing (restarted mid-expedition) does not hold the name.
{
  const { room } = makeEnv(), root = room('stale');
  root.moved = 'apac-zzzzzz';
  const c = connect(root);
  await say(root, c, { t:'create', room:'Stale', name:'C', settings:{ max:2, bots:0 } });
  assert.ok(last(c, 'welcome') && !last(c, 'move'));
  assert.equal(root.moved, null);
}

// Only six seconds for the tickets: whoever made it plays; latecomers with tickets are refused.
{
  const { rooms, room } = makeEnv(), root = room('slow');
  const [host, guest] = await lobby(root, 'Slow', [{ name:'Host', probes:NEAR, rtts:[30] }, { name:'Guest', probes:FAR, rtts:[300] }]);
  await say(root, host, { t:'start' });
  const shard = [...rooms.values()].find(r => r !== root);
  assert.ok(shard.adoptTimer, 'the six-second start is armed');
  const back = connect(shard, { ticket:last(guest, 'move').ticket });
  await say(shard, back, { t:'join', room:'Slow', name:'Guest' });
  shard.startAdopted(); // what the timer does at 6 s
  assert.equal(shard.started, true);
  assert.equal(shard.host, guest.id, 'the host stayed away, so someone present hosts');
  assert.deepEqual(Object.keys(shard.world.players).filter(id => id.startsWith('p')), [guest.id]);
  const tardy = connect(shard, { ticket:last(host, 'move').ticket });
  await say(shard, tardy, { t:'join', room:'Slow', name:'Host' });
  assert.equal(last(tardy, 'error').message, 'That expedition has already started');
  shard.remove(back);
  await wait(1100);
}

// Nobody comes back: the shard gives up and frees the name.
{
  const { rooms, room } = makeEnv(), root = room('empty');
  const [host] = await lobby(root, 'Empty', [{ name:'Host', probes:NEAR, rtts:[30] }, { name:'Guest', probes:FAR, rtts:[300] }]);
  await say(root, host, { t:'start' });
  const shard = [...rooms.values()].find(r => r !== root);
  shard.startAdopted();
  await wait(10);
  assert.equal(shard.room, '');
  assert.equal(root.moved, null);
  await wait(1100);
}

// Stay put: a same-region group, a missing probe, a single player, a failed adopt.
for (const [label, players, options] of [
  ['same region', [{ name:'A', probes:NEAR, rtts:[30] }, { name:'B', probes:NEAR, rtts:[35] }]],
  ['one player without probes', [{ name:'A', probes:NEAR, rtts:[30] }, { name:'B', rtts:[300] }]],
  ['no ping yet', [{ name:'A', probes:NEAR, rtts:[30] }, { name:'B', probes:FAR }]],
  ['alone', [{ name:'A', probes:FAR, rtts:[300] }]],
  ['adopt fails', [{ name:'A', probes:NEAR, rtts:[30] }, { name:'B', probes:FAR, rtts:[300] }], { failAdopt:true }],
]) {
  const { logs, rooms, room } = makeEnv(options), root = room('stay');
  const sessions = await lobby(root, 'Stay', players);
  const error = console.error; console.error = () => {};
  await say(root, sessions[0], { t:'start' });
  console.error = error;
  assert.equal(root.started, true, `${label}: starts here`);
  assert.equal(root.moved || null, null, label);
  assert.ok(sessions.every(s => !last(s, 'move') && last(s, 'start')), `${label}: nobody moves`);
  assert.equal(rooms.size, 1, `${label}: no shard`);
  root.net.startedAt -= 30_000;
  for (const s of sessions) root.remove(s);
  await wait();
  assert.equal(logs[0].log.region, 'oc', `${label}: region of the colo`);
  assert.equal(logs[0].log.moved, null);
  assert.equal(logs[0].log.seats[0].country, 'AU');
}

// /ping on the room: colo and region, CORS, no lobby created, no timer started.
{
  const { room } = makeEnv(), r = room('ping');
  const response = await r.fetch(new Request('https://relay/ping?room=Ping'));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { colo:'PER', region:'oc' });
  assert.equal(r.room, '');
  assert.equal(r.timer, null);
}

// The Worker: /ping and /ws go to the room (or its shard) with where the player is; internal routes never do.
{
  const seen = [];
  const env = { ROOMS:{ idFromName:name => name, get:(id, options) => ({ fetch:async request => { seen.push({ id, hint:options?.locationHint, path:new URL(request.url).pathname, country:request.headers.get('X-Games-Country') }); return new Response('ok'); } }) } };
  const call = (path, init) => worker.fetch(new Request(`https://relay${path}`, init), env);
  assert.equal((await call('/_adopt?room=abcd', { method:'POST', body:'{}' })).status, 404);
  assert.equal((await call('/_released?room=abcd', { method:'POST', body:'{}' })).status, 404);
  assert.equal((await call('/ws?room=abcd')).status, 404, 'a socket route needs an upgrade');
  assert.equal((await call('/ping?room=ab')).status, 400);
  assert.equal((await call('/ping?room=abcd&shard=mars-123456')).status, 400);
  assert.equal(seen.length, 0);
  const cfRequest = new Request('https://relay/ping?room=Mossy%20Meadow&shard=apac-abc123');
  Object.defineProperty(cfRequest, 'cf', { value:{ country:'jp', colo:'NRT' } });
  await worker.fetch(cfRequest, env);
  await call('/ws?room=Mossy%20Meadow', { headers:{ Upgrade:'websocket', 'X-Games-Country':'ZZ' } });
  assert.deepEqual(seen, [
    { id:'mossy meadow~apac-abc123', hint:'apac', path:'/ping', country:'JP' },
    { id:'mossy meadow', hint:undefined, path:'/ws', country:'' },
  ], 'routes by roomStub; a client cannot claim a country');
}

console.log('move test passed');
