# LANTERN ALLEY

A 3D arcade beat 'em up. Volt, a comic-book street hero, clears an alley of four waves of thugs and then their boss, Big Anvil. Three-hit punch combos, kicks and running attacks; works with a keyboard or a touch joystick.

**Controls:** move WASD / arrows · run hold Shift · punch J (press again to combo) · kick K · switch look V · restart Enter. On a phone: joystick bottom-left, PUNCH and KICK bottom-right.

## Run it

```sh
npm install && npm run dev
```

No models are included, so the game runs in greybox: every character and prop is a simple shape with the same size, hitboxes and animation timing as the finished model. The console prints one "did not load … showing its greybox placeholder" warning per missing model; that is expected.

## Get the Tripo look

1. `assets.json` lists all 10 models: id, size, triangle budget, animations and the full generation prompt.
2. Make each one in [Tripo Studio](https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_lantern_alley_readme). Characters need Auto Rig plus the animations named in their entry.
3. Export GLB, name it after the id (`hero.glb`, `boss.glb`, `crate.glb`, …) and put it in `public/assets/`.
4. Reload. The game switches to models as soon as they load; any file that is missing stays greybox. If `thug_kicker.glb` or `thug_crusher.glb` is missing, that enemy is shown as a recoloured Sprat or Slab.

Your generations will not match the originals exactly, so ask your agent to check each model against its greybox (stage 5 of the prompt).

## How it was made

Built from an empty folder by a coding agent (Claude Code, model `claude-opus-5-5`) with prompt draft v2 (what each draft added is in [`../../prompt/CHANGELOG.md`](../../prompt/CHANGELOG.md)); the current version is [`../../prompt/vibe-gaming.md`](../../prompt/vibe-gaming.md). `GDD.md` is the agent's one-page design. `lab.html` (model viewer) and `tools/` are the agent's own test scripts and bots; they drive a local Chrome through `playwright-core` (macOS path) and expect a dev server on the port named in each script.
