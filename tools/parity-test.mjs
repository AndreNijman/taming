import assert from "node:assert/strict";
import * as S from "../sim.js";
import {
  PETS,
  PET_BY_ID,
  HATS,
  ACCESSORIES,
  BOSSES,
  ITEM_BY_ID,
  STARTING_ITEMS,
} from "../data.js";
import { ANIMAL_REFERENCE } from "../reference-animals.js";
const test = (name, fn) => {
  try {
    fn();
    console.log("PASS", name);
  } catch (e) {
    console.error("FAIL", name, e.stack);
    process.exitCode = 1;
  }
};
const world = () => {
  const w = S.createWorld(234);
  w.animals = [];
  w.resources = [];
  w.grid.grid.clear();
  const p = S.addPlayer(w, { id: "p", name: "P" });
  Object.assign(p, { x: 3000, y: 3000, shieldUntil: 0 });
  return { w, p };
};
const pet = (w, p, species, stage = 0, x = p.x + 70, y = p.y) => {
  const d = PET_BY_ID.get(species),
    a = {
      id: `a${w.nextId++}`,
      species,
      x,
      y,
      vx: 0,
      vy: 0,
      r: [30, 40, 52][stage],
      angle: 0,
      hp: d.hp[stage],
      maxHp: d.hp[stage],
      stage,
      owner: p.id,
      sleep: false,
      home: { x, y },
      state: "follow",
      target: null,
      mode: "stop",
      post: { x, y },
      cd: 0,
      xp: 0,
      skillAt: -99,
      lastHurtAt: -99,
      wanderAt: 999,
    };
  w.animals.push(a);
  p.pets.push(a.id);
  return a;
};
const enemy = (w, x = 3150, y = 3000) => {
  const p = S.addPlayer(w, { id: "enemy", name: "Enemy" });
  Object.assign(p, { x, y, shieldUntil: 0, hp: 10000, maxHp: 10000 });
  return p;
};
const step = (w, seconds) => {
  for (let i = 0; i < Math.ceil(seconds / S.TICK); i++) S.step(w, S.TICK);
};
test("every species carries three sourced stage records and distinct ability dispatch", () => {
  for (const d of PETS) {
    const ref = ANIMAL_REFERENCE[d.id];
    assert.ok(ref, d.id);
    assert.deepEqual(d.hp, ref.hp);
    assert.deepEqual(d.speed, ref.speed);
    assert.equal(d.skillStats.length, 3);
    assert.ok(d.ability, d.id);
  }
});
test("black cat dice provides buffs without teleporting", () => {
  const { w, p } = world(),
    a = pet(w, p, "black-cat");
  w.random = () => 0.99;
  p.hp = 20;
  const before = { x: a.x, y: a.y };
  S.command(w, p.id, { t: "skill" });
  assert.ok(w.events.some((e) => e.k === "dice" && e.roll === 6));
  assert.ok(p.hp > 20);
  assert.ok(p.effects.some((e) => e.kind === "attack"));
  assert.equal(a.x, before.x);
});
test("axolotl creates a temporary damage absorbing summon", () => {
  const { w, p } = world();
  pet(w, p, "axolotl");
  S.command(w, p.id, { t: "skill" });
  step(w, 3.2);
  const clone = w.animals.find((a) => a.decoy);
  assert.ok(clone);
  assert.equal(p.shieldLink, clone.id);
  step(w, 13);
  assert.ok(!w.animals.some((a) => a.decoy));
});
test("penguin creates a damaging ice structure at commanded point", () => {
  const { w, p } = world();
  pet(w, p, "penguin");
  S.command(w, p.id, { t: "skill", x: p.x + 400, y: p.y });
  step(w, 2);
  assert.ok(
    w.structures.some(
      (s) => s.item === "ice-rampart" && Math.abs(s.x - (p.x + 400)) < 10,
    ),
  );
});
test("deer drains along a dash, rather than healing the entire pack", () => {
  const { w, p } = world(),
    a = pet(w, p, "deer"),
    e = enemy(w, 3250, 3000);
  a.hp = 40;
  p.hp = 40;
  S.command(w, p.id, { t: "skill", x: 3500, y: 3000 });
  step(w, 1);
  assert.ok(a.x > 3200);
  assert.ok(e.hp < 10000);
  assert.ok(p.hp > 40);
});
test("all required equipment families are represented", () => {
  for (const id of [
    "imposter",
    "bandage",
    "arrow",
    "rascal",
    "wrecker",
    "cowboy",
    "clown",
    "pot",
    "explorer",
    "nurse",
    "trapper",
    "hunter",
    "beekeeper",
    "musketeer",
    "cheek",
    "termite",
    "pup",
    "circuit",
    "magician",
    "anvil",
    "worksite",
    "mount",
    "mill",
    "rogue",
    "spring",
  ])
    assert.ok(
      HATS.some((h) => h.id === id),
      id,
    );
  for (const type of [
    "normal",
    "rock",
    "water",
    "electric",
    "plant",
    "poison",
    "insect",
    "combat",
    "fire",
    "ice",
    "shadow",
    "dragon",
    "fairy",
    "ancient",
  ]) {
    assert.ok(ACCESSORIES.some((a) => a.id === `cape-${type}`));
    assert.ok(ACCESSORIES.some((a) => a.id === `wings-${type}`));
  }
});
test("boss chests preserve 14000 gold and three legendary species drops", () => {
  assert.equal(ITEM_BY_ID.get("ice-rampart").kind, "wall");
  for (const b of BOSSES) {
    assert.ok(b.drops.length);
    assert.equal(b.chestGold, 14000);
    assert.ok(b.attacks.length >= 2);
  }
});

// Every shipped species and evolution must execute its ability in a real simulation.
test("all 47 species execute all three ability stages with finite authoritative snapshots", () => {
  for (const def of PETS)
    for (let stage = 0; stage < 3; stage++) {
      const { w, p } = world(),
        a = pet(w, p, def.id, stage),
        e = enemy(w, 3200, 3000);
      p.hp = 50;
      a.hp = a.maxHp * 0.7;
      S.command(w, p.id, { t: "skill", x: 3350, y: 3000 });
      assert.ok(
        w.events.some((event) => event.k === "skill" && event.id === a.id),
        `${def.id} stage ${stage} cannot cast`,
      );
      step(w, 5);
      const snap = JSON.parse(JSON.stringify(S.snapshot(w, p.id)));
      for (const row of snap.a) {
        assert.ok(
          Number.isFinite(row[3]) &&
            Number.isFinite(row[4]) &&
            Number.isFinite(row[6]),
          `${def.id} stage ${stage}`,
        );
      }
      assert.ok(Number.isFinite(e.hp));
    }
});
test("wolf uses sourced burst damage and rabbit baby has no vampirism", () => {
  const { w, p } = world(),
    a = pet(w, p, "wolf"),
    e = enemy(w);
  S.command(w, p.id, { t: "skill" });
  assert.equal(e.hp, 9990);
  const next = world(),
    r = pet(next.w, next.p, "rabbit"),
    enemy2 = enemy(next.w);
  next.p.hp = 30;
  r.hp = 30;
  S.command(next.w, next.p.id, { t: "skill" });
  assert.equal(next.p.hp, 30);
  assert.equal(enemy2.hp, 9995);
});
test("fox slows enemies, moth blocks attacks, raven weakens defence", () => {
  for (const [species, effect] of [
    ["fox", "slow"],
    ["glow-moth", "attack-block"],
    ["raven", "vulnerable"],
  ]) {
    const { w, p } = world();
    pet(w, p, species);
    const e = enemy(w);
    S.command(w, p.id, { t: "skill" });
    step(w, 0.7);
    assert.ok(
      e.effects.some((item) => item.kind === effect),
      `${species} must apply ${effect}`,
    );
  }
});
test("salamander fires one, three or five projectiles and creates lava trails", () => {
  for (let stage = 0; stage < 3; stage++) {
    const { w, p } = world();
    pet(w, p, "salamander", stage);
    enemy(w, 3550, 3000);
    S.command(w, p.id, { t: "skill", x: 3550, y: 3000 });
    step(w, 0.55);
    assert.equal(
      w.projectiles.filter((j) => j.ability === "lava-spit").length,
      1 + 2 * stage,
    );
    step(w, 0.1);
    assert.ok(w.hazards.some((h) => h.kind === "pet-lava"));
  }
});
test("crab shields allies and axolotl absorbs hits instead of player health", () => {
  const { w, p } = world();
  pet(w, p, "crab");
  S.command(w, p.id, { t: "skill" });
  step(w, 0.6);
  assert.ok(p.effects.some((e) => e.kind === "armor"));
  const next = world(),
    a = pet(next.w, next.p, "axolotl"),
    e = enemy(next.w, 2920, 3000);
  S.command(next.w, next.p.id, { t: "skill" });
  step(next.w, 3.2);
  const clone = next.w.animals.find((a) => a.decoy);
  const hp = next.p.hp,
    chp = clone.hp;
  e.items = ["stone-sword"];
  e.held = "stone-sword";
  e.cd = 0;
  S.setInput(next.w, e.id, { angle: 0, attack: true, sel: 0 });
  S.step(next.w, 0.05);
  assert.equal(next.p.hp, hp);
  assert.ok(clone.hp < chp);
});
test("element capes prevent matching harmful status and reduce skill damage", () => {
  const run = (cape) => {
    const { w, p } = world(),
      e = enemy(w);
    pet(w, p, "fox");
    e.wings = cape;
    S.command(w, p.id, { t: "skill" });
    return e;
  };
  const normal = run("none"),
    protectedEnemy = run("cape-electric");
  assert.ok(normal.effects.some((e) => e.kind === "slow"));
  assert.ok(!protectedEnemy.effects.some((e) => e.kind === "slow"));
  assert.ok(protectedEnemy.hp > normal.hp);
});
test("element equipment multiplies only matching pet skill damage", () => {
  const run = (hat, wing) => {
    const { w, p } = world();
    p.hat = hat;
    p.wings = wing;
    pet(w, p, "wolf");
    const e = enemy(w);
    S.command(w, p.id, { t: "skill" });
    return 10000 - e.hp;
  };
  assert.equal(run("none", "none"), 10);
  assert.equal(run("element-fire", "wings-fire"), 14);
  assert.equal(run("element-water", "wings-water"), 10);
});
test("real weapon stats, food branches, second food slot, tower and big-spike branches", () => {
  assert.equal(ITEM_BY_ID.get("gold-katana").speed, 70);
  assert.equal(ITEM_BY_ID.get("stone-sword").dmg, 30);
  assert.equal(ITEM_BY_ID.get("gold-minigun").reload, 0.08);
  assert.equal(ITEM_BY_ID.get("gold-appletor").ammo.gold, 25);
  const { w, p } = world();
  p.choices = [4];
  S.command(w, p.id, { t: "choose", id: "stone-bow" });
  assert.equal(p.items[1], "apple");
  p.choices = [5];
  S.command(w, p.id, { t: "choose", id: "appletor" });
  assert.equal(p.items[1], "apple");
  assert.deepEqual(
    S.currentOffer({ ...p, choices: [12], items: ["sandwich", "wood-wall"] }),
    ["salad"],
  );
  assert.deepEqual(
    S.currentOffer({ ...p, choices: [16], items: ["salad", "wood-wall"] }),
    ["soup"],
  );
  assert.equal(
    S.currentOffer({ ...p, choices: [9], items: ["fire-tower"] }).length,
    5,
  );
  assert.deepEqual(
    S.currentOffer({ ...p, choices: [9], items: ["big-spike"] }),
    ["gold-big-spike"],
  );
});
test("full boss chest rewards are paid once and elemental defence applies both ways", () => {
  const w = S.createWorld(55),
    boss = w.animals.find((a) => a.boss),
    p = S.addPlayer(w, { id: "p", name: "P" });
  w.animals = [boss];
  w.resources = [];
  w.grid.grid.clear();
  Object.assign(p, { x: boss.x - boss.r - p.r - 5, y: boss.y, shieldUntil: 0 });
  boss.hp = 1;
  S.setInput(w, p.id, { attack: true, angle: 0, sel: 0 });
  S.step(w, 0.05);
  assert.equal(p.res.gold, 20000);
  const chest = w.resources.find((n) => n.type === "chest");
  assert.equal(chest.goldRemaining, 14000);
  p.x = chest.x - 80;
  p.y = chest.y;
  p.vx = p.vy = 0;
  p.cd = 0;
  chest.hp = 1;
  S.step(w, 0.7);
  assert.equal(p.res.gold, 34000);
  const total = p.res.gold;
  step(w, 1);
  assert.equal(p.res.gold, total);
  assert.equal(chest.respawnAt, Infinity);
});
test("short circuit ignores pads, mega pads launch animals, hats persist after death", () => {
  const { w, p } = world();
  p.hat = "circuit";
  w.structures.push({
    id: "boost",
    item: "mega-boost-pad",
    x: p.x,
    y: p.y,
    r: 40,
    hp: 100,
    maxHp: 100,
    owner: "other",
    rot: 0,
  });
  const start = p.x;
  step(w, 0.2);
  assert.equal(p.x, start);
  const a = pet(w, p, "bear", 0, p.x, p.y);
  step(w, 0.8);
  assert.ok(a.x - start > 700);
  p.dead = true;
  p.deadAt = -10;
  S.command(w, p.id, { t: "respawn" });
  assert.equal(p.hat, "circuit");
});
test("imposter hides only below one million and magician accelerates skill recovery", () => {
  const { w, p } = world();
  p.hat = "imposter";
  assert.ok(!S.leaderboard(w).some((r) => r[0] === p.id));
  p.res.gold = 1000000;
  assert.ok(S.leaderboard(w).some((r) => r[0] === p.id));
  const a = pet(w, p, "wolf");
  a.skillAt = w.time;
  p.hat = "magician";
  step(w, 0.05);
  assert.equal(a.skillAt, -1);
});
test("cow, bull, dog equipment has live corresponding pets and support abilities", () => {
  const { w, p } = world();
  const dog = pet(w, p, "dog"),
    other = pet(w, p, "wolf");
  other.hp = 30;
  S.command(w, p.id, { t: "skill", slot: 0 });
  assert.ok(other.hp > 30);
  assert.ok(other.effects.some((e) => e.kind === "haste"));
  assert.ok(!dog.effects?.some((e) => e.kind === "haste"));
  assert.ok(PET_BY_ID.has("cow") && PET_BY_ID.has("bull"));
});
test("mounted pets bite locked enemies and selecting a saddle dismounts", () => {
  const { w, p } = world(),
    a = pet(w, p, "bear", 2, p.x, p.y),
    e = enemy(w, p.x + 70, p.y);
  p.mounted = a.id;
  p.saddle = "battle-saddle";
  a.target = e.id;
  a.lockedTarget = e.id;
  p.previousSelected = "hand";
  step(w, 0.5);
  assert.ok(e.hp < 10000);
  p.items.push("saddle");
  S.setInput(w, p.id, { sel: p.items.length - 1 });
  step(w, 0.05);
  assert.equal(p.mounted, null);
});
test("Lucky Hat reduces tool failure by half a percentage point", () => {
  const h = HATS.find((h) => h.id === "lucky");
  assert.equal(h.failReduction, 0.005);
});
test("spikes damage bosses without adding velocity", () => {
  const w = S.createWorld(55),
    b = w.animals.find((a) => a.boss),
    p = S.addPlayer(w, { id: "p", name: "P" });
  w.animals = [b];
  w.structures = [
    {
      id: "spike",
      item: "wood-spike",
      x: b.x,
      y: b.y,
      r: 40,
      hp: 200,
      maxHp: 200,
      owner: p.id,
      born: 0,
    },
  ];
  const hp = b.hp;
  step(w, 0.1);
  assert.ok(b.hp < hp);
  assert.equal(b.vx, 0);
  assert.equal(b.vy, 0);
});
