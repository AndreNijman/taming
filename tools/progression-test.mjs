import assert from 'node:assert/strict';
import { ITEMS, ITEM_BY_ID, STARTING_ITEMS, BIOMES, BIOME_GRID, BIOME_CELL, WORLD, CENTER, biomeAt, biomeCells, ageChoices, xpForAge, LAST_CHOICE_AGE, PETS, BOSSES } from '../data.js';

assert.deepEqual(STARTING_ITEMS, ['hand', 'apple', 'wood-wall', 'wood-door', 'wood-spike', 'wood-windmill']);
assert.equal(ageChoices(1, STARTING_ITEMS).length, 5);
for (const id of ageChoices(1, STARTING_ITEMS)) assert.equal(ITEM_BY_ID.get(id).slot, 'primary');
for (const item of ITEMS.filter(item => item.slot === 'primary' || item.slot === 'secondary')) {
  assert.ok(!item.cost, `${item.name} is an age unlock, not a recipe`);
}
assert.ok(ITEM_BY_ID.get('wood-wall').cost.wood > 0);
assert.equal(xpForAge(0), 40);
assert.equal(xpForAge(9), 400);

// biomes are fixed squares of the map: forest in the middle, every biome somewhere on the 3x3 grid
assert.equal(BIOME_CELL * 3, WORLD.w);
assert.equal(biomeAt(CENTER.x, CENTER.y).id, 'forest');
assert.equal(biomeAt(-50, -50).id, BIOME_GRID[0][0]);
assert.equal(biomeAt(WORLD.w + 50, WORLD.h + 50).id, BIOME_GRID[2][2]);
for (const biome of BIOMES) {
  assert.ok(biomeCells(biome.id).length >= 1, `${biome.name} needs a square on the map`);
  assert.ok(Math.abs(biome.mix.reduce((n, [, share]) => n + share, 0) - 1) < 1e-9, `${biome.name} resource shares add up to 1`);
  // every biome has its own animals and a boss
  assert.ok(PETS.filter(pet => pet.biome === biome.id).length >= 4, `${biome.name} needs animals`);
  assert.ok(BOSSES.some(boss => boss.id === biome.boss && boss.biome === biome.id), `${biome.name} needs a boss`);
}

// picking the first option every age keeps one item per slot and never runs dry
const path = [...STARTING_ITEMS];
for (let age = 1; age <= LAST_CHOICE_AGE; age++) {
  const choices = ageChoices(age, path);
  if (!choices.length) continue;
  assert.ok(choices.every(id => ITEM_BY_ID.has(id)), `age ${age} references a missing item`);
  const chosen = ITEM_BY_ID.get(choices[0]);
  const slot = path.findIndex(id => ITEM_BY_ID.get(id).slot === chosen.slot);
  if (slot >= 0) path[slot] = chosen.id; else path.push(chosen.id);
  assert.equal(path.filter(id => ITEM_BY_ID.get(id).slot === 'primary').length, 1);
  assert.ok(path.filter(id => ITEM_BY_ID.get(id).slot === 'secondary').length <= 1);
}
assert.ok(path.some(id => ITEM_BY_ID.get(id).slot === 'secondary'), 'a full run should unlock a secondary');
assert.ok(path.some(id => ITEM_BY_ID.get(id).slot === 'tool'), 'a full run should unlock a taming tool');
console.log('Progression data test passed');
