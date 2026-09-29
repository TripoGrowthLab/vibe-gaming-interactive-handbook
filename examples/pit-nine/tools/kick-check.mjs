// Hit jolts are looks only: after steady fire at the core, every Foreman part's pivot (what the hit tests use)
// must be exactly where it was, and the drawn shapes must be back in place once the jolts end.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
console.log(await page.evaluate(() => {
  let now = 1000;
  const g = __game, f = g.foreman, V = g.player.pos.constructor;
  g.phase = 'boss'; g.spawnQueue = []; f.wake();
  for (let i = 0; i < 200; i++) (now += 1000 / 60), __frame(now);
  f.damagePart('armour_plate', 999, g);
  for (let i = 0; i < 100; i++) (now += 1000 / 60), __frame(now);
  f.setState('walk'); f.cooldown = 999;
  const freeze = () => { f.pos.set(0, 0, -6); f.yaw = 0; f.snapshot(); };
  g.player.pos.set(0, 0, 2); g.player.snapshot(); // 8 m away: inside the distance it keeps, so it stands still
  const aim = new V();
  const snap = () => { freeze(); now += 1000 / 60; __frame(now); f.view.root.updateMatrixWorld(true); return Object.fromEntries(['core', 'hull', 'left_cannon'].map((n) => { const p = f.view.part(n); return [n, { pivot: new V().setFromMatrixPosition(p.matrixWorld), mesh: new V().setFromMatrixPosition(p.children[0].matrixWorld) }]; })); };
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; inp.fireHeld = false; g.player.hp = 100; f.cooldown = 999; } };
  const a = snap();
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; aim.copy(f.partCenter('core')); inp.aimTarget = aim; inp.fireHeld = true; g.player.hp = 100; f.cooldown = 999; f.parts.core.hp = 40; } };
  const hits0 = g.stats.partHits.core || 0;
  let maxPivotMove = 0;
  for (let i = 0; i < 180; i++) { const s = snap(); maxPivotMove = Math.max(maxPivotMove, s.core.pivot.distanceTo(a.core.pivot)); }
  const hits = (g.stats.partHits.core || 0) - hits0;
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; inp.fireHeld = false; g.player.hp = 100; f.cooldown = 999; } };
  for (let i = 0; i < 30; i++) snap();
  const b = snap();
  const d = (n, k) => a[n][k].distanceTo(b[n][k]).toFixed(4);
  __input.bot = null;
  return `core hits during 3 s of fire: ${hits}\ncore pivot moved at most ${maxPivotMove.toFixed(4)} m while jolting (must be 0)\nafter the jolts end: core pivot ${d('core', 'pivot')} m, core shape ${d('core', 'mesh')} m, hull shape ${d('hull', 'mesh')} m, left cannon shape ${d('left_cannon', 'mesh')} m (all must be 0)`;
}));
await browser.close();
