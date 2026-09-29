# PIT NINE — Game Design (one page)

**Pitch.** Tamsin Holt, a lone scavenger, is trapped in Pit Nine, a round scrapyard arena. Two waves of robot hounds (**Scraplings**) attack first. Then the giant walking forge-machine (**the Foreman**) wakes up. Shoot its parts off one by one; each broken part takes away one of its attacks. Then hit the glowing core.
**Look.** Chunky, hand-painted low-poly, like a 90s arcade game in 3D. A button switches the whole game to a second look (**Mecha Pop**).

## Core loop
Move → aim → shoot → roll out of danger → pick up repair kits → repeat until the core breaks or you do.
Rounds: **Wave 1** = 3 Scraplings → **Wave 2** = 4 Scraplings → **Boss**: the Foreman wakes up (2 s) and fights until its core is destroyed.

**Wave 1 is a warm-up for first-time players.** The controls are shown on screen for the first 6 s, and the first hound arrives after 3 s. Hounds then drop in one at a time, 3 s apart, 11 m in front of Tamsin, so they are on screen. In wave 1 a hound winds up for 0.9 s instead of 0.5 and its pounce does 8 damage instead of 12. After any pounce, no hound may attack for 2 s in wave 1, or 0.8 s in wave 2. Wave 2 hounds drop in 0.45 s apart at the arena wall.

## Controls
| Action | Keyboard + mouse | Phone (touch) |
|---|---|---|
| Move | WASD | Left stick (left half of the screen, appears where you touch) |
| Aim | Mouse pointer on the ground | Right stick direction |
| Shoot | Hold left button (6 shots/s). A click during the cooldown queues the next shot | Push the right stick past half way to fire automatically |
| Dodge roll | Space | ROLL button (bottom right, above the right stick) |
| Restart | R, or the Restart button | Restart button |
| Look switch | L, or the button in the top corner | Button in the top corner |
| Sound on / off | the Sound button | the Sound button |

**Roll:** 0.45 s long, moves 5 m in the direction you are moving (or aiming, if you stand still). You cannot be hurt from 0.05 to 0.35 s. 0.6 s cooldown. A roll pressed up to 0.15 s before it is ready is remembered and happens as soon as it can.

## Win and lose
- **Win:** the Foreman's core reaches 0 HP. It collapses, Tamsin cheers, and the WIN screen shows your time.
- **Lose:** Tamsin's health (100) reaches 0. She is knocked down and the LOSE screen appears.
- Both screens have a Restart button that starts again from Wave 1.
- **Repair kit** (+25 HP): a destroyed Scrapling drops one 30% of the time, and every broken Foreman part always drops one.

## Camera
Top-down chase camera at a 55° tilt, 18 m from Tamsin. It leans 2 m toward where you are aiming and follows smoothly. On a phone held upright it pulls back another 25%. **Boss fight:** the camera tilts to 66°. It looks at a point between Tamsin and the Foreman and moves back only as far as it needs to (16–28 m) to keep both fully on screen below the top HUD. On short landscape phones the boss bars move to the bottom of the screen.

## Fight feel
- **Hit freeze:** when a Scrapling pounce or a Foreman attack hits Tamsin, everything freezes for 0.08 s. When a bolt hits an enemy, only that enemy freezes, for 0.04 s. When a Foreman part breaks, everything freezes for 0.12 s.
- **Push-back:** a bolt pushes a Scrapling back 0.4 m. An enemy hit pushes Tamsin back 1.5 m, and the ram pushes her 4 m.
- **Just-hit protection:** Tamsin cannot be hurt again for 0.8 s after a hit (she flashes). An enemy part cannot be hurt again for 0.08 s after a hit.
- **Taking turns:** attacks are shared out as tokens. Only one Scrapling may wind up or pounce at a time; the others circle 5 m away and wait. The Foreman uses one attack at a time and waits 1.2 s between attacks.
- **Showing a hit (looks and sound only):** every landed shot makes a flash and sparks at the spot, jolts the part it hit and gives it a short orange glow, shows a small cross on screen (red and bigger for a kill or a broken part), lights up that part's boss bar, and plays a sound: a metal ping on the Foreman, a thud on a hound. A shot blocked by the hull, a leg or a crate gives a few grey sparks and a dull clank. Every shot has a muzzle flash.
- **Which way Tamsin faces:** her legs always face where she runs. While shooting, her upper body turns to the aim; when the aim is more than about 110° behind the run direction she backpedals.

## Characters and states
**Tamsin Holt (player): a person, so she gets bones.** She has four layers of armour-cloth, a short cropped haircut and a gun that she holds in both hands. Her upper body plays the shoot animation on top of the leg animation, so she can run and shoot at the same time.
| State | Switches in when… | Switches out when… |
|---|---|---|
| idle | not moving | she starts moving |
| run | moving | she stops, rolls, is hurt or is knocked down |
| shoot (upper body only) | fire is held or queued | fire is released and the last shot has finished |
| roll | Roll is pressed and ready | after 0.45 s → idle/run |
| hurt | she is hit and still has HP left | after 0.3 s |
| knocked_down | HP reaches 0 | never (LOSE screen) |
| cheer | the Foreman's core breaks | never (WIN screen) |

**Scrapling (robot hound): not a person, so it is built from parts that move in code.** Its parts are the body, the head (hinged at the neck) and four legs (each hinged at the top, where it meets the body). HP 6.
| State | Switches in when… | Switches out when… |
|---|---|---|
| spawn | it drops in at the arena wall | after 0.6 s → chase |
| chase | it has no attack token | it is within 6 m and has a token → windup; within 6 m without a token → circle |
| circle | it is waiting for a token, 5 m from Tamsin | it gets a token → windup |
| windup | it has a token (crouches, turns red, creeps forward at 2.5 m/s and aims where Tamsin will be in 0.4 s) | after 0.5 s (0.9 s in wave 1) → pounce |
| pounce | after windup (leaps in a straight line to 1 m past the aim point, 3–8 m) | after 0.6 s → recover |
| recover | the pounce ends (stagger, head down) | after 0.7 s → chase, and the token is released |
| hurt (shown on top of its current state) | a bolt hits it (flashes white, pushed back, stops moving unless it is mid-pounce) | after 0.15 s |
| destroyed | HP reaches 0 | its parts scatter and fade after 1.5 s |

**The Foreman (boss): not a person. It is a machine made of parts that move in code.** Its states are dormant (hunched, dark) → waking (2 s) → walk (toward Tamsin at 1.8 m/s until it is 9 m away; it keeps walking during the cannon volley and the missile rain) → one attack → walk… Whenever a part breaks it goes into **stagger** (1.2 s, leans back), and when the core breaks it goes into **destroyed** (collapses).

## Attacks
Hit start and hit end are fractions of the attack's animation: the part of the animation where the attack can hurt.
| Attacker | Attack | Animation (moved in code for everything except Tamsin) | Length | Damage | Hit start → end |
|---|---|---|---|---|---|
| Tamsin | Bolt | shoot (upper body, Tamsin's own animation) | 0.166 s | 1 per bolt, 22 m/s | the bolt leaves the gun at 0.3 |
| Scrapling | Pounce | windup, then pounce: the body leaps and the legs stretch forward | 0.6 s | 12 (8 in wave 1), within 1.1 m | 0.25 → 0.90 of the pounce |
| Foreman | Cannon volley (left_cannon) | cannon_volley: the barrel glows for 1 s, then recoils 3 times | 2.0 s | 12 per shell, 3 shells, 14 m/s, aimed 60% of the way to where a running Tamsin will be | shells fire at 0.50, 0.65 and 0.80 |
| Foreman | Sweep beam (right_cannon) | sweep_beam: the cannon lowers, then turns 120°; a thin warning beam shows first | 2.5 s | 18 | 0.35 → 0.85 (a low beam, 14 m long; roll through it) |
| Foreman | Missile rain (missile_pod) | missile_rain: the pod lid opens and 6 missiles fire; red circles 4 m wide appear 1.2 s before each one lands | 3.0 s | 20 each | missiles land from 0.55 → 0.90 |
| Foreman | Ram (armour_plate) | ram: it leans back, then lunges 8 m forward | 1.8 s | 25, and knocks Tamsin 4 m | 0.45 → 0.70 |
| Foreman | Stomp (legs; never taken away) | stomp: the front legs lift and slam down; a ring spreads out to 5 m | 1.4 s | 15 | 0.55 → 0.65 |
The Foreman only stomps when Tamsin is within 6 m. Otherwise it picks one of the attacks it still has, in turn.

## The Foreman's parts
All hinges are measured from the Foreman's feet-centre, with +Z toward the front. Its own left is +X, so when it faces the camera its left cannon is on the right of the screen. These hinge positions are the greybox's; the 3D model's hinges are measured from the model itself (src/modelConfig.js), and its hit spheres are fitted to the model (src/foreman.js). Characters are stopped 3.6 m from its centre (its feet sit 3.1–3.2 m out).
| Part | What it does | Hinge | HP | When it breaks |
|---|---|---|---|---|
| hull | main body, holds everything | none (root) | cannot be hurt | — |
| left_cannon | cannon volley | shoulder pivot (3.2, 5.0, 0.5), turns up/down | 20 | falls off and smokes; no more volleys |
| right_cannon | sweep beam | shoulder pivot (−3.2, 5.0, 0.5), turns left/right and up/down | 20 | falls off; no more sweeps |
| missile_pod | missile rain | back of the roof (0, 6.5, −1.2); the lid opens backward | 25 | blows off the top; no more missiles |
| armour_plate | ram; covers the core | top edge (0, 5.6, 2.5), swings forward | 30 | drops forward onto the ground; no more rams; the core is exposed and glows brighter |
| core | its weak point: a glowing disc made in code, sitting in a round socket in the hull front | none (fixed in the chest at (0, 4.4, 2.2)) | 40, and only hittable once the armour is gone | the Foreman collapses → WIN |
| front_left_leg / front_right_leg / back_left_leg / back_right_leg | walking, stomp | hip (±2.4, 4.0, ±1.6) (left = +X, front = +Z), swings forward and back | cannot be hurt | — |

## Level: Pit Nine
A round sand-and-rust floor 40 m across, ringed by 20 scrap wall segments. Six crate stacks stand in a ring 10 m from the centre and give cover: they block bolts and shells, but not missiles or the beam. Tamsin starts at (0, 0, 8). Scraplings drop in from 4 points on the wall. The Foreman sleeps at (0, 0, −13) facing +Z (south, toward the start).

## Every object on screen (every placeholder faces +Z)
Size is width × height × length along Z, in metres.
| id | What it is | Size (m) | Faces |
|---|---|---|---|
| player | Tamsin Holt, capsule with a gun box (bolts leave the gun 1.3 m above the ground) | 0.6 × 1.7 × 0.5 | +Z = the aim direction |
| blaster | Tamsin's gun, held in her right hand | 0.14 × 0.14 × 0.6 | +Z = muzzle |
| hound | Scrapling, 6 parts (hit / collision radius 0.55 m) | 0.6 × 0.8 × 1.4 (model 0.74 × 0.93 × 1.4) | +Z = head |
| foreman | the Foreman, 10 parts | 7.0 × 7.5 × 5.0 (model 6.4 × 7.6 × 7.3) | +Z = armour and core side |
| bolt | Tamsin's shot | 0.12 × 0.12 × 0.6 | +Z = direction of travel |
| shell | cannon shell | 0.35 × 0.35 × 0.6 | +Z = direction of travel |
| missile | missile | 0.3 × 0.3 × 1.0 | +Z = nose |
| missile_marker | red warning circle | 4.0 × 0.02 × 4.0 | flat (points up) |
| beam | sweep beam | 0.3 × 0.3 × 14 | +Z = away from the cannon |
| stomp_ring | shockwave ring | grows to 10 × 0.3 × 10 | flat |
| blast | explosion flash (missiles, shells, broken parts) | up to 4 × 0.6 × 4 | flat |
| repair_kit | health pickup | 0.5 × 0.35 × 0.35 | +Z = front latch |
| crate | stack of scrap crates | 1.3 × 1.5 × 1.3 | +Z = stencilled front |
| wall | scrap wall segment | 6.3 × 2.5 × 1.0 | +Z = faces the arena centre |
| floor | arena floor | 40 × 0.1 × 40 (disc) | flat |
