// Close-up of the characters in the lab (base models next to their recoloured variants).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const server = spawn('npx', ['vite', '--port', '5196', '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1800, height: 700 }, deviceScaleFactor: 3 });
await p.goto('http://localhost:5196/lab.html?view=front');
await p.waitForFunction(() => window.__lab, null, { timeout: 60000 });
await p.locator('#out').evaluate(e => (e.style.display = 'none'));
await p.screenshot({ path: 'tools/shots/variants.png', clip: { x: 230, y: 270, width: 760, height: 130 } });
await b.close(); server.kill();
