// Stationary boss mechanics from the public boss pages. No reference assets/code.
// Unspecified animation/range values are simulation constants, not purported wiki measurements.
const attack = (kind, interval, damage, element, extra = {}) => ({
  kind,
  interval,
  damage,
  element,
  windup: 0.9,
  ...extra,
});
export const BOSS_PROFILES = {
  "old-oak": {
    source: "Tree_Boss",
    hp: 8000,
    xp: 4500,
    types: ["plant"],
    drops: ["fire-fairy", "water-fairy", "grove-spirit"],
    attacks: [
      attack("slam", 7, 60, "plant", { reach: 400 }),
      attack("roots", 7, 6, "plant", {
        duration: 4,
        tick: 0.5,
        animalDamage: 12,
        vampirism: 0.15,
      }),
    ],
  },
  "frost-golem": {
    source: "Ice_Golem_Boss",
    hp: 10000,
    xp: 5700,
    types: ["ice"],
    drops: ["ice-spirit", "iceberg"],
    attacks: [
      attack("slam", 20, 60, "ice", { reach: 400 }),
      attack("ice-meteor", 5, 55, "ice", { freeze: 1.5 }),
    ],
  },
  "shade-cap": {
    source: "Mushroom_Boss",
    hp: 8500,
    xp: 4800,
    types: ["poison"],
    drops: ["living-mushroom", "spider", "white-spider"],
    attacks: [
      attack("bomb", 5, 55, "poison", { knock: 180 }),
      attack("toxic-fog", 20, 20, "poison", { duration: 5, tick: 0.5 }),
    ],
  },
  "sand-colossus": {
    source: "Rock_Golem_Boss",
    hp: 10000,
    xp: 5700,
    types: ["rock"],
    drops: ["stone-golem", "dune-spirit"],
    attacks: [
      attack("slam", 7, 60, "rock", { reach: 400 }),
      attack("rock-meteor", 5, 50, "rock", { stun: 0.8 }),
    ],
  },
  "deep-kraken": {
    source: "Octopus_Boss",
    hp: 9000,
    xp: 4800,
    types: ["water"],
    drops: ["octopus"],
    attacks: [
      attack("poison", 5, 6, "poison", { duration: 5, tick: 0.5, blind: 2 }),
      attack("whirlpool", 20, 9, "poison", {
        duration: 5,
        tick: 0.5,
        pull: 500,
        invulnerable: true,
      }),
    ],
  },
  "magma-titan": {
    source: "Volcanic_Golem_Boss",
    hp: 10000,
    xp: 5700,
    types: ["rock", "fire"],
    drops: ["volcanic-golem", "magma-boar", "mantle"],
    attacks: [
      attack("flame-slam", 20, 65, "fire", { reach: 400, burn: 5 }),
      attack("lava-meteor", 5, 50, "fire", { burn: 5, duration: 5, tick: 0.5 }),
    ],
  },
};
for (const profile of Object.values(BOSS_PROFILES)) {
  profile.chestGold = 14000;
  profile.gold = 20000;
  profile.food = 800;
  profile.source = `https://tamingio.fandom.com/wiki/${profile.source}`;
}
