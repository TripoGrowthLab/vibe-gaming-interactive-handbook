// Boxes of a robot's greybox placeholder parts, in robot space (feet at the origin, facing +Z).
// Used to decide which unnamed model piece belongs to which part.
import * as THREE from 'three';
import { createRobotView } from './robotView.js';
import { stockLoadout, SLOTS } from '../data.js';
import { getMode, setMode } from './registry.js';

export const SUB_HINGES = ['leg_l', 'leg_r', 'tread_l', 'tread_r', 'skirt', 'drill_tip'];

export function placeholderTargets(robot) {
  // Always measure the greybox placeholders, whatever mode is showing.
  const was = getMode();
  setMode('greybox');
  const view = createRobotView(stockLoadout(robot));
  setMode(was);
  // Measure the placeholders at the size they were built (sized from the GDD), not fitted to
  // the slot boxes, so the matching never depends on the slot box numbers.
  // Also put every part back on its GDD attach point (the robot view seats parts snugly).
  for (const slot of ['head', 'core', 'arm_r', 'arm_l', 'legs']) {
    view.part(slot).scale.setScalar(1);
    view.attach[slot].position.fromArray(SLOTS[slot].attach);
  }
  view.root.updateMatrixWorld(true);
  const targets = [];
  for (const slot of ['head', 'core', 'arm_r', 'arm_l', 'legs']) {
    const part = view.part(slot);
    const subs = [];
    part.traverse((o) => SUB_HINGES.includes(o.name) && subs.push(o));
    for (const s of subs) {
      const b = new THREE.Box3().setFromObject(s);
      targets.push({ key: `${slot}/${s.name}`, min: b.min.toArray(), max: b.max.toArray() });
    }
    // The rest of the part (everything not inside a sub-hinge).
    const rest = new THREE.Box3();
    part.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== part; p = p.parent) if (SUB_HINGES.includes(p.name)) return;
      rest.union(new THREE.Box3().setFromObject(o));
    });
    if (!rest.isEmpty()) targets.push({ key: slot, min: rest.min.toArray(), max: rest.max.toArray() });
  }
  return targets;
}
