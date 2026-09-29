// Dev-only: assemble every core x legs x arm combination and measure how well it fits.
import '/src/visuals/placeholders.js';
import { setMode } from '/src/visuals/registry.js';
import { loadModels } from '/src/visuals/models.js';
import { createRobotView } from '/src/visuals/robotView.js';
import { partGaps, armBurial } from '/src/visuals/snugFit.js';

const R = ['pipo', 'kanazuchi', 'popgun', 'hazama'];
await loadModels({ base: '/assets/' });
const rows = [];
for (const mode of ['model', 'greybox']) {
  setMode(mode);
  for (const core of R) for (const legs of R) for (const arms of R) {
    const lo = { core: `${core}_core`, head: `${core}_head`, legs: `${legs}_legs`, arm_r: `${arms}_arm_r`, arm_l: `${arms}_arm_l` };
    const t0 = performance.now();
    const v = createRobotView(lo);
    const ms = performance.now() - t0;
    const b = armBurial(v);
    const g = partGaps(v);
    rows.push({ ms, mode, core, legs, arms, gaps: g, burial: b, pose: { arm_r: v.fit.arm_r, arm_l: v.fit.arm_l } });
  }
}
window.__rows = rows;
window.__done = true;
