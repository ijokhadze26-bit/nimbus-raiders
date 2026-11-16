// @smoke --seconds 0 --shots 0
// Balance matrices (SPEC2 §8.2) in one headless page. Query:
//   m=A,Apro,B,C,D,F,G   which matrices (default all of these; E is scripts/balance/campaign.js)
//   w=glacier,...        restrict weapons; lv=1,2,...  restrict levels; quality=low|high (determinism re-runs)
// Every run applies U[L].upgrades from scripts/balance/snapshots.json and plays level L with
// setLoadout(hero, weapon), bot opts { crates: 'never' (G: 'always'), ability: true, loadout: 'keep' }.
// Returns { [matrix]: [{ hero, weapon, id, seed, win, attempts, runs: [per-run record] }] }.
const g = window.__game, d = g.debug;
g.loop.stop();
const { untilWin } = await import('/scripts/balance/lib.js');
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const { HERO_IDS, HERO_DEF_BY_ID } = await import('/src/data/heroes.js');
const snap = await (await fetch('/scripts/balance/snapshots.json')).json();
const q = new URLSearchParams(location.search);
const list = (k, def) => (q.get(k) ? q.get(k).split(',') : def);
const ms = list('m', ['A', 'Apro', 'B', 'C', 'D', 'F', 'G']);
const W = list('w', WEAPON_IDS);
const Hs = list('h', HERO_IDS);
const LV = q.get('lv') ? q.get('lv').split(',').map(Number) : null;
const lv = (a) => (LV ? a.filter((x) => LV.includes(x)) : a);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
if (q.get('quality')) g.applyQuality(q.get('quality'));
g.save.reset();
const slim = (r) => ({ win: r.win, stars: r.stars, arena: r.arena, bossSec: r.bossSec, bossLeft: r.bossLeft, kills: r.kills, lost: r.lost, squad: r.squad,
  start: r.start, uses: r.uses, abilityShare: r.abilityShare, fx: r.fx, paid: r.paid, coins: r.coins, time: r.time });
const cells = [];
const cell = (m, hero, weapon, id, prof, seed, tries, crates = 'never') => cells.push({ m, hero, weapon, id, prof, seed, tries, crates });
const spec = {
  A: () => W.forEach((w) => lv(range(1, 15)).forEach((id) => [1, 2, 3].forEach((s) => cell('A', 'pip', w, id, 'casual', s, 4)))),
  Apro: () => W.forEach((w) => lv(range(1, 15)).forEach((id) => cell('Apro', 'pip', w, id, 'pro', 1, 2))),
  B: () => Hs.forEach((h) => lv(range(1, 15)).forEach((id) => [1, 2, 3].forEach((s) => cell('B', h, 'thunderclap', id, 'casual', s, 4)))),
  C: () => Hs.forEach((h) => lv(range(1, 15)).forEach((id) => [1, 2, 3].forEach((s) => cell('C', h, HERO_DEF_BY_ID[h].favourite, id, 'casual', s, 4)))),
  D: () => Hs.forEach((h) => W.forEach((w) => lv([4, 8, 12, 15]).forEach((id) => [1, 2].forEach((s) => cell('D', h, w, id, 'casual', s, 4))))),
  F: () => W.forEach((w) => lv(range(1, 4)).forEach((id) => cell('F', 'pip', w, id, 'novice', 1, 5))),
  G: () => W.forEach((w) => lv(range(4, 15)).forEach((id) => [1, 2, 3].forEach((s) => cell('G', 'pip', w, id, 'casual', s, 4, 'always')))),
};
for (const m of ms) spec[m]();
// optional sharding: ?shard=k&of=N plays every N-th cell (scripts/balance/runall.mjs merges the shards)
const shard = Number(q.get('shard') || 0), of = Number(q.get('of') || 1);
const out = { quality: g.engine.quality, shard, of };
const t0 = performance.now();
cells.forEach((c, i) => {
  if (i % of !== shard) return;
  const u = untilWin(g, { ...c, ups: snap.U[c.id].upgrades });
  (out[c.m] || (out[c.m] = [])).push({ i, hero: c.hero, weapon: c.weapon, id: c.id, seed: c.seed, win: u.win, attempts: u.attempts, runs: u.runs.map(slim) });
});
const { fxErrors } = await import('/scripts/balance/lib.js');
out.fxErrors = fxErrors;
out.t = { total: 0 };
out.t.total = Math.round((performance.now() - t0) / 1000);
d.setAutopilot(false);
g.save.reset();
d.toTitle();
return out;
