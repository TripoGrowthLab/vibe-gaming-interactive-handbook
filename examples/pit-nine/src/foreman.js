import * as THREE from 'three';
import { Body, dist2, lerpAngle, clamp } from './body.js';
import { FOREMAN, FEEL, ARENA } from './config.js';

const A = FOREMAN.attacks;
const LEGS = ['front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'];
export const BREAKABLE = ['left_cannon', 'right_cannon', 'missile_pod', 'armour_plate', 'core'];

// Hit spheres in each part's own space (x, y, z, radius). Gameplay owns these, not the looks.
// Fitted to the Tripo model (tools/lab-fit.mjs); the hull's blocking spheres stay clear of the pod and the core.
const HIT = {
  left_cannon: [[0, 0, -0.05, 0.85], [0, 0, 0.95, 0.5], [0, 0, 1.7, 0.45]],
  right_cannon: [[0.25, 0, -0.15, 0.9], [0, 0, 1.05, 0.5], [0, 0, 1.95, 0.45]],
  missile_pod: [[0, 0.64, 0, 0.95]],
  armour_plate: [[-0.6, -0.95, 0.7, 0.8], [0.6, -0.95, 0.7, 0.8]],
  core: [[0, 0, 0.2, 0.7]],
  hull: [[0, -0.7, 0, 1.55], [1.4, -0.7, 0, 1.25], [-1.2, -0.7, 0, 1.2]],
};
const MUZZLE = new THREE.Vector3(0, 0, 2.1); // barrel tips are 2.0 and 2.3 m ahead of the hinge
const _v = new THREE.Vector3();

export class Foreman extends Body {
  constructor(view) {
    super(view);
    this.state = 'dormant';
    this.t = 0;
    this.attack = null;
    this.attackT = 0;
    this.cooldown = 0;
    this.nextAttack = 0;
    this.parts = {};
    for (const n of BREAKABLE) this.parts[n] = { hp: FOREMAN.partHp[n], max: FOREMAN.partHp[n], broken: false, invuln: 0 };
    this.walkPhase = 0;
    this.ringR = 0;
    this.ringA = 0;
    this.hitDone = false;
    this.shotsFired = 0;
    this.missilePlan = null;
    this.ramDir = { x: 0, z: 1 };
    this.beamOn = 0; // 0 off, 1 warning, 2 active
    this.beamYaw = 0;
    this.beamOrigin = new THREE.Vector3();
    this.lidOpen = 0;
    for (const k of ['upper.rx', 'upper.py', 'left_cannon.rx', 'left_cannon.pz', 'right_cannon.rx', 'right_cannon.ry', 'lid.rx', 'armour_plate.rx', ...LEGS.map((l) => l + '.rx'), ...LEGS.map((l) => l + '.rz')])
      this.pose[k] = 0;
    this.pose['upper.py'] = -1;
  }
  get awake() {
    return this.state !== 'dormant' && this.state !== 'waking' && this.state !== 'destroyed';
  }
  get coreExposed() {
    return this.parts.armour_plate.broken;
  }
  available() {
    return FOREMAN.attackOrder.filter((a) => {
      const part = Object.keys(FOREMAN.partAttack).find((p) => FOREMAN.partAttack[p] === a);
      return !this.parts[part].broken;
    });
  }
  setState(s) {
    if (s !== this.state) (this.state = s), (this.t = 0);
  }
  wake() {
    this.setState('waking');
  }
  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
  turnTo(p, rate, dt) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += clamp(d, -rate * dt, rate * dt);
  }
  // world position of a point given in a part's own space (uses last step's matrices)
  partPoint(name, local, out = new THREE.Vector3()) {
    const part = this.view.part(name);
    return out.copy(local).applyMatrix4(part.matrixWorld);
  }
  partCenter(name) {
    const s = HIT[name][Math.floor(HIT[name].length / 2)];
    return this.partPoint(name, _v.set(s[0], s[1], s[2]), new THREE.Vector3());
  }
  isTarget(name) {
    const p = this.parts[name];
    return p && !p.broken && (name !== 'core' || this.coreExposed);
  }

  // Bolt test: returns {part} if a breakable part was hit, {blocked:true} if the hull/legs stopped it, else null
  hitTest(pos) {
    if (this.state === 'destroyed' && this.t > 1.5) return null;
    for (const name of BREAKABLE) {
      if (this.parts[name].broken) continue;
      if (name === 'core' && !this.coreExposed) continue;
      if (this.sphereHit(name, pos)) return { part: name };
    }
    if (this.sphereHit('hull', pos)) return { blocked: true };
    for (const l of LEGS) {
      const hip = this.view.part(l).matrixWorld.elements;
      if (pos.y < 4 && Math.hypot(pos.x - hip[12], pos.z - hip[14]) < 0.55) return { blocked: true };
    }
    return null;
  }
  sphereHit(name, pos) {
    const part = this.view.part(name);
    if (!part) return false;
    for (const s of HIT[name]) {
      _v.set(s[0], s[1], s[2]).applyMatrix4(part.matrixWorld);
      if (_v.distanceToSquared(pos) < s[3] * s[3]) return true;
    }
    return false;
  }

  damagePart(name, amount, game) {
    const p = this.parts[name];
    if (!this.awake || !p || p.broken) return false;
    if (p.invuln > 0) return true;
    p.hp -= amount;
    p.invuln = FOREMAN.partInvuln;
    this.view.flash(0.05);
    game.stats.partHits[name] = (game.stats.partHits[name] || 0) + 1;
    if (p.hp <= 0) this.breakPart(name, game);
    return true;
  }

  breakPart(name, game) {
    const p = this.parts[name];
    p.hp = 0;
    p.broken = true;
    game.stats.partsBroken.push({ part: name, time: +game.time.toFixed(1) });
    game.hitstop(FOREMAN.partFreeze);
    game.shake(0.6);
    if (name === 'core') {
      this.endAttack();
      this.setState('destroyed');
      game.onForemanDestroyed();
      return;
    }
    const at = this.partCenter(name);
    game.detachAsDebris(this.view, name, name === 'armour_plate' ? 'drop' : name === 'missile_pod' ? 'blast' : 'fall', this.forward());
    for (const k of Object.keys(this.pose)) if (k.startsWith(name + '.') || (name === 'missile_pod' && k.startsWith('lid.'))) delete this.pose[k];
    game.spawnKit(at.x, at.z, this.pos, FOREMAN.bodyRadius + 1.2);
    game.spawnBlast(at.x, Math.max(0.5, at.y), at.z, 1.2);
    if (FOREMAN.partAttack[name] === this.attack) this.endAttack();
    this.setState('stagger');
    this.attack = null;
  }

  endAttack() {
    this.attack = null;
    this.beamOn = 0;
    this.cooldown = FOREMAN.attackGap;
  }

  update(dt, game) {
    this.t += dt;
    for (const n in this.parts) this.parts[n].invuln = Math.max(0, this.parts[n].invuln - dt);
    const P = this.pose;
    const player = game.player;
    const d = dist2(this.pos, player.pos);
    this.ringA = Math.max(0, this.ringA - dt * 3);

    switch (this.state) {
      case 'dormant':
        P['upper.py'] = -1;
        break;
      case 'waking': {
        const k = Math.min(1, this.t / FOREMAN.wakeTime);
        P['upper.py'] = -1 + k;
        P['upper.rx'] = Math.sin(k * Math.PI) * -0.15;
        if (k >= 1) this.setState('walk'), (this.cooldown = 0.8);
        break;
      }
      case 'walk': {
        this.turnTo(player.pos, FOREMAN.turnSpeed, dt);
        const ranged = this.available().length > 0;
        const want = ranged ? FOREMAN.keepDistance : FOREMAN.stompRange - 1.5;
        let speed = 0;
        if (d > want + 0.5) speed = FOREMAN.walkSpeed * (ranged ? 1 : 1.6);
        const f = this.forward();
        this.pos.x += f.x * speed * dt;
        this.pos.z += f.z * speed * dt;
        this.walkPhase += speed * dt * 2.2;
        this.relax(dt);
        this.cooldown -= dt;
        if (this.cooldown <= 0 && !game.over) this.startAttack(d, game);
        break;
      }
      case 'attack':
        if (FOREMAN.walkWhile.includes(this.attack) && d > FOREMAN.keepDistance + 0.5) {
          const f = this.forward();
          this.pos.x += f.x * FOREMAN.walkSpeed * dt;
          this.pos.z += f.z * FOREMAN.walkSpeed * dt;
          this.walkPhase += FOREMAN.walkSpeed * dt * 2.2;
          if (this.attack === 'missiles') this.turnTo(player.pos, FOREMAN.turnSpeed, dt);
        }
        this.updateAttack(dt, game, d);
        break;
      case 'stagger': {
        const k = this.t / FOREMAN.staggerTime;
        P['upper.rx'] = -0.3 * Math.sin(k * Math.PI) * (1 - k * 0.5);
        this.relax(dt, ['upper.rx']);
        if (k >= 1) this.setState('walk'), (this.cooldown = FOREMAN.attackGap);
        break;
      }
      case 'destroyed': {
        const k = Math.min(1, this.t / 1.5);
        P['upper.py'] = -2.6 * k * k;
        P['upper.rx'] = 0.35 * k;
        for (const l of LEGS) P[l + '.rz'] = (l.includes('left') ? -1 : 1) * 0.9 * k * k;
        break;
      }
    }
    // legs walk
    if (this.state === 'walk' || this.state === 'attack') {
      const sw = Math.sin(this.walkPhase) * 0.25;
      if (this.attack !== 'stomp') {
        P['front_left_leg.rx'] = P['back_right_leg.rx'] = sw;
        P['front_right_leg.rx'] = P['back_left_leg.rx'] = -sw;
      }
      P['upper.py'] = Math.abs(Math.cos(this.walkPhase)) * 0.12 - 0.06;
    }
    // keep inside the arena
    const r = Math.hypot(this.pos.x, this.pos.z);
    const maxR = ARENA.innerRadius - 4;
    if (r > maxR) (this.pos.x *= maxR / r), (this.pos.z *= maxR / r);
    this.view.setState(this.state === 'attack' ? 'walk' : this.state);
    this.view.setGlow('core', this.coreExposed && this.awake ? { amount: 1 + 0.6 * Math.sin(game.time * 8), color: '#9ff6ff' } : 0);
  }

  // ease every pose value back to rest, except the ones listed
  relax(dt, keep = []) {
    const k = Math.min(1, dt * 5);
    for (const key in this.pose) {
      if (keep.includes(key) || key === 'upper.py' || key.endsWith('_leg.rx')) continue;
      this.pose[key] -= this.pose[key] * k;
    }
    if (this.lidOpen) this.lidOpen = 0;
    for (const n of ['left_cannon', 'right_cannon', 'missile_pod', 'armour_plate']) this.view.setGlow(n, 0);
  }

  startAttack(d, game) {
    let pick = null;
    if (d < FOREMAN.stompRange) pick = 'stomp';
    else {
      const av = this.available();
      if (!av.length) return;
      const order = FOREMAN.attackOrder;
      for (let i = 0; i < order.length; i++) {
        const a = order[(this.nextAttack + i) % order.length];
        if (av.includes(a)) {
          pick = a;
          this.nextAttack = (order.indexOf(a) + 1) % order.length;
          break;
        }
      }
    }
    this.attack = pick;
    game.stats.foremanAttacks[pick] = (game.stats.foremanAttacks[pick] || 0) + 1;
    this.attackT = 0;
    this.hitDone = false;
    this.shotsFired = 0;
    this.missilePlan = null;
    this.setState('attack');
  }

  updateAttack(dt, game, d) {
    const P = this.pose;
    const player = game.player;
    const cfg = A[this.attack];
    this.attackT += dt;
    const k = this.attackT / cfg.time;
    const glow = (part, a) => this.view.setGlow(part, a > 0 ? { amount: a, color: '#ff4a10' } : 0);

    switch (this.attack) {
      case 'volley': {
        this.turnTo(player.pos, FOREMAN.turnSpeed * 1.5, dt);
        const muzzle = this.partPoint('left_cannon', MUZZLE);
        const pitch = Math.atan2(muzzle.y - 0.9, Math.max(2, dist2(muzzle, player.pos)));
        P['left_cannon.rx'] += (pitch - P['left_cannon.rx']) * Math.min(1, dt * 6);
        P['left_cannon.pz'] *= 1 - Math.min(1, dt * 10);
        glow('left_cannon', k < 0.5 ? k * 2 : 0.4);
        while (this.shotsFired < cfg.shots.length && k >= cfg.shots[this.shotsFired]) {
          // aim a little ahead of where the player is running
          const fly = muzzle.distanceTo(player.pos) / cfg.shellSpeed;
          const aimAt = { x: player.pos.x + player.vel.x * fly * cfg.lead, z: player.pos.z + player.vel.z * fly * cfg.lead };
          game.fireShell(muzzle, aimAt, cfg);
          P['left_cannon.pz'] = -0.5;
          this.shotsFired++;
        }
        break;
      }
      case 'sweep': {
        const half = cfg.arc / 2;
        if (k < cfg.from) {
          this.turnTo(player.pos, 2, dt);
          const w = k / cfg.from;
          P['right_cannon.rx'] = 0.45 * w;
          P['right_cannon.ry'] = -half * w;
          glow('right_cannon', w);
          this.beamOn = 1;
        } else if (k <= cfg.to) {
          const w = (k - cfg.from) / (cfg.to - cfg.from);
          P['right_cannon.ry'] = -half + cfg.arc * w;
          this.beamOn = 2;
        } else {
          this.beamOn = 0;
          glow('right_cannon', 0);
        }
        // beam lies on the ground under the cannon, pointing where the cannon points
        const hinge = this.view.part('right_cannon').matrixWorld.elements;
        this.beamOrigin.set(hinge[12], 0.8, hinge[14]);
        this.beamYaw = this.yaw + P['right_cannon.ry'];
        if (this.beamOn === 2 && !this.hitDone) {
          const dx = Math.sin(this.beamYaw);
          const dz = Math.cos(this.beamYaw);
          const rx = player.pos.x - this.beamOrigin.x;
          const rz = player.pos.z - this.beamOrigin.z;
          const along = rx * dx + rz * dz;
          const side = Math.abs(rx * dz - rz * dx);
          if (along > 0 && along < cfg.length && side < cfg.width / 2 + 0.3) {
            if (player.damage(cfg.damage, { x: -dz, z: dx }, FEEL.playerPush, 'sweep', game)) this.hitDone = true;
          }
        }
        break;
      }
      case 'missiles': {
        this.lidOpen = k < 0.85 ? 1 : 0;
        P['lid.rx'] += ((k < 0.85 ? -1.4 : 0) - P['lid.rx']) * Math.min(1, dt * 8);
        glow('missile_pod', k < 0.3 ? k * 3 : 0);
        if (!this.missilePlan && k >= 0.15) {
          this.missilePlan = [];
          for (let i = 0; i < cfg.count; i++) {
            const landAt = (cfg.landFrom + ((cfg.landTo - cfg.landFrom) * i) / (cfg.count - 1)) * cfg.time;
            this.missilePlan.push(landAt);
            game.launchMissileVisual(this.partPoint('missile_pod', _v.set(0, 1, 0)), i);
          }
        }
        if (this.missilePlan) {
          for (let i = 0; i < this.missilePlan.length; i++) {
            const landAt = this.missilePlan[i];
            if (landAt !== null && this.attackT >= landAt - cfg.warn) {
              // first missile on the player, the rest scattered around them
              const a = (i * 2.4 + game.time) % (Math.PI * 2);
              const r = i === 0 ? 0 : 1.5 + ((i * 1.7) % 1) * (cfg.spread - 1.5);
              game.placeMissile(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r, cfg);
              this.missilePlan[i] = null;
            }
          }
        }
        break;
      }
      case 'ram': {
        const f = this.forward();
        if (k < cfg.from) {
          if (k < 0.4) this.turnTo(player.pos, 2.5, dt);
          P['upper.rx'] = -0.25 * Math.min(1, k / 0.3);
          glow('armour_plate', k / cfg.from);
        } else if (k <= cfg.to) {
          const sp = cfg.distance / ((cfg.to - cfg.from) * cfg.time);
          this.pos.x += f.x * sp * dt;
          this.pos.z += f.z * sp * dt;
          P['upper.rx'] = 0.2;
          glow('armour_plate', 1);
          const rx = player.pos.x - this.pos.x;
          const rz = player.pos.z - this.pos.z;
          if (!this.hitDone && Math.hypot(rx, rz) < cfg.reach && rx * f.x + rz * f.z > -0.5) {
            if (player.damage(cfg.damage, f, cfg.push, 'ram', game)) this.hitDone = true;
          }
        } else {
          P['upper.rx'] *= 1 - Math.min(1, dt * 5);
          glow('armour_plate', 0);
        }
        break;
      }
      case 'stomp': {
        if (k < cfg.from) {
          const w = k / cfg.from;
          P['front_left_leg.rx'] = P['front_right_leg.rx'] = -0.6 * w;
          P['upper.rx'] = -0.12 * w;
        } else {
          P['front_left_leg.rx'] = P['front_right_leg.rx'] = 0;
          P['upper.rx'] *= 1 - Math.min(1, dt * 10);
          if (k <= cfg.to) {
            if (this.ringR === 0) game.shake(0.5);
            this.ringR = (cfg.radius * (k - cfg.from)) / (cfg.to - cfg.from);
            this.ringA = 1;
            const pd = dist2(this.pos, player.pos);
            if (!this.hitDone && pd <= cfg.radius && pd <= this.ringR + 0.8) {
              const dir = { x: player.pos.x - this.pos.x, z: player.pos.z - this.pos.z };
              if (player.damage(cfg.damage, dir, FEEL.playerPush, 'stomp', game)) this.hitDone = true;
            }
          } else if (this.ringR) this.ringR = cfg.radius;
        }
        break;
      }
    }
    if (k >= 1) {
      this.ringR = 0;
      this.setState('walk');
      this.endAttack();
    }
  }
}
