// Reads the JSON part of each GLB and prints what is inside (no three.js needed).
import { readFileSync, readdirSync } from 'node:fs';
const dir = 'public/assets/';
for (const f of readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
  const b = readFileSync(dir + f);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString());
  const tris = (j.meshes ?? []).reduce((s, m) => s + m.primitives.reduce((t, p) => t + (p.indices != null ? j.accessors[p.indices].count / 3 : j.accessors[p.attributes.POSITION].count / 3), 0), 0);
  console.log(`\n== ${f}  (${(b.length / 1024).toFixed(0)} KB)`);
  console.log(' generator:', j.asset?.generator, '| scenes:', j.scenes?.length, '| nodes:', j.nodes?.length, '| meshes:', j.meshes?.length, '| triangles:', tris);
  console.log(' mesh nodes:', j.nodes.filter((n) => n.mesh != null).map((n) => n.name).join(', '));
  console.log(' materials:', (j.materials ?? []).map((m) => `${m.name} [${['baseColorTexture'].filter((k) => m.pbrMetallicRoughness?.[k]).concat(m.pbrMetallicRoughness?.metallicRoughnessTexture ? ['metalRough'] : [], m.normalTexture ? ['normal'] : [], m.emissiveTexture ? ['emissive'] : [], m.occlusionTexture ? ['ao'] : []).join('+')}] metal=${m.pbrMetallicRoughness?.metallicFactor} rough=${m.pbrMetallicRoughness?.roughnessFactor} alpha=${m.alphaMode ?? 'OPAQUE'} doubleSided=${!!m.doubleSided}`).join(' | '));
  console.log(' images:', (j.images ?? []).map((i) => `${i.name ?? ''}(${i.mimeType}, ${(j.bufferViews[i.bufferView].byteLength / 1024).toFixed(0)} KB)`).join(', '));
  if (j.skins) console.log(' skins:', j.skins.length, 'joints:', j.skins[0].joints.length, '→', j.skins[0].joints.map((i) => j.nodes[i].name).join(','));
  if (j.animations) console.log(' animations:', j.animations.map((a) => { const acc = j.accessors[a.samplers[0].input]; return `"${a.name}" (${(acc.max?.[0] ?? 0).toFixed(2)} s, ${a.channels.length} ch)`; }).join(', '));
  const root = j.scenes[j.scene ?? 0].nodes.map((i) => j.nodes[i]);
  console.log(' root nodes:', root.map((n) => `${n.name} r=${JSON.stringify(n.rotation ?? null)} s=${JSON.stringify(n.scale ?? null)} t=${JSON.stringify(n.translation ?? null)}`).join(' ; '));
}
