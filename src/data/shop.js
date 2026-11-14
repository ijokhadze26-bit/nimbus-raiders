// Shop data (data only): permanent upgrade tracks (SPEC §5) and the 7-day daily reward table.
// cost(level) = round(base * growth^level) is the price of going from `level` to `level + 1`.

export const UPGRADES = [
  { id: 'squad', name: 'Starting Squad', desc: '+1 raider at the start', icon: 'squad', color: 'blue',
    max: 15, base: 60, growth: 1.32, per: 1, unit: 'raiders' },
  { id: 'damage', name: 'Damage', desc: '+10% bullet damage', icon: 'damage', color: 'red',
    max: 20, base: 80, growth: 1.28, per: 0.10, unit: '%' },
  { id: 'rate', name: 'Fire Rate', desc: '+7% shots per second', icon: 'rate', color: 'green',
    max: 20, base: 80, growth: 1.28, per: 0.07, unit: '%' },
  { id: 'tier', name: 'Starting Weapon', desc: 'Begin each level with a better gun', icon: 'tier', color: 'purple',
    max: 3, base: 600, growth: 2.6, per: 1, unit: 'tier' },
  { id: 'coins', name: 'Coin Bonus', desc: '+10% coins from every run', icon: 'coinbonus', color: 'gold',
    max: 15, base: 100, growth: 1.3, per: 0.10, unit: '%' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Price of the next level, or null when maxed. */
export function upgradeCost(id, level) {
  const u = UPGRADE_BY_ID[id];
  if (!u || level >= u.max) return null;
  return Math.round(u.base * Math.pow(u.growth, level));
}

/** Multipliers / values the game reads (later stages apply them in-game). */
export function upgradeEffects(upgrades = {}) {
  const lv = (id) => Math.max(0, Math.min(UPGRADE_BY_ID[id].max, upgrades[id] | 0));
  return {
    startSquad: lv('squad'),
    damageMul: 1 + 0.10 * lv('damage'),
    rateMul: 1 + 0.07 * lv('rate'),
    startTier: 1 + lv('tier'),
    coinMul: 1 + 0.10 * lv('coins'),
  };
}

/** Short label of the current effect, e.g. "+30%" or "Tier 2". */
export function upgradeLabel(id, level) {
  const u = UPGRADE_BY_ID[id];
  if (!u) return '';
  if (id === 'tier') return `Tier ${1 + level}`;
  if (u.unit === '%') return `+${Math.round(u.per * level * 100)}%`;
  return `+${u.per * level}`;
}

// Daily reward: claim once per local calendar date; missing a day resets the streak to day 1.
// Day 7 also grants a random skin the player doesn't own yet (or just the coins when all are owned).
export const DAILY = [50, 80, 120, 160, 220, 300, 500];
