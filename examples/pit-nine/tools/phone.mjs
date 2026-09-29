// Phone check in the installed Google Chrome with phone emulation and real touch events (two fingers at once).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
await page.goto('http://localhost:4291/');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const st = () => page.evaluate(() => ({ x: +__game.player.pos.x.toFixed(2), z: +__game.player.pos.z.toFixed(2), shots: __game.stats.shots, rolls: __game.stats.rolls, state: __game.player.state, touchUI: document.body.classList.contains('touch'), rollBtn: getComputedStyle(document.getElementById('roll-btn')).display }));
const report = [];
const s0 = await st();
report.push(`touch UI on: ${s0.touchUI}, ROLL button display: ${s0.rollBtn}`);
// left thumb pushes the stick up for 1 s, right thumb aims down-right and fires
await touch('touchStart', [[90, 650, 1]]);
await touch('touchMove', [[90, 580, 1]]);
await touch('touchStart', [[90, 580, 1], [300, 650, 2]]);
await touch('touchMove', [[90, 580, 1], [340, 700, 2]]);
await page.waitForTimeout(400);
await page.screenshot({ path: 'tools/out/phone-sticks.png' });
await page.waitForTimeout(600);
const s1 = await st();
await touch('touchEnd', []);
report.push(`left stick up for 1 s: player z ${s0.z} → ${s1.z} (moved ${(s0.z - s1.z).toFixed(2)} m up the screen)`);
report.push(`right stick past half way: shots ${s0.shots} → ${s1.shots}`);
// roll button
const box = await page.locator('#roll-btn').boundingBox();
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(100);
const s2 = await st();
report.push(`tap ROLL: rolls ${s1.rolls} → ${s2.rolls}, state ${s2.state}`);
// how big is the player on this screen?
const size = await page.evaluate(() => {
  const THREE_V = __game.player.view.root.position.clone();
  const cam = __camera;
  const a = THREE_V.clone().project(cam);
  const b = THREE_V.clone().setX(THREE_V.x + 1.7).project(cam);
  return Math.abs(a.x - b.x) * innerWidth / 2;
});
report.push(`size of 1.7 m at the player (portrait, wave camera): ${size.toFixed(0)} CSS px`);
// boss camera size
const bossSize = await page.evaluate(() => {
  __game.phase = 'boss'; __game.spawnQueue = []; for (const h of __game.hounds) h.hp = 0, h.state = 'destroyed', h.view.root.visible = false; __game.hounds = []; __game.foreman.wake();
  return new Promise((r) => setTimeout(() => {
    const p = __game.player.view.root.position.clone();
    const a = p.clone().project(__camera), b = p.clone().setX(p.x + 1.7).project(__camera);
    r(Math.abs(a.x - b.x) * innerWidth / 2);
  }, 9000));
});
await page.screenshot({ path: 'tools/out/phone-boss.png' });
report.push(`size of 1.7 m at the player (portrait, boss camera): ${bossSize.toFixed(0)} CSS px`);
// restart button
await page.locator('#restart-btn').tap();
await page.waitForTimeout(200);
report.push(`tap Restart: ${JSON.stringify(await page.evaluate(() => ({ phase: __game.phase, foreman: __game.foreman.state })))}`);
// landscape
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'tools/out/phone-landscape.png' });
const landBoss = await page.evaluate(() => {
  __game.phase = 'boss'; __game.spawnQueue = []; for (const h of __game.hounds) h.state = 'destroyed', h.view.root.visible = false; __game.hounds = []; __game.foreman.wake();
  return new Promise((r) => setTimeout(() => {
    const p = __game.player.view.root.position.clone();
    const a = p.clone().project(__camera), b = p.clone().setX(p.x + 1.7).project(__camera);
    r(Math.abs(a.x - b.x) * innerWidth / 2);
  }, 14000));
});
await page.screenshot({ path: 'tools/out/phone-landscape-boss.png' });
report.push(`size of 1.7 m at the player (landscape, boss camera): ${landBoss.toFixed(0)} CSS px`);
console.log(report.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors or warnings');
await browser.close();
