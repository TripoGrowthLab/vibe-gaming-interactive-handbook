// Renders Tamsin's model view in each game state (as the game drives it), 3/4 view and front view.
import { chromium } from 'playwright-core';
const style = process.argv[2] || 'arcade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 820 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/lab.html');
await page.waitForFunction(() => window.lab?.ready);
const info = await page.evaluate(async (style) => {
  const { THREE, scene, renderer } = lab;
  lab.clear();
  await lab.models.loadStyle(style, ['player', 'blaster']);
  const t = lab.models.modelInfo.templates[style].player;
  const shots = [
    ['idle (aim = arrow)', {}, 1.0],
    ['run sideways, not shooting', { speed: 6, moveLocalX: -1, moveLocalZ: 0 }, 0.5],
    ['run sideways + shoot', { speed: 6, moveLocalX: -1, moveLocalZ: 0, shooting: true }, 0.6],
    ['run diagonal-back + shoot', { speed: 6, moveLocalX: -0.7, moveLocalZ: -0.7, shooting: true }, 0.6],
    ['backpedal + shoot', { speed: 6, moveLocalZ: -1, shooting: true }, 0.6],
    ['roll', {}, 0.2, 'roll'],
    ['hurt', {}, 0.15, 'hurt'],
    ['knocked_down', {}, 3.0, 'knocked_down'],
    ['cheer', {}, 1.5, 'cheer'],
  ];
  const W = innerWidth, H = innerHeight, n = shots.length;
  const w = Math.floor(W / n);
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const [name, inf, dur, state] = shots[i];
    lab.clear();
    const v = lab.models.modelView('player', style);
    scene.add(v.root);
    v.setState(state || (inf.speed ? 'run' : 'idle'));
    // red arrow = where she aims (the game's facing), blue arrow = where she runs
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0), 1.2, 0xff0000, 0.25, 0.12));
    if (inf.speed) scene.add(new THREE.ArrowHelper(new THREE.Vector3(inf.moveLocalX || 0, 0, inf.moveLocalZ ?? 1).normalize(), new THREE.Vector3(0, 0.03, 0), 1.2, 0x2060ff, 0.25, 0.12));
    for (let k = 0; k < dur * 60; k++) v.update(1 / 60, inf);
    v.root.updateMatrixWorld(true);
    for (let r = 0; r < 2; r++) {
      const cam = new THREE.PerspectiveCamera(32, w / (H / 2), 0.05, 50);
      const d = r === 0 ? new THREE.Vector3(0.9, 0.35, 1) : new THREE.Vector3(0, 1, 0.02);
      cam.position.set(0, 0.85, 0).addScaledVector(d.normalize(), 4.2);
      if (r === 1) cam.up.set(0, 0, -1);
      cam.lookAt(0, 0.8, 0);
      renderer.setViewport(i * w, H - (r + 1) * (H / 2), w, H / 2);
      renderer.setScissor(i * w, H - (r + 1) * (H / 2), w, H / 2);
      renderer.render(scene, cam);
    }
    const d = document.createElement('div');
    d.style.left = `${i * w + 4}px`;
    d.style.top = '4px';
    d.style.fontSize = '13px';
    d.textContent = name;
    labels.appendChild(d);
  }
  renderer.setScissorTest(false);
  return { runSpeed: t.prepared.runSpeed, report: t.prepared.report, hold: !!t.hold };
}, style);
await page.screenshot({ path: `tools/out/player-states-${style}.png` });
console.log(JSON.stringify(info, null, 1));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
