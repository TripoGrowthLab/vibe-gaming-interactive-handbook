// Groups the pieces of the hound and the Foreman into parts, colours each part, and renders it next to the placeholder.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const cfg = {
  hound: { size: 1.4, turn: Math.PI / 2, parts: ['body', 'head', 'front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'] },
  foreman: { size: 7.6, turn: 0, parts: ['hull', 'left_cannon', 'right_cannon', 'missile_pod', 'armour_plate', 'front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'] },
};
const overrides = fs.existsSync('src/partsOverrides.json') ? JSON.parse(fs.readFileSync('src/partsOverrides.json')) : {};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
for (const [id, c] of Object.entries(cfg)) {
  const out = await page.evaluate(async ([id, c, ov]) => {
    const { THREE, scene } = lab;
    lab.clear();
    const g = await lab.load(`/assets/${id}.glb`);
    const holder = new THREE.Group();
    const m = g.scene;
    m.rotation.y = c.turn;
    holder.add(m);
    holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(holder);
    const s = box.getSize(new THREE.Vector3());
    holder.scale.setScalar(c.size / Math.max(s.x, s.y, s.z));
    holder.updateMatrixWorld(true);
    const ph = lab.createView(id).root;
    const { groups, report } = lab.matchParts(holder, ph, c.parts, ov[id] || {});
    const colors = ['#ff3b3b', '#3bff5a', '#3b7bff', '#ffd23b', '#ff3bff', '#3bffff', '#ff8a00', '#ffffff', '#8a3bff'];
    c.parts.forEach((p, i) => groups[p].forEach((mesh) => (mesh.material = new THREE.MeshStandardMaterial({ color: colors[i], side: THREE.DoubleSide }))));
    const phColors = {};
    c.parts.forEach((p, i) => ph.getObjectByName(p)?.traverse((o) => o.isMesh && (o.material = new THREE.MeshStandardMaterial({ color: colors[i] }))));
    box = new THREE.Box3().setFromObject(holder);
    const sz = box.getSize(new THREE.Vector3());
    const gap = sz.x * 0.62 + 0.2;
    holder.position.x = -gap;
    ph.position.x = gap;
    scene.add(holder, ph);
    lab.renderViews(new THREE.Vector3(0, sz.y * 0.45, 0), gap * 1.3, [
      { name: `${id}: FRONT  model (left) vs placeholder (right), same colour = same part`, dir: [0, 0.2, 1] },
      { name: 'RIGHT SIDE (+X)', dir: [1, 0.2, 0] },
      { name: 'TOP (+Z down)', dir: [0, 1, 0.001] },
      { name: 'BACK 3/4', dir: [-0.8, 0.6, -0.9] },
    ]);
    const counts = Object.fromEntries(c.parts.map((p) => [p, groups[p].length]));
    return { counts, legend: c.parts.map((p, i) => `${p}=${colors[i]}`).join(' '), report };
  }, [id, c, overrides]);
  await page.screenshot({ path: `tools/out/parts-${id}.png` });
  fs.writeFileSync(`tools/out/parts-${id}.json`, JSON.stringify(out.report, null, 1));
  console.log(id, JSON.stringify(out.counts), '\n ', out.legend);
}
await browser.close();
