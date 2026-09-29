# Snowdrift Dash

An endless downhill ski game. Juno skis down the back slope of Mt. Hollowpine automatically; you steer through the gaps between trees, rocks, logs, snowmen and lift pylons. It gets faster the longer you last, and one hit ends the run. Score is the distance, and your best is saved on the device.

**Controls:** steer ← → or A / D · start / retry Space · pause P / Esc · models / greybox M. On a phone: hold the left or right half of the screen.

## Run it

```sh
npm install && npm run dev
```

No models are included, so the game runs in greybox: the skier and every obstacle are simple shapes with the same size and collision footprint as the finished models, and the look button reads "greybox (models failed)". The console prints one "did not load" warning per missing model; that is expected.

## Get the Tripo look

1. `assets.json` lists all 8 models: id, size, triangle budget, animations and the full generation prompt.
2. Make each one in [Tripo Studio](https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_ski_readme). The skier needs Auto Rig, `idle` and `defeat_02` from the animation library, and `ski_glide` made with Text to Motion from the description in its entry.
3. Export GLB, name it after the id (`skier.glb`, `pine_tree.glb`, …) and put it in `public/assets/`.
4. Reload. Missing files stay greybox.

`src/data/skier_arms.json` holds arm corrections measured on the original skier; with your own skier, have your agent re-measure it with the pages in `tools/lab/`, or expect some arm clipping. Your generations will not match the originals exactly, so ask your agent to check each model against its greybox (stage 5 of the prompt).

`src/embed.js` lets a page that embeds the game in an iframe switch between greybox and models with `postMessage`; it only trusts the handbook's own origins and localhost, and does nothing outside an iframe.

## How it was made

Built from an empty folder by a coding agent (Claude Code, model `claude-opus-5-5`) with prompt draft v3.2, the last draft before 1.0 (see [`../../prompt/CHANGELOG.md`](../../prompt/CHANGELOG.md)); the current version is [`../../prompt/vibe-gaming.md`](../../prompt/vibe-gaming.md). `GDD.md` is the agent's one-page design. `tools/` holds its bots, checks and model lab pages; they drive a local Chrome through `playwright-core` (macOS path) and expect a dev server on the port named in each script.
