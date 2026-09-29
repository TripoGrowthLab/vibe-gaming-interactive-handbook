// Screenshot of the start of a round (controls card) on desktop and phone, plus the first wave-1 hound on screen.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto('http://localhost:4291/');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `tools/out/intro-${name}.png` });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `tools/out/intro-${name}-hound.png` });
  await ctx.close();
}
await browser.close();
