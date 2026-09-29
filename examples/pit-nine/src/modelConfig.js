// How each Tripo file is turned into a game object: size, which way to turn it so it faces +Z,
// and for split models which piece belongs to which part and where each part hinges.
// Everything here is about looks; gameplay never reads this file.
const T = (n) => `tripo_part_${n}`;
const list = (...ns) => ns.map(T);

export const MODEL_CONFIG = {
  player: {
    kind: 'person',
    height: 1.7,
    turn: 0,
    // Game state -> which Tripo clip (matched by the closest name) and which stretch of it, picked by looking at
    // the frames (tools/out/anim-*.png). from/to in seconds of the clip.
    clips: {
      idle: { match: 'idle', loop: true },
      run: { match: 'run', loop: true, recentre: true }, // 'stay in place' left the body 0.94 m ahead of the feet
      shoot: { match: 'shoot', from: 4.5, to: 5.5, loop: true, upper: true }, // steady aim with both arms forward
      roll: { match: 'roll', from: 0.62, to: 2.1 }, // crouch, dive, shoulder roll, back up
      hurt: { match: 'hit_to_body_01', from: 0.1, to: 0.8 }, // the flinch
      knocked_down: { match: 'defeat_02', from: 0.3, to: 3.6, clamp: true }, // knocked back and down, then lies still
      cheer: { match: 'cheer', loop: true },
    },
    hand: 'mixamorigRightHand', // the blaster is held here
  },
  blaster: { kind: 'prop', size: 0.6, turn: Math.PI / 2 }, // muzzle was at -X
  missile: { kind: 'prop', size: 1.0, turn: Math.PI / 2 }, // nose was at -X
  crate: { kind: 'prop', size: 1.5, turn: 0 },
  wall: { kind: 'prop', size: 6.3, turn: 0 },
  repair_kit: { kind: 'prop', size: 0.5, turn: 0 },

  hound: {
    kind: 'parts',
    size: 1.4,
    turn: Math.PI / 2, // head was at -X
    parts: ['body', 'head', 'front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'],
    parent: { head: 'body', front_left_leg: 'body', front_right_leg: 'body', back_left_leg: 'body', back_right_leg: 'body' },
    // pieces are matched automatically by overlap with the placeholder parts (checked by eye in tools/out/parts-hound.png)
    hinge: { body: 'centre', head: 'back', front_left_leg: 'top', front_right_leg: 'top', back_left_leg: 'top', back_right_leg: 'top' },
  },

  foreman: {
    kind: 'parts',
    size: 7.6,
    turn: 0,
    parts: ['hull', 'left_cannon', 'right_cannon', 'missile_pod', 'armour_plate', 'front_left_leg', 'front_right_leg', 'back_left_leg', 'back_right_leg'],
    parent: { hull: 'upper', left_cannon: 'upper', right_cannon: 'upper', missile_pod: 'upper', armour_plate: 'upper' },
    upperFrom: 'legTops', // the 'upper' pivot sits at hip height
    centreOn: 'legs', // it turns around the middle of its four feet
    // Tripo kept no part names, so the big pieces are listed by hand (see tools/out/label-foreman-*.png).
    // Every piece not listed (bolts, rivets, small brackets) joins the part of the nearest listed piece.
    pieces: {
      hull: list(30, 31, 2, 13, 61, 66, 67, 68, 73, 74, 75, 76),
      left_cannon: list(10),
      right_cannon: list(37),
      missile_pod: list(6, 62, 63),
      armour_plate: list(107, 51, 55, 109, 110, 77, 87, 81, 89, 91, 92, 88, 86),
      front_left_leg: list(25, 8, 7, 24, 4, 70),
      back_left_leg: list(50, 65, 3, 16, 17, 5, 26),
      front_right_leg: list(53, 19, 20, 12, 18, 60, 11, 69),
      back_right_leg: list(52, 27, 56, 1, 21, 23, 22, 15),
    },
    // one Tripo piece holds the front-left shin and the back-left foot: cut it front / back
    split: { [T(54)]: { axis: 'z', at: -0.3, above: 'front_left_leg', below: 'back_left_leg' } },
    hinge: {
      hull: 'centre',
      left_cannon: 'shoulder',
      right_cannon: 'shoulder',
      missile_pod: 'bottom',
      armour_plate: 'topBack',
      front_left_leg: 'top',
      front_right_leg: 'top',
      back_left_leg: 'top',
      back_right_leg: 'top',
    },
    aimForward: ['left_cannon', 'right_cannon'], // turn each barrel to point straight ahead (+Z) at rest
    core: { socket: T(31) }, // the glowing core is made in code and sits in this ring
  },
};
