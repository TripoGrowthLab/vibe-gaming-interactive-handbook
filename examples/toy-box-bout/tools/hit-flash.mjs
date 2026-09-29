// Measures how long a robot stays tinted white after it is hit, in a real-time fight (speed 1),
// with models and with the greybox. Usage: npm run build && node tools/hit-flash.mjs
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const server = await preview({ preview: { port: 4193, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const mode of ['model', 'greybox']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:4193/?bot=1&speed=1${mode === 'greybox' ? '&greybox' : ''}`);
  await page.waitForFunction(() => window.__game.screen === 'fight' && window.__game.fight.phase === 'fight', null, { timeout: 90000 });
  const res = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__game;
    const fight = g.fight;
    const flashes = [];
    let open = null;
    fight.on((type, d) => {
      if (type === 'hit' && !open && !d.blocked) open = { robot: d.target, t0: performance.now(), frames: [] };
    });
    const whiteness = (r) => {
      let max = 0;
      r.view.root.traverse((o) => {
        if (!o.isMesh) return;
        // White only (the hit flash); coloured tints (guard, attack wind-up) are not counted.
        for (const m of [].concat(o.material)) if (m.emissive && !m.userData.glow && m.emissive.getHex() === 0xffffff) max = Math.max(max, m.emissiveIntensity);
      });
      return max;
    };
    const step = () => {
      if (open) {
        const w = whiteness(open.robot);
        const t = performance.now() - open.t0;
        const lit = [];
        for (const slot of ['head', 'core', 'arm_r', 'arm_l', 'legs']) {
          const part = open.robot.view.part(slot);
          if (!part) continue;
          for (const m of part.userData.mats) if (!m.userData.glow && m.emissiveIntensity > 0.01) lit.push(slot + ':#' + m.emissive.getHexString() + '@' + m.emissiveIntensity.toFixed(2));
        }
        open.frames.push([Math.round(t), +w.toFixed(3), open.robot.state, [...new Set(lit)].join(' ')]);
        if (t > 600) {
          const firstGone = open.frames.find((f) => f[1] <= 0.05);
          flashes.push({ whiteMs: firstGone ? firstGone[0] : 1200, peak: Math.max(...open.frames.map((f) => f[1])), states: [...new Set(open.frames.map((f) => f[2]))].join('>') });
          open = null;
        }
      }
      if (flashes.length < 6 && fight === g.fight) requestAnimationFrame(step);
      else resolve({ flashes });
    };
    requestAnimationFrame(step);
  }));
  console.log(`${mode}: after a hit the robot is white (tint above 5%) for`, res.flashes.map((f) => `${f.whiteMs} ms (${f.states})`).join(', '));
  await page.close();
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
