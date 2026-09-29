// Model lab (dev only): every model next to its greybox placeholder, both facing +Z (towards
// the camera), plus measurements: size, facing, and where each strike really lands in its clip.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { greyboxBuilders } from './visuals/registry.js';
import { loadModels, loadReport, ModelCharacter, ModelProp, VARIANTS } from './visuals/models.js';
import { OBJECTS } from './data/objects.js';
import { ATTACKS } from './config.js';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'front';     // front | side | top
const anim = params.get('anim');                  // optional: pose all characters at a clip fraction
const at = Number(params.get('at') ?? 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a2b55, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(4, 10, 6); scene.add(sun);
const grid = new THREE.GridHelper(40, 40, 0x888888, 0xbbbbbb); scene.add(grid);

const ORDER = ['hero', 'thug_skinny', 'thug_kicker', 'thug_fat', 'thug_crusher', 'boss', 'dumpster', 'crate', 'trash_can', 'street_lamp'];
const ATTACKS_OF = { hero: ['jab', 'cross', 'hook', 'kick', 'combo_kick', 'dash_hook', 'flying_kick'], thug_skinny: ['sprat_jab', 'sprat_cross'], thug_kicker: ['flick_kick'],
  thug_fat: ['slab_swing', 'slab_hook'], thug_crusher: ['crusher_cross', 'crusher_hook', 'crusher_stomp'], boss: ['anvil_haymaker', 'anvil_kick', 'anvil_smash'] };

const protos = await loadModels('/assets/');

// ?hues=1: which hues each character's texture uses (to pick recolour ranges for variants).
if (params.has('hues')) {
  const out = {};
  for (const id of ['thug_skinny', 'thug_fat']) {
    let img = null; protos[id].holder.traverse(o => { if (!img && o.isMesh && o.material.map) img = o.material.map.image; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const bins = Array.from({ length: 24 }, () => ({ n: 0, s: 0, v: 0 })); let total = 0;
    for (let i = 0; i < px.length; i += 4 * 7) {
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (mx < 0.05) continue; total++;
      const sat = mx ? d / mx : 0; if (sat < 0.2) continue;
      let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
      const bin = bins[Math.floor(h / 15)]; bin.n++; bin.s += sat; bin.v += mx;
    }
    out[id] = bins.map((b, i) => b.n / total > 0.005 ? `${i * 15}-${i * 15 + 15}deg ${(100 * b.n / total).toFixed(1)}% s${(b.s / b.n).toFixed(2)} v${(b.v / b.n).toFixed(2)}` : null).filter(Boolean);
  }
  document.getElementById('out').textContent = JSON.stringify(out, null, 1);
  window.__lab = out;
  throw new Error('hues done');
}

// Contact sheet: ?sheet=hero:box_02 shows one character at 11 moments of a clip, facing right (+X).
if (params.has('sheet')) {
  const [id, clipName] = params.get('sheet').split(':');
  const proto = protos[id], clip = proto.clips[clipName];
  const fr = [0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.85];
  const step = OBJECTS[id].size[1] * 0.75;
  fr.forEach((f, i) => {
    const m = new ModelCharacter(proto);
    m.root.position.set(i * step, 0, 0);
    m.root.rotation.y = Math.PI / 2;
    scene.add(m.root);
    const act = m.mixer.clipAction(clip); act.play(); act.time = f * clip.duration; m.mixer.update(0);
  });
  const w = (fr.length - 1) * step;
  const cam = new THREE.OrthographicCamera(-w / 2 - step, w / 2 + step, step * 1.6, -step * 0.4, 0.1, 100);
  cam.position.set(w / 2, 1, 20); cam.lookAt(w / 2, 1, 0);
  renderer.render(scene, cam);
  const lab = document.getElementById('labels');
  fr.forEach((f, i) => { const d = document.createElement('div'); d.textContent = f; d.style.left = `${((i * step - (w / 2 - w / 2 - step)) / (w + 2 * step)) * innerWidth}px`; d.style.top = '4px'; lab.appendChild(d); });
  document.getElementById('out').remove();
  window.__lab = { sheet: true };
  throw new Error('sheet done');   // stop the normal lab
}
const results = { load: loadReport, models: {} };
const labels = [];
let x = -ORDER.length * 1.6;
const visuals = [];
for (const id of ORDER) {
  const size = OBJECTS[id].size;
  const grey = greyboxBuilders[id](size);
  grey.root.position.set(x, 0, 0);
  scene.add(grey.root);
  visuals.push({ v: grey, grey: true });
  const variant = !protos[id] && VARIANTS[id] ? { id, ...VARIANTS[id] } : null;   // stand-in only if the file is missing
  const proto = protos[id] ?? (variant && protos[variant.base]);
  if (proto) {
    const m = proto.isChar ? new ModelCharacter(proto, variant) : new ModelProp(proto);
    m.root.position.set(x + Math.max(1.2, size[0] * 0.5 + 0.9), 0, 0);
    scene.add(m.root);
    visuals.push({ v: m, id });
    if (anim && proto.isChar && proto.clips[anim]) {
      m.play(anim, { loop: false });
      m.mixer.update(0.2);                         // finish the cross-fade
      m.current.time = at * proto.clips[anim].duration;
      m.mixer.update(0);
    }
    results.models[id] = measure(id, proto, m);
    if (variant) results.models[id].variantOf = variant.base;
  }
  labels.push({ id, pos: new THREE.Vector3(x + 0.6, Math.max(size[1], 1) + 0.4, 0) });
  x += Math.max(3.2, size[0] + 2.2);
}

// ---- measurements ----
function measure(id, proto, visual) {
  const r = { ...proto.info };
  const root = visual.root;
  root.updateMatrixWorld(true);
  if (!proto.isChar) {
    if (id === 'street_lamp') {
      // which way the arm points: centroid of the top 20% relative to the post
      const box = new THREE.Box3().setFromObject(root, true), v = new THREE.Vector3(), top = new THREE.Vector3();
      let n = 0;
      root.traverse(o => { if (!o.isMesh || o.userData.isOutline) return; const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > box.max.y - 0.2 * (box.max.y - box.min.y)) { top.add(v); n++; } } });
      top.divideScalar(n).sub(root.position);
      r.armPointsTo = { x: +top.x.toFixed(2), z: +top.z.toFixed(2) };
    }
    return r;
  }
  const bone = name => { let b = null; visual.model.traverse(o => { if (o.isBone && o.name.replace(/[^A-Za-z]/g, '').endsWith(name)) b = b ?? o; }); return b; };
  const wpos = (b) => b.getWorldPosition(new THREE.Vector3()).sub(root.position);
  const lh = wpos(bone('LeftHand')), rh = wpos(bone('RightHand'));
  const lf = wpos(bone('LeftFoot')), lt = wpos(bone('LeftToeBase'));
  r.facing = {
    leftHandX: +lh.x.toFixed(2), rightHandX: +rh.x.toFixed(2), toeAheadOfFootZ: +(lt.z - lf.z).toFixed(3),
    facesPlusZ: lh.x > 0 && rh.x < 0 && lt.z > lf.z,
  };

  // Strike timing: sample the attack clip and find when the hand/foot is furthest forward (+Z).
  const probe = new ModelCharacter(proto);
  const hips = n => { let b = null; probe.model.traverse(o => { if (o.isBone && o.name.replace(/[^A-Za-z]/g, '').endsWith(n)) b = b ?? o; }); return b; };
  const parts = { hand: [hips('LeftHand'), hips('RightHand')], foot: [hips('LeftToeBase'), hips('RightToeBase')] };
  r.attacks = {};
  for (const name of ATTACKS_OF[id]) {
    const def = ATTACKS[name], clip = proto.clips[def.anim];
    if (!clip) { r.attacks[name] = 'clip missing'; continue; }
    const act = probe.mixer.clipAction(clip); probe.mixer.stopAllAction(); act.reset().play();
    const limbs = def.anim === 'front_kick_01' ? parts.foot : parts.hand;
    const N = 240, ext = [];
    for (let i = 0; i <= N; i++) {
      act.time = (i / N) * clip.duration; probe.mixer.update(0); probe.root.updateMatrixWorld(true);
      const hipZ = hips('Hips').getWorldPosition(new THREE.Vector3()).z;
      ext.push(Math.max(...limbs.map(b => b.getWorldPosition(new THREE.Vector3()).z - hipZ)));
    }
    // Where the limb is furthest from the hips horizontally, and which way it points (0° = straight ahead, +Z).
    let far = 0, farAt = 0, farDir = 0;
    for (let i = 0; i <= N; i++) {
      act.time = (i / N) * clip.duration; probe.mixer.update(0); probe.root.updateMatrixWorld(true);
      const hp = hips('Hips').getWorldPosition(new THREE.Vector3());
      for (const b of limbs) {
        const d = b.getWorldPosition(new THREE.Vector3()).sub(hp); const h = Math.hypot(d.x, d.z);
        if (h > far) { far = h; farAt = i / N; farDir = Math.round(Math.atan2(d.x, d.z) * 180 / Math.PI); }
      }
    }
    const rest = ext[0], peak = Math.max(...ext), iPeak = ext.indexOf(peak);
    // "extended" = more than 70% of the way from rest to peak
    const thr = rest + 0.7 * (peak - rest);
    const ranges = []; let s = -1;
    ext.forEach((e, i) => { if (e >= thr && s < 0) s = i; if ((e < thr || i === N) && s >= 0) { ranges.push([+(s / N).toFixed(2), +((e < thr ? i - 1 : i) / N).toFixed(2)]); s = -1; } });
    const [h0, h1] = def.hit;
    const inWindow = ext.slice(Math.round(h0 * N), Math.round(h1 * N) + 1);
    r.attacks[name] = {
      clip: def.anim, seconds: +clip.duration.toFixed(2), attackLasts: +(clip.duration / def.speed).toFixed(2),
      designWindow: def.hit, hitLandsAtSec: [+(h0 * clip.duration / def.speed).toFixed(2), +(h1 * clip.duration / def.speed).toFixed(2)],
      peakAt: +(iPeak / N).toFixed(3), extendedRanges: ranges, reachAtPeakM: +(peak).toFixed(2),
      limbExtendedDuringWindow: Math.max(...inWindow) >= thr,
      furthest: { at: +farAt.toFixed(2), metres: +far.toFixed(2), directionDeg: farDir },
    };
  }
  // Head height through the defeat clip: does the character actually fall down?
  if (proto.clips.defeat) {
    const clip = proto.clips.defeat, act = probe.mixer.clipAction(clip); probe.mixer.stopAllAction(); act.reset().play();
    const head = hips('Head'), hs = [];
    for (let i = 0; i <= 40; i++) { act.time = (i / 40) * clip.duration; probe.mixer.update(0); probe.root.updateMatrixWorld(true); hs.push(+head.getWorldPosition(new THREE.Vector3()).y.toFixed(2)); }
    r.defeatHeadHeight = hs;
  }
  // Foot speed of walk/run: how fast the foot on the ground slides backwards (= the speed the
  // body should move for the feet not to slide).
  r.footSpeed = {};
  for (const cname of ['walk', 'run']) {
    const clip = proto.clips[cname]; if (!clip) continue;
    const act = probe.mixer.clipAction(clip); probe.mixer.stopAllAction(); act.reset().play();
    const toes = [hips('LeftToeBase'), hips('RightToeBase')], N = 200, samples = [];
    for (let i = 0; i <= N; i++) {
      act.time = (i / N) * clip.duration; probe.mixer.update(0); probe.root.updateMatrixWorld(true);
      samples.push(toes.map(b => b.getWorldPosition(new THREE.Vector3())));
    }
    const minY = Math.min(...samples.flat().map(v => v.y)), speeds = [];
    for (let i = 1; i <= N; i++) for (let f = 0; f < 2; f++) {
      const a = samples[i - 1][f], b = samples[i][f];
      if (Math.max(a.y, b.y) < minY + 0.03) speeds.push(-(b.z - a.z) / (clip.duration / N));   // planted foot moving back (-Z)
    }
    speeds.sort((x, y) => x - y);
    r.footSpeed[cname] = +(speeds[Math.floor(speeds.length / 2)] ?? 0).toFixed(2);
  }
  // Where each clip keeps the hips (after keep-in-place), compared with the rest pose, in metres.
  r.hipsOffsetCm = {};
  { const hb = hips('Hips'); probe.mixer.stopAllAction(); probe.mixer.update(0);
    for (const [cname, clip] of Object.entries(proto.clips)) {
      const act = probe.mixer.clipAction(clip); probe.mixer.stopAllAction(); act.reset().play(); act.time = 0; probe.mixer.update(0); probe.root.updateMatrixWorld(true);
      const p = hb.getWorldPosition(new THREE.Vector3()).sub(probe.root.position);
      r.hipsOffsetCm[cname] = [Math.round(p.x * 100), Math.round(p.z * 100)];
    } }
  // How far each clip turns the body: hips yaw vs. the rest pose, at the start and averaged.
  r.clipYawDeg = {};
  const hipsBone = hips('Hips');
  for (const [cname, clip] of Object.entries(proto.clips)) {
    const act = probe.mixer.clipAction(clip); probe.mixer.stopAllAction(); act.reset().play();
    const yaws = [];
    for (let i = 0; i <= 40; i++) {
      act.time = (i / 40) * clip.duration; probe.mixer.update(0); probe.root.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(hipsBone.getWorldQuaternion(new THREE.Quaternion()));
      const l = new THREE.Vector3(1, 0, 0).applyQuaternion(hipsBone.getWorldQuaternion(new THREE.Quaternion()));
      yaws.push(Math.atan2(l.x, l.z));     // hips' left axis angle; T-pose left axis ~ +X
    }
    const rest = Math.atan2(1, 0);
    const deg = a => Math.round(((a - rest) * 180 / Math.PI + 540) % 360 - 180);
    r.clipYawDeg[cname] = { start: deg(yaws[0]), mid: deg(yaws[20]), end: deg(yaws[40]) };
  }
  probe.dispose();
  return r;
}

// ---- camera + labels ----
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
const midX = (-ORDER.length * 1.6 + x) / 2;
const dist = 30;
if (view === 'front') camera.position.set(midX, 2, dist);
else if (view === 'side') camera.position.set(midX + dist, 2, 0);
else camera.position.set(midX, dist, 0.01);
camera.lookAt(midX, 1, 0);
renderer.render(scene, camera);
const lab = document.getElementById('labels');
for (const l of labels) {
  const p = l.pos.clone().project(camera);
  const d = document.createElement('div'); d.textContent = l.id + ' (grey | model)';
  d.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; d.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`; lab.appendChild(d);
}
document.getElementById('out').textContent = JSON.stringify(results, null, 1);
window.__lab = results;
