// Screenshots the real garage with a chosen loadout, e.g.
// node tools/garage-shot.mjs legs:popgun_legs,arm_r:kanazuchi_arm_r name
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const [spec = '', name = 'garage'] = process.argv.slice(2);
const server = await preview({ preview: { port: 4186, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://127.0.0.1:4186/');
await page.waitForFunction(() => window.__game.models, null, { timeout: 60000 });
await page.click('#btn-start');
await page.waitForTimeout(300);
for (const kv of spec.split(',').filter(Boolean)) {
  const [slot, id] = kv.split(':');
  await page.evaluate((id) => window.__game.save.inventory.push(id), id);
  await page.click('#s-garage button.lang'); // redraw the garage menu (twice = same language)
  await page.click('#s-garage button.lang');
  for (let i = 0; i < 6 && (await page.evaluate((s) => window.__game.save.loadout[s], slot)) !== id; i++) await page.click(`button.arrow[data-act="part"][data-slot="${slot}"][data-dir="1"]`);
}
// Face the robot to the camera and wait for the camera to settle.
await page.evaluate(() => { const v = window.__game.garageView; v.root.rotation.y = 0; });
await page.waitForTimeout(100);
await page.evaluate(() => { window.__game.garageView.root.rotation.y = 0; });
await page.screenshot({ path: `tools/out/g-${name}.png`, clip: { x: 560, y: 120, width: 560, height: 500 } });
console.log(JSON.stringify(await page.evaluate(() => window.__game.garageView.fit)));
await browser.close(); await new Promise((r) => server.httpServer.close(r));
