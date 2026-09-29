import { PLAYER, WAVES } from './config.js';
import { STYLES, getStyle } from './registry.js';

const PART_LABELS = {
  left_cannon: 'L cannon',
  right_cannon: 'R cannon',
  missile_pod: 'Pod',
  armour_plate: 'Armour',
  core: 'Core',
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hp = $('hp-fill');
  const hpText = $('hp-text');
  const status = $('status');
  const boss = $('boss');
  const banner = $('banner');
  const end = $('end');
  const rows = {};
  for (const [k, label] of Object.entries(PART_LABELS)) {
    const row = document.createElement('div');
    row.className = 'part';
    row.innerHTML = `<span>${label}</span><div class="bar"><div class="fill"></div></div>`;
    boss.appendChild(row);
    rows[k] = row;
  }
  const controls = $('controls');
  const marks = $('marks');
  let controlsT = 0;
  let bannerT = 0;
  let last = 0;
  const hud = {
    layer: $('touch-layer'),
    // lowest pixel the top HUD covers, so the camera can keep the action below it
    topCover() {
      const b = boss.getBoundingClientRect();
      const bossOnTop = boss.classList.contains('show') && b.top < innerHeight / 2;
      return (bossOnTop ? b : status.getBoundingClientRect()).bottom + 6;
    },
    roll: $('roll-btn'),
    restartBtn: $('restart-btn'),
    styleBtn: $('style-btn'),
    modelBtn: $('model-btn'),
    soundBtn: $('sound-btn'),
    // a boss bar lights up for a moment when its part is hit
    pulsePart(name) {
      const row = rows[name];
      if (!row) return;
      row.classList.add('hit');
      clearTimeout(row._t);
      row._t = setTimeout(() => row.classList.remove('hit'), 110);
    },
    // a small cross where a shot landed (red and bigger for a kill or a broken part)
    hitMarker(x, y, big) {
      if (marks.childElementCount > 12) marks.firstChild.remove();
      const m = document.createElement('div');
      m.className = big ? 'mark big' : 'mark';
      m.style.left = `${x}px`;
      m.style.top = `${y}px`;
      marks.appendChild(m);
      setTimeout(() => m.remove(), big ? 360 : 200);
    },
    loading: $('loading'),
    endRestart: $('end-restart'),
    banner(text, sec) {
      banner.textContent = text;
      banner.classList.add('show');
      bannerT = sec;
    },
    // a short card with the controls, shown at the start of a round
    showControls(sec) {
      const touch = document.body.classList.contains('touch');
      const items = touch
        ? [['Left thumb', 'move'], ['Right thumb', 'aim + shoot'], ['ROLL', 'dodge (you cannot be hurt mid-roll)']]
        : [['WASD', 'move'], ['Mouse', 'aim'], ['Hold click', 'shoot'], ['Space', 'roll: dodge (you cannot be hurt mid-roll)']];
      controls.innerHTML = items.map(([k, v]) => `<div><b>${k}</b> ${v}</div>`).join('');
      controls.classList.add('show');
      controlsT = sec;
    },
    showEnd(result, stats) {
      end.classList.add('show');
      end.querySelector('h1').textContent = result === 'won' ? 'THE FOREMAN IS DOWN' : 'SCRAPPED';
      end.querySelector('h1').className = result;
      const broken = stats.partsBroken.length;
      end.querySelector('p').innerHTML =
        `Time ${stats.time.toFixed(1)} s · Hounds destroyed ${stats.houndsDestroyed} · Foreman parts broken ${broken}/5<br>` +
        `Shots ${stats.shots} · Rolls ${stats.rolls} · Repair kits ${stats.kitsTaken}`;
    },
    hideEnd() {
      end.classList.remove('show');
      controls.classList.remove('show');
      bannerT = controlsT = 0;
      banner.classList.remove('show');
    },
    setStyleLabel() {
      hud.styleBtn.textContent = `Look: ${STYLES[getStyle()].label}`;
    },
    setModelLabel(on) {
      hud.modelBtn.textContent = on ? 'Models' : 'Greybox';
    },
    update(game) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (bannerT > 0 && (bannerT -= dt) <= 0) banner.classList.remove('show');
      if (controlsT > 0 && (controlsT -= dt) <= 0) controls.classList.remove('show');
      const p = game.player;
      hp.style.width = `${(p.hp / PLAYER.maxHp) * 100}%`;
      hp.classList.toggle('low', p.hp <= 30);
      hpText.textContent = Math.ceil(p.hp);
      const f = game.foreman;
      const bossOn = game.phase === 'boss' || (game.over && f.state !== 'dormant');
      boss.classList.toggle('show', bossOn);
      if (game.phase === 'wave' || game.phase === 'intro' || (game.phase === 'gap' && game.wave < WAVES.length - 1)) {
        const left = game.phase === 'intro' ? WAVES[0].count : game.hounds.length + game.spawnQueue.length;
        status.textContent = `Wave ${Math.max(1, game.wave + 1)} / ${WAVES.length} · Scraplings ${left}`;
      } else if (bossOn) status.textContent = 'THE FOREMAN';
      else status.textContent = '';
      if (bossOn)
        for (const [k, row] of Object.entries(rows)) {
          const part = f.parts[k];
          row.querySelector('.fill').style.width = `${(part.hp / part.max) * 100}%`;
          row.classList.toggle('broken', part.broken);
          row.classList.toggle('locked', k === 'core' && !f.coreExposed);
        }
    },
  };
  hud.setStyleLabel();
  return hud;
}
