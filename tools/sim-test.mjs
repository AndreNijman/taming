// Headless checks for the shared simulation: run with `node tools/sim-test.mjs`.
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { CYCLE, SEASONS, PET_BY_ID, PET_XP, START_RESOURCES, STARTING_ITEMS, xpForAge } from '../data.js';

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

// resources are a pure function of seed + season instance
{
  const a = S.generateResources(7, 3), b = S.generateResources(7, 3), c = S.generateResources(7, 4);
  assert.deepEqual(a.list, b.list);
  assert.notDeepEqual(a.list.map(n => n.x), c.list.map(n => n.x));
  assert.equal(a.list[0].type, 'big-gold');
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
  assert.equal(xpForAge(0), 40);
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
  assert.ok(wolfDef.tame > 50);

  // follow
  me.x += 600; run(world, 3, () => S.setInput(world, 'me', { angle: 0, sel: 0 }));
  assert.ok(Math.hypot(baby.x - me.x, baby.y - me.y) < 250, 'pet should follow its tamer');

  // attack order + skill against a wild adult placed next to the pet
  const foeDef = [...PET_BY_ID.values()].find(d => d.season === 'forest' && d.id !== baby.species);
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

// failed tame makes the baby hostile
{
  const other = world.animals.find(a => !a.owner && !a.boss && a.stage === 0 && !a.dead);
  other.sleep = true; other.wakeAt = world.time + 60; other.x = me.x + 80; other.y = me.y; other.vx = other.vy = 0;
  const roll = world.random; world.random = () => .999;
  S.command(world, 'me', { t: 'tame' });
  world.random = roll;
  assert.equal(other.owner, null);
  assert.equal(other.target, 'me');
  assert.ok(other.angry);
}

// boss minion waves and death: gold transfer, age reset, pets kept, buildings persist
{
  const boss = world.animals.find(a => a.boss);
  assert.ok(boss, 'season boss should exist');
  me.x = boss.x + boss.r + me.r + 400; me.y = boss.y; me.shieldUntil = 0;
  const count = world.animals.length;
  boss.hp = boss.maxHp * .7; run(world, .2);
  assert.ok(world.animals.length >= count + 3, 'boss should summon minions under 75% hp');

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

// seasons roll over: new resources, new wild animals, pets kept
{
  const key = world.seasonKey;
  world.time = SEASONS[0].duration - S.TICK;
  run(world, .2);
  assert.notEqual(world.seasonKey, key);
  assert.ok(world.animals.some(a => !a.owner && PET_BY_ID.get(a.species)?.season === 'winter'), 'winter animals should arrive');
  assert.ok(world.animals.every(a => a.owner || a.boss || PET_BY_ID.get(a.species).season === 'winter'), 'forest wildlife should leave');
  assert.ok(me.pets.length >= 1);
  assert.ok(CYCLE > 0);
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
