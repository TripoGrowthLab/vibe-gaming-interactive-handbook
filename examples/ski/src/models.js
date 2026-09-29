// Loads the Tripo GLBs and turns each into a ready-to-use template:
// scaled to its size in assets.json (people by height, everything else by longest edge),
// turned to face +Z like its placeholder, centred on the feet/base and sat on the ground.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Size from assets.json and the facing fix found by rendering each model next to its placeholder.
export const MODEL_SPECS = {
  skier:      { size: 1.7, by: 'height', yaw: 0, texture: 2048 },
  skis:       { size: 1.6, by: 'longest', yaw: 0, texture: 1024 },
  pine_tree:  { size: 5.0, by: 'longest', yaw: 0, texture: 1024 },
  boulder:    { size: 1.8, by: 'longest', yaw: 0, texture: 1024 },
  log:        { size: 3.5, by: 'longest', yaw: Math.PI / 2, texture: 1024 },
  snowman:    { size: 1.8, by: 'longest', yaw: 0, texture: 1024 },
  lift_pylon: { size: 7.0, by: 'longest', yaw: 0, texture: 1024 },
  edge_fence: { size: 4.0, by: 'longest', yaw: 0, texture: 1024 },
};

// Shrinks a texture on load to save GPU memory on phones (a 2K map is 21 MB with mipmaps, 1K is 5 MB).
function shrinkTexture(tex, max) {
  const img = tex?.image;
  if (!img || img.width <= max) return;
  const c = document.createElement('canvas');
  c.width = c.height = max;
  c.getContext('2d').drawImage(img, 0, 0, max, max);
  tex.image = c;
  tex.needsUpdate = true;
}

// Returns { template, gltf, box } where template is a Group: origin at the centre of the feet/base, facing +Z.
export function prepareModel(id, gltf) {
  const spec = MODEL_SPECS[id];
  const inner = gltf.scene;
  inner.rotation.y = spec.yaw;
  inner.updateMatrixWorld(true);
  // The sizes stored in the file are not reliable: recompute the box from the real vertices.
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  const measure = spec.by === 'height' ? size.y : Math.max(size.x, size.y, size.z);
  const s = spec.size / measure;
  const center = box.getCenter(new THREE.Vector3());
  inner.scale.setScalar(s);
  inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);

  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    shrinkTexture(m.map, spec.texture);
    m.metalness = 0;
    m.roughness = Math.max(m.roughness, 0.8);
  });

  const template = new THREE.Group();
  template.name = `${id}_model`;
  template.add(inner);
  template.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(template, true);
  const result = { template, gltf, box: finalBox, scale: s };
  if (id === 'skis') result.deck = skiDeckHeight(template);
  return result;
}

// Height of the ski top surface under the boots (ignores the raised bindings): highest vertex in the
// band 25–45 % of the length away from the centre, i.e. between the bindings and the tips.
function skiDeckHeight(template) {
  const v = new THREE.Vector3();
  const half = new THREE.Box3().setFromObject(template, true).getSize(v).z / 2;
  let top = 0;
  template.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const f = Math.abs(v.z) / half;
      if (f > 0.25 && f < 0.45) top = Math.max(top, v.y);
    }
  });
  return top;
}

const loader = new GLTFLoader();
export async function loadModels(base = './assets/') {
  const models = {};
  const failed = {};
  await Promise.all(Object.keys(MODEL_SPECS).map(async (id) => {
    try {
      models[id] = prepareModel(id, await loader.loadAsync(`${base}${id}.glb`));
    } catch (e) {
      failed[id] = String(e?.message ?? e);
    }
  }));
  return { models, failed };
}
