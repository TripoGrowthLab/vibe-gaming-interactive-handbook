import * as THREE from 'three';
import { view, getStyle, STYLES } from './registry.js';
import { Body, dist2, clamp } from './body.js';
import { ARENA, BOLT, HOUND, WAVES, WAVE_GAP, INTRO_TIME, FOREMAN, KIT, PLAYER } from './config.js';
import { Player } from './player.js';
import { Hound } from './hound.js';
import { Foreman, BREAKABLE } from './foreman.js';
import { input } from './input.js';
import { sfx } from './sfx.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Game {
  constructor(hud) {
    this.hud = hud;
    this.scene = new THREE.Scene();
    const s = STYLES[getStyle()];
    this.scene.background = new THREE.Color(s.sky);
    this.scene.fog = new THREE.Fog(s.fog, 38, 90);
    // image-based light so model materials are not black (set once by main.js)
    if (Game.environment) (this.scene.environment = Game.environment), (this.scene.environmentIntensity = 0.45);
    this.time = 0;
    this.stop = 0; // hit-stop seconds left
    this.shakeAmt = 0;
    this.over = false;
    this.phase = 'intro';
    this.phaseT = 0;
    this.wave = -1;
    this.spawnQueue = [];
    this.endTimer = -1;
    this.result = null;
    this.aim = { dir: null, target: null };
    this.mouse = { point: null, target: null };
    this.pools = {};
    this.bolts = [];
    this.shells = [];
    this.markers = [];
    this.kits = [];
    this.debris = [];
    this.effects = [];
    this.hitMarks = []; // landed shots waiting to be shown as hit markers (screen space, drawn in render)
    this.sfx = sfx;
    this.hounds = [];
    this.houndCount = 0;
    this.stats = {
      shots: 0, boltHits: { hound: 0, part: 0, blocked: 0 }, partHits: {}, partsBroken: [], houndsDestroyed: 0, houndHits: 0, pounces: 0, foremanAttacks: {},
      damageTaken: {}, dodged: {}, kitsTaken: 0, rolls: 0, result: null, time: 0, wavesCleared: 0,
    };
    this.tokens = {
      holders: new Set(),
      maxSeen: 0,
      restUntil: 0, // after a pounce the pack waits before the next attack
      request: (h) => {
        if (this.tokens.holders.has(h)) return true;
        if (this.time < this.tokens.restUntil) return false;
        if (this.tokens.holders.size >= HOUND.maxAttackers) return false;
        this.tokens.holders.add(h);
        this.tokens.maxSeen = Math.max(this.tokens.maxSeen, this.tokens.holders.size);
        return true;
      },
      release: (h) => {
        if (this.tokens.holders.delete(h) && h.pounced) this.tokens.restUntil = this.time + (h.tune?.restAfterPounce ?? 0);
        h.pounced = false;
      },
    };
    this.buildLevel();
    this.player = new Player(view('player'));
    this.player.place(ARENA.playerStart[0], 0, ARENA.playerStart[1], Math.PI);
    this.scene.add(this.player.view.root);
    this.foreman = new Foreman(view('foreman'));
    this.foreman.place(ARENA.foremanStart[0], 0, ARENA.foremanStart[1], 0);
    this.scene.add(this.foreman.view.root);
    this.foreman.sync(1);
    this.foreman.view.root.updateMatrixWorld(true);
    this.beam = new Body(view('beam'));
    this.beam.view.root.visible = false;
    this.scene.add(this.beam.view.root);
    this.ring = view('stomp_ring');
    this.ring.root.visible = false;
    this.scene.add(this.ring.root);
    this.hud.banner('WAVE 1', INTRO_TIME);
    this.hud.showControls(INTRO_TIME + 3);
  }

  buildLevel() {
    // with the environment map lighting everything a little, the sky/ground and sun lights are softer
    const lit = !!Game.environment;
    const hemi = new THREE.HemisphereLight('#fff4e0', '#6b4a30', lit ? 0.75 : 1.4);
    const sun = new THREE.DirectionalLight('#fff1d6', lit ? 2.0 : 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    this.sun = sun;
    this.scene.add(hemi, sun, sun.target);
    this.levelViews = [];
    const floor = view('floor');
    this.scene.add(floor.root);
    for (let i = 0; i < ARENA.wallSegments; i++) {
      const a = (i / ARENA.wallSegments) * Math.PI * 2;
      const w = view('wall');
      w.root.position.set(Math.cos(a) * (ARENA.radius + 0.5), 0, Math.sin(a) * (ARENA.radius + 0.5));
      w.root.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); // +Z faces the centre
      this.scene.add(w.root);
      this.levelViews.push(w);
    }
    this.crates = ARENA.crateAngles.map((deg) => {
      const a = deg * DEG;
      const c = view('crate');
      const x = Math.cos(a) * ARENA.crateRing;
      const z = Math.sin(a) * ARENA.crateRing;
      c.root.position.set(x, 0, z); // kept square to the axes so its collision box matches
      this.scene.add(c.root);
      this.levelViews.push(c);
      return { x, z, h: ARENA.crateSize / 2 };
    });
  }

  // ------------------------------------------------------------------ swapping looks
  // Rebuild every view (greybox <-> models, or another look) in place, mid-round. Gameplay state is untouched.
  swapViews() {
    const replace = (old) => {
      const nv = view(old.id);
      nv.root.position.copy(old.root.position);
      nv.root.quaternion.copy(old.root.quaternion);
      nv.root.visible = old.root.visible;
      const parent = old.root.parent || this.scene;
      parent.remove(old.root);
      parent.add(nv.root);
      return nv;
    };
    const swapBody = (b) => {
      b.view = replace(b.view);
      if (b.state) b.view.setState(b.state);
    };
    swapBody(this.player);
    this.hounds.forEach(swapBody);
    this.kits.forEach(swapBody);
    for (const m of this.markers) m.missile.view = replace(m.missile.view);
    const f = this.foreman;
    f.view = replace(f.view);
    for (const [name, p] of Object.entries(f.parts)) {
      if (!p.broken || name === 'core') continue;
      const gone = f.view.detachPart(name);
      gone?.parent?.remove(gone);
    }
    if (f.parts.missile_pod.broken) f.view.detachPart('lid');
    f.sync(1);
    f.view.root.updateMatrixWorld(true);
    this.levelViews = this.levelViews.map(replace);
    this.pools = {};
  }

  // ------------------------------------------------------------------ pools
  spawnView(id) {
    const pool = (this.pools[id] ||= []);
    const v = pool.pop() || view(id);
    v.root.visible = true;
    this.scene.add(v.root);
    return v;
  }
  recycle(v) {
    this.scene.remove(v.root);
    (this.pools[v.id] ||= []).push(v);
  }

  // ------------------------------------------------------------------ helpers used by actors
  hitstop(t) {
    this.stop = Math.max(this.stop, t);
  }
  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }
  insideCrate(p, pad = 0) {
    for (const c of this.crates) if (Math.abs(p.x - c.x) < c.h + pad && Math.abs(p.z - c.z) < c.h + pad) return c;
    return null;
  }
  collide(b, radius) {
    const p = b.pos;
    // crates: push out of the square
    for (const c of this.crates) {
      const cx = clamp(p.x, c.x - c.h, c.x + c.h);
      const cz = clamp(p.z, c.z - c.h, c.z + c.h);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 1e-5) (p.x = cx + (dx / d) * radius), (p.z = cz + (dz / d) * radius);
        else p.x = c.x + c.h + radius;
      }
    }
    // the Foreman's body
    const f = this.foreman;
    const fd = dist2(p, f.pos);
    const fr = FOREMAN.bodyRadius + radius;
    if (fd < fr && fd > 1e-5) (p.x = f.pos.x + ((p.x - f.pos.x) / fd) * fr), (p.z = f.pos.z + ((p.z - f.pos.z) / fd) * fr);
    // arena wall
    const r = Math.hypot(p.x, p.z);
    const maxR = ARENA.radius - 0.5 - radius;
    if (r > maxR) (p.x *= maxR / r), (p.z *= maxR / r);
  }

  // ------------------------------------------------------------------ aim
  updateMouseAim(camera) {
    if (input.mode !== 'mouse' || input.bot) return;
    ray.setFromCamera(input.mouseNdc, camera);
    this.mouse.point = ray.ray.intersectPlane(ground, new THREE.Vector3());
    this.mouse.target = null;
    if (!this.foreman.awake) return;
    const hit = ray.intersectObject(this.foreman.view.root, true)[0];
    if (hit) this.mouse.target = hit.point.clone();
  }
  computeAim() {
    const p = this.player.pos;
    const a = this.aim;
    a.target = null;
    if (input.bot) {
      const t = input.aimTarget;
      if (t) (a.target = t.y > 1.6 ? t : null), (a.dir = norm(t.x - p.x, t.z - p.z));
      return;
    }
    if (input.mode === 'mouse') {
      const m = this.mouse.target || this.mouse.point;
      if (m) a.dir = norm(m.x - p.x, m.z - p.z);
      if (this.mouse.target) a.target = this.mouse.target;
      return;
    }
    if (!input.aimDir) return;
    a.dir = norm(input.aimDir.x, input.aimDir.z);
    // touch aim assist: snap to a Foreman part within 20°, or bend toward a hound within 10°
    let best = 20 * DEG;
    if (this.foreman.awake) {
      for (const n of BREAKABLE) {
        if (!this.foreman.isTarget(n)) continue;
        const c = this.foreman.partCenter(n);
        const d = angleBetween(a.dir, c.x - p.x, c.z - p.z);
        if (d < best) (best = d), (a.target = c);
      }
    }
    if (!a.target) {
      best = 10 * DEG;
      let hd = null;
      for (const h of this.hounds) {
        if (!h.alive) continue;
        const d = angleBetween(a.dir, h.pos.x - p.x, h.pos.z - p.z);
        if (d < best) (best = d), (hd = norm(h.pos.x - p.x, h.pos.z - p.z));
      }
      if (hd) a.dir = hd;
    }
  }

  // ------------------------------------------------------------------ spawning
  fireBolt(pl) {
    const f = pl.forward();
    const o = new THREE.Vector3(pl.pos.x + f.x * 0.6, PLAYER.gunHeight, pl.pos.z + f.z * 0.6);
    let dir = new THREE.Vector3(f.x, 0, f.z);
    const t = this.aim.target;
    if (t && dist2(t, o) > 1) dir = t.clone().sub(o).normalize();
    const b = new Body(this.spawnView('bolt'));
    b.vel = dir.multiplyScalar(BOLT.speed);
    b.life = BOLT.life;
    b.place(o.x, o.y, o.z, Math.atan2(dir.x, dir.z));
    b.pitch = b.prevPitch = -Math.asin(clamp(dir.y / BOLT.speed, -1, 1));
    this.bolts.push(b);
    this.stats.shots++;
    // muzzle flash + sound (looks only)
    const mf = this.spawnView('muzzle_flash');
    mf.root.position.copy(o);
    mf.root.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
    this.effects.push({ kind: 'flash', v: mf, t: 0, life: 0.05, size: 1 });
    sfx('shoot');
  }

  // Feedback for a bolt that hit something (looks and sound only): kind 'hound' | 'part' | 'core' | 'blocked'.
  onBoltHit(kind, pos, vel, target, big) {
    const dir = vel.clone().normalize();
    const strong = kind !== 'blocked';
    const fl = this.spawnView('hit_flash');
    fl.root.position.copy(pos).addScaledVector(dir, -0.2);
    // bigger on the Foreman: the boss camera is further away
    const scale = kind === 'hound' ? 1.3 : 2;
    this.effects.push({ kind: 'flash', v: fl, t: 0, life: strong ? 0.12 : 0.06, size: strong ? (big ? 2.4 : 1.2) * scale : 0.8 });
    // sparks bounce back off the surface
    const n = strong ? (big ? 16 : 9) : 4;
    for (let i = 0; i < n; i++) {
      const v = this.spawnView(strong ? 'spark' : 'spark_dim');
      const sv = new THREE.Vector3(-dir.x + (Math.random() - 0.5) * 1.8, 0.3 + Math.random() * 1.2, -dir.z + (Math.random() - 0.5) * 1.8)
        .normalize()
        .multiplyScalar(4 + Math.random() * 5);
      v.root.position.copy(pos);
      sv.multiplyScalar(strong ? scale * 0.8 : 1);
      this.effects.push({ kind: 'spark', v, t: 0, life: 0.2 + Math.random() * 0.2, vel: sv, size: strong ? scale : 1 });
    }
    if (kind === 'hound') target.view.kick?.('body', dir, 0.1), sfx(big ? 'houndDie' : 'hitHound');
    else if (strong) {
      this.foreman.view.kick?.(target, dir, 0.07);
      this.hud.pulsePart?.(target);
      sfx(kind === 'core' ? 'hitCore' : 'hitMetal');
    } else sfx('blocked');
    if (strong) this.hitMarks.push({ pos: pos.clone(), big });
  }
  fireShell(from, target, cfg) {
    const dir = new THREE.Vector3(target.x - from.x, 0.9 - from.y, target.z - from.z).normalize();
    const s = new Body(this.spawnView('shell'));
    s.vel = dir.multiplyScalar(cfg.shellSpeed);
    s.cfg = cfg;
    s.life = 4;
    s.place(from.x, from.y, from.z, Math.atan2(dir.x, dir.z));
    s.pitch = s.prevPitch = -Math.asin(clamp(dir.y / cfg.shellSpeed, -1, 1));
    this.shells.push(s);
  }
  placeMissile(x, z, cfg) {
    const r = Math.hypot(x, z);
    const maxR = ARENA.radius - 1.5;
    if (r > maxR) (x *= maxR / r), (z *= maxR / r);
    const m = { x, z, t: 0, warn: cfg.warn, cfg, marker: this.spawnView('missile_marker'), missile: new Body(this.spawnView('missile')) };
    m.marker.root.position.set(x, 0, z);
    m.missile.view.root.visible = false;
    m.missile.place(x, 30, z, 0);
    m.missile.pitch = m.missile.prevPitch = Math.PI / 2; // nose down
    this.markers.push(m);
  }
  launchMissileVisual(from, i) {
    const v = this.spawnView('missile');
    v.root.position.copy(from);
    v.root.position.x += (i - 2.5) * 0.3;
    v.root.rotation.set(-Math.PI / 2, 0, 0);
    this.effects.push({ kind: 'rise', v, t: -i * 0.06, life: 0.9 });
  }
  spawnBlast(x, y, z, size) {
    const v = this.spawnView('blast');
    v.root.position.set(x, y - 0.3, z);
    this.effects.push({ kind: 'blast', v, t: 0, life: 0.35, size });
    sfx(size >= 1 ? 'boom' : 'pop');
  }
  spawnKit(x, z, avoid, avoidR) {
    if (avoid) {
      const d = dist2({ x, z }, avoid);
      if (d < avoidR) {
        const k = d > 0.01 ? avoidR / d : 1;
        x = avoid.x + (x - avoid.x) * k || avoid.x + avoidR;
        z = avoid.z + (z - avoid.z) * k;
      }
    }
    const r = Math.hypot(x, z);
    if (r > 17) (x *= 17 / r), (z *= 17 / r);
    const k = new Body(this.spawnView('repair_kit'));
    k.place(x, 0, z, 0);
    const c = this.insideCrate(k.pos, 0.4);
    if (c) this.collide(k, 1.2);
    this.kits.push(k);
  }
  spawnHound(i, tune = WAVES[1]) {
    const h = new Hound(view('hound'), this.houndCount++);
    h.tune = tune;
    const p = this.player.pos;
    let x;
    let z;
    if (tune.spawnAhead) {
      // on screen, in front of the player (up the screen), spread left / centre / right
      const a = [0, -35, 35][i % 3] * DEG;
      x = p.x + Math.sin(a) * tune.spawnAhead;
      z = p.z - Math.cos(a) * tune.spawnAhead;
      const r = Math.hypot(x, z);
      if (r > ARENA.houndSpawnRadius) (x *= ARENA.houndSpawnRadius / r), (z *= ARENA.houndSpawnRadius / r);
    } else {
      const a = ARENA.houndSpawnAngles[i % ARENA.houndSpawnAngles.length] * DEG;
      x = Math.cos(a) * ARENA.houndSpawnRadius;
      z = Math.sin(a) * ARENA.houndSpawnRadius;
    }
    h.place(x, 3, z, Math.atan2(p.x - x, p.z - z));
    this.collide(h, HOUND.radius);
    h.snapshot();
    this.scene.add(h.view.root);
    this.hounds.push(h);
  }

  // parts that break off fly away as debris (cosmetic, updated per rendered frame)
  detachAsDebris(v, name, mode, fwd) {
    const obj = v.detachPart(name);
    if (!obj) return;
    obj.parent.updateMatrixWorld(true);
    this.scene.attach(obj);
    const out = { x: obj.position.x - v.root.position.x, z: obj.position.z - v.root.position.z };
    const ol = Math.hypot(out.x, out.z) || 1;
    let vel;
    let spin;
    if (mode === 'drop') (vel = new THREE.Vector3(fwd.x * 2.5, 1.5, fwd.z * 2.5)), (spin = new THREE.Vector3(0, 0, 0)), (obj.userData.tip = -1);
    else if (mode === 'blast') (vel = new THREE.Vector3((out.x / ol) * 2, 9, (out.z / ol) * 2 - 1)), (spin = rndVec(4));
    else vel = new THREE.Vector3((out.x / ol) * 3, 3, (out.z / ol) * 3), (spin = rndVec(mode === 'small' ? 10 : 2));
    this.debris.push({ obj, vel, spin, t: 0, life: mode === 'small' ? 1.5 : 10 });
  }

  // ------------------------------------------------------------------ events
  onHoundDestroyed(h, dir) {
    this.stats.houndsDestroyed++;
    sfx('houndDie');
    h.sync(1);
    h.view.root.updateMatrixWorld(true);
    for (const n of ['head', 'front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg', 'body']) this.detachAsDebris(h.view, n, 'small', dir);
    this.scene.remove(h.view.root);
    if (Math.random() < HOUND.kitDropChance) this.spawnKit(h.pos.x, h.pos.z);
    this.spawnBlast(h.pos.x, 0.5, h.pos.z, 0.6);
  }
  onPlayerDown() {
    if (this.over) return;
    this.over = true;
    this.result = 'lost';
    this.endTimer = 1.2;
    this.beam.view.root.visible = false;
  }
  onForemanDestroyed() {
    this.over = true;
    this.result = 'won';
    this.endTimer = 2.2;
    this.player.setState('cheer');
    this.player.invuln = 0;
    for (const m of this.markers) this.recycle(m.marker), this.recycle(m.missile.view);
    this.markers = [];
    for (const s of this.shells) this.recycle(s.view);
    this.shells = [];
  }

  // ------------------------------------------------------------------ simulation step (fixed 1/60 s)
  step(dt) {
    const all = this.bodies();
    for (const b of all) b.snapshot();
    if (this.stop > 0) {
      this.stop -= dt;
      return;
    }
    this.time += dt;
    this.phaseT += dt;
    this.computeAim();
    this.player.update(dt, this);
    for (const h of this.hounds) {
      if (h.freeze > 0) h.freeze -= dt;
      else h.update(dt, this);
    }
    this.separateHounds();
    this.hounds = this.hounds.filter((h) => h.alive);
    this.foreman.update(dt, this);
    this.foreman.sync(1);
    this.foreman.view.root.updateMatrixWorld(true);
    this.updateBolts(dt);
    this.updateShells(dt);
    this.updateMissiles(dt);
    this.updateKits();
    this.updateBeam();
    this.updatePhase(dt);
  }

  bodies() {
    const list = [this.player, this.foreman, this.beam, ...this.hounds, ...this.bolts, ...this.shells, ...this.kits];
    for (const m of this.markers) list.push(m.missile);
    return list;
  }

  separateHounds() {
    const hs = this.hounds;
    // hounds do not stand inside the player (they may pass through mid-pounce)
    const pp = this.player.pos;
    for (const h of hs) {
      if (h.state === 'pounce' || !h.alive) continue;
      const d = dist2(h.pos, pp);
      const min = HOUND.radius + PLAYER.radius;
      if (d < min && d > 1e-4) (h.pos.x = pp.x + ((h.pos.x - pp.x) / d) * min), (h.pos.z = pp.z + ((h.pos.z - pp.z) / d) * min);
    }
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) {
        const a = hs[i].pos;
        const b = hs[j].pos;
        const d = dist2(a, b);
        const min = HOUND.radius * 2;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2 / d;
          const dx = (a.x - b.x) * push;
          const dz = (a.z - b.z) * push;
          a.x += dx, a.z += dz, b.x -= dx, b.z -= dz;
        }
      }
  }

  updateBolts(dt) {
    const keep = [];
    for (const b of this.bolts) {
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let dead = b.life <= 0 || b.pos.y < 0 || Math.hypot(b.pos.x, b.pos.z) > ARENA.radius;
      if (!dead && b.pos.y < 1.5 && this.insideCrate(b.pos)) (dead = true), this.stats.boltHits.blocked++, this.onBoltHit('blocked', b.pos, b.vel);
      if (!dead)
        for (const h of this.hounds) {
          if (h.alive && b.pos.y < HOUND.height + 0.4 + h.pos.y && dist2(b.pos, h.pos) < HOUND.radius + 0.1) {
            h.damage(BOLT.damage, b.vel, this);
            this.stats.boltHits.hound++;
            this.onBoltHit('hound', b.pos, b.vel, h, !h.alive);
            dead = true;
            break;
          }
        }
      if (!dead) {
        const hit = this.foreman.hitTest(b.pos);
        if (hit?.part) {
          this.foreman.damagePart(hit.part, BOLT.damage, this);
          this.stats.boltHits.part++;
          dead = true;
          this.onBoltHit(hit.part === 'core' ? 'core' : 'part', b.pos, b.vel, hit.part, this.foreman.parts[hit.part].broken);
        } else if (hit?.blocked) this.stats.boltHits.blocked++, (dead = true), this.onBoltHit('blocked', b.pos, b.vel);
      }
      if (dead) this.recycle(b.view);
      else keep.push(b);
    }
    this.bolts = keep;
  }

  updateShells(dt) {
    const keep = [];
    const p = this.player;
    for (const s of this.shells) {
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      let dead = s.life <= 0 || s.pos.y < 0.1 || Math.hypot(s.pos.x, s.pos.z) > ARENA.radius;
      if (!dead && s.pos.y < 1.5 && this.insideCrate(s.pos)) dead = true;
      if (!dead && dist2(s.pos, p.pos) < 0.55 && s.pos.y < 1.9) {
        p.damage(s.cfg.damage, s.vel, 1.5, 'volley', this);
        dead = true;
      }
      if (dead) this.spawnBlast(s.pos.x, Math.max(0.3, s.pos.y), s.pos.z, 0.5), this.recycle(s.view);
      else keep.push(s);
    }
    this.shells = keep;
  }

  updateMissiles(dt) {
    const keep = [];
    for (const m of this.markers) {
      m.t += dt;
      const left = m.warn - m.t;
      m.missile.view.root.visible = left < 0.5;
      m.missile.pos.y = Math.max(0, (left / 0.5) * 30);
      m.fill = Math.min(1, m.t / m.warn);
      if (left <= 0) {
        const p = this.player;
        const d = dist2(p.pos, m);
        if (d < m.cfg.radius) p.damage(m.cfg.damage, { x: p.pos.x - m.x, z: p.pos.z - m.z }, 1.5, 'missiles', this);
        this.spawnBlast(m.x, 0.3, m.z, m.cfg.radius);
        this.shake(0.3);
        this.recycle(m.marker);
        this.recycle(m.missile.view);
      } else keep.push(m);
    }
    this.markers = keep;
  }

  updateKits() {
    const p = this.player;
    this.kits = this.kits.filter((k) => {
      if (p.alive && p.hp < PLAYER.maxHp && dist2(k.pos, p.pos) < KIT.radius) {
        p.hp = Math.min(PLAYER.maxHp, p.hp + KIT.heal);
        this.stats.kitsTaken++;
        this.recycle(k.view);
        return false;
      }
      return true;
    });
  }

  updateBeam() {
    const f = this.foreman;
    const b = this.beam;
    b.pos.copy(f.beamOrigin);
    b.yaw = f.beamYaw;
    if (!b.on && f.beamOn) b.snapshot();
    b.on = f.beamOn;
  }

  updatePhase(dt) {
    if (this.over) {
      this.stats.time = +this.time.toFixed(1);
      if (this.endTimer > 0 && (this.endTimer -= dt) <= 0) {
        this.phase = this.result;
        this.stats.result = this.result;
        this.hud.showEnd(this.result, this.stats);
      }
      return;
    }
    // hounds drop in one at a time
    this.spawnQueue = this.spawnQueue.filter((s) => {
      if ((s.at -= dt) <= 0) return this.spawnHound(s.i, WAVES[this.wave]), false;
      return true;
    });
    if (this.phase === 'intro' && this.phaseT > INTRO_TIME) this.startWave(0);
    else if (this.phase === 'wave' && !this.spawnQueue.length && !this.hounds.length) {
      this.stats.wavesCleared = this.wave + 1;
      this.phase = 'gap';
      this.phaseT = 0;
      const last = this.wave === WAVES.length - 1;
      this.hud.banner(last ? 'THE FOREMAN WAKES' : `WAVE ${this.wave + 2}`, WAVE_GAP);
    } else if (this.phase === 'gap' && this.phaseT > WAVE_GAP) {
      if (this.wave < WAVES.length - 1) this.startWave(this.wave + 1);
      else {
        this.phase = 'boss';
        this.foreman.wake();
      }
    }
  }
  startWave(w) {
    this.wave = w;
    this.phase = 'wave';
    this.phaseT = 0;
    for (let i = 0; i < WAVES[w].count; i++) this.spawnQueue.push({ i: i + w, at: i * WAVES[w].spawnGap });
  }

  // ------------------------------------------------------------------ render (every screen frame)
  render(alpha, dt, camera) {
    this.updateMouseAim(camera);
    const p = this.player;
    p.sync(alpha);
    p.view.setState(p.state);
    p.view.update(dt, p.viewInfo(alpha));
    this.foreman.sync(alpha);
    this.foreman.view.update(dt);
    for (const h of this.hounds) h.sync(alpha), h.view.update(dt);
    for (const b of this.bolts) b.sync(alpha);
    for (const s of this.shells) s.sync(alpha);
    for (const k of this.kits) {
      k.sync(alpha);
      k.view.root.position.y = 0.15 + Math.sin(this.time * 4 + k.pos.x) * 0.1;
      k.view.root.rotation.y = this.time * 1.5;
    }
    for (const m of this.markers) {
      m.missile.sync(alpha);
      // the inner disc fills the warning circle as the missile gets closer
      const fill = Math.max(0.05, m.fill) * 2;
      m.marker.part('fill').scale.set(fill, 1, fill);
    }
    // sweep beam: thin while warning, full while it hurts
    const bv = this.beam.view.root;
    bv.visible = !!this.beam.on && !this.over;
    if (bv.visible) {
      this.beam.sync(alpha);
      const on = this.beam.on === 2;
      bv.scale.set(on ? 1 : 0.25, on ? 1 : 0.25, 1);
    }
    const f = this.foreman;
    this.ring.root.visible = f.ringR > 0;
    if (f.ringR > 0) {
      this.ring.root.position.set(f.pos.x, 0, f.pos.z);
      this.ring.root.scale.set(f.ringR, 1, f.ringR);
    }
    this.updateEffects(dt);
    // hit markers where shots landed
    for (const h of this.hitMarks) {
      const s = h.pos.clone().project(camera);
      if (s.z < 1) this.hud.hitMarker?.((s.x + 1) / 2 * innerWidth, (1 - s.y) / 2 * innerHeight, h.big);
    }
    this.hitMarks.length = 0;
    this.updateDebris(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
    // keep the sun's shadow box around the player
    const r = p.view.root.position;
    this.sun.position.set(r.x + 8, 25, r.z + 6);
    this.sun.target.position.set(r.x, 0, r.z);
    this.hud.update(this);
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.t += dt;
      if (e.kind === 'rise') {
        e.v.root.visible = e.t > 0;
        if (e.t > 0) e.v.root.position.y += dt * 30;
      } else if (e.kind === 'blast') {
        const k = e.t / e.life;
        e.v.root.scale.set(e.size * (0.4 + k), 1 - k * 0.7, e.size * (0.4 + k));
      } else if (e.kind === 'spark') {
        e.vel.y -= 15 * dt;
        e.v.root.position.addScaledVector(e.vel, dt);
        _v.copy(e.v.root.position).add(e.vel);
        e.v.root.lookAt(_v);
        e.v.root.scale.setScalar((e.size || 1) * Math.max(0.05, 1 - e.t / e.life));
      } else if (e.kind === 'flash') {
        const k = Math.min(1, e.t / e.life);
        e.v.root.scale.setScalar(e.size * (0.6 + 0.8 * k));
        e.v.root.traverse((o) => o.isMesh && (o.material.opacity = 1 - k));
      }
      if (e.t >= e.life) return this.recycle(e.v), false;
      return true;
    });
  }

  updateDebris(dt) {
    this.debris = this.debris.filter((d) => {
      d.t += dt;
      const o = d.obj;
      if (d.t > d.life) {
        o.position.y -= dt * 1.5;
        if (d.t > d.life + 2) return this.scene.remove(o), false;
        return true;
      }
      d.vel.y -= 20 * dt;
      o.position.addScaledVector(d.vel, dt);
      if (o.userData.tip) o.rotation.x = Math.max(-Math.PI / 2 + 0.15, o.rotation.x - dt * 3);
      else (o.rotation.x += d.spin.x * dt), (o.rotation.y += d.spin.y * dt), (o.rotation.z += d.spin.z * dt);
      _box.setFromObject(o);
      if (_box.min.y < 0) {
        o.position.y -= _box.min.y;
        if (d.vel.y < 0) d.vel.y *= -0.25;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
        d.spin.multiplyScalar(0.6);
      }
      return true;
    });
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}

function norm(x, z) {
  const l = Math.hypot(x, z);
  return l > 1e-4 ? { x: x / l, z: z / l } : null;
}
function angleBetween(dir, x, z) {
  const l = Math.hypot(x, z) || 1;
  return Math.acos(clamp((dir.x * x + dir.z * z) / l, -1, 1));
}
function rndVec(s) {
  return new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
}
