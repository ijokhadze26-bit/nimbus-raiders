// ELITE mode (update 3 stage 3, data only). A campaign level can be replayed on ELITE once it has 3 stars
// (save.stars[id] === 3): bigger hordes (x1.5), tougher enemies (x1.4 hp), +20% elite Murklings (glow, x3 hp),
// boss hp x1.5, and better pay - the level reward x2 and +50% on the coins collected during the run. Stars use
// 0.8x the normal thresholds (the squad meets far more enemies); a win records save.elite[id] = stars. Not
// available in endless / practice (game.startLevel is the only caller).

export const ELITE = { count: 1.5, tough: 1.4, elite: 0.2, bossHp: 1.5, reward: 2, coinMul: 1.5, stars: 0.8, maxHorde: 750 };
export const ELITE_TEXT = 'More and tougher enemies, elite glow, x2 coins';

/** Elite is open on a level with 3 stars. */
export function eliteUnlocked(save, id) { return !!save && ((save.stars && save.stars[id]) | 0) >= 3; }

/** Best elite stars of a level (0 = never cleared on elite). */
export function eliteStars(save, id) { return (save && save.elite && save.elite[id]) | 0; }

/** The ELITE version of a level def (a new object: the campaign def and its events stay untouched). */
export function eliteDef(def) {
  if (!def || def.elite) return def;
  const E = ELITE;
  const events = def.events.map((e) => {
    if (e.type !== 'horde') return { ...e };
    const h = { ...e, count: Math.min(E.maxHorde, Math.round(e.count * E.count)), elite: Math.min(1, Math.round(((e.elite || 0) + E.elite) * 1000) / 1000) };
    if (h.hpMul != null) h.hpMul = Math.round(h.hpMul * E.tough * 100) / 100;
    return h;
  });
  const out = {
    ...def, events, elite: true, coinMul: E.coinMul, name: `ELITE ${def.name || ''}`.trim(), // the HUD title says ELITE
    tough: Math.round((def.tough || 1) * E.tough * 100) / 100,
    enemyHp: Math.round((def.enemyHp || 1) * E.tough * 100) / 100,
    reward: Math.round((def.reward || 0) * E.reward),
    stars: (def.stars || [10, 25]).map((s) => Math.max(1, Math.round(s * E.stars))),
  };
  if (def.boss) out.boss = { ...def.boss, hp: Math.round(def.boss.hp * E.bossHp), elite: true };
  return out;
}
