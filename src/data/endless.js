// Endless mode (data + seeded generator). The bridge is cut into zones of BOSS_EVERY units; each zone is
// filled with patterns (gate rows, ladders, hordes, barrel choices, hazards, pickups) whose numbers ramp with
// the distance, and ends in a boss arena. Uses its own seeded Rng, so the same seed builds the same bridge.
import { Rng } from '../core/rng.js';
import { THEME_ORDER } from './themes.js';
import { gate, barrel, horde, blade, gap, powerup, coins, toughFor } from './levels.js';

export const ENDLESS = {
  bossEvery: 700,     // a boss guards every 700 u
  startClear: 30,     // empty road at the start
  preBoss: 55,        // empty road before an arena
  postBoss: 34,       // empty road after a boss kill
  speed0: 9.2, speedPerZone: 0.45, speedMax: 11.6,
  // horde toughness: hp multiplier = toughFor(1 + toughK * (d / 700)^toughExp, tier the squad has probably
  // reached by d) - the same scale as the levels (data/levels.js), so later zones feel like L10-15 and beyond
  toughK: 90, toughExp: 1.5, tierEvery: 220,
  // expected squad of a good run at d: E = min(eMax, 1 + eScale * (d / 700)^eExp) (gates, hordes, barrels)
  eScale: 160, eExp: 1.6, eMax: 600,
  gunUntil: 1400, gunWeight: 2.2,  // guaranteed gun every third barrel row before gunUntil; gun weight early
  ladderLate: 1,                   // weight of x2 ladder rows past 600 u (doubling is what fills the cap)
  hordeFrac: 0.4,                  // horde headcount = hordeFrac * E (fewer, tougher Murklings = less to draw)
  hordeEarly: 2.5,                 // extra headcount before the first arena: zone 1 hordes now cost a casual
                                   // squad ~10-30 raiders instead of ~3 (no threat for the first 75 s before)
  hordeLate: 0.1,                  // horde headcount growth per 700 u past 1400 u (toughness does the rest)
  // boss hp per arena, then x bossGrowth each. The first arena is a skill check most fresh casual
  // runs pass (at 120000 none did, so every such run scored the same 698 m); the second is the real wall.
  // The Tempest King (5th) hits a capped squad hardest, so it needs less hp.
  bossHp: [35000, 450000, 500000, 500000, 300000], bossGrowth: 1.35, bossMax: 4000000,
};

export const ENDLESS_BOSSES = ['grawlstone', 'oculon', 'mothermurk', 'ironhorn', 'tempestking'];

/**
 * Boss config of arena n (1-based): rotates through the roster. HP grows with the arena; later arenas also
 * get meaner through tier = faster cadence, shorter warnings and bigger broods.
 */
export function endlessBoss(n) {
  const type = ENDLESS_BOSSES[(n - 1) % ENDLESS_BOSSES.length];
  const T = ENDLESS.bossHp, last = T[T.length - 1];
  const raw = n <= T.length ? T[n - 1] : last * Math.pow(ENDLESS.bossGrowth, n - T.length);
  const hp = Math.min(ENDLESS.bossMax, Math.round(raw / 500) * 500);
  return { type, hp, tier: Math.min(7, n) };
}

/** Horde hp multiplier at distance d. */
export function endlessTough(d) {
  const tier = Math.min(5, 1 + Math.floor(d / ENDLESS.tierEvery)); // Mk V is the top (update 2)
  return toughFor(1 + ENDLESS.toughK * Math.pow(d / ENDLESS.bossEvery, ENDLESS.toughExp), tier);
}

/** Reward after beating arena n. */
export function endlessReward(n) {
  return { coins: 40 + 30 * n, troops: 6 + 4 * n, drone: n <= 4 ? 1 : 0 };
}

export function endlessSpeed(zone) { return Math.round(Math.min(ENDLESS.speedMax, ENDLESS.speed0 + ENDLESS.speedPerZone * (zone - 1)) * 100) / 100; }
export function endlessTheme(zone) { return THEME_ORDER[(zone - 1) % THEME_ORDER.length]; }

/** Level-like def the run starts from (the controller extends length/boss/events zone by zone). */
export function endlessDef() {
  return { id: 0, name: 'Endless', theme: endlessTheme(1), length: ENDLESS.bossEvery, speed: endlessSpeed(1), stars: [0, 0], reward: 0, boss: endlessBoss(1), events: [] };
}

const other = (lane) => (lane === 'L' ? 'R' : 'L');

export class EndlessGen {
  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.last = '';
    this.barrelRows = 0;
  }

  /**
   * Difficulty knobs at distance d (u), from the squad a good run has there (E: ~23 at 200 u, ~160 at the
   * first boss, the 600 ceiling by ~2400 u; x2 rows still let a sharp run reach the 999 cap) and the weapon
   * tier it has probably reached.
   */
  knobs(d) {
    const E = Math.min(ENDLESS.eMax, 1 + ENDLESS.eScale * Math.pow(d / 700, ENDLESS.eExp));
    const dpm = d < 150 ? 2.2 : d < 350 ? 4.5 : d < 700 ? 7 : d < 1200 ? 13.5 : 20;
    const late = Math.max(0, (d - 1400) / 700);          // past the cap: numbers keep climbing slowly
    return {
      E,
      add: Math.max(4, Math.round(0.45 * E)),            // good add gate max
      horde: Math.min(900, Math.round(Math.max(10, ENDLESS.hordeFrac * E * (d < ENDLESS.bossEvery ? ENDLESS.hordeEarly : 1)) * (1 + ENDLESS.hordeLate * late))),
      barrel: Math.max(8, Math.round(E * dpm * 0.6 * (1 + 0.3 * late))),
      troops: Math.max(4, Math.round(0.25 * E)),
      hits: Math.round(450 + 0.12 * d),                  // ladder hits per rung
      shields: Math.min(0.35, 0.12 + late * 0.08),
      tanks: Math.min(0.25, 0.08 + late * 0.05),
    };
  }

  /** Enemy mix unlocked by distance: runners 150+, shields 400+, bombers 600+, tanks 900+. */
  mix(d, K) {
    const r = this.rng;
    const m = { grunt: 1 };
    if (d > 150) m.runner = r.range(0.15, 0.3);
    if (d > 400) m.shield = r.range(0.6, 1.2) * K.shields;
    if (d > 600) m.bomber = r.range(0.03, 0.07);  // more and one pop chains through the whole horde
    if (d > 900) m.tank = r.range(0.6, 1.2) * K.tanks;
    return m;
  }

  /** Sorted events covering [from, to). */
  fill(from, to) {
    const out = [];
    let at = from;
    let i = 0;
    while (at < to - 12) {
      at += this.place(this.pickKind(at, i++), Math.round(at), out);
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /** Rhythm: grow (gate row) -> reward (barrels / bonus) -> threat (horde / hazard), repeated. */
  pickKind(d, i) {
    const r = this.rng;
    const slot = i % 3;
    if (i === 0) return 'intro';
    let kind;
    if (slot === 0) kind = weighted(r, [['gates', 3], ['shootRed', d > 60 ? 2 : 0], ['ladder', d > 90 ? (d < 600 ? 3.5 : ENDLESS.ladderLate) : 0], ['ladderC', d > 120 ? (d < 600 ? 1.4 : ENDLESS.ladderLate * 0.3) : 0], ['movingGates', d > 400 ? 1.4 : 0], ['toll', d > 1100 ? 1 + d / 1400 : 0]]);
    else if (slot === 1) kind = weighted(r, [['barrels', 4], ['bonus', d > 100 ? 1 : 0]]);
    // past ~900 u the squad sits near the cap: threats that cost troops whatever the count (hazards, and
    // gauntlets = a horde with a blade or gap in the same stretch) take a growing share
    else kind = weighted(r, [['horde', 5], ['hordeSide', d > 200 ? 2.5 : 0], ['hazard', d > 300 ? 2 + d / 700 : 0], ['gauntlet', d > 900 ? 1.5 + d / 1400 : 0]]);
    if (kind === this.last && kind !== 'horde' && kind !== 'barrels') kind = slot === 0 ? 'gates' : slot === 1 ? 'barrels' : 'horde';
    this.last = kind;
    return kind;
  }

  /** Writes one pattern at `at`; returns the road length it uses. */
  place(kind, at, out) {
    const r = this.rng;
    const K = this.knobs(at);
    const side = r.chance(0.5) ? 'L' : 'R';
    const o = other(side);
    const j = (v) => Math.max(1, Math.round(v * r.range(0.85, 1.15)));
    const step = r.range(27, 33);
    switch (kind) {
      case 'intro': // a friendly first row: both gates help, one more than the other
        out.push(gate(at, side, 'add', { value: 4, max: 7 }), gate(at, o, 'add', { value: 2, max: 4 }));
        return step;
      case 'gates': {
        const max = j(K.add);
        out.push(gate(at, side, 'add', { value: Math.max(1, Math.round(max * 0.6)), max }));
        const t = r.next();
        if (t < 0.4) out.push(gate(at, o, 'add', { value: -j(K.add * 0.6), max: -1 }));             // stays red
        else if (t < 0.65 && at > 150) out.push(gate(at, o, 'div', { rung: 2, hitsPerStep: 99999 })); // plain ÷2
        else out.push(gate(at, o, 'add', { value: Math.max(1, Math.round(max * 0.25)), max: Math.max(2, Math.round(max * 0.45)) }));
        return step;
      }
      case 'toll': {
        // both red (the squad is near the cap, growth is worth little): shoot the −N down, or gamble on
        // climbing the ÷2 to ×2 before you reach it
        out.push(gate(at, side, 'add', { value: -j(0.24 * K.E), max: -Math.round(0.05 * K.E) }));
        out.push(gate(at, o, 'div', { rung: 2, hitsPerStep: j(K.hits * 1.4) }));
        return step;
      }
      case 'shootRed': {
        // the red gate ends higher than the blue one if you keep shooting it
        const max = j(K.add * 1.3);
        out.push(gate(at, side, 'add', { value: -j(K.add * 0.4), max }));
        out.push(gate(at, o, 'add', { value: j(K.add * 0.5), max: j(K.add * 0.65) }));
        return step;
      }
      case 'movingGates': {
        const max = j(K.add * 1.2);
        out.push(gate(at, side, 'add', { value: Math.round(max * 0.6), max, moving: { range: 1.1, speed: r.range(1.3, 1.9) } }));
        out.push(gate(at, o, 'add', { value: -j(K.add * 0.6), max: -1 }));
        return step;
      }
      case 'ladder':
        if (r.chance(0.5)) {
          out.push(gate(at, side, 'mul', { rung: 3, hitsPerStep: 99999 }));      // a plain ×2 ...
          out.push(gate(at, o, 'add', { value: j(K.E * 0.5), max: j(K.E * 0.8) })); // ... or a fat add gate
        } else {
          out.push(gate(at, side, 'div', { rung: 2, hitsPerStep: j(K.hits) }));  // ÷2 that climbs to ×2+
          out.push(gate(at, o, 'add', { value: j(K.E * 0.3), max: j(K.E * 0.55) }));
        }
        return step;
      case 'ladderC':
        out.push(gate(at, 'C', 'mul', { rung: 3, hitsPerStep: j(K.hits * 1.6) }));
        return step;
      case 'barrels': {
        const early = at < 900, capped = at > 1400; // troops are worth nothing at the cap: helpers / powers
        const rewards = [['weapon', early ? ENDLESS.gunWeight : ENDLESS.gunWeight * 0.5], ['troops', capped ? 0 : 3], ['drone', capped ? 2.4 : 1.3], ['turret', at > 300 ? (capped ? 2 : 1) : 0], ['coins', 1], ['shield', capped ? 1.2 : 0.5], ['rapid', capped ? 1.2 : 0.5], ['freeze', capped ? 0.8 : 0]];
        // every third barrel row before gunUntil offers a gun, so the weapon curve can't stall on bad luck
        // (without racing to the top tier before the first arena either)
        const a = this.barrelRows++ % 3 === 0 && at < ENDLESS.gunUntil ? 'weapon' : weighted(r, rewards);
        let b = weighted(r, rewards);
        if (b === a) b = a === 'troops' || capped ? 'coins' : 'troops';
        const amt = (kd) => (kd === 'troops' ? j(K.troops) : kd === 'coins' ? 15 + Math.round(at / 40) : 1);
        const hp = (kd, f) => j(K.barrel * f * (kd === 'weapon' ? 0.5 : 1)); // guns stay reachable for weak squads
        out.push(barrel(at, side, hp(a, 1), a, amt(a)));
        out.push(barrel(at, o, hp(b, 0.8), b, amt(b)));
        return step;
      }
      case 'horde':
        out.push(horde(at + 18, j(K.horde), this.mix(at, K), 'both', { hpMul: endlessTough(at) }));
        if (r.chance(0.35)) out.push(coins(at, r.pick(['L', 'R']), 6, r.chance(0.5) ? 'line' : 'zigzag'));
        return step + 4;
      case 'hordeSide':
        // a thicker horde guards one lane's barrel; the clear lane has coins
        out.push(horde(at + 18, j(K.horde * 0.9), this.mix(at, K), side, { hpMul: endlessTough(at) }));
        out.push(barrel(at + 4, side, j(K.barrel * 0.4), r.chance(0.5) ? 'weapon' : 'troops', j(K.troops * 1.4)));
        out.push(coins(at, o, 8, 'line'));
        return step + 4;
      case 'gauntlet': {
        // a horde charges while a blade sweeps / a gap opens in one lane: dodging and fighting at once
        out.push(horde(at + 18, j(K.horde * 0.8), this.mix(at, K), 'both', { hpMul: endlessTough(at) }));
        if (r.chance(0.5)) out.push(blade(at + 6, side, { moving: { range: 1.2, speed: r.range(1.0, 1.4) } }));
        else out.push(gap(at + 2, side, 10));
        return step + 8;
      }
      case 'hazard':
        if (r.chance(0.5)) out.push(blade(at, side, at > 1200 ? { moving: { range: 1.4, speed: 1.2 } } : {}));
        else out.push(gap(at - 6, side, Math.round(10 + Math.min(8, at / 300))));
        out.push(coins(at - 4, o, 8, 'line'));
        return step;
      default: // bonus
        out.push(powerup(at, side, r.pick(['shield', 'rapid', 'magnet', 'freeze'])));
        out.push(coins(at, o, 10, 'zigzag'));
        return step - 4;
    }
  }
}

function weighted(r, opts) {
  let total = 0;
  for (const o of opts) total += o[1];
  let x = r.next() * total;
  for (const o of opts) { x -= o[1]; if (x <= 0 && o[1] > 0) return o[0]; }
  return opts[0][0];
}
