// Lists what is really inside each GLB: nodes, meshes (triangles, world-space size and centre), skins, animations, materials, textures.
import fs from 'node:fs';
import * as THREE from 'three';

const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('public/assets').filter((f) => f.endsWith('.glb')).map((f) => 'public/assets/' + f);
function readGlb(path) {
  const b = fs.readFileSync(path);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const bin = b.slice(binStart);
  return { json, bin };
}
function imageSize(buf, mime) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20), 'png'];
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5), 'jpg'];
      i += 2 + len;
    }
  }
  if (buf.slice(0, 4).toString() === 'RIFF') return ['?', '?', 'webp'];
  return ['?', '?', mime];
}
for (const f of files) {
  const { json: j, bin } = readGlb(f);
  console.log(`\n=== ${f}  (${(fs.statSync(f).size / 1e6).toFixed(2)} MB)`);
  // world matrices
  const world = new Map();
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const w = parent.clone().multiply(m);
    world.set(ni, w);
    (n.children || []).forEach((c) => walk(c, w));
  };
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, new THREE.Matrix4());
  let tris = 0;
  const all = new THREE.Box3();
  const rows = [];
  j.nodes.forEach((n, ni) => {
    if (n.mesh === undefined) return;
    const mesh = j.meshes[n.mesh];
    const box = new THREE.Box3();
    let t = 0;
    const mats = new Set();
    for (const p of mesh.primitives) {
      const acc = j.accessors[p.attributes.POSITION];
      const lb = new THREE.Box3(new THREE.Vector3(...acc.min), new THREE.Vector3(...acc.max));
      if (n.skin === undefined) lb.applyMatrix4(world.get(ni));
      box.union(lb);
      t += p.indices !== undefined ? j.accessors[p.indices].count / 3 : acc.count / 3;
      mats.add(p.material);
    }
    tris += t;
    all.union(box);
    const s = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    rows.push(`  mesh node "${n.name}" (mesh "${mesh.name}") tris ${t} size ${s.x.toFixed(2)} x ${s.y.toFixed(2)} x ${s.z.toFixed(2)} centre (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}) materials [${[...mats]}]${n.skin !== undefined ? ' SKINNED' : ''}`);
  });
  const S = all.getSize(new THREE.Vector3());
  console.log(`nodes ${j.nodes.length}, meshes ${j.meshes?.length || 0}, triangles ${tris}, bounds ${S.x.toFixed(2)} x ${S.y.toFixed(2)} x ${S.z.toFixed(2)}, min (${all.min.x.toFixed(2)}, ${all.min.y.toFixed(2)}, ${all.min.z.toFixed(2)})`);
  console.log(`scene roots: ${j.scenes[j.scene || 0].nodes.map((r) => `"${j.nodes[r].name}"`).join(', ')}`);
  rows.forEach((r) => console.log(r));
  if (j.skins) j.skins.forEach((s, i) => console.log(`  skin ${i}: ${s.joints.length} joints: ${s.joints.slice(0, 60).map((k) => j.nodes[k].name).join(', ')}`));
  if (j.animations)
    j.animations.forEach((a) => {
      let dur = 0;
      for (const s of a.samplers) dur = Math.max(dur, j.accessors[s.input].max[0]);
      console.log(`  animation "${a.name}" ${dur.toFixed(2)} s, ${a.channels.length} channels`);
    });
  (j.materials || []).forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness || {};
    const maps = [];
    if (pbr.baseColorTexture) maps.push('base#' + pbr.baseColorTexture.index);
    if (pbr.metallicRoughnessTexture) maps.push('metalRough#' + pbr.metallicRoughnessTexture.index);
    if (m.normalTexture) maps.push('normal#' + m.normalTexture.index);
    if (m.emissiveTexture) maps.push('emissive#' + m.emissiveTexture.index);
    if (m.occlusionTexture) maps.push('ao#' + m.occlusionTexture.index);
    console.log(`  material ${i} "${m.name}" maps [${maps.join(', ')}] metallic ${pbr.metallicFactor ?? 1} rough ${pbr.roughnessFactor ?? 1} double ${!!m.doubleSided} alpha ${m.alphaMode || 'OPAQUE'}`);
  });
  (j.textures || []).forEach((t, i) => {
    const img = j.images[t.source];
    const bv = j.bufferViews[img.bufferView];
    const buf = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const [w, h, fmt] = imageSize(buf, img.mimeType);
    console.log(`  texture ${i} -> image ${t.source} ${w}x${h} ${fmt} ${(bv.byteLength / 1e3).toFixed(0)} kB`);
  });
}
