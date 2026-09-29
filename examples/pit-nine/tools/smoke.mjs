// Quick check: open the game in the installed Google Chrome, report console errors, save a screenshot.
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4291/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tools/out/smoke.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ phase: __game.phase, hounds: __game.hounds.length, t: __game.time })), null, 0));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
