// Horde operations (SPEC2 §1.5, §6.4): the ONE damage path for enemies plus the spatial queries weapons,
// zones and abilities use. Kept out of horde.js (which only delegates) so that file stays small.
//   applyDamage(h, e, dmg, unit, src) -> { killed, used, blocked } (a reused scratch object: copy what you need)
//     src = { el = 'neutral', shieldHits = 1, bypassShield = false, cause = 'weapon', canBurn, events = true }
//     Shield: if e.shield > 0 and !bypassShield -> e.shield -= shieldHits, blocked, no hp damage (today's rule).
//     Update 3: a Shieldbearer that turns its shield (world 3+, e.turn) only blocks hits from the front: a
//     source point src.sx / src.sz (bullets: where the shot came from) more than ~70 deg off the shield goes through.
//     Else d = dmg * vsMul(el, type) * (frozen ? 1.25 : 1); kill at hp <= 0.
//     Carry: used = ceil(hpBefore / (unit * m)) * unit (bundled shots left over keep flying).
//   forEachInRadius(h, x, z, r, fn)            alive enemies within r, deterministic (grid bucket, list) order
//   nearestUnhit(h, x, z, r, hits, nh, aheadOf) nearest alive enemy within r not in hits[0..nh), z <= aheadOf
//   nearestAhead(h, x, z, band, maxDist)       nearest alive enemy ahead of z with |e.x - x| <= band
// Ties are broken by the lower list index (determinism checklist §6.8).
import { VS_INDEX } from '../data/matchups.js';
import { shieldFaces } from './hordeai.js';

export const ALIVE = 0;
const R = { killed: false, used: 0, blocked: false };
const SRC = { el: 'neutral', shieldHits: 1, bypassShield: false, cause: 'weapon', events: true };
const FROZEN_MUL = 1.25;

export function applyDamage(h, e, dmg, unit = dmg, src = SRC) {
  R.killed = false; R.used = 0; R.blocked = false;
  if (!e || e.state !== ALIVE || !(dmg > 0)) return R;
  const game = h.game;
  if (e.shield > 0 && !src.bypassShield && !(e.turn && src.sx != null && !shieldFaces(e, src.sx, src.sz))) {
    e.shield = Math.max(0, e.shield - (src.shieldHits || 1));
    e.sflash = 1;
    R.blocked = true;
    if (src.events !== false && game.events.wants('bullet:hit')) {
      const p = h.hitPos;
      if (!src.keepPos) { p.x = e.x; p.y = 0.5; p.z = e.z + e.def.r; }
      game.events.emit('bullet:hit', { kind: 'shield', pos: p, weapon: src.weapon || src.el });
    }
    if (e.shield === 0) { h.view.shatterShield(e); game.events.emit('enemy:shieldbreak', { pos: { x: e.x, y: 0.8, z: e.z } }); }
    return R;
  }
  const row = VS_INDEX[src.el] || VS_INDEX.neutral;
  const m = row[e.type] * (e.freezeT > 0 ? FROZEN_MUL : 1);
  const hpBefore = e.hp;
  e.hp -= dmg * m;
  if (e.flash < 0.35 && src.events !== false) e.flash = 1;
  if (e.hp <= 0) {
    h.kill(e, src.cause || 'weapon');
    R.killed = true;
    const u = (unit || dmg) * m;
    R.used = Math.max(1, Math.ceil(hpBefore / u - 1e-6)) * (unit || dmg);
  } else R.used = dmg;
  return R;
}

const BSRC = { el: 'neutral', shieldHits: 1, bypassShield: false, cause: 'weapon', events: true, keepPos: true, sx: 0, sz: 0 };

/** Bullet hit on an enemy (horde.hit): true = consumed, false = pierce spent, 'carry' = keep flying. */
export function bulletHit(h, e, b) {
  BSRC.el = b.el || 'neutral';
  BSRC.shieldHits = b.owner ? b.owner.shieldHits || 1 : 1;
  BSRC.cause = b.cause || (b.owner ? 'weapon' : 'helper');
  BSRC.weapon = b.owner ? b.owner.id : 'helper';
  // where the shot came from (for the front-only shield rule): back along its heading by the distance flown
  const sp = Math.hypot(b.vx, b.vz) || 1, back = Math.min(b.dist || 0, 40);
  BSRC.sx = b.x - (b.vx / sp) * back; BSRC.sz = b.z - (b.vz / sp) * back;
  const unit = b.unit || b.dmg;
  const hp = h.hitPos; hp.x = b.x; hp.y = b.y; hp.z = e.z + e.def.r;
  const r = applyDamage(h, e, b.dmg, unit, BSRC);
  h.last = r;
  if (r.blocked) return true;
  if (h.game.events.wants('bullet:hit')) {
    h.game.events.emit('bullet:hit', { kind: 'enemy', pos: hp, weapon: BSRC.weapon });
  }
  if (r.killed && b.dmg - r.used >= unit * 0.5) { b.dmg -= r.used; return 'carry'; }
  return false;
}

export function forEachInRadius(h, x, z, r, fn) {
  const r2 = r * r;
  const buckets = h.grid.buckets;
  // the grid is rebuilt after movement: pad by one cell for enemies that moved since
  for (let k = Math.floor(z - r - 1); k <= Math.floor(z + r + 1); k++) {
    const b = buckets.get(k);
    if (!b) continue;
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (e.state !== ALIVE) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= r2) fn(e);
    }
  }
}

export function nearestUnhit(h, x, z, r, hits = null, nh = 0, aheadOf = Infinity) {
  let best = null, bd = r * r;
  const list = h.list;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.state !== ALIVE || e.z > aheadOf) continue;
    const dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz;
    if (d2 > bd || (best && d2 === bd)) continue;
    let seen = false;
    for (let k = 0; k < nh; k++) if (hits[k] === e) { seen = true; break; }
    if (seen) continue;
    bd = d2; best = e;
  }
  return best;
}

export function nearestAhead(h, x, z, band, maxDist = Infinity) {
  let best = null, bd = Infinity;
  const list = h.list;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.state !== ALIVE || Math.abs(e.x - x) > band) continue;
    const d = z - e.z;
    if (d < 0 || d > maxDist || d >= bd) continue;
    bd = d; best = e;
  }
  return best;
}

// horde.js queries (helpers, autopilot)
/** Nearest alive enemy ahead of z (smaller z) within range, preferring small lateral offset. */
export function nearestAheadRange(h, x, z, range) {
  let best = null, bs = Infinity;
  for (let k = Math.floor(z); k >= Math.floor(z - range); k--) {
    const b = h.grid.buckets.get(k);
    if (!b) continue;
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (e.state !== ALIVE) continue;
      const s = (z - e.z) + Math.abs(e.x - x) * 1.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (best && z - k > (z - best.z) + 6) break;
  }
  return best;
}

/** Weighted count of enemies with |x - ex| < halfW and z in [zFar, zNear]. */
export function densityAt(h, x, halfW, zFar, zNear) {
  let n = 0;
  for (let k = Math.floor(zFar); k <= Math.floor(zNear); k++) {
    const b = h.grid.buckets.get(k);
    if (!b) continue;
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (e.state === ALIVE && Math.abs(e.x - x) < halfW) n += e.def.hp > 4 ? 4 : 1;
    }
  }
  return n;
}
