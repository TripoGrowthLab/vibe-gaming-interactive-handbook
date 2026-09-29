# TOY BOX BOUT

A 1v1 part-swapping robot battler. Pipo, a small plastic toy robot, fights three rivals inside a toy box. Each robot is four parts: head, right arm, left arm and legs. Break the rival's head to win, take one of its parts, and fit it to Pipo in the garage, with a choice of three paints. Japanese text, with an English toggle.

**Controls:** move WASD · left arm J / left click · right arm K / right click · dash Space · head ability E · pause Esc · models / greybox G. On a phone: stick on the left, buttons on the right.

## Run it

```sh
npm install && npm run dev
```

No models are included, so the game runs in greybox: every robot part, the arena and the toy blocks are simple shapes with the same size and attach points as the finished models. The console prints a "did not load" warning per missing model; that is expected.

## Get the Tripo look

1. `assets.json` lists all 8 models: id, size, the parts each robot must split into, the styles and the full generation prompt. Its notes give the Studio settings used for the robots.
2. Make each one in [Tripo Studio](https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_toy_box_bout_readme). The robots use Generate in Parts; the game matches each part to a slot by its position.
3. Export GLB, name it after the id (`robot_pipo.glb`, `arena_toybox.glb`, …) and put it in `public/assets/`. The two extra paints of each robot are the same model with a different style texture: `robot_<name>_mechapop.glb` and `robot_<name>_wood.glb`.
4. Reload. Missing files stay greybox.

Your generations will not match the originals exactly, so ask your agent to check each model against its greybox (stage 5 of the prompt).

## How it was made

Built from an empty folder by a coding agent (Claude Code, model `claude-opus-5-5`) with prompt draft v3.1 (what each draft added is in [`../../prompt/CHANGELOG.md`](../../prompt/CHANGELOG.md)); the current version is [`../../prompt/vibe-gaming.md`](../../prompt/vibe-gaming.md). `GDD.md` is the agent's one-page design. `tools/` holds the agent's own test scripts, bots and model viewers (`tools/viewer/`); the scripts drive a local Chrome through `playwright-core` (macOS path) and expect a dev server on the port named in each script.
