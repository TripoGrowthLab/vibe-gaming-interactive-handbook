// Embeds the built game in parent pages on other origins and drives the postMessage contract both ways.
// The game is served at its production address (https://handbook-snowdrift-dash.tripo.page/) from dist/;
// parent pages are served at trusted and untrusted origins. Every other request is blocked and reported.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const GAME = 'https://handbook-snowdrift-dash.tripo.page';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const report = [], errors = [], blocked = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, value, pass) => { report.push([name, value, pass]); };

const parentHtml = (origin, { early = false, sibling = false } = {}) => `<!doctype html><html><body style="margin:0;font:14px sans-serif">
<div style="padding:6px">Parent page on ${origin} <button>Greybox</button> <button>Tripo assets</button></div>
<iframe id="g" src="${GAME}/" style="width:640px;height:400px;border:0"></iframe>
${sibling ? `<iframe id="s" src="${origin}/sibling" style="width:10px;height:10px"></iframe>` : ''}
<script>
  window.log = [];
  const g = document.getElementById('g');
  addEventListener('message', (e) => log.push({ fromGame: e.source === g.contentWindow, origin: e.origin, data: e.data }));
  window.send = (msg) => g.contentWindow.postMessage(msg, '${GAME}');
  ${early ? `g.addEventListener('load', () => send({ v: 1, type: 'set-mode', mode: 'grey' }));` : ''}
</script></body></html>`;
const siblingHtml = `<!doctype html><script>
  // A same-origin sibling frame (not the game's parent) tries to switch the game.
  window.attack = () => parent.frames[0].postMessage({ v: 1, type: 'set-mode', mode: 'grey' }, '*');
</script>`;

// Real localhost / 127.0.0.1 parent pages (http, any port).
const parentServer = http.createServer((req, res) => {
  const origin = `http://${req.headers.host}`;
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(req.url.startsWith('/sibling') ? siblingHtml : parentHtml(origin));
});
// Free port chosen by the system (another app on this Mac uses 4340 on 127.0.0.1); verify both hosts reach us.
await new Promise((r) => parentServer.listen(0, '::', r));
const PORT = parentServer.address().port;
for (const h of ['localhost', '127.0.0.1']) {
  const body = await (await fetch(`http://${h}:${PORT}/handbook`)).text();
  if (!body.includes('Parent page on')) throw new Error(`http://${h}:${PORT} is not our parent server`);
}

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });

async function openParent(parentOrigin, opts = {}, viewport = { width: 700, height: 460 }) {
  const ctx = await browser.newContext({ viewport });
  // Block everything by default …
  await ctx.route('**/*', (route) => { blocked.push(route.request().url()); return route.abort('blockedbyclient'); });
  // … except the real local parent server …
  await ctx.route(new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${PORT}/`), (route) => route.continue());
  // … the fake parent pages …
  if (parentOrigin.startsWith('https://')) {
    await ctx.route(`${parentOrigin}/**`, (route) => route.fulfill({ contentType: 'text/html',
      body: new URL(route.request().url()).pathname.startsWith('/sibling') ? siblingHtml : parentHtml(parentOrigin, opts) }));
  }
  // … and the game, served from dist/ at its production origin (site root, plain files).
  await ctx.route(`${GAME}/**`, async (route) => {
    let path = new URL(route.request().url()).pathname;
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join('dist', path));
    try { route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    catch { blocked.push('404 ' + path); route.fulfill({ status: 404, body: 'not found' }); }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${parentOrigin}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${parentOrigin}] ${m.text()}`); });
  await page.goto(`${parentOrigin}/handbook`);
  const frame = () => page.frames().find((f) => f.url().startsWith(GAME));
  return { ctx, page, frame };
}
const log = (page) => page.evaluate(() => window.log);
async function waitMsg(page, pred, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const l = await log(page);
    const m = l.find(pred);
    if (m) return m;
    await sleep(50);
  }
  return null;
}
const gameMode = async (frame) => frame().evaluate(() => window.__game.getVisualMode());
const clear = (page) => page.evaluate(() => { window.log.length = 0; });

// ---------- 1. Trusted parent https://www.tripo3d.ai: full contract, both ways ----------
{
  const { ctx, page, frame } = await openParent('https://www.tripo3d.ai');
  const ready = await waitMsg(page, (m) => m.data?.type === 'ready');
  check('www.tripo3d.ai: game sends ready once it can switch', JSON.stringify(ready?.data), ready?.data?.v === 1 && ready.data.mode === 'real' && JSON.stringify(ready.data.modes) === '["grey","real"]');
  check('www.tripo3d.ai: ready comes from the game frame with the game origin', `${ready?.origin} fromGame=${ready?.fromGame}`, ready?.origin === GAME && ready.fromGame);
  check('ready.mode matches what the game shows', await gameMode(frame), (await gameMode(frame)) === 'model');
  await page.screenshot({ path: 'tools/shots/embed-real.png' });

  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'grey' }));
  let m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('page → grey: mode-changed grey, game shows greybox', `${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, m?.data?.mode === 'grey' && (await gameMode(frame)) === 'greybox');
  await page.screenshot({ path: 'tools/shots/embed-grey.png' });

  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'real' }));
  m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('page → real: mode-changed real, game shows models', `${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, m?.data?.mode === 'real' && (await gameMode(frame)) === 'model');

  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'real' }));
  m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('page → real again (already on screen): still confirms', JSON.stringify(m?.data), m?.data?.mode === 'real');

  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'banana' }));
  m = await waitMsg(page, (x) => x.data?.type === 'error' || x.data?.type === 'mode-changed');
  check('page → unknown mode: error, look unchanged', `${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, m?.data?.type === 'error' && (await gameMode(frame)) === 'model');

  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'launch-rockets' }));
  m = await waitMsg(page, (x) => x.data?.type === 'error');
  check('page → unknown type (v 1): error', JSON.stringify(m?.data), m?.data?.type === 'error');

  await clear(page);
  await page.evaluate(() => { send({ type: 'set-mode', mode: 'grey' }); send('set-mode grey'); send({ v: 2, type: 'set-mode', mode: 'grey' }); });
  await sleep(600);
  check('messages without v: 1 are ignored (no reply, no switch)', `${(await log(page)).length} replies, game=${await gameMode(frame)}`, (await log(page)).length === 0 && (await gameMode(frame)) === 'model');

  // Player switches inside the game: button, then M key.
  await clear(page);
  await frame().click('#btn-look');
  m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('player clicks the look button in the game → page hears mode-changed grey', `${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, m?.data?.mode === 'grey' && (await gameMode(frame)) === 'greybox');
  await clear(page);
  await frame().locator('body').press('KeyM');
  m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('player presses M in the game → page hears mode-changed real', `${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, m?.data?.mode === 'real' && (await gameMode(frame)) === 'model');

  // The game still plays inside the iframe.
  await frame().click('#btn-start');
  await sleep(1500);
  const run = await frame().evaluate(() => ({ s: __game.game.state, z: __game.game.p.z }));
  check('game plays inside the iframe', `${run.s}, ${run.z.toFixed(1)} m`, run.s === 'playing' && run.z > 5);
  await ctx.close();
}

// ---------- 2. set-mode sent before the game is ready is applied right after ready ----------
{
  const { ctx, page, frame } = await openParent('https://www.tripo3d.ai', { early: true });
  const ready = await waitMsg(page, (m) => m.data?.type === 'ready');
  const changed = await waitMsg(page, (m) => m.data?.type === 'mode-changed');
  const order = (await log(page)).map((x) => x.data?.type).join(' → ');
  check('early set-mode grey (before ready): ready, then mode-changed grey', `${order}; game=${await gameMode(frame)}`, !!ready && changed?.data?.mode === 'grey' && (await gameMode(frame)) === 'greybox');
  await ctx.close();
}

// ---------- 3. Other trusted parents ----------
for (const origin of ['https://tripo3d.ai', `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]) {
  const { ctx, page, frame } = await openParent(origin);
  const ready = await waitMsg(page, (m) => m.data?.type === 'ready');
  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'grey' }));
  const m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check(`${origin}: ready + switch to grey`, `ready=${JSON.stringify(ready?.data)} changed=${JSON.stringify(m?.data)} game=${await gameMode(frame)}`, ready?.data?.mode === 'real' && m?.data?.mode === 'grey' && (await gameMode(frame)) === 'greybox');
  await ctx.close();
}

// ---------- 4. Untrusted parents get nothing and cannot switch ----------
for (const origin of ['https://evil.example', 'https://www.tripo3d.ai.evil.example', 'https://tripo3d.ai.evil.example']) {
  const { ctx, page, frame } = await openParent(origin);
  await frame().waitForFunction(() => window.__game?.modelStatus.loaded.length === 8, null, { timeout: 30000 });
  await sleep(800);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'grey' }));
  await sleep(800);
  const l = await log(page);
  check(`untrusted ${origin}: no messages sent to it, set-mode ignored`, `${l.length} messages, game=${await gameMode(frame)}`, l.length === 0 && (await gameMode(frame)) === 'model');
  await ctx.close();
}

// ---------- 5. A sibling frame on a trusted origin (source is not the parent) is ignored ----------
{
  const { ctx, page, frame } = await openParent('https://www.tripo3d.ai', { sibling: true });
  await waitMsg(page, (m) => m.data?.type === 'ready');
  await clear(page);
  const sib = page.frames().find((f) => f.url().includes('/sibling'));
  await sib.evaluate(() => window.attack());
  await sleep(800);
  check('sibling frame on www.tripo3d.ai cannot switch the game', `${(await log(page)).length} messages, game=${await gameMode(frame)}`, (await log(page)).length === 0 && (await gameMode(frame)) === 'model');
  await ctx.close();
}

// ---------- 6. Phone-size parent: iframe with touch, switch still works ----------
{
  const { ctx, page, frame } = await openParent('https://www.tripo3d.ai', {}, { width: 390, height: 700 });
  await waitMsg(page, (m) => m.data?.type === 'ready');
  await clear(page);
  await page.evaluate(() => send({ v: 1, type: 'set-mode', mode: 'grey' }));
  const m = await waitMsg(page, (x) => x.data?.type === 'mode-changed');
  check('narrow parent: switch to grey', JSON.stringify(m?.data), m?.data?.mode === 'grey');
  await ctx.close();
}

await browser.close();
await new Promise((r) => parentServer.close(r));
const leaks = blocked.filter((u) => !u.startsWith('https://evil.example') && !u.includes('evil.example'));
check('no requests outside the game and parent origins', leaks.length ? leaks.join(', ') : 'none', leaks.length === 0);

console.log('\n==== EMBED RESULTS ====');
let fails = 0;
for (const [n, v, p] of report) { if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}: ${v}`); }
console.log(`\nConsole errors: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
console.log(fails ? `\n${fails} check(s) failed` : '\nAll embed checks passed');
process.exit(fails || errors.length ? 1 : 0);
