// ELITE mode (update 3 stage 3, data only). A campaign level can be replayed on ELITE once it has 3 stars
// (save.stars[id] === 3): bigger hordes, tougher enemies, more elite Murklings (glow, x3 hp), more boss hp, and
// better pay - the level reward x2 and +50% on the coins collected during the run. Stars use 0.8x the normal
// thresholds (the squad meets far more enemies); a win records save.elite[id] = stars. Not available in
// endless / practice (game.startLevel is the only caller).
// Stage 3 review: the multipliers are per world (index = world - 1). Worlds 4-5 already carry the stage-3 late
// ramp and ~18% elites, so they get less on top; the opening hordes (met by a 20-30 squad) keep their size
// (count factor ramps in from OPEN_P to FULL_P of the level), and a horde never gets smaller than on normal.

export const ELITE = {
  count: [1.5, 1.5, 1.45, 1.15, 1.15],
  tough: [1.4, 1.4, 1.35, 1.1, 1.1],
  elite: [0.2, 0.2, 0.18, 0.08, 0.06],
  bossHp: [1.5, 1.5, 1.4, 1.15, 1.1],
  reward: 2, coinMul: 1.5, stars: 0.8, maxHorde: 1000,
};
export const ELITE_TEXT = 'More and tougher enemies, elite glow, x2 coins';
const OPEN_P = 0.12, FULL_P = 0.4;

/** Elite is open on a level with 3 stars. */
export function eliteUnlocked(save, id) { return !!save && ((save.stars && save.stars[id]) | 0) >= 3; }

/** Best elite stars of a level (0 = never cleared on elite). */
export function eliteStars(save, id) { return (save && save.elite && save.elite[id]) | 0; }

/** The world's elite multipliers { count, tough, elite, bossHp } for a level def. */
export function eliteMuls(def) {
  const i = Math.max(0, Math.min(4, ((def && def.world) || 1) - 1));
  return { count: ELITE.count[i], tough: ELITE.tough[i], elite: ELITE.elite[i], bossHp: ELITE.bossHp[i] };
}

const r2 = (v) => Math.round(v * 100) / 100;

/** The ELITE version of a level def (a new object: the campaign def and its events stay untouched). */
export function eliteDef(def) {
  if (!def || def.elite) return def;
  const E = ELITE, M = eliteMuls(def);
  const span = def.layout ?? def.length ?? 1;
  const events = def.events.map((e) => {
    if (e.type !== 'horde') return { ...e };
    const p = e.rush ? 1 : Math.max(0, Math.min(1, (e.at || 0) / span));
    const k = 1 + (M.count - 1) * Math.max(0, Math.min(1, (p - OPEN_P) / (FULL_P - OPEN_P)));
    const n = Math.max(e.count, Math.min(E.maxHorde, Math.round(e.count * k)));
    const h = { ...e, count: n, elite: Math.min(1, Math.round(((e.elite || 0) + M.elite) * 1000) / 1000) };
    if (h.hpMul != null) h.hpMul = r2(h.hpMul * M.tough);
    return h;
  });
  const out = {
    ...def, events, elite: true, coinMul: E.coinMul, name: `ELITE ${def.name || ''}`.trim(), // the HUD title says ELITE
    tough: r2((def.tough || 1) * M.tough),
    enemyHp: r2((def.enemyHp || 1) * M.tough),
    reward: Math.round((def.reward || 0) * E.reward),
    stars: (def.stars || [10, 25]).map((s) => Math.max(1, Math.round(s * E.stars))),
  };
  if (def.boss) out.boss = { ...def.boss, hp: Math.round(def.boss.hp * M.bossHp), elite: true };
  return out;
}
