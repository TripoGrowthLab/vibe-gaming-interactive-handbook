# PIT NINE

A top-down arena shooter. Tamsin, a scavenger trapped in a scrapyard pit, fights two waves of robot hounds, then a giant walking machine, the Foreman. Shoot its parts off one by one: each broken part takes away one of its attacks, until the core is exposed. One button switches the whole game to a second art style, Mecha Pop.

**Controls:** move WASD · aim with the mouse · hold click to shoot · Space roll · R restart · L art style · M models / greybox. On a phone: left stick moves, right stick aims and fires.

## Run it

```sh
npm install && npm run dev
```

No models are included, so the game runs in greybox: the player, hounds and Foreman are built from simple shapes with the same parts, hinges and hitboxes as the finished models. The console prints a "using the greybox" warning per missing model; that is expected.

## Get the Tripo look

1. `assets.json` lists all 8 models: id, size, triangle budget, animations and the full generation prompt.
2. Make each one in [Tripo Studio](https://studio.tripo3d.ai/?utm_source=github&utm_medium=referral&utm_campaign=vibe_gaming_interactive_handbook&utm_content=example_pit_nine_readme). Only the player is rigged; the hound and the Foreman are split into parts with Segment and moved in code.
3. Export GLB, name it after the id (`player.glb`, `foreman.glb`, …) and put it in `public/assets/`. The Mecha Pop version of each is `<id>_mecha_pop.glb`.
4. Reload. Missing files stay greybox.

`public/assets/player_armfix.json` keeps the original player's arms out of her body during animations. It was measured on that model; for your own player run `sh tools/arms-all.sh` (needs a dev server on port 5199) or delete the file.

Your generations will not match the originals exactly, so ask your agent to check each model against its greybox (stage 5 of the prompt).

## How it was made

Built from an empty folder by a coding agent (Claude Code, model `claude-opus-5-5`) with prompt draft v3 (what each draft added is in [`../../prompt/CHANGELOG.md`](../../prompt/CHANGELOG.md)); the current version is [`../../prompt/vibe-gaming.md`](../../prompt/vibe-gaming.md). `GDD.md` is the agent's one-page design. `lab.html` (model and parts viewer) and `tools/` are the agent's own test scripts and bots; they drive a local Chrome through `playwright-core` (macOS path) and expect a dev server on the port named in each script.
