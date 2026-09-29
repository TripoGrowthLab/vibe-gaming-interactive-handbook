// Paint jobs for the greybox placeholders. Each robot has its own Factory and Mecha Pop colours;
// Wood is the same stained-wood look for everyone. Later, Tripo style textures replace these.
const FACTORY = {
  pipo: { main: 0x2f6fe0, accent: 0xf2f2ee, dark: 0x2a3140, glow: 0xffd23a },
  kanazuchi: { main: 0xf07a1a, accent: 0x2e2e2e, dark: 0x3b2a20, glow: 0x7af0ff },
  popgun: { main: 0x3fae4a, accent: 0xf0d23a, dark: 0x24382a, glow: 0xff4a4a },
  hazama: { main: 0x7a45c8, accent: 0xd8d8e6, dark: 0x2a2238, glow: 0x6affb0 },
};
const MECHAPOP = {
  pipo: { main: 0xff4fa3, accent: 0xffe14a, dark: 0x3a1f4a, glow: 0x4affe0 },
  kanazuchi: { main: 0x21c8e8, accent: 0xff3fb4, dark: 0x1f2a4a, glow: 0xffe14a },
  popgun: { main: 0xffd21f, accent: 0xff3b3b, dark: 0x3a2a1f, glow: 0x3bd1ff },
  hazama: { main: 0x9cff3a, accent: 0x1b1b1b, dark: 0x2a2a2a, glow: 0xff5ad2 },
};
const WOOD = { main: 0xc8955a, accent: 0x8a5a2e, dark: 0x4a2f1a, glow: 0xffe6a0 };

export function paintColors(robot, paint) {
  if (paint === 'wood') return { ...WOOD, rough: 0.75 };
  const set = paint === 'mechapop' ? MECHAPOP : FACTORY;
  return { ...set[robot], rough: paint === 'mechapop' ? 0.25 : 0.35 };
}
