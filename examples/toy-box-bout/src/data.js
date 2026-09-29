// All gameplay numbers from GDD.md live here. Nothing in this file knows how things look.

// Slots: attach point measured from the centre of the feet; every part faces +Z.
// Facing +Z the robot's right is -X.
export const SLOTS = {
  legs: { attach: [0, 0, 0], box: [0.26, 0.2, 0.26] },
  core: { attach: [0, 0.2, 0], box: [0.2, 0.16, 0.2] },
  head: { attach: [0, 0.36, 0], box: [0.18, 0.14, 0.18] },
  arm_r: { attach: [-0.13, 0.33, 0], box: [0.12, 0.2, 0.14] },
  arm_l: { attach: [0.13, 0.33, 0], box: [0.12, 0.2, 0.14] },
};
export const SWAP_SLOTS = ['head', 'arm_r', 'arm_l', 'legs'];
export const PAINT_SLOTS = ['head', 'core', 'arm_r', 'arm_l', 'legs'];
export const LEGLESS_DROP = 0.14; // core sinks from 0.20 to 0.06 when legs break
export const ROBOT_RADIUS = 0.14;
export const ROBOT_HEIGHT = 0.5;

// Hit-routing centres in robot-local space (before any legless drop on the upper body).
export const PART_CENTRES = {
  head: [0, 0.43, 0],
  arm_r: [-0.13, 0.24, 0],
  arm_l: [0.13, 0.24, 0],
  legs: [0, 0.1, 0],
  core: [0, 0.28, 0],
};

export const ATTACKS = {
  spring_punch: { kind: 'melee', motion: 'punch', length: 0.45, damage: 12, hit: [0.35, 0.55], reach: 0.35, arc: 60, height: 0.3 },
  big_hammer: { kind: 'melee', motion: 'smash', length: 0.9, damage: 24, hit: [0.55, 0.7], reach: 0.4, arc: 90, height: 0.42 },
  drill: { kind: 'melee', motion: 'thrust', length: 0.8, damage: 16, hit: [0.4, 0.7], reach: 0.4, arc: 45, height: 0.3 },
  twin_pop: { kind: 'shot', motion: 'shoot2', length: 0.5, damage: 6, fire: [0.25, 0.55], speed: 6, range: 4 },
  cork_shooter: { kind: 'shot', motion: 'shoot', length: 0.4, damage: 8, fire: [0.3], speed: 7, range: 4 },
  ruler_saber: { kind: 'melee', motion: 'sweep', length: 0.6, damage: 15, hit: [0.35, 0.6], reach: 0.45, arc: 120, height: 0.28 },
  bottle_rocket: { kind: 'rocket', motion: 'launch', length: 1.0, damage: 20, fire: [0.5], speed: 3, range: 5, turn: 90 },
  lid_shield: { kind: 'shield', motion: 'block', raise: 0.2, arc: 120, share: 0.5, moveMul: 0.5 },
};

export const SKILLS = {
  repair: { cooldown: 15, length: 0.4, heal: 20 },
  guard: { cooldown: 12, length: 0.4, duration: 3, mul: 0.5 },
  focus: { cooldown: 10, length: 0.4, shots: 3, mul: 1.5 },
  charge: { cooldown: 8, length: 0.5, distance: 1.2, damage: 10, hit: [0.2, 0.8] },
};

export const PARTS = {
  pipo_core: { slot: 'core', robot: 'pipo', name: { ja: 'ピポ・コア', en: 'Pipo Core' } },
  pipo_head: { slot: 'head', robot: 'pipo', hp: 40, skill: 'repair', name: { ja: 'ベルアンテナ', en: 'Bell Antenna' } },
  pipo_arm_r: { slot: 'arm_r', robot: 'pipo', hp: 40, attack: 'spring_punch', name: { ja: 'スプリングパンチ', en: 'Spring Punch' } },
  pipo_arm_l: { slot: 'arm_l', robot: 'pipo', hp: 35, attack: 'cork_shooter', name: { ja: 'コルクシューター', en: 'Cork Shooter' } },
  pipo_legs: { slot: 'legs', robot: 'pipo', hp: 45, speed: 1.6, dash: 0.8, legType: 'biped', name: { ja: 'ブリキレッグ', en: 'Tin Legs' } },

  kanazuchi_core: { slot: 'core', robot: 'kanazuchi', name: { ja: 'カナヅチ・コア', en: 'Kanazuchi Core' } },
  kanazuchi_head: { slot: 'head', robot: 'kanazuchi', hp: 45, skill: 'guard', name: { ja: 'アイアンバイザー', en: 'Iron Visor' } },
  kanazuchi_arm_r: { slot: 'arm_r', robot: 'kanazuchi', hp: 55, attack: 'big_hammer', name: { ja: 'ビッグハンマー', en: 'Big Hammer' } },
  kanazuchi_arm_l: { slot: 'arm_l', robot: 'kanazuchi', hp: 45, attack: 'drill', name: { ja: 'ドリル', en: 'Drill' } },
  kanazuchi_legs: { slot: 'legs', robot: 'kanazuchi', hp: 60, speed: 1.2, dash: 0.6, legType: 'biped', name: { ja: 'ストンプレッグ', en: 'Stomp Legs' } },

  popgun_core: { slot: 'core', robot: 'popgun', name: { ja: 'ポップガン・コア', en: 'Popgun Core' } },
  popgun_head: { slot: 'head', robot: 'popgun', hp: 35, skill: 'focus', name: { ja: 'スコープアイ', en: 'Scope Eye' } },
  popgun_arm_r: { slot: 'arm_r', robot: 'popgun', hp: 40, attack: 'twin_pop', name: { ja: 'ツインポップ', en: 'Twin Pop' } },
  popgun_arm_l: { slot: 'arm_l', robot: 'popgun', hp: 60, attack: 'lid_shield', name: { ja: 'フタシールド', en: 'Lid Shield' } },
  popgun_legs: { slot: 'legs', robot: 'popgun', hp: 70, speed: 1.1, dash: 0.5, legType: 'treads', name: { ja: 'トレッド', en: 'Treads' } },

  hazama_core: { slot: 'core', robot: 'hazama', name: { ja: 'ハザマ・コア', en: 'Hazama Core' } },
  hazama_head: { slot: 'head', robot: 'hazama', hp: 50, skill: 'charge', name: { ja: 'ホーンクレスト', en: 'Horn Crest' } },
  hazama_arm_r: { slot: 'arm_r', robot: 'hazama', hp: 45, attack: 'ruler_saber', name: { ja: 'ジョウギセイバー', en: 'Ruler Saber' } },
  hazama_arm_l: { slot: 'arm_l', robot: 'hazama', hp: 40, attack: 'bottle_rocket', name: { ja: 'ボトルロケット', en: 'Bottle Rocket' } },
  hazama_legs: { slot: 'legs', robot: 'hazama', hp: 40, speed: 2.0, dash: 1.2, legType: 'hover', name: { ja: 'ホバースカート', en: 'Hover Skirt' } },
};

export const ROBOTS = {
  pipo: { name: { ja: 'ピポ', en: 'Pipo' } },
  // Bout 1: tougher (x2.2 part HP) but hits at half power, so a fight lasts longer without being
  // harder to win. Only for this fight; the parts you win from it keep their normal numbers.
  kanazuchi: { name: { ja: 'カナヅチ', en: 'Kanazuchi' }, toughness: 2.2, power: 0.5, ai: { pauseMin: 1.8, pauseMax: 2.6, dodge: 0.15, skill: 0.4 } },
  popgun: { name: { ja: 'ポップガン', en: 'Popgun' }, ai: { pauseMin: 1.0, pauseMax: 1.6, dodge: 0.25, skill: 0.6 } },
  hazama: { name: { ja: 'ハザマ', en: 'Hazama' }, ai: { pauseMin: 0.6, pauseMax: 1.0, dodge: 0.4, skill: 0.8 } },
};
export const RIVAL_ORDER = ['kanazuchi', 'popgun', 'hazama'];

// Standard loadout of a robot: its own five parts.
export function stockLoadout(robot) {
  return {
    core: `${robot}_core`,
    head: `${robot}_head`,
    arm_r: `${robot}_arm_r`,
    arm_l: `${robot}_arm_l`,
    legs: `${robot}_legs`,
  };
}

export const PAINTS = ['factory', 'mechapop', 'wood'];

export const FEEL = {
  hitstop: 0.07,
  knockback: 0.12,
  knockTime: 0.12,
  invuln: 0.35,
  hurt: 0.3,
  hitFlash: 0.12, // seconds a hit robot flashes white (it still leans back for the whole hurt time)
  breakStagger: 0.4,
  dashTime: 0.25,
  dashCooldown: 1.0,
  turnRate: 10,
  moveInAttack: 0.25,
  fightTime: 99,
  introTime: 1.6,
  outroTime: 2.6,
};

export const ARENA = {
  half: 2.24, // inner half-size of the toy box (measured on the 5.1 m model: walls at ±2.24 m)
  wallHeight: 0.71, // measured on the toy-box model (above its floor)
  wallThickness: 0.05,
  block: 0.25,
  wallMargin: 0.19, // robots stop this far from the walls (arms reach past the 0.14 m body circle)
  // Stacks of toy blocks: [x, z, how many blocks high]
  stacks: [
    [1.2, 1.2, 2],
    [-1.2, 1.2, 2],
    [1.2, -1.2, 2],
    [-1.2, -1.2, 2],
    [0, 0, 2],
  ],
  playerStart: [0, -1.8],
  rivalStart: [0, 1.8],
};
