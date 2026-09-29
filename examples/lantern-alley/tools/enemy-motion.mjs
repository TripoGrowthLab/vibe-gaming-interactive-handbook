// Measures how smoothly the enemies move, frame by frame at 120 Hz (MacBook Pro), while Volt
// stands still and while he walks. Counts the things that read as stutter:
//  - stop-starts: an enemy stops for a frame or two in the middle of moving
//  - direction flips: it turns around on the spot (facing ±X changes)
//  - animation switches between walk and idle
//  - jumps: a frame that moves much further than the frames around it
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4184;
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`http://localhost:${PORT}/?manual=1&seed=${process.argv[2] ?? 3}`);
await page.evaluate(() => window.__modelsReady);
const out = await page.evaluate(() => {
  const g = __game;
  g.reset();
  g.turns.update = () => {};            // measure walking and circling, not attacks
  let t = window.__t ?? 1000;
  const frame = () => __frame(t += 1000 / 120);
  g.input.setVirtualMove({ x: 0, z: 0 });
  for (let i = 0; i < 120 * 9; i++) frame();          // wave 1 walks in and settles
  const phases = [['Volt stands still', { x: 0, z: 0 }], ['Volt walks right', { x: 1, z: 0 }], ['Volt walks up and left', { x: -0.7, z: -0.7 }]];
  const res = [];
  for (const [label, move] of phases) {
    g.input.setVirtualMove(move);
    const tracks = new Map();
    for (let i = 0; i < 120 * 4; i++) {
      frame();
      for (const e of g.enemies) {
        if (!tracks.has(e)) tracks.set(e, []);
        tracks.get(e).push({ x: e.node.position.x, z: e.node.position.z, facing: e.facing, anim: e.anim });
      }
    }
    let stopStarts = 0, flips = 0, animSwitches = 0, jumps = 0, frames = 0;
    for (const tr of tracks.values()) {
      const sp = tr.slice(1).map((p, i) => Math.hypot(p.x - tr[i].x, p.z - tr[i].z));
      frames += sp.length;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].facing !== tr[i - 1].facing) flips++;
        if (tr[i].anim !== tr[i - 1].anim) animSwitches++;
      }
      for (let i = 1; i < sp.length - 1; i++) {
        const around = Math.max(sp[i - 1], sp[i + 1]);
        if (sp[i] < 0.1 * around && around > 0.005) stopStarts++;
        const med = [sp[i - 1], sp[i + 1]].sort()[0];
        if (sp[i] > 3 * Math.max(med, 0.004)) jumps++;
      }
    }
    const secs = (frames / tracks.size) / 120;
    res.push({ label, enemies: tracks.size, perEnemyPerSecond: {
      stopStarts: +(stopStarts / tracks.size / secs).toFixed(1), directionFlips: +(flips / tracks.size / secs).toFixed(1),
      walkIdleSwitches: +(animSwitches / tracks.size / secs).toFixed(1), jumps: +(jumps / tracks.size / secs).toFixed(1) } });
  }
  g.input.setVirtualMove(null);
  window.__t = t;
  return res;
});
for (const r of out) console.log(`${r.label.padEnd(24)} ${r.enemies} enemies, per enemy per second: ${JSON.stringify(r.perEnemyPerSecond)}`);
await browser.close(); server.kill();
