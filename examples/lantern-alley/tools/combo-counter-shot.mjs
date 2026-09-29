// Screenshot of the combo counter at its biggest (start of its pop), to check it stays on screen.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4202;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/?manual=1`);
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { __game.hud.combo(17); });
await page.waitForTimeout(40);
await page.screenshot({ path: 'tools/shots/combo-counter.png', clip: { x: 0, y: 0, width: 420, height: 200 } });
await browser.close(); server.kill();
