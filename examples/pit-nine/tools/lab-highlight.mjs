// Shows chosen pieces of a split model in colour (everything else faded), with their own texture colours on the right.
import { chromium } from 'playwright-core';
const [id, size, turn, list] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5].split(',')];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
await page.evaluate(async ([id, size, turn, list]) => {
  const { THREE, scene } = lab;
  lab.clear();
  const mk = async (tint) => {
    const g = await lab.load(`/assets/${id}.glb`);
    const holder = new THREE.Group();
    g.scene.rotation.y = turn;
    holder.add(g.scene);
    holder.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
    holder.scale.setScalar(size / Math.max(s.x, s.y, s.z));
    holder.traverse((o) => {
      if (!o.isMesh) return;
      const on = list.includes(o.name.replace('tripo_part_', ''));
      if (tint) o.material = new THREE.MeshStandardMaterial({ color: on ? '#ff2a2a' : '#dddddd', transparent: !on, opacity: on ? 1 : 0.15, side: THREE.DoubleSide });
      else o.visible = on;
    });
    return holder;
  };
  const a = await mk(true), b = await mk(false);
  a.position.x = -size * 0.6;
  b.position.x = size * 0.6;
  scene.add(a, b);
  lab.renderViews(new THREE.Vector3(0, size * 0.45, 0), size * 1.1, [
    { name: `${id} pieces ${list.join(',')}: front`, dir: [0, 0.3, 1] },
    { name: 'side +X', dir: [1, 0.3, 0] },
    { name: 'top', dir: [0, 1, 0.001] },
    { name: '3/4 front-left', dir: [0.8, 0.4, 0.9] },
  ]);
}, [id, size, turn, list]);
await page.screenshot({ path: `tools/out/hl-${id}-${list.join('_').slice(0, 40)}.png` });
await browser.close();
