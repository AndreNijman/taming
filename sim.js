// Authoritative game simulation shared by solo play (in the browser) and the
// multiplayer Durable Object. Pure data in, pure data out: no DOM, no sockets.
import {
  WORLD, CENTER, BIOMES, BIOME_GRID, BIOME_CELL, biomeAt, biomeCells, RESOURCE_TYPES, NODES_PER_CELL, ITEM_BY_ID, STARTING_ITEMS, START_RESOURCES, TAME_FOOD,
  SLOT_ORDER, BUILD_LIMIT, PETS, PET_BY_ID, PET_XP, MAX_PETS, BOSSES, BOSS_BY_ID, HAT_BY_ID, ACCESSORY_BY_ID, SKILLS,
  xpForAge, totalXp, biomeState, MAX_AGE, LAST_CHOICE_AGE, ageChoices, typeMultiplier,
} from './data.js';

import { abilityStats, abilityCooldown, castAbility, updateAbility, abilityProjectileHit, abilityHazardTick, abilityBlocksProjectile } from './pet-abilities.js';
import { accessory, equippedHat, statusImmune, incomingMultiplier, outgoingMultiplier, weaponMultiplier, rangedMultiplier, updateEffects } from './equipment.js';

export const PLAYER_R = 35;
export const BASE_SPEED = 340;
export const TICK = 1 / 20;
const TAU = Math.PI * 2;
const SPAWN_SHIELD = 5;
export const VIEW = { w: 3200, h: 2000 }; // half extents of what a client can see

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
// locally; snapshots carry durability changes and dynamic chests. Each season
// uses its own mix; rocks often come as a big and a small one side by side.
export function generateResources(seed, biomeId = 'forest') {
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
  BIOME_GRID.forEach((row, j) => row.forEach((_, i) => {
    const id = biomeId;
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
        if (fits(x2, y2, r2, 0)) { const m = { id: `r${list.length}`, type, x: x2, y: y2, r: r2, biome: id }; list.push(m); add(m); }
      }
    }
  }));
  for (let i=0;i<32;i++) {
    const n={id:`insect${i}`,type:'insect',x:Math.round(160+random()*(WORLD.w-320)),y:Math.round(160+random()*(WORLD.h-320)),r:12,biome:biomeId};list.push(n);add(n);
  }
  for (const n of list) { n.hp = RESOURCE_TYPES[n.type].hp; n.respawnAt = 0; }
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
    events: [], nextId: 1, random: rng(seed | 0), meteorAt: 0, bossAt: {}, activeEvent: opts.event || null,
  };
  world.biome = biomeState(world.time).biome.id;
  const res = generateResources(world.seed, world.biome);
  world.resources = res.list;
  Object.defineProperty(world, 'grid', { value: res, enumerable: false, configurable: true });
  for (const def of PETS.filter(d => d.biome === world.biome && !d.bossOnly)) {
    const n = POPULATION[def.rarity];
    for (let i = 0; i < n; i++) spawnAnimal(world, def, i % 6 === 5 ? 2 : i % 3 === 2 ? 1 : 0);
  }
  spawnBoss(world, BOSS_BY_ID.get(biomeState(world.time).biome.boss));
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
    id, name: String(name || 'Tamer').slice(0, 16), bot, skin, hat: 'none', hats: ['none'], wings: 'none', accessories: ['none'], upgrades: {},
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
  const spot = freeSpot(world, 60, 900);
  const retainedXp = p.dead ? Math.floor(totalXp(p.age, p.xp) * .4) : 0;
  const retainedItems = p.dead ? [...p.items] : null;
  const upgrades = p.upgrades || {}; p.upgrades = {};
  Object.assign(p, {
    x: spot.x, y: spot.y, vx: 0, vy: 0, dead: false, hp: 100, maxHp: 100, age: 0, xp: 0, kills: 0, tames: 0,
    res: { ...START_RESOURCES }, items: [...STARTING_ITEMS], sel: 0, held: STARTING_ITEMS[0], choices: [], cd: 0,
    trappedUntil: 0, slowUntil: 0, poison: 0, burn: 0, hot: 0, armorUntil: 0, hasteUntil: 0, mounted: null, blindUntil: 0, boostUntil: 0, buildBlockedUntil: 0, skillBlockedUntil:0, attackBlockedUntil:0, shieldLink:null, effects:[],
    shieldUntil: world.time + SPAWN_SHIELD, lastHitBy: null,
  });
  if (retainedXp) {
    gainXp(world, p, retainedXp);
    // Replay only choices available by the retained age. Higher upgrades must be earned again.
    for (let age = 1; age <= p.age; age++) {
      const offer = ageChoices(age, p.items);
      const old = retainedItems.map(item).find(it => offer.includes(it.id));
      const preferred = offer.includes(upgrades[age]) ? upgrades[age] : old?.id || offer.find(id => retainedItems.some(prev => {
        const want = item(prev), candidate = item(id);
        return want.slot === candidate.slot && (!candidate.family || candidate.family === want.family) && (!candidate.shape || candidate.shape === want.shape);
      }));
      if (preferred) { p.upgrades[age] = preferred; const ix = p.choices.indexOf(age); if (ix >= 0) p.choices.splice(ix, 1); const slot = item(preferred).slot; const at = p.items.findIndex(id => item(id).slot === slot); if (at >= 0) p.items[at] = preferred; else p.items.push(preferred); }
    }
    p.items.sort((a,b) => SLOT_ORDER.indexOf(item(a).slot) - SLOT_ORDER.indexOf(item(b).slot));
    p.held = p.items[0];
  }
  p.attackHeld = false; p.pendingUse = null;
  // pets come back with their tamer
  for (const id of p.pets) {
    const a = world.animals.find(x => x.id === id);
    if (a) { a.x = p.x - 60; a.y = p.y + 40; a.hp = a.maxHp; a.target = null; a.lockedTarget = null; a.post = null; a.mode = 'defend'; a.dead = false; }
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
  if (!p || !cmd || p.dead && cmd.t !== 'respawn') return;
  switch (cmd.t) {
    case 'choose': choose(world, p, String(cmd.id || '')); break;
    case 'tame': tryTame(world, p); break;
    case 'eat': eat(world, p); break;
    case 'respawn': if (p.dead && world.time - p.deadAt > 1.2) spawnPlayer(world, p); break;
    case 'skill': petSkills(world, p, Number.isInteger(cmd.slot) ? cmd.slot : -1, Number.isFinite(cmd.x) && Number.isFinite(cmd.y) ? {x:cmd.x,y:cmd.y} : null); break;
    case 'pets': petCommand(world, p, cmd); break;
    case 'hat': buyHat(world, p, String(cmd.id || '')); break;
    case 'accessory': { const a=ACCESSORY_BY_ID.get(cmd.id); if (!a) break; if (!p.accessories.includes(a.id)) { if(p.res.gold<a.cost) break; p.res.gold-=a.cost;p.accessories.push(a.id); } p.wings=a.id; break; }
    case 'release': {
      const a = world.animals.find(x => x.id === cmd.id && x.owner === p.id);
      if (a) { p.pets = p.pets.filter(x => x !== a.id); if(p.mounted===a.id)p.mounted=null; a.owner = null; a.target = null; a.lockedTarget = null; a.post = null; a.mode = 'defend'; a.sleep = false; a.bonus = 0; a.state = 'wander'; a.home = { x: a.x, y: a.y }; }
      break;
    }
  }
}

function emit(world, e) { world.events.push(e); }

function choose(world, p, itemId) {
  if (!p.choices.length) return;
  const offer = currentOffer(p);
  if (!offer.includes(itemId)) return;
  p.upgrades ||= {}; p.upgrades[p.choices[0]] = itemId;
  const selectedSlot = item(p.items[p.sel])?.slot;
  const it = item(itemId);
  const at = p.items.findIndex(id => item(id)?.slot === it.slot);
  if (at >= 0) p.items[at] = itemId; else p.items.push(itemId);
  p.items.sort((a, b) => SLOT_ORDER.indexOf(item(a).slot) - SLOT_ORDER.indexOf(item(b).slot));
  p.sel = Math.max(0, p.items.findIndex(id => item(id)?.slot === selectedSlot));
  p.input.sel = p.sel;
  p.held = p.items[p.sel];
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
  if (food.hot) {p.hot=food.hot*6;p.hotPerTick=food.hot;}
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
  if (!hat || hat.event && world.activeEvent !== hat.event) return;
  if (!p.hats.includes(hatId)) {
    if (p.res.gold < hat.cost) { emit(world, { k: 'msg', to: p.id, text: `${hat.name} costs ${hat.cost} gold` }); return; }
    p.res.gold -= hat.cost; p.hats.push(hatId);
  }
  p.hat = hatId;
}
const hat = p => equippedHat(p, p.simTime ?? 0);
const combatApi = { hurt, heal, hitStructure, emit, collide, hat, statusImmune, outgoingMultiplier };

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
  return Math.max(0, Math.min(95, (def.tame + (a.bonus || 0)) * (hat(p).tame || 1)));
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
    a.sleep = false; a.bonus = 0; a.angry = true; a.state = 'chase'; a.target = p.id;
    a.sleepAt = world.time + 40; a.contactSince = null;
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
  const owner = world.players[a.owner]; amt *= owner ? hat(owner).petXp || 1 : 1;
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

// A season changes the entire map. Visible wildlife stays until it leaves all players' views.
function visibleToPlayer(world, a) {
  return Object.values(world.players).some(p => !p.dead && !p.bot && Math.abs(p.x-a.x) < VIEW.w+a.r+250 && Math.abs(p.y-a.y) < VIEW.h+a.r+250);
}
function updateBiome(world) {
  const current = biomeState(world.time).biome;
  if (world.biome === current.id) return;
  world.biome = current.id;
  const res = generateResources(world.seed, current.id);
  world.resources = res.list;
  Object.defineProperty(world, 'grid', { value: res, enumerable: false, configurable: true });
  world.animals = world.animals.filter(a => a.owner || !a.dead && visibleToPlayer(world, a));
  for (const def of PETS.filter(d => d.biome === current.id && !d.bossOnly)) {
    const have = world.animals.filter(a => !a.owner && !a.dead && a.species === def.id).length;
    for (let i = have; i < POPULATION[def.rarity]; i++) spawnAnimal(world, def, i % 6 === 5 ? 2 : i % 3 === 2 ? 1 : 0);
  }
  if (!world.animals.some(a => a.boss === current.boss && !a.dead)) spawnBoss(world, BOSS_BY_ID.get(current.boss));
  for (const e of [...Object.values(world.players), ...world.animals]) if (!e.dead) collide(world, e, true);
  emit(world, { k: 'season', biome: current.id });
}
function roam(world, a, center, radius) {
  if (!a.wanderGoal || world.time >= a.wanderAt || dist(a.wanderGoal, center) > radius*1.5) {
    a.wanderAt = world.time + 2 + world.random()*3;
    const angle = world.random()*TAU, d = radius*(.3 + world.random()*.7);
    a.wanderGoal = { x: clamp(center.x + Math.cos(angle)*d, a.r, WORLD.w-a.r), y: clamp(center.y + Math.sin(angle)*d, a.r, WORLD.h-a.r) };
  }
  return dist(a, a.wanderGoal) > 15 ? a.wanderGoal : null;
}
function biteReady(world, a, target) {
  if (dist(a, target) >= a.r + target.r + 16) { a.contactSince = null; a.contactTarget = null; return false; }
  if (a.contactTarget !== target.id || a.contactSince == null) { a.contactTarget = target.id; a.contactSince = world.time; }
  return world.time - a.contactSince >= .35 && world.time >= a.cd;
}

// Bounded A* around inflated obstacles; cached routes are shared by bot and animal steering.
export function navigationGoal(world, e, goal) {
  if (!goal) return null;
  if (e.navPoint && world.time < e.navAt && dist(e.navPoint,e)>20 && dist(e.navTarget,goal)<80) return e.navPoint;
  const remember = point => { e.navPoint = point; e.navTarget = {x:goal.x,y:goal.y}; e.navAt = world.time + .25; return point; };
  const clear = (a,b) => {
    const d = dist(a,b), n = Math.ceil(d/35);
    for (let i=1; i<=n; i++) if (solidAt(world,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,e.r+3)) return false;
    return true;
  };
  let destination = goal;
  if (solidAt(world,goal.x,goal.y,e.r+3)) {
    const angle = Math.atan2(e.y-goal.y,e.x-goal.x), r = (goal.r || 45) + e.r + 12;
    for (let i=0; i<16; i++) { const a=angle + (i%2 ? 1 : -1)*Math.ceil(i/2)*Math.PI/8; const q={x:goal.x+Math.cos(a)*r,y:goal.y+Math.sin(a)*r}; if (!solidAt(world,q.x,q.y,e.r+3)) { destination=q; break; } }
  }
  if (clear(e,destination)) { e.route=null; return remember(destination); }
  if (e.route && world.time < e.routeAt && dist(e.routeEnd,destination)<100) {
    while (e.route.length && dist(e,e.route[0])<40) e.route.shift();
    if (e.route.length && clear(e,e.route[0])) return remember(e.route[0]);
  }
  const cell=80, sx=Math.round(e.x/cell), sy=Math.round(e.y/cell), gx=Math.round(destination.x/cell), gy=Math.round(destination.y/cell);
  const key=(x,y)=>`${x},${y}`, heuristic=(x,y)=>Math.hypot(x-gx,y-gy);
  const first={x:sx,y:sy,g:0,f:heuristic(sx,sy),parent:null}, open=[first], seen=new Map([[key(sx,sy),first]]), closed=new Set(), occupancy=new Map();
  let best=first, found=null;
  const walkable=(x,y)=>{ const k=key(x,y); if (!occupancy.has(k)) occupancy.set(k,x*cell>e.r && y*cell>e.r && x*cell<WORLD.w-e.r && y*cell<WORLD.h-e.r && !solidAt(world,x*cell,y*cell,e.r+8)); return occupancy.get(k); };
  for (let iter=0;open.length && iter<1600;iter++) {
    let at=0; for (let i=1;i<open.length;i++) if(open[i].f<open[at].f) at=i;
    const n=open.splice(at,1)[0], k=key(n.x,n.y); if(closed.has(k)) continue; closed.add(k);
    if(heuristic(n.x,n.y)<heuristic(best.x,best.y)) best=n;
    if(Math.hypot(n.x*cell-destination.x,n.y*cell-destination.y)<100) { found=n; break; }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const x=n.x+dx,y=n.y+dy,k2=key(x,y); if(closed.has(k2) || Math.abs(x-sx)>22 || Math.abs(y-sy)>22 || !walkable(x,y) || dx&&dy&&(!walkable(n.x+dx,n.y)||!walkable(n.x,n.y+dy))) continue;
      const g=n.g+Math.hypot(dx,dy); if(seen.has(k2)&&seen.get(k2).g<=g) continue;
      const q={x,y,g,f:g+heuristic(x,y),parent:n}; seen.set(k2,q);open.push(q);
    }
  }
  const path=[]; for(let n=found||best;n&&n.parent;n=n.parent) path.unshift({x:n.x*cell,y:n.y*cell});
  while(path.length>1 && clear(e,path[1])) path.shift();
  e.route=path;e.routeAt=world.time+1.2;e.routeEnd={x:destination.x,y:destination.y};
  return remember(path[0] || destination);
}

// ---------------- collision ----------------

export function nearbyResources(world, x, y, range) {
  const { grid, cell } = world.grid;
  const out = [];
  const c0 = Math.floor((x - range) / cell), c1 = Math.floor((x + range) / cell);
  const r0 = Math.floor((y - range) / cell), r1 = Math.floor((y + range) / cell);
  for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
    const list = grid.get(`${i},${j}`);
    if (list) for (const n of list) if (!n.respawnAt) out.push(n);
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
  for (const n of nearbyResources(world, x, y, r + 140)) if (RESOURCE_TYPES[n.type].solid !== false && (n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + r) ** 2) return true;
  for (const s of world.structures) if (SOLID.has(kindOf(s)) && (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + r) ** 2) return true;
  return false;
}

// `harmless` is for client prediction, which moves like the server but never deals damage
function collide(world, e, harmless = false) {
  for (const n of nearbyResources(world, e.x, e.y, e.r + 140)) {
    if (RESOURCE_TYPES[n.type].solid === false) continue;
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
  if(!e.boss)for(const boss of world.animals||[])if(boss.boss&&!boss.dead)pushOut(e,boss,boss.r);
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
  if (t.dead || t.hp <= 0 || world.time < (t.invulnerableUntil || 0)) return 0;
  if (t.shieldUntil && world.time < t.shieldUntil && !t.owner) return 0;
  if (by && friendly(t, by)) return 0;
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  let dmg = amt * incomingMultiplier(world,t,by,opts) * outgoingMultiplier(world,by,opts);
  if (t.shieldLink && amt < t.maxHp) { const clone=world.animals.find(a=>a.id===t.shieldLink && a.decoy && !a.dead && a.expiresAt>world.time); if(clone) { hurt(world,clone,amt,by,{...opts,redirected:true});return 0; } t.shieldLink=null; }
  if(t.mountBuff==='turtle') dmg *= .7;
  else if(t.owner && world.players[t.owner]?.mounted===t.id && !opts.skill && !by?.species && opts.kind!=='spike') dmg *= 2.5;
  if (opts.element && t.species) { const types = t.boss ? BOSS_BY_ID.get(t.boss).types : PET_BY_ID.get(t.species).types; dmg *= typeMultiplier(opts.element, types); }
  if (t.items) {
    if (t.armorUntil > world.time) dmg *= 1 - t.armor;
    if (hat(t).armor) dmg *= 1 - hat(t).armor;
    if ((hat(t).allBiomes || hat(t).biome === world.biome) && hat(t).biomeArmor) dmg *= 1 - hat(t).biomeArmor;
    const held = item(t.held);
    if ((held?.block || held?.skillBlock) && by) {
      const ang = Math.atan2(by.y - t.y, by.x - t.x);
      if (Math.abs(angleDiff(t.angle, ang)) < 1.1) dmg *= 1 - (opts.skill ? held.skillBlock || held.block : held.block);
    }
  }
  dmg = Math.max(1, Math.round(dmg));
  t.hp -= dmg;
  t.hitAt = world.time;
  t.lastHurtAt = world.time;
  const kb = opts.kb ?? 1;
  if (by && kb && !t.boss && !statusImmune(world,t,opts.element,by,'push')) {
    const ang = Math.atan2(t.y - by.y, t.x - by.x), push = (opts.knock ?? 70) * 12 * kb * (t.items ? 1 / (hat(t).weight || 1) : .6);
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
  if (a.decoy) { world.animals = world.animals.filter(x=>x!==a); return; }
  if (a.owner) {
    const owner = world.players[a.owner];
    if (owner) { owner.pets = owner.pets.filter(id => id !== a.id); if(owner.mounted===a.id)owner.mounted=null; }
    emit(world, { k: 'petdied', owner: a.owner, species: a.species, x: a.x, y: a.y });
    world.animals = world.animals.filter(x => x !== a);
    if (killer) gainXp(world, killer, [50, 100, 400][a.stage] * (hat(killer).killXp || 1));
    return;
  }
  if (a.boss) {
    const def = BOSS_BY_ID.get(a.boss);
    const total = Object.values(a.dmgBy).reduce((n, v) => n + v, 0) || 1;
    for (const [pid, d] of Object.entries(a.dmgBy)) {
      const p = world.players[pid]; if (!p || p.dead) continue;
      const share = d / total;
      gainXp(world, p, Math.round(def.xp * share));sharePetXp(world,p.id,Math.round(def.xp*share),a.x,a.y);
    }
    if(killer){gainGold(killer,def.gold);killer.res.food+=def.food;}
    const pool = def.drops.map(id=>PET_BY_ID.get(id));
    for (let i = 0; i < 3; i++) {
      const baby = spawnAnimal(world, pool[i % pool.length], 0, { x: a.x + Math.cos(i * 2.1) * 140, y: a.y + Math.sin(i * 2.1) * 140 });
      baby.sleep = true; baby.wakeAt = world.time + 60; baby.bonus = 10;
    }
    for (let i=0;i<3;i++) {
      const n = { id: `chest${world.nextId++}`, type: 'chest', x: Math.round(a.x + Math.cos(i*TAU/3)*220), y: Math.round(a.y + Math.sin(i*TAU/3)*220), r: 35, hp: 60, goldRemaining:def.chestGold, bossChest:true, respawnAt: 0, biome: world.biome };
      world.resources.push(n); const k = `${Math.floor(n.x/world.grid.cell)},${Math.floor(n.y/world.grid.cell)}`;
      if (!world.grid.grid.has(k)) world.grid.grid.set(k, []); world.grid.grid.get(k).push(n);
    }
    emit(world, { k: 'boss', by: killer?.id, byName: killer?.name, name: def.name, x: a.x, y: a.y });
    world.animals = world.animals.filter(x => x !== a);
    world.bossAt[def.id] = world.time + BOSS_RESPAWN;
    return;
  }
  if (killer) {
    // big wild animals are the early game's paycheque
    gainXp(world, killer, [50, 100, 400][a.stage] * (hat(killer).killXp || 1));
    gainGold(killer, [5, 40, 400][a.stage]);
    killer.res.food += Math.round([8, 20, 60][a.stage] * (hat(killer).killFood || 1));
  }
  // pets that helped grow from the kill
  if (ownerOf(by)) sharePetXp(world, ownerOf(by), [120, 270, 900][a.stage], a.x, a.y);
  emit(world, { k: 'kill', id: a.id, x: a.x, y: a.y, species: a.species });
  a.respawnAt = world.time + 20;
}

function hitStructure(world, s, dmg, by) {
  s.hp -= dmg; s.hitAt = world.time;
  emit(world, { k: 'dmg', id: s.id, x: s.x, y: s.y - s.r, amt: Math.round(dmg), kind: 'struct' });
  if (s.defenseUntil > world.time) s.hp += dmg * (s.defense || 0);
  if (s.hp <= 0) {
    const p=world.players[ownerOf(by)];if(p)for(const [r,cost]of Object.entries(item(s.item)?.cost||{}))p.res[r]+=Math.floor(cost*.5*(hat(p).salvage||1));
    destroyStructure(world, s);
  }
}
function destroyStructure(world, s) {
  world.structures = world.structures.filter(x => x !== s);
  emit(world, { k: 'break', x: s.x, y: s.y, item: s.item });
}

function petDamageVs(a, t) {
  const def = PET_BY_ID.get(a.species);
  const tdef = t.boss ? BOSS_BY_ID.get(t.boss) : t.species ? PET_BY_ID.get(t.species) : null;
  const m = tdef ? typeMultiplier(def.types, tdef.types) : 1;
  return { mult: (m || 1) * (a.mountBuff === 'battle' ? 1.2 : 1) };
}

// One melee swing: everything inside the arc in front of the player is hit.
function swing(world, p, it) {
  const reach = p.r + it.range + (it.spin ? 65 : 0), arc = it.spin ? Math.PI : 1.0;
  const fx = p.x + Math.cos(p.angle) * reach * .5, fy = p.y + Math.sin(p.angle) * reach * .5;
  const inArc = (o, or) => {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d - or > reach) return false;
    if (it.spin) return true;
    return Math.abs(angleDiff(p.angle, Math.atan2(o.y - p.y, o.x - p.x))) < arc * .62 + Math.min(.9, or / Math.max(d, 1));
  };
  const bonus = hat(p).gather || {}, bag = accessory(p).gather || {};
  for (const n of nearbyResources(world, fx, fy, reach + 140)) {
    if (!inArc(n, n.r) || RESOURCE_TYPES[n.type].catchOnly) continue;
    const spec = RESOURCE_TYPES[n.type];
    let amt = Math.max(1, Math.round((it.harvest?.[spec.yields] || 1) * (spec.per || 1) + (bonus[spec.yields] || 0) + (bag[spec.yields] || 0)));
    if(n.type==='chest'&&n.goldRemaining!=null){amt=Math.min(amt,n.goldRemaining);n.goldRemaining-=amt;}
    if (spec.yields === 'gold') gainGold(p, amt); else p.res[spec.yields] += amt;
    gainXp(world, p, amt);
    if (spec.hp) {
      n.hp -= it.bdm || it.dmg || 4;
      if (n.hp <= 0) { if(n.type==='chest'){gainGold(p,n.goldRemaining||0);p.goldenApples=(p.goldenApples||0)+(hat(p).chestApple||0);} n.hp = 0; n.respawnAt = spec.respawn ? world.time + spec.respawn : Infinity; emit(world, { k: 'resourcebreak', id: n.id, x: n.x, y: n.y }); }
    }
    emit(world, { k: 'gather', id: n.id, by: p.id, res: spec.yields, amt, ang: p.angle, x: n.x, y: n.y });
  }
  const dmgMul = weaponMultiplier(world,p,it);
  const punchBonus = ['hand','gloves'].includes(it.family) ? hat(p).punchBonus || 0 : 0;
  let hitPlayer = null;
  const combo = target => {
    if(it.family!=='gloves')return;
    if(p.comboTarget===target.id && world.time-(p.comboAt||0)<2)p.comboCount++;else{p.comboTarget=target.id;p.comboCount=1;}
    p.comboAt=world.time;
    if(p.comboCount===5){p.comboCount=0;if(!statusImmune(world,target,'combat',p)){target.trappedUntil=world.time+1.5;target.skillBlockedUntil=world.time+1.5;target.attackBlockedUntil=world.time+1.5;target.cast=null;}}
  };
  for (const a of world.animals) {
    if (a.dead || a.owner === p.id || !inArc(a, a.r)) continue;
    hurt(world, a, ((it.family==='gloves'?it.dmg*1.4:it.adm || it.dmg) + punchBonus) * dmgMul, p, { knock: it.knock * (hat(p).knock || 1) });
    combo(a);
    if (a.owner) hitPlayer = hitPlayer || world.players[a.owner];
    else if (!a.boss) hitPlayer = hitPlayer || a;
  }
  for (const o of Object.values(world.players)) {
    if (o === p || o.dead || !inArc(o, o.r)) continue;
    hurt(world, o, (it.dmg + punchBonus) * dmgMul, p, { knock: it.knock * (hat(p).knock || 1) });
    combo(o); hitPlayer = o;
  }
  for (const s of world.structures) {
    if (!inArc(s, s.r)) continue;
    if (s.owner === p.id) {
      if (it.repair && s.hp < s.maxHp) { const before = s.hp; s.hp = Math.min(s.maxHp, s.hp + it.repair * (hat(p).repair || 1)); emit(world, { k: 'heal', id: s.id, x: s.x, y: s.y - s.r, amt: Math.round(s.hp - before) }); }
      if (it.repair) continue;
    }
    hitStructure(world, s, (it.bdm || 0) * dmgMul * (it.family === 'hammer' ? hat(p).hammerBuildings || 1 : 1), p);
  }
  // pets pile onto whatever their tamer just hit
  if (hitPlayer) for (const id of p.pets) { const a = world.animals.find(x => x.id === id); if (a && a.mode !== 'stop' && !a.lockedTarget) a.target = hitPlayer.id; }
}

function canAfford(p, cost) { return Object.entries(cost || {}).every(([k, v]) => p.res[k] >= v); }
function pay(p, cost) { for (const [k, v] of Object.entries(cost || {})) p.res[k] -= v; }

function shoot(world, p, it) {
  if (!canAfford(p, it.ammo)) { emit(world, { k: 'msg', to: p.id, text: `Needs ${Object.entries(it.ammo).map(([k, v]) => `${v} ${k}`).join(', ')}` }); return false; }
  pay(p, it.ammo);
  const angle = p.angle + (it.spread ? (world.random()-.5)*it.spread*2 : 0);
  const kind = it.shape === 'appletor' ? 'apple' : it.shape === 'slingshot' ? 'pebble' : 'arrow';
  world.projectiles.push({
    id: `j${world.nextId++}`, x: p.x + Math.cos(p.angle) * (p.r + 20), y: p.y + Math.sin(p.angle) * (p.r + 20),
    vx: Math.cos(angle) * it.projectile, vy: Math.sin(angle) * it.projectile, item: it.id, kind,
    owner: p.id, until: world.time + it.range / it.projectile, r: kind === 'arrow' ? 8 : 12,
  });
  return true;
}

function place(world, p, it) {
  if (SOLID.has(it.kind) && world.time < (p.buildBlockedUntil || 0)) return false;
  if (!canAfford(p, it.cost)) { emit(world, { k: 'msg', to: p.id, text: `Not enough resources for ${it.name}` }); return false; }
  const mine = world.structures.filter(s => s.owner === p.id);
  if (mine.length >= BUILD_LIMIT) { emit(world, { k: 'msg', to: p.id, text: 'Building limit reached' }); return false; }
  const same = mine.filter(s => item(s.item).kind === it.kind);
  if (same.length >= it.limit) { emit(world, { k: 'msg', to: p.id, text: `${it.name}: limit ${it.limit}` }); return false; }
  const d = placementDistance(p, it);
  const x = p.x + Math.cos(p.angle) * d, y = p.y + Math.sin(p.angle) * d;
  if (!placeable(world, x, y, it)) return false;
  pay(p, it.cost);
  const s = { id: `s${world.nextId++}`, item: it.id, x: Math.round(x), y: Math.round(y), r: it.r, rot: it.kind === 'boost' ? p.angle : 0, hp: it.hp, maxHp: it.hp, owner: p.id, cd: 0, aim: p.angle, born: world.time, decay: !!hat(p).decay };
  world.structures.push(s);
  for (const e of [...Object.values(world.players), ...world.animals]) if (!e.dead && !e.boss && blocks(s, e)) { pushOut(e, s, s.r); collide(world, e); }
  emit(world, { k: 'place', by: p.id, x: s.x, y: s.y, item: it.id });
  return true;
}
export const placementDistance = (p, it) => p.r + it.r - 6;
export function placeable(world, x, y, it) {
  if (x < it.r || y < it.r || x > WORLD.w - it.r || y > WORLD.h - it.r) return false;
  for (const n of nearbyResources(world, x, y, it.r + 140)) if (RESOURCE_TYPES[n.type].solid !== false && (n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + it.r - 4) ** 2) return false;
  for (const s of world.structures) {
    const box = (kindOf(s) === 'wall' || kindOf(s) === 'door') && (it.kind === 'wall' || it.kind === 'door');
    if (box ? Math.abs(s.x - x) < s.r + it.r - 2 && Math.abs(s.y - y) < s.r + it.r - 2 : (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + it.r - 4) ** 2) return false;
  }
  return true;
}

// ---------------- step ----------------

export function step(world, dt) {
  world.time += dt; world.tick++;
  for (const t of [...Object.values(world.players),...world.animals]) if (!t.dead) { t.simTime=world.time;updateEffects(world,t,dt,combatApi); }
  updateBiome(world);
  for (const n of world.resources) if (n.respawnAt && world.time >= n.respawnAt) {
    if (world.structures.some(b => dist(b,n)<b.r+n.r)) { n.respawnAt = world.time + 5; continue; }
    n.respawnAt = 0; n.hp = RESOURCE_TYPES[n.type].hp;
    for (const e of [...Object.values(world.players),...world.animals]) if (!e.dead) pushOut(e,n,n.r);
  }

  for (const [id, at] of Object.entries(world.bossAt)) if (world.time >= at && BOSS_BY_ID.get(id).biome === world.biome) { delete world.bossAt[id]; spawnBoss(world, BOSS_BY_ID.get(id)); }
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
  const mount = p.mounted && world.animals?.find(a => a.id === p.mounted && a.owner === p.id && !a.dead);
  let s = mount ? (petStats(PET_BY_ID.get(mount.species),mount.stage).speed + (item(p.saddle)?.mountBuff === 'racing' ? 15 : 0)) : BASE_SPEED * ((it?.speed ?? 100) / 100);
  if (world.time < p.slowUntil) s *= .55;
  s *= p.effectSpeed ?? 1;
  if (world.time < p.hasteUntil) s *= 1 + p.haste;
  const h = hat(p);
  s *= h.move || 1;
  if (h.slow) s *= 1 - h.slow;
  if (h.allBiomes || h.biome === world.biome) s *= h.biomeSpeed || 1.15;
  if (it?.catch) s *= h.netSpeed || 1;
  if (accessory(p).slow) s *= 1-accessory(p).slow;
  if(mount?.cast&&['spit','fire-blast'].includes(mount.cast.kind))s=Math.max(0,s+(abilityStats(mount).speed_bonus||0));
  if (mount?.cast && ['blaze','vines','ice-shield','glacier','rampart','burst','fire-ball','plant-ball','water-ball','lock','magma-heal'].includes(mount.cast.kind)) s=0;
  if (world.time < p.trappedUntil) s = 0;
  return s;
}

// One tick of a tamer's movement. The client runs the same step for its own tamer (prediction),
// against a mirror world of the resource grid and the structures it can see.
export function moveTamer(world, p, inp, speed, dt, harmless = false) {
  let mx = inp.mx, my = inp.my;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const boosting = !harmless && world.time < (p.boostUntil || 0);
  if (boosting) { p.vx = Math.cos(p.boostAngle) * (p.boostSpeed||1100); p.vy = Math.sin(p.boostAngle) * (p.boostSpeed||1100); }
  const slippery=p.effects?.some(e=>e.kind==='slippery'&&e.until>world.time);
  const accel = boosting ? 0 : 1 - Math.exp(-dt * (slippery?1.5:10));
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
  if(it.mount && p.previousSelected!==it.id && p.mounted){p.mounted=null;p.saddle=null;}
  p.previousSelected=it.id;
  // food eaten from a hotkey stays in hand for a moment, otherwise hold the selected item
  if (item(p.held)?.slot !== 'food' || world.time - p.actionAt > .35) p.held = it.id;
  p.angle = inp.angle;
  moveTamer(world, p, inp, moveSpeed(world, p, it), dt);
  // status effects tick every 0.5s
  if (world.tick % 10 === 0) {
    if (p.poison > 0) hurt(world, p, 4, null, { kind: 'poison', kb: 0 });
    if (p.burn > 0) hurt(world, p, 5, null, { kind: 'burn', kb: 0 });
    if (hat(p).regen) heal(world,p,hat(p).regen*.5);
    if (ACCESSORY_BY_ID.get(p.wings)?.regen) heal(world,p,ACCESSORY_BY_ID.get(p.wings).regen * .5);
    if (it.touch) for (const t of [...Object.values(world.players), ...world.animals]) if(t!==p && !t.dead && t.owner!==p.id && dist(p,t)<p.r+t.r+10) hurt(world,t,it.touch,p,{kb:0,kind:'spike'});
    if (p.hot > 0) { const h = Math.min(p.hot, p.hotPerTick || 2.5); p.hot -= h; heal(world, p, h); }
  }
  p.poison = Math.max(0, p.poison - dt); p.burn = Math.max(0, p.burn - dt);
  if (p.dead) return;
  const pressed = inp.attack && !p.attackHeld;
  p.attackHeld = inp.attack;
  const singleUse = it.kind || it.slot === 'food' || it.mount;
  if (!inp.attack || p.pendingUse !== it.id) p.pendingUse = null;
  if (pressed && singleUse) p.pendingUse = it.id;
  if (inp.attack && world.time >= (p.attackBlockedUntil || 0) && world.time >= p.cd && (!singleUse || p.pendingUse === it.id)) {
    p.pendingUse = null;
    // eat() checks and sets its own cooldown, so food must not start one first
    if (it.slot !== 'food') p.cd = world.time + (it.reload || .4);
    if (it.slot === 'food') { if (!eat(world, p)) p.cd = world.time + .2; }
    else if (it.kind) { if (place(world, p, it)) p.actionAt = world.time; else p.cd = world.time + .2; }
    else if (it.catch) {
      for (const n of nearbyResources(world,p.x,p.y,it.range+p.r)) if(n.type==='insect' && dist(n,p)<it.range+p.r) { n.hp=0;n.respawnAt=world.time+45/(hat(p).insectLuck||1);const catches=world.random()<(hat(p).duplicate||0)?2:1;gainXp(world,p,75*catches);gainGold(p,20*catches);p.insects=(p.insects||0)+catches;emit(world,{k:'gather',id:n.id,by:p.id,res:'gold',amt:20,ang:p.angle,x:n.x,y:n.y}); } p.actionAt=world.time;
    }
    else if (it.mount) {
      const mount = world.animals.find(a=>a.owner===p.id && a.stage===2 && PET_BY_ID.get(a.species).mountable && !a.dead && dist(a,p)<it.range);
      p.mounted=p.mounted?null:mount?.id || null;p.saddle=p.mounted?it.id:null;p.actionAt=world.time;
    }
    else if (it.ammo) { if (shoot(world, p, it)) p.actionAt = world.time; }
    else { swing(world, p, it); p.actionAt = world.time; p.punchHand = 1 - (p.punchHand || 0); }
    if (p.actionAt === world.time) p.shieldUntil = 0;
  }
}

// ---------------- animals ----------------

function updateAnimal(world, a, dt) {
  if (a.dead) {
    if (!a.owner && world.time >= a.respawnAt) {
      const def = PET_BY_ID.get(a.species);
      world.animals.splice(world.animals.indexOf(a), 1);
      if (def.biome === world.biome) spawnAnimal(world, def, world.random() < .15 ? 2 : world.random() < .6 ? 0 : 1);
    }
    return;
  }
  if (a.boss) return updateBoss(world, a, dt);
  const def = PET_BY_ID.get(a.species);
  const st = petStats(def, a.stage);
  st.speed *= a.effectSpeed ?? 1;
  if(a.cast&&['spit','fire-blast'].includes(a.cast.kind))st.speed=Math.max(0,st.speed+(abilityStats(a).speed_bonus||0));
  if (a.decoy) { if(world.time>=a.expiresAt){a.dead=true;world.animals=world.animals.filter(x=>x!==a);} return; }
  if (world.time<(a.boostUntil||0)) { const speed=a.boostSpeed||1100;a.vx=Math.cos(a.boostAngle)*speed;a.vy=Math.sin(a.boostAngle)*speed;a.x+=a.vx*dt;a.y+=a.vy*dt;collide(world,a);return;}
  if (updateAbility(world,a,dt,combatApi)) return;
  if(world.time < (a.trappedUntil||0)){a.vx=a.vy=0;return;}
  let goal = null, speed = 0;
  a.moving = false;
  if (a.owner) {
    const owner = world.players[a.owner];
    if (!owner) { world.animals.splice(world.animals.indexOf(a), 1); return; }
    a.mountBuff = owner.mounted === a.id ? item(owner.saddle)?.mountBuff : null;
    if (owner.mounted === a.id) { a.x=owner.x;a.y=owner.y;a.angle=owner.angle;a.vx=owner.vx;a.vy=owner.vy; if(a.mountBuff==='honey')heal(world,a,10*dt);
      const target=a.target&&(world.players[a.target]||world.animals.find(x=>x.id===a.target));
      if(target&&!target.dead&&!friendly(a,target)&&world.time>=(a.attackBlockedUntil||0)&&biteReady(world,a,target)){a.cd=world.time+1;a.attackAt=world.time;const dealt=hurt(world,target,st.bite*levelBoost(a.level)*petDamageVs(a,target).mult,a,{knock:30});petXp(world,a,dealt*.5);}
      return; }
    let target = a.target && (world.players[a.target] || world.animals.find(x => x.id === a.target));
    if (target && (target.dead || target.hp <= 0 || target.id === owner.id || target.owner === owner.id || (!a.lockedTarget && dist(target, owner) > 1000) || world.time < (target.shieldUntil || 0))) target = a.target = null;
    if (!target) a.lockedTarget = null;
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
      goal = target; speed = st.speed;
      if (world.time >= (a.attackBlockedUntil||0) && biteReady(world, a, target)) {
        a.cd = world.time + 1; a.attackAt = world.time;
        const m = petDamageVs(a, target).mult, buff = a.buffUntil > world.time ? 1.5 : 1;
        const dealt = hurt(world, target, st.bite * levelBoost(a.level) * m * buff * (target.items ? 1 : 1.2), a, { knock: 30, crit: m > 1.5 });
        petXp(world, a, dealt * .5);
      }
    } else if (a.mode === 'stop' || a.mode === 'move') {
      if (a.post) { goal = roam(world, a, a.post, 110); speed = st.speed * .45; }
    } else if (!owner.dead) {
      const slot = owner.pets.indexOf(a.id);
      const ang = Math.atan2(owner.vy, owner.vx) + Math.PI + (slot - 1) * .8;
      const moving = Math.hypot(owner.vx, owner.vy) > 40;
      const back = moving ? ang : owner.angle + Math.PI + (slot - 1) * .9;
      const fx = owner.x + Math.cos(back) * (owner.r + a.r + 30), fy = owner.y + Math.sin(back) * (owner.r + a.r + 30);
      const idle = !moving ? roam(world, a, owner, 150) : null;
      if (idle) { goal = idle; speed = dist(a, owner) > 230 ? st.speed : st.speed * .45; }
      const d = moving ? Math.hypot(fx - a.x, fy - a.y) : 0;
      if (d > 25) { goal = { x: fx, y: fy }; speed = Math.min(st.speed, d * 4 + 60); }
      if (!a.lockedTarget && dist(a, owner) > 2500 && !visibleToPlayer(world, a)) { a.x = owner.x - 60; a.y = owner.y + 40; a.vx = a.vy = 0; }
    }
    // pets regenerate after 5s without damage
    if (world.time - a.lastHurtAt > def.regenDelay[a.stage] && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + dt * def.regen[a.stage]);
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
    if (!prey && def.temper === 'aggressive' && a.stage > 0 && world.time >= (a.calmUntil || 0)) {
      let bd = 340 ** 2;
      for (const p of Object.values(world.players)) {
        if (p.dead || world.time < p.shieldUntil) continue;
        const d = dist2(p, a); if (d < bd) { bd = d; prey = p; }
      }
      if (prey) { a.target = prey.id; a.state = 'chase'; }
    }
    if (prey && a.state === 'flee' && world.time < a.fleeUntil) {
      const ang = Math.atan2(a.y - prey.y, a.x - prey.x);
      goal = { x: a.x + Math.cos(ang) * 200, y: a.y + Math.sin(ang) * 200 }; speed = st.speed;
    } else if (prey && a.state === 'chase') {
      if(a.stage>0 && world.time-(a.skillAt??-99)>=abilityCooldown(a))castAbility(world,a,prey,combatApi);
      goal = prey; speed = st.speed;
      if (world.time >= (a.attackBlockedUntil||0) && biteReady(world, a, prey)) {
        a.cd = world.time + 1; a.attackAt = world.time;
        hurt(world, prey, st.bite * petDamageVs(a, prey).mult * (prey.items ? 1 : 1.2), a, { knock: 30 });
      }
    } else {
      if (a.state === 'flee' && world.time >= a.fleeUntil) { a.state = 'wander'; a.target = null; }
      if (world.time > a.wanderAt) {
        a.wanderAt = world.time + 2 + world.random() * 4;
        a.wanderGoal = world.random() < .35 ? null : { x: clamp(a.home.x + (world.random() - .5) * 800, 120, WORLD.w - 120), y: clamp(a.home.y + (world.random() - .5) * 800, 120, WORLD.h - 120) };

      }
      if (a.wanderGoal) { goal = a.wanderGoal; speed = st.speed * .35; if (dist(a, goal) < 40) a.wanderGoal = null; }
    }
  }
  if (!goal || !a.target) { a.contactSince = null; a.contactTarget = null; }
  steer(world, a, goal, speed, dt);
}

function steer(world, a, goal, speed, dt) {
  if (goal) {
    const waypoint = navigationGoal(world, a, goal);
    const dx = waypoint.x - a.x, dy = waypoint.y - a.y, d = Math.hypot(dx, dy);
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

function updateBoss(world,a,dt) {
  const def=BOSS_BY_ID.get(a.boss);
  if(world.time-a.lastHurtAt>20 && a.hp<a.maxHp)a.hp=Math.min(a.maxHp,a.hp+a.maxHp*.015*dt);
  if(a.sleep)return;
  const targets=[...Object.values(world.players).filter(p=>!p.dead&&world.time>=p.shieldUntil),...world.animals.filter(t=>t.owner&&!t.dead)];
  const near=targets.filter(t=>dist(t,a)<950);
  if(world.time-a.lastHurtAt>25&&!near.length){a.sleep=true;a.pending=null;a.pendingAttacks=[];a.attackTimers=null;return;}
  a.attackTimers ||= def.attacks.map((attack,i)=>world.time+i*2);
  a.pendingAttacks ||= [];
  for(const pending of [...a.pendingAttacks])if(world.time>=pending.at){
    a.pendingAttacks=a.pendingAttacks.filter(p=>p!==pending);a.attackAt=world.time;
    const attack=def.attacks[pending.index],kind=attack.kind;
    if(['slam','flame-slam'].includes(kind)){
      for(const t of [...targets,...world.structures]){
        if(dist(t,a)>(attack.reach||400)+(t.r||0))continue;
        if(t.item)hitStructure(world,t,attack.buildingDamage||attack.damage*10,a);
        else {hurt(world,t,attack.damage,a,{element:attack.element,skill:true,knock:120});if(attack.burn&&!statusImmune(world,t,attack.element))t.effects=[...(t.effects||[]),{key:`${a.id}:burn`,kind:'burn',until:world.time+3,value:attack.burn,element:attack.element,by:a.id}];}
      }
      emit(world,{k:'impact',x:a.x,y:a.y});
    }else{
      const atCenter=['whirlpool','toxic-fog'].includes(kind),points=atCenter?[{x:a.x,y:a.y}]:pending.points;
      if(attack.invulnerable)a.invulnerableUntil=world.time+attack.duration;
      for(const point of points)world.hazards.push({id:`h${world.nextId++}`,kind:kind==='roots'?'roots':kind==='whirlpool'?'whirlpool':kind==='toxic-fog'?'toxic-fog':kind==='poison'?'poison':kind,x:point.x,y:point.y,r:atCenter?480:kind==='roots'?160:120,at:world.time+(kind.includes('meteor')||kind==='bomb'?1.2:0),until:world.time+(attack.duration||1.2),owner:a.id,attack,element:attack.element,dmg:attack.damage});
    }
  }
  for(let i=0;i<def.attacks.length;i++)if(near.length&&world.time>=a.attackTimers[i]){
    const attack=def.attacks[i],pending={index:i,kind:attack.kind,at:world.time+attack.windup,points:near.slice(0,4).map(t=>({x:t.x,y:t.y}))};
    a.pendingAttacks.push(pending);a.pending=pending;a.attackTimers[i]=world.time+attack.interval;
    emit(world,{k:'bosswindup',id:a.id,x:a.x,y:a.y,kind:attack.kind,at:pending.at});
    world.hazards.push({id:`h${world.nextId++}`,kind:'warning',x:a.x,y:a.y,r:attack.reach||400,at:pending.at,until:pending.at,owner:a.id,dmg:0});
  }
  if(a.pending&&world.time>a.pending.at)a.pending=null;
  const wave=a.hp<a.maxHp*.25?3:a.hp<a.maxHp*.5?2:a.hp<a.maxHp*.75?1:0;
  while(wave>a.waves){
    a.waves++;
    const stages=a.waves===1?[1,1,1]:a.waves===2?[2,1,1]:[2,2,2];
    if(a.boss==='frost-golem'){if(a.waves===1)stages.pop();else if(a.waves===2)stages.splice(0,stages.length,2,1);else stages.splice(0,stages.length,2,2,1);}
    for(const [i,stage]of stages.entries()){
      const id=def.drops[i%def.drops.length],m=spawnAnimal(world,PET_BY_ID.get(id),stage,{x:a.x+Math.cos(i*2.1)*(a.r+90),y:a.y+Math.sin(i*2.1)*(a.r+90)});
      m.sleep=false;m.angry=true;m.state='chase';m.target=near[0]?.id||null;
    }
    emit(world,{k:'wave',name:def.name,x:a.x,y:a.y});
  }
}

// ---------------- pets: skills and orders ----------------

function petCommand(world, p, cmd) {
  const mode = ['defend', 'attack', 'stop', 'move'].includes(cmd.mode) ? cmd.mode : 'defend';
  const ids = Number.isInteger(cmd.slot) && cmd.slot >= 0 ? [p.pets[cmd.slot]] : p.pets;
  for (const id of ids) {
    const a = world.animals.find(x => x.id === id);
    if (!a) continue;
    a.mode = mode; a.target = null; a.lockedTarget = null; a.wanderAt = 0;
    const target = cmd.target && (world.players[cmd.target] || world.animals.find(t => t.id === cmd.target));
    if (target && !target.dead && target.id !== p.id && target.owner !== p.id) { a.mode = 'attack'; a.target = target.id; a.lockedTarget = target.id; }
    if (mode === 'move' && Number.isFinite(+cmd.x) && Number.isFinite(+cmd.y)) a.post = { x: clamp(+cmd.x, 0, WORLD.w), y: clamp(+cmd.y, 0, WORLD.h) };
    else if (mode === 'stop') a.post = { x: a.x, y: a.y };
    else a.post = null;
  }
}

export function skillCooldown(a) { return abilityCooldown(a); }
function petSkills(world,p,slot,aim=null) {
  const ids=slot>=0?[p.pets[slot]]:p.pets;
  for(const id of ids){const a=world.animals.find(a=>a.id===id&&!a.dead);if(a)castAbility(world,a,aim,combatApi);}
}

// ---------------- buildings ----------------

function updateStructures(world, dt) {
  const tenth = world.tick % 2 === 0; // damage ticks every 0.1s
  for (const s of [...world.structures]) {
    const it = item(s.item);
    const owner = world.players[s.owner];
    if(s.expiresAt && world.time>=s.expiresAt || s.season && s.season!==world.biome){destroyStructure(world,s);continue;}
    if(s.decay){s.hp-=dt*2;if(s.hp<=0){destroyStructure(world,s);continue;}}
    switch (it.kind) {
      case 'windmill':
        if (owner && !owner.dead && world.time - (s.paidAt ?? s.born) >= it.every) {
          s.paidAt = world.time; gainGold(owner, it.gold+(hat(owner).millBonus||0));
          emit(world, { k: 'mill', to: owner.id, x: s.x, y: s.y, amt: it.gold+(hat(owner).millBonus||0) });
        }
        break;
      case 'spike':
        if (!tenth) break;
        for (const t of [...Object.values(world.players), ...world.animals]) {
          if (t.dead || t.id === s.owner || t.owner === s.owner || t.sleep && !t.boss || t.hp <= 0) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 > (s.r + t.r + 8) ** 2) continue;
          hurt(world, t, (t.boss ? (['amethyst','sapphire','amber','diamond','emerald'].includes(it.tier)?2:1) : it.touch * (t.items ? 1 : 2)), { x: s.x, y: s.y, id: s.owner, owner: s.owner }, { kind: 'spike', kb: 0 });
        }
        break;
      case 'trap':
        if(world.time<(s.rearmAt||0)||world.time-s.born<1)break;
        for (const t of [...Object.values(world.players), ...world.animals.filter(x => !x.boss)]) {
          if (t.dead || t.id === s.owner || t.owner === s.owner || t.sleep) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r * .7 + t.r * .4) ** 2) {
            if (t.items) { t.trappedUntil = world.time + 2; t.x = s.x; t.y = s.y; t.vx = t.vy = 0; } else t.cd = world.time + 2;
            hurt(world, t, (t.items ? it.dmg : it.adm) * (owner ? hat(owner).trapDamage||1 : 1), { x: s.x, y: s.y, id: s.owner, owner: s.owner }, { kind: 'trap', kb: 0 });
            emit(world, { k: 'trap', x: s.x, y: s.y });
            s.rearmAt=world.time+5*(owner?hat(owner).trapReload||1:1);
            break;
          }
        }
        break;
      case 'boost':
        for (const t of [...Object.values(world.players),...world.animals.filter(a=>!a.boss)]) {
          if (t.dead || t.items&&hat(t).noBoost) continue;
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r + t.r * .3) ** 2) { t.boostUntil=world.time+.75;t.boostAngle=s.rot;t.boostSpeed=it.boostSpeed||1100;t.vx=Math.cos(s.rot)*t.boostSpeed;t.vy=Math.sin(s.rot)*t.boostSpeed; }
        }
        break;
      case 'heal':
        if (!owner || world.time - (s.paidAt ?? 0) < it.every) break;
        s.paidAt = world.time;
        for (const t of [owner, ...owner.pets.map(id => world.animals.find(a => a.id === id)).filter(Boolean)]) {
          if (!t.dead && (t.x - s.x) ** 2 + (t.y - s.y) ** 2 < (s.r + t.r * .6) ** 2) heal(world, t, it.heal*(t.items?1:2));
        }
        break;
      case 'turret': case 'tower': {
        if (world.time < s.cd) break;
        if(['normal','repair'].includes(it.towerElement)){
          s.cd=world.time+it.every;s.shotAt=world.time;
          if(it.towerElement==='repair')for(const ally of world.structures)if(ally!==s&&ally.owner===s.owner&&dist(ally,s)<it.range)ally.hp=Math.min(ally.maxHp,ally.hp+it.dmg);
          for(const t of [...Object.values(world.players),...world.animals])if(!t.dead&&t.id!==s.owner&&t.owner!==s.owner&&dist(t,s)<it.range){const d=dist(t,s)||1;t.vx+=(t.x-s.x)/d*600;t.vy+=(t.y-s.y)/d*600;if(it.towerElement==='normal')hurt(world,t,it.dmg,{...s,id:s.owner},{element:'normal',kb:0});}
          emit(world,{k:'impact',x:s.x,y:s.y});break;
        }
        if(it.towerElement==='water'){
          const ally=[owner,...world.animals.filter(a=>a.owner===s.owner)].filter(t=>t&&!t.dead&&t.hp<t.maxHp&&dist(t,s)<it.range).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
          if(ally){const angle=Math.atan2(ally.y-s.y,ally.x-s.x);s.aim=angle;s.cd=world.time+it.every;s.shotAt=world.time;world.projectiles.push({id:`j${world.nextId++}`,x:s.x,y:s.y,vx:Math.cos(angle)*700,vy:Math.sin(angle)*700,owner:s.owner,tower:s.id,heal:50,element:'water',kind:'waterball',until:world.time+it.range/700,r:18,dmg:it.dmg});break;}
        }
        let best = null, bd = it.range ** 2;
        for (const t of Object.values(world.players)) {
          if (t.dead || t.id === s.owner || world.time < t.shieldUntil) continue;
          const d = dist2(t, s); if (d < bd) { bd = d; best = t; }
        }
        for (const t of world.animals) {
          if (t.dead || t.owner === s.owner || !t.boss&&it.kind==='tower'&&!t.owner&&t.stage===0&&!t.angry) continue;
          const d = dist2(t, s); if (d < bd) { bd = d; best = t; }
        }
        if (best) {
          s.aim = Math.atan2(best.y - s.y, best.x - s.x); s.cd = world.time + it.every; s.shotAt = world.time;
          const speed = it.kind === 'tower' ? 700 : 1000;
          world.projectiles.push({ id: `j${world.nextId++}`, x: s.x + Math.cos(s.aim) * 50, y: s.y + Math.sin(s.aim) * 50, vx: Math.cos(s.aim) * speed, vy: Math.sin(s.aim) * speed, dmg: it.dmg, buildingDamage:it.element==='rock'?it.dmg*4:it.dmg, element:it.element, tower:s.id, owner: s.owner, until: world.time + it.range / speed, r: it.kind === 'tower' ? 16 : 10, kind: it.kind === 'tower' ? it.element==='water'?'waterball':it.element==='plant'?'plantball':it.element==='ice'?'iceball':it.element==='shadow'?'shadowball':it.element==='rock'?'rockball':'fireball' : 'ball' });
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
    if(j.ability==='lava-spit' && world.time>=(j.trailAt||0)){j.trailAt=world.time+.15;world.hazards.push({id:`h${world.nextId++}`,kind:'pet-lava',x:j.x,y:j.y,r:45,at:world.time,until:world.time+3,owner:j.owner,caster:j.caster});}
    if (world.time > j.until) continue;
    let hit = abilityBlocksProjectile(world,j);
    for (const n of nearbyResources(world, j.x, j.y, 140)) if (RESOURCE_TYPES[n.type].solid !== false && (n.x - j.x) ** 2 + (n.y - j.y) ** 2 < (n.r * .85) ** 2) { hit = true; break; }
    if(j.piercing && !hit){
      for(const t of [...Object.values(world.players),...world.animals,...world.structures]){
        if(t.dead||t.hp<=0||t.id===j.caster||j.ability!=='water-ball'&&(t.id===j.owner||t.owner===j.owner))continue;
        if(dist(t,j)>(t.r||0)+j.r||world.time<(j.hitTimes[t.id]||0))continue;
        const tick=!!j.hitTimes[t.id];j.hitTimes[t.id]=world.time+.5;abilityProjectileHit(world,j,t,combatApi,tick);
      }
      keep.push(j);continue;
    }
    const by = { x: j.x - j.vx * .05, y: j.y - j.vy * .05, id: j.owner, owner: j.owner };
    const it = j.item ? item(j.item) : null;
    if (!hit) for (const s of world.structures) {
      if (s.owner === j.owner || !SOLID.has(kindOf(s))) continue;
      if ((s.x - j.x) ** 2 + (s.y - j.y) ** 2 < s.r ** 2 && j.caster) { abilityProjectileHit(world,j,s,combatApi);hit=true;break; }
      if ((s.x - j.x) ** 2 + (s.y - j.y) ** 2 < s.r ** 2) { hitStructure(world, s, j.buildingDamage || it?.bdm || 2, by); hit = true; break; }
    }
    if (!hit) for (const t of [...Object.values(world.players), ...world.animals]) {
      if (t.dead || t.hp <= 0 || !j.heal&&!it?.healPet&&(t.id === j.owner || t.owner === j.owner) || j.boss && !t.items && !t.owner) continue;
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
  if(j.heal&&(t.id===j.owner||t.owner===j.owner)){heal(world,t,j.heal);return;}
  if(j.element==='shadow')world.hazards.push({id:`h${world.nextId++}`,kind:'tower-vortex',x:t.x,y:t.y,r:130,at:world.time,until:world.time+3,owner:j.owner,element:'shadow',dmg:3});
  if(j.caster){abilityProjectileHit(world,j,t,combatApi);return;}
  // taming tools: matching tool on a sleeping wild baby raises the tame chance
  if (it?.tameTool && t.sleep && !t.owner) {
    const def = PET_BY_ID.get(t.species);
    if (def.tool === it.tameTool) {
      const reset = world.random() < Math.max(0,(it.safer ? .025 : .05) - (shooter ? hat(shooter).failReduction || 0 : 0));
      t.bonus = reset ? 0 : (t.bonus || 0) + 1;
      if (reset) { t.sleep = false; t.state = 'wander'; t.target = null; t.angry = false; t.sleepAt = world.time + 40; t.calmUntil = world.time + 5; }
      else t.wakeAt = Math.max(t.wakeAt, world.time + 6);
      emit(world, { k: 'bonus', id: t.id, x: t.x, y: t.y - t.r, bonus: t.bonus, reset, to: j.owner });
    } else emit(world, { k: 'msg', to: j.owner, text: `${def.name} needs the ${def.tool === 'appletor' ? 'Appletor' : 'Slingshot'}` });
    return;
  }
  if (it?.healPet && (t.owner === j.owner || t.id === j.owner)) { heal(world, t, (t.items ? it.healPlayer : it.healPet)*(shooter?hat(shooter).appleHeal||1:1)); return; }
  if (it?.healPet) { if (t.items) heal(world, t, it.healPlayer*(shooter?hat(shooter).appleHeal||1:1)); else heal(world, t, it.healPet*(shooter?hat(shooter).appleHeal||1:1)); return; }
  if (t.owner === j.owner) return;
  if(it?.family==='blowpipe'&&!statusImmune(world,t,'normal')){t.blindUntil=world.time+1.5;t.slowUntil=world.time+1.5;t.skillBlockedUntil=world.time+1;if(!t.items&&t.stage===0&&!t.owner){t.sleep=true;t.angry=false;t.target=null;t.state='wander';t.wakeAt=world.time+10;return;}}
  const dmg = (j.dmg ?? (t.items ? it?.dmg : it?.fairyDamage&&PET_BY_ID.get(t.species)?.types.includes('fairy')?it.fairyDamage:it?.adm) ?? 10) * (shooter&&it?rangedMultiplier(world,shooter,it):1);
  const dealt = hurt(world, t, dmg, by, { knock: j.kind === 'fireball' ? 40 : 20, kind: j.kind === 'fireball' ? 'burn' : 'hit', element: j.element, skill:!!j.boss });
  if(j.element==='ice'&&dealt&&!statusImmune(world,t,'ice'))t.trappedUntil=world.time+.5;
  if(j.element==='electric'&&dealt&&!statusImmune(world,t,'electric'))t.skillBlockedUntil=world.time+1;
  if(j.element==='plant'&&dealt){const tower=world.structures.find(s=>s.id===j.tower);if(shooter&&dist(shooter,j)<900)heal(world,shooter,dealt*.2);else if(tower)tower.hp=Math.min(tower.maxHp,tower.hp+dealt*.2);}
  if (j.kind === 'fireball' && j.element!=='normal' && t.items && dealt && !statusImmune(world,t,'fire')) t.burn = 3;
  if (shooter && dealt) for (const id of shooter.pets) { const a = world.animals.find(x => x.id === id); if (a && a.mode !== 'stop' && !a.lockedTarget) a.target = t.owner ? t.owner : t.id; }
}

// Volcano meteors: a warning circle, then a heavy impact, near whoever is in the volcano.
function updateHazards(world, dt) {
  if (world.time > world.meteorAt) {
    world.meteorAt = world.time + 3 + world.random() * 3;
    const p = Object.values(world.players).find(p => !p.dead && world.biome === 'volcano');
    if (p) world.hazards.push({ id: `h${world.nextId++}`, kind: 'meteor', x: p.x + (world.random()-.5)*500, y: p.y + (world.random()-.5)*500, r: 110, at: world.time + 1.6, dmg: 80, element: 'fire' });
  }
  const keep=[];
  for(const h of world.hazards){
    if(world.time<h.at){keep.push(h);continue;}
    if(h.kind.startsWith('pet-')){if(world.time>=h.until)continue;keep.push(h);if(world.time>=(h.tickAt||0)){h.tickAt=world.time+.5;abilityHazardTick(world,h,combatApi);}continue;}
    if(h.kind==='warning')continue;
    const source=world.animals.find(a=>a.id===h.owner)||{x:h.x,y:h.y,id:h.owner},attack=h.attack||{};
    const persistent=['poison','roots','whirlpool','toxic-fog','lava-pool','tower-vortex'].includes(h.kind);
    if(persistent){if(world.time>=h.until)continue;keep.push(h);if(world.time<(h.tickAt||0))continue;h.tickAt=world.time+(attack.tick||.5);}
    for(const t of [...Object.values(world.players),...world.animals,...world.structures]){
      if(t.dead||h.kind!=='tower-vortex'&&(t.boss||t.sleep||h.owner&&!t.items&&!t.owner&&!t.item))continue;
      if(dist(t,h)>=h.r+(t.r||0)*.5)continue;
      const damage=t.items? h.dmg||0 : attack.animalDamage||h.dmg||0;
      if(h.kind==='tower-vortex'&&(t.id===h.owner||t.owner===h.owner))continue;
      if(h.kind==='tower-vortex'&&!t.item&&!t.boss){const d=dist(t,h)||1;t.vx+=(h.x-t.x)/d*350;t.vy+=(h.y-t.y)/d*350;}
      const dealt=t.item?(hitStructure(world,t,damage*2,source),damage):hurt(world,t,damage,source,{kind:h.kind==='poison'||h.kind==='toxic-fog'?'poison':h.element||'hit',kb:persistent?0:1,knock:attack.knock||120,element:h.element,skill:true});
      const immune=!t.item&&statusImmune(world,t,h.element,source);
      if(attack.vampirism&&source.hp)source.hp=Math.min(source.maxHp,source.hp+dealt*attack.vampirism);
      if(h.kind==='roots'&&!immune&&!t.item){t.slowUntil=world.time+1;}
      if(attack.pull&&!t.item&&!statusImmune(world,t,h.element,source,'pull')){const d=dist(t,h)||1;t.vx+=(h.x-t.x)/d*attack.pull;t.vy+=(h.y-t.y)/d*attack.pull;}
      if(!immune&&!t.item){
        if(attack.freeze||attack.stun){t.trappedUntil=world.time+(attack.freeze||attack.stun);t.skillBlockedUntil=t.trappedUntil;}
        if(attack.blind)t.blindUntil=world.time+attack.blind;
        if(attack.burn)t.effects=[...(t.effects||[]),{key:`${h.owner}:burn`,kind:'burn',until:world.time+3,value:attack.burn,element:h.element,by:h.owner}];
      }
    }
    if(h.kind==='lava-meteor')keep.push({...h,id:`h${world.nextId++}`,kind:'lava-pool',at:world.time,until:world.time+5,dmg:5,tickAt:world.time+.5});
    if(!persistent)emit(world,{k:'impact',x:h.x,y:h.y});
  }
  world.hazards = keep;
}

// ---------------- bots ----------------

function botThink(world, p) {
  const inp = p.input;
  if (p.choices.length) {
    const offer = currentOffer(p);
    const family = p.botFamily ||= ['sword','axe','hammer','daggers','spear','gloves'][Math.floor(world.random()*6)];
    const pick = offer.find(id => item(id).family === family) || offer.find(id => item(id).slot === 'windmill') || offer[Math.floor(world.random() * offer.length)];
    if (pick) choose(world, p, pick); else p.choices.shift();
  }
  p.brainAt ??= 0;
  if (world.time < p.brainAt) { if (p.goal) aimAndMove(world, p, p.goal, p.goalRange || 0); return; }
  p.brainAt = world.time + .25 + world.random() * .25;
  const sel = slot => Math.max(0, p.items.findIndex(id => item(id).slot === slot));
  inp.attack = false;
  if (p.hp < p.maxHp * .6 && p.res.food >= 5) eat(world, p);
  p.aggressive ??= world.random() < .45;
  // fight weaker players nearby, avoid stronger ones
  let foe = null, fd = 380 ** 2;
  for (const o of Object.values(world.players)) {
    if (o === p || o.dead || world.time < o.shieldUntil) continue;
    const d = dist2(o, p); if (d < fd) { fd = d; foe = o; }
  }
  if (foe && world.time > p.shieldUntil) {
    if (p.aggressive || p.age >= foe.age && p.hp > p.maxHp * .5) {
      inp.sel = sel('primary'); p.goal = foe; p.goalRange = 30; inp.attack = Math.sqrt(fd) < p.r + foe.r + (item(p.items[sel('primary')]).range || 20) + 10;
      aimAndMove(world, p, foe, 30); return;
    }
    if (!p.aggressive && p.hp < p.maxHp * .5) { p.goal = { x: p.x * 2 - foe.x, y: p.y * 2 - foe.y }; p.goalRange = 0; aimAndMove(world, p, p.goal, 0); return; }
  }
  const baby = tameTarget(world, p);
  if (baby && p.pets.length < MAX_PETS && world.random() < .5) { command(world, p.id, { t: 'tame' }); }
  // bots go looking for a sleeping baby until they have a companion
  if (!p.pets.length && !baby) {
    let best = null, bd = 900 ** 2;
    for (const a of world.animals) if (a.sleep && !a.owner && !a.boss) { const d = dist2(a, p); if (d < bd) { bd = d; best = a; } }
    if (best) { p.goal = best; p.goalRange = best.r + 30; aimAndMove(world, p, best, best.r + 30); return; }
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
    if (n.type === 'cactus' || RESOURCE_TYPES[n.type].catchOnly) continue;
    const d = dist2(n, p) * (RESOURCE_TYPES[n.type].yields === want ? 1 : 4);
    if (d < nd) { nd = d; node = n; }
  }
  inp.sel = sel('primary');
  if (!node) { p.goal = { x: clamp(p.x + (world.random() - .5) * 1400, 200, WORLD.w - 200), y: clamp(p.y + (world.random() - .5) * 1400, 200, WORLD.h - 200) }; p.goalRange = 20; return; }
  p.goal = node; p.goalRange = node.r + 10;
  inp.attack = dist(p, node) < node.r + p.r + 40;
  aimAndMove(world, p, node, node.r + 10);
}
function aimAndMove(world, p, goal, range) {
  const direct = dist(p, goal) <= range + p.r;
  const waypoint = direct ? goal : navigationGoal(world, p, goal);
  const dx = waypoint.x - p.x, dy = waypoint.y - p.y, d = Math.hypot(dx, dy) || 1;
  p.input.angle = Math.atan2(dy, dx);
  if (!direct) { p.input.mx = dx / d; p.input.my = dy / d; } else { p.input.mx = 0; p.input.my = 0; }
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
  return [p.id, p.name, p.skin, p.hat, R(p.x), R(p.y), A(p.angle), Math.ceil(p.hp), p.maxHp, p.dead ? 1 : 0, p.age, R(p.res.gold), p.held, T(p.actionAt), T(p.hitAt), T(p.shieldUntil), p.pets.length, p.bot ? 1 : 0, T(p.trappedUntil), p.punchHand || 0, p.wings || 'none'];
}
export function decodePlayer(r) {
  return { id: r[0], name: r[1], skin: r[2], hat: r[3], x: r[4], y: r[5], angle: r[6], hp: r[7], maxHp: r[8], dead: !!r[9], age: r[10], gold: r[11], held: r[12], actionAt: r[13], hitAt: r[14], shieldUntil: r[15], petCount: r[16], bot: !!r[17], trappedUntil: r[18], punchHand: r[19] || 0, wings: r[20] || 'none', r: PLAYER_R };
}
export function encodeAnimal(a) {
  return [a.id, a.species, a.boss || 0, R(a.x), R(a.y), A(a.angle), Math.ceil(a.hp), a.maxHp, a.stage, a.sleep ? 1 : 0, a.owner || 0, a.moving ? 1 : 0, T(a.attackAt), T(a.hitAt), a.r, a.bonus || 0, a.mode || 0, T(a.skillAt ?? -99), a.angry ? 1 : 0, R(a.xp || 0), a.level || 1, a.cast?.kind || null, T(a.cast?.until || 0), a.decoy ? 1 : 0];
}
export function decodeAnimal(r) {
  return { id: r[0], species: r[1], boss: r[2] || null, x: r[3], y: r[4], angle: r[5], hp: r[6], maxHp: r[7], stage: r[8], sleep: !!r[9], owner: r[10] || null, moving: !!r[11], attackAt: r[12], hitAt: r[13], r: r[14], bonus: r[15], mode: r[16] || 'defend', skillAt: r[17], angry: !!r[18], xp: r[19], level: r[20] || 1, castKind:r[21], castUntil:r[22]||0, decoy:!!r[23] };
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
    t: 'snap', time: T(world.time), biome: world.biome, activeEvent:world.activeEvent,
    r: world.resources.filter(n => n.hp !== RESOURCE_TYPES[n.type].hp || n.respawnAt).map(n => [n.id, n.hp ?? null, Number.isFinite(n.respawnAt) ? T(n.respawnAt) : -1]),
    chests: world.resources.filter(n => n.type === 'chest' && !n.respawnAt).map(n => [n.id, n.x, n.y, n.r, n.hp, n.goldRemaining]),
    me: me ? { xp: Math.floor(me.xp), res: { wood: me.res.wood, stone: me.res.stone, food: me.res.food, gold: me.res.gold }, items: me.items, sel: me.sel, choices: me.choices, hats: me.hats, accessories: me.accessories, goldenApples:me.goldenApples||0, insects:me.insects||0, pets: me.pets, kills: me.kills, tames: me.tames, cd: T(me.cd), fx: [me.poison > 0, me.burn > 0, me.slowUntil > world.time, me.armorUntil > world.time, me.hasteUntil > world.time, me.blindUntil > world.time], lastHitBy: me.lastHitBy,
      // for prediction: the last input applied, the velocity after it, and the current top speed
      seq: me.seq || 0, v: [A(me.vx), A(me.vy)], spd: A(moveSpeed(world, me, item(me.items[me.sel]) || item('hand'))) } : null,
    p: Object.values(world.players).filter(p => p.id === selfId || inView(p, c, 200)).map(encodePlayer),
    a: world.animals.filter(a => !a.dead && (a.owner === selfId || inView(a, c, a.r + 100))).map(encodeAnimal),
    s: world.structures.filter(s => inView(s, c, 120)).map(encodeStructure),
    j: world.projectiles.filter(j => inView(j, c, 200)).map(encodeProjectile),
    h: world.hazards.map(h => [h.id, R(h.x), R(h.y), h.r, T(h.at), h.kind, T(h.until || 0), h.owner || null, A(h.angle||0), h.shape||null, h.width||0]),
    boss: world.animals.filter(a => a.boss && !a.dead).map(a => [R(a.x), R(a.y), Math.round(a.hp / a.maxHp * 100) / 100, a.boss, a.sleep ? 1 : 0]),
  };
}
export function leaderboard(world) {
  return Object.values(world.players).filter(p => !p.dead && !(hat(p).hideLeaderboard && p.res.gold<1000000)).sort((a, b) => b.res.gold - a.res.gold || b.age - a.age).slice(0, 10)
    .map(p => [p.id, p.name, R(p.res.gold), p.age, p.kills, R(p.x), R(p.y)]);
}
export function topKiller(world) {
  let best = null;
  for (const p of Object.values(world.players)) if (p.kills > 0 && (!best || p.kills > best.kills)) best = p;
  return best?.id || null;
}
