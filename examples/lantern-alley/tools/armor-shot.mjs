// Screenshot 0.12 s after a jab hits a Slab (models): no reaction, "UNFAZED!" popup.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4195;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
await page.goto(`http://localhost:${PORT}/?manual=1&seed=5`);
await page.evaluate(() => window.__modelsReady);
await page.evaluate(() => {
  const g = __game; let t = 1000; const frame = () => __frame(t += 1000 / 60);
  g.reset(); g.spawnQueue = ['__none__']; g.nextArrival = 1e9; g.turns.update = () => {};
  for (let i = 0; i < 120; i++) frame();
  const e = window.__spawn('thug_fat'); e.entering = false; e.cooldown = 1e9; e.side = 1;
  for (let i = 0; i < 30; i++) { e.pos.set(0.9, 0, 0); e.prevPos.copy(e.pos); g.hero.pos.set(0, 0, 0); g.hero.prevPos.copy(g.hero.pos); g.hero.facing = 1; frame(); }
  let at = null; g.on('hit', () => { at ??= g.time; });
  g.input.press('punch');
  while (at === null || g.time - at < 0.12) frame();
});
await page.screenshot({ path: 'tools/shots/armor.png', clip: { x: 300, y: 130, width: 400, height: 330 } });
await browser.close(); server.kill();
