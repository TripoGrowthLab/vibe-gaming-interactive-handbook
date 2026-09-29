// Screenshots of the toy blocks with models: the arena from above and a close-up of one stack.
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const server = await preview({ preview: { port: 4194, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://127.0.0.1:4194/');
await page.waitForFunction(() => window.__game.models, null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('#s-title').classList.remove('on'));
for (const [name, pos, look] of [
  ['blocks-overview', [2.2, 1.6, 2.2], [0, 0.1, 0]],
  ['blocks-close', [0.75, 0.55, -0.55], [1.2, 0.25, -1.2]],
  ['blocks-close2', [-0.6, 0.5, 0.55], [-1.2, 0.25, 1.2]],
]) {
  const letters = await page.evaluate(({ pos, look }) => {
    const g = window.__game;
    g.rig.title = () => {}; // hold the camera still for the shot
    g.camera.position.set(...pos);
    g.camera.lookAt(...look);
    const seen = [];
    g.scene.traverse((o) => o.name === 'letter_tile' && seen.push(o.material.map?.image ? 1 : 0));
    return seen.length;
  }, { pos, look });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tools/out/${name}.png` });
  console.log(name, `(${letters} letter tiles in the scene)`);
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
