import assert from "node:assert/strict";
import * as S from "../sim.js";
import { PET_BY_ID, BOSSES, ITEM_BY_ID, typeMultiplier } from "../data.js";
import { incomingMultiplier, outgoingMultiplier } from "../equipment.js";
let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log("PASS", name);
  } catch (e) {
    failures++;
    console.error("FAIL", name, e.stack);
  }
};
function setup() {
  const w = S.createWorld(234);
  w.animals = [];
  w.resources = [];
  w.grid.grid.clear();
  const p = S.addPlayer(w, { id: "p", name: "P" });
  Object.assign(p, { x: 3000, y: 3000, shieldUntil: 0 });
  return { w, p };
}
function pet(w, p, species, stage = 2, x = p.x + 100, y = p.y) {
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
      lastHurtAt: 0,
      wanderAt: 999,
    };
  w.animals.push(a);
  p.pets.push(a.id);
  return a;
}
function enemy(w, x = 3250, y = 3000) {
  const e = S.addPlayer(w, {
    id: `enemy${Object.keys(w.players).length}`,
    name: "Enemy",
  });
  Object.assign(e, { x, y, shieldUntil: 0, hp: 10000, maxHp: 10000 });
  return e;
}
function step(w, n) {
  for (let i = 0; i < Math.ceil(n / S.TICK); i++) S.step(w, S.TICK);
}
function cast(w, p, point = { x: p.x + 300, y: p.y }) {
  S.command(w, p.id, { t: "skill", ...point });
}
test("slowdown is remaining speed: boss rabbit leaves 50%, raven leaves 85%", () => {
  const { w, p } = setup();
  pet(w, p, "rabbit");
  const e = enemy(w);
  cast(w, p);
  step(w, 0.55);
  assert.equal(e.effectSpeed, 0.5);
  const other = setup();
  pet(other.w, other.p, "raven");
  const target = enemy(other.w);
  cast(other.w, other.p);
  step(other.w, 0.7);
  assert.equal(target.effectSpeed, 0.85);
});
test("raven curses one enemy and follows its target, not every nearby entity", () => {
  const { w, p } = setup();
  const a = pet(w, p, "raven"),
    e = enemy(w),
    other = enemy(w, 3260, 3000);
  a.target = e.id;
  a.lockedTarget = e.id;
  cast(w, p);
  step(w, 0.6);
  assert.ok(e.effects.some((f) => f.kind === "vulnerable"));
  assert.ok(!other.effects.some((f) => f.kind === "vulnerable"));
  e.x = 3700;
  step(w, 0.6);
  assert.ok(e.effects.some((f) => f.kind === "vulnerable" && f.until > w.time));
});
test("owl curse follows the victim for ten seconds without disabling hats", () => {
  const { w, p } = setup();
  const a = pet(w, p, "owl"),
    e = enemy(w);
  a.target = e.id;
  a.lockedTarget = e.id;
  cast(w, p);
  e.x = 3700;
  const hp = e.hp;
  step(w, 5);
  assert.ok(e.hp < hp);
  assert.ok(!e.effects.some((f) => f.kind === "hat-disabled"));
  assert.ok(a.cast);
});
test("cow heals every ally in milk and prevents enemy slowdown without blocking friendly buffs", () => {
  const { w, p } = setup();
  const a = pet(w, p, "cow"),
    ally = pet(w, p, "wolf", 2, a.x + 100, a.y);
  ally.hp = 20;
  const e = enemy(w);
  cast(w, p);
  step(w, 1);
  assert.ok(ally.hp > 20);
  assert.ok(ally.effects.some((f) => f.kind === "steadfast"));
  assert.ok(e.hp < 10000);
  assert.ok(e.effectSpeed > 0.8);
});
test("young goldfish can cast a healing pool without any opponent", () => {
  const { w, p } = setup();
  const a = pet(w, p, "turtle", 0);
  p.hp = 50;
  a.hp = 50;
  cast(w, p);
  step(w, 1);
  assert.ok(p.hp > 50);
  assert.ok(a.hp > 50);
});
test("Menhir explosion reverts it to baby instead of leaving a one-HP boss", () => {
  const { w, p } = setup();
  const a = pet(w, p, "dune-spirit");
  enemy(w);
  cast(w, p);
  step(w, 1.5);
  assert.equal(a.stage, 0);
  assert.equal(a.maxHp, PET_BY_ID.get(a.species).hp[0]);
  assert.ok(a.hp > 0);
});
test("white spider web is aimed and heals allies inside its area", () => {
  const { w, p } = setup();
  const a = pet(w, p, "white-spider"),
    ally = pet(w, p, "wolf", 2, 3500, 3000);
  ally.hp = 20;
  cast(w, p, { x: 3500, y: 3000 });
  step(w, 1);
  assert.ok(ally.hp > 20);
  assert.ok(w.hazards.some((h) => h.kind === "pet-web" && h.x > 3400));
});
test("shark delivers exactly three jaw hits with bleeding on the last", () => {
  const { w, p } = setup();
  pet(w, p, "shark");
  const e = enemy(w);
  cast(w, p);
  step(w, 3);
  assert.equal(
    w.events.filter(
      (e) =>
        e.k === "dmg" && e.id === Object.values(w.players)[1].id && e.amt >= 15,
    ).length,
    3,
  );
  assert.ok(e.effects.some((f) => f.kind === "bleed"));
});
test("Lava Golem travels underground, lays lava and emerges instead of staying still", () => {
  const { w, p } = setup();
  const a = pet(w, p, "magma-boar");
  enemy(w);
  const x = a.x;
  cast(w, p, { x: 3550, y: 3000 });
  step(w, 1);
  assert.ok(a.x > x + 100);
  assert.ok(w.hazards.some((h) => h.kind === "pet-lava"));
});
test("Sea Crab cooldown and moth cooldown match current individual infoboxes", () => {
  assert.deepEqual(
    PET_BY_ID.get("crab").skillStats.map((s) => s.reload),
    [40, 35, 30],
  );
  assert.deepEqual(
    PET_BY_ID.get("glow-moth").skillStats.map((s) => s.reload),
    [20, 17, 14],
  );
});
test("dual-type pet bite equipment works for either type; smog uses Fire", () => {
  const { w, p } = setup();
  const a = pet(w, p, "volcanic-golem");
  p.hat = "element-fire";
  assert.equal(outgoingMultiplier(w, a, {}), 1.05);
  assert.equal(
    outgoingMultiplier(w, a, { skill: true, element: "fire" }),
    1.15,
  );
});
test("Ice Golem health thresholds spawn exact two/two/three stage waves", () => {
  const w = S.createWorld(234, { startTime: 901 });
  const b = w.animals.find((a) => a.boss === "frost-golem");
  w.animals = [b];
  const p = S.addPlayer(w, { id: "p", name: "P" });
  Object.assign(p, { x: b.x + 600, y: b.y, shieldUntil: 0 });
  b.sleep = false;
  b.hp = b.maxHp * 0.74;
  S.step(w, 0.05);
  assert.deepEqual(
    w.animals
      .filter((a) => !a.boss)
      .map((a) => a.stage)
      .sort(),
    [1, 1],
  );
  b.hp = b.maxHp * 0.49;
  S.step(w, 0.05);
  assert.deepEqual(
    w.animals
      .filter((a) => !a.boss)
      .map((a) => a.stage)
      .sort(),
    [1, 1, 1, 2],
  );
  b.hp = b.maxHp * 0.24;
  S.step(w, 0.05);
  assert.deepEqual(
    w.animals
      .filter((a) => !a.boss)
      .map((a) => a.stage)
      .sort(),
    [1, 1, 1, 1, 2, 2, 2],
  );
});

test("all eight tower branches stay selected and blowpipes keep upgrading", () => {
  const { w, p } = setup();
  assert.equal(
    S.currentOffer({ ...p, choices: [9], items: ["fire-tower"] }).length,
    8,
  );
  for (const element of ["rock", "water", "shadow"]) {
    assert.ok(ITEM_BY_ID.has(`stone-${element}-tower`));
    assert.deepEqual(
      S.currentOffer({
        ...p,
        choices: [13],
        items: [`stone-${element}-tower`],
      }),
      [`gold-${element}-tower`],
    );
  }
  assert.deepEqual(
    S.currentOffer({ ...p, choices: [10], items: ["stone-blowpipe"] }),
    ["gold-blowpipe"],
  );
  assert.equal(ITEM_BY_ID.get("ruby-spike").hp, 275);
  assert.equal(ITEM_BY_ID.get("ruby-spike").cost.wood, 5);
  assert.equal(ITEM_BY_ID.get("stone-sword").dmg, 28);
});
test("water projectile heals allies in its flight path, not remote owner", () => {
  const { w, p } = setup();
  const a = pet(w, p, "water-fairy", 2, 3100, 3000),
    ally = pet(w, p, "wolf", 2, 3330, 3000);
  ally.hp = 20;
  p.hp = 50;
  enemy(w, 3700, 3000);
  S.command(w, p.id, { t: "skill", slot: 0, x: 3750, y: 3000 });
  step(w, 1.4);
  assert.ok(ally.hp > 20);
  assert.equal(p.hp, 50);
});
test("Camel beam hits only forward enemies and blocks incoming shots", () => {
  const { w, p } = setup();
  const a = pet(w, p, "camel"),
    front = enemy(w, 3350),
    behind = enemy(w, 2900);
  cast(w, p, { x: 3600, y: 3000 });
  w.projectiles.push({
    id: "arrow",
    x: 3450,
    y: 3000,
    vx: -100,
    vy: 0,
    owner: front.id,
    until: 5,
    r: 8,
    kind: "arrow",
  });
  step(w, 0.8);
  assert.ok(front.hp < 10000);
  assert.equal(behind.hp, 10000);
  assert.ok(!w.projectiles.some((j) => j.id === "arrow"));
});
test("Oryx creates four traps in a line and Seal leaves harmless slippery ice", () => {
  const { w, p } = setup();
  pet(w, p, "snake");
  enemy(w);
  cast(w, p, { x: 3700, y: 3000 });
  const traps = w.hazards.filter((h) => h.kind === "pet-chain");
  assert.equal(traps.length, 4);
  assert.ok(traps.every((h, i) => !i || h.x > traps[i - 1].x));
  const second = setup(),
    seal = pet(second.w, second.p, "seal");
  enemy(second.w);
  cast(second.w, second.p, { x: 3700, y: 3000 });
  step(second.w, 0.2);
  assert.ok(second.w.hazards.some((h) => h.kind === "pet-ice-river"));
});
test("effective-element status cancels weak pet skills, matching capes prevent cancellation", () => {
  const { w, p } = setup();
  const a = pet(w, p, "rabbit"),
    foe = enemy(w, 3200),
    fox = pet(w, foe, "fox", 2, 3250, 3000);
  cast(w, p);
  assert.ok(a.cast);
  S.command(w, foe.id, { t: "skill", x: 3100, y: 3000 });
  step(w, 1);
  assert.equal(a.cast, null);
  assert.ok(a.skillBlockedUntil > w.time);
});
test("five consecutive glove hits guarantee knockout", () => {
  const { w, p } = setup(),
    e = enemy(w, 3050);
  p.items = ["stone-gloves"];
  w.random = () => 0.99;
  for (let i = 0; i < 5; i++) {
    e.x = p.x + 50;
    e.y = p.y;
    e.vx = e.vy = 0;
    S.setInput(w, p.id, { attack: true, angle: 0, sel: 0 });
    p.cd = 0;
    step(w, 0.05);
    S.setInput(w, p.id, { attack: false, angle: 0, sel: 0 });
    step(w, 0.65);
    if (i < 4) assert.ok(!(e.trappedUntil > w.time));
  }
  assert.ok(e.trappedUntil > w.time);
  assert.equal(p.comboCount, 0);
});
test("Ice Golem defence area follows the owner and supports allies who enter later", () => {
  const { w, p } = setup();
  pet(w, p, "ice-spirit");
  cast(w, p);
  p.x = 3550;
  const ally = pet(w, p, "wolf", 2, 3600, 3000);
  step(w, 0.2);
  assert.ok(ally.effects.some((e) => e.kind === "armor" && e.value === 0.6));
});
test("two Axolotls protect distinct anchors instead of overwriting one shield", () => {
  const { w, p } = setup();
  const a = pet(w, p, "axolotl"),
    b = pet(w, p, "axolotl", 2, 2900, 3000);
  cast(w, p);
  step(w, 3.2);
  assert.equal(w.animals.filter((a) => a.decoy).length, 2);
  assert.ok(p.shieldLink);
  assert.ok(a.shieldLink || b.shieldLink);
});
test("bosses remain stationary when a building is placed against them", () => {
  const w = S.createWorld(55),
    b = w.animals.find((a) => a.boss),
    p = S.addPlayer(w, { id: "p", name: "P" });
  w.animals = [b];
  w.resources = [];
  w.grid.grid.clear();
  const point = { x: b.x, y: b.y };
  Object.assign(p, {
    x: b.x - 170,
    y: b.y,
    shieldUntil: 0,
    res: { wood: 1000, stone: 1000, food: 1000, gold: 1000 },
  });
  S.setInput(w, p.id, {
    sel: p.items.indexOf("wood-wall"),
    attack: true,
    angle: 0,
  });
  step(w, 0.1);
  assert.equal(b.x, point.x);
  assert.equal(b.y, point.y);
});
test("dual elements combine across bites and resistance rather than selecting the best type", () => {
  assert.equal(typeMultiplier(["rock", "fire"], ["insect"]), 3);
  assert.equal(typeMultiplier("water", ["rock", "fire"]), 3);
  assert.equal(typeMultiplier("fire", ["rock", "fire"]), 1 / 3);
});

test("Appletors can heal owned pets instead of skipping friendly collision", () => {
  const { w, p } = setup();
  const a = pet(w, p, "wolf", 2, p.x + 120, p.y);
  a.hp = 40;
  w.projectiles.push({
    id: "apple",
    item: "appletor",
    kind: "apple",
    owner: p.id,
    x: a.x - 20,
    y: a.y,
    vx: 200,
    vy: 0,
    until: 2,
    r: 12,
  });
  step(w, 0.1);
  assert.ok(a.hp > 40);
});
test("beam angle and shape survive the authoritative snapshot", () => {
  const { w, p } = setup();
  pet(w, p, "camel");
  enemy(w);
  cast(w, p, { x: 3500, y: 3200 });
  step(w, 0.1);
  const beam = S.snapshot(w, p.id).h.find((h) => h[5] === "pet-spit");
  assert.equal(beam[9], "beam");
  assert.ok(Number.isFinite(beam[8]));
  assert.equal(beam[10], 65);
});
test("Water Towers heal allies and Spectrum Towers create damaging enemy vortices", () => {
  const { w, p } = setup();
  p.hp = 20;
  w.structures = [
    {
      id: "water",
      item: "sapphire-water-tower",
      x: p.x - 150,
      y: p.y,
      r: 44,
      hp: 360,
      maxHp: 360,
      owner: p.id,
      cd: 0,
      born: 0,
    },
  ];
  step(w, 0.5);
  assert.ok(p.hp > 20);
  w.structures = [
    {
      id: "spectrum",
      item: "sapphire-shadow-tower",
      x: p.x - 150,
      y: p.y,
      r: 44,
      hp: 640,
      maxHp: 640,
      owner: p.id,
      cd: 0,
      born: 0,
    },
  ];
  const e = enemy(w, p.x + 180);
  step(w, 1);
  assert.ok(w.hazards.some((h) => h.kind === "tower-vortex"));
  assert.ok(e.hp < 10000);
});
test("bots continue travelling when their current area has no resources", () => {
  const { w, p } = setup();
  S.removePlayer(w, p.id);
  S.fillBots(w, 3);
  const starts = Object.values(w.players).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
  }));
  step(w, 3);
  for (const start of starts) {
    const bot = w.players[start.id];
    assert.ok(Math.hypot(bot.x - start.x, bot.y - start.y) > 30, bot.name);
  }
});

test("Lynx hits during its short lunge and does not damage entities beside the path", () => {
  const { w, p } = setup();
  const a = pet(w, p, "lynx"),
    front = enemy(w, 3300, 3000),
    side = enemy(w, 3300, 3200);
  cast(w, p, { x: 3700, y: 3000 });
  step(w, 0.3);
  assert.ok(front.hp < 10000);
  assert.equal(side.hp, 10000);
  step(w, 0.5);
  assert.equal(a.cast, null);
});

test("fairy spells use their elemental type and both matching hat families can strengthen them", () => {
  for (const [species, element] of [
    ["fire-fairy", "fire"],
    ["water-fairy", "water"],
    ["grove-spirit", "plant"],
  ]) {
    const { w, p } = setup(),
      a = pet(w, p, species);
    enemy(w, 3650);
    cast(w, p, { x: 3700, y: 3000 });
    step(w, 0.6);
    assert.equal(w.projectiles[0].element, element);
    p.hat = "element-fairy";
    assert.equal(outgoingMultiplier(w, a, { skill: true, element }), 1.075);
    p.hat = `element-${element}`;
    assert.equal(outgoingMultiplier(w, a, { skill: true, element }), 1.15);
  }
});

test("one Octopus ink bomb deals five six-damage ticks, not twice its documented damage", () => {
  const w = S.createWorld(99, { startTime: 2341 }),
    b = w.animals.find((a) => a.boss === "deep-kraken");
  w.animals = [b];
  w.resources = [];
  w.grid.grid.clear();
  const p = S.addPlayer(w, { id: "p", name: "P" });
  Object.assign(p, {
    x: b.x + 600,
    y: b.y,
    hp: 10000,
    maxHp: 10000,
    shieldUntil: 0,
  });
  b.sleep = false;
  b.attackTimers = [w.time, Infinity];
  b.pendingAttacks = [];
  step(w, 4);
  assert.equal(10000 - p.hp, 30);
});
if (failures) process.exitCode = 1;
