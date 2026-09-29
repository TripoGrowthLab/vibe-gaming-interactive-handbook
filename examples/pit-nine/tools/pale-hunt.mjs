// Looks for moments where the Foreman looks pale: reads its on-screen pixels right after each frame and measures
// how colourful (saturation) and bright they are, across several sweep scenarios, in both looks.
import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'now';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.evaluate(() => {
  // colour stats of the Foreman's screen area, read straight after rendering
});
const result = await page.evaluate(async () => {
  const g0 = __game;
  const V = g0.player.pos.constructor;
  const gl = __renderer.getContext();
  const size = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight };
  const buf = new Uint8Array(size.w * size.h * 4);
  let now = 0;
  const stats = () => {
    const g = __game;
    // screen rectangle of the Foreman's upper body (hull), from its part centres
    const pts = ['hull', 'left_cannon', 'right_cannon', 'armour_plate', 'missile_pod'].map((n) => g.foreman.view.part(n)).filter(Boolean).map((p) => new V().setFromMatrixPosition(p.matrixWorld).project(__camera));
    const xs = pts.map((p) => (p.x + 1) / 2 * size.w), ys = pts.map((p) => (p.y + 1) / 2 * size.h);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(size.w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(size.h - 1, Math.ceil(Math.max(...ys)));
    gl.readPixels(0, 0, size.w, size.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let sat = 0, lum = 0, n = 0;
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
      const i = (y * size.w + x) * 4;
      const r = buf[i] / 255, gg = buf[i + 1] / 255, b = buf[i + 2] / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      sat += mx ? (mx - mn) / mx : 0;
      lum += (r + gg + b) / 3;
      n++;
    }
    return { sat: n ? sat / n : 0, lum: n ? lum / n : 0 };
  };
  let worst = { sat: 9 };
  const frames = (n, cb) => { const out = []; for (let i = 0; i < n; i++) { now += 1000 / 60; __frame(now); cb?.(i); const st = stats(); if (window.__track && st.lum > 0.05 && st.sat < worst.sat) worst = { sat: st.sat, lum: st.lum, img: __renderer.domElement.toDataURL('image/png'), state: __game.foreman.state, attack: __game.foreman.attack, beam: __game.foreman.beamOn, broken: Object.entries(__game.foreman.parts).filter(([, p]) => p.broken).map(([k]) => k), stop: __game.stop }; out.push({ ...st, st: __game.foreman.state, atk: __game.foreman.attack, beam: __game.foreman.beamOn }); } return out; };
  const setup = () => {
    const g = __game;
    g.phase = 'boss'; g.spawnQueue = []; g.foreman.wake();
    __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; g.player.hp = 100; if (window.__fire) { const t = g.foreman.isTarget(window.__fire) ? window.__fire : 'armour_plate'; inp.aimTarget = g.foreman.partCenter(t); inp.fireHeld = true; } else { inp.fireHeld = false; inp.aimTarget = null; } } };
    frames(200);
    const f = g.foreman;
    g.player.pos.set(f.pos.x - 3, 0, f.pos.z + 9); g.player.snapshot();
  };
  const sweep = () => { const g = __game, f = g.foreman; f.setState('walk'); f.cooldown = 99; f.startAttack(99, g); f.attack = 'sweep'; f.attackT = 0; };
  const summarise = (rows) => {
    const s = rows.map((r) => r.sat), l = rows.map((r) => r.lum);
    const low = rows.filter((r) => r.sat < 0.18);
    return { sat: `${Math.min(...s).toFixed(2)}..${Math.max(...s).toFixed(2)}`, lum: `${Math.min(...l).toFixed(2)}..${Math.max(...l).toFixed(2)}`, paleFrames: low.length, paleWhen: [...new Set(low.map((r) => `${r.st}/${r.atk}/beam${r.beam}`))].join(', ') };
  };
  const out = {};
  // 1. arcade: normal walking (reference)
  setup();
  out.arcadeWalking = summarise(frames(60));
  // 2. arcade: sweep, not shooting
  window.__track = true;
  sweep();
  out.arcadeSweep = summarise(frames(150));
  // 3. arcade: sweep while shooting the right cannon, which breaks during the warning
  __game.foreman.parts.right_cannon.hp = 4;
  window.__fire = 'right_cannon';
  sweep();
  out.arcadeSweepShootBreak = summarise(frames(150));
  window.__fire = 'armour_plate';
  out.arcadeAfterBreakShooting = summarise(frames(120));
  window.__fire = null;
  window.__now = now;
  out.worst = worst;
  return out;
});
const fs = await import('node:fs');
fs.writeFileSync(`tools/out/pale-${tag}-worst.png`, Buffer.from(result.worst.img.split(',')[1], 'base64'));
delete result.worst.img;
console.log('arcade', JSON.stringify(result, null, 1));
// 4. switch to Mecha Pop and back, then sweep again (textures of the old look are freed on switch)
const r2 = await page.evaluate(async () => {
  await __switchStyle();
  let now = window.__now;
  const g = __game, f = g.foreman;
  const gl = __renderer.getContext();
  const out = {};
  const pal = () => {
    // same stats, simple version: count meshes with no texture map (would render plain white/grey)
    const noMap = f.view.meshes.filter((m) => !m.material.map && m.parent?.name !== 'core').map((m) => m.parent?.name);
    return noMap;
  };
  out.mechaMeshesWithoutTexture = pal();
  await __switchStyle();
  out.arcadeAgainMeshesWithoutTexture = pal();
  for (let i = 0; i < 30; i++) (now += 1000 / 60), __frame(now);
  window.__now = now;
  return out;
});
console.log('switching', JSON.stringify(r2));
await page.screenshot({ path: `tools/out/pale-${tag}-after-switch.png` });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
