// Turns the Tripo GLB files into ready-to-clone templates and views that behave exactly like the placeholders
// (same part names, same hinges-as-pivots, same setState / flash / setGlow), so gameplay code never changes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_CONFIG } from './modelConfig.js';
import { matchParts, usedBox, realTriangles } from './partsmatch.js';
import { createView, PlaceholderView, STYLES, getStyle } from './registry.js';
import { prepareClips, PlayerModelView, blasterHold } from './playerModel.js';

const loader = new GLTFLoader();
const isPhone = matchMedia('(pointer: coarse)').matches;
export const FILE_SUFFIX = { arcade: '', mecha_pop: '_mecha_pop' };
// Largest texture side kept after loading (Tripo exports 2K; small props do not need that on a phone).
const TEX_MAX = isPhone ? { person: 1024, prop: 512, piece: 256 } : { person: 2048, prop: 1024, piece: 512 };

// Redraw a texture's image at most `max` pixels on a side (keeps the look, saves GPU memory).
function shrinkTexture(tex, max) {
  const im = tex?.image;
  if (!im?.width || (im.width <= max && im.height <= max)) return tex;
  const k = max / Math.max(im.width, im.height);
  const c = document.createElement('canvas');
  c.width = Math.round(im.width * k);
  c.height = Math.round(im.height * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY;
  t.colorSpace = tex.colorSpace;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.anisotropy = 4;
  tex.dispose();
  return t;
}

// ---------------------------------------------------------------- materials
// Pieces are hollow shells: draw both sides, and make the inside dark so a broken-off part never looks see-through.
export function shellMaterial(params) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...params });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb *= 0.15;');
  };
  m.customProgramCacheKey = () => 'shell';
  return m;
}

// ---------------------------------------------------------------- loading + placing
function load(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}
// Wrap the file's scene so it faces +Z, has the right size, sits on the ground and is centred.
function place(scene, cfg) {
  const holder = new THREE.Group();
  scene.rotation.y = cfg.turn || 0;
  holder.add(scene);
  const box = boxOfMeshes(holder);
  const s = box.getSize(new THREE.Vector3());
  const k = cfg.height ? cfg.height / s.y : cfg.size / Math.max(s.x, s.y, s.z);
  holder.scale.setScalar(k);
  const b2 = boxOfMeshes(holder);
  const c = b2.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -b2.min.y, -c.z);
  holder.updateMatrixWorld(true);
  return holder;
}
function boxOfMeshes(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) box.expandByObject(o);
    else box.union(usedBox(o.geometry).clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

// ---------------------------------------------------------------- texture atlas (many small textures -> one)
function buildAtlas(images) {
  const cap = TEX_MAX.piece;
  const items = [...images].map((img) => {
    const k = Math.min(1, cap / Math.max(img.width, img.height));
    return { img, w: Math.max(4, Math.round(img.width * k)), h: Math.max(4, Math.round(img.height * k)) };
  });
  items.sort((a, b) => b.h - a.h);
  const pad = 4;
  // just big enough (WebGL2 does not need power-of-two sizes)
  const W = Math.min(4096, Math.max(items[0]?.w + pad * 2 || 64, Math.ceil(Math.sqrt(items.reduce((s, i) => s + (i.w + pad * 2) * (i.h + pad * 2), 0)) * 1.08)));
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.w + pad * 2 > W) (x = 0), (y += rowH), (rowH = 0);
    it.x = x + pad;
    it.y = y + pad;
    x += it.w + pad * 2;
    rowH = Math.max(rowH, it.h + pad * 2);
  }
  const H = y + rowH;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tiles = new Map();
  for (const it of items) {
    // pad by stretching the edges so mipmaps do not bleed neighbouring tiles in
    ctx.drawImage(it.img, it.x - pad, it.y - pad, it.w + pad * 2, it.h + pad * 2);
    ctx.drawImage(it.img, it.x, it.y, it.w, it.h);
    tiles.set(it.img, { ox: it.x / W, oy: it.y / H, sx: it.w / W, sy: it.h / H });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // glTF convention
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, tiles, W, H };
}

// ---------------------------------------------------------------- split models
// A "chunk" is some triangles of one Tripo piece: { mesh, tris: [a,b,c, a,b,c, ...] } (vertex indices).

// Break a piece into its connected islands (vertices at the same spot count as connected).
function islands(mesh) {
  const g = mesh.geometry;
  const P = g.attributes.position;
  const tris = realTriangles(g);
  const parent = new Int32Array(P.count).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const spot = new Map();
  for (let i = 0; i < P.count; i++) {
    const key = `${Math.round(P.getX(i) * 1e5)},${Math.round(P.getY(i) * 1e5)},${Math.round(P.getZ(i) * 1e5)}`;
    if (spot.has(key)) union(i, spot.get(key));
    else spot.set(key, i);
  }
  for (let i = 0; i < tris.length; i += 3) union(tris[i], tris[i + 1]), union(tris[i], tris[i + 2]);
  const groups = new Map();
  for (let i = 0; i < tris.length; i += 3) {
    const r = find(tris[i]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(tris[i], tris[i + 1], tris[i + 2]);
  }
  return [...groups.values()].map((t) => ({ mesh, tris: t }));
}
function chunkBox(ch) {
  const box = new THREE.Box3();
  const P = ch.mesh.geometry.attributes.position;
  const _p = new THREE.Vector3();
  for (const v of ch.tris) box.expandByPoint(_p.fromBufferAttribute(P, v).applyMatrix4(ch.mesh.matrixWorld));
  return box;
}
// Keep only the triangles whose centre passes the test (used to cut one piece in two).
function cutChunk(ch, keep) {
  const P = ch.mesh.geometry.attributes.position;
  const _p = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < ch.tris.length; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(_p.fromBufferAttribute(P, ch.tris[i + k]).applyMatrix4(ch.mesh.matrixWorld));
    if (keep(c.multiplyScalar(1 / 3))) out.push(ch.tris[i], ch.tris[i + 1], ch.tris[i + 2]);
  }
  return { mesh: ch.mesh, tris: out };
}

// Collect chunks into one geometry in the part's own space, with atlas UVs.
function bakePart(chunks, hinge, yawFix, tiles) {
  const pos = [];
  const nor = [];
  const uv = [];
  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const rot = new THREE.Matrix4().makeRotationY(yawFix);
  for (const { mesh, tris } of chunks) {
    const g = mesh.geometry;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const U = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const tile = tiles.get(mesh.material.map?.image) || { ox: 0, oy: 0, sx: 0, sy: 0 };
    for (const v of tris) {
      _p.fromBufferAttribute(P, v).applyMatrix4(mesh.matrixWorld).sub(hinge).applyMatrix4(rot);
      pos.push(_p.x, _p.y, _p.z);
      if (N) _n.fromBufferAttribute(N, v).applyMatrix3(nm).applyMatrix4(rot).normalize(), nor.push(_n.x, _n.y, _n.z);
      if (U) {
        const u = U.getX(v);
        const w = U.getY(v);
        uv.push(tile.ox + (u - Math.floor(u === 1 ? 0 : u)) * tile.sx, tile.oy + (w - Math.floor(w === 1 ? 0 : w)) * tile.sy);
      } else uv.push(0, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length === pos.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  else geo.computeVertexNormals();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function pointsOf(chunks) {
  const pts = [];
  for (const { mesh, tris } of chunks) {
    const P = mesh.geometry.attributes.position;
    for (const v of tris) pts.push(new THREE.Vector3().fromBufferAttribute(P, v).applyMatrix4(mesh.matrixWorld));
  }
  return pts;
}

// Long axis of a part seen from above (for cannons): yaw of its muzzle direction, its back end and length.
function pca2(pts) {
  let cx = 0, cz = 0;
  for (const p of pts) (cx += p.x), (cz += p.z);
  cx /= pts.length;
  cz /= pts.length;
  let xx = 0, xz = 0, zz = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    xx += dx * dx; xz += dx * dz; zz += dz * dz;
  }
  const ang = 0.5 * Math.atan2(2 * xz, xx - zz);
  const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
  if (dir.y < 0) dir.negate(); // point forward (+Z), where the muzzle is
  return { cx, cz, dir };
}
function longAxis(pts) {
  // first guess from all points, then again from the front half only: that is the barrel, not the shoulder block
  let { cx, cz, dir } = pca2(pts);
  const along = (p, c, d) => (p.x - c.x) * d.x + (p.z - c.y) * d.y;
  let ts = pts.map((p) => along(p, new THREE.Vector2(cx, cz), dir));
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const front = pts.filter((p, i) => ts[i] > lo + (hi - lo) * 0.55);
  if (front.length > 20) dir = pca2(front).dir;
  ts = pts.map((p) => along(p, new THREE.Vector2(cx, cz), dir));
  const minT = Math.min(...ts), maxT = Math.max(...ts);
  return { yaw: Math.atan2(dir.x, dir.y), back: new THREE.Vector2(cx + dir.x * minT, cz + dir.y * minT), length: maxT - minT };
}

function hingeFor(rule, box, pts) {
  const c = box.getCenter(new THREE.Vector3());
  switch (rule) {
    case 'top': return new THREE.Vector3(c.x, box.max.y, c.z);
    case 'back': return new THREE.Vector3(c.x, c.y, box.min.z);
    case 'bottom': return new THREE.Vector3(c.x, box.min.y, c.z);
    case 'topBack': return new THREE.Vector3(c.x, box.max.y, box.min.z);
    case 'shoulder': {
      const a = longAxis(pts);
      const s = 0.25 * a.length;
      return new THREE.Vector3(a.back.x + Math.sin(a.yaw) * s, c.y, a.back.y + Math.cos(a.yaw) * s);
    }
    default: return c;
  }
}

function buildParts(id, holder, cfg) {
  const meshes = [];
  holder.traverse((o) => o.isMesh && meshes.push(o));
  // 1. which piece goes to which part. Each piece is first broken into islands; islands lying away from
  //    the main body of a listed piece (stray bolts Tripo glued onto it) are treated as loose bits.
  const entries = Object.fromEntries(cfg.parts.map((p) => [p, []]));
  if (cfg.pieces) {
    const owner = new Map();
    for (const [part, names] of Object.entries(cfg.pieces)) for (const n of names) owner.set(n, part);
    const anchors = []; // { box, part } of the main bodies of listed pieces
    const loose = [];
    for (const m of meshes) {
      const parts = islands(m).map((ch) => ({ ...ch, box: chunkBox(ch) }));
      const sp = cfg.split?.[m.name];
      if (sp) {
        for (const ch of parts) {
          const above = cutChunk(ch, (p) => p[sp.axis] >= sp.at);
          const below = cutChunk(ch, (p) => p[sp.axis] < sp.at);
          if (above.tris.length) entries[sp.above].push(above), anchors.push({ box: chunkBox(above), part: sp.above });
          if (below.tris.length) entries[sp.below].push(below), anchors.push({ box: chunkBox(below), part: sp.below });
        }
        continue;
      }
      const part = owner.get(m.name);
      if (!part) {
        loose.push(...parts);
        continue;
      }
      // main body = the island with the most triangles, plus every island touching or near it
      const main = parts.reduce((a, b) => (b.tris.length > a.tris.length ? b : a));
      const near = main.box.clone().expandByScalar(0.25);
      for (const ch of parts) {
        if (ch === main || near.intersectsBox(ch.box)) {
          entries[part].push(ch);
          anchors.push({ box: ch.box, part });
        } else loose.push(ch);
      }
    }
    for (const ch of loose) {
      const c = ch.box.getCenter(new THREE.Vector3());
      let best = Infinity;
      let part = 'hull';
      for (const a of anchors) {
        const d = a.box.distanceToPoint(c);
        if (d < best) (best = d), (part = a.part);
      }
      entries[part].push(ch);
    }
  } else {
    const { groups } = matchParts(holder, createView(id).root, cfg.parts);
    for (const p of cfg.parts) entries[p] = groups[p].map((mesh) => ({ mesh, tris: realTriangles(mesh.geometry) }));
  }
  // 2. one texture for the whole model
  const images = new Set(meshes.map((m) => m.material.map?.image).filter(Boolean));
  const atlas = buildAtlas(images);
  const material = shellMaterial({ map: atlas.tex });
  // 3. hinges
  const hinges = {};
  const yawFix = {};
  const pts = {};
  for (const p of cfg.parts) {
    pts[p] = pointsOf(entries[p]);
    const box = new THREE.Box3().setFromPoints(pts[p]);
    hinges[p] = hingeFor(cfg.hinge[p], box, pts[p]);
    yawFix[p] = cfg.aimForward?.includes(p) ? -longAxis(pts[p]).yaw : 0;
  }
  // walking machines turn around the middle of their feet, not the middle of their bounding box
  const shift = new THREE.Vector3();
  if (cfg.centreOn === 'legs') {
    const legs = cfg.parts.filter((p) => p.endsWith('_leg'));
    for (const l of legs) shift.add(hinges[l]);
    shift.multiplyScalar(1 / legs.length).setY(0);
  }
  const baked = {};
  for (const p of cfg.parts) baked[p] = hinges[p].clone(); // geometry is baked around the unshifted hinge
  for (const p of cfg.parts) hinges[p].sub(shift);
  const pivots = { root: new THREE.Vector3() };
  if (cfg.upperFrom === 'legTops') {
    const legs = cfg.parts.filter((p) => p.endsWith('_leg'));
    pivots.upper = new THREE.Vector3(0, legs.reduce((s, l) => s + hinges[l].y, 0) / legs.length, 0);
  }
  // 4. build the hierarchy: root -> (upper) -> parts, each part group sitting on its hinge
  const root = new THREE.Group();
  root.name = id;
  const groups = { root };
  if (pivots.upper) {
    const up = new THREE.Group();
    up.name = 'upper';
    up.position.copy(pivots.upper);
    root.add(up);
    groups.upper = up;
  }
  const order = [...cfg.parts].sort((a, b) => (cfg.parent[a] ? 1 : 0) - (cfg.parent[b] ? 1 : 0));
  const worldPivot = (name) => hinges[name] || pivots[name] || new THREE.Vector3();
  for (const p of order) {
    const g = new THREE.Group();
    g.name = p;
    const parentName = cfg.parent[p] || 'root';
    g.position.copy(hinges[p]).sub(worldPivot(parentName));
    (groups[parentName] || root).add(g);
    groups[p] = g;
    const mesh = new THREE.Mesh(bakePart(entries[p], baked[p], yawFix[p], atlas.tiles), material);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  // 5. the glowing core (made in code) in its socket
  if (cfg.core) {
    const ring = meshes.find((m) => m.name === cfg.core.socket);
    const rb = usedBox(ring.geometry).clone().applyMatrix4(ring.matrixWorld);
    const rc = rb.getCenter(new THREE.Vector3());
    const rs = rb.getSize(new THREE.Vector3());
    const core = new THREE.Group();
    core.name = 'core';
    core.position.set(rc.x, rc.y, rb.max.z - 0.25).sub(shift).sub(pivots.upper);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(rs.x, rs.y) * 0.3, Math.min(rs.x, rs.y) * 0.3, 0.3, 20), new THREE.MeshStandardMaterial({ color: STYLES[getStyle()].core, emissive: STYLES[getStyle()].core, emissiveIntensity: 0.8 }));
    disc.material.userData.role = 'core';
    disc.rotation.x = Math.PI / 2;
    core.add(disc);
    groups.upper.add(core);
  }
  return { root, atlas, hinges, yawFix, entries };
}

// ---------------------------------------------------------------- templates
const templates = { arcade: {}, mecha_pop: {} };
const failures = [];
export const modelInfo = { failures, templates };

export async function loadStyle(style, ids = Object.keys(MODEL_CONFIG)) {
  await Promise.all(
    ids.map(async (id) => {
      const cfg = MODEL_CONFIG[id];
      const url = `${import.meta.env.BASE_URL}assets/${id}${FILE_SUFFIX[style]}.glb`;
      try {
        const gltf = await load(url);
        const holder = place(gltf.scene, cfg);
        let t;
        if (cfg.kind === 'parts') t = { kind: 'parts', ...buildParts(id, holder, cfg) };
        else {
          holder.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = o.receiveShadow = true;
              if (o.material.map) o.material.map = shrinkTexture(o.material.map, TEX_MAX[cfg.kind === 'person' ? 'person' : 'prop']);
              o.material.map && (o.material.map.anisotropy = 4);
            }
          });
          t = { kind: cfg.kind, root: holder, animations: gltf.animations };
        }
        if (cfg.kind === 'person') t.prepared = prepareClips(t, cfg);
        templates[style][id] = t;
      } catch (e) {
        failures.push({ id, style, url, error: String(e?.message || e) });
        console.warn(`model ${url} failed to load:`, e);
      }
    }),
  );
  const T = templates[style];
  if (T.player && T.blaster) T.player.hold = blasterHold(T.player, T.player.prepared, MODEL_CONFIG.player.hand);
  if (!armTable) {
    try {
      armTable = await (await fetch(`${import.meta.env.BASE_URL}assets/player_armfix.json`)).json();
    } catch (e) {
      failures.push({ id: 'player_armfix', style, url: 'assets/player_armfix.json', error: String(e) });
      armTable = {};
    }
  }
  return T;
}
let armTable = null;

// Free a look's textures from the graphics card (they upload again if that look comes back).
export function releaseStyle(style) {
  for (const t of Object.values(templates[style] || {}))
    t.root.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) m.map?.dispose();
    });
}

export function hasTemplate(id, style = getStyle()) {
  return !!templates[style]?.[id];
}

// Models on / off (the greybox stays available). The registry asks this for a view before building a placeholder.
let modelsOn = false;
export const modelsEnabled = () => modelsOn;
export function setModelsOn(on) {
  modelsOn = on;
}
export function provideView(id) {
  return modelsOn && hasTemplate(id) ? modelView(id) : null;
}

// A view for a prop or a parts model, cloned from its template.
export function modelView(id, style = getStyle()) {
  const t = templates[style][id];
  if (t.kind === 'person') return new PlayerModelView(t, t.prepared, armTable, templates[style].blaster, t.hold);
  const root = t.root.clone(true);
  if (t.kind === 'parts') {
    // each view gets its own materials so flashes and glows stay on one hound
    root.traverse((o) => {
      if (o.isMesh) o.material = o.material.clone();
    });
    const v = new PlaceholderView(id, root);
    v.isModel = true;
    return v;
  }
  return {
    id,
    root,
    isModel: true,
    part: () => undefined,
    setState() {},
    flash() {},
    setGlow() {},
    update() {},
    detachPart: () => null,
  };
}
