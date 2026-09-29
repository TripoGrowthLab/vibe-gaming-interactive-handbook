// Renders tools/viewer for each id and view into tools/out/view-<id>-<view>.png using installed Chrome.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const ids = process.argv[2] ? process.argv[2].split(',') : ['robot_pipo', 'robot_kanazuchi', 'robot_popgun', 'robot_hazama', 'arena_toybox', 'toy_block', 'cork_pellet', 'bottle_rocket'];
const views = process.argv[3] ? process.argv[3].split(',') : ['front', 'top'];
const server = await createServer({ server: { port: 4188, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
for (const id of ids) for (const v of views) {
  await page.goto(`http://localhost:4188/tools/viewer/index.html?id=${id}&view=${v}`);
  await page.waitForFunction(() => window.__done, null, { timeout: 30000 });
  await page.screenshot({ path: `tools/out/view-${id}-${v}.png` });
}
await browser.close();
await server.close();
console.log('done');
