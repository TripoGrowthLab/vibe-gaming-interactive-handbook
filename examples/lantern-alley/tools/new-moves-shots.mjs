// Screenshots (models): Slab's "!" warning before a charge, a broken crate with food, a flying kick.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4198;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
await page.goto(`http://localhost:${PORT}/?manual=1&seed=4`);
await page.evaluate(() => window.__modelsReady);
const setup = () => page.evaluate(() => {
  const g = __game; window.__t ??= 1000; window.__f = n => { for (let i = 0; i < n; i++) __frame(window.__t += 1000 / 60); };
  g.reset(); g.spawnQueue = ['__none__']; g.nextArrival = 1e9; g.turns.update = () => {}; g.turns.holder = null; window.__f(100);
});
// 1. Slab warning
await setup();
await page.evaluate(() => {
  const g = __game; const s = __spawn('thug_fat', 1, 0); s.entering = false; s.pos.set(3.5, 0, 0); s.prevPos.copy(s.pos); s.cooldown = 0; s.side = 1; s.facing = -1;
  g.turns.holder = s; s.onTurnGiven(); s.specialRoll = 0; window.__f(6);
});
await page.screenshot({ path: 'tools/shots/new-warning.png', clip: { x: 250, y: 100, width: 500, height: 360 } });
// 2. crate + food
await setup();
await page.evaluate(() => { const g = __game; g.hero.pos.set(4.1, 0, -2.9); g.hero.prevPos.copy(g.hero.pos); g.hero.facing = 1; g.input.press('punch'); window.__f(40); });
await page.screenshot({ path: 'tools/shots/new-crate.png', clip: { x: 250, y: 100, width: 500, height: 360 } });
// 3. flying kick
await setup();
await page.evaluate(() => {
  const g = __game; for (const [x, z] of [[3.2, -0.3], [3.35, 0.5]]) { const e = __spawn('thug_skinny', 1, z); e.entering = false; e.pos.set(x, 0, z); e.prevPos.copy(e.pos); e.cooldown = 1e9; e.side = 1; e.update = function (dt) { this.tick(dt); }; }
  g.input.setVirtualMove({ x: 1, z: 0, run: true }); window.__f(12); g.input.press('kick'); window.__f(2); g.input.setVirtualMove({ x: 0, z: 0 });
  let hit = false; g.on('hit', () => { hit = true; }); let n = 0; while (!hit && n++ < 90) window.__f(1); window.__f(4);
});
await page.screenshot({ path: 'tools/shots/new-flying-kick.png', clip: { x: 250, y: 100, width: 500, height: 360 } });
await browser.close(); server.kill();
