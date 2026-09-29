// Sets up each new move on purpose (game logic only) and checks it works.
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4196;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&look=greybox&seed=4`);
await page.waitForFunction(() => window.__steps);
const results = await page.evaluate(() => {
  const g = __game, out = [];
  const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  // a quiet arena: no arrivals, no turns unless a test sets one
  const setup = () => {
    g.reset(); g.spawnQueue = ['__none__']; g.nextArrival = 1e9;
    g.turns.update = () => {}; g.turns.holder = null;
    g.hero.pos.set(0, 0, 0); g.hero.facing = 1; g.hero.hp = 100;
    __steps(1);
  };
  const place = (kind, x, z, hp = 500) => {
    const e = __spawn(kind, Math.sign(x) || 1, z); e.entering = false; e.pos.set(x, 0, z); e.prevPos.copy(e.pos);
    e.hp = e.maxHp = hp; e.cooldown = 1e9; e.side = Math.sign(x - g.hero.pos.x) || 1; e.facing = -e.side; return e;
  };
  // a target dummy: knockback and hit freezes still work, but it does not walk around
  const dummy = e => { e.update = function (dt) { this.tick(dt); }; return e; };
  const hitsOn = () => { const log = []; g.on('hit', h => log.push({ by: h.attacker === g.hero ? 'Volt' : h.attacker.kind, on: h.target === g.hero ? 'Volt' : h.target.kind + '#' + h.target.id, name: h.name })); return log; };
  const run = (secs, each) => { for (let i = 0; i < secs * 60; i++) { each?.(i); __steps(1); } };

  // 2b. letting go of run, then pressing J, is a normal jab (not a running punch)
  setup(); dummy(place('thug_skinny', 3.0, 0));
  g.input.setVirtualMove({ x: 1, z: 0, run: true }); run(0.2);
  g.input.setVirtualMove({ x: 0, z: 0 }); __steps(1); g.input.press('punch');
  let name2b = null; run(0.5, () => { name2b ??= g.hero.attack?.name; });
  check('J just after letting go of run is a normal jab', name2b === 'jab', name2b);
  g.input.setVirtualMove(null);

  // 1. J, J, K: jab, cross, then the sweeping kick hits both Sprats in front
  setup(); let log = hitsOn();
  const a1 = dummy(place('thug_skinny', 0.75, -0.3)), a2 = dummy(place('thug_skinny', 0.95, 0.5));   // side by side in depth
  const seen = [];
  run(2.5, i => { if (g.hero.attack && seen[seen.length - 1] !== g.hero.attack.name) { seen.push(g.hero.attack.name); }
    if (i === 0 || i === 14) g.input.press('punch'); if (i === 28) g.input.press('kick'); a1.pos.x = Math.max(a1.pos.x, 0.7); });
  const kickHits = log.filter(h => h.name === 'combo_kick').map(h => h.on);
  check('J, J, K plays jab > cross > combo kick', seen.join('>') === 'jab>cross>combo_kick', seen.join(' > '));
  check('the combo kick sweeps: hits both Sprats side by side in front', kickHits.length === 2, kickHits.join(', '));

  // 2. running punch: charges in from 2.4 m and lands
  setup(); log = hitsOn();
  const b = dummy(place('thug_skinny', 3.0, 0));
  g.input.setVirtualMove({ x: 1, z: 0, run: true }); run(0.2);
  const x0 = g.hero.pos.x; g.input.press('punch');          // pressed while still running
  let name2 = null; run(1, i => { if (i === 1) g.input.setVirtualMove({ x: 0, z: 0 }); name2 ??= g.hero.attack?.name; });
  check('J while running is the dash hook, carries Volt forward and lands', name2 === 'dash_hook' && g.hero.pos.x - x0 > 0.8 && log.some(h => h.name === 'dash_hook'),
    `${name2}, moved ${(g.hero.pos.x - x0).toFixed(2)} m, hits: ${log.map(h => h.name).join(',')}`);
  g.input.setVirtualMove(null);

  // 3. flying kick through two Sprats
  setup(); log = hitsOn();
  dummy(place('thug_skinny', 2.6, -0.3)); dummy(place('thug_skinny', 2.75, 0.5));   // side by side in depth
  g.input.setVirtualMove({ x: 1, z: 0, run: true }); run(0.15);
  g.input.press('kick');                                   // pressed while still running
  let name3 = null; run(1.2, i => { if (i === 1) g.input.setVirtualMove({ x: 0, z: 0 }); name3 ??= g.hero.attack?.name; });
  const fk = log.filter(h => h.name === 'flying_kick');
  check('K while running is the flying kick and hits both Sprats side by side', name3 === 'flying_kick' && fk.length === 2, `${name3}, hits ${fk.length}`);
  g.input.setVirtualMove(null);

  // 3b. running attacks launch only sometimes (launchChance 0.5)
  for (const [key, name] of [['punch', 'dash_hook'], ['kick', 'flying_kick']]) {
    let launched = 0, grounded = 0, far = [], near = [], followUpOk = 0, n = 40;
    for (let k = 0; k < n; k++) {
      setup(); const t = dummy(place('thug_skinny', 2.4, 0)); let hit = null;   // within the charge's reach
      g.on('hit', h => { if (h.target === t && h.name === name) hit = h; });
      g.input.setVirtualMove({ x: 1, z: 0, run: true }); run(0.1); g.input.press(key);
      let x0 = null; run(1.4, i => { if (i === 1) g.input.setVirtualMove({ x: 0, z: 0 }); if (hit && x0 === null) x0 = t.pos.x; });
      g.input.setVirtualMove(null);
      if (!hit) continue;
      const slid = t.pos.x - x0;
      if (hit.launched) { launched++; far.push(slid); } else { grounded++; near.push(slid); if (hit.def.recover === 0) followUpOk++; }
    }
    const fmt = a => a.length ? `${Math.min(...a).toFixed(2)}-${Math.max(...a).toFixed(2)} m` : '-';
    check(`${name}: sends the target flying only sometimes`, launched >= n * 0.25 && grounded >= n * 0.25 && launched + grounded === n,
      `${launched} of ${n} launched, ${grounded} not`);
    check(`${name}: launched ones fly far, the others slide a little and can be comboed at once`,
      Math.min(...far) > 1.5 && Math.max(...near) < 0.6 && followUpOk === grounded,
      `launched slid ${fmt(far)}, not launched slid ${fmt(near)}`);
  }

  // 4. bowling: a hooked Sprat knocks over the one behind it
  setup(); log = hitsOn();
  const c1 = dummy(place('thug_skinny', 0.7, 0)), c2 = dummy(place('thug_skinny', 1.9, 0));
  g.hero.comboStep = 2; g.hero.comboGrace = 1; g.input.press('punch');
  run(1.2);
  const bump = log.find(h => h.name === 'bump');
  check('a Sprat hit by the hook knocks over the one behind it ("BONK!")', bump && bump.on === 'thug_skinny#' + c2.id, JSON.stringify(log.map(h => h.name + '>' + h.on)));

  // 5. crate: a punch breaks it, food appears, eating it heals 15
  setup(); let crates = 0, healed = 0; g.on('crate', () => crates++); g.on('food', hp => healed += hp);
  g.hero.pos.set(4.1, 0, -2.9); g.hero.hp = 50; g.input.press('punch'); run(0.6);
  const foodAt = g.pickups[0]?.pos.clone();
  check('a punch breaks the crate and food drops', crates === 1 && foodAt, `crates ${crates}, food at ${foodAt?.toArray().map(v => v.toFixed(1))}`);
  if (foodAt) { g.hero.pos.set(foodAt.x - 0.3, 0, foodAt.z); run(0.1); }
  check('eating the food heals 15', healed === 15 && g.hero.hp === 65, `healed ${healed}, hp ${g.hero.hp}`);
  const solidGone = !g.solids.some(s => s.minX < 5 && s.maxX > 5 && s.minZ < -3.4 && s.maxZ > -3.4);
  check('the broken crate no longer blocks the way', solidGone, '');
  g.reset();
  check('crates come back on restart', g.props.filter(p => p.breakable && !p.broken).length === 3 && g.pickups.length === 0, '');

  // 6. Sprat dash: "!" then runs in and jabs
  setup(); log = hitsOn(); let states = [];
  const d = place('thug_skinny', 4, 0); d.cooldown = 0; g.turns.holder = d; d.onTurnGiven(); d.specialRoll = 0;
  run(2.5, () => { if (states[states.length - 1] !== d.state) states.push(d.state); });
  check('Sprat dash: warns, runs in, jabs', states.join('>').replace(/^idle>/, '').startsWith('windup>walk>attack') && log.some(h => h.name === 'sprat_jab'), states.join(' > '));

  // 7. Slab belly charge: warns, charges, hits Volt standing still
  setup(); log = hitsOn(); states = [];
  const s = place('thug_fat', 4, 0); s.cooldown = 0; g.turns.holder = s; s.onTurnGiven(); s.specialRoll = 0;
  run(2.5, () => { if (states[states.length - 1] !== s.state) states.push(s.state); });
  check('Slab charge: warns, charges, hits', states.join('>').replace(/^idle>/, '').startsWith('windup>attack') && log.some(h => h.name === 'slab_charge' && h.on === 'Volt'), states.join(' > ') + ' | ' + log.map(h => h.name).join(','));

  // 8. Slab charge can be sidestepped
  setup(); log = hitsOn();
  const s2 = place('thug_fat', 4, 0); s2.cooldown = 0; g.turns.holder = s2; s2.onTurnGiven(); s2.specialRoll = 0;
  run(2.5, i => { if (s2.state === 'windup' || s2.attack?.name === 'slab_charge') g.input.setVirtualMove({ x: 0, z: 1 }); else g.input.setVirtualMove({ x: 0, z: 0 }); });
  g.input.setVirtualMove(null);
  check('Slab charge misses if Volt sidesteps', !log.some(h => h.name === 'slab_charge'), log.map(h => h.name).join(','));

  // 9. Big Anvil bull charge ends in a haymaker
  setup(); log = hitsOn(); states = [];
  const bo = place('boss', 5, 0); bo.cooldown = 0; g.turns.holder = bo; bo.onTurnGiven(); bo.specialRoll = 0;
  run(3, () => { if (states[states.length - 1] !== bo.state) states.push(bo.state); });
  check('Big Anvil bull charge: warns, charges, haymaker', states.join('>').replace(/^idle>/, '').startsWith('windup>charge>attack') && log.some(h => h.name === 'anvil_haymaker'), states.join(' > '));

  // 10. Big Anvil combo: haymaker straight into stomp kick
  setup(); log = hitsOn(); g.hero.hp = 1000;
  const bc = place('boss', 1.3, 0); g.turns.holder = bc; bc.onTurnGiven(true); bc.engaged = true;
  bc.throw('anvil_haymaker', null); bc.comboNext = 'anvil_kick';
  const atk = []; run(3, () => { if (bc.attack && atk[atk.length - 1] !== bc.attack.name) atk.push(bc.attack.name); });
  check('Big Anvil combo: haymaker then stomp kick', atk.join('>') === 'anvil_haymaker>anvil_kick', atk.join(' > '));

  // 11. Big Anvil roar at half health calls a Sprat
  setup(); const moves = []; g.on('move', m => moves.push(m.name));
  const br = place('boss', 3, 0); br.hp = br.maxHp * 0.45; g.nextArrival = 0; g.spawnQueue = [];
  const before = g.enemies.length; run(2.5);
  check('Big Anvil roars below half health and a Sprat arrives', moves.includes('anvil_summon') && g.enemies.some(e => e.kind === 'thug_skinny'), `moves ${moves.join(',')}, enemies ${g.enemies.map(e => e.kind).join(',')}`);

  // 12. Sprat hop: after light hits a Sprat sometimes hops back (30%)
  let hops = 0, tries = 0;
  for (let k = 0; k < 20; k++) {
    setup(); const h = place('thug_skinny', 0.75, 0); tries++;
    g.input.press('punch'); let hopped = false, x0 = null;
    run(0.9, () => { if (h.state === 'hop') { hopped = true; x0 ??= h.pos.x; } });
    if (hopped) hops++;
  }
  check('Sprat hops back out of a combo sometimes', hops > 0 && hops < tries, `${hops} of ${tries} jabs`);

  // 13. Sprat feint: starts a jab, stops without hitting, then jabs for real
  let feints = 0, landedAfter = 0;
  for (let k = 0; k < 20; k++) {
    setup(); log = hitsOn(); const f = place('thug_skinny', 0.8, 0); f.cooldown = 0; g.turns.holder = f; f.onTurnGiven(true); f.engaged = true;
    let sawFeint = false; g.hero.hp = 1000;
    run(2, () => { if (f.attack?.feint) sawFeint = true; });
    if (sawFeint) { feints++; if (log.some(h => h.name === 'sprat_jab')) landedAfter++; }
  }
  check('Sprat feints sometimes, then jabs for real', feints > 0 && landedAfter === feints, `${feints} feints of 20 turns, real jab after ${landedAfter}`);
  return out;
});
let bad = 0;
for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`); }
process.exitCode = bad ? 1 : 0;
await browser.close(); server.kill();
