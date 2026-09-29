// All gameplay numbers from GDD.md live here. Distances in metres, times in seconds.

export const ARENA = { minX: -14, maxX: 14, minZ: -3.0, maxZ: 3.2, spawnX: 16 };

export const CAMERA = { fov: 40, height: 5.5, distance: 11, lookHeight: 1, clampX: 8, follow: 5 };

// armor: jabs and crosses still hurt but never stagger this fighter or stop its swing (only attacks with breaksArmor do).
export const FIGHTERS = {
  hero:        { hp: 100, speed: 3.2, runSpeed: 5.6, radius: 0.28, stagger: 0.35, invuln: 0.8, poise: 1 },
  thug_skinny: { hp: 30,  speed: 2.6, radius: 0.25, stagger: 0.4,  invuln: 0.2, attackDelay: 1.0, poise: 1 },
  thug_kicker: { hp: 26,  speed: 2.8, radius: 0.25, stagger: 0.4,  invuln: 0.2, attackDelay: 1.3, poise: 1 },
  thug_fat:    { hp: 70,  speed: 1.3, radius: 0.5,  stagger: 0.3,  invuln: 0.2, attackDelay: 1.8, poise: 0.9, armor: true },
  thug_crusher:{ hp: 90,  speed: 1.2, radius: 0.52, stagger: 0.3,  invuln: 0.2, attackDelay: 2.0, poise: 0.8, armor: true },
  boss:        { hp: 160, speed: 1.6, radius: 0.6,  stagger: 0.25, invuln: 0.2, attackDelay: 2.2, enragedDelay: 1.5, poise: 0.6, armor: true },
};

// hit = [start, end] as a fraction of the animation's length, measured on the Tripo clips
//   (where the fist or foot is really out; see lab.html).
// speed = animation playback speed. The attack lasts clipLength / speed.
// reach = how far past the target's edge the hit still counts (m), set so the fist or foot
//   visibly touches the target when the hit counts.
// lunge = Volt steps up to this far forward during the wind-up, stopping when the target's centre is
//   closeTo metres away (where the fist or foot meets the body).
// cancel = from this fraction on, a queued attack starts (or walking cancels the follow-through).
// chainFrom = when chained in the combo, the clip starts here (skips a slow wind-up).
// stun = how long the target is stunned (s), times the target's poise.
// react = which hit reaction the target plays: head (snaps back) or body (doubles over).
// breaksArmor = staggers Slab and Big Anvil (see FIGHTERS armor).
// depth = how far in Z the hit reaches (default HIT_DEPTH); sweeping moves reach wider.
// dash = the step-in happens even with nobody in front (running attacks).
// charge = the attacker keeps moving forward at this speed (m/s) during the attack.
// launchChance = chance (per target hit) that the hit sends the target flying; otherwise the
//   noLaunch values are used instead (a solid hit you can follow up with a combo).
// recover = after a finisher, the target cannot be hit again for this long (s), so it can get
//   back into the fight instead of being juggled from one combo into the next.
export const ATTACKS = {
  jab:            { anim: 'box_01',        damage: 8,  hit: [0.25, 0.35], reach: 0.55, knockback: 0.12, hitstop: 0.07, speed: 5,   lunge: 0.7,  closeTo: 0.62, cancel: 0.45, stun: 0.45, react: 'head' },
  cross:          { anim: 'box_02',        damage: 10, hit: [0.85, 0.98], reach: 0.6,  knockback: 0.18, hitstop: 0.08, speed: 5,   lunge: 0.35, closeTo: 0.65, cancel: 0.97, stun: 0.5,  react: 'body', chainFrom: 0.55 },
  hook:           { anim: 'box_03',        damage: 16, hit: [0.24, 0.30], reach: 0.55, knockback: 1.5,  hitstop: 0.12, speed: 4,   lunge: 0.35, closeTo: 0.6,  cancel: 0.6,   stun: 0.8,  react: 'head', recover: 0.8, breaksArmor: true },
  kick:           { anim: 'front_kick_01', damage: 14, hit: [0.45, 0.62], reach: 0.85, knockback: 1.2,  hitstop: 0.12, speed: 3.5, lunge: 0.3,  closeTo: 1.0,  cancel: 0.7,   stun: 0.7,  react: 'body', recover: 0.6, breaksArmor: true },
  // J, J, K: jab, cross, then a sweeping kick that hits everyone in front of Volt.
  combo_kick:     { anim: 'front_kick_01', damage: 16, hit: [0.45, 0.62], reach: 1.0,  knockback: 1.8,  hitstop: 0.12, speed: 3.5, lunge: 0.3,  closeTo: 1.0,  cancel: 0.75, stun: 0.8,  react: 'body', recover: 0.8, breaksArmor: true, chainFrom: 0.25, depth: 1.1 },
  // J while running: a charging hook. K while running: a flying kick through a crowd.
// Each sends its target flying only half the time (launchChance).
  dash_hook:      { anim: 'box_03',        damage: 14, hit: [0.24, 0.30], reach: 0.6,  knockback: 1.8,  hitstop: 0.12, speed: 3,   lunge: 1.4,  closeTo: 0.6,  cancel: 0.7,  stun: 0.8,  react: 'head', recover: 0.8, breaksArmor: true, dash: true,
                    launchChance: 0.5, noLaunch: { knockback: 0.35, stun: 0.5, recover: 0, hitstop: 0.08 } },
  flying_kick:    { anim: 'front_kick_01', damage: 16, hit: [0.40, 0.62], reach: 0.9,  knockback: 2.2,  hitstop: 0.12, speed: 3,   lunge: 2.0,  closeTo: 1.0,  cancel: 0.75, stun: 0.8,  react: 'body', recover: 0.8, breaksArmor: true, dash: true, depth: 1.0,
                    launchChance: 0.5, noLaunch: { knockback: 0.35, stun: 0.5, recover: 0, hitstop: 0.08 } },
  // An enemy sent flying knocks over the enemies it crashes into.
  bump:           { damage: 6, knockback: 1.0, hitstop: 0.06, stun: 0.5, react: 'body', breaksArmor: true },
  sprat_jab:      { anim: 'box_01',        damage: 6,  hit: [0.22, 0.35], reach: 1.0, knockback: 0.4, hitstop: 0.07, speed: 2.4, react: 'head' },
  slab_swing:     { anim: 'slash',         damage: 15, hit: [0.30, 0.38], reach: 1.3, knockback: 1.0, hitstop: 0.07, speed: 3.3, react: 'head' },
  sprat_cross:    { anim: 'box_02',        damage: 6,  hit: [0.85, 0.98], reach: 1.0, knockback: 0.4, hitstop: 0.07, speed: 3,   react: 'body', chainFrom: 0.55 },
  flick_kick:     { anim: 'front_kick_01', damage: 8,  hit: [0.45, 0.62], reach: 1.4, knockback: 0.8, hitstop: 0.08, speed: 2.6, react: 'body' },
  slab_hook:      { anim: 'box_03',        damage: 12, hit: [0.24, 0.30], reach: 1.0, knockback: 0.9, hitstop: 0.1,  speed: 2.0, react: 'head' },
  crusher_cross:  { anim: 'box_02',        damage: 10, hit: [0.85, 0.98], reach: 1.1, knockback: 0.5, hitstop: 0.08, speed: 2.5, react: 'body', chainFrom: 0.55 },
  crusher_hook:   { anim: 'box_03',        damage: 16, hit: [0.24, 0.30], reach: 1.2, knockback: 1.3, hitstop: 0.12, speed: 2.0, react: 'head' },
  crusher_stomp:  { anim: 'front_kick_01', damage: 18, hit: [0.45, 0.62], reach: 1.4, knockback: 2.0, hitstop: 0.12, speed: 2.2, react: 'body' },
  anvil_smash:    { anim: 'slash',         damage: 24, hit: [0.30, 0.38], reach: 1.6, knockback: 2.2, hitstop: 0.14, speed: 2.8, react: 'head' },
  slab_charge:    { anim: 'run',           damage: 12, hit: [0.0, 1.0],   reach: 0.45, knockback: 1.6, hitstop: 0.1,  speed: 0.9, react: 'body', charge: 4.5 },
  anvil_haymaker: { anim: 'box_03',        damage: 18, hit: [0.22, 0.30], reach: 1.5, knockback: 1.2, hitstop: 0.12, speed: 1.8, react: 'head' },
  anvil_kick:     { anim: 'front_kick_01', damage: 22, hit: [0.30, 0.45], reach: 1.8, knockback: 1.8, hitstop: 0.12, speed: 2.3, react: 'body' },
};

export const COMBO = ['jab', 'cross', 'hook'];
export const COMBO_GRACE = 0.25;   // time after an attack ends to continue the combo
export const COMBO_COUNT_GAP = 1.2; // hits closer than this (and Volt not hit in between) count as one combo
export const HIT_DEPTH = 0.6;      // max Z difference for a hit to connect
export const TURN_TIMEOUT = 4;     // an enemy that cannot reach Volt gives up its turn
// Focus: the enemy fighting Volt keeps the attack turn for the whole exchange.
export const ENGAGE = {
  minTime: [6, 10],   // after this long (random), it may step back...
  quietTime: 1.5,     // ...but only once no blow has been thrown or landed for this long
  leaveDistance: 4.5, // or when Volt has been this far away...
  leaveAfter: 1.2,    // ...for this long
};
export const WAIT_DISTANCE = [2.5, 3.5];

// Each wave: how many of each enemy, and how many may be on the street at once.
// The rest arrive as reinforcements when someone is knocked out. Arrival order is shuffled
// (Big Anvil always comes first in his wave).
export const WAVES = [
  { enemies: { thug_skinny: 2, thug_kicker: 2 },                              maxOnField: 3 },
  { enemies: { thug_skinny: 2, thug_kicker: 2, thug_fat: 1 },                 maxOnField: 4 },
  { enemies: { thug_skinny: 2, thug_kicker: 2, thug_fat: 1, thug_crusher: 1 }, maxOnField: 4 },
  { enemies: { boss: 1, thug_skinny: 1, thug_kicker: 1 },                     maxOnField: 3 },
];

// Randomness, so no two fights play the same.
export const RANDOM = {
  arrivalGap: [0.5, 1.8],       // seconds between two enemies arriving
  attackDelayJitter: 0.35,      // each enemy's delay between attacks varies by ±35%
  turnGapJitter: 0.4,           // the wave's pause between turns varies by ±40%
  repositionEvery: [2, 4.5],    // waiting enemies pick a new spot this often (s)
  slabRush: 0.3,                // chance Slab rushes in at 1.8× speed on its turn
};

// What each kind of enemy attacks with. On each turn (and after each attack) an enemy picks one
// of its attacks at random by weight, among those allowed at its distance from Volt (minDist /
// maxDist, in metres). `then` = follow-ups thrown straight away, each with its chance
// (enraged = chance below half health).
export const MOVESETS = {
  thug_skinny:  [{ name: 'sprat_jab', weight: 1, then: [{ name: 'sprat_cross', chance: 0.35 }, { name: 'sprat_jab', chance: 0.15 }] }],
  thug_kicker:  [{ name: 'flick_kick', weight: 3 },
                 { name: 'sprat_jab', weight: 2, maxDist: 1.0, then: [{ name: 'flick_kick', chance: 0.5 }] }],
  thug_fat:     [{ name: 'slab_swing', weight: 2 },
                 { name: 'slab_hook', weight: 1, maxDist: 1.1 }],
  thug_crusher: [{ name: 'crusher_cross', weight: 2, then: [{ name: 'crusher_hook', chance: 0.6 }] },
                 { name: 'crusher_stomp', weight: 1 }],
  boss:         [{ name: 'anvil_haymaker', weight: 2, maxDist: 1.5, then: [{ name: 'anvil_kick', chance: 0.25, enraged: 0.45 }] },
                 { name: 'anvil_kick', weight: 2, minDist: 1.5 },
                 { name: 'anvil_smash', weight: 1 }],
};
// Which special moves (below) each kind has.
export const SPECIALS = {
  thug_skinny:  ['dash', 'hop', 'feint', 'taunt'],
  thug_kicker:  ['dash', 'hop', 'taunt'],
  thug_fat:     ['charge'],
  thug_crusher: ['charge', 'taunt'],
  boss:         ['bull', 'roar'],
};

// Enemy special moves (chance per turn unless noted). A "!" above the enemy warns before the
// dash and the charges.
export const MOVES = {
  spratDash:   { chance: 0.4, minDistance: 2.0, warn: 0.25, speedScale: 2.4 },   // runs in and jabs
  spratHop:    { chance: 0.3, distance: 1.2, time: 0.28, cooldown: 1.5 },        // hops back out of a combo after a jab or cross
  spratFeint:  { chance: 0.2, at: 0.15, pause: 0.35 },                            // starts a jab, stops, then jabs for real
  slabCharge:  { chance: 0.35, minDistance: 2.0, maxDistance: 7, warn: 0.5, recover: 0.6 },   // belly charge (slab_charge)
  anvilCharge: { chance: 0.4, minDistance: 3.0, warn: 0.6, speed: 5.5 },         // bull charge ending in a haymaker
  anvilSummon: { atHp: 0.5, warn: 0.8 },                                          // at half health he roars and calls a Sprat
  taunt:       { chance: 0.15, time: 1.4, minDistance: 2.2 },                     // a waiting enemy sometimes taunts (and is open)
};

// Breakable crates: one hit breaks a crate; it drops food that restores health.
export const FOOD = { heal: 15, pickupRadius: 0.7 };

// Enemy steering: slow down when arriving, speed up gradually, so movement glides.
export const STEERING = { arrive: 3, accel: 10, walkAbove: 0.5, idleBelow: 0.25, runAbove: 3.2, runBelow: 2.6, separation: 1.2 };
// Pace per wave: turnGap = pause between enemy attacks (added after each attack, and between
// one enemy's turn ending and the next one starting);
// damage = multiplier on enemy damage. Wave 1 is gentle, then the pressure builds.
export const WAVE_PACE = [
  { turnGap: 2.0,  damage: 0.67 },
  { turnGap: 0.75, damage: 1 },
  { turnGap: 0.45, damage: 1 },
  { turnGap: 0.9,  damage: 0.75 },
];
export const BREATHER_HEAL = 30;
export const KO_FADE = { delay: 3.6, time: 0.5 };     // the defeat clip is lying down at about 3.6 s
export const END_SCREEN_DELAY = 3.8;

// Level layout. solid = fighters cannot walk through it.
export const PROPS = [
  { id: 'dumpster',    pos: [-8, 0, -3.4],   solid: true },
  { id: 'crate',       pos: [5, 0, -3.4],    solid: true, breakable: true },
  { id: 'crate',       pos: [6.1, 0, -3.4],  solid: true, breakable: true },
  { id: 'crate',       pos: [-5.6, 0, -3.4], solid: true, breakable: true },
  { id: 'trash_can',   pos: [-3, 0, -3.5],   solid: true },
  { id: 'trash_can',   pos: [12, 0, -3.5],   solid: true },
  { id: 'street_lamp', pos: [-11, 0, -3.7] },
  { id: 'street_lamp', pos: [10, 0, -3.7] },
  { id: 'floor',       pos: [0, 0, 0] },
  { id: 'wall',        pos: [0, 0, -4] },
];
