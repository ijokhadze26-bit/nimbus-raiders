// Update 2 extras of a level (data only): the weapons it favours (loadout hint, SPEC2 §2.11) and its weapon
// crates (SPEC2 §2.10), placed after level() so beats never move. Levels 1-15 list theirs by hand; the
// generated levels 16-50 (levelgen.js) derive favours from their enemy mix + boss with pickFavours().
import { START, ARENA, crate } from './beats.js';
import { WEAPON_DEFS } from './weapons.js';
import { vsMul, bossMul, BOSS_MUL } from './matchups.js';

/** Weapons each hand-made level favours (backed by the matchups and the level's enemy mix / boss). */
export const FAVOURS = {
  1: ['thunderclap', 'spectra'], 2: ['glacier', 'spectra'], 3: ['glacier', 'voidsiphon', 'thunderclap'],
  4: ['gearworks', 'thunderclap'], 5: ['glacier', 'thunderclap', 'spectra'], 6: ['spectra', 'glacier'],
  7: ['voidsiphon', 'emberstorm', 'sugarrush'], 8: ['gearworks', 'thunderclap'], 9: ['emberstorm', 'sugarrush', 'spectra'],
  10: ['spectra', 'thunderclap', 'glacier'], 11: ['spectra', 'glacier'], 12: ['voidsiphon', 'emberstorm'],
  13: ['gearworks', 'spectra'], 14: ['emberstorm', 'sugarrush', 'voidsiphon'], 15: ['spectra', 'gearworks', 'thunderclap'],
};

/** Weapon crates per hand-made level: [lane, weapon, p] with p = 0..1 of the beat span. L1-3 have none. */
export const CRATES = {
  4: [['R', 'gearworks', 0.55]], 5: [['L', 'emberstorm', 0.4]], 6: [['R', 'spectra', 0.7]], 7: [['L', 'sugarrush', 0.68]],
  8: [['R', 'gearworks', 0.65]], 9: [['L', 'voidsiphon', 0.35], ['R', 'spectra', 0.85]], 10: [['L', 'glacier', 0.45]],
  11: [['R', 'thunderclap', 0.3], ['L', 'spectra', 0.6]], 12: [['R', 'voidsiphon', 0.55]],
  13: [['L', 'gearworks', 0.3], ['R', 'spectra', 0.85]], 14: [['L', 'voidsiphon', 0.35], ['R', 'sugarrush', 0.5]],
  15: [['L', 'gearworks', 0.4], ['R', 'spectra', 0.85]],
};
export const CRATE_CLEAR = 12, CRATE_SEARCH = 40;

/**
 * Crate z for target p: START + p * (layout - ARENA - START), then the first z in 0, +2, -2, +4, ... (±40)
 * that is >= 12 u outside every other event's extent [at, at + length] and every placed crate. null = none.
 */
export function crateAt(def, events, p) {
  const span = def.layout ?? def.length;
  const base = Math.round(START + p * (span - ARENA - START));
  for (let k = 0; k <= CRATE_SEARCH; k += 2) {
    for (const z of k === 0 ? [base] : [base + k, base - k]) {
      let ok = z > START && z < span - ARENA;
      for (let i = 0; ok && i < events.length; i++) {
        const e = events[i], s = e.at, t = e.at + (e.length || 0);
        if (z > s - CRATE_CLEAR && z < t + CRATE_CLEAR) ok = false;
      }
      if (ok) return z;
    }
  }
  return null;
}

/** Adds the level's crates (beat-independent; toughen() already ran and ignores crates). */
export function placeCrates(def, list = CRATES[def.id] || []) {
  for (const [lane, weapon, p] of list) {
    const at = crateAt(def, def.events, p);
    if (at != null) def.events.push(crate(at, lane, weapon));
  }
  return def;
}

/** Boss type the matchup tables know (new bosses fall back to the Grawlstone they are built on for now). */
const matchBoss = (type) => (BOSS_MUL.neutral[type] != null ? type : 'grawlstone');

/**
 * Up to `n` weapons for a generated level: score = sum over its hordes of count x mix share x vsMul, plus
 * (boss levels) the boss matchup weighted like 40% of the fight. A weapon weak against the boss never shows.
 */
export function pickFavours(def, n = 3) {
  const share = {};
  let total = 0;
  for (const e of def.events) {
    if (e.type !== 'horde') continue;
    const sum = Object.values(e.mix).reduce((s, v) => s + v, 0) || 1;
    for (const [t, v] of Object.entries(e.mix)) { share[t] = (share[t] || 0) + e.count * v / sum; total += e.count * v / sum; }
  }
  const boss = def.boss ? matchBoss(def.boss.type) : null;
  const scored = [];
  for (const w of WEAPON_DEFS) {
    if (w.unlock.level > 90) continue;
    if (boss && (w.weak.some((s) => s.id === boss) || w.weak.some((s) => s.id === def.boss.type))) continue;
    let s = 0;
    for (const [t, v] of Object.entries(share)) s += (v / (total || 1)) * vsMul(w.id, t);
    if (boss) s = s * 0.6 + bossMul(w.id, boss) * 0.4;
    scored.push([w.id, s]);
  }
  scored.sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1));
  return scored.slice(0, n).map((s) => s[0]);
}
