// DAILY CHALLENGE (stage 5 mode): one fixed campaign level + one twist per calendar day, seeded by the local date
// (YYYY-MM-DD) so everyone who has that world open plays the same run that day. Pick: a world from the seed (or
// the highest open world when it is locked), a normal (non-boss) level of it from the seed (or the latest open
// one of that world), a twist from DAILY.twists. Score of a clear = squad at the finish x stars. The local
// leaderboard is save.modes.dailyBest ('YYYY-MM-DD' -> that day's best score), shown as the top 10 with dates.
// The first clear of a day pays DAILY.bonus coins on top of the level payout.
// Pinned per day: the level of the first Daily run of a date is kept in save.modes.dailyPin, so unlocking a world
// later that day never swaps the level under the same leaderboard date (one date = one level for this player).
import { WORLDS, levelKind, isWorldUnlocked, worldOf } from '../../data/worlds.js';
import { dateKey } from '../../save/progress.js';

export const DAILY = {
  twists: ['doubleSpeed', 'fog', 'halfSquad', 'onlyRed', 'giantEnemies', 'eliteHorde', 'mirror', 'noGuns'],
  bonus: 400,
  top: 10,
};

/** 32-bit FNV-1a of a string (the day's seed). */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const normalLevels = (w) => {
  const out = [];
  for (let id = w.first; id <= w.last; id++) { const k = levelKind(id); if (k !== 'boss' && k !== 'mini') out.push(id); }
  return out;
};

/** Today's challenge { date, seed, levelId, world, twist } for a save (its open worlds). */
export function dailyPlan(save, now = new Date()) {
  const date = typeof now === 'string' ? now : dateKey(now);
  const seed = hashStr('nimbus-daily-' + date);
  const twist = DAILY.twists[(seed >>> 16) % DAILY.twists.length];
  const pin = save && save.modes && save.modes.dailyPin;
  if (pin && pin.date === date && isDailyLevel(pin.levelId)) return { date, seed, levelId: pin.levelId, world: worldOf(pin.levelId), twist };
  let w = WORLDS[seed % WORLDS.length];
  if (!isWorldUnlocked(save, w.id)) w = [...WORLDS].reverse().find((x) => isWorldUnlocked(save, x.id)) || WORLDS[0];
  const list = normalLevels(w);
  let levelId = list[(seed >>> 8) % list.length];
  const open = (save && save.unlockedLevel) || 1;
  if (levelId > open) levelId = [...list].reverse().find((id) => id <= open) || w.first;
  return { date, seed, levelId, world: w.id, twist };
}

/** A level a Daily can use (a normal / intro campaign level). */
export const isDailyLevel = (id) => Number.isInteger(id) && id >= 1 && id <= WORLDS[WORLDS.length - 1].last && !['boss', 'mini'].includes(levelKind(id));

/** Keeps today's level for the rest of the day (called when a Daily run starts). */
export function pinDaily(save, plan) {
  if (!save || !plan || !plan.date) return;
  const pin = save.data.modes.dailyPin;
  if (pin && pin.date === plan.date && pin.levelId === plan.levelId) return;
  save.update((s) => { s.modes.dailyPin = { date: plan.date, levelId: plan.levelId }; });
}

/** Score of a clear. */
export const dailyScore = (squad, stars) => Math.max(0, (squad | 0) * Math.max(1, stars | 0));

/** Top scores [{ date, score }] (best first, newest first on ties). */
export function dailyBoard(save, n = DAILY.top) {
  const m = (save && save.modes && save.modes.dailyBest) || {};
  return Object.entries(m).map(([date, score]) => ({ date, score }))
    .sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1)).slice(0, n);
}

/** Today already cleared (the bonus is paid once a day)? */
export const dailyDone = (save, date) => !!(save && save.modes && save.modes.dailyBest && save.modes.dailyBest[date] > 0);
