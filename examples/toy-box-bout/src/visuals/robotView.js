// Builds a robot from parts: a scene graph of named attach points with one part hung on each.
//
//   robot (moved by gameplay)
//   └ body            lean / fall pivot at the feet
//     ├ attach_legs   └ legs   (leg_l, leg_r | tread_l, tread_r | skirt)
//     └ upper         sinks when the legs break; twists for sweeps
//       ├ attach_core └ core
//       ├ attach_head └ head
//       ├ attach_arm_r└ arm_r  (hinge at the shoulder)
//       └ attach_arm_l└ arm_l
//
// Gameplay finds parts by these names only. Swapping a part = hanging another part on the
// same attach point and scaling it to fit the slot box.
import * as THREE from 'three';
import { build } from './registry.js';
import { SLOTS } from '../data.js';
import { snugLayout } from './snugFit.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _tmp = new THREE.Box3();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

// Scale a part uniformly so it fits its slot box. The origin (hinge) stays on the attach point.
// A part may grow at most MAX_GROW so a small part does not balloon.
const MAX_GROW = 1.15;
const STACK_WIDE = 1.3;
export function fitToSlot(part, slot) {
  part.scale.setScalar(1);
  part.updateMatrixWorld(true);
  _inv.copy(part.matrixWorld).invert();
  _box.makeEmpty();
  part.traverse((o) => {
    if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _m.multiplyMatrices(_inv, o.matrixWorld);
      _box.union(_tmp.copy(o.geometry.boundingBox).applyMatrix4(_m));
    }
  });
  _box.getSize(_size);
  const [bx, by, bz] = SLOTS[slot].box;
  const s = Math.min(bx / Math.max(_size.x, 1e-6), by / Math.max(_size.y, 1e-6), bz / Math.max(_size.z, 1e-6));
  let fit = Math.min(s, MAX_GROW);
  // Legs and core are stacked: they must fill the slot's height or a gap opens between them.
  // They may be up to STACK_WIDE times wider or deeper than the slot box to do that.
  if (slot === 'legs' || slot === 'core') {
    const byHeight = by / Math.max(_size.y, 1e-6);
    fit = Math.min(byHeight, (STACK_WIDE * bx) / Math.max(_size.x, 1e-6), (STACK_WIDE * bz) / Math.max(_size.z, 1e-6));
  }
  part.scale.setScalar(fit);
  part.userData.fit = fit;
}

export function createRobotView(loadout, paints = {}) {
  const root = new THREE.Group();
  root.name = 'robot';
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const upper = new THREE.Group();
  upper.name = 'upper';
  body.add(upper);

  const attach = {};
  for (const slot of Object.keys(SLOTS)) {
    const a = new THREE.Group();
    a.name = `attach_${slot}`;
    a.position.fromArray(SLOTS[slot].attach);
    (slot === 'legs' ? body : upper).add(a);
    attach[slot] = a;
  }

  const view = {
    root,
    body,
    upper,
    attach,
    loadout: { ...loadout },
    paints: { ...paints },

    part(slot) {
      return attach[slot].getObjectByName(slot) || null;
    },
    node(slot, name) {
      const p = view.part(slot);
      return p ? p.getObjectByName(name) : null;
    },

    setPart(slot, partId, paint = view.paints[slot] || 'factory', layout = true) {
      const a = attach[slot];
      for (const c of [...a.children]) a.remove(c);
      const part = build(partId, { paint });
      part.name = slot;
      part.userData.partId = partId;
      a.add(part);
      fitToSlot(part, slot);
      view.loadout[slot] = partId;
      view.paints[slot] = paint;
      collectMaterials(part);
      if (layout) view.layout();
      return part;
    },

    // Seat every attached part snugly against its neighbours (see snugFit.js).
    layout() {
      view.fit = snugLayout(view);
      // Show the arms in their rest pose everywhere (the garage has no animation to do it).
      for (const slot of ['arm_r', 'arm_l']) {
        const a = view.part(slot);
        if (!a) continue;
        a.rotation.order = 'YXZ';
        a.rotation.set(a.userData.restPitch || 0, 0, a.userData.restRoll ?? 0);
      }
    },

    // Change a part's paint. Model parts swap the textures on their existing materials;
    // placeholders are rebuilt in the new colours.
    setPaint(slot, paint) {
      const p = view.part(slot);
      if (p && p.userData.repaint) {
        p.userData.repaint(paint);
        view.paints[slot] = paint;
      } else view.setPart(slot, view.loadout[slot], paint);
    },

    // Rebuild every part still attached (after switching greybox <-> models).
    rebuild() {
      for (const slot of Object.keys(SLOTS)) if (view.part(slot)) view.setPart(slot, view.loadout[slot], view.paints[slot], false);
      view.layout();
    },

    // Take a part off the robot, keeping where it is in the world (for flying debris).
    detach(slot) {
      const p = view.part(slot);
      if (!p) return null;
      p.updateMatrixWorld(true);
      const m = p.matrixWorld.clone();
      p.parent.remove(p);
      m.decompose(p.position, p.quaternion, p.scale);
      return p;
    },

    // Colour flash to show a state. amount 0 = off.
    tint(slot, color, amount) {
      const p = view.part(slot);
      if (!p) return;
      for (const mat of p.userData.mats) {
        if (mat.userData.glow) continue;
        mat.emissive.setHex(color);
        mat.emissiveIntensity = amount;
      }
    },
    tintAll(color, amount) {
      for (const slot of Object.keys(SLOTS)) view.tint(slot, color, amount);
    },
    eyes(on) {
      for (const slot of ['head', 'core']) {
        const p = view.part(slot);
        if (!p) continue;
        const glow = p.userData.mats.filter((m) => m.userData.glow);
        for (const mat of glow) mat.emissiveIntensity = on ? 0.9 : 0.0;
        // Models have no separate eye material: darken the whole head instead.
        if (!glow.length && slot === 'head') for (const mat of p.userData.mats) mat.color.setScalar(on ? 1 : 0.35);
      }
    },
  };

  for (const slot of Object.keys(SLOTS)) view.setPart(slot, loadout[slot], paints[slot] || 'factory', false);
  view.layout();
  return view;
}

function collectMaterials(part) {
  const mats = new Set();
  part.traverse((o) => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  part.userData.mats = [...mats];
}
