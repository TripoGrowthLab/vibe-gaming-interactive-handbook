// Checks each game-feel rule directly, driving frames by hand (?manual) in the installed Google Chrome.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4291/?manual' + (process.env.GREYBOX ? '&greybox' : ''));
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(300);

const results = await page.evaluate(() => {
  const R = [];
  const ok = (name, pass, detail) => R.push({ name, pass: !!pass, detail });
  let now = 0;
  const frames = (n, hz) => { for (let i = 0; i < n; i++) { now += 1000 / hz; __frame(now); } };
  const run = (sec) => frames(Math.round(sec * 60), 60);
  const fresh = () => { __restart(); now += 1000; __frame(now); return __game; };
  const I = __input;

  // 1. smooth motion at 60 and 120 Hz: how far the drawn player moves each frame
  for (const hz of [60, 120, 144]) {
    const g = fresh();
    g.phase = 'test';
    // walk straight up the open middle of the arena
    const bot = { poll: (inp) => { inp.move.x = 0; inp.move.z = -1; } };
    I.bot = bot;
    frames(hz, hz); // 1 s to reach full speed
    const xs = [];
    for (let i = 0; i < hz / 2; i++) { frames(1, hz); xs.push(-g.player.view.root.position.z); }
    I.bot = null;
    const d = xs.slice(1).map((x, i) => x - xs[i]);
    const mn = Math.min(...d), mx = Math.max(...d);
    ok(`smooth at ${hz} Hz`, mx - mn < 0.004, `step per frame ${mn.toFixed(4)}..${mx.toFixed(4)} m (ideal ${(6 / hz).toFixed(4)})`);
  }

  // 2. a click during the shot cooldown is queued
  {
    const g = fresh(); g.phase = 'test'; run(0.2);
    const p = g.player;
    I.fireHeld = false; I.firePressed = true; frames(1, 60);
    const shots0 = g.stats.shots; // first shot starts
    run(0.08); I.firePressed = true; // click again while cooling down
    const before = g.stats.shots;
    run(0.3);
    ok('click during cooldown is queued', g.stats.shots === before + 1 && before >= 1, `shots after first click ${before}, after queued click ${g.stats.shots}`);
  }

  // 3. just-hit protection + hit freeze + push-back
  {
    const g = fresh(); g.phase = 'test'; run(0.2);
    const p = g.player;
    const x0 = p.pos.x;
    const a = p.damage(10, { x: 1, z: 0 }, 1.5, 'test', g);
    const stop = g.stop;
    const b = p.damage(10, { x: 1, z: 0 }, 1.5, 'test', g);
    run(0.5);
    ok('player hit: freeze, push, then protected', a && !b && stop > 0.07 && p.pos.x - x0 > 1.2, `first hit ${a}, second hit at once ${b}, freeze ${stop.toFixed(2)} s, pushed ${(p.pos.x - x0).toFixed(2)} m, hp ${p.hp}`);
    run(0.5);
    const c = p.damage(10, { x: 1, z: 0 }, 1.5, 'test', g);
    ok('player can be hit again after 0.8 s', c, `hp ${p.hp}`);
  }

  // 4. roll invulnerability window
  {
    const g = fresh(); g.phase = 'test'; run(0.2);
    const p = g.player;
    I.rollPressed = true; frames(1, 60);
    run(0.2);
    const during = p.damage(10, { x: 1, z: 0 }, 1, 'test', g);
    run(0.3);
    ok('roll dodges hits mid-roll', !during && g.stats.rolls === 1, `hit during roll: ${during}`);
    I.rollPressed = true; frames(1, 60);
    const early = p.state;
    run(0.2); // the early press's 0.15 s memory runs out
    run(Math.max(0, p.rollCooldown - 0.1)); // wait until the cooldown has 0.1 s left
    const left = p.rollCooldown;
    I.rollPressed = true; frames(1, 60); // pressed just before the cooldown ends
    const waited = p.state;
    run(0.12);
    ok('roll pressed just before it is ready still happens', early !== 'roll' && waited !== 'roll' && p.state === 'roll', `pressed with ${left.toFixed(2)} s cooldown left: state ${waited}, 0.12 s later ${p.state}`);
  }

  // 5. hound pounce hits, freezes both, then the hound recovers
  {
    const g = fresh(); g.phase = 'test'; g.spawnQueue = [];
    g.spawnHound(0);
    const h = g.hounds[0];
    h.place(g.player.pos.x, 0, g.player.pos.z - 4, 0);
    h.setState('chase');
    let sawWindup = false, sawPounce = false, stopSeen = 0;
    for (let i = 0; i < 120; i++) { frames(1, 60); sawWindup ||= h.state === 'windup'; sawPounce ||= h.state === 'pounce'; stopSeen = Math.max(stopSeen, g.stop); }
    ok('hound: chase → windup → pounce → hit', sawWindup && sawPounce && g.player.hp < 100, `hp ${g.player.hp}, freeze seen ${stopSeen.toFixed(2)} s, state now ${h.state}`);
    // bolt hit on the hound: short freeze + push back
    const z0 = h.pos.z;
    h.setState('chase'); h.invuln = 0;
    h.damage(1, { x: 0, z: -1 }, g);
    const fr = h.freeze;
    const second = h.hp;
    h.damage(1, { x: 0, z: -1 }, g);
    ok('hound hit: freeze 0.04 s, then protected', fr > 0.03 && h.hp === second, `freeze ${fr.toFixed(3)}, hp after 2 instant hits ${h.hp}`);
  }

  // 6. hounds take turns: never more than one winding up / pouncing
  {
    const g = fresh(); g.phase = 'test'; g.spawnQueue = [];
    for (let i = 0; i < 4; i++) g.spawnHound(i);
    let maxAtk = 0;
    const p = g.player;
    for (let i = 0; i < 60 * 8; i++) {
      frames(1, 60);
      p.hp = 100; // keep the test running
      maxAtk = Math.max(maxAtk, g.hounds.filter((h) => h.state === 'windup' || h.state === 'pounce').length);
    }
    ok('hounds take turns', maxAtk === 1 && g.stats.pounces >= 2, `most attacking at once ${maxAtk}, pounces ${g.stats.pounces}`);
  }

  // 7. every Foreman attack can hurt, and breaking a part removes its attack
  {
    for (const atk of ['volley', 'sweep', 'missiles', 'ram', 'stomp']) {
      const g = fresh(); g.phase = 'test'; g.spawnQueue = [];
      const f = g.foreman; f.setState('walk'); f.pose['upper.py'] = 0;
      run(0.1);
      const p = g.player;
      const far = atk === 'stomp' ? 4.8 : atk === 'ram' ? 9 : atk === 'sweep' ? 8 : 10;
      p.pos.set(f.pos.x, 0, f.pos.z + far); p.snapshot();
      if (atk === 'sweep') { p.pos.x = f.pos.x - 3.2; }
      f.cooldown = 99; f.startAttack(atk === 'stomp' ? 1 : 99, g);
      f.attack = atk; f.attackT = 0;
      for (let i = 0; i < 60 * 3.5; i++) frames(1, 60);
      ok(`Foreman ${atk} hurts`, (g.stats.damageTaken[atk] || 0) > 0, `damage ${g.stats.damageTaken[atk] || 0}`);
    }
    const g = fresh(); g.phase = 'test';
    const f = g.foreman; f.setState('walk');
    const coreBlocked = !f.isTarget('core');
    for (const n of ['left_cannon', 'right_cannon', 'missile_pod', 'armour_plate']) { f.parts[n].invuln = 0; f.damagePart(n, 999, g); run(1.3); }
    ok('breaking parts removes attacks', f.available().length === 0, `attacks left: [${f.available()}]`);
    ok('core only hittable after armour breaks', coreBlocked && f.isTarget('core'), '');
    run(1.3); f.damagePart('core', 999, g); run(3);
    ok('core break → win', g.phase === 'won', `phase ${g.phase}, player ${g.player.state}`);
  }
  return R;
});
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail || ''}`);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
