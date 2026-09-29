import { Fighter } from './fighter.js';
import { ATTACKS, COMBO, COMBO_GRACE } from '../config.js';

const MAGNET = 0.25;     // during a punch's wind-up Volt slides up to this far in depth (Z) towards his target

// Volt, driven by the Input (keyboard, touch or bot).
export class Hero extends Fighter {
  constructor(scene) {
    super('hero', 0, 0, scene);
    this.comboStep = 0;       // how many punches of the combo have been thrown
    this.comboGrace = 0;
    this.queued = null;       // 'punch' | 'kick' pressed during an attack
    this.target = null;       // who the current attack steps towards
  }

  update(dt, input, enemies) {
    if (!this.tick(dt)) return;        // presses stay in the input queue during hitstop
    const punch = input.takePunch(), kick = input.takeKick();
    const move = input.move;
    this.comboGrace -= dt;
    if (this.comboGrace <= 0 && this.state !== 'attack') this.comboStep = 0;

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'run': {
        // Running attack: only while still running (run held and moving) at the moment of the press.
        const running = this.state === 'run' && input.running && Math.hypot(move.x, move.z) > 0.1;
        if (punch || kick) { this.begin(punch ? 'punch' : 'kick', move, enemies, running); break; }
        this.walk(move, input.running, dt);
        break;
      }
      case 'attack': {
        const a = this.attack, def = a.def;
        a.t += dt;
        if (punch) this.queued = 'punch';        // input buffer: queue the next attack
        if (kick) this.queued = 'kick';
        this.stepIn(dt);
        const p = a.t / a.dur;
        // Once the blow has landed and followed through, a queued attack starts straight away,
        // and walking cancels the rest of the recovery.
        const canCancel = p >= (def.cancel ?? 1);
        if (canCancel && this.queued) {
          const q = this.queued; this.queued = null;
          this.attack = null;
          this.begin(q, move, enemies);
        } else if (canCancel && Math.hypot(move.x, move.z) > 0.1) {
          this.attack = null;
          this.comboGrace = COMBO_GRACE;
          this.walk(move, input.running, dt);
        } else if (a.t >= a.dur) {
          this.attack = null;
          this.comboGrace = COMBO_GRACE;
          this.setState('idle', 'idle');
        }
        break;
      }
      case 'hurt':
        if (this.stateTime >= this.stunFor) this.setState('idle', 'idle');
        break;
    }
  }

  walk(move, running, dt) {
    const len = Math.hypot(move.x, move.z);
    if (len > 0.1) {
      const speed = running ? this.cfg.runSpeed : this.cfg.speed;
      const k = running ? 1 / Math.max(len, 1e-6) : 1;     // running is always full speed
      this.moveBy(move.x * k, move.z * k, speed, dt);
      if (Math.abs(move.x) > 0.1) this.facing = Math.sign(move.x);
      const s = running ? 'run' : 'walk';
      if (this.state !== s) this.setState(s, s);
    } else if (this.state !== 'idle') this.setState('idle', 'idle');
  }

  // Step in during the wind-up so the blow really connects: forward up to def.lunge, and a little
  // in depth towards the target, stopping once at contact distance.
  stepIn(dt) {
    const a = this.attack, def = a.def;
    const t = this.target?.alive ? this.target : null;
    if (!def.lunge) return;
    const windUp = def.hit[0] * a.dur, start = (a.from ?? 0) * a.dur;
    if (a.t > windUp || windUp <= start) return;
    if (!t) {
      // Running attacks carry Volt forward even with nobody in front.
      if (def.dash) {
        const step = Math.min((def.lunge / (windUp - start)) * dt, def.lunge - (a.lunged ?? 0));
        if (step > 0) { this.pos.x += this.facing * step; a.lunged = (a.lunged ?? 0) + step; }
      }
      return;
    }
    const stopAt = Math.max(this.radius + t.radius + 0.05, def.closeTo ?? 0);
    const gap = (t.pos.x - this.pos.x) * this.facing - stopAt;
    if (gap > 0) {
      const step = Math.min(gap, (def.lunge / (windUp - start)) * dt, def.lunge - (a.lunged ?? 0));
      if (step > 0) { this.pos.x += this.facing * step; a.lunged = (a.lunged ?? 0) + step; }
    }
    const dz = t.pos.z - this.pos.z;
    if (Math.abs(dz) > 0.02) {
      const stepZ = Math.min(Math.abs(dz), (MAGNET / (windUp - start)) * dt, MAGNET - (a.magnet ?? 0));
      if (stepZ > 0) { this.pos.z += Math.sign(dz) * stepZ; a.magnet = (a.magnet ?? 0) + stepZ; }
    }
  }

  // running: J or K from a run gives the charging hook or the flying kick.
  begin(kind, move, enemies, running = false) {
    // Target: the nearest enemy close by (ahead if a direction is held).
    const dir = Math.abs(move.x) > 0.1 ? Math.sign(move.x) : 0;
    let best = null, bestD = running ? 3.5 : 2.2;
    for (const e of enemies) {
      if (!e.alive || e.entering || Math.abs(e.pos.z - this.pos.z) > 1) continue;
      const dx = e.pos.x - this.pos.x;
      if (dir && Math.sign(dx) !== dir) continue;
      const d = Math.hypot(dx, e.pos.z - this.pos.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    this.target = best;
    if (dir) this.facing = dir;
    else if (best) this.facing = Math.sign(best.pos.x - this.pos.x) || this.facing;

    if (running) { this.comboStep = 0; this.startAttack(kind === 'kick' ? 'flying_kick' : 'dash_hook'); return; }
    if (kind === 'kick') {
      // J, J, K: after the cross, K is the sweeping combo kick.
      const combo = this.comboStep === 2;
      this.comboStep = 0;
      const name = combo ? 'combo_kick' : 'kick';
      const from = combo ? (ATTACKS.combo_kick.chainFrom ?? 0) : 0;
      this.startAttack(name, from);
      this.attack.from = from;
      return;
    }
    this.comboStep = this.comboStep < COMBO.length ? this.comboStep + 1 : 1;
    const name = COMBO[this.comboStep - 1];
    // A follow-up in the combo skips its slow wind-up (chainFrom).
    const from = this.comboStep > 1 ? (ATTACKS[name].chainFrom ?? 0) : 0;
    this.startAttack(name, from);
    this.attack.from = from;
  }

  takeHit(def) {
    this.queued = null;
    this.comboStep = 0;
    return super.takeHit(def);
  }

  win() { this.attack = null; this.queued = null; this.setState('win', 'cheer'); }
}
