import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
const port = 4176,
  server = spawn("node_modules/.bin/serve", [".", "-l", String(port)], {
    stdio: "ignore",
  });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_CERT"))
      errors.push(message.text());
  });
  const start = async () => {
    await page.goto(`http://localhost:${port}`);
    await page.click("#play-cpu");
    await page.waitForFunction(() => window.wildbound?.game.cur?.me);
  };
  await start();
  await page.click("#menu-button");
  await page.click("#keybind-settings");
  await page.click('[data-action="eat"]');
  await page.keyboard.press("r");
  assert.equal(await page.locator('[data-action="eat"]').textContent(), "R");
  assert.equal(
    await page.locator("#keybind-settings").getAttribute("aria-expanded"),
    "true",
  );
  await page.screenshot({ path: "/tmp/wildbound-keybinds.png" });
  await page.click("#resume");
  await page.evaluate(() => {
    const { game } = window.wildbound,
      w = game.local,
      p = w.players.me;
    w.animals = [];
    for (const id of Object.keys(w.players))
      if (id !== "me") delete w.players[id];
    p.hp = 30;
    p.res.food = 100;
    p.cd = 0;
  });
  await page.keyboard.down("r");
  await page.waitForTimeout(700);
  await page.keyboard.down("r");
  await page.waitForTimeout(400);
  await page.keyboard.up("r");
  assert.equal(
    await page.evaluate(() => window.wildbound.game.local.players.me.hp),
    40,
    "holding remapped food key eats once",
  );
  await page.reload();
  await page.click("#play-cpu");
  await page.waitForFunction(() => window.wildbound?.game.cur?.me);
  await page.click("#menu-button");
  await page.click("#keybind-settings");
  assert.equal(
    await page.locator('[data-action="eat"]').textContent(),
    "R",
    "keybind persists after reload",
  );
  await page.click("#resume");
  await page.evaluate(() => {
    const { game } = window.wildbound,
      w = game.local,
      p = w.players.me;
    const a = w.animals.find((a) => !a.boss);
    w.animals = [a];
    Object.assign(a, {
      owner: "me",
      sleep: false,
      target: null,
      mode: "defend",
      x: p.x - 80,
      y: p.y,
    });
    p.pets = [a.id];
    for (const id of Object.keys(w.players))
      if (id !== "me") delete w.players[id];
    p.res.gold = 50000;
  });
  await page.getByRole("button", { name: /Release .+/ }).click();
  await page.waitForFunction(
    () => window.wildbound.game.local.players.me.pets.length === 0,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("#pet-panel .pet:not(.empty)").length === 0,
  );
  await page.evaluate(() => {
    const { game } = window.wildbound,
      w = game.local,
      p = w.players.me;
    w.resources = [];
    w.grid.grid.clear();
    w.animals = [];
    w.structures = [];
    p.x = 4000;
    p.y = 4000;
    p.vx = p.vy = 0;
    p.res.wood = 1000;
    p.cd = 0;
    game.auto = true;
  });
  await page.locator("#hotbar .slot").nth(2).click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(
      () =>
        window.wildbound.game.local.structures.filter((s) => s.owner === "me")
          .length,
    ),
    0,
    "autoattack cannot place buildings",
  );
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  assert.equal(
    await page.evaluate(
      () =>
        window.wildbound.game.local.structures.filter((s) => s.owner === "me")
          .length,
    ),
    1,
    "one physical click places once",
  );
  await page.evaluate(() => {
    const { game, S } = window.wildbound,
      w = game.local,
      p = w.players.me;
    game.auto = false;
    p.res.gold = 50000;
    S.command(w, "me", { t: "accessory", id: "demon-wings" });
    w.time = 899.99;
    S.step(w, 0.05);
  });
  await page.waitForFunction(
    () => window.wildbound.game.cur.biome === "winter",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#biome-strip b").textContent === "Winter · 8m",
  );
  await page.click("#shop-button");
  assert.ok(
    await page
      .getByRole("heading", { name: "Demon Wings", exact: true })
      .count(),
  );
  await page.click("#close-shop");
  await page.screenshot({ path: "/tmp/wildbound-mechanics.png" });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#menu-button");
  if (
    (await page.locator("#keybind-settings").getAttribute("aria-expanded")) !==
    "true"
  )
    await page.click("#keybind-settings");
  await page.screenshot({ path: "/tmp/wildbound-keybinds-mobile.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "Controls browser regressions passed: keybind persistence, single eat, release, click placement, season snapshots, wings shop, mobile layout",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
