import * as THREE from 'three';

// Comic look: 3-step toon shading plus a black "inverted hull" outline.
let gradient = null;
export function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMaterial(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

// Mesh with a toon material and a black outline of `thickness` metres.
export function toonMesh(geometry, color, thickness = 0.03) {
  const mesh = new THREE.Mesh(geometry, toonMaterial(color));
  geometry.computeBoundingBox();
  const s = new THREE.Vector3();
  geometry.boundingBox.getSize(s);
  const outline = new THREE.Mesh(geometry, outlineMat);
  outline.scale.set(1 + (2 * thickness) / s.x, 1 + (2 * thickness) / s.y, 1 + (2 * thickness) / s.z);
  outline.userData.isOutline = true;
  mesh.add(outline);
  return mesh;
}

export function box(w, h, d, color, t) { return toonMesh(new THREE.BoxGeometry(w, h, d), color, t); }
export function cylinder(r, h, color, t, seg = 16) { return toonMesh(new THREE.CylinderGeometry(r, r, h, seg), color, t); }
export function capsule(r, h, color, t) {
  // h = total height including the round caps
  return toonMesh(new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), 6, 14), color, t);
}
