// Generated campaign levels 16-50 (data only, update 3). Deterministic: one seeded Rng per level (seed = the
// level id), the same beat builders as the hand-made levels (beats.js), so a level never changes between
// loads or builds unless this file does.
// Shape: world 2 (16-20) continues the L11-15 style; worlds 3-5 open with a short, gentle intro level (21, 31,
// 41, ~380 u) and then ramp length 520 -> 720 and speed ~11.5 -> 13. Later worlds use more red gates, ÷ gates,
// moving gates and hazards; their hordes carry more Shieldbearers (Frozen Peaks), Fizzbombs (Candy Kingdom)
// and Bulwarks (Storm Citadel). Each world has a set piece (blade gauntlet, gap staircase, ladder row).
// Boss levels end on helper barrels and the boss; every other level ends with a gate row and the final rush.
// tough / boss hp / stars are first-pass values (quick autopilot check); stage 3 rebalances them.
// Stage 3: harder.js then adds the new enemy types, elite fractions, extra red gates, cursed barrels and hidden
// gates on top (before the weapon crates are placed, so a crate never lands on a screening horde).
import { Rng } from '../core/rng.js';
import { worldOf, levelKind, indexInWorld, TOTAL_LEVELS } from './worlds.js';
import { P, C, B, H, K, U, Xd, Od, a, x, dv, mv, FIX, GR, M5, M6, TW, level, retough } from './beats.js';
import { pickFavours, placeCrates, crateAt } from './levelcrates.js';
import { hardenLevel } from './harder.js';

export const FIRST_GENERATED = 16;

export const NAMES = {
  16: 'Cinder Steps', 17: 'Slag Bridge', 18: 'Ashfall Run', 19: 'Ember Weir', 20: 'Ironhorn Foundry',
  21: 'Frostbite Pass', 22: 'Snowcap Climb', 23: 'Icicle Alley', 24: 'Hailstone Hop', 25: 'Frosthorn Ridge',
  26: 'Glacier Teeth', 27: 'Whiteout Way', 28: 'Avalanche Run', 29: 'Rimefall Bridge', 30: 'Glacius Summit',
  31: 'Gumdrop Lane', 32: 'Syrup Springs', 33: 'Taffy Twist', 34: 'Lollipop Lift', 35: 'Goliath Gulch',
  36: 'Cocoa Falls', 37: 'Jellybean Jump', 38: 'Sprinkle Storm', 39: 'Fudge Fortress', 40: 'Candy Court',
  41: 'Stormspire', 42: 'Thunder Steps', 43: 'Gale Ramparts', 44: 'Static Bridge', 45: 'Eye of the Citadel',
  46: 'Bolt Battlements', 47: 'Windshear Walk', 48: 'Crumbling Keep', 49: 'Tempest Stair', 50: 'Storm Throne',
};

// Boss per level: { type, hp, tier, skin?, mini? }. 'glacius' (L30) and 'gumdrop' (L35) are their own boss
// classes (update 3 stage 2); their world skin here is their native look, so bossLook keeps their colours.
const BOSS_PLAN = {
  20: { type: 'ironhorn', tier: 5, hpMul: 1.4 }, // stage 6 review: casual with no upgrades beat it 4 of 4
  25: { type: 'ironhorn', tier: 5, skin: 'frost', mini: true },
  30: { type: 'glacius', tier: 5, skin: 'frost', hpMul: 0.9 }, // review fix: Vex + Void Siphon could not clear it
  35: { type: 'gumdrop', tier: 6, skin: 'candy', mini: true },
  40: { type: 'mothermurk', tier: 6, skin: 'candy', hpMul: 0.75 }, // stage 3: the Candy Kingdom's smaller squads reach it
  45: { type: 'oculon', tier: 6, skin: 'citadel', mini: true },
  50: { type: 'tempestking', tier: 6, hpMul: 0.9 }, // review fix: with the full stage-3 hordes arriving (0.75); stage 6: the hardest fight again
};
// boss hp at the L15 scale (grows HP_GROWTH per level; a mini-boss has MINI_HP of it)
const HP_BASE = { grawlstone: 220000, glacius: 285000, gumdrop: 220000, oculon: 170000, mothermurk: 250000, ironhorn: 200000, tempestking: 135000 };
const HP_GROWTH = 1.045, MINI_HP = 0.8;
// horde toughness at the arena: L15's 45, growing TOUGH_GROWTH per level
const TOUGH_BASE = 45, TOUGH_GROWTH = 1.035;
const KIND_TOUGH = { intro: 0.55, normal: 1, mini: 0.9, boss: 0.85 };
// Stage 3 balance (quick autopilot check, scripts/balance/CHANGELOG.md "Update 3" + "Update 3 review"), per world
// index (0 = Volcanic Forge .. 3 = Storm Citadel): WORLD_TOUGH = extra horde toughness reached at the end of the
// level. It ramps in with progress^LATE_EXP: an opening horde (p ~0.1) gets ~3% of the extra, the final rush all
// of it. Review fix: kept low enough that the squad's guns (and the blasts they set off) still kill well over a
// third of the climax (tests/u2/w3-balance-rush.js); the old x9-x26 made the late hordes bullet-proof. Boss /
// mini levels use BOSS_TOUGH instead (their boss is the test). WORLD_COUNT / BOSS_COUNT = horde size factor; the
// opening hordes (p < COUNT_P0) keep their size, it is full from COUNT_P1 on.
export const WORLD_TOUGH = [8, 3.5, 9, 6.5];
export const BOSS_TOUGH = [1.35, 1.4, 2.2, 1.9];
export const WORLD_COUNT = [1.3, 1.2, 1.5, 1.35];
export const BOSS_COUNT = [1.1, 1.15, 1.3, 1.35];
// expected late squad (gate / barrel sizes) per world: the Candy Kingdom and the Storm Citadel grow a smaller squad
export const WORLD_SMAX = [0.55, 0.6, 0.4, 0.6];
// extra Bulwark share (3 contact kills each) per world
export const WORLD_TANK = [0, 0, 0.12, 0.02];
// final rush size factor, at most RUSH_MAX (the old 600 cap): a bigger rush never got played in full - the field
// (MAX_ENEMIES 900) is still full of the last horde and the rush's held waves until the finish (review fix)
export const WORLD_RUSH = [1.9, 1.6, 1.7, 1.7];
// per-level touch-ups from the quick check (scripts/balance/CHANGELOG.md "Update 3 review"): tough scales the
// level's extra late toughness, count every horde but the hidden-gate screens
export const LEVEL_TUNE = {
  22: { tough: 0.5 }, 23: { tough: 0.7 }, 29: { tough: 0.2 }, 30: { tough: 0.6 }, 33: { tough: 0.6 },
  34: { tough: 0.4 }, 36: { tough: 0.9, hp: 0.5 }, 38: { tough: 0.5, count: 0.85 }, 39: { tough: 0.65 },
  40: { tough: 0.45 }, 42: { tough: 0.5, count: 0.75 }, 43: { tough: 0.4, hp: 0 }, 46: { tough: 0.85, hp: 0.6 },
  48: { tough: 0.6 }, 49: { tough: 0.2, count: 0.85 }, 50: { tough: 0.2, count: 0.8 },
};
// Stage 6 review ("make it harder" after the stage 4-5 helpers: LINE formation, combo, dodge, raider types):
// every horde past the opening (ramping in from p HP_P0 to HP_P1) is WORLD_HP x tougher, LEVEL_TUNE.hp scales
// that extra per level (boss / mini levels: 0 unless set). Aim (quick autopilot check, scripts/balance/CHANGELOG.md "Stage 6"): casual with no
// shop upgrades usually fails worlds 2-3, casual with the campaign's upgrades needs retries in worlds 4-5.
export const WORLD_HP = [2.2, 2.2, 1.9, 1.9];
const HP_P0 = 0.1, HP_P1 = 0.35;
const RUSH_MAX = 600, POWDER_MIN = 150, EXPLOSIVE_MAX = 0.035;
const LATE_EXP = 1.5, INTRO_SHARE = 0.15, SHIELD_CLEAR = 130, COUNT_P0 = 0.15, COUNT_P1 = 0.5, PACK_EXP = 0.6;
/** Share of the world's extra toughness / horde size a normal level gets: 40% early in the world -> 100% at its end. */
const ramp = (i) => 0.4 + 0.6 * Math.min(1, i / 9);

// Stars per level. Stage 3 review rule (scripts/balance/stars3.js: casual + pro bot seeds 1-3, campaign upgrades,
// Pip + Thunderclap): 2 stars = the lower of the casual and pro median finish squads (the strongest bot's typical
// win earns 2 stars), 3 stars = the 75th percentile of all wins (at least 2 stars + 15%, never above the best
// sampled win, at least 10% of the expected late squad), capped at 0.8 / 0.9 x the 999 formation cap.
// starsFor() is the fallback.
export const STARS = {
  16: [365, 420], 17: [265, 305], 18: [510, 590], 19: [480, 610], 20: [795, 895], 21: [795, 895], 22: [50, 200],
  23: [345, 455], 24: [595, 645], 25: [625, 670], 26: [195, 470], 27: [630, 720], 28: [695, 800], 29: [610, 700],
  30: [210, 755], 31: [795, 895], 32: [135, 225], 33: [45, 165], 34: [280, 365], 35: [795, 895], 36: [305, 350],
  37: [305, 425], 38: [280, 370], 39: [280, 370], 40: [605, 815], 41: [480, 555], 42: [85, 100], 43: [110, 255],
  44: [130, 265], 45: [700, 805], 46: [100, 200], 47: [100, 345], 48: [80, 175], 49: [425, 675], 50: [380, 510],
};

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** Boss cfg of a generated level, or null. */
export function bossFor(id) {
  const b = BOSS_PLAN[id];
  if (!b) return null;
  const { hpMul = 1, ...cfg } = b;
  const hp = Math.round(HP_BASE[b.type] * Math.pow(HP_GROWTH, id - 15) * (b.mini ? MINI_HP : 1) * hpMul / 1000) * 1000;
  return { ...cfg, hp };
}

/** Level-wide numbers of a generated level (no events). */
export function levelParams(id) {
  const w = worldOf(id), i = indexInWorld(id), kind = levelKind(id), wi = w.id - 2;
  const intro = kind === 'intro';
  const length = intro ? 380 : Math.round(520 + (200 * Math.max(0, i - 1)) / 8);
  const speed = r2(11.2 + i / 9 + 0.27 * wi - (intro ? 0.3 : 0));
  const tough = r1(TOUGH_BASE * Math.pow(TOUGH_GROWTH, id - 15) * KIND_TOUGH[kind]);
  const reward = Math.round((215 + 11.5 * (id - 16)) / 10) * 10;
  // expected squad near the end of the level (sets gate / barrel / horde sizes and the stars)
  const smax = intro ? 300 : Math.round(Math.min(900, 600 + 160 * (i / 9) + 30 * wi) * (wi >= 0 ? WORLD_SMAX[wi] : 1));
  return { w, i, kind, wi, intro, length, speed, tough, reward, smax, theme: w.themes[i % w.themes.length] };
}

// ---------------- beat makers (r = the level's Rng, q = levelParams, p = 0..1 through the beats) ----------------
const squadAt = (q, p) => 6 + q.smax * Math.pow(Math.max(0, Math.min(1, p)), 1.5);
const lanePick = (r) => (r.chance(0.5) ? 'L' : 'R');
const other = (lane) => (lane === 'L' ? 'R' : 'L');
const slide = (p) => mv(r1(1.1 + 0.4 * p), r1(1.2 + 0.6 * p));

function gateSpecs(r, q, p) {
  // (the last row, p = 1, used to see no growth left and offered +3 against a ÷2: it sizes like p = 0.84)
  const pg = Math.min(p, 0.84);
  const grow = squadAt(q, pg + 0.16) - squadAt(q, pg);
  const v = Math.max(3, Math.round(grow * r.range(1.0, 1.5)));
  const good = a(v, Math.round(v * r.range(1.5, 1.9)) + 4, r.chance(0.18 + 0.08 * q.wi) ? slide(p) : {});
  const roll = r.next();
  const redP = 0.18 + 0.07 * q.wi, divP = 0.12 + 0.06 * q.wi, mulP = squadAt(q, p) < 380 ? 0.22 : 0.08;
  let bad;
  if (roll < redP) bad = a(-Math.max(2, Math.round(v * r.range(0.5, 0.9))), Math.round(v * r.range(1.1, 1.5)));
  else if (roll < redP + divP) bad = dv(r.pick([2, 2, 3]), Math.round(220 + 500 * p + 120 * q.wi));
  else if (roll < redP + divP + mulP) bad = x(2, r.chance(0.5) ? Math.round(300 + 900 * p) : FIX);
  else bad = a(Math.max(2, Math.round(v * r.range(0.4, 0.7))), Math.round(v * r.range(0.8, 1.1)));
  return r.chance(0.5) ? [good, bad] : [bad, good];
}

function gateBeat(r, q, p) {
  const [l, rt] = gateSpecs(r, q, p);
  const beat = [P(l, rt)];
  if (r.chance(Math.min(0.7, (q.intro ? 0.15 : 0.3) + 0.08 * q.wi))) {
    const lane = lanePick(r);
    if (r.chance(0.55)) beat.push(Xd(lane, r.int(12, 16), r.chance(0.4 + 0.15 * q.wi) ? slide(p) : {}));
    else beat.push(Od(lane, r.pick([10, 12]), 14));
  }
  if (r.chance(0.35)) beat.push(K(lanePick(r), r.pick([8, 10]), r.chance(0.3) ? 'zigzag' : 'line'));
  return beat;
}

function barrelBeat(r, q, p, n) {
  const hp = Math.round(10 + 330 * p);
  const troops = Math.round(6 + squadAt(q, p) * 0.15);
  const lane = lanePick(r);
  const helpers = [[hp, 'drone', 1], [hp, 'turret', 1], [hp, 'troops', troops], [hp, 'shield'], [Math.round(hp * 0.8), 'coins', 20 + 10 * q.wi]];
  let mine, side;
  if (n < 4) { mine = [Math.round(Math.max(8, hp * 0.85)), 'weapon', 1]; side = n < 2 ? [hp, 'troops', troops] : r.pick(helpers); }
  else { mine = r.pick(helpers.slice(0, 2)); side = r.pick(helpers); }
  const beat = [lane === 'L' ? B(mine, side) : B(side, mine)];
  if (!q.intro && r.chance(0.12 + 0.06 * q.wi)) beat.push(Xd(lanePick(r), 14, slide(p)));
  return beat;
}

function mixFor(r, q, p) {
  if (p < 0.12) return GR(0.25);
  if (p < 0.25 || q.intro) return M5(0.25, 0.12 + 0.03 * q.wi, 0.12);
  const wi = q.wi;
  if (p > 0.3 && r.chance(wi === 0 ? 0.2 : 0.15 + 0.05 * wi)) return TW(r2(0.18 + 0.12 * p + 0.02 * wi), 0.22);
  const s = 0.14 + 0.05 * p + 0.03 * wi + (wi === 1 ? 0.1 : 0);       // Shieldbearers (Frozen Peaks: more)
  const b = 0.12 + 0.02 * wi + (wi === 2 ? 0.12 : 0);                 // Fizzbombs (Candy Kingdom: more)
  const t = 0.06 + 0.04 * p + 0.015 * wi + (wi === 3 ? 0.04 : 0) + WORLD_TANK[wi]; // Bulwarks (Storm Citadel: more)
  return M6(r2(0.2 + 0.06 * p), r2(s), r2(b), r2(t));
}

function hordeBeat(r, q, p) {
  const boss = q.kind === 'boss' || q.kind === 'mini';
  // the opening hordes (p < COUNT_P0, met by a 20-30 squad) keep their size; the factor is full from COUNT_P1 on
  const wc = 1 + ((boss ? BOSS_COUNT : WORLD_COUNT)[q.wi] - 1) * (boss ? 1 : ramp(q.i)) * Math.max(0, Math.min(1, (p - COUNT_P0) / (COUNT_P1 - COUNT_P0)));
  // a short level packs its late hordes closer together: they are smaller (L42 met 1,700 enemies in 100 u)
  const packed = q.intro ? 0.6 : Math.pow(Math.min(1, q.length / 720), PACK_EXP);
  const count = Math.round((26 + 470 * Math.pow(p, 1.2)) * (1 + 0.06 * q.wi) * wc * packed);
  const lane = p < 0.5 && r.chance(0.3) ? lanePick(r) : 'both';
  const beat = [H(Math.min(560, count), mixFor(r, q, p), lane)];
  if (r.chance(0.35)) beat.push(U(lane === 'both' ? lanePick(r) : other(lane), r.pick(['shield', 'rapid', 'freeze', 'magnet'])));
  if (r.chance(0.3)) beat.push(K(lanePick(r), 10, 'zigzag'));
  return beat;
}

/** The world's set piece: blade gauntlet (Forge), gap staircase (Frost), ladder row (Candy), either (Citadel). */
function setBeat(r, q, p) {
  const kind = [0, 1, 2, r.chance(0.5) ? 0 : 1][q.wi];
  if (kind === 0 || q.intro) {
    const [l, rt] = gateSpecs(r, q, p);
    const first = lanePick(r);
    return [P(l, rt), Xd(first, 12, slide(p)), Xd(other(first), 26, slide(p))];
  }
  if (kind === 1) {
    const first = lanePick(r);
    return [K(other(first), 8), Od(first, 10, -4), Od(other(first), 10, 16)];
  }
  const v = Math.max(6, Math.round((squadAt(q, p + 0.16) - squadAt(q, p)) * 1.2));
  return r.chance(0.5) ? [P(x(2, Math.round(40 + 260 * p)), a(v, v * 2))] : [C(x(2, Math.round(300 + 400 * p)))];
}

const CYCLE = ['gate', 'barrel', 'horde', 'gate', 'horde', 'barrel', 'set', 'horde'];

/** Beats of a generated level (count from its length, ~30 u apart like the hand-made ones). */
function beatsFor(r, q, boss) {
  const n = q.intro ? 12 : Math.round((q.length - 54) / 30) + 1;
  const beats = [];
  let barrels = 0;
  for (let k = 0; k < n; k++) {
    const p = k / (n - 1);
    if (k === n - 1) {
      const hp = Math.round(10 + 330 * p);
      if (boss) beats.push(B([hp, 'turret', 1], [hp, 'drone', 1]));
      else beats.push(gateBeat(r, q, p));
      continue;
    }
    const slot = k === 0 ? 'first' : k === 1 ? 'barrel' : k === 2 ? 'horde' : CYCLE[(k - 3) % CYCLE.length];
    if (slot === 'first') beats.push(r.chance(0.5) ? [C(a(3, 10)), K(lanePick(r), 6)] : [P(a(4, 9), a(2, 6))]);
    else if (slot === 'gate') beats.push(gateBeat(r, q, p));
    else if (slot === 'barrel') beats.push(barrelBeat(r, q, p, barrels++));
    else if (slot === 'horde') beats.push(hordeBeat(r, q, p));
    else beats.push(setBeat(r, q, p));
  }
  return beats;
}

function starsFor(q, boss) {
  const end = q.smax * (boss ? 0.45 : 0.7);
  return [Math.round(end * 0.5), Math.round(end * 0.85)];
}

/**
 * Stage 3 balance: horde toughness x (1 + (late - 1) x progress^LATE_EXP), late = 1 + (WORLD_TOUGH - 1) x ramp(i) x
 * LEVEL_TUNE.tough (the final rush gets all of it); also the rush size (WORLD_RUSH, <= RUSH_MAX), the per-level count
 * touch-up, the explosive cap and the no-shield-before-the-rush rule.
 */
function lateTough(def, q) {
  const boss = q.kind === 'boss' || q.kind === 'mini';
  const tune = LEVEL_TUNE[def.id] || {};
  let late = 1 + ((boss ? BOSS_TOUGH : WORLD_TOUGH)[q.wi] - 1) * (boss ? 1 : ramp(q.i)) * (tune.tough ?? 1);
  if (q.intro) late = 1 + (late - 1) * INTRO_SHARE; // the short hazard-teaching level stays gentle
  const span = def.layout ?? def.length;
  // boss / mini levels: the boss is the test (their hordes keep the stage-3 toughness unless LEVEL_TUNE.hp says)
  const hp = q.intro ? 1 : 1 + (WORLD_HP[q.wi] - 1) * (tune.hp ?? (boss ? 0 : 1));
  for (const e of def.events) {
    if (e.type !== 'horde') continue;
    if (tune.count && !e.gateAt) e.count = Math.max(1, Math.round(e.count * tune.count));
    if (e.rush && !boss && !q.intro) e.count = Math.min(RUSH_MAX, Math.round(e.count * (1 + (WORLD_RUSH[q.wi] - 1) * ramp(q.i))));
    if (e.count >= POWDER_MIN) capExplosives(e.mix);
    const p = e.rush ? 1 : Math.max(0, Math.min(1, e.at / span));
    const hpRamp = Math.max(0, Math.min(1, (p - HP_P0) / (HP_P1 - HP_P0)));
    e.tough = r2((e.tough ?? 1) * (1 + (late - 1) * Math.pow(p, LATE_EXP)) * (1 + (hp - 1) * hpRamp));
  }
  retough(def);
  if (def.boss) return;
  // an 8 s shield (power token or shield barrel) this close before the final rush made every rush enemy die on
  // contact: those turn into rapid fire / a turret barrel (same lane, same spot)
  const rush = def.events.find((e) => e.type === 'horde' && e.rush);
  for (const e of def.events) {
    if (!rush || e.at < rush.at - SHIELD_CLEAR) continue;
    if (e.type === 'powerup' && e.kind === 'shield') e.kind = 'rapid';
    else if (e.type === 'barrel' && e.reward.kind === 'shield') e.reward = { kind: 'turret', amount: 1 };
  }
}

/**
 * A big packed horde with more than ~1 in 30 Fizzbombs + Boomlings is a powder keg: one shot bomb starts a chain
 * that wipes the whole blob (a blast reaches ~30 neighbours), so its size and toughness stop mattering (stage 3
 * review: L16's final rush lost 850 of 1,357 to blasts). Their share is capped at EXPLOSIVE_MAX (the rest become
 * Murklings), so the chain stays local.
 */
function capExplosives(mix) {
  const ex = (mix.bomber || 0) + (mix.blaster || 0);
  if (ex <= EXPLOSIVE_MAX) return;
  const k = EXPLOSIVE_MAX / ex;
  for (const t of ['bomber', 'blaster']) if (mix[t]) { mix.grunt = (mix.grunt || 0) + mix[t] * (1 - k); mix[t] = Math.round(mix[t] * k * 1000) / 1000; }
  mix.grunt = Math.round(mix.grunt * 1000) / 1000;
}

/** One generated level def (16..50). */
export function generateLevel(id) {
  const q = levelParams(id);
  const r = new Rng(id);
  const boss = bossFor(id);
  const def = level({
    id, name: NAMES[id] || `Level ${id}`, theme: q.theme, length: q.length, speed: q.speed, stars: STARS[id] || starsFor(q, boss),
    reward: q.reward, tough: q.tough, boss, rush: { mul: q.intro ? 1 : r2(1.15 + 0.05 * q.wi) },
  }, beatsFor(r, q, boss));
  hardenLevel(def); // stage 3: enemy mixes, red gates, cursed barrels, hidden gates (own Rng; beats stay put)
  lateTough(def, q);
  def.favours = pickFavours(def);
  // weapon crates on even levels (one) and boss levels (two), cycling through the favoured weapons
  const fav = (k) => def.favours[(id + k) % def.favours.length];
  const plan = [];
  if (boss || id % 2 === 0) plan.push([lanePick(r), fav(0), r2(r.range(0.3, 0.55))]);
  if (boss) plan.push([lanePick(r), fav(1), r2(r.range(0.65, 0.85))]);
  // a crate needs 12 u of clear road: try p, then p +- 0.08, +- 0.16 (the plan keeps the p that fits)
  def.crates = [];
  for (const [lane, weapon, p] of plan) {
    const fit = [0, 0.08, -0.08, 0.16, -0.16].map((dp) => r2(p + dp)).find((t) => t > 0.05 && t < 0.95 && crateAt(def, def.events, t) != null);
    if (fit != null) { const c = [lane, weapon, fit]; placeCrates(def, [c]); def.crates.push(c); }
  }
  return def;
}

export function generateLevels(from = FIRST_GENERATED, to = TOTAL_LEVELS) {
  const out = [];
  for (let id = from; id <= to; id++) out.push(generateLevel(id));
  return out;
}
