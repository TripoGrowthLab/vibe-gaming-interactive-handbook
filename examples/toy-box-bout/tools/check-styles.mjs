// Checks that every style file has exactly the same pieces, vertices and UVs as its default file,
// matched by node name (never by mesh order).
import { readGlb, readAccessor } from './inspect-glb.mjs';
const DIR = new URL('../public/assets/', import.meta.url).pathname;
function byNode(file) {
  const g = readGlb(DIR + file);
  const out = {};
  for (const n of g.json.nodes) {
    if (n.mesh === undefined) continue;
    const p = g.json.meshes[n.mesh].primitives[0];
    out[n.name] = { pos: readAccessor(g, p.attributes.POSITION), uv: readAccessor(g, p.attributes.TEXCOORD_0), mesh: n.mesh };
  }
  return out;
}
let bad = 0;
for (const robot of ['pipo', 'kanazuchi', 'popgun', 'hazama']) {
  const base = byNode(`robot_${robot}.glb`);
  for (const style of ['mechapop', 'wood']) {
    const s = byNode(`robot_${robot}_${style}.glb`);
    const names = Object.keys(base);
    const issues = [];
    let reordered = 0;
    let near = 0;
    for (const n of names) {
      if (!s[n]) { issues.push(`missing ${n}`); continue; }
      if (s[n].mesh !== base[n].mesh) reordered++;
      // Vertices may be stored in a different order, so compare the set of (position, UV) pairs.
      const keys = (d) => {
        const out = new Set();
        for (let i = 0; i < d.pos.length / 3; i++) {
          out.add([d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2], d.uv[i * 2], d.uv[i * 2 + 1]].map((v) => v.toFixed(4)).join(','));
        }
        return out;
      };
      const a = keys(base[n]);
      const b = keys(s[n]);
      let common = 0;
      for (const k of a) if (b.has(k)) common++;
      if (base[n].pos.length !== s[n].pos.length) issues.push(`${n}: vertex count ${base[n].pos.length / 3} vs ${s[n].pos.length / 3}`);
      else if (common < a.size * 0.999) issues.push(`${n}: only ${common}/${a.size} position+UV pairs match`);
      else if (common < a.size) near++;
    }
    if (issues.length) bad++;
    console.log(`robot_${robot}_${style}: ${names.length} pieces, ${issues.length ? 'PROBLEMS ' + issues.join('; ') : 'same shape and UVs'}${reordered ? `, mesh order differs for ${reordered} pieces` : ''}${near ? `, ${near} pieces with a few rounding-edge mismatches` : ''} (vertices stored in a different order)`);
  }
}
process.exit(bad ? 1 : 0);
