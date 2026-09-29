# TOY BOX BOUT（トイボックス・バウト）— Game Design

**Pitch.** You own Pipo, a small plastic battle robot. You fight three rival toy robots one after another on a play mat inside a wooden toy box. Each robot is built from four parts. Break a rival's head to win, then take one of its parts and fit it to Pipo in the garage.
**Look.** A 1990s Japanese plastic model kit: glossy plastic, bold primary colours, panel lines and big bolts. Text is Japanese, with an English toggle. Scale is real toy scale: 1 unit = 1 m, and a robot is 0.5 m tall.

## Core loop (one level: the toy box)
Garage (swap parts, pick paint) → **Fight** (1 vs 1, 99 s) → win: pick 1 of the loser's 4 parts → Garage → next rival. After you beat rival 3 you see the Champion screen and can start a new run. All parts are fully repaired before each fight.
- **Win a fight:** the rival's head reaches 0 HP. **Lose a fight:** your head reaches 0 HP, or the timer runs out and your head HP % is not higher than the rival's. After a loss you choose Retry this fight (same parts) or Title (new run).

## Controls
| Action | Keyboard + mouse | Touch (phone) |
|---|---|---|
| Move (relative to camera) | WASD / arrow keys | Virtual stick, left half of screen |
| Left-arm attack | Left mouse button / J | Button 左 (L) |
| Right-arm attack | Right mouse button / K | Button 右 (R) |
| Dash (legs ability) | Space | Button ダッシュ |
| Head ability | E / L | Button ヘッド |
| Pause | Esc | ⏸ button |
All attacks aim at the rival automatically (lock-on). If you press an attack during another attack, it is queued and fires as soon as the current one ends (one queued press at most).

## Camera
Lock-on third person. The camera sits 1.3 m behind Pipo and 0.7 m up, and looks at a point 30% of the way from Pipo to the rival, at 0.25 m height. It pulls back to 2.0 m when the robots are more than 2.5 m apart, from just over Pipo's right shoulder (0.28 m to the side). If a wall or toy block would be between the camera and Pipo or the fight, or the camera would be within 0.3 m of a block, the camera tries (in order) the same line at up to 1.1 m high, the line swung 30° or 60° to either side, then up to 1.5 m high, coming closer each time. It keeps a spot while that spot still has a clear view and only moves to a better one after 0.6 s, so the view never jumps back and forth. It never goes through a wall, and it tilts towards Pipo, by the smallest steady amount, so Pipo's feet and head always stay on screen. There is no manual camera control, so the controls are the same on a phone.

## Robots (not people: built from parts moved in code, no bones)
Each robot is a **core** (torso, not swappable, cannot be damaged) plus 4 **slots**. Every part faces +Z. Attach points are measured from the centre of the feet. Facing +Z, the robot's right is −X.
| Slot | Attach point (x, y, z) m | Part faces on point | Fits in box W×H×D m | Hinge |
|---|---|---|---|---|
| legs | (0, 0, 0) | +Z, hips at top | 0.26 × 0.20 × 0.26 | each leg at hip y 0.18, ±0.05 x |
| core | (0, 0.20, 0) | +Z | 0.20 × 0.16 × 0.20 | — |
| head | (0, 0.36, 0) — neck | +Z, face forward | 0.18 × 0.14 × 0.18 | neck (yaw/nod) |
| arm_r | (−0.13, 0.33, 0) — shoulder | hangs −Y, fist/muzzle +Z | 0.12 × 0.20 × 0.14 | shoulder (pitch fwd, roll out) |
| arm_l | (+0.13, 0.33, 0) — shoulder | mirror of arm_r | 0.12 × 0.20 × 0.14 | shoulder |
A part is scaled to fit its slot box. On screen, parts are then seated against each other by their real surfaces: the core sits down on the legs, the head sits down on the core, and each arm slides in at shoulder height until it touches the core. An arm that would sink into wide legs, at rest or anywhere in its walking swing, takes the smallest rest pose that keeps it clear: tilted out at the shoulder (up to about 27°) and/or swung a little forward (up to about 34°), like a toy holding its weapon ready. Attacks start from and return to that rest pose. This only changes where parts are drawn; the attach points above stay the ones the fight rules use. Left-arm parts only fit arm_l, and right-arm parts only fit arm_r.
**Damage routing.** A hit damages the part whose hit box is closest to the point of impact. Shots and most blows land at chest height, but the Big Hammer smashes down onto the head. A hit on the core goes to the arm on the side the blow came from, or to the head if that arm is gone. Facing each other, your right arm hits their left arm and your left arm hits their right arm, and circling to one side hits that side's arm. Every hit shows a floating number with the part and the damage ("ガード" when blocked), and the garage shows a tip for the next rival.
**Breaking.** *Arm* at 0 HP: it pops off, spins to the floor, fades after 3 s, and that attack is lost. *Legs* at 0 HP: they fall off, the core sinks to 0.06 m, move speed ×0.5, no dash. *Head* at 0 HP: the robot shuts down and the fight ends.
**Paint.** Every part has 3 paint jobs: Factory, Mecha Pop and Wood. Each part is painted separately in the garage, including the core.

| Robot | Head (HP, ability) | arm_r (HP, attack) | arm_l (HP, attack) | Legs (HP, speed, dash) |
|---|---|---|---|---|
| **Pipo** ピポ (you, blue/white) | Bell Antenna 40 — *Repair*: +20 HP to most-damaged part, cooldown 15 s | Spring Punch 40 | Cork Shooter 35 | Tin Legs 45, 1.6 m/s, dash 0.8 m |
| **Kanazuchi** カナヅチ (rival 1, orange) | Iron Visor 45 — *Guard*: −50% damage for 3 s, cd 12 s | Big Hammer 55 | Drill 45 | Stomp Legs 60, 1.2 m/s, dash 0.6 m |
| **Popgun** ポップガン (rival 2, green) | Scope Eye 35 — *Focus*: next 3 shots ×1.5, cd 10 s | Twin Pop 40 | Lid Shield 60 | Treads 70, 1.1 m/s, dash 0.5 m |
| **Hazama** ハザマ (rival 3, purple) | Horn Crest 50 — *Charge*: rams 1.2 m forward, 10 dmg, cd 8 s | Ruler Saber 45 | Bottle Rocket 40 | Hover Skirt 40, 2.0 m/s, dash 1.2 m |

**Rival 1 in the fight.** In bout 1 Kanazuchi's parts have 2.2× the HP above and its attacks do half damage, so the first fight lasts longer (a quick player needs about 24 s instead of about 11 s) without being harder to win. The parts you win from Kanazuchi keep the normal numbers in this table.

**Attacks** (each is an arm motion in code; the hit window is a fraction of that motion's length)
| Attack | Motion | Length | Damage | Hit lands → ends | Reach |
|---|---|---|---|---|---|
| Spring Punch | arm swings level and extends | 0.45 s | 12 | 0.35 → 0.55 | 0.35 m, 60° cone |
| Big Hammer | arm rises overhead and smashes down | 0.90 s | 24 | 0.55 → 0.70 | 0.40 m, 90° |
| Drill | arm thrusts forward, tip spins | 0.80 s | 16 | 0.40 → 0.70 | 0.40 m, 45° |
| Twin Pop | arm points and recoils twice | 0.50 s | 6 per pellet | pellets leave at 0.25 and 0.55 | pellet 6 m/s, 4 m |
| Cork Shooter | arm points and recoils | 0.40 s | 8 | cork leaves at 0.30 | cork 7 m/s, 4 m |
| Ruler Saber | arm sweeps right → left | 0.60 s | 15 | 0.35 → 0.60 | 0.45 m, 120° |
| Bottle Rocket | arm points up 30°, rocket launches | 1.00 s | 20 | rocket leaves at 0.50 | 3 m/s, turns 90°/s toward target, 5 m |
| Lid Shield | hold: arm swings across chest in 0.2 s | hold | — | blocks frontal 120° while held | shield arm takes 50% of the damage it blocks, others take 0; move ×0.5 |
| Horn Charge (head) | whole robot leans and rushes | 0.50 s | 10 | 0.20 → 0.80 | path 1.2 m |

**Hit feel.** A hit freezes both robots for 0.07 s (hit stop), then pushes the target back 0.12 m. The target cannot be hit again for 0.35 s. Toy blocks stop pellets, corks and rockets. Only one robot fights you at a time, and a rival uses one arm at a time with a 0.6–1.2 s pause between attacks.

**States** (all robots, shown by moving parts in code)
| State | Looks like | Enters when | Leaves when |
|---|---|---|---|
| idle | core bobs 5 mm, head looks at rival | not moving, not acting | any input or AI action |
| walk | legs swing ±25° at hips (treads roll, skirt tilts), speed-matched | moving | stops → idle |
| dash | lean forward 20°, legs tucked | Dash pressed (cooldown 1 s) | after 0.25 s → idle/walk |
| attack_l / attack_r | arm plays its attack motion above | attack pressed or queued | motion ends → queued attack, or idle |
| block | shield arm across chest | holding the Lid Shield arm | released → idle |
| head_skill | head spins once and flashes | head ability pressed | 0.4 s → idle (Charge: 0.5 s) |
| hurt | lean back 15°; every hit also flashes white for 0.12 s | hit while not blocking; cancels attack | 0.3 s → idle |
| part_break | broken part pops off with sparks, 0.2 s stagger | a part reaches 0 HP | 0.4 s → idle |
| knocked_down | falls backwards and lies flat, eyes go dark | head reaches 0 HP | stays until the fight ends |
| victory | arms up, spins 360° | rival knocked down | stays until the fight ends |

## Arena layout (one toy box, 5.1 m outside, floor inside the walls 4.48 × 4.48 m: walls at ±2.24 m)
The player starts at (0, 0, −1.8) facing +Z, and the rival starts at (0, 0, +1.8) facing −Z. Stacks of 2 toy blocks (0.5 m tall, taller than a shot's flight height) stand at (±1.2, 0, ±1.2) and at the centre as cover. Robots stop 0.19 m from the walls (their arms reach past the 0.14 m body circle); walls stand 0.71 m above the floor.

## Every object on screen
| id | What | Size (m) | Faces |
|---|---|---|---|
| robot_pipo / robot_kanazuchi / robot_popgun / robot_hazama | Full robot = core + 4 slot parts (see slots) | up to 0.37 W × 0.50 H × 0.26 D (models) | +Z |
| arena_toybox | Wooden box floor + 4 walls, open top | 5.1 m outside, inner walls at ±2.24 m, walls 0.71 m above the floor | open side up; mat print reads from −Z |
| toy_block | Wooden letter block (stacked 2 high) | 0.25 cube | letter face +Z |
| cork_pellet | Cork / Twin Pop shot (code only) | Ø 0.03 × 0.04 | flies along +Z |
| bottle_rocket | Rocket projectile | Ø 0.04 × 0.14 | nose +Z |
| hit_spark, part_debris | Effects (code only) | ~0.10 | — |

## Screens and text
Title → Garage → Fight (HUD: 4 part HP bars for each robot, timer, cooldown rings) → Prize pick → Champion / Lose. All text comes from one JA/EN string table. Japanese is the default, and a 日本語 / EN switch is on the Title and Pause screens.
