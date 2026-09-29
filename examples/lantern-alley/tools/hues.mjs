import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const server = spawn('npx', ['vite', '--port', '5197', '--strictPort'], { stdio: 'ignore', cwd: process.argv[2] });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.goto('http://localhost:5197/lab.html?hues=1');
await p.waitForFunction(() => window.__lab, null, { timeout: 60000 });
console.log(JSON.stringify(await p.evaluate(() => window.__lab), null, 1));
await b.close(); server.kill();
