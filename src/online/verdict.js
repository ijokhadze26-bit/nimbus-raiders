// Who won. Pure functions only (no clock, no network), so every client reaches the same answer
// from the same write-once fall records (SPEC4 5.6, 5.9, 10).
//
// All ranking is done in whole tenths of a second (T10) so no two clients can disagree over a
// rounding error. A fall record is { t, d, ts, by }: played time in tenths, metres, server stamp,
// 'dead' | 'quit' | 'dc' | 'cap'.

import { NET } from './config.js';

/** Ranking time in tenths: T = min(t / 10, (ts - t0) / 1000), never negative. */
export function rankT10(out, t0) {
  const played = Math.round(Number(out.t) || 0);
  const real = Math.floor(((Number(out.ts) || 0) - t0) / 100);
  return Math.max(0, Math.min(played, real));
}

/** A fall record in ranking form: { T10, T (seconds), d, by }. */
export function toRank(out, t0) {
  const T10 = rankT10(out, t0);
  return { T10, T: T10 / 10, d: Number(out.d) || 0, by: out.by || 'dead' };
}

const byRank = (a, b) => b.T10 - a.T10 || b.d - a.d || a.slot - b.slot;
const row = (o) => ({ slot: o.slot, T: o.T10 / 10, d: o.d, by: o.by });
const aliveRow = (slot) => ({ slot, T: null, d: null, by: null });

/** Order a full set of falls: first place uses the tie rule (within the window the further
 *  distance wins, equal distance is a draw), everyone else is placed by time. */
function settle(list, tie10) {
  const sorted = [...list].sort(byRank);
  const near = sorted.filter((o) => o.T10 >= sorted[0].T10 - tie10);
  const bestD = Math.max(...near.map((o) => o.d));
  const winners = near.filter((o) => o.d === bestD).sort((a, b) => a.slot - b.slot);
  const rest = sorted.filter((o) => !winners.includes(o));
  return { order: [...winners, ...rest], winners, contested: near.length > 1 };
}

const WHY = { dead: 'standing', quit: 'quit', dc: 'dc', cap: 'cap' };
const MINE = { dead: 'fell', quit: 'quit', dc: 'dc', cap: 'cap' };

/**
 * judge({ me, slots, outs, liveT10, tie10 }) -> null while undecided, else
 *   { result: 'win' | 'lose' | 'draw', place, places: [{ slot, T, d, by }], reason }
 *
 *   me       my seat
 *   slots    every seat that started the match
 *   outs     { [slot]: { T10, d, by } } for the seats whose fall is known (mine included once I fell)
 *   liveT10  { [slot]: latest known played time in tenths } for seats still running
 *
 * reason: 'standing' (rivals fell, I did not), 'fell', 'distance' (inside the tie window, distance
 * decided), 'draw', 'dc' (a connection was lost), 'quit', 'cap'.
 * A seat with no fall record is listed first in `places` with T null (still running).
 */
export function judge({ me, slots, outs, liveT10 = {}, tie10 = NET.tie10 }) {
  const rivals = slots.filter((s) => s !== me);
  const known = (s) => (outs[s] ? { slot: s, ...outs[s] } : null);
  const mine = known(me);
  const fallen = rivals.map(known).filter(Boolean);
  const running = rivals.filter((s) => !outs[s]);

  if (!mine) {
    if (running.length || !fallen.length) return null;
    const sorted = [...fallen].sort(byRank);
    if (!((liveT10[me] ?? -1) > sorted[0].T10 + tie10)) return null;
    return { result: 'win', place: 1, places: [aliveRow(me), ...sorted.map(row)], reason: WHY[sorted[0].by] || 'standing' };
  }

  const forced = mine.by === 'dc' || mine.by === 'cap'; // somebody else closed my seat: no tie window to wait for
  if (!forced && running.some((s) => !((liveT10[s] ?? -1) > mine.T10 + tie10))) return null;

  if (running.length) {
    const sorted = [...fallen, mine].sort(byRank);
    return {
      result: 'lose',
      place: 1 + running.length + sorted.indexOf(mine),
      places: [...running.map(aliveRow), ...sorted.map(row)],
      reason: MINE[mine.by] || 'fell',
    };
  }

  const { order, winners, contested } = settle([...fallen, mine], tie10);
  const places = order.map(row);
  if (winners.includes(mine)) {
    if (winners.length > 1) return { result: 'draw', place: 1, places, reason: 'draw' };
    const runnerUp = order[1];
    return { result: 'win', place: 1, places, reason: contested ? 'distance' : (WHY[runnerUp?.by] || 'standing') };
  }
  const place = order.indexOf(mine) + 1;
  const inWindow = mine.T10 >= winners[0].T10 - tie10 && mine.by === 'dead';
  return { result: 'lose', place, places, reason: inWindow ? 'distance' : (MINE[mine.by] || 'fell') };
}

/** The whole ranking once it can no longer change, else null: everyone fell, or exactly one seat
 *  is still running and is past the tie window of the best fall. */
export function finalPlaces({ slots, outs, liveT10 = {}, tie10 = NET.tie10 }) {
  const fallen = slots.filter((s) => outs[s]).map((s) => ({ slot: s, ...outs[s] }));
  const running = slots.filter((s) => !outs[s]);
  if (!fallen.length || running.length > 1) return null;
  if (!running.length) return settle(fallen, tie10).order.map(row);
  const sorted = [...fallen].sort(byRank);
  if (!((liveT10[running[0]] ?? -1) > sorted[0].T10 + tie10)) return null;
  return [aliveRow(running[0]), ...sorted.map(row)];
}

const TOP_SPEED = 20; // u/s over the whole run; the rules bound a fall record at 18 u/s, the stream gets a little slack
// u/s between two bundles: SPEED UP in Sudden Death runs 11.6 x 1.6 x 1.35 = 25.1 u/s for a while, so an honest rival
// on it may outrun TOP_SPEED from one bundle to the next (the whole-run bound above still holds)
const BURST_SPEED = 27;

/**
 * plausible(prev, next, clockS) -> null when fine, else why not (SPEC4 section 10): a rival's decoded
 * state against the one before it and the match clock. `prev` may be null.
 */
export function plausible(prev, next, clockS) {
  if (!next) return 'empty';
  if (next.t > clockS + 2) return 'time-ahead';
  if (next.n > 999) return 'squad';
  if (next.dist > 40 + Math.max(0, next.t) * TOP_SPEED) return 'distance';
  if (prev) {
    if (next.t < prev.t - 0.05) return 'time-back';
    if (next.dist - prev.dist > 5 + Math.max(0.1, next.t - prev.t) * BURST_SPEED) return 'speed';
  }
  return null;
}

// --- trophy maths (SPEC4 section 9). The rules repeat these numbers as HS / BS / BG; keep them in step. ---

/** What a ranked match against a human costs at GO. */
export const humanStake = (tr) => (tr >= 300 ? 20 : tr >= 10 ? 10 : Math.max(0, tr));
/** What a ranked match against a bot costs at GO. */
export const botStake = (tr) => (tr >= 1200 ? 6 : tr >= 700 ? 12 : humanStake(tr));
/** Trophies gained for beating a bot (on top of getting the stake back). */
export const botGain = (tr) => (tr >= 1200 ? 6 : tr >= 700 ? 12 : tr >= 300 ? 20 : 28);
/** Trophies gained for beating a human: +clamp(round(28 + (rival - me) / 25), 2, 40). */
export const humanGain = (me, rival) => Math.max(2, Math.min(40, Math.round(28 + (rival - me) / 25)));
