// Small synthesised sounds (no audio files). Browsers only allow sound after a tap, click or key press,
// so the audio starts on the first one. sfx(name) is safe to call any time; it does nothing while muted.
let ctx = null;
let master = null;
let muted = false;
const last = {};
let noiseBuf = null;

export function initSfx() {
  const start = () => {
    if (ctx) return ctx.state === 'suspended' && ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    // a gentle limiter so many hits at once do not clip
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, start, { passive: true });
}
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}
export const isMuted = () => muted;

function tone(type, f0, f1, dur, vol, at = 0) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q = 1, type = 'bandpass', at = 0) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  shoot: () => (tone('square', 900, 260, 0.07, 0.12), noise(0.04, 0.12, 3000, 0.8)),
  hitMetal: () => (tone('triangle', 1500, 900, 0.09, 0.28), noise(0.03, 0.25, 5000, 2)),
  hitCore: () => (tone('sine', 700, 1400, 0.12, 0.3), tone('triangle', 2100, 1600, 0.08, 0.15)),
  hitHound: () => (tone('sine', 240, 110, 0.08, 0.35), noise(0.05, 0.3, 1400, 1.2)),
  blocked: () => (tone('square', 320, 240, 0.05, 0.1), noise(0.04, 0.12, 900, 3)),
  houndDie: () => (noise(0.25, 0.5, 900, 0.7, 'lowpass'), tone('sawtooth', 300, 60, 0.22, 0.2)),
  boom: () => (noise(0.5, 0.7, 600, 0.6, 'lowpass'), tone('sine', 120, 35, 0.45, 0.5)),
  pop: () => (noise(0.15, 0.35, 1200, 0.8, 'lowpass'), tone('sine', 180, 70, 0.12, 0.25)),
  hurt: () => (tone('sine', 160, 70, 0.18, 0.45), noise(0.08, 0.2, 500, 1, 'lowpass')),
};
const GAP = { shoot: 0.03, hitMetal: 0.04, hitHound: 0.04, blocked: 0.05, hitCore: 0.04, boom: 0.08, pop: 0.05 };

export const sfxLog = {}; // how often each sound was asked for (read by the tests)
export function sfx(name) {
  sfxLog[name] = (sfxLog[name] || 0) + 1;
  if (!ctx || muted || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (now - (last[name] ?? -9) < (GAP[name] ?? 0.03)) return;
  last[name] = now;
  SOUNDS[name]();
}
