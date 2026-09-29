// How Tamsin's model faces while running and aiming in different directions (models on, driven frame by frame):
// legs = pelvis heading vs the direction she runs, chest = shoulder heading vs where she aims,
// slide = how fast a planted foot moves over the ground (should be about 0).
import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'now';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const scenarios = [
  ['run right, aim up, not shooting', { mx: 1, mz: 0, ax: 0, az: -1, fire: false }],
  ['run right, aim up, shooting', { mx: 1, mz: 0, ax: 0, az: -1, fire: true }],
  ['run down, aim up, shooting (backpedal)', { mx: 0, mz: 1, ax: 0, az: -1, fire: true }],
  ['run right, aim right, shooting', { mx: 1, mz: 0, ax: 1, az: 0, fire: true }],
];
const rows = [];
for (const [name, s] of scenarios) {
  const r = await page.evaluate(async (s) => {
    __restart();
    let now = (window.__now || 0) + 1000;
    __frame(now);
    const g = __game;
    g.phase = 'test'; g.spawnQueue = [];
    const V = g.player.pos.constructor;
    const aim = new V();
    __input.bot = { poll: (inp) => {
      inp.move.x = s.mx; inp.move.z = s.mz;
      aim.set(g.player.pos.x + s.ax * 8, 0.5, g.player.pos.z + s.az * 8);
      inp.aimTarget = aim; inp.fireHeld = s.fire;
    } };
    g.player.pos.set(-s.mx * 7.5, 0, -s.mz * 7.5); g.player.snapshot(); // runs 15 m through the open middle
    const v = () => g.player.view;
    const get = (n) => new V().setFromMatrixPosition(v().model.getObjectByName(n).matrixWorld);
    const heading = (l, r) => { const d = get(l).sub(get(r)); return Math.atan2(-d.z, d.x) ; }; // left-minus-right vector -> forward yaw
    const yawOf = (x, z) => Math.atan2(x, z);
    const diff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
    let legs = 0, chest = 0, n = 0, slide = 0, sn = 0;
    const toes = ['mixamorigLeftToeBase', 'mixamorigRightToeBase'];
    const track = [];
    for (let i = 0; i < 150; i++) {
      now += 1000 / 60; __frame(now);
      if (i < 60) continue;
      const legYaw = heading('mixamorigLeftUpLeg', 'mixamorigRightUpLeg');
      const chestYaw = heading('mixamorigLeftArm', 'mixamorigRightArm');
      legs += diff(legYaw, yawOf(s.mx, s.mz));
      chest += diff(chestYaw, yawOf(s.ax, s.az));
      n++;
      track.push(toes.map(get));
    }
    // a foot is planted when it is within 2 cm of its lowest point during the run
    for (let k = 0; k < 2; k++) {
      const low = Math.min(...track.map((t) => t[k].y));
      for (let i = 1; i < track.length; i++) {
        const a = track[i - 1][k], b = track[i][k];
        if (a.y < low + 0.02 && b.y < low + 0.02) (slide += Math.hypot(b.x - a.x, b.z - a.z) * 60), sn++;
      }
    }
    window.__now = now;
    __input.bot = null;
    return { legsOffDeg: +(legs / n).toFixed(0), chestOffDeg: +(chest / n).toFixed(0), plantedFootSlide: +(sn ? slide / sn : 0).toFixed(2), samples: sn };
  }, s);
  await page.screenshot({ path: `tools/out/runface-${tag}-${rows.length}.png` });
  rows.push([name, r]);
}
for (const [n, r] of rows) console.log(n.padEnd(40), `legs ${r.legsOffDeg}° off the run direction, chest ${r.chestOffDeg}° off the aim, planted foot slides ${r.plantedFootSlide} m/s (${r.samples} planted samples)`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
