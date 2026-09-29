// Browser test: builds nothing, serves dist/ with vite preview, opens the installed Google Chrome
// (no download), plays a full run with the bot, then checks phone layout and touch controls.
// Usage: npm run build && node tools/bot-test.mjs
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4179, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const BASE = 'http://127.0.0.1:4179/';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${label}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] page error: ${e.message}`));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------- desktop: full bot run ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(page, 'desktop');
    await page.goto(BASE);
    await page.waitForSelector('#btn-start');
    await sleep(800);
    await page.screenshot({ path: OUT + 'd1-title.png' });
    const gl = await page.evaluate(() => {
      const r = window.__game.renderer;
      const dbg = r.getContext().getExtension('WEBGL_debug_renderer_info');
      return dbg ? r.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log('WebGL renderer:', gl);
    // ---- models ----
    await page.waitForFunction(() => window.__game.models, null, { timeout: 60000 });
    const mr = await page.evaluate(() => window.__game.models);
    check('all model files loaded (4 robots + 4 props; paint files load when picked)', mr.failed.length === 0 && mr.loaded.length === 8, `${mr.loaded.length} loaded, failed: ${JSON.stringify(mr.failed)}`);
    await page.click('#btn-start');
    await sleep(800);
    await page.screenshot({ path: OUT + 'd2-garage.png' });
    // Parts are found by name, sub-hinges exist, and a skin switch only replaces textures.
    const names = await page.evaluate(() => {
      const v = window.__game.garageView;
      const slots = ['head', 'core', 'arm_r', 'arm_l', 'legs'];
      return { found: slots.filter((s) => v.part(s)), legs: ['leg_l', 'leg_r'].filter((n) => v.node('legs', n)), model: !!v.part('head').userData.repaint };
    });
    check('model parts found by name (5 slots + leg_l/leg_r)', names.found.length === 5 && names.legs.length === 2 && names.model, JSON.stringify(names));
    const before = await page.evaluate(() => {
      const m = window.__game.garageView.part('head').children.find((c) => c.isMesh);
      return { map: m.material.map.uuid, geo: m.geometry.uuid, mat: m.material.uuid };
    });
    await page.click('button.arrow[data-act="paint"][data-slot="head"][data-dir="1"]');
    // The Mecha Pop file downloads now; wait until the textures are on.
    const tPaint = Date.now();
    await page.waitForFunction(() => !document.getElementById('ui').classList.contains('paint-loading'), null, { timeout: 60000 });
    console.log(`Mecha Pop paint for Pipo downloaded and applied in ${((Date.now() - tPaint) / 1000).toFixed(1)} s`);
    const after = await page.evaluate(() => {
      const m = window.__game.garageView.part('head').children.find((c) => c.isMesh);
      return { map: m.material.map.uuid, geo: m.geometry.uuid, mat: m.material.uuid, paint: window.__game.save.paints.pipo_head };
    });
    check('skin switch replaces only the texture (same mesh, same material)', after.map !== before.map && after.geo === before.geo && after.mat === before.mat, `paint now ${after.paint}`);
    await page.screenshot({ path: OUT + 'd2b-garage-mechapop-head.png' });
    await page.click('button.arrow[data-act="paint"][data-slot="head"][data-dir="-1"]');
    // Manual play for a few seconds: walk with keys, punch, shoot, dash.
    await page.click('#btn-fight');
    // READY: nothing moves yet, so the picture must be perfectly still.
    const still = await page.evaluate(() => new Promise((res) => {
      const c = window.__game.camera;
      const dirs = [];
      const step = () => {
        dirs.push(c.getWorldDirection(c.position.clone()));
        if (dirs.length < 60 && window.__game.fight.phase === 'intro') requestAnimationFrame(step);
        else {
          let max = 0;
          for (let i = 1; i < dirs.length; i++) max = Math.max(max, dirs[i].angleTo(dirs[i - 1]));
          res({ frames: dirs.length, maxTurnDeg: +((max * 180) / Math.PI).toFixed(4) });
        }
      };
      requestAnimationFrame(step);
    }));
    check('screen still during READY (no flicker)', still.frames >= 30 && still.maxTurnDeg < 0.01, `${still.frames} frames, largest turn between frames ${still.maxTurnDeg}°`);
    await sleep(1500);
    // Keep the rival still so it cannot interrupt the control checks.
    await page.evaluate(() => (window.__game.fight.ai.update = () => window.__game.EMPTY_INPUT));
    const p0 = await page.evaluate(() => window.__game.fight.player.pos.toArray());
    await page.keyboard.down('KeyW');
    await sleep(700);
    await page.keyboard.up('KeyW');
    const p1 = await page.evaluate(() => window.__game.fight.player.pos.toArray());
    check('W walks the robot forward', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3, `moved ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2)} m`);
    await page.mouse.click(640, 400, { button: 'left' });
    await sleep(60);
    const sLeft = await page.evaluate(() => window.__game.fight.player.attack?.slot);
    check('left mouse button = left-arm attack', sLeft === 'arm_l', `attack slot ${sLeft}`);
    await sleep(500);
    await page.mouse.click(640, 400, { button: 'right' });
    await sleep(60);
    const sRight = await page.evaluate(() => window.__game.fight.player.attack?.slot);
    check('right mouse button = right-arm attack', sRight === 'arm_r', `attack slot ${sRight}`);
    await page.screenshot({ path: OUT + 'd3-fight.png' });
    await sleep(600);
    await page.keyboard.press('Space');
    await sleep(60);
    const sDash = await page.evaluate(() => window.__game.fight.player.state);
    check('Space = dash', sDash === 'dash', `state ${sDash}`);
    await page.keyboard.press('Escape');
    await sleep(200);
    check('Esc pauses', await page.evaluate(() => document.querySelector('#s-pause').classList.contains('on')));
    await page.click('#btn-resume');
    // Draw calls and texture memory while fighting with models.
    await sleep(300);
    const perf = await page.evaluate(() => {
      const r = window.__game.renderer;
      r.info.autoReset = false;
      r.info.reset();
      r.render(window.__game.scene, window.__game.camera);
      const calls = r.info.render.calls;
      const tris = r.info.render.triangles;
      r.info.autoReset = true;
      const seen = new Set();
      let bytes = 0;
      window.__game.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        for (const m of [].concat(o.material)) {
          for (const t of [m.map, m.roughnessMap, m.metalnessMap, m.normalMap]) {
            if (!t || seen.has(t)) continue;
            seen.add(t);
            bytes += (t.image?.width || 0) * (t.image?.height || 0) * 4 * 1.33;
          }
        }
      });
      return { calls, tris, textures: seen.size, mb: +(bytes / 1048576).toFixed(1) };
    });
    console.log(`fight with models (desktop): ${perf.calls} draw calls incl. shadow pass, ${perf.tris} triangles drawn, ${perf.textures} textures = ${perf.mb} MB`);
    // Greybox <-> models mid-fight: parts are rebuilt and still found by name.
    await page.keyboard.press('KeyG');
    await sleep(200);
    const g1 = await page.evaluate(() => ({ mode: window.__game.fight.player.view.part('head').userData.repaint ? 'model' : 'greybox', parts: ['head', 'core', 'arm_r', 'arm_l', 'legs'].filter((s) => window.__game.fight.player.view.part(s)).length }));
    await page.screenshot({ path: OUT + 'd4-fight-greybox.png' });
    await page.keyboard.press('KeyG');
    await sleep(200);
    const g2 = await page.evaluate(() => ({ mode: window.__game.fight.player.view.part('head').userData.repaint ? 'model' : 'greybox', parts: ['head', 'core', 'arm_r', 'arm_l', 'legs'].filter((s) => window.__game.fight.player.view.part(s)).length }));
    check('G switches greybox <-> models mid-fight', g1.mode === 'greybox' && g2.mode === 'model' && g1.parts === 5 && g2.parts === 5, `${JSON.stringify(g1)} -> ${JSON.stringify(g2)}`);
    const ft = await page.evaluate(() => {
      const f = window.__game.frameTimes;
      return (f.reduce((a, b) => a + b, 0) / f.length) * 1000;
    });
    console.log(`average frame time (headless Chrome): ${ft.toFixed(1)} ms`);
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(page, 'bot');
    await page.goto(BASE + '?bot=1&speed=6&debug=1');
    let shots = 0;
    const seenGarage = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60 * 1000) {
      const r = await page.evaluate(() => ({ done: window.__botReport?.done, screen: window.__game.screen, bouts: window.__botReport?.bouts.length }));
      if (r.done) break;
      if (r.screen === 'fight' && shots < 4 && Date.now() - t0 > 4000 * (shots + 1)) {
        await page.screenshot({ path: OUT + `b-fight-${shots++}.png` });
      }
      if (r.screen === 'garage' && r.bouts > 0 && !seenGarage.has(r.bouts)) {
        seenGarage.add(r.bouts);
        await page.screenshot({ path: OUT + `b-garage-after-${r.bouts}-fights.png` });
      }
      await sleep(250);
    }
    const rep = await page.evaluate(() => window.__botReport);
    fs.writeFileSync(OUT + 'bot-report.json', JSON.stringify(rep, null, 2));
    console.log('\nBOT RUN');
    for (const b of rep.bouts) {
      const hits = Object.entries(b.player.hits).map(([k, v]) => `${k} ${v.hits}x (${Math.round(v.damage)} dmg)`).join(', ');
      console.log(`  bout ${b.bout} vs ${b.rival} (try ${b.try}): ${b.won ? 'WON' : 'lost'} by ${b.reason} in ${b.timeUsed}s | hits: ${hits || 'none'} | broke rival: ${b.rivalStats.partsBroken.join(', ') || '-'} | lost own: ${b.player.partsBroken.join(', ') || '-'} | rival hits: ${Object.entries(b.rivalStats.hits).map(([k, v]) => `${k} ${v.hits}x`).join(', ') || 'none'}`);
    }
    rep.notes.forEach((n) => console.log('  note:', n));
    const gc = rep.garageChecks || [];
    const bad = gc.filter((c) => !c.ok);
    const cam = rep.camera || { samples: 0, blocked: 0 };
    const pct = (n) => `${(((n || 0) / Math.max(1, cam.samples)) * 100).toFixed(1)}%`;
    check('no toy block fills the camera view', cam.samples > 0 && (cam.blockInFace || 0) / cam.samples < 0.01, `camera within 0.25 m of a block in ${pct(cam.blockInFace)} of ${cam.samples} frames`);
    check('Pipo never fully hidden behind a block', (cam.fullyHidden || 0) / Math.max(1, cam.samples) < 0.01, `head and chest both hidden in ${pct(cam.fullyHidden)}; a block edge crosses the chest line in ${pct(cam.blocked)}, the hips line in ${pct(cam.hipsHidden)}; rival behind cover (intended) ${pct(cam.rivalBlocked)}`);
    check('Pipo on screen (feet and head)', cam.offscreen / Math.max(1, cam.samples) < 0.02, `feet or head off screen in ${pct(cam.offscreen)} of frames`);
    const snug = rep.snug || [];
    const worstSnug = Math.max(...snug.flatMap((s) => Object.values(s.gaps || {})));
    check('parts sit snugly after every garage swap (models)', snug.length >= 3 && worstSnug < 0.006, snug.map((s) => `bout ${s.bout} [${s.loadout.head}, ${s.loadout.arm_r}, ${s.loadout.arm_l}, ${s.loadout.legs}]: worst gap ${(Math.max(...Object.values(s.gaps)) * 1000).toFixed(1)} mm`).join('; '));
    const gaps = rep.gaps || {};
    const worst = Math.max(...Object.values(gaps));
    check('no gap between legs and core during fights (models)', Object.keys(gaps).length > 0 && worst < 0.015, Object.entries(gaps).map(([k, v]) => `${k}: ${(v * 100).toFixed(1)} cm`).join(', '));
    check('garage robot visible every time it was checked', gc.length > 0 && bad.length === 0, `${gc.length} checks over ${new Set(gc.map((c) => c.bout)).size} garage visits${bad.length ? '; failed: ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
    check('bot finished the run', rep.done);
    check('bot became champion', rep.champion);
    check('restart after champion returns to a fresh run', rep.restartOk);
    await page.close();
  }

  // ---------- real-time fight: the view must not wobble frame to frame ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(page, 'realtime');
    await page.goto(BASE + '?bot=1&speed=1');
    await page.waitForFunction(() => window.__game.screen === 'fight', null, { timeout: 90000 });
    await sleep(25000);
    const cam = await page.evaluate(() => window.__botReport.camera);
    check('camera never wobbles in a real-time fight (60 fps)', cam.samples > 600 && (cam.wobble || 0) / cam.samples < 0.005, `${cam.wobble || 0} of ${cam.samples} frames where the view turned 1° or more one way and straight back`);
    await page.close();
  }

  // ---------- phone: layout + touch controls ----------
  for (const [label, vp] of [['phone-landscape', { width: 844, height: 390 }], ['phone-portrait', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, label);
    await page.goto(BASE);
    await page.waitForSelector('#btn-start');
    await page.waitForFunction(() => window.__game.models, null, { timeout: 60000 });
    const overlapsTitle = () =>
      page.evaluate(() => {
        const a = document.querySelector('.screen.on button.lang')?.getBoundingClientRect();
        const b = document.querySelector('.screen.on .logo, .screen.on .gtitle')?.getBoundingClientRect();
        if (!a || !b) return 'missing';
        const o = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return o ? `overlaps (button ${a.top.toFixed(0)}-${a.bottom.toFixed(0)}, title ${b.top.toFixed(0)}-${b.bottom.toFixed(0)})` : 'clear';
      });
    await page.screenshot({ path: OUT + `${label}-title.png` });
    const t1 = await overlapsTitle();
    await page.tap('button.lang');
    await sleep(200);
    const t2 = await overlapsTitle();
    await page.tap('button.lang');
    check(`${label}: language button clear of the title (JA and EN)`, t1 === 'clear' && t2 === 'clear', `JA ${t1}, EN ${t2}`);
    await page.tap('#btn-start');
    await sleep(700);
    await page.screenshot({ path: OUT + `${label}-garage.png` });
    await page.tap('#btn-fight');
    await sleep(2000);
    await page.evaluate(() => (window.__game.fight.ai.update = () => window.__game.EMPTY_INPUT));
    const cdp = await ctx.newCDPSession(page);
    // Joystick: drag up from a point in the left half.
    const sx = vp.width * 0.2;
    const sy = vp.height * 0.75;
    const p0 = await page.evaluate(() => window.__game.fight.player.pos.toArray());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - i * 12 }] });
      await sleep(30);
    }
    await sleep(700);
    await page.screenshot({ path: OUT + `${label}-fight.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const p1 = await page.evaluate(() => window.__game.fight.player.pos.toArray());
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    check(`${label}: joystick moves the robot`, moved > 0.3, `moved ${moved.toFixed(2)} m`);
    await page.tap('.tb-r');
    await sleep(60);
    const s = await page.evaluate(() => window.__game.fight.player.attack?.slot);
    check(`${label}: R button attacks with the right arm`, s === 'arm_r', `slot ${s}`);
    // How big is Pipo on screen? (feet to top of head, as a share of screen height)
    const frac = await page.evaluate(() => {
      const { fight, camera } = window.__game;
      const a = fight.player.pos.clone();
      const b = a.clone();
      b.y += 0.5;
      a.project(camera);
      b.project(camera);
      const inView = [a, b].every((p) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1);
      return { frac: Math.abs(b.y - a.y) / 2, inView };
    });
    const px = frac.frac * vp.height;
    check(`${label}: Pipo fully on screen and big enough`, frac.inView && px > 70 && frac.frac < 0.6, `${frac.inView ? 'feet and head in view' : 'NOT fully in view'}, ${(frac.frac * 100).toFixed(0)}% of screen height = ${px.toFixed(0)} CSS px`);
    await sleep(600);
    await page.tap('.tb-pause');
    await sleep(200);
    check(`${label}: pause button works`, await page.evaluate(() => document.querySelector('#s-pause').classList.contains('on')));
    await ctx.close();
  }
} catch (e) {
  failures++;
  console.log('TEST CRASHED:', e);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(problems.length ? '\nCONSOLE PROBLEMS:\n' + problems.join('\n') : '\nno console errors or warnings');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures || problems.length ? 1 : 0);
