// Publish check: the built game served like the real host (plain static files from the site root, no dev server),
// in Chrome with every other domain blocked. Logs every request, plays a little, switches look and greybox,
// and checks the "Made with Tripo" link at several screen sizes.
import { chromium } from 'playwright-core';
const BASE = 'http://localhost:4291/';
const LINK = 'https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_pit_nine_game';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] });
const report = [];
let problems = 0;
const bad = (m) => (problems++, report.push('PROBLEM: ' + m));

// 1. every request the game makes stays on the site, with relative paths
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`console ${m.type()}: ${m.text()}`));
  const t0 = Date.now();
  await page.goto(BASE + '?bot=clumsy&speed=2');
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  report.push(`game ready ${Date.now() - t0} ms after opening (local server)`);
  await page.waitForTimeout(8000);
  await page.click('#style-btn');
  await page.waitForFunction(() => window.__models.hasTemplate('player', 'mecha_pop'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.click('#model-btn');
  await page.waitForTimeout(800);
  await page.click('#model-btn');
  await page.click('#sound-btn');
  const soundLabel = await page.textContent('#sound-btn');
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => ({ phase: __game.phase, models: __models.modelsEnabled(), failures: __models.modelInfo.failures, t: +__game.time.toFixed(1) }));
  const offSite = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
  report.push(`requests: ${requests.length}, all from ${BASE}: ${offSite.length === 0}`);
  if (offSite.length) bad('requests to other places: ' + [...new Set(offSite)].join(', '));
  const files = [...new Set(requests.filter((u) => u.startsWith(BASE)).map((u) => u.replace(BASE, '/').split('?')[0]))].sort();
  report.push(`files fetched over the network (${files.length}): ` + files.join(' '));
  report.push(`blob: requests (textures unpacked from the GLB files inside the browser, not network): ${requests.filter((u) => u.startsWith('blob:')).length}`);
  report.push(`after play + look switch + greybox toggle: phase ${state.phase}, models on ${state.models}, game time ${state.t} s, sound button "${soundLabel}"`);
  if (state.failures.length) bad('model files failed: ' + JSON.stringify(state.failures));
  if (errors.length) bad([...new Set(errors)].join(' | '));
  else report.push('no failed requests, no page errors, no console errors or warnings');
  await page.close();
}

// 2. the Tripo link: right address, new tab, on screen, and not on top of anything else, at several screen sizes
const sizes = [
  ['desktop 1280x720', { width: 1280, height: 720 }],
  ['desktop 1920x1080', { width: 1920, height: 1080 }],
  ['phone portrait 390x844', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['phone landscape 844x390', { width: 844, height: 390, isMobile: true, hasTouch: true }],
  ['small phone portrait 360x640', { width: 360, height: 640, isMobile: true, hasTouch: true }],
  ['small phone landscape 640x360', { width: 640, height: 360, isMobile: true, hasTouch: true }],
];
for (const [name, vp] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  // check during the boss fight too, when the boss bars are up
  const info = await page.evaluate(() => {
    const g = __game;
    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const out = {};
    for (const phase of ['wave', 'boss']) {
      if (phase === 'boss') { g.phase = 'boss'; g.spawnQueue = []; g.foreman.wake(); }
      __game.render(0, 0.016, __camera);
      const link = document.getElementById('tripo-link');
      const L = rectOf(link);
      const others = ['hp', 'status', 'boss', 'style-btn', 'model-btn', 'sound-btn', 'restart-btn', 'roll-btn', 'help', 'controls', 'banner']
        .map((id) => document.getElementById(id))
        .filter((el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && (el.id !== 'banner' && el.id !== 'controls' || getComputedStyle(el).opacity !== '0'));
      const overlaps = others.filter((el) => { const o = rectOf(el); return L.x < o.r && L.r > o.x && L.y < o.b && L.b > o.y; }).map((el) => el.id);
      // every other HUD pair must be clear of each other too (text measured by its own width, not its box)
      const textRect = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, r: r.right, b: r.bottom } : rectOf(el); };
      const hudIds = ['hp', 'status', 'boss', 'buttons', 'roll-btn'];
      const vis = hudIds.map((id) => document.getElementById(id)).filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0);
      const hudOverlaps = [];
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i].id === 'status' ? textRect(vis[i]) : rectOf(vis[i]);
        const b = vis[j].id === 'status' ? textRect(vis[j]) : rectOf(vis[j]);
        if (a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y) hudOverlaps.push(`${vis[i].id}+${vis[j].id}`);
      }
      out[phase] = { rect: L, overlaps, hudOverlaps, inView: L.x >= 0 && L.y >= 0 && L.r <= innerWidth && L.b <= innerHeight, share: +((L.w * L.h) / (innerWidth * innerHeight) * 100).toFixed(2) };
    }
    const link = document.getElementById('tripo-link');
    return { ...out, href: link.href, target: link.target, rel: link.rel, text: link.textContent };
  });
  for (const phase of ['wave', 'boss']) {
    const p = info[phase];
    report.push(`${name} (${phase}): link at ${Math.round(p.rect.x)},${Math.round(p.rect.y)} size ${Math.round(p.rect.w)}x${Math.round(p.rect.h)} = ${p.share}% of the screen, on screen ${p.inView}, overlaps ${p.overlaps.join(',') || 'nothing'}`);
    if (!p.inView) bad(`${name} ${phase}: link is off screen`);
    if (p.overlaps.length) bad(`${name} ${phase}: link overlaps ${p.overlaps.join(',')}`);
    if (p.hudOverlaps.length) bad(`${name} ${phase}: HUD pieces overlap: ${p.hudOverlaps.join(', ')}`);
    else report.push(`${name} (${phase}): no two HUD pieces overlap`);
  }
  if (info.href !== LINK || info.target !== '_blank' || !info.rel.includes('noopener') || info.text !== 'Made with Tripo') bad(`${name}: link attributes ${JSON.stringify(info)}`);
  // clicking it opens a new tab that asks for the address (other domains are blocked here, so the tab itself errors)
  let opened = null;
  ctx.on('request', (r) => r.url().includes('tripo3d.ai') && (opened ||= r.url()));
  const pagesBefore = ctx.pages().length;
  if (vp.hasTouch) await page.tap('#tripo-link');
  else await page.click('#tripo-link');
  for (let i = 0; i < 50 && (!opened || ctx.pages().length <= pagesBefore); i++) await page.waitForTimeout(100);
  const newTab = ctx.pages().length > pagesBefore;
  const stillHere = page.url().startsWith(BASE);
  report.push(`${name}: clicking the link opened a new tab: ${newTab}, which asked for ${opened ? opened.slice(0, 70) + '…' : 'nothing'}; game tab still on the game: ${stillHere}`);
  if (opened !== LINK) bad(`${name}: new tab asked for ${opened}`);
  if (!newTab || !stillHere) bad(`${name}: link did not open in a new tab`);
  await page.screenshot({ path: `tools/out/publish-${name.split(' ').join('-')}.png` });
  await ctx.close();
}
console.log(report.join('\n'));
console.log(problems ? `\n${problems} PROBLEM(S)` : '\nall publish checks passed');
await browser.close();
