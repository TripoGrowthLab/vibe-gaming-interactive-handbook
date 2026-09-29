// Builds the game, serves it, and plays it in the Chrome already installed on this machine.
// Usage: npm run bot [-- rounds [models|greybox] [firstRound]]
// Round r uses seed r * 7919, so rounds can be split across several runs.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.error('Google Chrome not found at ' + CHROME); process.exit(1); }
const ROUNDS = Number(process.argv[2]) || 3;
const LOOK = process.argv[3] || 'models';
const FIRST = Number(process.argv[4]) || 1;
const PORT = 4179, URL = `http://localhost:${PORT}/`;
mkdirSync('tools/shots', { recursive: true });

execSync('npx vite build', { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader'] });
const problems = [];
const watch = (page, tag) => {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`[${tag}] page error: ${e.message}`));
};
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  // 1. Desktop: models, look switch, keyboard
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.enemies.length > 0, null, { timeout: 10000 });
  const report = await page.evaluate(() => window.__modelsReady);
  for (const r of report) ok(r.ok, `model ${r.file} loaded${r.ok ? '' : ': ' + r.error}`);
  ok(await page.textContent('#look') === 'MODELS', 'game switches to models when they are loaded');
  const kinds = await page.evaluate(() => [__game.hero, ...__game.enemies].map(f => f.visual.look));
  ok(kinds.every(k => k === 'model'), `characters use models (${[...new Set(kinds)].join(', ')})`);
  await page.click('#look');
  ok(await page.evaluate(() => __game.hero.visual.look) === 'greybox', 'button switches to greybox');
  await page.keyboard.press('KeyV');
  ok(await page.evaluate(() => __game.hero.visual.look) === 'model', 'V switches back to models');

  // Keyboard checks: stop enemies from taking attack turns so Volt is never hurt mid-test.
  await page.evaluate(() => { __game.turns.update = () => {}; });
  const x0 = await page.evaluate(() => __game.hero.pos.x);
  await page.keyboard.down('KeyD'); await wait(500); await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => __game.hero.pos.x);
  ok(x1 > x0 + 0.8, `D key walks right (x ${x0.toFixed(2)} -> ${x1.toFixed(2)})`);
  await page.keyboard.down('ArrowUp'); await wait(300); await page.keyboard.up('ArrowUp');
  ok(await page.evaluate(() => __game.hero.pos.z) < -0.4, 'Up arrow walks away from the camera');
  // Running: Shift + direction is faster than walking, and plays the run stand-in (walk clip, faster).
  const walkDist = x1 - x0;
  await page.evaluate(() => { __game.hero.pos.x = -6; });
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD'); await wait(250);
  const runInfo = await page.evaluate(() => ({ state: __game.hero.state, clip: __game.hero.visual.current?.getClip().name, rate: __game.hero.visual.current?.timeScale }));
  const r0 = await page.evaluate(() => __game.hero.pos.x);
  await wait(500);
  const r1 = await page.evaluate(() => __game.hero.pos.x);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
  ok(r1 - r0 > walkDist * 1.4, `Shift + D runs (${(r1 - r0).toFixed(2)} m in 0.5 s vs ${walkDist.toFixed(2)} m walking)`);
  const runFoot = await page.evaluate(() => __game.hero.visual.proto.footSpeed.run);
  ok(runInfo.state === 'run' && runInfo.clip === 'run' && Math.abs(runInfo.rate * runFoot - 5.6) < 0.3,
    `running plays the run clip, feet matching 5.6 m/s (${JSON.stringify(runInfo)}, clip feet ${runFoot?.toFixed(2)} m/s)`);
  // Combo: press J, then press J again during each attack; the press is queued and the next hit follows.
  const names = [];
  await page.keyboard.press('KeyJ');
  for (let i = 0; i < 3; i++) {
    const n = await page.waitForFunction(prev => __game.hero.attack && __game.hero.attack.name !== prev && __game.hero.attack.name,
      names[names.length - 1] ?? null, { timeout: 10000 }).then(h => h.jsonValue()).catch(() => null);
    if (!n) break;
    names.push(n);
    await wait(150);
    if (i < 2) await page.keyboard.press('KeyJ');
  }
  ok(names.join(' > ') === 'jab > cross > hook', `J during each attack plays the combo: ${names.join(' > ')}`);
  await page.waitForFunction(() => __game.hero.state !== 'attack', null, { timeout: 15000 });
  await page.keyboard.press('KeyK');
  ok(await page.waitForFunction(() => __game.hero.attack?.name === 'kick', null, { timeout: 2000 }).then(() => true, () => false), 'K kicks');
  await wait(900);
  await page.screenshot({ path: 'tools/shots/desktop-models.png' });
  await ctx.close();

  // 2. Bot plays full rounds
  const results = [];
  for (let r = FIRST; r < FIRST + ROUNDS; r++) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await c.newPage();
    watch(p, `bot${r}`);
    await p.goto(`${URL}?bot=1&speed=4&seed=${r * 7919}&look=${LOOK}`);
    await p.evaluate(() => window.__modelsReady);
    let shot = 0;
    const t0 = Date.now();
    while (!(await p.evaluate(() => window.__botReport?.done))) {
      if (Date.now() - t0 > 12 * 60000) throw new Error('bot round timed out');
      await wait(2000);
      if (r === 1 && shot < 8 && (Date.now() - t0) > shot * 6000) await p.screenshot({ path: `tools/shots/bot-${shot++}.png` });
    }
    const rep = await p.evaluate(() => window.__botReport);
    await p.waitForSelector('#end', { state: 'visible', timeout: 10000 }).catch(() => {});  // end screen appears
    await p.screenshot({ path: `tools/shots/end-${r}.png` });
    const endVisible = await p.isVisible('#end');
    await p.keyboard.press('Enter');
    await wait(300);
    const after = await p.evaluate(() => ({ wave: __game.wave, hp: __game.hero.hp, result: __game.result, end: !document.getElementById('end').hidden }));
    rep.endScreenShown = endVisible;
    rep.restartWorked = after.wave === 0 && after.hp === 100 && after.result === null && !after.end;
    results.push(rep);
    console.log(`\nRound ${r} (seed ${r * 7919}, ${((Date.now() - t0) / 1000).toFixed(0)} s real time):`, JSON.stringify(rep, null, 1));
    await c.close();
  }
  for (const [i, r] of results.entries()) {
    ok(r.maxEnemiesAttackingAtOnce <= 1, `round ${i + FIRST}: enemies take turns (max attacking at once = ${r.maxEnemiesAttackingAtOnce})`);
    ok(r.doubleHitViolations === 0, `round ${i + FIRST}: nobody hit again inside their invulnerability time`);
    ok(r.endScreenShown && r.restartWorked, `round ${i + FIRST}: end screen shown and Enter restarts`);
  }
  console.log(`\nBot won ${results.filter(r => r.result === 'win').length} of ${results.length} rounds (${LOOK})`);

  // 3. Phone (landscape, touch)
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  watch(mp, 'phone');
  await mp.goto(URL);
  await mp.waitForFunction(() => window.__game?.enemies.length > 0);
  await mp.evaluate(() => window.__modelsReady);
  ok(await mp.isVisible('#stick') && await mp.isVisible('#btn-punch') && await mp.isVisible('#btn-kick'), 'phone: joystick and buttons visible');
  ok(!(await mp.isVisible('#help')), 'phone: keyboard help hidden');
  const box = await mp.locator('#stick').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const hx0 = await mp.evaluate(() => __game.hero.pos.x);
  const cdp = await mctx.newCDPSession(mp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', cx, cy); await touch('touchMove', cx + 45, cy); await wait(600);
  const walkState = await mp.evaluate(() => __game.hero.state);
  await touch('touchEnd');
  const hx1 = await mp.evaluate(() => __game.hero.pos.x);
  ok(hx1 > hx0 + 0.8 && walkState === 'walk', `phone: dragging the joystick right walks right (x ${hx0.toFixed(2)} -> ${hx1.toFixed(2)}, ${walkState})`);
  await touch('touchStart', cx, cy); await touch('touchMove', cx - 70, cy); await wait(300);
  const runState = await mp.evaluate(() => ({ state: __game.hero.state, knobRun: document.getElementById('knob').classList.contains('run') }));
  await touch('touchEnd');
  ok(runState.state === 'run' && runState.knobRun, `phone: pushing the joystick to its edge runs (${JSON.stringify(runState)})`);
  await mp.tap('#btn-punch'); await wait(60);
  ok(await mp.evaluate(() => __game.hero.state === 'attack'), 'phone: PUNCH button attacks');
  await mp.waitForFunction(() => __game.hero.state !== 'attack', null, { timeout: 10000 });
  await mp.tap('#btn-kick'); await wait(60);
  ok(await mp.evaluate(() => __game.hero.attack?.name === 'kick'), 'phone: KICK button kicks');
  await wait(1000);
  await mp.screenshot({ path: 'tools/shots/phone.png' });
  // lose on purpose, then tap to restart
  await mp.evaluate(() => { __game.hero.hp = 0; __game.hero.takeHit({}); });
  await wait(4500);   // Volt falls, then the end screen shows 3.8 s after the knockout
  ok(await mp.isVisible('#end'), 'phone: end screen appears');
  await mp.tap('#end'); await wait(300);
  ok(await mp.evaluate(() => __game.hero.hp === 100 && __game.wave === 0), 'phone: tapping the end screen restarts');
  await mctx.close();
} catch (e) {
  console.error('FAIL ', e.message); process.exitCode = 1;
} finally {
  console.log(problems.length ? `\nConsole problems:\n${[...new Set(problems)].join('\n')}` : '\nConsole: no errors or warnings');
  await browser.close();
  server.kill();
}
