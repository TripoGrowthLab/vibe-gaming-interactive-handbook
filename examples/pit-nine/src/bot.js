// Test bot (?bot=1): plays a full round through the same input object a player uses.
import * as THREE from 'three';
import { input } from './input.js';
import { FOREMAN, HOUND } from './config.js';

const ORDER = ['left_cannon', 'right_cannon', 'missile_pod', 'armour_plate', 'core'];

// clumsy = more like a person: aim wobbles, and about half of the dodges are missed.
export function startBot(getGame, clumsy = false) {
  input.mode = 'bot';
  let wobble = 0;
  let skipDodgeUntil = 0;
  const aim = new THREE.Vector3();
  let orbit = 1;
  let orbitT = 0;
  input.bot = {
    log: [],
    poll(inp) {
      const g = getGame();
      const p = g.player;
      const P = p.pos;
      inp.fireHeld = false;
      inp.move.x = inp.move.z = 0;
      inp.aimTarget = null;
      if (!p.alive || g.over) return;
      let mx = 0;
      let mz = 0;
      let rollDir = null;
      const away = (x, z, w) => {
        const d = Math.hypot(P.x - x, P.z - z) || 1;
        mx += ((P.x - x) / d) * w;
        mz += ((P.z - z) / d) * w;
      };
      const perp = (x, z) => {
        const d = Math.hypot(P.x - x, P.z - z) || 1;
        return { x: -(P.z - z) / d, z: (P.x - x) / d };
      };
      const f = g.foreman;

      // ---- aim and fire
      const hounds = g.hounds.filter((h) => h.alive && h.state !== 'spawn');
      if (hounds.length) {
        hounds.sort((a, b) => a.pos.distanceTo(P) - b.pos.distanceTo(P));
        const h = hounds[0];
        aim.set(h.pos.x, 0.6, h.pos.z);
        inp.aimTarget = aim;
        inp.fireHeld = true;
        const d = h.pos.distanceTo(P);
        if (d < 6) away(h.pos.x, h.pos.z, 1.2);
        else {
          const t = perp(h.pos.x, h.pos.z);
          mx += t.x * orbit * 0.8;
          mz += t.z * orbit * 0.8;
        }
      } else if (f.awake) {
        const part = ORDER.find((n) => f.isTarget(n));
        if (part) {
          aim.copy(f.partCenter(part));
          inp.aimTarget = aim;
          inp.fireHeld = true;
        }
        const d = Math.hypot(P.x - f.pos.x, P.z - f.pos.z);
        const t = perp(f.pos.x, f.pos.z);
        mx += t.x * orbit;
        mz += t.z * orbit;
        if (d < 10) away(f.pos.x, f.pos.z, 1.2);
        if (d > 13) away(f.pos.x, f.pos.z, -0.8);
      }
      // swap orbit direction now and then, and stay off the wall
      orbitT += 1 / 60;
      if (orbitT > 6) (orbit = -orbit), (orbitT = 0);
      const r = Math.hypot(P.x, P.z);
      if (r > 14) (mx -= (P.x / r) * 1.5), (mz -= (P.z / r) * 1.5);
      // repair kits when hurt
      if (p.hp < 75 && g.kits.length) {
        const k = g.kits.reduce((a, b) => (a.pos.distanceTo(P) < b.pos.distanceTo(P) ? a : b));
        if (k.pos.distanceTo(P) < 12) away(k.pos.x, k.pos.z, -2.5);
      }

      // ---- dodge
      for (const h of hounds) {
        const d = h.pos.distanceTo(P);
        if ((h.state === 'windup' && h.t > h.windupTime - 0.12 && d < 7.5) || (h.state === 'pounce' && h.t < 0.15 && d < 5)) rollDir = perp(h.pos.x, h.pos.z);
      }
      for (const s of g.shells) {
        const dx = P.x - s.pos.x;
        const dz = P.z - s.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.2 && dx * s.vel.x + dz * s.vel.z > 0) rollDir = perp(s.pos.x, s.pos.z);
      }
      for (const m of g.markers) {
        const d = Math.hypot(P.x - m.x, P.z - m.z);
        if (d < m.cfg.radius + 1.2) {
          away(m.x, m.z, 3);
          if (m.warn - m.t < 0.3 && d < m.cfg.radius + 0.4) rollDir = awayDir(P, m.x, m.z);
        }
      }
      if (f.attack === 'sweep' && f.beamOn) {
        const o = f.beamOrigin;
        const ang = Math.atan2(P.x - o.x, P.z - o.z);
        let gap = ang - f.beamYaw;
        gap = Math.atan2(Math.sin(gap), Math.cos(gap));
        const d = Math.hypot(P.x - o.x, P.z - o.z);
        if (f.beamOn === 2 && d < FOREMAN.attacks.sweep.length + 1 && gap > 0.02 && gap < 0.3) rollDir = awayDir(P, o.x, o.z);
      }
      if (f.attack === 'ram') {
        const k = f.attackT / FOREMAN.attacks.ram.time;
        const fw = f.forward();
        const rx = P.x - f.pos.x;
        const rz = P.z - f.pos.z;
        const side = Math.abs(rx * fw.z - rz * fw.x);
        if (side < 4.5 && rx * fw.x + rz * fw.z > 0) {
          const t = { x: fw.z, z: -fw.x };
          const s = rx * t.x + rz * t.z >= 0 ? 1 : -1;
          mx += t.x * s * 3;
          mz += t.z * s * 3;
          if (k > 0.38 && k < 0.6) rollDir = { x: t.x * s, z: t.z * s };
        }
      }
      if (f.attack === 'stomp') {
        const k = f.attackT / FOREMAN.attacks.stomp.time;
        away(f.pos.x, f.pos.z, 3);
        const d = Math.hypot(P.x - f.pos.x, P.z - f.pos.z);
        if (k > 0.45 && k < 0.6 && d < 5.8) rollDir = awayDir(P, f.pos.x, f.pos.z);
      }

      if (clumsy) {
        wobble += (Math.random() - 0.5) * 0.08;
        wobble *= 0.97;
        if (inp.aimTarget) {
          const a = Math.atan2(aim.x - P.x, aim.z - P.z) + wobble * 3;
          const d = Math.hypot(aim.x - P.x, aim.z - P.z);
          aim.x = P.x + Math.sin(a) * d;
          aim.z = P.z + Math.cos(a) * d;
        }
        if (rollDir && g.time > skipDodgeUntil && Math.random() < 0.5) {
          skipDodgeUntil = g.time + 0.8; // "didn't see it"
        }
        if (g.time < skipDodgeUntil) rollDir = null;
      }
      if (rollDir && p.rollCooldown <= 0 && !p.rolling) {
        mx = rollDir.x;
        mz = rollDir.z;
        inp.rollPressed = true;
      }
      const l = Math.hypot(mx, mz);
      if (l > 0.01) (inp.move.x = mx / Math.max(1, l)), (inp.move.z = mz / Math.max(1, l));
    },
  };
}
function awayDir(P, x, z) {
  const d = Math.hypot(P.x - x, P.z - z) || 1;
  return { x: (P.x - x) / d, z: (P.z - z) / d };
}
