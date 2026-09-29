// Copies the prompt (everything below the first --- line of prompt/vibe-gaming.md) into the
// <!-- prompt:start --> … <!-- prompt:end --> block of each README.
//   node scripts/sync-prompt.mjs          rewrite the READMEs
//   node scripts/sync-prompt.mjs --check  exit 1 if a README is out of date
import { readFileSync, writeFileSync } from 'node:fs';

const READMES = ['README.md', 'README.zh-CN.md', 'README.ja.md'];
const source = readFileSync('prompt/vibe-gaming.md', 'utf8');
const body = source.slice(source.indexOf('\n---\n') + 5).trim();
const block = `<!-- prompt:start -->\n\`\`\`text\n${body}\n\`\`\`\n<!-- prompt:end -->`;
const check = process.argv.includes('--check');

let stale = 0;
for (const file of READMES) {
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/<!-- prompt:start -->[\s\S]*?<!-- prompt:end -->/, block);
  if (!text.includes('<!-- prompt:start -->')) throw new Error(`${file} has no prompt block`);
  if (next === text) continue;
  if (check) { console.error(`${file}: prompt is out of date, run node scripts/sync-prompt.mjs`); stale++; }
  else { writeFileSync(file, next); console.log(`${file}: updated`); }
}
process.exit(stale ? 1 : 0);
