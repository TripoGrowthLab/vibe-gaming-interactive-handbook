// node tools/assembled-shots.mjs "<query>" <name> [...more pairs]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const pairs = process.argv.slice(2);
const server = await createServer({ server: { port: 4189, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (let i = 0; i < pairs.length; i += 2) {
  await page.goto(`http://localhost:4189/tools/viewer/assembled.html?${pairs[i]}`);
  await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
  await page.screenshot({ path: `tools/out/a-${pairs[i + 1]}.png` });
  if (i === 0 || process.env.SIZES) console.log(pairs[i + 1], JSON.stringify(await page.evaluate(() => window.__sizes)));
}
await browser.close();
await server.close();
