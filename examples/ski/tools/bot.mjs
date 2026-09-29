// Automated test: builds nothing itself — run `npm run build` first.
// Serves dist/ like the static host (tools/host.mjs, other domains blocked), drives the installed Google Chrome (no download) with playwright-core.
import { startHost, guard } from './host.mjs';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUNS = Number(process.env.RUNS ?? 3);
mkdirSync('tools/shots', { recursive: true });

const host = await startHost(4317);
const blockedAll = [];
const URL = host.url;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const errors = [];
const report = [];
const log = (...a) => { console.log(...a); };
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => ({ s: __game.game.state, paused: __game.game.paused, x: __game.game.p.x, z: __game.game.p.z, skier: __game.game.skier.state }));
async function waitFor(page, fn, timeout = 60000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(200);
  }
  return false;
}

const TRIPO = 'https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_ski_game';
// "Made with Tripo" link: visible or hidden as expected, and never overlapping the card, buttons or HUD.
async function linkCheck(page, tag, where, expectVisible) {
  const r = await page.evaluate(() => {
    const a = document.getElementById('made-with');
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0 ? null : b; };
    const lb = box(a);
    const others = ['.screen:not(.hidden) .card', '#btn-look', '#btn-pause', '#hud-left', '#toast']
      .map((q) => [q, box(document.querySelector(q))]).filter(([, b]) => b);
    const hit = lb ? others.filter(([, b]) => lb.left < b.right && lb.right > b.left && lb.top < b.bottom && lb.bottom > b.top).map(([q]) => q) : [];
    return { visible: !!lb, rect: lb && [Math.round(lb.left), Math.round(lb.top), Math.round(lb.width), Math.round(lb.height)], overlaps: hit,
      inViewport: !!lb && lb.left >= 0 && lb.top >= 0 && lb.right <= innerWidth && lb.bottom <= innerHeight,
      href: a.href, target: a.target, rel: a.rel, text: a.textContent.trim() };
  });
  const ok = r.visible === expectVisible && (!r.visible || (r.overlaps.length === 0 && r.inViewport)) && r.href === TRIPO && r.target === '_blank' && r.rel.includes('noopener');
  report.push([`${tag}: "Made with Tripo" on ${where} — ${expectVisible ? 'visible, overlaps nothing' : 'hidden'}`, `visible=${r.visible} rect=${JSON.stringify(r.rect)} overlaps=${JSON.stringify(r.overlaps)} target=${r.target}`, ok]);
  return r;
}

// Bot brain, runs inside the page. Tries candidate target x positions, simulates the real steering rules
// against the real hitboxes, and heads for the nearest target that stays clear.
const BOT = () => {
  const C = __game.CFG, world = __game.game.world, r = __game.game.r;
  const W = C.RUN_HALF_WIDTH - r - 0.05;
  const law = (x, vx, target) => {
    const e = target - x - (vx * Math.abs(vx)) / (2 * C.LAT_RETURN);
    return Math.abs(e) < 0.08 ? 0 : Math.sign(e);
  };
  const step = (s, steer, dt) => {
    if (steer) s.vx = Math.max(-C.LAT_MAX, Math.min(C.LAT_MAX, s.vx + steer * C.LAT_ACCEL * dt));
    else { const dv = C.LAT_RETURN * dt; s.vx = Math.abs(s.vx) <= dv ? 0 : s.vx - Math.sign(s.vx) * dv; }
    s.x = Math.max(-W, Math.min(W, s.x + s.vx * dt));
  };
  const firstHit = (snap, target, margin) => {
    const s = { x: snap.x, vx: snap.vx }, dt = 1 / 60;
    const T = Math.min(1.8, 60 / snap.speed);
    let z = snap.z;
    for (let t = 0; t < T; t += dt) {
      step(s, law(s.x, s.vx, target), dt);
      z += snap.speed * dt;
      if (world.collide(s.x, z, r + margin)) return t;
    }
    return Infinity;
  };
  const plan = (snap) => {
    for (const margin of [0.3, 0.12, 0]) {
      let best = null, bestCost = Infinity;
      for (let tx = -W; tx <= W + 1e-6; tx += 0.4) {
        if (firstHit(snap, tx, margin) !== Infinity) continue;
        const cost = Math.abs(tx - snap.x) + (Math.abs(tx) > W - 1 ? 2 : 0) + Math.abs(tx - (window.__bot.target ?? 0)) * 0.3;
        if (cost < bestCost) { bestCost = cost; best = tx; }
      }
      if (best !== null) return best;
    }
    let best = snap.x, late = -1; // everything hits: take the latest hit
    for (let tx = -W; tx <= W; tx += 0.4) { const h = firstHit(snap, tx, 0); if (h > late) { late = h; best = tx; } }
    return best;
  };
  window.__bot = { t: -1, target: 0, enabled: true };
  __game.game.controller = (snap) => {
    const b = window.__bot;
    if (!b.enabled) return 0;
    if (snap.time - b.t >= 0.05 || snap.time < b.t) { b.t = snap.time; b.target = plan(snap); }
    return law(snap.x, snap.vx, b.target);
  };
};

// ---------------- 1. Desktop ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  blockedAll.push(await guard(ctx, host.url));
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(URL);
  await page.waitForFunction(() => window.__game);
  await sleep(600);
  await page.screenshot({ path: 'tools/shots/desktop-title.png' });
  log('title state:', await state(page));
  await page.waitForFunction(() => __game.modelStatus.loaded.length + Object.keys(__game.modelStatus.failed).length >= 8, null, { timeout: 30000 });
  const ms = await page.evaluate(() => ({ ...__game.modelStatus, mode: __game.getVisualMode() }));
  const emb = await page.evaluate(() => ({ ...__game.embed, sent: __game.embed.sent.length }));
  report.push(['not in an iframe: embed bridge stays off, sends nothing', JSON.stringify(emb), emb.embedded === false && emb.sent === 0 && emb.parentOrigin === null]);
  report.push(['models: all 8 GLBs loaded, look = models', `loaded ${ms.loaded.length}/8, failed ${JSON.stringify(ms.failed)}, mode ${ms.mode}`, ms.loaded.length === 8 && ms.mode === 'model']);
  await page.keyboard.press('KeyM');
  const m1 = await page.evaluate(() => __game.getVisualMode());
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tools/shots/desktop-title-greybox.png' });
  await page.click('#btn-look');
  const m2 = await page.evaluate(() => __game.getVisualMode());
  report.push(['look switch: M key → greybox, button → models', `${m1} → ${m2}`, m1 === 'greybox' && m2 === 'model']);

  // Spawner check: every row keeps a free gap of >= 3 m between hitboxes inside the corridor.
  const gapCheck = await page.evaluate(() => {
    const g = __game.game, w = g.world, C = __game.CFG;
    let minGap = Infinity, rows = 0, worst = null;
    const types = {};
    for (let seed = 1; seed <= 5; seed++) {
      w.reset(0, seed);
      const seen = new Set();
      let t = 0, z = 0;
      while (z < 4000) {
        const speed = Math.min(C.SPEED_MAX, C.SPEED_START + C.SPEED_GAIN * t);
        z += speed / 30; t += 1 / 30;
        w.update(z, speed);
        const byRow = {};
        for (const o of w.obstacles) (byRow[o.rowIndex] ??= []).push(o);
        for (const [ri, list] of Object.entries(byRow)) {
          if (seen.has(ri)) continue;
          seen.add(ri); rows++;
          const iv = list.map((o) => { types[o.id] = (types[o.id] ?? 0) + 1; const hw = o.hitbox.type === 'circle' ? o.hitbox.r : o.hitbox.w / 2; return [o.x - hw, o.x + hw]; }).sort((a, b) => a[0] - b[0]);
          let cur = -C.RUN_HALF_WIDTH, big = 0;
          for (const [a, b] of iv) { big = Math.max(big, a - cur); cur = Math.max(cur, b); }
          big = Math.max(big, C.RUN_HALF_WIDTH - cur);
          if (big < minGap) { minGap = big; worst = { seed, row: ri, z: list[0].z }; }
        }
      }
    }
    g.toTitle();
    return { rows, minGap, worst, types };
  });
  log('spawner check:', JSON.stringify(gapCheck));
  report.push(['spawner: smallest free gap over ' + gapCheck.rows + ' rows (5 seeds, 4 km each)', gapCheck.minGap.toFixed(2) + ' m', gapCheck.minGap >= 3]);

  await linkCheck(page, 'desktop', 'title screen', true);
  // Clicking the link opens the exact URL in a new tab (the guard blocks it from loading) and the game keeps running.
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#made-with')]);
  await sleep(500);
  const popupReq = blockedAll.flat().find((u) => u.startsWith('https://studio.tripo3d.ai/'));
  report.push(['desktop: link opens the Tripo URL in a new tab, game tab unchanged', `new tab → ${popupReq}; game state ${(await state(page)).s}`, popupReq === TRIPO && (await state(page)).s === 'title']);
  await popup.close();
  blockedAll.forEach((l) => { const i = l.indexOf(popupReq); if (i >= 0) l.splice(i, 1); }); // expected, not a leak

  // Keyboard start + steering.
  await page.keyboard.press('Space');
  await sleep(300);
  const s0 = await state(page);
  await page.keyboard.down('ArrowLeft');
  await sleep(400);
  const s1 = await state(page);
  await page.screenshot({ path: 'tools/shots/desktop-carve.png' });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('KeyD');
  await sleep(700);
  const s2 = await state(page);
  await page.keyboard.up('KeyD');
  report.push(['desktop: Space starts the run', s0.s, s0.s === 'playing']);
  report.push(['desktop: ← moves Juno to screen-left (+X), state carve', `x ${s0.x.toFixed(2)} → ${s1.x.toFixed(2)}, ${s1.skier}`, s1.x > s0.x + 0.5 && s1.skier === 'carve']);
  report.push(['desktop: D moves Juno to screen-right (−X)', `x ${s1.x.toFixed(2)} → ${s2.x.toFixed(2)}`, s2.x < s1.x - 0.5]);
  await linkCheck(page, 'desktop', 'a run', false);
  await page.keyboard.press('KeyP');
  await sleep(200);
  await linkCheck(page, 'desktop', 'pause screen', true);
  const sp = await state(page);
  await sleep(400);
  const sp2 = await state(page);
  await page.keyboard.press('KeyP');
  report.push(['desktop: P pauses (distance frozen)', `paused=${sp.paused}, z ${sp.z.toFixed(1)} → ${sp2.z.toFixed(1)}`, sp.paused && Math.abs(sp2.z - sp.z) < 0.01]);

  // Frame pacing: drive the loop with synthetic 60 Hz and 120 Hz timestamps; the skier must advance evenly every frame.
  const pacing = await page.evaluate(() => {
    const G = __game; G.stopLoop();
    let t = 100000;
    const out = {};
    for (const hz of [60, 120, 144]) {
      G.game.toTitle(); G.game.start(); // fresh run: first obstacles are 45 m away, so 1 s never crashes
      const zs = [];
      G.frame(t += 1000);
      for (let i = 0; i < hz; i++) { t += 1000 / hz; G.frame(t); zs.push(G.game.skier.root.position.z); }
      const d = zs.slice(1).map((z, i) => z - zs[i]).slice(5);
      const speed = G.game.p.speed;
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      // Speed rises slowly, so compare each frame's step with the previous one (a hitch would show as a jump).
      const maxDev = Math.max(...d.slice(1).map((x, i) => Math.abs(x - d[i])));
      out[hz] = { state: G.game.state, meanStep: +mean.toFixed(4), expected: +(speed / hz).toFixed(4), maxDeviationPct: +(100 * maxDev / mean).toFixed(3) };
    }
    G.startLoop();
    return out;
  });
  log('pacing:', JSON.stringify(pacing));
  for (const hz of [60, 120, 144]) report.push([`pacing @${hz} Hz: per-frame movement deviation`, pacing[hz].maxDeviationPct + ' %', pacing[hz].maxDeviationPct < 1 && pacing[hz].state === 'playing']);

  // Bot plays full rounds; Space restarts between them.
  await page.evaluate(BOT);
  await page.evaluate(() => { __game.game.toTitle(); __game.game.events = []; __game.setTimeScale(4); });
  for (let run = 1; run <= RUNS; run++) {
    if (run > 1 || (await state(page)).s !== 'playing') {
      await page.keyboard.press('Space');
      await sleep(200);
    }
    const st = await state(page);
    const ok = await waitFor(page, () => {
      const g = __game.game;
      if (g.p.z > 3500 && window.__bot.enabled) window.__bot.enabled = false; // survived long enough: let it crash to test game over
      return g.state === 'gameover';
    }, 240000);
    const info = await page.evaluate(() => ({
      ev: __game.game.events.filter((e) => e.type === 'crash').at(-1),
      botEnabled: window.__bot.enabled,
      overVisible: !document.getElementById('screen-over').classList.contains('hidden'),
      overText: document.getElementById('over-dist').textContent,
    }));
    const e = info.ev;
    const who = info.botEnabled ? 'bot crashed' : 'bot survived 3500 m, then let go on purpose';
    log(`run ${run}: start z=${st.z.toFixed(1)} → ${who} into ${e?.id} at ${e?.distance} m, ${e?.time.toFixed(1)} s, ${(e?.speed * 3.6).toFixed(0)} km/h; game over screen: ${info.overVisible} (${info.overText})`);
    report.push([`round ${run} (bot): ${who}`, `${e?.distance} m, hit ${e?.id}, ${(e?.speed * 3.6).toFixed(0)} km/h`, ok && info.overVisible && st.s === 'playing' && st.z < 15]);
    if (run === 1) {
      await page.screenshot({ path: 'tools/shots/desktop-gameover.png' });
      await linkCheck(page, 'desktop', 'game-over screen', true);
      const busy = await page.evaluate(async () => {
        const r = __game.stage.renderer, info = () => ({ calls: r.info.render.calls, tris: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, obstacles: __game.game.world.obstacles.length, decor: __game.game.world.decor.length, fences: __game.game.world.fences.length });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const model = info();
        __game.setVisualMode('greybox');
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const grey = info();
        __game.setVisualMode('model');
        return { model, grey };
      });
      log('busy moment (after ' + e?.distance + ' m):', JSON.stringify(busy));
      report.push(['busiest moment, models: draw calls / triangles (incl. shadow pass)', `${busy.model.calls} calls, ${busy.model.tris} tris; ${busy.model.obstacles} obstacles + ${busy.model.decor} scenery trees + ${busy.model.fences} fences alive`, busy.model.calls < 60]);
      report.push(['busiest moment, greybox (for comparison)', `${busy.grey.calls} calls, ${busy.grey.tris} tris`, true]);
    }
    await page.evaluate(() => { window.__bot.enabled = true; window.__bot.t = -1; });
  }
  await page.evaluate(() => __game.setTimeScale(1));
  await page.keyboard.press('Space');
  await sleep(300);
  const sr = await state(page);
  report.push(['desktop: restart after game over', `${sr.s}, z=${sr.z.toFixed(1)}`, sr.s === 'playing' && sr.z < 15]);
  await page.evaluate(() => { __game.game.controller = null; });
  await sleep(1500);
  await page.screenshot({ path: 'tools/shots/desktop-play.png' });
  await ctx.close();
}

// ---------------- 2. Phone (touch) ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  blockedAll.push(await guard(ctx, host.url));
  const page = await ctx.newPage();
  watch(page, 'phone');
  await page.goto(URL);
  await page.waitForFunction(() => window.__game);
  await sleep(500);
  await page.screenshot({ path: 'tools/shots/phone-title.png' });
  await linkCheck(page, 'phone', 'title screen', true);
  const touchClass = await page.evaluate(() => document.body.classList.contains('touch'));
  await page.tap('#btn-start');
  await sleep(300);
  const s0 = await state(page);
  const cdp = await ctx.newCDPSession(page);
  const hold = async (x, ms) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 600, id: 1 }] });
    await sleep(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 600, id: 1 }] });
  await sleep(350);
  await page.screenshot({ path: 'tools/shots/phone-carve.png' });
  await sleep(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const s1 = await state(page);
  await hold(330, 700);
  const s2 = await state(page);
  report.push(['phone: body gets touch class (touch hints shown)', String(touchClass), touchClass]);
  report.push(['phone: tap Start begins run', s0.s, s0.s === 'playing']);
  report.push(['phone: hold left half → moves screen-left (+X)', `x ${s0.x.toFixed(2)} → ${s1.x.toFixed(2)}`, s1.x > s0.x + 0.5]);
  report.push(['phone: hold right half → moves screen-right (−X)', `x ${s1.x.toFixed(2)} → ${s2.x.toFixed(2)}`, s2.x < s1.x - 0.5]);
  await linkCheck(page, 'phone', 'a run', false);
  await page.tap('#btn-pause');
  await sleep(200);
  await linkCheck(page, 'phone', 'pause screen', true);
  const sp = await state(page);
  await page.tap('#btn-resume');
  await sleep(200);
  const sr = await state(page);
  report.push(['phone: pause button / resume', `paused ${sp.paused} → ${sr.paused}`, sp.paused && !sr.paused]);
  // Player size on a phone screen: projected height of Juno in CSS px.
  await page.waitForFunction(() => __game.getVisualMode() === 'model', null, { timeout: 30000 });
  const px = await page.evaluate(() => {
    // Real model size: box around Juno's skinned mesh in the current animation frame, projected to the screen.
    const root = __game.game.skier.root, cam = __game.stage.camera;
    const juno = root.getObjectByName('juno');
    const V = root.position.constructor;
    const min = new V(1e9, 1e9, 1e9), max = new V(-1e9, -1e9, -1e9), p = new V();
    juno.traverse((o) => { if (!o.isSkinnedMesh) return; for (let i = 0; i < o.geometry.attributes.position.count; i += 7) { o.getVertexPosition(i, p); p.applyMatrix4(o.matrixWorld); min.min(p); max.max(p); } });
    const a = new V((min.x + max.x) / 2, min.y, (min.z + max.z) / 2).project(cam), b = new V((min.x + max.x) / 2, max.y, (min.z + max.z) / 2).project(cam);
    return { px: Math.round(Math.abs(a.y - b.y) / 2 * innerHeight), heightM: +(max.y - min.y).toFixed(2) };
  });
  report.push(['phone: Juno model on-screen height (real skinned size)', `${px.px} px of 844 (${px.heightM} m tall in the ski crouch)`, px.px >= 40]);
  await page.screenshot({ path: 'tools/shots/phone-play.png' });
  const ok = await waitFor(page, () => __game.game.state === 'gameover', 60000); // no steering: crashes on its own
  await sleep(300);
  await page.screenshot({ path: 'tools/shots/phone-gameover.png' });
  await linkCheck(page, 'phone', 'game-over screen', true);
  await page.tap('#btn-retry');
  await sleep(300);
  const s3 = await state(page);
  report.push(['phone: crash → game over → tap Retry', `gameover=${ok}, then ${s3.s} z=${s3.z.toFixed(1)}`, ok && s3.s === 'playing' && s3.z < 15]);
  await ctx.close();
}

await browser.close();
await host.close();
const leaks = blockedAll.flat();
report.push(['static host: requests to other domains (blocked)', leaks.length ? leaks.join(', ') : 'none', leaks.length === 0]);
report.push(['static host: files served from the site root / missing (404)', `${host.log.served} served, 404: ${host.log.notFound.length ? host.log.notFound.join(', ') : 'none'}`, host.log.notFound.length === 0]);

console.log('\n==== RESULTS ====');
let fails = 0;
for (const [name, val, pass] of report) { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${val}`); }
console.log(`\nConsole errors/warnings: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails || errors.length ? 1 : 0);
