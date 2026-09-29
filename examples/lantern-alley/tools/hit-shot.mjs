// Screenshots a Sprat just before and 0.12 s after a jab lands (models).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4190;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
await page.goto(`http://localhost:${PORT}/?manual=1&seed=5`);
await page.evaluate(() => window.__modelsReady);
await page.evaluate(() => {
  const g = __game; window.__t = 1000; const frame = () => __frame(window.__t += 1000 / 60);
  g.reset(); frame(); g.turns.update = () => {}; g.spawnQueue = [];
  while (!g.enemies.length) frame();
  const e = window.__e = g.enemies[0];
  e.entering = false; e.hp = e.maxHp = 1000; e.cooldown = 1e9; e.side = 1;
  for (let i = 0; i < 40; i++) { e.pos.set(1.0, 0, 0); e.prevPos.copy(e.pos); g.hero.pos.set(0, 0, 0); g.hero.prevPos.copy(g.hero.pos); g.hero.facing = 1; frame(); }
  g.input.press('punch');
  let landed = false; g.on('hit', () => { landed = true; });
  while (!landed) frame();
  window.__landedAt = g.time;
});
await page.screenshot({ path: 'tools/shots/hit-0.png', clip: { x: 300, y: 150, width: 400, height: 330 } });
await page.evaluate(() => { const g = __game; while (g.time - window.__landedAt < 0.12) __frame(window.__t += 1000 / 60); });
await page.screenshot({ path: 'tools/shots/hit-1.png', clip: { x: 300, y: 150, width: 400, height: 330 } });
await browser.close(); server.kill();
