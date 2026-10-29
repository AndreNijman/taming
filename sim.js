// Authoritative game simulation shared by solo play (in the browser) and the
// multiplayer Durable Object. Pure data in, pure data out: no DOM, no sockets.
import {
  WORLD, CENTER, BIOMES, BIOME_GRID, BIOME_CELL, biomeAt, biomeCells, RESOURCE_TYPES, NODES_PER_CELL, ITEM_BY_ID, STARTING_ITEMS, START_RESOURCES, TAME_FOOD,
  SLOT_ORDER, BUILD_LIMIT, PETS, PET_BY_ID, PET_XP, MAX_PETS, BOSSES, BOSS_BY_ID, HAT_BY_ID, SKILLS,
  xpForAge, MAX_AGE, LAST_CHOICE_AGE, ageChoices, typeMultiplier,
} from './data.js';

export const PLAYER_R = 35;
export const BASE_SPEED = 340;
export const TICK = 1 / 20;
const TAU = Math.PI * 2;
const SPAWN_SHIELD = 5;
export const VIEW = { w: 1400, h: 900 }; // half extents of what a client can see

export const BOT_NAMES = ['Fern', 'Kestrel', 'Mochi', 'Bramble', 'Juniper', 'Pip', 'Rowan', 'Clover', 'Wren', 'Taro', 'Mallow', 'Ash', 'Basil', 'Nori'];

export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const dist = (a, b) => Math.sqrt(dist2(a, b));
export function angleDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const item = id => ITEM_BY_ID.get(id);
const kindOf = s => item(s.item)?.kind;

// ---------------- resources (deterministic per world seed) ----------------

// The resource layout depends only on the world seed, so clients rebuild it
// locally and the server never streams it. Each biome square gets its own
// mix; rocks often come as a big and a small one side by side.
export function generateResources(seed) {
  const random = rng((seed ^ 0x9E3779B1) | 0);
  const list = [{ id: 'gold-heart', type: 'big-gold', x: CENTER.x, y: CENTER.y, r: 110, biome: 'forest' }];
  const cell = 300, grid = new Map();
  const add = n => { const k = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); };
  add(list[0]);
  const fits = (x, y, r, gap = 90) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cy + j}`) || []) {
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + gap) ** 2) return false;
    }
    return true;
  };
  const pick = mix => { let roll = random(); for (const [t, share] of mix) { if (roll < share) return t; roll -= share; } return mix[0][0]; };
  BIOME_GRID.forEach((row, j) => row.forEach((id, i) => {
    const biome = BIOMES.find(b => b.id === id), x0 = i * BIOME_CELL, y0 = j * BIOME_CELL;
    let placed = 0;
    for (let attempt = 0; attempt < 4000 && placed < NODES_PER_CELL; attempt++) {
      // keep a margin inside the map edge, but let nodes sit right up to a biome border
      const x = Math.max(150, Math.min(WORLD.w - 150, x0 + random() * BIOME_CELL));
      const y = Math.max(150, Math.min(WORLD.h - 150, y0 + random() * BIOME_CELL));
      const type = pick(biome.mix);
      const [r0, r1] = RESOURCE_TYPES[type].r, r = Math.round(r0 + random() * (r1 - r0));
      if (!fits(x, y, r)) continue;
      // floor, not round: a node drawn at 6399.6 must not land on the next biome's first row
      const n = { id: `r${list.length}`, type, x: Math.floor(x), y: Math.floor(y), r, biome: id };
      list.push(n); add(n); placed++;
      if (type === 'rock' && random() < .45) {
        const a = random() * Math.PI * 2, r2 = Math.round(r * (.55 + random() * .15)), d = r + r2 + 8;
        const x2 = Math.round(x + Math.cos(a) * d), y2 = Math.round(y + Math.sin(a) * d);
        if (fits(x2, y2, r2, 0) && biomeAt(x2, y2).id === id) { const m = { id: `r${list.length}`, type, x: x2, y: y2, r: r2, biome: id }; list.push(m); add(m); }
      }
    }
  }));
  return { list, grid, cell };
}

// ---------------- world creation ----------------

/** How many wild animals of one species a biome keeps. */
const POPULATION = { common: 7, rare: 4, epic: 2, legendary: 1 };
const BOSS_RESPAWN = 240;

export function createWorld(seed = Date.now(), opts = {}) {
  const world = {
    seed: seed | 0, time: opts.startTime ?? 0, tick: 0, w: WORLD.w, h: WORLD.h,
    players: {}, animals: [], structures: [], projectiles: [], resources: [], hazards: [],
    events: [], nextId: 1, random: rng(seed | 0), meteorAt: 0, bossAt: {},
  };
  const res = generateResources(world.seed);
  world.resources = res.list;
  Object.defineProperty(world, 'grid', { value: res, enumerable: false, configurable: true });
  for (const def of PETS) {
    const n = POPULATION[def.rarity];
    for (let i = 0; i < n; i++) spawnAnimal(world, def, i % 3 === 2 ? 1 : 0);
  }
  for (const b of BIOMES) spawnBoss(world, BOSS_BY_ID.get(b.boss));
  return world;
}

/** A clear spot of radius `r` (in `biome` if given), at least `keepAway` from the map centre and from every boss. */
function freeSpot(world, r = 40, keepAway = 0, biome = null) {
  const random = world.random, cells = biome ? biomeCells(biome) : [{ x: 0, y: 0, w: world.w, h: world.h }];
  for (let i = 0; i < 300; i++) {
    const c = cells[Math.floor(random() * cells.length)], pad = r + 60;
    const x = Math.max(200, Math.min(world.w - 200, c.x + pad + random() * (c.w - 2 * pad)));
    const y = Math.max(200, Math.min(world.h - 200, c.y + pad + random() * (c.h - 2 * pad)));
    if (keepAway && (Math.hypot(x - CENTER.x, y - CENTER.y) < keepAway || world.animals.some(a => a.boss && Math.hypot(x - a.x, y - a.y) < keepAway + a.r))) continue;
    if (solidAt(world, x, y, r)) continue;
    return { x, y };
  }
  return { x: CENTER.x + 400, y: CENTER.y + 400 };
}

function petStats(def, stage) {
  return { hp: def.hp[stage], bite: def.bite[stage], speed: def.speed[stage] };
}
function animalRadius(stage) { return [30, 40, 52][stage]; }

function spawnAnimal(world, def, stage, at) {
  const spot = at || freeSpot(world, 60, 0, def.biome);
  const st = petStats(def, stage);
  const a = {
    id: `a${world.nextId++}`, species: def.id, x: spot.x, y: spot.y, vx: 0, vy: 0, angle: world.random() * TAU,
    r: animalRadius(stage), hp: st.hp, maxHp: st.hp, stage, sleep: false, owner: null,
    home: { x: spot.x, y: spot.y }, state: 'wander', target: null, wanderAt: 0,
    attackAt: -9, cd: 0, xp: 0, moving: false, hitAt: -9, skillAt: -99, lastHurtAt: -99,
    // babies doze off after a while awake and must stay asleep at least 25s
    sleepAt: stage === 0 ? world.time + 5 + world.random() * 25 : Infinity, wakeAt: 0, bonus: 0, mode: 'defend',
  };
  if (stage === 0 && world.random() < .5) { a.sleep = true; a.wakeAt = world.time + 25 + world.random() * 20; }
  world.animals.push(a);
  return a;
}

// Bosses sleep in the middle of their biome until someone hits them.
function spawnBoss(world, def) {
  if (!def) return;
  const spot = freeSpot(world, 220, 900, def.biome);
  world.animals.push({
    id: `boss-${def.id}-${world.nextId++}`, boss: def.id, species: def.minions, name: def.name, x: spot.x, y: spot.y, vx: 0, vy: 0, angle: 0,
    r: 120, hp: def.hp, maxHp: def.hp, stage: 2, sleep: true, owner: null, home: { ...spot }, state: 'guard', target: null,
    attackAt: -9, cd: 0, moving: false, hitAt: -9, waves: 0, dmgBy: {}, lastHurtAt: -99, volleyAt: 0,
  });
}

// ---------------- players ----------------

export function addPlayer(world, { id, name, bot = false, skin = 0 }) {
  const p = {
    id, name: String(name || 'Tamer').slice(0, 16), bot, skin, hat: 'none', hats: ['none'],
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, r: PLAYER_R, hp: 100, maxHp: 100, dead: false, deadAt: 0,
    age: 0, xp: 0, kills: 0, tames: 0, res: { ...START_RESOURCES }, items: [...STARTING_ITEMS], sel: 0, held: STARTING_ITEMS[0],
    cd: 0, actionAt: -9, hitAt: -9, lastHurtAt: -99, pets: [], choices: [], trappedUntil: 0, slowUntil: 0,
    poison: 0, burn: 0, hot: 0, armorUntil: 0, armor: 0, hasteUntil: 0, haste: 0, shieldUntil: 0, lastHitBy: null,
    input: { mx: 0, my: 0, angle: 0, attack: false, sel: 0 }, best: 0,
  };
  world.players[id] = p;
  spawnPlayer(world, p);
  return p;
}

function spawnPlayer(world, p) {
  const spot = freeSpot(world, 60, 900, 'forest');
  Object.assign(p, {
    x: spot.x, y: spot.y, vx: 0, vy: 0, dead: false, hp: 100, maxHp: 100, age: 0, xp: 0, kills: 0, tames: 0,
    res: { ...START_RESOURCES }, items: [...STARTING_ITEMS], sel: 0, held: STARTING_ITEMS[0], choices: [], cd: 0,
    trappedUntil: 0, slowUntil: 0, poison: 0, burn: 0, hot: 0, armorUntil: 0, hasteUntil: 0,
    shieldUntil: world.time + SPAWN_SHIELD, lastHitBy: null,
  });
  // pets come back with their tamer
  for (const id of p.pets) {
    const a = world.animals.find(x => x.id === id);
    if (a) { a.x = p.x - 60; a.y = p.y + 40; a.hp = a.maxHp; a.target = null; a.dead = false; }
  }
  p.pets = p.pets.filter(id => world.animals.some(a => a.id === id));
}

export function removePlayer(world, id) {
  const p = world.players[id];
  if (!p) return;
  world.animals = world.animals.filter(a => a.owner !== id);
  world.structures = world.structures.filter(s => s.owner !== id);
  delete world.players[id];
}

// ---------------- commands ----------------

export function setInput(world, id, input) {
  const p = world.players[id];
  if (!p) return;
  p.input = {
    mx: clamp(+input.mx || 0, -1, 1), my: clamp(+input.my || 0, -1, 1),
    angle: Number.isFinite(+input.angle) ? +input.angle : p.angle,
    attack: !!input.attack, sel: clamp(Math.floor(+input.sel || 0), 0, 15),
  };
  // the latest input's number; snapshots echo it so a predicting client knows which inputs are in
  if (Number.isInteger(input.seq)) p.seq = input.seq;
}

export function command(world, id, cmd) {
  const p = world.players[id];
  if (!p || !cmd) return;
  switch (cmd.t) {
    case 'choose': choose(world, p, String(cmd.id || '')); break;
    case 'tame': tryTame(world, p); break;
    case 'eat': eat(world, p); break;
    case 'respawn': if (p.dead && world.time - p.deadAt > 1.2) spawnPlayer(world, p); break;
    case 'skill': petSkills(world, p, Number.isInteger(cmd.slot) ? cmd.slot : -1); break;
    case 'pets': petCommand(world, p, cmd); break;
    case 'hat': buyHat(world, p, String(cmd.id || '')); break;
    case 'release': {
      const a = world.animals.find(x => x.id === cmd.id && x.owner === p.id);
      if (a) { p.pets = p.pets.filter(x => x !== a.id); a.owner = null; a.state = 'wander'; a.home = { x: a.x, y: a.y }; }
      break;
    }
  }
}

function emit(world, e) { world.events.push(e); }

function choose(world, p, itemId) {
  if (!p.choices.length) return;
  const offer = currentOffer(p);
  if (!offer.includes(itemId)) return;
  const it = item(itemId);
  const at = p.items.findIndex(id => item(id)?.slot === it.slot);
  if (at >= 0) p.items[at] = itemId; else p.items.push(itemId);
  p.items.sort((a, b) => SLOT_ORDER.indexOf(item(a).slot) - SLOT_ORDER.indexOf(item(b).slot));
  p.choices.shift();
  while (p.choices.length && !currentOffer(p).length) p.choices.shift();
}
export function currentOffer(p) { return p.choices.length ? ageChoices(p.choices[0], p.items) : []; }

function foodItem(p) { return p.items.map(item).find(it => it.slot === 'food'); }
function eat(world, p) {
  if (p.dead || world.time < p.cd) return false;
  const food = foodItem(p);
  if (!food || p.res.food < food.cost.food || p.hp >= p.maxHp && !food.armor && !food.haste) return false;
  p.res.food -= food.cost.food;
  heal(world, p, food.heal);
  if (food.hot) p.hot = food.hot * 3;
  if (food.armor) { p.armor = food.armor; p.armorUntil = world.time + 6; }
  if (food.haste) { p.haste = food.haste; p.hasteUntil = world.time + 6; }
  p.actionAt = world.time; p.held = food.id; p.cd = world.time + food.reload;
  return true;
}

function heal(world, ent, amt) {
  const before = ent.hp;
  ent.hp = Math.min(ent.maxHp, ent.hp + amt);
  if (ent.hp - before >= 1) emit(world, { k: 'heal', id: ent.id, x: ent.x, y: ent.y - (ent.r || 35), amt: Math.round(ent.hp - before) });
}

function buyHat(world, p, hatId) {
  const hat = HAT_BY_ID.get(hatId);
  if (!hat) return;
  if (!p.hats.includes(hatId)) {
    if (p.res.gold < hat.cost) { emit(world, { k: 'msg', to: p.id, text: `${hat.name} costs ${hat.cost} gold` }); return; }
    p.res.gold -= hat.cost; p.hats.push(hatId);
  }
  p.hat = hatId;
}
const hat = p => HAT_BY_ID.get(p.hat) || HAT_BY_ID.get('none');

// ---------------- taming ----------------

export function tameTarget(world, p) {
  let best = null, bd = (p.r + 110) ** 2;
  for (const a of world.animals) {
    if (a.owner || a.boss || !a.sleep || a.dead) continue;
    const d = dist2(a, p);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
export function tameChance(p, a) {
  const def = PET_BY_ID.get(a.species);
  return Math.min(95, (def.tame + (a.bonus || 0)) * (hat(p).tame || 1));
}
function tryTame(world, p) {
  if (p.dead) return;
  const a = tameTarget(world, p);
  if (!a) return;
  if (p.pets.length >= MAX_PETS) { emit(world, { k: 'msg', to: p.id, text: 'Your 3 pet slots are full' }); return; }
  if (world.time < (p.tameAt || 0)) return;
  if (p.res.food < TAME_FOOD) { emit(world, { k: 'msg', to: p.id, text: `Taming needs ${TAME_FOOD} food` }); return; }
  // every try feeds the sleeper, win or lose
  p.res.food -= TAME_FOOD; p.tameAt = world.time + .35;
  const chance = tameChance(p, a);
  p.actionAt = world.time; p.held = foodItem(p)?.id || 'apple';
  if (world.random() * 100 < chance) {
    a.owner = p.id; a.sleep = false; a.state = 'follow'; a.target = null; a.xp = 0; a.mode = 'defend'; a.bonus = 0;
    p.pets.push(a.id); p.tames++;
    gainXp(world, p, 50);
    emit(world, { k: 'tame', by: p.id, name: p.name, id: a.id, species: a.species, x: a.x, y: a.y, chance: Math.round(chance) });
  } else {
    // a miss leaves it asleep, a little easier next time, and dozing a little longer
    a.bonus = (a.bonus || 0) + 2; a.wakeAt = Math.max(a.wakeAt, world.time + 8);
    emit(world, { k: 'tamefail', by: p.id, x: a.x, y: a.y, chance: Math.round(chance), species: a.species });
  }
}

// ---------------- leveling ----------------

function gainXp(world, p, amt) {
  if (p.dead || amt <= 0) return;
  p.xp += amt;
  while (p.age < MAX_AGE && p.xp >= xpForAge(p.age)) {
    p.xp -= xpForAge(p.age);
    p.age++;
    if (p.age <= LAST_CHOICE_AGE && ageChoices(p.age, p.items).length) p.choices.push(p.age);
    emit(world, { k: 'age', id: p.id, age: p.age, x: p.x, y: p.y });
  }
}
function gainGold(p, amt) { p.res.gold += amt; p.best = Math.max(p.best, p.res.gold); }

/** A pet's level from all the xp it ever earned: 1 when tamed, about 5 when it grows up, 60 at most. */
export function petLevel(total) { return Math.min(60, 1 + Math.floor(Math.sqrt((total || 0) / 25))); }
/** Each level past 1 adds 3% to a pet's health and bite. */
export const levelBoost = level => 1 + .03 * ((level || 1) - 1);

function petXp(world, a, amt) {
  if (!a?.owner || amt <= 0) return;
  a.total = (a.total || 0) + amt;
  const level = petLevel(a.total), def = PET_BY_ID.get(a.species);
  if (level !== (a.level || 1)) {
    const frac = a.hp / a.maxHp;
    a.level = level; a.maxHp = Math.round(petStats(def, a.stage).hp * levelBoost(level)); a.hp = Math.min(a.maxHp, a.maxHp * frac + 10);
  }
  if (a.stage >= 2) return;
  a.xp += amt;
  if (a.xp < PET_XP[a.stage]) return;
  a.xp = 0; a.stage++;
  a.maxHp = Math.round(petStats(def, a.stage).hp * levelBoost(a.level)); a.hp = a.maxHp; a.r = animalRadius(a.stage);
  emit(world, { k: 'grow', id: a.id, owner: a.owner, stage: a.stage, species: a.species, x: a.x, y: a.y });
}
/** Kill xp for a tamer's pets is one pot split between the pets close to the kill: one pet takes it all, three take a third each. */
function sharePetXp(world, owner, pot, x, y) {
  const pets = world.animals.filter(a => a.owner && a.owner === owner && !a.dead && Math.hypot(a.x - x, a.y - y) < 1100);
  if (!pets.length) return;
  const amt = Math.round(pot / pets.length);
  for (const a of pets) petXp(world, a, amt);
  emit(world, { k: 'petxp', owner, ids: pets.map(a => a.id), amt });
}

// ---------------- collision ----------------

export function nearbyResources(world, x, y, range) {
  const { grid, cell } = world.grid;
  const out = [];
  const c0 = Math.floor((x - range) / cell), c1 = Math.floor((x + range) / cell);
  const r0 = Math.floor((y - range) / cell), r1 = Math.floor((y + range) / cell);
  for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
    const list = grid.get(`${i},${j}`);
    if (list) for (const n of list) out.push(n);
  }
  return out;
}
const SOLID = new Set(['wall', 'door', 'spike', 'windmill', 'turret', 'tower']);
function blocks(s, e) {
  const k = kindOf(s);
  if (!SOLID.has(k)) return false;
  if (k === 'door') { const owner = e.owner || e.id; return owner !== s.owner; }
  return true;
}
function solidAt(world, x, y, r) {
  for (const n of nearbyResources(world, x, y, r + 140)) if ((n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + r) ** 2) return true;
  for (const s of world.structures) if (SOLID.has(kindOf(s)) && (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + r) ** 2) return true;
  return false;
}

// `harmless` is for client prediction, which moves like the server but never deals damage
function collide(world, e, harmless = false) {
  for (const n of nearbyResources(world, e.x, e.y, e.r + 140)) {
    const before = !harmless && n.type === 'cactus' && (e.x - n.x) ** 2 + (e.y - n.y) ** 2 < (n.r + e.r + 4) ** 2;
    pushOut(e, n, n.r);
    if (before && world.tick % 2 === 0 && !e.dead) hurt(world, e, RESOURCE_TYPES.cactus.hurts, null, { kind: 'thorns', kb: 0 });
  }
  for (const s of world.structures) {
    if (Math.abs(s.x - e.x) > s.r + e.r || Math.abs(s.y - e.y) > s.r + e.r) continue;
    if (!blocks(s, e)) continue;
    const k = kindOf(s);
    if (k === 'wall' || k === 'door') pushOutBox(e, s); else pushOut(e, s, s.r);
  }
  e.x = clamp(e.x, e.r, WORLD.w - e.r); e.y = clamp(e.y, e.r, WORLD.h - e.r);
}
function pushOut(e, o, or) {
  const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), min = e.r + or;
  if (d >= min) return;
  if (d === 0) { e.x += min; return; }
  const k = (min - d) / d;
  e.x += dx * k; e.y += dy * k;
  // kill velocity into the obstacle so sliding along feels smooth
  const nx = dx / d, ny = dy / d, vn = e.vx * nx + e.vy * ny;
  if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
}
function pushOutBox(e, s) {
  const h = s.r - 2;
  const nx = clamp(e.x, s.x - h, s.x + h), ny = clamp(e.y, s.y - h, s.y + h);
  const dx = e.x - nx, dy = e.y - ny, d = Math.hypot(dx, dy);
  if (d >= e.r) return;
  if (d === 0) { e.y = s.y - h - e.r; return; }
  const k = (e.r - d) / d; e.x += dx * k; e.y += dy * k;
  const ux = dx / d, uy = dy / d, vn = e.vx * ux + e.vy * uy;
  if (vn < 0) { e.vx -= vn * ux; e.vy -= vn * uy; }
}

// ---------------- combat ----------------

const ownerOf = e => e?.owner || e?.id;
function friendly(a, b) { return ownerOf(a) && ownerOf(a) === ownerOf(b); }

// by: the entity (player, animal, or {x,y,id,owner} for buildings/projectiles)
function hurt(world, t, amt, by, opts = {}) {
  if (t.dead || t.hp <= 0) return 0;
  if (t.shieldUntil && world.time < t.shieldUntil && !t.owner) return 0;
  if (by && friendly(t, by)) return 0;
  let dmg = amt;
  if (t.items) {
    if (t.armorUntil > world.time) dmg *= 1 - t.armor;
    if (hat(t).armor) dmg *= 1 - hat(t).armor;
    const held = item(t.held);
    if (held?.block && by) {
      const ang = Math.atan2(by.y - t.y, by.x - t.x);
      if (Math.abs(angleDiff(t.angle, ang)) < 1.1) dmg *= 1 - held.block;
    }
  }
  dmg = Math.max(1, Math.round(dmg));
  t.hp -= dmg;
  t.hitAt = world.time;
  t.lastHurtAt = world.time;
  const kb = opts.kb ?? 1;
  if (by && kb && !t.boss) {
    const ang = Math.atan2(t.y - by.y, t.x - by.x), push = (opts.knock ?? 70) * 12 * kb * (t.items ? 1 : .6);
    t.vx += Math.cos(ang) * push; t.vy += Math.sin(ang) * push;
  }
  emit(world, { k: 'dmg', id: t.id, x: t.x, y: t.y - (t.r || 35), amt: dmg, kind: opts.kind || 'hit', by: ownerOf(by) || null, crit: opts.crit });
  if (t.boss && by) t.dmgBy[ownerOf(by)] = (t.dmgBy[ownerOf(by)] || 0) + dmg;
  if (t.items) {
    t.lastHitBy = ownerOf(by) || t.lastHitBy;
    if (t.hp <= 0) killPlayer(world, t, by);
  } else {
    if (t.sleep) { t.sleep = false; t.bonus = 0; t.sleepAt = world.time + 40; }
    if (!t.owner && by && !t.boss) {
      const def = PET_BY_ID.get(t.species);
      const attacker = ownerOf(by);
      if (def.temper === 'passive' || (def.temper === 'coward' && t.hp > t.maxHp * .7) || t.stage === 0 && !t.angry) {
        t.state = 'flee'; t.fleeUntil = world.time + 4; t.target = attacker;
      } else { t.state = 'chase'; t.target = attacker; }
    }
    if (t.owner && by && !t.target) t.target = by.items ? by.id : by.id;
    if (t.hp <= 0) killAnimal(world, t, by);
  }
  return dmg;
}

function killPlayer(world, p, by) {
  p.hp = 0; p.dead = true; p.deadAt = world.time;
  const killer = world.players[ownerOf(by)];
  if (killer && killer !== p) {
    killer.kills++;
    gainGold(killer, Math.floor(p.res.gold / 6));
    gainXp(world, killer, 100 + p.age * 10);
    sharePetXp(world, killer.id, 450 + p.age * 15, p.x, p.y);
  }
  for (const id of p.pets) { const a = world.animals.find(x => x.id === id); if (a) { a.target = null; a.state = 'follow'; } }
  emit(world, { k: 'death', id: p.id, name: p.name, by: killer?.id || null, byName: killer?.name || (by?.species ? PET_BY_ID.get(by.species)?.name : by?.boss ? BOSS_BY_ID.get(by.boss)?.name : null), gold: p.res.gold, age: p.age, kills: p.kills, tames: p.tames, x: p.x, y: p.y });
}

function killAnimal(world, a, by) {
  a.hp = 0; a.dead = true;
  const killer = world.players[ownerOf(by)];
  if (a.owner) {
    const owner = world.players[a.owner];
    if (owner) owner.pets = owner.pets.filter(id => id !== a.id);
    emit(world, { k: 'petdied', owner: a.owner, species: a.species, x: a.x, y: a.y });
    world.animals = world.animals.filter(x => x !== a);
    if (killer) gainXp(world, killer, [50, 100, 400][a.stage]);
    return;
  }
  if (a.boss) {
    const def = BOSS_BY_ID.get(a.boss);
    const total = Object.values(a.dmgBy).reduce((n, v) => n + v, 0) || 1;
    for (const [pid, d] of Object.entries(a.dmgBy)) {
      const p = world.players[pid]; if (!p || p.dead) continue;
      const share = d / total;
      gainGold(p, Math.round(def.gold * share)); gainXp(world, p, Math.round(def.xp * share)); p.res.food += Math.round(300 * share);
    }
    const pool = PETS.filter(p => p.biome === def.biome).sort((x, y) => ['common', 'rare', 'epic', 'legendary'].indexOf(y.rarity) - ['common', 'rare', 'epic', 'legendary'].indexOf(x.rarity));
    for (let i = 0; i < 3; i++) {
      const baby = spawnAnimal(world, pool[i % Math.min(2, pool.length)], 0, { x: a.x + Math.cos(i * 2.1) * 140, y: a.y + Math.sin(i * 2.1) * 140 });
      baby.sleep = true; baby.wakeAt = world.time + 60; baby.bonus = 10;
    }
    emit(world, { k: 'boss', by: killer?.id, byName: killer?.name, name: def.name, x: a.x, y: a.y });
    world.animals = world.animals.filter(x => x !== a);
    world.bossAt[def.id] = world.time + BOSS_RESPAWN;
    return;
  }
  if (killer) {
    // big wild animals are the early game's paycheque
    gainXp(world, killer, [50, 100, 400][a.stage]);
    gainGold(killer, [5, 40, 400][a.stage]);
    killer.res.food += [8, 20, 60][a.stage];
  }
  // pets that helped grow from the kill
  if (ownerOf(by)) sharePetXp(world, ownerOf(by), [120, 270, 900][a.stage], a.x, a.y);
  emit(world, { k: 'kill', id: a.id, x: a.x, y: a.y, species: a.species });
  a.respawnAt = world.time + 20;
}

function hitStructure(world, s, dmg, by) {
  if (s.owner === ownerOf(by)) return;
  s.hp -= dmg; s.hitAt = world.time;
  emit(world, { k: 'dmg', id: s.id, x: s.x, y: s.y - s.r, amt: Math.round(dmg), kind: 'struct' });
  if (s.hp <= 0) destroyStructure(world, s);
}
function destroyStructure(world, s) {
  world.structures = world.structures.filter(x => x !== s);
  emit(world, { k: 'break', x: s.x, y: s.y, item: s.item });
}

function petDamageVs(a, t) {
  const def = PET_BY_ID.get(a.species);
  const tdef = t.species && !t.boss ? PET_BY_ID.get(t.species) : null;
  const m = tdef ? def.types.reduce((acc, ty) => Math.max(acc, typeMultiplier(ty, tdef.types)), 0) : 1;
  return { mult: m || 1 };
}

// One melee swing: everything inside the arc in front of the player is hit.
function swing(world, p, it) {
  const reach = p.r + it.range, arc = it.spin ? Math.PI : 1.0;
  const fx = p.x + Math.cos(p.angle) * reach * .5, fy = p.y + Math.sin(p.angle) * reach * .5;
  const inArc = (o, or) => {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d - or > reach) return false;
    return Math.abs(angleDiff(p.angle, Math.atan2(o.y - p.y, o.x - p.x))) < arc * .62 + Math.min(.9, or / Math.max(d, 1));
  };
  const bonus = hat(p).gather || {};
  for (const n of nearbyResources(world, fx, fy, reach + 140)) {
    if (!inArc(n, n.r)) continue;
    const spec = RESOURCE_TYPES[n.type];
    const amt = Math.max(1, Math.round((it.harvest?.[spec.yields] || 1) * (spec.per || 1) + (bonus[spec.yields] || 0) + (p.hat === 'leaf' && spec.yields === 'wood' ? 1 : 0)));
    if (spec.yields === 'gold') gainGold(p, amt); else p.res[spec.yields] += amt;
    gainXp(world, p, amt * 2);
    emit(world, { k: 'gather', id: n.id, by: p.id, res: spec.yields, amt, ang: p.angle, x: n.x, y: n.y });
  }
  const dmgMul = p.hat === 'horns' ? 1.1 : 1;
  let hitPlayer = null;
  for (const a of world.animals) {
    if (a.dead || a.owner === p.id || !inArc(a, a.r)) continue;
    hurt(world, a, (it.adm || it.dmg) * dmgMul, p, { knock: it.knock });
    if (a.owner) hitPlayer = hitPlayer || world.players[a.owner];
    else if (!a.boss) hitPlayer = hitPlayer || a;
  }
  for (const o of Object.values(world.players)) {
    if (o === p || o.dead || !inArc(o, o.r)) continue;
    hurt(world, o, it.dmg * dmgMul, p, { knock: it.knock });
    hitPlayer = o;
  }
  for (const s of world.structures) {
    if (!inArc(s, s.r)) continue;
    if (s.owner === p.id) {
      if (it.repair && s.hp < s.maxHp) { const before = s.hp; s.hp = Math.min(s.maxHp, s.hp + it.repair); emit(world, { k: 'heal', id: s.id, x: s.x, y: s.y - s.r, amt: Math.round(s.hp - before) }); }
      continue;
    }
    hitStructure(world, s, it.bdm * dmgMul, p);
  }
  // pets pile onto whatever their tamer just hit
  if (hitPlayer) for (const id of p.pets) { const a = world.animals.find(x => x.id === id); if (a && a.mode !== 'stop') a.target = hitPlayer.id; }
}

function canAfford(p, cost) { return Object.entries(cost || {}).every(([k, v]) => p.res[k] >= v); }
function pay(p, cost) { for (const [k, v] of Object.entries(cost || {})) p.res[k] -= v; }

function shoot(world, p, it) {
  if (!canAfford(p, it.ammo)) { emit(world, { k: 'msg', to: p.id, text: `Needs ${Object.entries(it.ammo).map(([k, v]) => `${v} ${k}`).join(', ')}` }); return false; }
  pay(p, it.ammo);
  const kind = it.shape === 'appletor' ? 'apple' : it.shape === 'slingshot' ? 'pebble' : 'arrow';
  world.projectiles.push({
    id: `j${world.nextId++}`, x: p.x + Math.cos(p.angle) * (p.r + 20), y: p.y + Math.sin(p.angle) * (p.r + 20),
    vx: Math.cos(p.angle) * it.projectile, vy: Math.sin(p.angle) * it.projectile, item: it.id, kind,
    owner: p.id, until: world.time + it.range / it.projectile, r: kind === 'arrow' ? 8 : 12,
  });
  return true;
}

function place(world, p, it) {
  if (!canAfford(p, it.cost)) { emit(world, { k: 'msg', to: p.id, text: `Not enough resources for ${it.name}` }); return false; }
  const mine = world.structures.filter(s => s.owner === p.id);
  if (mine.length >= BUILD_LIMIT) { emit(world, { k: 'msg', to: p.id, text: 'Building limit reached' }); return false; }
  const same = mine.filter(s => item(s.item).kind === it.kind);
  if (same.length >= it.limit) { emit(world, { k: 'msg', to: p.id, text: `${it.name}: limit ${it.limit}` }); return false; }
  const d = p.r + it.r + 4;
  const x = p.x + Math.cos(p.angle) * d, y = p.y + Math.sin(p.angle) * d;
  if (!placeable(world, x, y, it)) return false;
  pay(p, it.cost);
  const s = { id: `s${world.nextId++}`, item: it.id, x: Math.round(x), y: Math.round(y), r: it.r, rot: it.kind === 'boost' ? p.angle : 0, hp: it.hp, maxHp: it.hp, owner: p.id, cd: 0, aim: p.angle, born: world.time };
  world.structures.push(s);
  emit(world, { k: 'place', by: p.id, x: s.x, y: s.y, item: it.id });
  return true;
}
export function placeable(world, x, y, it) {
  if (x < it.r || y < it.r || x > WORLD.w - it.r || y > WORLD.h - it.r) return false;
  for (const n of nearbyResources(world, x, y, it.r + 140)) if ((n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + it.r - 4) ** 2) return false;
  for (const s of world.structures) {
    const box = (kindOf(s) === 'wall' || kindOf(s) === 'door') && (it.kind === 'wall' || it.kind === 'door');
    if (box ? Math.abs(s.x - x) < s.r + it.r - 2 && Math.abs(s.y - y) < s.r + it.r - 2 : (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + it.r - 4) ** 2) return false;
  }
  if (SOLID.has(it.kind)) {
    for (const o of Object.values(world.players)) if (!o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + it.r - 6) ** 2) return false;
    for (const a of world.animals) if (!a.dead && (a.x - x) ** 2 + (a.y - y) ** 2 < (a.r + it.r - 6) ** 2) return false;
  }
  return true;
}

// ---------------- step ----------------

export function step(world, dt) {
  world.time += dt; world.tick++;
  for (const [id, at] of Object.entries(world.bossAt)) if (world.time >= at) { delete world.bossAt[id]; spawnBoss(world, BOSS_BY_ID.get(id)); }
  for (const p of Object.values(world.players)) updatePlayer(world, p, dt);
  for (const a of [...world.animals]) updateAnimal(world, a, dt);
  updateStructures(world, dt);
  updateProjectiles(world, dt);
  updateHazards(world, dt);
  // soft separation between bodies
  // sorted by x so each body only checks the few within reach (bodies are at most 2 * MAX_BODY_R apart when touching)
  const bodies = [...Object.values(world.players).filter(p => !p.dead), ...world.animals.filter(a => !a.dead && !a.boss)].sort((a, b) => a.x - b.x);
  const reach = 2 * Math.max(0, ...bodies.map(b => b.r));
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
    if (dx > reach) break;
    if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < min) { const k = (min - d) / d * .25; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
  }
}

function moveSpeed(world, p, it) {
  let s = BASE_SPEED * ((it?.speed ?? 100) / 100);
  if (world.time < p.slowUntil) s *= .55;
  if (world.time < p.hasteUntil) s *= 1 + p.haste;
  const h = hat(p);
  if (h.slow) s *= 1 - h.slow;
  if (h.biome && h.biome === biomeAt(p.x, p.y).id) s *= 1.15;
  if (world.time < p.trappedUntil) s = 0;
  return s;
}

// One tick of a tamer's movement. The client runs the same step for its own tamer (prediction),
// against a mirror world of the resource grid and the structures it can see.
export function moveTamer(world, p, inp, speed, dt, harmless = false) {
  let mx = inp.mx, my = inp.my;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const accel = 1 - Math.exp(-dt * 10);
  p.vx += (mx * speed - p.vx) * accel; p.vy += (my * speed - p.vy) * accel;
  p.x += p.vx * dt; p.y += p.vy * dt;
  collide(world, p, harmless);
}

function updatePlayer(world, p, dt) {
  if (p.dead) {
    if (p.bot && world.time - p.deadAt > 4) spawnPlayer(world, p);
    return;
  }
  if (p.bot) botThink(world, p);
  const inp = p.input;
  p.sel = clamp(inp.sel, 0, p.items.length - 1);
  const it = item(p.items[p.sel]) || item('hand');
  // food eaten from a hotkey stays in hand for a moment, otherwise hold the selected item
  if (item(p.held)?.slot !== 'food' || world.time - p.actionAt > .35) p.held = it.id;
  p.angle = inp.angle;
  moveTamer(world, p, inp, moveSpeed(world, p, it), dt);
  // status effects tick every 0.5s
  if (world.tick % 10 === 0) {
    if (p.poison > 0) hurt(world, p, 4, null, { kind: 'poison', kb: 0 });
    if (p.burn > 0) hurt(world, p, 5, null, { kind: 'burn', kb: 0 });
    if (p.hot > 0) { const h = Math.min(p.hot, 2.5); p.hot -= h; heal(world, p, h); }
  }
  p.poison = Math.max(0, p.poison - dt); p.burn = Math.max(0, p.burn - dt);
  if (p.dead) return;
  if (inp.attack && world.time >= p.cd) {
    p.cd = world.time + (it.reload || .4);
    if (it.slot === 'food') { if (!eat(world, p)) p.cd = world.time + .2; }
    else if (it.kind) { if (place(world, p, it)) p.actionAt = world.time; else p.cd = world.time + .2; }
    else if (it.ammo) { if (shoot(world, p, it)) p.actionAt = world.time; }
    else { swing(world, p, it); p.actionAt = world.time; }
    if (p.actionAt === world.time) p.shieldUntil = 0;
  }
}

// ---------------- animals ----------------

function updateAnimal(world, a, dt) {
  if (a.dead) {
    if (!a.owner && world.time >= a.respawnAt) {
      const def = PET_BY_ID.get(a.species);
      world.animals.splice(world.animals.indexOf(a), 1);
      spawnAnimal(world, def, world.random() < .6 ? 0 : 1);
    }
    return;
  }
  if (a.boss) return updateBoss(world, a, dt);
  const def = PET_BY_ID.get(a.species);
  const st = petStats(def, a.stage);
  let goal = null, speed = 0;
  a.moving = false;
  if (a.owner) {
    const owner = world.players[a.owner];
    if (!owner) { world.animals.splice(world.animals.indexOf(a), 1); return; }
    let target = a.target && (world.players[a.target] || world.animals.find(x => x.id === a.target));
    if (target && (target.dead || target.hp <= 0 || target.id === owner.id || target.owner === owner.id || target.sleep || dist(target, owner) > 800 || world.time < (target.shieldUntil || 0))) target = a.target = null;
    if (!target && !owner.dead && a.mode !== 'stop') {
      // defend: whoever just hurt the tamer, or (attack mode) the nearest hostile
      const attacker = owner.lastHitBy && (world.players[owner.lastHitBy] || world.animals.find(x => x.id === owner.lastHitBy));
      if (attacker && !attacker.dead && world.time - owner.lastHurtAt < 4 && dist(attacker, owner) < 600) target = attacker;
      if (!target) {
        let bd = (a.mode === 'attack' ? 520 : 260) ** 2;
        for (const x of world.animals) {
          if (x === a || x.dead || x.owner === owner.id || x.sleep || x.boss && a.mode !== 'attack') continue;
          if (!x.owner && x.target !== owner.id && a.mode !== 'attack') continue;
          const d = dist2(x, owner); if (d < bd) { bd = d; target = x; }
        }
        if (a.mode === 'attack') for (const o of Object.values(world.players)) {
          if (o === owner || o.dead || world.time < o.shieldUntil) continue;
          const d = dist2(o, owner); if (d < bd) { bd = d; target = o; }
        }
      }
      if (target) a.target = target.id;
    }
    if (target && a.mode !== 'stop') {
      goal = target; speed = st.speed * 1.1;
      if (dist(a, target) < a.r + target.r + 16 && world.time >= a.cd) {
        a.cd = world.time + 1; a.attackAt = world.time;
        const m = petDamageVs(a, target).mult, buff = a.buffUntil > world.time ? 1.5 : 1;
        const dealt = hurt(world, target, st.bite * levelBoost(a.level) * m * buff * (target.items ? 1 : 1.2), a, { knock: 30, crit: m > 1.5 });
        petXp(world, a, dealt * .5);
      }
    } else if (a.mode === 'stop' || a.mode === 'move') {
      if (a.post && dist(a, a.post) > 20) { goal = a.post; speed = st.speed * 1.2; }
    } else if (!owner.dead) {
      const slot = owner.pets.indexOf(a.id);
      const ang = Math.atan2(owner.vy, owner.vx) + Math.PI + (slot - 1) * .8;
      const moving = Math.hypot(owner.vx, owner.vy) > 40;
      const back = moving ? ang : owner.angle + Math.PI + (slot - 1) * .9;
      const fx = owner.x + Math.cos(back) * (owner.r + a.r + 30), fy = owner.y + Math.sin(back) * (owner.r + a.r + 30);
      const d = Math.hypot(fx - a.x, fy - a.y);
      if (d > 25) { goal = { x: fx, y: fy }; speed = Math.min(st.speed * 1.5, d * 4 + 60); }
      if (dist(a, owner) > 1300) { a.x = owner.x - 60; a.y = owner.y + 40; a.vx = a.vy = 0; }
    }
    // pets regenerate after 5s without damage
    if (world.time - a.lastHurtAt > 5 && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + dt * a.maxHp * (owner.hat === 'flower' ? .04 : .02));
  } else {
    // wild babies doze off; sleepers wake after a while
    if (a.stage === 0) {
      if (a.sleep) {
        if (world.time > a.wakeAt) { a.sleep = false; a.bonus = 0; a.sleepAt = world.time + 30 + world.random() * 20; }
        else { a.vx *= .8; a.vy *= .8; return; }
      } else if (world.time > a.sleepAt && a.state !== 'chase') {
        const nearPlayer = Object.values(world.players).some(p => !p.dead && dist2(p, a) < 400 ** 2);
        if (!nearPlayer || world.time > a.sleepAt + 30) { a.sleep = true; a.angry = false; a.state = 'wander'; a.target = null; a.wakeAt = world.time + 25 + world.random() * 20; return; }
      }
    }
    let prey = a.target && (world.players[a.target] || world.animals.find(x => x.id === a.target && !x.dead));
    if (prey && (prey.dead || prey.hp <= 0 || dist(prey, a) > 900 || dist(a, a.home) > 1500 || world.time < (prey.shieldUntil || 0))) { prey = null; a.target = null; a.state = 'wander'; a.angry = false; }
    if (!prey && def.temper === 'aggressive' && a.stage > 0) {
      let bd = 340 ** 2;
      for (const p of Object.values(world.players)) {
        if (p.dead || world.time < p.shieldUntil) continue;
        const d = dist2(p, a); if (d < bd) { bd = d; prey = p; }
      }
      if (prey) { a.target = prey.id; a.state = 'chase'; }
    }
    if (prey && a.state === 'flee' && world.time < a.fleeUntil) {
      const ang = Math.atan2(a.y - prey.y, a.x - prey.x);
      goal = { x: a.x + Math.cos(ang) * 200, y: a.y + Math.sin(ang) * 200 }; speed = st.speed * 1.05;
    } else if (prey && a.state === 'chase') {
      goal = prey; speed = st.speed;
      if (dist(a, prey) < a.r + prey.r + 16 && world.time >= a.cd) {
        a.cd = world.time + 1; a.attackAt = world.time;
        hurt(world, prey, st.bite * (prey.items ? 1 : 1.2), a, { knock: 30 });
      }
    } else {
      if (a.state === 'flee' && world.time >= a.fleeUntil) { a.state = 'wander'; a.target = null; }
      if (world.time > a.wanderAt) {
        a.wanderAt = world.time + 2 + world.random() * 4;
        a.wanderGoal = world.random() < .35 ? null : { x: clamp(a.home.x + (world.random() - .5) * 800, 120, WORLD.w - 120), y: clamp(a.home.y + (world.random() - .5) * 800, 120, WORLD.h - 120) };
        // wild animals keep to their own biome
        if (a.wanderGoal && biomeAt(a.wanderGoal.x, a.wanderGoal.y).id !== def.biome) a.wanderGoal = null;
      }
      if (a.wanderGoal) { goal = a.wanderGoal; speed = st.speed * .35; if (dist(a, goal) < 40) a.wanderGoal = null; }
    }
  }
  steer(world, a, goal, speed, dt);
}

function steer(world, a, goal, speed, dt) {
  if (goal) {
    const dx = goal.x - a.x, dy = goal.y - a.y, d = Math.hypot(dx, dy);
    if (d > 1) {
      const want = Math.atan2(dy, dx);
      a.angle += angleDiff(a.angle, want) * Math.min(1, dt * 10);
      if (d > 6) {
        a.vx += (Math.cos(want) * speed - a.vx) * Math.min(1, dt * 8); a.vy += (Math.sin(want) * speed - a.vy) * Math.min(1, dt * 8);
        a.moving = true;
      }
    }
  } else { a.vx *= Math.exp(-dt * 8); a.vy *= Math.exp(-dt * 8); }
  a.x += a.vx * dt; a.y += a.vy * dt;
  collide(world, a);
}

function updateBoss(world, a, dt) {
  const def = BOSS_BY_ID.get(a.boss);
  // asleep until hit; heals while nobody is fighting it and dozes off again when left alone
  if (world.time - a.lastHurtAt > 15 && a.hp < a.maxHp) { a.hp = Math.min(a.maxHp, a.hp + a.maxHp * .02 * dt); if (a.hp > a.maxHp * .99) { a.dmgBy = {}; a.waves = 0; } }
  if (a.sleep) return;
  const targets = [...Object.values(world.players).filter(p => !p.dead && world.time >= p.shieldUntil), ...world.animals.filter(x => x.owner && !x.dead)];
  if (world.time - a.lastHurtAt > 20 && !targets.some(t => dist2(t, a) < 900 ** 2)) { a.sleep = true; return; }
  // a ring of thorns every few seconds at anyone in range
  if (world.time >= a.volleyAt && targets.some(t => dist2(t, a) < 750 ** 2)) {
    a.volleyAt = world.time + 4.5;
    const n = 12, spin = world.random() * TAU, speed = 520;
    for (let i = 0; i < n; i++) {
      const ang = spin + i / n * TAU;
      world.projectiles.push({ id: `j${world.nextId++}`, x: a.x + Math.cos(ang) * (a.r + 10), y: a.y + Math.sin(ang) * (a.r + 10), vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: Math.round(def.dmg * .3), owner: a.id, boss: true, until: world.time + 1.5, r: 14, kind: 'thorn' });
    }
  }
  let best = null, bd = (a.r + def.reach) ** 2;
  for (const t of targets) { const d = dist2(t, a); if (d < bd) { bd = d; best = t; } }
  if (best) {
    a.angle += angleDiff(a.angle, Math.atan2(best.y - a.y, best.x - a.x)) * Math.min(1, dt * 4);
    if (world.time >= a.cd) {
      a.cd = world.time + def.every; a.attackAt = world.time;
      // a sweeping blow that hits everything in a wide arc
      for (const t of targets) {
        const d = dist(t, a);
        if (d - t.r > a.r + def.reach * .7) continue;
        if (Math.abs(angleDiff(a.angle, Math.atan2(t.y - a.y, t.x - a.x))) > 1.3) continue;
        hurt(world, t, def.dmg, a, { knock: 140 });
      }
    }
  }
  // minion waves at 75%, 50% and 25% health
  const wave = a.hp < a.maxHp * .25 ? 3 : a.hp < a.maxHp * .5 ? 2 : a.hp < a.maxHp * .75 ? 1 : 0;
  if (wave > a.waves) {
    a.waves = wave;
    const def2 = PET_BY_ID.get(def.minions);
    for (let i = 0; i < 3; i++) {
      const m = spawnAnimal(world, def2, 1, { x: a.x + Math.cos(i * 2.1) * (a.r + 80), y: a.y + Math.sin(i * 2.1) * (a.r + 80) });
      m.angry = true; m.state = 'chase';
      const near = Object.values(world.players).filter(p => !p.dead).sort((p, q) => dist2(p, a) - dist2(q, a))[0];
      m.target = near?.id || null;
    }
    emit(world, { k: 'wave', name: def.name, x: a.x, y: a.y });
  }
}

// ---------------- pets: skills and orders ----------------

function petCommand(world, p, cmd) {
  const mode = ['defend', 'attack', 'stop', 'move'].includes(cmd.mode) ? cmd.mode : 'defend';
  const ids = Number.isInteger(cmd.slot) && cmd.slot >= 0 ? [p.pets[cmd.slot]] : p.pets;
  for (const id of ids) {
    const a = world.animals.find(x => x.id === id);
    if (!a) continue;
    a.mode = mode; a.target = null;
    if (mode === 'move' && Number.isFinite(+cmd.x) && Number.isFinite(+cmd.y)) a.post = { x: clamp(+cmd.x, 0, WORLD.w), y: clamp(+cmd.y, 0, WORLD.h) };
    else if (mode === 'stop') a.post = { x: a.x, y: a.y };
    else a.post = null;
  }
}

export function skillCooldown(a) {
  const def = PET_BY_ID.get(a.species);
  return SKILLS[def.skill].cd - a.stage * 2.5;
}

function petSkills(world, p, slot) {
  const ids = slot >= 0 ? [p.pets[slot]] : p.pets;
  for (const id of ids) {
    const a = world.animals.find(x => x.id === id);
    if (!a || a.dead || world.time - (a.skillAt ?? -99) < skillCooldown(a)) continue;
    const def = PET_BY_ID.get(a.species);
    const foes = [...Object.values(world.players).filter(o => o.id !== p.id && !o.dead && world.time >= o.shieldUntil), ...world.animals.filter(o => !o.dead && o.owner !== p.id && !o.sleep)];
    const near = foes.filter(o => dist(o, a) < 360 + (o.r || 0)).sort((x, y) => dist2(x, a) - dist2(y, a));
    const power = petStats(def, a.stage).bite;
    const hit = (o, mul, opts) => hurt(world, o, power * mul * (o.items ? .5 : 1) * petDamageVs(a, o).mult, a, opts);
    if (!near.length && !['rally', 'frost'].includes(def.skill)) continue;
    a.skillAt = world.time;
    switch (def.skill) {
      case 'blaze': for (const o of near.filter(o => dist(o, a) < 220 + (o.r || 0))) { hit(o, 3, { kind: 'burn', knock: 50 }); if (o.items) o.burn = 3; } break;
      case 'vines': { const o = near[0]; const d = hit(o, 3, { kind: 'plant', kb: 0 }); heal(world, a, d); if (o.items) o.slowUntil = world.time + 3; else o.cd = world.time + 2; break; }
      case 'wave': for (const o of near.slice(0, 5)) hit(o, 2, { kind: 'water', knock: 260 }); break;
      case 'thunder': { const o = near[0]; hit(o, 4, { kind: 'shock', kb: 0 }); if (world.random() < .5) { if (o.items) o.trappedUntil = world.time + 1.5; else o.cd = world.time + 2; } break; }
      case 'frost': for (const o of near.filter(o => dist(o, a) < 260 + (o.r || 0))) { hit(o, 2, { kind: 'ice', kb: 0 }); if (world.random() < .25 && o.items) o.trappedUntil = world.time + 1.5; else if (o.items) o.slowUntil = world.time + 2.5; } break;
      case 'venom': for (const o of near.filter(o => dist(o, a) < 240 + (o.r || 0))) { hit(o, 1.5, { kind: 'poison', kb: 0 }); if (o.items) o.poison = 4; } break;
      case 'boulder': { const o = near[0]; const ang = Math.atan2(o.y - a.y, o.x - a.x); a.vx = Math.cos(ang) * 1400; a.vy = Math.sin(ang) * 1400; hit(o, 3.5, { kind: 'rock', knock: 200 }); break; }
      case 'scratch': { const o = near[0]; for (let i = 0; i < 3; i++) hit(o, 1.6, { kind: 'claw', knock: 20 }); break; }
      case 'swarm': for (const o of near.slice(0, 6)) hit(o, 1.8, { kind: 'insect', knock: 20 }); break;
      case 'shade': { const o = near[0]; const ang = Math.atan2(o.y - p.y, o.x - p.x); a.x = o.x + Math.cos(ang) * (o.r + a.r + 4); a.y = o.y + Math.sin(ang) * (o.r + a.r + 4); hit(o, 4, { kind: 'shadow', knock: 60 }); break; }
      case 'rally': heal(world, p, 25); for (const id2 of p.pets) { const b = world.animals.find(x => x.id === id2); if (b) { heal(world, b, b.maxHp * .25); b.buffUntil = world.time + 6; } } break;
    }
    emit(world, { k: 'skill', id: a.id, skill: def.skill, x: a.x, y: a.y, owner: p.id });
  }
}

// ---------------- buildings ----------------

function updateStructures(world, dt) {
  const tenth = world.tick % 2 === 0; // damage ticks every 0.1s
  for (const s of [...world.structures]) {
    const it = item(s.item);
    const owner = world.players[s.owner];
    switch (it.kind) {
      case 'windmill':
        if (owner && !owner.dead && world.time - (s.paidAt ?? s.born) >= it.every) {
          s.paidAt = world.time; gainGold(owner, it.gold); gainXp(world, owner, it.gold * .5);
          emit(world, { k: 'mill', to: owner.id, x: s.x, y: s.y, amt: it.gold });
        }
        break;
      case 'spike':
        if (!tenth) break;
        for (const t of [...Object.values(world.players), ...world.animals]) {
          if (t.dead || t.id === s.owner || t.owner === s.owner || t.sleep || t.boss || t.hp <= 0) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 > (s.r + t.r + 8) ** 2) continue;
          hurt(world, t, it.touch * (t.items ? 1 : 2), { x: s.x, y: s.y, id: s.owner, owner: s.owner }, { kind: 'spike', knock: 25 });
        }
        break;
      case 'trap':
        for (const t of [...Object.values(world.players), ...world.animals.filter(x => !x.boss)]) {
          if (t.dead || t.id === s.owner || t.owner === s.owner || t.sleep) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r * .7 + t.r * .4) ** 2) {
            if (t.items) { t.trappedUntil = world.time + 2; t.x = s.x; t.y = s.y; t.vx = t.vy = 0; } else t.cd = world.time + 2;
            hurt(world, t, t.items ? it.dmg : it.adm, { x: s.x, y: s.y, id: s.owner, owner: s.owner }, { kind: 'trap', kb: 0 });
            emit(world, { k: 'trap', x: s.x, y: s.y });
            destroyStructure(world, s);
            break;
          }
        }
        break;
      case 'boost':
        for (const t of Object.values(world.players)) {
          if (t.dead) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r + t.r * .3) ** 2) { t.vx = Math.cos(s.rot) * 1100; t.vy = Math.sin(s.rot) * 1100; }
        }
        break;
      case 'heal':
        if (!owner || world.time - (s.paidAt ?? 0) < it.every) break;
        s.paidAt = world.time;
        for (const t of [owner, ...owner.pets.map(id => world.animals.find(a => a.id === id)).filter(Boolean)]) {
          if (!t.dead && (t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r + t.r * .6) ** 2) heal(world, t, it.heal);
        }
        break;
      case 'turret': case 'tower': {
        if (world.time < s.cd) break;
        let best = null, bd = it.range ** 2;
        for (const t of Object.values(world.players)) {
          if (t.dead || t.id === s.owner || world.time < t.shieldUntil) continue;
          const d = dist2(t, s); if (d < bd) { bd = d; best = t; }
        }
        for (const t of world.animals) {
          if (t.dead || t.owner === s.owner || t.sleep || !(t.target === s.owner || t.owner)) continue;
          const d = dist2(t, s); if (d < bd) { bd = d; best = t; }
        }
        if (best) {
          s.aim = Math.atan2(best.y - s.y, best.x - s.x); s.cd = world.time + it.every; s.shotAt = world.time;
          const speed = it.kind === 'tower' ? 700 : 1000;
          world.projectiles.push({ id: `j${world.nextId++}`, x: s.x + Math.cos(s.aim) * 50, y: s.y + Math.sin(s.aim) * 50, vx: Math.cos(s.aim) * speed, vy: Math.sin(s.aim) * speed, dmg: it.dmg, owner: s.owner, until: world.time + it.range / speed, r: it.kind === 'tower' ? 16 : 10, kind: it.kind === 'tower' ? 'fireball' : 'ball' });
        }
        break;
      }
    }
  }
}

function updateProjectiles(world, dt) {
  const keep = [];
  for (const j of world.projectiles) {
    j.x += j.vx * dt; j.y += j.vy * dt;
    if (world.time > j.until) continue;
    let hit = false;
    for (const n of nearbyResources(world, j.x, j.y, 140)) if ((n.x - j.x) ** 2 + (n.y - j.y) ** 2 < (n.r * .85) ** 2) { hit = true; break; }
    const by = { x: j.x - j.vx * .05, y: j.y - j.vy * .05, id: j.owner, owner: j.owner };
    const it = j.item ? item(j.item) : null;
    if (!hit) for (const s of world.structures) {
      if (s.owner === j.owner || !SOLID.has(kindOf(s))) continue;
      if ((s.x - j.x) ** 2 + (s.y - j.y) ** 2 < s.r ** 2) { hitStructure(world, s, it?.bdm || 2, by); hit = true; break; }
    }
    if (!hit) for (const t of [...Object.values(world.players), ...world.animals]) {
      if (t.dead || t.hp <= 0 || t.id === j.owner || j.boss && !t.items && !t.owner) continue;
      if ((t.x - j.x) ** 2 + (t.y - j.y) ** 2 >= (t.r + j.r) ** 2) continue;
      hit = true;
      projectileHit(world, j, it, t, by);
      break;
    }
    if (!hit) keep.push(j);
  }
  world.projectiles = keep;
}

function projectileHit(world, j, it, t, by) {
  const shooter = world.players[j.owner];
  // taming tools: matching tool on a sleeping wild baby raises the tame chance
  if (it?.tameTool && t.sleep && !t.owner) {
    const def = PET_BY_ID.get(t.species);
    if (def.tool === it.tameTool) {
      const reset = world.random() < (it.safer ? .025 : .05);
      t.bonus = reset ? 0 : (t.bonus || 0) + 1;
      t.wakeAt = Math.max(t.wakeAt, world.time + 6);
      emit(world, { k: 'bonus', id: t.id, x: t.x, y: t.y - t.r, bonus: t.bonus, reset, to: j.owner });
    } else emit(world, { k: 'msg', to: j.owner, text: `${def.name} needs the ${def.tool === 'appletor' ? 'Appletor' : 'Slingshot'}` });
    return;
  }
  if (it?.healPet && (t.owner === j.owner || t.id === j.owner)) { heal(world, t, t.items ? it.healPlayer : it.healPet); return; }
  if (it?.healPet) { if (t.items) heal(world, t, it.healPlayer); else heal(world, t, it.healPet); return; }
  if (t.owner === j.owner) return;
  const dmg = j.dmg ?? (t.items ? it?.dmg : it?.adm) ?? 10;
  const dealt = hurt(world, t, dmg, by, { knock: j.kind === 'fireball' ? 40 : 20, kind: j.kind === 'fireball' ? 'burn' : 'hit' });
  if (j.kind === 'fireball' && t.items && dealt) t.burn = 3;
  if (shooter && dealt) for (const id of shooter.pets) { const a = world.animals.find(x => x.id === id); if (a && a.mode !== 'stop' && !t.boss) a.target = t.owner ? t.owner : t.id; }
}

// Volcano meteors: a warning circle, then a heavy impact, near whoever is in the volcano.
function updateHazards(world, dt) {
  if (world.time > world.meteorAt) {
    world.meteorAt = world.time + 2.5 + world.random() * 3;
    const living = Object.values(world.players).filter(p => !p.dead && biomeAt(p.x, p.y).meteors);
    if (living.length) {
      const p = living[Math.floor(world.random() * living.length)];
      const ang = world.random() * TAU, d = world.random() * 500;
      world.hazards.push({ id: `h${world.nextId++}`, kind: 'meteor', x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, r: 110, at: world.time + 1.6 });
    }
  }
  const keep = [];
  for (const h of world.hazards) {
    if (world.time < h.at) { keep.push(h); continue; }
    for (const t of [...Object.values(world.players), ...world.animals]) {
      if (t.dead || t.boss || t.sleep) continue;
      if ((t.x - h.x) ** 2 + (t.y - h.y) ** 2 < (h.r + t.r * .5) ** 2) hurt(world, t, 80, { x: h.x, y: h.y }, { kind: 'burn', knock: 120 });
    }
    emit(world, { k: 'impact', x: h.x, y: h.y });
  }
  world.hazards = keep;
}

// ---------------- bots ----------------

function botThink(world, p) {
  const inp = p.input;
  if (p.choices.length) {
    const offer = currentOffer(p);
    const pick = offer.find(id => /sword|axe|katana|spear/.test(id)) || offer.find(id => item(id).slot === 'windmill') || offer[Math.floor(world.random() * offer.length)];
    if (pick) choose(world, p, pick); else p.choices.shift();
  }
  p.brainAt ??= 0;
  if (world.time < p.brainAt) { if (p.goal) aimAndMove(p, p.goal, p.goalRange || 0); return; }
  p.brainAt = world.time + .25 + world.random() * .25;
  const sel = slot => Math.max(0, p.items.findIndex(id => item(id).slot === slot));
  inp.attack = false;
  if (p.hp < p.maxHp * .6 && p.res.food >= 5) { inp.sel = sel('food'); inp.attack = true; p.goal = null; inp.mx = inp.my = 0; return; }
  // fight weaker players nearby, avoid stronger ones
  let foe = null, fd = 380 ** 2;
  for (const o of Object.values(world.players)) {
    if (o === p || o.dead || world.time < o.shieldUntil) continue;
    const d = dist2(o, p); if (d < fd) { fd = d; foe = o; }
  }
  if (foe && world.time > p.shieldUntil) {
    if (p.age >= foe.age && p.hp > p.maxHp * .5) {
      inp.sel = sel('primary'); p.goal = foe; p.goalRange = 30; inp.attack = Math.sqrt(fd) < p.r + foe.r + (item(p.items[sel('primary')]).range || 20) + 10;
      aimAndMove(p, foe, 30); return;
    }
    if (p.hp < p.maxHp * .5) { p.goal = { x: p.x * 2 - foe.x, y: p.y * 2 - foe.y }; p.goalRange = 0; aimAndMove(p, p.goal, 0); return; }
  }
  const baby = tameTarget(world, p);
  if (baby && p.pets.length < MAX_PETS && world.random() < .5) { command(world, p.id, { t: 'tame' }); }
  // bots go looking for a sleeping baby until they have a companion
  if (!p.pets.length && !baby) {
    let best = null, bd = 900 ** 2;
    for (const a of world.animals) if (a.sleep && !a.owner && !a.boss) { const d = dist2(a, p); if (d < bd) { bd = d; best = a; } }
    if (best) { p.goal = best; p.goalRange = best.r + 30; aimAndMove(p, best, best.r + 30); return; }
  }
  if (p.pets.length && world.random() < .1) command(world, p.id, { t: 'skill' });
  const mills = world.structures.filter(s => s.owner === p.id && item(s.item).kind === 'windmill').length;
  const mill = item(p.items[sel('windmill')]);
  if (mill?.kind === 'windmill' && mills < 5 && canAfford(p, mill.cost) && world.random() < .35) { inp.sel = sel('windmill'); inp.attack = true; inp.angle = world.random() * TAU; p.goal = null; inp.mx = inp.my = 0; return; }
  const spike = item(p.items[sel('spike')]);
  if (spike?.kind === 'spike' && mills >= 2 && canAfford(p, spike.cost) && world.random() < .06) { inp.sel = sel('spike'); inp.attack = true; inp.angle = world.random() * TAU; return; }
  const want = p.res.food < 30 ? 'food' : p.res.stone < 40 ? 'stone' : p.res.wood < 80 ? 'wood' : world.random() < .5 ? 'gold' : 'wood';
  let node = null, nd = Infinity;
  for (const n of nearbyResources(world, p.x, p.y, 1000)) {
    if (n.type === 'cactus') continue;
    const d = dist2(n, p) * (RESOURCE_TYPES[n.type].yields === want ? 1 : 4);
    if (d < nd) { nd = d; node = n; }
  }
  inp.sel = sel('primary');
  if (!node) { p.goal = { x: clamp(p.x + (world.random() - .5) * 1400, 200, WORLD.w - 200), y: clamp(p.y + (world.random() - .5) * 1400, 200, WORLD.h - 200) }; p.goalRange = 20; return; }
  p.goal = node; p.goalRange = node.r + 10;
  inp.attack = dist(p, node) < node.r + p.r + 40;
  aimAndMove(p, node, node.r + 10);
}
function aimAndMove(p, goal, range) {
  const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1;
  p.input.angle = Math.atan2(dy, dx);
  if (d > range + p.r) { p.input.mx = dx / d; p.input.my = dy / d; } else { p.input.mx = 0; p.input.my = 0; }
}

export function fillBots(world, count) {
  const have = Object.values(world.players).filter(p => p.bot).length;
  for (let i = have; i < count; i++) {
    addPlayer(world, { id: `b${world.nextId++}`, name: BOT_NAMES[i % BOT_NAMES.length], bot: true, skin: (i + 1) % 8 });
  }
}

// ---------------- network views ----------------
// Compact array encodings keep snapshots small. decode* lives here too so the
// client and server can never disagree on field order.

const R = v => Math.round(v);
const A = v => Math.round(v * 100) / 100;
const T = v => Math.round(v * 100) / 100;

export function encodePlayer(p) {
  return [p.id, p.name, p.skin, p.hat, R(p.x), R(p.y), A(p.angle), Math.ceil(p.hp), p.maxHp, p.dead ? 1 : 0, p.age, R(p.res.gold), p.held, T(p.actionAt), T(p.hitAt), T(p.shieldUntil), p.pets.length, p.bot ? 1 : 0, T(p.trappedUntil)];
}
export function decodePlayer(r) {
  return { id: r[0], name: r[1], skin: r[2], hat: r[3], x: r[4], y: r[5], angle: r[6], hp: r[7], maxHp: r[8], dead: !!r[9], age: r[10], gold: r[11], held: r[12], actionAt: r[13], hitAt: r[14], shieldUntil: r[15], petCount: r[16], bot: !!r[17], trappedUntil: r[18], r: PLAYER_R };
}
export function encodeAnimal(a) {
  return [a.id, a.species, a.boss || 0, R(a.x), R(a.y), A(a.angle), Math.ceil(a.hp), a.maxHp, a.stage, a.sleep ? 1 : 0, a.owner || 0, a.moving ? 1 : 0, T(a.attackAt), T(a.hitAt), a.r, a.bonus || 0, a.mode || 0, T(a.skillAt ?? -99), a.angry ? 1 : 0, R(a.xp || 0), a.level || 1];
}
export function decodeAnimal(r) {
  return { id: r[0], species: r[1], boss: r[2] || null, x: r[3], y: r[4], angle: r[5], hp: r[6], maxHp: r[7], stage: r[8], sleep: !!r[9], owner: r[10] || null, moving: !!r[11], attackAt: r[12], hitAt: r[13], r: r[14], bonus: r[15], mode: r[16] || 'defend', skillAt: r[17], angry: !!r[18], xp: r[19], level: r[20] || 1 };
}
export function encodeStructure(s) { return [s.id, s.item, s.x, s.y, s.r, A(s.rot), R(s.hp), s.maxHp, s.owner, A(s.aim || 0), T(s.hitAt ?? -9), T(s.shotAt ?? -9)]; }
export function decodeStructure(r) { return { id: r[0], item: r[1], x: r[2], y: r[3], r: r[4], rot: r[5], hp: r[6], maxHp: r[7], owner: r[8], aim: r[9], hitAt: r[10], shotAt: r[11] }; }
export function encodeProjectile(j) { return [j.id, R(j.x), R(j.y), R(j.vx), R(j.vy), j.kind]; }
export function decodeProjectile(r) { return { id: r[0], x: r[1], y: r[2], vx: r[3], vy: r[4], kind: r[5] }; }

const inView = (e, c, pad = 0) => Math.abs(e.x - c.x) < VIEW.w + pad && Math.abs(e.y - c.y) < VIEW.h + pad;
export function snapshot(world, selfId) {
  const me = world.players[selfId];
  const c = me || { x: CENTER.x, y: CENTER.y };
  return {
    t: 'snap', time: T(world.time),
    me: me ? { xp: Math.floor(me.xp), res: { wood: me.res.wood, stone: me.res.stone, food: me.res.food, gold: me.res.gold }, items: me.items, sel: me.sel, choices: me.choices, hats: me.hats, pets: me.pets, kills: me.kills, tames: me.tames, cd: T(me.cd), fx: [me.poison > 0, me.burn > 0, me.slowUntil > world.time, me.armorUntil > world.time, me.hasteUntil > world.time], lastHitBy: me.lastHitBy,
      // for prediction: the last input applied, the velocity after it, and the current top speed
      seq: me.seq || 0, v: [A(me.vx), A(me.vy)], spd: A(moveSpeed(world, me, item(me.items[me.sel]) || item('hand'))) } : null,
    p: Object.values(world.players).filter(p => p.id === selfId || inView(p, c, 200)).map(encodePlayer),
    a: world.animals.filter(a => !a.dead && (a.owner === selfId || inView(a, c, a.r + 100))).map(encodeAnimal),
    s: world.structures.filter(s => inView(s, c, 120)).map(encodeStructure),
    j: world.projectiles.filter(j => inView(j, c, 200)).map(encodeProjectile),
    h: world.hazards.map(h => [h.id, R(h.x), R(h.y), h.r, T(h.at)]),
    boss: world.animals.filter(a => a.boss && !a.dead).map(a => [R(a.x), R(a.y), Math.round(a.hp / a.maxHp * 100) / 100, a.boss, a.sleep ? 1 : 0]),
  };
}
export function leaderboard(world) {
  return Object.values(world.players).filter(p => !p.dead).sort((a, b) => b.res.gold - a.res.gold || b.age - a.age).slice(0, 10)
    .map(p => [p.id, p.name, R(p.res.gold), p.age, p.kills, R(p.x), R(p.y)]);
}
export function topKiller(world) {
  let best = null;
  for (const p of Object.values(world.players)) if (p.kills > 0 && (!best || p.kills > best.kills)) best = p;
  return best?.id || null;
}
