import * as THREE from 'three';
import { FIGHTERS, ATTACKS, ARENA } from '../config.js';
import { createVisual } from '../visuals/registry.js';

// Shared by Volt and the enemies: position, facing, health, state, attacks,
// hitstop (freeze), invulnerability and knockback.
export class Fighter {
  constructor(kind, x, z, scene) {
    this.kind = kind;
    this.cfg = FIGHTERS[kind];
    this.pos = new THREE.Vector3(x, 0, z);
    this.prevPos = this.pos.clone();   // position at the previous step, for smooth drawing between steps
    this.moveSpeed = 0;
    this.stunFor = this.cfg.stagger;
    this.shake = false;                // m/s over the last step (walk/run animations match it)
    this.facing = 1;               // +1 = facing +X, -1 = facing -X
    this.hp = this.maxHp = this.cfg.hp;
    this.radius = this.cfg.radius;
    this.state = 'idle';
    this.stateTime = 0;
    this.anim = null;
    this.attack = null;
    this.freeze = 0;
    this.invuln = 0;
    this.kb = null;
    this.damageScale = 1;
    this.scene = scene;
    this.node = new THREE.Group();
    scene.add(this.node);
    this.setVisual(createVisual(kind));
    this.setState('idle', 'idle');
  }

  get alive() { return this.state !== 'ko'; }

  setVisual(visual) {
    if (this.visual) { this.node.remove(this.visual.root); this.visual.dispose(); }
    this.visual = visual;
    this.node.add(visual.root);
    if (this.anim) visual.play(this.anim, this.animOpts);
  }

  setState(state, anim, opts = {}) {
    this.state = state;
    this.stateTime = 0;
    this.playAnim(anim, opts, true);
  }

  playAnim(anim, opts = {}, restart = false) {
    if (anim === this.anim && !restart) return;
    this.anim = anim;
    this.animOpts = opts;
    this.visual.play(anim, opts);
  }

  // from: start part-way into the clip (fraction), e.g. to skip a wind-up in a combo.
  startAttack(name, from = 0) {
    const def = ATTACKS[name];
    const dur = this.visual.duration(def.anim) / def.speed;
    this.attack = { name, def, t: from * dur, dur, hits: new Set() };
    this.setState('attack', def.anim, { loop: false, timeScale: def.speed, start: from });
  }

  get attackProgress() { return this.attack ? this.attack.t / this.attack.dur : 0; }
  get attackActive() {
    if (!this.attack) return false;
    const p = this.attackProgress, [a, b] = this.attack.def.hit;
    return p >= a && p <= b;
  }

  // Called by combat when a hit lands. Returns true if this knocked the fighter out.
  takeHit(def) {
    this.attack = null;
    if (this.hp <= 0) { this.setState('ko', 'defeat', { loop: false }); return true; }
    // Harder hits stun longer; poise < 1 shrugs hits off faster (Big Anvil).
    this.stunFor = Math.max(this.cfg.stagger, (def.stun ?? 0) * (this.cfg.poise ?? 1));
    this.setState('hurt', def.react === 'head' ? 'hit_to_head' : 'hit_to_body', { loop: false });
    return false;
  }

  // Timers shared by everyone. Returns false while frozen by hitstop.
  tick(dt) {
    if (this.freeze > 0) { this.freeze -= dt; return false; }
    this.shake = false;
    this.invuln = Math.max(0, this.invuln - dt);
    this.stateTime += dt;
    if (this.kb) {
      // Knockback: fast at first, then slows to a stop (about 0.2 s).
      let step = this.kb.remaining * (1 - Math.exp(-14 * dt));
      if (this.kb.remaining - step < 0.01) step = this.kb.remaining;
      this.pos.x += this.kb.dir * step;
      this.kb.remaining -= step;
      if (this.kb.remaining <= 1e-4) this.kb = null;
    }
    return true;
  }

  moveBy(x, z, speed, dt) {
    this.pos.x += x * speed * dt;
    this.pos.z += z * speed * dt;
  }

  // alpha: how far the current frame is between the previous step and this one (0..1).
  sync(dt, extra = {}, alpha = 1) {
    this.node.position.lerpVectors(this.prevPos, this.pos, alpha);
    // A fighter that was just hit shakes during the hit freeze.
    if (this.freeze > 0 && this.shake) this.node.position.x += Math.sin(performance.now() * 0.09) * 0.03;
    this.node.rotation.y = this.facing * Math.PI / 2;   // +Z model forward -> ±X
    this.visual.update(this.freeze > 0 ? 0 : dt, {
      state: this.state, progress: this.attackProgress, active: this.attackActive, moveSpeed: this.moveSpeed,
      reach: this.attack?.def.reach, ...extra,
    });
  }

  remove() {
    this.scene.remove(this.node);
    this.visual.dispose();
    this.removed = true;
  }

  get inArena() { return this.pos.x >= ARENA.minX && this.pos.x <= ARENA.maxX; }
}
