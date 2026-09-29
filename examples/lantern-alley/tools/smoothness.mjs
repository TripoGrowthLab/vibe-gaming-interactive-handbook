// Walks Volt right at a steady speed and measures how far he moves on screen each rendered frame,
// with frames arriving at 60, 120 and 144 Hz (as on a MacBook Pro display) and with uneven timing.
// Smooth motion = the same distance every frame.
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4183;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let bad = 0;
for (const look of ['models', 'greybox']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('page error', e.message));
  await page.goto(`http://localhost:${PORT}/?manual=1&look=${look}`);
  await page.evaluate(() => window.__modelsReady);
  for (const [label, hz, wobble] of [['60 Hz', 60, 0], ['120 Hz', 120, 0], ['144 Hz', 144, 0], ['120 Hz, uneven timing', 120, 0.25]]) {
    const r = await page.evaluate(({ hz, wobble }) => {
      const g = __game;
      g.reset();
      g.turns.update = () => {};                 // no enemy attacks during the measurement
      g.input.setVirtualMove({ x: 1, z: 0 });
      let t = window.__t ?? 1000;
      const step = 1000 / hz;
      for (let i = 0; i < 30; i++) __frame(t += step);       // get walking
      const xs = [], cam = [];
      for (let i = 0; i < 90; i++) {
        __frame(t += step * (1 + (wobble ? (i % 2 ? wobble : -wobble) : 0)));
        xs.push(g.hero.node.position.x - g.camera.position.x);   // position on screen relative to camera
        cam.push(g.hero.node.position.x);
      }
      g.input.setVirtualMove(null);
      window.__t = t;
      const d = cam.slice(1).map((x, i) => x - cam[i]);
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      return { mean, min: Math.min(...d), max: Math.max(...d), stills: d.filter(v => Math.abs(v) < 1e-6).length, n: d.length };
    }, { hz, wobble });
    // expected distance per frame follows the frame time, so compare to the mean
    const spread = (r.max - r.min) / r.mean;
    const smooth = r.stills === 0 && spread < (label.includes('uneven') ? 0.6 : 0.05);
    if (!smooth) bad++;
    console.log(`${look.padEnd(8)} ${label.padEnd(22)} move per frame: mean ${(r.mean * 1000).toFixed(1)} mm, min ${(r.min * 1000).toFixed(1)}, max ${(r.max * 1000).toFixed(1)}, frames with no movement ${r.stills}/${r.n} -> ${smooth ? 'smooth' : 'JERKY'}`);
  }
  await page.close();
}
await browser.close(); server.kill();
process.exitCode = bad ? 1 : 0;
