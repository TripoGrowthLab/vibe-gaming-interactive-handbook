// Headless checks of the fight rules (no browser needed): node tools/sim-test.mjs
import * as THREE from 'three';
import '../src/visuals/placeholders.js';
import { Fight, EMPTY_INPUT } from '../src/game/fight.js';
import { stockLoadout, RIVAL_ORDER, FEEL, PARTS } from '../src/data.js';

const scene = new THREE.Scene();
let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const inp = (o = {}) => ({ ...EMPTY_INPUT, move: new THREE.Vector2(), ...o });
function passiveFight(rival = 'kanazuchi', loadout = stockLoadout('pipo')) {
  const f = new Fight({ scene, rivalId: rival, playerLoadout: loadout, playerPaints: {}, rng: mulberry32(1) });
  f.ai.update = () => inp();
  f.phase = 'fight';
  return f;
}
function run(f, seconds, input = inp(), h = 1 / 60) {
  const n = Math.round(seconds / h);
  for (let i = 0; i < n; i++) f.update(h, i === 0 ? input : { ...input, pressL: false, pressR: false, dash: false, skill: false });
}
function faceOff(f, gap = 0.4) {
  // away from the toy-block stacks
  f.player.pos.set(0.6, 0, -0.6 - gap / 2);
  f.rival.pos.set(0.6, 0, -0.6 + gap / 2);
  f.player.yaw = 0;
  f.rival.yaw = Math.PI;
}

// 1. A press during an attack queues the next attack.
{
  const f = passiveFight();
  faceOff(f, 1.5); // out of reach so nothing gets hit
  run(f, 0.1, inp({ pressR: true }));
  check('attack starts', f.player.state === 'attack' && f.player.attack.slot === 'arm_r');
  run(f, 0.05, inp({ pressL: true }));
  check('second press is queued', f.player.queued === 'arm_l');
  run(f, 0.35);
  check('queued attack fires when the first ends', f.player.state === 'attack' && f.player.attack.slot === 'arm_l', `state=${f.player.state}`);
}

// 2. Hit stop, knockback, invulnerability.
{
  const f = passiveFight();
  faceOff(f, 0.4);
  const z0 = f.rival.pos.z;
  let hitAt = -1;
  f.on((t) => t === 'hit' && hitAt < 0 && (hitAt = 1));
  f.update(1 / 60, inp({ pressR: true }));
  let steps = 0;
  while (hitAt < 0 && steps++ < 60) f.update(1 / 60, inp());
  check('punch lands inside its hit window', hitAt > 0 && f.rival.state === 'hurt', `after ${steps} steps`);
  check('hit stop set', Math.abs(f.hitstop - FEEL.hitstop) < 1e-6, `hitstop=${f.hitstop}`);
  const tRival = f.rival.stateT;
  f.update(1 / 60, inp());
  check('both robots frozen during hit stop', f.rival.stateT === tRival);
  run(f, 0.3);
  const push = f.rival.pos.z - z0;
  check('target pushed back ~0.12 m', Math.abs(push - FEEL.knockback) < 0.02, `pushed ${push.toFixed(3)} m`);
  const again = f.rival.receiveHit({ damage: 5, point: f.rival.pos.clone().setY(0.3), dir: new THREE.Vector3(0, 0, 1) });
  check('no second hit while invulnerable', again === null || f.rival.invuln === 0, `invuln=${f.rival.invuln.toFixed(2)}`);
}

// 3. Parts break; head break ends the fight.
{
  const f = passiveFight();
  faceOff(f, 0.4);
  f.rival.parts.arm_l.hp = 1;
  f.rival.parts.arm_r.hp = 1;
  const r = f.rival.receiveHit({ damage: 5, point: new THREE.Vector3(0.6 - 0.13, 0.24, -0.4), dir: new THREE.Vector3(0, 0, 1) });
  // rival faces -Z, so world -X is its left
  check('hit on a side goes to that arm and breaks it', r && r.broke && r.slot === 'arm_l', JSON.stringify(r));
  check('state part_break', f.rival.state === 'part_break');
  f.rival.invuln = 0;
  f.rival.parts.legs.hp = 1;
  f.rival.receiveHit({ damage: 5, point: new THREE.Vector3(0.6, 0.08, -0.4), dir: new THREE.Vector3(0, 0, 1) });
  check('legs break: speed halves', f.rival.legless && Math.abs(f.rival.speed - PARTS.kanazuchi_legs.speed / 2) < 1e-9);
  f.rival.invuln = 0;
  f.rival.setState('idle');
  f.rival.update(1 / 60, inp({ dash: true }), f);
  check('legs broken: no dash', f.rival.state !== 'dash');
  f.rival.invuln = 0;
  f.rival.parts.head.hp = 1;
  f.rival.receiveHit({ damage: 5, point: new THREE.Vector3(0.6, 0.3, -0.4), dir: new THREE.Vector3(0, 0, 1) });
  f.update(1 / 60, inp());
  check('head break: knocked down and player wins', f.rival.state === 'knocked_down' && f.result?.won === true);
}

// 3b. Side rule: facing each other, your left arm hits their right arm and your right arm hits their left.
{
  const sides = {};
  for (const slot of ['arm_l', 'arm_r']) {
    const f = passiveFight('popgun');
    faceOff(f, 1.2);
    f.rival.parts.head.hp = 999; // keep it alive
    f.rival.parts.head.max = 999;
    let hitSlot = null;
    f.on((t, d) => t === 'hit' && d.target === f.rival && !hitSlot && (hitSlot = d.slot));
    f.player.parts[slot].def = { ...f.player.parts[slot].def, attack: 'cork_shooter' };
    f.player.startAttack(slot);
    run(f, 1.0);
    sides[slot] = hitSlot;
  }
  check('left-arm shot hits their right arm, right-arm shot hits their left arm', sides.arm_l === 'arm_r' && sides.arm_r === 'arm_l', JSON.stringify(sides));
}

// 4. Same movement at 60 Hz and 120 Hz.
{
  const end = [];
  for (const hz of [60, 120]) {
    const f = passiveFight();
    f.player.pos.set(-1.8, 0, -1.8);
    run(f, 1.0, inp({ move: new THREE.Vector2(1, 0) }), 1 / hz);
    run(f, 0.25, inp({ move: new THREE.Vector2(0, 1), dash: true }), 1 / hz);
    end.push(f.player.pos.clone());
  }
  const d = end[0].distanceTo(end[1]);
  check('60 Hz and 120 Hz end in the same place', d < 0.02, `difference ${(d * 1000).toFixed(1)} mm`);
}

// 5. Timeout: higher head HP % wins, a tie goes to the rival.
{
  const f = passiveFight();
  f.time = 0.01;
  f.player.parts.head.hp = 10;
  run(f, 0.1);
  check('timeout decided by head HP %', f.result && f.result.reason === 'timeout' && f.result.won === false);
}

// 6. Full runs: AI-driven Pipo vs the three rivals, taking and equipping prize parts.
const PRIZE = ['arm_r', 'legs', 'head'];
function fullRun(seed, profile) {
  const rng = mulberry32(seed);
  const loadout = stockLoadout('pipo');
  const log = [];
  for (let b = 0; b < 3; b++) {
    let won = false;
    for (let tries = 0; tries < 4 && !won; tries++) {
      const f = new Fight({ scene, rivalId: RIVAL_ORDER[b], playerLoadout: loadout, playerPaints: {}, rng, playerAI: profile });
      let guard = 0;
      while (!f.done && guard++ < 60 * 200) f.update(1 / 60, inp());
      f.dispose();
      won = f.result.won;
      log.push({ bout: b + 1, try: tries + 1, won, reason: f.result.reason, t: f.result.timeUsed, hits: f.result.player.hits, broke: f.result.rivalStats.partsBroken, lost: f.result.player.partsBroken });
    }
    if (!won) return { champion: false, log };
    loadout[PRIZE[b]] = `${RIVAL_ORDER[b]}_${PRIZE[b]}`;
  }
  return { champion: true, log, loadout };
}
const strong = { pauseMin: 0.15, pauseMax: 0.35, dodge: 0.6, skill: 1 };
const casual = { pauseMin: 0.8, pauseMax: 1.4, dodge: 0.15, skill: 0.3 }; // roughly a first-time player
for (const [name, prof] of [['bot', strong], ['casual', casual]]) {
  let champs = 0;
  let bouts = 0;
  let wins = 0;
  let sample;
  const per = {};
  for (let s = 1; s <= 20; s++) {
    const r = fullRun(s, prof);
    for (const l of r.log) {
      const k = `bout ${l.bout}`;
      per[k] ??= [0, 0];
      per[k][0] += l.won ? 1 : 0;
      per[k][1]++;
    }
    if (r.champion) champs++;
    bouts += r.log.length;
    wins += r.log.filter((l) => l.won).length;
    if (s === 1) sample = r;
  }
  console.log(`\n${name} profile: champion in ${champs}/20 runs, won ${wins}/${bouts} bouts`);
  console.log('   per bout (won/tried):', Object.entries(per).map(([k, [w, n]]) => `${k} ${w}/${n}`).join(', '));
  if (name === 'bot') {
    for (const l of sample.log) console.log('  ', JSON.stringify(l));
    check('bot can finish a full run', champs > 0);
  }
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
