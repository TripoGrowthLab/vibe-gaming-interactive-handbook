# Instructions for coding agents

This repository holds a prompt for building small 3D browser games and four example games made with it.

- **Starting a new game:** the user wants you to follow `prompt/vibe-gaming.md` (everything below its `---` line) in a new, empty folder, not inside this repository.
- **Working on an example:** each folder in `examples/` is a separate Vite + three.js project. Run `npm install && npm run dev` inside that folder. Read its `README.md`, `GDD.md` and `assets.json` first.
- **Models:** GLB files go in `examples/<game>/public/assets/`, named after the ids in `assets.json`. They are not committed; never add them to Git. Missing models fall back to greybox, so the game must keep working without them.
- **Tests:** `tools/` in each example holds the original agent's bots and checks. They drive a local Chrome through `playwright-core` and expect a dev server on the port named in each script; do not download a browser.
- **Do not edit** the prompt block in `README.md`, `README.zh-CN.md` or `README.ja.md`; change `prompt/vibe-gaming.md` and run `node scripts/sync-prompt.mjs`.
