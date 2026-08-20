import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const liveRelay = process.env.LIVE_RELAY;
const relay = liveRelay || 'http://127.0.0.1:8787';
const processes = [spawn('npx', ['serve', '.', '-l', '4173'], { stdio:'ignore' })];
if (!liveRelay) processes.push(spawn('npx', ['wrangler', 'dev', '--port', '8787'], { stdio:'ignore' }));
const stop = () => processes.forEach(process => process.kill('SIGTERM'));
process.on('exit', stop);

async function ready(url) {
  for (let i=0;i<40;i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not become ready`);
}

await Promise.all([ready(`${relay}/health`), ready('http://127.0.0.1:4173')]);
const browser = await chromium.launch({ headless:true });
try {
  const context = await browser.newContext();
  const host = await context.newPage(), guest = await context.newPage();
  const errors=[];
  for (const page of [host,guest]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()) });
    await page.goto(`http://127.0.0.1:4173/?relay=${encodeURIComponent(relay)}`);
  }
  await host.fill('#player-name','Host'); await host.click('#open-online');
  await host.fill('#room-name','Smoke Meadow'); await host.selectOption('#room-bots','2'); await host.click('#create-form button[type=submit]');
  await host.locator('#lobby-name').waitFor({ state:'visible' });
  await guest.fill('#player-name','Guest'); await guest.click('#open-online');
  await guest.fill('#join-name','Smoke Meadow'); await guest.click('#join-form button[type=submit]');
  await guest.locator('#lobby-name').waitFor({ state:'visible' });
  await host.locator('.roster-row').nth(1).waitFor();
  await host.click('#start-match');
  await host.locator('body.playing').waitFor(); await guest.locator('body.playing').waitFor();
  await host.waitForTimeout(700);
  if (!await host.locator('#hud').isVisible() || !await guest.locator('#hud').isVisible()) throw new Error('multiplayer HUD missing');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Multiplayer smoke test passed');
} finally { await browser.close(); stop(); }
