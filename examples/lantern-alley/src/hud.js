import * as THREE from 'three';

const WORDS_LIGHT = ['BIF!', 'POW!', 'SMAK!'];
const WORDS_HEAVY = ['KA-POW!', 'WHAM!', 'KRAKK!'];

export class Hud {
  constructor(input) {
    this.$ = id => document.getElementById(id);
    this.hpFill = this.$('hp-fill');
    this.bossBar = this.$('boss-bar');
    this.bossFill = this.$('boss-fill');
    this.waveEl = this.$('wave');
    this.bannerEl = this.$('banner');
    this.endEl = this.$('end');
    this.endShown = false;
    this.comboEl = this.$('combo');
    this.endEl.addEventListener('pointerdown', () => input.press('restart'));
    this.v = new THREE.Vector3();
  }

  update({ hp, wave, waves, boss, left }) {
    this.hpFill.style.width = `${hp * 100}%`;
    this.hpFill.classList.toggle('low', hp < 0.3);
    this.waveEl.textContent = `WAVE ${Math.min(wave, waves)}/${waves} · ${left} LEFT`;
    this.bossBar.hidden = boss == null;
    if (boss != null) this.bossFill.style.width = `${boss * 100}%`;
  }

  // "2 HITS!", "3 HITS! COMBO!" ... pops under the health bar.
  combo(n) {
    if (n < 2) return;
    this.comboEl.innerHTML = `${n} HITS!${n >= 3 ? '<small>COMBO!</small>' : ''}`;
    this.comboEl.classList.remove('show');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('show');
  }

  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  popup({ target, def, armored, name }, camera) {
    this.camera = camera;
    this.v.copy(target.pos).setY(target.pos.y + 1.9).project(camera);
    const el = document.createElement('div');
    el.className = 'pop' + (armored ? ' armor' : def.hitstop > 0.1 ? ' heavy' : '') + (target.kind === 'hero' ? ' ouch' : '');
    const words = def.hitstop > 0.1 ? WORDS_HEAVY : WORDS_LIGHT;
    el.textContent = armored ? 'UNFAZED!' : name === 'bump' ? 'BONK!' : words[Math.floor(Math.random() * words.length)];
    el.style.left = `${(this.v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-this.v.y * 0.5 + 0.5) * innerHeight}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  // Comic text above a point in the world: "!" warnings, "CRASH!", "+15" ...
  say(pos, text, cls = '', height = 1.9) {
    this.v.copy(pos).setY(pos.y + height).project(this.camera);
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${(this.v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-this.v.y * 0.5 + 0.5) * innerHeight}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  showEnd(result) {
    this.endShown = true;
    this.$('end-title').textContent = result === 'win' ? 'ALLEY CLEAN!' : 'KNOCKED OUT';
    this.endEl.className = result;
    this.endEl.hidden = false;
  }

  hideEnd() { this.endShown = false; this.endEl.hidden = true; }
}
