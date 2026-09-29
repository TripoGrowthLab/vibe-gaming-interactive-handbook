# Snowdrift Dash — Game Design (one page)

**Pitch.** Juno Vale, a young ski instructor, bombs down the endless back slope of Mt. Hollowpine at the cosy Hollowpine resort. Dodge trees, rocks and other clutter for as long as you can. It gets faster the longer you last. One hit ends the run.

**Style.** Bright, stylised low-poly alpine: chunky shapes, flat colours, warm wood, white snow, blue sky.

## Core loop
1. Juno skis downhill automatically. Forward speed starts at **12 m/s**, rises by **0.3 m/s every second**, and stops rising at **38 m/s**.
2. The player steers left or right to go through the gaps between obstacles.
3. Obstacles appear in rows ahead of Juno. As the run goes on, the rows get closer together and hold more obstacles. Every row always leaves at least one gap **3 m wide** or more.
4. Score = distance travelled in metres, shown live. The best score is saved on the device.
5. Hitting an obstacle ends the run: Juno stops short, bounces off sideways and crashes. The score freezes at the moment of impact, then the Game Over screen shows your distance and your best. Restart right away.

## Controls
| Action | Keyboard | Touch (phone) |
|---|---|---|
| Steer left / right | ← → or A / D (hold) | Hold the left half / right half of the screen |
| Start / restart | Space or Enter | Tap the Start / Retry button |
| Pause | P or Esc | ❚❚ button in the top-right corner |

Steering is smooth. Holding a direction builds sideways speed up to **9 m/s**. Releasing it drifts back to straight in about 0.2 s. The run is a **24 m wide** corridor (x = −12 … +12). Safety fences line both edges and stop Juno without a crash.

## Win / lose
- **Win:** there is no finish line. You "win" by beating your best distance, and a "New best!" banner appears.
- **Lose:** Juno's hitbox touches any obstacle's hitbox. Hitboxes are about 15 % smaller than what you see, so near misses feel fair. The fences never end a run.

## Camera
Third person, behind and above Juno, looking downhill. It sits **6 m behind and 3.5 m above**, looking at a point 8 m ahead of Juno. It follows her sideways movement with a little lag. The field of view widens from **60° to 72°** as speed rises, so the speed can be felt. On a portrait phone the camera sits **5.5 m behind and 5.5 m up**, looks at a point 6 m ahead, and tilts down more steeply. Its view is 72°, widening to 78° at speed. About 20 % of the screen is sky, Juno stands in the lower quarter, and the whole 24 m run is in view 20 m ahead of her.

## World axes
Downhill is **+Z**. Up is **+Y**. Right (on screen) is **−X**, seen from the camera. The slope is drawn as a flat snow plane, and the camera's downward tilt suggests the steepness. There is one level: an endless procedurally spawned run.

## Objects on screen
Sizes are width × height × depth in metres. Every object is built facing **+Z**. "Faces" is the direction its front points in the world.

| id | What it is | Size (W × H × D) | Hitbox | Faces |
|---|---|---|---|---|
| `skier` | Juno Vale, the player: a person on skis | 0.6 × 1.7 × 1.6 (skis 1.6 long) | capsule r 0.3 | +Z (downhill) |
| `skis` | Juno's pair of skis, attached under her feet in code (not rigged into her body) | 0.3 × 0.1 × 1.6 | — (part of Juno) | +Z (tips point downhill) |
| `pine_tree` | snowy pine, main obstacle | 2.9 × 5.0 × 2.7 (real model) | cylinder r 1.3 (lowest branches reach 1.54) | +Z (round, any way) |
| `boulder` | grey rock with a snow cap | 1.8 × 1.1 × 1.26 (real model) | box 1.5 × 1.0 × 1.05 | −Z (its flat front face looks uphill at Juno) |
| `log` | fallen log lying across the run | 3.5 × 0.6 × 0.6 | box 3.0 × 0.5 × 0.5 | +Z (long side across X) |
| `snowman` | a guest's snowman with a wooden-bucket hat | 1.0 × 1.8 × 1.0 | cylinder r 0.4 | −Z (looks uphill at Juno) |
| `lift_pylon` | ski-lift support tower, appears after 600 m | 1.5 × 7.0 × 1.33 at the base (cross-arm on top is 3.1 wide) | box 1.3 × 7 × 1.1 | +Z |
| `edge_fence` | orange safety-net fence segment (scenery, not deadly) | 4.0 × 1.2 × 0.1 | wall, blocks only | ±X (net faces into the run) |

When each obstacle first appears: trees and boulders from 0 m, logs from 200 m, snowmen from 400 m, pylons from 600 m.

## Characters and states
Only one character animates: **Juno (`skier`)**, a **person**, so she gets bones. Her skis are a separate rigid object (`skis`) that sits under her feet and turns with her. In the 3D-model version she has no poles, because loose poles would clip through her arms.

| State | Looks like | Enters when | Leaves when |
|---|---|---|---|
| `idle` | standing on skis, relaxed | title screen, before the run starts | the player presses Start → `ski` |
| `ski` | knees bent, gliding forward | the run starts; steering input is released | a crash → `crash` |
| `carve` | the same as `ski`, but the whole body leans up to 20° into the turn (done in code, not an animation) | steering is held | steering is released → `ski`; a crash → `crash` |
| `crash` | knocked over into the snow. With the 3D model she is thrown 0.8 m back from what she hit, turns away from it (never toward a fence), and falls clear of it. Her skis stay where she hit (visual only) | Juno hits an obstacle | Game Over is shown 1.2 s later; Retry → `ski` (a new run starts at once) |

No other character or object moves on its own. There is no fighting. No object has breakable or swappable parts. Snow spray and the tree sway on impact are done in code.
