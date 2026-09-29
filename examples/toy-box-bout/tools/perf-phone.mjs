// Draw calls, triangles and texture memory in a fight, on a phone-sized screen and on desktop.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const server = await preview({ preview: { port: 4187, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const [label, opts] of [['phone', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }], ['desktop', { viewport: { width: 1280, height: 720 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:4187/');
  await page.waitForFunction(() => window.__game.models, null, { timeout: 120000 });
  const loadS = (Date.now() - t0) / 1000;
  await page.click('#btn-start'); await page.waitForTimeout(400); await page.click('#btn-fight'); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const g = window.__game; const rr = g.renderer; rr.info.autoReset = false; rr.info.reset(); rr.render(g.scene, g.camera);
    const out = { calls: rr.info.render.calls, tris: rr.info.render.triangles }; rr.info.autoReset = true;
    const seen = new Set(); let bytes = 0; let normals = 0;
    g.scene.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (m.normalMap) normals++; for (const t of [m.map, m.roughnessMap, m.metalnessMap, m.normalMap]) { if (!t || seen.has(t)) continue; seen.add(t); bytes += (t.image?.width || 0) * (t.image?.height || 0) * 4 * 1.33; } } });
    return { ...out, textures: seen.size, mb: +(bytes / 1048576).toFixed(1), meshesWithNormalMaps: normals, fps: +(1000 / (g.frameTimes.reduce((a, b) => a + b, 0) / g.frameTimes.length * 1000)).toFixed(0) };
  });
  console.log(`${label}: models ready after ${loadS.toFixed(1)} s (local), fight: ${r.calls} draw calls incl. shadows, ${r.tris} triangles drawn incl. shadows, ${r.textures} textures = ${r.mb} MB, normal maps on ${r.meshesWithNormalMaps} meshes`);
  await page.screenshot({ path: `tools/out/perf-${label}.png` });
  await ctx.close();
}
await browser.close(); await new Promise((r) => server.httpServer.close(r));
