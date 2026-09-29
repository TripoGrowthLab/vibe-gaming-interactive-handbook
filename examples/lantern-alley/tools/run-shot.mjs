// Screenshot of Volt mid-run with the models.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4191;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
await page.goto(`http://localhost:${PORT}/?manual=1&seed=5`);
await page.evaluate(() => window.__modelsReady);
await page.evaluate(() => {
  const g = __game; let t = 1000; g.reset(); g.turns.update = () => {};
  g.input.setVirtualMove({ x: 1, z: 0, run: true });
  for (let i = 0; i < 70; i++) __frame(t += 1000 / 60);
});
await page.screenshot({ path: 'tools/shots/run.png', clip: { x: 250, y: 150, width: 500, height: 330 } });
await browser.close(); server.kill();
