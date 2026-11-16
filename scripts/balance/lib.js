// Balance harness helpers (in-page module; imported by the scenarios in scripts/balance/ and tests/u2/balance-*.js
// through the Vite dev server). Never part of the game build. SPEC2 §8.
//   play(g, o)        one level run -> the per-run record SPEC2 §8.2 lists
//   untilWin(g, o)    up to o.tries attempts (seed s, s+100, ...) -> { win, attempts, runs, last }
//   gauntlet(g, o)    one gauntlet run (SPEC2 §8.3) -> { lost, clear, win }
//   bossKill(g, o)    seconds to kill a boss in a bossTest arena (pro bot dodging)
import { toughFor } from '/src/data/levels.js';

const hooked = new WeakSet();
/** Per-run counters fed by events (members lost, arena squad, ability effects). */
function hook(g) {
  const T = g.__bal || (g.__bal = {});
  if (hooked.has(g)) return T;
  hooked.add(g);
  const ev = g.events;
  ev.on('squad:change', (p) => {
    if (p.delta < 0 && p.reason !== 'gate') T.lost += -p.delta;
    if (p.delta > 0 && p.reason === 'ability') T.rally += p.delta;
  });
  ev.on('run:phase', (p) => {
    if (p.phase === 'boss' && T.arena == null) { T.arena = g.squad.count; T.bossT0 = g.run ? g.run.time : 0; }
  });
  ev.on('ability:use', (p) => {
    T.uses++;
    if (p.ability === 'whiteout') T.frozen += g.horde.list.filter((e) => e.state === 0 && e.freezeT > 0).length;
    if (p.ability === 'shockwave') { const l = g.heroes.abilities.shockwave.last; T.pushed += (l && l.pushed) || 0; }
  });
  const H = g.heroes, absorb = H.absorb.bind(H);
  H.absorb = (reason) => { const inv = H.invulnT > 0; const r = absorb(reason); if (r && inv) T.blocked++; return r; };
  return T;
}
function resetCounters(T) { Object.assign(T, { lost: 0, rally: 0, arena: null, bossT0: 0, uses: 0, frozen: 0, pushed: 0, blocked: 0 }); }

const r1 = (v) => Math.round(v * 10) / 10;
/**
 * debug.simulate that survives a render-side exception: simulate() steps the logic first and only then calls
 * game.sync (visual), so a throw from src/fx/** leaves the simulation intact. Counted in fxErrors.
 */
export const fxErrors = [];
function sim(d, sec) {
  try { return d.simulate(sec); } catch (e) { if (fxErrors.length < 20) fxErrors.push(String(e && e.stack || e).split('\n').slice(0, 2).join(' ')); return d.state(); }
}

/**
 * One level run. o = { id, hero, weapon, prof, seed, ups, crates = 'never', ability = true }.
 * Returns { win, stars, arena, bossSec, bossLeft, kills, lost, squad, coins, killsBy, uses, ... }.
 */
export function play(g, o) {
  const d = g.debug, T = hook(g);
  if (o.ups) d.setUpgrades(o.ups);
  d.setLoadout(o.hero || 'pip', o.weapon || 'thunderclap');
  d.setAutopilot(o.prof || 'casual', o.seed ?? 1, { crates: o.crates || 'never', ability: o.ability !== false, loadout: 'keep' });
  resetCounters(T);
  const coins0 = g.save ? g.save.data.coins : 0;
  d.startLevel(o.id);
  const start = g.squad.count;
  let s, guard = 0;
  do { s = sim(d, 30); guard++; } while (s.state === 'playing' && guard < 20);
  const r = s.result || {};
  const win = !!r.win;
  const kb = g.run && g.run.killsBy ? { ...g.run.killsBy } : {};
  const kills = r.kills ?? (g.run ? g.run.kills : 0);
  return {
    win, stars: r.stars || 0, arena: T.arena, bossSec: win && T.arena != null ? r1(g.run.time - T.bossT0) : null,
    bossLeft: win ? 0 : (r.bossHp ?? null), bossMax: r.bossMax ?? null, kills, lost: T.lost, squad: r.squad ?? 0, start,
    coins: r.coins || 0, paid: g.save ? g.save.data.coins - coins0 : 0, killsBy: kb, uses: T.uses,
    abilityShare: kills ? Math.round((kb.ability || 0) / kills * 1000) / 1000 : 0,
    fx: { rally: T.rally, frozen: T.frozen, pushed: T.pushed, blocked: T.blocked, abilityKills: kb.ability || 0 },
    time: g.run ? r1(g.run.time) : 0, mkEnd: g.weapons.mk,
  };
}

/** Up to o.tries attempts; attempt k uses bot seed o.seed + 100 * k. */
export function untilWin(g, o) {
  const tries = o.tries || 4, runs = [];
  for (let k = 0; k < tries; k++) {
    const r = play(g, { ...o, seed: (o.seed ?? 1) + 100 * k });
    runs.push(r);
    if (r.win) break;
  }
  const last = runs[runs.length - 1];
  return { win: last.win, attempts: last.win ? runs.length : tries + 1, runs };
}

// ---------------- gauntlets (SPEC2 §8.3) ----------------
const H = (at, count, mix, hpMul, extra = {}) => ({ type: 'horde', at, count, mix, lane: 'both', hpMul, ...extra });
export const GAUNTLETS = {
  grunt: (m) => [H(70, 400, { grunt: 1 }, m)],
  runner: (m) => [0, 1, 2, 3, 4, 5].map((i) => H(60 + i * 30, 40, { runner: 1 }, m)),
  shield: (m) => [0, 1, 2].map((i) => H(60 + i * 45, 20, { shield: 1 }, m)),
  tank: (m) => [0, 1, 2].map((i) => H(60 + i * 45, 8, { tank: 1 }, m)),
  bomber: (m) => [0, 1, 2, 3].map((i) => H(60 + i * 40, 30, { bomber: 1 }, m)),
};
export const GAUNTLET_TYPES = Object.keys(GAUNTLETS);

/**
 * One gauntlet: Mk III, squad 60 (+ the hero's start bonus), zero upgrades, no gates or barrels.
 * o = { type, T, hero, weapon, seed, prof = 'casual', ability = false }.
 */
export function gauntlet(g, o) {
  const d = g.debug, T = hook(g);
  d.setUpgrades({ squad: 0, damage: 0, rate: 0, tier: 0, coins: 0 });
  d.setLoadout(o.hero || 'pip', o.weapon);
  d.setAutopilot(o.prof || 'casual', o.seed ?? 1, { crates: 'never', ability: !!o.ability, loadout: 'keep' });
  resetCounters(T);
  const events = GAUNTLETS[o.type](toughFor(o.T, 3));
  d.startCustom({ id: 90 + GAUNTLET_TYPES.indexOf(o.type), name: 'Gauntlet', length: 380, speed: 9, boss: null, events });
  d.setMk(3);
  const want = 60 + g.heroes.startBonus;
  if (g.squad.count !== want) g.squad.setCount(want, 'barrel');
  T.lost = 0;
  const start = g.squad.count;
  let clear = 0, guard = 0;
  while (g.state === 'playing' && guard++ < 400) {
    sim(d, 0.25);
    if (g.horde.count > 0 || (g.horde.cursor ?? 0) < (g.horde.events ? g.horde.events.length : 0)) clear = g.run.time;
  }
  const r = g.lastResult || {};
  return { lost: Math.min(start, T.lost), start, clear: r1(clear), win: !!r.win, kills: r.kills || 0 };
}

/** Mean over bot seeds. */
export function gauntletMean(g, o, seeds = [1, 2, 3]) {
  const rs = seeds.map((seed) => gauntlet(g, { ...o, seed }));
  const m = (k) => r1(rs.reduce((s, r) => s + r[k], 0) / rs.length);
  return { lost: m('lost'), clear: m('clear'), start: rs[0].start, wins: rs.filter((r) => r.win).length, runs: rs.map((r) => r.lost) };
}

// ---------------- bosses ----------------
/** bossTest arena with the pro bot dodging; seconds from the fight start to the kill (null = not within cap). */
export function bossKill(g, o) {
  const d = g.debug;
  d.setUpgrades({ squad: 0, damage: 0, rate: 0, tier: 0, coins: 0 });
  d.setLoadout(o.hero || 'pip', o.weapon);
  d.setAutopilot('pro', o.seed ?? 1, { crates: 'never', ability: false, loadout: 'keep' });
  d.bossTest(o.type, { weapon: o.weapon, mk: o.mk ?? 4, squad: o.squad ?? 80, hero: o.hero || 'pip', arrive: false });
  let guard = 0;
  while (g.boss && g.boss.state !== 'fight' && g.state === 'playing' && guard++ < 200) sim(d, 0.1);
  const t0 = g.run.time, cap = o.cap ?? 120;
  while (g.state === 'playing' && g.run.active && g.run.time - t0 < cap) sim(d, 0.1);
  const won = !!(g.lastResult && g.lastResult.win);
  const out = { sec: won ? r1(g.run.time - t0) : null, left: won ? 0 : Math.ceil(g.boss ? g.boss.hp : 0), squad: g.squad.count };
  d.setAutopilot(false);
  return out;
}
