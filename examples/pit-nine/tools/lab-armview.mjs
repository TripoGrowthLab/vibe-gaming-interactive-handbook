// Close-ups of one frame with the arm vertices that are inside the body marked in red (front, 3/4, armpit views).
import { chromium } from 'playwright-core';
const [state, time] = [process.argv[2], +process.argv[3]];
const useTable = process.argv[4] === "fix";
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const table = useTable ? JSON.parse((await import('node:fs')).readFileSync('public/assets/player_armfix.json'))[state] : null;
const r = await page.evaluate(async ([state, time, table]) => {
  const { THREE, scene, armfix } = lab;
  lab.clear();
  await lab.models.loadStyle('arcade', ['player']);
  const t = lab.models.modelInfo.templates.arcade.player;
  const inst = lab.SkeletonUtils.clone(t.root);
  scene.add(inst);
  let mesh;
  inst.traverse((o) => o.isSkinnedMesh && (mesh = o));
  const bones = { left: inst.getObjectByName(armfix.ARM_BONES.left.upper), right: inst.getObjectByName(armfix.ARM_BONES.right.upper) };
  const ctx = armfix.prepareArmCheck(mesh);
  inst.updateMatrixWorld(true);
  const rootInv = inst.matrixWorld.clone().invert();
  mesh.skeleton.pose();
  inst.updateMatrixWorld(true);
  armfix.skinAll(ctx, rootInv);
  armfix.takeBaseline(ctx);
  const cfg = lab.MODEL_CONFIG.player.clips[state];
  const clip = lab.matchClip(t.animations, cfg.match).clip;
  const mixer = new THREE.AnimationMixer(inst);
  const act = mixer.clipAction(clip);
  act.play();
  act.time = time;
  mixer.update(0);
  inst.updateMatrixWorld(true);
  const from = cfg.from ?? 0;
  const turns = table ? armfix.tableAt(table, time - from) : { left: null, right: null };
  armfix.applyArmTurn(bones, inst, turns.left, turns.right);
  inst.updateMatrixWorld(true);
  armfix.skinAll(ctx, rootInv);
  armfix.bodyBox(ctx);
  // mark inside vertices
  const pts = [];
  const p = new THREE.Vector3();
  const res = {};
  for (const side of ['left', 'right']) {
    const sh = new THREE.Vector3().setFromMatrixPosition(bones[side].matrixWorld).applyMatrix4(rootInv);
    res[side] = +(armfix.worstDepth(ctx, side, sh) * 1000).toFixed(1);
    for (const i of ctx.arms[side]) {
      if (ctx.baseline.has(i)) continue;
      p.fromArray(ctx.pos, i * 3);
      if (!ctx.bodyBox.containsPoint(p) || p.distanceTo(sh) < 0.07) continue;
      // reuse worstDepth's test on a single vertex by temporarily narrowing arms
      const save = ctx.arms[side];
      ctx.arms[side] = [i];
      const d = armfix.worstDepth(ctx, side, sh);
      ctx.arms[side] = save;
      if (d > 0.004) pts.push(p.clone().applyMatrix4(inst.matrixWorld));
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const dots = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ff0000', size: 6, sizeAttenuation: false, depthTest: false }));
  dots.renderOrder = 5;
  scene.add(dots);
  // see-through body so the marked points show
  lab.renderViews(new THREE.Vector3(0, 1.1, 0), 0.55, [
    { name: `${state} @ ${time}s  ${table ? 'WITH fix ' + JSON.stringify(turns) : 'no fix'}: front`, dir: [0, 0.1, 1] },
    { name: '3/4 left', dir: [0.8, 0.2, 0.7] },
    { name: 'side +X (left armpit)', dir: [1, 0.05, 0] },
    { name: 'side -X (right armpit)', dir: [-1, 0.05, 0] },
    { name: 'top', dir: [0, 1, 0.01] },
    { name: 'back 3/4', dir: [-0.6, 0.3, -0.8] },
  ]);
  return { res, marked: pts.length, turns };
}, [state, time, table]);
await page.screenshot({ path: `tools/out/arm-${state}-${time}${table ? '-fix' : ''}.png` });
console.log(JSON.stringify(r));
await browser.close();
