// Match the unnamed pieces of a split model (tripo_part_N) to the robot's parts.
// Each piece goes to the placeholder part it overlaps most, scored as intersection over union so a
// big part (the core) does not swallow a small neighbour (an arm). Pieces that overlap nothing go
// to the placeholder with the nearest centre. Works on plain boxes, so the same
// code runs in the game and in the Node tools.

const vol = (b) => Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1]) * Math.max(0, b.max[2] - b.min[2]);
function overlap(a, b) {
  let v = 1;
  for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
  return v;
}
const centre = (b) => b.min.map((v, k) => (v + b.max[k]) / 2);

// pieces:  [{ name, min:[x,y,z], max:[x,y,z] }]   (already scaled/placed like the placeholder)
// targets: [{ key, min, max }]                    (placeholder part boxes)
// returns: { [pieceName]: { key, share } } where share = overlapped fraction of the piece
export function matchPiecesFlat(pieces, targets) {
  const out = {};
  for (const p of pieces) {
    let best = null;
    let bestV = 0;
    let bestScore = 0;
    for (const t of targets) {
      const v = overlap(p, t);
      const score = v / (vol(p) + vol(t) - v);
      if (score > bestScore) (bestScore = score), (bestV = v), (best = t);
    }
    if (!best) {
      const c = centre(p);
      let bestD = Infinity;
      for (const t of targets) {
        const tc = centre(t);
        const d = Math.hypot(c[0] - tc[0], c[1] - tc[1], c[2] - tc[2]);
        if (d < bestD) (bestD = d), (best = t);
      }
    }
    out[p.name] = { key: best.key, share: vol(p) > 0 ? bestV / vol(p) : 0 };
  }
  return out;
}

// Two steps: first pick the part (head, core, arm_r, arm_l, legs) by IoU with the whole part's box,
// then, inside that part, the sub-hinge (leg_l, tread_r, drill_tip...) it overlaps most. A piece
// that spans several sub-hinges (e.g. both treads welded to the hips) stays with the whole part.
export function matchPieces(pieces, targets) {
  const slotOf = (key) => key.split('/')[0];
  const slots = {};
  for (const t of targets) {
    const s = slotOf(t.key);
    const b = (slots[s] ??= { key: s, min: [...t.min], max: [...t.max], subs: [] });
    for (let k = 0; k < 3; k++) (b.min[k] = Math.min(b.min[k], t.min[k])), (b.max[k] = Math.max(b.max[k], t.max[k]));
    if (t.key.includes('/')) b.subs.push(t);
  }
  const bySlot = matchPiecesFlat(pieces, Object.values(slots));
  const out = {};
  for (const p of pieces) {
    const slot = slots[bySlot[p.name].key];
    let key = slot.key;
    if (slot.subs.length) {
      const shares = slot.subs.map((t) => ({ t, share: overlap(p, t) / Math.max(vol(p), 1e-12), iou: overlap(p, t) / (vol(p) + vol(t) - overlap(p, t)) })).sort((a, b) => b.iou - a.iou);
      const spansTwo = shares.length > 1 && shares[1].share > 0.15;
      // A sub-hinge only claims a piece that mostly sits on it; otherwise the piece is part of the whole.
      if (shares[0].iou > 0 && !spansTwo && shares[0].share > 0.2) key = shares[0].t.key;
      else if (shares[0].iou > 0 && !spansTwo) {
        // Small pieces near a sub-hinge (e.g. a drill bit) still belong to it if it is the closest.
        const c = p.min.map((v, k) => (v + p.max[k]) / 2);
        const inside = (t) => c.every((v, k) => v >= t.min[k] - 0.03 && v <= t.max[k] + 0.03);
        if (inside(shares[0].t)) key = shares[0].t.key;
      }
    }
    out[p.name] = { key, share: bySlot[p.name].share };
  }
  return out;
}
