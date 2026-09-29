// Renders each model (scaled to its size, sitting on the ground, NOT rotated) next to its placeholder, from several sides.
import { chromium } from 'playwright-core';
const ids = { player: { h: 1.7 }, blaster: { l: 0.6 }, hound: { l: 1.4 }, foreman: { l: 7.6 }, crate: { l: 1.5 }, wall: { l: 6.3 }, repair_kit: { l: 0.5 }, missile: { l: 1.0 } };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
for (const [id, size] of Object.entries(ids)) {
  const info = await page.evaluate(async ([id, size]) => {
    const { THREE, scene } = lab;
    while (scene.children.length > 4) scene.remove(scene.children[4]);
    const g = await lab.load(`/assets/${id}.glb`);
    const m = g.scene;
    const box = new THREE.Box3().setFromObject(m);
    const s = box.getSize(new THREE.Vector3());
    const k = size.h ? size.h / s.y : size.l / Math.max(s.x, s.y, s.z);
    m.scale.setScalar(k);
    const ph = lab.createView(id).root;
    const pb = new THREE.Box3().setFromObject(ph);
    const gap = Math.max(s.x * k, pb.getSize(new THREE.Vector3()).x) * 0.65 + 0.2;
    m.position.x = -gap;
    ph.position.x = gap;
    scene.add(m, ph);
    // arrow = +Z (the way everything must face)
    const L = Math.max(s.x, s.y, s.z) * k;
    const ar = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0), L * 0.8, 0xff0000, L * 0.15, L * 0.08);
    scene.add(ar);
    const r = Math.max(L, gap * 2) * 0.75;
    lab.renderViews(new THREE.Vector3(0, s.y * k * 0.45, 0), r, [
      { name: `${id}: FRONT (camera on +Z looking back)  model left, placeholder right, red arrow = +Z`, dir: [0, 0.15, 1] },
      { name: 'RIGHT SIDE (camera on +X)', dir: [1, 0.15, 0] },
      { name: 'TOP (camera above, +Z down the screen)', dir: [0, 1, 0.001] },
      { name: '3/4 view', dir: [0.8, 0.5, 0.9] },
    ]);
    return { scale: k.toFixed(3), size: [s.x * k, s.y * k, s.z * k].map((v) => v.toFixed(2)) };
  }, [id, size]);
  await page.screenshot({ path: `tools/out/lab-${id}.png` });
  console.log(id, JSON.stringify(info));
}
await browser.close();
