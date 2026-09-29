// One seeded random generator for all gameplay randomness.
// ?seed=123 in the address makes a round repeatable (the test bot uses this).
let state = (Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 2 ** 31)) >>> 0;

export function random() {                      // mulberry32
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const range = (a, b) => a + (b - a) * random();
export const chance = p => random() < p;
export const jitter = (value, amount) => value * range(1 - amount, 1 + amount);
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
