// Renders the rebuilt parts models (hound, Foreman) next to their placeholders, with a marker on every hinge, and counts draw calls.
import { chromium } from 'playwright-core';
const style = process.argv[2] || 'arcade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const t0 = Date.now();
const info = await page.evaluate(async (style) => {
  const t = performance.now();
  await lab.models.loadStyle(style);
  return { ms: Math.round(performance.now() - t), failures: lab.models.modelInfo.failures };
}, style);
console.log('loaded', style, 'in', info.ms, 'ms', 'failures', JSON.stringify(info.failures));
for (const id of ['foreman', 'hound']) {
  const out = await page.evaluate(async ([id, style]) => {
    const { THREE, scene, renderer } = lab;
    lab.clear();
    const v = lab.models.modelView(id, style);
    const ph = lab.createView(id).root;
    const size = id === 'foreman' ? 7.6 : 1.4;
    v.root.position.x = -size * 0.62;
    ph.position.x = size * 0.62;
    scene.add(v.root, ph);
    // hinge markers
    const names = Object.keys(v.parts).filter((n) => n !== id);
    for (const r of [v.root, ph]) {
      r.updateMatrixWorld(true);
      for (const n of names) {
        const o = r.getObjectByName(n);
        if (!o) continue;
        const s = new THREE.Mesh(new THREE.SphereGeometry(size * 0.02), new THREE.MeshBasicMaterial({ color: '#ff00ff', depthTest: false }));
        s.renderOrder = 10;
        s.position.setFromMatrixPosition(o.matrixWorld);
        scene.add(s);
      }
    }
    renderer.info.reset();
    renderer.info.autoReset = false;
    lab.renderViews(new THREE.Vector3(0, size * 0.45, 0), size * 1.15, [
      { name: `${id} (${style}) model left, placeholder right; magenta = hinges`, dir: [0, 0.25, 1] },
      { name: 'side +X', dir: [1, 0.25, 0] },
      { name: 'top', dir: [0, 1, 0.001] },
      { name: '3/4', dir: [0.8, 0.5, 0.9] },
    ]);
    let calls = 0;
    v.root.traverse((o) => o.isMesh && calls++);
    const atlas = lab.models.modelInfo.templates[style][id].atlas;
    return { parts: names, meshesInModel: calls, atlas: `${atlas.W}x${atlas.H}` };
  }, [id, style]);
  await page.screenshot({ path: `tools/out/built-${id}-${style}.png` });
  console.log(id, JSON.stringify(out));
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
