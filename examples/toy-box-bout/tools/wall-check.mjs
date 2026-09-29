// Pushes each robot (as models) against the toy-box wall and measures how far any part pokes into it.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const server = await preview({ preview: { port: 4182, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://127.0.0.1:4182/');
await page.waitForFunction(() => window.__game.models, null, { timeout: 60000 });
await page.click('#btn-start');
await page.waitForTimeout(300);
await page.click('#btn-fight');
await page.waitForTimeout(2000);
const res = await page.evaluate(() => {
  const g = window.__game;
  const f = g.fight;
  f.ai.update = () => g.EMPTY_INPUT;
  const out = [];
  const wall = 2.24;
  for (const r of f.robots) {
    for (const [label, yaw] of [['side to wall', 0], ['facing wall', Math.PI / 2], ['diagonal', Math.PI / 4]]) {
      r.pos.set(10, 0, 0); // push far into the wall; the game pulls it back
      r.yaw = yaw;
      f.resolveCollisions();
      r.animate(0);
      r.root.updateMatrixWorld(true);
      let maxX = -Infinity;
      r.root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        maxX = Math.max(maxX, b.max.x);
      });
      out.push(`${r.name.padEnd(9)} ${label.padEnd(12)} centre stops at x=${r.pos.x.toFixed(3)}, furthest part at x=${maxX.toFixed(3)} -> ${maxX > wall ? 'pokes ' + ((maxX - wall) * 100).toFixed(1) + ' cm into the wall' : 'clear by ' + ((wall - maxX) * 100).toFixed(1) + ' cm'}`);
    }
  }
  return out;
});
res.forEach((l) => console.log(l));
await page.screenshot({ path: 'tools/out/wall.png' });
await browser.close();
await new Promise((r) => server.httpServer.close(r));
