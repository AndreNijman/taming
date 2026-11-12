import assert from "node:assert/strict";
import * as S from "../sim.js";
import { BOSSES, BIOME_DURATIONS, PET_BY_ID, ITEM_BY_ID } from "../data.js";
function scenario(index, prepared) {
  const start = BIOME_DURATIONS.slice(0, index).reduce((n, v) => n + v, 0) + 1;
  const w = S.createWorld(456 + index, { startTime: start }),
    b = w.animals.find((a) => a.boss === BOSSES[index].id);
  w.animals = [b];
  w.resources = [];
  w.grid.grid.clear();
  w.meteorAt = Infinity;
  const p = S.addPlayer(w, {
    id: "p",
    name: prepared ? "Prepared" : "Starter",
  });
  Object.assign(p, { x: b.x - 210, y: b.y, shieldUntil: 0 });
  if (prepared) {
    p.items = ["sapphire-sword", "cake"];
    p.hat = "knight";
    p.wings = `cape-${index === 4 ? "poison" : BOSSES[index].types[0]}`;
    p.res.food = 10000;
    const party = [
      ["salamander", "deer", "water-fairy"],
      ["salamander", "deer", "water-fairy"],
      ["armadillo", "stone-golem", "water-fairy"],
      ["bear", "camel", "water-fairy"],
      ["grove-spirit", "deer", "water-fairy"],
      ["bear", "shark", "water-fairy"],
    ][index];
    for (const [i, id] of party.entries()) {
      const d = PET_BY_ID.get(id),
        a = {
          id: `ally${i}`,
          species: id,
          x: p.x - 80,
          y: p.y + (i - 1) * 110,
          vx: 0,
          vy: 0,
          r: 52,
          angle: 0,
          hp: d.hp[2],
          maxHp: d.hp[2],
          stage: 2,
          owner: p.id,
          sleep: false,
          home: { x: p.x, y: p.y },
          state: "follow",
          target: b.id,
          lockedTarget: b.id,
          mode: "attack",
          cd: 0,
          xp: 0,
          skillAt: -99,
          lastHurtAt: -99,
          wanderAt: 999,
        };
      w.animals.push(a);
      p.pets.push(a.id);
    }
  }
  let elapsed = 0,
    hits = 0,
    waves = 0;
  for (; elapsed < 300 && !p.dead && w.animals.includes(b); elapsed += S.TICK) {
    const dx = b.x - p.x,
      dy = b.y - p.y,
      d = Math.hypot(dx, dy) || 1;
    // A prepared player heals and repositions when a visible telegraph is aimed at them.
    if (prepared && p.hp < 65 && w.time >= p.cd)
      S.command(w, p.id, { t: "eat" });
    if (prepared) S.command(w, p.id, { t: "skill", x: b.x, y: b.y });
    const danger =
      prepared &&
      (b.pendingAttacks?.some((a) => a.at - w.time < 1.5) ||
        w.hazards.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < h.r + 40));
    const reach = b.r + p.r + (ITEM_BY_ID.get(p.items[0]).range || 20) * 0.5;
    const mx = danger ? -dy / d : d > reach ? dx / d : 0,
      my = danger ? dx / d : d > reach ? dy / d : 0;
    S.setInput(w, p.id, {
      mx,
      my,
      angle: Math.atan2(dy, dx),
      attack: !prepared || p.hp >= 65,
      sel: 0,
    });
    S.step(w, S.TICK);
    hits += w.events.filter((e) => e.k === "dmg" && e.id === p.id).length;
    waves = Math.max(waves, b.waves);
    w.events = [];
  }
  return {
    boss: BOSSES[index].id,
    loadout: prepared ? "prepared" : "starter",
    outcome: p.dead
      ? "defeated"
      : w.animals.includes(b)
        ? "timeout"
        : "cleared",
    seconds: Math.round(elapsed * 10) / 10,
    bossHealth: Math.max(0, Math.round(b.hp)),
    playerHealth: Math.round(p.hp),
    waves,
    hits,
  };
}
const results = [];
for (let i = 0; i < BOSSES.length; i++)
  for (const prepared of [false, true]) {
    const r = scenario(i, prepared);
    results.push(r);
    console.log(JSON.stringify(r));
  }
assert.ok(
  results
    .filter((r) => r.loadout === "starter")
    .every((r) => r.outcome === "defeated"),
  "stationary starter cannot grind down a boss",
);
assert.ok(
  results.every((r) => r.hits > 0),
  "every encounter applies real boss or minion damage",
);

assert.ok(
  results
    .filter((r) => r.loadout === "prepared")
    .every((r) => r.outcome === "cleared"),
  "counter-type pets, healing and dodging can clear every boss within its season",
);
