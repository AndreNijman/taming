// Publicly documented equipment mechanics; original procedural visuals.
// Source: https://tamingio.fandom.com/wiki/In-game_Shop (2026-11-12).
const hat = (id, name, cost, note, effects = {}) => ({
  id,
  name,
  cost,
  note,
  ...effects,
});
export const EQUIPMENT_HATS = [
  hat("none", "No hat", 0, ""),
  ...["purple", "blue", "cyan", "green", "orange", "red"].map((color) =>
    hat(
      `cosmetic-${color}`,
      `${color[0].toUpperCase() + color.slice(1)} Hat`,
      200,
      "Cosmetic hat",
    ),
  ),
  hat("leaf", "Wood Hat", 2000, "Gather 2 more wood per hit", {
    gather: { wood: 2 },
  }),
  hat("miner", "Miner Hat", 2000, "Gather 2 more stone per hit", {
    gather: { stone: 2 },
  }),
  hat(
    "imposter",
    "Imposter",
    2000,
    "Hidden from the leaderboard below one million gold",
    { hideLeaderboard: true },
  ),
  hat("tamer", "Tamer's Cap", 2500, "Taming chance ×1.29", { tame: 1.29 }),
  ...[
    ["beanie", "Chapka", "winter"],
    ["season-forest", "Feather Tribe", "forest"],
    ["season-darkness", "Mushroom Hat", "darkness"],
    ["season-desert", "Turban", "desert"],
    ["season-ocean", "Diving Suit", "ocean"],
    ["season-volcano", "Heatmask Hat", "volcano"],
  ].map(([id, name, biome]) =>
    hat(id, name, 3000, `Faster and 10% protection in ${biome}`, {
      biome,
      biomeArmor: 0.1,
    }),
  ),
  hat("bandage", "Bandage", 4000, "Recover health over time", { regen: 1 }),
  hat("arrow", "Arrow Hat", 4000, "Stronger bow shots", {
    ranged: "bow",
    rangedDamage: 1.2,
  }),
  hat("rascal", "Rascal's Cap", 4000, "Stronger slingshot shots", {
    ranged: "slingshot",
    rangedDamage: 1.2,
  }),
  hat(
    "wrecker",
    "Wrecker's Hat",
    4000,
    "Recover 1.5× resources when destroying structures",
    { salvage: 1.5 },
  ),
  hat("cowboy", "Cowboy Hat", 5000, "Stronger cow and bull pets", {
    cowBuff: 1.2,
  }),
  hat("clown", "Clown Hat", 5000, "Faster, but take 2.5× damage", {
    move: 1.2,
    incoming: 2.5,
  }),
  hat(
    "pot",
    "Broken Pot",
    5000,
    "Slower, with stronger hammer building damage",
    { slow: 0.15, hammerBuildings: 1.5 },
  ),
  hat("explorer", "Explorer Hat", 6000, "50% more food from animal kills", {
    killFood: 1.5,
  }),
  hat("nurse", "Nurse Hat", 6000, "Appletors heal three times as much", {
    appleHeal: 3,
  }),
  hat(
    "trapper",
    "Trapper's Hat",
    6000,
    "Bear traps reload faster and deal more damage",
    { trapReload: 0.7, trapDamage: 1.25 },
  ),
  hat("bush", "Bush Hat", 7000, "Gather 1 more food per hit", {
    gather: { food: 1 },
  }),
  hat("hunter", "Hunter Hat", 8000, "Stronger crossbow shots", {
    ranged: "crossbow",
    rangedDamage: 1.2,
  }),
  hat(
    "beekeeper",
    "Bee Keeper's Hat",
    8000,
    "9% chance of a second insect; faster with a net",
    { duplicate: 0.09, netSpeed: 1.15 },
  ),
  hat("musketeer", "Musketeer Hat", 8000, "Stronger musket shots", {
    ranged: "musket",
    rangedDamage: 1.2,
  }),
  hat(
    "cheek",
    "Cheek Protection",
    8000,
    "Gloves: protection and stronger damage",
    { gloveArmor: 0.1, gloveDamage: 1.2, knockout: 0 },
  ),
  hat(
    "termite",
    "Termite's Hat",
    9000,
    "Slower; newly placed structures decay",
    { slow: 0.15, decay: true },
  ),
  hat("pup", "Pup Ears", 9500, "Stronger dog-type pets", { dogBuff: 1.2 }),
  hat("knight", "Knight's Helmet", 10000, "40% protection, 30% slower", {
    armor: 0.4,
    slow: 0.3,
  }),
  hat("circuit", "Short-Circuit Hat", 10000, "Ignore boost pads", {
    noBoost: true,
  }),
  hat(
    "lucky",
    "Lucky Hat",
    10000,
    "Fewer taming-tool failures, better dice and insect catches",
    { luck: 0.5, failReduction: 0.005, insectLuck: 1.15 },
  ),
  hat(
    "magician",
    "Magician Hat",
    12000,
    "Pet skills recover an extra second every five seconds",
    { cooldownRecovery: true },
  ),
  hat("anvil", "Anvil Hat", 14000, "Heavier and protected, but slower", {
    weight: 2,
    armor: 0.2,
    slow: 0.2,
  }),
  hat(
    "worksite",
    "Worksite Helmet",
    15000,
    "Stronger wrench repairs and protection, but slower",
    { repair: 1.5, armor: 0.15, slow: 0.15 },
  ),
  hat("trophy", "Wolf Trophy Hat", 15000, "50% more XP from animal kills", {
    killXp: 1.5,
  }),
  hat(
    "mount",
    "Tamer's Helmet",
    16000,
    "Mounted pet has more defence and attack",
    { mountedDamage: 1.2, mountedArmor: 0.2 },
  ),
  hat("swift", "Marlou Hat", 20000, "10% faster", { move: 1.1 }),
  hat("crown", "King's Crown", 20000, "50% more pet XP", { petXp: 1.5 }),
  hat(
    "mill",
    "Windmill Hat",
    20000,
    "10 more gold per placed windmill payout",
    { millBonus: 10 },
  ),
  hat(
    "rogue",
    "Rogue's Hood",
    20000,
    "Steal gold and food from nearby enemies",
    { steal: true },
  ),
  hat("spring", "Spring Cap", 20000, "More weapon knockback, but slower", {
    knock: 1.5,
    slow: 0.15,
  }),
  hat(
    "golden-apple",
    "Golden Apple Hat",
    5000,
    "One golden apple when breaking a chest",
    { chestApple: 1 },
  ),
];
export const EQUIPMENT_ACCESSORIES = [
  hat("none", "No accessory", 0, ""),
  hat("small-bag", "Small Bag", 2000, "Slower, gather 2 more food per hit", {
    slow: 0.1,
    gather: { food: 2 },
    visual: "bag",
  }),
  hat("big-bag", "Big Bag", 3000, "Slower, gather 2 more gold per hit", {
    slow: 0.15,
    gather: { gold: 2 },
    visual: "bag",
  }),
  hat("baby-wings", "Baby Wings", 5000, "20% more spear and naginata damage", {
    family: "spear",
    damage: 1.2,
  }),
  hat(
    "pup-tail",
    "Pup Tail",
    6550,
    "30% dog-type protection and status immunity",
    { dogArmor: 0.3, immuneDog: true, visual: "tail" },
  ),
  hat(
    "dragon-wings",
    "Dragonic Wings",
    10000,
    "10% more sword and katana damage",
    { family: "sword", damage: 1.1 },
  ),
  hat("angel-wings", "Angel Wings", 20000, "Recover health over time", {
    regen: 1,
  }),
  hat("dark-wings", "Dark Wings", 20000, "10% more dagger and cleaver damage", {
    family: "daggers",
    damage: 1.1,
  }),
  hat("demon-wings", "Demon Wings", 20000, "20% more axe and labrys damage", {
    family: "axe",
    damage: 1.2,
  }),
  hat("round-wings", "Final Round Wings", 20000, "20% more glove damage", {
    family: "gloves",
    damage: 1.2,
    knockout: 0,
  }),
];
const ELEMENTS = [
  ["normal", "Normal", "Crown of Horns", 7000, 6000, 8000],
  ["rock", "Rock", "Stone Helmet", 7050, 6050, 8050],
  ["water", "Water", "Sea King Fins", 7100, 6100, 8100],
  ["electric", "Electric", "Lightning Band", 7150, 6150, 8150],
  ["plant", "Plant", "Leaf Crown", 7200, 6200, 8200],
  ["poison", "Poison", "Plague Doctor", 7250, 6300, 8250],
  ["insect", "Insect", "Insect Helmet", 7300, 6350, 8300],
  ["combat", "Combat", "War Trophy", 7350, 6400, 8350],
  ["fire", "Fire", "Fire Spirit Mask", 7400, 6500, 8400],
  ["ice", "Ice", "Viking Helmet", 7450, 6550, 8450],
  ["shadow", "Spectrum", "Cursed Crown", 7500, 6600, 8500],
  ["dragon", "Dragon", "Dragon Tiara", 7600, 6700, 8600],
  ["fairy", "Fairy", "Fairy Helmet", 7700, 6800, 8700],
  ["ancient", "Ancient", "Ancient Helmet", 7800, 6800, 8800],
];
for (const [element, name, title, cost, capeCost, wingCost] of ELEMENTS) {
  EQUIPMENT_HATS.push(
    hat(
      `element-${element}`,
      title,
      cost,
      `Boost ${name} pet bites and skills`,
      {
        element,
        petBite: element === "fairy" ? 1.025 : 1.05,
        petSkill: element === "fairy" ? 1.075 : 1.15,
      },
    ),
  );
  EQUIPMENT_ACCESSORIES.push(
    hat(
      `cape-${element}`,
      `${name} Cape`,
      capeCost,
      `Protection and status immunity against ${name}`,
      { element, cape: true, visual: "cape" },
    ),
  );
  EQUIPMENT_ACCESSORIES.push(
    hat(
      `wings-${element}`,
      `${name} Wings`,
      wingCost,
      `20% stronger ${name} bites and skills`,
      {
        element,
        petBite: element === "fairy" ? 1.1 : 1.2,
        petSkill: element === "fairy" ? 1.1 : 1.2,
      },
    ),
  );
}
// Event equipment is explicit, so the simulation never enables an event accidentally.
export const EVENT_HATS = [
  hat("pilgrim", "Pilgrim's Hat", 3000, "Faster and protected in every biome", {
    allBiomes: true,
    biomeArmor: 0.1,
    event: "thanksgiving",
  }),
  hat("party", "Party Hat", 500, "Hands and gloves deal 24 more damage", {
    punchBonus: 24,
    event: "anniversary",
  }),
  hat("santa", "Santa's Hat", 3000, "20% faster and protected in Winter", {
    biome: "winter",
    biomeArmor: 0.2,
    biomeSpeed: 1.2,
    event: "christmas",
  }),
];
EQUIPMENT_HATS.push(...EVENT_HATS);
