// Contact sheets for each of Tamsin's animations (frames across the clip, front + side), plus the hips path.
import { chromium } from 'playwright-core';
const only = process.argv[2];
const frames = +(process.argv[3] || 12);
const t0arg = process.argv[4] !== undefined ? +process.argv[4] : null;
const t1arg = process.argv[5] !== undefined ? +process.argv[5] : null;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const names = await page.evaluate(async () => {
  await lab.models.loadStyle('arcade', ['player', 'blaster']);
  return lab.models.modelInfo.templates.arcade.player.animations.map((a) => a.name);
});
for (const name of names) {
  if (only && !name.startsWith(only)) continue;
  const info = await page.evaluate(async ([name, frames, t0arg, t1arg]) => {
    const { THREE, scene, renderer } = lab;
    lab.clear();
    const t = lab.models.modelInfo.templates.arcade.player;
    const clip = t.animations.find((a) => a.name === name);
    const t0 = t0arg ?? 0, t1 = t1arg ?? clip.duration;
    const W = innerWidth, H = innerHeight;
    const cols = frames, rows = 2;
    const w = Math.floor(W / cols), h = Math.floor(H / rows);
    renderer.setScissorTest(true);
    renderer.setClearColor('#9aa0a8');
    renderer.clear();
    const labels = document.getElementById('labels');
    labels.innerHTML = '';
    const hips = [];
    const inst = lab.SkeletonUtils.clone(t.root);
    scene.add(inst);
    const mixer = new THREE.AnimationMixer(inst);
    const act = mixer.clipAction(clip);
    act.play();
    const hipBone = inst.getObjectByName('mixamorigHips') || inst.getObjectByName('mixamorig:Hips');
    // hips path over the whole clip
    for (let i = 0; i <= 60; i++) {
      mixer.setTime(t0 + ((t1 - t0) * i) / 60);
      inst.updateMatrixWorld(true);
      const p = new THREE.Vector3().setFromMatrixPosition(hipBone.matrixWorld);
      hips.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    }
    for (let f = 0; f < frames; f++) {
      const time = t0 + ((t1 - t0) * f) / Math.max(1, frames - 1);
      mixer.setTime(time);
      inst.updateMatrixWorld(true);
      for (let r = 0; r < rows; r++) {
        const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
        const dir = r === 0 ? new THREE.Vector3(0, 0.1, 1) : new THREE.Vector3(1, 0.1, 0);
        cam.position.set(0, 0.95, 0).addScaledVector(dir, 5.2);
        cam.lookAt(0, 0.8, 0);
        const x = f * w, y = H - (r + 1) * h;
        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
        renderer.render(scene, cam);
        if (r === 0) {
          const d = document.createElement('div');
          d.style.left = `${x + 3}px`;
          d.style.top = `2px`;
          d.style.fontSize = '12px';
          d.textContent = `${time.toFixed(2)}s`;
          labels.appendChild(d);
        }
      }
    }
    const d = document.createElement('div');
    d.style.left = '4px'; d.style.top = `${H - 22}px`; d.style.fontSize = '15px';
    d.textContent = `${name}  (${clip.duration.toFixed(2)} s)  top: front view, bottom: side view (+X)`;
    labels.appendChild(d);
    renderer.setScissorTest(false);
    const xs = hips.map((p) => p[0]), zs = hips.map((p) => p[2]), ys = hips.map((p) => p[1]);
    return { duration: clip.duration, hipsX: [Math.min(...xs), Math.max(...xs)], hipsY: [Math.min(...ys), Math.max(...ys)], hipsZ: [Math.min(...zs), Math.max(...zs)], hipsStart: hips[0], hipsEnd: hips[hips.length - 1] };
  }, [name, frames, t0arg, t1arg]);
  const file = `tools/out/anim-${name.split(':')[0]}${t0arg !== null ? `-${t0arg}-${t1arg}` : ''}.png`;
  await page.screenshot({ path: file });
  console.log(name.slice(0, 20), JSON.stringify(info));
}
await browser.close();
