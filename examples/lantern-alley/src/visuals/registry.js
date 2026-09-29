import * as THREE from 'three';
import { OBJECTS } from '../data/objects.js';
import { GreyCharacter, FoodVisual, dumpster, crate, trashCan, streetLamp, floor, wall } from './greybox.js';

// The only place that decides how an object looks.
// id -> builder(size) returning a Visual:
//   root: THREE.Object3D (faces +Z, feet/bottom at y = 0)
//   duration(anim) -> seconds, play(anim, {loop, timeScale}), update(dt, info),
//   hitFlash(), setOpacity(a), dispose()
// To use a 3D model, register a different builder for that id. Gameplay code never changes.
export const greyboxBuilders = {
  hero:        size => new GreyCharacter({ size, body: 0x1e88e5, head: 0xffcc99, accent: 0xffd23f }),
  thug_skinny: size => new GreyCharacter({ size, body: 0x8e44ad, head: 0xd9a066, accent: 0x222222 }),
  thug_kicker: size => new GreyCharacter({ size, body: 0x17a398, head: 0xd9a066, accent: 0xffd23f }),
  thug_fat:    size => new GreyCharacter({ size, body: 0x6d8b3a, head: 0xc98b5b, accent: 0x222222 }),
  thug_crusher: size => new GreyCharacter({ size, body: 0xa4161a, head: 0xb07a50, accent: 0x222222 }),
  boss:        size => new GreyCharacter({ size, body: 0x8b1e1e, head: 0xb5835a, accent: 0xcccccc }),
  dumpster, crate, trash_can: trashCan, street_lamp: streetLamp, floor, wall,
  food: size => new FoodVisual(size),
};

// 'models' uses a loaded 3D model where one exists, otherwise the greybox placeholder.
const modelBuilders = {};
let mode = 'greybox';

export function registerModelBuilders(map) { Object.assign(modelBuilders, map); }
export function setVisualMode(m) { mode = m; }
export function getVisualMode() { return mode; }

export function createVisual(id) {
  const build = (mode === 'models' && modelBuilders[id]) || greyboxBuilders[id];
  if (!build) throw new Error(`No visual registered for id "${id}"`);
  return withShadow(build(OBJECTS[id].size), id);
}

// Every character gets a soft round shadow under its feet.
const shadowGeo = new THREE.CircleGeometry(1, 24);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
function withShadow(visual, id) {
  if (['hero', 'thug_skinny', 'thug_kicker', 'thug_fat', 'thug_crusher', 'boss'].includes(id)) {
    const [w, , d] = OBJECTS[id].size;
    const s = new THREE.Mesh(shadowGeo, shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.01;
    s.scale.setScalar(Math.max(w, d) * 0.6);
    visual.root.add(s);
  }
  return visual;
}
