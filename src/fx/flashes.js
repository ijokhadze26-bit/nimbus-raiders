// Muzzle flashes and bullet impact flashes, per weapon (WEAPONS builder; SPEC2 §2 "Muzzle" / "Hit" lines).
// Colours always come from the weapon's own look (data/weapons.js look.mk), never from gun paint; sizes grow
// with MK_SCALE. Muzzles are throttled (18 volleys/s of game time, 1-3 front shooters); hits arrive at <= 30/s
// on the bus. Every recipe goes through Bursts.n() so Low halves it but still spawns >= 1 particle.
//   emberstorm  orange cone flash + blue pilot dot + heat shimmer   | hit: ember sparks
//   glacier     eight-point frost star                               | hit: ice chips + snow puff
//   sugarrush   candy sprinkle confetti puff                         | (bombs splash: fx/weapons)
//   spectra     white lens flare (+ halo ring at Mk V)               | hit: prism sparkle burst
//   gearworks   hot orange sparks                                    | hit: metal sparks + "ting" ring
//   thunderclap blue-white star + 2 spark streaks                    | hit: white flash + ring
//   voidsiphon  inward violet swell                                  | hit: violet puff
import { hexInt, shade } from './bursts.js';
import { SOFT, RING, STREAK, STAR, PUFF, BLOB } from './particles.js';
import { weaponDef, MK_SCALE } from '../data/weapons.js';

const MUZZLE_INTERVAL = 1 / 18; // s of game time between flash volleys
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const _m = { x: 0, y: 0, z: 0 };
const SPECTRAL = [0xff5a7a, 0xffb34d, 0xfff08a, 0x7dff6a, 0x4dc3ff, 0xa26bff];

export class Flashes {
  constructor(game, bursts) {
    this.game = game;
    this.B = bursts;
    this.P = bursts.P;
    this.D = bursts.D;
    this.last = -1;
    this.key = '';
    this.c = 0xffd34d; this.core = 0xffffff; this.trail = 0xffffff; this.spark = 0xffe9a0;
    this.mk = 1; this.weapon = '';
    this.tierColor = 0xffd34d; this.sparkColor = 0xffe9a0; // old names (kept for any outside reader)
  }

  colors(mk, weapon = this.game.weapons.id) {
    const key = weapon + mk;
    if (key === this.key) return;
    this.key = key;
    const L = weaponDef(weapon).look.mk[Math.max(1, Math.min(5, mk | 0)) - 1];
    this.c = hexInt(L.color); this.core = hexInt(L.core); this.trail = hexInt(L.trail || L.color);
    this.spark = shade(this.c, 0.35);
    this.tierColor = this.c; this.sparkColor = this.spark;
    this.mk = Math.max(1, Math.min(5, mk | 0)); this.weapon = weapon;
  }

  reset() { this.last = -1; }

  /** weapon:fire -> 1..3 flashes at front-most shooters (sampled, no sort). */
  fire(p, now) {
    if (now - this.last < MUZZLE_INTERVAL && now >= this.last) return;
    this.last = now;
    const g = this.game, sq = g.squad;
    this.colors(p.mk || p.tier, p.weapon);
    const vz = -sq.speed;
    const n = sq.rendered;
    const flashes = g.engine.quality === 'low' ? 1 : Math.min(3, 1 + (n > 6 ? 1 : 0) + (n > 30 ? 1 : 0));
    for (let f = 0; f < flashes; f++) {
      let best = 0, bz = 1e9;
      if (f > 0 || Math.random() < 0.5) {
        for (let s = 0; s < 3; s++) {
          const i = (Math.random() * n) | 0;
          sq.muzzle(i, _m);
          if (_m.z < bz) { bz = _m.z; best = i; }
        }
      }
      sq.muzzle(best, _m);
      this.muzzle(p.weapon, _m.x, _m.y + 0.12, _m.z - 0.5, best === 0, vz);
    }
  }

  muzzle(w, x, y, z, big, vz) {
    const P = this.P, s = (big ? 1.5 : 1) * MK_SCALE[this.mk - 1], c = this.c, core = this.core;
    switch (w) {
      case 'emberstorm': {
        const k = P.spawn(PUFF, x, y, z - 0.25 * s, 0, 0.4, vz - 6, 0.14, 0.35 * s, 0.75 * s, core, 1, 0.75, 0, 0, 0.04, c);
        if (k >= 0) P.d.fade[k] = 0.3;
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.08, 0.5 * s, 0.8 * s, c, 0.85, 0.9);
        P.spawn(SOFT, x, y - 0.06, z + 0.12, 0, 0, vz, 0.12, 0.14 * s, 0.18 * s, hexInt(weaponDef(w).look.pilot || '#4d9bff'), 1, 1);
        if (big) { const h = P.spawn(PUFF, x, y + 0.1, z, rnd(-0.3, 0.3), 1.2, vz * 0.7, 0.4, 0.3, 0.8, 0xfff1dc, 0.18, 0.2); if (h >= 0) P.d.fade[h] = 0.2; }
        break;
      }
      case 'glacier': {
        const k = P.spawn(STAR, x, y, z, 0, 0, vz, 0.1, 0.45 * s, 0.75 * s, core, 1, 0.5);
        const k2 = P.spawn(STAR, x, y, z, 0, 0, vz, 0.1, 0.35 * s, 0.6 * s, c, 1, 0.6);
        if (k >= 0 && k2 >= 0) P.d.rot[k2] = P.d.rot[k] + Math.PI / 4;
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.08, 0.4 * s, 0.7 * s, c, 0.6, 0.9);
        break;
      }
      case 'sugarrush': {
        const cs = weaponDef(w).look.candy;
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.1, 0.4 * s, 0.75 * s, c, 0.6, 0.6);
        for (let i = 0, n = this.B.n(4); i < n; i++) {
          P.spawn(STREAK, x, y, z, rnd(-2, 2), rnd(0.5, 2.5), vz + rnd(-3, -1), 0.3, 0.07, 0.05, hexInt(cs[i % 4]), 1, 0.1, 6, 1, 0.05);
        }
        break;
      }
      case 'spectra': {
        P.spawn(STAR, x, y, z, 0, 0, vz, 0.09, 0.6 * s, 0.95 * s, 0xffffff, 1, 0.8);
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.07, 0.45 * s, 0.7 * s, 0xffffff, 0.7, 1);
        if (this.mk >= 5) P.spawn(RING, x, y, z, 0, 0, vz, 0.16, 0.35, 0.8, SPECTRAL[(Math.random() * 6) | 0], 0.9, 0.7);
        break;
      }
      case 'gearworks': {
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.07, 0.35 * s, 0.6 * s, 0xffb36b, 0.8, 0.9);
        for (let i = 0, n = this.B.n(3); i < n; i++) {
          P.spawn(STREAK, x, y, z, rnd(-2.5, 2.5), rnd(0.5, 3), vz - rnd(2, 5), rnd(0.15, 0.25), 0.06, 0.03, i & 1 ? 0xffd34d : 0xff8a3c, 1, 0.8, 9, 0.5, 0.04);
        }
        break;
      }
      case 'thunderclap': {
        P.spawn(STAR, x, y, z, 0, 0, vz, 0.08, 0.5 * s, 0.85 * s, 0xeef4ff, 1, 0.8);
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.07, 0.45 * s, 0.75 * s, hexInt(weaponDef(w).look.mk[this.mk - 1].trail), 0.8, 1);
        for (let i = 0, n = this.B.n(2); i < n; i++) {
          P.spawn(STREAK, x, y, z, rnd(-3, 3), rnd(-1, 2), vz - rnd(3, 6), 0.1, 0.05, 0.02, i & 1 ? c : 0xffffff, 1, 0.9, 0, 0, 0.03);
        }
        break;
      }
      case 'voidsiphon': {
        P.spawn(RING, x, y, z, 0, 0, vz, 0.18, 0.8 * s, 0.15 * s, core, 0.9, 0.7);
        P.spawn(SOFT, x, y, z, 0, 0, vz, 0.16, 0.5 * s, 0.25 * s, 0x5f22ae, 0.85, 0.3);
        break;
      }
      default: this.B.muzzle(x, y, z, c, big, vz);
    }
  }

  /** bullet:hit (already <= 30/s on the bus). */
  hit(p) {
    const x = p.pos.x, y = p.pos.y, z = p.pos.z;
    switch (p.kind) {
      case 'enemy': this.weaponHit(p.weapon, x, y, z, false); break;
      case 'barrel': this.B.sparks(x, y, z, 0xffcc55, 3, 0.6); break;
      case 'shield': this.B.shieldHit(x, y, z); break;
      case 'gate': this.B.gateShimmer(x, y, z); break;
      case 'boss': this.weaponHit(p.weapon, x, y, z, true); break;
      default: this.B.sparks(x, y, z, 0xffffff, 2);
    }
  }

  weaponHit(w, x, y, z, boss) {
    const g = this.game, P = this.P;
    if (!w || w === 'helper') { this.colors(g.weapons.mk); return boss ? this.B.bossHit(x, y, z, 0xffe7a8) : this.B.sparks(x, y, z, 0xffffff, 2); }
    this.colors(g.weapons.mk, w);
    const s = MK_SCALE[this.mk - 1] * (boss ? 1.4 : 1), c = this.c;
    switch (w) {
      case 'emberstorm':
        for (let i = 0, n = this.B.n(3); i < n; i++) P.spawn(STREAK, x, y, z + 0.1, rnd(-2, 2), rnd(1.5, 4), rnd(0.5, 3), rnd(0.25, 0.4), 0.07 * s, 0.03, i & 1 ? 0xffe08a : c, 1, 0.8, -1.5, 1.5, 0.05);
        if (boss) P.spawn(PUFF, x, y, z + 0.2, 0, 1, 1, 0.35, 0.3 * s, 0.8 * s, c, 0.8, 0.5, 0, 0, 0, 0x5a3a30);
        break;
      case 'glacier':
        for (let i = 0, n = this.B.n(boss ? 3 : 2); i < n; i++) this.D.spawn(x, y, z + 0.2, rnd(-2.5, 2.5), rnd(2, 4.5), rnd(0.5, 3), rnd(0.5, 0.75), rnd(0.08, 0.13) * s, i & 1 ? 0xffffff : 0xbfeaff, 0.6);
        { const k = P.spawn(PUFF, x, y, z + 0.15, 0, 0.6, 0.8, 0.4, 0.25 * s, 0.7 * s, 0xf4fbff, 0.8, 0.2); if (k >= 0) P.d.fade[k] = 0.25; }
        P.spawn(STAR, x, y, z + 0.1, 0, 0, 0, 0.1, 0.25 * s, 0.6 * s, 0xffffff, 1, 0.8);
        break;
      case 'spectra':
        for (let i = 0, n = this.B.n(6); i < n; i++) {
          const a = Math.random() * TAU, sp = rnd(1.5, 3.5);
          P.spawn(STAR, x, y, z + 0.1, Math.cos(a) * sp, Math.sin(a) * sp + 1, rnd(0, 2), rnd(0.25, 0.4), 0.22 * s, 0.05, SPECTRAL[i % 6], 1, 0.6, 2, 2);
        }
        break;
      case 'gearworks':
        P.spawn(RING, x, y, z + 0.1, 0, 0, 0, 0.18, 0.15, 0.9 * s, 0xe8eef7, 0.9, 0.6);
        for (let i = 0, n = this.B.n(4); i < n; i++) P.spawn(STREAK, x, y, z + 0.1, rnd(-4, 4), rnd(1, 5), rnd(1, 5), rnd(0.18, 0.3), 0.07, 0.03, i & 1 ? 0xffd34d : 0xffffff, 1, 0.8, 12, 0.6, 0.045);
        break;
      case 'thunderclap':
        P.spawn(SOFT, x, y, z + 0.1, 0, 0, 0, 0.08, 0.5 * s, 1.0 * s, 0xffffff, 0.95, 1);
        P.spawn(RING, x, y, z + 0.1, 0, 0, 0, 0.16, 0.2, 1.0 * s, c, 0.9, 0.8);
        break;
      case 'voidsiphon':
        { const k = P.spawn(PUFF, x, y, z, 0, 0.3, 0, 0.35, 0.5 * s, 0.2 * s, 0x5f22ae, 0.9, 0.2, 0, 0, 0, 0xff4bd8); if (k >= 0) P.d.fade[k] = 0.3; }
        break;
      case 'sugarrush':
        P.spawn(BLOB, x, y, z, rnd(-1, 1), 2, 0, 0.4, 0.15, 0.05, c, 1, 0, 12, 0.5, 0.04);
        break;
      default:
        this.B.sparks(x, y, z, this.spark, 3);
    }
    if (boss && w !== 'emberstorm') this.B.bossHit(x, y, z, this.spark);
  }
}

