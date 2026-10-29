// Browser client: menus, lobby networking, input, HUD and drawing.
// Solo games run sim.js locally at the fixed sim rate; online games render
// snapshots from the relay. Both paths draw from the same decoded snapshots.
import {
  SEASONS, seasonAt, TRANSITION, PETS, PET_BY_ID, ITEM_BY_ID, RARITY, PET_STAGE, PET_XP, BOSSES, BOSS_BY_ID,
  HATS, HAT_BY_ID, SKILLS, TYPES, xpForAge, WORLD, CENTER, ageChoices,
} from './data.js';
import * as S from './sim.js';
import * as R from './render.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const RES_COLORS = { wood: '#b9824a', stone: '#9aa1a6', food: '#e2413b', gold: '#f2c230' };
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);

const game = {
  mode: null, ws: null, room: '', id: null, host: false, running: false, paused: false, dead: false,
  seed: 0, sk: -1, grid: null, local: null, acc: 0, alpha: 1,
  prev: null, cur: null, snapAt: 0, snapGap: 50, lb: [], lastSendAt: 0,
  keys: new Set(), pointer: { x: innerWidth / 2, y: innerHeight / 2, down: false }, touch: { mx: 0, my: 0, attack: false },
  camera: { x: CENTER.x, y: CENTER.y }, zoom: 1, input: { mx: 0, my: 0, angle: 0, attack: false, sel: 0 },
  selId: null, auto: false, lock: false, petMode: 'defend',
  floaters: [], particles: [], shake: 0, nodeHits: new Map(), bubbles: new Map(), marker: null,
  feed: [], lastAction: '', hits: 0, startedAt: 0, overlay: null, dexSeason: 'forest', toastTimer: null, bannerTimer: null,
  sig: {}, view: null,
};
if (isLocalHost) window.wildbound = { game, S };

// ---------------- layout & menus ----------------

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
}
addEventListener('resize', resize); resize();
document.fonts?.load('800 17px "Baloo 2"').catch(() => {});

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}
function playerName() {
  const value = $('player-name').value.trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 16);
  try { if (value) localStorage.setItem('wildbound-name', value); } catch {}
  return value || 'Wanderer';
}
function stored(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
$('player-name').value = stored('wildbound-name', '');
let skin = clamp(+stored('wildbound-skin', 0) || 0, 0, R.FURS.length - 1);
function renderSkins() {
  const box = $('skins'); box.replaceChildren();
  R.FURS.forEach((fur, i) => {
    const b = document.createElement('button');
    b.className = `skin${i === skin ? ' on' : ''}`; b.style.background = fur; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', i === skin); b.setAttribute('aria-label', `Fur colour ${i + 1}`);
    b.onclick = () => { skin = i; try { localStorage.setItem('wildbound-skin', i); } catch {} renderSkins(); };
    box.append(b);
  });
}
renderSkins();

function toast(text) {
  $('toast').textContent = text; $('toast').classList.add('on');
  clearTimeout(game.toastTimer); game.toastTimer = setTimeout(() => $('toast').classList.remove('on'), 2200);
}
function banner(text) {
  const el = $('banner'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(game.bannerTimer); game.bannerTimer = setTimeout(() => el.classList.remove('on'), 3000);
}
function addFeed(text) {
  game.feed.unshift({ text, until: performance.now() + 6000 }); game.feed.length = Math.min(game.feed.length, 5);
  renderFeed();
}
function renderFeed() {
  const now = performance.now();
  game.feed = game.feed.filter(f => f.until > now);
  $('feed').replaceChildren(...game.feed.map(f => { const p = document.createElement('p'); p.textContent = f.text; return p; }));
}
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

function relayBase() {
  const override = new URLSearchParams(location.search).get('relay');
  if (override) return override.replace(/\/$/, '');
  if (isLocalHost) return location.origin;
  return 'https://wildbound-relay.tung-tung-tung-sahur.workers.dev';
}

$('how-button').onclick = () => { $('how').classList.remove('hidden'); $('how-button').setAttribute('aria-expanded', 'true'); };
$('close-how').onclick = () => { $('how').classList.add('hidden'); $('how-button').setAttribute('aria-expanded', 'false'); };
$('open-online').onclick = () => { show('online'); refreshLobbies(); };
document.querySelectorAll('[data-back="landing"]').forEach(button => button.onclick = () => show('landing'));
$('refresh').onclick = refreshLobbies;
$('play-cpu').onclick = () => startLocal(playerName());

// ---------------- field guide ----------------

function renderGuide() {
  const tabs = $('dex-seasons'); tabs.replaceChildren();
  for (const season of SEASONS) {
    const b = document.createElement('button'); b.textContent = season.name; b.className = season.id === game.dexSeason ? 'active' : '';
    b.style.setProperty('--season', season.ground);
    b.onclick = () => { game.dexSeason = season.id; renderGuide(); };
    tabs.append(b);
  }
  const season = SEASONS.find(s => s.id === game.dexSeason);
  const pets = PETS.filter(p => p.season === season.id);
  $('dex-count').textContent = `${pets.length} animals · ${season.duration / 60} minute season`;
  const grid = $('dex-grid'); grid.replaceChildren();
  grid.style.setProperty('--season', season.ground);
  for (const pet of pets) {
    const card = document.createElement('article'); card.className = 'dex-card';
    const art = document.createElement('img'); art.src = R.petPortrait(pet.id, 120).toDataURL(); art.alt = '';
    const rarity = RARITY[pet.rarity];
    card.innerHTML = `<span class="rarity" style="--c:${rarity.color}">${rarity.label}</span><h3>${escapeHtml(pet.name)}</h3>
      <div class="types">${pet.types.map(t => `<i style="--c:${TYPES[t].color}">${t}</i>`).join('')}</div>
      <p><b>Tame</b> ${pet.tame}% · raise with the ${pet.tool === 'appletor' ? 'Appletor' : 'Slingshot'}</p>
      <p><b>${SKILLS[pet.skill].name}</b> ${SKILLS[pet.skill].desc}</p>
      <p class="stats">HP ${pet.hp.join(' / ')} · Bite ${pet.bite.join(' / ')}</p>
      <p class="temper">${{ passive: 'Never attacks', coward: 'Runs when hurt', neutral: 'Fights back', aggressive: 'Hunts tamers' }[pet.temper]}</p>`;
    card.prepend(art);
    grid.append(card);
  }
  const boss = BOSS_BY_ID.get(season.boss);
  const card = document.createElement('article'); card.className = 'boss-card';
  const art = document.createElement('img'); art.src = R.bossPortrait(boss.id, 120).toDataURL(); art.alt = '';
  card.innerHTML = `<span class="rarity" style="--c:#e2413b">Boss</span><h3>${escapeHtml(boss.name)}</h3><p>${boss.hp} HP · stands its ground and summons ${PET_BY_ID.get(boss.minions).name.toLowerCase()} packs. Worth ${boss.gold} gold, shared by everyone who hurt it, and it leaves three sleeping babies behind.</p>`;
  card.prepend(art); grid.append(card);
}
$('open-tamodex').onclick = () => { renderGuide(); show('tamodex'); };
document.querySelectorAll('.collection-back').forEach(button => button.onclick = () => show('landing'));

// ---------------- lobbies ----------------

async function refreshLobbies() {
  const list = $('lobbies'); list.innerHTML = '<p class="empty">Looking for lobbies...</p>';
  try {
    const response = await fetch(`${relayBase()}/lobbies`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Relay unavailable');
    renderLobbies((await response.json()).lobbies || []);
  } catch (error) { list.innerHTML = `<p class="empty">${escapeHtml(error.message)}. You can still join by name.</p>`; }
}
function renderLobbies(lobbies) {
  const list = $('lobbies'); list.replaceChildren();
  if (!lobbies.length) { list.innerHTML = '<p class="empty">No open lobbies. Create the first one.</p>'; return; }
  for (const room of lobbies) {
    const row = document.createElement('div'); row.className = 'lobby-row';
    const info = document.createElement('div');
    const title = document.createElement('h4'); title.textContent = room.name;
    const meta = document.createElement('p'); meta.textContent = `${room.players}/${room.max} tamers · ${room.locked ? 'locked' : 'open'}`;
    info.append(title, meta);
    const join = document.createElement('button'); join.className = 'secondary'; join.textContent = 'Join';
    join.onclick = () => { $('join-name').value = room.name; connect('join', room.name, $('join-password').value); };
    row.append(info, join); list.append(row);
  }
}
$('create-form').onsubmit = event => {
  event.preventDefault();
  connect('create', $('room-name').value, $('room-password').value, { max: +$('room-max').value, bots: +$('room-bots').value });
};
$('join-form').onsubmit = event => { event.preventDefault(); connect('join', $('join-name').value, $('join-password').value); };

function connect(action, roomName, password = '', settings = {}) {
  const room = roomName.trim().replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').slice(0, 24);
  if (room.length < 3) { $('online-error').textContent = 'Lobby names need at least 3 characters.'; return; }
  $('online-error').textContent = 'Connecting...';
  const url = new URL(`${relayBase().replace(/^http/, 'ws')}/ws`); url.searchParams.set('room', room);
  const ws = new WebSocket(url);
  const timer = setTimeout(() => ws.close(), 10000);
  ws.onopen = () => { clearTimeout(timer); ws.send(JSON.stringify({ t: action, room, password, name: playerName(), skin, settings })); };
  ws.onmessage = event => handleMessage(JSON.parse(event.data));
  ws.onerror = () => { $('online-error').textContent = 'Could not reach the multiplayer relay.'; };
  ws.onclose = () => {
    clearTimeout(timer);
    if (game.ws === ws && game.running) leaveGame('Connection to the world was lost.');
    else if (!game.id) $('online-error').textContent = 'The lobby connection closed.';
  };
  game.ws = ws; game.mode = 'online'; game.room = room;
}
function send(message) { if (game.ws?.readyState === WebSocket.OPEN) game.ws.send(JSON.stringify(message)); }

function handleMessage(m) {
  switch (m.t) {
    case 'error': $('online-error').textContent = m.message; $('lobby-wait').textContent = m.message; break;
    case 'welcome': game.id = m.id; game.host = m.host; $('online-error').textContent = ''; break;
    case 'lobby': renderLobby(m); break;
    case 'start': game.id = m.you || game.id; beginGame(m.seed); break;
    case 's': {
      const now = performance.now();
      if (game.snapAt) game.snapGap = lerp(game.snapGap, clamp(now - game.snapAt, 20, 250), .2);
      game.snapAt = now;
      pushSnap(decodeSnap(m));
      handleEvents(m.ev || []);
      break;
    }
    case 'lb': game.lb = m.rows; break;
    case 'chat': addChat(m.id, m.name, m.message); break;
  }
}
function renderLobby(message) {
  show('lobby'); $('lobby-name').textContent = message.name; game.host = message.host === game.id;
  const roster = $('roster'); roster.replaceChildren();
  for (const player of message.players) {
    const row = document.createElement('div'); row.className = 'roster-row';
    const dot = document.createElement('i'); dot.style.background = R.FURS[player.skin % R.FURS.length] || R.FURS[0];
    const name = document.createElement('b'); name.textContent = player.name;
    const role = document.createElement('small'); role.textContent = player.id === message.host ? 'Host' : 'Ready';
    row.append(dot, name, role); roster.append(row);
  }
  $('lobby-cpu').textContent = `${message.settings.bots} CPU tamers will join`;
  $('start-match').classList.toggle('hidden', !game.host); $('lobby-wait').classList.toggle('hidden', game.host);
}
$('start-match').onclick = () => send({ t: 'start' });
$('leave-lobby').onclick = () => leaveGame();

// ---------------- game lifecycle ----------------

function startLocal(name) {
  const world = S.createWorld(Date.now() & 0x7fffffff);
  S.addPlayer(world, { id: 'me', name, skin });
  S.fillBots(world, 9);
  game.mode = 'local'; game.local = world; game.id = 'me'; game.host = true;
  beginGame(world.seed);
  pushSnap(decodeSnap(S.snapshot(world, 'me')));
  game.lb = S.leaderboard(world);
}

function beginGame(seed) {
  Object.assign(game, {
    seed, sk: -1, grid: null, prev: null, cur: null, acc: 0, alpha: 1, running: true, paused: false, dead: false,
    floaters: [], particles: [], shake: 0, feed: [], selId: null, auto: false, lock: false, petMode: 'defend', lastAction: '',
    hits: 0, startedAt: performance.now(), snapAt: 0, sig: {}, marker: null,
  });
  game.nodeHits.clear(); game.bubbles.clear();
  document.body.classList.add('playing');
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $('hud').classList.remove('hidden');
  for (const id of ['pause', 'death', 'world-map', 'field-shop']) $(id).classList.add('hidden');
  renderFeed();
  toast('Gather, age up, and tame a sleeping baby.');
}

function leaveGame(message = '') {
  if (game.ws) { const ws = game.ws; game.ws = null; ws.close(); }
  Object.assign(game, { running: false, id: null, local: null, prev: null, cur: null, dead: false, mode: null, overlay: null });
  document.body.classList.remove('playing');
  $('hud').classList.add('hidden');
  for (const id of ['pause', 'death', 'world-map', 'field-shop']) $(id).classList.add('hidden');
  show('landing');
  if (message) toast(message);
}

function cmd(c) {
  if (!game.running) return;
  if (game.mode === 'local') S.command(game.local, game.id, c);
  else send({ t: 'cmd', c });
}

// ---------------- snapshots ----------------

function decodeSnap(s) {
  const players = new Map(), animals = new Map(), projectiles = new Map();
  for (const r of s.p) { const p = S.decodePlayer(r); players.set(p.id, p); }
  for (const r of s.a) { const a = S.decodeAnimal(r); animals.set(a.id, a); }
  for (const r of s.j) { const j = S.decodeProjectile(r); projectiles.set(j.id, j); }
  return {
    time: s.time, sk: s.sk, me: s.me, players, animals, projectiles,
    structures: s.s.map(S.decodeStructure), hazards: s.h.map(([id, x, y, r, at]) => ({ id, x, y, r, at })), boss: s.boss || [],
  };
}
function pushSnap(snap) {
  game.prev = game.cur || snap; game.cur = snap;
  if (snap.sk !== game.sk) {
    game.sk = snap.sk;
    game.grid = S.generateResources(game.seed, snap.sk);
    game.nodeHits.clear();
  }
}
function stepLocal(dt) {
  const world = game.local;
  game.acc += dt;
  let steps = 0;
  while (game.acc >= S.TICK) {
    game.acc -= S.TICK;
    if (++steps > 4) { game.acc = 0; break; }
    S.setInput(world, game.id, game.input);
    S.step(world, S.TICK);
    const events = world.events.splice(0).filter(e => !e.to || e.to === game.id);
    pushSnap(decodeSnap(S.snapshot(world, game.id)));
    handleEvents(events);
    if (world.tick % 20 === 0) game.lb = S.leaderboard(world);
  }
  game.alpha = game.acc / S.TICK;
}

// Interpolated view of everything in the latest two snapshots.
function buildView() {
  const { prev, cur, alpha } = game;
  const t = lerp(prev.time, cur.time, alpha);
  const mix = (map, pmap) => [...map.values()].map(e => {
    const o = pmap.get(e.id);
    if (!o || Math.hypot(o.x - e.x, o.y - e.y) > 300) return e;
    return { ...e, x: lerp(o.x, e.x, alpha), y: lerp(o.y, e.y, alpha), angle: o.angle + S.angleDiff(o.angle, e.angle) * alpha };
  });
  const players = mix(cur.players, prev.players), animals = mix(cur.animals, prev.animals), projectiles = mix(cur.projectiles, prev.projectiles);
  const me = players.find(p => p.id === game.id) || null;
  // our own facing follows the mouse immediately rather than the server echo
  if (me && !me.dead) me.angle = game.input.angle;
  return { t, players, animals, projectiles, me, structures: cur.structures, hazards: cur.hazards, meData: cur.me };
}

// ---------------- events → effects ----------------

const clientNow = () => performance.now() / 1000;
function floater(x, y, text, color, size = 22, life = .9) {
  game.floaters.push({ x, y, text, color, size, at: clientNow(), life, vx: (Math.random() - .5) * 1.2 });
  if (game.floaters.length > 80) game.floaters.shift();
}
function burst(x, y, color, n = 6, opts = {}) {
  const at = clientNow();
  for (let i = 0; i < n; i++) {
    const a = (opts.dir ?? Math.random() * TAU) + (Math.random() - .5) * (opts.spread ?? TAU), sp = (opts.speed ?? 90) * (.5 + Math.random());
    game.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, at, life: opts.life ?? .55, color, size: opts.size ?? 7, spin: (Math.random() - .5) * 8, shape: opts.shape, grav: opts.grav });
  }
  if (game.particles.length > 300) game.particles.splice(0, game.particles.length - 300);
}
function ring(x, y, color, size = 60) {
  game.particles.push({ x, y, vx: 0, vy: 0, at: clientNow(), life: .5, color, size, spin: 0, shape: 'ring', grav: 0 });
}
const petName = id => PET_BY_ID.get(id)?.name || 'animal';
const near = (x, y, d = 1400) => !game.view?.me || Math.hypot(game.view.me.x - x, game.view.me.y - y) < d;

function handleEvents(events) {
  for (const e of events) {
    const mine = e.by === game.id || e.to === game.id || e.owner === game.id;
    switch (e.k) {
      case 'dmg': {
        const self = e.id === game.id;
        if (e.by === game.id) game.hits++;
        if (self) game.shake = Math.max(game.shake, .22);
        const color = self ? '#ff3b30' : e.kind === 'struct' ? '#e8dfcc' : e.kind === 'poison' ? '#c77dff' : e.kind === 'burn' ? '#ffa23a' : e.kind === 'ice' ? '#9be7ff' : '#ff5a4a';
        floater(e.x + (Math.random() - .5) * 20, e.y, String(e.amt), color, self || e.crit ? 26 : 21);
        burst(e.x, e.y + 20, '#ffffff', 3, { size: 4, speed: 120, life: .3, shape: 'spark', grav: 0 });
        break;
      }
      case 'heal': floater(e.x, e.y, `+${e.amt}`, '#7fe05a', 20); break;
      case 'gather': {
        game.nodeHits.set(e.id, { at: clientNow(), dir: e.ang });
        const color = { wood: '#c8925a', stone: '#b9b4aa', food: '#e2413b', gold: '#ffd23f' }[e.res];
        burst(e.x - Math.cos(e.ang) * 30, e.y - Math.sin(e.ang) * 30, color, e.res === 'gold' ? 4 : 3, { dir: e.ang + Math.PI, spread: 2, speed: 140, shape: e.res === 'wood' ? 'leaf' : e.res === 'gold' ? 'spark' : undefined, size: 6 });
        if (e.by === game.id) { game.lastAction = 'gather'; pulse(e.res); }
        break;
      }
      case 'kill': burst(e.x, e.y, '#f4ead2', 10, { size: 9, speed: 120 }); break;
      case 'death':
        if (near(e.x, e.y)) burst(e.x, e.y, '#f4ead2', 14, { size: 10, speed: 160 });
        addFeed(`${e.byName || 'The wild'} defeated ${e.name}`);
        if (e.id === game.id) showDeath(e);
        break;
      case 'age':
        if (e.id === game.id) { banner(`Age ${e.age}`); ring(e.x, e.y, '#ffffff', 90); burst(e.x, e.y, '#ffe17a', 12, { shape: 'spark', speed: 160, size: 8 }); }
        break;
      case 'tame':
        burst(e.x, e.y, '#ff6f91', 8, { shape: 'heart', speed: 90, size: 9, grav: -60, life: 1 });
        if (e.by === game.id) { banner(`You tamed a ${petName(e.species)}!`); game.lastAction = 'tame'; }
        else if (near(e.x, e.y)) addFeed(`${e.name} tamed a ${petName(e.species)}`);
        break;
      case 'tamefail':
        burst(e.x, e.y, '#6b5b4b', 8, { size: 9, speed: 80 });
        if (e.by === game.id) { toast(`Taming failed at ${e.chance}%. The ${petName(e.species)} is angry!`); game.lastAction = 'tamefail'; }
        break;
      case 'grow':
        ring(e.x, e.y, '#7fe05a', 90);
        if (e.owner === game.id) banner(`Your ${petName(e.species)} grew into ${PET_STAGE[e.stage] === 'Boss' ? 'a Boss' : 'an Adult'}!`);
        break;
      case 'skill': {
        const def = PET_BY_ID.get(game.cur?.animals.get(e.id)?.species);
        ring(e.x, e.y, def ? TYPES[def.types[0]].color : '#ffffff', 220);
        break;
      }
      case 'mill': floater(e.x, e.y - 40, `+${e.amt}`, '#ffd23f', 20, 1.1); pulse('gold'); break;
      case 'msg': if (e.to === game.id) toast(e.text); break;
      case 'season': banner(`${e.name} has arrived`); addFeed(`The world turns to ${e.name.toLowerCase()}`); break;
      case 'bossup': addFeed(`${e.name} has awoken`); break;
      case 'boss': banner(`${e.byName || 'Someone'} defeated ${e.name}!`); addFeed(`${e.name} fell. Three babies sleep where it stood`); break;
      case 'wave': if (near(e.x, e.y, 1600)) addFeed(`${e.name} calls its pack`); break;
      case 'impact':
        burst(e.x, e.y, '#ff7b2e', 12, { size: 10, speed: 200 });
        if (near(e.x, e.y, 500)) game.shake = Math.max(game.shake, .4);
        break;
      case 'trap': ring(e.x, e.y, '#cfcac0', 60); break;
      case 'break': burst(e.x, e.y, '#c8925a', 10, { size: 9, speed: 140 }); break;
      case 'place': burst(e.x, e.y + 20, '#d9cbb0', 6, { size: 8, speed: 70 }); if (e.by === game.id) game.lastAction = 'build'; break;
      case 'bonus':
        if (e.to === game.id) floater(e.x, e.y, e.reset ? 'reset!' : `+${e.bonus}%`, e.reset ? '#ff5a4a' : '#7fe05a', 22, 1.1);
        break;
      case 'petdied': if (e.owner === game.id) toast(`Your ${petName(e.species)} was defeated`); break;
    }
    void mine;
  }
}

function pulse(res) {
  const el = document.querySelector(`.res[data-res="${res}"]`);
  if (!el) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

function showDeath(e) {
  game.dead = true;
  $('age-choice').classList.add('hidden');
  $('death-title').textContent = e.byName ? `${e.byName} defeated you` : 'You were defeated';
  $('death-stats').textContent = `Age ${e.age} · ${e.gold} gold · ${e.kills} kills. Your pets and buildings are waiting for you.`;
  $('death').classList.remove('hidden');
}
$('respawn').onclick = () => cmd({ t: 'respawn' });

// ---------------- input ----------------

function myData() { return game.cur?.me; }
function selectSlot(i) {
  const id = myData()?.items[i];
  if (!id) return;
  game.selId = id;
  if (ITEM_BY_ID.get(id)?.slot !== 'food') game.lastWeapon = id;
}
function selIndex() {
  const items = myData()?.items || [];
  let i = items.indexOf(game.selId);
  if (i < 0) {
    // an upgrade replaced the selected item: keep the same slot type
    const slot = ITEM_BY_ID.get(game.selId)?.slot;
    i = Math.max(0, items.findIndex(id => ITEM_BY_ID.get(id)?.slot === slot));
    game.selId = items[i];
  }
  return i;
}
function screenToWorld(x, y) {
  return { x: game.camera.x + (x - innerWidth / 2) / game.zoom, y: game.camera.y + (y - innerHeight / 2) / game.zoom };
}
function updateInput() {
  const k = game.keys, blocked = game.paused || game.dead || game.overlay;
  let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
  if (game.touch.mx || game.touch.my) { mx = game.touch.mx; my = game.touch.my; }
  const me = game.view?.me;
  if (me && !game.lock) {
    const sx = innerWidth / 2 + (me.x - game.camera.x) * game.zoom, sy = innerHeight / 2 + (me.y - game.camera.y) * game.zoom;
    game.input.angle = Math.atan2(game.pointer.y - sy, game.pointer.x - sx);
  }
  if (blocked) { mx = my = 0; }
  game.input.mx = mx; game.input.my = my;
  game.input.attack = !blocked && (game.pointer.down || game.auto || game.touch.attack);
  game.input.sel = selIndex();
}

const typing = () => document.activeElement?.tagName === 'INPUT';
addEventListener('keydown', event => {
  if (!game.running || typing()) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') { if (game.overlay) closeOverlay(); else togglePause(); return; }
  if (key === 'enter') { event.preventDefault(); openChat(); return; }
  if (game.overlay || game.paused) return;
  if (/^[1-9]$/.test(key)) selectSlot(+key - 1);
  else if (key === ' ') { event.preventDefault(); cmd({ t: 'tame' }); }
  else if (key === 'q') cmd({ t: 'eat' });
  else if (key === 'f' || key === ',') cmd({ t: 'skill' });
  else if (key === 'x') setPetMode(game.petMode === 'attack' ? 'defend' : 'attack');
  else if (key === 'e') { game.auto = !game.auto; toast(`Auto attack ${game.auto ? 'on' : 'off'}`); }
  else if (key === 'l') { game.lock = !game.lock; toast(`Aim ${game.lock ? 'locked' : 'free'}`); }
  else if (key === 'm') openMap();
  else if (key === 'c') openShop();
  game.keys.add(key);
});
addEventListener('keyup', event => game.keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => { game.keys.clear(); game.pointer.down = false; });
addEventListener('pointermove', event => { game.pointer.x = event.clientX; game.pointer.y = event.clientY; });
canvas.addEventListener('pointerdown', event => {
  game.pointer.x = event.clientX; game.pointer.y = event.clientY;
  if (event.button === 2) {
    const p = screenToWorld(event.clientX, event.clientY);
    setPetMode('move', p);
    return;
  }
  if (event.button === 0) game.pointer.down = true;
});
addEventListener('pointerup', event => { if (event.button === 0) game.pointer.down = false; });
canvas.addEventListener('contextmenu', event => event.preventDefault());

function setPetMode(mode, at) {
  if (!myData()?.pets.length) { toast('You have no pets yet'); return; }
  if (mode !== 'move') game.petMode = mode;
  cmd({ t: 'pets', mode, ...(at ? { x: Math.round(at.x), y: Math.round(at.y) } : {}) });
  if (at) game.marker = { x: at.x, y: at.y, at: clientNow() };
}

function openChat() {
  const input = $('chat-input'); input.classList.remove('hidden'); input.focus();
  game.keys.clear(); game.pointer.down = false;
}
$('chat-input').onkeydown = event => {
  event.stopPropagation();
  const input = event.currentTarget;
  if (event.key === 'Enter') {
    const value = input.value.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 100);
    if (value) { if (game.mode === 'online') send({ t: 'chat', message: value }); else addChat(game.id, game.cur?.players.get(game.id)?.name || playerName(), value); }
    input.value = ''; input.classList.add('hidden'); input.blur();
  }
  if (event.key === 'Escape') { input.value = ''; input.classList.add('hidden'); input.blur(); }
};
function addChat(id, name, message) {
  const p = document.createElement('p');
  const b = document.createElement('b'); b.textContent = `${name}: `;
  p.append(b, document.createTextNode(message));
  $('chat-lines').append(p);
  while ($('chat-lines').children.length > 6) $('chat-lines').firstChild.remove();
  setTimeout(() => p.classList.add('old'), 9000);
  game.bubbles.set(id, { text: message, until: performance.now() + 5000 });
}

function setupMobile() {
  const stick = $('stick'), knob = stick.querySelector('i');
  let active = false;
  const move = event => {
    if (!active) return;
    const rect = stick.getBoundingClientRect(), dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy) || 1, mag = Math.min(1, d / (rect.width * .35));
    game.touch.mx = dx / d * mag; game.touch.my = dy / d * mag;
    knob.style.transform = `translate(${dx / d * mag * 30}px,${dy / d * mag * 30}px)`;
  };
  stick.addEventListener('pointerdown', e => { active = true; stick.setPointerCapture(e.pointerId); move(e); });
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', () => { active = false; game.touch.mx = game.touch.my = 0; knob.style.transform = ''; });
  $('mobile-action').onpointerdown = () => { game.touch.attack = true; };
  $('mobile-action').onpointerup = $('mobile-action').onpointerleave = () => { game.touch.attack = false; };
  $('mobile-tame').onclick = () => cmd({ t: 'tame' });
}
setupMobile();

function togglePause() {
  if (!game.running) return;
  game.paused = !game.paused;
  $('pause').classList.toggle('hidden', !game.paused);
  game.keys.clear(); game.pointer.down = false;
}
$('menu-button').onclick = togglePause; $('resume').onclick = togglePause;
$('quit').onclick = () => leaveGame(); $('death-quit').onclick = () => leaveGame();
$('tame-prompt').onclick = () => cmd({ t: 'tame' });

// ---------------- overlays: map & hat shop ----------------

function closeOverlay() {
  $('world-map').classList.add('hidden'); $('field-shop').classList.add('hidden'); game.overlay = null;
}
function openMap() { if (!game.cur) return; closeOverlay(); game.overlay = 'map'; $('world-map').classList.remove('hidden'); drawMap($('map-canvas'), true); }
$('map-button').onclick = openMap; $('close-map').onclick = closeOverlay;
function openShop() { if (!game.cur) return; closeOverlay(); game.overlay = 'shop'; $('field-shop').classList.remove('hidden'); renderShop(); }
$('shop-button').onclick = openShop; $('close-shop').onclick = closeOverlay;

function renderShop() {
  const me = myData(), self = game.cur?.players.get(game.id);
  if (!me || !self) return;
  const grid = $('shop-items'); grid.replaceChildren();
  for (const hat of HATS) {
    const card = document.createElement('div'); card.className = `shop-item${self.hat === hat.id ? ' on' : ''}`;
    const art = document.createElement('canvas'); art.width = art.height = 96;
    const c = art.getContext('2d'); c.translate(48, 50); c.scale(.95, .95);
    R.drawPlayer(c, { x: 0, y: 0, angle: -Math.PI / 2, skin: self.skin, hat: hat.id, held: 'hand', r: 35 }, 0);
    const owned = me.hats.includes(hat.id);
    const info = document.createElement('div');
    info.innerHTML = `<h3>${escapeHtml(hat.name)}</h3><p>${escapeHtml(hat.note || 'Plain and simple')}</p>`;
    const button = document.createElement('button');
    button.className = owned ? 'secondary' : 'primary';
    button.textContent = self.hat === hat.id ? 'Wearing' : owned ? 'Wear' : `${hat.cost} gold`;
    button.disabled = self.hat === hat.id || (!owned && me.res.gold < hat.cost);
    button.onclick = () => { cmd({ t: 'hat', id: hat.id }); setTimeout(renderShop, 150); };
    card.append(art, info, button); grid.append(card);
  }
}

function drawMap(cv, full) {
  const m = cv.getContext('2d'), size = cv.width, k = size / WORLD.w;
  const view = game.view, season = seasonAt(view?.t ?? 0).season;
  m.fillStyle = season.ground; m.fillRect(0, 0, size, size);
  m.fillStyle = 'rgba(20,14,6,.35)'; m.fillRect(0, 0, size, size);
  if (full && game.grid) {
    for (const n of game.grid.list) {
      m.fillStyle = n.type === 'tree' ? season.tree[0] : n.type === 'rock' ? season.rock[0] : n.type === 'bush' ? season.bush[0] : n.type.includes('gold') ? '#f2c230' : '#a8743f';
      m.globalAlpha = .7; m.beginPath(); m.arc(n.x * k, n.y * k, Math.max(1.5, n.r * k), 0, TAU); m.fill();
    }
    m.globalAlpha = 1;
  }
  m.fillStyle = '#f2c230'; m.strokeStyle = '#2b241d'; m.lineWidth = 2;
  m.beginPath(); m.arc(CENTER.x * k, CENTER.y * k, full ? 7 : 4, 0, TAU); m.fill(); m.stroke();
  for (const s of game.cur?.structures || []) if (s.owner === game.id) { m.fillStyle = '#f4ead2'; m.fillRect(s.x * k - 1.5, s.y * k - 1.5, 3, 3); }
  for (const [x, y, , id] of game.cur?.boss || []) {
    m.fillStyle = '#e2413b'; m.beginPath(); m.arc(x * k, y * k, full ? 9 : 5, 0, TAU); m.fill(); m.stroke();
    if (full) { m.font = '700 13px "Baloo 2", sans-serif'; m.textAlign = 'center'; m.fillStyle = '#fff'; m.strokeText(BOSS_BY_ID.get(id)?.name || '', x * k, y * k - 14); m.fillText(BOSS_BY_ID.get(id)?.name || '', x * k, y * k - 14); }
  }
  if (full) for (const [id, name, , , , x, y] of game.lb) {
    if (id === game.id) continue;
    m.fillStyle = '#ff8a7a'; m.beginPath(); m.arc(x * k, y * k, 4, 0, TAU); m.fill();
    m.font = '700 11px "Baloo 2", sans-serif'; m.textAlign = 'center'; m.fillStyle = '#fff'; m.fillText(name, x * k, y * k - 8);
  }
  for (const a of view?.animals || []) if (a.owner === game.id) { m.fillStyle = '#7fe05a'; m.beginPath(); m.arc(a.x * k, a.y * k, 3, 0, TAU); m.fill(); }
  const me = view?.me;
  if (me) {
    m.save(); m.translate(me.x * k, me.y * k); m.rotate(me.angle);
    m.beginPath(); m.moveTo(8, 0); m.lineTo(-5, -5); m.lineTo(-3, 0); m.lineTo(-5, 5); m.closePath();
    m.fillStyle = '#fff'; m.fill(); m.lineWidth = 2; m.stroke(); m.restore();
  }
}

// ---------------- HUD ----------------

const iconUrls = new Map();
function iconUrl(id) {
  if (!iconUrls.has(id)) iconUrls.set(id, R.itemIcon(id, 96).toDataURL());
  return iconUrls.get(id);
}
const resIconUrls = {};
function resIcon(res) {
  if (resIconUrls[res]) return resIconUrls[res];
  if (res === 'food') return (resIconUrls[res] = iconUrl('apple'));
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'); c.translate(32, 32);
  const type = { wood: 'log', stone: 'rock', gold: 'gold' }[res];
  c.scale(.62, .62);
  R.drawResource(c, { id: `icon-${res}`, type, x: 0, y: 0, r: type === 'log' ? 26 : 34 }, SEASONS[0], 0);
  return (resIconUrls[res] = cv.toDataURL());
}
const costText = cost => Object.entries(cost || {}).map(([k, v]) => `${v}${k[0]}`).join(' ');
const affordable = (res, cost) => Object.entries(cost || {}).every(([k, v]) => res[k] >= v);

function changed(key, value) {
  if (game.sig[key] === value) return false;
  game.sig[key] = value; return true;
}

function updateHud(now) {
  const view = game.view, me = view.me, data = myData();
  if (!data || !me) return;
  // hotbar
  const sel = selIndex();
  const mineCount = kind => game.cur.structures.filter(s => s.owner === game.id && ITEM_BY_ID.get(s.item)?.kind === kind).length;
  if (changed('hotbar', data.items.join())) {
    const bar = $('hotbar'); bar.replaceChildren();
    data.items.forEach((id, i) => {
      const it = ITEM_BY_ID.get(id);
      const slot = document.createElement('button');
      slot.className = 'slot';
      slot.title = `${it.name}${it.cost ? ` · ${costText(it.cost)}` : ''}`;
      slot.innerHTML = `<img src="${iconUrl(id)}" alt=""><kbd>${i + 1}</kbd>${it.kind || it.slot === 'food' ? `<small>${costText(it.cost)}</small>` : ''}`;
      slot.onclick = () => selectSlot(i);
      bar.append(slot);
    });
  }
  [...$('hotbar').children].forEach((slot, i) => {
    const it = ITEM_BY_ID.get(data.items[i]);
    slot.classList.toggle('selected', i === sel);
    slot.classList.toggle('poor', !affordable(data.res, it.cost || it.ammo));
  });
  // age bar
  const need = xpForAge(me.age);
  $('xp-fill').style.width = `${clamp(data.xp / need, 0, 1) * 100}%`;
  if (changed('age', me.age)) $('age-text').textContent = `Age ${me.age}`;
  // resources
  const rsig = `${data.res.food}|${data.res.wood}|${data.res.stone}|${data.res.gold}`;
  if (changed('res', rsig)) {
    const box = $('resources');
    if (!box.children.length) box.innerHTML = ['food', 'wood', 'stone', 'gold'].map(r => `<div class="res" data-res="${r}"><b></b><img src="${resIcon(r)}" alt="${r}"></div>`).join('');
    for (const r of ['food', 'wood', 'stone', 'gold']) box.querySelector(`[data-res="${r}"] b`).textContent = Math.floor(data.res[r]).toLocaleString();
  }
  // age-up choice
  const offer = data.choices.length ? ageChoices(data.choices[0], data.items) : [];
  if (changed('offer', `${data.choices[0]}|${offer.join()}|${game.dead}`)) {
    const box = $('age-options'); box.replaceChildren();
    $('age-choice').classList.toggle('hidden', !offer.length || game.dead);
    $('age-choice-title').textContent = `Age ${data.choices[0]}: pick one`;
    for (const id of offer) {
      const it = ITEM_BY_ID.get(id);
      const b = document.createElement('button'); b.className = 'choice';
      b.innerHTML = `<img src="${iconUrl(id)}" alt=""><b>${escapeHtml(it.name)}</b><small>${escapeHtml(describe(it))}</small>`;
      b.onclick = () => { cmd({ t: 'choose', id }); game.selId = game.selId && ITEM_BY_ID.get(game.selId).slot === it.slot ? id : game.selId; };
      box.append(b);
    }
  }
  // pets
  renderPets(view, data);
  // tame prompt
  const target = nearestSleeper(view, me);
  const tp = $('tame-prompt');
  if (target && !me.dead) {
    const def = PET_BY_ID.get(target.species);
    const chance = S.tameChance(me, target);
    if (changed('tame', `${target.id}|${Math.round(chance)}|${data.pets.length}`)) {
      tp.innerHTML = data.pets.length >= 3 ? `Pet slots full` : `<svg viewBox="0 0 24 24"><path d="M12 13c3 0 6 3 6 5.5S16 21 12 21s-6-.5-6-2.5S9 13 12 13zM5 8a2 2.5 0 1 1 0 .1zM19 8a2 2.5 0 1 1 0 .1zM9 4a2 2.5 0 1 1 0 .1zM15 4a2 2.5 0 1 1 0 .1z"/></svg> Tame ${escapeHtml(def.name)} <b>${Math.round(chance)}%</b> <kbd>Space</kbd>`;
    }
    tp.classList.remove('hidden');
  } else tp.classList.add('hidden');
  // flags
  if (changed('flags', `${game.auto}|${game.lock}|${data.fx.join()}`)) {
    const tags = [];
    if (game.auto) tags.push('Auto attack');
    if (game.lock) tags.push('Aim locked');
    const [poison, burn, slow, armor, haste] = data.fx;
    if (poison) tags.push('Poisoned'); if (burn) tags.push('Burning'); if (slow) tags.push('Slowed'); if (armor) tags.push('Armored'); if (haste) tags.push('Hasted');
    $('flags').innerHTML = tags.map(t => `<span>${t}</span>`).join('');
  }
  // season chip
  const s = seasonAt(view.t);
  const left = Math.max(0, Math.ceil(s.remaining));
  if (changed('season', `${s.season.id}|${left}`)) {
    $('season-chip').innerHTML = `<i style="--c:${s.season.ground}"></i>${s.season.name}<small>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</small>`;
  }
  // boss bar
  const boss = (game.cur.boss || []).map(([x, y, frac, id]) => ({ x, y, frac, id })).find(b => Math.hypot(b.x - me.x, b.y - me.y) < 1300);
  $('boss-bar').classList.toggle('hidden', !boss);
  if (boss) { $('boss-bar').querySelector('b').textContent = BOSS_BY_ID.get(boss.id)?.name || 'Boss'; $('boss-bar').querySelector('i').style.width = `${boss.frac * 100}%`; }
  // leaderboard
  if (changed('lb', JSON.stringify(game.lb.map(r => r.slice(0, 4))))) {
    $('leaderboard').innerHTML = `<h3>Leaderboard</h3>${game.lb.map(([id, name, gold], i) => `<p class="${id === game.id ? 'me' : ''}"><span>${i + 1}.</span><b>${escapeHtml(name)}</b><em>${gold.toLocaleString()}</em></p>`).join('')}`;
  }
  if (game.dead && !me.dead) { game.dead = false; $('death').classList.add('hidden'); }
  if (!game.dead && me.dead) $('death').classList.remove('hidden');
  if (now - (game.minimapAt || 0) > 150) { game.minimapAt = now; drawMap($('minimap'), false); renderFeed(); }
  if (game.overlay === 'shop' && changed('shop', `${data.res.gold}|${me.hat}|${data.hats.join()}`)) renderShop();
}

function describe(it) {
  if (it.kind === 'windmill') return `+${it.gold} gold every ${it.every}s`;
  if (it.kind === 'spike') return `${it.touch * 10} damage per second on touch`;
  if (it.kind === 'wall' || it.kind === 'door') return `${it.hp} health${it.kind === 'door' ? ', only you pass' : ''}`;
  if (it.kind === 'turret' || it.kind === 'tower') return `Shoots for ${it.dmg} every ${it.every}s`;
  if (it.kind === 'heal') return `Heals ${it.heal} while you stand on it`;
  if (it.kind === 'boost') return 'Launches you forward';
  if (it.kind === 'trap') return 'Holds an enemy in place';
  if (it.slot === 'food') return `Heals ${it.heal}${it.hot ? ` +${it.hot} over time` : ''}${it.armor ? `, ${it.armor * 100}% armor` : ''}${it.haste ? `, ${it.haste * 100}% speed` : ''}`;
  if (it.tameTool) return `Shoot sleeping babies to raise tame odds${it.healPet ? '; heals pets' : ''}`;
  if (it.block) return `Blocks ${Math.round(it.block * 100)}% from the front`;
  if (it.repair) return `Repairs your buildings by ${it.repair}`;
  if (it.ammo) return `${it.dmg} damage at range, uses ${costText(it.ammo)}`;
  return `${it.dmg} damage · ${it.reload}s · harvest ${Math.max(...Object.values(it.harvest || { x: 1 }))}`;
}

function nearestSleeper(view, me) {
  let best = null, bd = Infinity;
  for (const a of view.animals) {
    if (!a.sleep || a.owner || a.boss) continue;
    const d = Math.hypot(a.x - me.x, a.y - me.y);
    if (d < me.r + 110 && d < bd) { bd = d; best = a; }
  }
  return best;
}

const MODES = [['defend', 'Defend'], ['attack', 'Attack'], ['stop', 'Stay'], ['move', 'Move'], ['skill', 'Skill']];
function renderPets(view, data) {
  const pets = data.pets.map(id => view.animals.find(a => a.id === id)).filter(Boolean);
  const box = $('pet-panel');
  const key = pets.map(p => `${p.id}:${p.stage}`).join();
  if (changed('pets', key)) {
    box.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const p = pets[i];
      const card = document.createElement('div'); card.className = `pet${p ? '' : ' empty'}`;
      if (p) {
        const def = PET_BY_ID.get(p.species);
        card.innerHTML = `<img src="${R.petPortrait(p.species, 96).toDataURL()}" alt=""><div><b>${escapeHtml(def.name)}</b><small>${PET_STAGE[p.stage]} · ${def.types.join('/')}</small><span class="hp"><i></i></span><span class="xp"><i></i></span></div><em class="cd" title="${SKILLS[def.skill].name}"></em>`;
        card.onclick = () => cmd({ t: 'skill', slot: i });
      } else card.innerHTML = '<small>Empty slot</small>';
      box.append(card);
    }
    const ctl = $('pet-controls'); ctl.replaceChildren();
    if (pets.length) for (const [mode, label] of MODES) {
      const b = document.createElement('button'); b.dataset.mode = mode; b.textContent = label;
      b.title = { defend: 'Follow and protect you (X)', attack: 'Hunt anything nearby (X)', stop: 'Hold position', move: 'Right click the ground', skill: 'Use all skills (F)' }[mode];
      b.onclick = () => mode === 'skill' ? cmd({ t: 'skill' }) : mode === 'move' ? toast('Right click the ground to send your pets') : setPetMode(mode);
      ctl.append(b);
    }
  }
  const cards = box.children;
  pets.forEach((p, i) => {
    const card = cards[i]; if (!card) return;
    card.querySelector('.hp i').style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
    card.querySelector('.xp i').style.width = p.stage >= 2 ? '100%' : `${clamp(p.xp / PET_XP[p.stage], 0, 1) * 100}%`;
    const cdLeft = S.skillCooldown(p) - (view.t - p.skillAt);
    const cd = card.querySelector('.cd');
    cd.textContent = cdLeft > 0 ? Math.ceil(cdLeft) : 'F';
    cd.classList.toggle('ready', cdLeft <= 0);
  });
  const mode = pets[0]?.mode || game.petMode;
  for (const b of $('pet-controls').children) b.classList.toggle('on', b.dataset.mode === mode);
}

// ---------------- drawing ----------------

const SOLID_KINDS = new Set(['wall', 'door', 'spike', 'windmill', 'turret', 'tower']);

function drawWorld(now, dt) {
  const view = game.view = buildView();
  const { t, me } = view;
  const W = innerWidth, H = innerHeight, dpr = canvas.width / W;
  let zoom = Math.max(W / 1900, H / 1070);
  if (W / zoom < 1000) zoom = W / 1000;
  game.zoom = zoom;
  if (me) { game.camera.x = lerp(game.camera.x, me.x, Math.min(1, dt * 14)); game.camera.y = lerp(game.camera.y, me.y, Math.min(1, dt * 14)); }
  const cam = game.camera, viewW = W / zoom, viewH = H / zoom;
  game.shake = Math.max(0, game.shake - dt);
  const sx = game.shake ? (Math.random() - .5) * game.shake * 30 : 0, sy = game.shake ? (Math.random() - .5) * game.shake * 30 : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);

  const sa = seasonAt(t);
  const first = sa.cycle === 0 && sa.index === 0;
  const blend = first ? 1 : clamp(sa.elapsed / TRANSITION, 0, 1);
  const prevSeason = SEASONS[(sa.index + SEASONS.length - 1) % SEASONS.length];
  R.drawGround(ctx, cam, viewW + 40, viewH + 40, t, sa.season, prevSeason, blend);

  const inView = (e, pad = 160) => Math.abs(e.x - cam.x) < viewW / 2 + pad && Math.abs(e.y - cam.y) < viewH / 2 + pad;
  const nowS = clientNow();
  let drawn = 0;
  // flat buildings first, then hazards and ground-level resources
  for (const s of view.structures) {
    if (SOLID_KINDS.has(ITEM_BY_ID.get(s.item)?.kind) || !inView(s)) continue;
    const hidden = ITEM_BY_ID.get(s.item)?.kind === 'trap' && s.owner !== game.id;
    R.drawStructure(ctx, s, t, { alpha: hidden ? .3 : 1 }); drawn++;
  }
  for (const h of view.hazards) R.drawHazard(ctx, h, t);
  const nodes = game.grid ? game.grid.list.filter(n => inView(n, n.r + 60)) : [];
  const drawNode = n => { const hit = game.nodeHits.get(n.id); R.drawResource(ctx, hit ? { ...n, hitDir: hit.dir } : n, sa.season, t, hit ? nowS - hit.at : 9); drawn++; };
  for (const n of nodes) if (n.type !== 'tree') drawNode(n);
  for (const s of view.structures) {
    if (!SOLID_KINDS.has(ITEM_BY_ID.get(s.item)?.kind) || !inView(s)) continue;
    R.drawStructure(ctx, s, t, { mine: s.owner === game.id }); drawn++;
  }
  if (game.marker && nowS - game.marker.at < .8) {
    const k = (nowS - game.marker.at) / .8;
    ctx.save(); ctx.globalAlpha = 1 - k; R.circle(ctx, game.marker.x, game.marker.y, 20 + k * 20); ctx.lineWidth = 4; ctx.strokeStyle = '#7fe05a'; ctx.stroke(); ctx.restore();
  }
  for (const a of view.animals) { if (!inView(a, a.r + 100)) continue; R.drawAnimal(ctx, a, t, { flash: t - a.hitAt < .12 }); drawn++; }
  for (const p of view.players) {
    if (p.dead || !inView(p)) continue;
    R.drawPlayer(ctx, p, t, { flash: t - p.hitAt < .12, shield: t < p.shieldUntil }); drawn++;
  }
  for (const j of view.projectiles) R.drawProjectile(ctx, j, t);
  for (const n of nodes) if (n.type === 'tree') drawNode(n);
  drawPlacement(view, t);
  drawLabels(view, t);
  game.particles = game.particles.filter(p => nowS - p.at < p.life);
  for (const p of game.particles) R.drawParticle(ctx, p, nowS);
  game.floaters = game.floaters.filter(f => nowS - f.at < f.life);
  for (const f of game.floaters) R.drawFloater(ctx, f, nowS);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = (sa.season.dark ? blend : 0) + (prevSeason.dark && !first ? 1 - blend : 0);
  if (dark > 0 && me) {
    const px = W / 2 + (me.x - cam.x) * zoom, py = H / 2 + (me.y - cam.y) * zoom;
    const g = ctx.createRadialGradient(px, py, 260 * zoom, px, py, 760 * zoom);
    g.addColorStop(0, 'rgba(8,6,24,0)'); g.addColorStop(1, `rgba(8,6,24,${.93 * dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (sa.season.meteors && blend < 1) { ctx.fillStyle = `rgba(255,90,30,${(1 - blend) * .15})`; ctx.fillRect(0, 0, W, H); }
  writeTestHooks(view, drawn);
}

function drawPlacement(view, t) {
  const me = view.me, data = view.meData;
  if (!me || me.dead || !data) return;
  const it = ITEM_BY_ID.get(data.items[selIndex()]);
  if (!it?.kind) return;
  const d = me.r + it.r + 4, x = me.x + Math.cos(me.angle) * d, y = me.y + Math.sin(me.angle) * d;
  const mirror = { grid: game.grid, structures: view.structures, players: Object.fromEntries(view.players.map(p => [p.id, p])), animals: view.animals };
  const ok = game.grid && S.placeable(mirror, x, y, it) && affordable(data.res, it.cost);
  R.drawStructure(ctx, { item: it.id, x, y, r: it.r, rot: it.kind === 'boost' ? me.angle : 0 }, t, { alpha: .45 });
  if (!ok) { ctx.save(); R.circle(ctx, x, y, it.r); ctx.fillStyle = 'rgba(226,65,59,.3)'; ctx.fill(); ctx.restore(); }
}

function drawLabels(view, t) {
  const me = view.me;
  for (const p of view.players) {
    if (p.dead) continue;
    const self = p.id === game.id;
    R.drawNameplate(ctx, p.x, p.y - p.r - 18, p.name, null, null, String(p.age), self ? '#3f8f2f' : '#7b4fc9');
    R.drawNameplate(ctx, p.x, p.y + p.r + 16, '', p.hp / p.maxHp, self ? '#7fd14a' : '#e2413b');
    const bubble = game.bubbles.get(p.id);
    if (bubble && bubble.until > performance.now()) drawBubble(p.x, p.y - p.r - 58, bubble.text);
  }
  for (const a of view.animals) {
    const def = PET_BY_ID.get(a.species);
    if (a.boss) {
      const boss = BOSS_BY_ID.get(a.boss);
      R.drawNameplate(ctx, a.x, a.y - a.r - 26, boss.name, a.hp / a.maxHp, '#e2413b');
      continue;
    }
    const mine = a.owner === game.id;
    if (a.owner) R.drawNameplate(ctx, a.x, a.y + a.r + 12, '', a.hp / a.maxHp, mine ? '#7fd14a' : '#e2413b');
    else if (a.hp < a.maxHp) R.drawNameplate(ctx, a.x, a.y + a.r + 12, '', a.hp / a.maxHp, '#f2a33a');
    if (a.sleep && me && Math.hypot(a.x - me.x, a.y - me.y) < 700) {
      const chance = S.tameChance(me, a);
      R.drawNameplate(ctx, a.x, a.y - a.r - 6, `${def.name} · ${Math.round(chance)}%`, null, null);
    } else if (mine) {
      R.drawNameplate(ctx, a.x, a.y - a.r - 6, def.name, null, null);
    }
  }
}

function drawBubble(x, y, text) {
  ctx.save();
  ctx.font = '700 16px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(320, ctx.measureText(text).width + 22);
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = R.OUTLINE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 16, w, 30, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = R.OUTLINE; ctx.fillText(text, x, y, w - 14);
  ctx.restore();
}

function writeTestHooks(view, drawn) {
  const ds = canvas.dataset, me = view.me;
  ds.entities = drawn;
  ds.structures = view.structures.length;
  ds.action = game.lastAction;
  ds.hits = game.hits;
  ds.pets = view.meData?.pets.length ?? 0;
  if (!me && performance.now() - game.startedAt > 3000) ds.renderError = 'missing player'; else delete ds.renderError;
  if (!me) return;
  ds.testPlayer = JSON.stringify({ x: Math.round(me.x), y: Math.round(me.y), hp: me.hp, age: me.age });
  ds.playerX = Math.round(me.x);
  const mine = view.structures.filter(s => s.owner === game.id).at(-1);
  if (mine) { ds.testStructure = JSON.stringify({ x: mine.x, y: mine.y, item: mine.item }); ds.structureX = mine.x; }
  let best = null, bd = Infinity;
  for (const a of view.animals) {
    if (a.owner || a.boss) continue;
    const d = Math.hypot(a.x - me.x, a.y - me.y) - a.r - me.r;
    if (d < bd) { bd = d; best = a; }
  }
  if (best) {
    ds.testAnimal = JSON.stringify({
      id: best.id, sleep: best.sleep, hp: best.hp, distance: Math.round(bd), dx: Math.round(best.x - me.x), dy: Math.round(best.y - me.y),
      x: Math.round(innerWidth / 2 + (best.x - game.camera.x) * game.zoom), y: Math.round(innerHeight / 2 + (best.y - game.camera.y) * game.zoom),
    });
  }
  const sleeper = view.animals.filter(a => a.sleep && !a.owner).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  if (sleeper) ds.testSleeper = JSON.stringify({ id: sleeper.id, dx: Math.round(sleeper.x - me.x), dy: Math.round(sleeper.y - me.y), distance: Math.round(Math.hypot(sleeper.x - me.x, sleeper.y - me.y)) });
}

// The landing screen shows a slow pan over a forest.
let backdrop = null;
function drawBackdrop(now) {
  const W = innerWidth, H = innerHeight, dpr = canvas.width / W;
  backdrop ??= S.generateResources(20261029, 0).list;
  const zoom = Math.max(W / 1900, H / 1070) * .9;
  const cam = { x: 2200 + Math.sin(now * .03) * 500 + now * 8 % 1800, y: 2600 + Math.cos(now * .025) * 300 };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
  const vw = W / zoom, vh = H / zoom;
  R.drawGround(ctx, cam, vw + 40, vh + 40, now, SEASONS[0]);
  const vis = backdrop.filter(n => Math.abs(n.x - cam.x) < vw / 2 + 150 && Math.abs(n.y - cam.y) < vh / 2 + 150);
  for (const n of vis) if (n.type !== 'tree') R.drawResource(ctx, n, SEASONS[0], now);
  for (const n of vis) if (n.type === 'tree') R.drawResource(ctx, n, SEASONS[0], now);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(30,24,14,.28)'; ctx.fillRect(0, 0, W, H);
}

// ---------------- main loop ----------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  try {
    if (game.running && game.cur) {
      updateInput();
      if (game.mode === 'local') { if (!game.paused) stepLocal(dt); }
      else {
        game.alpha = clamp((now - game.snapAt) / game.snapGap, 0, 1);
        if (now - game.lastSendAt >= 50) { game.lastSendAt = now; send({ t: 'input', ...game.input }); }
      }
      drawWorld(now, dt);
      updateHud(now);
    } else drawBackdrop(now / 1000);
  } catch (error) {
    canvas.dataset.renderError = error.message;
    console.error(error);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
