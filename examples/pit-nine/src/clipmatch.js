// Finds the Tripo clip for a wanted animation name. Tripo renames clips (defeat_02 can come out as defeat_03, and a
// Text to Motion clip is named after the start of its description), so match exact, then prefix, then closest.
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function matchClip(clips, wanted) {
  const w = wanted.toLowerCase();
  const names = clips.map((c) => c.name.toLowerCase());
  let i = names.indexOf(w);
  let how = 'exact';
  if (i < 0) (i = names.findIndex((n) => n.startsWith(w + ':') || n.startsWith(w))), (how = 'prefix');
  if (i < 0) {
    let best = Infinity;
    names.forEach((n, k) => {
      const d = distance(w, n.split(':')[0]);
      if (d < best) (best = d), (i = k);
    });
    how = best <= 2 ? `closest (${best} letters differ)` : null;
    if (!how) i = -1;
  }
  return i < 0 ? null : { clip: clips[i], how };
}
