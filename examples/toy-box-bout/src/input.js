// Keyboard + mouse + touch. sample() returns the stick (x = right, y = forward on screen),
// held buttons, and presses since the last sample.
export class Input {
  constructor(canvas, touchRoot) {
    this.keys = new Set();
    this.mouse = { l: false, r: false };
    this.touch = { l: false, r: false, stick: { x: 0, y: 0 } };
    this.pressed = { l: false, r: false, dash: false, skill: false, pause: false };
    this.enabled = true;

    const keyMap = {
      KeyJ: 'l', KeyK: 'r', Space: 'dash', KeyE: 'skill', KeyL: 'skill', Escape: 'pause',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const p = keyMap[e.code];
      if (p) this.pressed[p] = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.l = this.mouse.r = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) (this.mouse.l = true), (this.pressed.l = true);
      if (e.button === 2) (this.mouse.r = true), (this.pressed.r = true);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });

    this.buildTouch(touchRoot);
  }

  buildTouch(root) {
    root.innerHTML = `
      <div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="tbtns">
        <button class="tbtn tb-skill" data-b="skill"></button>
        <button class="tbtn tb-dash" data-b="dash"></button>
        <button class="tbtn tb-l" data-b="l"></button>
        <button class="tbtn tb-r" data-b="r"></button>
      </div>
      <button class="tbtn tb-pause" data-b="pause">❚❚</button>`;
    this.touchRoot = root;
    const zone = root.querySelector('.stick-zone');
    const base = root.querySelector('.stick-base');
    const knob = root.querySelector('.stick-knob');
    let id = null;
    let ox = 0;
    let oy = 0;
    const R = 50;
    zone.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      ox = e.clientX;
      oy = e.clientY;
      zone.setPointerCapture(id);
      base.style.left = `${ox}px`;
      base.style.top = `${oy}px`;
      base.classList.add('on');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) (dx *= R / len), (dy *= R / len);
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.stick.x = dx / R;
      this.touch.stick.y = -dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      base.classList.remove('on');
      this.touch.stick.x = this.touch.stick.y = 0;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    for (const b of root.querySelectorAll('.tbtn')) {
      const name = b.dataset.b;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.pressed[name] = true;
        if (name === 'l' || name === 'r') this.touch[name] = true;
        b.classList.add('down');
      });
      const up = () => {
        if (name === 'l' || name === 'r') this.touch[name] = false;
        b.classList.remove('down');
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
  }

  setLabels(t) {
    const q = (s) => this.touchRoot.querySelector(s);
    q('.tb-l').textContent = t('btnL');
    q('.tb-r').textContent = t('btnR');
    q('.tb-dash').textContent = t('btnDash');
    q('.tb-skill').textContent = t('btnHead');
  }

  sample() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    } else {
      x = this.touch.stick.x;
      y = this.touch.stick.y;
    }
    const out = {
      stick: { x, y },
      holdL: k.has('KeyJ') || this.mouse.l || this.touch.l,
      holdR: k.has('KeyK') || this.mouse.r || this.touch.r,
      pressL: this.pressed.l,
      pressR: this.pressed.r,
      dash: this.pressed.dash,
      skill: this.pressed.skill,
      pause: this.pressed.pause,
    };
    for (const key of Object.keys(this.pressed)) this.pressed[key] = false;
    return out;
  }
}
