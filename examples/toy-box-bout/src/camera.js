// Lock-on third-person camera for fights, and a slow turntable for the garage.
import * as THREE from 'three';
import { ARENA } from './data.js';

// Fraction (0..1) along the segment a -> b where it first enters a toy-block stack, or null.
const PAD = 0.06;
const UP = new THREE.Vector3(0, 1, 0);
const HOLD = 0.6; // seconds the camera keeps a still-clear spot before moving to a better one
export function firstBlockHit(a, b, blocks) {
  let best = null;
  const d = new THREE.Vector3().subVectors(b, a);
  for (const bl of blocks) {
    const min = [bl.minX - PAD, -1, bl.minZ - PAD];
    const max = [bl.maxX + PAD, bl.top + PAD, bl.maxZ + PAD];
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [k, i] of [['x', 0], ['y', 1], ['z', 2]]) {
      if (Math.abs(d[k]) < 1e-9) {
        if (a[k] < min[i] || a[k] > max[i]) ok = false;
        continue;
      }
      let ta = (min[i] - a[k]) / d[k];
      let tb = (max[i] - a[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok && (best === null || t0 < best)) best = t0;
  }
  return best;
}

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 1.2, -3.5);
    this.look = new THREE.Vector3(0, 0.25, 0);
    this.dir = new THREE.Vector3(0, 0, 1); // smoothed direction from player to rival
    this.garageAngle = 0;
  }

  snapFight(player, rival, blocks = []) {
    this.dir.subVectors(rival.pos, player.pos).setY(0).normalize();
    this.fight(player, rival, 1, true, blocks);
  }

  // Framerate-independent smoothing: same feel at 60 Hz and 120 Hz.
  fight(player, rival, dt, snap = false, blocks = []) {
    const to = new THREE.Vector3().subVectors(rival.pos, player.pos).setY(0);
    const dist = to.length();
    if (dist > 0.05) this.dir.lerp(to.divideScalar(dist), snap ? 1 : 1 - Math.exp(-5 * dt)).normalize();
    const portrait = this.cam.aspect < 1;
    const back = THREE.MathUtils.lerp(1.3, 2.0, THREE.MathUtils.smoothstep(dist, 1.2, 2.5)) * (portrait ? 1.35 : 1);
    // Over the right shoulder, so Pipo does not hide the rival.
    const right = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    const h0 = 0.7 * (portrait ? 1.2 : 1);
    const look = player.pos.clone().lerp(rival.pos, 0.3).addScaledVector(right, 0.08);
    look.y = 0.25;
    const chest = player.pos.clone().setY(0.3 - player.drop);
    const base = player.pos.clone().addScaledVector(right, 0.28);

    // Find the furthest-back, lowest spot with a clear view of Pipo and the fight: nothing between
    // it and them, and never through a toy-box wall. Near a wall the camera comes closer and rises.
    const nearBlock = (c) => blocks.some((b) => Math.hypot(Math.max(b.minX - c.x, 0, c.x - b.maxX), Math.max(b.minZ - c.z, 0, c.z - b.maxZ), Math.max(0, c.y - b.top)) < 0.3);
    const hips = player.pos.clone().setY(0.18);
    const blocked = (c) => nearBlock(c) || this.wallBlocks(look, c) || this.wallBlocks(chest, c) || firstBlockHit(chest, c, blocks) !== null || firstBlockHit(hips, c, blocks) !== null || firstBlockHit(look, c, blocks) !== null;
    // Candidate spots: straight behind first, then swung round to either side, then higher up,
    // coming closer each time. A spot is described by (yaw, distance share, height).
    const tries = [[1.1, 0], [1.1, 0.5], [1.1, -0.5], [1.1, 1.0], [1.1, -1.0], [1.5, 0], [1.5, 0.5], [1.5, -0.5]];
    const away = new THREE.Vector3();
    const spot = (c, out = new THREE.Vector3()) => {
      if (c.fallback) {
        const lim = ARENA.half - 0.08;
        out.copy(base).addScaledVector(this.dir, -0.45).setY(1.0);
        out.x = THREE.MathUtils.clamp(out.x, -lim, lim);
        out.z = THREE.MathUtils.clamp(out.z, -lim, lim);
        return out;
      }
      away.copy(this.dir).applyAxisAngle(UP, c.yaw).negate();
      return out.copy(base).addScaledVector(away, Math.max(0.45, back * c.f)).setY(c.h);
    };
    let ideal = null;
    for (const [maxH, yaw] of tries) {
      for (const f of [1, 0.85, 0.7, 0.55, 0.42, 0.32]) {
        for (let h = h0; h <= maxH + 1e-6 && !ideal; h += 0.1) {
          if (!blocked(spot({ yaw, f, h }))) ideal = { yaw, f, h };
        }
        if (ideal) break;
      }
      if (ideal) break;
    }
    ideal ??= { fallback: true };
    // Hold the current spot while it still has a clear view, and only move on to a better one after
    // holding it for a moment. Switching back and forth between two nearly-equal spots is what
    // makes a view wobble.
    this.choiceAge = (this.choiceAge || 0) + dt;
    const same = (a, b) => a && b && (a.fallback ? b.fallback : !b.fallback && a.yaw === b.yaw && a.f === b.f && Math.abs(a.h - b.h) < 1e-6);
    const keep = !snap && this.choice && !same(this.choice, ideal) && this.choiceAge < HOLD && !blocked(spot(this.choice));
    if (!keep && !same(this.choice, ideal)) {
      this.choice = ideal;
      this.choiceAge = 0;
    }
    const want = spot(this.choice);
    this.debug = { choice: `${want.x.toFixed(2)},${want.y.toFixed(2)},${want.z.toFixed(2)}` };

    // Glide smoothly; a little quicker while the current view is blocked.
    const k = snap ? 1 : 1 - Math.exp((blocked(this.pos) ? -14 : -8) * dt);
    this.pos.lerp(want, k);
    // Keep Pipo's feet and head on screen from where the camera really is: find the smallest tilt
    // toward Pipo that frames them (a smooth, steady target, so the view never wobbles), then glide.
    this.frameCam ??= new THREE.PerspectiveCamera();
    const fc = this.frameCam;
    fc.fov = this.cam.fov;
    fc.aspect = this.cam.aspect;
    fc.near = this.cam.near;
    fc.far = this.cam.far;
    fc.updateProjectionMatrix();
    const feet = player.pos.clone();
    const head = player.pos.clone().setY(0.5 - player.drop);
    const aim = player.pos.clone().setY(0.2);
    const target = new THREE.Vector3();
    const framed = (t) => {
      fc.position.copy(this.pos);
      fc.lookAt(t);
      fc.updateMatrixWorld(true);
      return [feet, head].every((q) => {
        const p = q.clone().project(fc);
        return Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.88 && p.z < 1;
      });
    };
    this.debug.framedAdjust = !framed(look);
    this.debug.hurry = blocked(this.pos);
    if (framed(look)) target.copy(look);
    else {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (framed(target.lerpVectors(look, aim, mid))) hi = mid;
        else lo = mid;
      }
      target.lerpVectors(look, aim, hi);
    }
    this.look.lerp(target, k);
    this.apply();
  }

  // Does the line from p to the camera c pass through a toy-box wall (below its top)?
  wallBlocks(p, c) {
    const lim = ARENA.half - 0.05;
    const top = ARENA.wallHeight + 0.06;
    for (const k of ['x', 'z']) {
      if (Math.abs(c[k]) <= lim) continue;
      const edge = Math.sign(c[k]) * lim;
      const t = (edge - p[k]) / (c[k] - p[k]);
      if (t >= 0 && t <= 1 && p.y + (c.y - p.y) * t < top) return true;
    }
    return false;
  }

  // Garage: the robot turns on a turntable; the camera stays in front of it, always inside the box.
  garage(target, dt, snap = false) {
    this.garageAngle += dt;
    const sway = Math.sin(this.garageAngle * 0.4) * 0.35;
    const r = this.cam.aspect < 1 ? 1.5 : 1.0;
    const want = new THREE.Vector3(Math.sin(sway) * r, 0.45, Math.cos(sway) * r).add(target);
    const k = snap ? 1 : 1 - Math.exp(-6 * dt);
    this.pos.lerp(want, k);
    this.look.lerp(target.clone().setY(0.26), k);
    this.apply();
  }

  // Slow fly-around of the whole toy box behind the title screen.
  title(dt) {
    const a = this.garageAngle;
    const want = new THREE.Vector3(Math.sin(a) * 3.2, 1.6, Math.cos(a) * 3.2);
    this.pos.lerp(want, 1 - Math.exp(-3 * dt));
    this.look.lerp(new THREE.Vector3(0, 0.1, 0), 1 - Math.exp(-3 * dt));
    this.apply();
  }

  apply() {
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  // Stick direction relative to the camera, as world x/z.
  worldMove(stick) {
    const f = new THREE.Vector3();
    this.cam.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return new THREE.Vector2(f.x * stick.y + r.x * stick.x, f.z * stick.y + r.z * stick.x);
  }
}
