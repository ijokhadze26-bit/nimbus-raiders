// @smoke --seconds 0 --shots 0
// Distinctness checks (SPEC2 §8.3) in one page: weapon gauntlets (7 weapons x 5 types, Pip), hero gauntlets
// (6 heroes x 5 types, Thunderclap, ability on), and boss kill times (7 weapons x 5 bosses, Mk IV, squad 80).
// Gauntlet T values come from scripts/balance/gauntlets.json. Query: part=wg,hg,boss (default all), w=..., t=...
const g = window.__game, d = g.debug;
g.loop.stop();
const { gauntletMean, bossKill, GAUNTLET_TYPES } = await import('/scripts/balance/lib.js');
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const { HERO_IDS } = await import('/src/data/heroes.js');
const { BOSSES } = await import('/src/data/bosses.js');
const cal = await (await fetch('/scripts/balance/gauntlets.json')).json();
const q = new URLSearchParams(location.search);
const list = (k, def) => (q.get(k) ? q.get(k).split(',') : def);
const parts = list('part', ['wg', 'hg', 'boss']);
const W = list('w', WEAPON_IDS), TY = list('t', GAUNTLET_TYPES), HS = list('h', HERO_IDS);
g.save.reset();
const out = { T: cal.T };
const t0 = performance.now();
if (parts.includes('wg')) {
  out.wg = {};
  for (const type of TY) { out.wg[type] = {}; for (const w of W) out.wg[type][w] = gauntletMean(g, { type, T: cal.T[type], weapon: w, hero: 'pip' }); }
}
if (parts.includes('hg')) {
  out.hg = {};
  for (const type of TY) { out.hg[type] = {}; for (const h of HS) out.hg[type][h] = gauntletMean(g, { type, T: cal.T[type], weapon: 'thunderclap', hero: h, ability: true }); }
}
if (parts.includes('boss')) {
  out.boss = {};
  for (const type of list('b', Object.keys(BOSSES))) { out.boss[type] = {}; for (const w of W) out.boss[type][w] = bossKill(g, { type, weapon: w, mk: 4, squad: 80, cap: 120 }); }
}
out.sec = Math.round((performance.now() - t0) / 1000);
g.save.reset();
d.toTitle();
return out;
