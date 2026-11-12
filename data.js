import { ITEM_REFERENCE } from './reference-items.js';
import { BOSS_PROFILES } from './boss-data.js';
import { ANIMAL_REFERENCE } from './reference-animals.js';
import { EQUIPMENT_HATS, EQUIPMENT_ACCESSORIES } from './equipment-data.js';
// Shared clean-room game content. No DOM or Worker globals: imported by the
// browser client, the shared simulation and the Cloudflare Worker.
// Mechanics and factual labels follow public Taming.io documentation.
// Artwork and implementation are original.

export const WORLD = { w: 9600, h: 9600 };
export const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };

// ---------------- cycling world biomes ----------------
export const BIOMES = [
  {
    id: 'forest', name: 'Forest', ground: '#62813b', decor: '#56732f', pebble: '#7a9a4a', tuft: 'grass',
    tree: ['#97cf3a', '#b5e04f', '#2f4a14'], treeStyle: 'star', rock: ['#a59a87', '#c2b8a6', '#3b3229'],
    bush: ['#4f8a2f', '#66a63c', '#24401a'], berry: '#e2413b', boss: 'old-oak',
    mix: [['tree', .42], ['rock', .2], ['bush', .24], ['gold', .06], ['log', .08]],
  },
  {
    id: 'winter', name: 'Winter', ground: '#d6cbbb', decor: '#c7bba9', pebble: '#ece5d9', tuft: 'flake',
    tree: ['#f4f0e6', '#ffffff', '#6d6f6c'], treeStyle: 'snow', rock: ['#a9b6bd', '#cdd8dc', '#3f4a52'],
    bush: ['#7fa3a0', '#a1c3bc', '#30464a'], berry: '#5aa8e6', boss: 'frost-golem',
    mix: [['tree', .42], ['rock', .22], ['bush', .2], ['gold', .08], ['log', .08]],
  },
  {
    id: 'darkness', name: 'Darkness', ground: '#393361', decor: '#2f2a52', pebble: '#4e4680', tuft: 'grass',
    tree: ['#7a5fd0', '#9d86ea', '#1a1433'], treeStyle: 'mushroom', rock: ['#5a5778', '#77749a', '#17152a'],
    bush: ['#3d6f7a', '#4f8d99', '#112a30'], berry: '#7dfcd2', dark: true, boss: 'shade-cap',
    mix: [['tree', .36], ['rock', .2], ['bush', .28], ['gold', .09], ['log', .07]],
  },
  {
    id: 'desert', name: 'Desert', ground: '#bc8c4a', decor: '#a97a3c', pebble: '#d4a461', tuft: 'swirl',
    tree: ['#d9673b', '#ef8b55', '#4a2414'], treeStyle: 'dead', rock: ['#b9814f', '#d6a06c', '#4a2f1b'],
    bush: ['#8a9a3c', '#a6b752', '#3b4216'], berry: '#e2413b', boss: 'sand-colossus',
    mix: [['tree', .26], ['rock', .26], ['bush', .14], ['gold', .11], ['cactus', .17], ['log', .06]],
  },
  {
    id: 'ocean', name: 'Ocean', ground: '#326395', decor: '#3d73a8', pebble: '#4f86bb', tuft: 'wave',
    tree: ['#3f9a6a', '#58b884', '#123425'], treeStyle: 'kelp', rock: ['#3e6f8a', '#5a8eaa', '#1d3646'],
    bush: ['#e8664f', '#ff8a6c', '#4a1a12'], berry: '#ffd2a8', boss: 'deep-kraken',
    mix: [['tree', .38], ['rock', .2], ['bush', .28], ['gold', .07], ['log', .07]],
  },
  {
    id: 'volcano', name: 'Volcano', ground: '#4f3335', decor: '#432a2c', pebble: '#ff7b2e', tuft: 'crack',
    tree: ['#e0612e', '#ff8b45', '#3a1208'], treeStyle: 'dead', rock: ['#5c4b47', '#7b6762', '#1c1412'],
    bush: ['#7b3b2c', '#9c5038', '#2a120c'], berry: '#ffb02e', meteors: true, boss: 'magma-titan',
    mix: [['tree', .26], ['rock', .3], ['bush', .16], ['gold', .17], ['log', .11]],
  },
];
export const BIOME_BY_ID = Object.fromEntries(BIOMES.map(b => [b.id, b]));
// Retained as a sampling grid for deterministic resource placement, not biome regions.
export const BIOME_CELL = WORLD.w / 3;
export const BIOME_GRID = Array.from({ length: 3 }, () => Array(3).fill('forest'));
export const BIOME_DURATIONS = [900, 480, 480, 480, 480, 480];
export function biomeState(time = 0) {
  const cycle = BIOME_DURATIONS.reduce((a, b) => a + b, 0);
  let elapsed = ((time % cycle) + cycle) % cycle, offset = time - elapsed;
  for (let index = 0; index < BIOMES.length; index++) {
    const duration = BIOME_DURATIONS[index];
    if (elapsed < duration) return { biome: BIOMES[index], index, endsAt: offset + duration };
    elapsed -= duration; offset += duration;
  }
}
export function biomeAt(x, y, time = 0) { return biomeState(time).biome; }
export function biomeCells() { return [{ x: 0, y: 0, w: WORLD.w, h: WORLD.h }]; }

// Resource node kinds. `yields` maps gather to a resource; `per` multiplies
// the weapon's harvest for that node; `hurts` is contact damage per tick.
// Sizes follow the reference footage: trees about 3.5 tamer widths across,
// rocks about two (often a big and a small one together), bushes a little
// over one.
export const RESOURCE_TYPES = {
  tree: { yields: 'wood', r: [105, 128], hp: 1200, respawn: 60 },
  rock: { yields: 'stone', r: [52, 74], hp: 1200, respawn: 90 },
  bush: { yields: 'food', r: [40, 50], hp: 100, respawn: 40 },
  gold: { yields: 'gold', r: [56, 66] },
  log: { yields: 'wood', r: [40, 46], per: 4, hp: 120, respawn: 50 },
  cactus: { yields: 'food', r: [32, 38], hurts: 2, hp: 100, respawn: 40 },
  insect: { yields: 'gold', r: [12, 12], hp: 1, respawn: 45, solid: false, catchOnly: true },
  chest: { yields: 'gold', r: [35, 35], per: 15, hp: 60, respawn: 0 },
  'big-gold': { yields: 'gold', r: [110, 110], per: 3.5 },
};
// Nodes per biome square: a few trees, rocks and bushes on every screen.
export const NODES_PER_CELL = 56;

// ---------------- items ----------------

export const TIERS = {
  wood: { name: 'Wooden', color: '#b9824a', light: '#d9a46a' },
  stone: { name: 'Stone', color: '#9aa1a6', light: '#c4cace' },
  gold: { name: 'Golden', color: '#f2c230', light: '#ffe17a' },
  ruby: { name: 'Ruby', color: '#e2405a', light: '#ff8ea0' },
  amethyst: { name: 'Amethyst', color: '#a35ce0', light: '#d3a6ff' },
  sapphire: { name: 'Sapphire', color: '#3c7be8', light: '#93bcff' },
  amber: { name: 'Amber', color: '#d68c27', light: '#f1bd62' },
  diamond: { name: 'Diamond', color: '#9ccbd2', light: '#d4eff4' },
  emerald: { name: 'Emerald', color: '#398c53', light: '#91cba0' },
};
export const TIER_ORDER = ['wood', 'stone', 'gold', 'ruby', 'amethyst', 'sapphire'];
export const tierRank = t => ['amber','diamond','emerald'].includes(t) ? TIER_ORDER.indexOf('sapphire') : TIER_ORDER.indexOf(t);

// harvest: per-hit yields by resource. dmg: vs players; adm: vs animals; bdm: vs buildings.
// reload in seconds; range is reach beyond the body edge; speed is % move speed while held.
const H = (w, s, f, g) => ({ wood: w, stone: s, food: f, gold: g });
const weapon = (id, name, family, shape, tier, dmg, adm, bdm, reload, range, speed, harvest, extra = {}) =>
  ({ id, name, slot: 'primary', family, shape, tier, dmg, adm, bdm, reload, range, speed, harvest, knock: 70, ...extra });

const PRIMARY = [
  weapon('hand', 'Hand', 'hand', 'fist', 'wood', 6, 6, 4, .6, 20, 100, H(1, 1, 1, 1), { knock: 30 }),
];
// families x tiers. Golden arrives at age 6, then ruby 11, amethyst 15, sapphire 19.
const FAMILY = {
  sword: { name: 'Sword', shape: 'sword', base: [28, 42, 10, .7, 70, 85, H(1, 1, 1, 1)], step: [3, 5, 2, 0, 0, 0] },
  axe: { name: 'Axe', shape: 'axe', base: [25, 45, 15, .8, 65, 80, H(4, 1, 1, 1)], step: [4, 6, 5, .04, 0, -2], hstep: H(4, 1, 1, 1) },
  hammer: { name: 'Hammer', shape: 'hammer', base: [10, 14, 20, .5, 60, 90, H(3, 4, 3, 4)], step: [2, 3, 8, 0, 0, 0], hstep: H(1, 2, 1, 2) },
  daggers: { name: 'Daggers', shape: 'dagger', base: [10, 13, 4, .3, 55, 95, H(1, 1, 1, 1)], step: [2, 3, 1, 0, 0, 0] },
  gloves: { name: 'Gloves', shape: 'fist', base: [14, 14, 7, .6, 30, 95, H(1, 1, 1, 1)], step: [4, 4, 4, 0, 0, -1.75] },
  spear: { name: 'Spear', shape: 'spear', base: [20, 30, 6, .9, 100, 85, H(1, 1, 1, 1)], step: [3, 4, 2, 0, 5, 0] },
};
const VARIANT = {
  sword: { id: 'katana', name: 'Katana', shape: 'katana', mod: { reload: -.12, dmg: -2, range: 10 } },
  axe: { id: 'labrys', name: 'Labrys', shape: 'labrys', mod: { dmg: 4, adm: -8, reload: .45, spin: true } },
  hammer: { id: 'pickaxe', name: 'Pickaxe', shape: 'pickaxe', mod: { dmg: -2, harvest: H(1, 8, 1, 7) } },
  daggers: { id: 'cleavers', name: 'Cleavers', shape: 'cleaver', mod: { reload: .1, adm: 4, harvest: H(1, 1, 3, 1) } },
  spear: { id: 'naginata', name: 'Naginata', shape: 'naginata', mod: { range: 60, reload: .15, dmg: 2 } },
};
const WEAPON_TIERS = ['stone', 'gold', 'ruby', 'amethyst', 'sapphire'];
for (const [fam, f] of Object.entries(FAMILY)) {
  WEAPON_TIERS.forEach((tier, k) => {
    const [dmg, adm, bdm, reload, range, speed, harvest] = f.base;
    const hv = Object.fromEntries(Object.entries(harvest).map(([r, v]) => [r, v + (f.hstep ? f.hstep[r] * k : (k >= 2 ? 1 : 0))]));
    const name = k === 0 ? (fam === 'sword' ? 'Stone Sword' : fam === 'daggers' ? 'Daggers' : `Stone ${f.name}`) : `${TIERS[tier].name} ${f.name}`;
    PRIMARY.push(weapon(`${tier}-${fam}`, name, fam, f.shape, tier, dmg + f.step[0] * k, adm + f.step[1] * k, bdm + f.step[2] * k,
      +(reload + f.step[3] * k).toFixed(2), range + f.step[4] * k, speed + f.step[5] * k, hv));
    if (k >= 1 && VARIANT[fam]) {
      const v = VARIANT[fam], m = v.mod;
      const base = PRIMARY[PRIMARY.length - 1];
      PRIMARY.push({
        ...base, id: `${tier}-${v.id}`, name: `${k === 1 ? '' : TIERS[tier].name + ' '}${v.name}`.trim(), shape: v.shape, variant: true,
        dmg: base.dmg + (m.dmg || 0), adm: base.adm + (m.adm || 0), reload: +(base.reload + (m.reload || 0)).toFixed(2),
        range: base.range + (m.range || 0), harvest: m.harvest ? Object.fromEntries(Object.entries(base.harvest).map(([r, val]) => [r, val + m.harvest[r] - 1])) : base.harvest,
        spin: !!m.spin,
      });
    }
  });
}

const PRIMARY_SPEEDS = {
  sword: [85, 83, 80, 78, 75], katana: [85, 80, 75, 70, 65],
  axe: [80, 78, 76, 75, 70], labrys: [80, 77, 76, 74, 70],
  hammer: [95, 94, 93, 92, 90], pickaxe: [95, 80, 78, 76, 75],
  daggers: [90, 89, 88, 86, 85], cleavers: [90, 86, 84, 82, 81],
  spear: [84, 83, 81, 79, 74], naginata: [84, 78, 75, 70, 68], gloves: [95, 93, 91, 89, 88],
};
for (const it of PRIMARY) if (it.id !== 'hand') it.speed = PRIMARY_SPEEDS[it.variant ? VARIANT[it.family].id : it.family][WEAPON_TIERS.indexOf(it.tier)];

const SECONDARY = [];
['stone', 'gold', 'ruby', 'amethyst', 'sapphire'].forEach((tier, k) => {
  SECONDARY.push({ id: `${tier}-bow`, name: `${TIERS[tier].name} Bow`, slot: 'secondary', family: 'bow', shape: 'bow', tier, dmg: 15 + 3 * k + (k > 2 ? 2 : 0), adm: 22 + 5 * k, bdm: 2 + k, reload: k >= 3 ? 1.2 : 1.3, range: 700, speed: 75, ammo: { wood: 5 + k }, projectile: 1100 });
  SECONDARY.push({ id: `${tier}-shield`, name: `${TIERS[tier].name} Shield`, slot: 'secondary', family: 'shield', shape: 'shield', tier, dmg: 6 + k, adm: 8 + k, bdm: 2, reload: .6, range: 35, speed: 75, block: .5 + .05 * k, knock: 110 });
  SECONDARY.push({ id: `${tier}-wrench`, name: `${TIERS[tier].name} Wrench`, slot: 'secondary', family: 'wrench', shape: 'wrench', tier, dmg: 8 + k, adm: 10 + k, bdm: 0, reload: .6, range: 60, speed: 90, repair: 30 + 15 * k });
  if (k >= 1) SECONDARY.push({ id: `${tier}-crossbow`, name: `${TIERS[tier].name} Crossbow`, slot: 'secondary', family: 'bow', shape: 'crossbow', tier, dmg: 20 + 3 * k, adm: 30 + 5 * k, bdm: 3 + k, reload: 1.55 - .05 * k, range: 900, speed: 62, ammo: { wood: 10 + 2 * k }, projectile: 1500 });
});
for (const [k, tier] of WEAPON_TIERS.entries()) if (k > 0) {
  for (const [id, dmg, reload, speed, ammo] of [['musket', 18+4*k, 1-.05*k, 80-2*k, {stone:8}], ['minigun', 5+2*k, .15, 65-2*k, {stone:2}]]) SECONDARY.push({id:`${tier}-${id}`,name:`${TIERS[tier].name} ${id === 'musket' ? 'Musket' : 'Minigun'}`,slot:'secondary',family:'bow',shape:'crossbow',variantId:id,tier,dmg,adm:dmg*.8,bdm:3,range:850,speed,reload,ammo,projectile:1600,spread:id==='minigun'?.14:0});
  for (const [id, block, skillBlock, touch] of [['crystal-shield',.3,.7,0],['spike-shield',.3,0,2]]) SECONDARY.push({id:`${tier}-${id}`,name:`${TIERS[tier].name} ${id==='crystal-shield'?'Crystal Shield':'Spike Shield'}`,slot:'secondary',family:'shield',shape:'shield',variantId:id,tier,dmg:8+k,adm:10+k,bdm:3,reload:.6,range:35,speed:70,block,skillBlock,touch});
}
for (const s of SECONDARY) if (s.tier === 'stone') s.name = s.name.replace('Stone ', s.family === 'bow' ? 'Stone ' : '');

for(const [k,tier] of WEAPON_TIERS.entries())SECONDARY.push({id:`${tier}-blowpipe`,name:`${TIERS[tier].name} Blowpipe`,slot:'secondary',family:'blowpipe',shape:'blowpipe',tier,dmg:4+k,adm:4+k,bdm:1,reload:1.55,range:700,speed:75,ammo:{wood:8+2*k,food:4+k},projectile:1000});
const TOOLS = [
  { id: 'bug-net', name: 'Bug Net', slot: 'tool', shape: 'net', tier: 'wood', reload: .8, range: 100, speed: 100, catch: true },
  { id: 'gold-bug-net', name: 'Golden Bug Net', slot: 'tool', shape: 'net', tier: 'gold', reload: .8, range: 145, speed: 95, catch: true },
  { id: 'saddle', name: 'Saddle', slot: 'tool', shape: 'saddle', tier: 'wood', reload: .5, range: 160, speed: 60, mount: true },
  ...['racing','battle','crystal','honey','turtle'].map(kind=>({id:`${kind}-saddle`,name:`${kind[0].toUpperCase()+kind.slice(1)} Saddle`,slot:'tool',shape:'saddle',tier:'gold',reload:.5,range:160,speed:60,mount:true,mountBuff:kind})),
  { id: 'appletor', name: 'Appletor', slot: 'tool', shape: 'appletor', tier: 'wood', reload: .7, range: 600, speed: 65, ammo: { food: 5 }, healPlayer: 10, healPet: 20, tameTool: 'appletor', projectile: 900 },
  { id: 'slingshot', name: 'Slingshot', slot: 'tool', shape: 'slingshot', tier: 'wood', reload: .85, range: 600, speed: 65, ammo: { stone: 5 }, dmg: 10, adm: 15, tameTool: 'slingshot', projectile: 1000 },
  { id: 'gold-appletor', name: 'Golden Appletor', slot: 'tool', shape: 'appletor', tier: 'gold', reload: .8, range: 650, speed: 55, ammo: { food: 10 }, healPlayer: 20, healPet: 40, tameTool: 'appletor', safer: true, projectile: 950 },
  { id: 'gold-slingshot', name: 'Golden Slingshot', slot: 'tool', shape: 'slingshot', tier: 'gold', reload: .7, range: 650, speed: 60, ammo: { stone: 8 }, dmg: 16, adm: 24, tameTool: 'slingshot', safer: true, projectile: 1100 },
];

const food = (id, name, icon, heal, cost, extra = {}) => ({ id, name, slot: 'food', shape: 'food', icon, heal, cost: { food: cost }, reload: .35, speed: 60, ...extra });
const FOODS = [
  food('apple', 'Apple', 'apple', 10, 5),
  food('cookie', 'Cookie', 'cookie', 12, 8),
  food('croissant', 'Croissant', 'waffle', 15, 10),
  food('waffle', 'Waffle', 'waffle', 18, 12),
  food('sandwich', 'Sandwich', 'sandwich', 8, 12, { hot: 4 }),
  food('salad', 'Salad', 'sandwich', 10, 15, { hot: 6 }),
  food('steak', 'Steak', 'steak', 12, 12, { armor: .1 }),
  food('eggs', 'Eggs', 'steak', 14, 14, { armor: .15 }),
  food('toffee', 'Toffee Candy', 'toffee', 12, 10, { haste: .05 }),
  food('biscuit', 'Biscuit', 'cookie', 12, 12, { haste: .1 }),
  food('cake', 'Cake', 'cake', 22, 15),
  food('soup', 'Mushroom Soup', 'soup', 12, 18, { hot: 8 }),
  food('meatballs', 'Meatballs', 'meatballs', 16, 18, { armor: .2 }),
  food('roll', 'Roll Cake', 'roll', 15, 16, { haste: .15 }),
];

const build = (id, name, kind, tier, cost, hp, limit, extra = {}) => ({ id, name, slot: kind, kind, tier, cost, hp, limit, speed: 60, reload: .25, ...extra });
const BUILDINGS = [];
const BT = ['wood', 'stone', 'gold', 'ruby', 'amethyst', 'sapphire'];
const wallCost = [{ wood: 10 }, { stone: 10 }, { wood: 10, gold: 10 }, { wood: 10, stone: 10, gold: 10 }, { wood: 5, stone: 15, gold: 20 }, { wood: 5, stone: 25, gold: 30 }];
const spikeCost = [{ wood: 20, stone: 10 }, { wood: 20, stone: 10 }, { wood: 10, gold: 30 }, { wood: 10, stone: 15, gold: 35 }, { wood: 10, stone: 20, gold: 45 }, { wood: 15, stone: 30, gold: 60 }];
const millCost = [{ wood: 50, stone: 10 }, { wood: 50, stone: 20 }, { wood: 50, gold: 50 }, { wood: 50, stone: 20, gold: 60 }, { wood: 50, stone: 30, gold: 70 }, { wood: 50, stone: 50, gold: 80 }];
const millGold = [[10, 10], [10, 7.5], [20, 7.5], [20, 5], [30, 5], [35, 2.5]];
const doorCost = [{ wood: 20 }, { stone: 20 }, { wood: 20, gold: 20 }, { wood: 20, stone: 20, gold: 20 }, { wood: 10, stone: 30, gold: 40 }, { wood: 10, stone: 50, gold: 60 }];
BT.forEach((tier, k) => {
  const T = TIERS[tier].name;
  BUILDINGS.push(build(`${tier}-wall`, `${T} Wall`, 'wall', tier, wallCost[k], [400, 600, 800, 900, 1000, 1200][k], 50, { r: 42 }));
  BUILDINGS.push(build(`${tier}-door`, `${T} Door`, 'door', tier, doorCost[k], [200, 300, 400, 500, 600, 800][k], 6, { r: 42 }));
  BUILDINGS.push(build(`${tier}-spike`, `${T} Spike`, 'spike', tier, spikeCost[k], [200, 300, 400, 500, 600, 700][k], 15, { r: 40, touch: 2 + k }));
  BUILDINGS.push(build(`${tier}-windmill`, `${T} Windmill`, 'windmill', tier, millCost[k], [200, 300, 400, 500, 600, 700][k], 5, { r: 44, gold: millGold[k][0], every: millGold[k][1] }));
});
BUILDINGS.push(
  build('big-spike', 'Big Stone Spike', 'spike', 'stone', { wood: 30, stone: 25 }, 400, 12, { r: 54, touch: 3, big: true }),
  build('wood-turret', 'Wooden Turret', 'turret', 'wood', { wood: 70, stone: 20 }, 120, 2, { r: 44, dmg: 10, every: 1, range: 650 }),
  build('stone-turret', 'Stone Turret', 'turret', 'stone', { wood: 80, stone: 30 }, 160, 2, { r: 44, dmg: 12, every: 1.5, range: 700 }),
  build('gold-turret', 'Golden Turret', 'turret', 'gold', { wood: 90, stone: 40, gold: 150 }, 200, 2, { r: 44, dmg: 15, every: 1.5, range: 750 }),
  build('fire-tower', 'Fire Tower', 'tower', 'wood', { wood: 70, stone: 20, gold: 20 }, 240, 1, { r: 44, dmg: 18, every: 7, range: 600, element: 'fire' }),
  build('boost-pad', 'Boost Pad', 'boost', 'wood', { wood: 30, stone: 30, gold: 100 }, 100, 10, { r: 40 }),
  build('bear-trap', 'Bear Trap', 'trap', 'stone', { wood: 20, stone: 40, gold: 50 }, 160, 4, { r: 40, dmg: 40, adm: 120 }),
  build('heal-pad', 'Heal Pad', 'heal', 'wood', { wood: 60, stone: 60, gold: 300 }, 500, 2, { r: 44, heal: 10, every: .6 }),
  build('big-boost-pad', 'Big Boost Pad', 'boost', 'gold', { wood: 40, stone: 40, gold: 150 }, 160, 10, { r: 54 }),
  build('big-heal-pad', 'Big Heal Pad', 'heal', 'gold', { wood: 80, stone: 80, gold: 400 }, 700, 2, { r: 56, heal: 15, every: .6 }),
);

for (const [k,tier] of ['ruby','amethyst','sapphire'].entries()) {
  const base=BUILDINGS.find(b=>b.id==='gold-turret'); BUILDINGS.push({...base,id:`${tier}-turret`,name:`${TIERS[tier].name} Turret`,tier,hp:240+k*60,dmg:18+k*3,cost:{wood:90,stone:50,gold:180+k*50}});
}
for (const [k,tier] of ['stone','gold','ruby','amethyst','sapphire'].entries()) {
  const base=BUILDINGS.find(b=>b.id==='fire-tower'); BUILDINGS.push({...base,id:`${tier}-tower`,name:`${TIERS[tier].name} Fire Tower`,tier,hp:300+k*80,dmg:22+k*4,cost:{wood:80,stone:30,gold:50+k*40}});
}
BUILDINGS.push(
  build('mega-boost-pad','Mega Boost Pad','boost','gold',{wood:30,stone:30,gold:150},100,10,{r:40,boostSpeed:1600}),
  build('mega-heal-pad','Mega Heal Pad','heal','gold',{wood:80,stone:80,gold:400},500,2,{r:44,heal:20,every:.6}),
  build('big-bear-trap','Big Bear Trap','trap','gold',{wood:30,stone:50,gold:100},300,4,{r:54,dmg:40,adm:120}),
  build('mega-bear-trap','Mega Bear Trap','trap','gold',{wood:30,stone:50,gold:100},160,4,{r:40,dmg:60,adm:180}),
);
const bigBoost=BUILDINGS.find(b=>b.id==='big-boost-pad');bigBoost.hp=1000;bigBoost.cost={wood:40,stone:40,gold:200};
// Upgrade the normal magic tower into its elemental or repair branch at age 9.
const normalTower=BUILDINGS.find(it=>it.id==='fire-tower');normalTower.name='Normal Magic Tower';normalTower.element='normal';normalTower.towerElement='normal';
for(const [k,tier]of ['stone','gold','ruby','amethyst','sapphire'].entries())for(const element of ['fire','ice','plant','electric','repair']){
  if(element==='fire'){const existing=BUILDINGS.find(it=>it.id===`${tier}-tower`);if(existing){existing.towerElement=element;continue;}}
  BUILDINGS.push(build(`${tier}-${element}-tower`,`${TIERS[tier].name} ${element[0].toUpperCase()+element.slice(1)} Tower`,'tower',tier,{wood:80,stone:30,gold:50+k*40},300+k*80,1,{r:44,dmg:22+k*4,every:7,range:600,element,towerElement:element}));
}
const bigBase=BUILDINGS.find(it=>it.id==='big-spike');bigBase.reference='Stone Big Spike';bigBase.hp=600;bigBase.touch=2;bigBase.cost={stone:25};
for(const [k,tier]of ['gold','ruby','amethyst','sapphire'].entries())BUILDINGS.push(build(`${tier}-big-spike`,`${TIERS[tier].name} Big Spike`,'spike',tier,{wood:20,stone:20+k*5,gold:40+k*20},700+k*100,12,{r:54,touch:2+k,big:true}));
BUILDINGS.push(build('ice-rampart','Ice Rampart','wall','sapphire',{},600,0,{r:65}));
const COSMETICS = [...PRIMARY, ...SECONDARY, ...BUILDINGS].filter(it => it.tier === 'sapphire' && it.id.startsWith('sapphire-')).flatMap(it => ['amber', 'diamond', 'emerald'].map(tier => ({ ...it, id: it.id.replace('sapphire-', `${tier}-`), tier, name: it.name.replace('Sapphire', TIERS[tier].name) })));
export const ITEMS = [...PRIMARY, ...SECONDARY, ...TOOLS, ...FOODS, ...BUILDINGS, ...COSMETICS];
// Preserve original identifiers/art while using public numeric weapon and structure values.
const title = (text='wood') => text.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
for (const it of ITEMS) {
  const tier = it.tier === 'wood' ? 'Wooden' : it.tier === 'gold' ? 'Golden' : title(it.tier);
  let name = it.id==='hand'?'Hand':it.slot==='primary'?`${tier} ${title(it.variant ? VARIANT[it.family].id : it.family)}`:it.slot==='secondary'?`${tier} ${title(it.variantId || (it.shape==='crossbow'?'crossbow':it.family))}`:it.name;
  if(it.kind && !['ice-rampart','fire-tower'].includes(it.id))name=`${tier} ${title(it.kind)}`;
  if(it.kind==='tower')name=`${tier} ${title(it.towerElement||'fire')} Tower`;
  if(it.id==='fire-tower')continue;
  if(it.big && it.kind==='spike')name=`${it.tier==='stone'?'Stone':tier} Big Spike`;
  if(['boost','heal','trap'].includes(it.kind))name=it.name;
  const ref=ITEM_REFERENCE[name] || (['amber','diamond','emerald'].includes(it.tier) ? ITEM_REFERENCE[name.replace(tier,'Sapphire')] : null);if(!ref)continue;
  it.reference=name;it.source='https://tamingio.fandom.com/wiki/Module:Items/data';
  const v=ref.properties||{};
  for(const [field,key]of Object.entries({speed:'speed',dmg:'player_damage',adm:'animal_damage',bdm:'building_damage',range:'range',knock:'knockback',hp:'durability',limit:'maximum',heal:'heal',healPlayer:'player_heal',healPet:'animal_heal'}))if(typeof v[key]==='number')it[field]=v[key];
  if(typeof v.damage==='number'){it.dmg=v.player_damage??v.damage;it.adm=v.animal_damage??v.damage;}
  if(it.slot==='primary'&&it.family==='hand')it.adm=it.dmg;
  if(it.slot==='primary')it.harvest={wood:1,stone:1,food:1,gold:1,...ref.harvest};
  if(v.reload){if(['turret','tower','windmill'].includes(it.kind))it.every=v.reload;else it.reload=v.reload;}
  if(it.kind==='windmill'&&ref.harvest?.gold)it.gold=ref.harvest.gold;
  if(ref.recipe){if(it.ammo)it.ammo=ref.recipe;else if(it.kind||it.slot==='food')it.cost=ref.recipe;}
  if(v.protection)it.block=parseFloat(v.protection)/100;
  if(v.magic_protection)it.skillBlock=parseFloat(v.magic_protection)/100;
  if(it.shape==='shield'&&it.variantId==='spike-shield')it.touch=v.damage||2;
  if(it.kind==='spike'&&v.damage)it.touch=v.damage;
  if(it.kind==='heal')it.heal=it.id==='mega-heal-pad'?15:10;
  if(it.kind==='boost'&&it.id==='mega-boost-pad')it.boostSpeed=1600;
}
export const ITEM_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
export const STARTING_ITEMS = ['hand', 'apple', 'wood-wall', 'wood-spike', 'wood-windmill', 'wood-door'];
export const START_RESOURCES = { food: 60, wood: 60, stone: 60, gold: 0 };
/** Food spent on every taming try, win or lose. */
export const TAME_FOOD = 12;
export const SLOT_ORDER = ['primary', 'food', 'wall', 'spike', 'windmill', 'door', 'secondary', 'tool', 'turret', 'tower', 'boost', 'trap', 'heal'];
export const BUILD_LIMIT = 105;

// ---------------- leveling ----------------

/** Each age costs 40 more XP than the last; total XP at age a is 20*a*(a+1). */
export const xpForAge = age => 40 * (age + 1);
export const totalXp = (age, xp = 0) => 20 * age * (age + 1) + xp;
export const MAX_AGE = 100;
export const LAST_CHOICE_AGE = 27;

const slotItem = (items, slot) => items.map(id => ITEM_BY_ID.get(id)).find(it => it?.slot === slot);
function nextTier(items, slot) {
  const cur = slotItem(items, slot);
  if (!cur) return null;
  const want = TIER_ORDER[tierRank(cur.tier) + 1];
  const it = ITEMS.find(x => x.slot === slot && x.tier === want && (x.family ? x.family === cur.family && !!x.variant === !!cur.variant && x.shape === cur.shape && x.variantId===cur.variantId : !!x.big===!!cur.big && x.towerElement===cur.towerElement));
  return it?.id || null;
}
function primaryAtTier(items, tier) {
  const cur = slotItem(items, 'primary');
  if (!cur || cur.family === 'hand') return [`${tier}-sword`];
  if (tier !== 'gold') return [`${tier}-${cur.variant ? VARIANT[cur.family].id : cur.family}`];
  const out = [`${tier}-${cur.family}`];
  const v = VARIANT[cur.family];
  if (v && ITEM_BY_ID.has(`${tier}-${v.id}`)) out.push(`${tier}-${v.id}`);
  if (cur.variant) out.reverse();
  return out;
}
function secondaryAtTier(items, tier) {
  const cur = slotItem(items, 'secondary');
  if (!cur) return [`${tier}-bow`, `${tier}-shield`, `${tier}-wrench`, `${tier}-blowpipe`].filter(id => ITEM_BY_ID.has(id));
  // The branch is selected at gold and stays selected at later ages.
  const branches = tier === 'gold' ? cur.family === 'bow' ? ['bow','crossbow','musket','minigun'] : cur.family === 'shield' ? ['shield','crystal-shield','spike-shield'] : ['wrench'] : [cur.variantId || cur.shape];
  return branches.map(branch => `${tier}-${branch}`).filter(id => ITEM_BY_ID.has(id));
}
const cosmetics = (items, slot) => { const cur = slotItem(items, slot); return cur?.tier === 'sapphire' ? ['amber','diamond','emerald'].map(t => cur.id.replace('sapphire-', `${t}-`)) : []; };
function buildingTier(items) {
  const selected = items.map(id => ITEM_BY_ID.get(id)).filter(it => ['spike','windmill','door','turret','tower'].includes(it.kind) && (it.tier !== 'wood' || ['tower','turret'].includes(it.kind))).sort((a,b)=>tierRank(b.tier)-tierRank(a.tier))[0];
  if (!selected) return [];
  if (selected.tier === 'sapphire') return cosmetics(items, selected.slot);
  if(selected.kind==='tower'&&selected.towerElement==='normal')return ['fire','ice','plant','electric','repair'].map(element=>`stone-${element==='fire'?'tower':element+'-tower'}`);
  const next = nextTier(items, selected.slot);
  return next ? [next] : [];
}
const wallOrFood = (items, foods) => slotItem(items,'wall')?.tier !== 'wood' ? [nextTier(items,'wall')].filter(Boolean) : foods;

// Upgrade offered at each age, modelled on the documented upgrade tree.
export const AGE_TREE = {
  1: () => ['stone-sword', 'stone-axe', 'stone-hammer', 'stone-daggers', 'stone-spear', 'stone-gloves'],
  2: () => ['cookie', 'stone-wall'],
  3: () => ['stone-windmill', 'stone-spike', 'big-spike', 'wood-turret', 'fire-tower', 'stone-door'],
  4: items => secondaryAtTier(items, 'stone'),
  5: () => ['appletor', 'slingshot', 'bug-net', 'saddle'],
  6: items => primaryAtTier(items, 'gold'),
  7: items => wallOrFood(items, ['croissant', 'sandwich', 'steak', 'toffee']),
  8: () => ['boost-pad', 'bear-trap', 'heal-pad'],
  9: items => buildingTier(items),
  10: items => secondaryAtTier(items, 'gold'),
  11: items => primaryAtTier(items, 'ruby'),
  12: items => wallOrFood(items, [({croissant:'waffle',sandwich:'salad',steak:'eggs',toffee:'biscuit'})[slotItem(items,'food')?.id]].filter(Boolean)),
  13: items => buildingTier(items),
  14: items => secondaryAtTier(items, 'ruby'),
  15: items => primaryAtTier(items, 'amethyst'),
  16: items => wallOrFood(items, [({waffle:'cake',salad:'soup',eggs:'meatballs',biscuit:'roll'})[slotItem(items,'food')?.id]].filter(Boolean)),
  17: items => buildingTier(items),
  18: items => secondaryAtTier(items, 'amethyst'),
  19: items => primaryAtTier(items, 'sapphire'),
  20: items => [...buildingTier(items), ...wallOrFood(items, [])],
  21: items => secondaryAtTier(items, 'sapphire'),
  22: items => cosmetics(items, 'primary'),
  23: items => buildingTier(items),
  24: items => cosmetics(items, 'secondary'),
  25: items => slotItem(items,'tool')?.mount ? ['racing','battle','crystal','honey','turtle'].map(kind=>`${kind}-saddle`) : [slotItem(items,'tool')?.catch ? 'gold-bug-net' : slotItem(items,'tool')?.id === 'slingshot' ? 'gold-slingshot' : 'gold-appletor'],
  26: items => slotItem(items,'boost') ? ['big-boost-pad','mega-boost-pad'] : slotItem(items,'heal') ? ['big-heal-pad','mega-heal-pad'] : slotItem(items,'trap') ? ['big-bear-trap','mega-bear-trap'] : [],
  27: items => buildingTier(items),
};
export function ageChoices(age, items) {
  const fn = AGE_TREE[age];
  if (!fn) return [];
  const have = new Set(items);
  return [...new Set(fn(items))].filter(id => id && ITEM_BY_ID.has(id) && !have.has(id));
}

// ---------------- pets ----------------
// Elemental types: attacker type vs defender type multiplies pet damage.
export const TYPES = {
  normal: { color: '#c8c2b0', strong: [], weak: ['rock', 'shadow'] },
  fire: { color: '#ff7a2e', strong: ['plant', 'insect', 'ice'], weak: ['rock', 'water', 'fire'] },
  water: { color: '#3d9cf0', strong: ['rock', 'fire'], weak: ['water', 'plant'] },
  plant: { color: '#5cc34a', strong: ['rock', 'water'], weak: ['plant', 'poison', 'insect', 'fire'] },
  electric: { color: '#ffd23f', strong: ['water'], weak: ['rock', 'electric', 'plant'] },
  ice: { color: '#8fe3ff', strong: ['plant'], weak: ['water', 'fire', 'ice'] },
  poison: { color: '#b062e0', strong: ['plant', 'combat', 'shadow'], weak: ['rock', 'poison', 'insect'] },
  rock: { color: '#b0916a', strong: ['electric', 'poison', 'insect', 'fire', 'ice'], weak: ['combat'] },
  combat: { color: '#e0533d', strong: ['normal', 'rock', 'ice'], weak: ['poison', 'insect', 'shadow'] },
  insect: { color: '#a3c43a', strong: ['plant', 'poison'], weak: ['combat', 'fire', 'shadow'] },
  shadow: { color: '#6b5bb8', strong: ['normal', 'combat'], weak: ['poison', 'shadow'] },
};
TYPES['normal'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['normal'].weak = ["rock", "shadow"];
TYPES['rock'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['rock'].weak = ["combat", "ancient"];
TYPES['water'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['water'].weak = ["water", "plant", "dragon"];
TYPES['electric'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['electric'].weak = ["rock", "electric", "plant", "dragon"];
TYPES['plant'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['plant'].weak = ["plant", "poison", "insect", "fire", "dragon"];
TYPES['poison'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['poison'].weak = ["rock", "poison", "insect"];
TYPES['insect'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['insect'].weak = ["combat", "fire", "shadow", "fairy", "ancient"];
TYPES['combat'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['combat'].weak = ["poison", "insect", "shadow", "fairy"];
TYPES['fire'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['fire'].weak = ["rock", "water", "fire", "dragon"];
TYPES['ice'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['ice'].weak = ["water", "fire", "ice"];
TYPES['shadow'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['shadow'].weak = ["poison", "shadow", "fairy"];
TYPES['dragon'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['dragon'].weak = ["fairy"];
TYPES['fairy'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['fairy'].weak = ["rock", "fire", "ancient"];
TYPES['ancient'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['ancient'].weak = ["ice", "dragon", "ancient"];
TYPES['rock'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['rock'].strong = ["electric", "poison", "insect", "fire", "ice", "fairy"];
TYPES['water'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['water'].strong = ["rock", "fire"];
TYPES['electric'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['electric'].strong = ["water", "fairy"];
TYPES['plant'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['plant'].strong = ["rock", "water"];
TYPES['poison'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['poison'].strong = ["plant", "combat", "shadow"];
TYPES['insect'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['insect'].strong = ["plant", "poison"];
TYPES['combat'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['combat'].strong = ["normal", "rock", "ice"];
TYPES['fire'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['fire'].strong = ["plant", "insect", "ice", "ancient"];
TYPES['ice'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['ice'].strong = ["plant", "dragon", "ancient"];
TYPES['shadow'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['shadow'].strong = ["normal", "combat"];
TYPES['dragon'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['dragon'].strong = ["dragon", "ancient"];
TYPES['fairy'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['fairy'].strong = ["combat", "shadow", "dragon"];
TYPES['ancient'] ||= { color:'#9d8c72', strong:[], weak:[] }; TYPES['ancient'].strong = ["rock", "electric", "insect", "fire", "fairy"];
export function typeMultiplier(attacker, defender) {
  if (!attacker || !defender) return 1;
  let m = 1;
  for (const d of defender) {
    if (TYPES[attacker].strong.includes(d)) m *= 2;
    else if (TYPES[attacker].weak.includes(d)) m *= .5;
  }
  return Math.max(.25, Math.min(4, m));
}

// Skills: one per pet, cast with the skill key. Cooldown shortens as the pet grows.
export const SKILLS = {
  hindrance: { name: 'Burning Hindrance', cd: 21, desc: 'Fiery curse blocks solid buildings and pet skills.' },
  blaze: { name: 'Blaze', cd: 30, desc: 'Burst of flame that burns nearby enemies.' },
  vines: { name: 'Draining Vines', cd: 20, desc: 'Roots the target, draining health back to the pet.' },
  wave: { name: 'Tidal Wave', cd: 28, desc: 'A wave that pushes enemies away.' },
  thunder: { name: 'Thunder', cd: 30, desc: 'Lightning strike; may paralyse.' },
  frost: { name: 'Frost Wall', cd: 30, desc: 'Icy ring that may freeze enemies.' },
  venom: { name: 'Venom Cloud', cd: 28, desc: 'Poison cloud around the pet.' },
  boulder: { name: 'Rolling Shell', cd: 26, desc: 'Charges forward like a cannonball.' },
  scratch: { name: 'Fury Scratch', cd: 25, desc: 'Three rapid heavy swipes.' },
  swarm: { name: 'Swarm', cd: 28, desc: 'Stings every enemy around.' },
  shade: { name: 'Shadow Step', cd: 26, desc: 'Teleports behind the target and strikes.' },
  rally: { name: 'Rally', cd: 30, desc: 'Heals its tamer and the pack.' },
};

// hp, bite and speed are [baby, adult, boss]. tame is base percent.
// temper: passive (never attacks), coward (flees when hurt), neutral (fights back), aggressive (hunts players).
const pet = (id, name, biome, body, color, accent, types, rarity, tame, tool, temper, hp, bite, speed, skill, extra = {}) =>
  ({ id, name, biome, body, color, accent, types, rarity, tame, tool, temper, hp, bite, speed, skill, ...extra });

export const PETS = [
  // forest: the three starters have high tame chances
  pet('wolf', 'Wolf', 'forest', 'canine', '#9aa0a8', '#e9ecef', ['fire'], 'common', 66, 'slingshot', 'aggressive', [200, 400, 1000], [6, 12, 30], [200, 250, 280], 'blaze', { mark: '#ff7a2e' }),
  pet('rabbit', 'Rabbit', 'forest', 'rabbit', '#e8dcc8', '#f6b6c0', ['plant'], 'common', 66, 'appletor', 'passive', [150, 250, 700], [3, 4, 14], [270, 290, 370], 'vines'),
  pet('bear', 'Bear', 'forest', 'bear', '#7b5232', '#c99a6b', ['water'], 'common', 66, 'slingshot', 'neutral', [300, 600, 1500], [4, 8, 19], [200, 240, 250], 'wave'),
  pet('fox', 'Fox', 'forest', 'fox', '#e8813a', '#fff1dc', ['electric'], 'rare', 14, 'appletor', 'coward', [200, 400, 1000], [4, 8, 19], [240, 280, 310], 'thunder'),
  pet('boar', 'Boar', 'forest', 'boar', '#8a5e3c', '#3e2a1c', ['poison'], 'rare', 10, 'slingshot', 'neutral', [300, 600, 1250], [4, 12, 24], [240, 270, 310], 'venom'),
  pet('hedgehog', 'Hedgehog', 'forest', 'hedgehog', '#a77b55', '#5b3d26', ['fire'], 'rare', 12, 'appletor', 'neutral', [300, 700, 1200], [4, 10, 22], [210, 260, 290], 'hindrance'),
  pet('deer', 'Deer', 'forest', 'deer', '#c08a55', '#efe2c2', ['plant'], 'rare', 12, 'appletor', 'coward', [250, 500, 1100], [4, 9, 20], [260, 300, 340], 'rally', { pattern: 'spots' }),
  pet('owl', 'Owl', 'forest', 'bird', '#a07d52', '#e5cf9e', ['normal'], 'epic', 8, 'slingshot', 'neutral', [180, 360, 900], [5, 11, 26], [260, 300, 360], 'scratch'),
  // winter
  pet('penguin', 'Penguin', 'winter', 'bird', '#2f3b4a', '#f4efe2', ['ice'], 'common', 10, 'appletor', 'passive', [200, 400, 800], [4, 8, 16], [240, 270, 330], 'frost'),
  pet('lynx', 'Lynx', 'winter', 'cat', '#cdbb9a', '#5b4a38', ['combat'], 'rare', 10, 'slingshot', 'aggressive', [200, 400, 800], [6, 14, 30], [200, 250, 280], 'scratch', { pattern: 'spots' }),
  pet('arctic-fox', 'Arctic Fox', 'winter', 'fox', '#f2efe8', '#a9c6d6', ['ice'], 'common', 18, 'appletor', 'coward', [180, 360, 900], [4, 9, 20], [250, 290, 330], 'frost'),
  pet('polar-bear', 'Polar Bear', 'winter', 'bear', '#f3f1ea', '#b9d7e3', ['ice', 'water'], 'epic', 8, 'slingshot', 'aggressive', [350, 700, 1700], [5, 11, 24], [190, 230, 250], 'wave'),
  pet('reindeer', 'Reindeer', 'winter', 'deer', '#8d6a4a', '#e8dcc4', ['ice'], 'rare', 12, 'appletor', 'neutral', [260, 520, 1200], [4, 10, 22], [260, 300, 340], 'rally'),
  // darkness
  pet('bat', 'Bat', 'darkness', 'bat', '#3b3150', '#73d9b1', ['shadow'], 'common', 16, 'slingshot', 'neutral', [150, 300, 700], [5, 10, 22], [280, 310, 380], 'shade'),
  pet('black-cat', 'Black Cat', 'darkness', 'cat', '#2a2733', '#ffd23f', ['shadow'], 'rare', 12, 'appletor', 'coward', [200, 400, 900], [5, 11, 25], [260, 300, 340], 'shade'),
  pet('spider', 'Spider', 'darkness', 'spider', '#29263d', '#aa79bf', ['insect', 'poison'], 'rare', 10, 'slingshot', 'aggressive', [180, 360, 850], [6, 12, 26], [230, 270, 310], 'venom'),
  pet('raven', 'Raven', 'darkness', 'bird', '#22243a', '#9a86bd', ['shadow'], 'epic', 8, 'slingshot', 'neutral', [180, 360, 900], [6, 13, 28], [270, 310, 370], 'shade'),
  pet('glow-moth', 'Glow Moth', 'darkness', 'insect', '#5ad6b0', '#d6fff1', ['insect', 'electric'], 'legendary', 4, 'appletor', 'passive', [160, 320, 800], [4, 9, 22], [270, 300, 360], 'thunder'),
  // desert
  pet('camel', 'Camel', 'desert', 'goat', '#d6a15f', '#8e5f2f', ['normal'], 'common', 18, 'appletor', 'passive', [300, 600, 1300], [3, 7, 16], [200, 230, 270], 'rally'),
  pet('scorpion', 'Scorpion', 'desert', 'scorpion', '#d9a92c', '#7e4d12', ['insect', 'poison'], 'rare', 10, 'slingshot', 'aggressive', [200, 400, 900], [6, 13, 28], [220, 260, 300], 'venom'),
  pet('armadillo', 'Armadillo', 'desert', 'turtle', '#c69a72', '#8a6545', ['rock'], 'rare', 14, 'slingshot', 'neutral', [400, 800, 1500], [3, 6, 12], [220, 270, 300], 'boulder'),
  pet('snake', 'Sand Snake', 'desert', 'serpent', '#c6a24a', '#7a5a1e', ['poison'], 'rare', 10, 'slingshot', 'aggressive', [180, 360, 850], [6, 13, 27], [240, 280, 320], 'venom', { pattern: 'spots' }),
  pet('caracal', 'Caracal', 'desert', 'cat', '#c98d55', '#3b2a1c', ['combat'], 'epic', 7, 'slingshot', 'neutral', [220, 440, 950], [7, 15, 32], [260, 300, 350], 'scratch'),
  // ocean
  pet('crab', 'Crab', 'ocean', 'crab', '#e0533d', '#ffb3a2', ['water', 'rock'], 'common', 16, 'slingshot', 'neutral', [250, 500, 1100], [4, 9, 20], [200, 230, 270], 'boulder'),
  pet('turtle', 'Sea Turtle', 'ocean', 'turtle', '#5f9a52', '#7b5a32', ['water'], 'rare', 12, 'appletor', 'passive', [400, 900, 1800], [3, 6, 13], [170, 200, 240], 'wave'),
  pet('seal', 'Seal', 'ocean', 'seal', '#8da2b3', '#e0e8ee', ['water', 'ice'], 'rare', 12, 'appletor', 'coward', [260, 520, 1200], [4, 9, 20], [230, 270, 310], 'wave'),
  pet('axolotl', 'Axolotl', 'ocean', 'lizard', '#f5a3c0', '#e05a8c', ['water'], 'epic', 8, 'appletor', 'passive', [150, 300, 800], [3, 4, 12], [260, 270, 330], 'rally'),
  pet('shark', 'Shark', 'ocean', 'fish', '#6b7f95', '#e8eef2', ['water', 'combat'], 'legendary', 4, 'slingshot', 'aggressive', [300, 650, 1500], [8, 16, 34], [260, 300, 360], 'scratch'),
  // volcano
  pet('salamander', 'Salamander', 'volcano', 'lizard', '#e0532d', '#ffcf3a', ['fire'], 'common', 14, 'appletor', 'neutral', [200, 400, 950], [5, 11, 24], [240, 280, 320], 'blaze', { pattern: 'spots' }),
  pet('magma-boar', 'Magma Boar', 'volcano', 'boar', '#4b3431', '#ff7b2e', ['fire', 'rock'], 'rare', 10, 'slingshot', 'aggressive', [320, 640, 1400], [5, 13, 26], [230, 260, 300], 'boulder'),
  pet('ember-fox', 'Ember Fox', 'volcano', 'fox', '#c73b1e', '#ffd23f', ['fire', 'electric'], 'epic', 8, 'appletor', 'coward', [200, 420, 1000], [5, 10, 24], [260, 300, 340], 'thunder'),
  pet('phoenix', 'Phoenix', 'volcano', 'bird', '#ff7a1f', '#ffd23f', ['fire'], 'legendary', 4, 'appletor', 'neutral', [220, 480, 1200], [7, 15, 32], [280, 320, 380], 'blaze', { pattern: 'flame' }),
];
for (const [id, name, biome, body, types, skill] of [
  ['grove-spirit', 'Grove Spirit', 'forest', 'deer', ['plant'], 'vines'],
  ['ice-spirit', 'Ice Spirit', 'winter', 'fox', ['ice'], 'frost'],
  ['dune-spirit', 'Dune Spirit', 'desert', 'serpent', ['rock'], 'boulder'],
]) PETS.push(pet(id, name, biome, body, '#c4b688', '#f0d390', types, 'legendary', 4, 'appletor', 'neutral', [200, 450, 1200], [5, 12, 28], [200, 240, 280], skill));
// Stable IDs retain old clients' species references. Every animal uses a sourced stat/skill definition.
const extraAnimals = [
  ['cow','forest','bear','normal'],['bull','forest','bear','rock'],['dog','forest','canine','normal'],
  ['fire-fairy','forest','bird','fire'], ['water-fairy','forest','bird','water'],
  ['iceberg','winter','turtle','ice'], ['living-mushroom','darkness','bear','combat'],
  ['white-spider','darkness','spider','normal'], ['stone-golem','desert','bear','rock'],
  ['volcanic-golem','volcano','bear','fire'], ['mantle','volcano','turtle','rock'], ['octopus','ocean','octopus','water'],
];
for (const [id,biome,body,type] of extraAnimals) PETS.push(pet(id, id, biome, body, '#827566', '#c6bc92', [type], 'legendary', 8, 'slingshot','neutral',[200,400,1000],[4,8,20],[200,240,280],'blaze'));
const REFERENCE_BIOMES = { 'deer':'winter', 'owl':'darkness' };
for (const def of PETS) {
  const ref = ANIMAL_REFERENCE[def.id];
  if (!ref) throw new Error(`Missing animal reference: ${def.id}`);
  Object.assign(def, { name:ref.reference, reference:ref.reference, source:ref.source, hp:ref.hp, bite:ref.bite, speed:ref.speed, weight:ref.weight, regen:ref.regen, regenDelay:ref.regenDelay, types:ref.types, tame:ref.tame, tool:ref.tool, mountable:ref.mountable, shieldable:ref.shieldable, ability:ref.ability, skillStats:ref.skillStats, skill:`ability-${def.id}` });
  if (REFERENCE_BIOMES[def.id]) def.biome=REFERENCE_BIOMES[def.id];
  SKILLS[def.skill] = { name:ref.skillName, cd:ref.skillStats[0].reload, desc:ref.ability.replaceAll('-',' ') };
}
for (const id of ['grove-spirit','ice-spirit','dune-spirit','fire-fairy','water-fairy','iceberg','living-mushroom','white-spider','stone-golem','volcanic-golem','mantle','octopus','phoenix']) PETS.find(p=>p.id===id).bossOnly=true;
PETS.find(p=>p.id==='snake').body='deer';
PETS.find(p=>p.id==='turtle').body='fish';
PETS.find(p=>p.id==='magma-boar').body='bear';
export const PET_BY_ID = new Map(PETS.map(p => [p.id, p]));
export const RARITY = {
  common: { color: '#a3adb8', label: 'Common' },
  rare: { color: '#4aa3ff', label: 'Rare' },
  epic: { color: '#b45cff', label: 'Epic' },
  legendary: { color: '#ffb02e', label: 'Legendary' },
};
export const PET_STAGE = ['Baby', 'Adult', 'Boss'];
export const PET_XP = [500, 2500];
export const MAX_PETS = 3;

// Stationary bosses, one per biome. They sleep until someone attacks them;
// a kill pays everyone who helped and drops three sleeping babies from that biome.
export const BOSSES = [
  { id: 'old-oak', name: 'Old Oak', biome: 'forest', body: 'treant', color: '#6b4a2b', accent: '#97cf3a', hp: 8000, dmg: 60, reach: 230, every: 1.6, gold: 5000, xp: 4500, minions: 'wolf' },
  { id: 'frost-golem', name: 'Frost Golem', biome: 'winter', body: 'golem', color: '#9fe3f5', accent: '#e9fbff', hp: 9000, dmg: 55, reach: 220, every: 1.8, gold: 5000, xp: 4500, minions: 'arctic-fox' },
  { id: 'shade-cap', name: 'Shade Cap', biome: 'darkness', body: 'mushroom', color: '#7a5fd0', accent: '#7dfcd2', hp: 8000, dmg: 50, reach: 220, every: 1.4, gold: 5000, xp: 4000, minions: 'spider' },
  { id: 'sand-colossus', name: 'Sand Colossus', biome: 'desert', body: 'golem', color: '#c69a5c', accent: '#f0d090', hp: 9500, dmg: 60, reach: 230, every: 1.8, gold: 5500, xp: 4500, minions: 'scorpion' },
  { id: 'deep-kraken', name: 'Deep Kraken', biome: 'ocean', body: 'kraken', color: '#b0477a', accent: '#ff9ac9', hp: 9000, dmg: 55, reach: 260, every: 1.6, gold: 5500, xp: 4800, minions: 'crab' },
  { id: 'magma-titan', name: 'Magma Titan', biome: 'volcano', body: 'golem', color: '#5c3b33', accent: '#ff7b2e', hp: 10000, dmg: 65, reach: 230, every: 1.8, gold: 6000, xp: 5000, minions: 'salamander' },
];
for (const b of BOSSES) {
  Object.assign(b, BOSS_PROFILES[b.id]);b.minions=b.drops[0];b.cycle=b.attacks.map(a=>a.kind);
  for(const id of b.drops)PETS.find(p=>p.id===id).rarity='legendary';
}
export const BOSS_BY_ID = new Map(BOSSES.map(b => [b.id, b]));

// One head slot and one accessory slot. Owned equipment persists through death.
export const HATS = EQUIPMENT_HATS;
export const ACCESSORIES = EQUIPMENT_ACCESSORIES;
export const ACCESSORY_BY_ID = new Map(ACCESSORIES.map(a => [a.id,a]));
export const HAT_BY_ID = new Map(HATS.map(h => [h.id,h]));
