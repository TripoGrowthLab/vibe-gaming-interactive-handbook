// How hard is the start for someone who has never played? Two beginner bots, driven frame by frame:
//   idle    - stands still and never shoots (still reading the controls)
//   shooter - stands still and shoots at the nearest hound, never rolls
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const out = await page.evaluate(() => {
  const lines = [];
  let now = 0;
  for (const mode of ['idle', 'shooter']) {
    __restart(); now += 1000; __frame(now);
    const g = __game;
    const aim = { x: 0, y: 0.6, z: 0 };
    __input.bot = { poll: (inp) => {
      inp.move.x = inp.move.z = 0; inp.fireHeld = false; inp.aimTarget = null;
      if (mode === 'shooter') {
        const hs = g.hounds.filter((h) => h.alive && h.state !== 'spawn');
        if (hs.length) {
          const p = g.player.pos;
          const h = hs.reduce((a, b) => (a.pos.distanceTo(p) < b.pos.distanceTo(p) ? a : b));
          aim.x = h.pos.x; aim.z = h.pos.z; inp.aimTarget = aim; inp.fireHeld = true;
        }
      }
    } };
    const marks = {};
    let firstSeen = null, firstHit = null;
    for (let i = 0; i < 60 * 30 && g.player.alive && g.phase !== 'gap'; i++) {
      now += 1000 / 60; __frame(now);
      const t = g.time;
      if (firstSeen === null && g.hounds.some((h) => { const v = h.view.root.position.clone().project(__camera); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1; })) firstSeen = t;
      if (firstHit === null && g.player.hp < 100) firstHit = t;
      for (const s of [4, 10, 20]) if (marks[s] === undefined && t >= s) marks[s] = 100 - g.player.hp;
    }
    lines.push(`${mode}: first hound on screen at ${firstSeen?.toFixed(1)} s, first hit at ${firstHit?.toFixed(1)} s, damage by 4 s: ${marks[4] ?? '-'}, by 10 s: ${marks[10] ?? '-'}, by 20 s: ${marks[20] ?? '-'}, ` +
      (g.player.alive ? (g.phase === 'gap' ? `cleared wave 1 at ${g.time.toFixed(1)} s with ${g.player.hp} HP` : `alive at 30 s with ${g.player.hp} HP`) : `DEAD at ${g.time.toFixed(1)} s`));
  }
  __input.bot = null;
  return lines.join('\n');
});
console.log(out);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
