import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './visuals/placeholders.js';
import { build, setMode, getMode } from './visuals/registry.js';
import { loadModels, ensurePaint, paintReady } from './visuals/models.js';
import { partGaps } from './visuals/snugFit.js';
import { createRobotView } from './visuals/robotView.js';
import { Fx } from './visuals/fx.js';
import { ARENA, PARTS, PAINTS, PAINT_SLOTS, RIVAL_ORDER, stockLoadout } from './data.js';
import { Fight, EMPTY_INPUT } from './game/fight.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { UI } from './ui/ui.js';
import { t, partName, onLang } from './i18n.js';
import { Bot } from './bot.js';

const params = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(20, +(params.get('speed') || 1)));
let debug = params.has('debug');
const SIM_STEP = 1 / 60;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f45);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(2, 5, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 12 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 60);
const rig = new CameraRig(camera);

// ---------- arena ----------
// Rebuilt whenever the view switches between greybox and models.
const world = new THREE.Group();
scene.add(world);
function buildWorld() {
  world.clear();
  world.add(build('arena_toybox'));
  const letters = 'ABCDEFGHIJ';
  const colors = ['#e25b4a', '#2f6fe0', '#3fae4a', '#f0a81a', '#9a4ac8'];
  let li = 0;
  for (const [x, z, n] of ARENA.stacks) {
    for (let i = 0; i < n; i++) {
      const b = build('toy_block', { letter: letters[li % letters.length], color: colors[li % colors.length] });
      b.position.set(x, i * ARENA.block, z);
      b.rotation.y = (li % 4) * (Math.PI / 2); // letters face every way (blocks are square, so collisions do not change)
      world.add(b);
      li++;
    }
  }
}
buildWorld();

const fx = new Fx(scene);
const ui = new UI(document.getElementById('ui'), {
  start: () => goGarage(),
  garageChange,
  fight: () => startFight(),
  takePrize,
  retry: () => startFight(),
  newRun: () => newRun(),
  resume: () => setPause(false),
  toggleView: () => setView(getMode() === 'model' ? 'greybox' : 'model'),
  viewMode: () => getMode(),
  modelsReady: () => modelReport !== null,
});
const input = new Input(renderer.domElement, document.getElementById('touch'));
input.setLabels(t);
onLang(() => {
  input.setLabels(t);
  ui.rerender();
});
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || params.has('touch');
document.body.classList.toggle('touch', isTouch);
addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true });

// ---------- game state ----------
let save;
let fight = null;
let garageView = null;
let garageSnap = false;
let paused = false;
let screen = 'title';

function freshSave() {
  const loadout = stockLoadout('pipo');
  const paints = {};
  for (const id of Object.values(loadout)) paints[id] = 'factory';
  return { inventory: Object.values(loadout), loadout, paints, bout: 0 };
}

function slotPaints() {
  const out = {};
  for (const slot of PAINT_SLOTS) out[slot] = save.paints[save.loadout[slot]] || 'factory';
  return out;
}

function clearGarage() {
  if (garageView) scene.remove(garageView.root);
  garageView = null;
}
function clearFight() {
  if (fight) fight.dispose();
  fight = null;
  fx.clear();
}

function newRun() {
  paused = false;
  clearFight();
  clearGarage();
  save = freshSave();
  screen = 'title';
  ui.show('title');
  camera.clearViewOffset();
}

function goGarage() {
  clearFight();
  clearGarage();
  garageView = createRobotView(save.loadout, slotPaints());
  garageView.root.position.set(0, 0, ARENA.playerStart[1]);
  scene.add(garageView.root);
  garageSnap = true;
  screen = 'garage';
  ui.show('garage', { save });
}

// Swap a part or its paint in the garage: hang the new part on the same attach point.
function garageChange(act, slot, dir) {
  const id = save.loadout[slot];
  if (act === 'part') {
    const choices = save.inventory.filter((p) => PARTS[p].slot === slot);
    const next = choices[(choices.indexOf(id) + dir + choices.length) % choices.length];
    save.loadout[slot] = next;
    garageView.setPart(slot, next, save.paints[next] || 'factory');
  } else {
    const cur = save.paints[id] || 'factory';
    const next = PAINTS[(PAINTS.indexOf(cur) + dir + PAINTS.length) % PAINTS.length];
    save.paints[id] = next;
    garageView.setPaint(slot, next);
    loadPaints(); // a style file is downloaded the first time its paint is picked
  }
  ui.show('garage', { save });
}

// Download any style textures the current loadout needs, then show them.
let paintLoads = 0;
function loadPaints() {
  if (getMode() !== 'model' || !modelReport) return Promise.resolve();
  const need = PAINT_SLOTS.map((slot) => [slot, PARTS[save.loadout[slot]].robot, slotPaints()[slot]]).filter(([, r, p]) => !paintReady(r, p));
  if (!need.length) return Promise.resolve();
  paintLoads++;
  ui.setPaintLoading(true);
  return Promise.all(need.map(([, r, p]) => ensurePaint(r, p))).then(() => {
    if (--paintLoads === 0) ui.setPaintLoading(false);
    if (garageView) for (const slot of PAINT_SLOTS) garageView.setPaint(slot, slotPaints()[slot]);
  });
}

async function startFight() {
  if (screen === 'loading') return;
  if (getMode() === 'model' && modelReport && PAINT_SLOTS.some((s) => !paintReady(PARTS[save.loadout[s]].robot, slotPaints()[s]))) {
    screen = 'loading'; // wait for paint textures before the fight starts
    await loadPaints();
    screen = 'garage';
  }
  clearGarage();
  clearFight();
  paused = false;
  camera.clearViewOffset();
  const rivalId = RIVAL_ORDER[save.bout];
  fight = new Fight({ scene, rivalId, playerLoadout: save.loadout, playerPaints: slotPaints(), playerAI: bot ? bot.playerProfile : null });
  fight.on(onFightEvent);
  rig.snapFight(fight.player, fight.rival, fight.blocks);
  screen = 'fight';
  ui.show('fight', { player: fight.player, rival: fight.rival });
  ui.announce(t('ready'), 1400);
  bot?.onFightStart(fight, save);
}

function onFightEvent(type, d) {
  if (type === 'start') ui.announce(t('fight'), 900);
  else if (type === 'hit') {
    fx.spark(d.point, d.blocked ? 0x3aa0ff : d.slot === 'head' ? 0xff4a4a : 0xffe14a, d.blocked ? 4 : 6);
    // Damage number over the hit: which part, how much, and whether it was guarded.
    const sp = d.point.clone().project(camera);
    if (sp.z < 1) {
      const x = (sp.x * 0.5 + 0.5) * innerWidth;
      const y = (-sp.y * 0.5 + 0.5) * innerHeight;
      const amount = Math.max(1, Math.round(d.dmg));
      const label = d.blocked ? `${t('guard')} -${amount}` : `${t('slot_' + d.slot)} -${amount}`;
      ui.floatText(x, y, label, `${d.target.isPlayer ? 'mine' : 'theirs'}${d.slot === 'head' ? ' head' : ''}${d.blocked ? ' guarded' : ''}`);
    }
    ui.flashBar(d.target.isPlayer, d.slot);
  } else if (type === 'break') {
    const away = d.dir.clone();
    if (d.part) fx.debris(d.part, away);
    if (d.slot !== 'head') ui.announce(t('partBroke', { part: partName(d.robot.parts[d.slot].id) }), 1000, 'small');
  } else if (type === 'fizzle') fx.spark(d.point, 0xcccccc, 3);
  else if (type === 'skill') fx.spark(d.robot.pos.clone().setY(0.45), 0x3aff7a, 5);
  else if (type === 'end') {
    const text = d.won ? t('win') : (d.reason === 'timeout' ? t('timeUp') + ' ' : '') + t('lose');
    ui.announce(text, 2200);
  }
}

function afterFight() {
  const r = fight.result;
  bot?.onFightEnd(r, save);
  if (r.won) {
    if (save.bout >= RIVAL_ORDER.length - 1) {
      screen = 'result';
      ui.show('result', { champion: true });
    } else {
      screen = 'prize';
      ui.show('prize', { rival: r.rival, owned: save.inventory });
    }
  } else {
    screen = 'result';
    ui.show('result', { champion: false, reason: r.reason });
  }
}

function takePrize(id) {
  if (!save.inventory.includes(id)) save.inventory.push(id);
  save.paints[id] ??= 'factory';
  save.bout++;
  goGarage();
  ui.announce(t('prizeTaken', { part: partName(id) }), 1400, 'small');
}

function setPause(on) {
  if (screen !== 'fight') return;
  paused = on;
  if (on) ui.show('pause', { fightData: { player: fight.player, rival: fight.rival } });
  else ui.show('fight', { player: fight.player, rival: fight.rival });
}

// ---------- resize ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 68 : 55;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- main loop ----------
const bot = params.has('bot') ? new Bot({ ui, getSave: () => save, handlers: { goGarage, garageChange, startFight, takePrize, newRun } }) : null;
let last = performance.now();
const frameTimes = [];

function playerInput(raw) {
  return {
    move: rig.worldMove(raw.stick),
    pressL: raw.pressL,
    pressR: raw.pressR,
    holdL: raw.holdL,
    holdR: raw.holdR,
    dash: raw.dash,
    skill: raw.skill,
  };
}

renderer.setAnimationLoop((now) => {
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  frameTimes.push(real);
  if (frameTimes.length > 120) frameTimes.shift();
  const dt = real * SPEED;
  const raw = input.sample();

  if (screen === 'fight' && fight) {
    if (raw.pause) setPause(!paused);
    if (!paused) {
      // Fixed-size simulation steps; presses only go into the first step.
      const steps = Math.max(1, Math.ceil(dt / SIM_STEP - 1e-6));
      const h = dt / steps;
      const pIn = playerInput(raw);
      const holdIn = { ...pIn, pressL: false, pressR: false, dash: false, skill: false };
      for (let i = 0; i < steps && !fight.done; i++) fight.update(h, i === 0 ? pIn : holdIn);
      fight.animate(dt);
      fx.update(dt);
      rig.fight(fight.player, fight.rival, dt, false, fight.blocks);
      ui.updateHud(fight, debug);
      if (fight.done) afterFight();
    }
  } else if (garageView) {
    camera.setViewOffset(innerWidth, innerHeight, innerWidth < innerHeight ? 0 : -innerWidth * 0.18, innerWidth < innerHeight ? innerHeight * 0.22 : 0, innerWidth, innerHeight);
    garageView.root.rotation.y += dt * 0.5; // turntable
    rig.garage(garageView.root.position, dt, garageSnap);
    garageSnap = false;
    fx.update(dt);
  } else {
    fx.update(dt);
    rig.garageAngle += dt * 0.1;
    rig.title(dt);
  }
  if (bot && screen === 'fight' && fight && !paused && window.__game.models) bot.watchFight(fight, camera);
  bot?.tick(dt, screen, fight);
  renderer.render(scene, camera);
});

addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    debug = !debug;
    e.preventDefault();
  }
});

// ---------- greybox <-> models ----------
let modelReport = null;
function setView(mode) {
  if (mode === 'model' && !modelReport) return;
  setMode(mode);
  buildWorld();
  garageView?.rebuild();
  fight?.robots.forEach((r) => r.view.rebuild());
  ui.rerender();
  if (mode === 'model' && garageView) loadPaints();
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyG' && !e.repeat) ui.h.toggleView();
});
if (!params.has('greybox')) {
  loadModels({
    phone: isTouch,
    onProgress: (n, total) => ui.setLoading(n, total),
  }).then((report) => {
    modelReport = report;
    window.__modelReport = report;
    for (const f of report.failed) console.warn(`[models] ${f.file} did not load: ${f.why}`);
    ui.setLoading(null);
    setView('model');
  });
} else ui.setLoading(null);

// For the test bot and for poking at the game from the browser console.
window.__game = {
  get screen() { return screen; },
  get fight() { return fight; },
  get save() { return save; },
  frameTimes,
  renderer,
  camera,
  rig,
  scene,
  setView,
  get models() { return modelReport; },
  get garageView() { return garageView; },
  // Test helper: smallest distance between neighbouring parts of the garage robot (m).
  garageGaps() { return garageView ? partGaps(garageView) : null; },
  // Test helper: is the garage robot inside the view and not hidden behind anything?
  garageRobotVisible() {
    if (!garageView) return { ok: false, why: 'no garage robot' };
    const centre = garageView.root.position.clone().setY(0.26);
    const p = centre.clone().project(camera);
    const px = { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) return { ok: false, why: 'off screen', px };
    const panel = document.querySelector('#s-garage .panel')?.getBoundingClientRect();
    if (panel && px.x > panel.left && px.x < panel.right && px.y > panel.top && px.y < panel.bottom) return { ok: false, why: 'behind the menu', px };
    const ray = new THREE.Raycaster(camera.position.clone(), centre.clone().sub(camera.position).normalize());
    const first = ray.intersectObjects(scene.children, true).find((h) => h.object.visible);
    let o = first?.object;
    while (o && o !== garageView.root) o = o.parent;
    return { ok: o === garageView.root, why: o ? 'visible' : `hidden by ${first?.object.name || first?.object.parent?.name || 'something'}`, px };
  },
  EMPTY_INPUT,
};

newRun();
