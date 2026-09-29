// Keyboard + touch/mouse input. steer: +1 = toward +X (screen left), -1 = toward -X (screen right), 0 = straight.
// When several inputs are held, the most recently pressed one wins.
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);

export class Input {
  constructor(surface) {
    this.held = [];              // [{ key, dir }] in press order
    this.onStart = () => {};
    this.onPause = () => {};
    this.onDebug = () => {};

    addEventListener('keydown', (e) => {
      if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.press('k:' + e.code, LEFT_KEYS.has(e.code) ? 1 : -1);
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.onStart();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (!e.repeat) this.onPause();
      } else if (!e.repeat) {
        this.onDebug(e.code);
      }
    });
    addEventListener('keyup', (e) => this.release('k:' + e.code));
    addEventListener('blur', () => (this.held = []));

    const sideOf = (e) => (e.clientX < innerWidth / 2 ? 1 : -1);
    surface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      surface.setPointerCapture?.(e.pointerId);
      this.press('p:' + e.pointerId, sideOf(e));
    });
    surface.addEventListener('pointermove', (e) => {
      const h = this.held.find((x) => x.key === 'p:' + e.pointerId);
      if (h) h.dir = sideOf(e); // sliding a finger across the middle switches side
    });
    const up = (e) => this.release('p:' + e.pointerId);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    surface.addEventListener('lostpointercapture', up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(key, dir) {
    this.release(key);
    this.held.push({ key, dir });
  }

  release(key) {
    this.held = this.held.filter((h) => h.key !== key);
  }

  clear() {
    this.held = [];
  }

  get steer() {
    return this.held.length ? this.held[this.held.length - 1].dir : 0;
  }
}
