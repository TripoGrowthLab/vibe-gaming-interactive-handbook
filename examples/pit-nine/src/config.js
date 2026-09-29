// Every gameplay number in one place. Values come from GDD.md.
export const STEP = 1 / 60; // fixed simulation step (rendering is interpolated between steps)

export const ARENA = {
  radius: 20, // wall ring centre line
  innerRadius: 19.2, // how far a character's centre may go
  crateRing: 10,
  crateSize: 1.3, // the crate model is 1.27 x 1.24 m
  crateAngles: [0, 60, 120, 180, 240, 300], // degrees, measured from +X toward +Z
  wallSegments: 20,
  houndSpawnAngles: [45, 135, 225, 315],
  houndSpawnRadius: 17.5,
  playerStart: [0, 8],
  foremanStart: [0, -13],
};

export const PLAYER = {
  maxHp: 100,
  radius: 0.3,
  speed: 6,
  accel: 40, // m/s² toward the wanted velocity
  fireInterval: 1 / 6,
  fireFraction: 0.3, // bolt leaves the gun at 0.3 of the shoot clip
  queueWindow: 1 / 6, // a click this long before the gun is ready is queued
  rollTime: 0.45,
  rollDistance: 5,
  rollInvulnFrom: 0.05,
  rollInvulnTo: 0.35,
  rollCooldown: 0.6,
  rollBuffer: 0.15,
  hurtTime: 0.3,
  invulnAfterHit: 0.8,
  gunHeight: 1.3, // the aimed blaster's muzzle is at 1.31 m
};

export const BOLT = { speed: 22, damage: 1, life: 1.4, radius: 0.08 };

export const HOUND = {
  hp: 6,
  radius: 0.55, // the model's nose reaches 0.70 m from its centre
  height: 1.0,
  chaseSpeed: 6.5,
  circleSpeed: 3,
  circleRadius: 5,
  engageRange: 6,
  spawnTime: 0.6,
  windupTime: 0.5,
  pounceTime: 0.6,
  pounceDistance: 7, // default; the leap stretches to where the player is heading, 3..8 m
  pounceMin: 3,
  pounceMax: 8,
  windupCreep: 2.5, // m/s it keeps creeping in while winding up
  pounceLead: 0.4, // seconds ahead it aims, so running straight away does not always escape
  pounceHitFrom: 0.25,
  pounceHitTo: 0.9,
  pounceHitRange: 1.1,
  pounceDamage: 12,
  recoverTime: 0.7,
  hurtTime: 0.15,
  boltPush: 0.4,
  hitFreeze: 0.04,
  invulnAfterHit: 0.08,
  kitDropChance: 0.3,
  maxAttackers: 1, // attack tokens shared by all hounds
};

// Hounds per wave, then the boss. Wave 1 is a gentle warm-up for a first-time player.
export const WAVES = [
  {
    count: 3,
    spawnGap: 3, // one at a time
    spawnAhead: 11, // drop in on screen, this far in front of the player (0 = at the arena wall)
    windupTime: 0.9, // slower, easier-to-read tell
    pounceDamage: 8,
    restAfterPounce: 2, // after any pounce, no hound may attack for this long
  },
  { count: 4, spawnGap: 0.45, spawnAhead: 0, windupTime: 0.5, pounceDamage: 12, restAfterPounce: 0.8 },
];
export const WAVE_GAP = 2; // seconds between waves
export const INTRO_TIME = 3; // seconds before wave 1 starts (controls are shown meanwhile)

export const FOREMAN = {
  bodyRadius: 3.6, // characters cannot walk under it (its feet sit 3.1-3.2 m from the middle)
  walkSpeed: 1.8,
  walkWhile: ['volley', 'missiles'], // it keeps walking toward Tamsin during these attacks
  turnSpeed: 0.9, // rad/s
  keepDistance: 9,
  wakeTime: 2,
  attackGap: 1.2,
  staggerTime: 1.2,
  stompRange: 6,
  partFreeze: 0.12,
  partInvuln: 0.08,
  partHp: { left_cannon: 20, right_cannon: 20, missile_pod: 25, armour_plate: 30, core: 40 },
  // which attack each breakable part gives
  partAttack: { left_cannon: 'volley', right_cannon: 'sweep', missile_pod: 'missiles', armour_plate: 'ram' },
  attackOrder: ['volley', 'sweep', 'missiles', 'ram'],
  attacks: {
    volley: { time: 2.0, shots: [0.5, 0.65, 0.8], damage: 12, shellSpeed: 14, lead: 0.6 }, // lead: how far ahead of a moving player it aims (0..1)
    sweep: { time: 2.5, from: 0.35, to: 0.85, damage: 18, arc: (120 * Math.PI) / 180, length: 14, width: 0.5 },
    missiles: { time: 3.0, count: 6, landFrom: 0.55, landTo: 0.9, warn: 1.2, damage: 20, radius: 2, spread: 5 },
    ram: { time: 1.8, from: 0.45, to: 0.7, distance: 8, damage: 25, push: 4, reach: 4.2 }, // reach > bodyRadius 3.6 + player radius 0.3
    stomp: { time: 1.4, from: 0.55, to: 0.65, damage: 15, radius: 5 },
  },
};

export const FEEL = {
  playerHitFreeze: 0.08,
  playerPush: 1.5,
  pushTime: 0.15,
};

export const KIT = { heal: 25, radius: 1.0 };

export const CAMERA = {
  tilt: (55 * Math.PI) / 180,
  bossTilt: (66 * Math.PI) / 180, // steeper in the boss fight so the tall Foreman fits
  distance: 18,
  portraitFactor: 1.25,
  // boss fight: the camera looks between Tamsin and the Foreman and moves back just enough to fit both
  bossPull: 0.45,
  bossMin: 16,
  bossMax: 28,
  aimLead: 2,
  follow: 6, // higher = snappier
};
