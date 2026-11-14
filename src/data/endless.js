// Endless mode (data + seeded generator). The bridge is cut into zones of BOSS_EVERY units; each zone is
// filled with patterns (gate rows, ladders, hordes, barrel choices, hazards, pickups) whose numbers ramp with
// the distance, and ends in a boss arena. Uses its own seeded Rng, so the same seed builds the same bridge.
import { Rng } from '../core/rng.js';
import { THEME_ORDER } from './themes.js';
import { gate, barrel, horde, blade, gap, powerup, coins } from './levels.js';

export const ENDLESS = {
  bossEvery: 700,     // a boss guards every 700 u
  startClear: 30,     // empty road at the start
  preBoss: 55,        // empty road before an arena
  postBoss: 34,       // empty road after a boss kill
  speed0: 9.2, speedPerZone: 0.45, speedMax: 11.6,
};

export const ENDLESS_BOSSES = ['grawlstone', 'oculon', 'mothermurk', 'ironhorn', 'tempestking'];

/** Boss config of arena n (1-based): rotates through the roster, hp and tier climb every arena. */
export function endlessBoss(n) {
  const type = ENDLESS_BOSSES[(n - 1) % ENDLESS_BOSSES.length];
  const hp = Math.min(450000, Math.round(9000 * Math.pow(1.9, n - 1) / 500) * 500);
  return { type, hp, tier: Math.min(5, n) };
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
   * Difficulty knobs at distance d (u), from the squad a good run has there (E: ~45 at 200 u, ~330 at the
   * first boss, the 999 cap by the second) and the weapon tier it has probably reached.
   */
  knobs(d) {
    const E = Math.min(950, 1 + 330 * Math.pow(d / 700, 1.6));
    const dpm = d < 150 ? 2.2 : d < 350 ? 4.5 : d < 700 ? 7 : d < 1200 ? 13.5 : 20;
    const late = Math.max(0, (d - 1400) / 700);          // past the cap: numbers keep climbing slowly
    return {
      E,
      add: Math.max(4, Math.round(0.45 * E)),            // good add gate max
      horde: Math.min(700, Math.round(Math.max(10, 0.55 * E) * (1 + 0.4 * late))),
      barrel: Math.max(8, Math.round(E * dpm * 0.6 * (1 + 0.3 * late))),
      troops: Math.max(4, Math.round(0.25 * E)),
      hits: Math.round(450 + 0.12 * d),                  // ladder hits per rung
      shields: Math.min(0.35, 0.12 + late * 0.08),
      tanks: Math.min(0.2, 0.08 + late * 0.04),
    };
  }

  /** Enemy mix unlocked by distance: runners 150+, shields 400+, bombers 600+, tanks 900+. */
  mix(d, K) {
    const r = this.rng;
    const m = { grunt: 1 };
    if (d > 150) m.runner = r.range(0.15, 0.3);
    if (d > 400) m.shield = r.range(0.6, 1.2) * K.shields;
    if (d > 600) m.bomber = r.range(0.08, 0.18);
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
    if (slot === 0) kind = weighted(r, [['gates', 3], ['shootRed', d > 60 ? 2 : 0], ['ladder', d > 90 ? 3.5 : 0], ['ladderC', d > 120 ? 1.4 : 0], ['movingGates', d > 400 ? 1.4 : 0]]);
    else if (slot === 1) kind = weighted(r, [['barrels', 4], ['bonus', d > 100 ? 1 : 0]]);
    else kind = weighted(r, [['horde', 5], ['hordeSide', d > 200 ? 2.5 : 0], ['hazard', d > 300 ? 2 : 0]]);
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
        const early = at < 900;
        const rewards = [['weapon', early ? 4 : 1.2], ['troops', 3], ['drone', 1.3], ['turret', at > 300 ? 1 : 0], ['coins', 1], ['shield', 0.5], ['rapid', 0.5]];
        // every other barrel row before 1400 u offers a gun, so the weapon curve can't stall on bad luck
        const a = this.barrelRows++ % 2 === 0 && at < 1400 ? 'weapon' : weighted(r, rewards);
        let b = weighted(r, rewards);
        if (b === a) b = a === 'troops' ? 'coins' : 'troops';
        const amt = (kd) => (kd === 'troops' ? j(K.troops) : kd === 'coins' ? 15 + Math.round(at / 40) : 1);
        const hp = (kd, f) => j(K.barrel * f * (kd === 'weapon' ? 0.5 : 1)); // guns stay reachable for weak squads
        out.push(barrel(at, side, hp(a, 1), a, amt(a)));
        out.push(barrel(at, o, hp(b, 0.8), b, amt(b)));
        return step;
      }
      case 'horde':
        out.push(horde(at + 18, j(K.horde), this.mix(at, K)));
        if (r.chance(0.35)) out.push(coins(at, r.pick(['L', 'R']), 6, r.chance(0.5) ? 'line' : 'zigzag'));
        return step + 4;
      case 'hordeSide':
        // a thicker horde guards one lane's barrel; the clear lane has coins
        out.push(horde(at + 18, j(K.horde * 0.9), this.mix(at, K), side));
        out.push(barrel(at + 4, side, j(K.barrel * 0.4), r.chance(0.5) ? 'weapon' : 'troops', j(K.troops * 1.4)));
        out.push(coins(at, o, 8, 'line'));
        return step + 4;
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
