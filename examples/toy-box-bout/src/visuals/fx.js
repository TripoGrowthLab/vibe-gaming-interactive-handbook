// Short-lived effects: hit sparks and parts flying off. Reacts to gameplay events; owns no rules.
import * as THREE from 'three';
import { build } from './registry.js';

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spark(pos, color = 0xffe14a, count = 6) {
    const g = build('hit_spark', { color });
    g.position.copy(pos);
    const vel = g.children.slice(0, count).map(() =>
      new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(1.6),
    );
    this.scene.add(g);
    this.items.push({ kind: 'spark', obj: g, vel, life: 0.3, age: 0 });
  }

  // A broken part: flies off spinning, bounces, then fades after 3 s.
  debris(part, away) {
    this.scene.add(part);
    part.traverse((o) => {
      if (o.isMesh) {
        o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
          const c = m.clone();
          c.transparent = true;
          c.side = THREE.DoubleSide;
          return c;
        });
        if (o.material.length === 1) o.material = o.material[0];
      }
    });
    const vel = new THREE.Vector3(away.x * 1.2, 1.4, away.z * 1.2);
    const spin = new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    this.items.push({ kind: 'debris', obj: part, vel, spin, life: 3.6, age: 0 });
  }

  update(dt) {
    for (const it of this.items) {
      it.age += dt;
      const o = it.obj;
      if (it.kind === 'spark') {
        o.children.forEach((c, i) => {
          const v = it.vel[i];
          if (!v) return (c.visible = false);
          c.position.addScaledVector(v, dt);
          v.y -= 6 * dt;
        });
        o.children[0].material.opacity = 1 - it.age / it.life;
      } else {
        it.vel.y -= 9.8 * dt;
        o.position.addScaledVector(it.vel, dt);
        if (o.position.y < 0.03) {
          o.position.y = 0.03;
          it.vel.y = Math.abs(it.vel.y) * 0.35;
          it.vel.x *= 0.6;
          it.vel.z *= 0.6;
          it.spin.multiplyScalar(0.6);
        }
        o.rotation.x += it.spin.x * dt;
        o.rotation.y += it.spin.y * dt;
        o.rotation.z += it.spin.z * dt;
        const fade = Math.min(1, Math.max(0, (it.life - it.age) / 0.6));
        o.traverse((m) => m.isMesh && (m.material.opacity = fade));
      }
    }
    for (const it of this.items.filter((i) => i.age >= i.life)) this.scene.remove(it.obj);
    this.items = this.items.filter((i) => i.age < i.life);
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
  }
}
