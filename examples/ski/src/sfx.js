// Tiny synthesized sound effects (no audio files). Browsers only allow sound after a tap/key press.
let ctx = null;
export const sfxStats = { crash: 0, unlocked: false };

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    sfxStats.unlocked = true;
  } catch { /* no audio available */ }
}

// A soft snowy thump: low sine drop + short filtered noise burst.
export function playCrash() {
  sfxStats.crash++;
  if (!ctx) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.9, t);
  out.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  out.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + 0.5);

  const len = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  noise.connect(lp).connect(out);
  noise.start(t);
}
