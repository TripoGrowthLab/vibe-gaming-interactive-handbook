import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
ctx.on('page', (p) => console.log('new page event', p.url()));
await page.goto('http://localhost:4291/');
await page.waitForFunction(() => window.__ready);
console.log(await page.evaluate(() => {
  const l = document.getElementById('tripo-link');
  const r = l.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return `link rect ${JSON.stringify(r)}; element on top at its centre: ${top?.id || top?.tagName}; pointer-events ${getComputedStyle(l).pointerEvents}`;
}));
await page.click('#tripo-link');
await page.waitForTimeout(3000);
console.log('pages now', ctx.pages().map((p) => p.url()));
await browser.close();
