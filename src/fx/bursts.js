// Effect recipes built from billboard particles (P) + 3D debris (D). Every function is allocation-free:
// colors are 0xRRGGBB ints, positions plain numbers. q = quality scale (1 high, 0.5 low).
import { SOFT, BLOB, RING, STREAK, STAR, FLAT_RING, FLAT_DISC, SHARD, PUFF } from './particles.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a, b) => (Math.random() < 0.5 ? a : b);

const _hex = new Map();
/** '#rrggbb' -> int (cached). */
export function hexInt(s) {
  if (typeof s === 'number') return s;
  let v = _hex.get(s);
  if (v === undefined) { v = parseInt(String(s).replace('#', ''), 16) || 0xffffff; _hex.set(s, v); }
  return v;
}
/** Mix toward white (k > 0) or black (k < 0). */
export function shade(c, k) {
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}

export class Bursts {
  constructor(P, D) { this.P = P; this.D = D; this.q = 1; }

  n(k) { return Math.max(1, Math.round(k * this.q)); }

  // ---------------- horde ----------------
  /** Squishy goo pop: splat on the road, puff, flying droplets, bright pop star. */
  enemyDeath(type, x, y, z, color) {
    const P = this.P;
    const big = type === 'tank' ? 1.6 : (type === 'runner' ? 0.85 : 1);
    const light = shade(color, 0.5), dark = shade(color, -0.35);
    const sp = P.spawn(FLAT_DISC, x, 0.045, z, 0, 0, 0, 1.1, 0.55 * big, 1.25 * big, dark, 0.72);
    if (sp >= 0) P.d.fade[sp] = 0.35;
    P.spawn(STAR, x, y + 0.1, z, 0, 0, 0, 0.14, 0.4 * big, 1.25 * big, 0xffffff, 1, 0.75);
    P.spawn(RING, x, y + 0.1, z, 0, 0, 0, 0.2, 0.3 * big, 1.6 * big, light, 0.9, 0.3);
    for (let i = 0, n = this.n(2); i < n; i++) {
      const k = P.spawn(PUFF, x + rnd(-0.2, 0.2), y + rnd(0, 0.25), z + rnd(-0.2, 0.2), rnd(-0.8, 0.8), rnd(0.6, 1.4), rnd(-0.8, 0.8),
        rnd(0.24, 0.3), 0.25 * big, 0.75 * big, shade(color, 0.62), 0.85, 0.1, 0, 5, 0, 0xffffff);
      if (k >= 0) P.d.fade[k] = 0.2;
    }
    for (let i = 0, n = this.n(type === 'tank' ? 9 : 6); i < n; i++) {
      const a = Math.random() * TAU, s = rnd(2.2, 4.6) * big;
      const k = P.spawn(BLOB, x, y + 0.15, z, Math.cos(a) * s, rnd(2.5, 5.5), Math.sin(a) * s, rnd(0.42, 0.62), rnd(0.17, 0.26) * big, 0.07, color, 1, 0, 15, 0.5, 0.045);
      if (k >= 0) { P.d.flo[k] = 0.06; P.d.fade[k] = 0.7; }
    }
    if (type === 'tank') {
      for (let i = 0, n = this.n(3); i < n; i++) this.D.spawn(x, y + 0.6, z, rnd(-3, 3), rnd(4, 7), rnd(-2, 3), rnd(0.8, 1.1), rnd(0.3, 0.42), pick(0x9aa6bd, 0x6c7894), 0.75);
    } else if (type === 'runner') {
      for (let i = 0, n = this.n(3); i < n; i++) P.spawn(STREAK, x, y + 0.2, z, rnd(-3, 3), rnd(1, 3), rnd(1, 5), 0.22, 0.08, 0.04, 0xffc28a, 1, 0.6, 6, 0, 0.05);
    } else if (type === 'shield') {
      for (let i = 0, n = this.n(3); i < n; i++) P.spawn(SHARD, x, y + 0.3, z - 0.3, rnd(-3, 3), rnd(2, 4), rnd(-1, 2), 0.4, 0.22, 0.1, 0x7fefff, 1, 0.3, 10);
    }
  }

  // ---------------- explosions ----------------
  /**
   * Fireball + shock ring + sparks + smoke + scorch. s = scale (1 ≈ bomber radius 2.2).
   * debrisCol = color of the flying chunks (-1 = none).
   */
  explosion(x, y, z, s, debrisCol = -1, vz = 0) {
    const P = this.P, D = this.D;
    P.spawn(SOFT, x, y + 0.3, z, 0, 0, vz, 0.24, 1.2 * s, 5 * s, 0xfff2b0, 1, 1);
    P.spawn(RING, x, y + 0.4, z, 0, 0, vz, 0.28, 0.6 * s, 4.2 * s, 0xffd36b, 0.85, 0.35);
    const fr = P.spawn(FLAT_RING, x, 0.08, z, 0, 0, vz, 0.42, 0.5 * s, 3.4 * s, 0xffffff, 0.95, 0.15);
    if (fr >= 0) P.d.fade[fr] = 0.2;
    const sc = P.spawn(FLAT_DISC, x, 0.05, z, 0, 0, 0, 1.8, 1.0 * s, 1.7 * s, 0x3b2b2f, 0.5);
    if (sc >= 0) P.d.fade[sc] = 0.4;
    P.spawn(PUFF, x, y + 0.4 * s, z, 0, 1, vz, 0.32, 0.9 * s, 2.1 * s, 0xfff6c8, 1, 0.5, 0, 0, 0, 0xffb030);
    for (let i = 0, n = this.n(8); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(1.6, 3.8) * s;
      const k = P.spawn(PUFF, x + Math.cos(a) * 0.45 * s, y + rnd(0.1, 0.7) * s, z + Math.sin(a) * 0.45 * s,
        Math.cos(a) * sp, rnd(1.2, 3.6) * s, Math.sin(a) * sp + vz, rnd(0.36, 0.55), rnd(0.7, 0.95) * s, rnd(1.4, 1.95) * s,
        pick(0xffe066, 0xffc040), 1, 0.25, -1, 4, 0, 0xe0401e);
      if (k >= 0) P.d.fade[k] = 0.35;
    }
    for (let i = 0, n = this.n(5); i < n; i++) {
      const k = P.spawn(PUFF, x + rnd(-0.7, 0.7) * s, y + rnd(0.4, 1.1) * s, z + rnd(-0.7, 0.7) * s, rnd(-0.8, 0.8), rnd(1.4, 2.6), rnd(-0.6, 0.6) + vz,
        rnd(0.9, 1.25), 0.6 * s, 1.9 * s, 0x6e6670, 0.75, 0, -0.4, 1.2, 0, 0xd4d0d6, rnd(0.14, 0.28));
      if (k >= 0) P.d.fade[k] = 0.3;
    }
    for (let i = 0, n = this.n(16); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(6, 13) * s;
      P.spawn(STREAK, x, y + 0.3, z, Math.cos(a) * sp, rnd(2, 8) * s, Math.sin(a) * sp + vz, rnd(0.3, 0.55), 0.13 * Math.sqrt(s), 0.05,
        pick(0xffe27a, 0xffffff), 1, 0.7, 13, 1.6, 0.05);
    }
    if (debrisCol >= 0) {
      for (let i = 0, n = this.n(6); i < n; i++) {
        const a = Math.random() * TAU, sp = rnd(2.5, 6) * s;
        D.spawn(x, y + 0.4, z, Math.cos(a) * sp, rnd(4, 9) * s, Math.sin(a) * sp + vz, rnd(0.9, 1.3), rnd(0.18, 0.34) * Math.sqrt(s), debrisCol);
      }
    }
  }

  /** Fizzbomb blast (radius from the payload). */
  bomber(x, y, z, r) {
    const s = r / 2.2;
    this.explosion(x, y, z, s, 0x4a1a26);
    const P = this.P;
    for (let i = 0, n = this.n(7); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(3, 6);
      const k = P.spawn(BLOB, x, y + 0.3, z, Math.cos(a) * sp, rnd(3, 6.5), Math.sin(a) * sp, rnd(0.5, 0.7), rnd(0.2, 0.3), 0.08, 0xff3b4e, 1, 0, 15, 0.5, 0.045);
      if (k >= 0) P.d.flo[k] = 0.06;
    }
  }

  /** Barrel smash: smaller fireball, red/white metal shards and hoops. */
  barrel(x, y, z) {
    this.explosion(x, y * 0.6, z, 0.78, -1);
    const D = this.D;
    for (let i = 0, n = this.n(12); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(2.5, 6.5);
      const c = i % 4 === 0 ? 0xf4f4f4 : (i % 5 === 1 ? 0x9aa3ad : 0xe2283b);
      D.spawn(x + Math.cos(a) * 0.3, y + rnd(0, 0.6), z + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(4, 9), Math.sin(a) * sp, rnd(1.0, 1.4), rnd(0.2, 0.36), c, 0.8);
    }
  }

  // ---------------- squad ----------------
  /** Member lost: red puff + blue/white suit bits + pop star. vz = squad forward velocity (keeps pace). */
  memberLost(x, y, z, vz) {
    const P = this.P;
    P.spawn(STAR, x, y + 0.2, z, 0, 0, vz, 0.13, 0.35, 1.1, 0xffffff, 1, 0.7);
    P.spawn(RING, x, y + 0.2, z, 0, 0, vz, 0.2, 0.25, 1.2, 0xff3b4e, 0.9, 0.2);
    for (let i = 0, n = this.n(2); i < n; i++) {
      const k = P.spawn(PUFF, x + rnd(-0.15, 0.15), y + rnd(0, 0.3), z + rnd(-0.15, 0.15), rnd(-0.6, 0.6), rnd(0.8, 1.6), rnd(-0.6, 0.6) + vz,
        rnd(0.22, 0.28), 0.25, 0.7, 0xff5a6a, 0.9, 0.15, 0, 5, 0, 0xffc0c6);
      if (k >= 0) P.d.fade[k] = 0.15;
    }
    for (let i = 0, n = this.n(4); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(1.5, 3);
      P.spawn(BLOB, x, y + 0.3, z, Math.cos(a) * sp, rnd(3, 5), Math.sin(a) * sp + vz, rnd(0.38, 0.5), rnd(0.12, 0.17), 0.05, i & 1 ? 0x2f8cff : 0xffffff, 1, 0, 14, 0.5, 0.035);
    }
  }

  /** Runner dust kicked up at a foot (world-fixed: the running squad leaves it behind). */
  dust(x, z, vz) {
    const k = this.P.spawn(PUFF, x + rnd(-0.12, 0.12), 0.14, z + 0.2, rnd(-0.4, 0.4), rnd(0.35, 0.8), vz * rnd(0.45, 0.7),
      rnd(0.5, 0.7), rnd(0.16, 0.22), rnd(0.6, 0.85), 0xbccadb, 0.5, 0, -0.3, 2.4, 0, 0xeef3f8);
    if (k >= 0) this.P.d.fade[k] = 0.2;
  }

  // ---------------- pickups / rewards ----------------
  sparkle(x, y, z, color, n, spread = 1, vz = 0, up = 1) {
    const P = this.P;
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = Math.random() * TAU, sp = rnd(0.8, 2.4) * spread;
      const k = P.spawn(STAR, x + Math.cos(a) * 0.2 * spread, y + rnd(-0.2, 0.3), z + Math.sin(a) * 0.2 * spread,
        Math.cos(a) * sp, rnd(1.5, 4) * up, Math.sin(a) * sp + vz, rnd(0.45, 0.8), rnd(0.32, 0.48), 0.08, i % 4 === 0 ? 0xffd84a : color, 1, 0.12, 2.5, 2.2);
      if (k >= 0) P.d.spin[k] = rnd(-5, 5);
    }
  }

  coin(x, y, z, vz) {
    this.P.spawn(SOFT, x, y, z, 0, 0, vz, 0.22, 0.4, 1.5, 0xffd84a, 0.9, 0.85);
    this.sparkle(x, y, z, 0xffd84a, 5, 0.7, vz);
  }

  // ---------------- gates ----------------
  /** Pass ripple: vertical ring through the gate + ground ring at the squad + rising sparkles. */
  gatePass(gx, gz, lx, lz, good, vz) {
    const P = this.P;
    const c = good ? 0x59c1ff : 0xff3b4e, c2 = good ? 0xbff0ff : 0xff9aa4;
    P.spawn(RING, gx, 1.2, gz, 0, 0, 0, 0.5, 1.2, 6.5, c, 0.95, 0.35);
    P.spawn(RING, gx, 1.2, gz, 0, 0, 0, 0.36, 0.6, 4.2, 0xffffff, 0.8, 0.5, 0, 0, 0, -1, 0.06);
    const fr = P.spawn(FLAT_RING, lx, 0.08, lz + 0.8, 0, 0, vz, 0.55, 0.6, 5.2, c, 0.95, 0.25);
    if (fr >= 0) P.d.fade[fr] = 0.25;
    P.spawn(SOFT, lx, 1, lz + 0.6, 0, 0, vz, 0.3, 1.5, 4, c2, 0.7, 1);
    this.sparkle(lx, 0.8, lz + 0.8, good ? 0x2f8cff : 0xff3b4e, good ? 18 : 10, 1.6, vz, 1.2);
  }

  /** Bullet tapping a gate panel: tiny ripple + glint. */
  gateShimmer(x, y, z) {
    const P = this.P;
    P.spawn(RING, x, y, z + 0.02, 0, 0, 0, 0.22, 0.12, 0.85, 0xd8f4ff, 0.9, 0.6);
    P.spawn(STAR, x, y, z + 0.05, 0, 0, 0, 0.1, 0.2, 0.55, 0xffffff, 1, 0.8);
  }

  // ---------------- boss ----------------
  /** Slam impact: dust shock ring, crater stain, rolling dust puffs, rock chips. */
  slam(x, z, r) {
    const P = this.P, D = this.D;
    const fr = P.spawn(FLAT_RING, x, 0.09, z, 0, 0, 0, 0.5, 0.6, r * 2.1, 0xf3e6c8, 1, 0.1);
    if (fr >= 0) P.d.fade[fr] = 0.3;
    P.spawn(FLAT_RING, x, 0.08, z, 0, 0, 0, 0.7, 0.4, r * 1.4, 0xb59a6e, 0.8, 0, 0, 0, 0, -1, 0.07);
    const cr = P.spawn(FLAT_DISC, x, 0.05, z, 0, 0, 0, 1.6, r * 0.75, r * 1.05, 0x7d6e58, 0.6);
    if (cr >= 0) P.d.fade[cr] = 0.45;
    for (let i = 0, n = this.n(14); i < n; i++) {
      const a = (i / 14) * TAU + rnd(-0.2, 0.2), sp = rnd(2.6, 4.8);
      P.spawn(PUFF, x + Math.cos(a) * r * 0.55, 0.3, z + Math.sin(a) * r * 0.55, Math.cos(a) * sp, rnd(0.4, 1.4), Math.sin(a) * sp,
        rnd(0.6, 0.9), rnd(0.4, 0.55), rnd(1.0, 1.45), 0xe3d5b8, 0.95, 0, -0.5, 2.6, 0, 0xf7f1e4);
    }
    for (let i = 0, n = this.n(9); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(1.5, 4.5);
      D.spawn(x + Math.cos(a) * 0.5, 0.4, z + Math.sin(a) * 0.5, Math.cos(a) * sp, rnd(5, 9), Math.sin(a) * sp, rnd(1, 1.4), rnd(0.22, 0.4), pick(0x8d8576, 0x6f8f4a));
    }
  }

  /** Generic boss attack impact for attacks without a bespoke recipe (orbs, summons, charges, lightning). */
  impact(x, z, color) {
    const P = this.P;
    P.spawn(SOFT, x, 0.6, z, 0, 0, 0, 0.25, 1, 4, color, 0.9, 0.9);
    const fr = P.spawn(FLAT_RING, x, 0.09, z, 0, 0, 0, 0.45, 0.5, 4, color, 0.95, 0.3);
    if (fr >= 0) P.d.fade[fr] = 0.3;
    for (let i = 0, n = this.n(12); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(4, 9);
      P.spawn(STREAK, x, 0.4, z, Math.cos(a) * sp, rnd(2, 6), Math.sin(a) * sp, rnd(0.25, 0.45), 0.12, 0.04, i & 1 ? color : 0xffffff, 1, 0.7, 10, 1.5, 0.05);
    }
  }

  /** Bullet striking the boss: hot sparks, a dust puff, sometimes a stone chip. */
  bossHit(x, y, z, color) {
    const P = this.P;
    P.spawn(STAR, x, y, z + 0.2, 0, 0, 0, 0.1, 0.35, 0.95, 0xffffff, 1, 0.8);
    for (let i = 0, n = this.n(4); i < n; i++) {
      P.spawn(STREAK, x, y, z + 0.2, rnd(-4, 4), rnd(0, 5), rnd(2, 7), rnd(0.2, 0.32), 0.1, 0.04, i & 1 ? color : 0xffe7a8, 1, 0.75, 12, 1, 0.045);
    }
    if (Math.random() < 0.5) P.spawn(PUFF, x, y, z + 0.3, rnd(-0.6, 0.6), rnd(0.2, 0.8), rnd(0.5, 1.5), 0.45, 0.22, 0.65, 0xd9cfbf, 0.85, 0, 0, 2.5);
    if (Math.random() < 0.3) this.D.spawn(x, y, z + 0.3, rnd(-2.5, 2.5), rnd(2, 5), rnd(2, 4), 0.9, rnd(0.1, 0.17), pick(0x8d8576, 0x6f8f4a));
  }

  /** Boss landing / big rumble: wide dust ring + puffs all around (x,z = feet). */
  landing(x, z, w) {
    const P = this.P;
    const fr = P.spawn(FLAT_RING, x, 0.1, z, 0, 0, 0, 0.7, 1.5, w * 2.6, 0xf3e6c8, 1, 0.1);
    if (fr >= 0) P.d.fade[fr] = 0.3;
    for (let i = 0, n = this.n(20); i < n; i++) {
      const a = (i / 20) * TAU, sp = rnd(3, 6);
      P.spawn(PUFF, x + Math.cos(a) * w * 0.7, 0.4, z + Math.sin(a) * w * 0.5, Math.cos(a) * sp, rnd(0.5, 1.8), Math.sin(a) * sp * 0.7,
        rnd(0.7, 1.1), rnd(0.6, 0.8), rnd(1.4, 2.0), 0xe3d5b8, 0.95, 0, -0.4, 2.2, 0, 0xf7f1e4);
    }
  }

  /** Muzzle flash: tier-colored star + glow. vz keeps it on the running gun. */
  muzzle(x, y, z, color, big, vz) {
    const P = this.P;
    const s = big ? 1.5 : 1;
    const k = P.spawn(STAR, x, y, z, 0, 0, vz, 0.1, 0.5 * s, 0.75 * s, color, 1, 0.25);
    if (k >= 0) P.d.fade[k] = 0.35;
    P.spawn(SOFT, x, y, z, 0, 0, vz, 0.08, 0.55 * s, 0.85 * s, color, 0.8, 0.9);
  }

  /** Bullet impact sparks (enemy / barrel / shield). */
  sparks(x, y, z, color, n, add = 0.7) {
    const P = this.P;
    P.spawn(STAR, x, y, z + 0.1, 0, 0, 0, 0.08, 0.25, 0.7, 0xffffff, 1, 0.85);
    for (let i = 0, m = this.n(n); i < m; i++) {
      P.spawn(STREAK, x, y, z + 0.1, rnd(-3.5, 3.5), rnd(0.5, 4.5), rnd(1.5, 6), rnd(0.16, 0.26), 0.085, 0.035, i & 1 ? color : 0xffffff, 1, add, 11, 0.8, 0.04);
    }
  }

  /** Shield block: cyan hex-ish ring + sparks. */
  shieldHit(x, y, z) {
    this.P.spawn(RING, x, y, z, 0, 0, 0, 0.16, 0.2, 1.0, 0x7fefff, 0.95, 0.5);
    this.sparks(x, y, z, 0x7fefff, 3, 0.8);
  }

  /** Speed line near the camera sides (radiates in perspective). */
  speedLine(x, y, z, v) {
    this.P.spawn(STREAK, x, y, z, 0, 0, v, 0.32, 0.045, 0.03, 0xffffff, 0.5, 0.35, 0, 0, 0.07);
  }
}
