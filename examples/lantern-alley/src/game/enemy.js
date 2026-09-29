import { Fighter } from './fighter.js';
import { ARENA, ATTACKS, TURN_TIMEOUT, WAIT_DISTANCE, RANDOM, STEERING, ENGAGE, MOVES, MOVESETS, SPECIALS } from '../config.js';
import { random, range, chance, jitter } from './random.js';

let nextId = 0;

// Thugs and the boss. Only the enemy holding the attack turn walks in and fights; it keeps
// the turn for the whole exchange. The rest wait 2.5–3.5 m away and shift around.
export class Enemy extends Fighter {
  constructor(kind, side, z, scene) {
    super(kind, side * ARENA.spawnX, z, scene);
    this.id = nextId++;
    this.side = side;                 // which side of Volt this enemy fights from (sticky)
    this.facing = -side;
    this.entering = true;
    this.vel = { x: -side * this.cfg.speed, z: 0 };
    this.cooldown = range(0.4, 1.2);
    this.waitTime = 0;
    this.turnTime = 0;
    this.rush = false;
    this.engaged = false;
    this.sinceContact = 0;
    this.farTime = 0;
    this.hopCooldown = 0;
    this.alert = () => {};            // set by the game: shows "!" above this enemy
    this.onMove = () => {};           // set by the game: counts special moves
    this.plan = null;
    this.pickSpot();
  }

  // A new place to wait: angle around Volt and distance, re-rolled every few seconds.
  pickSpot() {
    this.spotAngle = range(-0.9, 0.9);
    this.waitDist = range(WAIT_DISTANCE[0], WAIT_DISTANCE[1]);
    this.spotTimer = range(...RANDOM.repositionEvery);
  }

  get attackDelay() {
    const base = this.kind === 'boss' && this.hp < this.maxHp / 2 ? this.cfg.enragedDelay : this.cfg.attackDelay;
    return jitter(base, RANDOM.attackDelayJitter);
  }

  update(dt, hero, turns, enemies) {
    if (!this.tick(dt)) return;
    this.cooldown -= dt;
    this.hopCooldown -= dt;
    const back = () => this.mode(turns.holder === this ? 'walk' : 'wait');

    switch (this.state) {
      case 'ko': return;
      case 'hurt':
        this.stop();
        this.sinceContact = 0;
        // A Sprat sometimes hops back out of a combo after a jab or cross.
        if (this.hopPending && this.stateTime >= 0.1) {
          this.hopPending = false;
          this.hopDir = Math.sign(this.pos.x - hero.pos.x) || this.side;
          this.invuln = Math.max(this.invuln, MOVES.spratHop.time + 0.1);
          this.hopCooldown = MOVES.spratHop.cooldown;
          this.mode('hop');
          this.playAnim('walk');
          this.onMove('sprat_hop');
          return;
        }
        if (this.stateTime >= this.stunFor) this.setState(turns.holder === this ? 'walk' : 'wait', 'idle');
        return;
      case 'hop': {
        const m = MOVES.spratHop;
        this.vel.x = this.hopDir * (m.distance / m.time); this.vel.z = 0;
        this.pos.x += this.vel.x * dt;
        this.facing = -this.hopDir;
        if (this.stateTime >= m.time) { this.vel.x = 0; back(); }
        return;
      }
      case 'windup':                      // standing still with a "!" before a special move
        this.stop();
        this.facing = -this.side;
        this.playAnim('idle');
        if (this.stateTime >= this.windupFor) this.unleash(hero);
        return;
      case 'charge': {                    // Big Anvil's bull charge
        const m = MOVES.anvilCharge;
        this.vel.x = this.facing * m.speed; this.vel.z = 0;
        this.pos.x += this.vel.x * dt;
        this.pos.z += Math.max(-0.8 * dt, Math.min(0.8 * dt, hero.pos.z - this.pos.z));
        this.playAnim('run');
        const ahead = (hero.pos.x - this.pos.x) * this.facing;
        if (ahead > 0 && ahead <= ATTACKS.anvil_haymaker.reach + hero.radius * 0.5 && Math.abs(hero.pos.z - this.pos.z) < 0.6) {
          this.engaged = true;
          this.throw('anvil_haymaker');
        } else if (ahead < -0.5 || this.stateTime > 1.6) { this.stop(); this.cooldown = 0.6; back(); }
        return;
      }
      case 'taunt':                       // a waiting enemy shows off (and is open to a hit)
        this.stop();
        this.facing = -this.side;
        this.playAnim('cheer');
        if (this.stateTime >= MOVES.taunt.time || turns.holder === this) { this.playAnim('idle'); back(); }
        return;
      case 'roar':                        // Big Anvil calls for help
        this.stop();
        this.playAnim('cheer');
        if (this.stateTime >= MOVES.anvilSummon.warn) { this.summon = true; back(); }
        return;
      case 'attack': {
        const a = this.attack;
        a.t += dt;
        this.sinceContact = 0;
        if (a.def.charge) {               // Slab's belly charge keeps running until it hits
          this.vel.x = this.facing * a.def.charge; this.vel.z = 0;
          this.pos.x += this.vel.x * dt;
          if (a.hits.size) a.t = a.dur;
        } else this.stop();
        // A feint: the jab starts, then stops; the real one comes a moment later.
        if (a.feint && a.t / a.dur >= MOVES.spratFeint.at) {
          this.attack = null;
          this.cooldown = MOVES.spratFeint.pause;
          this.setState('walk', 'idle');
          return;
        }
        if (a.t >= a.dur) {
          const next = this.comboNext; this.comboNext = null;
          this.attack = null;
          if (next && hero.alive) { this.throw(next, null); this.onMove('follow_up'); return; }   // follow-ups do not chain further
          // Stay in the fight: the next attack comes after the enemy's delay plus the wave's pause.
          this.cooldown = (a.def.charge ? MOVES.slabCharge.recover : 0) + this.attackDelay + turns.pause();
          this.stop();
          this.setState(turns.holder === this ? 'walk' : 'wait', 'idle');
        }
        return;
      }
    }

    if (this.entering) {
      // Walk in from the end of the alley (even if a punch stopped it on the way).
      this.vel.x = -this.side * this.cfg.speed; this.vel.z = 0;
      this.pos.x += this.vel.x * dt;
      this.facing = -this.side;
      this.playAnim('walk');
      if (Math.abs(this.pos.x) < ARENA.maxX - 1) { this.entering = false; this.mode('wait'); }
      return;
    }

    if (!hero.alive || hero.state === 'win') {
      this.steer(this.pos.x, this.pos.z, 0, dt);
      this.mode('idle');
      return;
    }

    if (this.has('roar') && !this.roared && this.hp < this.maxHp * MOVES.anvilSummon.atHp) {
      this.roared = true;
      this.mode('roar');
      this.alert('ROAR!');
      this.onMove('anvil_summon');
      return;
    }

    const dx = this.pos.x - hero.pos.x;
    if (Math.abs(dx) > 0.5) this.side = Math.sign(dx);     // sticky, so facing never flickers
    let tx, tz, speed = this.cfg.speed;

    if (turns.holder === this) {
      this.turnTime += dt;
      this.sinceContact += dt;
      if (this.engaged) {
        // Focused on the fight: only step back when the fight has paused.
        const far = Math.hypot(dx, this.pos.z - hero.pos.z) > ENGAGE.leaveDistance;
        this.farTime = far ? this.farTime + dt : 0;
        if (this.farTime > ENGAGE.leaveAfter || (this.turnTime > this.engageFor && this.sinceContact > ENGAGE.quietTime)) {
          turns.note(this.farTime > ENGAGE.leaveAfter ? 'Volt walked away' : 'fight paused');
          turns.release(this);
          return;
        }
      } else if (this.turnTime > TURN_TIMEOUT) { turns.note('could not reach Volt'); turns.release(this); return; }
      const adx = Math.abs(dx), adz = Math.abs(this.pos.z - hero.pos.z);
      if (!this.plan) this.plan = this.pickAttack(adx);
      const def = ATTACKS[this.plan.name];
      // Special moves, tried while walking in (before the fight starts).
      if (!this.engaged && !this.specialDone && this.cooldown <= 0) {
        if (this.has('dash') && this.specialRoll < MOVES.spratDash.chance && adx >= MOVES.spratDash.minDistance) return this.windup(MOVES.spratDash.warn, 'dash', 'dash');
        if (this.has('charge') && this.specialRoll < MOVES.slabCharge.chance && adx >= MOVES.slabCharge.minDistance && adx <= MOVES.slabCharge.maxDistance && adz < 0.5) return this.windup(MOVES.slabCharge.warn, 'charge', 'charge');
        if (this.has('bull') && this.specialRoll < MOVES.anvilCharge.chance && adx >= MOVES.anvilCharge.minDistance) return this.windup(MOVES.anvilCharge.warn, 'bull', 'anvil_charge');
      }
      // Too far for the planned attack's distance limits now? Pick again.
      if ((this.plan.maxDist && adx > this.plan.maxDist + 0.3) || (this.plan.minDist && adx < this.plan.minDist - 0.3)) this.plan = this.pickAttack(adx);
      if (this.inReach(hero, ATTACKS[this.plan.name]) && adx >= this.radius && this.cooldown <= 0) {
        this.engaged = true;
        this.dashing = false;
        this.facing = -this.side;
        const plan = this.plan;
        this.plan = null;
        this.throw(plan.name, plan);
        if (this.has('feint') && !this.feinted && chance(MOVES.spratFeint.chance)) { this.feinted = true; this.attack.feint = true; this.comboNext = null; this.onMove('sprat_feint'); }
        return;
      }
      tx = hero.pos.x + this.side * Math.max(this.radius + hero.radius + 0.05, ATTACKS[this.plan.name].reach * 0.8);
      tz = hero.pos.z;
      if (this.rush && !this.engaged) speed *= 1.8;
      if (this.dashing) speed *= MOVES.spratDash.speedScale;
      this.mode('walk');
    } else {
      this.waitTime += dt;
      this.spotTimer -= dt;
      if (this.spotTimer <= 0) {
        this.pickSpot();
        if (this.has('taunt') && Math.hypot(dx, this.pos.z - hero.pos.z) > MOVES.taunt.minDistance && chance(MOVES.taunt.chance)) {
          this.mode('taunt');
          this.onMove('taunt');
          return;
        }
      }
      tx = hero.pos.x + this.side * this.waitDist * Math.cos(this.spotAngle);
      tz = hero.pos.z + this.waitDist * Math.sin(this.spotAngle);
      // keep clear of other waiting enemies
      for (const o of enemies) {
        if (o === this || !o.alive || o.entering) continue;
        const ox = tx - o.pos.x, oz = tz - o.pos.z, od = Math.hypot(ox, oz);
        if (od < STEERING.separation && od > 1e-3) { tx += (ox / od) * (STEERING.separation - od); tz += (oz / od) * (STEERING.separation - od); }
      }
      speed *= 0.7;
      this.mode('wait');
    }

    tx = Math.min(ARENA.maxX, Math.max(ARENA.minX, tx));
    tz = Math.min(ARENA.maxZ, Math.max(ARENA.minZ, tz));
    this.steer(tx, tz, speed, dt);
    this.facing = -this.side;
  }

  // Stand still with a "!" for `time`, then do the special move.
  windup(time, special, name) {
    this.specialDone = true;
    this.special = special;
    this.windupFor = time;
    this.stop();
    this.mode('windup');
    this.alert('!');
    this.onMove(name);
  }

  unleash(hero) {
    this.facing = -this.side;
    if (this.special === 'dash') { this.dashing = true; this.cooldown = 0; this.mode('walk'); }
    else if (this.special === 'charge') this.startAttack('slab_charge');
    else if (this.special === 'bull') this.mode('charge');
  }

  has(special) { return SPECIALS[this.kind]?.includes(special); }

  // Pick an attack from this kind's move set, by weight, among those allowed at this distance.
  pickAttack(adx) {
    const set = MOVESETS[this.kind];
    const ok = set.filter(o => (!o.minDist || adx >= o.minDist) && (!o.maxDist || adx <= o.maxDist));
    const list = ok.length ? ok : set;
    let r = random() * list.reduce((a, o) => a + o.weight, 0);
    for (const o of list) { r -= o.weight; if (r <= 0) return o; }
    return list[list.length - 1];
  }

  // Start an attack; maybe line up a follow-up from its `then` list.
  throw(name, option = MOVESETS[this.kind].find(o => o.name === name)) {
    const def = ATTACKS[name];
    this.startAttack(name, this.comboChain && def.chainFrom ? def.chainFrom : 0);
    this.comboChain = false;
    this.comboNext = null;
    const enraged = this.hp < this.maxHp / 2;
    for (const t of option?.then ?? []) {
      if (chance(enraged && t.enraged != null ? t.enraged : t.chance)) { this.comboNext = t.name; this.comboChain = true; break; }
    }
  }

  takeHit(def) {
    const ko = super.takeHit(def);
    this.dashing = false;
    this.comboNext = null;
    this.comboChain = false;
    if (!ko && this.has('hop') && !def.breaksArmor && this.hopCooldown <= 0 && chance(MOVES.spratHop.chance)) this.hopPending = true;
    return ko;
  }

  inReach(hero, def) {
    return Math.abs(this.pos.x - hero.pos.x) <= def.reach + hero.radius * 0.5 && Math.abs(this.pos.z - hero.pos.z) < 0.35;
  }

  // Glide towards a point: slow down when arriving, change speed gradually, and only swap
  // walk/idle when the speed clearly changes (no stop-start every frame).
  steer(tx, tz, speed, dt) {
    const mx = tx - this.pos.x, mz = tz - this.pos.z, d = Math.hypot(mx, mz);
    const want = Math.min(speed, d * STEERING.arrive);
    const wx = d > 1e-4 ? (mx / d) * want : 0, wz = d > 1e-4 ? (mz / d) * want : 0;
    let ax = wx - this.vel.x, az = wz - this.vel.z;
    const a = Math.hypot(ax, az), max = STEERING.accel * dt;
    if (a > max) { ax *= max / a; az *= max / a; }
    this.vel.x += ax; this.vel.z += az;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const v = Math.hypot(this.vel.x, this.vel.z);
    // walk / run / idle by speed, with some slack so it does not flicker
    let anim = this.anim === 'run' ? (v < STEERING.runBelow ? 'walk' : 'run') : v > STEERING.runAbove ? 'run' : this.anim;
    if (anim !== 'run') anim = this.anim === 'walk' ? (v < STEERING.idleBelow ? 'idle' : 'walk') : v > STEERING.walkAbove ? 'walk' : 'idle';
    this.playAnim(anim);
  }

  stop() { this.vel.x = 0; this.vel.z = 0; }

  // Change state without restarting the animation that is playing.
  mode(state) { if (this.state !== state) { this.state = state; this.stateTime = 0; } }

  // engaged = already in a fight with Volt (it was hit while waiting).
  onTurnGiven(engaged = false) {
    this.turnTime = 0; this.waitTime = 0; this.plan = null;
    this.specialRoll = random(); this.specialDone = engaged; this.feinted = false; this.dashing = false;
    this.engaged = engaged; this.farTime = 0; this.sinceContact = 0;
    this.engageFor = range(...ENGAGE.minTime);
    this.rush = this.kind === 'thug_fat' && chance(RANDOM.slabRush);
  }
}

// Only one enemy at a time may attack. The next turn goes to a random waiting enemy,
// more likely the longer it has waited.
export class AttackTurns {
  constructor() { this.gap = 0; this.reset(); }
  reset() { this.holder = null; this.cooldown = 0; this.ends = {}; }
  note(reason) { this.ends[reason] = (this.ends[reason] ?? 0) + 1; }
  pause() { return jitter(this.gap, RANDOM.turnGapJitter); }
  release(e) {
    if (this.holder !== e) return;
    this.holder = null;
    this.cooldown = this.pause();
    e.cooldown = Math.max(e.cooldown, e.attackDelay);
    e.engaged = false;
  }
  // Volt hit an enemy: that enemy fights back, unless the current holder is mid-attack.
  engage(e) {
    if (!e.alive || e.entering || this.holder === e) { if (this.holder === e) e.engaged = true; return; }
    // Keep the current fight going: no switch while its enemy is attacking or was in a blow in the last second.
    const busy = ['attack', 'windup', 'charge', 'roar', 'hop'].includes(this.holder?.state);
    if (this.holder && (busy || (this.holder.engaged && this.holder.sinceContact < 1))) return;
    if (this.holder) { this.note(this.holder.engaged ? 'Volt hit another enemy (mid-fight)' : 'Volt hit another enemy'); const old = this.holder; this.holder = null; old.engaged = false; old.cooldown = Math.max(old.cooldown, old.attackDelay); }
    this.holder = e;
    e.onTurnGiven(true);
  }
  update(dt, enemies) {
    this.cooldown -= dt;
    if (this.holder && (!this.holder.alive || this.holder.removed)) this.holder = null;
    if (this.holder || this.cooldown > 0) return;
    const ready = enemies.filter(e => e.alive && !e.entering && e.cooldown <= 0 && ['wait', 'idle', 'walk'].includes(e.state));
    if (!ready.length) return;
    const weights = ready.map(e => 0.5 + e.waitTime);
    let r = random() * weights.reduce((a, b) => a + b, 0);
    let pick = ready[ready.length - 1];
    for (let i = 0; i < ready.length; i++) { r -= weights[i]; if (r <= 0) { pick = ready[i]; break; } }
    this.holder = pick;
    pick.onTurnGiven();
  }
}
