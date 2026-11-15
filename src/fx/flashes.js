// Muzzle flashes (weapon + Mk colour, at the front shooters, throttled) and bullet impact flashes:
// enemy/barrel sparks, shield blocks, gate shimmer ripples, boss hit sparks.
// Weapon-keyed since update 2 (FOUNDATION made it so; the WEAPONS builder owns it from here): colours come from
// the weapon's own look (data/weapons.js look.mk), never from gun paint.
import { hexInt, shade } from './bursts.js';
import { weaponDef } from '../data/weapons.js';

const MUZZLE_INTERVAL = 1 / 18; // s of game time between flash volleys
const _m = { x: 0, y: 0, z: 0 };

export class Flashes {
  constructor(game, bursts) {
    this.game = game;
    this.B = bursts;
    this.last = -1;
    this.tierColor = 0xffd34d;
    this.sparkColor = 0xffe9a0;
    this.tier = 0;
  }

  colors(mk, weapon = this.game.weapons.id) {
    const key = weapon + mk;
    if (key === this.tier) return;
    this.tier = key;
    const def = weaponDef(weapon);
    const c = hexInt(def.look.mk[Math.max(1, Math.min(5, mk | 0)) - 1].color);
    this.tierColor = c;
    this.sparkColor = shade(c, 0.35);
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
        // best of 3 random shooters by z (front = most negative z)
        for (let s = 0; s < 3; s++) {
          const i = (Math.random() * n) | 0;
          sq.muzzle(i, _m);
          if (_m.z < bz) { bz = _m.z; best = i; }
        }
      }
      sq.muzzle(best, _m);
      this.B.muzzle(_m.x, _m.y + 0.12, _m.z - 0.5, this.tierColor, best === 0, vz);
    }
  }

  /** bullet:hit (already ≤30/s on the bus). */
  hit(p) {
    const x = p.pos.x, y = p.pos.y, z = p.pos.z;
    switch (p.kind) {
      case 'enemy': this.colors(this.game.weapons.mk); this.B.sparks(x, y, z, this.sparkColor, 3); break;
      case 'barrel': this.B.sparks(x, y, z, 0xffcc55, 3, 0.6); break;
      case 'shield': this.B.shieldHit(x, y, z); break;
      case 'gate': this.B.gateShimmer(x, y, z); break;
      case 'boss': this.colors(this.game.weapons.mk); this.B.bossHit(x, y, z, this.sparkColor); break;
      default: this.B.sparks(x, y, z, 0xffffff, 2);
    }
  }
}
