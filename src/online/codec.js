// Pack / unpack the state string written to rooms/{code}/l/{slot} (SPEC4 5.4). Pure.
//
//   char 0      version: '1' = x samples 0.1 s apart; '2' = 0.2 s, '3' = 0.4 s ... (the sender halved its
//               backlog while it could not send; superset of the spec's fixed '1')
//   1-2  seq    0..1295, wraps          3-5  t      played clock of the newest sample, whole tenths (rounded down)
//   6-8  dist   0.5 u                   9-10 n      squad 0..999
//   11   form   0 line 1 wedge 2 circle 12   flags  bit0 boss phase, bit1 shielded, bit2 sabotaged,
//                                                    bit3 frozen, bit4 big sabotage ready
//   13-14 boss hp fraction x 1295 ('00' = none)     15 zone   16 charge 0..35   17 danger 0..9
//   18.. x samples, 2 chars each, oldest first: (x + 4.75) / 9.5 x 1295

export const X_LIMIT = 4.75;      // MEMBER_CLAMP in src/config.js
export const HEADER = 18;
export const SEQ_MOD = 1296;
export const MAX_XS = 23;         // 18 + 2 * 23 = 64 chars, the rules' limit for a state string

const int = (v, max) => {
  const n = Math.round(Number(v) || 0);
  return n < 0 ? 0 : n > max ? max : n;
};
/** Played seconds -> whole tenths, always rounded DOWN: the one rule used for every time that is ranked
 *  or compared (the state string, a fall record, the live clock), so no two screens differ by a rounding. */
export const tenths = (t) => Math.max(0, Math.floor((Number(t) || 0) * 10 + 1e-6));
const b36 = (n, w) => n.toString(36).padStart(w, '0');
const xCode = (x) => int(((Number(x) || 0) + X_LIMIT) / (2 * X_LIMIT) * 1295, 1295);
const xVal = (c) => c / 1295 * (2 * X_LIMIT) - X_LIMIT;

/**
 * encodeState(seq, s, xs, halvings) -> string
 * `s` is the newest sample { t, dist, n, form, flags, boss, zone, charge, danger, x }; `xs` the lane samples
 * collected since the last flush, oldest first (falls back to [s.x]).
 */
export function encodeState(seq, s, xs, halvings = 0) {
  const boss = Number(s.boss) || 0;
  const list = xs && xs.length ? xs : [s.x];
  let out = b36(1 + int(halvings, 8), 1)
    + b36(((Math.round(seq) % SEQ_MOD) + SEQ_MOD) % SEQ_MOD, 2)
    + b36(Math.min(tenths(s.t), 46655), 3)
    + b36(int(s.dist * 2, 46655), 3)
    + b36(int(s.n, 999), 2)
    + b36(int(s.form, 2), 1)
    + b36(int(s.flags, 31), 1)
    + b36(boss > 0 ? Math.max(1, int(boss * 1295, 1295)) : 0, 2)
    + b36(int(s.zone, 35), 1)
    + b36(int(s.charge, 35), 1)
    + b36(int(s.danger, 9), 1);
  const from = Math.max(0, list.length - MAX_XS);
  for (let i = from; i < list.length; i++) out += b36(xCode(list[i]), 2);
  return out;
}

const VALID = /^[1-9][0-9a-z]+$/;

/** decodeState(str) -> null when malformed, else the newest sample's fields plus
 *  `seq`, `xs` (all lane samples, oldest first) and `step` (seconds between x samples). */
export function decodeState(str) {
  if (typeof str !== 'string' || str.length < HEADER + 2 || str.length > 64) return null;
  if ((str.length - HEADER) % 2 !== 0 || !VALID.test(str)) return null;
  const num = (a, b) => parseInt(str.slice(a, b), 36);
  const n = num(9, 11), form = num(11, 12), danger = num(17, 18);
  if (n > 999 || form > 2 || danger > 9) return null;
  const xs = [];
  for (let i = HEADER; i < str.length; i += 2) xs.push(xVal(num(i, i + 2)));
  return {
    v: num(0, 1),
    step: 0.1 * 2 ** (num(0, 1) - 1),
    seq: num(1, 3),
    t: num(3, 6) / 10,
    dist: num(6, 9) / 2,
    n,
    form,
    flags: num(12, 13),
    boss: num(13, 15) / 1295,
    zone: num(15, 16),
    charge: num(16, 17),
    danger,
    x: xs[xs.length - 1],
    xs,
  };
}

/** True when sequence number `a` is newer than `b`, allowing for the wrap at 1296. */
export function seqNewer(a, b) {
  const d = ((a - b) % SEQ_MOD + SEQ_MOD) % SEQ_MOD;
  return d !== 0 && d < SEQ_MOD / 2;
}

export const FLAG = Object.freeze({ boss: 1, shield: 2, sabotaged: 4, frozen: 8, bigReady: 16 });
