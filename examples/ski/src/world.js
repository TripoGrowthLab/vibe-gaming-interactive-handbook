// Endless run: spawns obstacle rows ahead of the player, fences along the edges, scenery trees outside them.
// Gameplay data (x, z, hitbox) lives here; looks come from registry.createView.
import { CFG } from './config.js';
import { OBJECTS, OBSTACLE_IDS, halfWidthX, halfDepthZ } from './defs.js';
import { createView, buildHitboxHelper } from './registry.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Pool {
  constructor(scene, id) {
    this.scene = scene;
    this.id = id;
    this.free = [];
  }
  get() {
    const v = this.free.pop() ?? createView(this.id);
    v.root.visible = true;
    v.root.scale.setScalar(1);
    const helper = v.root.getObjectByName('hitbox_helper');
    if (helper) helper.visible = false;
    if (!v.root.parent) this.scene.add(v.root);
    return v;
  }
  put(v) {
    v.root.visible = false;
    this.free.push(v);
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.pools = {};
    for (const id of [...OBSTACLE_IDS, 'edge_fence']) this.pools[id] = new Pool(scene, id);
    this.obstacles = []; // { id, x, z, hitbox, view, rowIndex }
    this.fences = [];    // { view, z }
    this.decor = [];     // { view, z }
    this.showHitboxes = false;
  }

  reset(startZ, seed) {
    for (const o of this.obstacles) this.pools[o.id].put(o.view);
    for (const f of this.fences) this.pools.edge_fence.put(f.view);
    for (const d of this.decor) this.pools.pine_tree.put(d.view);
    this.obstacles = [];
    this.fences = [];
    this.decor = [];
    this.rng = mulberry32(seed);
    this.startZ = startZ;
    this.nextRowZ = startZ + CFG.START_CLEAR;
    this.lastGapX = 0;
    this.rowIndex = 0;
    this.nextFenceZ = startZ - 20;
    this.nextDecorZ = startZ - 20;
    this.update(startZ, CFG.SPEED_START);
  }

  // Called every fixed step. playerZ: current z; speed: current forward speed.
  update(playerZ, speed) {
    const ahead = playerZ + CFG.SPAWN_AHEAD;
    while (this.nextRowZ < ahead) this.spawnRow(speed);
    while (this.nextFenceZ < ahead) {
      for (const side of [1, -1]) {
        const view = this.pools.edge_fence.get();
        view.root.position.set(side * (CFG.RUN_HALF_WIDTH + 0.1), 0, this.nextFenceZ + CFG.FENCE_SEG / 2);
        view.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; // net faces into the run
        this.fences.push({ view, z: this.nextFenceZ });
      }
      this.nextFenceZ += CFG.FENCE_SEG;
    }
    while (this.nextDecorZ < ahead) {
      const side = this.rng() < 0.5 ? 1 : -1;
      const view = this.pools.pine_tree.get();
      const x = side * (CFG.RUN_HALF_WIDTH + 2 + this.rng() * 22);
      view.root.position.set(x, 0, this.nextDecorZ);
      view.root.scale.setScalar(0.8 + this.rng() * 0.5);
      this.decor.push({ view, z: this.nextDecorZ });
      this.nextDecorZ += 1.2 + this.rng() * 2.2;
    }

    const behind = playerZ - CFG.DESPAWN_BEHIND;
    const keep = (list, pool) => list.filter((o) => {
      if (o.z >= behind) return true;
      (pool ?? this.pools[o.id]).put(o.view);
      return false;
    });
    this.obstacles = keep(this.obstacles);
    this.fences = keep(this.fences, this.pools.edge_fence);
    this.decor = keep(this.decor, this.pools.pine_tree);
  }

  difficulty(z) {
    return clamp((z - this.startZ) / CFG.DIFFICULTY_DIST, 0, 1);
  }

  spawnRow(speed) {
    const rng = this.rng;
    const z = this.nextRowZ;
    const dist = z - this.startZ;
    const t = this.difficulty(z);
    const spacing = lerp(CFG.ROW_SPACING[0], CFG.ROW_SPACING[1], t) * (0.9 + rng() * 0.2);
    const gapW = Math.max(3, lerp(CFG.GAP_WIDTH[0], CFG.GAP_WIDTH[1], t));
    const W = CFG.RUN_HALF_WIDTH;

    // Guaranteed route: the gap may only move as far as the player can steer before this row arrives.
    const freeRun = Math.max(0, spacing - 2 * CFG.ROW_JITTER - 1.8);
    const maxShift = CFG.LAT_MAX * (freeRun / Math.max(speed, 1)) * 0.55;
    const gapX = clamp(this.lastGapX + (rng() * 2 - 1) * maxShift, -W + gapW / 2 + 0.2, W - gapW / 2 - 0.2);
    this.lastGapX = gapX;

    const allowed = OBSTACLE_IDS.filter((id) => dist >= OBJECTS[id].from);
    const totalW = allowed.reduce((s, id) => s + OBJECTS[id].weight, 0);
    const pick = () => {
      let r = rng() * totalW;
      for (const id of allowed) if ((r -= OBJECTS[id].weight) <= 0) return id;
      return allowed[0];
    };

    const count = Math.round(lerp(CFG.ROW_COUNT[0], CFG.ROW_COUNT[1], t) + rng() * 1.5);
    const placed = [];
    const perType = {};
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const id = pick();
        const def = OBJECTS[id];
        if (def.maxPerRow && (perType[id] ?? 0) >= def.maxPerRow) continue;
        const hw = halfWidthX(def.hitbox);
        const x = -W + hw + rng() * (2 * W - 2 * hw);
        if (Math.abs(x - gapX) < gapW / 2 + hw) continue;
        if (placed.some((p) => Math.abs(p.x - x) < p.hw + hw + 0.4)) continue;
        placed.push({ id, x, hw });
        perType[id] = (perType[id] ?? 0) + 1;
        const view = this.pools[id].get();
        const oz = z + (rng() * 2 - 1) * CFG.ROW_JITTER;
        view.root.position.set(x, 0, oz);
        this.setHelper(view, id);
        this.obstacles.push({ id, x, z: oz, hitbox: def.hitbox, view, rowIndex: this.rowIndex, gapX, gapW });
        break;
      }
    }
    this.rowIndex++;
    this.nextRowZ = z + spacing;
  }

  setHelper(view, id) {
    let helper = view.root.getObjectByName('hitbox_helper');
    if (!helper && this.showHitboxes) view.root.add((helper = buildHitboxHelper(id)));
    if (helper) helper.visible = this.showHitboxes;
  }

  toggleHitboxes() {
    this.showHitboxes = !this.showHitboxes;
    for (const o of this.obstacles) this.setHelper(o.view, o.id);
    return this.showHitboxes;
  }

  // Circle (player) vs obstacle hitboxes in the ground plane. Returns the obstacle hit, or null.
  collide(x, z, r) {
    for (const o of this.obstacles) {
      const hb = o.hitbox;
      if (Math.abs(o.z - z) > halfDepthZ(hb) + r) continue;
      if (hb.type === 'circle') {
        const dx = x - o.x, dz = z - o.z, rr = hb.r + r;
        if (dx * dx + dz * dz < rr * rr) return o;
      } else {
        const cx = clamp(x, o.x - hb.w / 2, o.x + hb.w / 2);
        const cz = clamp(z, o.z - hb.d / 2, o.z + hb.d / 2);
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz < r * r) return o;
      }
    }
    return null;
  }
}
