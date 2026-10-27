import assert from 'node:assert/strict';
import { GameRoom } from '../worker.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function makeRoom(logs) {
  const registry = { fetch: async () => new Response(null, { status:204 }) };
  const env = { REGISTRY:{ getByName:() => registry }, NETLOG:{ record:async (game, log) => { logs.push({ game, log }); return { ok:true }; } } };
  const room = new GameRoom({ waitUntil() {} }, env);
  room.colo = 'PER';
  return room;
}
function connect(room) {
  const socket = { readyState:1, sent:[], send(message) { this.sent.push(JSON.parse(message)); }, close() { this.readyState = 3; } };
  const session = { socket, id:null, ready:false };
  room.sessions.set(socket, session);
  return session;
}
const say = (room, session, message) => room.onMessage(session, JSON.stringify(message));
async function expedition(room, settings = { max:4, bots:2 }) {
  const host = connect(room), guest = connect(room);
  await say(room, host, { t:'create', room:'Lag Meadow', name:'Host', settings });
  await say(room, guest, { t:'join', room:'Lag Meadow', name:'Guest' });
  await say(room, host, { t:'start' });
  return { host, guest };
}

// An expedition logs once when the room empties, with each human's pings.
{
  const logs = [], room = makeRoom(logs);
  const { host, guest } = await expedition(room);
  assert.ok(room.net, 'stats start with the expedition');
  for (let k = 0; k < 20; k++) {
    await say(room, host, { t:'ping', c:k, rtt:40 + k, fps:60, frameMax:20 });
    await say(room, guest, { t:'ping', c:k, rtt:300 + k, fps:58, frameMax:35 });
    await say(room, host, { t:'input', x:1, y:0 });
  }
  assert.deepEqual(host.socket.sent.filter(m => m.t === 'pong').map(m => m.c).slice(0, 3), [0, 1, 2], 'pongs echo c');
  room.tick(); room.tick();
  room.net.startedAt -= 60_000;
  room.remove(guest);
  assert.equal(logs.length, 0, 'one player leaving does not end the expedition');
  room.remove(host);
  await tick();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].game, 'wildbound');
  const { log } = logs[0];
  assert.equal(log.outcome, 'closed');
  assert.equal(log.code, 'Lag Meadow');
  assert.equal(log.colo, 'PER');
  assert.equal(log.mode, '2p + 2 bots · survival');
  assert.deepEqual(log.seats.map(seat => seat.name), ['Host', 'Guest'], 'bots are not seated');
  assert.ok(log.seats[1].rttP95 >= 300 && log.seats[0].rttP95 < 100);
  assert.equal(log.seats[1].fpsMed, 58);
  assert.ok(log.server && log.server.tickGapMax >= 0);
  assert.equal(room.net, null);
  room.reset();
  await tick();
  assert.equal(logs.length, 1, 'a second reset does not log again');
}

// A lobby that never starts logs nothing; an expedition under 10 s logs nothing;
// an idle-closed one logs once even though its sockets close afterwards.
{
  const logs = [], room = makeRoom(logs);
  const lobby = connect(room);
  await say(room, lobby, { t:'create', room:'Quiet Den', name:'Solo', settings:{ max:2, bots:0 } });
  room.remove(lobby);
  const short = await expedition(room);
  room.remove(short.guest); room.remove(short.host);
  await tick();
  assert.equal(logs.length, 0);
  const idle = await expedition(room);
  room.net.startedAt -= 30_000;
  room.touched -= 46 * 60_000;
  room.tick();
  room.remove(idle.guest); room.remove(idle.host);
  await tick();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].log.outcome, 'closed');
}

console.log('netlog test passed');
