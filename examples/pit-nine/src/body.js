// A simulated thing with a view. The simulation runs at a fixed 60 steps a second;
// sync(alpha) blends between the last two steps so motion is smooth at 60, 120 or 144 Hz.
import * as THREE from 'three';

export const lerp = (a, b, t) => a + (b - a) * t;
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Body {
  constructor(view) {
    this.view = view;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.yaw = 0;
    this.prevYaw = 0;
    this.pitch = 0; // whole-body tilt (x), used for thrown debris and bolts
    this.prevPitch = 0;
    // pose: 'partName.rx' / '.ry' / '.rz' (radians) and '.px' / '.py' / '.pz' (metres, added to the hinge position)
    this.pose = {};
    this.prevPose = {};
    this.freeze = 0; // seconds this body is frozen by a hit
  }
  place(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.snapshot();
  }
  snapshot() {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    for (const k in this.pose) this.prevPose[k] = this.pose[k];
  }
  sync(alpha) {
    const r = this.view.root;
    r.position.lerpVectors(this.prev, this.pos, alpha);
    r.rotation.set(lerp(this.prevPitch, this.pitch, alpha), lerpAngle(this.prevYaw, this.yaw, alpha), 0, 'YXZ');
    for (const k in this.pose) {
      const dot = k.lastIndexOf('.');
      const part = this.view.part(k.slice(0, dot));
      if (!part) continue;
      const ch = k.slice(dot + 1);
      const v = lerp(this.prevPose[k] ?? this.pose[k], this.pose[k], alpha);
      if (ch[0] === 'r') part.rotation[ch[1]] = v;
      else {
        part.userData.hinge ??= part.position.clone();
        part.position[ch[1]] = part.userData.hinge[ch[1]] + v;
      }
    }
  }
}
