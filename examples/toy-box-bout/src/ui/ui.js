// All screens and the HUD, as plain DOM on top of the 3D view.
import { t, partName, robotName, partInfo, toggleLang, getLang } from '../i18n.js';
import { PARTS, SWAP_SLOTS, PAINT_SLOTS, PAINTS, RIVAL_ORDER, SKILLS } from '../data.js';

const $ = (sel, root = document) => root.querySelector(sel);

export class UI {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    root.innerHTML = `
      <div class="screen" id="s-title"></div>
      <div class="screen" id="s-garage"></div>
      <div class="screen" id="s-prize"></div>
      <div class="screen" id="s-result"></div>
      <div class="screen" id="s-pause"></div>
      <div id="hud"></div>
      <div id="announce"></div>
      <div id="touch"></div>`;
    this.hud = $('#hud', root);
    this.announceEl = $('#announce', root);
    this.touchEl = $('#touch', root);
    this.current = null;
    this.data = {};
  }

  show(name, data = {}) {
    if (name !== 'fight' && name !== 'pause') this.root.querySelectorAll('.floater').forEach((f) => f.remove());
    this.current = name;
    this.data = data;
    for (const s of this.root.querySelectorAll('.screen')) s.classList.remove('on');
    this.hud.classList.toggle('on', name === 'fight' || name === 'pause');
    this.touchEl.classList.toggle('on', name === 'fight');
    const el = $(`#s-${name}`, this.root);
    if (el) {
      el.classList.add('on');
      this[`render_${name}`]?.(el, data);
    }
    if (name === 'fight') this.buildHud(data);
  }

  rerender() {
    if (this.current === 'fight' || this.current === 'pause') this.buildHud(this.data.fightData || this.data);
    if (this.current && this.current !== 'fight') this.show(this.current, this.data);
  }

  // Greybox <-> models switch, shown on the title, garage and pause screens.
  viewButton() {
    const b = document.createElement('button');
    b.className = 'viewbtn';
    const ready = this.h.modelsReady();
    b.textContent = !ready ? t('loadingModels') : this.h.viewMode() === 'model' ? t('viewModel') : t('viewGreybox');
    b.disabled = !ready;
    b.onclick = () => this.h.toggleView();
    return b;
  }

  setPaintLoading(on) {
    this.root.classList.toggle('paint-loading', on);
    const el = this.root.querySelector('#paint-loading') || Object.assign(document.createElement('div'), { id: 'paint-loading' });
    el.textContent = t('loadingPaint');
    this.root.append(el);
  }

  setLoading(n, total) {
    this.loading = n === null ? null : `${n}/${total}`;
    const b = this.root.querySelector('.viewbtn');
    if (b && n !== null) b.textContent = `${t('loadingModels')} ${this.loading}`;
    if (n === null && this.current) this.rerender();
  }

  langButton() {
    const b = document.createElement('button');
    b.className = 'lang';
    b.textContent = t('language');
    b.onclick = () => toggleLang();
    return b;
  }

  // ---------- title ----------
  render_title(el) {
    el.innerHTML = `
      <div class="panel center">
        <div class="logo">${t('title')}</div>
        <div class="sub">${getLang() === 'ja' ? 'TOY BOX BOUT' : 'トイボックス・バウト'} — ${t('subtitle')}</div>
        <button class="big" id="btn-start">${t('start')}</button>
        <div class="hint keys-only">${t('controlsKeys')}</div>
        <div class="hint touch-only">${t('rotateHint')}</div>
      </div>`;
    $('.panel', el).append(this.langButton(), this.viewButton());
    $('#btn-start', el).onclick = () => this.h.start();
  }

  // ---------- garage ----------
  render_garage(el, d) {
    const { save } = d;
    const rival = RIVAL_ORDER[save.bout];
    const rows = PAINT_SLOTS.map((slot) => {
      const id = save.loadout[slot];
      const choices = save.inventory.filter((p) => PARTS[p].slot === slot);
      const paint = save.paints[id] || 'factory';
      const partCtl =
        slot === 'core'
          ? `<span class="pname">${partName(id)}</span>`
          : `<button class="arrow" data-act="part" data-slot="${slot}" data-dir="-1" ${choices.length < 2 ? 'disabled' : ''}>◀</button>
             <span class="pname">${partName(id)}</span>
             <button class="arrow" data-act="part" data-slot="${slot}" data-dir="1" ${choices.length < 2 ? 'disabled' : ''}>▶</button>`;
      return `
        <div class="grow">
          <div class="slot">${t('slot_' + slot)}${slot !== 'core' ? ` <small>(${choices.length})</small>` : ''}</div>
          <div class="ctl">${partCtl}</div>
          <div class="ctl paint">
            <button class="arrow" data-act="paint" data-slot="${slot}" data-dir="-1">◀</button>
            <span class="pname">${t('paint_' + paint)}</span>
            <button class="arrow" data-act="paint" data-slot="${slot}" data-dir="1">▶</button>
          </div>
          <div class="info">${partInfo(id)}</div>
        </div>`;
    }).join('');
    el.innerHTML = `
      <div class="panel garage">
        <div class="gtitle">${t('garage')} — ${t('bout', { n: save.bout + 1 })}</div>
        ${rows}
        <div class="next">${t('nextRival')}: <b>${robotName(rival)}</b></div>
        <div class="tipline"><b>${t('tip')}:</b> ${t('tip_' + rival)}</div>
        <button class="big" id="btn-fight">${t('fight')}</button>
      </div>`;
    $('.panel', el).append(this.langButton());
    $('#btn-fight', el).before(this.viewButton());
    for (const b of el.querySelectorAll('button.arrow')) {
      b.onclick = () => this.h.garageChange(b.dataset.act, b.dataset.slot, +b.dataset.dir);
    }
    $('#btn-fight', el).onclick = () => this.h.fight();
  }

  // ---------- prize ----------
  render_prize(el, { rival, owned }) {
    const cards = SWAP_SLOTS.map((slot) => {
      const id = `${rival}_${slot}`;
      const have = owned.includes(id);
      return `<button class="card" data-id="${id}" ${have ? 'disabled' : ''}>
        <div class="slot">${t('slot_' + slot)}</div><div class="pname">${partName(id)}</div><div class="info">${partInfo(id)}</div></button>`;
    }).join('');
    el.innerHTML = `
      <div class="panel center">
        <div class="gtitle">${t('win')}</div>
        <div class="sub">${t('pickPrize')} — ${robotName(rival)}</div>
        <div class="cards">${cards}</div>
      </div>`;
    for (const c of el.querySelectorAll('.card')) c.onclick = () => this.h.takePrize(c.dataset.id);
  }

  // ---------- result (lose / champion) ----------
  render_result(el, { champion, reason }) {
    if (champion) {
      el.innerHTML = `
        <div class="panel center">
          <div class="logo">${t('champion')}</div>
          <div class="sub">${t('championText')}</div>
          <button class="big" id="btn-new">${t('newRun')}</button>
        </div>`;
      $('#btn-new', el).onclick = () => this.h.newRun();
    } else {
      el.innerHTML = `
        <div class="panel center">
          <div class="logo lose">${reason === 'timeout' ? t('timeUp') : ''} ${t('lose')}</div>
          <button class="big" id="btn-retry">${t('retry')}</button>
          <button id="btn-title">${t('toTitle')}</button>
        </div>`;
      $('#btn-retry', el).onclick = () => this.h.retry();
      $('#btn-title', el).onclick = () => this.h.newRun();
    }
  }

  // ---------- pause ----------
  render_pause(el) {
    el.innerHTML = `
      <div class="panel center">
        <div class="gtitle">${t('pause')}</div>
        <button class="big" id="btn-resume">${t('resume')}</button>
        <button id="btn-quit">${t('toTitle')}</button>
        <div class="hint keys-only">${t('controlsKeys')}</div>
      </div>`;
    $('.panel', el).append(this.langButton(), this.viewButton());
    $('#btn-resume', el).onclick = () => this.h.resume();
    $('#btn-quit', el).onclick = () => this.h.newRun();
  }

  // ---------- HUD ----------
  buildHud({ player, rival }) {
    const side = (r, cls) => `
      <div class="side ${cls}">
        <div class="rname">${robotName(r.name)}</div>
        ${SWAP_SLOTS.map((s) => `<div class="bar" data-slot="${s}"><span class="bl">${t('slot_' + s)}</span><span class="bf"><i></i></span></div>`).join('')}
        <div class="state"></div>
      </div>`;
    this.hud.innerHTML = `${side(player, 'p')}<div class="timer">99</div>${side(rival, 'r')}
      <div class="cds"><span class="cd cd-dash">${t('btnDash')}</span><span class="cd cd-skill">${t('btnHead')}</span></div>`;
    this.hudRefs = {
      p: this.hud.querySelector('.side.p'),
      r: this.hud.querySelector('.side.r'),
      timer: this.hud.querySelector('.timer'),
      dash: this.hud.querySelector('.cd-dash'),
      skill: this.hud.querySelector('.cd-skill'),
    };
  }

  updateHud(fight, debug) {
    if (!this.hudRefs) return;
    const fill = (el, r) => {
      for (const s of SWAP_SLOTS) {
        const p = r.parts[s];
        const bar = el.querySelector(`.bar[data-slot="${s}"]`);
        const pct = Math.max(0, p.hp / p.max) * 100;
        bar.querySelector('i').style.width = `${pct}%`;
        bar.classList.toggle('broken', p.broken);
        bar.classList.toggle('low', !p.broken && pct < 35);
      }
      el.querySelector('.state').textContent = debug ? r.state + (r.queued ? ` +${r.queued}` : '') : '';
    };
    fill(this.hudRefs.p, fight.player);
    fill(this.hudRefs.r, fight.rival);
    this.hudRefs.timer.textContent = Math.ceil(fight.time);
    const pl = fight.player;
    const set = (el, left, total) => el.style.setProperty('--cd', `${(1 - left / total) * 100}%`);
    set(this.hudRefs.dash, pl.legless ? 1 : pl.cd.dash, pl.legless ? 1 : 1);
    set(this.hudRefs.skill, pl.cd.skill, SKILLS[pl.skill].cooldown);
    this.hudRefs.dash.classList.toggle('off', pl.legless);
  }

  // A number that pops up where a hit landed and floats away. x/y are CSS pixels.
  floatText(x, y, text, cls = '') {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.append(el);
    setTimeout(() => el.remove(), 900);
  }

  // Flash the HP bar of the part that was hit.
  flashBar(isPlayer, slot) {
    const side = this.hudRefs?.[isPlayer ? 'p' : 'r'];
    const bar = side?.querySelector(`.bar[data-slot="${slot}"]`);
    if (!bar) return;
    bar.classList.remove('flash');
    void bar.offsetWidth;
    bar.classList.add('flash');
  }

  announce(text, ms = 1200, cls = '') {
    this.announceEl.textContent = text;
    this.announceEl.className = `on ${cls}`;
    clearTimeout(this.annT);
    this.annT = setTimeout(() => (this.announceEl.className = ''), ms);
  }
}
