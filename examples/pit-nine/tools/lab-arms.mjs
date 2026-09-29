// Measures, for every frame of every animation stretch Tamsin uses, how deep her arms go inside her body
// (hips, belly, chest, head; T-pose = zero), works out how far to turn each upper arm outward to clear it,
// saves that table to public/assets/player_armfix.json and reports worst depth before / after per animation.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const only = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => console.log('page:', m.text()));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const out = await page.evaluate(async (only) => {
  const { THREE, scene, armfix } = lab;
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
  const baseline = armfix.takeBaseline(ctx);
  const info = { armVerts: { left: ctx.arms.left.length, right: ctx.arms.right.length }, bodyTris: ctx.bodyTris.length / 3, baselineInside: baseline };
  const mixer = new THREE.AnimationMixer(inst);
  const TOL = 0.004; // 4 mm counts as touching, not sinking in
  const shoulder = (side) => new THREE.Vector3().setFromMatrixPosition(bones[side].matrixWorld).applyMatrix4(rootInv);
  const results = {};
  const tables = {};
  for (const [state, cfg] of Object.entries(lab.MODEL_CONFIG.player.clips)) {
    if (only && state !== only) continue;
    const m = lab.matchClip(t.animations, cfg.match);
    if (!m) { results[state] = { missing: cfg.match }; continue; }
    const clip = m.clip;
    const from = cfg.from ?? 0, to = cfg.to ?? clip.duration;
    const step = to - from > 4 ? 0.1 : 1 / 20;
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.play();
    const base = new armfix.ArmBase(bones);
    const pose = (time, tL, tR) => {
      base.restore();
      act.time = time;
      mixer.update(0);
      base.save();
      inst.updateMatrixWorld(true);
      if (tL || tR) {
        armfix.applyArmTurn(bones, inst, tL, tR);
        inst.updateMatrixWorld(true);
      }
      armfix.skinAll(ctx, rootInv);
    };
    const info = { push: new THREE.Vector3(), lever: new THREE.Vector3() };
    const tab = { step, left: [], right: [] };
    let before = { left: 0, right: 0, at: {} }, after = { left: 0, right: 0 }, maxAng = { left: 0, right: 0 };
    const t0 = performance.now();
    for (let time = from; time <= to + 1e-6; time += step) {
      pose(time, 0, 0);
      armfix.bodyBox(ctx);
      const turn = { left: null, right: null };
      // before: both arms on the untouched pose
      pose(time, null, null);
      const axes = {};
      for (const side of ['left', 'right']) {
        const d0 = armfix.worstDepth(ctx, side, shoulder(side), 0.07, info);
        if (d0 > before[side]) (before[side] = d0), (before.at[side] = +time.toFixed(2));
        axes[side] = d0 > TOL && armfix.outwardAxis(info);
      }
      for (const side of ['left', 'right']) {
        if (!axes[side]) continue;
        // smallest turn about that axis that clears the body (binary search, up to 45 degrees)
        const a = axes[side].toArray().map((v) => +v.toFixed(3));
        let lo = 0, hi = 0.8;
        for (let it = 0; it < 7; it++) {
          const mid = (lo + hi) / 2;
          pose(time, side === 'left' ? [...a, mid] : turn.left, side === 'right' ? [...a, mid] : null);
          if (armfix.worstDepth(ctx, side, shoulder(side)) > TOL) lo = mid;
          else hi = mid;
        }
        turn[side] = [...a, +hi.toFixed(4)];
      }
      pose(time, turn.left, turn.right);
      for (const side of ['left', 'right']) {
        after[side] = Math.max(after[side], armfix.worstDepth(ctx, side, shoulder(side)));
        maxAng[side] = Math.max(maxAng[side], turn[side]?.[3] || 0);
      }
      tab.left.push(turn.left || [0, 0, 0, 0]);
      tab.right.push(turn.right || [0, 0, 0, 0]);
    }
    tables[state] = tab;
    results[state] = {
      clip: clip.name.slice(0, 30), match: m.how, frames: tab.left.length,
      worstBefore_mm: { left: +(before.left * 1000).toFixed(1), right: +(before.right * 1000).toFixed(1), at: before.at },
      worstAfter_mm: { left: +(after.left * 1000).toFixed(1), right: +(after.right * 1000).toFixed(1) },
      maxTurn_deg: { left: +((maxAng.left * 180) / Math.PI).toFixed(1), right: +((maxAng.right * 180) / Math.PI).toFixed(1) },
      seconds: +((performance.now() - t0) / 1000).toFixed(1),
    };
    console.log(state, JSON.stringify(results[state]));
  }
  return { info, results, tables };
}, only);
console.log(JSON.stringify(out.info));
fs.mkdirSync('tools/out/armfix', { recursive: true });
for (const [state, tab] of Object.entries(out.tables)) fs.writeFileSync(`tools/out/armfix/${state}.table.json`, JSON.stringify(tab));
for (const [state, res] of Object.entries(out.results)) fs.writeFileSync(`tools/out/armfix/${state}.report.json`, JSON.stringify(res));
await browser.close();
