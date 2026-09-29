// Fight feel, measured on real fights with the models (60 Hz frames):
// Volt waits until the enemy fighting him is close, then the "player" presses J every 0.15 s
// (like mashing) for 6 s. Reports, for every punch that lands:
//  - fist gap: how far Volt's fist is from the enemy's chest when the hit counts (contact ~ 15-20 cm)
//  - the time since the previous hit
// and per fight: chains (hits on the same enemy with no enemy attack in between), full
// jab > cross > hook combos, enemy hits on Volt in between, and punches that hit nothing.
// Usage: node tools/combo-feel.mjs [seeds=3]
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const SEEDS = Number(process.argv[2]) || 3;
const PORT = 4192;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const all = { gaps: [], full: 0, chains: [], counters: 0, whiffs: 0, thrown: 0, intervals: [] };
for (let s = 1; s <= SEEDS; s++) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('page error', e.message));
  await page.goto(`http://localhost:${PORT}/?manual=1&seed=${s * 31}`);
  await page.evaluate(() => window.__modelsReady);
  const r = await page.evaluate(() => {
    const g = __game; let t = window.__t ?? 1000; const frame = () => __frame(t += 1000 / 60);
    g.reset(); g.input.setVirtualMove({ x: 0, z: 0 });
    const bone = (v, n) => { let b = null; v.model?.traverse(o => { if (!b && o.isBone && o.name.endsWith(n)) b = o; }); return b; };
    const hits = [], counters = []; let thrown = 0, whiffs = 0, lastAttack = null, lastHitAt = null;
    const chain = []; const chains = []; let full = 0;
    g.on('hit', h => {
      if (h.attacker === g.hero) {
        const hands = ['LeftHand', 'RightHand'].map(n => bone(g.hero.visual, n)).filter(Boolean).map(b => b.getWorldPosition(b.position.clone()));
        const foot = ['LeftToeBase', 'RightToeBase'].map(n => bone(g.hero.visual, n)).filter(Boolean).map(b => b.getWorldPosition(b.position.clone()));
        const chest = bone(h.target.visual, 'Spine2')?.getWorldPosition(h.target.node.position.clone());
        const limbs = h.name === 'kick' ? foot : hands;
        const gap = chest ? Math.min(...limbs.map(p => Math.hypot(p.x - chest.x, p.z - chest.z))) : NaN;
        hits.push({ name: h.name, gapCm: Math.round(gap * 100), since: lastHitAt === null ? null : +(g.time - lastHitAt).toFixed(2), dist: +Math.abs(h.target.pos.x - g.hero.pos.x).toFixed(2) });
        lastHitAt = g.time;
        const prev = chain[chain.length - 1];
        if (prev && prev.target === h.target) chain.push({ target: h.target, name: h.name });
        else { if (chain.length) chains.push(chain.map(c => c.name)); chain.length = 0; chain.push({ target: h.target, name: h.name }); }
        if (chain.length >= 3 && chain.slice(-3).map(c => c.name).join() === 'jab,cross,hook') full++;
      } else { counters.push(h.name); if (chain.length) chains.push(chain.map(c => c.name)); chain.length = 0; }
    });
    // wait until an enemy engages Volt
    let guard = 0;
    while (guard++ < 60 * 30) { frame(); const h = g.turns.holder; if (h && Math.abs(h.pos.x - g.hero.pos.x) < 1.4 && Math.abs(h.pos.z - g.hero.pos.z) < 0.4) break; }
    let press = 0;
    for (let i = 0; i < 60 * 6; i++) {
      if (--press <= 0) { g.input.press('punch'); press = 9; }
      const before = g.hero.attack;
      frame();
      const a = g.hero.attack;
      const near = g.enemies.some(e => e.alive && !e.entering && Math.hypot(e.pos.x - g.hero.pos.x, e.pos.z - g.hero.pos.z) < 1.6);
      if (a && a !== lastAttack) { if (lastAttack && lastAttack.hits.size === 0 && lastAttack.near) whiffs++; thrown++; lastAttack = a; a.near = near; }
    }
    if (lastAttack && lastAttack.hits.size === 0 && lastAttack.near) whiffs++;
    if (chain.length) chains.push(chain.map(c => c.name));
    window.__t = t;
    return { hits, counters, thrown, whiffs, chains, full };
  });
  console.log(`seed ${s * 31}: ${r.thrown} punches thrown, ${r.hits.length} landed, ${r.whiffs} hit nothing; enemy hits on Volt: ${r.counters.length}; full jab>cross>hook combos: ${r.full}`);
  console.log(`   chains: ${r.chains.map(c => c.join('>')).join(' | ')}`);
  console.log(`   hits: ${r.hits.map(h => `${h.name}(gap ${h.gapCm}cm, dist ${h.dist}m${h.since !== null ? ', +' + h.since + 's' : ''})`).join(' ')}`);
  all.gaps.push(...r.hits.filter(h => h.name !== 'kick').map(h => h.gapCm)); all.full += r.full; all.counters += r.counters.length; all.whiffs += r.whiffs; all.thrown += r.thrown;
  all.chains.push(...r.chains.map(c => c.length)); all.intervals.push(...r.hits.map(h => h.since).filter(x => x !== null && x < 1.5));
  await page.close();
}
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log(`\nALL: fist gap at hit median ${med(all.gaps)} cm (range ${Math.min(...all.gaps)}-${Math.max(...all.gaps)}); punches that hit nothing with an enemy within 1.6 m ${all.whiffs}/${all.thrown}; ` +
  `enemy hits on Volt ${all.counters}; full combos ${all.full}; longest chain ${Math.max(...all.chains)}; median time between hits ${med(all.intervals)} s`);
await browser.close(); server.kill();
