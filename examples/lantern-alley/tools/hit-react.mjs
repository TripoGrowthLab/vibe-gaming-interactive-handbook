// Mashes J at a Sprat, then a Slab, standing in front of Volt (models, 60 Hz frames), and measures, for every
// hit that lands, how far the Sprat's head moves (relative to its body position) in the 0.3 s
// after the hit. A clearly visible reaction moves the head at least 8 cm.
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4189;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&seed=5`);
await page.evaluate(() => window.__modelsReady);
for (const kind of ['thug_skinny', 'thug_fat']) {
const res = await page.evaluate(kind => {
  const g = __game; let t = window.__t ?? 1000;
  const frame = () => __frame(t += 1000 / 60);
  g.reset(); g.spawnQueue = ['__none__']; g.nextArrival = 1e9; g.turns.update = () => {};
  for (let i = 0; i < 5; i++) frame();
  // put the enemy in front of Volt and keep it there
  const e = window.__spawn(kind);
  e.entering = false; e.hp = e.maxHp = 1000; e.cooldown = 1e9;
  const place = () => { e.pos.set(1.0, 0, 0); e.prevPos.copy(e.pos); g.hero.pos.set(0, 0, 0); g.hero.prevPos.copy(g.hero.pos); g.hero.facing = 1; };
  place(); for (let i = 0; i < 30; i++) { place(); frame(); }
  let head = null; e.visual.model?.traverse(o => { if (!head && o.isBone && /Head$/.test(o.name)) head = o; });
  // head position relative to the character's own position (so sliding back does not count)
  const hp = () => head ? head.getWorldPosition(head.position.clone()).sub(e.node.position) : null;
  const hits = [];
  g.on('hit', h => { if (h.target === e) hits.push({ name: h.name, at: g.time, start: hp(), maxMove: 0, t8: null }); });
  let press = 0;
  for (let i = 0; i < 60 * 4; i++) {
    if (--press <= 0 && i < 60 * 3) { g.input.press('punch'); press = 7; }     // ~8.5 presses a second
    frame();
    e.pos.x = 1.0; e.kb = null;                    // hold it in front of Volt (no knockback)
    for (const h of hits) if (g.time - h.at <= 0.3 && h.start) { const d = hp().distanceTo(h.start); h.maxMove = Math.max(h.maxMove, d); if (h.t8 === null && d >= 0.08) h.t8 = g.time - h.at; }
  }
  window.__t = t;
  return { look: e.visual.look, hits: hits.map(h => ({ name: h.name, headMoveCm: Math.round(h.maxMove * 100), t8: h.t8 })), states: e.state };
}, kind);
console.log(`${kind} (${res.look}): hits landed: ${res.hits.length}`);
for (const h of res.hits) console.log(`  ${h.name.padEnd(6)} head moved ${String(h.headMoveCm).padStart(3)} cm in 0.3 s, visible (8 cm) after ${h.t8 === null ? 'never' : h.t8.toFixed(2) + ' s'}`);
}
await browser.close(); server.kill();
