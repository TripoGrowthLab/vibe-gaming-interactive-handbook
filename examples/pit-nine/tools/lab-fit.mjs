// Compares the gameplay sizes (hit spheres, collision radii, muzzle points, gun height) with the real models.
// Reads the gameplay numbers from the source files; changes nothing.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const src = fs.readFileSync('src/foreman.js', 'utf8');
const HIT = process.env.HIT ? JSON.parse(process.env.HIT) : eval('(' + src.match(/const HIT = (\{[\s\S]*?\n\});/)[1] + ')');
const MUZZLE = src.match(/const MUZZLE = new THREE\.Vector3\(([^)]*)\)/)[1].split(',').map(Number);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const r = await page.evaluate(async ([HIT, MUZZLE]) => {
  const { THREE } = lab;
  const cfgMod = await import('/src/config.js');
  const { FOREMAN, HOUND, PLAYER, ARENA } = cfgMod;
  await lab.models.loadStyle('arcade');
  const out = {};
  // ---- Foreman parts vs hit spheres (in each part's own space)
  const f = lab.models.modelView('foreman');
  f.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  out.foreman = {};
  for (const [name, spheres] of Object.entries(HIT)) {
    const part = f.part(name);
    if (!part) { out.foreman[name] = 'no such part in the model view'; continue; }
    const inv = part.matrixWorld.clone().invert();
    const pts = [];
    part.traverse((o) => {
      if (!o.isMesh || (o !== part && o.parent !== part && o.parent?.name && o.parent !== part)) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i += 3) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv).clone());
    });
    const box = new THREE.Box3().setFromPoints(pts);
    const inside = pts.filter((p) => spheres.some((s) => p.distanceTo(new THREE.Vector3(s[0], s[1], s[2])) < s[3])).length;
    const centres = spheres.map((s) => (box.containsPoint(new THREE.Vector3(s[0], s[1], s[2])) ? 'in' : 'OUT'));
    out.foreman[name] = {
      modelBox: { min: box.min.toArray().map((x) => +x.toFixed(2)), max: box.max.toArray().map((x) => +x.toFixed(2)) },
      covered: `${Math.round((100 * inside) / pts.length)}% of the part's surface is inside its hit spheres`,
      sphereCentresInsidePart: centres.join(','),
    };
  }
  // do the hull's blocking spheres swallow other parts?
  const hull = f.part('hull');
  const hullS = HIT.hull.map((s) => new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(hull.matrixWorld));
  out.foreman.hullOverlap = {};
  for (const name of ['left_cannon', 'right_cannon', 'missile_pod', 'armour_plate', 'core']) {
    const p = f.part(name);
    const cs = HIT[name].map((s) => new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(p.matrixWorld));
    const inHull = cs.filter((c) => hullS.some((h, i) => c.distanceTo(h) < HIT.hull[i][3])).length;
    out.foreman.hullOverlap[name] = `${inHull}/${cs.length} of its hit-sphere centres sit inside the hull's blocking spheres`;
  }
  // cannon muzzles: gameplay muzzle point vs the real barrel tip
  for (const name of ['left_cannon', 'right_cannon']) {
    const p = f.part(name);
    let maxZ = -Infinity;
    p.children[0].geometry.computeBoundingBox();
    maxZ = p.children[0].geometry.boundingBox.max.z;
    out.foreman[name].muzzle = `gameplay muzzle ${MUZZLE[2]} m ahead of the hinge, real barrel tip ${maxZ.toFixed(2)} m`;
  }
  // footprint vs body radius
  let footR = 0;
  for (const leg of ['front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg']) {
    const p = f.part(leg);
    const b = new THREE.Box3().setFromObject(p);
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) footR = Math.max(footR, Math.hypot(x, z));
  }
  const fb = new THREE.Box3().setFromObject(f.root);
  out.foreman.footprint = `feet reach ${footR.toFixed(2)} m from its centre; characters are stopped at bodyRadius ${FOREMAN.bodyRadius} m; model is ${fb.getSize(v).toArray().map((x) => x.toFixed(2)).join(' x ')} m`;
  // ---- hound
  const h = lab.models.modelView('hound');
  const hb = new THREE.Box3().setFromObject(h.root);
  const hs = hb.getSize(new THREE.Vector3());
  out.hound = `model ${hs.x.toFixed(2)} wide x ${hs.y.toFixed(2)} tall x ${hs.z.toFixed(2)} long (nose at z=${hb.max.z.toFixed(2)}); gameplay hit/collision radius ${HOUND.radius} m, bolts hit below ${(HOUND.height + 0.4).toFixed(2)} m`;
  // ---- player
  const p = lab.models.modelView('player');
  p.setState('idle');
  for (let i = 0; i < 30; i++) p.update(1 / 60, {});
  p.root.updateMatrixWorld(true);
  const pb = new THREE.Box3().setFromObject(p.model.getObjectByProperty('isSkinnedMesh', true));
  const ls = p.model.getObjectByName('mixamorigLeftArm'), rs = p.model.getObjectByName('mixamorigRightArm');
  const sw = new THREE.Vector3().setFromMatrixPosition(ls.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(rs.matrixWorld));
  // gun muzzle while aiming
  const p2 = lab.models.modelView('player');
  for (let i = 0; i < 40; i++) p2.update(1 / 60, { shooting: true, speed: 0 });
  p2.root.updateMatrixWorld(true);
  const gb = new THREE.Box3().setFromObject(p2.gun);
  out.player = `height ${pb.getSize(v).y.toFixed(2)} m, shoulder joints ${sw.toFixed(2)} m apart (gameplay radius ${PLAYER.radius} m); aiming gun muzzle at height ${((gb.min.y + gb.max.y) / 2).toFixed(2)} m and ${gb.max.z.toFixed(2)} m ahead (bolts start at ${PLAYER.gunHeight} m high, 0.6 m ahead)`;
  // ---- props
  for (const id of ['crate', 'wall', 'repair_kit', 'missile', 'blaster']) {
    const b = new THREE.Box3().setFromObject(lab.models.modelView(id).root);
    out[id] = b.getSize(v).toArray().map((x) => x.toFixed(2)).join(' x ') + ' m (w x h x l)';
  }
  out.crate += `; gameplay collision box ${ARENA.crateSize} x ${ARENA.crateSize} m, blocks bolts below 1.5 m`;
  return out;
}, [HIT, MUZZLE]);
console.log(JSON.stringify(r, null, 1));
await browser.close();
