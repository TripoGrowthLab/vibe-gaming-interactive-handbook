import * as THREE from 'three';
import { ARENA, CAMERA, PROPS, WAVES, WAVE_PACE, BREATHER_HEAL, KO_FADE, END_SCREEN_DELAY, RANDOM, COMBO_COUNT_GAP, FOOD } from '../config.js';
import { range, shuffle, chance } from './random.js';
import { OBJECTS } from '../data/objects.js';
import { createVisual } from '../visuals/registry.js';
import { Hero } from './hero.js';
import { Enemy, AttackTurns } from './enemy.js';
import { resolveHits, resolveBumps } from './combat.js';

export const STEP = 1 / 60;

// Owns the level, the fighters and the round: waves, win, lose, restart.
export class Game {
  constructor(scene, camera, input, hud) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.hud = hud;
    hud.camera = camera;
    this.listeners = { hit: [], end: [], wave: [], move: [], crate: [], food: [] };
    this.turns = new AttackTurns();
    this.props = [];
    this.solids = [];
    for (const p of PROPS) {
      const v = createVisual(p.id);
      v.root.position.set(...p.pos);
      scene.add(v.root);
      this.props.push({ ...p, visual: v });
      if (p.solid) {
        const [w, , d] = OBJECTS[p.id].size;
        const box = { minX: p.pos[0] - w / 2, maxX: p.pos[0] + w / 2, minZ: p.pos[2] - d / 2, maxZ: p.pos[2] + d / 2 };
        this.solids.push(box);
        this.props[this.props.length - 1].collider = box;
      }
    }
    this.pickups = [];
    this.camX = 0;
    this.shake = 0;
    this.reset();
  }

  on(event, fn) { this.listeners[event].push(fn); }
  emit(event, data) { for (const fn of this.listeners[event]) fn(data); }

  reset() {
    this.hero?.remove();
    for (const e of this.enemies ?? []) e.remove();
    this.hero = new Hero(this.scene);
    this.enemies = [];
    this.spawnQueue = [];
    this.turns.reset();
    this.wave = -1;
    this.time = 0;
    this.result = null;       // 'win' | 'lose'
    this.endTimer = 0;
    this.breather = 0;
    this.combo = 0;
    this.lastComboHit = -99;
    this.stats = { moves: {} };
    // Crates come back and leftover food goes away.
    for (const p of this.props) {
      if (!p.broken) continue;
      p.broken = false;
      this.scene.add(p.visual.root);
      this.solids.push(p.collider);
    }
    for (const f of this.pickups) this.scene.remove(f.visual.root);
    this.pickups = [];
    this.camX = 0;
    this.input.clear();
    this.hud.hideEnd();
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    if (this.wave > 0) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + BREATHER_HEAL);
    this.pace = WAVE_PACE[this.wave];
    this.turns.gap = this.pace.turnGap;
    // Who comes this wave, in a random order (Big Anvil first in his wave).
    const w = WAVES[this.wave];
    const kinds = shuffle(Object.entries(w.enemies).flatMap(([kind, n]) => Array(n).fill(kind)));
    kinds.sort((a, b) => (b === 'boss') - (a === 'boss'));
    this.spawnQueue = kinds;
    this.maxOnField = w.maxOnField;
    this.nextArrival = this.time + 0.8;
    this.hud.banner(this.wave === WAVES.length - 1 ? 'BIG ANVIL!' : `WAVE ${this.wave + 1}`);
    this.emit('wave', this.wave);
  }

  get boss() { return this.enemies.find(e => e.kind === 'boss'); }

  step(dt) {
    this.time += dt;
    const hero = this.hero;
    for (const f of [hero, ...this.enemies]) f.prevPos.copy(f.pos);

    // Arrivals: one at a time, from a random end of the alley at a random depth, while there
    // is room on the street; the rest come as reinforcements.
    const onField = this.enemies.filter(e => e.alive).length;
    if (this.spawnQueue.length && this.time >= this.nextArrival && onField < this.maxOnField) {
      const kind = this.spawnQueue.shift();
      this.addEnemy(kind, chance(0.5) ? -1 : 1, range(ARENA.minZ + 0.4, ARENA.maxZ - 0.4));
      this.nextArrival = this.time + range(...RANDOM.arrivalGap);
    }

    hero.update(dt, this.input, this.enemies);
    this.turns.update(dt, this.enemies);
    for (const e of this.enemies) e.update(dt, hero, this.turns, this.enemies);

    const onHit = h => {
      if (h.attacker === hero) {
        this.turns.engage(h.target);
        // Combo counter: hits in quick succession without Volt being hit in between.
        this.combo = this.time - this.lastComboHit <= COMBO_COUNT_GAP ? this.combo + 1 : 1;
        this.lastComboHit = this.time;
        this.hud.combo(this.combo);
      } else this.combo = 0;
      this.emit('hit', h);
      this.hud.popup(h, this.camera);
      if (h.def.hitstop > 0.1) this.shake = 0.15;
    };
    resolveHits(hero, this.enemies, onHit);
    for (const e of this.enemies) resolveHits(e, [hero], onHit);
    resolveBumps(this.enemies, hero, onHit);
    this.hitCrates();
    this.eatFood();

    // Big Anvil's roar calls one more Sprat.
    for (const e of this.enemies) {
      if (!e.summon) continue;
      e.summon = false;
      this.spawnQueue.push('thug_skinny');
      this.maxOnField++;
      this.nextArrival = Math.min(this.nextArrival, this.time + 0.3);
    }

    this.collide();
    for (const f of [hero, ...this.enemies]) f.moveSpeed = f.freeze > 0 ? 0 : Math.hypot(f.pos.x - f.prevPos.x, f.pos.z - f.prevPos.z) / dt;

    // KO'd enemies fade out and are removed.
    for (const e of this.enemies) {
      if (e.alive) continue;
      const f = (e.stateTime - KO_FADE.delay) / KO_FADE.time;
      if (f > 0) e.visual.setOpacity(Math.max(0, 1 - f));
      if (f >= 1) e.remove();
    }
    this.enemies = this.enemies.filter(e => !e.removed);

    // Round flow
    if (!this.result) {
      if (!hero.alive) this.result = 'lose';
      else if (this.wave === WAVES.length - 1 && this.boss && !this.boss.alive) { this.result = 'win'; hero.win(); }
      else if (!this.spawnQueue.length && !this.enemies.length) this.nextWave();
      if (this.result) this.emit('end', this.result);
    } else {
      this.endTimer += dt;
      if (this.endTimer >= END_SCREEN_DELAY && !this.hud.endShown) this.hud.showEnd(this.result);
    }
    if (this.input.takeRestart() && (this.result || this.hud.endShown)) this.reset();
  }

  addEnemy(kind, side, z) {
    const e = new Enemy(kind, side, z, this.scene);
    e.damageScale = this.pace.damage;
    e.alert = text => this.hud.say(e.pos, text, 'alert', OBJECTS[kind].size[1] + 0.35);
    e.onMove = name => { this.stats.moves[name] = (this.stats.moves[name] ?? 0) + 1; this.emit('move', { name, enemy: e }); };
    this.enemies.push(e);
    return e;
  }

  // Any of Volt's attacks breaks a crate it reaches; the crate drops food.
  hitCrates() {
    const a = this.hero.attack;
    if (!a || !this.hero.attackActive) return;
    for (const p of this.props) {
      if (!p.breakable || p.broken || a.hits.has(p)) continue;
      const dx = (p.pos[0] - this.hero.pos.x) * this.hero.facing, dz = Math.abs(p.pos[2] - this.hero.pos.z);
      if (dx < -0.2 || dx > a.def.reach + 0.6 || dz > 0.9) continue;
      a.hits.add(p);
      p.broken = true;
      this.scene.remove(p.visual.root);
      this.solids.splice(this.solids.indexOf(p.collider), 1);
      const at = new THREE.Vector3(p.pos[0], 0, p.pos[2]);
      this.hud.say(at, 'CRASH!', 'heavy', 1.2);
      this.shake = 0.1;
      const food = { pos: new THREE.Vector3(p.pos[0], 0, ARENA.minZ + 0.3), visual: createVisual('food') };
      food.visual.root.position.copy(food.pos);
      this.scene.add(food.visual.root);
      this.pickups.push(food);
      this.emit('crate', p);
    }
  }

  eatFood() {
    const h = this.hero;
    if (!h.alive) return;
    for (const f of this.pickups) {
      if (Math.hypot(f.pos.x - h.pos.x, f.pos.z - h.pos.z) > FOOD.pickupRadius) continue;
      f.eaten = true;
      const before = h.hp;
      h.hp = Math.min(h.maxHp, h.hp + FOOD.heal);
      this.scene.remove(f.visual.root);
      this.hud.say(h.pos, `+${h.hp - before}`, 'heal', 2.0);
      this.emit('food', h.hp - before);
    }
    this.pickups = this.pickups.filter(f => !f.eaten);
  }

  collide() {
    const all = [this.hero, ...this.enemies].filter(f => f.alive);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1e-4;
        const overlap = a.radius + b.radius - d;
        if (overlap > 0) {
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * overlap / 2; a.pos.z -= nz * overlap / 2;
          b.pos.x += nx * overlap / 2; b.pos.z += nz * overlap / 2;
        }
      }
    }
    for (const f of [this.hero, ...this.enemies]) {
      if (!f.entering) f.pos.x = Math.min(ARENA.maxX, Math.max(ARENA.minX, f.pos.x));
      f.pos.z = Math.min(ARENA.maxZ, Math.max(ARENA.minZ, f.pos.z));
      for (const s of this.solids) {
        const cx = Math.min(s.maxX, Math.max(s.minX, f.pos.x)), cz = Math.min(s.maxZ, Math.max(s.minZ, f.pos.z));
        const dx = f.pos.x - cx, dz = f.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < f.radius && d > 1e-5) { f.pos.x = cx + dx / d * f.radius; f.pos.z = cz + dz / d * f.radius; }
      }
    }
  }

  // Called once per rendered frame. Screens can refresh faster than the 60 Hz simulation
  // (120 Hz on a MacBook Pro), so characters are drawn between their last two steps.
  render(dt, alpha = 1) {
    this.hero.sync(dt, {}, alpha);
    for (const e of this.enemies) e.sync(dt, { hasTurn: this.turns.holder === e }, alpha);
    for (const p of this.props) p.visual.update(dt, {});
    for (const f of this.pickups) f.visual.update(dt, {});

    const target = Math.min(CAMERA.clampX, Math.max(-CAMERA.clampX, this.hero.node.position.x));
    this.camX += (target - this.camX) * Math.min(1, dt * CAMERA.follow);
    this.shake = Math.max(0, this.shake - dt);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 0.15 : 0, sy = this.shake > 0 ? (Math.random() - 0.5) * 0.1 : 0;
    this.camera.position.set(this.camX + sx, CAMERA.height + sy, CAMERA.distance);
    this.camera.lookAt(this.camX, CAMERA.lookHeight, 0);

    const boss = this.boss;
    this.hud.update({
      hp: this.hero.hp / this.hero.maxHp,
      wave: this.wave + 1, waves: WAVES.length,
      left: this.spawnQueue.length + this.enemies.filter(e => e.alive).length,
      boss: boss ? boss.hp / boss.maxHp : null,
    });
  }
}
