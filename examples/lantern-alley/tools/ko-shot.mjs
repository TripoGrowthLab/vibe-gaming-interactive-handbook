// Screenshots a knocked-out thug with models, 3.4 s (lying down), 3.8 s and 4.1 s (fading) after the knockout.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4182;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/?look=${process.argv[2] ?? "models"}`);
await page.evaluate(() => window.__modelsReady);
await page.waitForFunction(() => __game.enemies.some(e => !e.entering && Math.abs(e.pos.x - __game.hero.pos.x) < 3), null, { timeout: 20000 });
await page.evaluate(() => { const e = __game.enemies.find(e => !e.entering && Math.abs(e.pos.x - __game.hero.pos.x) < 3); e.hp = 0; e.takeHit({ heavy: true }); });
for (const [ms, name] of [[3400, 'a'], [400, 'b'], [300, 'c']]) {
  await new Promise(r => setTimeout(r, ms));
  await page.screenshot({ path: `tools/shots/ko-${name}.png` });
}
await browser.close(); server.kill();
