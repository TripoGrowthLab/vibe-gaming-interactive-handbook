// Lists what is really inside each GLB: nodes, meshes, triangles, materials, textures, animations.
// Bounding boxes are recomputed from the vertex data (the min/max stored in files is not trusted).
// Usage: node tools/inspect-glb.mjs [file ...]   (default: every .glb in public/assets)
import fs from 'node:fs';
import path from 'node:path';

const DIR = new URL('../public/assets/', import.meta.url).pathname;

export function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readAccessor(g, idx) {
  const a = g.json.accessors[idx];
  const bv = g.json.bufferViews[a.bufferView];
  const [T, size] = COMP[a.componentType];
  const n = NCOMP[a.type];
  const stride = bv.byteStride || size * n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = base + i * stride + c * size;
      let v;
      switch (a.componentType) {
        case 5126: v = dv.getFloat32(o, true); break;
        case 5125: v = dv.getUint32(o, true); break;
        case 5123: v = dv.getUint16(o, true); break;
        case 5122: v = dv.getInt16(o, true); break;
        case 5121: v = dv.getUint8(o); break;
        default: v = dv.getInt8(o);
      }
      if (a.normalized) {
        if (a.componentType === 5121) v /= 255;
        else if (a.componentType === 5123) v /= 65535;
        else if (a.componentType === 5120) v = Math.max(v / 127, -1);
        else if (a.componentType === 5122) v = Math.max(v / 32767, -1);
      }
      out[i * n + c] = v;
    }
  }
  return out;
}

// ---- tiny 4x4 matrix helpers (column-major like glTF) ----
function compose(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function apply(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

export function worldMatrices(g) {
  const nodes = g.json.nodes || [];
  const world = new Array(nodes.length);
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const local = (n) => n.matrix || compose(n.translation, n.rotation, n.scale);
  const get = (i) => {
    if (world[i]) return world[i];
    const l = local(nodes[i]);
    world[i] = parent[i] >= 0 ? mul(get(parent[i]), l) : l;
    return world[i];
  };
  nodes.forEach((_, i) => get(i));
  return { world, parent };
}

function imageSize(g, imgIdx) {
  const img = g.json.images[imgIdx];
  if (img.bufferView === undefined) return { mime: img.mimeType, uri: img.uri };
  const bv = g.json.bufferViews[img.bufferView];
  const b = g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50) return { mime: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: bv.byteLength };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o < b.length) {
      const marker = b[o + 1];
      const len = b.readUInt16BE(o + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { mime: 'jpeg', w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5), bytes: bv.byteLength };
      o += 2 + len;
    }
  }
  if (b.subarray(0, 4).toString() === 'RIFF') return { mime: 'webp', bytes: bv.byteLength };
  return { mime: img.mimeType, bytes: bv.byteLength };
}

export function inspect(file) {
  const g = readGlb(file);
  const j = g.json;
  const { world } = worldMatrices(g);
  const meshNodes = [];
  let triangles = 0;
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  (j.nodes || []).forEach((n, i) => {
    if (n.mesh === undefined) return;
    const m = j.meshes[n.mesh];
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    let tris = 0;
    const mats = [];
    for (const p of m.primitives) {
      const pos = readAccessor(g, p.attributes.POSITION);
      for (let v = 0; v < pos.length; v += 3) {
        const w = apply(world[i], pos[v], pos[v + 1], pos[v + 2]);
        for (let k = 0; k < 3; k++) {
          box.min[k] = Math.min(box.min[k], w[k]);
          box.max[k] = Math.max(box.max[k], w[k]);
        }
      }
      tris += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
      mats.push(p.material);
    }
    for (let k = 0; k < 3; k++) {
      all.min[k] = Math.min(all.min[k], box.min[k]);
      all.max[k] = Math.max(all.max[k], box.max[k]);
    }
    triangles += tris;
    const size = box.max.map((v, k) => v - box.min[k]);
    const centre = box.max.map((v, k) => (v + box.min[k]) / 2);
    meshNodes.push({ node: n.name, mesh: m.name, tris, materials: mats, size, centre, min: box.min, max: box.max, attrs: Object.keys(m.primitives[0].attributes) });
  });
  const materials = (j.materials || []).map((m, i) => {
    const pbr = m.pbrMetallicRoughness || {};
    return {
      i,
      name: m.name,
      baseColorTex: pbr.baseColorTexture?.index,
      mrTex: pbr.metallicRoughnessTexture?.index,
      normalTex: m.normalTexture?.index,
      emissiveTex: m.emissiveTexture?.index,
      metallic: pbr.metallicFactor,
      roughness: pbr.roughnessFactor,
      doubleSided: !!m.doubleSided,
      alpha: m.alphaMode,
    };
  });
  const textures = (j.textures || []).map((t, i) => ({ i, image: t.source, ...imageSize(g, t.source) }));
  const animations = (j.animations || []).map((a) => ({ name: a.name, channels: a.channels.length }));
  return {
    file: path.basename(file),
    generator: j.asset?.generator,
    extensionsUsed: j.extensionsUsed || [],
    nodes: (j.nodes || []).length,
    meshNodes,
    triangles,
    size: all.max.map((v, k) => v - all.min[k]),
    min: all.min,
    max: all.max,
    materials,
    textures,
    images: (j.images || []).length,
    animations,
    skins: (j.skins || []).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter((f) => f.endsWith('.glb')).sort().map((f) => DIR + f);
  const f3 = (a) => a.map((v) => v.toFixed(3)).join(', ');
  for (const f of files) {
    const r = inspect(f);
    console.log(`\n=== ${r.file}  (${r.generator}) ext=${JSON.stringify(r.extensionsUsed)}`);
    console.log(`  nodes ${r.nodes}, mesh nodes ${r.meshNodes.length}, triangles ${r.triangles}, materials ${r.materials.length}, textures ${r.textures.length}, animations ${r.animations.length}, skins ${r.skins}`);
    console.log(`  whole size [${f3(r.size)}]  min [${f3(r.min)}]  max [${f3(r.max)}]`);
    for (const m of r.meshNodes) console.log(`  - node "${m.node}" mesh "${m.mesh}" tris ${m.tris} mat ${m.materials} size [${f3(m.size)}] centre [${f3(m.centre)}]`);
    for (const m of r.materials) console.log(`  mat ${m.i} "${m.name}" color:${m.baseColorTex} mr:${m.mrTex} normal:${m.normalTex} emis:${m.emissiveTex} metal ${m.metallic} rough ${m.roughness} ds ${m.doubleSided}`);
    for (const t of r.textures) console.log(`  tex ${t.i} img ${t.image} ${t.mime} ${t.w}x${t.h} ${(t.bytes / 1024).toFixed(0)} KB`);
    for (const a of r.animations) console.log(`  anim "${a.name}" channels ${a.channels}`);
  }
}
