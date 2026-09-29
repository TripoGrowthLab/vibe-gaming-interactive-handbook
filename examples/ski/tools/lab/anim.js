// Measures Juno's animations: hips drift, foot height, and arm-into-body depth (generalised winding number,
// T-pose = zero), then solves the smallest shoulder push-out per frame that clears the body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareModel } from '/src/models.js';
import { findBones, armAngleAt, ArmFixer } from '/src/skierRig.js';

const STEP = 0.1;            // curve sample step (s)
const TH = 0.004;            // depth that counts as "clear" (m)
const MAX_ANGLE = 45 * Math.PI / 180, DA = 1 * Math.PI / 180;

const gltf = await new GLTFLoader().loadAsync('/assets/skier.glb');
const { template } = prepareModel('skier', gltf);
template.updateMatrixWorld(true);
let mesh; template.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
const bones = findBones(template);
const geo = mesh.geometry, N = geo.attributes.position.count;
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig[:_]?/, ''));
const cls = new Int8Array(N); // 0 body, 1 left arm, 2 right arm
for (let i = 0; i < N; i++) {
  let bi = 0, bw = -1;
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
  const n = names[bi];
  cls[i] = /^Left(Arm|ForeArm|Hand)/.test(n) ? 1 : /^Right(Arm|ForeArm|Hand)/.test(n) ? 2 : 0;
}
const idx = geo.index.array;
const bodyTri = [];
for (let t = 0; t < idx.length; t += 3) if (!cls[idx[t]] && !cls[idx[t + 1]] && !cls[idx[t + 2]]) bodyTri.push(idx[t], idx[t + 1], idx[t + 2]);
const armV = { L: [], R: [] };
for (let i = 0; i < N; i++) if (cls[i] === 1) armV.L.push(i); else if (cls[i] === 2) armV.R.push(i);
console.log(`verts ${N}, body tris ${bodyTri.length / 3}, arm verts L ${armV.L.length} R ${armV.R.length}`);

const P = new Float32Array(N * 3), T = new Float32Array(bodyTri.length * 3);
const v = new THREE.Vector3();
function skin() {
  template.updateMatrixWorld(true);
  for (let i = 0; i < N; i++) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  for (let k = 0; k < bodyTri.length; k++) { const i = bodyTri[k]; T[k * 3] = P[i * 3]; T[k * 3 + 1] = P[i * 3 + 1]; T[k * 3 + 2] = P[i * 3 + 2]; }
}
function winding(px, py, pz) {
  let s = 0;
  for (let k = 0; k < T.length; k += 9) {
    const ax = T[k] - px, ay = T[k + 1] - py, az = T[k + 2] - pz;
    const bx = T[k + 3] - px, by = T[k + 4] - py, bz = T[k + 5] - pz;
    const cx = T[k + 6] - px, cy = T[k + 7] - py, cz = T[k + 8] - pz;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const div = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
    s += Math.atan2(det, div);
  }
  return s / (2 * Math.PI);
}
const tri = new THREE.Triangle(), cp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
function surfDist(px, py, pz) {
  let best = Infinity; v.set(px, py, pz);
  for (let k = 0; k < T.length; k += 9) {
    // cheap reject by bounding distance
    const dx = T[k] - px, dy = T[k + 1] - py, dz = T[k + 2] - pz;
    if (dx * dx + dy * dy + dz * dz > (Math.sqrt(best) + 0.2) ** 2 && best < Infinity) continue;
    a.fromArray(T, k); b.fromArray(T, k + 3); c.fromArray(T, k + 6);
    tri.set(a, b, c).closestPointToPoint(v, cp);
    const d = cp.distanceToSquared(v);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const box = new THREE.Box3();
function depthOf(i) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  if (!box.containsPoint(v.set(x, y, z))) return 0;
  return Math.abs(winding(x, y, z)) > 0.5 ? surfDist(x, y, z) : 0;
}
function bodyBox() {
  box.makeEmpty();
  for (let k = 0; k < T.length; k += 3) box.expandByPoint(v.set(T[k], T[k + 1], T[k + 2]));
  box.expandByScalar(0.01);
}
const base = new Float32Array(N);
const CREASE = 0.09; // m: arm vertices this close to the shoulder joint (in T-pose) form the armpit crease
const crease = { L: [], R: [] };
// Worst depth for one arm; `only` limits the test to a subset of vertices.
function armDepth(side, only) {
  let worst = 0, inside = [];
  for (const i of only ?? armV[side]) {
    const d = Math.max(0, depthOf(i) - base[i]);
    if (d > 0.0005) inside.push(i);
    if (d > worst) worst = d;
  }
  return { worst, inside };
}

// T-pose (the file's rest pose) is zero.
skin(); bodyBox();
for (const s of ['L', 'R']) for (const i of armV[s]) base[i] = depthOf(i);
{
  const sh = { L: bones.LeftArm.getWorldPosition(new THREE.Vector3()), R: bones.RightArm.getWorldPosition(new THREE.Vector3()) };
  for (const s of ['L', 'R']) {
    const limb = [];
    for (const i of armV[s]) (v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).distanceTo(sh[s]) < CREASE ? crease[s] : limb).push(i);
    armV[s] = limb;
  }
  console.log(`limb verts L ${armV.L.length} R ${armV.R.length}, crease verts L ${crease.L.length} R ${crease.R.length}`);
}
function creaseDepth(s) { let w = 0; for (const i of crease[s]) w = Math.max(w, depthOf(i) - base[i]); return w; }
console.log('T-pose baseline done, max baseline', Math.max(...base).toFixed(4));

const mixer = new THREE.AnimationMixer(template);
const fixer = new ArmFixer(bones);
// Pose the rig at time t with the given shoulder push-outs (radians).
function pose(t, aL = 0, aR = 0) {
  fixer.restore();
  mixer.setTime(t);
  template.updateMatrixWorld(true);
  fixer.apply(aL, aR);
}
const hipsBone = bones.Hips;
const Q = new URLSearchParams(location.search);
if (Q.get('diag')) {
  const clip = gltf.animations.find((c) => c.name.startsWith(Q.get('diag')));
  mixer.clipAction(clip).play();
  const t = Number(Q.get('t'));
  const res = { clip: clip.name, t, byAngle: [] };
  for (const [dl, dr] of (Q.get('pairs') ? JSON.parse(Q.get('pairs')) : [0, 10, 20, 30, 45, 60].map((d) => [d, d]))) {
    const deg = `${dl}/${dr}`;
    pose(t, dl * Math.PI / 180, dr * Math.PI / 180);
    skin(); bodyBox();
    const row = { deg };
    for (const sd of ['L', 'R']) {
      const worst = []; 
      for (const i of armV[sd]) { const d = depthOf(i); if (d > 0.005) worst.push([d, i]); }
      worst.sort((x, y) => y[0] - x[0]);
      const byBone = {};
      for (const [d, i] of worst) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } byBone[names[bi]] = Math.max(byBone[names[bi]] ?? 0, +(d*100).toFixed(1)); }
      const top = worst[0];
      row[sd] = { count: worst.length, byBoneCm: byBone, worstPos: top ? [P[top[1]*3], P[top[1]*3+1], P[top[1]*3+2]].map(x=>+x.toFixed(3)) : null };
    }
    res.byAngle.push(row);
  }
  const bp = (n) => { bones[n].getWorldPosition(v); return v.toArray().map((x) => +x.toFixed(3)); };
  pose(t);
  res.bonesAt0 = Object.fromEntries(['Hips','Spine2','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','RightUpLeg'].map((n) => [n, bp(n)]));
  window.__result = res;
  throw new Error('diag done');
}
const out = { clips: {}, curves: { step: STEP } };
const t0 = performance.now();
const onlyClip = Q.get('only'), from = Number(Q.get('from') ?? 0), to = Number(Q.get('to') ?? 1e9);
for (const clip of gltf.animations.filter((c) => !onlyClip || c.name.startsWith(onlyClip))) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip); action.play();
  const frames = Math.floor(clip.duration / STEP) + 1;
  const L = [], R = [], hips = [], minY = [], before = { L: 0, R: 0, worstT: 0 }, creaseB = { L: 0, R: 0 }, creaseA = { L: 0, R: 0 };
  for (let f = 0; f < frames; f++) {
    const t = Math.min(f * STEP, clip.duration - 1e-3);
    if (t < from || t > to) { L.push(0); R.push(0); hips.push([0,0,0]); minY.push(0); continue; }
    pose(t); skin(); bodyBox();
    hipsBone.getWorldPosition(v); hips.push([+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]);
    let my = Infinity; for (let i = 0; i < N; i++) my = Math.min(my, P[i * 3 + 1]); minY.push(+my.toFixed(4));
    for (const sd of ['L', 'R']) creaseB[sd] = Math.max(creaseB[sd], creaseDepth(sd));
    const ang = { L: 0, R: 0 };
    for (const s of ['L', 'R', 'L', 'R']) {
      if (ang.L || ang.R) { pose(t, ang.L, ang.R); skin(); }
      let d = armDepth(s);
      if (d.worst > before[s]) { before[s] = d.worst; }
      if (d.worst > (before.max ?? 0)) { before.max = d.worst; before.worstT = t; before.worstSide = s; }
      while (d.worst > TH && ang[s] < MAX_ANGLE) {
        ang[s] += DA;
        pose(t, ang.L, ang.R);
        skin();
        const sub = armDepth(s, d.inside);
        d = sub.worst <= TH ? armDepth(s) : sub; // confirm on the whole arm
        if (Q.get('verbose') && sub.worst <= TH) console.log('  confirm', s, (ang[s]*57.3).toFixed(0), 'sub', (sub.worst*100).toFixed(2), 'full', (d.worst*100).toFixed(2), 'n', d.inside.length);
      }
    }
    L.push(ang.L); R.push(ang.R);
    if (onlyClip && Q.get('verbose')) console.log('t', t.toFixed(1), 'angle L/R', (ang.L*57.3).toFixed(0), (ang.R*57.3).toFixed(0));
  }
  // Dilate so that interpolated values between samples are never smaller than either neighbour needs.
  const dil = (arr) => arr.map((x, i) => (Math.max(x, arr[i - 1] ?? 0, arr[i + 1] ?? 0, arr[i - 2] ?? 0, arr[i + 2] ?? 0) || 0) + (x || arr[i - 1] || arr[i + 1] ? 2 * Math.PI / 180 : 0));
  const curve = { step: STEP, L: dil(L).map((x) => +x.toFixed(4)), R: dil(R).map((x) => +x.toFixed(4)) };
  // "After": check halfway between samples, the way the game plays it.
  const after = { L: 0, R: 0 };
  for (let f = 0; f < frames; f++) {
    const t = Math.min(f * STEP + STEP / 2, clip.duration - 1e-3);
    if (t < from || t > to) continue;
    pose(t, armAngleAt(curve, 'L', t), armAngleAt(curve, 'R', t));
    skin(); bodyBox();
    for (const s of ['L', 'R']) { after[s] = Math.max(after[s], armDepth(s).worst); creaseA[s] = Math.max(creaseA[s], creaseDepth(s)); }
    if (onlyClip && Q.get('verbose')) console.log('after mid t', t.toFixed(2), 'curve', (armAngleAt(curve,'L',t)*57.3).toFixed(0), (armAngleAt(curve,'R',t)*57.3).toFixed(0), 'depth L/R cm', (armDepth('L').worst*100).toFixed(1), (armDepth('R').worst*100).toFixed(1));
    // and exactly on the samples
    const ts = Math.min(f * STEP, clip.duration - 1e-3);
    pose(ts, armAngleAt(curve, 'L', ts), armAngleAt(curve, 'R', ts));
    skin(); bodyBox();
    for (const s of ['L', 'R']) after[s] = Math.max(after[s], armDepth(s).worst);
  }
  const xs = hips.map((h) => h[0]), zs = hips.map((h) => h[2]), ys = hips.map((h) => h[1]);
  const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  out.clips[clip.name] = {
    duration: clip.duration,
    hips: { meanX: mean(xs), meanZ: mean(zs), first: hips[0], last: hips.at(-1), rangeX: [Math.min(...xs), Math.max(...xs)], rangeZ: [Math.min(...zs), Math.max(...zs)], rangeY: [Math.min(...ys), Math.max(...ys)], minYAt: +(ys.indexOf(Math.min(...ys)) * STEP).toFixed(2) },
    lowestVertex: { min: Math.min(...minY), max: Math.max(...minY) },
    beforeCm: { L: +(before.L * 100).toFixed(2), R: +(before.R * 100).toFixed(2), worstAt: before.worstT, side: before.worstSide },
    creaseBeforeCm: { L: +(creaseB.L * 100).toFixed(2), R: +(creaseB.R * 100).toFixed(2) },
    creaseAfterCm: { L: +(creaseA.L * 100).toFixed(2), R: +(creaseA.R * 100).toFixed(2) },
    afterCm: { L: +(after.L * 100).toFixed(2), R: +(after.R * 100).toFixed(2) },
    maxFixDeg: { L: +(Math.max(...L) * 180 / Math.PI).toFixed(1), R: +(Math.max(...R) * 180 / Math.PI).toFixed(1) },
    hipsTrack: hips.filter((_, i) => i % 5 === 0),
  };
  out.curves[clip.name] = curve;
  console.log(`${clip.name.slice(0, 20)} done in ${((performance.now() - t0) / 1000).toFixed(0)} s`, JSON.stringify(out.clips[clip.name].beforeCm), JSON.stringify(out.clips[clip.name].afterCm), 'max fix', JSON.stringify(out.clips[clip.name].maxFixDeg), 'crease', JSON.stringify(out.clips[clip.name].creaseBeforeCm), JSON.stringify(out.clips[clip.name].creaseAfterCm));
}
window.__result = out;
