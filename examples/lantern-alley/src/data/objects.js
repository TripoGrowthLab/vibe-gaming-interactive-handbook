// Every object id on screen and its size in metres: [width (X), height (Y), depth (Z)].
// Every object faces +Z in its own space. Used by visuals (to size models) and by
// collision (solid props).
export const OBJECTS = {
  hero:        { size: [0.6, 1.8, 0.4] },
  thug_skinny: { size: [0.5, 1.75, 0.35] },
  thug_kicker: { size: [0.5, 1.82, 0.35] },   // Flick
  thug_fat:    { size: [1.0, 1.7, 0.8] },
  thug_crusher:{ size: [1.05, 1.85, 0.85] },  // Crusher
  boss:        { size: [1.2, 2.3, 0.8] },
  dumpster:    { size: [2.0, 1.2, 1.0] },
  crate:       { size: [1.0, 1.0, 1.0] },
  trash_can:   { size: [0.55, 0.9, 0.55] },
  street_lamp: { size: [0.3, 3.5, 1.0] },
  food:        { size: [0.45, 0.2, 0.2] },   // pickup from a broken crate (built in code)
  floor:       { size: [40, 0.1, 8] },
  wall:        { size: [40, 6, 0.3] },
};
