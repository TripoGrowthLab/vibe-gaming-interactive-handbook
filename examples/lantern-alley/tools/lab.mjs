// Opens lab.html in the installed Chrome, saves screenshots and prints the measurements.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5199;
mkdirSync('tools/shots', { recursive: true });
const server = spawn('npx', ['vite', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const problems = [];
try {
  const shots = (process.argv[2] ?? 'front,side').split(',');
  let data = null;
  for (const view of shots) {
    const page = await browser.newPage({ viewport: { width: 1800, height: 700 } });
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); });
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(`http://localhost:${PORT}/lab.html?view=${view}`);
    await page.waitForFunction(() => window.__lab, null, { timeout: 60000 });
    await page.locator('#out').evaluate(e => (e.style.display = 'none'));
    await page.screenshot({ path: `tools/shots/lab-${view}.png` });
    data = data ?? await page.evaluate(() => window.__lab);
    await page.close();
  }
  writeFileSync('tools/shots/lab.json', JSON.stringify(data, null, 1));
  console.log(JSON.stringify(data, null, 1));
} finally {
  console.log(problems.length ? 'Console problems:\n' + [...new Set(problems)].join('\n') : 'Console: no errors or warnings');
  await browser.close(); server.kill();
}
