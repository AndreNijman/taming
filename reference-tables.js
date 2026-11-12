// Numeric facts from public technical tables, checked 2026-11-12.
// Keep table facts separate from local combat values when a page omits them.
const source = (page) => `https://tamingio.fandom.com/wiki/${page}`;
const entry = (page, properties, recipe) => ({
  source: source(page),
  properties,
  recipe,
});
export const TABLE_ITEMS = {
  Slingshot: entry(
    "Slingshots",
    {
      speed: 65,
      reload: 0.85,
      player_damage: 10,
      animal_damage: 15,
      fairy_damage: 22,
      building_damage: 2,
    },
    { stone: 5 },
  ),
  "Golden Slingshot": entry(
    "Slingshots",
    {
      speed: 55,
      reload: 0.85,
      player_damage: 20,
      animal_damage: 30,
      fairy_damage: 45,
      building_damage: 4,
    },
    { stone: 10 },
  ),
  "Crystal Saddle": entry("Saddles", { speed: 60 }),
  "Normal Magic Tower": entry(
    "Towers",
    { durability: 140, maximum: 1, speed: 60, reload: 8 },
    { wood: 70, stone: 20 },
  ),
};
const tiers = [
  "Wooden",
  "Stone",
  "Golden",
  "Ruby",
  "Amethyst",
  "Sapphire",
  "Amber",
  "Diamond",
  "Emerald",
];
for (const [i, tier] of tiers.entries()) {
  const k = Math.min(i, 6);
  TABLE_ITEMS[`${tier} Spike`] = entry(
    "Spikes",
    {
      maximum: 15,
      durability: [200, 225, 250, 275, 300, 325, 350][k],
      speed: 60,
      reload: 0.1,
      damage: [2, 3, 4, 5, 6, 7, 7][k],
    },
    Object.fromEntries(
      Object.entries({
        wood: [20, 0, 10, 5, 10, 15, 15][k],
        stone: [10, 25, 0, 10, 20, 30, 30][k],
        gold: [0, 0, 30, 35, 45, 60, 60][k],
      }).filter(([, v]) => v),
    ),
  );
}
const towerFacts = {
  Rock: {
    hp: [320, 400, 480, 560, 640, 720],
    reload: [9, 11, 9, 11, 11, 12.5],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Electric: {
    hp: [320, 400, 480, 560, 640, 720],
    reload: [6, 8, 6, 8, 6, 7],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Fire: {
    hp: [320, 400, 480, 560, 640, 720],
    reload: [5, 7, 5, 7, 7, 6],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Repair: {
    hp: [510, 570, 630, 690, 750, 900],
    reload: [6, 8, 6, 8, 6, 8],
    wood: [60, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Plant: {
    hp: [200, 240, 280, 320, 360, 400],
    reload: [10, 12, 10, 10, 10, 12],
    wood: [60, 70, 80, 90, 100, 100],
    stone: [30, 30, 40, 50, 50, 50],
    gold: [60, 80, 100, 150, 200, 200],
  },
  Ice: {
    hp: [160, 200, 240, 280, 320, 360],
    reload: [7, 9, 7, 9, 7, 8],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Water: {
    hp: [200, 240, 260, 320, 360, 400],
    reload: [6, 8, 6, 8, 6, 13.5],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
  Spectrum: {
    hp: [320, 400, 480, 560, 640, 720],
    reload: [10, 12, 10, 12, 10, 11.5],
    wood: [80, 90, 100, 110, 120, 120],
    stone: [30, 40, 50, 60, 70, 70],
    gold: [50, 100, 150, 200, 250, 250],
  },
};
for (const [element, table] of Object.entries(towerFacts))
  for (const [i, tier] of tiers.slice(1).entries()) {
    const k = Math.min(i, 5);
    TABLE_ITEMS[`${tier} ${element} Tower`] = entry(
      "Towers",
      {
        durability: table.hp[k],
        maximum: 1,
        speed: 60,
        reload: table.reload[k],
      },
      { wood: table.wood[k], stone: table.stone[k], gold: table.gold[k] },
    );
  }
for (const [name, heal, food, bonus] of [
  ["Toffee Candy", 12, 10, 0.05],
  ["Biscuit", 12, 12, 0.1],
  ["Roll Cake", 15, 16, 0.15],
])
  TABLE_ITEMS[name] = entry(
    "Food",
    { speed: 60, reload: 0.35, heal, speed_bonus: bonus },
    { food },
  );

// Official 2026-11-05 balance notes supersede the older wiki weapon table.
for (const [tier, damage] of [
  ["Stone", 28],
  ["Golden", 32],
  ["Ruby", 36],
])
  TABLE_ITEMS[`${tier} Sword`] = entry("unused", { player_damage: damage });
for (const tier of ["Stone", "Golden", "Ruby"])
  TABLE_ITEMS[`${tier} Sword`].source = "https://taming.io/changelog/";
