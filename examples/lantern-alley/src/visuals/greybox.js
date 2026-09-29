import * as THREE from 'three';
import { box, cylinder, capsule } from './toon.js';

// Animation lengths (seconds), the same as the Tripo clips, so a fight plays with exactly
// the same timing in greybox and with models. Real models report their own.
const DURATIONS = {
  idle: 15.333, walk: 2.333, run: 1.25, box_01: 2.208, box_02: 2.792, box_03: 2.542, front_kick_01: 2.5,
  slash: 6.583, hit_to_body: 1.292, hit_to_head: 1.833, defeat: 5.542, cheer: 12.083, jump: 0.8, fall: 0.8,
};

// Torso colour shows the state. Ground ring colour too (red ring = holds the attack turn).
const STATE_COLORS = {
  idle: null, walk: null, wait: 0x2ec4b6, attack: 0xff9f1c, active: 0xe71d36,
  hurt: 0xff66cc, ko: 0x777777, win: 0xffd23f,
};
const RING_COLORS = {
  idle: 0xffffff, walk: 0x9fd8ff, run: 0x3fa9ff, wait: 0x2ec4b6, attack: 0xff9f1c, hurt: 0xff66cc, ko: 0x555555, win: 0xffd23f,
};

// A humanoid placeholder built from capsules and boxes, facing +Z, feet at y = 0.
export class GreyCharacter {
  constructor({ size, body, head, accent }) {
    this.look = 'greybox';
    const [w, h, d] = size;
    this.size = size;
    this.baseColor = new THREE.Color(body);
    this.root = new THREE.Group();
    this.pose = new THREE.Group();             // leans and bobs; pivot at the feet
    this.root.add(this.pose);

    const torsoH = h * 0.78, headH = h - torsoH;
    const r = d / 2;
    this.torso = capsule(r, torsoH, body);
    this.torso.scale.x = w / d;
    this.torso.position.y = torsoH / 2;
    this.pose.add(this.torso);

    const headBox = box(headH * 0.85, headH, headH * 0.85, head);
    headBox.position.y = torsoH + headH / 2;
    this.pose.add(headBox);
    const nose = box(headH * 0.3, headH * 0.2, headH * 0.3, accent, 0.015);  // shows which way is +Z
    nose.position.set(0, torsoH + headH * 0.45, headH * 0.5);
    this.pose.add(nose);

    this.fist = box(0.16, 0.16, 0.16, accent, 0.02);
    this.fistRest = new THREE.Vector3(w / 2 + 0.06, torsoH * 0.7, 0.05);
    this.fist.position.copy(this.fistRest);
    this.pose.add(this.fist);
    this.foot = box(0.18, 0.14, 0.3, accent, 0.02);
    this.footRest = new THREE.Vector3(w * 0.2, 0.07, 0.05);
    this.foot.position.copy(this.footRest);
    this.pose.add(this.foot);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(w, d) * 0.55, Math.max(w, d) * 0.55 + 0.07, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    this.anim = 'idle';
    this.animTime = 0;
    this.timeScale = 1;
    this.flashTime = 0;
    this.materials = [];
    this.outlines = [];
    this.root.traverse(o => {
      if (o.userData.isOutline) this.outlines.push(o);
      else if (o.material && !this.materials.includes(o.material)) this.materials.push(o.material);
    });
  }

  duration(anim) { return DURATIONS[anim] ?? 1; }

  play(anim, { timeScale = 1 } = {}) {
    this.anim = anim;
    this.animTime = 0;
    this.timeScale = timeScale;
  }

  hitFlash() { this.flashTime = 0.1; }

  // The outline material is shared by every placeholder, so hide this one's outlines instead of fading them.
  setOpacity(a) {
    for (const o of this.outlines) o.visible = a >= 1;
    for (const m of this.materials) { m.transparent = a < 1; m.opacity = a; }
  }

  // info: { state, progress (0..1 of attack), active (hit window), hasTurn, reach }
  update(dt, info) {
    this.animTime += dt * this.timeScale;
    this.flashTime -= dt;
    const t = this.animTime, s = info.state;

    const key = s === 'attack' && info.active ? 'active' : s;
    const c = this.flashTime > 0 ? new THREE.Color(0xffffff) : STATE_COLORS[key] != null ? new THREE.Color(STATE_COLORS[key]) : this.baseColor;
    this.torso.material.color.copy(c);
    this.ring.material.color.set(info.hasTurn && s !== 'ko' ? 0xff2020 : RING_COLORS[s] ?? 0xffffff);

    // Pose: lean forward when attacking, back when hurt, lie down when KO'd.
    let lean = 0, bob = 0, lieDown = 0;
    this.fist.position.copy(this.fistRest);
    this.foot.position.copy(this.footRest);
    if (s === 'run') { bob = Math.abs(Math.sin(t * 13)) * 0.09; lean = 0.2; }
    else if (s === 'walk' || (s === 'wait' && this.anim === 'walk')) bob = Math.abs(Math.sin(t * 8)) * 0.06;
    else if (s === 'idle') bob = Math.sin(t * 3) * 0.015;
    else if (s === 'attack') {
      const p = info.progress, reach = info.reach ?? 1;
      // wind up, strike during the hit window, then recover
      const ext = info.active ? 1 : p < 0.3 ? -0.3 * (p / 0.3) : Math.max(0, 1 - (p - 0.6) * 3);
      lean = 0.15 + 0.15 * Math.max(0, ext);
      const striker = this.anim === 'front_kick_01' ? this.foot : this.fist;
      const rest = striker === this.foot ? this.footRest : this.fistRest;
      striker.position.z = rest.z + ext * (reach - 0.1);
      if (striker === this.foot) striker.position.y = rest.y + Math.max(0, ext) * 0.6;
      if (this.anim === 'slash') striker.position.y = rest.y + (1 - p) * 0.8;
      if (this.anim === 'box_03') striker.position.y = rest.y + Math.max(0, ext) * 0.25;
    } else if (s === 'hurt') lean = -0.35;
    else if (s === 'ko') lieDown = Math.min(1, t / 0.4);
    else if (s === 'win') bob = Math.abs(Math.sin(t * 6)) * 0.25;
    else if (s === 'wait') lean = 0.08;

    this.pose.rotation.x = lieDown ? -lieDown * Math.PI / 2 : lean;
    this.pose.position.y = bob + lieDown * 0.15;
  }

  dispose() {}
}

// A static prop: just a group, facing +Z, bottom at y = 0.
export class GreyProp {
  constructor(root) { this.root = root; this.look = 'greybox'; }
  duration() { return 1; }
  play() {}
  hitFlash() {}
  setOpacity() {}
  update() {}
  dispose() {}
}

export function dumpster([w, h, d]) {
  const g = new THREE.Group();
  const body = box(w, h * 0.9, d, 0x2e7d4f); body.position.y = h * 0.45; g.add(body);
  const lid = box(w * 1.02, h * 0.1, d * 1.05, 0x1f5236); lid.position.set(0, h * 0.95, 0); g.add(lid);
  const front = box(w * 0.6, h * 0.25, 0.04, 0xf2e94e, 0.01); front.position.set(0, h * 0.55, d / 2 + 0.02); g.add(front);
  return new GreyProp(g);
}

export function crate([w, h, d]) {
  const g = new THREE.Group();
  const b = box(w, h, d, 0xc68642); b.position.y = h / 2; g.add(b);
  const plank = box(w * 0.9, h * 0.15, 0.03, 0x8d5524, 0.01); plank.position.set(0, h / 2, d / 2 + 0.015); g.add(plank);
  return new GreyProp(g);
}

export function trashCan([w, h]) {
  const g = new THREE.Group();
  const b = cylinder(w / 2, h * 0.92, 0x9aa5b1); b.position.y = h * 0.46; g.add(b);
  const lid = cylinder(w / 2 * 1.08, h * 0.08, 0x6b7785); lid.position.y = h * 0.96; g.add(lid);
  return new GreyProp(g);
}

export function streetLamp([w, h, d]) {
  const g = new THREE.Group();
  const pole = cylinder(w * 0.25, h, 0x2b2d42); pole.position.y = h / 2; g.add(pole);
  const arm = box(w * 0.4, w * 0.4, d, 0x2b2d42); arm.position.set(0, h - w * 0.2, d / 2); g.add(arm);
  const lamp = box(w, w * 0.5, w, 0xfff3b0); lamp.position.set(0, h - w * 0.55, d - w / 2); g.add(lamp);
  const light = new THREE.PointLight(0xffd98a, 6, 7, 1.5); light.position.set(0, h - 0.6, d - 0.15); g.add(light);
  return new GreyProp(g);
}

export function floor([w, h, d]) {
  const g = new THREE.Group();
  const b = box(w, h, d, 0x5c5470, 0.001); b.position.y = -h / 2; g.add(b);
  // painted kerb line at the front edge
  const kerb = box(w, 0.02, 0.25, 0xf2e94e, 0.001); kerb.position.set(0, 0.01, d / 2 - 0.4); g.add(kerb);
  return new GreyProp(g);
}

export function wall([w, h, d]) {
  const g = new THREE.Group();
  const b = box(w, h, d, 0xb5523b, 0.001); b.position.set(0, h / 2, -d / 2); g.add(b);
  for (let i = 0; i < 5; i++) {       // stripes so the wall does not look flat
    const s = box(w, 0.08, 0.02, 0x7a3325, 0.001); s.position.set(0, 0.8 + i * 1.1, 0.01); g.add(s);
  }
  return new GreyProp(g);
}

// Food dropped by a broken crate: a hot dog that spins and bobs (animated in code).
export class FoodVisual extends GreyProp {
  constructor([w, h, d]) {
    const g = new THREE.Group(), spin = new THREE.Group();
    spin.position.y = 0.35;
    const bun = capsule(d / 2, w, 0xe8a85c, 0.015); bun.rotation.z = Math.PI / 2; spin.add(bun);
    const sausage = capsule(d * 0.32, w * 1.15, 0xc0392b, 0.012); sausage.rotation.z = Math.PI / 2; sausage.position.y = d * 0.3; spin.add(sausage);
    const mustard = box(w * 0.7, 0.02, 0.03, 0xffd23f, 0.005); mustard.position.y = d * 0.62; spin.add(mustard);
    g.add(spin);
    super(g);
    this.spin = spin;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.spin.rotation.y += dt * 2.5;
    this.spin.position.y = 0.35 + Math.sin(this.t * 4) * 0.06;
  }
}
