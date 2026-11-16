// Matchup tables (data only, SPEC2 §2.8). vsMul(el, enemyType) multiplies every hp damage of that element
// (direct, burn, splash, chain, crush, split); bossMul(el, bossType) the same on bosses. Shield-hit counts
// are separate (SHIELD_HITS). The UI's strong / weak lists live on the defs (def.strong / def.weak) and are
// checked against these tables by tests/u2/foundation-data.js.
import { ENEMY_TYPES } from './enemies.js';

export const ELEMENTS = ['emberstorm', 'glacier', 'sugarrush', 'spectra', 'gearworks', 'thunderclap', 'voidsiphon', 'neutral'];

//                 grunt runner tank  shield bomber
export const VS = {
  emberstorm: { grunt: 1.6, runner: 1.0, tank: 0.7, shield: 1.0, bomber: 1.6 },
  glacier: { grunt: 0.9, runner: 1.6, tank: 0.5, shield: 1.0, bomber: 0.9 },
  sugarrush: { grunt: 1.5, runner: 0.6, tank: 0.8, shield: 1.6, bomber: 1.5 },
  spectra: { grunt: 0.8, runner: 1.0, tank: 1.7, shield: 0.9, bomber: 0.9 },
  gearworks: { grunt: 0.9, runner: 0.8, tank: 1.8, shield: 2.0, bomber: 1.0 },
  thunderclap: { grunt: 1.0, runner: 1.0, tank: 0.9, shield: 0.9, bomber: 1.2 },
  voidsiphon: { grunt: 1.6, runner: 1.6, tank: 0.7, shield: 1.2, bomber: 1.2 },
  neutral: { grunt: 1, runner: 1, tank: 1, shield: 1, bomber: 1 },
};

export const BOSS_MUL = {
  emberstorm: { grawlstone: 0.8, oculon: 0.6, mothermurk: 0.9, ironhorn: 0.6, tempestking: 0.75 },
  glacier: { grawlstone: 1.0, oculon: 1.2, mothermurk: 0.9, ironhorn: 0.85, tempestking: 1.1 },
  sugarrush: { grawlstone: 0.9, oculon: 0.6, mothermurk: 1.0, ironhorn: 0.85, tempestking: 0.85 },
  spectra: { grawlstone: 1.35, oculon: 1.5, mothermurk: 1.2, ironhorn: 1.25, tempestking: 1.3 },
  gearworks: { grawlstone: 1.0, oculon: 0.75, mothermurk: 0.9, ironhorn: 1.6, tempestking: 0.9 },
  thunderclap: { grawlstone: 1.1, oculon: 1.0, mothermurk: 1.1, ironhorn: 1.3, tempestking: 0.7 },
  voidsiphon: { grawlstone: 0.8, oculon: 0.9, mothermurk: 1.25, ironhorn: 0.7, tempestking: 1.2 },
  neutral: { grawlstone: 1, oculon: 1, mothermurk: 1, ironhorn: 1, tempestking: 1 },
};

/** Shield hits one hit of this element removes (Sugar splash and Void crush bypass shields instead). */
export const SHIELD_HITS = { emberstorm: 1, glacier: 2, sugarrush: 1, spectra: 1, gearworks: 3, thunderclap: 1, voidsiphon: 1, neutral: 1 };
/** Element-wide shield rules shown on the info pages. */
export const SHIELD_RULE = {
  emberstorm: 'Shields block flames and burn', glacier: 'Each shard breaks 2 shield hits', sugarrush: 'Splash goes over shields',
  spectra: 'Normal', gearworks: 'Each gear breaks 3 shield hits', thunderclap: '1 shield hit per jump', voidsiphon: 'Black hole crush goes over shields',
};

/** Multiplier against an enemy type id ('grunt', ...). Unknown -> 1. */
export function vsMul(el, type) {
  const row = VS[el];
  return row && row[type] != null ? row[type] : 1;
}

/** Multiplier against a boss type id. Unknown -> 1. */
export function bossMul(el, type) {
  const row = BOSS_MUL[el];
  return row && row[type] != null ? row[type] : 1;
}

/** Any target id: enemy or boss. */
export function matchMul(el, id) { return BOSS_MUL.neutral[id] != null ? bossMul(el, id) : vsMul(el, id); }

/** Per element: Float32Array indexed by enemy type index (horde hot path). */
export const VS_INDEX = Object.fromEntries(ELEMENTS.map((el) => [el, Float32Array.from(ENEMY_TYPES.map((t) => vsMul(el, t)))]));
