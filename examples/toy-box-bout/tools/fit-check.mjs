// Assembles every core x legs x arm combination (models and greybox) and reports how well the
// parts fit: gaps at each joint, and how deep arms sink into the legs at rest and while walking.
// Usage: node tools/fit-check.mjs
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { port: 4191, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4191/tools/viewer/fitcheck.html');
await page.waitForFunction(() => window.__done, null, { timeout: 600000 });
const rows = await page.evaluate(() => window.__rows);
await browser.close();
await server.close();
let failures = 0;
for (const mode of ['model', 'greybox']) {
  const rs = rows.filter((r) => r.mode === mode);
  const worst = (f) => rs.reduce((a, r) => (f(r) > f(a) ? r : a));
  const rest = (r) => Math.max(r.burial.arm_r?.rest || 0, r.burial.arm_l?.rest || 0);
  const walk = (r) => Math.max(r.burial.arm_r?.walk || 0, r.burial.arm_l?.walk || 0);
  const gap = (r) => Math.max(...Object.values(r.gaps));
  const wr = worst(rest), ww = worst(walk), wg = worst(gap);
  const bad = rs.filter((r) => rest(r) > 0.003);
  const times = rs.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${mode}: ${rs.length} combinations; building a robot takes ${times[Math.floor(times.length / 2)].toFixed(0)} ms typically, ${times[times.length - 1].toFixed(0)} ms at most (first build of each part includes measuring it)`);
  console.log(`  worst arm sinking into legs at rest: ${(rest(wr) * 1000).toFixed(1)} mm (core ${wr.core}, legs ${wr.legs}, arms ${wr.arms})`);
  console.log(`  worst while walking:                 ${(walk(ww) * 1000).toFixed(1)} mm (core ${ww.core}, legs ${ww.legs}, arms ${ww.arms})`);
  console.log(`  worst gap at a joint:                ${(gap(wg) * 1000).toFixed(1)} mm (core ${wg.core}, legs ${wg.legs}, arms ${wg.arms}) ${JSON.stringify(wg.gaps)}`);
  console.log(`  combinations with an arm more than 3 mm inside the legs at rest: ${bad.length}`);
  const poses = rs.flatMap((r) => [r.pose.arm_r, r.pose.arm_l]).filter(Boolean);
  console.log(`  arm poses: forward swing up to ${Math.max(...poses.map((p) => -p.pitch)).toFixed(2)} rad, outward tilt up to ${Math.max(...poses.map((p) => Math.abs(p.roll))).toFixed(2)} rad`);
  if (rest(wr) > 0.003 || gap(wg) > 0.006 || walk(ww) > 0.01) failures++;
  for (const r of rs.filter((r) => r.legs === 'popgun' || walk(r) > 0.003).slice(0, 40)) {
    if (mode !== 'model') break;
    console.log(`   ${r.core.padEnd(9)} legs ${r.legs.padEnd(9)} arms ${r.arms.padEnd(9)} rest ${(rest(r) * 1000).toFixed(1)} mm, walk ${(walk(r) * 1000).toFixed(1)} mm, poses R(${r.pose.arm_r.pitch},${r.pose.arm_r.roll}) L(${r.pose.arm_l.pitch},${r.pose.arm_l.roll})`);
  }
}
console.log(failures ? '\nFIT CHECK FAILED' : '\nFIT CHECK PASSED');
process.exit(failures ? 1 : 0);
