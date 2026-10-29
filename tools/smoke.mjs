import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.PORT || '4173';
const server = spawn('npx', ['serve', '.', '-l', port], { stdio:'ignore' });
for (let attempt=0;attempt<40;attempt++) {
  try { if ((await fetch(`http://localhost:${port}`)).ok) break; } catch {}
  if (attempt===39) throw new Error('static server did not become ready');
  await new Promise(resolve => setTimeout(resolve, 250));
}
const browser = await chromium.launch({ headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
  const errors=[];
  page.on('console', message => { if(message.type()==='error')errors.push(message.text()) });
  page.on('pageerror', error => errors.push(error.message));
  const hook = async name => page.locator('#game').getAttribute(`data-${name}`);
  await page.goto(`http://localhost:${port}`, { waitUntil:'networkidle' });
  await page.fill('#player-name', 'Smoke');
  await page.click('#open-tamodex');
  await page.locator('.dex-card').nth(7).waitFor();
  if (await page.locator('.dex-card').count() !== 8) throw new Error('forest field guide should list 8 animals');
  if (await page.locator('.boss-card').count() !== 1) throw new Error('field guide should show the season boss');
  await page.click('.collection-back');
  await page.click('#play-cpu');
  await page.waitForTimeout(1000);
  if (!await page.locator('body.playing').count()) throw new Error('game did not start');
  if (await page.locator('#landing').isVisible()) throw new Error('landing still covers the game');
  if (!await page.locator('#hud').isVisible()) throw new Error('HUD is not visible');
  const renderedEntities = Number(await hook('entities'));
  if (!Number.isFinite(renderedEntities) || renderedEntities < 5) throw new Error('world entities were not rendered');
  if (await hook('render-error')) throw new Error('canvas reported a missing player');
  if (await page.locator('#hotbar .slot').count() !== 6) throw new Error('hotbar should hold the 6 starting items');

  // move to open ground so placement and movement checks are not blocked by trees
  await page.evaluate(() => {
    const { game, S } = window.wildbound, world = game.local, me = world.players.me;
    for (let y = 600; y < world.h - 600; y += 120) for (let x = 600; x < world.w - 600; x += 120) {
      const crowded = S.nearbyResources(world, x, y, 420).some(n => Math.hypot(n.x - x, n.y - y) < n.r + 420)
        || world.animals.some(a => Math.hypot(a.x - x, a.y - y) < 500)
        || Object.values(world.players).some(p => p !== me && Math.hypot(p.x - x, p.y - y) < 600);
      if (!crowded) { me.x = x; me.y = y; me.vx = me.vy = 0; return; }
    }
  });
  await page.waitForTimeout(300);

  await page.locator('#hotbar .slot').nth(2).click();
  await page.waitForTimeout(100);
  await page.locator('#hotbar .slot.selected').nth(0).waitFor();
  if (await page.locator('#hotbar .slot').nth(2).evaluate(element => !element.classList.contains('selected'))) throw new Error('building slot was not selectable');
  const beforeStructures = Number(await hook('structures'));
  await page.mouse.move(900, 360); await page.waitForTimeout(100);
  await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(150);
  if (Number(await hook('structures')) !== beforeStructures + 1) throw new Error('clicking the selected building did not place it');
  if (await hook('action') !== 'build') throw new Error('building action was not reported');
  const wall = JSON.parse(await hook('test-structure'));
  if (wall.item !== 'wood-wall') throw new Error(`expected a wooden wall, got ${wall.item}`);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD'); await page.waitForTimeout(100);
  const blockedPlayer = JSON.parse(await hook('test-player'));
  if (blockedPlayer.x >= wall.x) throw new Error('player walked through their own wall');

  // taming: a sleeping baby next to the player, with the roll forced to succeed
  await page.evaluate(() => {
    const { game } = window.wildbound, world = game.local, me = world.players.me;
    const baby = world.animals.find(a => a.species === 'wolf' && !a.owner && !a.boss) || world.animals.find(a => !a.owner && !a.boss);
    Object.assign(baby, { sleep: true, wakeAt: world.time + 120, x: me.x - 90, y: me.y + 30, vx: 0, vy: 0, target: null, angry: false });
    world.random = () => 0;
  });
  await page.waitForTimeout(200);
  if (!await page.locator('#tame-prompt').isVisible()) throw new Error('tame prompt did not appear beside a sleeping baby');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Number(document.querySelector('#game').dataset.pets) >= 1, null, { timeout: 2000 });
  if (!await page.locator('#pet-panel .pet:not(.empty)').count()) throw new Error('pet panel did not show the new pet');
  await page.evaluate(() => { const w = window.wildbound.game.local; w.random = Math.random; });

  // combat: hit a wild animal and see damage land
  await page.locator('#hotbar .slot').nth(0).click();
  await page.evaluate(() => {
    const { game } = window.wildbound, world = game.local, me = world.players.me;
    const foe = world.animals.find(a => !a.owner && !a.boss && !a.sleep && a.stage > 0) || world.animals.find(a => !a.owner && !a.boss && !a.sleep);
    Object.assign(foe, { x: me.x - 30, y: me.y - me.r - foe.r - 20, vx: 0, vy: 0, hp: 5000, maxHp: 5000 });
  });
  await page.waitForTimeout(150);
  const animal = JSON.parse(await hook('test-animal'));
  await page.mouse.move(animal.x, animal.y); await page.mouse.down();
  await page.waitForFunction(() => Number(document.querySelector('#game').dataset.hits) > 0, null, { timeout: 4000 }).catch(() => {});
  await page.mouse.up();
  if (!(Number(await hook('hits')) > 0)) throw new Error('attacking a wild animal dealt no damage');

  await page.screenshot({ path: join(tmpdir(), 'wildbound-smoke.png') });
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Smoke test passed');
} finally { await browser.close(); server.kill('SIGTERM'); }
