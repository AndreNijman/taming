// Dev join in the browser (headless Chromium) against `wrangler dev`.
// The pages load from https://wildbound.andrenijman.com, served from this
// checkout by a route (netdev.js only asks games-guard for a pass there),
// with /_guard/dev answered by a pass the test signs with its own key; the
// relay runs with that key's public half as DEV_TEST_PUBLIC_KEY.
// A host and a guest play a locked lobby; a dev opens /?join=NAME mid-match
// and lands in the world; every page shows "DEV ANDRE HAS JOINED", the dev's
// tamer appears and a bot steps aside. A non-dev on the same link is turned
// away as before, with the lobby name filled in. Screenshots go to SHOTS (default: a temp folder).
//
//   node tests/dev/dev-smoke.mjs      (wrangler dev on PORT, default 8842)
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signDevPass } from '../../netdev.js';

const PORT = process.env.PORT || '8842', INSPECTOR = process.env.INSPECTOR_PORT || '9342';
const HOST = 'wildbound.andrenijman.com', ORIGIN = `https://${HOST}`;
const relay = `http://127.0.0.1:${PORT}`;
const root = fileURLToPath(new URL('../../', import.meta.url));
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'wildbound-dev-shots-')); mkdirSync(shots, { recursive:true });
const wrangler = process.env.WRANGLER || join(root, 'node_modules/.bin/wrangler');

const pair = await crypto.subtle.generateKey({ name:'Ed25519' }, true, ['sign', 'verify']);
const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64url');
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
const { pass, exp } = await signDevPass(privateKey, { name:'Andre', host:HOST });

const state = mkdtempSync(join(tmpdir(), 'wildbound-dev-smoke-')), registry = mkdtempSync(join(tmpdir(), 'wildbound-dev-registry-'));
const dev = spawn(wrangler, ['dev', '-c', 'wrangler.jsonc', '-c', 'tests/latency/netlog-stub.jsonc', '--port', PORT, '--inspector-port', INSPECTOR, '--ip', '127.0.0.1', '--persist-to', state, '--var', `DEV_TEST_PUBLIC_KEY:${publicKey}`],
  { cwd:root, stdio:['ignore', 'pipe', 'pipe'], env:{ ...process.env, WRANGLER_REGISTRY_PATH:registry } });
let output = ''; dev.stdout.on('data', c => { output += c; }); dev.stderr.on('data', c => { output += c; });
const stop = () => { dev.kill('SIGTERM'); rmSync(state, { recursive:true, force:true }); rmSync(registry, { recursive:true, force:true }); };
process.on('exit', stop);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
for (let i = 0; ; i++) { try { if ((await fetch(`${relay}/health`)).ok) break; } catch {} if (i > 360) throw new Error('wrangler dev did not start'); await wait(250); }

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json', '.ico':'image/x-icon', '.txt':'text/plain' };
/** A browser context whose wildbound.andrenijman.com is this checkout; `isDev` decides what /_guard/dev says. */
async function site(browser, isDev) {
  const context = await browser.newContext({ viewport:{ width:1100, height:700 } });
  // The relay is on 127.0.0.1 here (workers.dev in production): Chromium's local network access needs a grant.
  await context.grantPermissions(['local-network-access'], { origin:ORIGIN });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/_guard/dev') return route.fulfill({ json:isDev ? { dev:true, name:'ANDRE', pass, exp } : { dev:false }, headers:{ 'cache-control':'no-store' } });
    const file = normalize(join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return route.abort();
    try { return route.fulfill({ body:readFileSync(file), contentType:TYPES[extname(file)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status:404, body:'not found' }); }
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  return page;
}
const banner = page => page.waitForFunction(() => {
  const el = document.getElementById('dev-joined-banner');
  return el && el.textContent === 'DEV ANDRE HAS JOINED' && getComputedStyle(el).opacity === '1' && el.getBoundingClientRect().width > 100;
}, null, { timeout:8000 });
const tamers = page => page.locator('#game').getAttribute('data-tamers').then(v => (v || '').split(',').filter(Boolean));

const browser = await chromium.launch({ headless:true });
const room = `Dev Smoke ${Date.now().toString(36).slice(-5)}`;
try {
  const host = await site(browser, false), guest = await site(browser, false);
  for (const page of [host, guest]) await page.goto(`${ORIGIN}/?relay=${encodeURIComponent(relay)}`);
  await host.fill('#player-name', 'Host'); await host.click('#open-online');
  await host.fill('#room-name', room); await host.fill('#room-password', 'fern');
  await host.selectOption('#room-max', '4'); await host.selectOption('#room-bots', '2');
  await host.click('#create-form button[type=submit]');
  await host.locator('#lobby-name').waitFor({ state:'visible' });
  await guest.fill('#player-name', 'Guest'); await guest.click('#open-online');
  await guest.fill('#join-name', room); await guest.fill('#join-password', 'fern');
  await guest.click('#join-form button[type=submit]');
  await guest.locator('#lobby-name').waitFor({ state:'visible' });
  await host.locator('.roster-row').nth(1).waitFor();
  await host.click('#start-match');
  await host.locator('body.playing').waitFor(); await guest.locator('body.playing').waitFor();
  await host.waitForFunction(() => !document.getElementById('toast').classList.contains('on'), null, { timeout:4000 });
  await host.waitForFunction(() => document.querySelector('#game')?.dataset.tamers);
  const before = await tamers(host);
  assert.deepEqual(before.filter(t => t.startsWith('human:')).sort(), ['human:Guest', 'human:Host']);
  assert.equal(before.filter(t => t.startsWith('bot:')).length, 2);
  const hostPlayer = await host.evaluate(() => window.__gamesPlayer);
  assert.deepEqual(hostPlayer, { name:'Host', room }, 'the host reports its name and room');

  // A non-dev on the admin link is an ordinary joiner: the lobby has started, so it is refused, name filled in.
  const outsider = await site(browser, false);
  await outsider.goto(`${ORIGIN}/?join=${encodeURIComponent(room)}&relay=${encodeURIComponent(relay)}`);
  await outsider.waitForFunction(() => /already started/.test(document.getElementById('online-error')?.textContent || ''), null, { timeout:8000 });
  assert.equal(await outsider.inputValue('#join-name'), room);
  assert.ok(!(await outsider.evaluate(() => location.search)).includes('join='), 'the join link is cleared');

  // The dev, mid-match, through the admin page's link, with no saved name and no password.
  const andre = await site(browser, true);
  await andre.goto(`${ORIGIN}/?join=${encodeURIComponent(room)}&relay=${encodeURIComponent(relay)}`);
  await andre.locator('body.playing').waitFor({ timeout:10000 });
  await Promise.all([host, guest, andre].map(banner));
  for (const page of [host, guest]) assert.ok(!(await page.evaluate(() => { const toast = document.getElementById('toast'); return toast.classList.contains('on') && toast.textContent.startsWith('Gather'); })), 'the players did not re-begin their world');
  for (const [name, page] of Object.entries({ host, guest, andre })) await page.screenshot({ path:join(shots, `dev-joined-${name}.png`) });
  assert.ok(!(await andre.evaluate(() => location.search)).includes('join='), 'the join link is cleared');
  assert.deepEqual(await andre.evaluate(() => window.__gamesPlayer), { name:'Leo', room }, "the dev's page reports its name and room");
  // The game adjusted: the dev's tamer is in everyone's world and one bot stepped aside.
  for (const page of [host, guest, andre]) {
    await page.waitForFunction(() => (document.querySelector('#game')?.dataset.tamers || '').includes('human:Leo'), null, { timeout:5000 });
    const now = await tamers(page);
    assert.deepEqual(now.filter(t => t.startsWith('human:')).sort(), ['human:Guest', 'human:Host', 'human:Leo']);
    assert.equal(now.filter(t => t.startsWith('bot:')).length, 1);
    assert.equal(await page.locator('#game').getAttribute('data-render-error'), null);
  }
  await host.waitForFunction(() => /left the range to make room for Leo/.test(document.getElementById('feed')?.textContent || ''), null, { timeout:5000 });
  // The dev plays: walking moves its tamer.
  const x0 = Number(await andre.locator('#game').getAttribute('data-player-x'));
  await andre.keyboard.down(x0 > 1600 ? 'KeyA' : 'KeyD'); await andre.waitForTimeout(700); await andre.keyboard.up(x0 > 1600 ? 'KeyA' : 'KeyD'); await andre.waitForTimeout(300);
  const x1 = Number(await andre.locator('#game').getAttribute('data-player-x'));
  assert.ok(Math.abs(x1 - x0) > 40, `the dev walks (${x0} -> ${x1})`);
  for (const page of [host, guest, outsider, andre]) assert.deepEqual(page.errors, []);
  console.log(`dev smoke passed; screenshots in ${shots}`);
} catch (error) {
  console.error(output.split('\n').slice(-30).join('\n'));
  throw error;
} finally { await browser.close(); stop(); }
