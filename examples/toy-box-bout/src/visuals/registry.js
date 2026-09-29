// The one place that decides how things look: id -> builder function.
// Gameplay only calls build(id, opts) and then finds child parts by name.
// There are two sets of builders: 'greybox' placeholders and 'model' (loaded GLBs).
// build() uses the current mode and falls back to the greybox builder when a model is missing.
const sets = { greybox: new Map(), model: new Map() };
let mode = 'greybox';

export function register(id, builder, set = 'greybox') {
  sets[set].set(id, builder);
}

export function has(id, set = mode) {
  return sets[set].has(id);
}

export function setMode(m) {
  mode = m;
}
export function getMode() {
  return mode;
}

export function build(id, opts = {}) {
  const builder = sets[mode].get(id) || sets.greybox.get(id);
  if (!builder) throw new Error(`No visual registered for "${id}"`);
  const obj = builder(opts);
  obj.userData.visualId = id;
  return obj;
}

export function ids(set = 'greybox') {
  return [...sets[set].keys()];
}
