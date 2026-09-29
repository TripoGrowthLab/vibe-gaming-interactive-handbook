// Helpers for Juno's rigged model: find bones, match clip names, and push an upper arm outward at the shoulder
// (used after every animation frame so hanging arms never sink into the body).
import * as THREE from 'three';

// GLTFLoader strips ':' from node names ("mixamorig:LeftArm" → "mixamorigLeftArm"), so compare cleaned names.
const clean = (n) => n.replace(/^mixamorig[:_]?/i, '').replace(/[^A-Za-z0-9]/g, '');

export function findBones(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[clean(o.name)] = o; });
  return bones;
}

// Tripo renames clips (defeat_02 → defeat_03, Text to Motion clips get their description as a name).
// Match by the base name: text before ':' and without a trailing _NN, then the longest common prefix.
const base = (n) => n.toLowerCase().split(':')[0].trim().replace(/_\d+$/, '');
export function matchClip(clips, wanted) {
  const w = base(wanted);
  let best = null, bestScore = 0;
  for (const c of clips) {
    const b = base(c.name);
    let k = 0;
    while (k < w.length && k < b.length && w[k] === b[k]) k++;
    const score = b === w ? 1000 : k;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 3 ? best : null;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// Rotate the upper arm (LeftArm / RightArm) by `angle` radians so the elbow swings away from the body's midline.
// Needs up-to-date world matrices; updates the arm's subtree afterwards.
export function pushArmOut(bones, side, angle) {
  if (!angle) return;
  const upper = bones[side === 'L' ? 'LeftArm' : 'RightArm'];
  const fore = bones[side === 'L' ? 'LeftForeArm' : 'RightForeArm'];
  const lSh = bones.LeftArm, rSh = bones.RightArm;
  if (!upper || !fore || !lSh || !rSh) return;
  // "Out" = the body's own sideways axis toward this arm's side (works even when she is lying down).
  lSh.getWorldPosition(_a);
  rSh.getWorldPosition(_b);
  const out = _c.subVectors(_a, _b).normalize();
  if (side === 'R') out.negate();
  upper.getWorldPosition(_a);
  fore.getWorldPosition(_b);
  const dir = _b.sub(_a).normalize();
  const axis = _d.crossVectors(dir, out);
  if (axis.lengthSq() < 1e-8) return; // arm already points straight out
  axis.normalize();
  // World axis → the upper arm's parent space, then pre-multiply its local rotation.
  upper.parent.getWorldQuaternion(_pq).invert();
  axis.applyQuaternion(_pq);
  _q.setFromAxisAngle(axis, angle);
  upper.quaternion.premultiply(_q);
  upper.updateMatrixWorld(true);
}

// Arm-fix curves: { clipName: { step, L: [radians…], R: [radians…] } } sampled every `step` seconds.
export function armAngleAt(curve, side, t) {
  if (!curve) return 0;
  const arr = curve[side];
  const f = Math.max(0, t / curve.step);
  const i = Math.min(Math.floor(f), arr.length - 1);
  const j = Math.min(i + 1, arr.length - 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

// three.js's AnimationMixer only writes a bone when the animated value changes, so a push applied on top
// would pile up frame after frame. ArmFixer undoes last frame's push before the mixer runs again.
export class ArmFixer {
  constructor(bones) {
    this.bones = bones;
    this.saved = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
    this.pushed = false;
  }
  // Call right before mixer.update / mixer.setTime.
  restore() {
    if (!this.pushed) return;
    this.bones.LeftArm?.quaternion.copy(this.saved.L);
    this.bones.RightArm?.quaternion.copy(this.saved.R);
    this.pushed = false;
  }
  // Call right after the mixer, with world matrices up to date.
  apply(angleL, angleR) {
    this.restore();
    if (this.bones.LeftArm) this.saved.L.copy(this.bones.LeftArm.quaternion);
    if (this.bones.RightArm) this.saved.R.copy(this.bones.RightArm.quaternion);
    this.pushed = true;
    pushArmOut(this.bones, 'L', angleL);
    pushArmOut(this.bones, 'R', angleR);
  }
}
