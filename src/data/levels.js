// Hand-made levels 1-15 (data only). Each level is a list of beats laid out at an even spacing; a beat is one
// decision (gate row, barrel pair, horde, ...) plus optional side items (coins, power-ups, blades, gaps).
// Teaching curve: L1 plain +gates, a red gate to shoot blue, a barrel with a gun; runners from L2, shields
// from L4, bombers from L5, tanks from L6; ÷ ladders from L2, moving gates from L3, blades from L3, magnet
// from L3, gaps from L5, sliding blades from L6. Up to L4 the left lane is never a trap (a player who barely
// steers still wins); from L5 on the lanes have to be read. L11-15 each have their own idea (blade gauntlet,
// gap staircase, tank walls, ladders, finale medley). Late rows keep the squad under the 999 cap until the
// arena; the last rows of the big levels offer helpers instead of troops. Boss rotation follows the spec
// (Tempest King on 10 as a mini fight and on 15 as the finale).

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

// Horde toughness follows the gun the squad should be holding and how far into the level it is: a horde's
// hp multiplier is the relative crowd damage of the tier reached by breaking every weapon barrel before it
// (pistol = 1) times a toughness that ramps from 1 at the start (a small squad meets small hordes) to the
// level's `tough` at the arena (the squad has snowballed by then). Miss a gun barrel and the hordes after it
// feel tougher; buy damage / fire rate / a better starting gun and they melt faster. Anything spawned
// without its own multiplier (boss broods) uses def.enemyHp = BROOD x the arena toughness.
export const TIER_CROWD = [1, 2.05, 3.2, 6.1, 9.3, 9.8];
export const TIER_EXP = 0.7, RAMP_EXP = 1.5, BROOD = 0.35;
export const toughFor = (tough, tier) => Math.round(tough * Math.pow(TIER_CROWD[Math.min(6, tier) - 1], TIER_EXP) * 100) / 100;

function toughen(def, events) {
  const tough = def.tough ?? 1;
  let tier = 1;
  for (const e of events.slice().sort((a, b) => a.at - b.at)) {
    if (e.type === 'barrel' && e.reward.kind === 'weapon') tier = Math.min(6, tier + (e.reward.amount || 1));
    else if (e.type === 'horde' && (e.hpMul == null || e.autoHp)) {
      const p = Math.max(0, Math.min(1, e.at / def.length));
      e.hpMul = toughFor(1 + (tough - 1) * Math.pow(p, RAMP_EXP), tier) * (e.tough ?? 1);
      e.autoHp = true;
    }
  }
  return Math.round(Math.max(1, BROOD * toughFor(tough, tier)) * 100) / 100;
}

/** Re-derives the horde toughness of a level def after its `tough` changed (balance tests). */
export function retough(def) { def.enemyHp = toughen(def, def.events); return def; }

/** Spreads the beats evenly between START and `length - ARENA` (the boss arena opens at `length`). */
function level(def, beats) {
  const step = (def.length - ARENA - START) / Math.max(1, beats.length - 1);
  const events = [];
  beats.forEach((beat, i) => {
    const at = Math.round(START + i * step);
    for (const fn of [].concat(beat)) for (const e of fn(at)) if (e) events.push(e);
  });
  const enemyHp = toughen(def, events);
  return { ...def, enemyHp, events };
}

// enemy mixes. A Fizzbomb blast (r 2.2) wipes ~25 packed Murklings whatever their hp, so above ~5% bombers
// one pop chains through a whole horde; the share written in the mixes below is scaled by BOMB so a pop
// cracks a horde open (a reward for aiming) instead of erasing it.
const BOMB = 0.4;
const G = { grunt: 1 };
const GR = (r = 0.25) => ({ grunt: 1 - r, runner: r });
const GRS = (r = 0.2, s = 0.15) => ({ grunt: 1 - r - s, runner: r, shield: s });
const M5 = (r = 0.2, s = 0.14, b = 0.12) => ({ grunt: 1 - r - s - b * BOMB, runner: r, shield: s, bomber: b * BOMB });
const M6 = (r = 0.2, s = 0.14, b = 0.12, t = 0.07) => ({ grunt: 1 - r - s - b * BOMB - t, runner: r, shield: s, bomber: b * BOMB, tank: t });

// tank walls (L13+): Bulwarks packed with Fizzbombs - pop a bomber inside and the wall cracks open
const TW = (t = 0.25, b = 0.22) => ({ grunt: 1 - t - b * BOMB - 0.1, runner: 0.1, tank: t, bomber: b * BOMB });

// Per level: `tough` (horde toughness at the arena, see toughen) and the boss hp are calibrated with the
// autopilot skill profiles (debug.setAutopilot('pro' | 'casual' | 'novice')) against that level's own gate
// economy, which is why they don't rise smoothly: ladder-heavy L14 snowballs far more than gap-heavy L13.
// Targets: 'pro' clears every level first try (2-3 stars, 2 on L13-15), 'casual' with the upgrades it can
// afford clears L1-8 in 1-2 tries and needs some retries on L9-15, 'novice' clears L1-4; casual boss
// fights last ~12-25 s (L1 is a short tutorial fight). Stars: 2 at about a typical casual finish, 3 at a
// strong one.
export const LEVELS = [
  level({ id: 1, name: 'Cloud Cadets', theme: 'noon', length: 320, speed: 9, stars: [45, 95], reward: 40, tough: 1.5, boss: { type: 'grawlstone', hp: 4500, tier: 1 } }, [
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
  level({ id: 2, name: 'Dawn Patrol', theme: 'dawn', length: 350, speed: 9.2, stars: [90, 280], reward: 50, tough: 3, boss: { type: 'oculon', hp: 18000, tier: 1 } }, [
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
    P(a(30, 60), a(-20, 30)),
    H(100, GR(0.3)),
    P(x(2), a(120, 200)),                        // the last call: double up, or shoot the big add gate full
  ]),
  level({ id: 3, name: 'Sunset Rally', theme: 'sunset', length: 380, speed: 9.4, stars: [300, 470], reward: 60, tough: 4, boss: { type: 'mothermurk', hp: 78000, tier: 2 } }, [
    P(a(4, 8), a(3, 7)),
    B([8, 'weapon', 1], [10, 'troops', 5]),
    [H(22, GR(0.3)), K('R', 6)],
    P(a(7, 12, mv(1.0, 1.4)), a(-4, 10)),
    [C(x(2)), Xd('R', 12), K('L', 8)],
    [H(50, GR(0.3)), U('L', 'magnet'), K('R', 10, 'zigzag')],   // first magnet: it pulls the far lane's coins
    B([36, 'weapon', 1], [40, 'drone', 1]),
    P(x(2, 800), a(10, 20)),                    // ×2 that climbs vs a fat add gate
    [H(90, GR(0.35)), U('R', 'rapid')],
    B([70, 'troops', 16], [70, 'turret', 1]),
    [P(a(30, 60), a(-20, 40)), K('R', 8)],
    H(150, GR(0.35)),
    [B([110, 'weapon', 1], [100, 'troops', 20]), Xd('R', 12)],
    P(x(2), a(150, 260)),
  ]),
  level({ id: 4, name: 'Violet Stampede', theme: 'dusk', length: 410, speed: 9.6, stars: [480, 690], reward: 70, tough: 5, boss: { type: 'ironhorn', hp: 60000, tier: 2 } }, [
    P(a(5, 9), a(2, 6)),
    B([8, 'weapon', 1], [10, 'troops', 6]),
    [H(26, GRS(0.2, 0.1)), K('R', 6)],
    P(a(-6, 12), a(4, 7)),
    [P(x(2), dv(2)), U('R', 'freeze'), K('L', 8)], // the token sits on the ÷ side: not worth it
    H(56, GRS(0.25, 0.15)),                     // first Shieldbearers
    B([40, 'weapon', 1], [44, 'drone', 1]),
    [P(a(24, 40, mv(1.1, 1.5)), dv(2, 600)), Xd('R', -10)],
    H(100, GRS(0.25, 0.15)),
    B([80, 'troops', 20], [80, 'turret', 1]),
    P(x(2), a(18, 30)),
    [H(200, GRS(0.25, 0.25)), U('L', 'shield')],
    B([130, 'weapon', 1], [120, 'troops', 24]),
    P(a(60, 120), a(-30, 40)),
    H(300, GRS(0.25, 0.3)),
    P(x(2), a(180, 300, mv(1.1, 1.4))),
  ]),
  level({ id: 5, name: 'Storm Front', theme: 'storm', length: 440, speed: 9.8, stars: [70, 165], reward: 80, tough: 2.5, boss: { type: 'grawlstone', hp: 26000, tier: 2 } }, [
    P(a(2, 4), a(5, 9)),                        // from here the left lane is not always safe
    B([10, 'troops', 5], [8, 'weapon', 1]),
    [H(34, M5(0.2, 0, 0.18), 'L'), K('R', 8)],  // first Fizzbombs: pop one inside the pack
    P(dv(2, 260), a(6, 12)),
    [C(x(2)), Od('L', 10, 8), K('R', 8)],       // first gap
    H(70, M5(0.25, 0.1, 0.15)),
    B([40, 'coins', 30], [40, 'weapon', 1]),
    [P(a(-14, 4), a(12, 22, mv(1.1, 1.6))), Xd('L', -10)],
    [H(120, M5(0.25, 0.15, 0.15)), U('R', 'rapid')],
    B([90, 'troops', 22], [90, 'drone', 1]),
    P(a(20, 30), x(2)),
    [H(180, M5(0.25, 0.2, 0.15)), K('L', 10)],
    B([140, 'weapon', 1], [130, 'turret', 1]),
    [P(dv(3, 400), a(40, 60)), Od('R', 12, 10)], // second gap, on its own past the gate row
    [H(330, M5(0.25, 0.25, 0.15)), U('L', 'freeze')],
    P(a(-20, 10), a(18, 32)),
  ]),
  level({ id: 6, name: 'Starlight Run', theme: 'night', length: 470, speed: 10, stars: [45, 140], reward: 90, tough: 5, boss: { type: 'oculon', hp: 42000, tier: 2 } }, [
    P(a(-3, 12), a(5, 9)),
    B([8, 'weapon', 1], [12, 'troops', 7]),
    [H(38, M6(0.2, 0.1, 0.1, 0.06), 'L'), K('R', 8)],   // first Bulwark tanks
    P(dv(2, 220), a(6, 12)),
    [C(x(2)), Xd('R', 12, mv(1.0, 0.9)), K('L', 8)],    // first sliding blade, on its own
    H(80, M6(0.2, 0.12, 0.1, 0.06)),
    B([60, 'troops', 16], [50, 'weapon', 1]),
    [P(dv(2, 700), a(14, 24)), Od('L', 12, -18)],
    [H(140, M6(0.2, 0.14, 0.12, 0.06)), U('R', 'shield')],
    B([100, 'drone', 1], [100, 'turret', 1]),
    P(x(2), a(22, 36, mv(1.2, 1.7))),
    [H(260, M6(0.2, 0.2, 0.12, 0.08)), Xd('R', 14, mv(1.2, 1.1))],
    B([150, 'weapon', 1], [150, 'troops', 30]),
    P(a(-24, 10), a(26, 44)),
    [H(380, M6(0.2, 0.22, 0.12, 0.08)), U('L', 'freeze'), K('R', 10, 'zigzag')],
    P(dv(3, 600), a(60, 90)),
    H(440, M6(0.2, 0.25, 0.12, 0.08)),
  ]),
  level({ id: 7, name: 'High Noon Havoc', theme: 'noon', length: 500, speed: 10.2, stars: [250, 520], reward: 100, tough: 4, boss: { type: 'mothermurk', hp: 85000, tier: 3 } }, [
    P(a(-4, 10), a(4, 8)),
    B([12, 'troops', 8], [8, 'weapon', 1]),
    [H(44, M5(0.3, 0.1, 0.1), 'L'), K('R', 8)],
    P(a(8, 14, mv(1.2, 1.8)), dv(2, 300)),
    [P(a(10, 16), x(2)), Od('L', 12, 8), K('R', 8)],
    H(100, M6(0.22, 0.12, 0.12, 0.06)),
    B([60, 'weapon', 1], [60, 'coins', 40]),
    [P(a(-18, 6), a(16, 28)), Xd('R', 12)],
    [H(160, M6(0.22, 0.12, 0.12, 0.06), 'L'), B(null, [100, 'troops', 26])],
    P(x(2), a(24, 40)),
    [H(230, M6(0.22, 0.14, 0.12, 0.08)), O('R', 14), U('L', 'magnet')],
    B([150, 'drone', 1], [150, 'weapon', 1]),
    P(dv(2, 700), a(30, 50)),
    [H(340, M6(0.2, 0.22, 0.12, 0.08)), U('R', 'shield')],
    P(dv(2, 750), a(-30, 40)),
    [H(420, M6(0.2, 0.24, 0.12, 0.08)), X('L', mv(1.3, 1.2)), K('R', 8)],
    B([240, 'turret', 1], [240, 'troops', 40]),
    P(a(40, 60), x(2)),
  ]),
  level({ id: 8, name: 'Rose Dawn Raid', theme: 'dawn', length: 530, speed: 10.4, stars: [400, 600], reward: 110, tough: 6, boss: { type: 'ironhorn', hp: 80000, tier: 3 } }, [
    P(a(3, 6), a(6, 10)),
    B([8, 'weapon', 1], [14, 'troops', 8]),
    [H(30, M5(0.25, 0.1, 0.1), 'R'), K('L', 8)],
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
    P(a(-34, 16), a(60, 120)),
    [H(440, M6(0.2, 0.24, 0.14, 0.08)), Od('R', 10, 6), U('L', 'shield')],
    P(x(2, 1400), a(60, 90)),
    H(520, M6(0.2, 0.26, 0.14, 0.08)),
  ]),
  level({ id: 9, name: 'Ember Bridge', theme: 'sunset', length: 560, speed: 10.6, stars: [75, 230], reward: 120, tough: 8, boss: { type: 'grawlstone', hp: 85000, tier: 3 } }, [
    P(a(6, 10), a(-4, 12)),
    B([14, 'troops', 8], [8, 'weapon', 1]),
    H(40, M5(0.25, 0.1, 0.12), 'L'),
    P(dv(2, 200), a(8, 14)),
    [P(x(2), a(10, 20)), Od('R', 14, 8), K('L', 8)],
    H(120, M6(0.22, 0.12, 0.14, 0.07)),
    B([80, 'weapon', 1], [70, 'coins', 30]),
    [P(a(18, 30), a(-14, 30, mv(1.2, 1.8))), Xd('L', 10), Xd('R', 24)],
    H(200, M6(0.22, 0.14, 0.14, 0.07)),
    P(x(2), dv(3, 500)),
    B([140, 'drone', 1], [140, 'turret', 1]),
    [H(280, M6(0.22, 0.14, 0.14, 0.08), 'R'), U('L', 'rapid')],
    P(a(40, 70), dv(2, 750)),
    [H(350, M6(0.22, 0.14, 0.14, 0.08)), Od('R', 10, 6), K('L', 10)],
    B([160, 'weapon', 1], [200, 'troops', 40]),
    P(a(70, 130), a(-40, 20)),
    [H(460, M6(0.2, 0.24, 0.14, 0.1)), X('R', mv(1.4, 1.4)), U('L', 'freeze')],
    P(a(30, 50), dv(2, 900)),
    [H(540, M6(0.2, 0.26, 0.14, 0.1)), U('L', 'magnet'), K('R', 12, 'zigzag')],
    P(x(2, 1200), a(80, 120)),
  ]),
  level({ id: 10, name: 'Thunder Gate', theme: 'storm', length: 590, speed: 10.8, stars: [380, 600], reward: 150, tough: 6, boss: { type: 'tempestking', hp: 110000, tier: 4 } }, [
    P(a(-3, 12), a(5, 9)),
    B([14, 'troops', 9], [8, 'weapon', 1]),
    [H(34, M5(0.25, 0.12, 0.12), 'L'), K('R', 8)],
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
    [H(370, M6(0.22, 0.14, 0.14, 0.1)), Xd('R', 14, mv(1.4, 1.5))],
    B([240, 'weapon', 1], [240, 'drone', 1]),
    [P(a(40, 64), dv(3, 800)), Xd('L', 16), U('R', 'rapid')],
    H(450, M6(0.22, 0.14, 0.14, 0.1)),
    P(x(2), a(-50, 20)),
    [H(560, M6(0.2, 0.26, 0.15, 0.1)), U('L', 'freeze'), K('R', 12, 'zigzag')],
    B([320, 'turret', 1], [300, 'drone', 1]),  // at this size troops are not the prize: helpers are
  ]),
  // L11: sliding-blade gauntlet. Opens on one centre gate; blades follow every gate row.
  level({ id: 11, name: 'Twilight Siege', theme: 'dusk', length: 610, speed: 11, stars: [200, 450], reward: 160, tough: 32, boss: { type: 'oculon', hp: 140000, tier: 4 } }, [
    [C(a(3, 10)), K('R', 6)],
    [B([10, 'weapon', 1], [10, 'troops', 7]), Xd('L', 14, mv(0.9, 0.9))],
    [H(26, GR(0.25), 'R'), K('L', 8)],
    [P(dv(2, 240), a(8, 16)), Xd('R', 14, mv(1.1, 1.1))],
    [B([40, 'troops', 14], [36, 'weapon', 1]), Xd('L', 14, mv(1.2, 1.2))],
    H(80, M5(0.25, 0.12, 0.12)),
    [C(x(2)), Xd('R', 12, mv(1.3, 1.3)), Xd('L', 26, mv(1.3, 1.3))],
    B([90, 'drone', 1], [90, 'weapon', 1]),
    [H(160, M6(0.22, 0.14, 0.12, 0.06)), U('R', 'shield')],
    [P(a(30, 50, mv(1.3, 1.8)), x(2)), Xd('L', 14, mv(1.4, 1.6))],
    [H(240, M6(0.22, 0.14, 0.14, 0.08), 'L'), K('R', 10)],
    B([170, 'turret', 1], [170, 'troops', 40]),
    [P(dv(2, 600), a(60, 100)), Xd('R', 12, mv(1.4, 1.5))],
    [H(320, M6(0.22, 0.16, 0.14, 0.08)), U('L', 'rapid')],
    [B([240, 'weapon', 1], [220, 'drone', 1]), Xd('R', 14, mv(1.5, 1.6))],
    [P(x(2), a(250, 400)), Xd('L', 12, mv(1.5, 1.7)), Xd('R', 26, mv(1.5, 1.7))],
    [H(420, M6(0.2, 0.24, 0.14, 0.1)), K('R', 10, 'zigzag')],
    [P(a(60, 140), a(-80, 120)), Xd('R', 12, mv(1.5, 1.8))],
    [H(480, M6(0.2, 0.26, 0.15, 0.1)), U('L', 'freeze')],
    B([320, 'drone', 1], [300, 'turret', 1]),
  ]),
  // L12: gap staircase. ×3 on one troop is the trap of the opening row; the holes alternate lanes early on,
  // while the squad is still small enough to fit beside them.
  level({ id: 12, name: 'Moonlit March', theme: 'night', length: 630, speed: 11.2, stars: [350, 620], reward: 170, tough: 40, boss: { type: 'mothermurk', hp: 160000, tier: 4 } }, [
    P(a(3, 8), x(3)),
    B([10, 'troops', 8], [10, 'weapon', 1]),
    P(dv(2, 220), a(8, 14)),
    [K('R', 8), Od('L', 10, -4), Od('R', 10, 16)],
    [H(30, GR(0.25), 'R'), K('L', 8)],
    [K('L', 8), Od('R', 10, -4), Od('L', 10, 16)],
    [C(x(2)), Od('R', 10, 14)],
    H(90, M5(0.25, 0.12, 0.12)),
    B([80, 'weapon', 1], [80, 'drone', 1]),
    [P(a(-20, 40), a(20, 30)), Od('R', 10, 12)],
    [H(170, M6(0.22, 0.14, 0.12, 0.07), 'R'), U('L', 'magnet'), K('R', 10, 'zigzag')],
    P(x(2), a(40, 70)),
    B([170, 'turret', 1], [160, 'troops', 40]),
    [H(260, M6(0.22, 0.14, 0.14, 0.08)), U('L', 'shield')],
    [P(dv(2, 600), a(60, 110)), Xd('R', 12, mv(1.3, 1.4))],
    [H(330, M6(0.22, 0.16, 0.14, 0.09), 'R'), K('L', 10)],
    B([240, 'weapon', 1], [240, 'drone', 1]),
    P(x(2), a(220, 360)),
    [H(430, M6(0.2, 0.24, 0.15, 0.1)), U('R', 'rapid')],
    [P(a(-80, 120), a(60, 140)), Xd('L', 12, mv(1.4, 1.6))],
    [H(500, M6(0.2, 0.26, 0.15, 0.1)), U('L', 'freeze')],
    B([320, 'turret', 1], [320, 'shield']),
  ]),
  // L13: tank walls. Opens on a barrel row; Bulwarks come packed with Fizzbombs that crack the wall open.
  level({ id: 13, name: 'Iron Noon', theme: 'noon', length: 650, speed: 11.4, stars: [110, 540], reward: 180, tough: 40, boss: { type: 'ironhorn', hp: 68000, tier: 5 } }, [
    B([3, 'troops', 6], [3, 'weapon', 1]),
    P(a(4, 10), a(-2, 12)),
    [H(30, GR(0.25), 'L'), K('R', 8)],
    [P(dv(2, 240), a(8, 14)), Od('R', 10, 12)],
    B([40, 'weapon', 1], [36, 'coins', 20]),
    H(70, TW(0.12, 0.2)),
    [C(x(2)), K('L', 8), K('R', 8)],
    B([90, 'weapon', 1], [80, 'coins', 30]),
    [H(140, TW(0.2, 0.22)), U('R', 'shield')],
    P(x(2), a(30, 50, mv(1.3, 1.8))),
    [H(200, TW(0.24, 0.22), 'R'), K('L', 10)],
    B([170, 'turret', 1], [170, 'troops', 40]),
    [P(dv(3, 260), a(60, 100)), Xd('L', 14, mv(1.3, 1.4))],
    [H(280, TW(0.28, 0.22)), U('L', 'rapid')],
    B([240, 'weapon', 1], [240, 'drone', 1]),
    P(x(2), a(220, 360)),
    [H(380, TW(0.3, 0.22)), K('R', 10, 'zigzag')],
    [P(a(60, 140), a(-80, 120)), Xd('R', 12, mv(1.4, 1.5))],
    [H(440, TW(0.32, 0.24)), U('R', 'freeze')],
    B([320, 'turret', 1], [300, 'drone', 1]),
  ]),
  // L14: ladders. Climbing gates while the squad is small, ÷ gambles against fat add gates once it is big.
  level({ id: 14, name: 'Molten Skies', theme: 'sunset', length: 675, speed: 11.6, stars: [500, 790], reward: 190, tough: 100, boss: { type: 'grawlstone', hp: 260000, tier: 5 } }, [
    P(a(5, 9), a(3, 6)),
    P(x(2, 30), a(6, 12)),                        // shoot the ×2 up the rungs
    [H(36, GR(0.25), 'R'), K('L', 8)],
    B([36, 'weapon', 1], [30, 'troops', 12]),
    [P(dv(3, 150), a(14, 24)), Xd('L', 14)],      // ÷3 climbs fast while you are small
    H(90, M5(0.25, 0.12, 0.12)),
    C(x(2, 450)),                                 // centre ladder: ×2 that keeps climbing
    B([100, 'weapon', 1], [100, 'drone', 1]),
    [H(180, M6(0.22, 0.14, 0.12, 0.07), 'L'), U('R', 'rapid')],
    P(a(40, 80), dv(2, 600)),
    [H(260, M6(0.22, 0.14, 0.14, 0.08)), K('L', 10), K('R', 10)],
    B([180, 'turret', 1], [170, 'troops', 40]),
    [P(dv(3, 350), a(80, 140)), Xd('L', 14, mv(1.3, 1.4))],
    [H(330, M6(0.22, 0.16, 0.14, 0.09), 'R'), U('L', 'shield')],
    B([240, 'weapon', 1], [240, 'drone', 1]),
    P(dv(2, 700), a(150, 240)),                   // ÷2 -> ×2 takes 700 hits: a gamble
    [H(420, M6(0.2, 0.24, 0.15, 0.1)), K('R', 10, 'zigzag')],
    P(a(100, 180, mv(1.3, 1.6)), a(-60, 120)),
    [H(480, M6(0.2, 0.26, 0.15, 0.1)), U('L', 'freeze')],
    B([320, 'turret', 1], [320, 'drone', 1]),
  ]),
  // L15: the finale medley - staircase holes, sliding blades, tank walls, ladders, then the Tempest King.
  level({ id: 15, name: 'Tempest Throne', theme: 'storm', length: 700, speed: 11.8, stars: [290, 450], reward: 250, tough: 45, boss: { type: 'tempestking', hp: 240000, tier: 5 } }, [
    [C(a(2, 12)), K('L', 6)],
    B([10, 'weapon', 1], [10, 'troops', 8]),
    [H(28, GR(0.25), 'L'), K('R', 8)],
    [P(x(2, 40), a(8, 14)), Od('R', 10, 14)],
    [B([40, 'troops', 14], [36, 'weapon', 1]), Xd('L', 14, mv(1.1, 1.0))],
    H(80, M5(0.25, 0.12, 0.14)),
    [K('R', 8), Od('L', 10, -4), Od('R', 10, 16)],
    C(x(2)),
    B([90, 'weapon', 1], [90, 'drone', 1]),
    [H(170, TW(0.18, 0.22)), U('R', 'shield')],
    [P(a(30, 50, mv(1.3, 1.8)), dv(2, 550)), Xd('R', 14, mv(1.3, 1.4))],
    [H(240, M6(0.22, 0.14, 0.14, 0.08), 'R'), U('L', 'magnet'), K('R', 10, 'zigzag')],
    B([180, 'turret', 1], [170, 'troops', 40]),
    [P(x(2), a(60, 100)), Xd('L', 12, mv(1.4, 1.6)), Xd('R', 26, mv(1.4, 1.6))],
    [H(330, TW(0.25, 0.22)), U('L', 'rapid')],
    B([250, 'weapon', 1], [250, 'drone', 1]),
    [P(dv(2, 600), a(150, 260)), Xd('L', 14, mv(1.5, 1.6))],
    [H(420, M6(0.2, 0.24, 0.15, 0.1)), K('R', 10)],
    P(a(100, 200, mv(1.3, 1.7)), a(-40, 160)),
    [H(500, M6(0.2, 0.26, 0.15, 0.12)), U('R', 'freeze')],
    [P(a(60, 140), a(-80, 120)), Xd('L', 12, mv(1.5, 1.8))],
    B([340, 'turret', 1], [340, 'shield']),
  ]),
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export const LEVEL_COUNT = 15;
/** Highest level id with data. Map nodes past it show "coming soon"; progression never unlocks past it. */
export const LAST_LEVEL = LEVELS.reduce((m, l) => Math.max(m, l.id), 0);
