// Quick visual check of the built game: screenshots at a few moments (model mode).
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const server = await preview({ preview: { port: 4319, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const vp = process.env.PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const page = await (await browser.newContext(vp)).newPage();
const errs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4319/');
await page.waitForFunction(() => window.__game?.modelStatus.loaded.length || Object.keys(window.__game?.modelStatus.failed ?? {}).length, null, { timeout: 30000 });
const tag = process.env.PHONE ? 'phone' : 'desk';
console.log('status', JSON.stringify(await page.evaluate(() => window.__game.modelStatus)));
await page.waitForTimeout(800);
await page.screenshot({ path: `tools/shots/m-${tag}-title.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(450);
await page.screenshot({ path: `tools/shots/m-${tag}-carve.png` });
await page.keyboard.up('ArrowLeft');
// drive into the next obstacle and capture the crash
await page.evaluate(() => {
  const g = __game.game;
  g.controller = (s) => { const o = s.obstacles.filter((o) => o.z > s.z + 1).sort((a, b) => a.z - b.z)[0]; return o ? Math.sign(o.x - s.x) * (Math.abs(o.x - s.x) > 0.2) : 0; };
});
await page.waitForFunction(() => __game.game.state === 'crashing', null, { timeout: 30000 });
await page.waitForTimeout(120);
await page.screenshot({ path: `tools/shots/m-${tag}-hit.png` });
await page.waitForTimeout(900);
await page.screenshot({ path: `tools/shots/m-${tag}-down.png` });
console.log('info', JSON.stringify(await page.evaluate(() => ({ calls: __game.stage.renderer.info.render.calls, tris: __game.stage.renderer.info.render.triangles, sfx: __game.sfxStats, mode: __game.getVisualMode() }))));
console.log('errors', errs);
await browser.close(); await server.httpServer.close();
