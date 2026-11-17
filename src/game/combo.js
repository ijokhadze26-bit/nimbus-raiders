// Combo meter (update 3 stage 4, STAGE4.md A): +1 per enemy kill (run.kills delta, so the rate-limited
// enemy:die event never undercounts); any squad loss resets it. Tiers x1.0 / x1.1 (25) / x1.2 (60) / x1.3 (120)
// boost damage (via formation.refresh -> hordeK / bossK) and coins collected (a fractional bonus on every
// coin:collect, paid in whole coins). run.stats.maxCombo is recorded.
// Events: combo:tier { tier, mul, count }, combo:lost { count }.
export const COMBO_TIERS = [
  { at: 0, mul: 1 },
  { at: 25, mul: 1.1 },
  { at: 60, mul: 1.2 },
  { at: 120, mul: 1.3 },
];

export class Combo {
  init(game) {
    this.game = game;
    this.n = 0; this.tier = 0; this.mul = 1;
    this.lastKills = 0; this.coinAcc = 0; this.bonusCoins = 0;
    this.lost = 0; this.lostT = -1;
    const ev = game.events;
    ev.on('squad:change', (p) => { if (p.delta < 0 && p.reason !== 'start') this.lose(); });
    ev.on('coin:collect', (p) => this.coinBonus(p.amount || 0));
  }

  reset(run) {
    this.n = 0; this.tier = 0; this.mul = 1;
    this.lastKills = run ? run.kills : 0;
    this.coinAcc = 0; this.bonusCoins = 0; this.lost = 0; this.lostT = -1;
    if (run) run.stats.maxCombo = 0;
    if (this.game.formation) this.game.formation.refresh();
  }

  live() { const run = this.game.run; return run && run.active ? run : null; }

  /** Progress 0..1 from the current tier's threshold to the next (1 at the top tier). */
  frac() {
    const t = this.tier;
    if (t >= COMBO_TIERS.length - 1) return 1;
    const a = COMBO_TIERS[t].at, b = COMBO_TIERS[t + 1].at;
    return Math.max(0, Math.min(1, (this.n - a) / (b - a)));
  }

  setTier(t) {
    if (t === this.tier) return;
    const up = t > this.tier;
    this.tier = t; this.mul = COMBO_TIERS[t].mul;
    if (this.game.formation) this.game.formation.refresh();
    if (up) this.game.events.emit('combo:tier', { tier: t, mul: this.mul, count: this.n });
  }

  update() {
    const run = this.live();
    if (!run) return;
    const k = run.kills - this.lastKills;
    this.lastKills = run.kills;
    if (k <= 0) return;
    this.n += k;
    if (this.n > (run.stats.maxCombo || 0)) run.stats.maxCombo = this.n;
    let t = this.tier;
    while (t < COMBO_TIERS.length - 1 && this.n >= COMBO_TIERS[t + 1].at) t++;
    this.setTier(t);
  }

  lose() {
    const run = this.live();
    if (!run || this.n <= 0) return;
    this.lastKills = run.kills; // kills in the same step as the loss don't start the next combo
    this.lost = this.n; this.lostT = this.game.time;
    this.n = 0;
    this.setTier(0);
    this.game.events.emit('combo:lost', { count: this.lost });
  }

  coinBonus(amount) {
    const run = this.live();
    if (!run || this.mul <= 1 || !(amount > 0)) return;
    this.coinAcc += amount * (this.mul - 1);
    if (this.coinAcc >= 1) { const w = Math.floor(this.coinAcc); this.coinAcc -= w; run.coins += w; this.bonusCoins += w; }
  }

  state() { return { n: this.n, tier: this.tier, mul: this.mul, bonusCoins: this.bonusCoins, lost: this.lost }; }
}
