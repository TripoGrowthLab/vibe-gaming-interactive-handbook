// One fighting robot: parts and HP, the state machine, and its code-driven animation.
// It only touches its visual through named nodes (body, upper, head, arm_r, leg_l, ...).
import * as THREE from 'three';
import { PARTS, ATTACKS, SKILLS, FEEL, LEGLESS_DROP, PART_CENTRES, SWAP_SLOTS, ROBOT_HEIGHT } from '../data.js';
import { createRobotView } from '../visuals/robotView.js';

const Y = new THREE.Vector3(0, 1, 0);
const H = -Math.PI / 2; // arm pointing forward
const STEP_CYCLE = 0.3; // metres covered by one full walk cycle (two steps)

// Keyframes [[fraction, value], ...] with smooth easing between keys.
function kf(keys, p) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1] = keys[i];
    if (p <= p1) {
      const [p0, v0] = keys[i - 1];
      const u = (p - p0) / Math.max(p1 - p0, 1e-6);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// Arm motions for each attack (see GDD "Attacks"). s = +1 for the right arm, -1 for the left.
const MOTIONS = {
  punch: (p, s) => ({
    pitch: kf([[0, 0], [0.3, 0.5], [0.38, H], [0.6, H], [1, 0]], p),
    extend: kf([[0, 0], [0.33, 0], [0.38, 0.06], [0.55, 0.06], [0.7, 0], [1, 0]], p),
    twist: s * kf([[0, 0], [0.3, -0.15], [0.4, 0.3], [0.6, 0.3], [1, 0]], p),
  }),
  smash: (p) => ({
    pitch: kf([[0, 0], [0.45, -2.9], [0.55, -2.9], [0.62, -1.2], [0.8, -1.2], [1, 0]], p),
    lean: kf([[0, 0], [0.45, -0.15], [0.62, 0.25], [0.8, 0.25], [1, 0]], p),
  }),
  thrust: (p, s) => ({
    pitch: kf([[0, 0], [0.3, 0.4], [0.4, H], [0.7, H], [1, 0]], p),
    extend: kf([[0, 0], [0.35, 0], [0.42, 0.05], [0.7, 0.05], [0.8, 0], [1, 0]], p),
    twist: s * kf([[0, 0], [0.3, -0.1], [0.4, 0.2], [0.7, 0.2], [1, 0]], p),
    spin: p > 0.3 && p < 0.75,
  }),
  shoot: (p) => ({ pitch: kf([[0, 0], [0.25, H], [0.3, H], [0.36, H - 0.3], [0.5, H], [0.8, H], [1, 0]], p) }),
  shoot2: (p) => ({
    pitch: kf([[0, 0], [0.2, H], [0.25, H], [0.31, H - 0.3], [0.45, H], [0.55, H], [0.61, H - 0.3], [0.75, H], [0.85, H], [1, 0]], p),
  }),
  sweep: (p, s) => ({
    pitch: kf([[0, 0], [0.25, H], [0.65, H], [1, 0]], p),
    twist: s * kf([[0, 0], [0.3, -0.9], [0.6, 0.9], [0.75, 0.9], [1, 0]], p),
  }),
  launch: (p) => ({ pitch: kf([[0, 0], [0.4, H - 0.52], [0.5, H - 0.52], [0.55, H - 0.8], [0.7, H - 0.52], [0.85, H - 0.52], [1, 0]], p) }),
};

// Arm motions start and end at the arm's rest pitch and reach their own pitch when pointing forward.
function fromRest(arm, pitch) {
  return (arm.userData.restPitch || 0) * Math.max(0, 1 - Math.abs(pitch) / (Math.PI / 2));
}

const TINT = { windup: 0xffc400, active: 0xff2a2a, block: 0x3aa0ff, hurt: 0xffffff, skill: 0x3aff7a, dash: 0x3af0ff, guard: 0x3a7aff, focus: 0xffe14a };

export class Robot {
  constructor({ name, loadout, paints, pos, yaw, isPlayer }) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.view = createRobotView(loadout, paints);
    this.root = this.view.root;
    this.pos = new THREE.Vector3(pos[0], 0, pos[1]);
    this.yaw = yaw;
    this.parts = {};
    for (const slot of SWAP_SLOTS) {
      const def = PARTS[loadout[slot]];
      this.parts[slot] = { id: loadout[slot], def, hp: def.hp, max: def.hp, broken: false };
    }
    this.state = 'idle';
    this.stateT = 0;
    this.time = Math.random() * 10;
    this.attack = null;
    this.queued = null;
    this.cd = { dash: 0, skill: 0 };
    this.invuln = 0;
    this.kbVel = new THREE.Vector3();
    this.kbT = 0;
    this.guardT = 0;
    this.focusShots = 0;
    this.dashDir = new THREE.Vector3();
    this.chargeHit = false;
    this.walkPhase = 0;
    this.localVel = new THREE.Vector2(); // x = right, y = forward, as a fraction of top speed
    this.drop = 0; // how far the upper body has sunk (animated)
    this.target = null;
    this.stats = { hits: {}, damageDealt: 0, damageTaken: 0, takenBySlot: {}, partsBroken: [], blocks: 0, attacksStarted: 0 };
    this.syncTransform();
  }

  get legless() {
    return this.parts.legs.broken;
  }
  get speed() {
    return this.parts.legs.def.speed * (this.legless ? 0.5 : 1);
  }
  get headDown() {
    return this.parts.head.broken;
  }
  get top() {
    return ROBOT_HEIGHT - (this.legless ? LEGLESS_DROP : 0);
  }
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  armDef(slot) {
    const p = this.parts[slot];
    return p.broken ? null : ATTACKS[p.def.attack];
  }
  shieldSlot() {
    return ['arm_l', 'arm_r'].find((s) => this.armDef(s)?.kind === 'shield') || null;
  }
  get skill() {
    return this.parts.head.def.skill;
  }
  canAct() {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'block';
  }
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // ---------------- update ----------------
  update(dt, input, fight) {
    this.time += dt;
    this.stateT += dt;
    this.cd.dash = Math.max(0, this.cd.dash - dt);
    this.cd.skill = Math.max(0, this.cd.skill - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.guardT = Math.max(0, this.guardT - dt);

    const moveBefore = this.pos.clone();
    if (this.state !== 'knocked_down' && this.state !== 'victory') {
      this.faceTarget(dt);
      this.handleInput(input, fight);
      this.updateState(dt, input, fight);
      this.move(dt, input);
    }
    if (this.kbT > 0) {
      const k = Math.min(dt, this.kbT);
      this.pos.addScaledVector(this.kbVel, k);
      this.kbT -= k;
    }
    // Walk cycle follows the distance really covered, so the legs match the speed.
    const moved = new THREE.Vector3().subVectors(this.pos, moveBefore);
    moved.y = 0;
    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x); // robot's right (-X local) in world
    const sp = Math.max(this.speed, 0.01) * Math.max(dt, 1e-5);
    const target = new THREE.Vector2(moved.dot(r) / sp, moved.dot(f) / sp);
    this.localVel.lerp(target, 1 - Math.exp(-15 * dt));
    if (this.state === 'walk' || this.state === 'block' || this.state === 'attack') {
      this.walkPhase += (moved.length() / STEP_CYCLE) * Math.PI * 2;
    }
  }

  faceTarget(dt) {
    if (!this.target || this.state === 'hurt' || this.state === 'part_break') return;
    if (this.state === 'head_skill' && this.skill === 'charge') return;
    const d = new THREE.Vector3().subVectors(this.target.pos, this.pos);
    const want = Math.atan2(d.x, d.z);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxTurn = FEEL.turnRate * dt;
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }

  handleInput(input, fight) {
    // Shield: held button.
    const sh = this.shieldSlot();
    const holdSh = sh && (sh === 'arm_l' ? input.holdL : input.holdR);
    if (this.state === 'block' && !holdSh) this.setState('idle');
    else if (holdSh && (this.state === 'idle' || this.state === 'walk')) this.setState('block');

    for (const [slot, pressed] of [['arm_l', input.pressL], ['arm_r', input.pressR]]) {
      if (!pressed) continue;
      const def = this.armDef(slot);
      if (!def || def.kind === 'shield') continue;
      if (this.state === 'idle' || this.state === 'walk') this.startAttack(slot);
      else if (this.state === 'attack' || this.state === 'head_skill' || this.state === 'dash') this.queued = slot;
    }
    if (input.dash && (this.state === 'idle' || this.state === 'walk') && this.cd.dash <= 0 && !this.legless) {
      const m = input.move;
      if (m.lengthSq() > 0.01) this.dashDir.set(m.x, 0, m.y).normalize();
      else this.forward(this.dashDir);
      this.cd.dash = FEEL.dashCooldown;
      this.setState('dash');
      this.queued = null;
    }
    if (input.skill && (this.state === 'idle' || this.state === 'walk') && this.cd.skill <= 0) this.startSkill(fight);
  }

  startAttack(slot) {
    const def = this.armDef(slot);
    this.attack = { slot, def, id: this.parts[slot].def.attack, t: 0, hitDone: false, fired: 0 };
    this.stats.attacksStarted++;
    this.setState('attack');
  }

  startSkill(fight) {
    const sk = SKILLS[this.skill];
    this.cd.skill = sk.cooldown;
    this.setState('head_skill');
    this.chargeHit = false;
    if (this.skill === 'repair') {
      let best = null;
      for (const slot of SWAP_SLOTS) {
        const p = this.parts[slot];
        if (!p.broken && p.hp < p.max && (!best || p.max - p.hp > best.max - best.hp)) best = p;
      }
      if (best) best.hp = Math.min(best.max, best.hp + sk.heal);
    } else if (this.skill === 'guard') this.guardT = sk.duration;
    else if (this.skill === 'focus') this.focusShots = sk.shots;
    else if (this.skill === 'charge') this.forward(this.dashDir);
    fight.emit('skill', { robot: this, skill: this.skill });
  }

  updateState(dt, input, fight) {
    const s = this.state;
    if (s === 'attack') {
      const a = this.attack;
      a.t += dt;
      const p = a.t / a.def.length;
      if (a.def.kind === 'melee') {
        if (!a.hitDone && p >= a.def.hit[0] && p <= a.def.hit[1]) a.hitDone = fight.tryMelee(this, a);
      } else {
        while (a.fired < a.def.fire.length && p >= a.def.fire[a.fired]) {
          fight.spawnProjectile(this, a);
          a.fired++;
        }
      }
      if (p >= 1) this.finishAction();
    } else if (s === 'head_skill') {
      const sk = SKILLS[this.skill];
      const p = this.stateT / sk.length;
      if (this.skill === 'charge' && p < 1) {
        this.pos.addScaledVector(this.dashDir, (sk.distance / sk.length) * dt);
        if (!this.chargeHit && p >= sk.hit[0] && p <= sk.hit[1]) this.chargeHit = fight.tryCharge(this);
      }
      if (p >= 1) this.finishAction();
    } else if (s === 'dash') {
      const dist = this.parts.legs.def.dash;
      this.pos.addScaledVector(this.dashDir, (dist / FEEL.dashTime) * dt);
      if (this.stateT >= FEEL.dashTime) this.finishAction();
    } else if (s === 'hurt') {
      if (this.stateT >= FEEL.hurt) this.setState('idle');
    } else if (s === 'part_break') {
      if (this.stateT >= FEEL.breakStagger) this.setState('idle');
    }
  }

  // An action ended: fire the queued attack if there is one.
  finishAction() {
    this.attack = null;
    const q = this.queued;
    this.queued = null;
    const def = q && this.armDef(q);
    if (def && def.kind !== 'shield') this.startAttack(q);
    else this.setState('idle');
  }

  move(dt, input) {
    const s = this.state;
    let mul = 0;
    if (s === 'idle' || s === 'walk') mul = 1;
    else if (s === 'block') mul = ATTACKS.lid_shield.moveMul;
    else if (s === 'attack') mul = FEEL.moveInAttack;
    const m = input.move;
    const len = Math.min(1, m.length());
    if (mul > 0 && len > 0.1) {
      this.pos.x += (m.x / Math.max(len, 1e-6)) * len * this.speed * mul * dt;
      this.pos.z += (m.y / Math.max(len, 1e-6)) * len * this.speed * mul * dt;
      if (s === 'idle') this.setState('walk');
    } else if (s === 'walk') this.setState('idle');
  }

  // ---------------- damage ----------------
  // Pick the part closest to where the hit landed. A hit on the core goes to the arm on the side
  // the blow came from (facing each other: your right arm hits their left arm), or to the head
  // if that arm is gone.
  routeHit(point, from = point) {
    const local = point.clone().sub(this.pos).applyAxisAngle(Y, -this.yaw);
    const src = from.clone().sub(this.pos).applyAxisAngle(Y, -this.yaw);
    const drop = this.legless ? LEGLESS_DROP : 0;
    let best = 'core';
    let bestD = Infinity;
    for (const slot of [...SWAP_SLOTS, 'core']) {
      if (slot !== 'core' && this.parts[slot].broken) continue;
      const c = PART_CENTRES[slot];
      const dy = local.y - (c[1] - (slot === 'legs' ? 0 : drop));
      const d = (local.x - c[0]) ** 2 + dy ** 2 + (local.z - c[2]) ** 2;
      if (d < bestD) (bestD = d), (best = slot);
    }
    if (best === 'core') {
      const x = Math.abs(src.x) > 0.01 ? src.x : local.x;
      best = x < 0 ? 'arm_r' : 'arm_l';
      if (this.parts[best].broken) best = 'head';
    }
    return best;
  }

  // Returns null if the hit did not count (still invulnerable, or already down).
  receiveHit({ damage, point, dir, from }) {
    if (this.invuln > 0 || this.state === 'knocked_down' || this.state === 'victory') return null;
    let dmg = damage * (this.guardT > 0 ? SKILLS.guard.mul : 1);
    let slot;
    let blocked = false;
    if (this.state === 'block') {
      const toAttacker = dir.clone().negate();
      const ang = this.forward().angleTo(toAttacker);
      if (ang <= THREE.MathUtils.degToRad(ATTACKS.lid_shield.arc / 2)) {
        blocked = true;
        slot = this.shieldSlot();
        dmg *= ATTACKS.lid_shield.share;
        this.stats.blocks++;
      }
    }
    if (!slot) slot = this.routeHit(point, from);
    const part = this.parts[slot];
    part.hp = Math.max(0, part.hp - dmg);
    this.stats.damageTaken += dmg;
    this.stats.takenBySlot[slot] = (this.stats.takenBySlot[slot] || 0) + dmg;
    this.invuln = FEEL.invuln;
    if (!blocked) this.flashT = FEEL.hitFlash; // a short, sharp white flash on every hit
    this.kbVel.copy(dir).setY(0).normalize().multiplyScalar((FEEL.knockback / FEEL.knockTime) * (blocked ? 0.5 : 1));
    this.kbT = FEEL.knockTime;
    const broke = part.hp <= 0;
    if (broke) {
      part.broken = true;
      this.stats.partsBroken.push(slot);
    }
    if (broke && slot === 'head') {
      this.attack = null;
      this.queued = null;
      this.setState('knocked_down');
    } else if (broke) {
      this.attack = null;
      this.queued = null;
      this.setState('part_break');
    } else if (!blocked) {
      this.attack = null;
      this.queued = null;
      this.setState('hurt');
    }
    return { slot, dmg, blocked, broke };
  }

  // ---------------- animation (parts moved in code) ----------------
  syncTransform() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  animate(dt) {
    this.syncTransform();
    const v = this.view;
    const t = this.time;
    const s = this.state;
    const { body, upper } = v;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    upper.rotation.set(0, 0, 0);
    this.drop += ((this.legless ? LEGLESS_DROP : 0) - this.drop) * (1 - Math.exp(-12 * dt));
    upper.position.y = -this.drop;
    v.tintAll(0, 0);

    const head = v.part('head');
    if (head) head.rotation.set(0, 0, 0);
    const arms = { arm_r: v.part('arm_r'), arm_l: v.part('arm_l') };
    for (const [slot, a] of Object.entries(arms)) {
      if (!a) continue;
      a.rotation.order = 'YXZ';
      // Rest pose (set by the snug fit so arms clear wide legs): pitch forward, roll out.
      a.rotation.set(a.userData.restPitch || 0, 0, a.userData.restRoll ?? (slot === 'arm_r' ? -0.08 : 0.08));
      for (const n of ['fist', 'tool', 'drill_tip']) {
        const c = a.getObjectByName(n);
        if (!c) continue;
        c.userData.baseY ??= c.position.y;
        c.position.y = c.userData.baseY;
      }
    }
    const legT = this.parts.legs.def.legType;
    const legL = v.node('legs', 'leg_l');
    const legR = v.node('legs', 'leg_r');
    const skirt = v.node('legs', 'skirt');
    const treads = [v.node('legs', 'tread_l'), v.node('legs', 'tread_r')];
    if (legL) legL.rotation.set(0, 0, 0);
    if (legR) legR.rotation.set(0, 0, 0);

    // ---- locomotion layer ----
    const moveAmt = Math.min(1, this.localVel.length());
    const fwd = this.localVel.y;
    const side = this.localVel.x;
    if (s !== 'knocked_down') {
      upper.position.y += Math.sin(t * 3) * 0.005 * (1 - moveAmt);
      if (legT === 'biped' && legL && legR) {
        const swing = Math.sin(this.walkPhase) * 0.436 * moveAmt;
        legL.rotation.x = swing * Math.sign(fwd || 1);
        legR.rotation.x = -swing * Math.sign(fwd || 1);
        legL.rotation.z = Math.cos(this.walkPhase) * 0.2 * Math.abs(side);
        legR.rotation.z = -Math.cos(this.walkPhase) * 0.2 * Math.abs(side);
        body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.008 * moveAmt;
      } else if (legT === 'treads') {
        treads.forEach((n, i) => {
          if (!n) return;
          n.userData.baseY ??= n.position.y; // rest height of this tread's hinge
          n.position.y = n.userData.baseY + Math.sin(t * 40 + i) * 0.002 * moveAmt;
        });
      } else if (legT === 'hover' && skirt) {
        skirt.rotation.x = 0.2 * fwd;
        skirt.rotation.z = -0.2 * side;
        body.position.y = Math.sin(t * 4) * 0.006;
      }
      body.rotation.x = 0.08 * fwd;
      body.rotation.z = 0.06 * side;
      for (const [slot, a] of Object.entries(arms)) {
        if (!a) continue;
        a.rotation.x = (a.userData.restPitch || 0) + Math.sin(this.walkPhase + (slot === 'arm_r' ? 0 : Math.PI)) * 0.25 * moveAmt;
      }
    }

    // ---- action layer ----
    if (s === 'attack' && this.attack) {
      const a = this.attack;
      const p = Math.min(1, a.t / a.def.length);
      const sgn = a.slot === 'arm_r' ? 1 : -1;
      const m = MOTIONS[a.def.motion](p, sgn);
      const arm = arms[a.slot];
      if (arm) {
        arm.rotation.x = m.pitch + fromRest(arm, m.pitch);
        const ext = arm.getObjectByName('fist') || arm.getObjectByName('tool') || arm.getObjectByName('drill_tip');
        if (ext && m.extend) ext.position.y = ext.userData.baseY - m.extend;
        const tip = arm.getObjectByName('drill_tip');
        if (tip && m.spin) tip.rotation.y += dt * 40;
        // Colour shows the attack phase: yellow = wind-up, red = can hit.
        const hitStart = a.def.hit ? a.def.hit[0] : a.def.fire[0];
        const hitEnd = a.def.hit ? a.def.hit[1] : a.def.fire[a.def.fire.length - 1] + 0.08;
        if (p < hitStart) v.tint(a.slot, TINT.windup, 0.45);
        else if (p <= hitEnd) v.tint(a.slot, TINT.active, 0.7);
      }
      upper.rotation.y = m.twist || 0;
      body.rotation.x += m.lean || 0;
    } else if (s === 'block') {
      const slot = this.shieldSlot();
      const b = Math.min(1, this.stateT / ATTACKS.lid_shield.raise);
      const arm = slot && arms[slot];
      if (arm) {
        arm.rotation.x = H * 0.85 * b + fromRest(arm, H * 0.85 * b);
        arm.rotation.y = (slot === 'arm_l' ? -1.2 : 1.2) * b;
        v.tint(slot, TINT.block, 0.5);
      }
    } else if (s === 'head_skill') {
      const sk = SKILLS[this.skill];
      const p = Math.min(1, this.stateT / sk.length);
      if (this.skill === 'charge') {
        body.rotation.x = 0.35;
        for (const a of Object.values(arms)) if (a) a.rotation.x = 0.6;
        v.tint('head', TINT.active, 0.6);
      } else if (head) {
        head.rotation.y = p * Math.PI * 2;
        v.tint('head', TINT.skill, 0.6 * (1 - p));
      }
    } else if (s === 'dash') {
      body.rotation.x = 0.35;
      if (legL) legL.rotation.x = 0.4;
      if (legR) legR.rotation.x = 0.4;
      v.tint('legs', TINT.dash, 0.4);
    } else if (s === 'hurt') {
      const k = 1 - this.stateT / FEEL.hurt;
      body.rotation.x = -0.26 * k;
      for (const a of Object.values(arms)) if (a) a.rotation.x = (a.userData.restPitch || 0) + 0.3 * k;
    } else if (s === 'part_break') {
      body.rotation.z = Math.sin(this.stateT * 40) * 0.08;
    } else if (s === 'knocked_down') {
      const k = Math.min(1, this.stateT / 0.4);
      body.rotation.x = -Math.PI / 2 * (k * k);
      body.position.y = 0.04 * k;
      v.eyes(false);
    } else if (s === 'victory') {
      body.rotation.y = Math.min(1, this.stateT / 1.0) * Math.PI * 2;
      for (const a of Object.values(arms)) if (a) a.rotation.x = -2.8 * Math.min(1, this.stateT / 0.3);
    }

    // Hit flash: bright for an instant, gone after FEEL.hitFlash seconds.
    this.flashT = Math.max(0, (this.flashT || 0) - dt);
    if (this.flashT > 0) v.tintAll(TINT.hurt, 0.6 * (this.flashT / FEEL.hitFlash) ** 2);

    // Buffs from head skills.
    if (this.guardT > 0) v.tint('core', TINT.guard, 0.35);
    if (this.focusShots > 0) v.tint('head', TINT.focus, 0.35);
    if (s !== 'knocked_down') v.eyes(true);
  }
}
