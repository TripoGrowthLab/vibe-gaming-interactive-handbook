// Everything about how things LOOK lives in this file.
// Gameplay asks for a view by id and only talks to it through the View interface:
//   view.root              Object3D that gameplay positions and turns (faces +Z)
//   view.part(name)        named child that turns around its own hinge (parts bodies)
//   view.setState(state)   show a state (placeholders: colour / lean)
//   view.flash(seconds)    white hit flash
//   view.setGlow(part, a)  glow a part (0..1), e.g. a cannon charging
//   view.update(dt, info)  called every rendered frame
// To swap a placeholder for a 3D model later, register a new builder for that id.
import * as THREE from 'three';

// ---------------------------------------------------------------- styles
export const STYLES = {
  arcade: {
    label: 'Arcade',
    sky: '#e9b889', fog: '#e0a877', floor: '#c49563', floorRing: '#a87a4c', wall: '#6e5b4b', wallTop: '#8c7358',
    crate: '#9a7440', crateBand: '#5c4428',
    suit: '#3d7ea6', suitDark: '#274f69', skin: '#e2b38a', hair: '#5a3522', gun: '#3a3a40',
    hound: '#a8763f', houndDark: '#4f3b2c', eye: '#ffd23f',
    hull: '#7b5431', hullDark: '#4a3526', leg: '#51453c', cannon: '#5f6f78', pod: '#9a3f30', armour: '#b3944f', core: '#38e1ff',
    bolt: '#fff27a', shell: '#ff8a3a', missile: '#dadada', marker: '#ff2f2f', beam: '#ff3b6b', ring: '#ffd27f', kit: '#3ccf6e', kitCross: '#ffffff', blast: '#ffb347', spark: '#ffc850', sparkDim: '#cfc8bd', hitFlash: '#ffd890',
  },
  mecha_pop: {
    label: 'Mecha Pop',
    sky: '#2b2d58', fog: '#34306a', floor: '#3b3f7a', floorRing: '#5156a0', wall: '#ff4f9e', wallTop: '#ffd23f',
    crate: '#23c4b5', crateBand: '#fdfdfd',
    suit: '#ffd23f', suitDark: '#ff7a1a', skin: '#ffe0c7', hair: '#1f1f3a', gun: '#1f1f3a',
    hound: '#ff5a5a', houndDark: '#fdfdfd', eye: '#35f0ff',
    hull: '#e8e8f0', hullDark: '#3140b5', leg: '#3140b5', cannon: '#ff4f9e', pod: '#23c4b5', armour: '#ffd23f', core: '#ff3bff',
    bolt: '#35f0ff', shell: '#ff4f9e', missile: '#ffd23f', marker: '#ff3bff', beam: '#35f0ff', ring: '#ffffff', kit: '#7dff5a', kitCross: '#1f1f3a', blast: '#ff9bf3', spark: '#7ff6ff', sparkDim: '#c8c8e8', hitFlash: '#b8ffff',
  },
};
let styleName = 'arcade';
export const getStyle = () => styleName;
export function nextStyle() {
  const names = Object.keys(STYLES);
  styleName = names[(names.indexOf(styleName) + 1) % names.length];
  return styleName;
}
const col = (role) => STYLES[styleName][role];

// Recolour everything already built (called after nextStyle()).
export function applyStyle(scene) {
  const s = STYLES[styleName];
  scene.background = new THREE.Color(s.sky);
  if (scene.fog) scene.fog.color.set(s.fog);
  scene.traverse((o) => {
    const role = o.material?.userData?.role;
    if (role) {
      o.material.color.set(s[role]);
      o.material.userData.baseColor?.set(s[role]);
      if (o.material.userData.baseGlow && o.material.emissiveIntensity > 0 && !o.material.userData.baseGlow.equals(new THREE.Color(0, 0, 0))) o.material.userData.baseGlow.set(s[role]);
    }
    if (o.material?.userData?.floor) o.material.map = floorTexture(styleName);
  });
}

// ---------------------------------------------------------------- painted floor (code-made)
// 2048 px painting of the 41 m arena disc: ground colour with soft patches, pebbles, stains, tyre tracks,
// cracks, grime near the wall and a worn painted ring with "PIT 9" in the middle.
const floorCache = {};
function floorTexture(name) {
  if (floorCache[name]) return floorCache[name];
  const S = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pop = name === 'mecha_pop';
  const st = STYLES[name];
  const m = S / 41; // pixels per metre (disc of radius 20.5 m fills the square)
  const cx = S / 2;
  const at = (x) => cx + x * m;
  g.fillStyle = st.floor;
  g.fillRect(0, 0, S, S);
  const blob = (x, y, r, color, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'transparent');
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };
  // soft light / dark patches
  for (let i = 0; i < 260; i++) blob(rnd() * S, rnd() * S, (1 + rnd() * 4) * m, rnd() < 0.5 ? '#000000' : '#ffffff', pop ? 0.05 : 0.07);
  if (pop) {
    // panel grid with bright seams
    g.strokeStyle = st.floorRing;
    g.lineWidth = m * 0.06;
    for (let v = -20; v <= 20; v += 2.5) {
      g.beginPath(); g.moveTo(at(v), 0); g.lineTo(at(v), S); g.stroke();
      g.beginPath(); g.moveTo(0, at(v)); g.lineTo(S, at(v)); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rnd() < 0.5 ? '#4b50a0' : '#2f3368';
      g.fillRect(at(-20 + Math.floor(rnd() * 16) * 2.5) + 3, at(-20 + Math.floor(rnd() * 16) * 2.5) + 3, 2.5 * m - 6, 2.5 * m - 6);
    }
  } else {
    // rust stains and oil spots
    for (let i = 0; i < 45; i++) blob(rnd() * S, rnd() * S, (0.6 + rnd() * 2) * m, '#7a3b16', 0.28);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * S, y = rnd() * S;
      for (let k = 0; k < 5; k++) blob(x + (rnd() - 0.5) * m, y + (rnd() - 0.5) * m, (0.3 + rnd() * 0.8) * m, '#1c140e', 0.35);
    }
    // tyre tracks: pairs of dashed arcs
    g.strokeStyle = '#6b4a2c';
    g.lineWidth = m * 0.28;
    g.setLineDash([m * 0.25, m * 0.18]);
    for (let i = 0; i < 4; i++) {
      const r = (7 + rnd() * 11) * m, a0 = rnd() * 6.28, a1 = a0 + 0.8 + rnd();
      for (const off of [0, 1.6 * m]) {
        g.globalAlpha = 0.35;
        g.beginPath();
        g.arc(cx, cx, r + off, a0, a1);
        g.stroke();
      }
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
    // cracks
    g.strokeStyle = '#4a321f';
    g.lineWidth = Math.max(1, m * 0.05);
    for (let i = 0; i < 26; i++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) (a += (rnd() - 0.5) * 1.2), (x += Math.cos(a) * m * 0.6), (y += Math.sin(a) * m * 0.6), g.lineTo(x, y);
      g.stroke();
    }
  }
  // pebbles
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, (0.03 + rnd() * 0.07) * m, 0, 6.28);
    g.fill();
  }
  // grime / glow band along the wall
  const edge = g.createRadialGradient(cx, cx, 15 * m, cx, cx, 20.5 * m);
  edge.addColorStop(0, 'transparent');
  edge.addColorStop(1, pop ? 'rgba(255,79,158,0.35)' : 'rgba(40,25,15,0.55)');
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
  // painted ring and PIT 9 in the middle, worn by scratching the paint off
  g.strokeStyle = pop ? '#ff4f9e' : '#e8c35a';
  g.lineWidth = m * 0.35;
  g.globalAlpha = pop ? 0.9 : 0.6;
  g.beginPath();
  g.arc(cx, cx, 4 * m, 0, 6.28);
  g.stroke();
  g.lineWidth = m * 0.12;
  g.beginPath();
  g.arc(cx, cx, 4.7 * m, 0, 6.28);
  g.stroke();
  g.fillStyle = g.strokeStyle;
  g.font = `900 ${Math.round(2.2 * m)}px 'Arial Black', Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('PIT 9', cx, cx);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 500; i++) {
    const a = rnd() * 6.28, r = rnd() * 5 * m;
    g.globalAlpha = 0.5;
    g.fillRect(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 2 + rnd() * m * 0.2, 1 + rnd() * 3);
  }
  g.globalCompositeOperation = 'destination-over';
  g.globalAlpha = 1;
  g.fillStyle = st.floor;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  floorCache[name] = tex;
  return tex;
}

// ---------------------------------------------------------------- mesh helpers (boxes, cylinders, capsules only)
const sharedMats = new Map();
function mat(role, { shared = false, emissive = 0, transparent = false, opacity = 1 } = {}) {
  const key = `${role}|${emissive}|${opacity}`;
  if (shared && sharedMats.has(key)) return sharedMats.get(key);
  const m = new THREE.MeshStandardMaterial({ color: col(role), roughness: 0.85, metalness: 0.05, flatShading: true, transparent, opacity });
  if (emissive) m.emissive.set(col(role)), (m.emissiveIntensity = emissive);
  m.userData.role = role;
  if (shared) sharedMats.set(key, m);
  return m;
}
function mesh(geo, material, x = 0, y = 0, z = 0, name = '') {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}
const box = (w, h, d, role, x, y, z, opts) => mesh(new THREE.BoxGeometry(w, h, d), mat(role, opts), x, y, z);
const cyl = (r, h, role, x, y, z, opts, seg = 10) => mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(role, opts), x, y, z);
const cylZ = (r, h, role, x, y, z, opts) => {
  const m = cyl(r, h, role, x, y, z, opts);
  m.rotation.x = Math.PI / 2;
  return m;
};
const capsule = (r, len, role, x, y, z, opts) => mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat(role, opts), x, y, z);
function pivot(name, x, y, z, ...children) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

// ---------------------------------------------------------------- builders: id -> Object3D (faces +Z, feet at y=0)
const builders = {
  // Tamsin Holt, 1.7 m. Named children exist only to show states on the placeholder.
  player() {
    const armL = pivot('arm_l', 0.3, 1.38, 0, capsule(0.075, 0.45, 'suit', 0, -0.28, 0));
    const armR = pivot('arm_r', -0.3, 1.38, 0, capsule(0.075, 0.45, 'suit', 0, -0.28, 0));
    const rig = pivot('rig', 0, 0, 0,
      pivot('leg_l', 0.12, 0.85, 0, capsule(0.1, 0.6, 'suitDark', 0, -0.42, 0)),
      pivot('leg_r', -0.12, 0.85, 0, capsule(0.1, 0.6, 'suitDark', 0, -0.42, 0)),
      capsule(0.23, 0.45, 'suit', 0, 1.13, 0),
      capsule(0.13, 0.08, 'skin', 0, 1.56, 0),
      box(0.27, 0.08, 0.27, 'hair', 0, 1.67, -0.01),
      armL, armR,
      pivot('gun', 0, 1.15, 0.28, box(0.1, 0.13, 0.6, 'gun', 0, 0, 0.12)),
    );
    return pivot('player', 0, 0, 0, rig);
  },

  // Scrapling robot hound, 0.6 x 0.8 x 1.4. Parts: body, head, four legs.
  hound() {
    const leg = (name, x, z) => pivot(name, x, -0.05, z, cyl(0.07, 0.5, 'houndDark', 0, -0.25, 0), box(0.14, 0.08, 0.2, 'houndDark', 0, -0.48, 0.03));
    const head = pivot('head', 0, 0.12, 0.45,
      box(0.36, 0.3, 0.42, 'hound', 0, 0.02, 0.2),
      box(0.3, 0.1, 0.24, 'houndDark', 0, -0.13, 0.3), // jaw
      box(0.08, 0.06, 0.04, 'eye', 0.1, 0.08, 0.42, { emissive: 0.8 }),
      box(0.08, 0.06, 0.04, 'eye', -0.1, 0.08, 0.42, { emissive: 0.8 }),
      box(0.06, 0.14, 0.06, 'houndDark', 0.12, 0.22, 0.08),
      box(0.06, 0.14, 0.06, 'houndDark', -0.12, 0.22, 0.08),
    );
    const body = pivot('body', 0, 0.55, 0,
      box(0.5, 0.34, 0.9, 'hound', 0, 0, 0),
      box(0.3, 0.08, 0.6, 'houndDark', 0, 0.2, -0.05),
      cylZ(0.04, 0.3, 'houndDark', 0, 0.12, -0.55), // tail stub
      head,
      leg('front_left_leg', 0.2, 0.32), leg('front_right_leg', -0.2, 0.32),
      leg('back_left_leg', 0.2, -0.32), leg('back_right_leg', -0.2, -0.32),
    );
    return pivot('hound', 0, 0, 0, body);
  },

  // The Foreman, 7.0 x 7.5 x 5.0. Every part is a group sitting on its hinge.
  // 'upper' is not a part: it lets the whole top lean without moving the legs.
  foreman() {
    const cannon = (name, x) => pivot(name, x, 1.0, 0.5,
      box(1.2, 1.2, 1.3, 'cannon', 0, 0, 0),
      cylZ(0.36, 3.0, 'cannon', 0, 0, 1.5),
      cylZ(0.45, 0.35, 'hullDark', 0, 0, 2.85),
    );
    const leg = (name, x, z) => pivot(name, x, 4.0, z,
      box(0.9, 0.9, 0.9, 'hullDark', 0, 0, 0),
      cyl(0.35, 3.6, 'leg', 0, -2.0, 0),
      box(1.0, 0.4, 1.4, 'hullDark', 0, -3.8, 0.15),
    );
    const upper = pivot('upper', 0, 4.0, 0,
      pivot('hull', 0, 1.1, 0,
        box(5.0, 2.6, 4.0, 'hull', 0, 0, 0),
        box(3.4, 0.5, 3.0, 'hullDark', 0, 1.4, 0),
        box(1.6, 0.5, 0.6, 'hullDark', 0, 1.2, 2.0), // brow
      ),
      cannon('left_cannon', 3.2), cannon('right_cannon', -3.2),
      pivot('missile_pod', 0, 2.5, -1.2,
        box(2.2, 1.0, 1.6, 'pod', 0, 0.5, 0),
        pivot('lid', 0, 1.0, -0.8, box(2.2, 0.15, 1.6, 'hullDark', 0, 0.07, 0.8)),
      ),
      pivot('armour_plate', 0, 1.6, 2.5, box(3.0, 2.6, 0.4, 'armour', 0, -1.3, 0.2), box(1.0, 0.5, 0.1, 'hullDark', 0, -0.6, 0.42)),
      pivot('core', 0, 0.4, 2.2, cylZ(0.6, 0.5, 'core', 0, 0, 0, { emissive: 0.6 })),
    );
    return pivot('foreman', 0, 0, 0, upper,
      leg('front_left_leg', 2.4, 1.6), leg('front_right_leg', -2.4, 1.6),
      leg('back_left_leg', 2.4, -1.6), leg('back_right_leg', -2.4, -1.6));
  },

  // Tamsin's gun on its own (0.14 x 0.14 x 0.6, muzzle toward +Z); grip at the origin
  blaster: () => pivot('blaster', 0, 0, 0, box(0.1, 0.13, 0.6, 'gun', 0, 0, 0.12), box(0.05, 0.14, 0.08, 'gun', 0, -0.1, -0.02)),
  bolt: () => pivot('bolt', 0, 0, 0, box(0.12, 0.12, 0.6, 'bolt', 0, 0, 0, { shared: true, emissive: 1 })),
  shell: () => withChildRotX(pivot('shell', 0, 0, 0, capsule(0.175, 0.25, 'shell', 0, 0, 0, { shared: true, emissive: 0.6 }))),
  missile() {
    return withChildRotX(pivot('missile', 0, 0, 0,
      capsule(0.15, 0.7, 'missile', 0, 0, 0, { shared: true }),
      box(0.4, 0.04, 0.2, 'marker', 0, -0.3, 0, { shared: true }),
    ));
  },
  missile_marker() {
    const g = pivot('missile_marker', 0, 0, 0);
    const m = cyl(2, 0.02, 'marker', 0, 0.03, 0, { transparent: true, opacity: 0.35 }, 24);
    m.castShadow = false;
    const inner = cyl(1, 0.02, 'marker', 0, 0.05, 0, { transparent: true, opacity: 0.6 }, 24);
    inner.name = 'fill';
    inner.castShadow = false;
    g.add(m, inner);
    return g;
  },
  beam() {
    const b = box(0.3, 0.3, 14, 'beam', 0, 0, 7, { emissive: 1.2, transparent: true, opacity: 0.85 });
    b.castShadow = false;
    return pivot('beam', 0, 0, 0, b);
  },
  stomp_ring() {
    const r = mesh(new THREE.CylinderGeometry(1, 1, 0.3, 32, 1, true), mat('ring', { emissive: 0.8, transparent: true, opacity: 0.8 }), 0, 0.15, 0);
    r.material.side = THREE.DoubleSide;
    r.castShadow = false;
    return pivot('stomp_ring', 0, 0, 0, r);
  },
  // hit feedback, drawn as added light so it never bleaches the paint underneath
  spark: () => glowing(pivot('spark', 0, 0, 0, box(0.05, 0.05, 0.28, 'spark', 0, 0, 0, { shared: true, emissive: 2 }))),
  spark_dim: () => glowing(pivot('spark_dim', 0, 0, 0, box(0.04, 0.04, 0.18, 'sparkDim', 0, 0, 0, { shared: true, emissive: 1 }))),
  hit_flash: () => glowing(pivot('hit_flash', 0, 0, 0, capsule(0.2, 0.05, 'hitFlash', 0, 0, 0, { emissive: 2, transparent: true, opacity: 1 }))),
  muzzle_flash: () => glowing(withChildRotX(pivot('muzzle_flash', 0, 0, 0, capsule(0.09, 0.22, 'bolt', 0, 0, 0.12, { emissive: 2, transparent: true, opacity: 1 })))),
  blast() {
    const b = cyl(1, 0.6, 'blast', 0, 0.3, 0, { emissive: 1, transparent: true, opacity: 0.8 }, 16);
    b.castShadow = false;
    return pivot('blast', 0, 0, 0, b);
  },
  repair_kit: () => pivot('repair_kit', 0, 0, 0,
    box(0.5, 0.3, 0.35, 'kit', 0, 0.15, 0),
    box(0.3, 0.08, 0.02, 'kitCross', 0, 0.15, 0.18), box(0.08, 0.22, 0.02, 'kitCross', 0, 0.15, 0.18),
    box(0.25, 0.05, 0.05, 'hullDark', 0, 0.33, 0)),
  crate: () => pivot('crate', 0, 0, 0,
    box(1.3, 0.9, 1.3, 'crate', 0, 0.45, 0),
    box(0.9, 0.6, 0.9, 'crate', 0.08, 1.2, -0.08),
    box(1.32, 0.12, 1.32, 'crateBand', 0, 0.75, 0),
    box(0.5, 0.3, 0.02, 'crateBand', 0, 0.45, 0.66)),
  wall: () => pivot('wall', 0, 0, 0,
    box(6.3, 2.2, 1.0, 'wall', 0, 1.1, 0),
    box(2.0, 0.5, 0.8, 'wallTop', -1.4, 2.4, 0),
    cyl(0.5, 0.9, 'wallTop', 1.8, 2.5, 0.1)),
  // the arena floor: a disc with a hand-painted texture drawn in code (see floorTexture below)
  floor() {
    const f = mesh(new THREE.CircleGeometry(20.5, 64), new THREE.MeshStandardMaterial({ map: floorTexture(styleName), roughness: 0.95, metalness: 0 }), 0, 0, 0);
    f.rotation.x = -Math.PI / 2;
    f.castShadow = false;
    f.material.userData.floor = true;
    return pivot('floor', 0, 0, 0, f);
  },
};
// Effects that should read as light: added on top of what is behind them, no shadows, no depth writes.
function glowing(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    o.material.blending = THREE.AdditiveBlending;
    o.material.depthWrite = false;
    o.material.transparent = true;
  });
  return g;
}
// Capsules and cylinders are built along Y; turn the geometry so the object's length lies along +Z.
function withChildRotX(g) {
  for (const c of g.children) c.rotation.x += Math.PI / 2;
  return g;
}

// ---------------------------------------------------------------- views
const KICK_TIME = 0.12; // seconds a hit jolt lasts
const _kq = new THREE.Quaternion();
const STATE_TINT = {
  player: { roll: '#35f0ff', hurt: '#ff2020', knocked_down: '#801010', cheer: '#3cff6e' },
  hound: { circle: '#ffd23f', windup: '#ff2020', pounce: '#ff5a00', recover: '#4060ff', spawn: '#ffffff' },
  foreman: { dormant: '#000000', waking: '#35f0ff', stagger: '#ffffff', destroyed: '#300000' },
};
// On painted models a whole-body tint bleaches the paint, so models only light up what matters:
// the hound's head just before and during a pounce. Everything else shows through movement.
const MODEL_TINT = {
  hound: { windup: { color: '#ff2020', amount: 0.3, parts: ['head'] }, pounce: { color: '#ff5a00', amount: 0.22, parts: ['head'] } },
  foreman: {},
};
// Hit flicker on models brightens the paint's own colours (added white would turn dark paint grey), at most 5 a second
const MODEL_FLASH = { brighten: 0.6, time: 0.07, gap: 0.2 };
const MODEL_GLOW = 0.6; // attack warning glows are softer on painted parts

// Also used for model-based parts views (hound, Foreman): pass the finished root in.
export class PlaceholderView {
  constructor(id, root = builders[id]()) {
    this.id = id;
    this.root = root;
    this.parts = {};
    this.meshes = [];
    this.root.traverse((o) => {
      if (o.name) this.parts[o.name] = o;
      if (o.isMesh) this.meshes.push(o);
    });
    this.state = '';
    this.flashT = 0;
    this.glow = {};
    this.kicks = {};
    this.tinted = !!STATE_TINT[id];
    this.t = 0;
  }
  part(name) {
    return this.parts[name];
  }
  // a part that breaks off: gameplay stops finding it by name, the object is returned for debris
  // A hit jolts one part back along the shot and gives it a short orange glow (the rest of the body keeps its paint).
  kick(name, worldDir, amount = 0.07) {
    const part = this.parts[name];
    if (!part) return;
    const d = worldDir.clone().setY(0).normalize();
    const old = this.kicks[name];
    // a new hit restarts the jolt but keeps track of the offset already applied, so it can be undone
    this.kicks[name] = { d, amount, t: 0, nodes: old?.nodes, applied: old?.applied };
  }
  // The jolt moves only what is drawn inside the part (its children), never the part's own pivot: gameplay reads the
  // pivots for hit tests, so a looks-only jolt must not move them.
  applyKicks(dt) {
    for (const [name, k] of Object.entries(this.kicks)) {
      const part = this.parts[name];
      k.nodes ||= part ? [...part.children] : [];
      // undo last frame's offset on every axis the game did not rewrite since
      if (k.applied) for (const n of k.nodes) for (const ax of ['x', 'y', 'z']) if (n.position[ax] === n.userData.kickWritten?.[ax]) n.position[ax] -= k.applied[ax];
      k.t += dt;
      if (!part || k.t > KICK_TIME) {
        delete this.kicks[name];
        continue;
      }
      // out fast, back smoothly; the offset is turned into the part's own space
      const f = Math.sin(Math.min(1, k.t / KICK_TIME) * Math.PI) * (1 - k.t / KICK_TIME);
      part.getWorldQuaternion(_kq);
      k.applied = k.d.clone().applyQuaternion(_kq.invert()).multiplyScalar(k.amount * f * 2.2);
      for (const n of k.nodes) n.position.add(k.applied), (n.userData.kickWritten = n.position.clone());
    }
  }
  kickGlow(m) {
    for (let a = m.parent; a && a !== this.root; a = a.parent) {
      const k = this.kicks[a.name];
      if (k) return 0.45 * (1 - k.t / KICK_TIME);
    }
    return 0;
  }
  detachPart(name) {
    const obj = this.parts[name];
    if (!obj) return null;
    obj.traverse((o) => {
      if (o.name) delete this.parts[o.name];
    });
    const gone = new Set();
    obj.traverse((o) => o.isMesh && gone.add(o));
    this.meshes = this.meshes.filter((m) => !gone.has(m));
    return obj;
  }
  setState(s) {
    if (s !== this.state) (this.state = s), (this.t = 0);
  }
  flash(sec = 0.1) {
    if (this.isModel) {
      // models: a short fading flicker, never more than one every MODEL_FLASH.gap seconds
      if (this.t - (this.lastFlash ?? -9) < MODEL_FLASH.gap) return;
      this.lastFlash = this.t;
      this.flashT = MODEL_FLASH.time;
      return;
    }
    this.flashT = Math.max(this.flashT, sec);
  }
  setGlow(partName, amount) {
    this.glow[partName] = amount;
  }
  update(dt, info = {}) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.id === 'player') return animatePlayer(this, info);
    this.applyKicks(dt);
    if (!this.tinted) return;
    const tint = this.isModel ? MODEL_TINT[this.id]?.[this.state] : STATE_TINT[this.id][this.state];
    const dark = this.state === 'dormant' || this.state === 'destroyed';
    for (const m of this.meshes) {
      const mat = m.material;
      const e = mat.emissive;
      const ud = mat.userData;
      // remember the material's own glow and colour once, so every state can go back to exactly that
      if (!ud.baseGlow) (ud.baseGlow = e.clone()), (ud.baseGlowI = mat.emissiveIntensity), (ud.baseColor = mat.color.clone());
      let part = m.parent;
      while (part && !this.glow[part.name] && part !== this.root) part = part.parent;
      const g = part && this.glow[part.name];
      // dormant / destroyed: darken the colour (works for textured models too)
      mat.color.copy(ud.baseColor).multiplyScalar(dark ? 0.45 : 1);
      if (this.isModel) {
        const flash = this.flashT > 0 ? this.flashT / MODEL_FLASH.time : 0;
        if (flash > 0) mat.color.copy(ud.baseColor).multiplyScalar(1 + MODEL_FLASH.brighten * flash);
        const onPart = tint && !dark && (!tint.parts || tint.parts.includes(m.parent?.name));
        const glowAmt = g ? (g.amount ?? g) * (part.name === 'core' ? 1 : MODEL_GLOW) : 0; // the code-made core keeps its full glow
        const kg = this.kickGlow(m);
        if (glowAmt > 0) e.set(g.color || '#ff3000'), (mat.emissiveIntensity = glowAmt);
        else if (kg > 0) e.set('#ff8a30'), (mat.emissiveIntensity = kg);
        else if (onPart) e.set(tint.color), (mat.emissiveIntensity = tint.amount);
        else e.copy(ud.baseGlow), (mat.emissiveIntensity = dark ? ud.baseGlowI * 0.1 : ud.baseGlowI);
        continue;
      }
      if (this.flashT > 0) e.set('#ffffff'), (mat.emissiveIntensity = 0.9);
      else if (g) e.set(g.color || '#ff3000'), (mat.emissiveIntensity = g.amount ?? g);
      else if (tint && !dark) e.set(tint), (mat.emissiveIntensity = 0.35);
      else e.copy(ud.baseGlow), (mat.emissiveIntensity = dark ? ud.baseGlowI * 0.1 : ud.baseGlowI);
    }
  }
}

// Placeholder "animation" for Tamsin: leg swing, lean, roll spin, lying down, arms up.
function animatePlayer(v, info) {
  const P = v.parts;
  const rig = P.rig;
  const phase = info.runPhase ?? 0;
  const speed = info.speed01 ?? 0; // 0..1 of full run speed
  rig.rotation.set(0, 0, 0);
  rig.position.set(0, 0, 0);
  const swing = Math.sin(phase) * 0.7 * speed;
  P.leg_l.rotation.x = swing;
  P.leg_r.rotation.x = -swing;
  // arms hold the gun forward; cheer raises them
  P.arm_l.rotation.set(-1.25, 0, 0.25);
  P.arm_r.rotation.set(-1.35, 0, -0.1);
  P.gun.visible = true;
  // lean into the run direction (relative to where she faces)
  rig.rotation.x = 0.18 * (info.moveLocalZ ?? 0) * speed;
  rig.rotation.z = -0.18 * (info.moveLocalX ?? 0) * speed;
  P.gun.position.z = 0.28 - 0.08 * (info.recoil ?? 0);
  switch (v.state) {
    case 'roll': {
      const k = info.rollT ?? 0;
      rig.rotation.x = k * Math.PI * 2;
      // tumble around the hips (y = 0.85) and dip toward the ground mid-roll
      rig.position.y = 0.85 - 0.85 * Math.cos(rig.rotation.x) - 0.4 * Math.sin(k * Math.PI);
      rig.position.z = -0.85 * Math.sin(rig.rotation.x);
      break;
    }
    case 'hurt':
      rig.rotation.x = -0.35;
      break;
    case 'knocked_down': {
      const k = Math.min(1, v.t / 0.4);
      rig.rotation.x = (-Math.PI / 2) * k;
      rig.position.y = 0.15 * k;
      P.arm_l.rotation.set(-2.6, 0, 0.6);
      P.arm_r.rotation.set(-2.6, 0, -0.6);
      break;
    }
    case 'cheer':
      P.arm_l.rotation.set(0, 0, 2.7 + Math.sin(v.t * 10) * 0.2);
      P.arm_r.rotation.set(0, 0, -2.7 - Math.sin(v.t * 10) * 0.2);
      rig.position.y = Math.abs(Math.sin(v.t * 6)) * 0.25;
      P.gun.visible = false;
      break;
  }
  // blink while protected after a hit
  const blink = info.invuln > 0 && v.state !== 'roll' && Math.floor(info.invuln * 16) % 2 === 0;
  v.root.visible = !blink;
  // gun flash while shooting
  const gunMesh = P.gun.children[0];
  gunMesh.material.emissive.set('#ffe070');
  gunMesh.material.emissiveIntensity = info.shootFlash ?? 0;
  const tint = STATE_TINT.player[v.state];
  for (const m of v.meshes) {
    if (m === gunMesh) continue;
    if (v.flashT > 0) m.material.emissive.set('#ffffff'), (m.material.emissiveIntensity = 0.8);
    else if (tint) m.material.emissive.set(tint), (m.material.emissiveIntensity = 0.4);
    else m.material.emissiveIntensity = 0;
  }
}

export function createView(id) {
  if (!builders[id]) throw new Error(`No builder registered for id "${id}"`);
  return new PlaceholderView(id);
}

// Later: registerBuilder(id, viewFactory) lets a GLB model replace a placeholder.
const overrides = new Map();
export function registerView(id, factory) {
  overrides.set(id, factory);
}
// When models are on, the model provider returns a model view for ids that have a loaded model.
let modelProvider = null;
export function setModelProvider(fn) {
  modelProvider = fn;
}
export function view(id) {
  if (overrides.has(id)) return overrides.get(id)();
  return modelProvider?.(id) || createView(id);
}
