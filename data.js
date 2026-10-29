// Shared clean-room game content. No DOM or Worker globals: imported by the
// browser client, the shared simulation and the Cloudflare Worker.
// Mechanics follow publicly documented Taming.io behaviour; all names, art and
// code here are original.

export const WORLD = { w: 9600, h: 9600 };
export const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };

// ---------------- biomes (fixed regions of the map) ----------------
// The map is a 3x3 grid of square regions with hard edges: forest in the
// middle, where everyone spawns, and the harsher biomes around it. Each
// biome has its own resources, wild animals and a sleeping boss.
export const BIOMES = [
  {
    id: 'forest', name: 'Forest', ground: '#62813b', decor: '#56732f', pebble: '#7a9a4a', tuft: 'grass',
    tree: ['#97cf3a', '#b5e04f', '#2f4a14'], treeStyle: 'star', rock: ['#a59a87', '#c2b8a6', '#3b3229'],
    bush: ['#4f8a2f', '#66a63c', '#24401a'], berry: '#e2413b', boss: 'old-oak',
    mix: [['tree', .36], ['rock', .3], ['bush', .22], ['gold', .05], ['log', .07]],
  },
  {
    id: 'winter', name: 'Winter', ground: '#d6cbbb', decor: '#c7bba9', pebble: '#ece5d9', tuft: 'flake',
    tree: ['#f4f0e6', '#ffffff', '#6d6f6c'], treeStyle: 'snow', rock: ['#a9b6bd', '#cdd8dc', '#3f4a52'],
    bush: ['#7fa3a0', '#a1c3bc', '#30464a'], berry: '#5aa8e6', boss: 'frost-golem',
    mix: [['tree', .38], ['rock', .32], ['bush', .16], ['gold', .07], ['log', .07]],
  },
  {
    id: 'darkness', name: 'Darkness', ground: '#393361', decor: '#2f2a52', pebble: '#4e4680', tuft: 'grass',
    tree: ['#7a5fd0', '#9d86ea', '#1a1433'], treeStyle: 'mushroom', rock: ['#5a5778', '#77749a', '#17152a'],
    bush: ['#3d6f7a', '#4f8d99', '#112a30'], berry: '#7dfcd2', dark: true, boss: 'shade-cap',
    mix: [['tree', .34], ['rock', .3], ['bush', .22], ['gold', .08], ['log', .06]],
  },
  {
    id: 'desert', name: 'Desert', ground: '#bc8c4a', decor: '#a97a3c', pebble: '#d4a461', tuft: 'swirl',
    tree: ['#d9673b', '#ef8b55', '#4a2414'], treeStyle: 'dead', rock: ['#b9814f', '#d6a06c', '#4a2f1b'],
    bush: ['#8a9a3c', '#a6b752', '#3b4216'], berry: '#e2413b', boss: 'sand-colossus',
    mix: [['tree', .22], ['rock', .36], ['bush', .1], ['gold', .1], ['cactus', .16], ['log', .06]],
  },
  {
    id: 'ocean', name: 'Ocean', ground: '#326395', decor: '#3d73a8', pebble: '#4f86bb', tuft: 'wave',
    tree: ['#3f9a6a', '#58b884', '#123425'], treeStyle: 'kelp', rock: ['#3e6f8a', '#5a8eaa', '#1d3646'],
    bush: ['#e8664f', '#ff8a6c', '#4a1a12'], berry: '#ffd2a8', boss: 'deep-kraken',
    mix: [['tree', .34], ['rock', .3], ['bush', .24], ['gold', .06], ['log', .06]],
  },
  {
    id: 'volcano', name: 'Volcano', ground: '#4f3335', decor: '#432a2c', pebble: '#ff7b2e', tuft: 'crack',
    tree: ['#e0612e', '#ff8b45', '#3a1208'], treeStyle: 'dead', rock: ['#5c4b47', '#7b6762', '#1c1412'],
    bush: ['#7b3b2c', '#9c5038', '#2a120c'], berry: '#ffb02e', meteors: true, boss: 'magma-titan',
    mix: [['tree', .2], ['rock', .42], ['bush', .12], ['gold', .16], ['log', .1]],
  },
];
export const BIOME_BY_ID = Object.fromEntries(BIOMES.map(b => [b.id, b]));
// Rows of the 3x3 map, north to south.
export const BIOME_GRID = [
  ['winter', 'winter', 'darkness'],
  ['ocean', 'forest', 'darkness'],
  ['desert', 'desert', 'volcano'],
];
export const BIOME_CELL = WORLD.w / 3;
const cellOf = v => Math.max(0, Math.min(2, Math.floor(v / BIOME_CELL)));
export function biomeAt(x, y) { return BIOME_BY_ID[BIOME_GRID[cellOf(y)][cellOf(x)]]; }
/** The squares { x, y, w, h } that make up a biome. */
export function biomeCells(id) {
  const out = [];
  BIOME_GRID.forEach((row, j) => row.forEach((b, i) => { if (b === id) out.push({ x: i * BIOME_CELL, y: j * BIOME_CELL, w: BIOME_CELL, h: BIOME_CELL }); }));
  return out;
}

// Resource node kinds. `yields` maps gather to a resource; `per` multiplies
// the weapon's harvest for that node; `hurts` is contact damage per tick.
// Sizes follow the reference footage: trees about 3.5 tamer widths across,
// rocks about two (often a big and a small one together), bushes a little
// over one.
export const RESOURCE_TYPES = {
  tree: { yields: 'wood', r: [105, 128] },
  rock: { yields: 'stone', r: [52, 74] },
  bush: { yields: 'food', r: [40, 50] },
  gold: { yields: 'gold', r: [56, 66] },
  log: { yields: 'wood', r: [40, 46], per: 4 },
  cactus: { yields: 'food', r: [32, 38], hurts: 2 },
  'big-gold': { yields: 'gold', r: [110, 110], per: 3.5 },
};
// Nodes per biome square: a few trees, rocks and bushes on every screen.
export const NODES_PER_CELL = 64;

// ---------------- items ----------------

export const TIERS = {
  wood: { name: 'Wooden', color: '#b9824a', light: '#d9a46a' },
  stone: { name: 'Stone', color: '#9aa1a6', light: '#c4cace' },
  gold: { name: 'Golden', color: '#f2c230', light: '#ffe17a' },
  ruby: { name: 'Ruby', color: '#e2405a', light: '#ff8ea0' },
  amethyst: { name: 'Amethyst', color: '#a35ce0', light: '#d3a6ff' },
  sapphire: { name: 'Sapphire', color: '#3c7be8', light: '#93bcff' },
};
export const TIER_ORDER = ['wood', 'stone', 'gold', 'ruby', 'amethyst', 'sapphire'];
export const tierRank = t => TIER_ORDER.indexOf(t);

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
  spear: { name: 'Spear', shape: 'spear', base: [20, 30, 6, .9, 100, 85, H(1, 1, 1, 1)], step: [3, 4, 2, 0, 5, 0] },
};
const VARIANT = {
  sword: { id: 'katana', name: 'Katana', shape: 'katana', mod: { reload: -.12, dmg: -2, range: 10 } },
  axe: { id: 'labrys', name: 'Labrys', shape: 'labrys', mod: { dmg: 4, reload: .1, spin: true } },
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
    if (k >= 1) {
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

const SECONDARY = [];
['stone', 'gold', 'ruby', 'amethyst', 'sapphire'].forEach((tier, k) => {
  SECONDARY.push({ id: `${tier}-bow`, name: `${TIERS[tier].name} Bow`, slot: 'secondary', family: 'bow', shape: 'bow', tier, dmg: 15 + 3 * k + (k > 2 ? 2 : 0), adm: 22 + 5 * k, bdm: 2 + k, reload: k >= 3 ? 1.2 : 1.3, range: 700, speed: 75, ammo: { wood: 5 + k }, projectile: 1100 });
  SECONDARY.push({ id: `${tier}-shield`, name: `${TIERS[tier].name} Shield`, slot: 'secondary', family: 'shield', shape: 'shield', tier, dmg: 6 + k, adm: 8 + k, bdm: 2, reload: .6, range: 35, speed: 75, block: .5 + .05 * k, knock: 110 });
  SECONDARY.push({ id: `${tier}-wrench`, name: `${TIERS[tier].name} Wrench`, slot: 'secondary', family: 'wrench', shape: 'wrench', tier, dmg: 8 + k, adm: 10 + k, bdm: 0, reload: .6, range: 60, speed: 90, repair: 30 + 15 * k });
  if (k >= 1) SECONDARY.push({ id: `${tier}-crossbow`, name: `${TIERS[tier].name} Crossbow`, slot: 'secondary', family: 'bow', shape: 'crossbow', tier, dmg: 20 + 3 * k, adm: 30 + 5 * k, bdm: 3 + k, reload: 1.55 - .05 * k, range: 900, speed: 62, ammo: { wood: 10 + 2 * k }, projectile: 1500 });
});
for (const s of SECONDARY) if (s.tier === 'stone') s.name = s.name.replace('Stone ', s.family === 'bow' ? 'Stone ' : '');

const TOOLS = [
  { id: 'appletor', name: 'Appletor', slot: 'tool', shape: 'appletor', tier: 'wood', reload: .7, range: 600, speed: 65, ammo: { food: 5 }, healPlayer: 10, healPet: 20, tameTool: 'appletor', projectile: 900 },
  { id: 'slingshot', name: 'Slingshot', slot: 'tool', shape: 'slingshot', tier: 'wood', reload: .7, range: 600, speed: 65, ammo: { stone: 5 }, dmg: 10, adm: 15, tameTool: 'slingshot', projectile: 1000 },
  { id: 'gold-appletor', name: 'Golden Appletor', slot: 'tool', shape: 'appletor', tier: 'gold', reload: .8, range: 650, speed: 55, ammo: { food: 10 }, healPlayer: 20, healPet: 40, tameTool: 'appletor', safer: true, projectile: 950 },
  { id: 'gold-slingshot', name: 'Golden Slingshot', slot: 'tool', shape: 'slingshot', tier: 'gold', reload: .7, range: 650, speed: 60, ammo: { stone: 8 }, dmg: 16, adm: 24, tameTool: 'slingshot', safer: true, projectile: 1100 },
];

const food = (id, name, icon, heal, cost, extra = {}) => ({ id, name, slot: 'food', shape: 'food', icon, heal, cost: { food: cost }, reload: .35, speed: 60, ...extra });
const FOODS = [
  food('apple', 'Apple', 'apple', 10, 5),
  food('cookie', 'Cookie', 'cookie', 12, 8),
  food('waffle', 'Waffle', 'waffle', 18, 12),
  food('sandwich', 'Sandwich', 'sandwich', 5, 12, { hot: 5 }),
  food('steak', 'Steak', 'steak', 12, 12, { armor: .1 }),
  food('toffee', 'Toffee', 'toffee', 10, 10, { haste: .05 }),
  food('cake', 'Cake', 'cake', 22, 15),
  food('soup', 'Mushroom Soup', 'soup', 9, 18, { hot: 9 }),
  food('meatballs', 'Meatballs', 'meatballs', 16, 18, { armor: .2 }),
  food('roll', 'Roll Cake', 'roll', 14, 15, { haste: .15 }),
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

export const ITEMS = [...PRIMARY, ...SECONDARY, ...TOOLS, ...FOODS, ...BUILDINGS];
export const ITEM_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
export const STARTING_ITEMS = ['hand', 'apple', 'wood-wall', 'wood-door', 'wood-spike', 'wood-windmill'];
export const START_RESOURCES = { food: 60, wood: 60, stone: 60, gold: 0 };
/** Food spent on every taming try, win or lose. */
export const TAME_FOOD = 12;
export const SLOT_ORDER = ['primary', 'secondary', 'tool', 'food', 'wall', 'door', 'spike', 'windmill', 'turret', 'tower', 'boost', 'trap', 'heal'];
export const BUILD_LIMIT = 105;

// ---------------- leveling ----------------

/** Xp to leave `age`. The first age comes in seconds; after that each age costs a little more, so with kills it stays around half a minute. */
export const xpForAge = age => age === 0 ? 20 : 60 + 16 * age;
export const MAX_AGE = 100;
export const LAST_CHOICE_AGE = 27;

const slotItem = (items, slot) => items.map(id => ITEM_BY_ID.get(id)).find(it => it?.slot === slot);
function nextTier(items, slot) {
  const cur = slotItem(items, slot);
  if (!cur) return null;
  const want = TIER_ORDER[tierRank(cur.tier) + 1];
  const it = ITEMS.find(x => x.slot === slot && x.tier === want && (x.family ? x.family === cur.family && !!x.variant === !!cur.variant && x.shape === cur.shape : !x.big));
  return it?.id || null;
}
function primaryAtTier(items, tier) {
  const cur = slotItem(items, 'primary');
  if (!cur || cur.family === 'hand') return [`${tier}-sword`];
  const out = [`${tier}-${cur.family}`];
  const v = VARIANT[cur.family];
  if (ITEM_BY_ID.has(`${tier}-${v.id}`)) out.push(`${tier}-${v.id}`);
  if (cur.variant) out.reverse();
  return out;
}
function secondaryAtTier(items, tier) {
  const cur = slotItem(items, 'secondary');
  if (!cur) return [`${tier}-bow`, `${tier}-shield`, `${tier}-wrench`].filter(id => ITEM_BY_ID.has(id));
  const out = [`${tier}-${cur.shape === 'crossbow' ? 'crossbow' : cur.family}`];
  if (cur.family === 'bow') out.push(cur.shape === 'crossbow' ? `${tier}-bow` : `${tier}-crossbow`);
  return out.filter(id => ITEM_BY_ID.has(id));
}
function buildingTier(items) {
  return ['wall', 'spike', 'windmill', 'door'].map(slot => nextTier(items, slot)).filter(Boolean).slice(0, 4);
}

// Upgrade offered at each age, modelled on the documented upgrade tree.
export const AGE_TREE = {
  1: () => ['stone-sword', 'stone-axe', 'stone-hammer', 'stone-daggers', 'stone-spear'],
  2: () => ['cookie', 'stone-wall'],
  3: () => ['stone-windmill', 'stone-spike', 'big-spike', 'wood-turret', 'fire-tower', 'stone-door'],
  4: items => secondaryAtTier(items, 'stone'),
  5: () => ['appletor', 'slingshot'],
  6: items => primaryAtTier(items, 'gold'),
  7: () => ['waffle', 'sandwich', 'steak', 'toffee'],
  8: () => ['boost-pad', 'bear-trap', 'heal-pad'],
  9: items => buildingTier(items),
  10: items => [...secondaryAtTier(items, 'gold'), 'stone-turret'],
  11: items => primaryAtTier(items, 'ruby'),
  12: items => ['cake', nextTier(items, 'wall')].filter(Boolean),
  13: items => buildingTier(items),
  14: items => secondaryAtTier(items, 'ruby'),
  15: items => primaryAtTier(items, 'amethyst'),
  16: items => ['soup', 'meatballs', 'roll', nextTier(items, 'wall')].filter(Boolean),
  17: items => buildingTier(items),
  18: items => [...secondaryAtTier(items, 'amethyst'), 'gold-turret'],
  19: items => primaryAtTier(items, 'sapphire'),
  20: items => buildingTier(items),
  21: items => secondaryAtTier(items, 'sapphire'),
  23: items => buildingTier(items),
  25: items => [slotItem(items, 'tool')?.id === 'slingshot' ? 'gold-slingshot' : 'gold-appletor', slotItem(items, 'tool')?.id === 'slingshot' ? 'gold-appletor' : 'gold-slingshot'],
  26: items => [slotItem(items, 'boost')?.id ? 'big-boost-pad' : null, slotItem(items, 'heal')?.id ? 'big-heal-pad' : null, slotItem(items, 'trap') ? 'big-spike' : null].filter(Boolean),
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
export function typeMultiplier(attacker, defender) {
  if (!attacker || !defender) return 1;
  let m = 1;
  for (const d of defender) {
    if (TYPES[attacker].strong.includes(d)) m *= 3;
    else if (TYPES[attacker].weak.includes(d)) m *= .375;
  }
  return Math.max(.25, Math.min(3, m));
}

// Skills: one per pet, cast with the skill key. Cooldown shortens as the pet grows.
export const SKILLS = {
  blaze: { name: 'Blaze', cd: 30, desc: 'Burst of flame that burns nearby enemies.' },
  vines: { name: 'Draining Vines', cd: 28, desc: 'Roots the target, draining health back to the pet.' },
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
  pet('hedgehog', 'Hedgehog', 'forest', 'hedgehog', '#a77b55', '#5b3d26', ['fire'], 'rare', 12, 'appletor', 'neutral', [300, 700, 1200], [4, 10, 22], [210, 260, 290], 'blaze'),
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
  { id: 'old-oak', name: 'Old Oak', biome: 'forest', body: 'treant', color: '#6b4a2b', accent: '#97cf3a', hp: 8000, dmg: 60, reach: 230, every: 1.6, gold: 5000, xp: 4000, minions: 'wolf' },
  { id: 'frost-golem', name: 'Frost Golem', biome: 'winter', body: 'golem', color: '#9fe3f5', accent: '#e9fbff', hp: 9000, dmg: 55, reach: 220, every: 1.8, gold: 5000, xp: 4500, minions: 'arctic-fox' },
  { id: 'shade-cap', name: 'Shade Cap', biome: 'darkness', body: 'mushroom', color: '#7a5fd0', accent: '#7dfcd2', hp: 8000, dmg: 50, reach: 220, every: 1.4, gold: 5000, xp: 4000, minions: 'spider' },
  { id: 'sand-colossus', name: 'Sand Colossus', biome: 'desert', body: 'golem', color: '#c69a5c', accent: '#f0d090', hp: 9500, dmg: 60, reach: 230, every: 1.8, gold: 5500, xp: 4500, minions: 'scorpion' },
  { id: 'deep-kraken', name: 'Deep Kraken', biome: 'ocean', body: 'kraken', color: '#b0477a', accent: '#ff9ac9', hp: 9000, dmg: 55, reach: 260, every: 1.6, gold: 5500, xp: 4500, minions: 'crab' },
  { id: 'magma-titan', name: 'Magma Titan', biome: 'volcano', body: 'golem', color: '#5c3b33', accent: '#ff7b2e', hp: 10000, dmg: 65, reach: 230, every: 1.8, gold: 6000, xp: 5000, minions: 'salamander' },
];
export const BOSS_BY_ID = new Map(BOSSES.map(b => [b.id, b]));

// Cosmetic + light-effect hats bought with gold. Lost on leaving the server.
export const HATS = [
  { id: 'none', name: 'No hat', cost: 0, note: '' },
  { id: 'leaf', name: 'Leaf Cap', cost: 200, note: '+1 wood per hit' },
  { id: 'miner', name: 'Miner Helmet', cost: 2000, note: '+2 stone and gold per hit', gather: { stone: 2, gold: 2 } },
  { id: 'tamer', name: 'Tamer Cap', cost: 2500, note: 'Tame chance x1.29', tame: 1.29 },
  { id: 'beanie', name: 'Snow Beanie', cost: 1200, note: '+15% speed in Winter', biome: 'winter' },
  { id: 'flower', name: 'Flower Crown', cost: 3000, note: 'Pets regenerate twice as fast' },
  { id: 'horns', name: 'Warrior Horns', cost: 6000, note: '+10% damage' },
  { id: 'knight', name: 'Knight Helmet', cost: 10000, note: '-40% damage taken, -15% speed', armor: .4, slow: .15 },
  { id: 'crown', name: 'Golden Crown', cost: 20000, note: 'Pure prestige' },
];
export const HAT_BY_ID = new Map(HATS.map(h => [h.id, h]));
