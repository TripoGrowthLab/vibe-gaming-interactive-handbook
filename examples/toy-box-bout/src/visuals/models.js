// Loads the Tripo GLB files and registers them as 'model' builders in the visual registry,
// under the same ids as the greybox placeholders. Gameplay code does not change.
//
// Robots: the shape comes only from robot_<id>.glb. The style files (…_mechapop, …_wood) have the
// same shape and UVs, so only their textures are taken, matched by node name (never mesh order).
// Every piece is named tripo_part_N, so each piece is given to the placeholder part it overlaps
// most. Each part's pivot is moved to its hinge, and sub-hinges (legs, treads, skirt) get their own.
// Each piece keeps all its textures (colour, roughness/metal, normal), shrunk to what a screen shows.
// Style files are big, so they are only downloaded when somebody picks that paint (ensurePaint).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { register } from './registry.js';
import { matchPieces } from './partMatch.js';
import { placeholderTargets } from './partTargets.js';
import { ROBOT_HEIGHT } from '../data.js';

const ROBOT_IDS = ['pipo', 'kanazuchi', 'popgun', 'hazama'];
export const STYLES = ['mechapop', 'wood'];
// Props: size = longest edge in metres (from assets.json); yaw turns the model to face +Z.
const PROPS = {
  arena_toybox: { size: 5.1, texMax: 1024, place: 'floor' },
  toy_block: { size: 0.25, texMax: 512, place: 'ground' },
  cork_pellet: { size: 0.04, texMax: 512, place: 'centre', yaw: Math.PI / 2 },
  bottle_rocket: { size: 0.14, texMax: 512, place: 'centre', yaw: Math.PI / 2 },
};

// Shrink a texture so a phone does not spend its memory on detail nobody can see.
function shrink(tex, max) {
  const img = tex?.image;
  if (!img || !img.width || Math.max(img.width, img.height) <= max) return;
  const f = max / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * f);
  c.height = Math.round(img.height * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  if (img.close) img.close();
  tex.image = c;
  tex.needsUpdate = true;
}

// Texture sizes per device: robots are at most a few hundred pixels tall on screen.
const TEX = {
  desktop: { map: 1024, rough: 512, normal: 512 },
  phone: { map: 512, rough: 256, normal: 0 }, // phones skip normal maps
};
let texLimits = TEX.desktop;

// The textures of one piece from a loaded file, shrunk.
function pieceTextures(mesh) {
  const m = mesh.material;
  const t = { map: m.map || null, rough: m.roughnessMap || m.metalnessMap || null, normal: texLimits.normal ? m.normalMap || null : null, roughness: m.roughness ?? 1, metalness: m.metalness ?? 0, normalScale: m.normalScale ? m.normalScale.clone() : new THREE.Vector2(1, 1) };
  shrink(t.map, texLimits.map);
  shrink(t.rough, texLimits.rough);
  shrink(t.normal, texLimits.normal);
  return t;
}
function applyTextures(mat, t) {
  mat.map = t.map;
  mat.roughnessMap = t.rough;
  mat.metalnessMap = t.rough;
  mat.normalMap = t.normal;
  mat.roughness = t.roughness;
  mat.metalness = t.metalness;
  if (t.normal) mat.normalScale.copy(t.normalScale);
  mat.needsUpdate = true;
}

// Paint textures per robot: TEXTURES[robot][paint][nodeName]. Styles fill in when downloaded.
const TEXTURES = {};
const styleLoads = {};
let loaderRef = null;
let baseRef = './assets/';
export function paintReady(robot, paint) {
  return paint === 'factory' || !!TEXTURES[robot]?.[paint];
}
// Download a style file (only its textures are used) the first time somebody picks that paint.
export function ensurePaint(robot, paint) {
  if (paintReady(robot, paint) || !TEXTURES[robot]) return Promise.resolve(true);
  const key = `${robot}_${paint}`;
  styleLoads[key] ??= loaderRef
    .loadAsync(`${baseRef}robot_${key}.glb`)
    .then((g) => {
      const set = {};
      for (const m of meshesOf(g.scene)) set[nodeName(m)] = pieceTextures(m);
      g.scene.traverse((o) => o.isMesh && o.geometry.dispose()); // shape comes only from the default file
      TEXTURES[robot][paint] = set;
      return true;
    })
    .catch((e) => {
      console.warn(`[models] robot_${key}.glb did not load: ${e?.message || e}`);
      return false;
    });
  return styleLoads[key];
}

function meshesOf(root) {
  const out = [];
  root.traverse((o) => o.isMesh && out.push(o));
  return out;
}
const nodeName = (m) => m.name || m.parent?.name;

// Bounding box from the real vertices (the min/max stored in the file is not trusted).
function realBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of meshesOf(root)) {
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
  }
  return box;
}

// ---------- robots ----------
function prepareRobot(robot, gltf) {
  const scene = gltf.scene;
  const box = realBox(scene);
  const size = box.getSize(new THREE.Vector3());
  const k = ROBOT_HEIGHT / size.y;
  const c = box.getCenter(new THREE.Vector3());
  // Place: centre x/z on the origin, feet on the ground, 0.5 m tall. The model faces +Z already.
  const place = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));

  // Textures per paint, by node name (styles are added later by ensurePaint).
  const tex = (TEXTURES[robot] = { factory: {} });
  for (const m of meshesOf(scene)) tex.factory[nodeName(m)] = pieceTextures(m);

  // Bake every piece into robot space and measure it.
  const pieces = meshesOf(scene).map((m) => {
    const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, m.matrixWorld));
    geo.computeBoundingBox();
    return { name: nodeName(m), geo, min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() };
  });
  const match = matchPieces(pieces, placeholderTargets(robot));

  // Group by slot (and sub-hinge) and find each hinge.
  const bySlot = {};
  for (const p of pieces) {
    const [slot, sub] = match[p.name].key.split('/');
    p.slot = slot;
    p.sub = sub || null;
    (bySlot[slot] ??= []).push(p);
  }
  const boxOf = (list) => {
    const b = new THREE.Box3();
    list.forEach((p) => b.union(p.geo.boundingBox));
    return b;
  };
  const templates = {};
  for (const [slot, list] of Object.entries(bySlot)) {
    const b = boxOf(list);
    const cen = b.getCenter(new THREE.Vector3());
    // Arms hang from the shoulder (top); everything else sits on its bottom.
    const joint = new THREE.Vector3(cen.x, slot.startsWith('arm') ? b.max.y : b.min.y, cen.z);
    const subs = {};
    for (const sub of new Set(list.filter((p) => p.sub).map((p) => p.sub))) {
      const sb = boxOf(list.filter((p) => p.sub === sub));
      const sc = sb.getCenter(new THREE.Vector3());
      // Legs and the skirt swing from the hip (top); treads jiggle about their centre.
      const hinge = sub.startsWith('tread') ? sc : new THREE.Vector3(sc.x, sb.max.y, sc.z);
      subs[sub] = hinge.sub(joint);
    }
    templates[slot] = {
      subs,
      pieces: list.map((p) => {
        const off = p.sub ? subs[p.sub].clone().add(joint) : joint;
        const geo = p.geo.clone().translate(-off.x, -off.y, -off.z);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        return { name: p.name, sub: p.sub, geo };
      }),
    };
  }

  for (const slot of Object.keys(templates)) {
    const t = templates[slot];
    register(
      `${robot}_${slot}`,
      ({ paint = 'factory' } = {}) => {
        const root = new THREE.Group();
        const pivots = {};
        for (const [sub, pos] of Object.entries(t.subs)) {
          const g = new THREE.Group();
          g.name = sub;
          g.position.copy(pos);
          root.add(g);
          pivots[sub] = g;
        }
        for (const p of t.pieces) {
          const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
          applyTextures(mat, tex[paint]?.[p.name] || tex.factory[p.name]);
          const mesh = new THREE.Mesh(p.geo, mat);
          mesh.name = p.name;
          mesh.userData.srcNode = p.name;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          (p.sub ? pivots[p.sub] : root).add(mesh);
        }
        // Switch skins by replacing the textures on the materials.
        root.userData.repaint = (next) => {
          root.traverse((o) => {
            if (!o.isMesh) return;
            applyTextures(o.material, tex[next]?.[o.userData.srcNode] || tex.factory[o.userData.srcNode]);
          });
        };
        return root;
      },
      'model',
    );
  }
  return {
    scale: k,
    pieces: pieces.map((p) => ({ name: p.name, part: match[p.name].key, overlap: Math.round(match[p.name].share * 100) })),
    parts: Object.fromEntries(Object.entries(templates).map(([slot, t]) => [slot, { pieces: t.pieces.map((p) => p.name), subs: Object.keys(t.subs) }])),
  };
}

// ---------- props ----------
function prepareProp(id, gltf) {
  const cfg = PROPS[id];
  const scene = gltf.scene;
  for (const m of meshesOf(scene)) {
    shrink(m.material.map, cfg.texMax);
    m.castShadow = id !== 'arena_toybox';
    m.receiveShadow = true;
  }
  const inner = new THREE.Group();
  inner.add(scene);
  inner.rotation.y = cfg.yaw || 0;
  const box = realBox(inner);
  const size = box.getSize(new THREE.Vector3());
  const k = cfg.size / Math.max(size.x, size.y, size.z);
  inner.scale.setScalar(k);
  const b2 = realBox(inner);
  const c = b2.getCenter(new THREE.Vector3());
  let y = -b2.min.y;
  if (cfg.place === 'centre') y = -c.y;
  if (cfg.place === 'floor') {
    // Stand the robots on the toy box's floor, not under it: find the floor top with a ray.
    const ray = new THREE.Raycaster(new THREE.Vector3(c.x, b2.max.y + 1, c.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(inner, true)[0];
    y = hit ? -hit.point.y : -b2.min.y;
  }
  inner.position.set(-c.x, y, -c.z);
  const info = { scale: k, size: b2.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)), lift: +y.toFixed(3) };
  if (id === 'arena_toybox') info.inner = measureWalls(inner);

  register(
    id,
    (opts = {}) => {
      const g = new THREE.Group();
      g.name = id;
      g.add(inner.clone());
      if (id === 'toy_block') g.add(letterTile(opts.letter, opts.color));
      if (id === 'arena_toybox') {
        const room = new THREE.Mesh(new THREE.BoxGeometry(40, 0.02, 40), new THREE.MeshStandardMaterial({ color: 0x5a4a6a, roughness: 0.95 }));
        room.position.y = y - 0.02;
        room.receiveShadow = true;
        g.add(room);
      }
      return g;
    },
    'model',
  );
  return info;
}

// The toy block model has one raised letter (A) on its front. Each block gets its own letter on a
// painted tile that fills the recessed square of the front face and covers the moulded A.
// Measured on the model (tools/measure-block.mjs): square floor at z = 111 mm, the A reaches 123 mm,
// the square spans about 190 mm and its raised frame about 230 mm.
const TILE = { size: 0.228, back: 0.111, front: 0.1245 }; // covers the moulded frame too
const tileCache = new Map();
function letterTile(letter = 'A', color = '#e25b4a') {
  const key = letter + color;
  if (!tileCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, -0.18));
    x.fillStyle = grad;
    x.fillRect(0, 0, 256, 256);
    x.font = '900 190px "Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    // Moulded look: a dark edge below, a light edge above, then the letter itself.
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillText(letter, 134, 146);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fillText(letter, 124, 136);
    x.fillStyle = '#ffd84a';
    x.fillText(letter, 128, 140);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // One material per tile (one draw call): the thin sides sample the tile's top-left colour.
    tileCache.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
  }
  const d = TILE.front - TILE.back;
  const geo = new THREE.BoxGeometry(TILE.size, TILE.size, d);
  const uv = geo.attributes.uv;
  for (const g of geo.groups) {
    if (g.materialIndex === 4) continue; // +Z face keeps the letter
    for (let i = g.start; i < g.start + g.count; i++) uv.setXY(geo.index.getX(i), 0.03, 0.97);
  }
  geo.clearGroups();
  const m = new THREE.Mesh(geo, tileCache.get(key));
  m.position.set(0, 0.125, TILE.back + d / 2);
  m.castShadow = false; // the block under it already casts the shadow
  m.receiveShadow = true;
  m.name = 'letter_tile';
  return m;
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return '#' + c.getHexString();
}

// Where the toy box's inner walls really are (distance from the centre, at mid-wall height).
function measureWalls(obj) {
  obj.updateMatrixWorld(true);
  const b = realBox(obj);
  const out = {};
  const h = (b.min.y + b.max.y) / 2;
  for (const [name, d] of [['+x', [1, 0, 0]], ['-x', [-1, 0, 0]], ['+z', [0, 0, 1]], ['-z', [0, 0, -1]]]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(0, h, 0), new THREE.Vector3(...d)).intersectObject(obj, true)[0];
    out[name] = hit ? +hit.distance.toFixed(3) : null;
  }
  out.wallTop = +b.max.y.toFixed(3);
  return out;
}

// ---------- load everything ----------
export async function loadModels({ base = './assets/', phone = false, onProgress = () => {} } = {}) {
  const loader = new GLTFLoader();
  loaderRef = loader;
  baseRef = base;
  texLimits = phone ? TEX.phone : TEX.desktop;
  const files = ROBOT_IDS.map((r) => `robot_${r}`);
  files.push(...Object.keys(PROPS));
  let done = 0;
  const report = { loaded: [], failed: [], robots: {}, props: {} };
  const gltfs = {};
  await Promise.all(
    files.map(async (f) => {
      try {
        gltfs[f] = await loader.loadAsync(`${base}${f}.glb`);
        report.loaded.push(f);
      } catch (e) {
        report.failed.push({ file: `${f}.glb`, why: String(e?.message || e) });
      }
      onProgress(++done, files.length);
    }),
  );
  for (const r of ROBOT_IDS) {
    const g = gltfs[`robot_${r}`];
    if (!g) continue; // stays greybox
    try {
      report.robots[r] = prepareRobot(r, g);
    } catch (e) {
      report.failed.push({ file: `robot_${r}.glb`, why: `could not split into parts: ${e.message}` });
    }
  }
  for (const id of Object.keys(PROPS)) {
    if (!gltfs[id]) continue;
    try {
      report.props[id] = prepareProp(id, gltfs[id]);
    } catch (e) {
      report.failed.push({ file: `${id}.glb`, why: e.message });
    }
  }
  return report;
}
