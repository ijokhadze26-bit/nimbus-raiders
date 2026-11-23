// The scripted Quick Match rival (STAGE3 "The bot"): every hand-set number in one place. Times are seconds on the
// bot link's match clock (0 = GO), distances road units. The level tables are indexed by level + 3 (level -3 .. 3:
// src/online/bot.js botForm). The measured curves (fall time, squad, distance, arenas, the sabotage slice) are in
// botcurves.js, made by scripts/balance/botcurves.mjs: never edit that file by hand.
//
//   salt        Rng(seed ^ salt) and its sub-streams drive everything one bot does (botplan.js streams())
//   ready       seconds of RIVAL FOUND! before its match starts (pickBot().readyIn)
//   trSpread    its trophies = mine +- this (never below 0); defaultNames = share of `Raider-NNNN` names
//   stream      one sample every `sample` s, a bundle every `flush` s, delivered `lag` +- `jitter` s late
//   fall        its fall time is clamped to [min, max]; the squad collapses over the last `collapse` s; a landed
//               sabotage never brings the fall closer than `keep` s from the moment it lands
//   levels      2 player losses in a row -> one level down, 3 wins in a row -> one level up, within [min, max]
//   level       median: x BOT_CURVES.casual.fall.median (the integrator tunes [3], level 0); wrongGate: chance per
//               gate row of steering to the worse side; curve: squad / arena curves blend 0 casual .. 1 pro;
//               slice: x the slice of its fall time that a landed sabotage of mine takes
//   steer       lane speed (u/s), lane noise (u), how far ahead a gate row is aimed at (u)
//   formEvery   seconds between formation changes (line / wedge / circle)
//   arenaRecover  seconds for its squad to climb back from an arena's dip to the curve
//   sab         its sabotage: the first normal one at U(first) s, then every U(every) s, never two within `gap` s;
//               a big one `bigAfter` s after each of its boss kills
//   react       mine landing on it: after `delay` s a squad dip of dip[code] (share lost) that recovers over
//               `recover` s, danger round(9 x dip x dangerK), the 'sabotaged' flag for `flag` s, FREEZE holds its
//               lane for `freeze` s, and slice[code] x BOT_CURVES.*.sliceK x level slice seconds off its fall time
export const BOT = {
  salt: 0x5bd1e995,                          // Rng(seed ^ salt): everything one bot does
  ready: [1.5, 4.0],                         // s of RIVAL FOUND! before its match starts (pickBot().readyIn)
  trSpread: 60, defaultNames: 0.3,
  stream: { sample: 0.1, flush: 0.25, lag: 0.12, jitter: 0.06 },
  fall: { min: 25, max: 300, collapse: [6, 8], keep: 7 },
  levels: { min: -3, max: 3, loseRun: 2, winRun: 3 },
  level: {         //   -3    -2    -1     0     1     2     3
    median:      [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30],    // x curves.casual.fall.median ([3] checked 2026-11-23: 20/40 = 50 % on seeds 41-80)
    wrongGate:   [0.35, 0.30, 0.25, 0.20, 0.15, 0.10, 0.06],
    curve:       [0,    0,    0,    0,    0.5,  1,    1],       // squad / arena curves: 0 casual .. 1 pro
    slice:       [1.3,  1.2,  1.1,  1.0,  0.9,  0.8,  0.7],     // x the slice of T a landed sabotage takes
  },
  steer: { speed: 6, wobble: 0.35, look: 45 },   // u/s; lane noise (u); how far ahead a gate row is aimed at (u)
  formEvery: [12, 30],                       // s between formation changes (form 0..2)
  arenaRecover: 10,                          // s for its squad to climb back from an arena's dip to the curve
  sab: { first: [28, 40], every: [18, 35], gap: 6, bigAfter: 1.0 },
  react: {
    delay: 1.0, recover: 8, flag: 3, dangerK: 1.5, freeze: 2,
    dip:   { 1: 0.25, 2: 0.05, 3: 0.15, 4: 0.10, 5: 0.10, 11: 0.40, 12: 0.15 },   // share of its squad lost
    slice: { 1: 1.0,  2: 0.4,  3: 0.8,  4: 0.6,  5: 0.8,  11: 2.0,  12: 1.0 },    // x curves.sliceK (s of T)
  },
};
