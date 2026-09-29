// One bout: two robots, projectiles, hits, the timer, and the end of the fight.
import * as THREE from 'three';
import { ARENA, FEEL, ROBOT_RADIUS, SKILLS, LEGLESS_DROP, ROBOTS, stockLoadout } from '../data.js';
import { Robot } from './robot.js';
import { AIController } from './ai.js';
import { build } from '../visuals/registry.js';

export const EMPTY_INPUT = Object.freeze({
  move: new THREE.Vector2(),
  pressL: false,
  pressR: false,
  holdL: false,
  holdR: false,
  dash: false,
  skill: false,
});

const DEG = Math.PI / 180;

export class Fight {
  constructor({ scene, rivalId, playerLoadout, playerPaints, rng = Math.random, playerAI = null }) {
    this.scene = scene;
    this.rng = rng;
    this.rivalId = rivalId;
    this.listeners = [];
    this.player = new Robot({ name: 'pipo', loadout: playerLoadout, paints: playerPaints, pos: ARENA.playerStart, yaw: 0, isPlayer: true });
    this.rival = new Robot({ name: rivalId, loadout: stockLoadout(rivalId), paints: {}, pos: ARENA.rivalStart, yaw: Math.PI, isPlayer: false });
    // A rival can be tougher than its parts' normal HP (the parts you win keep the normal numbers).
    const tough = ROBOTS[rivalId].toughness || 1;
    for (const p of Object.values(this.rival.parts)) p.hp = p.max = Math.round(p.max * tough);
    this.player.target = this.rival;
    this.rival.target = this.player;
    this.robots = [this.player, this.rival];
    this.robots.forEach((r) => scene.add(r.root));
    this.ai = new AIController(this.rival, this, ROBOTS[rivalId].ai, rng);
    this.playerAI = playerAI ? new AIController(this.player, this, playerAI, rng) : null;

    // Solid toy-block stacks (x/z box + height).
    this.blocks = ARENA.stacks.map(([x, z, n]) => {
      const h = ARENA.block / 2;
      return { minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h, top: n * ARENA.block };
    });
    this.projectiles = [];
    this.time = FEEL.fightTime;
    this.phase = 'intro';
    this.phaseT = 0;
    this.hitstop = 0;
    this.result = null;
    this.done = false;
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(type, data = {}) {
    for (const fn of this.listeners) fn(type, data);
  }

  dispose() {
    this.robots.forEach((r) => this.scene.remove(r.root));
    this.projectiles.forEach((p) => this.scene.remove(p.obj));
    this.projectiles = [];
  }

  // dt is already one small simulation step.
  update(dt, playerInput) {
    this.phaseT += dt;
    if (this.phase === 'intro') {
      this.robots.forEach((r) => r.update(dt, EMPTY_INPUT, this));
      if (this.phaseT >= FEEL.introTime) {
        this.phase = 'fight';
        this.phaseT = 0;
        this.emit('start');
      }
    } else if (this.phase === 'fight') {
      if (this.hitstop > 0) {
        this.hitstop -= dt; // both fighters freeze for a split second
        return;
      }
      this.time = Math.max(0, this.time - dt);
      const pIn = this.playerAI ? this.playerAI.update(dt) : playerInput;
      const rIn = this.ai.update(dt);
      this.player.update(dt, pIn, this);
      this.rival.update(dt, rIn, this);
      this.resolveCollisions();
      this.updateProjectiles(dt);
      this.checkEnd();
    } else if (this.phase === 'end') {
      this.robots.forEach((r) => r.update(dt, EMPTY_INPUT, this));
      this.updateProjectiles(dt);
      if (this.phaseT >= FEEL.outroTime) this.done = true;
    }
  }

  animate(dt) {
    const frozen = this.hitstop > 0;
    this.robots.forEach((r) => r.animate(frozen ? 0 : dt));
  }

  checkEnd() {
    const p = this.player;
    const r = this.rival;
    let winner = null;
    let reason = 'ko';
    if (r.headDown) winner = p;
    else if (p.headDown) winner = r;
    else if (this.time <= 0) {
      reason = 'timeout';
      const pct = (x) => x.parts.head.hp / x.parts.head.max;
      winner = pct(p) > pct(r) ? p : r;
      const loser = winner === p ? r : p;
      loser.setState('knocked_down');
    }
    if (!winner) return;
    winner.attack = null;
    winner.setState('victory');
    this.phase = 'end';
    this.phaseT = 0;
    this.result = {
      won: winner === p,
      reason,
      rival: this.rivalId,
      timeUsed: +(FEEL.fightTime - this.time).toFixed(1),
      player: summarize(p),
      rivalStats: summarize(r),
    };
    this.emit('end', this.result);
  }

  // ---------- hits ----------
  tryMelee(att, a) {
    const tgt = att.target;
    const to = new THREE.Vector3().subVectors(tgt.pos, att.pos).setY(0);
    const d = to.length();
    if (d - ROBOT_RADIUS > a.def.reach) return false;
    const fwd = att.forward();
    if (d > 1e-4 && fwd.angleTo(to) > (a.def.arc / 2) * DEG) return false;
    const dir = d > 1e-4 ? to.clone().divideScalar(d) : fwd;
    const sideX = a.slot === 'arm_r' ? -0.13 : 0.13;
    const shoulder = new THREE.Vector3(sideX, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), att.yaw).add(att.pos);
    const point = att.pos.clone()
      .addScaledVector(dir, Math.max(0, d - ROBOT_RADIUS * 0.8))
      .add(new THREE.Vector3(sideX * 0.5, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), att.yaw));
    point.y = a.def.height - (att.legless ? LEGLESS_DROP : 0) + (this.rng() - 0.5) * 0.12;
    return this.applyHit(att, tgt, a.id, a.def.damage, point, dir, shoulder);
  }

  tryCharge(att) {
    const tgt = att.target;
    const to = new THREE.Vector3().subVectors(tgt.pos, att.pos).setY(0);
    if (to.length() > ROBOT_RADIUS * 2 + 0.05) return false;
    const point = tgt.pos.clone().setY(0.3 - (att.legless ? LEGLESS_DROP : 0));
    return this.applyHit(att, tgt, 'horn_charge', SKILLS.charge.damage, point, to.normalize());
  }

  // `from` is where the blow came from; it decides which side of the target gets hit.
  applyHit(att, tgt, attackId, damage, point, dir, from = att.pos) {
    // A rival can hit softer than its parts' normal damage (the parts you win keep the normal numbers).
    if (att === this.rival) damage *= ROBOTS[this.rivalId].power || 1;
    const res = tgt.receiveHit({ damage, point, dir, from });
    if (!res) return false;
    this.hitstop = FEEL.hitstop;
    const st = att.stats.hits[attackId] || (att.stats.hits[attackId] = { hits: 0, damage: 0 });
    st.hits++;
    st.damage += res.dmg;
    att.stats.damageDealt += res.dmg;
    this.emit('hit', { attacker: att, target: tgt, point, attackId, ...res });
    if (res.broke) {
      const part = tgt.view.detach(res.slot);
      this.emit('break', { robot: tgt, slot: res.slot, part, dir });
    }
    return true;
  }

  // ---------- projectiles ----------
  spawnProjectile(att, a) {
    const def = a.def;
    const tgt = att.target;
    const up = new THREE.Vector3(0, 1, 0);
    const side = a.slot === 'arm_r' ? -0.13 : 0.13;
    const muzzle = new THREE.Vector3(side, 0.33 - att.drop, 0.2).applyAxisAngle(up, att.yaw).add(att.pos);
    muzzle.y = 0.3 - att.drop;
    const aim = tgt.pos.clone();
    aim.y = 0.26 - (tgt.legless ? LEGLESS_DROP : 0) + (this.rng() - 0.5) * 0.2;
    const dir = aim.sub(muzzle).normalize();
    if (def.kind === 'rocket') {
      // Launched 30 degrees upward, then homes in.
      dir.copy(att.forward()).multiplyScalar(Math.cos(30 * DEG)).setY(Math.sin(30 * DEG));
    }
    let damage = def.damage;
    if (att.focusShots > 0) {
      damage *= SKILLS.focus.mul;
      att.focusShots--;
    }
    const obj = build(def.kind === 'rocket' ? 'bottle_rocket' : 'cork_pellet');
    obj.position.copy(muzzle);
    this.scene.add(obj);
    this.projectiles.push({ kind: def.kind, owner: att, target: tgt, attackId: a.id, pos: muzzle, dir, speed: def.speed, range: def.range, travelled: 0, damage, turn: (def.turn || 0) * DEG, obj });
    this.emit('shot', { robot: att, attackId: a.id });
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (p.kind === 'rocket' && p.target.state !== 'knocked_down') {
        const want = p.target.pos.clone().setY(0.28 - (p.target.legless ? LEGLESS_DROP : 0)).sub(p.pos).normalize();
        const ang = p.dir.angleTo(want);
        if (ang > 1e-4) p.dir.lerp(want, Math.min(1, (p.turn * dt) / ang)).normalize();
      }
      const step = p.speed * dt;
      p.pos.addScaledVector(p.dir, step);
      p.travelled += step;
      p.obj.position.copy(p.pos);
      p.obj.lookAt(p.pos.clone().add(p.dir));
      let gone = p.travelled > p.range;
      const tgt = p.target;
      const flat = Math.hypot(p.pos.x - tgt.pos.x, p.pos.z - tgt.pos.z);
      if (!gone && flat < ROBOT_RADIUS && p.pos.y > 0 && p.pos.y < tgt.top && tgt.state !== 'knocked_down') {
        const from = p.pos.clone().addScaledVector(p.dir, -0.5);
        this.applyHit(p.owner, tgt, p.attackId, p.damage, p.pos.clone(), p.dir.clone().setY(0).normalize(), from);
        gone = true;
      }
      if (!gone && (Math.abs(p.pos.x) > ARENA.half || Math.abs(p.pos.z) > ARENA.half || p.pos.y < 0)) {
        this.emit('fizzle', { point: p.pos.clone() });
        gone = true;
      }
      if (!gone && this.blocks.some((b) => p.pos.x > b.minX && p.pos.x < b.maxX && p.pos.z > b.minZ && p.pos.z < b.maxZ && p.pos.y < b.top)) {
        this.emit('fizzle', { point: p.pos.clone() });
        gone = true;
      }
      if (gone) this.scene.remove(p.obj);
      else keep.push(p);
    }
    this.projectiles = keep;
  }

  // ---------- collisions ----------
  resolveCollisions() {
    const [a, b] = this.robots;
    const d = new THREE.Vector3().subVectors(b.pos, a.pos).setY(0);
    const len = d.length();
    const min = ROBOT_RADIUS * 2;
    if (len < min) {
      const push = d.lengthSq() > 1e-8 ? d.normalize() : new THREE.Vector3(1, 0, 0);
      const o = (min - len) / 2;
      a.pos.addScaledVector(push, -o);
      b.pos.addScaledVector(push, o);
    }
    for (const r of this.robots) {
      for (const bl of this.blocks) {
        const cx = Math.max(bl.minX, Math.min(r.pos.x, bl.maxX));
        const cz = Math.max(bl.minZ, Math.min(r.pos.z, bl.maxZ));
        const dx = r.pos.x - cx;
        const dz = r.pos.z - cz;
        const dd = Math.hypot(dx, dz);
        if (dd < ROBOT_RADIUS) {
          if (dd > 1e-6) {
            r.pos.x = cx + (dx / dd) * ROBOT_RADIUS;
            r.pos.z = cz + (dz / dd) * ROBOT_RADIUS;
          } else r.pos.x = bl.maxX + ROBOT_RADIUS;
        }
      }
      const lim = ARENA.half - ARENA.wallMargin;
      r.pos.x = Math.max(-lim, Math.min(lim, r.pos.x));
      r.pos.z = Math.max(-lim, Math.min(lim, r.pos.z));
    }
  }

  // Is the straight line between two points blocked by a toy-block stack?
  lineBlocked(a, b) {
    for (const bl of this.blocks) {
      let t0 = 0;
      let t1 = 1;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
        return true;
      };
      if (clip(-dx, a.x - bl.minX) && clip(dx, bl.maxX - a.x) && clip(-dz, a.z - bl.minZ) && clip(dz, bl.maxZ - a.z)) return true;
    }
    return false;
  }
}

function summarize(r) {
  const parts = {};
  for (const [slot, p] of Object.entries(r.parts)) parts[slot] = { hp: Math.ceil(p.hp), max: p.max, broken: p.broken };
  return { hits: r.stats.hits, damageDealt: Math.round(r.stats.damageDealt), damageTaken: Math.round(r.stats.damageTaken), attacksStarted: r.stats.attacksStarted, blocks: r.stats.blocks, partsBroken: r.stats.partsBroken, parts };
}
