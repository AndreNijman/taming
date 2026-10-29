// Headless checks for the shared simulation: run with `node tools/sim-test.mjs`.
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { BIOMES, biomeAt, PET_BY_ID, PET_XP, START_RESOURCES, TAME_FOOD, STARTING_ITEMS, xpForAge } from '../data.js';

const finite = world => {
  for (const e of [...Object.values(world.players), ...world.animals]) {
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `non-finite position on ${e.id}`);
    assert.ok(Number.isFinite(e.hp), `non-finite hp on ${e.id}`);
  }
};
const run = (world, seconds, each) => {
  for (let i = 0; i < seconds / S.TICK; i++) { each?.(i); S.step(world, S.TICK); world.events.length = 0; }
  finite(world);
};

// resources are a pure function of the seed, and every node knows the biome it stands in
{
  const a = S.generateResources(7), b = S.generateResources(7), c = S.generateResources(8);
  assert.deepEqual(a.list, b.list);
  assert.notDeepEqual(a.list.map(n => n.x), c.list.map(n => n.x));
  assert.equal(a.list[0].type, 'big-gold');
  for (const n of a.list) assert.equal(n.biome, biomeAt(n.x, n.y).id, `${n.id} is labelled with its biome`);
  for (const biome of BIOMES) assert.ok(a.list.filter(n => n.biome === biome.id).length >= 40, `${biome.name} has resources`);
  assert.ok(a.list.some(n => n.type === 'cactus' && n.biome === 'desert'), 'cacti grow in the desert');
  assert.ok(!a.list.some(n => n.type === 'cactus' && n.biome !== 'desert'), 'and nowhere else');
}

// every biome is populated from the start: its own wild animals and one sleeping boss; tamers spawn in the forest
{
  const w = S.createWorld(55);
  for (const biome of BIOMES) {
    const wild = w.animals.filter(a => !a.boss && PET_BY_ID.get(a.species).biome === biome.id);
    assert.ok(wild.length >= 10, `${biome.name} has wildlife`);
    assert.ok(wild.every(a => biomeAt(a.x, a.y).id === biome.id), `${biome.name} animals live in the ${biome.name.toLowerCase()}`);
    const bosses = w.animals.filter(a => a.boss === biome.boss);
    assert.equal(bosses.length, 1, `${biome.name} has one boss`);
    assert.equal(biomeAt(bosses[0].x, bosses[0].y).id, biome.id);
    assert.ok(bosses[0].sleep, 'bosses sleep until attacked');
  }
  for (let i = 0; i < 20; i++) {
    const p = S.addPlayer(w, { id: `s${i}`, name: 'S' });
    assert.equal(biomeAt(p.x, p.y).id, 'forest');
    assert.ok(w.animals.every(a => !a.boss || Math.hypot(a.x - p.x, a.y - p.y) > 900), 'tamers never spawn on a boss');
  }
}

// new players start with the researched loadout
const world = S.createWorld(1234);
const me = S.addPlayer(world, { id: 'me', name: 'Tester' });
assert.deepEqual(me.items, STARTING_ITEMS);
assert.deepEqual(me.res, START_RESOURCES);
assert.equal(me.hp, 100);

// gathering grants resources and xp; ages unlock choices
{
  const tree = world.resources.find(n => n.type === 'tree');
  me.x = tree.x + tree.r + me.r + 5; me.y = tree.y; me.shieldUntil = 0;
  const before = me.res.wood;
  run(world, 3, () => S.setInput(world, 'me', { angle: Math.PI, attack: true, sel: 0 }));
  assert.ok(me.res.wood > before, 'hand should gather wood');
  me.xp = 0; me.age = 0;
  // award xp through gathering-equivalent path by forcing a big harvest
  for (let i = 0; i < 40 && me.age < 1; i++) run(world, .7, () => S.setInput(world, 'me', { angle: Math.PI, attack: true, sel: 0 }));
  assert.ok(me.age >= 1, 'gathering should age the player up');
  assert.ok(me.choices.includes(1), 'age 1 should queue a weapon choice');
  S.command(world, 'me', { t: 'choose', id: 'stone-axe' });
  assert.ok(me.items.includes('stone-axe') && !me.items.includes('hand'), 'choice replaces the primary');
  assert.equal(xpForAge(0), 20);
}

// taming: guaranteed roll on a sleeping starter, then pets follow, fight, grow and use skills
{
  const wolfDef = PET_BY_ID.get('wolf');
  const baby = world.animals.find(a => a.species === 'wolf' && a.stage === 0) || world.animals.find(a => a.stage === 0);
  baby.sleep = true; baby.wakeAt = world.time + 60; baby.x = me.x + 90; baby.y = me.y; baby.vx = baby.vy = 0;
  const roll = world.random; world.random = () => 0;
  S.command(world, 'me', { t: 'tame' });
  world.random = roll;
  assert.equal(baby.owner, 'me', 'sleeping baby should be tamed');
  assert.deepEqual(me.pets, [baby.id]);
  assert.equal(me.tames, 1, 'tames are counted');
  assert.ok(wolfDef.tame > 50);

  // follow
  me.x += 600; run(world, 3, () => S.setInput(world, 'me', { angle: 0, sel: 0 }));
  assert.ok(Math.hypot(baby.x - me.x, baby.y - me.y) < 250, 'pet should follow its tamer');

  // attack order + skill against a wild adult placed next to the pet
  const foeDef = [...PET_BY_ID.values()].find(d => d.biome === 'forest' && d.id !== baby.species);
  const foe = world.animals.find(a => !a.owner && !a.boss && a.species === foeDef.id) || world.animals.find(a => !a.owner && !a.boss && a !== baby);
  foe.sleep = false; foe.x = baby.x + 70; foe.y = baby.y; foe.hp = foe.maxHp = 5000; foe.stage = 1;
  S.command(world, 'me', { t: 'pets', mode: 'attack' });
  const hpBefore = foe.hp;
  run(world, 4);
  assert.ok(foe.hp < hpBefore, 'attack mode should bite nearby animals');
  baby.skillAt = -99;
  foe.x = baby.x + 60; foe.y = baby.y; // passive prey flees, so bring it back into range
  const events = [];
  world.events.length = 0;
  S.command(world, 'me', { t: 'skill' });
  events.push(...world.events);
  assert.ok(events.some(e => e.k === 'skill'), 'skill should fire with a target in range');

  // growth from xp
  baby.xp = PET_XP[0] - 1;
  run(world, 3);
  assert.equal(baby.stage, 1, 'pet should grow to adult');

  // stop and move orders
  S.command(world, 'me', { t: 'pets', mode: 'move', x: baby.x + 300, y: baby.y });
  run(world, 3);
  assert.equal(baby.mode, 'move');
  S.command(world, 'me', { t: 'pets', mode: 'defend' });
  foe.dead = true;
}

// kill xp is one pot shared by the pets near the kill, and pets level up from it
{
  const w = S.createWorld(57), t = S.addPlayer(w, { id: 't', name: 'T' });
  const babies = w.animals.filter(a => !a.boss && a.stage === 0).slice(0, 3);
  for (const [i, b] of babies.entries()) { Object.assign(b, { owner: 't', sleep: false, x: t.x + 60 * i, y: t.y + 80, xp: 0, total: 0, level: 1 }); t.pets.push(b.id); }
  const prey = w.animals.find(a => !a.owner && !a.boss && a.stage === 0);
  prey.hp = 1; prey.x = t.x + t.r + prey.r + 5; prey.y = t.y; prey.sleep = false; t.shieldUntil = 0;
  for (let i = 0; i < 10 && !prey.dead && w.animals.includes(prey); i++) { S.setInput(w, 't', { mx: 0, my: 0, angle: Math.atan2(prey.y - t.y, prey.x - t.x), attack: true, sel: 0 }); S.step(w, S.TICK); }
  const share = w.events.find(e => e.k === 'petxp');
  assert.ok(share, 'a kill shares xp with the pets');
  assert.equal(share.ids.length, 3);
  assert.equal(share.amt, 40, 'three pets split the pot three ways');
  assert.equal(S.petLevel(0), 1);
  assert.equal(S.petLevel(500), 5);
  assert.ok(S.petLevel(1e9) === 60);
  // the level travels in snapshots
  const pet = babies[0];
  assert.equal(S.decodeAnimal(S.encodeAnimal(pet)).level, pet.level || 1);
}

// a missed tame costs food, leaves the baby asleep and nudges the odds up; no food, no try
{
  const other = world.animals.find(a => !a.owner && !a.boss && a.stage === 0 && !a.dead);
  other.sleep = true; other.wakeAt = world.time + 60; other.x = me.x + 80; other.y = me.y; other.vx = other.vy = 0; other.bonus = 0;
  me.res.food = 30; me.tameAt = 0;
  const before = S.tameChance(me, other), tames = me.tames;
  const roll = world.random; world.random = () => .999;
  S.command(world, 'me', { t: 'tame' });
  assert.equal(other.owner, null);
  assert.ok(other.sleep, 'a miss leaves it asleep');
  assert.ok(!other.angry);
  assert.equal(me.res.food, 30 - TAME_FOOD, 'each try costs food');
  assert.ok(S.tameChance(me, other) > before, 'and the next try is a little likelier');
  S.command(world, 'me', { t: 'tame' });
  assert.equal(me.res.food, 30 - TAME_FOOD, 'tries are rate limited');
  me.tameAt = 0; me.res.food = TAME_FOOD - 1;
  S.command(world, 'me', { t: 'tame' });
  assert.equal(me.res.food, TAME_FOOD - 1, 'no food, no try');
  world.random = roll;
  assert.equal(me.tames, tames);
  assert.ok(me.pets.length <= 3);
}

// boss minion waves and death: gold transfer, age reset, pets kept, buildings persist
{
  const boss = world.animals.find(a => a.boss);
  assert.ok(boss, 'boss should exist');
  me.x = boss.x + boss.r + me.r + 400; me.y = boss.y; me.shieldUntil = 0;
  const count = world.animals.length;
  boss.hp = boss.maxHp * .7; run(world, .2);
  assert.equal(world.animals.length, count, 'a sleeping boss does nothing');
  boss.sleep = false; boss.lastHurtAt = world.time; run(world, .2);
  assert.ok(world.animals.length >= count + 3, 'boss should summon minions under 75% hp');
  assert.ok(world.projectiles.some(j => j.kind === 'thorn'), 'an awake boss throws a ring of thorns');

  const rival = S.addPlayer(world, { id: 'rival', name: 'Rival' });
  me.res.gold = 600; me.shieldUntil = 0;
  S.setInput(world, 'me', { mx: 0, my: 0, angle: 0, attack: false, sel: 0 });
  me.res.wood = 100; me.res.stone = 100;
  const mill = me.items.indexOf('wood-windmill');
  S.setInput(world, 'me', { angle: 0, attack: true, sel: mill });
  for (let i = 0; i < 4; i++) S.step(world, S.TICK);
  S.setInput(world, 'me', { angle: 0, attack: false, sel: mill });
  const mine = world.structures.filter(s => s.owner === 'me').length;
  assert.ok(mine >= 1, 'windmill should be placed');
  const pets = [...me.pets];
  rival.x = me.x - 80; rival.y = me.y; rival.shieldUntil = 0;
  me.hp = 1;
  S.setInput(world, 'rival', { angle: 0, attack: true, sel: 0 });
  run(world, 1);
  assert.ok(me.dead, 'player should die');
  assert.equal(rival.res.gold, 100, 'killer takes a sixth of the gold');
  world.time += 2;
  S.command(world, 'me', { t: 'respawn' });
  assert.ok(!me.dead);
  assert.equal(me.age, 0);
  assert.deepEqual(me.items, STARTING_ITEMS);
  assert.deepEqual(me.pets, pets, 'pets come back with their tamer');
  assert.equal(world.structures.filter(s => s.owner === 'me').length, mine, 'buildings persist through death');
}

// a slain boss comes back after a while
{
  const w = S.createWorld(56), boss = w.animals.find(a => a.boss === 'frost-golem');
  const p = S.addPlayer(w, { id: 'k', name: 'K' });
  boss.dmgBy = { k: 1 }; boss.hp = 1; boss.sleep = false;
  S.command(w, 'k', { t: 'noop' });
  p.x = boss.x - boss.r - p.r - 10; p.y = boss.y; p.angle = 0; p.shieldUntil = 0;
  S.setInput(w, 'k', { mx: 0, my: 0, angle: 0, attack: true, sel: 0 });
  run(w, 1);
  assert.ok(!w.animals.some(a => a.boss === 'frost-golem'), 'the boss died');
  assert.ok(p.res.gold > 0, 'its killer was paid');
  run(w, 245);
  assert.equal(w.animals.filter(a => a.boss === 'frost-golem').length, 1, 'and it respawned');
}

// a long bot match stays stable and bots end up taming
{
  const w = S.createWorld(99);
  S.addPlayer(w, { id: 'p', name: 'P' });
  S.fillBots(w, 8);
  run(w, 600);
  const bots = Object.values(w.players).filter(p => p.bot);
  assert.ok(bots.some(b => b.age >= 5), 'bots should progress');
  assert.ok(bots.some(b => b.pets.length), 'bots should tame companions');
  const snap = JSON.stringify(S.snapshot(w, 'p'));
  assert.ok(snap.length < 20000, `snapshot too big: ${snap.length}`);
}

console.log('Sim test passed');
