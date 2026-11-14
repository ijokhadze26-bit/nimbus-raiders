// Hand-made levels 1-15 (data only). Each level is a list of beats laid out at an even spacing; a beat is one
// decision (gate row, barrel pair, horde, ...) plus optional side items (coins, power-ups, blades, gaps).
// Teaching curve: L1 plain +gates, a red gate to shoot blue, a barrel with a gun; runners from L2, shields
// from L4, bombers from L5, tanks from L6; ÷ ladders from L2, moving gates from L3, blades from L3, gaps from
// L5. Up to L4 the left lane is never a trap (a player who barely steers still wins); from L5 on the lanes
// have to be read. Boss rotation follows the spec (Tempest King on 10 as a mini fight and on 15 as the
// finale).

// ---------------- event builders (shared with data/endless.js) ----------------
export const gate = (at, lane, op, extra = {}) => ({ type: 'gate', at, lane, op, ...extra });
export const barrel = (at, lane, hp, kind, amount) => ({ type: 'barrel', at, lane, hp, reward: amount == null ? { kind } : { kind, amount } });
export const horde = (at, count, mix, lane = 'both', extra = {}) => ({ type: 'horde', at, count, mix, lane, ...extra });
export const blade = (at, lane, extra = {}) => ({ type: 'blade', at, lane, ...extra });
export const gap = (at, lane, length = 10) => ({ type: 'gap', at, lane, length });
export const powerup = (at, lane, kind) => ({ type: 'powerup', at, lane, kind });
export const coins = (at, lane, count = 8, pattern = 'line') => ({ type: 'coins', at, lane, count, pattern });

// ---------------- gate specs ----------------
// a(+N, max) add gate; x(k, hits) ladder starting at ×k, dv(k, hits) at ÷k (one rung up per `hits` bullets,
// FIX = never climbs)
const FIX = 99999;
const RUNG = { mul: { 2: 3, 3: 4, 4: 5 }, div: { 4: 0, 3: 1, 2: 2 } };
const a = (value, max, extra = {}) => ({ op: 'add', value, max, ...extra });
const x = (k, hitsPerStep = FIX, extra = {}) => ({ op: 'mul', rung: RUNG.mul[k], hitsPerStep, ...extra });
const dv = (k, hitsPerStep = FIX, extra = {}) => ({ op: 'div', rung: RUNG.div[k], hitsPerStep, ...extra });
const mv = (range, speed) => ({ moving: { range, speed } });
const strip = ({ op, ...rest }) => rest;

// ---------------- beats: functions of the beat position ----------------
const P = (l, r) => (at) => [gate(at, 'L', l.op, strip(l)), gate(at, 'R', r.op, strip(r))];
const C = (s) => (at) => [gate(at, 'C', s.op, strip(s))];
const B = (l, r) => (at) => [l && barrel(at, 'L', ...l), r && barrel(at, 'R', ...r)];
// hordes charge the squad once it is within ~50 u: placed 18 u past the beat they meet it around the beat
const H = (count, mix, lane = 'both') => (at) => [horde(at + 18, count, mix, lane)];
const K = (lane, n = 8, pattern = 'line') => (at) => [coins(at, lane, n, pattern)];
const U = (lane, kind) => (at) => [powerup(at, lane, kind)];
const X = (lane, extra = {}) => (at) => [blade(at, lane, extra)];
const O = (lane, length = 12) => (at) => [gap(at - length / 2, lane, length)];
// staggered variants: a blade / gap `dz` past the beat (after its gate row, or after another hazard), so two
// hazards never share one z and a good gate is never floating over a hole
const Xd = (lane, dz, extra = {}) => (at) => [blade(at + dz, lane, extra)];
const Od = (lane, length, dz) => (at) => [gap(at + dz, lane, length)];

const START = 24, ARENA = 30;

/** Spreads the beats evenly between START and `length - ARENA` (the boss arena opens at `length`). */
function level(def, beats) {
  const step = (def.length - ARENA - START) / Math.max(1, beats.length - 1);
  const events = [];
  beats.forEach((beat, i) => {
    const at = Math.round(START + i * step);
    for (const fn of [].concat(beat)) for (const e of fn(at)) if (e) events.push(e);
  });
  return { ...def, events };
}

// enemy mixes
const G = { grunt: 1 };
const GR = (r = 0.25) => ({ grunt: 1 - r, runner: r });
const GRS = (r = 0.2, s = 0.15) => ({ grunt: 1 - r - s, runner: r, shield: s });
const M5 = (r = 0.2, s = 0.14, b = 0.12) => ({ grunt: 1 - r - s - b, runner: r, shield: s, bomber: b });
const M6 = (r = 0.2, s = 0.14, b = 0.12, t = 0.07) => ({ grunt: 1 - r - s - b - t, runner: r, shield: s, bomber: b, tank: t });

export const LEVELS = [
  level({ id: 1, name: 'Cloud Cadets', theme: 'noon', length: 320, speed: 9, stars: [40, 80], reward: 40, boss: { type: 'grawlstone', hp: 1600, tier: 1 } }, [
    P(a(3, 6), a(1, 3)),
    B([8, 'weapon', 1], [8, 'troops', 4]),
    P(a(-3, 8), a(2, 4)),                       // the red gate turns blue when you shoot it
    [H(12, G), K('R', 6)],
    C(x(2)),
    [B([24, 'troops', 8], [20, 'coins', 25]), K('L', 6)],
    P(a(6, 12, mv(0.9, 1.2)), a(-4, 4)),
    H(30, G),
    B([40, 'weapon', 1], [36, 'drone', 1]),
    P(x(2), a(10, 18)),
    [H(50, G), K('L', 8, 'zigzag')],
  ]),
  level({ id: 2, name: 'Dawn Patrol', theme: 'dawn', length: 350, speed: 9.2, stars: [100, 220], reward: 50, boss: { type: 'oculon', hp: 6000, tier: 1 } }, [
    P(a(4, 8), a(2, 5)),
    B([8, 'weapon', 1], [10, 'troops', 5]),
    [H(16, GR(0.2)), K('R', 6)],
    P(a(-5, 10), a(3, 6)),
    [C(x(2)), U('R', 'shield')],
    H(36, GR(0.3)),
    B([30, 'weapon', 1], [30, 'drone', 1]),
    P(dv(2, 250), a(8, 14)),                     // ÷2 climbs to ×2 (and beyond) if you pour fire into it
    [H(60, GR(0.3)), K('R', 8)],
    B([50, 'troops', 12], [50, 'coins', 30]),
    P(x(2), a(14, 22)),
    H(100, GR(0.3)),
    P(a(12, 20), a(-8, 6)),
  ]),
  level({ id: 3, name: 'Sunset Rally', theme: 'sunset', length: 380, speed: 9.4, stars: [100, 220], reward: 60, boss: { type: 'mothermurk', hp: 9000, tier: 1 } }, [
    P(a(4, 8), a(3, 7)),
    B([8, 'weapon', 1], [10, 'troops', 5]),
    [H(22, GR(0.3)), K('R', 6)],
    P(a(7, 12, mv(1.0, 1.4)), a(-4, 10)),
    [C(x(2)), Xd('R', 12), K('L', 8)],
    H(50, GR(0.3)),
    B([36, 'weapon', 1], [40, 'drone', 1]),
    P(x(2, 800), a(10, 20)),                    // ×2 that climbs vs a fat add gate
    [H(90, GR(0.35)), U('R', 'rapid')],
    B([70, 'troops', 16], [70, 'turret', 1]),
    [P(x(2), a(-12, 16)), K('R', 8)],
    H(150, GR(0.35)),
    [B([110, 'weapon', 1], [100, 'troops', 20]), Xd('R', 12)],
    P(a(16, 30), a(-10, 8)),
  ]),
  level({ id: 4, name: 'Violet Stampede', theme: 'dusk', length: 410, speed: 9.6, stars: [140, 300], reward: 70, boss: { type: 'ironhorn', hp: 11000, tier: 2 } }, [
    P(a(5, 9), a(2, 6)),
    B([8, 'weapon', 1], [10, 'troops', 6]),
    [H(26, GRS(0.2, 0.1)), K('R', 6)],
    P(a(-6, 12), a(4, 7)),
    [C(x(2)), U('R', 'freeze'), K('L', 8)],
    H(56, GRS(0.25, 0.15)),                     // first Shieldbearers
    B([40, 'weapon', 1], [44, 'drone', 1]),
    [P(a(24, 40, mv(1.1, 1.5)), dv(2, 600)), Xd('R', -10)],
    H(100, GRS(0.25, 0.15)),
    B([80, 'troops', 20], [80, 'turret', 1]),
    P(x(2), a(18, 30)),
    [H(200, GRS(0.25, 0.25)), U('L', 'shield')],
    B([130, 'weapon', 1], [120, 'troops', 24]),
    P(x(2), a(40, 60)),
    H(300, GRS(0.25, 0.3)),
    P(a(14, 26), a(-15, 10)),
  ]),
  level({ id: 5, name: 'Storm Front', theme: 'storm', length: 440, speed: 9.8, stars: [120, 200], reward: 80, boss: { type: 'grawlstone', hp: 16000, tier: 2 } }, [
    P(a(2, 4), a(5, 9)),                        // from here the left lane is not always safe
    B([10, 'troops', 5], [8, 'weapon', 1]),
    [H(34, M5(0.2, 0, 0.18), 'L'), K('R', 8)],  // first Fizzbombs: pop one inside the pack
    P(dv(2, 260), a(6, 12)),
    [C(x(2)), Od('L', 10, 8), K('R', 8)],
    H(70, M5(0.25, 0.1, 0.15)),
    B([40, 'coins', 30], [40, 'weapon', 1]),
    [P(a(-14, 4), a(12, 22, mv(1.1, 1.6))), Xd('L', -10)],
    [H(120, M5(0.25, 0.15, 0.15)), U('R', 'rapid')],
    B([90, 'troops', 22], [90, 'drone', 1]),
    P(a(20, 30), x(2)),
    [H(230, M5(0.25, 0.2, 0.15)), O('R', 12), K('L', 10)],
    B([140, 'weapon', 1], [130, 'turret', 1]),
    P(dv(3, 400), a(40, 60)),
    [H(330, M5(0.25, 0.25, 0.15)), U('L', 'freeze')],
    P(a(-20, 10), a(18, 32)),
  ]),
  level({ id: 6, name: 'Starlight Run', theme: 'night', length: 470, speed: 10, stars: [200, 420], reward: 90, boss: { type: 'oculon', hp: 26000, tier: 2 } }, [
    P(a(-3, 12), a(5, 9)),
    B([8, 'weapon', 1], [12, 'troops', 7]),
    [H(38, M6(0.2, 0.1, 0.1, 0.06), 'L'), K('R', 8)],   // first Bulwark tanks
    P(dv(2, 220), a(6, 12)),
    [C(x(2)), Xd('R', 12), K('L', 8)],
    H(80, M6(0.2, 0.12, 0.1, 0.06)),
    B([60, 'troops', 16], [50, 'weapon', 1]),
    [P(dv(2, 700), a(14, 24)), Od('L', 12, -18)],
    [H(140, M6(0.2, 0.14, 0.12, 0.06)), U('R', 'shield')],
    B([100, 'drone', 1], [100, 'turret', 1]),
    P(x(2), a(22, 36, mv(1.2, 1.7))),
    [H(260, M6(0.2, 0.2, 0.12, 0.08)), X('L'), Xd('R', 14, mv(1.2, 1.1))],
    B([150, 'weapon', 1], [150, 'troops', 30]),
    P(a(-24, 10), a(26, 44)),
    [H(380, M6(0.2, 0.22, 0.12, 0.08)), U('L', 'freeze'), K('R', 10, 'zigzag')],
    P(dv(3, 600), a(60, 90)),
    H(440, M6(0.2, 0.25, 0.12, 0.08)),
  ]),
  level({ id: 7, name: 'High Noon Havoc', theme: 'noon', length: 500, speed: 10.2, stars: [200, 380], reward: 100, boss: { type: 'mothermurk', hp: 30000, tier: 3 } }, [
    P(a(-4, 10), a(4, 8)),
    B([12, 'troops', 8], [8, 'weapon', 1]),
    [H(44, M5(0.3, 0.1, 0.1), 'L'), K('R', 8)],
    P(a(8, 14, mv(1.2, 1.8)), dv(2, 300)),
    [C(x(2)), Od('L', 12, 8), K('R', 8)],
    H(100, M6(0.22, 0.12, 0.12, 0.06)),
    B([60, 'weapon', 1], [60, 'coins', 40]),
    [P(a(-18, 6), a(16, 28)), Xd('R', 12)],
    [H(160, M6(0.22, 0.12, 0.12, 0.06), 'L'), B(null, [100, 'troops', 26])],
    P(x(2), a(24, 40)),
    [H(230, M6(0.22, 0.14, 0.12, 0.08)), O('R', 14), K('L', 10)],
    B([150, 'drone', 1], [150, 'weapon', 1]),
    P(dv(2, 700), a(30, 50)),
    [H(340, M6(0.2, 0.22, 0.12, 0.08)), U('R', 'shield')],
    P(dv(2, 750), a(-30, 40)),
    [H(420, M6(0.2, 0.24, 0.12, 0.08)), X('L', mv(1.3, 1.2)), K('R', 8)],
    B([240, 'turret', 1], [240, 'troops', 40]),
    P(a(40, 60), x(2)),
  ]),
  level({ id: 8, name: 'Rose Dawn Raid', theme: 'dawn', length: 530, speed: 10.4, stars: [380, 700], reward: 110, boss: { type: 'ironhorn', hp: 48000, tier: 3 } }, [
    P(a(3, 6), a(6, 10)),
    B([8, 'weapon', 1], [14, 'troops', 8]),
    [H(48, M6(0.25, 0.1, 0.1, 0.05), 'R'), K('L', 8)],
    P(dv(2, 240), a(8, 14)),
    [P(a(-10, 16), a(-2, 8)), Xd('L', -10)],          // both red: shoot the one with more room
    H(110, M6(0.22, 0.12, 0.12, 0.06)),
    B([70, 'weapon', 1], [70, 'drone', 1]),
    [C(x(2)), Od('L', 14, 8), U('R', 'freeze')],
    H(180, M6(0.22, 0.14, 0.12, 0.07)),
    P(a(20, 34, mv(1.3, 1.9)), dv(2, 750)),
    B([130, 'troops', 30], [130, 'turret', 1]),
    [H(250, M6(0.22, 0.14, 0.12, 0.08), 'L'), K('R', 10)],
    P(x(2), a(28, 46)),
    [H(320, M6(0.22, 0.14, 0.12, 0.08)), X('R', mv(1.3, 1.3)), K('L', 8)],
    B([200, 'weapon', 1], [200, 'drone', 1]),
    P(a(-34, 16), x(2)),
    [H(440, M6(0.2, 0.24, 0.14, 0.08)), O('R', 14), U('L', 'shield')],
    P(x(2, 1400), a(60, 90)),
    H(520, M6(0.2, 0.26, 0.14, 0.08)),
  ]),
  level({ id: 9, name: 'Ember Bridge', theme: 'sunset', length: 560, speed: 10.6, stars: [500, 960], reward: 120, boss: { type: 'grawlstone', hp: 62000, tier: 3 } }, [
    P(a(6, 10), a(-4, 12)),
    B([14, 'troops', 8], [8, 'weapon', 1]),
    H(54, M6(0.25, 0.1, 0.12, 0.05), 'L'),
    P(dv(2, 200), a(8, 14)),
    [C(x(2)), Od('R', 14, 8), K('L', 8)],
    H(120, M6(0.22, 0.12, 0.14, 0.07)),
    B([80, 'weapon', 1], [80, 'troops', 20]),
    [P(a(18, 30), a(-14, 30, mv(1.2, 1.8))), Xd('L', 10), Xd('R', 24)],
    H(200, M6(0.22, 0.14, 0.14, 0.07)),
    P(x(2), dv(3, 500)),
    B([140, 'drone', 1], [140, 'turret', 1]),
    [H(280, M6(0.22, 0.14, 0.14, 0.08), 'R'), U('L', 'rapid')],
    P(a(40, 70), dv(2, 750)),
    [H(350, M6(0.22, 0.14, 0.14, 0.08)), O('L', 16), K('R', 10)],
    B([220, 'weapon', 1], [220, 'troops', 40]),
    P(x(2), a(-40, 20)),
    [H(460, M6(0.2, 0.24, 0.14, 0.1)), X('R', mv(1.4, 1.4)), U('L', 'freeze')],
    P(a(30, 50), dv(2, 900)),
    [H(540, M6(0.2, 0.26, 0.14, 0.1)), K('L', 10, 'zigzag'), K('R', 10, 'zigzag')],
    P(x(2, 1200), a(80, 120)),
  ]),
  level({ id: 10, name: 'Thunder Gate', theme: 'storm', length: 590, speed: 10.8, stars: [450, 900], reward: 150, boss: { type: 'tempestking', hp: 75000, tier: 4 } }, [
    P(a(-3, 12), a(5, 9)),
    B([14, 'troops', 9], [8, 'weapon', 1]),
    [H(58, M6(0.25, 0.12, 0.12, 0.06), 'L'), K('R', 8)],
    P(a(10, 16, mv(1.3, 2)), dv(2, 280)),
    [C(x(2)), Xd('L', 12, mv(1.2, 1.2)), K('R', 8)],
    H(140, M6(0.22, 0.14, 0.14, 0.07)),
    B([90, 'weapon', 1], [100, 'drone', 1]),
    [P(dv(2, 750), a(20, 34)), Od('R', 14, 16), U('L', 'shield')],
    H(220, M6(0.22, 0.14, 0.14, 0.08)),
    P(a(-24, 24), a(-6, 14)),
    B([170, 'turret', 1], [170, 'troops', 34]),
    [H(300, M6(0.22, 0.14, 0.14, 0.09), 'R'), K('L', 10)],
    P(x(2), a(34, 56)),
    [H(370, M6(0.22, 0.14, 0.14, 0.1)), X('L'), Xd('R', 14, mv(1.4, 1.5))],
    B([240, 'weapon', 1], [240, 'drone', 1]),
    [P(a(40, 64), dv(3, 800)), Od('L', 14, 16), U('R', 'rapid')],
    H(450, M6(0.22, 0.14, 0.14, 0.1)),
    P(x(2), a(-50, 20)),
    [H(560, M6(0.2, 0.26, 0.15, 0.1)), U('L', 'freeze'), K('R', 12, 'zigzag')],
    P(x(2), a(-30, 10)),
  ]),
  ...lateLevels(),
];

// Levels 11-15 share one escalating layout (hand-placed beats, numbers scaled per level, lanes mirrored on
// even ids so neighbouring levels never read the same).
function lateLevels() {
  const spec = [
    { id: 11, name: 'Twilight Siege', theme: 'dusk', length: 610, speed: 11, stars: [450, 900], reward: 160, boss: { type: 'oculon', hp: 90000, tier: 4 }, s: 1.0, extra: 0 },
    { id: 12, name: 'Moonlit March', theme: 'night', length: 630, speed: 11.2, stars: [450, 900], reward: 170, boss: { type: 'mothermurk', hp: 100000, tier: 4 }, s: 1.07, extra: 1 },
    { id: 13, name: 'Iron Noon', theme: 'noon', length: 650, speed: 11.4, stars: [450, 900], reward: 180, boss: { type: 'ironhorn', hp: 110000, tier: 5 }, s: 1.14, extra: 1 },
    { id: 14, name: 'Molten Skies', theme: 'sunset', length: 675, speed: 11.6, stars: [450, 900], reward: 190, boss: { type: 'grawlstone', hp: 120000, tier: 5 }, s: 1.21, extra: 2 },
    { id: 15, name: 'Tempest Throne', theme: 'storm', length: 700, speed: 11.8, stars: [400, 850], reward: 250, boss: { type: 'tempestking', hp: 150000, tier: 5 }, s: 1.28, extra: 2 },
  ];
  return spec.map(({ s, extra, ...def }) => level(def, lateBeats(def.id, s, extra)));
}

function lateBeats(id, s, extra) {
  const n = (v) => Math.round(v * s);
  const f = id % 2 === 0;
  const L = f ? 'R' : 'L', R = f ? 'L' : 'R';
  const p = (l, r) => (f ? P(r, l) : P(l, r));
  const b = (l, r) => (f ? B(r, l) : B(l, r));
  const beats = [
    p(a(-3, 14), a(5, 9)),
    b([n(14), 'troops', n(9)], [8, 'weapon', 1]),
    [H(n(62), M6(0.25, 0.12, 0.12, 0.07), L), K(R, 8)],
    p(dv(2, n(300)), a(n(10), n(18), mv(1.3, 2))),
    [C(x(2)), Od(L, 14, 8), Xd(R, 30, mv(1.3, 1.3))],
    H(n(150), M6(0.22, 0.14, 0.14, 0.08)),
    b([n(100), 'weapon', 1], [n(100), 'drone', 1]),
    [p(a(-n(26), n(28)), dv(2, n(750))), U(L, 'rapid'), Xd(R, -10)],
    [H(n(230), M6(0.22, 0.14, 0.14, 0.09), R), K(L, 10)],
    p(x(2), a(n(26), n(42))),
    b([n(180), 'turret', 1], [n(180), 'troops', n(36)]),
    [H(n(320), M6(0.22, 0.14, 0.14, 0.1)), O(R, 16), K(L, 10, 'zigzag')],
    [p(dv(3, n(700)), a(n(36), n(58), mv(1.4, 2.1))), Xd(L, -10, mv(1.4, 1.6)), U(R, 'shield')],
    [H(n(400), M6(0.22, 0.14, 0.15, 0.1), L), K(R, 10)],
    b([n(260), 'weapon', 1], [n(260), 'drone', 1]),
    p(a(-n(44), n(20)), x(2)),
    [H(n(460), M6(0.2, 0.24, 0.15, 0.11)), O(L, 16), Xd(R, 20)],
  ];
  for (let i = 0; i < 1 + extra; i++) {
    beats.push(p(x(2), dv(2, n(900))));
    beats.push([H(n(500 + 40 * i), M6(0.2, 0.26, 0.15, 0.12)), U(L, 'freeze'), K(R, 10, 'zigzag')]);
  }
  beats.push(b([n(320), 'weapon', 1], [n(320), 'troops', n(50)]));
  beats.push(p(a(n(60), n(90)), x(2, n(1500))));
  return beats;
}

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export const LEVEL_COUNT = 15;
/** Highest level id with data. Map nodes past it show "coming soon"; progression never unlocks past it. */
export const LAST_LEVEL = LEVELS.reduce((m, l) => Math.max(m, l.id), 0);
