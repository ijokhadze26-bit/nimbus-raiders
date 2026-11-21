// Sabotage of an online survival match (STAGE2 "Numbers"): every tunable number in one place. Times are seconds on
// the PLAYED clock (Versus.t), like everything in vsdata.js, so slow motion never stretches a warning and a hidden
// tab pauses a sabotage with the match. Codes travel inside a match event `{ k: 's', a, to }` (src/online/match.js):
// a = code + 100 * tenths(sender's match clock at send), to = a slot, or -1 for a big one (every rival).
// Codes: 1 EXTRA WAVE, 2 FOG, 3 RED GATE, 4 SPEED UP, 5 FREEZE (normal, from the meter or a crate); 11 HORDE STORM,
// 12 BLACKOUT (big, from a boss kill). 13 was HEX ROAD (cut, kept free).
import { tenths } from '../codec.js';

export const SAB = {
  code: { wave: 1, fog: 2, red: 3, speed: 4, freeze: 5, storm: 11, blackout: 12 },  // 13 HEX ROAD reserved (cut)
  normal: [1, 2, 3, 4, 5], big: [11, 12],
  // the meter fills by kills x combo.mul; the next normal charge costs min(max, first + step * normal sends so far);
  // `store` charges at most, `bigStore` big ones; one send per `gap` s
  meter: { first: 60, step: 40, max: 240, store: 2, bigStore: 1, gap: 6 },
  cycle: { mul: 131, add: 17 },                  // Rng(seed * 131 + 17): order of the normal kinds
  // receiver: lands `delay` s after receipt; one per `perSender` s from the same sender; at most `queue` waiting;
  // a road-only kind waits at most `waitMax` s for a boss arena to end (then it is an EXTRA WAVE); an event sent more
  // than `stale` s before my match clock, or more than `joinGrace` s before my join, is old
  recv: { delay: 1.0, perSender: 5, queue: 3, waitMax: 20, stale: 8, joinGrace: 1 },
  arenaMul: 0.3, arenaMin: 4,                    // waves in a boss arena (STAGE2 Decision 5)
  wave: { frac: 0.35, min: 12, max: 120 },       // count = clamp(round(frac * E), min, max), E = generator knobs
  fog: { dur: 6, fogMul: 0.4 },
  // a full row of two -N gates (N = max(min, round(frac * squad))) at the first spot >= dist + ahead, `clear` u from
  // every other gate row and before run.length - preBoss, searched in `step` u
  red: { frac: 0.2, min: 4, ahead: 115, clear: 12, preBoss: 55, step: 1 },
  speed: { dur: 5, mul: 1.35 },
  freeze: { dur: 2 },
  storm: { count: 90, elite: 0.33, fogDur: 4 },
  blackout: { dur: 5, dark: 0.8, fogMul: 0.3 },
  crate: { mul: 53, add: 7, clear: 12, weapon: 'voidsiphon' },
  flagHold: 3,                                   // 'sabotaged' bit this long after a wave / gate / storm landed
};

/** The event's `a`: the code plus the sender's match clock at send in whole tenths. */
export const sabEncode = (code, clock) => code + 100 * tenths(clock);
/** { code, sent } back from an event's `a` (sent = the sender's match clock in seconds, whole tenths). */
export const sabDecode = (a) => ({ code: a % 100, sent: Math.floor(a / 100) / 10 });
/** Cost of the next normal charge after `sent` normal sends. */
export const sabCost = (sent) => Math.min(SAB.meter.max, SAB.meter.first + SAB.meter.step * sent);
/** Big kinds (to: -1, from a boss kill). */
export const sabBig = (code) => code === SAB.code.storm || code === SAB.code.blackout;
/** Kinds that need the road (they wait out a boss arena). */
export const sabRoad = (code) => code === SAB.code.red || code === SAB.code.speed || code === SAB.code.freeze;
/** Every code a receiver accepts. */
export const sabKnown = (code) => SAB.normal.includes(code) || SAB.big.includes(code);
