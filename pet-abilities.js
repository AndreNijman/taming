import { PET_BY_ID, ITEM_BY_ID, WORLD } from "./data.js";

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
  "fire-blast",
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
export const abilityStats = (a) =>
  PET_BY_ID.get(a.species)?.skillStats?.[a.stage] || {};
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
  return def.ability === "fire-blast" ? "fire" : def.types[0];
}
function hit(world, a, t, tick, api, extra = {}) {
  const st = abilityStats(a),
    prefix = t.item ? "building" : t.items ? "player" : "animal";
  const amount = st[`${prefix}_dmg${tick ? "_ot" : ""}`] ?? 0;
  const def = PET_BY_ID.get(a.species),
    element = primaryElement(def);
  if (t.item) {
    if (amount > 0) api.hitStructure(world, t, amount, a);
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
    api.heal(world, a, dealt * st.vampirism);
    const owner = world.players[a.owner];
    if (owner && distance(owner, a) < 900)
      api.heal(world, owner, dealt * st.vampirism);
  }
  return dealt;
}
function effect(world, a, t, kind, seconds, value, api) {
  if (
    t.item ||
    api.statusImmune(world, t, primaryElement(PET_BY_ID.get(a.species)))
  )
    return;
  t.effects ||= [];
  const key = `${a.id}:${kind}`,
    old = t.effects.find((e) => e.key === key);
  const e = {
    key,
    kind,
    until: world.time + seconds,
    value,
    element: primaryElement(PET_BY_ID.get(a.species)),
    by: a.id,
  };
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
  if (!beneficial.has(kind) && (!target || distance(a, target) > 900))
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
  a.castKind = kind === "vines" ? "vines" : kind;
  a.castUntil = c.until;
  const allies = [
    a,
    ...(owner
      ? [owner, ...world.animals.filter((b) => b.owner === owner.id && b !== a)]
      : []),
  ];
  const anchor =
    owner && distance(a, owner) < 600 && !owner.mounted ? owner : a;
  switch (kind) {
    case "bark":
      for (const t of allies.filter((t) => distance(t, a) < 450).slice(0, 4)) {
        api.heal(world, t, (st.heal_ot || 10) * 2);
        if (t !== a) effect(world, a, t, "haste", 3, 1.3, api);
      }
      c.until = world.time + 0.1;
      break;
    case "milk":
      for (const t of allies.filter((t) => distance(t, a) < 300))
        effect(world, a, t, "steadfast", 4, 1, api);
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
    case "glacier":
      c.until = world.time + 4;
      break;
    case "drain-dash":
    case "gift-dash":
    case "ice-dash":
    case "lunge":
      c.speedBonus = st.speed_bonus || 150;
      break;
    case "drain-bite":
    case "venom-bite":
    case "sting":
    case "punch":
      c.until = world.time + 0.8;
      c.activateAt = world.time + 0.2;
      break;
    case "plant-ball":
    case "fire-ball":
    case "water-ball":
    case "spit":
    case "lava-spit":
    case "fire-blast":
      c.until = world.time + (kind === "fire-blast" ? 4 : 0.8);
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
      c.fixed = point;
      zone(world, a, kind, point, 4, 250);
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
      "thunder",
      "mud",
      "ice-shield",
      "bubble",
      "smog",
      "web",
      "stone-shield",
      "tsunami",
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
      if (
        ["vines", "thunder", "mud", "bubble", "web", "ice-shield"].includes(
          kind,
        )
      )
        effect(world, a, t, "slow", 1, percent(st.slowdown, 0.5), api);
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
  const st = abilityStats(a),
    kind = c.kind,
    owner = world.players[a.owner];
  if (world.time >= c.until) {
    a.cast = null;
    a.castUntil = 0;
    return false;
  }
  if (stationary.has(kind)) a.vx = a.vy = 0;
  if (c.speedBonus) {
    const speed = PET_BY_ID.get(a.species).speed[a.stage] + c.speedBonus;
    a.vx = Math.cos(c.angle) * speed;
    a.vy = Math.sin(c.angle) * speed;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    api.collide(world, a);
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
      anchor.shieldLink = decoy.id;
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
        expiresAt: world.time + 60,
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
          if (!t.item)
            api.hurt(world, t, 20 + 10 * a.stage, a, {
              skill: true,
              element: "rock",
              kb: 0,
            });
        }
    } else if (kind === "burst") {
      area(world, a, a, 350, false, api);
      if (a.stage === 2) {
        api.hurt(world, a, Math.max(0, a.hp - 1), null, { kb: 0 });
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
        if (["venom-bite", "sting"].includes(kind))
          effect(world, a, target, "poison", 4, 1 + 2 * a.stage, api);
      }
    }
  }
  if (world.time < c.tickAt) return stationary.has(kind) || !!c.speedBonus;
  c.tickAt = world.time + 0.5;
  if (
    [
      "plant-ball",
      "fire-ball",
      "water-ball",
      "spit",
      "lava-spit",
      "fire-blast",
    ].includes(kind)
  ) {
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
    kind === "clone" ||
    kind === "dice" ||
    kind === "rampart" ||
    kind === "golem-shield"
  )
    return stationary.has(kind);
  let center = c.fixed || a,
    radius = ["fog", "chain"].includes(kind) ? 300 : 240;
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
    kind === "tentacles"
      ? (t) =>
          world.time >= c.activateAt &&
          Math.cos(Math.atan2(t.y - a.y, t.x - a.x) - c.angle) > 0.2
      : () => true;
  for (const t of area(world, a, center, radius, true, api, filter)) {
    if (
      [
        "thunder",
        "mud",
        "chain",
        "bubble",
        "web",
        "vines",
        "spit",
        "ice-shield",
      ].includes(kind)
    )
      effect(world, a, t, "slow", 0.8, percent(st.slowdown, 0.5), api);
    if (["curse", "hindrance"].includes(kind)) {
      effect(world, a, t, "hat-disabled", 1, 1, api);
      effect(world, a, t, "build-block", 1, 1, api);
      effect(world, a, t, "skill-block", 1, 1, api);
    }
    if (kind === "fear") {
      effect(world, a, t, "slow", 2, percent(st.slowdown, 0.8), api);
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
  if (kind === "jaws")
    for (const t of foes.filter((t) => distance(t, a) < 300))
      hit(world, a, t, false, api);
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
  if (kind === "milk")
    for (const t of [a, owner].filter(Boolean)) {
      api.heal(world, t, (st.heal_ot || 5) * 0.5);
    }
  if (kind === "web")
    for (const t of [a, owner].filter(Boolean))
      api.heal(world, t, (st.heal_ot || 5) * 0.5);
  if (["drain-dash", "gift-dash", "ice-dash", "shell", "lunge"].includes(kind))
    for (const t of foes.filter((t) => distance(t, a) < a.r + (t.r || 0) + 40))
      if (!c.hit.has(t.id)) {
        c.hit.add(t.id);
        hit(world, a, t, false, api);
      }
  return stationary.has(kind) || !!c.speedBonus;
}
export function abilityProjectileHit(world, j, t, api) {
  const a = world.animals.find((a) => a.id === j.caster);
  if (!a) return;
  hit(world, a, t, false, api, {
    kb: 1,
    knock: j.ability === "fire-blast" ? 160 : 40,
  });
  if (j.ability === "plant-ball") {
    const st = abilityStats(a);
    api.heal(world, a, st.vampirism || 1);
    const owner = world.players[a.owner];
    if (owner) api.heal(world, owner, st.vampirism || 1);
  }
  if (j.ability === "water-ball") {
    const owner = world.players[a.owner];
    if (owner) api.heal(world, owner, abilityStats(a).heal_ot || 10);
  }
  if (["spit", "lava-spit"].includes(j.ability))
    effect(world, a, t, "slow", 2, 0.7, api);
  if (j.ability === "lava-spit") {
    effect(world, a, t, "burn", 3, 2 + a.stage, api);
    effect(world, a, t, "stun", 0.25, 1, api);
  }
}
export function abilityHazardTick(world, h, api) {
  const a = world.animals.find((a) => a.id === h.caster && !a.dead);
  if (!a) return;
  if (h.kind === "pet-gift")
    for (const t of targets(world, a).filter((t) => distance(t, h) < h.r + t.r))
      hit(world, a, t, false, api);
  if (h.kind === "pet-lava")
    for (const t of targets(world, a).filter(
      (t) => distance(t, h) < h.r + t.r,
    )) {
      hit(world, a, t, true, api);
      effect(world, a, t, "burn", 1, 2 + a.stage, api);
      effect(world, a, t, "slow", 1, 0.6, api);
    }
}
