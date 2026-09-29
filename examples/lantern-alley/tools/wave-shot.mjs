// Screenshot of wave 3 (models) with the bot playing: the mixed crowd of enemy kinds.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4201;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/?manual=1&bot=1&seed=21`);
await page.evaluate(() => window.__modelsReady);
await page.waitForFunction(() => window.__game?.beforeStep);
await page.evaluate(() => {
  const g = __game; let t = 1000;
  while (!(g.wave === 2 && new Set(g.enemies.filter(e => e.alive && !e.entering).map(e => e.kind)).size >= 3) && g.time < 400) __steps(30);
  for (let i = 0; i < 20; i++) __frame(t += 1000 / 60);
});
await page.screenshot({ path: 'tools/shots/wave3.png' });
await browser.close(); server.kill();
