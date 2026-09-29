import * as THREE from 'three';
import { STEP, CAMERA, FOREMAN } from './config.js';
import { Game } from './game.js';
import { createHud } from './hud.js';
import { initInput, pollInput, input } from './input.js';
import { nextStyle, applyStyle, getStyle, setModelProvider } from './registry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as models from './models.js';
import { initSfx, setMuted, isMuted, sfxLog } from './sfx.js';

const params = new URLSearchParams(location.search);
const speed = Number(params.get('speed')) || 1; // test runs can play faster; the simulation is identical
const manual = params.has('manual'); // tests drive frames themselves

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the painted colours, stops bright areas from blowing out
app.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 200);

const hud = createHud();
initInput(app, hud);
// image-based lighting so the models' materials are not black
const pmrem = new THREE.PMREMGenerator(renderer);
Game.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
setModelProvider(models.provideView);
let game = null;
const cam = { target: new THREE.Vector3(0, 0, 8), dist: CAMERA.distance, tilt: CAMERA.tilt };

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function restart() {
  game.dispose();
  hud.hideEnd(); // before the new round, so its WAVE 1 banner and controls card stay up
  game = new Game(hud);
  cam.target.set(0, 0, 8);
  cam.tilt = CAMERA.tilt;
  input.firePressed = input.rollPressed = false;
  window.__game = game;
}
// load a look's model files if they are not loaded yet (shows a small note while loading)
let busy = false;
async function ensureLoaded(style) {
  if (models.hasTemplate('player', style)) return;
  hud.loading.textContent = 'Loading models…';
  hud.loading.classList.remove('hide');
  hud.loading.classList.add('small');
  await models.loadStyle(style);
  hud.loading.classList.add('hide');
}
async function switchStyle() {
  if (busy) return;
  busy = true;
  const old = getStyle();
  nextStyle();
  if (models.modelsEnabled()) await ensureLoaded(getStyle());
  applyStyle(game.scene);
  game.swapViews();
  models.releaseStyle(old);
  hud.setStyleLabel();
  busy = false;
}
async function toggleModels() {
  if (busy) return;
  busy = true;
  const on = !models.modelsEnabled();
  if (on) await ensureLoaded(getStyle());
  models.setModelsOn(on);
  game.swapViews();
  hud.setModelLabel(on);
  busy = false;
}
hud.restartBtn.addEventListener('click', restart);
hud.endRestart.addEventListener('click', restart);
hud.styleBtn.addEventListener('click', switchStyle);
hud.modelBtn.addEventListener('click', toggleModels);
initSfx();
hud.soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  hud.soundBtn.textContent = `Sound: ${isMuted() ? 'off' : 'on'}`;
});

const fitCam = new THREE.PerspectiveCamera();
const _pt = new THREE.Vector3();
// Foreman box corners (it is 7.6 wide, 7.5 tall, 5 long) plus Tamsin's feet and head
const FIT_POINTS = [];
for (const x of [-3.8, 3.8]) for (const y of [0, 7.5]) for (const z of [-2.5, 2.9]) FIT_POINTS.push([x, y, z, 'f']);
FIT_POINTS.push([0, 0, 0, 'p'], [0, 1.8, 0, 'p']);

function placeCamera(c, tx, tz, dist, tilt = cam.tilt) {
  c.position.set(tx, Math.sin(tilt) * dist, tz + Math.cos(tilt) * dist);
  c.lookAt(tx, 0, tz);
  c.updateMatrixWorld();
}
// Closest camera (and the look point between Tamsin and the Foreman) that keeps both fully on screen, below the top HUD.
const PULLS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
function fits(tx, tz, d, top) {
  placeCamera(fitCam, tx, tz, d, CAMERA.bossTilt);
  const f = game.foreman.view.root;
  const p = game.player.view.root.position;
  for (const [x, y, z, who] of FIT_POINTS) {
    if (who === 'f') _pt.set(x, y, z).applyMatrix4(f.matrixWorld);
    else _pt.set(p.x + x, y, p.z + z);
    _pt.project(fitCam);
    if (Math.abs(_pt.x) > 0.94 || _pt.y > top || _pt.y < -0.9) return false;
  }
  return true;
}
function bossFraming() {
  fitCam.copy(camera);
  const top = 1 - (2 * hud.topCover()) / innerHeight;
  const f = game.foreman.view.root.position;
  const p = game.player.view.root.position;
  for (let d = CAMERA.bossMin; d < CAMERA.bossMax; d += 1)
    for (const k of PULLS) {
      const tx = p.x + (f.x - p.x) * k;
      const tz = p.z + (f.z - p.z) * k;
      if (fits(tx, tz, d, top)) return { tx, tz, d };
    }
  return { tx: p.x + (f.x - p.x) * CAMERA.bossPull, tz: p.z + (f.z - p.z) * CAMERA.bossPull, d: CAMERA.bossMax };
}

function updateCamera(dt) {
  const p = game.player.view.root.position;
  const lead = game.aim.dir && game.player.alive ? CAMERA.aimLead : 0;
  let tx = p.x + (game.aim.dir?.x ?? 0) * lead;
  let tz = p.z + (game.aim.dir?.z ?? 0) * lead;
  const bossFight = game.foreman.state !== 'dormant' || (game.phase === 'gap' && game.wave === 1);
  let framing = null;
  if (bossFight) {
    framing = bossFraming();
    tx = framing.tx;
    tz = framing.tz;
  }
  const k = 1 - Math.exp(-CAMERA.follow * dt);
  cam.target.x += (tx - cam.target.x) * k;
  cam.target.z += (tz - cam.target.z) * k;
  let want = CAMERA.distance * (camera.aspect < 1 ? CAMERA.portraitFactor : 1);
  if (framing) want = framing.d;
  cam.dist += (want - cam.dist) * (1 - Math.exp(-2 * dt));
  cam.tilt += ((bossFight ? CAMERA.bossTilt : CAMERA.tilt) - cam.tilt) * (1 - Math.exp(-2 * dt));
  placeCamera(camera, cam.target.x, cam.target.z, cam.dist);
  const s = game.shakeAmt;
  if (s > 0) {
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
}

// Fixed 60 Hz simulation, rendered every screen refresh with interpolation (smooth on 60 / 120 / 144 Hz).
let acc = 0;
let last = -1;
function frame(now) {
  const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  pollInput();
  if (input.restartPressed) (input.restartPressed = false), restart();
  if (input.stylePressed) (input.stylePressed = false), switchStyle();
  if (input.modelPressed) (input.modelPressed = false), toggleModels();
  acc += dt * speed;
  let steps = 0;
  while (acc >= STEP && steps < 8 * speed) {
    game.step(STEP);
    acc -= STEP;
    steps++;
  }
  if (acc >= STEP) acc = 0; // fell far behind (tab was hidden): drop the backlog
  const alpha = acc / STEP;
  game.render(alpha, dt, camera);
  updateCamera(dt);
  renderer.render(game.scene, camera);
  if (!manual) requestAnimationFrame(frame);
}
window.__frame = frame; // tests with ?manual call this with their own timestamps
window.__camera = camera;
window.__renderer = renderer;
window.__restart = restart;
window.__FOREMAN = FOREMAN;
window.__input = input;
window.__cam = cam;
window.__models = models;
window.__sfxLog = sfxLog;
window.__toggleModels = toggleModels;
window.__switchStyle = switchStyle;

// Start: load the models for the current look (unless ?greybox), then begin the round.
async function start() {
  if (!params.has('greybox')) {
    await models.loadStyle(getStyle());
    for (const f of models.modelInfo.failures) console.warn(`model not loaded: ${f.url} (${f.error}); using the greybox for ${f.id}`);
    models.setModelsOn(models.hasTemplate('player'));
  }
  hud.setModelLabel(models.modelsEnabled());
  game = new Game(hud);
  window.__game = game;
  hud.loading.classList.add('hide');
  window.__ready = true;
  if (params.has('bot')) import('./bot.js').then((m) => m.startBot(() => window.__game, params.get('bot') === 'clumsy'));
  if (!manual) requestAnimationFrame(frame);
}
start();
