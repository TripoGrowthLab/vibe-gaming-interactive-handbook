// Renderer, lights, snow ground, camera rig and particle effects (all visual; no gameplay rules here).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Environment map so the painted (PBR) models are not dark or black.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  const sky = new THREE.Color(0xbfe3ff);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 60, 135);

  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x9bb3c9, 1.6));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 30, bottom: -20, near: 1, far: 80 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // Snow ground: a big plane that jumps in whole texture tiles so it looks endless.
  const TILE = 10;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f8ff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#dde9f7';
  for (let i = 0; i < 26; i++) g.fillRect((i * 53) % 128, (i * 37) % 128, 10 + (i % 3) * 6, 3);
  g.fillStyle = '#cfdff2';
  g.fillRect(0, 0, 128, 2); // one faint line per tile, gives a sense of speed
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const GROUND_W = 120, GROUND_L = 240;
  tex.repeat.set(GROUND_W / TILE, GROUND_L / TILE);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_W, GROUND_L),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Groomed run: slightly bluer strip between the fences.
  const run = new THREE.Mesh(
    new THREE.PlaneGeometry(24, GROUND_L),
    new THREE.MeshStandardMaterial({ color: 0xe8f2ff, roughness: 1, transparent: true, opacity: 0.55 }),
  );
  run.rotation.x = -Math.PI / 2;
  run.position.y = 0.01;
  run.receiveShadow = true;
  scene.add(run);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
  const cam = { x: 0, shake: 0 };

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---- particles (snow spray + crash burst) ----
  const MAX_P = 240;
  const pMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX_P,
  );
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const parts = Array.from({ length: MAX_P }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  let pNext = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  function emit(x, y, z, vx, vy, vz, life, size) {
    const p = parts[pNext];
    pNext = (pNext + 1) % MAX_P;
    p.p.set(x, y, z);
    p.v.set(vx, vy, vz);
    p.life = p.max = life;
    p.s = size;
  }

  return {
    renderer, scene, camera,

    // Called once per rendered frame with the interpolated player position.
    follow(dt, px, pz, speed, speedFrac) {
      const portrait = camera.aspect < 1;
      // Portrait phones: lower, closer and tilted further down, so less sky and a bigger Juno.
      const back = portrait ? 5.5 : 6;
      const up = portrait ? 5.5 : 3.5;
      const ahead = portrait ? 6 : 8;
      cam.x = damp(cam.x, px * (portrait ? 0.95 : 0.8), 7, dt);
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      const sx = (Math.random() - 0.5) * cam.shake * 0.4;
      const sy = (Math.random() - 0.5) * cam.shake * 0.4;
      camera.position.set(cam.x + sx, up + sy, pz - back);
      camera.lookAt(cam.x * 0.9, 0, pz + ahead);
      const fov = portrait ? 72 + 6 * speedFrac : 60 + 12 * speedFrac;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      sun.position.set(px + 10, 25, pz - 8);
      sun.target.position.set(px, 0, pz + 8);
      ground.position.set(0, 0, Math.floor(pz / TILE) * TILE + 60);
      run.position.z = pz + 60;
    },
    snapCamera(px) { cam.x = px * 0.8; },
    shake(amount) { cam.shake = Math.max(cam.shake, amount); },

    spray(x, z, dirX, speed, dt) {
      const n = Math.min(6, Math.floor(speed * dt * 3 + Math.random()));
      for (let i = 0; i < n; i++) {
        emit(x - dirX * 0.3, 0.1, z - 0.4,
          -dirX * (2 + Math.random() * 3), 1 + Math.random() * 2, speed * 0.6 + Math.random() * 2,
          0.35 + Math.random() * 0.2, 0.7 + Math.random() * 0.8);
      }
    },
    burst(x, y, z) {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 5;
        emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 0.6 + Math.random() * 0.5, 1 + Math.random() * 1.5);
      }
    },
    updateParticles(dt) {
      for (let i = 0; i < MAX_P; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.v.y -= 12 * dt;
          p.p.addScaledVector(p.v, dt);
          if (p.p.y < 0.03) { p.p.y = 0.03; p.v.set(0, 0, 0); }
        }
        const s = p.life > 0 ? p.s * Math.min(1, p.life / 0.2) : 0;
        m4.compose(p.p, q, sv.setScalar(s));
        pMesh.setMatrixAt(i, m4);
      }
      pMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
