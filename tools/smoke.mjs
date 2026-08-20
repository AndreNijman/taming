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
  if (await page.locator('#hotbar .slot').count() !== 6) throw new Error('hotbar missing');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  await page.screenshot({ path:'/tmp/opencode/wildbound-smoke.png' });
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Smoke test passed');
} finally { await browser.close(); server.kill('SIGTERM'); }
