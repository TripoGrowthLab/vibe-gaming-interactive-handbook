// Dev-only model lab (lab.html): renders a GLB next to its placeholder from several sides, and exposes helpers for tests.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createView } from './registry.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9aa0a8');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#555555', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.5);
sun.position.set(3, 6, 5);
scene.add(sun);
const grid = new THREE.GridHelper(20, 20, '#444', '#666');
scene.add(grid);
const loader = new GLTFLoader();

window.lab = { THREE, scene, renderer, loader, createView };

// renders the scene from named views into a grid of viewports
window.lab.renderViews = function (target, radius, views) {
  const W = innerWidth, H = innerHeight;
  const cols = Math.ceil(Math.sqrt(views.length));
  const rows = Math.ceil(views.length / cols);
  const w = Math.floor(W / cols), h = Math.floor(H / rows);
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.innerHTML = '';
  views.forEach((v, i) => {
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.01, 500);
    const dir = new THREE.Vector3(...v.dir).normalize();
    cam.position.copy(target).addScaledVector(dir, radius * 3.2);
    if (Math.abs(dir.y) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(target);
    const x = (i % cols) * w, y = H - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(scene, cam);
    const d = document.createElement('div');
    d.style.left = `${x + 6}px`;
    d.style.top = `${H - y - h + 4}px`;
    d.textContent = v.name;
    labels.appendChild(d);
  });
  renderer.setScissorTest(false);
};
window.lab.load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
window.lab.ready = true;
import { matchParts, usedBox } from './partsmatch.js';
window.lab.matchParts = matchParts;
window.lab.usedBox = usedBox;
window.lab.clear = () => {
  const keep = new Set(window.lab.keep);
  for (const c of [...scene.children]) if (!keep.has(c)) scene.remove(c);
};
window.lab.keep = [...scene.children];
import * as models from './models.js';
window.lab.models = models;
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
window.lab.SkeletonUtils = SkeletonUtils;
import { MODEL_CONFIG } from './modelConfig.js';
import * as armfix from './armfix.js';
import { matchClip } from './clipmatch.js';
window.lab.matchClip = matchClip;
window.lab.MODEL_CONFIG = MODEL_CONFIG;
window.lab.armfix = armfix;
