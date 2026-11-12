import assert from "node:assert/strict";
import * as S from "../sim.js";
import {
  ITEM_BY_ID,
  PET_BY_ID,
  RESOURCE_TYPES,
  biomeAt,
  biomeState,
  xpForAge,
  totalXp,
  STARTING_ITEMS,
  BOSSES,
  ACCESSORIES,
  ageChoices,
} from "../data.js";
const step = (w, seconds) => {
  for (let i = 0; i < Math.ceil(seconds / S.TICK); i++) S.step(w, S.TICK);
};
const setup = () => {
  const w = S.createWorld(77);
  w.animals = [];
  w.resources = [];
  w.grid.list = w.resources;
  w.grid.grid.clear();
  const p = S.addPlayer(w, { id: "p", name: "Test" });
  Object.assign(p, { x: 2000, y: 2000, shieldUntil: 0 });
  return { w, p };
};
const node = (w, type, x, y) => {
  const n = {
    id: `test-${w.resources.length}`,
    type,
    x,
    y,
    r: 40,
    hp: RESOURCE_TYPES[type].hp,
    respawnAt: 0,
    biome: w.biome,
  };
  w.resources.push(n);
  const k = `${Math.floor(x / w.grid.cell)},${Math.floor(y / w.grid.cell)}`;
  if (!w.grid.grid.has(k)) w.grid.grid.set(k, []);
  w.grid.grid.get(k).push(n);
  return n;
};
const animal = (w, p, species = "wolf", at = { x: p.x + 95, y: p.y }) => {
  const d = PET_BY_ID.get(species);
  const a = {
    id: `a${w.nextId++}`,
    species,
    ...at,
    vx: 0,
    vy: 0,
    r: 30,
    angle: 0,
    hp: d.hp[0],
    maxHp: d.hp[0],
    stage: 0,
    owner: null,
    sleep: true,
    wakeAt: w.time + 100,
    sleepAt: w.time + 100,
    state: "wander",
    home: { ...at },
    target: null,
    cd: 0,
    xp: 0,
    lastHurtAt: -99,
    attackAt: -9,
    hitAt: -9,
    skillAt: -99,
    mode: "defend",
    wanderAt: 100,
  };
  w.animals.push(a);
  return a;
};
const equip = (p, id) => {
  p.items = [
    id,
    ...p.items.filter(
      (i) => ITEM_BY_ID.get(i).slot !== ITEM_BY_ID.get(id).slot,
    ),
  ];
  p.input.sel = 0;
  p.sel = 0;
  p.held = id;
  p.cd = 0;
};
const attack = (w, p, angle = 0) => {
  S.setInput(w, p.id, { angle, attack: true, sel: 0 });
  S.step(w, S.TICK);
};
const cases = [];
const test = (name, fn) => cases.push([name, fn]);
test("age curve matches cumulative XP", () => {
  assert.equal(xpForAge(0), 40);
  assert.equal(xpForAge(9), 400);
  assert.equal(totalXp(20), 8400);
});
test("one world biome cycles with requested durations", () => {
  assert.equal(biomeAt(0, 0, 0).id, "forest");
  assert.equal(biomeAt(9500, 9500, 899).id, "forest");
  assert.equal(biomeState(900).biome.id, "winter");
  assert.equal(biomeState(1380).biome.id, "darkness");
  assert.equal(biomeState(3300).biome.id, "forest");
});
test("each breakable resource depletes, stops collision and respawns; gold stays", () => {
  for (const type of ["tree", "rock", "bush", "log", "cactus"]) {
    const { w, p } = setup(),
      n = node(w, type, p.x + 90, p.y);
    n.hp = 4;
    const xp = p.xp;
    attack(w, p);
    assert.equal(n.hp, 0, type);
    assert.ok(n.respawnAt > w.time);
    assert.ok(!S.nearbyResources(w, n.x, n.y, 100).includes(n));
    assert.ok(S.snapshot(w, p.id).r.some((r) => r[0] === n.id && r[1] === 0));
    p.input.attack = false;
    step(w, RESOURCE_TYPES[type].respawn + 0.1);
    assert.equal(n.respawnAt, 0);
    assert.equal(n.hp, RESOURCE_TYPES[type].hp);
    assert.ok(p.xp >= xp);
  }
  const { w, p } = setup(),
    gold = node(w, "gold", p.x + 100, p.y);
  attack(w, p);
  assert.equal(gold.respawnAt, 0);
  assert.equal(gold.hp, undefined);
});
test("gather XP equals yield, punching alternates", () => {
  const { w, p } = setup();
  node(w, "tree", p.x + 100, p.y);
  let wood = p.res.wood;
  attack(w, p);
  assert.equal(p.xp, p.res.wood - wood);
  let hand = p.punchHand;
  step(w, 0.65);
  assert.notEqual(p.punchHand, hand);
});
test("failed tame wakes and attacks; releasing clears orders", () => {
  const { w, p } = setup(),
    a = animal(w, p);
  w.random = () => 0.999;
  S.command(w, p.id, { t: "tame" });
  assert.equal(a.sleep, false);
  assert.equal(a.angry, true);
  assert.equal(a.target, p.id);
  a.sleep = true;
  p.tameAt = 0;
  w.random = () => 0;
  S.command(w, p.id, { t: "tame" });
  assert.equal(a.owner, p.id);
  a.lockedTarget = "boss";
  a.post = { x: 1, y: 1 };
  S.command(w, p.id, { t: "release", id: a.id });
  assert.equal(a.owner, null);
  assert.equal(a.target, null);
  assert.equal(a.lockedTarget, null);
  assert.deepEqual(p.pets, []);
});
test("contact bite has a windup and resets out of range", () => {
  const { w, p } = setup(),
    a = animal(w, p, "wolf", { x: p.x + 65, y: p.y });
  a.sleep = false;
  a.angry = true;
  a.state = "chase";
  a.target = p.id;
  let hp = p.hp;
  S.step(w, 0.05);
  assert.equal(p.hp, hp);
  step(w, 0.2);
  assert.equal(p.hp, hp);
  step(w, 0.3);
  assert.ok(p.hp < hp);
});
test("explicit target chases beyond owner leash and survives incidental hits", () => {
  const { w, p } = setup(),
    a = animal(w, p);
  Object.assign(a, { owner: p.id, sleep: false });
  p.pets = [a.id];
  const boss = animal(w, p, "bear", { x: p.x + 1400, y: p.y });
  boss.sleep = false;
  boss.stage = 1;
  boss.hp = boss.maxHp = 10000;
  S.command(w, p.id, { t: "pets", mode: "attack", target: boss.id });
  step(w, 0.1);
  assert.equal(a.target, boss.id);
  const incidental = animal(w, p, "rabbit", { x: p.x + 90, y: p.y });
  attack(w, p);
  assert.equal(a.target, boss.id);
  step(w, 8);
  assert.ok(boss.hp < 10000, "pet reaches and attacks commanded entity");
});
test("ground and defensive commands roam around area", () => {
  const { w, p } = setup(),
    a = animal(w, p);
  Object.assign(a, { owner: p.id, sleep: false, x: p.x, y: p.y + 120 });
  p.pets = [a.id];
  S.command(w, p.id, { t: "pets", mode: "move", x: p.x + 200, y: p.y + 200 });
  step(w, 4);
  const first = { x: a.x, y: a.y };
  step(w, 5);
  assert.ok(Math.hypot(a.x - first.x, a.y - first.y) > 10);
  assert.ok(Math.hypot(a.x - a.post.x, a.y - a.post.y) < 250);
});
test("selection cannot place, holding click places once, overlapping bodies pushed", () => {
  const { w, p } = setup();
  equip(p, "wood-wall");
  const a = animal(w, p, "bear", {
    x: p.x + S.placementDistance(p, ITEM_BY_ID.get("wood-wall")),
    y: p.y,
  });
  p.res.wood = 1000;
  step(w, 0.1);
  assert.equal(w.structures.length, 0);
  attack(w, p);
  assert.equal(w.structures.length, 1);
  assert.ok(
    Math.hypot(a.x - w.structures[0].x, a.y - w.structures[0].y) >=
      a.r + w.structures[0].r - 2,
  );
  step(w, 1);
  assert.equal(w.structures.length, 1);
});
test("own buildings can be destroyed; wrench repairs them", () => {
  const { w, p } = setup();
  w.structures.push({
    id: "own",
    item: "wood-wall",
    owner: p.id,
    x: p.x + 90,
    y: p.y,
    r: 42,
    hp: 10,
    maxHp: 400,
  });
  equip(p, "stone-wrench");
  attack(w, p);
  assert.ok(w.structures[0].hp > 10);
  equip(p, "stone-axe");
  w.structures[0].hp = 1;
  attack(w, p);
  assert.equal(w.structures.length, 0);
});
test("windmills pay gold only", () => {
  const { w, p } = setup();
  w.structures.push({
    id: "mill",
    item: "wood-windmill",
    owner: p.id,
    x: 5000,
    y: 5000,
    r: 44,
    hp: 200,
    maxHp: 200,
    born: 0,
  });
  step(w, 11);
  assert.equal(p.xp, 0);
  assert.equal(p.age, 0);
  assert.ok(p.res.gold > 0);
});
test("food click eats once while held", () => {
  const { w, p } = setup();
  p.hp = 20;
  p.res.food = 100;
  equip(p, "apple");
  attack(w, p);
  step(w, 2);
  assert.equal(p.hp, 30);
  assert.equal(p.res.food, 95);
  S.setInput(w, p.id, { attack: false });
  S.step(w, 0.05);
  attack(w, p);
  assert.equal(p.hp, 40);
});
test("labrys hits full circle, all weapons slow and variants slower", () => {
  const { w, p } = setup();
  const rear = animal(w, p, "bear", { x: p.x - 90, y: p.y });
  equip(p, "gold-labrys");
  attack(w, p);
  assert.ok(rear.hp < rear.maxHp);
  assert.ok(ITEM_BY_ID.get("stone-sword").speed < ITEM_BY_ID.get("hand").speed);
  assert.ok(
    ITEM_BY_ID.get("gold-katana").speed < ITEM_BY_ID.get("gold-sword").speed,
  );
});
test("spikes deal damage without knockback", () => {
  const { w, p } = setup();
  w.structures.push({
    id: "spike",
    item: "wood-spike",
    owner: "enemy",
    x: p.x + 75,
    y: p.y,
    r: 40,
    hp: 200,
    maxHp: 200,
  });
  step(w, 0.1);
  assert.ok(p.hp < 100);
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
});
test("boost persists beyond pad for substantial distance", () => {
  const { w, p } = setup();
  w.structures.push({
    id: "boost",
    item: "boost-pad",
    owner: p.id,
    x: p.x,
    y: p.y,
    r: 40,
    hp: 100,
    maxHp: 100,
    rot: 0,
  });
  const x = p.x;
  step(w, 0.8);
  assert.ok(p.x - x > 600);
});
test("respawn retains forty percent cumulative XP", () => {
  const { w, p } = setup();
  p.age = 20;
  p.xp = 200;
  p.dead = true;
  p.deadAt = -10;
  let xp = totalXp(p.age, p.xp);
  S.command(w, p.id, { t: "respawn" });
  assert.equal(p.dead, false);
  assert.equal(totalXp(p.age, p.xp), Math.floor(xp * 0.4));
  assert.ok(p.age > 8);
});
test("upgrade preserves selected slot and branch", () => {
  const { w, p } = setup();
  p.sel = p.items.indexOf("wood-windmill");
  p.input.sel = p.sel;
  p.choices = [4];
  S.command(w, p.id, { t: "choose", id: "stone-bow" });
  assert.equal(ITEM_BY_ID.get(p.items[p.sel]).slot, "windmill");
  assert.ok(ageChoices(1, STARTING_ITEMS).includes("stone-gloves"));
  assert.deepEqual(ageChoices(11, ["gold-katana"]), ["ruby-katana"]);
});
test("navigation routes around a wall instead of parking at it", () => {
  const { w, p } = setup();
  for (let i = -2; i <= 2; i++)
    w.structures.push({
      id: `wall${i}`,
      item: "wood-wall",
      owner: "enemy",
      x: 2200,
      y: 2000 + i * 80,
      r: 42,
      hp: 400,
      maxHp: 400,
    });
  const goal = { x: 2450, y: 2000 };
  for (let i = 0; i < 200; i++) {
    const q = S.navigationGoal(w, p, goal),
      dx = q.x - p.x,
      dy = q.y - p.y,
      d = Math.hypot(dx, dy) || 1;
    S.moveTamer(w, p, { mx: dx / d, my: dy / d }, 250, 0.05);
    w.time += 0.05;
  }
  assert.ok(p.x > 2350, `stuck at ${p.x},${p.y}`);
});
test("taming tool failure wakes without aggression or tame bonus", () => {
  const { w, p } = setup();
  const a = animal(w, p, "wolf", { x: p.x + 100, y: p.y });
  a.bonus = 30;
  w.random = () => 0;
  equip(p, "slingshot");
  attack(w, p);
  step(w, 0.15);
  assert.equal(a.bonus, 0);
  assert.equal(a.sleep, false);
  assert.equal(a.angry, false);
  assert.equal(a.target, null);
});
test("turrets and towers acquire wild animals and bosses", () => {
  for (const type of ["wood-turret", "fire-tower"]) {
    const { w, p } = setup(),
      a = animal(w, p, "bear", { x: p.x + 300, y: p.y });
    a.boss = "old-oak";
    a.hp = a.maxHp = 8000;
    a.dmgBy = {};
    a.waves = 0;
    a.lastHurtAt = -99;
    w.structures.push({
      id: "turret",
      item: type,
      owner: p.id,
      x: p.x,
      y: p.y,
      r: 44,
      hp: 200,
      maxHp: 200,
      cd: 0,
    });
    S.step(w, 0.05);
    assert.ok(w.projectiles.length > 0, type);
    step(w, 0.5);
    assert.ok(a.hp < 8000, type);
  }
});
test("bosses have different fixed-facing cycles, telegraphs and elemental attacks", () => {
  const cycles = new Set();
  for (let i = 0, time = 0; i < BOSSES.length; i++) {
    const w = S.createWorld(89, { startTime: time }),
      boss = w.animals.find((a) => a.boss),
      p = S.addPlayer(w, { id: "p", name: "Test" });
    w.animals = [boss];
    w.resources = [];
    w.grid.grid.clear();
    p.x = boss.x + 300;
    p.y = boss.y;
    p.shieldUntil = 0;
    boss.sleep = false;
    boss.lastHurtAt = w.time;
    const angle = boss.angle;
    S.step(w, 0.05);
    assert.ok(boss.pending);
    assert.equal(boss.angle, angle);
    cycles.add(BOSSES[i].cycle.join());
    assert.ok(BOSSES[i].types.length);
    step(w, 1);
    assert.ok(w.events.some((e) => e.k === "bosswindup"));
    time = biomeState(time).endsAt;
  }
  assert.equal(cycles.size, BOSSES.length);
});
test("boss kill drops three gold chests and only legendary babies", () => {
  const w = S.createWorld(89),
    boss = w.animals.find((a) => a.boss),
    p = S.addPlayer(w, { id: "p", name: "Test" });
  w.animals = [boss];
  w.resources = [];
  w.grid.grid.clear();
  p.x = boss.x - boss.r - p.r - 5;
  p.y = boss.y;
  p.shieldUntil = 0;
  boss.hp = 1;
  attack(w, p);
  assert.ok(!w.animals.includes(boss));
  assert.equal(w.resources.filter((n) => n.type === "chest").length, 3);
  assert.equal(w.animals.length, 3);
  assert.ok(
    w.animals.every(
      (a) => a.sleep && PET_BY_ID.get(a.species).rarity === "legendary",
    ),
  );
  const snap = JSON.parse(JSON.stringify(S.snapshot(w, p.id)));
  assert.equal(snap.chests.length, 3);
});
test("ocean ink pools poison and blind, whirlpool is invulnerable", () => {
  const w = S.createWorld(89, { startTime: 2340 }),
    boss = w.animals.find((a) => a.boss),
    p = S.addPlayer(w, { id: "p", name: "Test" });
  assert.equal(w.biome, "ocean");
  w.animals = [boss];
  w.resources = [];
  w.grid.grid.clear();
  Object.assign(p, {
    x: boss.x + 300,
    y: boss.y,
    shieldUntil: 0,
    hp: 1000,
    maxHp: 1000,
  });
  boss.sleep = false;
  boss.lastHurtAt = w.time;
  step(w, 2);
  assert.ok(w.hazards.some((h) => h.kind === "poison"));
  assert.ok(p.blindUntil > w.time);
  assert.ok(S.snapshot(w, p.id).me.fx[5]);
  step(w, 2);
  assert.ok(boss.invulnerableUntil > w.time);
});
test("season transition retains visible wild animals and pets", () => {
  const { w, p } = setup(),
    a = animal(w, p, "bear");
  w.time = 899.99;
  const tame = animal(w, p);
  Object.assign(tame, { owner: p.id, sleep: false });
  p.pets = [tame.id];
  S.step(w, 0.05);
  assert.equal(w.biome, "winter");
  assert.ok(w.animals.includes(a));
  assert.ok(w.animals.includes(tame));
  assert.ok(w.animals.some((a) => a.boss === "frost-golem"));
  assert.ok(
    w.resources.every((n) => n.type === "big-gold" || n.biome === "winter"),
  );
});
test("damaged node mutations survive joining and healed resource disappears from mutations", () => {
  const { w, p } = setup(),
    n = node(w, "tree", p.x + 90, p.y);
  attack(w, p);
  const snap = JSON.parse(JSON.stringify(S.snapshot(w, p.id)));
  assert.ok(snap.r.some((r) => r[0] === n.id && r[1] === n.hp));
  n.hp = RESOURCE_TYPES.tree.hp;
  assert.ok(!S.snapshot(w, p.id).r.some((r) => r[0] === n.id));
});
test("resources wait to respawn under a building", () => {
  const { w, p } = setup(),
    n = node(w, "tree", 2500, 2500);
  n.hp = 0;
  n.respawnAt = 0.01;
  w.structures.push({
    id: "wall",
    item: "wood-wall",
    owner: p.id,
    x: n.x,
    y: n.y,
    r: 42,
    hp: 400,
    maxHp: 400,
  });
  S.step(w, 0.05);
  assert.ok(n.respawnAt > w.time);
  assert.ok(!S.nearbyResources(w, n.x, n.y, 100).includes(n));
});
test("accessories use separate ownership and amplify matching weapon damage", () => {
  const { w, p } = setup();
  p.res.gold = 100000;
  S.command(w, p.id, { t: "accessory", id: "demon-wings" });
  assert.equal(p.wings, "demon-wings");
  assert.ok(p.accessories.includes(p.wings));
  const a = animal(w, p, "bear", { x: p.x + 100, y: p.y });
  equip(p, "stone-axe");
  attack(w, p);
  assert.equal(
    a.maxHp - a.hp,
    Math.round(ITEM_BY_ID.get("stone-axe").adm * 1.2),
  );
  assert.equal(S.decodePlayer(S.encodePlayer(p)).wings, p.wings);
});
test("primary cosmetics preserve stats and late upgrades preserve chosen branches", () => {
  assert.ok(ageChoices(22, ["sapphire-sword"]).includes("diamond-sword"));
  assert.equal(
    ITEM_BY_ID.get("diamond-sword").dmg,
    ITEM_BY_ID.get("sapphire-sword").dmg,
  );
  assert.deepEqual(ageChoices(14, ["gold-crossbow"]), ["ruby-crossbow"]);
  assert.deepEqual(ageChoices(7, ["stone-wall"]), ["gold-wall"]);
});
test("click during an earlier weapon cooldown places once when ready", () => {
  const { w, p } = setup();
  equip(p, "wood-wall");
  p.res.wood = 100;
  p.cd = w.time + 0.4;
  attack(w, p);
  assert.equal(w.structures.length, 0);
  step(w, 1);
  assert.equal(w.structures.length, 1);
});
test("age tools unlock net/saddle and all secondary branches", () => {
  assert.deepEqual(ageChoices(5, STARTING_ITEMS), [
    "appletor",
    "slingshot",
    "bug-net",
    "saddle",
  ]);
  assert.equal(ageChoices(10, ["stone-bow"]).length, 4);
  assert.equal(ageChoices(10, ["stone-shield"]).length, 3);
  assert.equal(ageChoices(25, ["saddle"]).length, 5);
  const { w, p } = setup();
  const bug = node(w, "insect", p.x + 70, p.y);
  equip(p, "bug-net");
  attack(w, p);
  assert.ok(bug.respawnAt > w.time);
  assert.ok(p.res.gold > 0);
  const a = animal(w, p, "bear");
  Object.assign(a, { owner: p.id, sleep: false, stage: 2 });
  p.pets = [a.id];
  equip(p, "saddle");
  S.setInput(w, p.id, { attack: false });
  S.step(w, 0.05);
  attack(w, p);
  assert.equal(p.mounted, a.id);
  S.command(w, p.id, { t: "release", id: a.id });
  assert.equal(p.mounted, null);
});
test("species skills have distinct sustained effects and cooldowns", () => {
  const { w, p } = setup(),
    rabbit = animal(w, p, "rabbit"),
    enemy = S.addPlayer(w, { id: "e", name: "Enemy" });
  Object.assign(rabbit, {
    owner: p.id,
    sleep: false,
    x: p.x + 60,
    y: p.y,
    hp: 50,
  });
  p.pets = [rabbit.id];
  p.hp = 50;
  enemy.x = rabbit.x + 80;
  enemy.y = rabbit.y;
  enemy.shieldUntil = 0;
  assert.equal(S.skillCooldown(rabbit), 20);
  S.command(w, p.id, { t: "skill" });
  assert.equal(rabbit.castKind, "vines");
  assert.ok(p.hp > 50);
  const hp = enemy.hp;
  step(w, 1);
  assert.ok(enemy.hp < hp);
});
let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n${e.stack}`);
  }
}
if (failed) process.exitCode = 1;
else console.log(`${cases.length} mechanics regressions passed`);
