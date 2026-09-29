import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4185;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore', cwd: process.argv[2] });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const seed of [101, 202, 303]) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/?manual=1&seed=${seed}&look=greybox`);
  const r = await page.evaluate(() => {
    const g = __game; let t = 1000; const arrivals = [], attacks = []; const seen = new Set();
    g.input.setVirtualMove({ x: 0, z: 0 });
    for (let i = 0; i < 60 * 40; i++) {
      __frame(t += 1000 / 60);
      for (const e of g.enemies) {
        if (!seen.has(e)) { seen.add(e); arrivals.push(`${e.kind === 'thug_fat' ? 'Slab' : 'Sprat'}@${g.time.toFixed(1)}s ${e.side > 0 ? 'R' : 'L'} z${e.pos.z.toFixed(1)}`); }
        if (e.state === 'attack' && e.attack.t === 0) attacks.push(g.time.toFixed(1));
      }
      if (g.wave === 0 && g.enemies.length === 0 && g.spawnQueue.length === 0) break;
    }
    return { arrivals: arrivals.slice(0, 4), attacks: attacks.slice(0, 8), hp: g.hero.hp };
  });
  console.log(`seed ${seed}: arrivals ${r.arrivals.join(', ')}\n          enemy attacks start at ${r.attacks.join(', ')} s; Volt HP after 40 s standing still: ${r.hp}`);
  await page.close();
}
await browser.close(); server.kill();
