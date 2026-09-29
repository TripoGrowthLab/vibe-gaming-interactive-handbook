// Portrait phone view: how much of the screen is sky (horizon position), and how tall Juno is.
import { startHost, guard } from './host.mjs';
import { chromium } from 'playwright-core';
const host = await startHost(4332);
const blockedAll = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const ctx0 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
blockedAll.push(await guard(ctx0, host.url));
const page = await ctx0.newPage();
await page.goto(host.url);
await page.waitForFunction(() => window.__game?.getVisualMode() === 'model', null, { timeout: 30000 });
await page.tap('#btn-start');
const measure = () => page.evaluate(() => {
  const g = __game.game, cam = __game.stage.camera, root = g.skier.root, V = root.position.constructor;
  const hz = new V(cam.position.x, 0, g.p.z + 180).project(cam); // far edge of the ground = horizon line
  let mesh; root.getObjectByName('juno').traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const min = new V(1e9, 1e9, 1e9), max = new V(-1e9, -1e9, -1e9), p = new V();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i += 5) { mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld); min.min(p); max.max(p); }
  const a = new V(min.x, min.y, min.z).project(cam), b = new V(min.x, max.y, min.z).project(cam);
  // how far ahead the ground is visible at the screen's side edges (corridor width seen 20 m ahead)
  const w20 = (() => { const d = new V(0, 0, 1); const z = g.p.z + 20; const s = new V(12, 0, z).project(cam), t = new V(-12, 0, z).project(cam); return +((Math.min(1, s.x) - Math.max(-1, t.x)) / (s.x - t.x) * 24).toFixed(1); })();
  return { skyPct: Math.round((1 - hz.y) / 2 * 100), junoPx: Math.round(Math.abs(a.y - b.y) / 2 * innerHeight), junoBottomPct: Math.round((1 - a.y) / 2 * 100), visibleWidthAt20m: w20, speedKmh: Math.round(g.p.speed * 3.6), fov: +cam.fov.toFixed(1) };
});
await page.waitForTimeout(600);
console.log('start speed', JSON.stringify(await measure()));
await page.screenshot({ path: 'tools/shots/phone-cam-start.png' });
await page.evaluate(() => { const g = __game.game; g.p.time = 200; g.controller = () => 0; g.world.obstacles.forEach((o) => (o.z = -1e6)); });
await page.waitForTimeout(1200);
console.log('top speed  ', JSON.stringify(await measure()));
await page.screenshot({ path: 'tools/shots/phone-cam-fast.png' });
await browser.close(); await host.close();
