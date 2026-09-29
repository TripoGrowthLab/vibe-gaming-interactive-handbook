import { CFG } from './config.js';
import { createStage } from './stage.js';
import { createHud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { loadModels } from './models.js';
import { attachModels, setVisualMode, getVisualMode, hasModels, syncBatches } from './registry.js';
import { unlockAudio, sfxStats } from './sfx.js';
import { setupEmbed } from './embed.js';

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

const stage = createStage(document.getElementById('app'));
const input = new Input(stage.renderer.domElement);
let game;
const hud = createHud({
  onStart: () => game.start(),
  onPause: () => game.togglePause(true),
  onResume: () => game.togglePause(false),
});
game = new Game({ stage, hud, input });

input.onStart = () => (game.paused ? game.togglePause(false) : game.start());
input.onPause = () => game.togglePause();
const lookBtn = document.getElementById('btn-look');
// One place that switches the look, so the button label and the embedding page always agree.
const applyLook = (m) => {
  const applied = setVisualMode(m);
  lookBtn.textContent = !hasModels() ? 'Look: greybox (models failed)' : applied === 'model' ? 'Look: 3D models' : 'Look: greybox';
  return applied;
};
const embed = setupEmbed({ get: getVisualMode, set: applyLook, canSwitch: hasModels });
const toggleLook = () => {
  if (!hasModels()) return;
  applyLook(getVisualMode() === 'model' ? 'greybox' : 'model');
  embed.notifyChanged();
};
lookBtn.addEventListener('click', toggleLook);
input.onDebug = (code) => {
  if (code === 'KeyH') game.world.toggleHitboxes();
  if (code === 'KeyM') toggleLook();
};
// Sound may only start after the player touches or presses something.
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });

// Load the 3D models; the greybox stays playable meanwhile (and if any file fails).
const modelStatus = { loaded: [], failed: {} };
loadModels('./assets/').then(({ models, failed }) => {
  modelStatus.loaded = Object.keys(models);
  modelStatus.failed = failed;
  window.__models = models;
  for (const [id, err] of Object.entries(failed)) console.warn(`Model "${id}" did not load: ${err}`);
  if (modelStatus.loaded.length) attachModels(stage.scene, models);
  applyLook(getVisualMode());
  embed.notifyReady();
}).catch((e) => {
  console.warn('3D models did not load:', e);
  applyLook('greybox');
  embed.notifyReady(); // the page still learns that only "grey" is available
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.togglePause(true);
});

// Fixed-step simulation + interpolated rendering: identical motion at 60 Hz, 120 Hz or anything else.
let acc = 0;
let last = null;
let timeScale = 1;
function frame(now) {
  const dt = last === null ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.1));
  last = now;
  acc += dt * timeScale;
  let steps = 0;
  while (acc >= CFG.STEP && steps < 60) {
    game.fixedUpdate(CFG.STEP);
    acc -= CFG.STEP;
    steps++;
  }
  if (steps === 60) acc = 0;
  game.render(game.paused ? 0 : dt, acc / CFG.STEP); // paused: freeze animations too
  stage.scene.updateMatrixWorld();
  syncBatches();
  stage.renderer.render(stage.scene, stage.camera);
}
stage.renderer.setAnimationLoop(frame);

// Hooks for automated tests (bot, frame-pacing check).
window.__game = {
  game, stage, CFG,
  frame,
  stopLoop: () => { stage.renderer.setAnimationLoop(null); last = null; },
  startLoop: () => { last = null; stage.renderer.setAnimationLoop(frame); },
  setTimeScale: (s) => (timeScale = s),
  collides: (x, z) => game.world.collide(x, z, game.r),
  modelStatus, sfxStats, setVisualMode, getVisualMode, get models() { return window.__models; },
  embed: embed.state,
};
