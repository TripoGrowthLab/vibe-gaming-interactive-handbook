// Screenshots 0.1 s after each hit of a jab > cross > hook combo on a Sprat (models).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4193;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
await page.goto(`http://localhost:${PORT}/?manual=1&seed=31`);
await page.evaluate(() => window.__modelsReady);
await page.evaluate(() => {
  const g = __game; window.__t = 1000; const frame = () => __frame(window.__t += 1000 / 60);
  g.reset(); frame();
  let guard = 0;
  while (guard++ < 60 * 30) { frame(); const h = g.turns.holder; if (h && h.kind === 'thug_skinny' && Math.abs(h.pos.x - g.hero.pos.x) < 1.4 && Math.abs(h.pos.z - g.hero.pos.z) < 0.4) break; }
  window.__target = g.turns.holder; window.__hits = 0; g.on('hit', h => { if (h.attacker === g.hero) { window.__hits++; window.__hitAt = g.time; } });
  g.turns.update = () => {};                 // freeze the turn so only this Sprat is involved
});
for (let n = 1; n <= 3; n++) {
  await page.evaluate(n => {
    const g = __game; const frame = () => __frame(window.__t += 1000 / 60);
    let press = 0, guard = 0;
    while (window.__hits < n && guard++ < 300) { if (--press <= 0) { g.input.press('punch'); press = 9; } frame(); }
    while (g.time - window.__hitAt < 0.1) frame();
  }, n);
  const x = await page.evaluate(() => { const p = __game.hero.node.position.clone().project(__game.camera); return (p.x * 0.5 + 0.5) * innerWidth; });
  await page.screenshot({ path: `tools/shots/combo-${n}.png`, clip: { x: Math.max(0, Math.min(600, x - 200)), y: 170, width: 400, height: 300 } });
}
await browser.close(); server.kill();
