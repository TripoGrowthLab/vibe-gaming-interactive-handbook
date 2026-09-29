// Plays many bot rounds fast (game logic only, no drawing) and reports, per seed:
// result, time, health left, and how often an enemy left the fight while it was still going on
// (it gave up the turn within 1 s of a blow being thrown or landed).
// Usage: node tools/balance.mjs [rounds=20] [firstSeed=1]
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const [N = 20, first = 1] = process.argv.slice(2).map(Number);
const PORT = 4188;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const rows = [];
for (let i = 0; i < N; i++) {
  const seed = (first + i) * 7919;
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('page error', e.message));
  await page.goto(`http://localhost:${PORT}/?manual=1&bot=1&seed=${seed}&look=greybox`);
  await page.waitForFunction(() => window.__game?.beforeStep);
  const r = await page.evaluate(() => {
    const g = __game;
    let lastHolder = null, walkAways = 0, turnEnds = 0, lastBlow = -99, runs = 0, prevHeroState = null, wave = -1; const waveTaken = [];
    const w4 = {}; g.on('hit', h => { if (h.target === g.hero) { waveTaken[g.wave] = (waveTaken[g.wave] ?? 0) + h.damage; if (g.wave === 3) w4[h.name] = (w4[h.name] ?? 0) + h.damage; } });
    g.on('hit', h => { lastBlow = g.time; });
    while (g.time < 400 && !window.__botReport.done) {
      __steps(1);
      const h = g.turns.holder;
      if (h && h.state === 'attack') lastBlow = g.time;
      if (lastHolder && h !== lastHolder && lastHolder.alive && !lastHolder.removed) {
        turnEnds++;
        if (g.time - lastBlow < 1.0) walkAways++;
      }
      lastHolder = h;
      if (g.hero.state === 'run' && prevHeroState !== 'run') runs++;
      prevHeroState = g.hero.state;
    }
    const rep = window.__botReport;
    return { result: rep.result ?? 'STUCK', time: +g.time.toFixed(0), wave: g.wave + 1, hp: g.hero.hp, taken: rep.damageTaken,
      turnEnds, walkAways, runs, ends: g.turns.ends, w4, heroHits: window.__botReport.heroHits, enemyMoves: window.__botReport.enemyMoves, enemyAttacks: window.__botReport.enemyAttacks, enemyKinds: window.__botReport.enemyKinds, crates: window.__botReport.cratesBroken, food: window.__botReport.healedByFood, waveTaken: [0, 1, 2, 3].map(w => waveTaken[w] ?? 0), maxAttacking: rep.maxEnemiesAttackingAtOnce, doubleHits: rep.doubleHitViolations };
  });
  rows.push({ seed, ...r });
  (globalThis.__all ??= []).push(r);
  console.log(`seed ${String(seed).padStart(6)}: ${r.result.padEnd(5)} ${String(r.time).padStart(3)}s wave ${r.wave} hp ${String(r.hp).padStart(3)} taken ${String(r.taken).padStart(3)} | turns ended ${r.turnEnds}, mid-fight ${r.walkAways} | per wave taken ${r.waveTaken.join('/')} | Volt ${JSON.stringify(r.heroHits)} | enemy moves ${JSON.stringify(r.enemyMoves)} | crates ${r.crates}, food +${r.food} | runs ${r.runs} | max attacking ${r.maxAttacking}, double hits ${r.doubleHits}`);
  await page.close();
}
const wins = rows.filter(r => r.result === 'win');
console.log(`\n${wins.length}/${rows.length} won, ${rows.filter(r => r.result === 'lose').length} lost, ${rows.filter(r => r.result === 'STUCK').length} stuck; ` +
  `hp left when won: ${wins.map(r => r.hp).sort((a, b) => a - b).join(' ')}; mid-fight turn ends: ${rows.reduce((a, r) => a + r.walkAways, 0)} of ${rows.reduce((a, r) => a + r.turnEnds, 0)}`);
// totals: enemy kinds met, attacks thrown per kind, special moves
const sum = (list, key) => list.reduce((acc, r) => { for (const [k, v] of Object.entries(r[key] ?? {})) {
  if (typeof v === 'object') { acc[k] ??= {}; for (const [n, c] of Object.entries(v)) acc[k][n] = (acc[k][n] ?? 0) + c; } else acc[k] = (acc[k] ?? 0) + v; } return acc; }, {});
console.log('enemies met (all rounds):', JSON.stringify(sum(rows, 'enemyKinds')));
console.log('enemy attacks thrown (all rounds):', JSON.stringify(sum(rows, 'enemyAttacks')));
console.log('enemy special moves (all rounds):', JSON.stringify(sum(rows, 'enemyMoves')));
const ends = {}; for (const r of rows) for (const [k, v] of Object.entries(r.ends)) ends[k] = (ends[k] ?? 0) + v;
console.log('why the enemy fighting Volt stopped fighting (all rounds):', JSON.stringify(ends));
await browser.close(); server.kill();
