// How long bout 1 (vs Kanazuchi) takes, for a fast player (the test bot) and a casual one, at
// several rival toughness values. Usage: node tools/bout-length.mjs 1,1.6,2,2.4
import * as THREE from 'three';
import '../src/visuals/placeholders.js';
import { Fight, EMPTY_INPUT } from '../src/game/fight.js';
import { stockLoadout, ROBOTS } from '../src/data.js';

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PROFILES = {
  fast: { pauseMin: 0.15, pauseMax: 0.35, dodge: 0.6, skill: 1 },
  casual: { pauseMin: 0.8, pauseMax: 1.4, dodge: 0.15, skill: 0.3 },
};
// Each value is toughness or toughness:power, e.g. 2.4:0.5
const muls = (process.argv[2] || '1').split(',');
// Optional pause range for Kanazuchi between attacks, e.g. 2.4-3.2
if (process.argv[3]) [ROBOTS.kanazuchi.ai.pauseMin, ROBOTS.kanazuchi.ai.pauseMax] = process.argv[3].split('-').map(Number);
if (process.argv[4]) ROBOTS.kanazuchi.ai.skill = Number(process.argv[4]);
console.log(`Kanazuchi skill use ${ROBOTS.kanazuchi.ai.skill}; pauses ${ROBOTS.kanazuchi.ai.pauseMin}-${ROBOTS.kanazuchi.ai.pauseMax} s between attacks`);
const base = ROBOTS.kanazuchi.toughness;
for (const mul of muls) {
  [ROBOTS.kanazuchi.toughness, ROBOTS.kanazuchi.power] = mul.split(':').map(Number);
  ROBOTS.kanazuchi.power ||= 1;
  const line = [];
  for (const [name, prof] of Object.entries(PROFILES)) {
    const times = [];
    let wins = 0;
    const lost = { ko: 0, timeout: 0 };
    const N = 200;
    for (let s = 1; s <= N; s++) {
      const f = new Fight({ scene: new THREE.Scene(), rivalId: 'kanazuchi', playerLoadout: stockLoadout('pipo'), playerPaints: {}, rng: rng(s * 7 + 1), playerAI: prof });
      let g = 0;
      while (!f.done && g++ < 60 * 200) f.update(1 / 60, { ...EMPTY_INPUT, move: new THREE.Vector2() });
      if (f.result.won) (wins++, times.push(f.result.timeUsed));
      else lost[f.result.reason]++;
    }
    times.sort((a, b) => a - b);
    const q = (p) => times[Math.floor(p * (times.length - 1))];
    line.push(`${name}: wins ${Math.round((wins / N) * 100)}%, fastest tenth ${q(0.1).toFixed(0)} s, win time ${q(0.25).toFixed(0)}-${q(0.75).toFixed(0)} s (median ${q(0.5).toFixed(0)}), lost by KO ${lost.ko} / time ${lost.timeout}`);
  }
  console.log(`toughness ${ROBOTS.kanazuchi.toughness}, power ${ROBOTS.kanazuchi.power}:  ${line.join('   |   ')}`);
}
ROBOTS.kanazuchi.toughness = base;
