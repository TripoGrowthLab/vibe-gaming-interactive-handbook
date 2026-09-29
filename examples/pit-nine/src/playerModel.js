// Tamsin as a rigged model: plays Tripo clips by name with an AnimationMixer, blends between states, runs the legs
// and the upper body from different clips when she runs and shoots, keeps her arms out of her body, and holds the
// blaster in her right hand. Implements the same View interface as the placeholders.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { matchClip } from './clipmatch.js';
import { ArmBase, applyArmTurn, tableAt, ARM_BONES } from './armfix.js';

const LOWER = ['mixamorigHips', 'mixamorigSpine', 'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigLeftToeBase', 'mixamorigLeftToe_End', 'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase', 'mixamorigRightToe_End'];
const isLower = (trackName) => LOWER.includes(trackName.split('.')[0]);
const FADE = 0.12; // seconds for a blend between states

// ---------------------------------------------------------------- one-time preparation of the clips
// Returns { states: { name: { lower, upper, duration, loop, clamp } }, runSpeed, report }
export function prepareClips(template, cfg) {
  const all = template.animations;
  const states = {};
  const report = {};
  const hipsRest = template.root.getObjectByName('mixamorigHips').position.clone();
  for (const [state, c] of Object.entries(cfg.clips)) {
    const m = matchClip(all, c.match);
    if (!m) {
      report[state] = { wanted: c.match, found: null };
      continue;
    }
    let clip = m.clip.clone();
    const from = c.from ?? 0;
    const to = c.to ?? clip.duration;
    if (c.from !== undefined || c.to !== undefined) clip = cut(clip, from, to);
    if (c.recentre) recentre(clip, hipsRest);
    const lower = new THREE.AnimationClip(`${state}.lower`, clip.duration, clip.tracks.filter((t) => isLower(t.name)));
    const upper = new THREE.AnimationClip(`${state}.upper`, clip.duration, clip.tracks.filter((t) => !isLower(t.name)));
    states[state] = { full: clip, lower: c.upper ? null : lower, upper, duration: clip.duration, loop: !!c.loop, clamp: !!c.clamp, from };
    report[state] = { wanted: c.match, found: m.clip.name, how: m.how, used: `${from.toFixed(2)}-${to.toFixed(2)} s` };
  }
  const prepared = { states, report };
  if (states.run) prepared.runSpeed = measureRunSpeed(template, states.run.full);
  return prepared;
}
// keep only [from, to] of a clip, starting at 0 (with exact values at both ends)
function cut(clip, from, to) {
  const tracks = clip.tracks.map((t) => {
    const size = t.getValueSize();
    const interp = t.createInterpolant();
    const times = [from, ...Array.from(t.times).filter((x) => x > from && x < to), to];
    const values = [];
    for (const x of times) values.push(...interp.evaluate(x).slice(0, size));
    return new t.constructor(t.name, times.map((x) => x - from), values);
  });
  return new THREE.AnimationClip(clip.name, to - from, tracks);
}
// 'stay in place' can leave the body ahead of or behind the feet: put the hips back over the rest spot (x, z)
function recentre(clip, rest) {
  const t = clip.tracks.find((tr) => tr.name === 'mixamorigHips.position');
  if (!t) return;
  const v = t.values;
  let mx = 0, mz = 0;
  const n = v.length / 3;
  for (let i = 0; i < n; i++) (mx += v[i * 3]), (mz += v[i * 3 + 2]);
  mx /= n;
  mz /= n;
  for (let i = 0; i < n; i++) (v[i * 3] += rest.x - mx), (v[i * 3 + 2] += rest.z - mz);
}

// How fast the run clip really moves: speed of the planted foot, measured while it is on the ground (m/s at timeScale 1).
export function measureRunSpeed(template, runClip) {
  const inst = SkeletonUtils.clone(template.root);
  const mixer = new THREE.AnimationMixer(inst);
  const act = mixer.clipAction(runClip);
  act.play();
  const feet = ['mixamorigLeftToeBase', 'mixamorigRightToeBase'].map((n) => inst.getObjectByName(n));
  const samples = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    act.time = (runClip.duration * i) / N;
    mixer.update(0);
    inst.updateMatrixWorld(true);
    samples.push(feet.map((f) => new THREE.Vector3().setFromMatrixPosition(f.matrixWorld)));
  }
  const dt = runClip.duration / N;
  let sum = 0, count = 0;
  for (let k = 0; k < 2; k++) {
    const minY = Math.min(...samples.map((s) => s[k].y));
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1][k], b = samples[i][k];
      if (a.y < minY + 0.03 && b.y < minY + 0.03) (sum += Math.abs(b.z - a.z) / dt), count++;
    }
  }
  return count ? sum / count : 5;
}

// ---------------------------------------------------------------- the view
export class PlayerModelView {
  constructor(template, prepared, armTable, blasterTemplate, blasterHold) {
    this.id = 'player';
    this.isModel = true;
    this.root = new THREE.Group();
    this.root.name = 'player';
    this.model = SkeletonUtils.clone(template.root);
    this.root.add(this.model);
    this.meshes = [];
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds do not follow the animation
        this.meshes.push(o);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.prepared = prepared;
    this.armTable = armTable || {};
    this.actions = {};
    for (const [s, c] of Object.entries(prepared.states)) {
      const mk = (clip) => {
        if (!clip) return null;
        const a = this.mixer.clipAction(clip);
        a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = true;
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.play();
        return a;
      };
      this.actions[s] = { lower: mk(c.lower), upper: mk(c.upper), cfg: c, w: 0, wu: 0 };
    }
    this.bones = { left: this.model.getObjectByName(ARM_BONES.left.upper), right: this.model.getObjectByName(ARM_BONES.right.upper) };
    // the three spine joints share the twist that turns the upper body back toward the aim
    this.spines = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'].map((n) => this.model.getObjectByName(n)).filter(Boolean);
    this.armBase = new ArmBase(this.bones);
    this.spineBase = new BoneBase(this.spines);
    this.legYaw = 0; // where the legs face, relative to the aim
    this.back = false; // backpedalling (aiming far behind the run direction)
    // the arm fix is measured in the upper body's own frame, which turns with the chest
    this.armFrame = new THREE.Object3D();
    this.root.add(this.armFrame);
    this.state = 'idle';
    this.base = 'idle';
    this.shootW = 0;
    this.flashT = 0;
    this.t = 0;
    this.turns = { left: null, right: null };
    // the blaster in the right hand
    if (blasterTemplate && blasterHold) {
      // a holder carries the hand offset; the blaster inside keeps its own size and grounding
      this.gun = new THREE.Group();
      this.gun.name = 'blaster';
      this.gun.matrixAutoUpdate = false;
      this.gun.matrix.copy(blasterHold.matrix);
      this.gun.add(blasterTemplate.root.clone(true));
      this.model.getObjectByName(blasterHold.bone).add(this.gun);
    }
    this.startBase('idle');
  }
  part() {
    return undefined;
  }
  detachPart() {
    return null;
  }
  setGlow() {}
  flash(sec = 0.1) {
    this.flashT = Math.max(this.flashT, sec);
  }
  setState(s) {
    if (s === this.state) return;
    this.state = s;
    // 'run' and 'idle' are chosen from the real speed in update(); the rest are full-body one-shots or loops
    if (s !== 'run' && s !== 'idle') this.startBase(s);
    else if (this.base !== 'idle' && this.base !== 'run') this.startBase('idle');
  }
  startBase(s) {
    const a = this.actions[s];
    if (!a) return;
    this.base = s;
    if (!a.cfg.loop) {
      a.lower?.reset().play();
      a.upper?.reset().play();
    }
  }
  update(dt, info = {}) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const speed = info.speed ?? 0;
    // idle <-> run blend follows the real speed; run plays at the speed that keeps the feet planted
    const loco = this.base === 'idle' || this.base === 'run';
    const runMix = loco ? THREE.MathUtils.smoothstep(speed, 0.4, 2.5) : 0;
    // Where she faces. The game turns her root toward the aim; here the legs turn toward where she runs.
    // Not shooting: the whole body follows the legs. Shooting: the upper body twists back toward the aim, and
    // when the aim is far behind the run direction she backpedals (legs face the aim, run clip played backward).
    const mx = info.moveLocalX ?? 0, mz = info.moveLocalZ ?? 1;
    const aiming = info.shooting || this.shootW > 0.5;
    let want = 0;
    let back = false;
    if (loco && speed > 0.3) {
      const d = Math.atan2(mx, mz); // run direction compared with the aim
      back = aiming && Math.abs(d) > (this.back ? 1.75 : 2.0); // 100 / 115 degrees, so it does not flicker
      want = back ? wrap(d - Math.PI) : d;
    }
    this.back = back;
    this.legYaw += wrap(want - this.legYaw) * (1 - Math.exp(-TURN * dt));
    this.model.rotation.y = this.legYaw;
    const run = this.actions.run;
    if (run) {
      const ts = (speed / (this.prepared.runSpeed || 5)) * (back ? -1 : 1);
      run.lower && (run.lower.timeScale = ts || 1);
      run.upper && (run.upper.timeScale = ts || 1);
    }
    const roll = this.actions.roll;
    if (roll) for (const a of [roll.lower, roll.upper]) a && (a.timeScale = roll.cfg.duration / 0.45);
    const hurt = this.actions.hurt;
    if (hurt) for (const a of [hurt.lower, hurt.upper]) a && (a.timeScale = hurt.cfg.duration / 0.35);
    const kd = this.actions.knocked_down;
    if (kd) for (const a of [kd.lower, kd.upper]) a && (a.timeScale = 1.6);
    // upper body: shoot on top of idle / run
    const wantShoot = loco && info.shooting ? 1 : 0;
    this.shootW += Math.sign(wantShoot - this.shootW) * Math.min(Math.abs(wantShoot - this.shootW), dt / FADE);
    // target weights
    const k = Math.min(1, dt / FADE);
    for (const [s, a] of Object.entries(this.actions)) {
      let target = 0;
      if (loco) target = s === 'idle' ? 1 - runMix : s === 'run' ? runMix : 0;
      else target = s === this.base ? 1 : 0;
      a.w += (target - a.w) * k;
      const up = s === 'shoot' ? this.shootW : a.w * (1 - this.shootW);
      a.lower?.setEffectiveWeight(a.w);
      a.upper?.setEffectiveWeight(up);
    }
    // pose: undo last frame's hand-made turns, let the mixer pose, remember that pose, then turn again
    this.armBase.restore();
    this.spineBase.restore();
    this.mixer.update(dt);
    this.armBase.save();
    this.spineBase.save();
    // upper body back toward the aim while shooting, shared over the three spine joints
    const counter = -this.legYaw * this.shootW;
    if (Math.abs(counter) > 0.001) for (const b of this.spines) twist(b, this.root, counter / this.spines.length);
    this.armFrame.rotation.y = this.legYaw + counter;
    this.armFrame.updateMatrixWorld(true);
    // keep the arms out of the body: blend each playing clip's table by its weight
    let L = null, R = null;
    for (const [s, a] of Object.entries(this.actions)) {
      const tab = this.armTable[s];
      const w = s === 'shoot' ? this.shootW : Math.max(a.w * (1 - this.shootW), 0);
      if (!tab || w < 0.01) continue;
      const act = a.upper || a.lower;
      const t = act.time;
      tableAt(tab, t, this.turns);
      if (this.turns.left?.[3] && (!L || this.turns.left[3] * w > L[3])) L = [...this.turns.left.slice(0, 3), this.turns.left[3] * w];
      if (this.turns.right?.[3] && (!R || this.turns.right[3] * w > R[3])) R = [...this.turns.right.slice(0, 3), this.turns.right[3] * w];
    }
    if (L || R) {
      this.model.updateMatrixWorld(true);
      applyArmTurn(this.bones, this.armFrame, L, R);
    }
    // blink while protected after a hit, white flash when hit
    const blink = info.invuln > 0 && this.state !== 'roll' && Math.floor(info.invuln * 16) % 2 === 0;
    this.root.visible = !blink;
    for (const m of this.meshes) {
      m.material.emissive?.set(this.flashT > 0 ? '#ffffff' : '#000000');
      if (m.material.emissive) m.material.emissiveIntensity = this.flashT > 0 ? 0.7 : 0;
    }
  }
}
const TURN = 14; // how fast the legs swing round to a new run direction (higher = snappier)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Same idea as ArmBase for any list of bones: undo hand-made turns before the mixer poses them again.
class BoneBase {
  constructor(bones) {
    this.bones = bones;
    this.q = bones.map(() => new THREE.Quaternion());
    this.saved = false;
  }
  restore() {
    if (this.saved) this.bones.forEach((b, i) => b.quaternion.copy(this.q[i]));
  }
  save() {
    this.bones.forEach((b, i) => this.q[i].copy(b.quaternion));
    this.saved = true;
  }
}
const _tq = new THREE.Quaternion();
const _pq2 = new THREE.Quaternion();
const _wq2 = new THREE.Quaternion();
const _up = new THREE.Vector3();
function twist(bone, root, ang) {
  if (!bone || !ang) return;
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_wq2);
  _up.set(0, 1, 0).applyQuaternion(_wq2);
  _tq.setFromAxisAngle(_up, ang);
  bone.parent.getWorldQuaternion(_pq2);
  bone.getWorldQuaternion(_wq2);
  _wq2.premultiply(_tq);
  bone.quaternion.copy(_pq2.invert().multiply(_wq2));
}

// Where the blaster sits in the right hand: worked out once from the aiming pose so the muzzle points straight
// ahead of her and the grip sits in the right palm; in every other pose it simply follows the hand.
export function blasterHold(template, prepared, handName) {
  const shoot = prepared.states.shoot;
  if (!shoot) return null;
  const inst = SkeletonUtils.clone(template.root);
  const mixer = new THREE.AnimationMixer(inst);
  const a = mixer.clipAction(shoot.upper);
  a.play();
  a.time = shoot.duration / 2;
  mixer.update(0);
  inst.updateMatrixWorld(true);
  const hand = inst.getObjectByName(handName);
  const rp = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  const fwd = new THREE.Vector3(0, 0, 1); // straight ahead of her while she aims
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  up.crossVectors(fwd, right);
  const gunWorld = new THREE.Matrix4().makeBasis(right, up, fwd);
  // grip (origin of the blaster model is its bottom centre) a little behind the right hand
  gunWorld.setPosition(rp.clone().addScaledVector(fwd, -0.18).addScaledVector(up, -0.1));
  const local = hand.matrixWorld.clone().invert().multiply(gunWorld);
  return { bone: handName, matrix: local };
}
