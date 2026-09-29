# Changelog

The prompt in [`vibe-gaming.md`](vibe-gaming.md) is copied into a coding agent as-is. This file explains why lines changed; the prompt itself carries no commentary.

Every change comes from building a game with the prompt from an empty folder and writing down where the agent, or the person following step 4 in Tripo Studio, went wrong.

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
