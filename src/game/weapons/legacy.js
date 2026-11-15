// FOUNDATION stub behaviour: fires the shipped pistol -> plasma ladder (LEGACY_TIERS[mk-1] verbatim: rate,
// speed, pierce, pellets, spread) at LEGACY_DAMAGE x damage, element neutral, in the weapon's own colours.
// With Pip's +10% rate and the +15% favourite bonus that is ~1.01x the shipped game, beam pierce included.
// Only the seven stub files import this; no final behaviour may (SPEC2 §7.1).
import { WeaponBehaviour } from './base.js';
import { BULLETS } from '../../config.js';
import { LEGACY_TIERS, LEGACY_DAMAGE } from '../../data/weapons.js';

const ROWS = LEGACY_TIERS.map((t, i) => ({ mk: i + 1, rate: t.rate, dmg: t.damage * LEGACY_DAMAGE, speed: t.speed, pierce: t.pierce,
  pellets: t.pellets, spread: t.spread, range: BULLETS.range }));

export class LegacyWeapon extends WeaponBehaviour {
  constructor(sys, def) {
    super(sys, def);
    this.el = 'neutral';
    this.shieldHits = 1;
  }

  row(mk = this.mk) { return ROWS[Math.max(1, Math.min(5, mk | 0)) - 1]; }
  sheetDps(mk = this.mk) { const r = this.row(mk); return r.rate * r.pellets * r.dmg; }
  // the shipped bot's estimate: fire * (1 + pierce / 2), no exposure / matchups
  crowdFactor() { return 1 + this.row().pierce * 0.5; }
  bossFactor() { return 1; }
  reach() { return 60; }
}
