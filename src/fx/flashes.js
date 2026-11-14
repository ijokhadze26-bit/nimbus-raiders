// Muzzle flashes (tier color, at the front shooters, throttled) and bullet impact flashes:
// enemy/barrel sparks, shield blocks, gate shimmer ripples, boss hit sparks.
import { hexInt, shade } from './bursts.js';
import { weaponForTier } from '../data/weapons.js';

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

  colors(tier) {
    const g = this.game;
    const key = tier + (g.skins ? g.skins.weapon : '');
    if (key === this.tier) return;
    this.tier = key;
    const c = hexInt(g.tierColor ? g.tierColor(tier) : weaponForTier(tier).color);
    this.tierColor = c;
    this.sparkColor = shade(c, 0.35);
  }

  reset() { this.last = -1; }

  /** weapon:fire -> 1..3 flashes at front-most shooters (sampled, no sort). */
  fire(p, now) {
    if (now - this.last < MUZZLE_INTERVAL && now >= this.last) return;
    this.last = now;
    const g = this.game, sq = g.squad;
    this.colors(p.tier);
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
      case 'enemy': this.colors(this.game.weapons.tier); this.B.sparks(x, y, z, this.sparkColor, 3); break;
      case 'barrel': this.B.sparks(x, y, z, 0xffcc55, 3, 0.6); break;
      case 'shield': this.B.shieldHit(x, y, z); break;
      case 'gate': this.B.gateShimmer(x, y, z); break;
      case 'boss': this.colors(this.game.weapons.tier); this.B.bossHit(x, y, z, this.sparkColor); break;
      default: this.B.sparks(x, y, z, 0xffffff, 2);
    }
  }
}
