// How visible is a landed shot? For each hit, compares the screen around the hit point just before the hit with
// 1-6 frames after it (mean colour change, 0..255), against the same measure on frames with no hit (motion noise).
import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'now';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const res = await page.evaluate(async () => {
  const gl = __renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  let now = 1000;
  const V = __game.player.pos.constructor;
  const grab = (p, r = 40) => {
    const s = p.clone().project(__camera);
    const cx = Math.round((s.x + 1) / 2 * W), cy = Math.round((s.y + 1) / 2 * H);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = [];
    for (let y = cy - r; y <= cy + r; y += 2) for (let x = cx - r; x <= cx + r; x += 2) {
      const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
      out.push(buf[i], buf[i + 1], buf[i + 2]);
    }
    return out;
  };
  const change = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const measure = (setup, targetOf, n) => {
    __restart(); now += 1000; __frame(now);
    const g = __game;
    setup(g);
    const hitsSeen = [], noise = [];
    // single shots, well apart: each cycle either fires once or not at all, then waits for everything to fade
    for (let i = 0; i < n; i++) {
      const tgt = targetOf(g);
      if (!tgt) break;
      const fire = i % 2 === 0;
      const before = grab(tgt);
      const hits0 = g.stats.boltHits.part + g.stats.boltHits.hound;
      window.__shoot = fire;
      let peak = 0;
      for (let k = 0; k < 24; k++) {
        now += 1000 / 60; __frame(now);
        window.__shoot = false;
        peak = Math.max(peak, change(before, grab(tgt)));
      }
      const hit = g.stats.boltHits.part + g.stats.boltHits.hound > hits0;
      if (fire && hit) hitsSeen.push(peak);
      if (!fire) noise.push(peak);
      for (let k = 0; k < 30; k++) (now += 1000 / 60), __frame(now);
    }
    const avg = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
    return { hits: hitsSeen.length, hitChange: avg(hitsSeen), noHitChange: avg(noise) };
  };
  const aim = new V();
  const out = {};
  // a hound standing still 7 m in front of Tamsin, shot at steadily
  out.hound = measure((g) => {
    g.phase = 'test'; g.spawnQueue = [];
    g.spawnHound(0);
    const h = g.hounds[0];
    h.place(g.player.pos.x, 0, g.player.pos.z - 7, 0); h.setState('recover'); h.t = -999; h.hp = 999;
    __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; aim.set(h.pos.x, 0.6, h.pos.z); inp.aimTarget = aim; inp.fireHeld = false; if (window.__shoot) inp.firePressed = true; g.player.hp = 100; } };
    for (let i = 0; i < 30; i++) (now += 1000 / 60), __frame(now);
  }, (g) => g.hounds[0] && new V(g.hounds[0].pos.x, 0.6, g.hounds[0].pos.z), 16);
  // the Foreman's armour plate, shot at steadily
  out.foreman = measure((g) => {
    g.phase = 'boss'; g.spawnQueue = []; g.foreman.wake();
    for (let i = 0; i < 200; i++) (now += 1000 / 60), __frame(now);
    const f = g.foreman;
    f.cooldown = 999; f.setState('walk');
    g.player.pos.set(f.pos.x, 0, f.pos.z + 10); g.player.snapshot();
    __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; aim.copy(f.partCenter('armour_plate')); inp.aimTarget = aim; inp.fireHeld = false; if (window.__shoot) inp.firePressed = true; g.player.hp = 100; f.parts.armour_plate.hp = 30; f.cooldown = 999; } };
    for (let i = 0; i < 30; i++) (now += 1000 / 60), __frame(now);
  }, (g) => g.foreman.partCenter('armour_plate'), 16);
  __input.bot = null;
  return out;
});
console.log(JSON.stringify(res));
console.log('sounds asked for:', JSON.stringify(await page.evaluate(() => window.__sfxLog)));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
