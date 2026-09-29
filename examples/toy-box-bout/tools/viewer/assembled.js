// Dev-only: robots as the game assembles them. Greybox on the right, models on the left.
// ?robots=pipo,kanazuchi  &view=front|threequarter|back|side  &pose=rest|attack|block|walk|broken
// &loadout=<slot>:<part>,...  (mix parts)   &boxes=proposed  (try the proposed slot boxes)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '/src/visuals/placeholders.js';
import { setMode } from '/src/visuals/registry.js';
import { loadModels } from '/src/visuals/models.js';
import { createRobotView } from '/src/visuals/robotView.js';
import { stockLoadout, SLOTS } from '/src/data.js';
import { partGaps } from '/src/visuals/snugFit.js';

const q = new URLSearchParams(location.search);
if (q.get('boxes') === 'proposed') {
  const P = JSON.parse(q.get('boxdef') || '{}');
  for (const [slot, box] of Object.entries(P)) SLOTS[slot].box = box;
}
const robots = (q.get('robots') || 'pipo,kanazuchi,popgun,hazama').split(',');
const view = q.get('view') || 'front';
const pose = q.get('pose') || 'rest';
const mixed = q.get('loadout');
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight);
r.shadowMap.enabled = true;
document.body.append(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe3ea);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1, 3, 2);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xc8ccd6 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const report = await loadModels({ base: '/assets/' });
window.__report = report;
const out = [];
robots.forEach((id, i) => {
  let lo = stockLoadout(id);
  if (mixed) for (const kv of mixed.split(',')) { const [s, p] = kv.split(':'); lo[s] = p; }
  for (const [mode, dx] of [['model', -0.2], ['greybox', 0.2]]) {
    if (q.get('only') && q.get('only') !== mode) continue;
    setMode(mode);
    const v = createRobotView(lo);
    const x = (i - (robots.length - 1) / 2) * 0.9 + (q.get('only') ? 0 : dx);
    v.root.position.x = x;
    scene.add(v.root);
    for (const s2 of ['arm_r', 'arm_l']) { const a2 = v.part(s2); if (a2) a2.rotation.z = a2.userData.restRoll ?? 0; }
    const arm = v.part('arm_r');
    const legL = v.node('legs', 'leg_l');
    if (pose === 'attack' && arm) arm.rotation.x = -Math.PI / 2;
    if (pose === 'up' && arm) arm.rotation.x = -2.8;
    if (pose === 'block') { const a = v.part('arm_l'); a.rotation.order = 'YXZ'; a.rotation.x = -Math.PI / 2 * 0.85; a.rotation.y = -1.2; }
    if (pose === 'walk' && legL) { legL.rotation.x = 0.436; v.node('legs', 'leg_r').rotation.x = -0.436; }
    if (pose === 'broken') { v.detach('arm_r'); v.detach('head'); }
    v.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(v.root, true);
    const fits = {};
    for (const s of Object.keys(SLOTS)) { const p = v.part(s); if (p) fits[s] = +(p.userData.fit ?? 1).toFixed(2); }
    out.push({ gaps: partGaps(v), fit: v.fit, robot: id, mode, size: b.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3)), halfWidthX: +Math.max(-b.min.x + x, b.max.x - x).toFixed(3), halfDepthZ: +Math.max(-b.min.z, b.max.z).toFixed(3), fits });
  }
});
window.__sizes = out;
const w = robots.length * 0.9;
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 50);
const d = Math.max(1.4, w * 1.25) * (q.get('zoom') ? 1 / +q.get('zoom') : 1);
const dir = { front: [0, 0.25, 1], back: [0, 0.25, -1], side: [1, 0.2, 0], threequarter: [0.7, 0.35, 0.8], low: [0.3, -0.05, 1] }[view];
const target = new THREE.Vector3(+(q.get('tx') || 0), +(q.get('ty') || 0.25), 0);
cam.position.copy(target).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d));
cam.lookAt(target);
r.render(scene, cam);
window.__done = true;
