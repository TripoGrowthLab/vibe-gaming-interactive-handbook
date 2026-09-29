// Everything about how objects LOOK (and sound) lives here.
// Gameplay only calls createView(id) and talks to the returned view:
//   view.root            – Object3D that gameplay positions in the world
//   view.setState(name)  – visual state (skier: idle / ski / carve / crash)
//   view.update(dt, p)   – per-frame visual update (p: { lean, yaw, speed })
//   view.hit()           – impact reaction (sway / jolt)
// Placeholders come from BUILDERS; 3D models come from attachModels() and are switched with setVisualMode().
// Every builder returns a Group whose origin is the centre of the feet / base, facing +Z.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { OBJECTS } from './defs.js';
import { CFG } from './config.js';
import { findBones, matchClip, armAngleAt, ArmFixer } from './skierRig.js';
import { playCrash } from './sfx.js';
import armData from './data/skier_arms.json';

const matCache = new Map();
function mat(color, { own = false, ...opts } = {}) {
  if (own) return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts });
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts }));
  return matCache.get(key);
}

function mesh(name, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (name, w, h, d, material, x, y, z) => mesh(name, new THREE.BoxGeometry(w, h, d), material, x, y, z);
const cyl = (name, rTop, rBot, h, material, x, y, z, seg = 8) =>
  mesh(name, new THREE.CylinderGeometry(rTop, rBot, h, seg), material, x, y, z);
// Capsule: r = radius, len = straight middle part; total height = len + 2r.
const cap = (name, r, len, material, x, y, z) => mesh(name, new THREE.CapsuleGeometry(r, len, 4, 8), material, x, y, z);
const group = (name, ...children) => {
  const g = new THREE.Group();
  g.name = name;
  children.forEach((c) => g.add(c));
  return g;
};

// ---------- Placeholder builders (boxes, cylinders, capsules only) ----------

function buildSkis() {
  const skiMat = mat(0xf97316);
  return group('skis',
    box('ski_l', 0.1, 0.04, 1.6, skiMat, 0.13, 0.02, 0.1),
    box('ski_r', 0.1, 0.04, 1.6, skiMat, -0.13, 0.02, 0.1),
    box('ski_tip_l', 0.1, 0.06, 0.12, skiMat, 0.13, 0.06, 0.86), // raised tips show the front (+Z)
    box('ski_tip_r', 0.1, 0.06, 0.12, skiMat, -0.13, 0.06, 0.86),
  );
}

function buildSkier() {
  const jacket = mat(0x3b82f6, { own: true });
  const pants = mat(0x1e3a5f);
  const dark = mat(0x222831);
  const skin = mat(0xf2c7a5);
  const white = mat(0xffffff);

  const skis = buildSkis();
  const poleL = cyl('pole_l', 0.015, 0.015, 1.15, dark, 0.33, 0.62, -0.12);
  const poleR = cyl('pole_r', 0.015, 0.015, 1.15, dark, -0.33, 0.62, -0.12);
  poleL.rotation.x = poleR.rotation.x = -0.35;
  const armL = cap('arm_l', 0.07, 0.4, jacket, 0.27, 1.08, 0.04);
  const armR = cap('arm_r', 0.07, 0.4, jacket, -0.27, 1.08, 0.04);
  armL.rotation.x = armR.rotation.x = 0.35;

  // 'body' pivots at the ankles so it can tuck forward; 'lean' pivots at the feet for carving/falling.
  const body = group('body',
    cyl('leg_l', 0.09, 0.09, 0.75, pants, 0.13, 0.43, 0),
    cyl('leg_r', 0.09, 0.09, 0.75, pants, -0.13, 0.43, 0),
    cap('torso', 0.2, 0.3, jacket, 0, 1.12, 0),
    box('zip', 0.06, 0.4, 0.03, white, 0, 1.12, 0.19), // front marker (+Z)
    armL, armR, poleL, poleR,
    cap('head', 0.13, 0.04, skin, 0, 1.55, 0),
    cyl('hat', 0.12, 0.14, 0.1, mat(0xef4444), 0, 1.66, 0),
    box('goggles', 0.22, 0.06, 0.05, mat(0xffb020), 0, 1.57, 0.12), // faces +Z
  );
  body.position.y = 0.05;
  body.children.forEach((c) => (c.position.y -= 0.05));
  const lean = group('lean', skis, body);
  const root = group('skier_visual', lean);
  root.userData.jacket = jacket;
  return root;
}

function buildPineTree() {
  const trunk = mat(0x7a4a2a);
  const needles = mat(0x2f7d4a);
  const snow = mat(0xf4f8ff);
  return group('pine_tree_visual',
    cyl('trunk', 0.22, 0.28, 1.2, trunk, 0, 0.6, 0),
    cyl('tier_1', 0.35, 1.2, 1.7, needles, 0, 1.75, 0),
    cyl('tier_2', 0.25, 0.95, 1.5, needles, 0, 2.9, 0),
    cyl('tier_3', 0.05, 0.65, 1.4, needles, 0, 4.0, 0),
    cyl('snow_1', 0.3, 0.5, 0.25, snow, 0, 2.55, 0),
    cyl('snow_2', 0.2, 0.35, 0.25, snow, 0, 3.6, 0),
    cyl('snow_top', 0.03, 0.18, 0.3, snow, 0, 4.85, 0),
  );
}

function buildBoulder() {
  const rock = mat(0x8a8f98);
  return group('boulder_visual',
    box('rock', 1.8, 0.95, 1.5, rock, 0, 0.475, 0),
    box('rock_top', 1.3, 0.2, 1.1, rock, 0, 1.0, -0.05),
    box('snow_cap', 1.1, 0.12, 0.9, mat(0xf4f8ff), 0, 1.14, -0.05),
    box('face', 1.0, 0.5, 0.04, mat(0x6f747d), 0, 0.45, 0.76), // front marker (+Z)
  );
}

function buildLog() {
  const bark = mat(0x6b3f22);
  const cut = mat(0xd9a766);
  const trunk = cyl('trunk', 0.3, 0.3, 3.3, bark, 0, 0.3, 0);
  trunk.rotation.z = Math.PI / 2; // lies across X
  const endL = cyl('end_l', 0.26, 0.26, 0.1, cut, 1.7, 0.3, 0);
  const endR = cyl('end_r', 0.26, 0.26, 0.1, cut, -1.7, 0.3, 0);
  endL.rotation.z = endR.rotation.z = Math.PI / 2;
  return group('log_visual', trunk, endL, endR, box('snow', 2.4, 0.08, 0.3, mat(0xf4f8ff), 0, 0.62, 0));
}

function buildSnowman() {
  const snow = mat(0xf4f8ff);
  const bucket = cyl('bucket_hat', 0.15, 0.19, 0.2, mat(0x9a6232), 0, 1.7, 0);
  const nose = box('nose', 0.06, 0.06, 0.2, mat(0xf97316), 0, 1.5, 0.27); // points +Z
  return group('snowman_visual',
    cap('base', 0.45, 0.0, snow, 0, 0.45, 0),
    cap('middle', 0.32, 0.0, snow, 0, 1.08, 0),
    cap('head', 0.2, 0.0, snow, 0, 1.5, 0),
    bucket, nose,
    box('eye_l', 0.05, 0.05, 0.03, mat(0x222831), 0.07, 1.56, 0.19),
    box('eye_r', 0.05, 0.05, 0.03, mat(0x222831), -0.07, 1.56, 0.19),
    box('scarf', 0.5, 0.1, 0.5, mat(0xdc2626), 0, 1.3, 0),
  );
}

function buildLiftPylon() {
  const steel = mat(0x4b5563);
  const paint = mat(0xfacc15);
  return group('lift_pylon_visual',
    box('footing', 1.2, 0.3, 1.2, mat(0x9ca3af), 0, 0.15, 0),
    box('mast', 0.5, 6.4, 0.5, steel, 0, 3.5, 0),
    box('stripe', 0.52, 0.4, 0.52, paint, 0, 1.4, 0),
    box('crossarm', 1.2, 0.25, 0.4, steel, 0, 6.8, 0),
    box('sign', 0.4, 0.3, 0.04, paint, 0, 2.2, 0.27), // front marker (+Z)
  );
}

function buildEdgeFence() {
  const post = mat(0x7a4a2a);
  return group('edge_fence_visual',
    cyl('post_l', 0.05, 0.05, 1.2, post, 1.95, 0.6, 0),
    cyl('post_r', 0.05, 0.05, 1.2, post, -1.95, 0.6, 0),
    box('net', 3.9, 0.9, 0.04, mat(0xff7a1a, { transparent: true, opacity: 0.85 }), 0, 0.65, 0.02),
  );
}

export const BUILDERS = {
  skier: buildSkier,
  skis: buildSkis,
  pine_tree: buildPineTree,
  boulder: buildBoulder,
  log: buildLog,
  snowman: buildSnowman,
  lift_pylon: buildLiftPylon,
  edge_fence: buildEdgeFence,
};

// ---------- 3D models (Stage 5) ----------
// Models replace placeholders only here. Gameplay keeps talking to the same view API.
// Props are drawn as one InstancedMesh per id (few draw calls on phones); Juno is a skinned clone per view.

const ARMS = armData.clips;
const SKIER_CLIPS = {
  // state → which Tripo clip (matched by closest name) and how to play it
  idle: { want: 'idle', loop: true, speed: 1, fade: 0.3 },
  ski: { want: 'ski_glide', loop: true, speed: 1, fade: 0.25 },
  crash: { want: 'defeat_02', loop: false, from: 1.4, to: 3.15, speed: 1.5, fade: 0.1 }, // after the head-snap: stumble + fall
};
SKIER_CLIPS.carve = SKIER_CLIPS.ski; // the carve lean is done in code on top of the ski clip
const KNOCKBACK = 0.8; // m the model is thrown back from what she hit (the pine's branches reach 1.54 m)
const LYING_HALF_WIDTH = 1.0; // m her arms/head reach sideways from the hips when lying in the snow

let models = null;          // { id: { template, gltf, box } }
let mode = 'greybox';       // 'greybox' | 'model'
let batchScene = null;
const views = [];           // every live view, so the look can be switched at any time
let lastHit = null;         // world position of the prop hit last (so Juno can fall away from it)
const batches = {};         // id → [Batch] (one per mesh in the model)

export function attachModels(scene, loaded) {
  batchScene = scene;
  models = loaded;
  for (const [id, m] of Object.entries(models)) {
    if (id === 'skier' || id === 'skis') continue;
    batches[id] = [];
    m.template.updateMatrixWorld(true);
    m.template.traverse((o) => { if (o.isMesh) batches[id].push(new Batch(o)); });
  }
  for (const v of views) v._attachModel?.();
  setVisualMode('model');
}

export function setVisualMode(m) {
  mode = m === 'model' && models ? 'model' : 'greybox';
  for (const v of views) v._applyMode();
  return mode;
}
export const getVisualMode = () => mode;
export const hasModels = () => !!models;

class Batch {
  constructor(mesh) {
    this.geometry = mesh.geometry;
    this.material = mesh.material;
    this.offset = mesh.matrixWorld.clone(); // mesh relative to the template origin (feet/base centre)
    this.anchors = [];
    this.capacity = 0;
    this.mesh = null;
    this.ensure(64);
  }
  ensure(n) {
    if (n <= this.capacity) return;
    let cap = Math.max(64, this.capacity);
    while (cap < n) cap *= 2;
    if (this.mesh) batchScene.remove(this.mesh);
    const im = new THREE.InstancedMesh(this.geometry, this.material, cap);
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.count = 0;
    batchScene.add(im);
    this.mesh = im;
    this.capacity = cap;
  }
}

const _m4 = new THREE.Matrix4();
const _me = new THREE.Vector3();
const _col = new THREE.Color();
// Copy every visible anchor's world matrix into its batch. Call once per frame after the scene matrices update.
export function syncBatches() {
  let drawn = 0;
  for (const list of Object.values(batches)) {
    for (const b of list) {
      if (mode !== 'model') { b.mesh.count = 0; continue; }
      b.ensure(b.anchors.length);
      let n = 0;
      for (const a of b.anchors) {
        if (!a.userData.root.visible) continue;
        b.mesh.setMatrixAt(n, _m4.multiplyMatrices(a.matrixWorld, b.offset));
        // Hit feedback on a painted model: brighten its own colours instead of adding white.
        b.mesh.setColorAt(n, _col.setScalar(1 + 0.6 * (a.userData.flash ?? 0)));
        n++;
      }
      b.mesh.count = n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      drawn += n;
    }
  }
  return drawn;
}

// ---------- Visual states ----------

const SKIER_COLORS = { idle: 0x3b82f6, ski: 0x22c55e, carve: 0xeab308, crash: 0xef4444 };
const DEG = Math.PI / 180;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

function skierView(root, visual, placeholder) {
  const lean = placeholder.getObjectByName('lean');
  const body = placeholder.getObjectByName('body');
  const modelLean = new THREE.Group(); // model version: lean pivot at the feet
  modelLean.name = 'model_lean';
  visual.add(modelLean);
  const modelTurn = new THREE.Group(); // turns only her body in a crash; the skis stay put
  modelTurn.name = 'model_turn';
  modelLean.add(modelTurn);
  let state = 'idle', crashT = 0, crashSide = 1, lastLean = 0, crashAway = null;
  let rig = null; // { mixer, actions, fixer, body, deck }

  function attachModel() {
    if (rig || !models?.skier) return;
    const juno = SkeletonUtils.clone(models.skier.template); // own skeleton per character
    juno.name = 'juno';
    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'model_body';
    bodyGroup.add(juno);
    modelTurn.add(bodyGroup);
    let deck = 0;
    if (models.skis) {
      const skis = models.skis.template.clone();
      skis.name = 'model_skis';
      modelLean.add(skis);
      deck = models.skis.deck ?? 0;
    }
    const mixer = new THREE.AnimationMixer(juno);
    const clips = models.skier.gltf.animations;
    const actions = {};
    for (const [st, spec] of Object.entries(SKIER_CLIPS)) {
      const clip = matchClip(clips, spec.want);
      if (!clip || actions[st]) continue;
      const a = mixer.clipAction(clip);
      a.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.timeScale = spec.speed;
      actions[st] = { action: a, spec, arms: ARMS[clip.name] };
    }
    if (actions.ski) actions.carve = actions.ski;
    rig = { mixer, actions, fixer: new ArmFixer(findBones(juno)), body: bodyGroup, deck, current: null };
    play(state, 0);
  }

  function play(st, fade) {
    const next = rig?.actions[st];
    if (!next || rig.current === next) return;
    const a = next.action;
    a.reset();
    if (next.spec.from) a.time = next.spec.from;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (rig.current && fade > 0) rig.current.action.crossFadeTo(a, fade, false);
    else for (const other of Object.values(rig.actions)) if (other !== next) other.action.stop();
    rig.current = next;
  }

  function updateModel(dt) {
    if (!rig) return;
    rig.fixer.restore();
    rig.mixer.update(dt);
    const cur = rig.current;
    if (cur?.spec.to && cur.action.time >= cur.spec.to) { cur.action.time = cur.spec.to; cur.action.paused = true; }
    // Blend the per-clip fixes by each clip's current weight.
    let aL = 0, aR = 0, hx = 0, hz = 0, lift = 0, wsum = 0;
    for (const [st, e] of Object.entries(rig.actions)) {
      if (st === 'carve') continue;
      const w = e.action.isRunning() || e.action.paused ? e.action.getEffectiveWeight() : 0;
      if (!w || !e.arms) continue;
      aL += w * armAngleAt(e.arms, 'L', e.action.time);
      aR += w * armAngleAt(e.arms, 'R', e.action.time);
      hx += w * e.arms.hips[0];
      hz += w * e.arms.hips[1];
      lift += w * -Math.min(0, e.arms.lowest);
      wsum += w;
    }
    if (wsum > 0) { aL /= wsum; aR /= wsum; hx /= wsum; hz /= wsum; lift /= wsum; }
    // Keep the body centred over the feet; stand on the ski deck.
    rig.body.position.set(-hx, rig.deck + lift, -hz);
    rig.body.updateMatrixWorld(true);
    rig.fixer.apply(aL, aR);
  }

  const view = {
    setState(s) {
      if (s === state) return;
      state = s;
      placeholder.userData.jacket.color.setHex(SKIER_COLORS[s] ?? 0xffffff);
      if (s === 'crash') { crashT = 0; crashSide = lean.rotation.z >= 0 ? 1 : -1; crashAway = null; lastHit = null; }
      if (s === 'idle') {
        lean.rotation.set(0, 0, 0);
        lean.position.set(0, 0, 0);
        body.rotation.set(0, 0, 0);
        visual.rotation.set(0, 0, 0);
        modelLean.rotation.set(0, 0, 0);
        modelTurn.rotation.set(0, 0, 0);
        modelTurn.position.set(0, 0, 0);
      }
      if (rig) play(s, s === 'idle' ? 0 : (SKIER_CLIPS[s]?.fade ?? 0.2));
    },
    get state() { return state; },
    update(dt, p = {}) {
      updateModel(dt);
      if (state === 'crash') {
        crashT += dt;
        const k = Math.min(crashT / 0.35, 1);
        lean.rotation.z = damp(lean.rotation.z, crashSide * 85 * DEG, 14, dt);
        lean.rotation.x = damp(lean.rotation.x, -25 * DEG, 10, dt);
        body.rotation.x = damp(body.rotation.x, 0.5, 10, dt);
        lean.position.y = -0.1 * k;
        modelLean.rotation.z = damp(modelLean.rotation.z, 0, 10, dt); // the fall comes from the animation
        // defeat_03 falls forward: turn her to face away from what she hit, so she falls clear of it.
        if (crashAway === null) {
          if (lastHit) {
            root.getWorldPosition(_me);
            crashAway = Math.atan2(_me.x - lastHit.x, _me.z - lastHit.z);
          } else crashAway = (Math.sign(p.lean || lastLean) || 1) * Math.PI / 2;
          // Never fall through the edge fence (her head ends ~0.9 m past the knock-back point). Mirroring
          // sideways could send her back into what she hit, so fall straight uphill: she just came from there.
          root.getWorldPosition(_me);
          if (Math.abs(_me.x + Math.sin(crashAway) * (KNOCKBACK + 0.9)) > CFG.RUN_HALF_WIDTH - 0.2) crashAway = Math.PI;
        }
        let target = crashAway - visual.rotation.y;
        target = Math.atan2(Math.sin(target), Math.cos(target)); // shortest way round
        modelTurn.rotation.y = damp(modelTurn.rotation.y, target, 12, dt);
        // Knock her back out of the obstacle's branches/edge (visual only: gameplay has already ended the run).
        const kb = 1 - (1 - Math.min(crashT / 0.3, 1)) ** 2;
        // Knock-back in world axes, then slide inward if lying there would put her arms through the fence net.
        root.getWorldPosition(_me);
        let ox = Math.sin(crashAway) * KNOCKBACK * kb;
        const oz = Math.cos(crashAway) * KNOCKBACK * kb;
        const limit = CFG.RUN_HALF_WIDTH - 0.05 - LYING_HALF_WIDTH;
        const wx = _me.x + ox;
        if (Math.abs(wx) > limit) ox -= Math.sign(wx) * (Math.abs(wx) - limit) * kb;
        const a = visual.rotation.y; // world → the visual group's local axes
        modelTurn.position.set(ox * Math.cos(a) - oz * Math.sin(a), 0, ox * Math.sin(a) + oz * Math.cos(a));
        return;
      }
      const tuck = state === 'idle' ? 0 : 12 * DEG;
      const targetLean = state === 'carve' ? -(p.lean ?? 0) * 20 * DEG : -(p.lean ?? 0) * 8 * DEG;
      if (p.lean) lastLean = p.lean;
      lean.rotation.z = damp(lean.rotation.z, targetLean, 12, dt);
      modelLean.rotation.z = lean.rotation.z;
      modelTurn.rotation.y = 0;
      modelTurn.position.set(0, 0, 0);
      body.rotation.x = damp(body.rotation.x, tuck, 8, dt);
      visual.rotation.y = damp(visual.rotation.y, p.yaw ?? 0, 12, dt);
    },
    hit() {},
    _attachModel: attachModel,
    _applyMode() {
      const useModel = mode === 'model' && !!rig;
      placeholder.visible = !useModel;
      modelLean.visible = useModel;
    },
    get _rig() { return rig; },
  };
  attachModel();
  return view;
}

// Props: impact sway (a jolt that decays; the root/hitbox never moves) plus a brief brighten on the model.
function propView(id, root, visual, placeholder) {
  const anchor = new THREE.Object3D();
  anchor.name = 'model_anchor';
  anchor.userData.root = root;
  anchor.userData.flash = 0;
  visual.add(anchor);
  let t = 99, dir = 1, registered = false;
  const view = {
    setState() {},
    get state() { return 'static'; },
    hit(side = 1) {
      t = 0;
      dir = side;
      lastHit = root.getWorldPosition(new THREE.Vector3());
      playCrash();
    },
    update(dt) {
      if (t > 1.5) { visual.rotation.z = 0; anchor.userData.flash = 0; return; }
      t += dt;
      visual.rotation.z = dir * 0.12 * Math.sin(t * 22) * Math.exp(-t * 4);
      anchor.userData.flash = Math.exp(-t * 5);
      if (mode === 'greybox') placeholder.scale.setScalar(1 + 0.08 * anchor.userData.flash);
    },
    _attachModel() {
      if (registered || !batches[id]) return;
      for (const b of batches[id]) b.anchors.push(anchor);
      registered = true;
    },
    _applyMode() {
      placeholder.visible = !(mode === 'model' && registered);
      placeholder.scale.setScalar(1);
    },
  };
  view._attachModel();
  return view;
}

export function createView(id) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`No builder for id "${id}"`);
  const root = new THREE.Group();
  root.name = id;
  const visual = new THREE.Group(); // pivot for sway / yaw; holds the placeholder and the model
  visual.name = 'visual';
  const placeholder = build();
  visual.add(placeholder);
  root.add(visual);
  root.rotation.y = OBJECTS[id]?.yaw ?? 0;
  const behaviour = id === 'skier' ? skierView(root, visual, placeholder) : propView(id, root, visual, placeholder);
  behaviour._applyMode();
  views.push(behaviour);
  return {
    id,
    root,
    part: (name) => root.getObjectByName(name),
    setState: (s) => behaviour.setState(s),
    get state() { return behaviour.state; },
    update: (dt, p) => behaviour.update(dt, p),
    hit: (side) => behaviour.hit?.(side),
    get rig() { return behaviour._rig; },
  };
}

// Debug: wireframe of a gameplay hitbox (toggle with H).
const hitboxMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
export function buildHitboxHelper(id) {
  const def = OBJECTS[id];
  const h = def.size[1];
  const hb = def.hitbox;
  const geo = hb.type === 'circle'
    ? new THREE.CylinderGeometry(hb.r, hb.r, h, 16)
    : new THREE.BoxGeometry(hb.w, h, hb.d);
  const m = new THREE.Mesh(geo, hitboxMat);
  m.position.y = h / 2;
  m.name = 'hitbox_helper';
  return m;
}
