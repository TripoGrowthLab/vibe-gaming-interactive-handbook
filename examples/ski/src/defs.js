// Object table from GDD.md: size (W × H × D, metres), hitbox, and world facing.
// Every placeholder/model is built facing +Z; `yaw` turns it to its world facing.
// Hitboxes are ~15 % smaller than the visible object so near misses feel fair.
export const OBJECTS = {
  skier:      { size: [0.6, 1.7, 1.6], hitbox: { type: 'circle', r: 0.3 }, yaw: 0 },
  skis:       { size: [0.3, 0.1, 1.6] },
  pine_tree:  { size: [2.4, 5.0, 2.4], hitbox: { type: 'circle', r: 1.3 }, yaw: 0,       from: 0,   weight: 0.5 },
  boulder:    { size: [1.8, 1.2, 1.5], hitbox: { type: 'box', w: 1.5, d: 1.05 }, yaw: Math.PI, from: 0,   weight: 0.28 },
  log:        { size: [3.5, 0.6, 0.6], hitbox: { type: 'box', w: 3.0, d: 0.5 }, yaw: 0,       from: 200, weight: 0.12 },
  snowman:    { size: [1.0, 1.8, 1.0], hitbox: { type: 'circle', r: 0.4 }, yaw: Math.PI, from: 400, weight: 0.1 },
  lift_pylon: { size: [1.2, 7.0, 1.2], hitbox: { type: 'box', w: 1.3, d: 1.1 }, yaw: 0,       from: 600, weight: 0.05, maxPerRow: 1 },
  edge_fence: { size: [4.0, 1.2, 0.1] },
};

export const OBSTACLE_IDS = ['pine_tree', 'boulder', 'log', 'snowman', 'lift_pylon'];

export function halfWidthX(hitbox) {
  return hitbox.type === 'circle' ? hitbox.r : hitbox.w / 2;
}
export function halfDepthZ(hitbox) {
  return hitbox.type === 'circle' ? hitbox.r : hitbox.d / 2;
}
