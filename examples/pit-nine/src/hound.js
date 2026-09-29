import { Body, dist2, lerpAngle } from './body.js';
import { HOUND, FEEL } from './config.js';

const LEGS = ['front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'];

export class Hound extends Body {
  constructor(view, id) {
    super(view);
    this.id = id;
    this.hp = HOUND.hp;
    this.state = 'spawn';
    this.t = 0;
    this.invuln = 0;
    this.hurtT = 0;
    this.pounceDir = { x: 0, z: 1 };
    this.hitDone = false;
    this.circleSign = id % 2 ? 1 : -1;
    this.gait = 0;
    this.speed = 0;
    this.push = { x: 0, z: 0 };
    for (const k of ['body.py', 'body.rx', 'head.rx', ...LEGS.map((l) => l + '.rx')]) this.pose[k] = 0;
  }
  get windupTime() {
    return this.tune?.windupTime ?? HOUND.windupTime;
  }
  get alive() {
    return this.state !== 'destroyed';
  }
  setState(s) {
    if (s !== this.state) (this.state = s), (this.t = 0);
  }
  faceTo(x, z, dt, rate = 10) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw = lerpAngle(this.yaw, want, Math.min(1, rate * dt));
  }

  update(dt, game) {
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    const p = game.player;
    const d = dist2(this.pos, p.pos) || 0.001;
    const tx = (p.pos.x - this.pos.x) / d;
    const tz = (p.pos.z - this.pos.z) / d;
    let vx = 0;
    let vz = 0;
    const idle = game.over;

    switch (this.state) {
      case 'spawn': {
        const k = Math.min(1, this.t / HOUND.spawnTime);
        this.pos.y = 3 * (1 - k) * (1 - k);
        this.faceTo(p.pos.x, p.pos.z, dt);
        if (k >= 1) this.setState('chase');
        break;
      }
      case 'chase':
        if (idle) break;
        vx = tx * HOUND.chaseSpeed;
        vz = tz * HOUND.chaseSpeed;
        this.faceTo(p.pos.x, p.pos.z, dt);
        if (d < HOUND.engageRange) this.setState(game.tokens.request(this) ? 'windup' : 'circle');
        break;
      case 'circle': {
        // orbit the player at circleRadius and wait for an attack token
        const radial = (d - HOUND.circleRadius) * 2;
        vx = tx * radial + -tz * this.circleSign * HOUND.circleSpeed;
        vz = tz * radial + tx * this.circleSign * HOUND.circleSpeed;
        this.faceTo(p.pos.x, p.pos.z, dt);
        if (idle) break;
        if (d < HOUND.engageRange + 1 && game.tokens.request(this)) this.setState('windup');
        else if (d > HOUND.engageRange + 3) this.setState('chase');
        break;
      }
      case 'windup': {
        // aim where the player is heading
        const ax = p.pos.x + p.vel.x * HOUND.pounceLead;
        const az = p.pos.z + p.vel.z * HOUND.pounceLead;
        this.faceTo(ax, az, dt, 14);
        if (d > 2) (vx = tx * HOUND.windupCreep), (vz = tz * HOUND.windupCreep);
        if (this.t >= this.windupTime) {
          const l = Math.hypot(ax - this.pos.x, az - this.pos.z) || 1;
          this.pounceDir = { x: (ax - this.pos.x) / l, z: (az - this.pos.z) / l };
          this.pounceDist = Math.min(HOUND.pounceMax, Math.max(HOUND.pounceMin, l + 1));
          this.yaw = Math.atan2(this.pounceDir.x, this.pounceDir.z);
          this.hitDone = false;
          game.stats.pounces++;
          this.pounced = true;
          this.setState('pounce');
        }
        break;
      }
      case 'pounce': {
        const k = this.t / HOUND.pounceTime;
        const sp = (this.pounceDist ?? HOUND.pounceDistance) / HOUND.pounceTime;
        vx = this.pounceDir.x * sp;
        vz = this.pounceDir.z * sp;
        if (!this.hitDone && k >= HOUND.pounceHitFrom && k <= HOUND.pounceHitTo && dist2(this.pos, p.pos) < HOUND.pounceHitRange) {
          if (p.damage(this.tune?.pounceDamage ?? HOUND.pounceDamage, this.pounceDir, FEEL.playerPush, 'pounce', game)) {
            this.hitDone = true;
            this.freeze = FEEL.playerHitFreeze;
            game.stats.houndHits++;
          }
        }
        if (k >= 1) this.setState('recover');
        break;
      }
      case 'recover':
        if (this.t >= HOUND.recoverTime) {
          game.tokens.release(this);
          this.setState('chase');
        }
        break;
    }
    if (this.hurtT > 0 && this.state !== 'pounce') vx = vz = 0;
    // bolt push-back, spread over a few steps
    vx += this.push.x * 12;
    vz += this.push.z * 12;
    this.push.x *= 1 - Math.min(1, 12 * dt);
    this.push.z *= 1 - Math.min(1, 12 * dt);
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    this.speed = Math.hypot(vx, vz);
    game.collide(this, HOUND.radius);
    this.animate(dt);
  }

  // parts moved in code at their hinges
  animate(dt) {
    const P = this.pose;
    this.gait += this.speed * dt * 3.2;
    const sw = Math.sin(this.gait) * Math.min(1, this.speed / 4) * 0.7;
    P['front_left_leg.rx'] = sw;
    P['back_right_leg.rx'] = sw;
    P['front_right_leg.rx'] = -sw;
    P['back_left_leg.rx'] = -sw;
    P['body.py'] = Math.abs(Math.cos(this.gait)) * 0.05 * Math.min(1, this.speed / 4);
    P['body.rx'] = 0;
    P['head.rx'] = 0;
    if (this.state === 'windup') {
      const k = Math.min(1, this.t / this.windupTime);
      P['body.py'] = -0.15 * k;
      P['body.rx'] = 0.12 * k; // nose down
      P['head.rx'] = -0.2 * k;
      P['front_left_leg.rx'] = P['front_right_leg.rx'] = -0.3 * k;
      P['back_left_leg.rx'] = P['back_right_leg.rx'] = 0.5 * k;
    } else if (this.state === 'pounce') {
      const k = Math.min(1, this.t / HOUND.pounceTime);
      P['body.py'] = 0.7 * Math.sin(Math.PI * k);
      P['body.rx'] = -0.35 * Math.cos(Math.PI * k);
      P['front_left_leg.rx'] = P['front_right_leg.rx'] = -1.1;
      P['back_left_leg.rx'] = P['back_right_leg.rx'] = 1.1;
    } else if (this.state === 'recover') {
      P['head.rx'] = 0.5;
      P['body.rx'] = 0.08;
    }
    this.view.setState(this.hurtT > 0 ? 'hurt' : this.state);
  }

  damage(amount, dir, game) {
    if (!this.alive) return false;
    if (this.invuln > 0) return true; // bolt is spent but the hound was just hit
    this.hp -= amount;
    this.invuln = HOUND.invulnAfterHit;
    this.hurtT = HOUND.hurtTime;
    this.freeze = HOUND.hitFreeze;
    this.view.flash(0.08);
    if (this.state !== 'pounce') {
      const len = Math.hypot(dir.x, dir.z) || 1;
      this.push.x = (dir.x / len) * HOUND.boltPush;
      this.push.z = (dir.z / len) * HOUND.boltPush;
    }
    if (this.hp <= 0) {
      this.setState('destroyed');
      game.tokens.release(this);
      game.onHoundDestroyed(this, dir);
    }
    return true;
  }
}
