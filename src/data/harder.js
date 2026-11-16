// Update 3 stage 3 "make it harder" level passes (data only). Run on a level def after its beats are laid out
// and never move a beat: they only change event fields or add a small screening horde in front of a gate row.
// - Enemy mixes per world: Boomlings ('blaster') + Mendlings ('healer') from the Volcanic Forge on, Spitlings
//   ('sniper') + Broodling hives ('spawner') from the Frozen Peaks, Flaplings ('flyer') from the Candy Kingdom,
//   all of them more often in the Storm Citadel; elite fractions (event field `elite`) rise 0 -> ~15% in
//   worlds 4-5. Unknown type ids are ignored by horde.js until the enemy types exist (ENEMIES[k] filter).
// - Red gates: in a row of two free gates (+N / ×k) the weaker + gate turns red (-N or ÷2), more often later.
// - Cursed barrels: a non-weapon barrel becomes a skull-marked 'cursed' barrel (costs troops or one Mk), with a
//   rising share in worlds 3-5 (a few late in world 2).
// - Hidden gates: a small Shieldbearer-led horde stands right in front of one gate of a row; that gate is
//   flagged `hidden` (dimmed '?' until the enemies in front are cleared or it takes enough hits).
// World 1 is untouched. Levels 11-15 (hand-made) only get the mix pass (hardenHand). Every pass uses its own Rng
// (seed from the level id), so the beat Rng of levelgen.js and everything it places stay exactly as they were.
import { Rng } from '../core/rng.js';
import { worldOf, indexInWorld, levelKind } from './worlds.js';
import { horde, retough, START, ARENA } from './beats.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

/** New enemy shares per world index wi (0 = Volcanic Forge .. 3 = Storm Citadel) at progress p (0..1). */
export function newTypeShares(wi, p, intro = false) {
  const s = {};
  if (wi < 0) return s;
  const k = (intro ? 0.5 : 1) * (wi === 3 ? 1.3 : 1);
  if (p > 0.2) s.blaster = (0.025 + 0.01 * wi + 0.03 * p) * k;
  if (p > 0.3) s.healer = (0.018 + 0.004 * wi) * k;
  if (wi >= 1 && p > 0.25) s.sniper = (0.012 + 0.014 * p) * k;
  if (wi >= 1 && p > 0.35) s.spawner = (0.005 + 0.002 * wi) * k;
  if (wi >= 2 && p > 0.2) s.flyer = (0.04 + 0.04 * p) * k;
  return s;
}

/** Elite fraction of a horde: 0 in worlds 2-3, rising to ~10% (world 4) and ~15% (world 5). */
export function eliteShare(wi, i, p) {
  if (wi < 2) return 0;
  const base = wi === 2 ? 0.02 + 0.006 * i : 0.05 + 0.007 * i;
  return r3(Math.min(0.15, base + 0.04 * p));
}

/** New mix = old mix scaled down to make room for the added shares (sums stay 1). */
export function addShares(mix, add) {
  const extra = Object.values(add).reduce((t, v) => t + v, 0);
  if (!extra) return mix;
  const out = {};
  for (const [k, v] of Object.entries(mix)) out[k] = r3(v * (1 - extra));
  for (const [k, v] of Object.entries(add)) out[k] = r3((out[k] || 0) + v);
  return out;
}

const span = (def) => def.layout ?? def.length;
const prog = (def, at) => Math.max(0, Math.min(1, (at - START) / Math.max(1, span(def) - ARENA - START)));

/** Mix + elite pass over every horde (the final rush counts as p = 1). Fresh mix objects (the rush shares its last horde's). */
function mixPass(def, wi, i, intro) {
  for (const e of def.events) {
    if (e.type !== 'horde') continue;
    const p = e.rush ? 1 : prog(def, e.at);
    e.mix = addShares({ ...e.mix }, newTypeShares(wi, p, intro));
    const el = eliteShare(wi, i, p);
    if (el > 0) e.elite = el;
  }
}

/** Gate rows: at -> { L, R, C } gate events. */
function gateRows(def) {
  const rows = new Map();
  for (const e of def.events) {
    if (e.type !== 'gate') continue;
    if (!rows.has(e.at)) rows.set(e.at, {});
    rows.get(e.at)[e.lane] = e;
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}
/** How good a gate looks (bigger = better): + value, ×k ladders high, ÷k ladders low. */
const worth = (g) => (g.op === 'add' ? g.value : g.op === 'mul' ? 100 : -100);
const RED_P = [0.55, 0.7, 0.82, 0.92];

function redPass(def, r, wi) {
  for (const [at, row] of gateRows(def)) {
    const { L, R } = row;
    if (!L || !R || worth(L) <= 0 || worth(R) <= 0) continue;          // only rows where both gates are free
    const g = worth(L) <= worth(R) ? L : R;
    if (g.op !== 'add' || prog(def, at) < 0.08 || !r.chance(RED_P[wi])) continue;
    const p = prog(def, at);
    if (r.chance(0.6)) {
      g.value = -Math.max(2, Math.round(g.value * r.range(0.7, 1.0)));
      g.max = Math.max(g.max, Math.abs(g.value));
    } else {
      // ÷2 ladder (rung 2), climbing slowly
      g.op = 'div'; g.rung = 2; g.hitsPerStep = Math.round(240 + 500 * p + 120 * wi);
      delete g.value; delete g.max;
    }
    g.red = true;
  }
}

const CURSE_P = [0.1, 0.3, 0.4, 0.5];

function cursePass(def, r, wi) {
  const rows = new Map();
  for (const e of def.events) if (e.type === 'barrel') (rows.get(e.at) || rows.set(e.at, []).get(e.at)).push(e);
  let n = 0;
  const lastAt = span(def) - ARENA - 10;
  for (const [at, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const p = prog(def, at);
    n++;
    if (n <= 2 || at > lastAt || list.length < 2) continue;      // the first two barrel rows teach, the boss helpers stay
    if (wi === 0 && p < 0.5) continue;
    if (!r.chance(CURSE_P[wi] + 0.15 * p)) continue;
    const cand = list.filter((b) => b.reward.kind !== 'weapon');
    if (cand.length === 0) continue;
    const b = r.pick(cand);
    const squad = 6 + 700 * Math.pow(p, 1.5);
    const curse = p < 0.85 && r.chance(0.35) ? 'mk' : 'troops';
    b.reward = { kind: 'cursed', amount: Math.round(8 + 0.18 * squad), curse };
  }
}

const HIDE_P = [0.2, 0.3, 0.38, 0.45];
/** Screening horde: Shieldbearers in front (they hide the gate), grunts + runners behind. */
export const SCREEN_MIX = { grunt: 0.5, shield: 0.32, runner: 0.18 };
export const SCREEN_DZ = 9;

function hidePass(def, r, wi, intro) {
  let placed = 0;
  const max = intro ? 1 : 2 + (wi >= 2 ? 1 : 0);
  for (const [at, row] of gateRows(def)) {
    const p = prog(def, at);
    if (placed >= max || p < 0.15 || p > 0.92 || !row.L || !row.R) continue;
    // no gap / blade where the screen stands (a horde of the beat before may stand there too: they merge)
    const busy = def.events.some((e) => e.at < at && e.at + (e.length || 0) > at - SCREEN_DZ - 5 && (e.type === 'gap' || e.type === 'blade'));
    if (busy || !r.chance(HIDE_P[wi])) continue;
    const good = worth(row.L) >= worth(row.R) ? 'L' : 'R';
    const lane = r.chance(0.6) ? good : good === 'L' ? 'R' : 'L';
    const count = Math.min(60, Math.round((14 + 46 * p) * (1 + 0.12 * wi)));
    def.events.push(horde(at - SCREEN_DZ, count, { ...SCREEN_MIX }, lane, { screen: true }));
    row[lane].hidden = true;
    placed++;
  }
  if (placed) retough(def); // the screens get their toughness like any horde (the others are re-derived unchanged)
}

/** Every pass, for a generated level (16-50). */
export function hardenLevel(def) {
  const w = worldOf(def.id), wi = w.id - 2;
  if (wi < 0) return def;
  const r = new Rng(def.id * 7717 + 3);
  const intro = levelKind(def.id) === 'intro', i = indexInWorld(def.id);
  redPass(def, r, wi);
  cursePass(def, r, wi);
  hidePass(def, r, wi, intro);
  mixPass(def, wi, i, intro);
  return def;
}

/** Hand-made Forge levels (11-15): their beats stay exactly as built; only the horde mixes gain the new types. */
export function hardenHand(def) {
  const w = worldOf(def.id), wi = w.id - 2;
  if (wi < 0) return def;
  mixPass(def, wi, indexInWorld(def.id), levelKind(def.id) === 'intro');
  return def;
}

/** Summary used by tests and the balance notes. */
export function hardStats(def) {
  const s = { red: 0, hidden: 0, cursed: 0, screens: 0, elite: 0, types: {} };
  for (const e of def.events) {
    if (e.type === 'gate' && ((e.op === 'add' && e.value < 0) || e.op === 'div')) s.red++;
    if (e.type === 'gate' && e.hidden) s.hidden++;
    if (e.type === 'barrel' && e.reward.kind === 'cursed') s.cursed++;
    if (e.type === 'horde') {
      if (e.screen) s.screens++;
      s.elite = Math.max(s.elite, e.elite || 0);
      for (const [k, v] of Object.entries(e.mix)) if (v > 0) s.types[k] = r2((s.types[k] || 0) + v * e.count);
    }
  }
  return s;
}
