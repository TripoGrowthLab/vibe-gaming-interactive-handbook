import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 5198;
const server = spawn('npx', ['vite', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const s of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 330 } });
  await page.goto(`http://localhost:${PORT}/lab.html?sheet=${s}`);
  await page.waitForFunction(() => window.__lab, null, { timeout: 60000 });
  await page.screenshot({ path: `tools/shots/sheet-${s.replace(':', '-')}.png` });
  await page.close();
}
await browser.close(); server.kill();
