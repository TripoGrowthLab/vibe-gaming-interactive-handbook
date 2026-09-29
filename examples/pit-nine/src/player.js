import { Body, clamp } from './body.js';
import { PLAYER, FEEL } from './config.js';
import { input } from './input.js';

export class Player extends Body {
  constructor(view) {
    super(view);
    this.hp = PLAYER.maxHp;
    this.state = 'idle';
    this.t = 0;
    this.vel = { x: 0, z: 0 };
    this.fireCooldown = 0;
    this.pendingShot = -1; // seconds until the bolt leaves the gun
    this.queued = 0; // a click queued during the cooldown
    this.shootLayer = 0; // >0 while the upper body plays "shoot"
    this.rollCooldown = 0;
    this.rollBuffer = 0;
    this.rollDir = { x: 0, z: 1 };
    this.invuln = 0;
    this.push = { x: 0, z: 0, t: 0 };
    this.runPhase = 0;
    this.prevRunPhase = 0;
    this.recoil = 0;
  }

  get alive() {
    return this.state !== 'knocked_down';
  }
  get rolling() {
    return this.state === 'roll';
  }
  get protectedNow() {
    if (this.invuln > 0 || !this.alive || this.state === 'cheer') return true;
    return this.rolling && this.t >= PLAYER.rollInvulnFrom && this.t <= PLAYER.rollInvulnTo;
  }
  setState(s) {
    if (s !== this.state) (this.state = s), (this.t = 0);
  }
  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  update(dt, game) {
    this.prevRunPhase = this.runPhase;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.shootLayer = Math.max(0, this.shootLayer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.rollBuffer = Math.max(0, this.rollBuffer - dt);
    this.queued = Math.max(0, this.queued - dt);
    if (input.rollPressed) (this.rollBuffer = PLAYER.rollBuffer), (input.rollPressed = false);
    if (input.firePressed) (this.queued = PLAYER.queueWindow), (input.firePressed = false);
    if (!this.alive || this.state === 'cheer') {
      this.vel.x = this.vel.z = 0;
      return;
    }

    const aim = game.aim;
    const mx = input.move.x;
    const mz = input.move.z;
    const moving = Math.hypot(mx, mz) > 0.15;

    // --- roll
    if (this.rolling) {
      const sp = PLAYER.rollDistance / PLAYER.rollTime;
      this.vel.x = this.rollDir.x * sp;
      this.vel.z = this.rollDir.z * sp;
      this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
      if (this.t >= PLAYER.rollTime) {
        this.setState(moving ? 'run' : 'idle');
        this.rollCooldown = PLAYER.rollCooldown;
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
      }
    } else if (this.rollBuffer > 0 && this.rollCooldown <= 0 && this.state !== 'hurt') {
      const len = Math.hypot(mx, mz);
      this.rollDir = moving ? { x: mx / len, z: mz / len } : aim.dir ? { ...aim.dir } : this.forward();
      this.rollBuffer = 0;
      this.pendingShot = -1;
      this.setState('roll');
      game.stats.rolls++;
    } else {
      // --- walk / run
      const slow = this.state === 'hurt' ? 0.6 : 1;
      const wx = mx * PLAYER.speed * slow;
      const wz = mz * PLAYER.speed * slow;
      const dv = PLAYER.accel * dt;
      this.vel.x += clamp(wx - this.vel.x, -dv, dv);
      this.vel.z += clamp(wz - this.vel.z, -dv, dv);
      if (aim.dir) this.yaw = Math.atan2(aim.dir.x, aim.dir.z);
      if (this.state === 'hurt') {
        if (this.t >= PLAYER.hurtTime) this.setState(moving ? 'run' : 'idle');
      } else this.setState(moving ? 'run' : 'idle');

      // --- shooting: hold to fire; a click during the cooldown is queued
      if ((input.fireHeld || this.queued > 0) && this.fireCooldown <= 0 && this.pendingShot < 0) {
        this.fireCooldown = PLAYER.fireInterval;
        this.pendingShot = PLAYER.fireFraction * PLAYER.fireInterval;
        this.queued = 0;
        this.shootLayer = 0.25;
      }
    }
    if (this.pendingShot >= 0) {
      this.pendingShot -= dt;
      if (this.pendingShot < 0) {
        game.fireBolt(this);
        this.recoil = 1;
      }
    }

    // --- push-back from hits
    let px = 0;
    let pz = 0;
    if (this.push.t > 0) {
      this.push.t -= dt;
      px = this.push.x / FEEL.pushTime;
      pz = this.push.z / FEEL.pushTime;
    }
    this.pos.x += (this.vel.x + px) * dt;
    this.pos.z += (this.vel.z + pz) * dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.runPhase += sp * dt * 2.2;
    game.collide(this, PLAYER.radius);
  }

  // returns true if the hit landed
  damage(amount, dir, push, source, game) {
    if (this.protectedNow) {
      if (this.rolling) game.stats.dodged[source] = (game.stats.dodged[source] || 0) + 1;
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    game.stats.damageTaken[source] = (game.stats.damageTaken[source] || 0) + amount;
    this.invuln = PLAYER.invulnAfterHit;
    const len = Math.hypot(dir.x, dir.z) || 1;
    this.push = { x: (dir.x / len) * push, z: (dir.z / len) * push, t: FEEL.pushTime };
    this.pendingShot = -1;
    this.view.flash(0.1);
    game.hitstop(FEEL.playerHitFreeze);
    game.sfx?.('hurt');
    game.shake(0.25);
    if (this.hp <= 0) {
      this.setState('knocked_down');
      game.onPlayerDown();
    } else this.setState('hurt');
    return true;
  }

  // what the view needs every rendered frame
  viewInfo(alpha) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const vx = sp > 0.01 ? this.vel.x / sp : 0;
    const vz = sp > 0.01 ? this.vel.z / sp : 0;
    return {
      speed01: Math.min(1, sp / PLAYER.speed),
      speed: sp,
      runPhase: this.prevRunPhase + (this.runPhase - this.prevRunPhase) * alpha,
      moveLocalZ: vx * s + vz * c,
      moveLocalX: vx * c - vz * s,
      rollT: this.rolling ? Math.min(1, this.t / PLAYER.rollTime) : 0,
      shootFlash: this.recoil,
      recoil: this.recoil,
      shooting: this.shootLayer > 0,
      invuln: this.invuln,
    };
  }
}
