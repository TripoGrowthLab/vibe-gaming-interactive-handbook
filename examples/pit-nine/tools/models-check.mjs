// With models on: busiest-moment cost (draw calls, triangles, texture memory) in both looks, and live switching
// of look / greybox mid-round after Foreman parts have broken off. Saves screenshots.
import { chromium } from 'playwright-core';
const vp = process.argv[2] === 'phone' ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } };
const tag = process.argv[2] === 'phone' ? 'phone' : 'desk';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const ctx = await browser.newContext(vp);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
await page.goto('http://localhost:4291/?manual');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const measure = () => page.evaluate(() => {
  let now = (window.__now ||= 0);
  for (let i = 0; i < 3; i++) (now += 1000 / 60), __frame(now);
  window.__now = now;
  const r = __renderer;
  r.info.autoReset = false;
  r.info.reset();
  __frame((window.__now += 1000 / 60));
  const calls = r.info.render.calls, tris = r.info.render.triangles;
  r.info.autoReset = true;
  // texture memory: every texture the GPU holds for this scene (RGBA + mipmaps)
  const seen = new Set();
  let bytes = 0;
  __game.scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
      const t = m[k];
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const im = t.image;
      if (im?.width) bytes += im.width * im.height * 4 * (t.generateMipmaps === false ? 1 : 4 / 3);
    }
  });
  return { calls, triangles: tris, textures: seen.size, textureMB: +(bytes / 1048576).toFixed(1), gpuTextures: r.info.memory.textures, geometries: r.info.memory.geometries };
});
// busiest moment: wave 2 - 4 hounds, sleeping Foreman, 3 repair kits
await page.evaluate(() => {
  const g = __game;
  g.phase = 'test'; g.spawnQueue = [];
  for (let i = 0; i < 4; i++) g.spawnHound(i);
  for (let i = 0; i < 3; i++) g.spawnKit(-4 + i * 4, 3);
});
const busyArcade = await measure();
await page.screenshot({ path: `tools/out/models-${tag}-arcade.png` });
await page.evaluate(() => __switchStyle());
await page.waitForFunction(() => __models.hasTemplate('player', 'mecha_pop'), null, { timeout: 60000 });
await page.waitForTimeout(300);
const busyPop = await measure();
await page.screenshot({ path: `tools/out/models-${tag}-mecha.png` });
// boss fight: wake the Foreman, break two parts, then switch looks and greybox and back
const swap = await page.evaluate(async () => {
  const g = __game;
  for (const h of g.hounds) h.hp = 0, h.state = 'destroyed', g.scene.remove(h.view.root);
  g.hounds = [];
  g.phase = 'boss';
  g.foreman.wake();
  let now = window.__now;
  for (let i = 0; i < 180; i++) (now += 1000 / 60), __frame(now);
  for (const n of ['left_cannon', 'missile_pod']) g.foreman.damagePart(n, 999, g);
  for (let i = 0; i < 120; i++) (now += 1000 / 60), __frame(now);
  const res = [];
  const check = (label) => res.push(`${label}: left_cannon part ${g.foreman.view.part('left_cannon') ? 'PRESENT' : 'gone'}, missile_pod ${g.foreman.view.part('missile_pod') ? 'PRESENT' : 'gone'}, right_cannon ${g.foreman.view.part('right_cannon') ? 'present' : 'MISSING'}, player is ${g.player.view.isModel ? 'model' : 'greybox'}`);
  check('after breaking, mecha pop models');
  await __toggleModels();
  for (let i = 0; i < 10; i++) (now += 1000 / 60), __frame(now);
  check('greybox');
  await __toggleModels();
  await __switchStyle();
  for (let i = 0; i < 10; i++) (now += 1000 / 60), __frame(now);
  check('models again, arcade');
  window.__now = now;
  return res;
});
await page.screenshot({ path: `tools/out/models-${tag}-boss-broken.png` });
const bossCost = await measure();
console.log(JSON.stringify({ busiestArcade: busyArcade, busiestMechaPop: busyPop, bossAfterSwaps: bossCost }, null, 1));
console.log(swap.join('\n'));
console.log('failures:', JSON.stringify(await page.evaluate(() => __models.modelInfo.failures)));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors or warnings');
await browser.close();
