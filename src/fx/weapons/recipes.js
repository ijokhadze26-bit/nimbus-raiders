// One-shot weapon effect recipes, fed from weapons.fxq entries (e = { kind, weapon, mk, x0..z1, n }).
// Allocation-free; colours are 0xRRGGBB ints; everything goes through B.n() so Low halves the count but every
// recipe still spawns >= 1 particle. Sizes grow with MK_SCALE.
//   arc      Thunderclap chain: 3-5 jagged streak segments (Mk III forked sparks, Mk V scorch ring at the end)
//   bounce   Gearworks: a faint streak along the new path + a ting ring
//   splash   Sugar Rush: candy splat disc + star sprinkles (Mk V heart-shaped star burst)
//   puddle   Sugar Rush: caramel splat + sticky goo drops
//   freeze   Glacier: ice shard burst + cyan ring;  shatter: gate-shard style burst in ice colours
//   frost    Glacier Mk IV+: frost ring on the ground
//   ignite   Emberstorm: a little flame puff on the enemy
//   split    Spectra: prism sparkle at the split point
//   hole     Void Siphon: implosion ring + dark puff;  turret: Gearworks turret drop sparkle
import { hexInt } from '../bursts.js';
import { SOFT, BLOB, RING, STREAK, STAR, FLAT_RING, FLAT_DISC, SHARD, PUFF } from '../particles.js';
import { weaponDef, MK_SCALE } from '../../data/weapons.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const SPECTRAL = [0xff5a7a, 0xffb34d, 0xfff08a, 0x7dff6a, 0x4dc3ff, 0xa26bff];
const look = (e) => weaponDef(e.weapon).look.mk[Math.max(1, Math.min(5, e.mk | 0)) - 1];

/** Jagged lightning between two points: `segs` streak segments with random lateral kinks. */
export function arc(fx, e, segs) {
  const P = fx.P, L = look(e), c = hexInt(L.color), glow = hexInt(L.trail);
  const dx = e.x1 - e.x0, dz = e.z1 - e.z0;
  let px = e.x0, py = e.y0, pz = e.z0;
  for (let i = 1; i <= segs; i++) {
    const f = i / segs, j = i < segs ? 0.35 : 0;
    const nx = e.x0 + dx * f + rnd(-j, j), ny = e.y0 + rnd(-j, j) * 0.6, nz = e.z0 + dz * f + rnd(-j, j);
    // a STREAK spans head - v*str .. head: slow velocity + long str = a (nearly) static segment
    P.spawn(STREAK, nx, ny, nz, (nx - px) * 0.5, (ny - py) * 0.5, (nz - pz) * 0.5, 0.08, e.mk >= 5 ? 0.12 : 0.08, 0.06, i & 1 ? 0xffffff : c, 1, 0.95, 0, 0, 2);
    px = nx; py = ny; pz = nz;
  }
  P.spawn(SOFT, e.x1, e.y1, e.z1, 0, 0, 0, 0.1, 0.4, 0.8, glow, 0.8, 1);
  if (e.mk >= 3) for (let i = 0, n = fx.B.n(2); i < n; i++) P.spawn(STREAK, e.x1, e.y1, e.z1, rnd(-4, 4), rnd(1, 4), rnd(-4, 4), 0.12, 0.05, 0.02, c, 1, 0.9, 6, 0, 0.04);
  if (e.mk >= 5) { const k = P.spawn(FLAT_RING, e.x1, 0.06, e.z1, 0, 0, 0, 0.6, 0.2, 1.1, 0x3a3060, 0.7, 0); if (k >= 0) P.d.fade[k] = 0.3; }
}

export function play(fx, e) {
  const P = fx.P, B = fx.B, s = MK_SCALE[Math.max(1, Math.min(5, e.mk | 0)) - 1];
  switch (e.kind) {
    case 'bounce': {
      const L = look(e);
      P.spawn(STREAK, e.x1, e.y1, e.z1, (e.x1 - e.x0) * 0.5, 0, (e.z1 - e.z0) * 0.5, 0.14, 0.05, 0.03, hexInt(L.trail), 0.55, 0.8, 0, 0, 1.8);
      P.spawn(RING, e.x0, e.y0, e.z0, 0, 0, 0, 0.16, 0.12, 0.7 * s, 0xe8eef7, 0.9, 0.6);
      break;
    }
    case 'splash': {
      const def = weaponDef(e.weapon), cs = def.look.candy, r = e.y1 || 2, c = hexInt(cs[(Math.random() * 4) | 0]);
      const k = P.spawn(FLAT_DISC, e.x0, 0.05, e.z0, 0, 0, 0, 0.9, r * 0.5, r * 1.05, c, 0.85, 0.05);
      if (k >= 0) P.d.fade[k] = 0.45;
      P.spawn(SOFT, e.x0, 0.6, e.z0, 0, 0, 0, 0.18, r * 0.6, r * 1.4, 0xfff0fa, 0.7, 0.8);
      const fr = P.spawn(FLAT_RING, e.x0, 0.08, e.z0, 0, 0, 0, 0.32, 0.3, r * 2.1, 0xffffff, 0.9, 0.3);
      if (fr >= 0) P.d.fade[fr] = 0.2;
      if (e.mk >= 5 && e.n === 0) { // heart-shaped star burst
        for (let i = 0, n = B.n(12); i < n; i++) {
          const t = (i / n) * TAU, hx = 16 * Math.pow(Math.sin(t), 3) / 16, hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
          P.spawn(STAR, e.x0, 1.1, e.z0, hx * 3.2, hy * 3.2 + 0.6, 0, 0.55, 0.3, 0.12, i & 1 ? 0xff57c6 : 0xfff08a, 1, 0.5, 0, 2.2);
        }
      } else {
        for (let i = 0, n = B.n(6); i < n; i++) {
          const a = Math.random() * TAU, sp = rnd(2, 4.5);
          P.spawn(STAR, e.x0, 0.5, e.z0, Math.cos(a) * sp, rnd(2.5, 5), Math.sin(a) * sp, rnd(0.4, 0.6), 0.26, 0.08, hexInt(cs[i % 4]), 1, 0.3, 9, 1.2);
        }
      }
      break;
    }
    case 'puddle': {
      const r = e.y1 || 2.4, caramel = 0xd98a2b;
      for (let i = 0, n = B.n(5); i < n; i++) {
        const a = Math.random() * TAU, sp = rnd(1.5, 3);
        const k = P.spawn(BLOB, e.x0, 0.3, e.z0, Math.cos(a) * sp, rnd(2, 3.5), Math.sin(a) * sp, rnd(0.45, 0.6), rnd(0.14, 0.2), 0.06, caramel, 1, 0, 14, 0.5, 0.04);
        if (k >= 0) P.d.flo[k] = 0.05;
      }
      P.spawn(RING, e.x0, 0.2, e.z0, 0, 0, 0, 0.3, r * 0.4, r * 1.1, 0xf6c46a, 0.7, 0.2);
      break;
    }
    case 'freeze': {
      P.spawn(RING, e.x0, e.y0, e.z0, 0, 0, 0, 0.25, 0.3, 1.5 * s, 0x9fe8ff, 0.95, 0.6);
      for (let i = 0, n = B.n(6); i < n; i++) {
        const a = (i / 6) * TAU;
        P.spawn(SHARD, e.x0, e.y0 + 0.2, e.z0, Math.cos(a) * 2.5, rnd(1.5, 3), Math.sin(a) * 2.5, 0.4, 0.28 * s, 0.1, i & 1 ? 0xffffff : 0x9fe8ff, 1, 0.4, 6, 2);
      }
      break;
    }
    case 'shatter': {
      P.spawn(STAR, e.x0, e.y0, e.z0, 0, 0, 0, 0.12, 0.5, 1.4, 0xffffff, 1, 0.9);
      for (let i = 0, n = B.n(10); i < n; i++) {
        const a = Math.random() * TAU, sp = rnd(2.5, 6);
        P.spawn(SHARD, e.x0, e.y0, e.z0, Math.cos(a) * sp, rnd(2, 6), Math.sin(a) * sp, rnd(0.45, 0.7), rnd(0.25, 0.4), 0.08, i % 3 ? 0xbfeaff : 0xffffff, 1, 0.35, 14, 0.4);
      }
      for (let i = 0, n = B.n(3); i < n; i++) fx.D.spawn(e.x0, e.y0, e.z0, rnd(-3, 3), rnd(3, 6), rnd(-2, 3), rnd(0.6, 0.9), rnd(0.12, 0.2), 0xd8f6ff, 0.7);
      break;
    }
    case 'frost': {
      const k = P.spawn(FLAT_RING, e.x0, 0.06, e.z0, 0, 0, 0, 0.9, 0.3, 1.6, 0xd8f6ff, 0.75, 0.3);
      if (k >= 0) P.d.fade[k] = 0.3;
      break;
    }
    case 'ignite': {
      const k = P.spawn(PUFF, e.x0, e.y0, e.z0, 0, 1.6, 0, 0.35, 0.25 * s, 0.7 * s, 0xffe08a, 0.95, 0.6, 0, 0, 0.05, 0xff5222);
      if (k >= 0) P.d.fade[k] = 0.3;
      break;
    }
    case 'split': {
      P.spawn(STAR, e.x0, e.y0, e.z0, 0, 0, 0, 0.12, 0.5 * s, 1.1 * s, 0xffffff, 1, 0.9);
      for (let i = 0, n = B.n(Math.max(2, e.n * 2)); i < n; i++) {
        const a = -Math.PI / 2 + rnd(-0.7, 0.7), sp = rnd(2, 4);
        P.spawn(STREAK, e.x0, e.y0, e.z0, Math.cos(a) * sp * 0.5, rnd(0, 1.5), Math.sin(a) * sp, 0.18, 0.06, 0.03, SPECTRAL[i % 6], 1, 0.9, 0, 0, 0.05);
      }
      break;
    }
    case 'hole': {
      const r = e.y1 || 4;
      P.spawn(RING, e.x0, 0.6, e.z0, 0, 0, 0, 0.3, r * 1.2, 0.2, 0xff4bd8, 0.9, 0.7);
      const k = P.spawn(PUFF, e.x0, 0.5, e.z0, 0, 0.3, 0, 0.4, 0.8, 0.3, 0x2a0e4a, 0.85, 0, 0, 0, 0, 0x5f22ae);
      if (k >= 0) P.d.fade[k] = 0.4;
      if (e.n) P.spawn(STAR, e.x0, 0.8, e.z0, 0, 0, 0, 0.15, 0.4, 1.0, 0xff7ae6, 1, 0.9); // a merge flashes
      break;
    }
    case 'turret': {
      const k = P.spawn(FLAT_RING, e.x0, 0.07, e.z0, 0, 0, 0, 0.45, 0.4, 2.0, 0xd9a441, 0.9, 0.3);
      if (k >= 0) P.d.fade[k] = 0.25;
      B.sparkle(e.x0, 0.8, e.z0, 0xffc531, 8, 1, 0, 1);
      for (let i = 0, n = B.n(3); i < n; i++) fx.D.spawn(e.x0, 0.3, e.z0, rnd(-2, 2), rnd(2, 4), rnd(-2, 2), 0.6, 0.1, 0xc8d0dc, 0.6);
      break;
    }
    default: break;
  }
}

