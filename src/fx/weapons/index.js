// Per-weapon effects (SPEC2 §2 visuals; WEAPONS builder). installWeaponFx(fx) -> { update(dt), stats }.
// fx = the Fx director (fx.P particles, fx.D debris, fx.B bursts, fx.game). Muzzle and hit flashes live in
// fx/flashes.js; this module
//   - drains game.weapons.fxq every frame into the one-shot recipes (recipes.js): chain arcs (<= 60 segments/s
//     High, 30 Low), bounce streaks, candy splats, puddles, freezes, shatters, splits, holes, turret drops;
//   - runs the continuous emitters: ember streaks off live flames (<= 90/s High, 40 Low) + the Mk V ember ring
//     burst every 0.5 s, burning-enemy smoke (<= 20/s), black-hole inward streaks (<= 40/s High, 16 Low) and the
//     Mk V accretion stars, caramel bubble pops + amber specks on stuck enemies, Mk V gear spark trails, Mk V
//     candy sparkle trails, violet motes behind Void orbs;
//   - plays the crate pickup burst (crate:take).
// Never culled to zero: every recipe and emitter spawns >= 1 particle on Low (Bursts.n), only rates halve.
import { hexInt } from '../bursts.js';
import { SOFT, RING, STREAK, STAR, PUFF, BLOB, FLAT_RING } from '../particles.js';
import { weaponDef } from '../../data/weapons.js';
import { arc, play } from './recipes.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const STALE = 0.3; // s: fxq entries older than this (debug.simulate jumps) are dropped
const PER_FRAME = { splash: 8, puddle: 3, freeze: 6, shatter: 6, frost: 4, ignite: 6, split: 6, hole: 4, turret: 2, bounce: 8 };
// per-second budgets [High, Low] for recipes whose big translucent discs overdraw (a bundled Sugar Rush volley
// lands hundreds of bombs a second; the per-frame cap alone grows with the frame rate). The first one always plays.
const PER_SEC = { splash: [40, 14] };

export function installWeaponFx(fx) {
  const g = fx.game, ev = g.events;
  const st = {
    lastFire: -10, weapon: '', mk: 1, arcBudget: 0, ringT: 0, now: 0, low: false, arcs: 0,
    acc: { ember: 0, flame: 0, smoke: 0, hole: 0, bubble: 0, speck: 0, gear: 0, sugar: 0, motes: 0 },
    frame: {}, budget: {}, stats: { recipes: {}, particles: {} },
  };
  ev.on('weapon:fire', (p) => { st.lastFire = fx.now; st.weapon = p.weapon; st.mk = p.mk || 1; });
  ev.on('crate:take', (p) => crateBurst(fx, st, p));

  const count = (kind, n0) => {
    const s = st.stats;
    s.recipes[kind] = (s.recipes[kind] || 0) + 1;
    s.particles[kind] = (s.particles[kind] || 0) + Math.max(0, fx.P.n - n0);
  };
  const low = () => fx.quality === 'low';

  // one callback for the whole session (no per-frame closure): reads the frame's numbers from `st`
  const onEntry = (e) => {
    if (e.t < st.now - STALE) return;
    const n0 = fx.P.n;
    if (e.kind === 'arc') {
      const segs = st.low ? 3 : 3 + ((Math.random() * 3) | 0);
      if (st.arcBudget < segs && st.arcs > 0) return;
      st.arcBudget -= segs; st.arcs++;
      arc(fx, e, segs);
      count('arc', n0);
      return;
    }
    const f = st.frame, cap = PER_FRAME[e.kind] ?? 4;
    if ((f[e.kind] = (f[e.kind] || 0) + 1) > (st.low ? Math.ceil(cap / 2) : cap)) return;
    if (PER_SEC[e.kind]) { if (!(st.budget[e.kind] >= 1)) return; st.budget[e.kind] -= 1; }
    play(fx, e);
    count(e.kind, n0);
  };

  function drain(dt) {
    st.now = g.time; st.low = low(); st.arcs = 0;
    for (const k in st.frame) st.frame[k] = 0;
    const segRate = st.low ? 30 : 60;
    st.arcBudget = Math.min(segRate * 0.1, st.arcBudget + segRate * dt);
    for (const k in PER_SEC) {
      const rate = PER_SEC[k][st.low ? 1 : 0], b = st.budget[k];
      st.budget[k] = Math.min(Math.max(1, rate * 0.25), (b === undefined ? 1 : b) + rate * dt);
    }
    g.weapons.fxq.drain(onEntry);
  }

  function emitters(dt) {
    const w = g.weapons, id = w.id, mk = w.mk, P = fx.P, A = st.acc, lo = low();
    const firing = fx.now - st.lastFire < 0.2 && st.weapon === id;
    const L = w.def.look.mk[mk - 1];
    const B = g.bullets, active = B.active, beh = w.beh;
    // ---- Emberstorm: ember streaks off the flames, Mk V ember ring ----
    if (id === 'emberstorm' && firing) {
      const core = hexInt(L.core), c = hexInt(L.color);
      for (let i = 0, n = tickAcc(A, 'ember', lo ? 40 : 90, dt); i < n; i++) {
        const b = sampleStyle(active, beh.style);
        if (!b) break;
        P.spawn(STREAK, b.x + rnd(-0.2, 0.2), b.y + 0.1, b.z, rnd(-1.5, 1.5), rnd(1.5, 3.5), b.vz * 0.4, rnd(0.25, 0.45), 0.06, 0.02, i & 1 ? core : c, 1, 0.85, -2, 1, 0.05);
      }
      // licking fire puffs ride the flames (yellow core -> red tips)
      for (let i = 0, n = tickAcc(A, 'flame', lo ? 50 : 120, dt); i < n; i++) {
        const b = sampleStyle(active, beh.style);
        if (!b || b.dist > (b.data || 15)) continue;
        const s = 0.35 + 0.5 * Math.min(1, b.dist / (b.data || 15));
        const k = P.spawn(PUFF, b.x + rnd(-0.15, 0.15), b.y + 0.05, b.z, b.vx * 0.6, rnd(0.6, 1.4), b.vz * 0.6, rnd(0.26, 0.38), s * 0.9, s * 1.9, i % 3 ? core : 0xffffff, 0.95, 0.75, 0, 2.5, 0.03, i & 1 ? 0xff3b1f : c);
        if (k >= 0) P.d.fade[k] = 0.25;
      }
      if (mk >= 5 && (st.ringT -= dt) <= 0) {
        st.ringT = 0.5;
        const Ld = g.squad.leader;
        const k = P.spawn(FLAT_RING, Ld.x, 0.1, Ld.z - 2.5, 0, 0, -g.squad.speed, 0.4, 0.6, 4.2, 0xff7a32, 0.9, 0.7);
        if (k >= 0) P.d.fade[k] = 0.2;
        for (let i = 0, n = fx.B.n(8); i < n; i++) {
          const a = (i / n) * TAU;
          P.spawn(STREAK, Ld.x, 0.4, Ld.z - 2.5, Math.cos(a) * 6, 1.5, Math.sin(a) * 6 - g.squad.speed, 0.3, 0.07, 0.03, i & 1 ? 0xffe08a : 0xff5222, 1, 0.9, 0, 1, 0.04);
        }
      }
    }
    // ---- burning enemies: smoke puffs ----
    const list = g.horde.list;
    if (list.length) {
      for (let i = 0, n = tickAcc(A, 'smoke', lo ? 10 : 20, dt); i < n; i++) {
        let j = (Math.random() * list.length) | 0;
        for (let k = 0; k < 16; k++, j = (j + 1) % list.length) {
          const e = list[j];
          if (e.state === 0 && e.burn > 0) {
            const s = P.spawn(PUFF, e.x + rnd(-0.2, 0.2), 0.9, e.z, rnd(-0.2, 0.2), rnd(1, 1.8), 0, rnd(0.6, 0.9), 0.18, 0.55, 0x6e5a50, 0.55, 0, -0.4, 1.2, 0, 0x2e2622);
            if (s >= 0) P.d.fade[s] = 0.3;
            if (Math.random() < 0.5) P.spawn(STREAK, e.x, 0.7, e.z, rnd(-0.6, 0.6), rnd(1.5, 2.5), 0, 0.3, 0.06, 0.02, 0xffa040, 1, 0.8, -1, 0, 0.05);
            break;
          }
        }
      }
    }
    // ---- black holes: inward streaks, Mk V accretion stars ----
    const Z = g.zones, holes = Z.holes;
    if (holes.length) {
      const n = tickAcc(A, 'hole', lo ? 16 : 40, dt);
      for (let i = 0; i < n; i++) {
        const h = holes[i % holes.length], r = Z.holeR(h), a = Math.random() * TAU;
        const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
        P.spawn(STREAK, x, rnd(0.2, 0.9), z, -Math.cos(a) * r * 2.2, -0.2, -Math.sin(a) * r * 2.2, 0.4, 0.07, 0.02, i & 1 ? 0xff4bd8 : 0xb44bff, 0.9, 0.85, 0, 0, 0.06);
        if (id === 'voidsiphon' && mk >= 5 && (i & 1)) {
          const rr = Z.holeCore(h) * 1.5, b = Math.random() * TAU;
          P.spawn(STAR, h.x + Math.cos(b) * rr, 0.35, h.z + Math.sin(b) * rr, -Math.sin(b) * 4, 0, Math.cos(b) * 4, 0.3, 0.16, 0.05, 0xffe1fa, 1, 0.9);
        }
      }
    }
    // ---- caramel puddles: bubble pops + amber specks on stuck enemies ----
    const pud = Z.puddles;
    if (pud.length) {
      for (let i = 0, n = tickAcc(A, 'bubble', (lo ? 1.5 : 3) * pud.length, dt); i < n; i++) {
        const p = pud[(Math.random() * pud.length) | 0], a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * p.r * 0.8;
        P.spawn(RING, p.x + Math.cos(a) * rr, 0.12, p.z + Math.sin(a) * rr, 0, 0.3, 0, 0.3, 0.05, 0.35, 0xf6c46a, 0.9, 0.2);
      }
      if (list.length) {
        for (let i = 0, n = tickAcc(A, 'speck', lo ? 5 : 10, dt); i < n; i++) {
          let j = (Math.random() * list.length) | 0;
          for (let k = 0; k < 12; k++, j = (j + 1) % list.length) {
            const e = list[j];
            if (e.state === 0 && (e.stickyT > 0 || e.pud > 0)) {
              P.spawn(BLOB, e.x + rnd(-0.25, 0.25), 0.5, e.z, rnd(-0.3, 0.3), 0.5, 0, 0.45, 0.1, 0.04, 0xd98a2b, 1, 0, 6, 0.5, 0.03);
              break;
            }
          }
        }
      }
    }
    // ---- trails ----
    if (id === 'gearworks' && mk >= 5) {
      for (let i = 0, n = tickAcc(A, 'gear', lo ? 15 : 30, dt); i < n; i++) {
        const b = sampleStyle(active, beh.style);
        if (!b) break;
        P.spawn(STREAK, b.x, b.y, b.z, -b.vx * 0.1 + rnd(-1, 1), rnd(0.5, 2), -b.vz * 0.1, 0.22, 0.05, 0.02, i & 1 ? 0xffd34d : 0xff8a3c, 1, 0.9, 8, 0, 0.04);
      }
    } else if (id === 'sugarrush' && mk >= 5) {
      const cs = w.def.look.candy;
      for (let i = 0, n = tickAcc(A, 'sugar', lo ? 15 : 30, dt); i < n; i++) {
        const b = sampleStyle(active, beh.style);
        if (!b) break;
        P.spawn(STAR, b.x, b.y, b.z, rnd(-0.4, 0.4), rnd(-0.3, 0.4), rnd(-0.4, 0.4), 0.35, 0.18, 0.04, hexInt(cs[i & 3]), 1, 0.7);
      }
    } else if (id === 'voidsiphon') {
      for (let i = 0, n = tickAcc(A, 'motes', lo ? 10 : 20, dt); i < n; i++) {
        const b = sampleStyle(active, beh.style);
        if (!b) break;
        P.spawn(SOFT, b.x + rnd(-0.15, 0.15), b.y + rnd(-0.1, 0.15), b.z + 0.25, 0, rnd(0, 0.3), 0, 0.35, 0.18, 0.04, i & 1 ? 0xff4bd8 : 0x8a4dff, 0.8, 0.8);
      }
    }
  }

  return {
    fx, stats: st.stats, state: st,
    update(dt) {
      drain(dt);
      if (g.run && g.weapons) emitters(dt);
    },
  };
}

/** A random live bullet of a style (bounded scan from a random start, no allocation). */
function sampleStyle(active, style) {
  const n = active.length;
  if (!n) return null;
  let i = (Math.random() * n) | 0;
  for (let k = 0; k < 14; k++, i = (i + 1) % n) if (active[i].style === style) return active[i];
  return null;
}

/** Emitter accumulator: whole particles due this frame at `rate`/s (capped so a hitch never floods). */
function tickAcc(A, key, rate, dt) {
  A[key] = Math.min(Math.max(1.5, rate * 0.25), A[key] + rate * dt);
  const n = A[key] | 0;
  A[key] -= n;
  return n;
}

/** crate:take: a burst in the crate weapon's colours (the new weapon is the identity flash). */
function crateBurst(fx, st, p) {
  const def = weaponDef(p.weapon), L = def.look.mk[0], c = hexInt(L.color), P = fx.P, vz = -fx.game.squad.speed;
  P.spawn(SOFT, p.pos.x, 1.1, p.pos.z, 0, 0, vz, 0.3, 1.2, 3.6, c, 0.9, 0.9);
  P.spawn(RING, p.pos.x, 1.1, p.pos.z, 0, 0, vz, 0.4, 0.6, 3.4, 0xffffff, 0.9, 0.6);
  const k = P.spawn(FLAT_RING, p.pos.x, 0.08, p.pos.z, 0, 0, vz, 0.5, 0.6, 3.6, c, 0.95, 0.4);
  if (k >= 0) P.d.fade[k] = 0.3;
  fx.B.sparkle(p.pos.x, 1.2, p.pos.z, c, 16, 1.8, vz, 1.3);
  for (let i = 0, n = fx.B.n(6); i < n; i++) fx.D.spawn(p.pos.x, 1, p.pos.z, rnd(-3, 3), rnd(3, 6), rnd(-2, 2) + vz * 0.5, 0.7, 0.14, i & 1 ? 0x1b3a8a : 0xbfeaff, 0.8);
  const s = st.stats;
  s.recipes.crate = (s.recipes.crate || 0) + 1;
}
