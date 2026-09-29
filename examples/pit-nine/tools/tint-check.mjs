// How much the models are washed over by state tints and hit flashes during play (models on).
//  - Foreman under 3 s of steady fire: share of frames glowing, and how strong
//  - hounds during wave 1: share of frames tinted, and how strong
import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'now';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const glowOf = (sel) => `(() => { let mx = 0, sum = 0, n = 0; for (const m of ${sel}) { const i = m.material.emissiveIntensity * Math.max(m.material.emissive.r, m.material.emissive.g, m.material.emissive.b); mx = Math.max(mx, i); sum += i; n++; } return { mx, avg: n ? sum / n : 0 }; })()`;
// hounds in wave 1 (a bot keeps the player alive and shooting)
const hounds = await page.evaluate(async (glowSrc) => {
  let now = 0;
  const f = (n) => { for (let i = 0; i < n; i++) (now += 1000 / 60), __frame(now); };
  const g = __game;
  const aim = { x: 0, y: 0.6, z: 0 };
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; inp.fireHeld = false; inp.aimTarget = null; g.player.hp = 100; } };
  let frames = 0, tinted = 0, sum = 0, mx = 0;
  f(240);
  for (let i = 0; i < 60 * 12; i++) {
    f(1);
    for (const h of g.hounds) {
      if (!h.alive || !h.view.meshes) continue;
      const r = eval(glowSrc.replace('SEL', 'h.view.meshes'));
      frames++;
      if (r.mx > 0.05) tinted++;
      sum += r.avg; mx = Math.max(mx, r.mx);
    }
    if (i === 60 * 6) window.__shotAt = now;
  }
  window.__now = now;
  return { houndFrames: frames, tintedShare: +(tinted / frames).toFixed(2), avgGlow: +(sum / frames).toFixed(3), maxGlow: +mx.toFixed(2), states: g.hounds.map((h) => h.state) };
}, glowOf('SEL'));
await page.screenshot({ path: `tools/out/tint-hounds-${tag}.png` });
// Foreman under steady fire
const foreman = await page.evaluate(async (glowSrc) => {
  let now = window.__now;
  const f = (n) => { for (let i = 0; i < n; i++) (now += 1000 / 60), __frame(now); };
  const g = __game;
  for (const h of g.hounds) (h.state = 'destroyed'), g.scene.remove(h.view.root);
  g.hounds = []; g.spawnQueue = []; g.phase = 'boss'; g.foreman.wake();
  f(200);
  g.foreman.cooldown = 99;
  g.player.pos.set(g.foreman.pos.x, 0, g.foreman.pos.z + 10); g.player.snapshot();
  const t = new g.player.pos.constructor();
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; t.copy(g.foreman.partCenter('armour_plate')); inp.aimTarget = t; inp.fireHeld = true; g.player.hp = 100; g.foreman.parts.armour_plate.hp = 30; } };
  let frames = 0, lit = 0, sum = 0, mx = 0;
  const hits0 = g.stats.boltHits.part;
  for (let i = 0; i < 180; i++) {
    f(1);
    const r = eval(glowSrc.replace('SEL', 'g.foreman.view.meshes'));
    frames++;
    if (r.avg > 0.15) lit++;
    sum += r.avg; mx = Math.max(mx, r.mx);
    if (i === 100) window.__mid = true;
  }
  __input.bot = null;
  return { frames, hitsLanded: g.stats.boltHits.part - hits0, washedShare: +(lit / frames).toFixed(2), avgGlow: +(sum / frames).toFixed(3), maxGlow: +mx.toFixed(2) };
}, glowOf('SEL'));
await page.screenshot({ path: `tools/out/tint-foreman-${tag}.png` });
console.log(JSON.stringify({ hounds, foreman }, null, 1));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
