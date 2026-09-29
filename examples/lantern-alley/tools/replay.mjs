// Replays one bot round as fast as possible (frames driven by the script, 60 Hz game time)
// and prints what is going on every N seconds, to find where a round gets stuck.
// Usage: node tools/replay.mjs <seed> [look] [maxSeconds] [logEvery]
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const [seed = 15838, look = 'greybox', maxS = 400, every = 20] = process.argv.slice(2);
const PORT = 4187;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&bot=1&seed=${seed}&look=${look}`);
await page.waitForFunction(() => window.__game?.beforeStep);
const log = await page.evaluate(({ maxS, every }) => {
  const g = __game, out = []; let t = 1000, next = 0;
  const snap = () => `t=${g.time.toFixed(0)}s wave ${g.wave + 1} queue ${g.spawnQueue.length} hero hp ${g.hero.hp} ${g.hero.state} x${g.hero.pos.x.toFixed(1)} z${g.hero.pos.z.toFixed(1)} | holder ${g.turns.holder ? g.turns.holder.kind + '#' + g.turns.holder.id : '-'} | ` +
    g.enemies.map(e => `${e.kind === 'thug_skinny' ? 'Sprat' : e.kind === 'thug_fat' ? 'Slab' : 'Anvil'}#${e.id} ${e.state}${e.entering ? '(entering)' : ''} hp${e.hp} x${e.pos.x.toFixed(1)} z${e.pos.z.toFixed(1)} cd${e.cooldown.toFixed(1)}`).join(', ');
  while (g.time < maxS && !window.__botReport.done) {
    __steps(60);
    if (g.time >= next) { out.push(snap()); next += every; }
  }
  out.push('END ' + snap());
  out.push(JSON.stringify({ result: window.__botReport.result, hits: window.__botReport.heroHits, taken: window.__botReport.heroHitsTaken }));
  return out;
}, { maxS: +maxS, every: +every });
console.log(log.join('\n'));
await browser.close(); server.kill();
