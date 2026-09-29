// Counts Sprat double jabs and Slab rushes over a bot-played round.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4186;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/?manual=1&bot=1&seed=78&look=greybox`);
await page.waitForFunction(() => window.__game.beforeStep);
const r = await page.evaluate(() => {
  const g = __game; let t = 1000; let doubles = 0, rushes = 0, sprat = 0, slabTurns = 0, spratTurns = 0, last = null, attacksThisTurn = 0;
  for (let i = 0; i < 60 * 200 && !g.result; i++) {
    __frame(t += 1000 / 60);
    const h = g.turns.holder;
    if (h !== last) {                 // a new turn starts
      if (h && h.kind === 'thug_fat') { slabTurns++; if (h.rush) rushes++; }
      if (h && h.kind === 'thug_skinny') spratTurns++;
      last = h; attacksThisTurn = 0;
    }
    if (h && h.kind === 'thug_skinny' && h.state === 'attack' && h.attack.t === 0) { sprat++; if (++attacksThisTurn === 2) doubles++; }
  }
  return { result: g.result, spratTurns, spratAttacks: sprat, doubleJabTurns: doubles, slabTurns, slabRushes: rushes };
});
console.log(JSON.stringify(r));
await browser.close(); server.kill();
