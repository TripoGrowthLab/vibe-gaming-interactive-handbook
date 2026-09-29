// Measures how much damage Volt takes in wave 1 for two beginner styles:
// standing still for 30 s, and mashing punch for 10 s (all in game time).
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4181;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function trial(style, seconds, seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/?speed=4&seed=${seed}`);
  await page.waitForFunction(() => window.__game);
  const out = await page.evaluate(({ style, seconds }) => new Promise(res => {
    const g = __game, hits = [];
    g.on('hit', h => { if (h.attacker === g.hero) g.__landed = (g.__landed ?? 0) + 1; if (h.target === g.hero) hits.push({ t: +g.time.toFixed(2), by: h.name, dmg: h.damage }); });
    // The clock starts when the first thug gets within 2 m of Volt.
    let pressT = 0, start = null;
    g.beforeStep = dt => {
      g.input.setVirtualMove({ x: 0, z: 0 });
      if (style === 'rush') {
        // walk into the nearest thug holding its direction, then mash
        const e = g.enemies.filter(e => e.alive).sort((a, b) => Math.abs(a.pos.x - g.hero.pos.x) - Math.abs(b.pos.x - g.hero.pos.x))[0];
        if (e) {
          const dx = e.pos.x - g.hero.pos.x, dz = e.pos.z - g.hero.pos.z;
          g.input.setVirtualMove(Math.abs(dx) > 1 || Math.abs(dz) > 0.3 ? { x: Math.sign(dx), z: Math.sign(dz) * Math.min(1, Math.abs(dz)) } : { x: Math.sign(dx) * 0.2, z: 0 });
        }
      }
      if (start === null && g.enemies.some(e => Math.hypot(e.pos.x - g.hero.pos.x, e.pos.z - g.hero.pos.z) < 2)) start = g.time;
      if (start === null) return;
      if (style !== 'stand' && (pressT -= dt) <= 0) { g.input.press('punch'); pressT = 0.12; }
      if (g.time - start >= seconds || !g.hero.alive) {
        g.beforeStep = null;
        res({ taken: 100 - g.hero.hp + (g.wave > 0 ? 20 : 0), hits: hits.length, alive: g.hero.alive,
              first: hits[0] ? +(hits[0].t - start).toFixed(2) : null, heroHitsLanded: g.__landed ?? 0, enemiesLeft: g.enemies.filter(e => e.alive).length, wave: g.wave + 1 });
      }
    };
  }), { style, seconds });
  await page.close();
  return out;
}

for (const [style, secs] of [['stand', 30], ['mash', 10], ['rush', 10]]) {
  for (let s = 1; s <= 3; s++) {
    const r = await trial(style, secs, s);
    console.log(`${style.padEnd(5)} ${secs}s run ${s}: took ${r.taken} damage from ${r.hits} hits, first hit at ${r.first}s, alive=${r.alive}, wave ${r.wave}, enemies left ${r.enemiesLeft}, Volt landed ${r.heroHitsLanded}`);
  }
}
await browser.close();
server.kill();
