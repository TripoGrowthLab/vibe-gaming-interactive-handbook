// Test bot (?bot=1): plays a full run through the real UI buttons, with an AI steering Pipo.
// It swaps in won parts, repaints one, retries lost bouts, then restarts from the champion screen.
// The report ends up in window.__botReport.
import * as THREE from 'three';
import { firstBlockHit } from './camera.js';

const PRIZE_ORDER = ['arm_r', 'legs', 'head'];
const _b = new THREE.Box3();

// Vertical gap between the top of the legs and the bottom of the core, in metres.
function stackGap(view) {
  const legs = view.part('legs');
  const core = view.part('core');
  if (!legs || !core) return null;
  view.root.updateMatrixWorld(true);
  const top = _b.setFromObject(legs, true).max.y;
  const bottom = _b.setFromObject(core, true).min.y;
  return bottom - top;
}
const MAX_TRIES = 8;

export class Bot {
  constructor({ ui, getSave }) {
    this.ui = ui;
    this.getSave = getSave;
    this.playerProfile = { pauseMin: 0.15, pauseMax: 0.35, dodge: 0.6, skill: 1 };
    this.wait = 0.6;
    this.equip = null;
    this.tries = 0;
    this.restarted = false;
    this.report = { bouts: [], champion: false, restartOk: false, done: false, notes: [] };
    window.__botReport = this.report;
  }

  click(sel) {
    const el = document.querySelector(sel);
    if (!el) {
      this.report.notes.push(`missing button ${sel}`);
      return false;
    }
    el.click();
    return true;
  }

  onFightStart(fight, save) {
    this.current = { bout: save.bout + 1, rival: fight.rivalId, loadout: { ...save.loadout }, try: this.tries + 1 };
  }

  onFightEnd(result) {
    this.report.bouts.push({ ...this.current, ...result });
    this.tries = result.won ? 0 : this.tries + 1;
    this.wait = 0.8;
  }

  // Every frame of a fight: measure what the player sees.
  watchFight(fight, camera) {
    const r = this.report;
    r.camera ??= { samples: 0, blocked: 0, rivalBlocked: 0, offscreen: 0 };
    r.gaps ??= {};
    const c = r.camera;
    c.samples++;
    camera.updateMatrixWorld(true); // the view as it will be drawn this frame
    // Wobble: the view's aim turning one way, then straight back, frame after frame.
    const f = camera.getWorldDirection(new THREE.Vector3());
    if (this.prevDir && this.prevDelta) {
      const d = f.clone().sub(this.prevDir);
      if (d.length() > 0.0175 && this.prevDelta.length() > 0.0175 && d.dot(this.prevDelta) < -0.8 * d.length() * this.prevDelta.length()) {
        c.wobble = (c.wobble || 0) + 1;
        const rig = window.__game.rig;
        (c.wobbles ??= []).length < 30 && c.wobbles.push({ state: fight.player.state, rivalState: fight.rival.state, hitstop: fight.hitstop > 0, ...(rig?.debug || {}), prevChoice: this.prevChoice, turnDeg: +((d.length() * 180) / Math.PI).toFixed(2) });
      }
      this.prevDelta = d;
    } else if (this.prevDir) this.prevDelta = f.clone().sub(this.prevDir);
    this.prevDir = f;
    this.prevChoice = window.__game.rig?.debug?.choice;
    const p = fight.player;
    c.bad ??= [];
    const note = (why) => c.bad.length < 40 && c.bad.push({ why, t: +fight.time.toFixed(2), state: p.state, pos: p.pos.toArray().map((v) => +v.toFixed(2)), rival: fight.rival.pos.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(2)) });
    const chestHidden = firstBlockHit(p.pos.clone().setY(0.3), camera.position, fight.blocks) !== null;
    const headHidden = firstBlockHit(p.pos.clone().setY(0.45), camera.position, fight.blocks) !== null;
    if (firstBlockHit(p.pos.clone().setY(0.18), camera.position, fight.blocks) !== null) c.hipsHidden = (c.hipsHidden || 0) + 1;
    if (chestHidden) c.blocked++;
    if (chestHidden && headHidden) (c.fullyHidden = (c.fullyHidden || 0) + 1), note('fully hidden');
    // A block filling the view: the camera closer than 0.25 m to a block.
    const cp = camera.position;
    const near = fight.blocks.some((b) => Math.hypot(Math.max(b.minX - cp.x, 0, cp.x - b.maxX), Math.max(b.minZ - cp.z, 0, cp.z - b.maxZ), Math.max(0, cp.y - b.top)) < 0.25);
    if (near) (c.blockInFace = (c.blockInFace || 0) + 1), note('block in front of camera');
    if (firstBlockHit(fight.rival.pos.clone().setY(0.3), camera.position, fight.blocks) !== null) c.rivalBlocked++;
    const feet = p.pos.clone().project(camera);
    const head = p.pos.clone().setY(0.5).project(camera);
    if (p.state !== 'knocked_down' && ![feet, head].every((q) => Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1)) {
      c.offscreen++;
      note('offscreen');
      if (c.bad.length <= 40) c.bad[c.bad.length - 1].proj = [feet, head].map((q) => [q.x, q.y, q.z].map((v) => +v.toFixed(2)));
    }
    for (const robot of fight.robots) {
      if ((robot.state === 'idle' || robot.state === 'walk') && !robot.legless) {
        const g = stackGap(robot.view);
        const key = `${robot.parts.legs.id} under ${robot.view.loadout.core}`;
        if (g !== null) r.gaps[key] = Math.max(r.gaps[key] ?? -1, +g.toFixed(3));
      }
    }
  }

  tick(dt, screen) {
    if (this.report.done) return;
    // Play with the real models once they are in (give up waiting after a while).
    this.modelWait = (this.modelWait || 0) + dt;
    if (!window.__game?.models && this.modelWait < 30) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.5;
    const save = this.getSave();
    if (screen === 'title') {
      if (this.restarted) {
        this.report.restartOk = save.bout === 0 && save.inventory.length === 5;
        this.report.done = true;
        return;
      }
      this.click('#btn-start');
    } else if (screen === 'garage') {
      // Look at the robot for a while (the camera sways) before touching anything.
      if (this.garageLook === undefined) {
        this.garageLook = 16;
        this.report.garageChecks ??= [];
      }
      if (this.garageLook > 0) {
        const v = window.__game.garageRobotVisible();
        this.report.garageChecks.push({ bout: save.bout + 1, ...v });
        this.garageLook -= this.wait + 0.5;
        this.wait = 0.5;
        return;
      }
      if (this.equip) {
        // Swap the won part in with the ▶ button and give it a Mecha Pop paint job.
        const { slot, id } = this.equip;
        let guard = 8;
        while (save.loadout[slot] !== id && guard-- > 0) this.click(`button.arrow[data-act="part"][data-slot="${slot}"][data-dir="1"]`);
        this.click(`button.arrow[data-act="paint"][data-slot="${slot}"][data-dir="1"]`);
        this.report.notes.push(`equipped ${id} in ${slot}, paint ${save.paints[id]}`);
        this.equip = null;
        return;
      }
      // Check again with the swapped part on, then go.
      const v = window.__game.garageRobotVisible();
      this.report.garageChecks.push({ bout: save.bout + 1, afterSwap: true, ...v });
      (this.report.snug ??= []).push({ bout: save.bout + 1, loadout: { ...save.loadout }, gaps: window.__game.garageGaps() });
      this.garageLook = undefined;
      this.click('#btn-fight');
    } else if (screen === 'prize') {
      const slot = PRIZE_ORDER[save.bout];
      const id = document.querySelector(`.card[data-id$="_${slot}"]`)?.dataset.id;
      this.equip = { slot, id };
      this.click(`.card[data-id="${id}"]`);
    } else if (screen === 'result') {
      if (document.querySelector('#btn-new')) {
        this.report.champion = true;
        this.restarted = true;
        this.click('#btn-new');
      } else if (this.tries >= MAX_TRIES) {
        this.report.done = true;
      } else this.click('#btn-retry');
    }
  }
}
