// Test bot: plays a round through the same Input as a player (move + punch/kick presses)
// and records what happened in window.__botReport. Loaded only with ?bot=1.
export function startBot(game, input) {
  let seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const newReport = () => ({
    done: false, result: null, time: 0, wavesReached: 1, heroHpLeft: 0,
    heroHits: {}, heroDamage: 0, heroHitsTaken: {}, damageTaken: 0, kos: {},
    maxEnemiesAttackingAtOnce: 0, doubleHitViolations: 0, hitstops: 0, queuedAttacks: 0,
    enemyMoves: {}, enemyAttacks: {}, enemyKinds: {}, cratesBroken: 0, foodEaten: 0, healedByFood: 0,
  });
  let report = window.__botReport = newReport();
  const lastHitAt = new Map();
  window.__botRestart = () => { report = window.__botReport = newReport(); lastHitAt.clear(); };

  game.on('hit', ({ attacker, target, name, def, damage, ko, armored }) => {
    if (armored) report.armoredHits = (report.armoredHits ?? 0) + 1;
    const gap = game.time - (lastHitAt.get(target) ?? -99);
    if (gap < target.cfg.invuln - 1e-6) report.doubleHitViolations++;
    lastHitAt.set(target, game.time);
    if (def.hitstop > 0) report.hitstops++;
    if (attacker === game.hero) {
      report.heroHits[name] = (report.heroHits[name] ?? 0) + 1;
      report.heroDamage += damage;
      if (ko) report.kos[target.kind] = (report.kos[target.kind] ?? 0) + 1;
    } else {
      report.heroHitsTaken[name] = (report.heroHitsTaken[name] ?? 0) + 1;
      report.damageTaken += damage;
    }
  });
  game.on('wave', w => { report.wavesReached = w + 1; });
  game.on('move', ({ name }) => { report.enemyMoves[name] = (report.enemyMoves[name] ?? 0) + 1; });
  game.on('crate', () => { report.cratesBroken++; });
  game.on('food', hp => { report.foodEaten++; report.healedByFood += hp; });
  game.on('end', r => {
    Object.assign(report, { result: r, time: +game.time.toFixed(1), heroHpLeft: game.hero.hp, done: true });
  });

  let pressT = 0, dodge = 0, dodgeDir = 1, prevState = null;
  const judged = new WeakSet();
  game.beforeStep = dt => {
    const hero = game.hero;
    pressT -= dt; dodge -= dt;
    report.maxEnemiesAttackingAtOnce = Math.max(report.maxEnemiesAttackingAtOnce,
      game.enemies.filter(e => e.state === 'attack').length);
    if (prevState === 'attack' && hero.state === 'attack' && hero.attack?.t === 0) report.queuedAttacks++;
    prevState = hero.state;
    for (const e of game.enemies) {
      if (!e.__seen) { e.__seen = true; report.enemyKinds[e.kind] = (report.enemyKinds[e.kind] ?? 0) + 1; }
      if (e.attack && e.attack !== e.__lastAttack) {
        e.__lastAttack = e.attack;
        const k = (report.enemyAttacks[e.kind] ??= {});
        k[e.attack.name] = (k[e.attack.name] ?? 0) + 1;
      }
    }
    if (game.result) { input.setVirtualMove({ x: 0, z: 0 }); return; }

    const foes = game.enemies.filter(e => e.alive && !e.entering);
    // Sometimes see an enemy wind up and step out of the way.
    for (const e of foes) {
      if (e.state !== 'attack' || judged.has(e.attack)) continue;
      judged.add(e.attack);
      const close = Math.abs(e.pos.x - hero.pos.x) < e.attack.def.reach + 0.6 && Math.abs(e.pos.z - hero.pos.z) < 0.9;
      if (close && rng() < 0.5) { dodge = 0.4; dodgeDir = hero.pos.z > 0 ? -1 : 1; }
    }
    // A "!" (dash or charge coming): usually sidestep in depth.
    for (const e of foes) {
      if (e.state !== 'windup' || judged.has(e.windupKey ??= {})) continue;
      judged.add(e.windupKey);
      if (rng() < 0.6) { dodge = 0.6; dodgeDir = hero.pos.z > 0 ? -1 : 1; }
    }
    for (const e of foes) if (e.state !== 'windup') e.windupKey = null;
    if (dodge > 0 && hero.state !== 'attack') { input.setVirtualMove({ x: 0, z: dodgeDir }); return; }

    let target = null, best = 1e9;
    for (const e of foes) {
      const d = Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
      if (d < best) { best = d; target = e; }
    }
    // Pick up food when hurt and nobody is close.
    const food = game.pickups[0];
    if (food && hero.hp < 85 && (!target || best > 2.5)) {
      const fx = food.pos.x - hero.pos.x, fz = food.pos.z - hero.pos.z, fl = Math.hypot(fx, fz) || 1;
      input.setVirtualMove({ x: fx / fl, z: fz / fl, run: fl > 3 });
      return;
    }
    if (!target) { input.setVirtualMove({ x: -Math.sign(hero.pos.x) * (Math.abs(hero.pos.x) > 1 ? 1 : 0), z: 0 }); return; }

    const side = Math.sign(target.pos.x - hero.pos.x) || 1;
    const dx = Math.abs(target.pos.x - hero.pos.x), dz = target.pos.z - hero.pos.z;
    const inReach = dx < 1.1 + target.radius - 0.1 && Math.abs(dz) < 0.3;
    if (inReach) {
      input.setVirtualMove({ x: side * 0.12, z: 0 });
      if (pressT <= 0) {
        // punch combos, with a kick now and then against the big ones, and J, J, K sometimes
        if ((target.kind !== 'thug_skinny') && hero.comboStep === 0 && rng() < 0.3) input.press('kick');
        else if (hero.comboStep === 2 && hero.state === 'attack' && rng() < 0.35) input.press('kick');
        else input.press('punch');
        pressT = 0.12;
      }
      return;
    }
    // Running in from a distance: sometimes finish with a running punch or flying kick.
    if (hero.state === 'run' && dx < 3 && dx > 1.4 && Math.abs(dz) < 0.3 && pressT <= 0 && rng() < 0.04) {
      input.press(rng() < 0.5 ? 'punch' : 'kick');
      pressT = 0.3;
    }
    const want = { x: target.pos.x - side * 0.9 - hero.pos.x, z: dz };
    const len = Math.hypot(want.x, want.z) || 1;
    input.setVirtualMove({ x: want.x / len, z: want.z / len, run: len > 2.5 });
  };
}
