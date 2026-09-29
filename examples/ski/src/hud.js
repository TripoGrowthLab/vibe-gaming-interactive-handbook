// DOM overlay: HUD numbers, title / game over / pause screens, toast.
const $ = (id) => document.getElementById(id);

export function createHud({ onStart, onPause, onResume }) {
  const screens = { title: $('screen-title'), over: $('screen-over'), pause: $('screen-pause') };
  const hud = $('hud');
  const toastEl = $('toast');
  let toastTimer = 0;
  let last = { d: -1, s: -1, b: -1 };

  $('btn-start').addEventListener('click', onStart);
  $('btn-retry').addEventListener('click', onStart);
  $('btn-pause').addEventListener('click', onPause);
  $('btn-resume').addEventListener('click', onResume);
  // Buttons must not also count as a steering touch.
  for (const b of document.querySelectorAll('button, a')) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  return {
    show(mode, { distance = 0, best = 0, newBest = false } = {}) {
      document.body.dataset.mode = mode;
      for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== mode);
      hud.classList.toggle('hidden', mode === 'title');
      $('btn-pause').classList.toggle('hidden', mode !== 'play');
      $('title-best').textContent = `${best} m`;
      $('over-dist').textContent = `${distance} m`;
      $('over-best').textContent = `${best} m`;
      $('over-newbest').classList.toggle('hidden', !newBest);
      if (mode !== 'play') toastEl.classList.add('hidden');
    },
    update(dist, speed, best) {
      const s = Math.round(speed * 3.6);
      if (dist !== last.d) $('hud-dist').textContent = `${dist} m`;
      if (s !== last.s) $('hud-speed').textContent = `${s} km/h`;
      if (best !== last.b) $('hud-best').textContent = `${best} m`;
      last = { d: dist, s, b: best };
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1500);
    },
  };
}
