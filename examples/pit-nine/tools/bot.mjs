// Plays full rounds with the in-game bot (?bot=1) in the installed Google Chrome and reports what happened.
// Usage: node tools/bot.mjs [rounds] [speed] [1|clumsy]   (needs `npm run preview` on port 4173)
import { chromium } from 'playwright-core';
const rounds = Number(process.argv[2] || 1);
const speed = Number(process.argv[3] || 3);
const mode = process.argv[4] || '1'; // '1' = sharp bot, 'clumsy' = more like a person
const url = `http://localhost:4291/?bot=${mode}&speed=${speed}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const results = [];
for (let r = 0; r < rounds; r++) {
  let shotBoss = false;
  let maxTokens = 0;
  const t0 = Date.now();
  while (true) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ phase: __game.phase, fstate: __game.foreman.state, tokens: __game.tokens.maxSeen, t: __game.time }));
    maxTokens = Math.max(maxTokens, s.tokens);
    if (!shotBoss && s.fstate === 'attack') {
      await page.screenshot({ path: `tools/out/bot-boss-${r}.png` });
      shotBoss = true;
    }
    if (s.phase === 'won' || s.phase === 'lost') break;
    if (Date.now() - t0 > 8 * 60 * 1000) {
      console.log('timeout, state:', s);
      break;
    }
  }
  await page.screenshot({ path: `tools/out/bot-end-${r}.png` });
  const stats = await page.evaluate(() => ({ ...__game.stats, hp: __game.player.hp, parts: Object.fromEntries(Object.entries(__game.foreman.parts).map(([k, v]) => [k, v.hp])) }));
  stats.maxAttackTokensInUse = maxTokens;
  results.push(stats);
  console.log(`ROUND ${r + 1}: ${JSON.stringify(stats)}`);
  // restart with the R key and check the round really starts over
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ phase: __game.phase, hp: __game.player.hp, foreman: __game.foreman.state, t: __game.time, endShown: document.getElementById('end').classList.contains('show') }));
  console.log(`after restart: ${JSON.stringify(after)}`);
}
const won = results.filter((r) => r.result === 'won').length;
console.log(`SUMMARY: ${won}/${results.length} won`);
console.log(errors.length ? `CONSOLE:\n${[...new Set(errors)].join('\n')}` : 'no console errors or warnings');
await browser.close();
