# Changelog

The prompt in [`vibe-gaming.md`](vibe-gaming.md) is copied into a coding agent as-is. This file explains why lines changed; the prompt itself carries no commentary.

Every change comes from building a game with the prompt from an empty folder and writing down where the agent, or the person following step 4 in Tripo Studio, went wrong.

## 1.1 — 2026-10-09

Built twice from an empty folder with the first 1.1 draft: a toy kart race (a vehicle split into parts, a seated driver, four skins) and a collect-and-stomp platformer (a running, jumping hero, a robot creature that falls apart, several skins). Both reached a compressed build with no hands-on help from the person following along. A test of high-quality hero models followed, then a third build with the revised draft. The lines below are the first draft plus the fixes those builds and the test asked for; two lines marked *untested* come from looking at why the kart looked plain. With the Studio steps moved out to their own page, the prompt went from about 2,620 to 3,030 words, plus about 1,200 words in the steps page.

**From comparing 1.0 with how other people build 3D browser games with coding agents, then confirmed by both builds:**

| Stage | Line added | Pitfall it prevents |
|---|---|---|
| Before stage 1 | Start git, save the prompt to AGENTS.md (with a CLAUDE.md pointing to it), keep PROGRESS.md, read both at the start of every stage | A long build outlives the agent's memory. In both builds a fresh session given one line ("The models are in public/assets.") read AGENTS.md and PROGRESS.md first and carried on without asking again. |
| Before stage 1 | Commit at the end of every stage that works, and each time say the one command that takes us back | Both builds committed every stage but, over 20 turns, never once told the reader how to go back. |
| 2 Greybox | All tunable numbers in one config file, plus a hidden debug panel with sliders, FPS, draw calls, bounding boxes and current state | Positions and timings get tuned by asking the agent again and again. With the panel, kart speed and jump height were tuned by dragging a slider, and the phone camera numbers the agent adopted were found that way. |
| 6 Publish | Shrink every GLB with glTF Transform (meshopt, WebP) as a build step with matching decoders, replay a full round, report download size and first-screen time on a phone | 2K textures exported as-is make a heavy first download. The two builds went from 17.0 to 4.1 MB and 17.7 to 4.0 MB, with animations, parts and skins still working. |

**From the two builds:**

| Stage | Line changed | Pitfall it prevents |
|---|---|---|
| 3 Asset list | Polygon budget at least 10000 for parts; count a split model at 1.5 times its budget | Generate in Parts will not go below 10000 triangles, and filling the gaps added about 50%, so three karts came to 44,000 triangles against an estimate of 24,000. |
| 3 Asset list | A texture prompt repaints the whole model, so it describes the whole object with every colour; a one-colour prop is tinted in code | "Same kart … purple instead of orange" came back orange with magenta trim, and other colour versions also recoloured the steering wheel, gloves and visor. |
| 3 Asset list | A seated person keeps legs and hips posed in code; animations drive the upper body only | Text to Motion turned "seated, hands on the wheel" into hugging knees on the floor, and the second try sat upright with hands on the belly. |
| 3 Asset list | Up to 4 styles per entry (was 2), including any other style Studio lists; Mecha Pop is no longer suggested; pick styles that suit the art style and say what each will look like | Both builds picked Mecha Pop for a bright toy or storybook look, and it came back as worn, dark metal. |
| 3 Asset list | "own image" is a close-up swatch of the material, with no creature or object | A one-line material description produced pictures of ice dragons and ice cats. |
| 3 Asset list | A split model gets one texture per piece (was "shares one") | The robot came back with one 2048 texture and eight 512 ones, so texture memory was 129 MB against a plan of 48 MB. |
| 4b | The free plan has no Private, so its models are public and not for commercial use | Privacy is a members-only setting, so on the free plan the step asked for an option that is not there. |
| 4c | Fill Parts is under Segment in the left bar | It no longer appears as an item of its own. |
| 4d | 2K every time (it can go back to 8K after a reload); Remove Lighting off on every model | 2K was forgotten after a reload. Remove Lighting is remembered between models; turned on, a rock lost its dark underside and looked grey next to the other props, so mixing the two makes a scene look uneven. |
| 4d | How to leave an uploaded style; where to paste a texture prompt (the pencil tab); Animate is under Rig | An uploaded style cannot be unselected by clicking it again; the step did not say where a texture prompt goes; Animate is not visible from the Texture page. |
| 4g | If the browser renamed a file (hero (1).glb), take the newest one and rename it | An old hero.glb in Downloads made the new export save as hero (3).glb, and dragging files by name would have put the old model in the game. |
| 5 Swap | Look at each style and colour version and say if one does not match its prompt | The agent checked shape and UV but missed that one colour version was the wrong colour. |
| 5 Swap | Collide with simple shapes that follow the visible surface, step rounded tops down inside the edge, fit shapes to models and never stretch a model to fit | The first draft said "sized to each model", which became bounding boxes: the hero stood 0.8 m in the air beside a rounded rock, and rocks were stretched 1.5 times upward to meet the old greybox shapes. |
| 5 Swap | Do not change gameplay code, not even to fix a bug | While fixing a reported bug, the agent changed player physics first and asked afterwards. |
| 5 Swap | Measure the player's share of an upright phone screen over a full round and report the smallest and largest | Measured standing still, the kart looked fine; on a hairpin with a boost the camera fell back until the kart was 10% of the screen. |
| Tests | A second bot that plays badly, holding forward into walls and obstacles | Driving slowly into a roadblock made the kart spin again and again for 30 seconds; the bot that drives well never did that. |

**From a hero-asset test** (the kart, the platformer hero and the robot each made again three ways: as in the builds, at Studio's highest settings, and at highest settings then reduced with Retopo; compared side by side and in both games):

| Stage | Line changed | Pitfall it prevents |
|---|---|---|
| 3 Asset list | Up to two hero entries, the ones the camera stays close to: a richer image prompt (materials, small details, decals or wear, the side the camera sees most), 10000 triangles for a person and 15000–20000 for parts, a short parts list | Core models looked plain. The detail came almost entirely from the image prompt: the old kart image at the highest settings looked the same as before, the new one did not. |
| 3 Asset list | A hero has three 4K textures (colour, normal, metal-rough) shared by its pieces | Counting colour textures only underestimates a hero's memory about three times. |
| 4 My turn | The Studio steps moved to [`tripo-studio-steps.md`](tripo-studio-steps.md); the agent gives the table and points the reader there | The steps were the longest part of the prompt, the agent only copied them, and Studio changes often. A page can be updated without a new prompt version and can carry pictures. |
| Studio steps | Hero: H3.1 with Ultra Mesh Quality at 200000, PBR, 4K, then Retopo down to the budget; rig a hero person only after Retopo; Pack UV on for a hero with parts | Reduced to 5–9% of its triangles, a hero looked the same as the full version up close and in the game, because Retopo keeps the textures, PBR maps and pieces and bakes the detail into the normal map. Auto Rig refuses a person above about 100000 triangles. Without Pack UV a hero with parts came with 28–40 materials and 90–120 MB of textures; with it, one material, and the kart race used less texture memory than before. |
| 5 Swap | Keep every map a model comes with and its metal and roughness values | Both games' code threw the normal and metal-rough maps away. |
| 5 Swap | A piece belongs to a part only if its centre sits inside that part's placeholder; print and check the pieces per part before moving hinges | A front bumper piece was grouped with the front left wheel, and the robot's chimney was missed. |
| 5 Swap | Merge each part's pieces when they share one material | Merging cut the kart race from 99 to 42 draw calls. |
| 5 Swap | Check facing again whenever a model is replaced, and make its style files again | The new kart faced −Z and the new robot −X, and old skins did not fit the new UVs. |

Not yet tested in a hero: Generate in Parts with Simple (the test used Detailed, which gave 28 and 40 pieces that Retopo could not reduce to the budget), and frame rate on a real phone.

**From a third build with the revised draft** (a desktop-only platformer made to look as good as possible, with a hero character and a hero robot, three skins each; the hero tier lifted the look a clear step above the earlier builds):

| Stage | Line changed | Pitfall it prevents |
|---|---|---|
| 3 Asset list | A hero's details are described as part of one front view of a single figure, never a back view or several views; the same for "the side the camera sees most" on any entry | "On the back, the side the camera sees most: …" made the image model draw the hero twice, front and back, in all eight pictures. |
| 3 Asset list | A hero's parts list has 6 or fewer parts | Nine parts on the list came back as eleven pieces with three of them fused into the body, so they had to be cut apart in code and showed black faces from above. |
| 3 Asset list | Say how the ground, sky and edge of the level will be made | Only listed objects got models; the ground, sky and level edge stayed greybox until the reader asked for the whole game to look as good as the characters. |
| 3 Asset list | Text to Motion is reliable on the ground; a mid-air motion often comes out standing | "Tuck in mid-air, then stamp down" came back as stamping on the spot. |
| 5 Swap | Style versions have the same shape but Tripo can change their UVs: compare them, and where they differ use that style file's own mesh; list which maps each style has | Restyling changed the hero's UVs (92–94% the same) and Pack UV repacks differently on every export (0% the same twice). Swapping only textures broke one skin into shards, and the agent misread the cause twice. Styles also came without a metal-rough map. |
| 5 Swap | Ignore a few millimetres of sleeve on clothes, and leave poses where the hands touch the body | Fixing every millimetre of a thick sleeve against a sweater pulled the hero's hands out of his pockets into a scarecrow pose. |
| Studio steps | Generate again if the picture shows the character twice; for a hero person, Generate in Parts and Remove Lighting off; tell the agent which parts came out fused; settings that stick across models; a rough credit guide; 1K is chosen at export; Text to Motion is under AI Animation; create `public/assets/` if needed | Thirteen differences between the page and Studio in this build. Generating PBR again after a style is written into the steps but not yet tested. |

The step 4 link pointed to a file that was not yet published; the agent found it missing, fell back to the published 1.0 steps and listed the differences. The page has to be online before this version is released.

**Untested, from why the kart looked plain:**

| Stage | Line added | Why |
|---|---|---|
| 3 Asset list | Give visible details to the side the camera sees most (for a vehicle the player follows, its back) | The kart image was a front three-quarter view, so the back, the only side seen while racing, was the model's plainest guess. |
| 5 Swap | Compare a close-up of each model in the game with Tripo Studio; if colours look washed out or flat, fix the lighting, not the textures | The candy skin's bright stripes looked dull pink in the game under flat light. |

## 1.0 — 2026-09-29

First public version. Changes against the last draft, stage by stage (about 2,440 → 2,620 words):

| Stage | Line changed | Pitfall it prevents |
|---|---|---|
| 3 Asset list | Polygon budget is "at least 500" triangles | Smart Mesh does not accept a lower Polycount and silently raises it, so a smaller budget in the list never matches the model you get. |
| 3 Asset list | Texture memory counts one colour texture per model (shared across the pieces of a split model) and no other maps | The agent assumed three maps per model and overestimated memory about three times, then planned downscaling it may not need. |
| 3 Asset list | Own-image style placeholder written as `[one line describing the look]` | An angle-bracket placeholder is hidden when the file is viewed as rendered Markdown. |
| 4b | "It may open on the HD Model tab, so click the Smart Mesh tab" | Generate 3D does not always open on Smart Mesh; it can open on HD Model with Generate in Parts already on, and generating there gives the wrong kind of model. |
| 4b | Topology resets "even though it says it saves your settings" | The dialog promises to remember your choice, but Topology came back as Quad at a default Polycount on every model. |
| 4b | Parts: "open Geometry & Texture" to set Topology | On the HD Model tab there is no control called Topology; the setting sits inside Geometry & Texture. |
| 4c | "Several pieces … not always one per part on the list" (was "about ten") | Split models came back with anywhere from 5 to 14 pieces, and small parts were sometimes merged into a neighbour, so a count that differs from the list looked like a failure. |
| 4c | "Open Fill Parts" (was "Open Segment, then Fill Parts"); "the result is saved by itself" (was "then click Save") | Fill Parts is its own item in the left panel and has no Save button, so readers looked for a button that is not there. |
| 4d | "Make sure Texture Resolution is 2K (it starts at 8K, then remembers your choice)" | The setting starts at 8K only the first time; after that the old line described a default that was no longer there. |
| 4e | Wait for Retargeting to finish before clicking the next animation | While one animation is retargeting the others are disabled, and a click in that window fails. |
| 4e | Text to Motion "costs credits" | Library animations are free and the step did not say Text to Motion is charged. |
| 4f | Number of Animations "starts at 0, which exports no animations" → Select All | Applied animations are not included by default; skipping this gives a rigged model with no animations. |
| 4f | "Make sure" Export Skeleton and Animation stay in Place are on (was "turn on") | Both are already on by default, and clicking a switch that is already on turns it off. |
| 4f | "If you see Pack UV, make sure it is off" (was "Leave Pack UV off") | Pack UV was on by default for split models, so leaving it alone exported a repacked atlas; single-mesh models have no Pack UV option at all. |
| 5 Swap | Measure every frame of a crash or knockdown so no character ends up inside what it hit | After a collision, the character's upper body ended up inside the obstacle it hit, and the agent's own tests did not catch it. |
| 5 Swap | When a swapped part has a different height, seat everything above it on the new part's real height and hinges, not the old part's or the placeholder's | After another machine's legs were fitted, the body kept the old leg height and floated above them; the agent's tests only swapped parts of the same height. |
| 5 Swap | On a phone held upright, measure the player's share of screen height and how much is empty sky or background, and report both numbers | "Big enough on a phone" was judged by pixel height alone and passed while the player was tiny and almost half the screen was sky. |

Formatting only: the prompt now has a blank line between lines so it keeps its line breaks when viewed as rendered Markdown. The words an agent reads are unchanged.

## Earlier drafts (not published)

Before 1.0 the prompt went through several internal drafts, each tested by building a different game from an empty folder:

| Draft | What it added |
|---|---|
| v0 | The shape of the prompt: ask a few questions first, then six stages that each stop for feedback. |
| v1 | Make up original characters and names; face direction for every object; three rules for a jump that feels good; exact Tripo Studio steps instead of a vague "generate the models"; test only with a browser already installed; image prompts on a plain white background. |
| v2 | Four rules for fights that feel good; enemies with the same shape share one model; add up triangles and texture memory for the busiest moment; a bot that plays a full round. |
| v2.1 / v2.2 | Re-centre hips after "stay in place"; match walk and run speed to movement so feet do not slide; measure arms passing through the body in code instead of judging by eye; wait for tests instead of leaving them in the background. |
| v3 | Three kinds of asset — person, prop, or an object with parts — each with its own rules; only people get bones, other bodies move by parts in code; list parts, hinges and what happens when they break; optional second texture style; check Topology on every model; 2K textures; Text to Motion only for people; split legs and upper body when a character runs and aims. |
| v3.1 | Swappable parts share slots with attach points; split models use Generate in Parts plus AI Completion; export each texture style and switch skins by swapping textures only; recompute bounding boxes and match pieces by node name; set every model to Private before generating. |
| v3.2 | Legs face where a character runs while the upper body aims; painted models glow and brighten their own colours instead of flashing white, and a hit must still be easy to see and hear; shake effects must not move the hit point; never start a test in the background. |
