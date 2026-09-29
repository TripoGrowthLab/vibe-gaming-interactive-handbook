// Renders the big pieces of a split model with their numbers, from several sides.
import { chromium } from 'playwright-core';
const [id, size, turn, minSize] = [process.argv[2], +process.argv[3], +(process.argv[4] || 0), +(process.argv[5] || 0.5)];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const views = [
  ['front', [0, 0.25, 1]], ['back', [0, 0.25, -1]], ['left(+X)', [1, 0.25, 0]], ['right(-X)', [-1, 0.25, 0]], ['top', [0, 1, 0.001]], ['frontleft34', [0.8, 0.5, 0.9]],
];
for (const [vn, dir] of views) {
  await page.evaluate(async ([id, size, turn, minSize, dir]) => {
    const { THREE, scene, renderer } = lab;
    lab.clear();
    if (!lab.cache) {
      const g = await lab.load(`/assets/${id}.glb`);
      const holder = new THREE.Group();
      g.scene.rotation.y = turn;
      holder.add(g.scene);
      holder.updateMatrixWorld(true);
      const s = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
      holder.scale.setScalar(size / Math.max(s.x, s.y, s.z));
      holder.updateMatrixWorld(true);
      let i = 0;
      holder.traverse((o) => {
        if (!o.isMesh) return;
        const b = lab.usedBox(o.geometry).clone().applyMatrix4(o.matrixWorld);
        const big = Math.max(...b.getSize(new THREE.Vector3()).toArray()) >= minSize;
        o.userData.big = big;
        o.userData.centre = b.getCenter(new THREE.Vector3());
        const hue = (i++ * 0.61803) % 1;
        o.material = new THREE.MeshStandardMaterial({ color: big ? new THREE.Color().setHSL(hue, 0.7, 0.55) : '#777777', side: THREE.DoubleSide });
      });
      lab.cache = holder;
    }
    scene.add(lab.cache);
    const box = new THREE.Box3().setFromObject(lab.cache);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 500);
    const d = new THREE.Vector3(...dir).normalize();
    cam.position.copy(c).addScaledVector(d, r * 3.6);
    if (Math.abs(d.y) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(c);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, cam);
    const labels = document.getElementById('labels');
    labels.innerHTML = '';
    const ray = new THREE.Raycaster();
    lab.cache.traverse((o) => {
      if (!o.isMesh || !o.userData.big) return;
      const p = o.userData.centre.clone().project(cam);
      // only label pieces whose centre area is visible from this side
      ray.setFromCamera(new THREE.Vector2(p.x, p.y), cam);
      const hit = ray.intersectObject(lab.cache, true)[0];
      if (!hit || hit.object !== o) return;
      const el = document.createElement('div');
      el.style.left = `${((p.x + 1) / 2) * innerWidth - 8}px`;
      el.style.top = `${((1 - p.y) / 2) * innerHeight - 8}px`;
      el.style.fontSize = '15px';
      el.textContent = o.name.replace('tripo_part_', '');
      labels.appendChild(el);
    });
    const t = document.createElement('div');
    t.style.left = '8px'; t.style.top = '8px'; t.style.fontSize = '22px';
    t.textContent = `${id} ${dir.join(',')}`;
    labels.appendChild(t);
  }, [id, size, turn, minSize, dir]);
  await page.screenshot({ path: `tools/out/label-${id}-${vn}.png` });
}
await browser.close();
