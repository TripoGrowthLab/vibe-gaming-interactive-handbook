// Keyboard + mouse and touch (two floating sticks + ROLL button) feed one input object.
// World axes: +X is screen right, +Z is toward the camera (screen down).
export const input = {
  mode: 'mouse', // 'mouse' | 'touch' | 'bot'
  move: { x: 0, z: 0 },
  aimDir: null, // {x,z} for touch / bot
  mouseNdc: { x: 0, y: 0 },
  fireHeld: false,
  firePressed: false, // edge, consumed by the simulation
  rollPressed: false,
  restartPressed: false,
  stylePressed: false,
  modelPressed: false,
  bot: null, // when set, a bot writes move / aimDir / aimTarget / fire / roll
};

const keys = new Set();
const sticks = {}; // pointerId -> stick
let leftStick = null;
let rightStick = null;
const STICK_R = 60; // px for full deflection

export function initInput(el, ui) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') (input.rollPressed = true), e.preventDefault();
    if (e.code === 'KeyR') input.restartPressed = true;
    if (e.code === 'KeyL') input.stylePressed = true;
    if (e.code === 'KeyM') input.modelPressed = true;
    if (input.mode === 'touch') input.mode = 'mouse';
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    input.fireHeld = false;
  });

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      setTouchMode(true, ui);
      const left = e.clientX < innerWidth / 2;
      const s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0, left };
      if (left && !leftStick) leftStick = s;
      else if (!left && !rightStick) rightStick = s;
      else return;
      sticks[e.pointerId] = s;
      drawStick(s, ui);
      e.preventDefault();
      return;
    }
    if (input.mode === 'touch') setTouchMode(false, ui);
    if (e.button === 0) (input.fireHeld = true), (input.firePressed = true);
    if (e.button === 2) input.rollPressed = true;
  });
  el.addEventListener('pointermove', (e) => {
    const s = sticks[e.pointerId];
    if (s) {
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_R ? STICK_R / len : 1;
      s.x = (dx * k) / STICK_R;
      s.y = (dy * k) / STICK_R;
      drawStick(s, ui);
      return;
    }
    if (e.pointerType !== 'touch') {
      input.mouseNdc.x = (e.clientX / innerWidth) * 2 - 1;
      input.mouseNdc.y = -(e.clientY / innerHeight) * 2 + 1;
    }
  });
  const end = (e) => {
    const s = sticks[e.pointerId];
    if (s) {
      delete sticks[e.pointerId];
      if (s === leftStick) leftStick = null;
      if (s === rightStick) rightStick = null;
      s.el?.remove();
      return;
    }
    if (e.pointerType !== 'touch' && e.button === 0) input.fireHeld = false;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  ui.roll.addEventListener('pointerdown', (e) => {
    input.rollPressed = true;
    e.preventDefault();
    e.stopPropagation();
  });
  if (matchMedia('(pointer: coarse)').matches) setTouchMode(true, ui);
}

function setTouchMode(on, ui) {
  input.mode = on ? 'touch' : 'mouse';
  document.body.classList.toggle('touch', on);
  if (!on) {
    input.aimDir = null;
    input.fireHeld = false;
  }
}

function drawStick(s, ui) {
  if (!s.el) {
    s.el = document.createElement('div');
    s.el.className = 'stick';
    s.el.innerHTML = '<div class="knob"></div>';
    ui.layer.appendChild(s.el);
  }
  s.el.style.left = `${s.x0}px`;
  s.el.style.top = `${s.y0}px`;
  s.el.firstChild.style.transform = `translate(${s.x * STICK_R}px, ${s.y * STICK_R}px)`;
}

// Called once per rendered frame: turns keys / sticks into move, aim and fire.
export function pollInput() {
  if (input.bot) return input.bot.poll(input);
  if (input.mode === 'touch') {
    input.move.x = leftStick ? leftStick.x : 0;
    input.move.z = leftStick ? leftStick.y : 0;
    if (rightStick && Math.hypot(rightStick.x, rightStick.y) > 0.2) {
      input.aimDir = { x: rightStick.x, z: rightStick.y };
      const firing = Math.hypot(rightStick.x, rightStick.y) > 0.5;
      if (firing && !input.fireHeld) input.firePressed = true;
      input.fireHeld = firing;
    } else {
      input.fireHeld = false;
      input.aimDir = Math.hypot(input.move.x, input.move.z) > 0.2 ? { x: input.move.x, z: input.move.z } : null;
    }
    return;
  }
  let x = 0;
  let z = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  const len = Math.hypot(x, z) || 1;
  input.move.x = x / len;
  input.move.z = z / len;
}
