// Keyboard + touch input. Gameplay reads `move` and takes queued presses.
// A bot can drive it through setVirtualMove() and press().
const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.queue = { punch: 0, kick: 0, restart: 0 };
    this.joy = { x: 0, z: 0 };
    this.virtual = null;
    addEventListener('keydown', e => {
      if (e.code === 'KeyJ' && !e.repeat) this.press('punch');
      else if (e.code === 'KeyK' && !e.repeat) this.press('kick');
      else if ((e.code === 'Enter' || e.code === 'KeyR') && !e.repeat) this.press('restart');
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  press(button) { this.queue[button] = 1; }   // at most one press is buffered
  take(button) { const had = this.queue[button] > 0; this.queue[button] = 0; return had; }
  takePunch() { return this.take('punch'); }
  takeKick() { return this.take('kick'); }
  takeRestart() { return this.take('restart'); }
  clear() { this.queue = { punch: 0, kick: 0, restart: 0 }; }
  setVirtualMove(m) { this.virtual = m; }

  // Run: hold Shift, or push the joystick all the way to its edge.
  get running() {
    if (this.virtual) return !!this.virtual.run;
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.z) >= 0.95;
  }

  get move() {
    if (this.virtual) return this.virtual;
    const k = n => KEYS[n].some(c => this.keys.has(c));
    let x = (k('right') ? 1 : 0) - (k('left') ? 1 : 0) + this.joy.x;
    let z = (k('down') ? 1 : 0) - (k('up') ? 1 : 0) + this.joy.z;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  // Touch: joystick at bottom-left, PUNCH/KICK at bottom-right.
  bindTouch(stick, knob, punchBtn, kickBtn) {
    const R = 50;
    let id = null, cx = 0, cy = 0;
    const set = (dx, dy) => {
      const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const x = (dx * k) / R, z = (dy * k) / R;
      const dead = Math.hypot(x, z) < 0.15;
      this.joy = dead ? { x: 0, z: 0 } : { x, z };   // screen down = towards the camera = +Z
      knob.classList.toggle('run', Math.hypot(x, z) >= 0.95);
    };
    stick.addEventListener('pointerdown', e => {
      id = e.pointerId;
      stick.setPointerCapture(id);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      set(e.clientX - cx, e.clientY - cy);
    });
    stick.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const end = e => { if (e.pointerId === id) { id = null; set(0, 0); } };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    for (const [btn, name] of [[punchBtn, 'punch'], [kickBtn, 'kick']]) {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); this.press(name); btn.classList.add('down'); });
      const up = () => btn.classList.remove('down');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }
}
