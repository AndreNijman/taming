import {
  HAT_BY_ID,
  ACCESSORY_BY_ID,
  PET_BY_ID,
  BOSS_BY_ID,
  ITEM_BY_ID,
} from "./data.js";
export const accessory = (p) =>
  ACCESSORY_BY_ID.get(p?.wings) || ACCESSORY_BY_ID.get("none");
export const equippedHat = (p, time = Infinity) =>
  p?.effects?.some((e) => e.kind === "hat-disabled" && e.until > time)
    ? HAT_BY_ID.get("none")
    : HAT_BY_ID.get(p?.hat) || HAT_BY_ID.get("none");
export function sourceTypes(source) {
  return source?.element
    ? [source.element]
    : source?.boss
      ? BOSS_BY_ID.get(source.boss)?.types || []
      : source?.species
        ? PET_BY_ID.get(source.species)?.types || []
        : [];
}
export const isDog = (source) =>
  !!source?.species && /(^dog$|dog$)/.test(source.species);
export function statusImmune(world, t, element, by, kind) {
  const p = t.items ? t : world.players[t.owner],
    acc = accessory(p);
  return !!(
    (t.effects?.some((e) => e.kind === "steadfast" && e.until > world.time) &&
      [
        "slow",
        "push",
        "pull",
        "hat-disabled",
        "build-block",
        "skill-block",
      ].includes(kind)) ||
    (t.items &&
      acc.cape &&
      (acc.element === element || sourceTypes(by).includes(acc.element))) ||
    (t.items && acc.immuneDog && isDog(by))
  );
}
export function incomingMultiplier(world, t, by, opts = {}) {
  const types = [
      ...new Set([opts.element, ...sourceTypes(by)].filter(Boolean)),
    ],
    acc = accessory(t.items ? t : null),
    h = equippedHat(t, world.time);
  let m = 1;
  if (t.items) {
    m *= h.incoming || 1;
    if (h.gloveArmor && ITEM_BY_ID.get(t.held)?.family === "gloves")
      m *= 1 - h.gloveArmor;
    if (acc.cape && !opts.ignoreCape && types.includes(acc.element))
      m *= 1 - (opts.skill ? 0.8 : by?.species ? 0.2 : 0.4);
    if (acc.dogArmor && isDog(by)) m *= 1 - acc.dogArmor;
  }
  const owner = t.owner && world.players[t.owner];
  if (owner && owner.mounted === t.id)
    m *= 1 - (equippedHat(owner, world.time).mountedArmor || 0);
  let armor = 0;
  for (const e of t.effects || [])
    if (e.until > world.time) {
      if (e.kind === "armor" && !(opts.kind === "spike" && !t.items))
        armor = Math.max(armor, e.value);
      if (e.kind === "vulnerable") m *= e.value;
    }
  return m * (1 - Math.min(0.99, armor));
}
export function outgoingMultiplier(world, by, opts = {}) {
  if (!by) return 1;
  let m = 1;
  for (const e of by.effects || [])
    if (e.kind === "attack" && e.until > world.time) m *= e.value;
  if (by.species && !by.boss) {
    const def = PET_BY_ID.get(by.species),
      owner = world.players[by.owner];
    if (!owner) return m;
    const h = equippedHat(owner, world.time),
      acc = accessory(owner);
    const element = opts.element || def.types[0];
    if (h.element === element || def.types.includes(h.element))
      m *= opts.skill ? h.petSkill || 1 : h.petBite || 1;
    if (
      (acc.element === element || def.types.includes(acc.element)) &&
      !acc.cape
    )
      m *= opts.skill ? acc.petSkill || 1 : acc.petBite || 1;
    if (h.cowBuff && ["cow", "bull"].includes(by.species)) m *= h.cowBuff;
    if (h.dogBuff && isDog(by)) m *= h.dogBuff;
    if (owner.mounted === by.id) {
      m *= h.mountedDamage || 1;
      if (opts.skill && by.mountBuff === "crystal") m *= 1.1;
    }
  }
  return m;
}
export function weaponMultiplier(world, p, it) {
  const h = equippedHat(p, world.time),
    acc = accessory(p);
  return (
    (acc.family === it.family ? acc.damage : 1) *
    (it.family === "gloves" ? h.gloveDamage || 1 : 1)
  );
}
export function rangedMultiplier(world, p, it) {
  const h = equippedHat(p, world.time),
    kind = it.variantId || it.shape;
  return h.ranged === kind ? h.rangedDamage || 1 : 1;
}
export function updateEffects(world, t, dt, api) {
  t.effects = (t.effects || []).filter((e) => e.until > world.time);
  let slow = 0;
  for (const e of t.effects) {
    if (e.kind === "slow") slow = Math.max(slow, e.value);
    if (e.kind === "stun") {
      t.trappedUntil = Math.max(t.trappedUntil || 0, world.time + dt);
      t.skillBlockedUntil = Math.max(t.skillBlockedUntil || 0, world.time + dt);
    }
    if (e.kind === "blind")
      t.blindUntil = Math.max(t.blindUntil || 0, world.time + dt);
    if (e.kind === "attack-block")
      t.attackBlockedUntil = Math.max(
        t.attackBlockedUntil || 0,
        world.time + dt,
      );
    if (e.kind === "skill-block")
      t.skillBlockedUntil = Math.max(t.skillBlockedUntil || 0, world.time + dt);
    if (e.kind === "build-block")
      t.buildBlockedUntil = Math.max(t.buildBlockedUntil || 0, world.time + dt);
    if (
      ["poison", "burn", "bleed"].includes(e.kind) &&
      world.time >= (e.tickAt || 0)
    ) {
      e.tickAt = world.time + 0.5;
      api.hurt(
        world,
        t,
        e.value,
        world.animals.find((a) => a.id === e.by),
        { kind: e.kind, element: e.element, skill: true, kb: 0 },
      );
    }
  }
  const haste = Math.max(
    1,
    ...t.effects.filter((e) => e.kind === "haste").map((e) => e.value),
  );
  t.effectSpeed = (1 - Math.min(0.95, slow)) * haste;
  if (t.items) {
    const h = equippedHat(t, world.time);
    if (h.cooldownRecovery && world.time >= (t.magicianAt || 0)) {
      t.magicianAt = world.time + 5;
      for (const a of world.animals) if (a.owner === t.id) a.skillAt -= 1;
    }
    if (h.steal && world.time >= (t.stealAt || 0)) {
      t.stealAt = world.time + 1;
      for (const enemy of Object.values(world.players))
        if (
          enemy !== t &&
          !enemy.dead &&
          Math.hypot(t.x - enemy.x, t.y - enemy.y) < 250
        ) {
          for (const [key, amount] of [
            ["gold", 100],
            ["food", 15],
          ]) {
            const take = Math.min(enemy.res[key], amount);
            enemy.res[key] -= take;
            t.res[key] += take;
          }
          break;
        }
    }
  }
}
