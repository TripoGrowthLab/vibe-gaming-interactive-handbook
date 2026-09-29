// What each kind of enemy does when Volt just stands there (he cannot be knocked out):
// one minute in each wave, counting attacks (including follow-ups) and special moves per kind.
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4199;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&look=greybox&seed=12`);
await page.waitForFunction(() => window.__steps);
const res = await page.evaluate(() => {
  const g = __game, out = [];
  for (let w = 0; w < 4; w++) {
    g.reset(); g.enemies.forEach(e => e.remove()); g.enemies = []; g.wave = w - 1; g.nextWave();
    g.input.setVirtualMove({ x: 0, z: 0 });
    const attacks = {}, moves = {}, kinds = {}; let followUps = 0;
    g.on('move', ({ name, enemy }) => { if (name === 'follow_up') followUps++; else { const k = (moves[enemy.kind] ??= {}); k[name] = (k[name] ?? 0) + 1; } });
    for (let i = 0; i < 60 * 60; i++) {
      g.hero.hp = 100;
      __steps(1);
      for (const e of g.enemies) {
        kinds[e.kind] = true;
        if (e.attack && e.attack !== e.__last) { e.__last = e.attack; const k = (attacks[e.kind] ??= {}); k[e.attack.name] = (k[e.attack.name] ?? 0) + 1; }
      }
    }
    out.push({ wave: w + 1, kinds: Object.keys(kinds), attacks, moves, followUps });
  }
  g.input.setVirtualMove(null);
  return out;
});
for (const r of res) {
  console.log(`wave ${r.wave}: enemies ${r.kinds.join(', ')}; follow-ups ${r.followUps}`);
  for (const k of r.kinds) console.log(`   ${k.padEnd(13)} attacks ${JSON.stringify(r.attacks[k] ?? {})}  specials ${JSON.stringify(r.moves[k] ?? {})}`);
}
await browser.close(); server.kill();
