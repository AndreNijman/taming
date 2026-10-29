// A lobby made without a password is open: listed as open and joinable with
// no password, while a lobby with one is listed as locked and still checks it.
//
//   node tests/lobby-lock.test.mjs     (spawns wrangler dev on PORT, default 8843)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT || '8843', INSPECTOR = process.env.INSPECTOR_PORT || '9343';
const relay = `http://127.0.0.1:${PORT}`, socketBase = relay.replace(/^http/, 'ws');
const wrangler = process.env.WRANGLER || 'node_modules/.bin/wrangler';

const state = mkdtempSync(join(tmpdir(), 'wildbound-lock-')), registry = mkdtempSync(join(tmpdir(), 'wildbound-lock-registry-'));
const dev = spawn(wrangler, ['dev', '-c', 'wrangler.jsonc', '-c', 'tests/latency/netlog-stub.jsonc', '--port', PORT, '--inspector-port', INSPECTOR, '--ip', '127.0.0.1', '--persist-to', state],
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

/** Sends create or join for `room` and returns the first welcome or error. */
async function hello(t, room, extra = {}) {
  const url = new URL(`${socketBase}/ws`); url.searchParams.set('room', room);
  const socket = new WebSocket(url), messages = [];
  socket.onmessage = event => messages.push(JSON.parse(event.data));
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.send(JSON.stringify({ t, room, name:`${t} ${room}`.slice(0, 16), settings:{ max:8, bots:0 }, ...extra }));
  const reply = await until(() => messages.find(m => m.t === 'welcome' || m.t === 'error'), 5000, `${t} ${room}`);
  return { socket, reply };
}

try {
  await until(() => fetch(`${relay}/health`).then(r => r.ok, () => false), 90_000, 'wrangler dev');
  const suffix = Date.now().toString(36);
  const open = `open ${suffix}`, locked = `locked ${suffix}`;
  const sockets = [];
  for (const [room, extra] of [[open, {}], [locked, { password:'fern' }]]) {
    const { socket, reply } = await hello('create', room, extra);
    assert.equal(reply.t, 'welcome', `create ${room}: ${JSON.stringify(reply)}`);
    sockets.push(socket);
  }
  const listed = await until(async () => {
    const { lobbies } = await fetch(`${relay}/lobbies`).then(r => r.json());
    const byName = Object.fromEntries(lobbies.map(l => [l.name, l]));
    return byName[open] && byName[locked] ? byName : null;
  }, 5000, 'both lobbies listed');
  assert.equal(listed[open].locked, false, 'a lobby made without a password is listed as open');
  assert.equal(listed[locked].locked, true, 'a lobby with a password is listed as locked');
  console.log('listing: ok');

  for (const extra of [{}, { password:'' }, { password:'anything' }]) {
    const { socket, reply } = await hello('join', open, extra);
    assert.equal(reply.t, 'welcome', `join the open lobby with ${JSON.stringify(extra)}: ${JSON.stringify(reply)}`);
    sockets.push(socket);
  }
  console.log('open lobby joins without a password: ok');

  for (const extra of [{}, { password:'' }, { password:'wrong' }]) {
    const { socket, reply } = await hello('join', locked, extra);
    assert.deepEqual(reply, { t:'error', message:'Wrong lobby password' }, `join the locked lobby with ${JSON.stringify(extra)}`);
    socket.close();
  }
  const right = await hello('join', locked, { password:'fern' });
  assert.equal(right.reply.t, 'welcome', 'the right password still gets in');
  sockets.push(right.socket);
  console.log('locked lobby still checks its password: ok');

  for (const socket of sockets) socket.close();
  console.log('lobby lock test passed');
} catch (error) {
  console.error(error);
  console.error(output.split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
} finally {
  stop();
  process.exit(process.exitCode || 0);
}
