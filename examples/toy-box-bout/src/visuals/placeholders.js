// Greybox placeholders: only boxes, cylinders and capsules, sized from GDD.md.
// Every placeholder faces +Z. Every robot part's origin is its hinge / attach point.
import * as THREE from 'three';
import { register } from './registry.js';
import { paintColors } from './paints.js';
import { ARENA } from '../data.js';

// ---------- small helpers ----------
const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function mesh(g, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, x, y, z);
const cyl = (rt, rb, h, mat, x, y, z, seg = 16) =>
  mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat, x, y, z);
const cap = (r, len, mat, x, y, z) => mesh(geo(`p${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 12)), mat, x, y, z);
const rotX = (m, a) => ((m.rotation.x = a), m);
const rotZ = (m, a) => ((m.rotation.z = a), m);
function group(name, ...children) {
  const g = new THREE.Group();
  if (name) g.name = name;
  children.forEach((c) => g.add(c));
  return g;
}
function pivot(name, x, y, z, ...children) {
  const g = group(name, ...children);
  g.position.set(x, y, z);
  return g;
}

// One fresh set of materials per part, so each part can be painted and tinted on its own.
function materials(robot, paint) {
  const c = paintColors(robot, paint);
  const std = (color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 });
  const glow = new THREE.MeshStandardMaterial({ color: c.glow, emissive: c.glow, emissiveIntensity: 0.9, roughness: 0.3 });
  glow.userData.glow = true;
  return { main: std(c.main, c.rough), accent: std(c.accent, c.rough), dark: std(c.dark, 0.55), glow };
}

// ---------- heads (origin = neck, 0.14 x 0.14 x 0.12) ----------
const HEADS = {
  pipo(m) {
    return [
      cyl(0.02, 0.02, 0.03, m.dark, 0, 0.015, 0),
      box(0.11, 0.09, 0.1, m.main, 0, 0.065, 0),
      box(0.09, 0.05, 0.01, m.accent, 0, 0.065, 0.052),
      rotX(cyl(0.012, 0.012, 0.012, m.glow, -0.022, 0.07, 0.058), Math.PI / 2),
      rotX(cyl(0.012, 0.012, 0.012, m.glow, 0.022, 0.07, 0.058), Math.PI / 2),
      pivot('antenna', 0, 0.11, 0, cyl(0.004, 0.004, 0.02, m.dark, 0, 0.01, 0), cap(0.008, 0.004, m.accent, 0, 0.024, 0)),
    ];
  },
  kanazuchi(m) {
    return [
      cyl(0.022, 0.022, 0.03, m.dark, 0, 0.015, 0),
      box(0.13, 0.1, 0.11, m.main, 0, 0.07, 0),
      box(0.12, 0.035, 0.01, m.dark, 0, 0.075, 0.058),
      box(0.09, 0.008, 0.004, m.glow, 0, 0.075, 0.064),
      box(0.02, 0.02, 0.1, m.accent, 0, 0.13, 0),
    ];
  },
  popgun(m) {
    return [
      cyl(0.02, 0.02, 0.03, m.dark, 0, 0.015, 0),
      cyl(0.055, 0.06, 0.08, m.main, 0, 0.06, 0),
      cyl(0.045, 0.055, 0.02, m.accent, 0, 0.11, 0),
      rotX(cyl(0.018, 0.018, 0.05, m.dark, -0.03, 0.07, 0.05), Math.PI / 2),
      rotX(cyl(0.014, 0.014, 0.006, m.glow, -0.03, 0.07, 0.077), Math.PI / 2),
      rotX(cyl(0.01, 0.01, 0.006, m.glow, 0.025, 0.07, 0.058), Math.PI / 2),
    ];
  },
  hazama(m) {
    const horn = box(0.012, 0.05, 0.05, m.accent, 0, 0.12, 0.015);
    horn.rotation.x = -0.4;
    return [
      cyl(0.018, 0.018, 0.03, m.dark, 0, 0.015, 0),
      cap(0.045, 0.03, m.main, 0, 0.07, 0),
      box(0.07, 0.015, 0.012, m.glow, 0, 0.075, 0.042),
      horn,
    ];
  },
};

// ---------- cores (origin = hip top, 0.18 x 0.16 x 0.12) ----------
const CORES = {
  pipo: (m) => [
    box(0.15, 0.13, 0.11, m.main, 0, 0.07, 0),
    box(0.1, 0.06, 0.01, m.accent, 0, 0.075, 0.056),
    rotX(cyl(0.015, 0.015, 0.01, m.glow, 0, 0.075, 0.063), Math.PI / 2),
    box(0.18, 0.03, 0.07, m.dark, 0, 0.135, 0),
  ],
  kanazuchi: (m) => [
    box(0.17, 0.13, 0.12, m.main, 0, 0.07, 0),
    box(0.12, 0.04, 0.01, m.accent, 0, 0.04, 0.061),
    rotX(cyl(0.012, 0.012, 0.01, m.glow, 0, 0.1, 0.062), Math.PI / 2),
    box(0.18, 0.035, 0.08, m.dark, 0, 0.14, 0),
  ],
  popgun: (m) => [
    cyl(0.07, 0.075, 0.14, m.main, 0, 0.07, 0),
    cyl(0.077, 0.077, 0.02, m.accent, 0, 0.07, 0),
    rotX(cyl(0.015, 0.015, 0.01, m.glow, 0, 0.1, 0.072), Math.PI / 2),
    box(0.17, 0.03, 0.06, m.dark, 0, 0.14, 0),
  ],
  hazama: (m) => {
    const gem = box(0.03, 0.03, 0.01, m.glow, 0, 0.1, 0.066);
    gem.rotation.z = Math.PI / 4;
    return [cyl(0.085, 0.05, 0.14, m.main, 0, 0.07, 0, 6), gem, box(0.18, 0.025, 0.06, m.accent, 0, 0.145, 0)];
  },
};

// ---------- arms (origin = shoulder, hangs -Y, fist/muzzle faces +Z) ----------
function shoulder(m, thick = 0.02) {
  return [rotZ(cyl(0.03, 0.03, 0.05, m.dark, 0, -0.012, 0), Math.PI / 2), cyl(thick, thick, 0.07, m.main, 0, -0.06, 0)];
}
const ARMS = {
  spring_punch: (m) => [
    ...shoulder(m),
    cyl(0.016, 0.016, 0.03, m.accent, 0, -0.11, 0),
    pivot('fist', 0, -0.155, 0, box(0.055, 0.05, 0.06, m.main, 0, 0, 0), box(0.05, 0.012, 0.008, m.glow, 0, -0.008, 0.032)),
  ],
  cork_shooter: (m) => [
    ...shoulder(m),
    cyl(0.022, 0.022, 0.09, m.accent, 0, -0.135, 0),
    cyl(0.026, 0.026, 0.012, m.dark, 0, -0.18, 0),
    box(0.008, 0.03, 0.01, m.glow, 0, -0.12, 0.025),
  ],
  big_hammer: (m) => [
    ...shoulder(m, 0.025),
    pivot('tool', 0, -0.16, 0, box(0.07, 0.06, 0.08, m.accent, 0, 0, 0), box(0.05, 0.03, 0.004, m.glow, 0, 0, 0.042)),
  ],
  drill: (m) => [
    ...shoulder(m, 0.022),
    cyl(0.032, 0.032, 0.02, m.accent, 0, -0.105, 0),
    box(0.01, 0.01, 0.006, m.glow, 0, -0.105, 0.033),
    pivot('drill_tip', 0, -0.115, 0, cyl(0.03, 0.003, 0.08, m.accent, 0, -0.04, 0, 8), box(0.062, 0.006, 0.006, m.dark, 0, -0.02, 0)),
  ],
  twin_pop: (m) => [
    ...shoulder(m),
    box(0.06, 0.04, 0.05, m.main, 0, -0.1, 0),
    cyl(0.013, 0.013, 0.09, m.dark, -0.016, -0.155, 0),
    cyl(0.013, 0.013, 0.09, m.dark, 0.016, -0.155, 0),
    box(0.02, 0.01, 0.006, m.glow, 0, -0.1, 0.027),
  ],
  lid_shield: (m, s) => [
    ...shoulder(m),
    box(0.035, 0.08, 0.04, m.main, 0, -0.13, 0),
    pivot('shield', s * 0.028, -0.1, 0, box(0.012, 0.17, 0.08, m.accent, 0, 0, 0), box(0.004, 0.04, 0.04, m.glow, s * 0.007, 0, 0)),
    box(0.012, 0.012, 0.006, m.glow, 0, -0.14, 0.022),
  ],
  ruler_saber: (m) => [
    ...shoulder(m),
    box(0.03, 0.03, 0.03, m.dark, 0, -0.105, 0),
    pivot('blade', 0, -0.12, 0, box(0.01, 0.09, 0.035, m.accent, 0, -0.045, 0), box(0.004, 0.08, 0.004, m.glow, 0, -0.045, 0.019)),
  ],
  bottle_rocket: (m) => [
    ...shoulder(m),
    cyl(0.03, 0.03, 0.11, m.main, 0, -0.125, 0),
    cyl(0.018, 0.004, 0.03, m.accent, 0, -0.19, 0),
    box(0.012, 0.03, 0.006, m.glow, 0, -0.12, 0.031),
  ],
};

// ---------- legs (origin = centre of the feet, 0.20 x 0.20 x 0.14) ----------
const LEGS = {
  pipo(m) {
    const leg = (name, x) =>
      pivot(
        name, x, 0.18, 0,
        cyl(0.024, 0.022, 0.08, m.main, 0, -0.045, 0),
        cyl(0.026, 0.026, 0.02, m.accent, 0, -0.09, 0),
        cyl(0.022, 0.026, 0.06, m.main, 0, -0.13, 0),
        box(0.06, 0.025, 0.09, m.accent, 0, -0.1675, 0.012),
        box(0.02, 0.008, 0.004, m.glow, 0, -0.165, 0.058),
      );
    return [box(0.15, 0.035, 0.09, m.dark, 0, 0.185, 0), leg('leg_l', 0.05), leg('leg_r', -0.05)];
  },
  kanazuchi(m) {
    const leg = (name, x) =>
      pivot(
        name, x, 0.18, 0,
        box(0.06, 0.09, 0.07, m.main, 0, -0.05, 0),
        box(0.065, 0.06, 0.075, m.accent, 0, -0.12, 0),
        box(0.075, 0.03, 0.12, m.dark, 0, -0.165, 0.015),
        box(0.03, 0.01, 0.004, m.glow, 0, -0.165, 0.076),
      );
    return [box(0.17, 0.04, 0.1, m.dark, 0, 0.18, 0), leg('leg_l', 0.055), leg('leg_r', -0.055)];
  },
  popgun(m) {
    const tread = (name, x) =>
      pivot(
        name, x, 0.045, 0,
        box(0.055, 0.09, 0.14, m.dark, 0, 0, 0),
        rotZ(cyl(0.03, 0.03, 0.06, m.accent, 0, 0, 0.045), Math.PI / 2),
        rotZ(cyl(0.03, 0.03, 0.06, m.accent, 0, 0, -0.045), Math.PI / 2),
        box(0.06, 0.015, 0.14, m.main, 0, 0.05, 0),
        box(0.03, 0.015, 0.004, m.glow, 0, 0.02, 0.071),
      );
    return [box(0.13, 0.06, 0.1, m.dark, 0, 0.16, 0), tread('tread_l', 0.068), tread('tread_r', -0.068)];
  },
  hazama(m) {
    return [
      box(0.12, 0.03, 0.09, m.dark, 0, 0.185, 0),
      pivot(
        'skirt', 0, 0.18, 0,
        cyl(0.05, 0.095, 0.12, m.main, 0, -0.065, 0, 6),
        cyl(0.098, 0.098, 0.015, m.accent, 0, -0.128, 0, 6),
        cyl(0.06, 0.06, 0.01, m.glow, 0, -0.14, 0),
        box(0.03, 0.02, 0.01, m.glow, 0, -0.06, 0.08),
      ),
    ];
  },
};

// Register every robot part: "<robot>_<slot>".
const ARM_ATTACK = {
  pipo_arm_r: 'spring_punch', pipo_arm_l: 'cork_shooter',
  kanazuchi_arm_r: 'big_hammer', kanazuchi_arm_l: 'drill',
  popgun_arm_r: 'twin_pop', popgun_arm_l: 'lid_shield',
  hazama_arm_r: 'ruler_saber', hazama_arm_l: 'bottle_rocket',
};
for (const robot of ['pipo', 'kanazuchi', 'popgun', 'hazama']) {
  register(`${robot}_head`, ({ paint = 'factory' } = {}) => group(null, ...HEADS[robot](materials(robot, paint))));
  register(`${robot}_core`, ({ paint = 'factory' } = {}) => group(null, ...CORES[robot](materials(robot, paint))));
  register(`${robot}_legs`, ({ paint = 'factory' } = {}) => group(null, ...LEGS[robot](materials(robot, paint))));
  for (const side of ['arm_r', 'arm_l']) {
    const id = `${robot}_${side}`;
    const s = side === 'arm_r' ? -1 : 1; // outward direction along X
    register(id, ({ paint = 'factory' } = {}) => group(null, ...ARMS[ARM_ATTACK[id]](materials(robot, paint), s)));
  }
}

// ---------- arena ----------
function matTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const cols = ['#f4e3b5', '#bfe3f0'];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    g.fillStyle = cols[(i + j) % 2];
    g.fillRect(i * 102.4, j * 102.4, 102.4, 102.4);
  }
  g.strokeStyle = '#e25b4a';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(256, 256, 70, 0, Math.PI * 2);
  g.stroke();
  g.strokeRect(12, 12, 488, 488);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
register('arena_toybox', () => {
  const s = ARENA.half * 2;
  const floorMat = new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xb9814a, roughness: 0.6 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.4 });
  const room = new THREE.MeshStandardMaterial({ color: 0x5a4a6a, roughness: 0.95 });
  const h = ARENA.wallHeight;
  const t = ARENA.wallThickness;
  const o = ARENA.half + t / 2;
  const floor = box(s, 0.02, s, floorMat, 0, -0.01, 0);
  floor.castShadow = false;
  const outside = box(40, 0.02, 40, room, 0, -0.04, 0);
  outside.castShadow = false;
  const walls = [
    box(s + 2 * t, h, t, wood, 0, h / 2, o),
    box(s + 2 * t, h, t, wood, 0, h / 2, -o),
    box(t, h, s, wood, o, h / 2, 0),
    box(t, h, s, wood, -o, h / 2, 0),
    box(s + 2 * t, 0.03, t + 0.01, rim, 0, h, o),
    box(s + 2 * t, 0.03, t + 0.01, rim, 0, h, -o),
    box(t + 0.01, 0.03, s, rim, o, h, 0),
    box(t + 0.01, 0.03, s, rim, -o, h, 0),
  ];
  return group('arena', outside, floor, ...walls);
});

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f1d29a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.fillRect(10, 10, 108, 108);
  g.fillStyle = '#fffaf0';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
register('toy_block', ({ letter = 'A', color = '#e25b4a' } = {}) => {
  const b = ARENA.block;
  const side = new THREE.MeshStandardMaterial({ color: 0xe8c48a, roughness: 0.6 });
  const face = new THREE.MeshStandardMaterial({ map: letterTexture(letter, color), roughness: 0.5 });
  // BoxGeometry faces: +X, -X, +Y, -Y, +Z, -Z. The letter face is +Z.
  const m = mesh(new THREE.BoxGeometry(b, b, b), [side, side, side, side, face, side], 0, b / 2, 0);
  return group('toy_block', m);
});

// ---------- projectiles (fly along +Z) ----------
register('cork_pellet', () => {
  const m = new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.8 });
  return group('cork_pellet', rotX(cyl(0.015, 0.015, 0.04, m, 0, 0, 0, 10), Math.PI / 2));
});
register('bottle_rocket', () => {
  const body = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.3 });
  const flame = new THREE.MeshStandardMaterial({ color: 0xffb13b, emissive: 0xff7a1a, emissiveIntensity: 1.5 });
  return group(
    'bottle_rocket',
    rotX(cyl(0.02, 0.02, 0.09, body, 0, 0, -0.005, 12), Math.PI / 2),
    rotX(cyl(0.002, 0.02, 0.04, red, 0, 0, 0.06, 12), Math.PI / 2),
    box(0.05, 0.004, 0.025, red, 0, 0, -0.045),
    rotX(cyl(0.012, 0.004, 0.03, flame, 0, 0, -0.065, 8), Math.PI / 2),
  );
});

// ---------- effects ----------
register('hit_spark', ({ color = 0xffe14a } = {}) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true });
  const g = group('hit_spark');
  for (let i = 0; i < 6; i++) {
    const s = box(0.018, 0.018, 0.018, m, 0, 0, 0);
    s.castShadow = false;
    g.add(s);
  }
  return g;
});
