// A simple fighter brain. It produces the same input the player gives, so it can drive
// a rival or (for the test bot) the player's robot.
import * as THREE from 'three';
import { ROBOT_RADIUS, SKILLS } from '../data.js';

export class AIController {
  constructor(me, fight, profile, rng = Math.random) {
    this.me = me;
    this.fight = fight;
    this.p = profile;
    this.rng = rng;
    this.pause = this.rand(profile.pauseMin, profile.pauseMax) + 0.4;
    this.plan = null;
    this.planT = 0;
    this.strafe = this.rng() < 0.5 ? 1 : -1;
    this.strafeT = this.rand(1.2, 2.5);
    this.blockT = 0;
    this.stuckT = 0;
    this.lastPos = me.pos.clone();
    this.seen = new WeakSet();
    this.input = { move: new THREE.Vector2(), pressL: false, pressR: false, holdL: false, holdR: false, dash: false, skill: false };
  }
  rand(a, b) {
    return a + (b - a) * this.rng();
  }

  update(dt) {
    const me = this.me;
    const foe = me.target;
    const inp = this.input;
    inp.move.set(0, 0);
    inp.pressL = inp.pressR = inp.holdL = inp.holdR = inp.dash = inp.skill = false;
    if (me.state === 'knocked_down' || me.state === 'victory') return inp;

    const to = new THREE.Vector3().subVectors(foe.pos, me.pos).setY(0);
    const d = Math.max(to.length(), 1e-4);
    const dir = to.clone().divideScalar(d);
    const perp = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(this.strafe);

    const arms = ['arm_r', 'arm_l'].filter((s) => me.armDef(s) && me.armDef(s).kind !== 'shield');
    const melee = arms.filter((s) => me.armDef(s).kind === 'melee');
    const ranged = arms.filter((s) => me.armDef(s).kind !== 'melee');
    const los = !this.fight.lineBlocked(me.pos, foe.pos);

    // Pick what to do next.
    this.pause -= dt;
    this.planT += dt;
    if (!this.plan || !me.armDef(this.plan) || this.planT > 4) {
      this.plan = arms.length ? arms[Math.floor(this.rng() * arms.length)] : null;
      if (melee.length && ranged.length && d > 1.4 && this.rng() < 0.6) this.plan = ranged[0];
      this.planT = 0;
    }
    const def = this.plan && me.armDef(this.plan);
    let prefer = 2.0;
    if (def?.kind === 'melee') prefer = ROBOT_RADIUS + def.reach * 0.6;
    else if (def) prefer = 1.4;
    else if (melee.length) prefer = 0.35;

    // Move: keep the wanted distance and circle around the rival.
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafe *= -1;
      this.strafeT = this.rand(1.2, 2.5);
    }
    const radial = THREE.MathUtils.clamp((d - prefer) * 2.5, -1, 1);
    const circle = def?.kind === 'melee' && d < prefer + 0.25 ? 0.3 : !los ? 1.0 : 0.6;
    const mv = dir.clone().multiplyScalar(radial).addScaledVector(perp, circle);
    if (mv.length() > 1) mv.normalize();
    inp.move.set(mv.x, mv.z);

    // Unstick from walls and blocks.
    if (me.pos.distanceTo(this.lastPos) < 0.2 * dt * me.speed && mv.length() > 0.5 && me.state === 'walk') this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 0.4) {
      this.strafe *= -1;
      this.stuckT = 0;
    }
    this.lastPos.copy(me.pos);

    // Block with a shield when something is coming.
    const incoming = this.fight.projectiles.find(
      (p) => p.target === me && p.pos.distanceTo(me.pos) < 1.2 && p.dir.dot(new THREE.Vector3().subVectors(me.pos, p.pos).normalize()) > 0.8,
    );
    const foeSwinging = foe.state === 'attack' && foe.attack && foe.attack.def.kind === 'melee' && d < 0.75;
    const shield = me.shieldSlot();
    if (shield && (incoming || foeSwinging) && this.blockT <= 0 && this.rng() < 0.08) this.blockT = 0.7;
    this.blockT -= dt;
    if (shield && this.blockT > 0) {
      if (shield === 'arm_l') inp.holdL = true;
      else inp.holdR = true;
      return inp;
    }

    // Dodge incoming shots with a sideways dash.
    if (incoming && !this.seen.has(incoming)) {
      this.seen.add(incoming);
      if (me.cd.dash <= 0 && this.rng() < this.p.dodge) {
        inp.dash = true;
        inp.move.set(perp.x, perp.z);
        return inp;
      }
    }

    // Head skill.
    if (me.cd.skill <= 0 && me.canAct() && this.rng() < this.p.skill * dt * 2) {
      const sk = me.skill;
      const hurt = Object.values(me.parts).some((p) => !p.broken && p.hp < p.max * 0.6);
      if ((sk === 'repair' && hurt) || (sk === 'guard' && (foeSwinging || d < 0.6)) || (sk === 'focus' && ranged.length && d < 3) || (sk === 'charge' && d > 0.5 && d < 1.3 && me.forward().angleTo(dir) < 0.3)) {
        inp.skill = true;
        return inp;
      }
    }

    // Attack when ready and in range.
    if (def && this.pause <= 0 && (me.state === 'idle' || me.state === 'walk')) {
      const facing = me.forward().angleTo(dir);
      let go = false;
      if (def.kind === 'melee') go = d - ROBOT_RADIUS <= def.reach * 0.9 && facing < THREE.MathUtils.degToRad(def.arc / 2) * 0.8;
      else go = d < def.range * 0.75 && los && facing < 0.3;
      if (go) {
        if (this.plan === 'arm_l') inp.pressL = true;
        else inp.pressR = true;
        this.pause = this.rand(this.p.pauseMin, this.p.pauseMax) + (def.length || 0);
        this.plan = null;
      }
    }
    return inp;
  }
}
