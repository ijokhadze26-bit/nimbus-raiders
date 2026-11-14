// Weapon runtime: tier, fire accumulator, bullet bundling (visual budget with DPS conservation), fire events.
import { BULLETS } from '../config.js';
import { weaponForTier, MAX_TIER } from '../data/weapons.js';

const DEG = Math.PI / 180;

export class Weapons {
  init(game) {
    this.game = game;
    this.tier = 1;
    this.acc = 0;
    this.rr = 0;
    this.rateMul = 1;   // upgrades
    this.dmgMul = 1;
    this.enabled = true;
    this.muzzle = { x: 0, y: 0, z: 0 };
    this.firePos = { x: 0, y: 0, z: 0 };
    this.lastShotsPerSec = 0;
    this.showAcc = 0;   // low quality draws budgetLow/budgetHigh of the volleys (decided per volley, never random)
  }

  reset(run, tier = 1, mods = {}) {
    this.acc = 0; this.rr = 0; this.showAcc = 0;
    this.rateMul = mods.rateMul ?? 1;
    this.dmgMul = mods.dmgMul ?? 1;
    this.setTier(tier, true);
  }

  get weapon() { return weaponForTier(this.tier); }

  setTier(t, silent = false) {
    const nt = Math.max(1, Math.min(MAX_TIER, t | 0));
    const changed = nt !== this.tier;
    this.tier = nt;
    const w = this.weapon;
    this.game.squad.setGunColor(this.game.tierColor ? this.game.tierColor(nt) : w.color);
    this.game.squad.setGunTier(nt);
    if (changed && !silent) {
      const L = this.game.squad.leader;
      this.game.events.emit('weapon:tier', { tier: nt, name: w.name, pos: { x: L.x, y: 1.5, z: L.z } });
    }
    return nt;
  }

  upgrade(n = 1) { return this.setTier(this.tier + n); }

  /** Gate hits per second the squad's fire is worth (device independent: always the high-quality budget). */
  gateShotsPerSec(S = this.lastShotsPerSec, w = this.weapon) { return Math.min(S, BULLETS.budgetHigh / w.pellets) * w.pellets; }

  /**
   * Simulated bullets / s: always the high budget, so hits, overkill, shields and boss fights play out the same
   * on every quality level. Low quality only *draws* fewer of them (see `show` below and Bullets.sync).
   */
  budget() { return BULLETS.budgetHigh; }

  update(dt) {
    const game = this.game;
    if (!this.enabled) return;
    const squad = game.squad;
    const w = this.weapon;
    const powerRate = game.powers && game.powers.rateMul ? game.powers.rateMul : 1;
    const rate = w.rate * this.rateMul * powerRate;
    const S = squad.count * rate;                       // volleys per second (whole squad)
    const maxVolleys = this.budget() / w.pellets;
    const visual = Math.min(S, maxVolleys);
    this.lastShotsPerSec = S;
    if (visual <= 0) return;
    const unit = w.damage * this.dmgMul;
    const dmg = unit * (S / visual);                   // DPS conserved (bundled shots)
    // gate credit per visual bullet: a gate climbs as fast as it would under the high-quality budget, so a
    // phone that auto-drops to low quality (fewer, fatter bullets) earns the same troops from a gate
    const gw = this.gateShotsPerSec(S, w) / (visual * w.pellets);
    this.acc += visual * dt;
    const shooters = squad.rendered;
    const bullets = game.bullets;
    let fired = false;
    // Spread spawn times across the step to avoid visible bullet "rows".
    const total = Math.floor(this.acc);
    for (let s = 0; s < total; s++) {
      this.acc -= 1;
      const idx = this.pickShooter(shooters);
      const p = squad.muzzle(idx, this.muzzle);
      const lead = (s / Math.max(1, total)) * dt * w.speed;
      this.showAcc += BULLETS.budgetLow / BULLETS.budgetHigh;
      const show = this.showAcc >= 1;
      if (show) this.showAcc -= 1;
      for (let k = 0; k < w.pellets; k++) {
        const ang = w.pellets > 1 ? (k - (w.pellets - 1) / 2) * w.spread * DEG : 0;
        const b = bullets.spawn(this.tier, p.x, p.y, p.z + lead, Math.sin(ang) * w.speed, -Math.cos(ang) * w.speed, dmg, w.pierce, unit);
        if (b) { b.gw = gw; b.show = show; }
      }
      if (!fired) { fired = true; this.firePos.x = p.x; this.firePos.y = p.y; this.firePos.z = p.z; }
    }
    if (fired && game.events.wants('weapon:fire')) game.events.emit('weapon:fire', { tier: this.tier, pos: this.firePos });
  }

  /** Round-robin across shooters, biased toward the front of the blob (low slot indices). */
  pickShooter(n) {
    if (n <= 1) return 0;
    this.rr++;
    const front = Math.max(1, Math.ceil(n * 0.45));
    // every other shot comes from the front 45%, others cycle the whole squad
    if (this.rr & 1) return (this.rr >> 1) % front;
    return (this.rr >> 1) % n;
  }

  dispose() {}
}
