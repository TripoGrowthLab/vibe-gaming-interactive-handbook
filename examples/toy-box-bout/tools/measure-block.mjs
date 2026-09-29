// Measures the toy block model's front face: where the flat face is, how far the raised letter
// panel stands out, and how big the panel is (scaled to the 0.25 m block).
import * as THREE from 'three';
import { readGlb, readAccessor } from './inspect-glb.mjs';

const g = readGlb(new URL('../public/assets/toy_block.glb', import.meta.url).pathname);
const prim = g.json.meshes[0].primitives[0];
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(readAccessor(g, prim.attributes.POSITION)), 3));
geo.setIndex(Array.from(readAccessor(g, prim.indices)));
geo.computeBoundingBox();
const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const bb = geo.boundingBox;
const size = bb.getSize(new THREE.Vector3());
const k = 0.25 / Math.max(size.x, size.y, size.z);
const rc = new THREE.Raycaster();
const N = 25;
const grid = [];
for (let j = N - 1; j >= 0; j--) {
  const row = [];
  for (let i = 0; i < N; i++) {
    const x = bb.min.x + ((i + 0.5) / N) * size.x;
    const y = bb.min.y + ((j + 0.5) / N) * size.y;
    rc.set(new THREE.Vector3(x, y, bb.max.z + 1), new THREE.Vector3(0, 0, -1));
    const h = rc.intersectObject(mesh)[0];
    row.push(h ? h.point.z : null);
  }
  grid.push(row);
}
const zs = grid.flat().filter((v) => v !== null);
const hist = new Map();
for (const z of zs) hist.set(Math.round(z * k * 1000), (hist.get(Math.round(z * k * 1000)) || 0) + 1);
console.log('front-face depth (mm from block centre) : number of samples');
for (const [z, n] of [...hist].sort((a, b) => b[0] - a[0])) console.log(`  ${z} mm : ${n}`);
console.log('\nmap (# = highest level, + = middle, . = flat face):');
const hi = Math.max(...zs);
for (const row of grid) console.log('  ' + row.map((z) => (z === null ? ' ' : z * k > hi * k - 0.002 ? '#' : z * k > hi * k - 0.006 ? '+' : '.')).join(''));
console.log(`\nblock is ${(size.x * k).toFixed(3)} x ${(size.y * k).toFixed(3)} x ${(size.z * k).toFixed(3)} m; front of the highest level at z = ${(hi * k * 1000).toFixed(1)} mm`);
