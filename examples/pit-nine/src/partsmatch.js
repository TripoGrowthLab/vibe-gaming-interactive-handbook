// Groups the loose pieces of a split Tripo model into the named parts of its placeholder.
// Pieces keep their names when Tripo kept them; pieces still called tripo_part_N go to the placeholder part they overlap most,
// measured inside each object's own bounding box so different proportions still line up.
import * as THREE from 'three';

const _b = new THREE.Box3();
const _v = new THREE.Vector3();
// Triangles that really show: Tripo pieces can carry unused vertices and zero-area triangles far from the piece,
// which make the stock bounding box far too big. Returns a flat list of vertex indices, three per triangle.
const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
export function realTriangles(geometry) {
  if (geometry.userData.realTris) return geometry.userData.realTris;
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const n = idx ? idx.count : pos.count;
  const out = [];
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
    _a.fromBufferAttribute(pos, a);
    _e1.fromBufferAttribute(pos, b).sub(_a);
    _e2.fromBufferAttribute(pos, c).sub(_a);
    if (_c.crossVectors(_e1, _e2).lengthSq() > 1e-14) out.push(a, b, c);
  }
  geometry.userData.realTris = out;
  return out;
}
export function usedBox(geometry) {
  if (geometry.userData.usedBox) return geometry.userData.usedBox;
  const pos = geometry.attributes.position;
  const box = new THREE.Box3();
  for (const v of realTriangles(geometry)) box.expandByPoint(_v.fromBufferAttribute(pos, v));
  geometry.userData.usedBox = box;
  return box;
}

// skip: names of other parts nested inside obj (their meshes do not count)
function boxOf(obj, relativeTo, skip = []) {
  relativeTo.updateMatrixWorld(true);
  const inv = relativeTo.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (let a = o.parent; a && a !== obj; a = a.parent) if (skip.includes(a.name)) return;
    _b.copy(usedBox(o.geometry)).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    box.union(_b);
  });
  return box;
}
function normalize(box, whole) {
  const s = whole.getSize(new THREE.Vector3());
  return new THREE.Box3(
    box.min.clone().sub(whole.min).divide(s),
    box.max.clone().sub(whole.min).divide(s),
  );
}
const volume = (b) => (b.isEmpty() ? 0 : Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z));

// model: Object3D already turned to face +Z. placeholder: its placeholder root. partNames: parts to match.
// overrides: { pieceName: partName } for pieces the automatic match gets wrong.
export function matchParts(model, placeholder, partNames, overrides = {}) {
  const wholeM = boxOf(model, model);
  const wholeP = boxOf(placeholder, placeholder);
  const targets = partNames
    .map((n) => {
      const o = placeholder.getObjectByName(n);
      return o && { name: n, box: normalize(boxOf(o, placeholder, partNames), wholeP) };
    })
    .filter(Boolean);
  const pieces = [];
  model.traverse((o) => o.isMesh && pieces.push(o));
  const result = {};
  for (const n of partNames) result[n] = [];
  const report = [];
  for (const piece of pieces) {
    const name = piece.name || piece.parent?.name || '';
    let part = partNames.find((n) => name === n || name.startsWith(n + '_') || piece.parent?.name === n);
    let how = part ? 'name' : '';
    if (!part && overrides[name]) (part = overrides[name]), (how = 'override');
    const nb = normalize(boxOf(piece, model), wholeM);
    if (!part) {
      let best = 0;
      for (const t of targets) {
        const v = volume(nb.clone().intersect(t.box));
        if (v > best) (best = v), (part = t.name);
      }
      how = 'overlap';
      if (!part) {
        const c = nb.getCenter(new THREE.Vector3());
        let bd = Infinity;
        for (const t of targets) {
          const d = t.box.distanceToPoint(c);
          if (d < bd) (bd = d), (part = t.name);
        }
        how = 'nearest';
      }
    }
    result[part].push(piece);
    const c = nb.getCenter(new THREE.Vector3());
    report.push({ piece: name, part, how, centre: [c.x, c.y, c.z].map((v) => +v.toFixed(2)) });
  }
  return { groups: result, report };
}
