// Seats a robot's parts against each other by their real surfaces, so the robot looks like one
// solid toy whatever parts it wears: the core sits down on the legs, the head sits down on the
// core, and each arm slides in sideways until it touches the core.
//
// Surfaces are sampled from the triangles (not just the vertices, which are sparse on big flat
// faces) at rest pose, and compared on a 1 cm grid: for every grid cell both parts cover, how far
// apart are they along the direction of travel? The smallest distance is how far the part moves.
// This only moves the attach points that parts hang on; no gameplay number changes.
import * as THREE from 'three';
import { SLOTS } from '../data.js';

const CELL = 0.01;
// Grid cell key for two coordinates (numbers are much faster than strings).
const key2 = (a, b) => (Math.floor(a / CELL) + 4096) * 8192 + (Math.floor(b / CELL) + 4096);
const EMBED = 0.004; // parts overlap this much so seams never show daylight
const SHOULDER = (0.33 - 0.2) / 0.16; // shoulder height as a share of the core's height (from the GDD)
const REST_ROLL = 0.08; // arms hang this far out at rest (radians)
const CLEAR = 0.003; // an arm may touch the legs, but not sink more than 3 mm into them
const WALK_SWING = 0.25; // arms swing this far forward and back when walking (robot.js)
// Rest poses an arm may take to clear wide legs, cheapest first: a little more tilt out to the
// side, and/or swung a little forward at the shoulder (a toy holding its weapon ready).
const POSES = [];
for (let pitch = 0; pitch >= -0.61; pitch -= 0.12) for (let roll = REST_ROLL; roll <= 0.5 + 1e-6; roll += 0.04) POSES.push([pitch, roll]);
POSES.sort((a, b) => (a[1] - REST_ROLL) + Math.abs(a[0]) - ((b[1] - REST_ROLL) + Math.abs(b[0])));

// Pose an arm's points about its shoulder hinge (the origin) the way the animation code does
// (rotation order YXZ): roll around Z first (out to the side), then pitch around X (forward < 0).
function posePoints(pts, pitch, roll, step = 1) {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const out = [];
  for (let i = 0; i < pts.length; i += 3 * step) {
    const x = pts[i] * cr - pts[i + 1] * sr;
    const y = pts[i] * sr + pts[i + 1] * cr;
    const z = pts[i + 2];
    out.push(x, y * cp - z * sp, y * sp + z * cp);
  }
  return out;
}

// Per 1 cm cell of the Y-Z plane, the X extent of each leg piece: [min, max] pairs. A point whose
// X falls inside a pair is inside that piece.
function slabs(meshes, off) {
  const map = new Map();
  for (const pts of meshes) {
    const local = new Map();
    for (let i = 0; i < pts.length; i += 3) {
      const key = key2(pts[i + 1] + off[1], pts[i + 2] + off[2]);
      const x = pts[i] + off[0];
      const r = local.get(key);
      if (r) (r[0] = Math.min(r[0], x)), (r[1] = Math.max(r[1], x));
      else local.set(key, [x, x]);
    }
    for (const [k, r] of local) (map.get(k) || map.set(k, []).get(k)).push(r);
  }
  return map;
}

// How deep (metres) the deepest point of `pts` (offset off) is buried inside the slabs.
function buried(pts, off, slab) {
  let worst = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i] + off[0];
    const list = slab.get(key2(pts[i + 1] + off[1], pts[i + 2] + off[2]));
    if (!list) continue;
    for (const [a, b] of list) if (x > a && x < b) worst = Math.max(worst, Math.min(x - a, b - x));
  }
  return worst;
}

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

// Surface points never change for a given part (only its scale and place do), so they are
// measured once per part id and look (greybox or model) and then reused.
const cache = new Map();
function surfacePoints(part, attach, perMesh = false) {
  const id = `${part.userData.partId}|${part.userData.repaint ? 'model' : 'greybox'}|${perMesh}`;
  let local = cache.get(id);
  if (!local) {
    const sc = part.scale.x;
    part.scale.setScalar(1);
    local = measureSurface(part, part, perMesh);
    part.scale.setScalar(sc);
    part.updateMatrixWorld(true);
    cache.set(id, local);
  }
  // The part hangs at its attach point's origin, unrotated at rest, scaled uniformly.
  const k = part.scale.x;
  const scale = (list) => list.map((v) => v * k);
  return perMesh ? local.map(scale) : scale(local);
}

// Points on the surface of a part, in `frame`'s space, with the part at rest.
function measureSurface(part, frame, perMesh) {
  const attach = frame;
  // Rest pose: clear hinge rotations (not mesh rotations, which shape the greybox pieces).
  const saved = [];
  part.traverse((o) => {
    if (!o.isMesh) {
      saved.push([o, o.rotation.clone()]);
      o.rotation.set(0, 0, 0);
    }
  });
  attach.updateMatrixWorld(true);
  _inv.copy(attach.matrixWorld).invert();
  let pts = [];
  const meshes = [];
  part.traverse((o) => {
    if (!o.isMesh) return;
    if (perMesh) meshes.push((pts = []));
    _m.multiplyMatrices(_inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(pos, i0).applyMatrix4(_m);
      _b.fromBufferAttribute(pos, i1).applyMatrix4(_m);
      _c.fromBufferAttribute(pos, i2).applyMatrix4(_m);
      const edge = Math.max(_a.distanceTo(_b), _b.distanceTo(_c), _c.distanceTo(_a));
      const n = Math.min(4, Math.max(1, Math.ceil(edge / CELL)));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n;
          const v = j / n;
          const w = 1 - u - v;
          pts.push(_a.x * u + _b.x * v + _c.x * w, _a.y * u + _b.y * v + _c.y * w, _a.z * u + _b.z * v + _c.z * w);
        }
      }
    }
  });
  for (const [o, r] of saved) o.rotation.copy(r);
  part.updateMatrixWorld(true);
  return perMesh ? meshes : pts;
}

function bounds(pts, off) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pts[i + k] + off[k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

// The fixed part's surface as seen from direction dir (axis k, sign s): per grid cell of the other
// two axes, the point furthest towards dir.
function buildFar(fixed, fixOff, k, s) {
  const [u, w] = [0, 1, 2].filter((i) => i !== k);
  const map = new Map();
  for (let i = 0; i < fixed.length; i += 3) {
    const key = key2(fixed[i + u] + fixOff[u], fixed[i + w] + fixOff[w]);
    const c = s * (fixed[i + k] + fixOff[k]);
    if (!(map.get(key) >= c)) map.set(key, c);
  }
  return { map, k, s, u, w, box: bounds(fixed, fixOff) };
}

// How far `moving` (offset movOff) can travel along -dir before touching the fixed part.
// Positive = gap, negative = overlap.
function gapTo(moving, movOff, far) {
  const { map, k, s, u, w } = far;
  let gap = Infinity;
  for (let i = 0; i < moving.length; i += 3) {
    const f = map.get(key2(moving[i + u] + movOff[u], moving[i + w] + movOff[w]));
    if (f === undefined) continue;
    const g = s * (moving[i + k] + movOff[k]) - f;
    if (g < gap) gap = g;
  }
  if (gap === Infinity) {
    // No shared cells: fall back to the boxes.
    const a = bounds(moving, movOff);
    gap = s > 0 ? a.min[k] - far.box.max[k] : far.box.min[k] - a.max[k];
  }
  return gap;
}
const gapAlong = (moving, movOff, fixed, fixOff, k, s) => gapTo(moving, movOff, buildFar(fixed, fixOff, k, s));

export function snugLayout(view) {
  const parts = {};
  for (const slot of Object.keys(SLOTS)) {
    const p = view.part(slot);
    if (p) parts[slot] = surfacePoints(p, view.attach[slot]);
  }
  const pos = (slot) => view.attach[slot].position.toArray();
  const set = (slot, v) => view.attach[slot].position.fromArray(v);
  const result = {};

  // Core sits down on the legs (legs stand on the ground at the origin).
  if (parts.core && parts.legs) {
    const start = [0, SLOTS.core.attach[1], 0];
    const g = gapAlong(parts.core, start, parts.legs, pos('legs'), 1, +1);
    set('core', [0, start[1] - g - EMBED, 0]);
    result.core = +g.toFixed(4);
  }
  if (!parts.core) return result;
  const core = bounds(parts.core, pos('core'));
  const cx = (core.min[0] + core.max[0]) / 2;
  const cz = (core.min[2] + core.max[2]) / 2;

  // Head sits down on the core, centred over it.
  if (parts.head) {
    const start = [cx, core.max[1] + 0.05, cz];
    const g = gapAlong(parts.head, start, parts.core, pos('core'), 1, +1);
    set('head', [cx, start[1] - g - EMBED, cz]);
    result.head = +g.toFixed(4);
  }

  // Arms hang at shoulder height and slide in until they touch the core. If an arm would then sink
  // into wide legs (at rest or anywhere in its walking swing), it takes the cheapest rest pose that
  // keeps it clear: a little more tilt out to the side and/or swung a little forward. The pose is
  // stored on the part (restPitch, restRoll) for the animation code and applied by the view.
  const legSlabs = parts.legs ? slabs(surfacePoints(view.part('legs'), view.attach.legs, true), pos('legs')) : null;
  const shoulderY = core.min[1] + SHOULDER * (core.max[1] - core.min[1]);
  for (const [slot, s] of [['arm_l', +1], ['arm_r', -1]]) {
    if (!parts[slot]) continue;
    const start = [s > 0 ? core.max[0] + 0.3 : core.min[0] - 0.3, shoulderY, cz];
    const coreFar = buildFar(parts.core, pos('core'), 0, s);
    let best = null;
    for (const [pitch, roll] of POSES) {
      const pts = posePoints(parts[slot], pitch, s * roll, 2);
      const g = gapTo(pts, start, coreFar);
      const at = [start[0] - s * (g + EMBED), shoulderY, cz];
      let depth = 0;
      if (legSlabs) {
        for (const swing of [0, -WALK_SWING, WALK_SWING]) {
          depth = Math.max(depth, buried(swing ? posePoints(parts[slot], pitch + swing, s * roll, 2) : pts, at, legSlabs));
          if (depth > CLEAR) break;
        }
      }
      if (!best || depth < best.depth) best = { at, pitch, roll: s * roll, depth };
      if (depth <= CLEAR) break;
    }
    set(slot, best.at);
    const arm = view.part(slot);
    arm.userData.restPitch = best.pitch;
    arm.userData.restRoll = best.roll;
    result[slot] = { x: +best.at[0].toFixed(4), pitch: +best.pitch.toFixed(2), roll: +best.roll.toFixed(2), buriedMm: +(best.depth * 1000).toFixed(1) };
  }
  return result;
}

// For tests: the smallest distance between the surfaces of neighbouring parts, in metres
// (0 when they touch or overlap).
export function partGaps(view) {
  const pts = {};
  for (const slot of Object.keys(SLOTS)) {
    const p = view.part(slot);
    if (!p) continue;
    let local = surfacePoints(p, view.attach[slot]);
    if (p.userData.restRoll !== undefined) local = posePoints(local, p.userData.restPitch || 0, p.userData.restRoll);
    pts[slot] = local.map((v, i) => v + view.attach[slot].position.getComponent(i % 3));
  }
  // Nearest distance between two point sets, looked up on a 5 mm grid within 2 cm
  // (anything further apart is reported as 20 mm, which is plenty to fail a "snug" check).
  const dist = (A, B) => {
    const R = 0.005;
    const REACH = 4;
    const key = (x, y, z) => ((x + 2048) * 4096 + (y + 2048)) * 4096 + (z + 2048);
    const grid = new Map();
    for (let i = 0; i < B.length; i += 3) {
      const k = key(Math.floor(B[i] / R), Math.floor(B[i + 1] / R), Math.floor(B[i + 2] / R));
      (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
    let best = R * REACH;
    for (let i = 0; i < A.length; i += 3) {
      const cx = Math.floor(A[i] / R);
      const cy = Math.floor(A[i + 1] / R);
      const cz = Math.floor(A[i + 2] / R);
      const reach = Math.min(REACH, Math.ceil(best / R));
      for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
        const list = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (!list) continue;
        for (const j of list) {
          const d = Math.hypot(A[i] - B[j], A[i + 1] - B[j + 1], A[i + 2] - B[j + 2]);
          if (d < best) best = d;
        }
      }
      if (best === 0) break;
    }
    return best;
  };
  const out = {};
  for (const [a, b] of [['legs', 'core'], ['core', 'head'], ['core', 'arm_r'], ['core', 'arm_l']]) {
    if (pts[a] && pts[b]) out[`${a}-${b}`] = +dist(pts[b], pts[a]).toFixed(4);
  }
  return out;
}

// For tests: how deep (metres) each arm sinks into the legs, at rest and at both ends of its
// walking swing.
export function armBurial(view) {
  const legs = view.part('legs');
  if (!legs) return {};
  const slab = slabs(surfacePoints(legs, view.attach.legs, true), view.attach.legs.position.toArray());
  const out = {};
  for (const slot of ['arm_r', 'arm_l']) {
    const p = view.part(slot);
    if (!p) continue;
    const pts = surfacePoints(p, view.attach[slot]);
    const at = view.attach[slot].position.toArray();
    const pitch = p.userData.restPitch || 0;
    const roll = p.userData.restRoll ?? (slot === 'arm_r' ? -REST_ROLL : REST_ROLL);
    out[slot] = {
      rest: +buried(posePoints(pts, pitch, roll), at, slab).toFixed(4),
      walk: +Math.max(buried(posePoints(pts, pitch - WALK_SWING, roll), at, slab), buried(posePoints(pts, pitch + WALK_SWING, roll), at, slab)).toFixed(4),
    };
  }
  return out;
}
