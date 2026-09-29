// Crashes Juno into pine trees (head-on and off-centre) and measures, every frame, how much of her
// upper body is inside the tree's real branch shape (radius per 10 cm height band of the model).
import { startHost, guard } from './host.mjs';
import { chromium } from 'playwright-core';
const host = await startHost(4331);
const blockedAll = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
blockedAll.push(await guard(ctx0, host.url));
const page = await ctx0.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(host.url);
await page.waitForFunction(() => window.__game?.getVisualMode() === 'model', null, { timeout: 30000 });
await page.evaluate(() => {
  const tpl = __game.models.pine_tree.template;
  tpl.updateMatrixWorld(true);
  const prof = new Array(60).fill(0), v = tpl.position.clone();
  tpl.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const b = Math.min(59, Math.max(0, Math.floor(v.y * 10))); prof[b] = Math.max(prof[b], Math.hypot(v.x, v.z)); } });
  window.__prof = prof;
});
const offsets = (process.env.OFFSETS ?? '0,0.8,-0.8,1.4,-1.4').split(',').map(Number);
const results = [];
for (const off of offsets) {
  let got = null;
  for (let attempt = 0; attempt < 6 && !got; attempt++) {
    await page.evaluate(() => { __game.game.toTitle(); __game.game.start(); });
    // FORCE_X: move the next pine to this x (e.g. next to the fence) so edge cases are tested every time.
    if (process.env.FORCE_X) await page.evaluate((fx) => {
      const w = __game.game.world, g = __game.game;
      const t = w.obstacles.filter((o) => o.id === 'pine_tree' && o.z > g.p.z + 25).sort((a, b) => a.z - b.z)[0];
      // clear everything else near that row so only this pine can be hit
      for (const o of w.obstacles) if (o !== t && Math.abs(o.z - t.z) < 6) { o.z = -1e6; o.view.root.position.z = -1e6; }
      t.x = fx; t.view.root.position.x = fx;
    }, Number(process.env.FORCE_X));
    // Aim at the first pine ahead with a sideways offset; avoid everything else.
    await page.evaluate((off) => {
      const g = __game.game; let target = null;
      g.controller = (s) => {
        if (!target || target.z < s.z) {
          const t = s.obstacles.filter((o) => o.id === 'pine_tree' && o.z > s.z + 12).sort((a, b) => a.z - b.z)[0];
          target = t ? { x: t.x + off, z: t.z } : null;
        }
        if (!target) return 0;
        const e = target.x - s.x - (s.vx * Math.abs(s.vx)) / 90;
        return Math.abs(e) < 0.05 ? 0 : Math.sign(e);
      };
    }, off);
    await page.waitForFunction(() => __game.game.state !== 'playing', null, { timeout: 60000 });
    const hit = await page.evaluate(() => ({ id: __game.game.hitObstacle?.id, x: __game.game.hitObstacle?.x, px: __game.game.p.x }));
    if (hit.id !== 'pine_tree') continue;
    // Sample every rendered frame for 2 s after impact.
    got = await page.evaluate(async () => {
      const g = __game.game, o = g.hitObstacle, prof = window.__prof, juno = g.skier.root.getObjectByName('juno');
      let mesh; juno.traverse((m) => { if (m.isSkinnedMesh) mesh = m; });
      const v = mesh.position.clone(); let worstFrac = 0, worstDepth = 0, worstT = 0, frames = 0, fenceDepth = 0;
      const FENCE_IN = __game.CFG.RUN_HALF_WIDTH + 0.1 - 0.15; // inner face of the fence net
      const t0 = performance.now();
      while (performance.now() - t0 < 2000) {
        await new Promise((r) => requestAnimationFrame(r));
        frames++;
        let n = 0, inside = 0, depth = 0;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 3) {
          mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
          fenceDepth = Math.max(fenceDepth, Math.abs(v.x) - FENCE_IN);
          if (v.y < 0.6) continue;
          n++;
          const R = prof[Math.min(59, Math.floor(v.y * 10))];
          const d = Math.hypot(v.x - o.x, v.z - o.z);
          if (d < R) { inside++; depth = Math.max(depth, R - d); }
        }
        const frac = inside / n;
        if (frac > worstFrac) { worstFrac = frac; worstT = (performance.now() - t0) / 1000; }
        worstDepth = Math.max(worstDepth, depth);
      }
      return { frames, worstFrac: +(worstFrac * 100).toFixed(1), worstDepth: +worstDepth.toFixed(2), worstT: +worstT.toFixed(2), throughFenceM: +Math.max(0, fenceDepth).toFixed(2), impactGap: +(Math.hypot(g.p.x - o.x) ).toFixed(2) };
    });
    got.offset = off; if (process.env.FORCE_X) got.treeX = Number(process.env.FORCE_X);
    if (process.env.SHOT) await page.screenshot({ path: `tools/shots/pine-crash-${process.env.FORCE_X ?? 'rand'}-${off}.png` });
  }
  results.push(got ?? { offset: off, note: 'could not hit a pine' });
  console.log(JSON.stringify(results.at(-1)));
}
console.log('errors', errs);
await browser.close(); await host.close();
