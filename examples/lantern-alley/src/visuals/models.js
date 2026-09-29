import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { OBJECTS } from '../data/objects.js';
import { gradientMap } from './toon.js';

// Loads the Tripo GLBs and turns each into a builder for the visual registry.
// Every model is scaled to its size in OBJECTS (characters by height), sat on the
// ground, turned to face +Z, given toon shading and a black outline, and its
// animations are played by name with an AnimationMixer.

const CHARACTERS = ['hero', 'thug_skinny', 'thug_kicker', 'thug_fat', 'thug_crusher', 'boss'];
export const MODEL_IDS = [...CHARACTERS, 'dumpster', 'crate', 'trash_can', 'street_lamp'];

// Per-model fixes found by checking each model next to its placeholder (see lab.html).
// rotY: extra turn (radians) so the model faces +Z. pivot 'base': origin under the post, not the box centre.
export const MODEL_FIXES = {
  street_lamp: { pivot: 'base', rotY: -Math.PI / 2 },   // Tripo made the arm point +X; turn it to +Z
};
// Clips whose strike goes sideways: turn the whole clip (degrees about the up axis).
// front_kick_01's foot goes out at +81..88° (towards +X), so turn it back to straight ahead.
export const CLIP_YAW = { front_kick_01: -85 };

const TEXTURE_SIZE = { character: 1024, prop: 512 };
const OUTLINE = { character: 0.018, prop: 0.022 };   // metres
const FADE = 0.15;                                     // cross-fade between animations (s)
const ATTACK_FADE = 0.05;                              // ...into an attack
const ATTACK_CLIPS = new Set(['box_01', 'box_02', 'box_03', 'front_kick_01', 'slash']);
const LOOPING = new Set(['idle', 'walk', 'run', 'cheer']);
// How some clips are played (look only; gameplay timing does not change):
// start = skip to this fraction of the clip, speed = extra playback speed, fade = blend-in time (s).
// The Tripo hit reactions start with a calm guard pose and only react 20-30% in, so a thug hit
// over and over never visibly flinched. They now start at the impact and play faster.
const CLIP_PLAYBACK = {
  hit_to_body: { start: 0.12, speed: 1.8, fade: 0.04 },
  hit_to_head: { start: 0.04, speed: 1.4, fade: 0.04 },
};
// If a model has no clip for an animation, play a stand-in instead: [clip, speed].
const STAND_INS = { run: ['walk', 1.75] };

export const loadReport = [];     // what loaded, what did not, and why

// Fallback only: if thug_kicker.glb or thug_crusher.glb does not load, that enemy is shown as a
// recoloured, resized copy of the Sprat or Slab model (classic brawler palette swap).
// palette: texture colours whose hue (degrees) is in `hue` are shifted by `shift` degrees and
// their saturation / brightness multiplied by `sat` / `val`. Skin and hair are left alone.
// Hue ranges were picked from the textures' colours (lab.html?hues=1).
export const VARIANTS = {
  thug_kicker:  { base: 'thug_skinny', height: 1.82, palette: [
    { hue: [250, 305], shift: -100, sat: 1.3, val: 1.3 },     // purple top -> teal
    { hue: [188, 232], shift: 0, sat: 0.25, val: 0.45 },      // light-blue jeans -> charcoal
  ] },
  thug_crusher: { base: 'thug_fat', height: 1.85, palette: [
    { hue: [44, 80], shift: -62, sat: 1.6, val: 1.35 },       // olive vest -> red
  ] },
};

const RECOLOUR_GLSL = `
vec3 lab_rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 lab_hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`;

// Adds the recolour rules to a material's shader (applied to the texture colour).
function recolour(material, palette, key) {
  const rules = palette.map((r, i) => `
    if (h.y > 0.2 && h.x * 360.0 >= ${r.hue[0].toFixed(1)} && h.x * 360.0 <= ${r.hue[1].toFixed(1)}) {
      h.x = fract(h.x + ${(r.shift / 360).toFixed(4)} + 1.0); h.y = clamp(h.y * ${r.sat.toFixed(3)}, 0.0, 1.0); h.z = clamp(h.z * ${r.val.toFixed(3)}, 0.0, 1.0);
    }`).join('');
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + RECOLOUR_GLSL + '\n').replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec3 c = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));   // work in display (sRGB) colours
      vec3 h = lab_rgb2hsv(c);${rules}
      diffuseColor.rgb = pow(lab_hsv2rgb(h), vec3(2.2));
    }`);
  };
  material.customProgramCacheKey = () => 'recolour-' + key;
}

// ---------- loading ----------

export async function loadModels(base = './assets/') {
  const loader = new GLTFLoader();
  const protos = {};
  await Promise.all(MODEL_IDS.map(async id => {
    const file = `${id}.glb`;
    try {
      const gltf = await loader.loadAsync(base + file);
      protos[id] = await prepare(id, gltf);
      loadReport.push({ id, file, ok: true, ...protos[id].info });
    } catch (e) {
      loadReport.push({ id, file, ok: false, error: e.message || String(e) });
    }
  }));
  shareClips(protos);
  return protos;
}

// All four characters use the same (Mixamo) skeleton, so a clip one of them has can be played
// by another that lacks it. Borrow from the most similar body first. The hips height is scaled
// to the borrower and the body is kept over its own position.
const BORROW_FROM = {
  hero: ['boss', 'thug_fat', 'thug_skinny'],
  thug_skinny: ['hero', 'thug_kicker', 'boss', 'thug_fat'],
  thug_kicker: ['thug_skinny', 'hero', 'boss', 'thug_fat'],
  thug_fat: ['thug_crusher', 'boss', 'hero', 'thug_skinny'],
  thug_crusher: ['thug_fat', 'boss', 'hero', 'thug_skinny'],
  boss: ['thug_fat', 'hero', 'thug_skinny'],
};
const SHARED_CLIPS = ['run', 'box_01', 'box_02', 'box_03', 'front_kick_01', 'slash', 'cheer'];

function shareClips(protos) {
  for (const [id, to] of Object.entries(protos)) {
    if (!to.isChar) continue;
    for (const name of SHARED_CLIPS) {
      if (to.clips[name]) continue;
      const fromId = (BORROW_FROM[id] ?? []).find(f => protos[f]?.clips[name]);
      if (!fromId) continue;
      const from = protos[fromId];
      const clip = from.clips[name].clone();
      const k = to.restHips.length() / from.restHips.length();
      for (const track of clip.tracks) if (/Hips\.position$/.test(track.name)) for (let i = 0; i < track.values.length; i++) track.values[i] *= k;
      keepInPlace(clip, to.model);
      to.clips[name] = clip;
      to.info.clips[name] = { from: `${fromId}.glb: ${from.info.clips[name].from}`, seconds: +clip.duration.toFixed(3), borrowed: true };
      if (name === 'walk' || name === 'run') to.footSpeed[name] = measureFootSpeed(to.holder, clip);
    }
  }
}

async function prepare(id, gltf) {
  const isChar = CHARACTERS.includes(id);
  const fix = MODEL_FIXES[id] ?? {};
  const model = gltf.scene;
  const info = { triangles: 0, clips: {}, missing: [] };

  // Materials: toon shading with the base-colour map shrunk for phones.
  const texCache = new Map();
  const meshes = [];
  model.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const src = mesh.material;
    let map = null;
    if (src.map) {
      if (!texCache.has(src.map)) texCache.set(src.map, await shrink(src.map, isChar ? TEXTURE_SIZE.character : TEXTURE_SIZE.prop));
      map = texCache.get(src.map);
    }
    mesh.material = new THREE.MeshToonMaterial({ map, color: map ? 0xffffff : src.color, gradientMap: gradientMap() });
    mesh.material.name = src.name;
    src.dispose();
    info.triangles += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    if (mesh.isSkinnedMesh) mesh.frustumCulled = false;   // animated limbs leave the bind-pose bounds
  }
  for (const t of texCache.keys()) t.dispose();

  // Size, ground and facing, using the rest pose (T-pose for characters).
  const holder = new THREE.Group();       // scaled + rotated; the clone of this is what the game uses
  holder.add(model);
  holder.rotation.y = fix.rotY ?? 0;
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder, true);
  const size = box.getSize(new THREE.Vector3());
  const target = OBJECTS[id].size;
  const scale = isChar ? target[1] / size.y : Math.max(...target) / Math.max(size.x, size.y, size.z);
  holder.scale.setScalar(scale);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder, true);
  // Characters are centred on their hips (a bounding box is thrown off by hair, tails or T-pose arms);
  // the lamp on its post; other props on their bounding box.
  const hipsBone = isChar ? findHips(model) : null;
  const centre = hipsBone ? hipsBone.getWorldPosition(new THREE.Vector3())
    : fix.pivot === 'base' ? baseCentre(holder, box) : box.getCenter(new THREE.Vector3());
  holder.position.set(-centre.x, -box.min.y, -centre.z);
  holder.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(holder, true);
  info.scale = +scale.toFixed(4);
  info.size = finalBox.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3));

  // Black outline: the same mesh again, pushed out along smoothed normals, back faces only.
  for (const mesh of meshes) addOutline(mesh, (isChar ? OUTLINE.character : OUTLINE.prop) / mesh.getWorldScale(new THREE.Vector3()).x);

  // Animations: canonical names (hit_to_body_01 -> hit_to_body), hips kept in place.
  const clips = {};
  if (isChar) {
    const wanted = ['idle', 'walk', 'run', 'jump', 'fall', 'box_01', 'box_02', 'box_03', 'front_kick_01', 'slash',
      'hit_to_body', 'hit_to_head', 'defeat', 'cheer'];
    for (const name of wanted) {
      const clip = gltf.animations.find(c => c.name === name) ?? gltf.animations.find(c => c.name.startsWith(name + '_'));
      if (!clip) continue;
      if (CLIP_YAW[name]) turnClip(clip, model, CLIP_YAW[name]);
      keepInPlace(clip, model);
      clips[name] = clip;
      info.clips[name] = { from: clip.name, seconds: +clip.duration.toFixed(3) };
    }
  }

  // Walk/run: how fast the planted foot moves, so playback can match the real movement speed.
  const footSpeed = {};
  for (const name of ['walk', 'run']) if (clips[name]) footSpeed[name] = measureFootSpeed(holder, clips[name]);
  info.footSpeed = footSpeed;

  const restHips = hipsBone ? hipsBone.position.clone() : null;
  return { id, isChar, holder, clips, info, footSpeed, model, restHips };
}

// Speed (m/s) at which the foot on the ground slides backwards in an in-place walk/run clip.
function measureFootSpeed(holder, clip) {
  const probe = cloneSkinned(holder), mixer = new THREE.AnimationMixer(probe), act = mixer.clipAction(clip);
  act.play();
  const toes = [];
  probe.traverse(o => { if (o.isBone && /ToeBase$/.test(o.name)) toes.push(o); });
  const N = 200, samples = [];
  for (let i = 0; i <= N; i++) {
    act.time = (i / N) * clip.duration; mixer.update(0); probe.updateMatrixWorld(true);
    samples.push(toes.map(b => b.getWorldPosition(new THREE.Vector3())));
  }
  const minY = Math.min(...samples.flat().map(v => v.y)), speeds = [];
  for (let i = 1; i <= N; i++) for (let f = 0; f < toes.length; f++) {
    const a = samples[i - 1][f], b = samples[i][f];
    if (Math.max(a.y, b.y) < minY + 0.03) speeds.push(-(b.z - a.z) / (clip.duration / N));
  }
  speeds.sort((x, y) => x - y);
  mixer.stopAllAction();
  return speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
}

async function shrink(tex, size) {
  const img = tex.image;
  if (!img || Math.max(img.width, img.height) <= size) return tex.clone();
  const bitmap = await createImageBitmap(img, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const t = new THREE.Texture(bitmap);
  t.flipY = false;                       // glTF UV convention
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Centre of the lowest 15% of the model (the post of the lamp), so it stands where the design puts it.
function baseCentre(holder, box) {
  const limit = box.min.y + (box.max.y - box.min.y) * 0.15, v = new THREE.Vector3(), sum = new THREE.Vector3();
  let n = 0;
  holder.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y <= limit) { sum.add(v); n++; }
    }
  });
  return n ? sum.divideScalar(n) : box.getCenter(new THREE.Vector3());
}

// Rotates the hips (and so the whole body) of a clip about the world up axis.
function turnClip(clip, model, degrees) {
  const hips = findHips(model);
  if (!hips) return;
  model.updateMatrixWorld(true);
  const parentQ = hips.parent.getWorldQuaternion(new THREE.Quaternion());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(parentQ.invert());
  const turn = new THREE.Quaternion().setFromAxisAngle(up, THREE.MathUtils.degToRad(degrees));
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const track of clip.tracks) {
    const node = track.name.slice(0, track.name.lastIndexOf('.'));
    if (node !== THREE.PropertyBinding.sanitizeNodeName(hips.name)) continue;
    const vals = track.values;
    if (track.name.endsWith('.quaternion')) {
      for (let i = 0; i < vals.length; i += 4) q.fromArray(vals, i).premultiply(turn).toArray(vals, i);
    } else if (track.name.endsWith('.position')) {
      for (let i = 0; i < vals.length; i += 3) v.fromArray(vals, i).applyQuaternion(turn).toArray(vals, i);
    }
  }
}

function findHips(model) {
  let hips = null;
  model.traverse(o => { if (!hips && o.isBone && /Hips$/.test(o.name)) hips = o; });
  return hips;
}

// Keeps the body over the character's position: the hips stay at their rest-pose spot
// horizontally (only gameplay moves characters); up and down movement is kept (falls, bobs).
function keepInPlace(clip, model) {
  const hips = findHips(model);
  if (!hips) return;
  model.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const rest = hips.position.clone(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const track of clip.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 3) {
      p.fromArray(v, i);
      d.subVectors(p, rest);
      d.addScaledVector(up, -d.dot(up));      // horizontal part of the offset
      p.sub(d).toArray(v, i);
    }
  }
}

function addOutline(mesh, thickness) {
  const geo = mesh.geometry;
  if (!geo.attributes.outlineNormal) geo.setAttribute('outlineNormal', smoothNormals(geo));
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uThickness = { value: thickness };
    shader.vertexShader = 'attribute vec3 outlineNormal;\nuniform float uThickness;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += outlineNormal * uThickness;');
  };
  mat.customProgramCacheKey = () => 'outline';
  mat.userData.thickness = thickness;
  let outline;
  if (mesh.isSkinnedMesh) { outline = new THREE.SkinnedMesh(geo, mat); outline.bind(mesh.skeleton, mesh.bindMatrix); }
  else outline = new THREE.Mesh(geo, mat);
  outline.frustumCulled = mesh.frustumCulled;
  outline.userData.isOutline = true;
  outline.position.copy(mesh.position); outline.quaternion.copy(mesh.quaternion); outline.scale.copy(mesh.scale);
  mesh.parent.add(outline);
}

// Normals averaged over vertices that share a position, so the outline has no cracks at hard edges.
function smoothNormals(geo) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, key = i =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const acc = new Map();
  const n = new THREE.Vector3();
  if (!nrm) geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k) ?? acc.set(k, new THREE.Vector3()).get(k);
    a.add(n.fromBufferAttribute(normals, i));
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) acc.get(key(i)).clone().normalize().toArray(out, i * 3);
  return new THREE.BufferAttribute(out, 3);
}

// ---------- visuals ----------

export class ModelCharacter {
  // variant: optional { id, height, palette } for a recoloured, resized copy of the model.
  constructor(proto, variant = null) {
    this.look = 'model';
    this.proto = proto;
    this.root = new THREE.Group();
    this.model = cloneSkinned(proto.holder);
    this.root.add(this.model);
    this.sizeScale = variant ? variant.height / OBJECTS[proto.id].size[1] : 1;
    this.model.scale.multiplyScalar(this.sizeScale);
    this.materials = [];
    this.outlines = [];
    this.model.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.isOutline) this.outlines.push(o);
      const src = o.material;
      o.material = src.clone();               // own material: flash and fade per character
      o.material.onBeforeCompile = src.onBeforeCompile;          // clone() does not copy the outline shader hook
      o.material.customProgramCacheKey = src.customProgramCacheKey;
      if (variant?.palette && !o.userData.isOutline) recolour(o.material, variant.palette, variant.id);
      this.materials.push(o.material);
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null;
    this.flashTime = 0;
  }

  duration(anim) { return this.proto.clips[anim]?.duration ?? 1; }

  // Missing clip -> stand-in from STAND_INS (e.g. run -> walk at 1.75x).
  resolve(anim, timeScale) {
    if (this.proto.clips[anim] || !STAND_INS[anim]) return [anim, timeScale];
    const [clip, speed] = STAND_INS[anim];
    return [clip, timeScale * speed];
  }

  action(anim) {
    if (!this.actions[anim] && this.proto.clips[anim]) this.actions[anim] = this.mixer.clipAction(this.proto.clips[anim]);
    return this.actions[anim];
  }

  // start: begin part-way into the clip (fraction), e.g. a combo follow-up skipping its wind-up.
  play(anim, { loop, timeScale = 1, start } = {}) {
    this.anim = anim;
    const looping = loop ?? LOOPING.has(anim);
    [anim, timeScale] = this.resolve(anim, timeScale);
    const next = this.action(anim);
    if (!next) return;
    const how = CLIP_PLAYBACK[anim] ?? {};
    next.reset();
    next.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !looping;
    next.timeScale = timeScale * (how.speed ?? 1);
    next.time = (start ?? how.start ?? 0) * next.getClip().duration;
    next.setEffectiveWeight(1);
    next.play();
    // Attacks blend in fast, so the blow is fully formed when it lands.
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, how.fade ?? (ATTACK_CLIPS.has(anim) ? ATTACK_FADE : FADE), false);
    this.current = next;
  }

  hitFlash() { this.flashTime = 0.05; }   // short and not fully white, so the reaction pose stays readable

  // Fading: hide the black outline hull (it would show through the see-through body) and keep
  // the body writing depth so only its front surface blends with the scene.
  setOpacity(a) {
    for (const o of this.outlines) o.visible = a >= 1;
    for (const m of this.materials) { m.transparent = a < 1; m.opacity = a; }
  }

  // info.moveSpeed: how fast the character really moves (m/s). Walk and run are played at the
  // matching speed so the feet do not slide.
  update(dt, info = {}) {
    const clip = this.current?.getClip().name;
    const foot = this.proto.footSpeed[clip] * this.sizeScale;
    if (foot > 0.1 && info.moveSpeed != null && (this.anim === 'walk' || this.anim === 'run')) {
      this.current.timeScale = THREE.MathUtils.clamp(info.moveSpeed / foot, 0.4, 3);
    }
    this.mixer.update(dt);
    if (this.flashTime > 0 || this.flashing) {
      this.flashTime -= dt;
      this.flashing = this.flashTime > 0;
      for (const m of this.materials) if (m.emissive) m.emissive.setScalar(this.flashing ? 0.55 : 0);
    }
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
}

export class ModelProp {
  constructor(proto) {
    this.look = 'model';
    this.root = new THREE.Group();
    this.root.add(proto.holder.clone());
  }
  duration() { return 1; }
  play() {}
  hitFlash() {}
  setOpacity() {}
  update() {}
  dispose() {}
}

// id -> builder for the registry
export function modelBuilders(protos) {
  const out = {};
  for (const [id, proto] of Object.entries(protos)) {
    out[id] = () => (proto.isChar ? new ModelCharacter(proto) : new ModelProp(proto));
  }
  for (const [id, v] of Object.entries(VARIANTS)) {
    const proto = protos[v.base];
    if (!protos[id] && proto) out[id] = () => new ModelCharacter(proto, { id, ...v });   // own file missing
  }
  return out;
}
