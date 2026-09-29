// Armor check: Volt hits an enemy with each attack, while it swings and while it stands.
// Expected: Slab and Big Anvil are never staggered by jab or cross (their swing goes on and still
// lands); hook and kick stop them; a Sprat (no armor) is staggered by everything.
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4194;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&look=greybox&seed=9`);
await page.waitForFunction(() => window.__steps);
const rows = await page.evaluate(() => {
  const g = __game, out = [];
  for (const kind of ['thug_skinny', 'thug_fat', 'boss']) {
    for (const swinging of [true, false]) for (const [press, name] of [['punch', 'jab'], ['punch', 'cross'], ['punch', 'hook'], ['kick', 'kick']]) {
      g.reset(); g.spawnQueue = ['__none__']; g.nextArrival = 1e9; g.turns.update = () => {};
      __steps(2);
      // spawn the enemy right in front of Volt, facing him
      const e = window.__spawn(kind);
      e.entering = false; e.hp = e.maxHp = 1000; e.side = 1;
      const ATT = { thug_skinny: 'sprat_jab', thug_fat: 'slab_swing', boss: 'anvil_haymaker' }[kind];
      e.pos.set(g.hero.radius + e.radius + 0.1, 0, 0); e.prevPos.copy(e.pos); e.facing = -1;
      g.hero.pos.set(0, 0, 0); g.hero.facing = 1; g.hero.hp = 1e6;
      // set up the combo step so the chosen punch comes out
      g.hero.comboStep = { jab: 0, cross: 1, hook: 2, kick: 0 }[name]; g.hero.comboGrace = name === 'jab' || name === 'kick' ? 0 : 1;
      g.turns.holder = e; e.onTurnGiven(true);
      // Volt attacks first; the enemy starts its swing 0.08 s before Volt's blow lands,
      // so the blow always meets a swing in progress.
      g.input.press(press);
      __steps(1);
      const a = g.hero.attack, landsIn = a.def.hit[0] * a.dur - a.t;
      __steps(Math.max(0, Math.round((landsIn - 0.08) * 60)));
      if (swinging) e.startAttack(ATT); else e.cooldown = 1e9;
      let hitAt = null, stateAfter = null, swingLanded = false, thrown = a.name;
      g.on('hit', h => { if (h.attacker === g.hero && h.target === e && hitAt === null) { hitAt = g.time; } if (h.attacker === e && h.target === g.hero) swingLanded = true; });
      for (let i = 0; i < 200; i++) {
        __steps(1);
        if (g.hero.attack && !thrown) thrown = g.hero.attack.name;
        if (hitAt !== null && stateAfter === null && e.freeze <= 0) stateAfter = e.state;
      }
      out.push({ kind, swinging, attack: thrown, hit: hitAt !== null, enemyStateAfterHit: stateAfter, enemySwingLanded: swingLanded });
    }
  }
  return out;
});
const expectKeep = (k, a) => (k !== 'thug_skinny') && (a === 'jab' || a === 'cross');
let bad = 0;
for (const r of rows) {
  const kept = r.swinging ? r.enemyStateAfterHit === 'attack' : r.enemyStateAfterHit !== 'hurt';
  const ok = r.hit && kept === expectKeep(r.kind, r.attack);
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.kind.padEnd(12)} hit ${r.swinging ? 'mid-swing' : 'standing'} by ${String(r.attack).padEnd(5)}: ${r.hit ? '' : 'NO HIT, '}${kept ? (r.swinging ? 'keeps swinging' + (r.enemySwingLanded ? ', its swing still lands' : ', its swing missed') : 'not staggered (' + r.enemyStateAfterHit + ')') : 'staggered (' + r.enemyStateAfterHit + ')'}`);
}
process.exitCode = bad ? 1 : 0;
await browser.close(); server.kill();
