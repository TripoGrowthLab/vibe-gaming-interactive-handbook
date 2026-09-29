// Gameplay: run state machine, skier physics, collisions, score. No mesh/material code here.
import { CFG } from './config.js';
import { OBJECTS } from './defs.js';
import { createView } from './registry.js';
import { World } from './world.js';

const BEST_KEY = 'snowdrift-dash-best';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Game {
  constructor({ stage, hud, input }) {
    this.stage = stage;
    this.hud = hud;
    this.input = input;
    this.world = new World(stage.scene);
    this.skier = createView('skier');
    stage.scene.add(this.skier.root);
    this.r = OBJECTS.skier.hitbox.r;
    this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    this.controller = null; // optional (snapshot) => steer, used by the test bot
    this.events = [];       // log for tests
    this.toTitle();
  }

  // ---------- state changes ----------
  resetRun() {
    this.p = { x: 0, z: 0, prevX: 0, prevZ: 0, vx: 0, speed: CFG.SPEED_START, time: 0 };
    this.seed = (Math.random() * 2 ** 31) | 0;
    this.world.reset(0, this.seed);
    this.crashT = 0;
    this.distance = 0;
    this.hitObstacle = null;
    this.passedBest = this.best <= 0;
    this.newBest = false;
    this.paused = false;
    this.input.clear();
    this.stage.snapCamera(0);
  }

  toTitle() {
    this.resetRun();
    this.state = 'title';
    this.skier.setState('idle');
    this.hud.show('title', { best: this.best });
  }

  start() {
    if (this.state === 'gameover') this.resetRun();
    if (this.state !== 'title' && this.state !== 'gameover') return;
    this.state = 'playing';
    this.skier.setState('ski');
    this.hud.show('play', { best: this.best });
    this.events.push({ type: 'start', seed: this.seed });
  }

  togglePause(force) {
    if (this.state !== 'playing') return;
    this.paused = force ?? !this.paused;
    if (this.paused) this.input.clear();
    this.hud.show(this.paused ? 'pause' : 'play', { best: this.best });
  }

  crash(obstacle) {
    this.state = 'crashing';
    this.crashT = 0;
    this.hitObstacle = obstacle;
    this.skier.setState('crash');
    obstacle.view.hit(Math.sign(this.p.x - obstacle.x) || 1);
    this.stage.burst(this.p.x, 0.8, this.p.z);
    this.stage.shake(1);
    const impactSpeed = this.p.speed;
    // Stop short and bounce off sideways instead of sliding through the obstacle.
    this.p.speed = Math.min(this.p.speed, 2.5);
    this.p.vx = (Math.sign(this.p.x - obstacle.x) || 1) * 2.5;
    const dist = Math.floor(this.p.z);
    this.distance = dist;
    if (dist > this.best) {
      this.best = dist;
      this.newBest = true;
      localStorage.setItem(BEST_KEY, String(dist));
    }
    this.events.push({ type: 'crash', id: obstacle.id, distance: dist, time: this.p.time, speed: impactSpeed });
  }

  // ---------- fixed-step simulation ----------
  fixedUpdate(dt) {
    const p = this.p;
    p.prevX = p.x;
    p.prevZ = p.z;
    if (this.paused || this.state === 'title' || this.state === 'gameover') return;

    if (this.state === 'playing') {
      p.time += dt;
      p.speed = Math.min(CFG.SPEED_MAX, CFG.SPEED_START + CFG.SPEED_GAIN * p.time);
      const steer = this.controller ? this.controller(this.snapshot()) : this.input.steer;
      if (steer !== 0) {
        p.vx = clamp(p.vx + steer * CFG.LAT_ACCEL * dt, -CFG.LAT_MAX, CFG.LAT_MAX);
      } else {
        const dv = CFG.LAT_RETURN * dt;
        p.vx = Math.abs(p.vx) <= dv ? 0 : p.vx - Math.sign(p.vx) * dv;
      }
      this.steer = steer;
    } else if (this.state === 'crashing') {
      this.crashT += dt;
      p.speed *= Math.exp(-dt * 7);
      p.vx *= Math.exp(-dt * 7);
      this.steer = 0;
      if (this.crashT >= CFG.CRASH_TIME) {
        this.state = 'gameover';
        this.hud.show('over', { distance: this.distance, best: this.best, newBest: this.newBest });
        return;
      }
    }

    p.x += p.vx * dt;
    p.z += p.speed * dt;
    const lim = CFG.RUN_HALF_WIDTH - this.r - 0.05; // fences stop, never kill
    if (Math.abs(p.x) > lim) {
      p.x = Math.sign(p.x) * lim;
      p.vx = 0;
    }
    this.world.update(p.z, p.speed);

    if (this.state === 'playing') {
      const hit = this.world.collide(p.x, p.z, this.r);
      if (hit) return this.crash(hit);
      if (!this.passedBest && p.z > this.best) {
        this.passedBest = true;
        this.hud.toast('New best!');
      }
    }
  }

  // ---------- per-frame rendering (interpolated) ----------
  render(dt, alpha) {
    const p = this.p;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const z = p.prevZ + (p.z - p.prevZ) * alpha;
    this.skier.root.position.set(x, 0, z);

    if (this.state === 'playing') this.skier.setState(this.steer ? 'carve' : 'ski');
    const lean = p.vx / CFG.LAT_MAX;
    this.skier.update(dt, { lean, yaw: Math.atan2(p.vx, p.speed) * 0.8, speed: p.speed });
    for (const o of this.world.obstacles) o.view.update(dt);

    const speedFrac = (p.speed - CFG.SPEED_START) / (CFG.SPEED_MAX - CFG.SPEED_START);
    this.stage.follow(dt, x, z, p.speed, clamp(speedFrac, 0, 1));
    if (this.state === 'playing' && !this.paused && this.steer) this.stage.spray(x, z, Math.sign(p.vx), p.speed, dt);
    this.stage.updateParticles(this.paused ? 0 : dt);
    if (this.state !== 'title') this.hud.update(this.state === 'playing' ? Math.floor(z) : this.distance, this.state === 'playing' ? p.speed : 0, this.best);
  }

  // Read-only view of the run for the test bot.
  snapshot() {
    const p = this.p;
    return {
      x: p.x, z: p.z, vx: p.vx, speed: p.speed, time: p.time,
      obstacles: this.world.obstacles.filter((o) => o.z > p.z - 2 && o.z < p.z + 60)
        .map((o) => ({ id: o.id, x: o.x, z: o.z, hitbox: o.hitbox })),
    };
  }
}
