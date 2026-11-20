// Online survival match: every tunable number in one place (SPEC4 §6). Times are seconds on the PLAYED clock
// (Versus.t = real seconds of simulation stepped), distances are road units.
// Calibrated with `node scripts/balance/versus.mjs` (casual and pro autopilots, shop upgrades off): see the
// header of that script for the measured survival times.
export const VS = {
  // Boss hp per arena, then x bossGrowth each. The first boss is a warm-up; the SECOND is the wall most matches end
  // at: the autopilots reach it after about 1:50 with a full squad and few shoot 500000 hp down before its attacks
  // have thinned the squad. Once a squad is down to a handful, the next wave that reaches it ends the match.
  bossHp: [30000, 500000, 700000, 900000], bossGrowth: 1.35,
  // boss tier per arena (cadence, warning time, broods; the last value repeats): single-player endless uses 1, 2, 3 ...
  bossTier: [1, 5, 6, 7],

  // pace: forward speed x (1 + gain * min(1, t / over)); in Sudden Death + suddenPerSec each second, never above max.
  // (SPEC4 guessed +25% over 180 s: then the second boss comes at 2:30 and the casual bot lasts 3:20. +50% in the first
  // minute brings that boss to about 1:50, which is what puts the casual median under 170 s.)
  pace: { gain: 0.5, over: 60, suddenPerSec: 0.005, max: 1.6 },
  // tougher enemies: every horde spawned at t has hp x (1 + t / per)
  hpRamp: { per: 150 },
  // pressure waves (extra hordes on top of the road's own): from `from` s, one every max(everyMin, every0 - t / everyDiv) s,
  // count = round(count0 + t / countDiv) (x bossMul in an arena), spawned `ahead` u in front of the squad (aheadBoss in
  // an arena). In an arena the squad stands still, so ramp.js makes every wave charge from where it appears: from 60 u
  // it is under fire for ~11 s. bossMul is small because a squad the boss has thinned to a handful dies to the first
  // wave that arrives: at 0.5 (SPEC4's "half count") both bots fall in the same seconds (medians 171 / 176 s).
  waves: { from: 45, every0: 18, everyDiv: 15, everyMin: 8, count0: 10, countDiv: 3, ahead: 60, aheadBoss: 60, bossMul: 0.15 },
  // more red gates, by DISTANCE (identical for every player): a gate row past `from` u turns its better side red with
  // chance min(max, base + per700 * at / 700); one draw per row from Rng(seed * 97 + 3)
  red: { from: 300, base: 0.08, per700: 0.12, max: 0.45 },

  // Sudden Death from `at` s: wave k every max(everyMin, every0 - everyStep * k) s with
  // count = min(countMax, round(count0 * growth^k)) (x bossMul in an arena), hp x hpGrowth^k, elite share
  // min(eliteMax, eliteStep * k). In an arena the waves start small and grow all the same (2, 2, 3, 3, 4, 5, 6, 7, 9
  // ... 20 every 2.5 s): they finish a handful at once and wear a bigger squad down; at full count nobody in an arena
  // outlives the first one, however well they dodge the boss.
  sudden: { at: 180, dark: 0.35, aheadBoss: 60, bossMul: 0.05, every0: 6, everyStep: 0.3, everyMin: 2.5, count0: 40, growth: 1.2, countMax: 400, hpGrowth: 1.12, eliteStep: 0.05, eliteMax: 0.5 },
  // Storm wall from `at` s: every `every` s the squad loses ceil(count * frac) + flat Raiders; at hardEnd everyone is out
  storm: { at: 270, every: 1, frac: 0.12, flat: 2, dark: 0.55, fogMul: 0.6, hardEnd: 322 },

  // pump (SPEC4 §5.3): up to `extra` catch-up steps of `step` s per frame while the played clock is behind the match
  // clock; a gap over maxGap s is a stall (not simulated); stalled for more than `forfeit` s in total = out
  pump: { extra: 3, step: 1 / 30, maxGap: 1, forfeit: 15 },
  sample: 0.1, // one state sample every 0.1 s (10 a second)

  // danger 0..9 sent with every sample: 9 * max(1 - n / low (after `grace` s), share of the squad lost in `window` s)
  danger: { low: 15, grace: 20, window: 2 },

  // the end of a match (real seconds)
  end: {
    loseSlow: { scale: 0.25, duration: 1.2 },  // my squad is down
    loseHold: 2.6,        // result screen this long after my fall (or minHold after the verdict, whichever is later)
    minHold: 0.6,
    rivalSlow: { scale: 0.3, duration: 1.0 },  // the last rival fell: slow motion through the 1 s tie window
    winHold: 2.2,         // result screen this long after the win
    // fallen and still no verdict this long after (match clock): the run ends as a loss. A LAST RESORT, far past the
    // network side's slowest verdict (silent rival 3 + 10 s, stalled rival ~20 s, me offline 8 s: src/online/config.js)
    verdictWait: 30,
  },

  // rival ghosts (ghost.js / track.js)
  ghost: {
    perHigh: 26, perLow: 14,       // most Raiders drawn per rival
    perSqrt: 2.6,                  // drawn = round(perSqrt * sqrt(squad)), so a bigger squad reads bigger
    alpha: 0.55,                   // body opacity at full strength
    spreadMax: 1.7, grow: 0.25,    // a big squad: slots at most this much wider, Raiders up to this much bigger
    nearAlpha: 0.5, nearAlphaLow: 0.36, // x this when the ghost overlaps my own squad (Low has no rim: flatter, so fainter)
    near: [0.8, 4.5],              // |metres apart| along the road over which nearAlpha eases back to 1
    side: [1.2, 3.2],              // ... and sideways (a ghost in the other lane is not an overlap)
    ahead: 34, farAlpha: 0.4, farFade: 30,  // further ahead than `ahead`: pinned there, fading to farAlpha over farFade u
    behind: 5,                     // rivals behind fade out by this many units (the bar at the top shows them)
    lift: 0.05, scale: 1.06,
    // jitter buffer (SPEC4 §5.4, track.js): playhead = match clock - base - D in the rival's own played time;
    // base = smallest arrival offset of the last 10 messages, D = jitter + bundle interval (at most everyMax) + pad
    delayPad: 0.08, delayMin: 0.35, delayMax: 2.5, everyMax: 1, rateMin: 0.95, rateMax: 1.05, rateStarve: 0.5,
    snap: 3, reseat: 1,            // playhead this far behind / ahead of its goal: re-seated instead of eased
    stall: 1, latency: 0.15,       // a base over `stall` s is the rival's clock deficit (pump.maxGap) + about `latency`
    extrapolate: 0.4, starveAlpha: 0.15, starveFade: 0.6,
    settle: 10,                    // u/s: a run-on past a rival that stopped eases back at this speed
    tag: true,                     // High only: the rival's name floats over the ghost leader
  },
};

/** Seat colours (ghost tint; the versus bar can use the same ones). */
export const SLOT_COLORS = ['#19bfff', '#ff58b4', '#ffc41f', '#55dd66'];

/** Boss hp of arena n (1-based) in a versus match. */
export function vsBossHp(n) {
  const T = VS.bossHp;
  const raw = n <= T.length ? T[n - 1] : T[T.length - 1] * Math.pow(VS.bossGrowth, n - T.length);
  return Math.round(raw / 500) * 500;
}

/** Boss tier of arena n (1-based). */
export function vsBossTier(n) { const T = VS.bossTier; return T[Math.min(T.length, n) - 1]; }

/** Pace multiplier at played time t. */
export function vsPace(t) {
  const P = VS.pace, S = VS.sudden;
  const base = 1 + P.gain * Math.min(1, t / P.over);
  return t <= S.at ? base : Math.min(P.max, base + P.suddenPerSec * (t - S.at));
}
