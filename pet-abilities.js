import { PET_BY_ID, ITEM_BY_ID, WORLD, typeMultiplier } from "./data.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const percent = (v, fallback = 0) =>
  typeof v === "string" ? parseFloat(v) / 100 : (v ?? fallback);
const stationary = new Set([
  "blaze",
  "vines",
  "ice-shield",
  "glacier",
  "rampart",
  "burst",
  "fire-ball",
  "plant-ball",
  "water-ball",
  "lock",
  "magma-heal",
]);
const beneficial = new Set([
  "milk",
  "bark",
  "dice",
  "clone",
  "golem-shield",
  "stone-shield",
  "magma-heal",
  "swag",
  "rampart",
  "lock",
  "bubble",
  "web",
  "ice-sword",
]);
export const ABILITY_KINDS = new Set([
  "milk",
  "bark",
  "rockslide",
  "blaze",
  "vines",
  "wave",
  "thunder",
  "mud",
  "hindrance",
  "drain-dash",
  "curse",
  "rampart",
  "lunge",
  "ice-shield",
  "glacier",
  "gift-dash",
  "drain-bite",
  "dice",
  "venom-bite",
  "fear",
  "fog",
  "spit",
  "sting",
  "shell",
  "chain",
  "swag",
  "bubble",
  "tsunami",
  "ice-dash",
  "clone",
  "jaws",
  "lava-spit",
  "magma-heal",
  "wildfire",
  "fire-blast",
  "plant-ball",
  "golem-shield",
  "burst",
  "fire-ball",
  "water-ball",
  "ice-sword",
  "punch",
  "web",
  "stone-shield",
  "smog",
  "lock",
  "tentacles",
]);
// Public infoboxes omit damage for these newer skills. Explicit local values
// keep them functional; their provenance is recorded in reference-sources.md.
const missingDamage = {
  "lava-spit": [
    [8, 16, 12, 2, 4, 3],
    [12, 24, 20, 3, 6, 4],
    [16, 32, 28, 4, 8, 6],
  ],
  "magma-heal": [
    [0, 0, 0, 2, 4, 2],
    [0, 0, 0, 3, 6, 3],
    [0, 0, 0, 4, 8, 4],
  ],
  tentacles: [
    [0, 0, 0, 1, 2, 1],
    [0, 0, 0, 2, 4, 2],
    [0, 0, 0, 3, 6, 3],
  ],
  "stone-shield": [
    [0, 0, 0, 1, 2, 2],
    [0, 0, 0, 2, 4, 4],
    [0, 0, 0, 3, 6, 6],
  ],
  lock: [
    [20, 40, 60, 1, 2, 3],
    [30, 60, 90, 2, 4, 5],
    [40, 80, 120, 3, 6, 7],
  ],
};
export const abilityStats = (a) => {
  const def = PET_BY_ID.get(a.species),
    stats = def?.skillStats?.[a.stage] || {},
    fallback = missingDamage[def?.ability]?.[a.stage];
  return fallback
    ? {
        ...Object.fromEntries(
          [
            "player_dmg",
            "animal_dmg",
            "building_dmg",
            "player_dmg_ot",
            "animal_dmg_ot",
            "building_dmg_ot",
          ].map((key, i) => [key, fallback[i]]),
        ),
        ...stats,
      }
    : stats;
};
export const abilityCooldown = (a) => abilityStats(a).reload || 30;
function friendly(a, b) {
  return (a.owner || a.id) === (b.owner || b.id);
}
function targets(world, a) {
  return [
    ...Object.values(world.players),
    ...world.animals,
    ...world.structures,
  ].filter(
    (t) =>
      t !== a &&
      !t.dead &&
      t.hp > 0 &&
      !friendly(a, t) &&
      !(t.shieldUntil > world.time),
  );
}
function primaryElement(def) {
  return (
    {
      "fire-blast": "fire",
      smog: "fire",
      "fire-ball": "fire",
      "plant-ball": "plant",
      "water-ball": "water",
    }[def.ability] || def.types[0]
  );
}
function hit(world, a, t, tick, api, extra = {}) {
  const st = abilityStats(a),
    prefix = t.item ? "building" : t.items ? "player" : "animal";
  const amount = st[`${prefix}_dmg${tick ? "_ot" : ""}`] ?? 0;
  const def = PET_BY_ID.get(a.species),
    element = primaryElement(def);
  if (t.item) {
    if (amount > 0)
      api.hitStructure(
        world,
        t,
        amount * api.outgoingMultiplier(world, a, { skill: true, element }),
        a,
      );
    return amount;
  }
  const dealt =
    amount > 0
      ? api.hurt(world, t, amount, a, {
          skill: true,
          element,
          kb: 0,
          kind: element,
          ...extra,
        })
      : 0;
  if (st.vampirism && dealt) {
    const drained =
      def.ability === "drain-bite"
        ? dealt / Math.max(1, st.vampirism)
        : st.vampirism;
    api.heal(world, a, drained);
    const owner = world.players[a.owner];
    if (owner && def.ability !== "vines" && distance(owner, a) < 900)
      api.heal(world, owner, drained);
  }
  return dealt;
}
function effect(world, a, t, kind, seconds, value, api) {
  if (
    t.item ||
    (!friendly(a, t) &&
      api.statusImmune(
        world,
        t,
        primaryElement(PET_BY_ID.get(a.species)),
        a,
        kind,
      ))
  )
    return;
  t.effects ||= [];
  const key = `${["slow", "vulnerable"].includes(kind) ? PET_BY_ID.get(a.species).ability : a.id}:${kind}`,
    old = t.effects.find((e) => e.key === key);
  const e = {
    key,
    kind,
    until: world.time + seconds,
    value,
    element: primaryElement(PET_BY_ID.get(a.species)),
    by: a.id,
  };
  if (
    !friendly(a, t) &&
    t.species &&
    (kind === "stun" ||
      (["poison", "burn", "bleed", "blind", "slow"].includes(kind) &&
        typeMultiplier(e.element, PET_BY_ID.get(t.species)?.types || []) > 1))
  ) {
    t.skillBlockedUntil = Math.max(t.skillBlockedUntil || 0, e.until);
    t.cast = null;
    t.castUntil = 0;
  }
  if (old) Object.assign(old, e);
  else t.effects.push(e);
}
function zone(world, a, kind, point, duration, radius) {
  world.hazards.push({
    id: `h${world.nextId++}`,
    kind: `pet-${kind}`,
    x: point.x,
    y: point.y,
    r: radius,
    at: world.time,
    until: world.time + duration,
    owner: a.owner || a.id,
    caster: a.id,
  });
}
function area(world, a, center, radius, tick, api, filter = () => true) {
  const hitTargets = targets(world, a).filter(
    (t) => distance(center, t) < radius + (t.r || 0) && filter(t),
  );
  for (const t of hitTargets) hit(world, a, t, tick, api);
  return hitTargets;
}
function selectedAim(a, aim) {
  const d = distance(a, aim),
    cap = 700,
    k = d > cap ? cap / d : 1;
  return {
    x: clamp(a.x + (aim.x - a.x) * k, 70, WORLD.w - 70),
    y: clamp(a.y + (aim.y - a.y) * k, 70, WORLD.h - 70),
  };
}
export function castAbility(world, a, aim, api) {
  const def = PET_BY_ID.get(a.species),
    kind = def.ability,
    st = abilityStats(a);
  if (
    !ABILITY_KINDS.has(kind) ||
    a.dead ||
    a.sleep ||
    world.time < (a.skillBlockedUntil || 0) ||
    world.time - (a.skillAt ?? -99) < abilityCooldown(a)
  )
    return false;
  const foes = targets(world, a)
    .filter((t) => !t.item || st.building_dmg || st.building_dmg_ot)
    .sort((x, y) => distance(a, x) - distance(a, y));
  const locked = foes.find((t) => t.id === a.lockedTarget || t.id === a.target);
  const target = locked || foes[0];
  if (
    !beneficial.has(kind) &&
    !["curse", "hindrance", "tsunami", "burst"].includes(kind) &&
    (!target || distance(a, target) > 900)
  )
    return false;
  const owner = world.players[a.owner],
    point = selectedAim(
      a,
      aim ||
        target || {
          x: a.x + Math.cos(a.angle) * 220,
          y: a.y + Math.sin(a.angle) * 220,
        },
    );
  const angle = Math.atan2(point.y - a.y, point.x - a.x);
  a.skillAt = world.time;
  a.skillBlockedUntil = world.time;
  a.cast = {
    kind,
    until: world.time + 4,
    tickAt: world.time + 0.5,
    point,
    angle,
    target: target?.id,
    hit: new Set(),
    born: world.time,
  };
  const c = a.cast;
  if (["curse", "hindrance", "fear"].includes(kind) && target)
    c.point = { x: target.x, y: target.y };
  a.castKind = kind === "vines" ? "vines" : kind;
  a.castUntil = c.until;
  const allies = [
    a,
    ...(owner
      ? [owner, ...world.animals.filter((b) => b.owner === owner.id && b !== a)]
      : []),
  ];
  const anchor =
    owner &&
    distance(a, owner) < 600 &&
    !owner.mounted &&
    !(kind === "clone" && owner.shieldLink)
      ? owner
      : a;
  switch (kind) {
    case "bark":
      for (const t of [
        a,
        ...allies
          .filter((t) => t !== a && t.species && distance(t, a) < 450)
          .slice(0, a.stage + 1),
      ]) {
        api.heal(world, t, (st.heal_ot || 10) * 2);
        if (t !== a) effect(world, a, t, "haste", 3, 1.3, api);
      }
      c.until = world.time + 0.1;
      break;
    case "milk":
      c.fixed = { x: a.x, y: a.y };
      zone(world, a, "milk", c.fixed, 4, 240);
      break;
    case "dice": {
      const lucky = owner && api.hat(owner).luck;
      const roll =
          1 + Math.floor(world.random() * (lucky ? 5 : 6)) + (lucky ? 1 : 0),
        t = owner && distance(owner, a) < 600 ? owner : a;
      c.until = world.time + 0.2;
      if (roll === 1) {
        const damage = Math.min(t.hp - 1, 5 * (a.stage + 1));
        if (damage > 0)
          api.hurt(world, t, damage, null, { kind: "shadow", kb: 0 });
      }
      if ([2, 3, 4, 6].includes(roll)) api.heal(world, t, st.heal_ot || 5);
      if ([3, 5, 6].includes(roll))
        effect(world, a, t, "armor", 6, percent(st.dmg_reduction), api);
      if ([4, 5, 6].includes(roll))
        effect(world, a, t, "attack", 6, percent(st.increase_attack, 1), api);
      api.emit(world, { k: "dice", id: a.id, roll, x: a.x, y: a.y });
      break;
    }
    case "curse":
      c.until = world.time + 10;
      c.fixed = { x: target?.x ?? a.x, y: target?.y ?? a.y };
      break;
    case "hindrance":
    case "fear":
      c.fixed = { x: target?.x ?? a.x, y: target?.y ?? a.y };
      break;
    case "clone":
      c.activateAt = world.time + 3;
      c.until = c.activateAt + (st.clone_life || 12);
      c.anchor = anchor.id;
      break;
    case "golem-shield":
      for (const t of allies.filter((t) => distance(t, anchor) < 260))
        effect(world, a, t, "armor", 6, percent(st.dmg_reduction), api);
      c.until = world.time + 6;
      c.anchor = anchor.id;
      break;
    case "stone-shield":
    case "ice-shield":
    case "shell":
    case "magma-heal":
      effect(
        world,
        a,
        a,
        "armor",
        kind === "stone-shield" ? 6 : 4,
        percent(st.dmg_reduction),
        api,
      );
      if (kind === "stone-shield") c.until = world.time + 6;
      if (kind === "shell") c.speedBonus = st.speed_bonus || 100;
      if (kind === "magma-heal") {
        c.speedBonus = 220;
        c.until = world.time + 2.5;
        a.mountBuff = null;
        if (owner?.mounted === a.id) {
          owner.mounted = null;
          owner.saddle = null;
        }
      }
      if (kind === "stone-shield") effect(world, a, a, "slow", 6, 0.85, api);
      if (kind === "shell" && owner?.mounted === a.id)
        effect(world, a, owner, "armor", 4, percent(st.dmg_reduction), api);
      break;
    case "ice-sword":
      c.anchor = anchor.id;
      break;
    case "swag":
      c.activateAt = world.time + 0.6;
      c.until = world.time + 2.7;
      break;
    case "rampart":
      c.activateAt = world.time + 1.4;
      c.until = c.activateAt + 0.1;
      zone(world, a, "warning", point, 1.4, 100);
      break;
    case "lock":
      c.activateAt = world.time + 1;
      c.until = world.time + 3;
      for (let i = 0; i < 5; i++)
        zone(
          world,
          a,
          "warning",
          {
            x: point.x + Math.cos(i * 1.257) * 90,
            y: point.y + Math.sin(i * 1.257) * 90,
          },
          1,
          60,
        );
      break;
    case "thunder":
      c.activateAt = world.time + 0.6;
      c.until = world.time + 1.2;
      break;
    case "web":
      c.fixed = point;
      zone(world, a, "web", point, 4, 240);
      break;
    case "tsunami":
      c.fixed = { x: a.x, y: a.y };
      if (a.stage < 2) {
        zone(world, a, "pool", c.fixed, 4, 180);
      } else {
        c.travel = 100;
      }
      break;
    case "smog":
      c.fixed = { x: a.x, y: a.y };
      c.origin = { ...c.fixed };
      c.travel = 100;
      break;
    case "jaws":
      c.until = world.time + 1.6;
      c.tickAt = world.time + 0.2;
      c.bites = 0;
      break;
    case "glacier":
      c.until = world.time + 4;
      break;
    case "drain-dash":
    case "gift-dash":
    case "ice-dash":
    case "lunge":
      c.speedBonus = st.speed_bonus || 150;
      if (kind === "lunge") c.until = world.time + 0.65;
      break;
    case "drain-bite":
    case "venom-bite":
    case "sting":
    case "punch":
      c.until = world.time + 0.8;
      c.activateAt = world.time + (kind === "punch" ? 1.5 : 0.2);
      if (kind === "punch") c.until = c.activateAt + 0.3;
      break;
    case "plant-ball":
    case "fire-ball":
    case "water-ball":
    case "spit":
    case "lava-spit":
    case "fire-blast":
      c.until = world.time + (["fire-blast", "spit"].includes(kind) ? 4 : 0.8);
      c.shots = 0;
      break;
    case "wildfire":
      c.until = world.time + 10;
      c.fixed = { x: a.x, y: a.y };
      zone(world, a, kind, c.fixed, 10, 220);
      break;
    case "fog":
      c.until = world.time + 5;
      c.fixed = { x: a.x, y: a.y };
      zone(world, a, kind, c.fixed, 5, 300);
      break;
    case "chain":
      c.fixed = { x: a.x, y: a.y };
      for (let i = 1; i <= 4; i++)
        zone(
          world,
          a,
          "chain",
          {
            x: a.x + Math.cos(angle) * i * 130,
            y: a.y + Math.sin(angle) * i * 130,
          },
          4,
          70,
        );
      break;
    case "burst":
      c.activateAt = world.time + 1;
      c.until = world.time + 1.1;
      break;
    case "tentacles":
      c.activateAt = world.time + 1;
      c.until = world.time + 2.5;
      break;
  }
  if (
    [
      "blaze",
      "vines",
      "wave",
      "mud",
      "ice-shield",
      "bubble",
      "stone-shield",
      "milk",
      "rockslide",
    ].includes(kind)
  )
    for (const t of area(
      world,
      a,
      a,
      kind === "thunder" ? 360 : 240,
      false,
      api,
    )) {
      c.hit.add(t.id);
      if (
        ["vines", "thunder", "mud", "bubble", "web", "ice-shield"].includes(
          kind,
        )
      )
        effect(world, a, t, "slow", 1, 1 - percent(st.slowdown, 0.5), api);
    }
  api.emit(world, {
    k: "skill",
    id: a.id,
    skill: def.skill,
    x: a.x,
    y: a.y,
    owner: a.owner,
  });
  return true;
}
export function updateAbility(world, a, dt, api) {
  const c = a.cast;
  if (!c) return false;
  if (world.time < (a.skillBlockedUntil || 0)) {
    a.cast = null;
    a.castUntil = 0;
    return false;
  }
  const st = abilityStats(a),
    kind = c.kind,
    owner = world.players[a.owner];
  if (world.time >= c.until) {
    a.cast = null;
    a.castUntil = 0;
    return false;
  }
  if (stationary.has(kind)) a.vx = a.vy = 0;
  if (c.travel) {
    const speed = kind === "smog" ? 100 + (world.time - c.born) * 90 : c.travel;
    c.fixed.x += Math.cos(c.angle) * speed * dt;
    c.fixed.y += Math.sin(c.angle) * speed * dt;
  }
  if (["curse", "hindrance", "fear"].includes(kind)) {
    const victim =
      world.players[c.target] || world.animals.find((t) => t.id === c.target);
    if (victim && !victim.dead) c.fixed = { x: victim.x, y: victim.y };
  }
  if (kind === "golem-shield") {
    const anchor =
      world.players[c.anchor] ||
      world.animals.find((t) => t.id === c.anchor) ||
      a;
    for (const ally of [
      a,
      ...Object.values(world.players),
      ...world.animals,
    ].filter((t) => friendly(a, t) && distance(t, anchor) < 260))
      effect(world, a, ally, "armor", 0.2, percent(st.dmg_reduction), api);
  }

  if (c.speedBonus) {
    const speed = PET_BY_ID.get(a.species).speed[a.stage] + c.speedBonus;
    a.vx = Math.cos(c.angle) * speed;
    a.vy = Math.sin(c.angle) * speed;
    const movement =
      kind === "magma-heal"
        ? Math.min(speed * dt, distance(a, c.point))
        : speed * dt;
    a.x += Math.cos(c.angle) * movement;
    a.y += Math.sin(c.angle) * movement;
    api.collide(world, a);
    if (owner?.mounted === a.id) {
      owner.x = a.x;
      owner.y = a.y;
      owner.vx = a.vx;
      owner.vy = a.vy;
    }
    if (
      ["ice-dash", "magma-heal"].includes(kind) &&
      world.time >= (c.trailAt || 0)
    ) {
      c.trailAt = world.time + 0.15;
      zone(world, a, kind === "ice-dash" ? "ice-river" : "lava", a, 3, 55);
    }
  }
  const visualKinds = [
    "spit",
    "fire-blast",
    "smog",
    "tentacles",
    "curse",
    "fear",
    "hindrance",
    "ice-sword",
    "glacier",
  ];
  if (visualKinds.includes(kind)) {
    c.visualId ||= `skill${world.nextId++}`;
    const center =
        c.fixed ||
        (["curse", "fear", "hindrance"].includes(kind) ? c.point : a),
      beam = ["spit", "fire-blast", "tentacles"].includes(kind);
    let visual = world.hazards.find((h) => h.id === c.visualId);
    if (!visual) {
      visual = {
        id: c.visualId,
        kind: `pet-${kind}`,
        at: world.time,
        until: c.until,
        owner: a.owner || a.id,
        caster: a.id,
      };
      world.hazards.push(visual);
    }
    Object.assign(visual, {
      x: center.x,
      y: center.y,
      r: beam
        ? kind === "tentacles"
          ? 240
          : 600
        : kind === "smog"
          ? Math.min(350, 90 + (world.time - c.born) * 70)
          : kind === "glacier"
            ? 160
            : 100,
      angle: c.angle,
      shape: beam ? "beam" : null,
      width: kind === "tentacles" ? 100 : 65,
    });
  }
  const foes = targets(world, a);
  if (c.activateAt && world.time >= c.activateAt && !c.activated) {
    c.activated = true;
    const target = foes.find((t) => t.id === c.target);
    if (kind === "clone") {
      const anchor =
        world.players[c.anchor] ||
        world.animals.find((t) => t.id === c.anchor) ||
        a;
      const decoy = {
        ...a,
        id: `clone${world.nextId++}`,
        x: anchor.x + 70,
        y: anchor.y,
        owner: a.owner,
        decoy: true,
        cast: null,
        castUntil: 0,
        pets: undefined,
        hp: a.maxHp,
        maxHp: a.maxHp,
        expiresAt: c.until,
        shieldFor: anchor.id,
        shieldLink: null,
        home: { x: anchor.x, y: anchor.y },
        effects: [],
      };
      world.animals.push(decoy);
      if (anchor.shieldLink) {
        decoy.shieldFor = a.id;
        a.shieldLink = decoy.id;
      } else anchor.shieldLink = decoy.id;
    } else if (kind === "thunder") {
      for (const t of area(world, a, a, 360, false, api)) {
        effect(world, a, t, "slow", 1.2, 1 - percent(st.slowdown), api);
        if (world.random() < 0.5) effect(world, a, t, "stun", 0.6, 1, api);
      }
    } else if (kind === "rampart") {
      const s = {
        id: `ice${world.nextId++}`,
        item: "ice-rampart",
        owner: a.owner,
        x: Math.round(c.point.x),
        y: Math.round(c.point.y),
        r: 65,
        hp: 600,
        maxHp: 600,
        rot: 0,
        cd: 0,
        born: world.time,
        decay: true,
        season: world.biome,
      };
      world.structures.push(s);
      for (const t of area(world, a, c.point, 100, false, api))
        if (world.random() < 0.25) effect(world, a, t, "stun", 1.5, 1, api);
      for (const t of [...Object.values(world.players), ...world.animals])
        if (!t.dead) api.collide(world, t);
    } else if (kind === "lock") {
      for (let i = 0; i < 5; i++)
        for (const t of area(
          world,
          a,
          {
            x: c.point.x + Math.cos(i * 1.257) * 90,
            y: c.point.y + Math.sin(i * 1.257) * 90,
          },
          65,
          false,
          api,
        )) {
          if (world.random() < 0.2)
            effect(world, a, t, "burn", 3, 1 + a.stage, api);
        }
    } else if (kind === "burst") {
      area(world, a, a, 350, false, api);
      if (a.stage === 2) {
        a.stage = 0;
        a.xp = 0;
        a.level = 1;
        a.total = 0;
        a.r = 30;
        a.maxHp = PET_BY_ID.get(a.species).hp[0];
        a.hp = a.maxHp;
        a.cast = null;
        api.emit(world, {
          k: "grow",
          id: a.id,
          owner: a.owner,
          species: a.species,
          stage: 0,
          x: a.x,
          y: a.y,
        });
      }
    } else if (kind === "swag") {
      for (const t of foes.filter((t) => distance(t, a) < 350)) {
        effect(world, a, t, t.items ? "blind" : "stun", 2, 1, api);
      }
    } else if (
      target &&
      ["drain-bite", "venom-bite", "sting", "punch"].includes(kind)
    ) {
      const angle = Math.atan2(target.y - a.y, target.x - a.x);
      a.vx = Math.cos(angle) * 700;
      a.vy = Math.sin(angle) * 700;
      if (distance(a, target) < 380) {
        hit(world, a, target, false, api, {
          knock: kind === "punch" ? 180 : 30,
          kb: 1,
        });
        if (kind === "punch")
          effect(world, a, target, "bleed", 3, 2 + a.stage, api);
        if (["venom-bite", "sting"].includes(kind))
          effect(world, a, target, "poison", 4, 1 + 2 * a.stage, api);
      }
    }
  }
  if (kind === "jaws") {
    if (world.time >= c.tickAt && c.bites < 3) {
      c.tickAt = world.time + 0.35;
      c.bites++;
      const t = foes.find((t) => t.id === c.target);
      if (t && distance(t, a) < a.r + (t.r || 0) + 100) {
        hit(world, a, t, false, api);
        if (c.bites === 3) effect(world, a, t, "bleed", 9, 1 + a.stage, api);
      }
    }
    return false;
  }
  if (["drain-dash", "gift-dash", "ice-dash", "shell", "lunge"].includes(kind))
    for (const t of foes.filter((t) => distance(t, a) < a.r + (t.r || 0) + 40))
      if (!c.hit.has(t.id)) {
        c.hit.add(t.id);
        hit(world, a, t, false, api);
        if (kind === "lunge" && world.random() < 0.5)
          effect(world, a, t, "bleed", 3, 1 + a.stage, api);
      }
  if (world.time < c.tickAt) return stationary.has(kind) || !!c.speedBonus;
  c.tickAt = world.time + 0.5;
  if (["plant-ball", "fire-ball", "water-ball", "lava-spit"].includes(kind)) {
    if (!c.shots || kind === "fire-blast") {
      const count = kind === "lava-spit" ? 1 + 2 * a.stage : 1;
      for (let i = 0; i < count; i++) {
        const angle = c.angle + (i - (count - 1) / 2) * 0.16,
          speed = 650;
        world.projectiles.push({
          id: `j${world.nextId++}`,
          x: a.x + Math.cos(angle) * (a.r + 16),
          y: a.y + Math.sin(angle) * (a.r + 16),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          owner: a.owner || a.id,
          caster: a.id,
          ability: kind,
          piercing: true,
          hitTimes: {},
          element: primaryElement(PET_BY_ID.get(a.species)),
          kind:
            kind === "plant-ball"
              ? "plantball"
              : kind === "water-ball"
                ? "waterball"
                : "fireball",
          until: world.time + 1,
          r: 16,
        });
      }
      c.shots++;
    }
  }
  if (kind === "magma-heal") api.heal(world, a, (st.heal_ot || 25) * 0.5);
  if (
    ["milk", "web", "chain"].includes(kind) ||
    (kind === "tsunami" && a.stage < 2)
  )
    return false;
  if (
    [
      "plant-ball",
      "fire-ball",
      "water-ball",
      "lava-spit",
      "drain-bite",
      "venom-bite",
      "sting",
      "punch",
      "rampart",
      "burst",
      "bark",
      "swag",
      "lock",
      "thunder",
      "magma-heal",
    ].includes(kind)
  )
    return stationary.has(kind) || !!c.speedBonus;
  if (["spit", "fire-blast"].includes(kind)) {
    for (const t of foes.filter((t) => inBeam(a, c.angle, t, 600, 65))) {
      hit(world, a, t, c.hit.has(t.id), api, {
        knock: kind === "fire-blast" ? 120 : 0,
        kb: 1,
      });
      c.hit.add(t.id);
      if (kind === "spit")
        effect(world, a, t, "slow", 1, 1 - percent(st.slowdown), api);
      else effect(world, a, t, "burn", 2, 1 + a.stage, api);
    }
    return false;
  }
  if (
    kind === "clone" ||
    kind === "dice" ||
    kind === "rampart" ||
    kind === "golem-shield"
  )
    return stationary.has(kind);
  let center = c.fixed || a,
    radius =
      kind === "fog"
        ? Math.min(300, 100 + (world.time - c.born) * 50)
        : kind === "smog"
          ? Math.min(350, 90 + (world.time - c.born) * 70)
          : 240;
  if (kind === "ice-sword")
    center =
      world.players[c.anchor] ||
      world.animals.find((t) => t.id === c.anchor) ||
      a;
  if (kind === "glacier")
    center = {
      x: c.point.x + (world.random() - 0.5) * 200,
      y: c.point.y + (world.random() - 0.5) * 200,
    };
  const filter =
    ["curse", "hindrance", "fear"].includes(kind) && c.target
      ? (t) => t.id === c.target
      : kind === "lunge"
        ? () => false
        : kind === "tentacles"
          ? (t) =>
              world.time >= c.activateAt &&
              Math.cos(Math.atan2(t.y - a.y, t.x - a.x) - c.angle) > 0.2
          : () => true;
  const impacted = targets(world, a).filter(
    (t) =>
      distance(center, t) < radius + (t.r || 0) &&
      filter(t) &&
      (!["drain-dash", "gift-dash", "ice-dash", "shell"].includes(kind) ||
        distance(t, a) < a.r + (t.r || 0) + 40) &&
      (kind !== "smog" || inBeam(c.origin, c.angle, t, 800, radius)),
  );
  for (const t of impacted) {
    hit(world, a, t, c.hit.has(t.id), api);
    c.hit.add(t.id);
  }
  for (const t of impacted) {
    if (["mud", "chain", "bubble", "vines", "ice-shield"].includes(kind))
      effect(world, a, t, "slow", 0.8, 1 - percent(st.slowdown, 0.5), api);
    if (kind === "curse")
      effect(world, a, t, "slow", 0.8, 1 - percent(st.slowdown), api);
    if (kind === "hindrance") {
      effect(world, a, t, "build-block", 1, 1, api);
      effect(world, a, t, "skill-block", 1, 1, api);
    }
    if (kind === "fear") {
      effect(world, a, t, "slow", 2, 1 - percent(st.slowdown, 0.8), api);
      effect(
        world,
        a,
        t,
        "vulnerable",
        2,
        1 / Math.max(0.1, percent(st.defense_malus, 0.9)),
        api,
      );
    }
    if (kind === "fog") {
      effect(world, a, t, "attack-block", 1, 1, api);
      effect(world, a, t, "blind", 1, 0.5, api);
    }
    if (
      ["ice-dash", "ice-sword", "glacier"].includes(kind) &&
      world.random() < 0.15
    )
      effect(world, a, t, "stun", 0.8, 1, api);
    if (kind === "smog") effect(world, a, t, "blind", 1, 1, api);
    if (["wildfire", "smog", "fire-blast"].includes(kind))
      effect(world, a, t, "burn", 2, 1 + a.stage, api);
    if (
      ["wave", "tsunami", "rockslide", "tentacles"].includes(kind) &&
      !t.item
    ) {
      const d = distance(t, a) || 1,
        k = kind === "tentacles" ? -450 : 450;
      t.vx += ((t.x - a.x) / d) * k;
      t.vy += ((t.y - a.y) / d) * k;
      if (kind === "tentacles" && t.r <= a.r)
        effect(world, a, t, "stun", 0.6, 1, api);
    }
  }

  if (kind === "gift-dash")
    world.hazards.push({
      id: `h${world.nextId++}`,
      kind: "pet-gift",
      x: a.x,
      y: a.y,
      r: 100,
      at: world.time + 1,
      until: world.time + 1.1,
      owner: a.owner || a.id,
      caster: a.id,
    });
  if (kind === "bubble")
    for (const t of [
      ...Object.values(world.players),
      ...world.animals,
      ...world.structures,
    ].filter((t) => friendly(a, t) && distance(t, a) < 300)) {
      if (t.item) {
        t.defenseUntil = world.time + 1;
        t.defense = percent(st.building_defense);
      } else effect(world, a, t, "armor", 1, percent(st.dmg_reduction), api);
    }
  return stationary.has(kind) || !!c.speedBonus;
}
export function abilityProjectileHit(world, j, t, api, tick = false) {
  const a = world.animals.find((a) => a.id === j.caster);
  if (!a) return;
  if (friendly(a, t)) {
    if (j.ability === "water-ball")
      api.heal(world, t, abilityStats(a).heal_ot || 10);
    return;
  }
  hit(world, a, t, tick, api, {
    kb: 1,
    knock: j.ability === "fire-blast" ? 160 : 40,
  });
  if (["spit", "lava-spit"].includes(j.ability))
    effect(world, a, t, "slow", 2, 0.7, api);
  if (j.ability === "fire-ball")
    effect(world, a, t, "burn", 3, 1 + a.stage, api);
  if (j.ability === "lava-spit") {
    effect(world, a, t, "burn", 3, 2 + a.stage, api);
    effect(world, a, t, "stun", 0.25, 1, api);
  }
}
export function abilityHazardTick(world, h, api) {
  const a = world.animals.find((a) => a.id === h.caster && !a.dead);
  if (!a) return;
  if (["pet-web", "pet-milk", "pet-pool"].includes(h.kind)) {
    for (const ally of [
      ...Object.values(world.players),
      ...world.animals,
    ].filter(
      (t) => !t.dead && friendly(a, t) && distance(t, h) < h.r + (t.r || 0),
    )) {
      api.heal(
        world,
        ally,
        h.kind === "pet-pool" ? 5 + a.stage * 2 : abilityStats(a).heal_ot || 5,
      );
      if (h.kind === "pet-milk")
        effect(world, a, ally, "steadfast", 0.6, 1, api);
    }
    if (h.kind !== "pet-pool")
      for (const t of targets(world, a).filter(
        (t) => distance(t, h) < h.r + (t.r || 0),
      ))
        effect(
          world,
          a,
          t,
          "slow",
          0.6,
          1 - percent(abilityStats(a).slowdown),
          api,
        );
  }
  if (h.kind === "pet-chain")
    for (const t of targets(world, a).filter(
      (t) => distance(t, h) < h.r + (t.r || 0),
    )) {
      hit(world, a, t, true, api);
      effect(
        world,
        a,
        t,
        "slow",
        0.6,
        1 - percent(abilityStats(a).slowdown),
        api,
      );
    }
  if (h.kind === "pet-ice-river")
    for (const t of targets(world, a).filter(
      (t) => distance(t, h) < h.r + (t.r || 0),
    ))
      effect(world, a, t, "slippery", 0.6, 1, api);
  if (h.kind === "pet-gift")
    for (const t of targets(world, a).filter((t) => distance(t, h) < h.r + t.r))
      hit(world, a, t, false, api, { ignoreCape: true });
  if (h.kind === "pet-lava")
    for (const t of targets(world, a).filter(
      (t) => distance(t, h) < h.r + t.r,
    )) {
      hit(world, a, t, true, api);
      effect(world, a, t, "burn", 1, 2 + a.stage, api);
      effect(world, a, t, "slow", 1, 0.4, api);
    }
}

function inBeam(origin, angle, t, length, width) {
  const dx = t.x - origin.x,
    dy = t.y - origin.y,
    along = dx * Math.cos(angle) + dy * Math.sin(angle),
    across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  return (
    along >= -(t.r || 0) &&
    along <= length + (t.r || 0) &&
    across < width + (t.r || 0)
  );
}
export function abilityBlocksProjectile(world, j) {
  return world.animals.some(
    (a) =>
      !a.dead &&
      a.cast &&
      a.cast.until > world.time &&
      ["spit", "fire-blast"].includes(a.cast.kind) &&
      a.owner !== j.owner &&
      inBeam(a, a.cast.angle, j, 600, 65),
  );
}
