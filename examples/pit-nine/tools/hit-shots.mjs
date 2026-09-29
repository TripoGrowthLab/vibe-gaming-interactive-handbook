// Screenshots a moment just after shots land: on the Foreman's armour plate, and on a hound.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const shots = await page.evaluate(() => {
  let now = 1000;
  const out = {};
  const V = __game.player.pos.constructor;
  const aim = new V();
  const runUntilHit = (count) => {
    const g = __game;
    const h0 = g.stats.boltHits.part + g.stats.boltHits.hound;
    for (let i = 0; i < 400; i++) {
      now += 1000 / 60; __frame(now);
      if (g.stats.boltHits.part + g.stats.boltHits.hound >= h0 + count) break;
    }
    now += 1000 / 60; __frame(now);
    return __renderer.domElement.toDataURL('image/png');
  };
  // Foreman
  __restart(); now += 1000; __frame(now);
  let g = __game;
  g.phase = 'boss'; g.spawnQueue = []; g.foreman.wake();
  for (let i = 0; i < 200; i++) (now += 1000 / 60), __frame(now);
  const f = g.foreman;
  g.player.pos.set(f.pos.x + 2, 0, f.pos.z + 10); g.player.snapshot();
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; aim.copy(f.partCenter('armour_plate')); inp.aimTarget = aim; inp.fireHeld = true; g.player.hp = 100; f.cooldown = 999; f.parts.armour_plate.hp = 30; } };
  out.foreman = runUntilHit(3);
  // hound
  __restart(); now += 1000; __frame(now);
  g = __game;
  g.phase = 'test'; g.spawnQueue = [];
  g.spawnHound(0);
  const h = g.hounds[0];
  h.place(g.player.pos.x + 1, 0, g.player.pos.z - 6, 0); h.setState('recover'); h.t = -999; h.hp = 999;
  __input.bot = { poll: (inp) => { inp.move.x = inp.move.z = 0; aim.set(h.pos.x, 0.6, h.pos.z); inp.aimTarget = aim; inp.fireHeld = true; g.player.hp = 100; } };
  for (let i = 0; i < 30; i++) (now += 1000 / 60), __frame(now);
  out.hound = runUntilHit(2);
  __input.bot = null;
  return out;
});
for (const [k, v] of Object.entries(shots)) fs.writeFileSync(`tools/out/hit-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
await browser.close();
