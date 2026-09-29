import { HIT_DEPTH, ATTACKS } from '../config.js';
import { chance } from './random.js';

// Checks the attacker's hit window against targets and applies hits.
// Each attack hits each target at most once; invulnerable targets are skipped.
// One attack can hit several targets (sweeping kicks reach wider in depth).
export function resolveHits(attacker, targets, onHit) {
  const a = attacker.attack;
  if (!a || !attacker.attackActive) return;
  for (const t of targets) {
    if (!t.alive || t.invuln > 0 || a.hits.has(t)) continue;
    const dx = (t.pos.x - attacker.pos.x) * attacker.facing;
    const dz = Math.abs(t.pos.z - attacker.pos.z);
    if (dx < -0.2 || dx > a.def.reach + t.radius || dz > (a.def.depth ?? HIT_DEPTH)) continue;
    a.hits.add(t);
    applyHit(attacker, t, a.def, a.name, onHit, attacker.facing);
  }
}

// An enemy flying from a finisher (knockback of 1.2 m or more) knocks over the enemies it
// crashes into. The hit counts as Volt's.
export function resolveBumps(enemies, hero, onHit) {
  for (const f of enemies) {
    if (!f.kb || !f.kb.flying || f.kb.remaining < 0.2) continue;
    for (const t of enemies) {
      if (t === f || !t.alive || t.entering || t.invuln > 0 || f.kb.bumped.has(t)) continue;
      if (Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z) > f.radius + t.radius + 0.1) continue;
      f.kb.bumped.add(t);
      applyHit(hero, t, ATTACKS.bump, 'bump', onHit, f.kb.dir, f);
    }
  }
}

// dir: which way the target is pushed. freezer: who freezes with the target (the attacker,
// or for a bump the enemy that crashed into it).
function applyHit(attacker, target, def, name, onHit, dir, freezer = attacker) {
  // Running attacks send the target flying only sometimes; otherwise they are a solid hit.
  let launched;
  if (def.launchChance != null) {
    launched = chance(def.launchChance);
    if (!launched) def = { ...def, ...def.noLaunch };
  }
  const damage = Math.round(def.damage * (attacker.damageScale ?? 1));
  target.hp = Math.max(0, target.hp - damage);
  freezer.freeze = def.hitstop;           // hitstop: both fighters freeze
  target.freeze = def.hitstop;
  target.invuln = Math.max(target.cfg.invuln, def.recover ?? 0);   // cannot be hit again straight away
  target.shake = true;
  target.visual.hitFlash();
  // Armor: jabs and crosses hurt Slab and Big Anvil but never stagger them, so they keep coming
  // and keep swinging; only a hook or kick stops them.
  if (target.cfg.armor && !def.breaksArmor && target.hp > 0) {
    onHit({ attacker, target, def, name, damage, ko: false, armored: true, launched });
    return;
  }
  target.facing = -dir;                   // turn towards the hit
  target.kb = { dir, remaining: def.knockback, flying: def.knockback >= 1.2, bumped: new Set() };
  const ko = target.takeHit(def);
  onHit({ attacker, target, def, name, damage, ko, launched });
}
