// Prints what is inside each GLB: triangles, bounds, textures, skeleton, animations.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { readFileSync } from 'node:fs';

const assets = JSON.parse(readFileSync('assets.json', 'utf8')).assets;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const a of assets) {
  const path = `public/assets/${a.id}.glb`;
  let doc;
  try { doc = await io.read(path); } catch (e) { console.log(`\n${a.id}: FAILED TO READ - ${e.message}`); continue; }
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  console.log(`\n${a.id}: ${tris} triangles (budget ${a.triangle_budget}), meshes ${root.listMeshes().length}, materials ${root.listMaterials().length}`);
  console.log(`  bounds min ${b.min.map(v => v.toFixed(2))} max ${b.max.map(v => v.toFixed(2))} size ${size}`);
  for (const t of root.listTextures()) {
    const s = t.getSize();
    const slots = root.listMaterials().flatMap(m => ['BaseColor', 'Normal', 'MetallicRoughness', 'Emissive', 'Occlusion'].filter(k => m[`get${k}Texture`]?.() === t));
    console.log(`  texture ${s?.join('x')} ${t.getMimeType()} [${slots.join(',')}]`);
  }
  for (const m of root.listMaterials()) console.log(`  material "${m.getName()}" color ${m.getBaseColorFactor().map(v => v.toFixed(2))} metal ${m.getMetallicFactor()} rough ${m.getRoughnessFactor()} alpha ${m.getAlphaMode()}`);
  const skins = root.listSkins();
  if (skins.length) console.log(`  skins ${skins.length}, joints ${skins[0].listJoints().length}: ${skins[0].listJoints().slice(0, 6).map(j => j.getName()).join(', ')} ...`);
  const anims = root.listAnimations();
  const want = new Set(a.animations);
  for (const an of anims) {
    let dur = 0;
    for (const s of an.listSamplers()) dur = Math.max(dur, s.getInput().getMax([])[0]);
    console.log(`  anim "${an.getName()}" ${dur.toFixed(3)}s channels ${an.listChannels().length}`);
  }
  const names = anims.map(x => x.getName());
  const missing = a.animations.filter(n => !names.some(m => m === n || m.toLowerCase().includes(n)));
  if (a.animations.length) console.log(`  expected ${a.animations.length}, found ${anims.length}; missing: ${missing.join(', ') || 'none'}`);
}
