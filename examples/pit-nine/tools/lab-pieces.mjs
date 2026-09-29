// Lists every piece of a split model in metres (after turning to +Z and scaling), with its average texture colour.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [id, size, turn] = [process.argv[2], +process.argv[3], +(process.argv[4] || 0)];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const rows = await page.evaluate(async ([id, size, turn]) => {
  const { THREE } = lab;
  const g = await lab.load(`/assets/${id}.glb`);
  const holder = new THREE.Group();
  g.scene.rotation.y = turn;
  holder.add(g.scene);
  holder.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  holder.scale.setScalar(size / Math.max(s.x, s.y, s.z));
  holder.updateMatrixWorld(true);
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const out = [];
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const b = lab.usedBox(o.geometry).clone().applyMatrix4(o.matrixWorld);
    const c = b.getCenter(new THREE.Vector3()), z = b.getSize(new THREE.Vector3());
    let col = '';
    const img = o.material.map?.image;
    if (img) {
      cv.width = cv.height = 8;
      cx.drawImage(img, 0, 0, 8, 8);
      const d = cx.getImageData(0, 0, 8, 8).data;
      let r = 0, gg = 0, bb = 0;
      for (let i = 0; i < d.length; i += 4) (r += d[i]), (gg += d[i + 1]), (bb += d[i + 2]);
      col = '#' + [r, gg, bb].map((v) => Math.round(v / 64).toString(16).padStart(2, '0')).join('');
    }
    let tris = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    out.push({ name: o.name, c: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), size: [z.x, z.y, z.z].map((v) => +v.toFixed(2)), col, tris });
  });
  return out;
}, [id, size, turn]);
fs.writeFileSync(`tools/out/pieces-${id}.json`, JSON.stringify(rows));
rows.sort((a, b) => b.c[1] - a.c[1]);
for (const r of rows) console.log(`${r.name.padEnd(15)} centre ${r.c.map((v) => v.toFixed(2).padStart(6)).join(' ')}  size ${r.size.map((v) => v.toFixed(2).padStart(5)).join(' ')}  ${r.col}  ${r.tris}`);
await browser.close();
