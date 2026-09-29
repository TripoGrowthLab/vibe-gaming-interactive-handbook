// Measures the real toy-box model by casting rays at its triangles (floor height, inner wall faces).
import * as THREE from 'three';
import { readGlb, readAccessor } from './inspect-glb.mjs';
const g = readGlb(new URL('../public/assets/arena_toybox.glb', import.meta.url).pathname);
const prim = g.json.meshes[0].primitives[0];
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(readAccessor(g, prim.attributes.POSITION)), 3));
geo.setIndex(Array.from(readAccessor(g, prim.indices)));
const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const box = new THREE.Box3().setFromObject(mesh);
const longest = Math.max(...box.getSize(new THREE.Vector3()).toArray());
const k = 5.1 / longest;
const rc = new THREE.Raycaster();
const hit = (o, d) => {
  rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
  return rc.intersectObject(mesh)[0];
};
const floorPts = [[0, 0], [0.2, 0.2], [-0.3, 0.1], [0.4, -0.4]].map(([x, z]) => hit([x, 1, z], [0, -1, 0])?.point.y);
console.log('model size', box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(3)), 'scale', k.toFixed(3));
console.log('floor top at samples (m):', floorPts.map((y) => (y * k).toFixed(3)));
const cy = box.min.y + (box.max.y - box.min.y) * 0.6;
for (const [name, d] of [['+X', [1, 0, 0]], ['-X', [-1, 0, 0]], ['+Z', [0, 0, 1]], ['-Z', [0, 0, -1]]]) {
  const h = hit([0, cy, 0], d);
  console.log(`inner wall ${name}: ${h ? (h.distance * k).toFixed(3) + ' m from centre' : 'none'}`);
}
console.log('wall top (m):', ((box.max.y - box.min.y) * k).toFixed(3), ' min y', box.min.y.toFixed(3));
