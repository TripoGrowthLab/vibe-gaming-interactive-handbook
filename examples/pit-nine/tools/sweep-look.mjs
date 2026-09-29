// Forces the Foreman's sweep (red warning line, then the beam) with models on and records, every frame,
// each part's glow (emissive) and colour, plus screenshots at the warning and the active beam.
import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'now';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const shot = async (name) => page.screenshot({ path: `tools/out/sweep-${tag}-${name}.png` });
const run = (n) => page.evaluate((n) => {
  const g = __game, f = g.foreman;
  let now = window.__now || 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    __frame(now);
    const parts = {};
    for (const m of f.view.meshes) {
      const name = m.parent?.name || '?';
      const e = m.material.emissive;
      parts[name] = { glow: +(m.material.emissiveIntensity * Math.max(e.r, e.g, e.b)).toFixed(2), glowCol: '#' + e.getHexString(), col: '#' + m.material.color.getHexString() };
    }
    rows.push({ t: +f.attackT.toFixed(2), state: f.state, attack: f.attack, beam: f.beamOn, parts });
  }
  window.__now = now;
  return rows;
}, n);
await page.evaluate(() => {
  const g = __game;
  g.phase = 'boss'; g.spawnQueue = []; g.foreman.wake();
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; inp.fireHeld = false; inp.aimTarget = null; g.player.hp = 100; } };
});
await run(200); // wake up
await page.evaluate(() => {
  const g = __game, f = g.foreman;
  g.player.pos.set(f.pos.x - 3, 0, f.pos.z + 9); g.player.snapshot();
  f.setState('walk'); f.cooldown = 99; f.startAttack(99, g); f.attack = 'sweep'; f.attackT = 0;
});
const warn = await run(40); // warning line is up during the first 0.35 of 2.5 s
await shot('warning');
const active = await run(50);
await shot('beam');
const all = [...warn, ...active];
const summary = {};
for (const r of all)
  for (const [p, v] of Object.entries(r.parts)) {
    const s = (summary[p] ||= { maxGlow: 0, glowCols: new Set(), cols: new Set() });
    s.maxGlow = Math.max(s.maxGlow, v.glow);
    if (v.glow > 0.05) s.glowCols.add(v.glowCol);
    s.cols.add(v.col);
  }
for (const [p, s] of Object.entries(summary)) console.log(p.padEnd(16), 'max glow', s.maxGlow, 'glow colours', [...s.glowCols].join(' ') || '-', ' colours', [...s.cols].join(' '));
console.log('states seen:', [...new Set(all.map((r) => `${r.state}/${r.attack}/beam${r.beam}`))].join(', '));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
