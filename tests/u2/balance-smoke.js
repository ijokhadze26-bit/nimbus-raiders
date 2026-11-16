// @smoke --seconds 0 --shots 0
// SPEC2 §8 balance regression (fast subset of scripts/balance/matrices.js + distinct.js; the full suite and its
// results are in scripts/balance/). Every weapon (Pip, pro bot) wins the late levels first try; the casual bot
// wins the levels that were hardest during tuning (Void Siphon L10, Thunderclap L15 for heroes without its
// bonus) within 4 attempts; boss kill-time order (Spectra fastest, Gearworks top 2 on Ironhorn, Thunderclap
// bottom 2 on Tempest King, everything within 75 s); a replay of the same run is identical.
const g = window.__game, d = g.debug;
g.loop.stop();
const { play, untilWin, bossKill } = await import('/scripts/balance/lib.js');
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const snap = await (await fetch('/scripts/balance/snapshots.json')).json();
const fails = [], info = { pro: {}, casual: {}, boss: {} };
g.save.reset();
const ups = (id) => snap.U[id].upgrades;
// 1. A-pro subset: every weapon, L8 / L10 / L14 / L15, first try
for (const w of WEAPON_IDS) {
  const row = [];
  for (const id of [8, 10, 14, 15]) {
    const r = play(g, { id, hero: 'pip', weapon: w, prof: 'pro', seed: 1, ups: ups(id) });
    row.push(`${id}:${r.win ? r.arena : 'X'}`);
    if (!r.win) fails.push(`pro ${w} L${id} lost (boss left ${r.bossLeft})`);
  }
  info.pro[w] = row.join(' ');
}
// 2. casual cells that failed before balance (SPEC2 §8.2 A / B / C)
for (const [hero, weapon, id, seed] of [['pip', 'voidsiphon', 10, 1], ['pip', 'voidsiphon', 10, 2], ['pip', 'voidsiphon', 14, 2], ['pip', 'voidsiphon', 8, 1],
  ['pip', 'emberstorm', 2, 2], ['bonbon', 'thunderclap', 15, 1], ['vex', 'thunderclap', 15, 1], ['cinder', 'thunderclap', 15, 1], ['vex', 'voidsiphon', 9, 1]]) {
  const u = untilWin(g, { id, hero, weapon, prof: 'casual', seed, tries: 4, ups: ups(id) });
  info.casual[`${hero}/${weapon} L${id} s${seed}`] = u.win ? u.attempts : 'X';
  if (!u.win) fails.push(`casual ${hero}/${weapon} L${id} s${seed}: not won in 4`);
}
// 3. boss kill times (Mk IV, squad 80)
for (const type of ['ironhorn', 'tempestking', 'oculon']) {
  const t = {};
  for (const w of WEAPON_IDS) t[w] = bossKill(g, { type, weapon: w, mk: 4, squad: 80, cap: 90 }).sec ?? 999;
  info.boss[type] = t;
  const order = WEAPON_IDS.slice().sort((a, b) => t[a] - t[b]);
  if (order[0] !== 'spectra' && t.spectra > t[order[0]]) fails.push(`${type}: Spectra not fastest (${order.join(' ')})`);
  for (const w of WEAPON_IDS) if (!(t[w] <= 75)) fails.push(`${type}: ${w} took ${t[w]} s`);
  if (type === 'ironhorn' && WEAPON_IDS.filter((w) => t[w] < t.gearworks).length > 1) fails.push('Ironhorn: Gearworks not top 2');
  if (type === 'tempestking' && WEAPON_IDS.filter((w) => t[w] > t.thunderclap).length > 1) fails.push('Tempest King: Thunderclap not bottom 2');
}
// 4. determinism: the same run twice
const a = play(g, { id: 12, hero: 'vex', weapon: 'sugarrush', prof: 'casual', seed: 3, ups: ups(12) });
const b = play(g, { id: 12, hero: 'vex', weapon: 'sugarrush', prof: 'casual', seed: 3, ups: ups(12) });
const key = (r) => JSON.stringify([r.win, r.arena, r.kills, r.lost, r.squad, r.time]);
if (key(a) !== key(b)) fails.push(`replay differs: ${key(a)} vs ${key(b)}`);
d.setAutopilot(false);
g.save.reset();
d.toTitle();
return { pass: fails.length === 0, fails, info };
