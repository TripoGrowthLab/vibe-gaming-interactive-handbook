// For each robot GLB: scale to 0.5 m tall, stand it on the ground, and match every piece to the
// placeholder part it overlaps most. Prints the table used by the game.
// Usage: node tools/match-parts.mjs
import '../src/visuals/placeholders.js';
import { ROBOT_HEIGHT } from '../src/data.js';
import { placeholderTargets } from '../src/visuals/partTargets.js';
import { matchPieces } from '../src/visuals/partMatch.js';
import { inspect } from './inspect-glb.mjs';

const DIR = new URL('../public/assets/', import.meta.url).pathname;
export { placeholderTargets };

export function placedPieces(info) {
  const k = ROBOT_HEIGHT / info.size[1];
  const cx = (info.min[0] + info.max[0]) / 2;
  const cz = (info.min[2] + info.max[2]) / 2;
  const y0 = info.min[1];
  return {
    k,
    pieces: info.meshNodes.map((m) => ({
      name: m.node,
      tris: m.tris,
      min: [(m.min[0] - cx) * k, (m.min[1] - y0) * k, (m.min[2] - cz) * k],
      max: [(m.max[0] - cx) * k, (m.max[1] - y0) * k, (m.max[2] - cz) * k],
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f3 = (a) => a.map((v) => v.toFixed(3)).join(', ');
  for (const robot of ['pipo', 'kanazuchi', 'popgun', 'hazama']) {
    const info = inspect(`${DIR}robot_${robot}.glb`);
    const { k, pieces } = placedPieces(info);
    const targets = placeholderTargets(robot);
    const m = matchPieces(pieces, targets);
    console.log(`\n=== robot_${robot}: scale ${k.toFixed(4)} (model ${info.size[1].toFixed(3)} tall -> 0.5 m)`);
    const groups = {};
    for (const p of pieces) {
      const g = m[p.name];
      (groups[g.key] ??= []).push(p);
      const size = p.max.map((v, i) => v - p.min[i]);
      const c = p.max.map((v, i) => (v + p.min[i]) / 2);
      console.log(`  ${p.name.padEnd(14)} -> ${g.key.padEnd(16)} overlap ${(g.share * 100).toFixed(0).padStart(3)}%  size [${f3(size)}]  centre [${f3(c)}]  tris ${p.tris}`);
    }
    for (const t of targets) {
      const list = groups[t.key] || [];
      if (!list.length) console.log(`  MISSING: nothing matched placeholder "${t.key}"`);
      else {
        const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        list.forEach((p) => p.min.forEach((v, i) => ((b.min[i] = Math.min(b.min[i], v)), (b.max[i] = Math.max(b.max[i], p.max[i])))));
        const ts = t.max.map((v, i) => v - t.min[i]);
        console.log(`  group ${t.key.padEnd(16)} model box min [${f3(b.min)}] max [${f3(b.max)}]  | placeholder size [${f3(ts)}]`);
      }
    }
  }
}
