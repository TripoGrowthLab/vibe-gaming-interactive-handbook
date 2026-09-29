// Publish check: serves dist/ from the site root with a plain static file server (no Vite, no
// server code), blocks every request to another domain, and checks:
//  - every request the game makes is same-origin and under the site root, nothing fails
//  - all models load, no console errors
//  - the "Made with Tripo" link: exact URL, new tab, small, and not overlapping any game UI
//    (health bar, wave counter, look button, boss bar, combo counter, help text, touch controls)
//    on desktop and phone screens
//  - a full bot round plays to the end screen and restarts
// Run `npm run build` first.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4300, ORIGIN = `http://localhost:${PORT}`;
const TRIPO = 'https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_lantern_alley_game';
if (!existsSync('dist/index.html')) { console.error('dist/ is missing: run npm run build first'); process.exit(1); }
mkdirSync('tools/shots', { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: 'dist', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Every page gets: external requests blocked and recorded, failed responses and console errors recorded.
const external = [], failed = [], problems = [], requested = new Set();
async function newContext(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN + '/') || url.startsWith('data:') || url.startsWith('blob:')) { requested.add(url.replace(ORIGIN, '')); return route.continue(); }
    external.push(url);
    return route.abort('blockedbyclient');
  });
  ctx.on('page', p => {
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
    p.on('pageerror', e => problems.push(e.message));
    p.on('response', r => { if (r.url().startsWith(ORIGIN) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  });
  return ctx;
}

try {
  // 1. Loads from the root, same-origin only
  const ctx = await newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  const report = await page.evaluate(() => window.__modelsReady);
  ok(report.length === 10 && report.every(r => r.ok), `all ${report.length} models load from ./assets/ (${report.filter(r => !r.ok).map(r => r.file).join(', ') || 'none failed'})`);
  ok(await page.textContent('#look') === 'MODELS', 'the game switches to the models');

  // 2. The link
  const link = page.locator('#made-with');
  ok(await link.getAttribute('href') === TRIPO, 'link goes to the exact Tripo URL');
  ok(await link.getAttribute('target') === '_blank' && (await link.getAttribute('rel')).includes('noopener'), 'link opens in a new tab (target=_blank, rel=noopener)');
  ok(await link.textContent() === 'Made with Tripo', 'link text is "Made with Tripo"');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
  await popup.waitForLoadState('commit').catch(() => {});
  // (this test blocks other domains, so the new tab shows an error page; what matters is the URL it asked for)
  ok(popup.url() === TRIPO || external.includes(TRIPO), `clicking it opens a new tab that asks for the Tripo URL (${external.includes(TRIPO) ? 'requested ' + TRIPO : popup.url()})`);
  await popup.close();
  ok(await page.evaluate(() => document.activeElement?.id !== 'made-with'), 'after the click the link is not focused, so Enter restarts the game instead of reopening it');
  // Link opening a tab is navigation, not something the game loads: drop it from the external list.
  const gameExternal = () => external.filter(u => u !== TRIPO);
  await ctx.close();

  // 3. The link never overlaps the game UI, on desktop and phones
  const screens = [
    ['desktop 1280x720', { viewport: { width: 1280, height: 720 } }],
    ['desktop 1920x1080', { viewport: { width: 1920, height: 1080 } }],
    ['laptop 1440x900', { viewport: { width: 1440, height: 900 } }],
    ['phone landscape 844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['small phone landscape 667x375', { viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['phone portrait 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
    ['tablet 1024x768 touch', { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ];
  for (const [name, opts] of screens) {
    const c = await newContext(opts);
    const p = await c.newPage();
    await p.goto(ORIGIN + '/');
    await p.evaluate(() => window.__modelsReady);
    // Show everything that can appear at the top or bottom at once: the boss bar, a big combo
    // counter, a long wave label.
    const res = await p.evaluate(() => {
      document.getElementById('boss-bar').hidden = false;
      document.getElementById('wave').textContent = 'WAVE 4/4 · 12 LEFT';
      __game.hud.combo(17);
      __game.hud.combo = () => {}; __game.hud.update = () => {};    // keep the forced HUD while measuring
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const visible = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const link = document.getElementById('made-with');
      const L = rect(link);
      const others = ['hp', 'wave', 'look', 'boss-bar', 'combo', 'help', 'stick', 'buttons']
        .map(id => document.getElementById(id)).filter(el => el && visible(el)).map(el => ({ id: el.id, ...rect(el) }));
      const hit = others.filter(o => L.x < o.x + o.w && L.x + L.w > o.x && L.y < o.y + o.h && L.y + L.h > o.y).map(o => o.id);
      const inside = L.x >= 0 && L.y >= 0 && L.x + L.w <= innerWidth && L.y + L.h <= innerHeight;
      return { link: L, hit, inside, share: (L.w * L.h) / (innerWidth * innerHeight), checked: others.map(o => o.id), fontSize: getComputedStyle(link).fontSize };
    });
    await p.waitForTimeout(150);
    await p.screenshot({ path: `tools/shots/publish-${name.split(' ').slice(0, 2).join('-')}.png` });
    ok(res.inside && res.hit.length === 0 && res.share < 0.01,
      `${name}: link ${Math.round(res.link.w)}x${Math.round(res.link.h)} px at (${Math.round(res.link.x)}, ${Math.round(res.link.y)}), ${(res.share * 100).toFixed(2)}% of the screen, ` +
      `font ${res.fontSize}, overlaps ${res.hit.join(', ') || 'nothing'} (checked ${res.checked.join(', ')})`);
    await c.close();
  }

  // 4. A full bot round on the static build, then restart
  const bc = await newContext({ viewport: { width: 1280, height: 720 } });
  const bp = await bc.newPage();
  await bp.goto(ORIGIN + '/?bot=1&speed=4&seed=7919');
  await bp.evaluate(() => window.__modelsReady);
  const t0 = Date.now();
  while (!(await bp.evaluate(() => window.__botReport?.done))) {
    if (Date.now() - t0 > 8 * 60000) throw new Error('bot round timed out');
    await new Promise(r => setTimeout(r, 1500));
  }
  const rep = await bp.evaluate(() => window.__botReport);
  await bp.waitForSelector('#end', { state: 'visible', timeout: 10000 });
  await bp.keyboard.press('Enter');
  await bp.waitForTimeout(300);
  const after = await bp.evaluate(() => ({ wave: __game.wave, hp: __game.hero.hp }));
  ok(rep.done && after.wave === 0 && after.hp === 100, `bot plays a full round on the static build (${rep.result}, ${rep.heroHpLeft} hp left, ${Math.round((Date.now() - t0) / 1000)} s) and Enter restarts`);
  await bc.close();

  ok(gameExternal().length === 0, `no requests to other domains (${gameExternal().length ? gameExternal().join(', ') : 'none'})`);
  ok(failed.length === 0, `no failed requests (${failed.join(', ') || 'none'})`);
  const paths = [...requested].filter(u => !u.startsWith('data:') && !u.startsWith('blob:'));
  ok(paths.every(u => u === '/' || u.startsWith('/?') || u.startsWith('/assets/')), `every request is under the site root: ${[...new Set(paths.map(u => u.split('?')[0]))].sort().join(' ')}`);
  ok(problems.length === 0, `console: ${problems.length ? [...new Set(problems)].join(' | ') : 'no errors or warnings'}`);
} catch (e) {
  console.error('FAIL ', e.message); failures++;
} finally {
  await browser.close();
  server.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll publish checks passed');
  process.exitCode = failures ? 1 : 0;
}
