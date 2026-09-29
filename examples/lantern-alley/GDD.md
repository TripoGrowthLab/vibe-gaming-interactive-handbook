# LANTERN ALLEY — one-page design

**Pitch.** Volt is a comic-book street hero. Volt clears Lantern Alley of the Rust Hounds gang: three waves of four kinds of thug (Sprat, Flick, Slab, Crusher), then their boss, Big Anvil. One level, one arena, one core loop.

## Core loop
Walk up to a thug, punch it (3-hit combo) or kick it, then step away from its counter-attack. When a wave is cleared, Volt gets a breather (+30 HP, capped at 100) and the next wave walks in. Enemies arrive one at a time, from a random end of the alley at a random depth, 0.5–1.8 s apart, in a shuffled order (Big Anvil first in his wave). Only a few are on the street at once; the rest arrive as reinforcements when someone is knocked out.

| Wave | Enemies (18 in total) | On the street at once | Pause between enemy attacks (±40%) | Enemy damage |
|---|---|---|---|---|
| 1 | 2 × Sprat, 2 × Flick | 3 | 2.0 s | × 0.67 (gentle start) |
| 2 | 2 × Sprat, 2 × Flick, 1 × Slab | 4 | 0.75 s | × 1 |
| 3 | 2 × Sprat, 2 × Flick, 1 × Slab, 1 × Crusher | 4 | 0.45 s | × 1 |
| 4 | Big Anvil, 1 × Sprat, 1 × Flick | 3 | 0.9 s | × 0.75 |

At most Volt and 4 enemies are on screen, the same busiest moment as in assets.json.

**Win:** Big Anvil is knocked out. Volt cheers and the screen shows "ALLEY CLEAN — play again".
**Lose:** Volt's HP reaches 0. Volt plays the defeat animation and the screen shows "KNOCKED OUT — play again".
**HUD:** Volt's health bar at top left, a boss bar at top when Big Anvil is on screen, and "WAVE n/4 · n LEFT" at top right.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Move (left/right, towards/away from camera) | WASD or arrow keys | Virtual joystick, bottom-left |
| Run | Hold Shift while moving | Push the joystick all the way to its edge (the knob turns orange) |
| Punch (press again for the next hit of the combo) | J | PUNCH button, bottom-right |
| Kick (after two punches: J, J, K is the sweeping combo kick) | K | KICK button, bottom-right, above PUNCH |
| Running punch / flying kick | J / K while running | PUNCH / KICK with the joystick at its edge |
| Restart | Enter or R | Tap the "play again" panel |

## Camera and world
- **World:** metres, Y up. The alley runs along X from −15 to +15 and along Z from −4 (back wall) to +4 (open side, facing the camera). Fighters can walk within x ∈ [−14, 14] and z ∈ [−3.0, 3.2].
- **Camera:** perspective, FOV 40°, 5.5 m high and 11 m in front (+Z) of Volt, looking at a point 1 m above Volt. It follows Volt's X smoothly (clamped to ±8) and does not rotate. This gives a side-on brawler view with visible depth.
- **Facing:** every model faces +Z in its own space. In play, each fighter turns so it faces ±X toward its target.

## Objects on screen
| id | What | Size (m) | Faces | Placement |
|---|---|---|---|---|
| hero | Volt | height 1.8 | +Z | starts at (0, 0, 0) |
| thug_skinny | Sprat: fast, weak | height 1.75, thin | +Z | enters from x = ±16 |
| thug_kicker | Flick: a lean kickboxer who fights from kick range (teal top, black trousers, yellow sneakers) | height 1.82, thin | +Z | enters from x = ±16 |
| thug_fat | Slab: slow, hits hard | height 1.7, 1.0 wide | +Z | enters from x = ±16 |
| thug_crusher | Crusher: a heavyweight boxer (red hoodie vest, grey sweatpants) | height 1.85, 1.05 wide | +Z | enters from x = ±16 |
| boss | Big Anvil | height 2.3, 1.2 wide | +Z | enters from x = ±16 |
| dumpster | Solid obstacle | 2.0 × 1.2 × 1.0 (w×h×d) | +Z (lid hinge at back) | (−8, 0, −3.4) |
| crate | Wooden crate, solid; any of Volt's attacks breaks it | 1.0 cube | +Z | (5, 0, −3.4), (6.1, 0, −3.4), (−5.6, 0, −3.4) |
| food | Hot dog dropped by a broken crate (built in code; spins and bobs) | 0.45 long | +Z | in front of the broken crate, z = −2.7 |
| trash_can | Metal bin, solid | 0.9 tall, ⌀ 0.55 | +Z | (−3, 0, −3.5), (12, 0, −3.5) |
| street_lamp | Lamp post (decor) | 3.5 tall | +Z (lamp arm points +Z) | (−11, 0, −3.7), (10, 0, −3.7) |
| floor | Asphalt (built in code) | 40 × 8 (wider than the walkable area so the camera never sees past it) | up | centred at the origin |
| wall | Brick back wall (built in code) | 40 × 6 | +Z | z = −4 |

## Character states
All characters use **idle**, **walk**, **attack**, **hurt** and **ko**. Enemies also have **wait**, and Volt also has **run** and **win**.

| State | Animation | Enters when | Leaves when |
|---|---|---|---|
| idle | idle | no input or no target in reach | movement input or an attack starts |
| walk | walk | moving (Volt: stick/keys; enemy: approaching or circling) | stops moving |
| run (Volt) | run | moving with Shift held or the joystick at its edge | stops moving or lets go of Shift |
| wait (enemy) | walk / idle | another enemy holds the attack turn; waits 2.5–3.5 m from Volt and moves to a new spot every 2–4.5 s | gets the turn |
| attack | per attack below | punch/kick pressed, or an enemy holds the turn and is in reach | animation ends; a queued press chains to the next attack |
| hurt | hit_to_head or hit_to_body (see "reacts" in the attack tables) | takes a hit with HP > 0 | stun ends (see the attack tables) |
| ko | defeat (falls to the ground, lying down at about 3.6 s) | HP ≤ 0 | never; enemies fade out after 3.6 s, and the end screen shows 3.8 s after the round ends |
| win (Volt) | cheer | Big Anvil KO'd | restart |

## Attacks
A hit lands during a window, given as a fraction of the animation's length, where the fist or foot is really out in the Tripo clips. The clips are 2.2–6.6 s long, so each attack plays them faster ("Speed"). Each attack hits each target at most once. "Counts within" is how far from the target's edge the hit still counts; it is set so the fist or foot visibly touches the body.

**Volt**
| Attack | Animation (clip) | Speed | Lasts | Damage | Hit window (lands at) | Next attack from | Steps in | Counts within | Knockback | Target stunned | Target reacts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Jab (combo 1) | box_01 (2.21 s) | × 5 | 0.44 s | 8 | 0.25 – 0.35 (0.11–0.15 s) | 0.20 s | up to 0.7 m, to 0.62 m | 0.55 m | 0.12 m | 0.45 s (none on Slab, Anvil) | head snaps back |
| Cross (combo 2) | box_02 (2.79 s), starts at 0.55 (skips the crouch) | × 5 | 0.25 s | 10 | 0.85 – 0.98 (0.17–0.24 s) | 0.23 s | up to 0.35 m, to 0.65 m | 0.6 m | 0.18 m | 0.5 s (none on Slab, Anvil) | doubles over |
| Hook (combo 3, finisher) | box_03 (2.54 s) | × 4 | 0.64 s | 16 | 0.24 – 0.30 (0.15–0.19 s) | 0.38 s | up to 0.35 m, to 0.6 m | 0.55 m | 1.5 m | 0.8 s, then 0.8 s it can't be hit | head snaps back |
| Kick | front_kick_01 (2.50 s) | × 3.5 | 0.71 s | 14 | 0.45 – 0.62 (0.32–0.44 s) | 0.50 s | up to 0.3 m, to 1.0 m | 0.85 m | 1.2 m | 0.7 s, then 0.6 s it can't be hit | doubles over |
| Combo kick (J, J, K) | front_kick_01, starts at 0.25 | × 3.5 | 0.54 s | 16 | 0.45 – 0.62 (0.14–0.26 s), reaches 1.1 m in depth: hits everyone in front | 0.36 s | up to 0.3 m, to 1.0 m | 1.0 m | 1.8 m | 0.8 s, then 0.8 s it can't be hit | doubles over |
| Running punch (J while running) | box_03 | × 3 | 0.85 s | 14 | 0.24 – 0.30 (0.20–0.25 s) | 0.59 s | charges up to 1.4 m (even with nobody in front), to 0.6 m | 0.6 m | 50%: 1.8 m (flying); otherwise 0.35 m | flying: 0.8 s, then 0.8 s it can't be hit; otherwise 0.5 s | head snaps back |
| Flying kick (K while running) | front_kick_01 | × 3 | 0.83 s | 16 | 0.40 – 0.62 (0.33–0.52 s), reaches 1.0 m in depth | 0.63 s | flies up to 2.0 m, to 1.0 m | 0.9 m | 50%: 2.2 m (flying); otherwise 0.35 m | flying: 0.8 s, then 0.8 s it can't be hit; otherwise 0.5 s | doubles over |

The running punch and flying kick send each target they hit flying only half the time (rolled per target); otherwise the hit is solid but short (0.35 m, 0.5 s stun, hitstop 0.08 s) and the target can be comboed straight away. The hook, kick, combo kick, running punch and flying kick all stagger Slab and Big Anvil (see Armor). An enemy they send flying (knockback 1.2 m or more) knocks over any enemy it crashes into: "BONK!", 6 damage, 1.0 m knockback, 0.5 s stun, counted as Volt's hit.

**Enemies**
| Who | Attack | Animation (clip) | Speed | Lasts | Damage | Hit window (lands at) | Counts within | Knockback | Volt reacts |
|---|---|---|---|---|---|---|---|---|---|
| Sprat | Jab | box_01 (2.21 s) | × 2.4 | 0.92 s | 6 | 0.22 – 0.35 (0.20–0.32 s) | 1.0 m | 0.4 m | head |
| Slab, Crusher | Belly charge | run | × 0.9 | up to 1.39 s, runs at 4.5 m/s | 12 | whole charge, until it hits | 0.45 m | 1.6 m | body |
| Sprat | Cross (follow-up) | box_02, starts at 0.55 | × 3 | 0.42 s | 6 | 0.85 – 0.98 (0.28–0.40 s) | 1.0 m | 0.4 m | body |
| Flick | Front kick | front_kick_01 | × 2.6 | 0.96 s | 8 | 0.45 – 0.62 (0.43–0.60 s) | 1.4 m | 0.8 m | body |
| Slab | Overhead swing | slash (6.58 s) | × 3.3 | 1.99 s | 15 | 0.30 – 0.38 (0.60–0.76 s) | 1.3 m | 1.0 m | head |
| Slab | Hook (up close) | box_03 | × 2.0 | 1.27 s | 12 | 0.24 – 0.30 (0.30–0.38 s) | 1.0 m | 0.9 m | head |
| Crusher | Cross | box_02 | × 2.5 | 1.12 s | 10 | 0.85 – 0.98 (0.95–1.09 s) | 1.1 m | 0.5 m | body |
| Crusher | Hook | box_03 | × 2.0 | 1.27 s | 16 | 0.24 – 0.30 (0.30–0.38 s) | 1.2 m | 1.3 m | head |
| Crusher | Stomp kick | front_kick_01 | × 2.2 | 1.14 s | 18 | 0.45 – 0.62 (0.51–0.70 s) | 1.4 m | 2.0 m | body |
| Big Anvil | Overhead smash | slash | × 2.8 | 2.35 s | 24 | 0.30 – 0.38 (0.71–0.89 s) | 1.6 m | 2.2 m | head |
| Big Anvil | Haymaker | box_03 (2.54 s) | × 1.8 | 1.41 s | 18 | 0.22 – 0.30 (0.31–0.42 s) | 1.5 m | 1.2 m | head |
| Big Anvil | Stomp kick | front_kick_01 (2.50 s) | × 2.3 | 1.09 s | 22 | 0.30 – 0.45 (0.33–0.49 s) | 1.8 m | 1.8 m | body |

**Armor.** Slab, Crusher and Big Anvil are never staggered by a jab or cross: those hits still do damage (with hitstop, flash and an "UNFAZED!" popup), but the enemy is not stunned or pushed back and keeps walking in or swinging. Only the hook and the kicks stagger them. Sprats and Flicks are staggered by every hit.

"Target stunned" is multiplied by the target's poise: Sprat 1, Flick 1, Slab 0.9, Crusher 0.8, Big Anvil 0.6 (he shrugs hits off faster). A target is always stunned at least its own stagger time (Volt 0.35 s, Sprat 0.4 s, Slab 0.3 s, Anvil 0.25 s).

**Stats.** HP: Volt 100, Sprat 30, Flick 26, Slab 70, Crusher 90, Big Anvil 160. Walk speed (m/s): Volt 3.2 (run 5.6), Sprat 2.6, Flick 2.8, Slab 1.3, Crusher 1.2, Big Anvil 1.6. Delay between attacks: Sprat 1.0 s, Flick 1.3 s, Slab 1.8 s, Crusher 2.0 s, Big Anvil 2.2 s (1.5 s below half HP), plus the wave's pause. Big Anvil picks the kick when Volt is more than 1.5 m away and the haymaker otherwise.

**How fighting feels.**
- **Combo.** A punch pressed during an attack is queued and starts as soon as the current blow has landed and followed through ("Next attack from"), so jab > cross > hook lands about every 0.33 s. The combo resets if nothing is pressed within 0.25 s of an attack ending. Kick can also be queued, and it ends the combo. Moving during the follow-through cancels it. A "2 HITS! / 3 HITS! COMBO!" counter counts hits less than 1.2 s apart while Volt isn't hit.
- **Reaching the target.** During the wind-up Volt steps forward (up to "Steps in") and slides up to 0.25 m in depth towards the nearest enemy (ahead of him if a direction is held), stopping where the blow meets the body.
- **Hitstop.** When a hit lands, both fighters freeze for 0.07 s (0.08 s for the cross, 0.12 s for the hook, kicks and Anvil's hits) and the target shakes. Then it slides back by the knockback distance, fast at first and slowing to a stop.
- **No double hits.** After a fighter is hit, it cannot be hit again for a short time: 0.2 s for enemies (short enough that the combo still connects), 0.8 s for Volt, and after the hook or kick 0.8 s / 0.6 s, so an enemy is not juggled from one combo into the next.
- **Taking turns.** Only one enemy at a time holds the attack turn. The turn goes to a random waiting enemy, more likely the longer it has waited, after the wave's pause. The other enemies wait nearby and shift around.
- **Staying in the fight.** The enemy holding the turn walks in and stays in the fight: it keeps the turn after each attack (next attack after its delay ±35% plus the wave's pause) and while it is being hit. It only steps back when the fight has paused: Volt has been more than 4.5 m away for 1.2 s, or it has fought for 6–10 s (random) and no blow has been thrown or landed for 1.5 s. If Volt hits a waiting enemy, that enemy takes the turn and fights back, unless the current fighter is attacking or traded a blow in the last second. An enemy that cannot reach Volt within 4 s before the fight starts gives up the turn.
- **Own and borrowed animations.** Every attack each character uses is now its own Tripo clip. All characters share one skeleton, so if a model lacks a clip it can still borrow it from a similar body (the hips height is scaled to the borrower); none of the clips used in play are borrowed any more. If thug_kicker.glb or thug_crusher.glb fails to load, Flick / Crusher is shown as a recoloured copy of Sprat / Slab instead.
- **Who attacks with what.** On each turn (and after each attack) an enemy picks one of its attacks at random by weight, among those it may use at its distance:
  - Sprat: jab; then 35% a cross or 15% another jab straight away.
  - Flick: front kick (weight 3); within 1.0 m also a jab (weight 2), then 50% a kick. It stands at kick range.
  - Slab: overhead swing (weight 2); within 1.1 m also a hook (weight 1).
  - Crusher: cross (weight 2), then 60% a hook; stomp kick (weight 1).
  - Big Anvil: haymaker within 1.5 m (weight 2), then 25% (45% below half health) a stomp kick; stomp kick from 1.5 m (weight 2); overhead smash (weight 1).
  - Follow-ups do not chain further, and a hit on the enemy cancels its follow-up.
- **Surprises.** Slab sometimes (30%) rushes in at 1.8× speed. Big Anvil plans a stomp kick or a haymaker at random (50/50).
- **Special moves.** A big red "!" above an enemy warns before a dash or a charge, so Volt can sidestep in depth.
  - Sprat and Flick dash (40% of turns, from 2 m or more): "!" for 0.25 s, then run in at 2.4× speed (run animation) and attack.
  - Sprat and Flick hop (30% after a jab or cross, at most every 1.5 s): hops 1.2 m back out of the combo in 0.28 s and can't be hit meanwhile.
  - Sprat feint (20% of turns): starts a jab, stops at 15%, and jabs for real 0.35 s later.
  - Slab and Crusher belly charge (35% of turns, 2–7 m away and lined up within 0.5 m): "!" for 0.5 s, then charges straight ahead (see the enemy table). If he misses, he needs 0.6 s longer before his next attack.
  - Big Anvil bull charge (40% of turns, from 3 m or more): "!" for 0.6 s, then charges at 5.5 m/s (steering up to 0.8 m/s in depth) and ends with a haymaker; he stops after 1.6 s or once past Volt.
  - Big Anvil roar: the first time he drops below half health he stops for 0.8 s ("ROAR!", cheer animation) and one more Sprat joins the wave.
  - Taunt (Sprat, Flick, Crusher): a waiting enemy more than 2.2 m from Volt sometimes (15% each time it picks a new spot) shows off for 1.4 s (cheer animation) and is open to a hit.
- **Crates and food.** Any of Volt's attacks that reaches a crate breaks it ("CRASH!"). It drops a hot dog; walking over it restores 15 health. The three crates come back when the round restarts.
- **Smooth movement.** Enemies slow down as they arrive and speed up gradually, and only switch between walk and idle when their speed clearly changes. The game updates at a fixed 60 steps a second, and each frame draws characters between their last two steps, so movement stays smooth on 120 Hz and 144 Hz screens.

## Out of scope
Only one level. No jumping, weapons, scrolling or saving. The only pickup is food from crates.
