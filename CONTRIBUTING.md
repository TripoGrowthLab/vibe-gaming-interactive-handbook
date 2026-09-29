# Contributing

The prompt gets better one pitfall at a time. Every line in [`prompt/CHANGELOG.md`](prompt/CHANGELOG.md) came from building a game with the prompt and writing down where the agent, or the person in Tripo Studio, went wrong.

## Ways to help

- **Show your game.** Use the **Show your game** issue form: a link or video, the agent and model you used, and the prompt version.
- **Report a pitfall.** Use the **Prompt feedback** form: which stage, what the prompt says, what actually happened (agent output, Studio screen), and what you did about it.
- **Fix an example.** Use the **Example does not run** form, or open a pull request.

## Pull requests

- Change the prompt only in `prompt/vibe-gaming.md`, then run `node scripts/sync-prompt.mjs` to copy it into the READMEs (English, 简体中文, 日本語), and add a CHANGELOG row that says which line changed and which pitfall it prevents.
- Each example is its own npm project. Before you open a PR, run `npm ci && npm run build` in every example you touched.
- Never commit `*.glb` or other model files, `.env` files, credentials, or personal contact details. The `check` workflow rejects them.

Node.js 22 or newer.
