import assert from 'node:assert/strict';
import { ITEMS, ITEM_BY_ID, STARTING_ITEMS, SEASONS, CYCLE, TRANSITION, seasonAt, ageChoices, xpForAge, LAST_CHOICE_AGE, PETS, BOSSES } from '../data.js';

assert.deepEqual(STARTING_ITEMS, ['hand', 'apple', 'wood-wall', 'wood-door', 'wood-spike', 'wood-windmill']);
assert.equal(ageChoices(1, STARTING_ITEMS).length, 5);
for (const id of ageChoices(1, STARTING_ITEMS)) assert.equal(ITEM_BY_ID.get(id).slot, 'primary');
for (const item of ITEMS.filter(item => item.slot === 'primary' || item.slot === 'secondary')) {
  assert.ok(!item.cost, `${item.name} is an age unlock, not a recipe`);
}
assert.ok(ITEM_BY_ID.get('wood-wall').cost.wood > 0);
assert.equal(xpForAge(0), 40);
assert.equal(xpForAge(9), 400);

// seasons: forest runs 16 minutes, the rest 8, and the cycle loops
assert.deepEqual(SEASONS.map(season => season.duration), [960, 480, 480, 480, 480, 480]);
assert.equal(CYCLE, 960 + 5 * 480);
assert.equal(seasonAt(959.9).index, 0);
assert.equal(seasonAt(960).index, 1);
assert.equal(seasonAt(960 + TRANSITION / 2).elapsed, TRANSITION / 2);
assert.equal(seasonAt(1440).index, 2);
assert.equal(seasonAt(CYCLE).index, 0);
assert.equal(seasonAt(CYCLE).cycle, 1);

// every season has its own animals and a boss
for (const season of SEASONS) {
  assert.ok(PETS.filter(pet => pet.season === season.id).length >= 4, `${season.name} needs animals`);
  assert.ok(BOSSES.some(boss => boss.id === season.boss), `${season.name} needs a boss`);
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
