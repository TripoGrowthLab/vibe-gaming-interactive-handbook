// Keeps Tamsin's arms out of her body. Tripo animations are the same for every body shape, so arms can sink into
// the hips, belly, chest or head. The measuring half (used by tools/lab-arms.mjs) finds, for every frame, how deep
// the arm vertices go inside the rest of the body (generalised winding number, T-pose counted as zero) and how far
// the upper arm must turn outward at the shoulder to clear it. The game half applies that turn after each frame.
import * as THREE from 'three';

export const ARM_BONES = {
  left: { upper: 'mixamorigLeftArm', chain: ['mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand'], side: 1 },
  right: { upper: 'mixamorigRightArm', chain: ['mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand'], side: -1 },
};
const BODY_BONES = ['mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigNeck', 'mixamorigHead', 'mixamorigHeadTop_End', 'mixamorigLeftUpLeg', 'mixamorigRightUpLeg'];

// ---------------------------------------------------------------- game half
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _rq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
// Turn each upper arm at the shoulder, after the mixer has posed it. turn = [ax, ay, az, angle]: an axis in the
// character's own space (chosen so the arm moves out of the body) and an angle in radians.
export function applyArmTurn(bones, root, left, right) {
  root.getWorldQuaternion(_rq);
  for (const [key, turn] of [['left', left], ['right', right]]) {
    if (!turn || !turn[3]) continue;
    const b = bones[key];
    if (!b) continue;
    _axis.set(turn[0], turn[1], turn[2]).applyQuaternion(_rq).normalize();
    _q.setFromAxisAngle(_axis, turn[3]);
    b.parent.getWorldQuaternion(_pq);
    b.getWorldQuaternion(_wq);
    _wq.premultiply(_q);
    b.quaternion.copy(_pq.invert().multiply(_wq));
  }
}
// The animation mixer only writes a bone when its animated value changes, so a turn applied by hand would stay on
// (and pile up) whenever the clip holds still. Call restore() before mixer.update() and save() right after it.
export class ArmBase {
  constructor(bones) {
    this.bones = bones;
    this.q = {};
  }
  restore() {
    for (const k in this.q) this.bones[k].quaternion.copy(this.q[k]);
  }
  save() {
    for (const k of ['left', 'right']) if (this.bones[k]) (this.q[k] ||= new THREE.Quaternion()).copy(this.bones[k].quaternion);
  }
}

// Table lookup: table = { step, left: [[ax,ay,az,angle], ...], right: [...] } sampled from the clip stretch start.
// Axes change little between neighbouring frames, so blend angles and take the nearer frame's axis.
export function tableAt(table, t, out = { left: null, right: null }) {
  for (const side of ['left', 'right']) {
    const rows = table?.[side];
    if (!rows?.length) {
      out[side] = null;
      continue;
    }
    const f = Math.max(0, t / table.step);
    const i = Math.min(rows.length - 1, Math.floor(f));
    const j = Math.min(rows.length - 1, i + 1);
    const k = Math.min(1, f - i);
    const A = rows[i], B = rows[j];
    const axis = (k < 0.5 && A[3]) || !B[3] ? A : B;
    out[side] = [axis[0], axis[1], axis[2], A[3] + (B[3] - A[3]) * k];
  }
  return out;
}

// ---------------------------------------------------------------- measuring half
function dominantBone(mesh, i) {
  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  let best = -1, bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k);
    if (w > bw) (bw = w), (best = si.getComponent(i, k));
  }
  return mesh.skeleton.bones[best]?.name || '';
}

export function prepareArmCheck(mesh) {
  const n = mesh.geometry.attributes.position.count;
  const kind = new Int8Array(n); // 1 body, 2 left arm, 3 right arm
  for (let i = 0; i < n; i++) {
    const b = dominantBone(mesh, i);
    if (BODY_BONES.includes(b)) kind[i] = 1;
    else if (ARM_BONES.left.chain.some((c) => b.startsWith(c))) kind[i] = 2;
    else if (ARM_BONES.right.chain.some((c) => b.startsWith(c))) kind[i] = 3;
  }
  const idx = mesh.geometry.index;
  const bodyTris = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (kind[a] === 1 && kind[b] === 1 && kind[c] === 1) bodyTris.push(a, b, c);
  }
  const arms = { left: [], right: [] };
  for (let i = 0; i < n; i++) if (kind[i] === 2) arms.left.push(i); else if (kind[i] === 3) arms.right.push(i);
  return { mesh, kind, bodyTris: new Uint32Array(bodyTris), arms, pos: new Float32Array(n * 3), baseline: null };
}

// skinned positions of all vertices in the character's own space
const _v = new THREE.Vector3();
export function skinAll(ctx, rootInv) {
  const { mesh, pos } = ctx;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, _v);
    _v.applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInv);
    pos[i * 3] = _v.x;
    pos[i * 3 + 1] = _v.y;
    pos[i * 3 + 2] = _v.z;
  }
}
function winding(ctx, px, py, pz) {
  const P = ctx.pos, T = ctx.bodyTris;
  let sum = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const ax = P[a] - px, ay = P[a + 1] - py, az = P[a + 2] - pz;
    const bx = P[b] - px, by = P[b + 1] - py, bz = P[b + 2] - pz;
    const cx = P[c] - px, cy = P[c + 1] - py, cz = P[c + 2] - pz;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const div = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
    sum += 2 * Math.atan2(det, div);
  }
  return sum / (4 * Math.PI);
}
const _tri = new THREE.Triangle();
const _cp = new THREE.Vector3();
const _cpBest = new THREE.Vector3();
function depth(ctx, p) {
  const P = ctx.pos, T = ctx.bodyTris;
  let best = Infinity;
  for (let t = 0; t < T.length; t += 3) {
    _tri.a.fromArray(P, T[t] * 3);
    _tri.b.fromArray(P, T[t + 1] * 3);
    _tri.c.fromArray(P, T[t + 2] * 3);
    _tri.closestPointToPoint(p, _cp);
    const d = _cp.distanceToSquared(p);
    if (d < best) (best = d), _cpBest.copy(_cp);
  }
  return Math.sqrt(best);
}
// Deepest arm vertex inside the body for one side (metres). Vertices inside at T-pose, and seam vertices within
// `seam` metres of the shoulder joint, do not count.
export function worstDepth(ctx, side, shoulder, seam = 0.07, info = null) {
  const P = ctx.pos;
  const box = ctx.bodyBox;
  let worst = 0;
  const p = new THREE.Vector3();
  if (info) info.push.set(0, 0, 0), info.lever.set(0, 0, 0);
  for (const i of ctx.arms[side]) {
    if (ctx.baseline?.has(i)) continue;
    p.fromArray(P, i * 3);
    if (!box.containsPoint(p)) continue;
    if (p.distanceTo(shoulder) < seam) continue;
    if (Math.abs(winding(ctx, p.x, p.y, p.z)) > 0.5) {
      const d = depth(ctx, p);
      worst = Math.max(worst, d);
      if (info) {
        // the way out of the body for this vertex, weighted by how deep it is
        info.push.addScaledVector(_cpBest.clone().sub(p).normalize(), d);
        info.lever.addScaledVector(p.clone().sub(shoulder), d);
      }
    }
  }
  return worst;
}
// Axis to turn the upper arm about so the sunk vertices move out of the body (null if nothing is inside).
export function outwardAxis(info) {
  if (info.push.lengthSq() < 1e-12) return null;
  const axis = new THREE.Vector3().crossVectors(info.lever, info.push);
  return axis.lengthSq() < 1e-12 ? null : axis.normalize();
}
export function bodyBox(ctx) {
  const box = new THREE.Box3();
  const P = ctx.pos, T = ctx.bodyTris;
  const p = new THREE.Vector3();
  for (let t = 0; t < T.length; t++) box.expandByPoint(p.fromArray(P, T[t] * 3));
  ctx.bodyBox = box.expandByScalar(0.01);
}
// T-pose zero: remember arm vertices that are already inside the body in the rest pose.
export function takeBaseline(ctx) {
  const set = new Set();
  const p = new THREE.Vector3();
  bodyBox(ctx);
  for (const side of ['left', 'right'])
    for (const i of ctx.arms[side]) {
      p.fromArray(ctx.pos, i * 3);
      if (ctx.bodyBox.containsPoint(p) && Math.abs(winding(ctx, p.x, p.y, p.z)) > 0.5) set.add(i);
    }
  ctx.baseline = set;
  return set.size;
}
