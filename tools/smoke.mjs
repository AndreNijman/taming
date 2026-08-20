import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const server = spawn('npx', ['serve', '.', '-l', '4173'], { stdio:'ignore' });
for (let attempt=0;attempt<40;attempt++) {
  try { if ((await fetch('http://localhost:4173')).ok) break; } catch {}
  if (attempt===39) throw new Error('static server did not become ready');
  await new Promise(resolve => setTimeout(resolve, 250));
}
const browser = await chromium.launch({ headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
  const errors=[];
  page.on('console', message => { if(message.type()==='error')errors.push(message.text()) });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:4173', { waitUntil:'networkidle' });
  await page.fill('#player-name', 'Smoke');
  await page.click('#open-tamodex');
  await page.locator('.dex-card').nth(9).waitFor();
  if (await page.locator('.dex-card').count() !== 10) throw new Error('season pet catalog incomplete');
  await page.click('.collection-back');
  await page.click('#play-cpu');
  await page.waitForTimeout(1000);
  if (!await page.locator('body.playing').count()) throw new Error('game did not start');
  if (await page.locator('#landing').isVisible()) throw new Error('landing still covers the game');
  if (!await page.locator('#hud').isVisible()) throw new Error('HUD is not visible');
  const renderedEntities = Number(await page.locator('#game').getAttribute('data-entities'));
  if (!Number.isFinite(renderedEntities) || renderedEntities < 20) throw new Error('world entities were not rendered');
  if (await page.locator('#game').getAttribute('data-render-error')) throw new Error('canvas reported a missing player');
  if (await page.locator('#hotbar .slot').count() !== 6) throw new Error('hotbar missing');
  await page.locator('#hotbar .slot').nth(2).click();
  if (!await page.locator('#hotbar .slot').nth(2).evaluate(element => element.classList.contains('selected'))) throw new Error('building slot was not selectable');
  const beforeStructures = Number(await page.locator('#game').getAttribute('data-structures'));
  await page.mouse.move(780, 360);await page.mouse.down();await page.waitForTimeout(100);await page.mouse.up();await page.waitForTimeout(100);
  const afterStructures = Number(await page.locator('#game').getAttribute('data-structures'));
  if (afterStructures !== beforeStructures + 1) throw new Error('clicking the selected building did not place it');
  if (await page.locator('#game').getAttribute('data-action') !== 'build') throw new Error('building action animation was not triggered');
  await page.locator('#hotbar .slot').nth(0).click();
  let animal;
  for (let step=0;step<120;step++) {
    animal=JSON.parse(await page.locator('#game').getAttribute('data-test-animal'));
    if (animal.distance<48) break;
    const keys=[];
    if(animal.dx>8)keys.push('KeyD');if(animal.dx< -8)keys.push('KeyA');if(animal.dy>8)keys.push('KeyS');if(animal.dy< -8)keys.push('KeyW');
    for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(100);for(const key of keys)await page.keyboard.up(key);
  }
  if (!animal||animal.distance>=55) throw new Error('could not approach a wild animal');
  const targetId=animal.id;
  await page.mouse.move(animal.x,animal.y);await page.mouse.down();
  for(let strike=0;strike<80;strike++){await page.waitForTimeout(100);animal=JSON.parse(await page.locator('#game').getAttribute('data-test-animal'));if(animal.id!==targetId)break}
  await page.mouse.up();
  if(animal.id===targetId)throw new Error('wild animal did not die from repeated attacks');
  await page.screenshot({ path:'/tmp/opencode/wildbound-smoke.png' });
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Smoke test passed');
} finally { await browser.close(); server.kill('SIGTERM'); }
