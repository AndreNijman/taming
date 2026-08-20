import assert from 'node:assert/strict';
import { ITEMS, STARTING_ITEMS, AGE_CHOICES, getAgeChoices } from '../data.js';

const byId = new Map(ITEMS.map(item => [item.id, item]));
assert.deepEqual(STARTING_ITEMS, ['hand','apple','wooden-wall','wooden-door','wooden-spike','wooden-windmill']);
assert.equal(AGE_CHOICES[1].length, 6);
for (const id of AGE_CHOICES[1]) {
  const weapon = byId.get(id);
  assert.equal(weapon.slot, 'primary');
  assert.deepEqual(weapon.cost, {}, `${weapon.name} must be an age unlock, not a recipe`);
}
for (const item of ITEMS.filter(item => item.category !== 'building')) {
  assert.deepEqual(item.cost, {}, `${item.name} must not consume building resources to unlock`);
}

const inventory = STARTING_ITEMS.map(byId.get.bind(byId));
const choose = id => {
  const item = byId.get(id);
  const existing = inventory.findIndex(entry => entry.slot === item.slot);
  if (existing >= 0) inventory[existing] = item;
  else inventory.push(item);
};
choose('stone-spear');
choose('golden-naginata');
assert.equal(inventory.filter(item => item.slot === 'primary').length, 1);
assert.equal(inventory.find(item => item.slot === 'primary').id, 'golden-naginata');
choose('stone-bow');
assert.equal(inventory.filter(item => item.slot === 'secondary').length, 1);
assert.ok(byId.get('wooden-wall').cost.wood > 0);

const fullPath = [...STARTING_ITEMS];
for (let age=1;age<=27;age++) {
  const choices = getAgeChoices(age, fullPath);
  assert.ok(choices.length, `age ${age} must provide an upgrade choice`);
  assert.ok(choices.every(id => byId.has(id)), `age ${age} references a missing item`);
  const chosen = byId.get(choices[0]);
  const slot = fullPath.findIndex(id => byId.get(id).slot === chosen.slot);
  if (slot >= 0) fullPath[slot] = chosen.id;
  else fullPath.push(chosen.id);
  assert.equal(fullPath.filter(id => byId.get(id).slot === 'primary').length, 1);
  assert.equal(fullPath.filter(id => byId.get(id).slot === 'secondary').length, age < 4 ? 0 : 1);
}
console.log('Progression data test passed');
