// @smoke --seconds 0 --shots 0
// Update 3 stage 3 star re-derivation (levels 16-50 or ?from=&to=): with the casual campaign's upgrades
// (scripts/balance/snapshots3.json) Pip + Thunderclap plays each level as 'casual' and 'pro' (bot seeds 1-3 each);
// finish squads of the won runs. Suggests [2 stars, 3 stars] (stage 3 review rule):
//   2 stars = the LOWER of the casual and pro median finish (so the strongest bot's typical win earns 2 stars),
//   3 stars = the 75th percentile of all wins, at least 2 stars + max(15, 15%), never above the best sampled win
//             (so a strong run reaches it), floor FLOOR3 x the level's expected late squad (smax) so ELITE never opens
//             on a near-empty finish; caps 0.8 x / 0.9 x the 999 formation cap (2 / 3 stars).
// check: proTwo (pro median >= 2 stars), anyThree (a sampled win >= 3 stars).
// Run: node scripts/balance/run.mjs scripts/balance/stars3.js out.json "from=16&to=50"
const g = window.__game, d = g.debug;
g.loop.stop();
const { levelParams } = await import('/src/data/levelgen.js');
const q = new URLSearchParams(location.search);
const from = Number(q.get('from') || 16), to = Number(q.get('to') || 50);
const snap = await (await fetch('/scripts/balance/snapshots3.json')).json();
const CAP = 999, FLOOR3 = 0.1;
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const pct = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))]; };
const f5 = (v) => Math.max(5, Math.floor(v / 5) * 5); // rounded down: the median / best win still makes it
const out = {};
for (let id = from; id <= to; id++) {
  const sq = { casual: [], pro: [] };
  for (const prof of ['casual', 'pro']) {
    for (const s of [1, 2, 3]) {
      d.setUpgrades(snap.U[id].upgrades);
      d.setLoadout('pip', 'thunderclap');
      d.setAutopilot(prof, s, { crates: 'never', ability: true, loadout: 'keep' });
      d.startLevel(id);
      let st, guard = 0;
      do { st = d.simulate(30); guard++; } while (st.state === 'playing' && guard < 20);
      if (st.result && st.result.win) sq[prof].push(st.result.squad);
    }
  }
  const all = sq.casual.concat(sq.pro);
  if (!all.length) { out[id] = { casual: [], pro: [], stars: null }; continue; }
  const c = med(sq.casual), p = med(sq.pro);
  const two = Math.min(0.8 * CAP, ...[c, p].filter((v) => v != null));
  const best = Math.max(...all);
  const floor3 = FLOOR3 * levelParams(id).smax;
  let three = Math.max(pct(all, 0.75), two + Math.max(15, 0.15 * two), floor3);
  three = Math.min(0.9 * CAP, best >= floor3 ? Math.min(three, best) : three);
  const stars = [f5(two), f5(three)];
  if (stars[1] <= stars[0]) stars[1] = stars[0] + 5;
  out[id] = { casual: sq.casual, pro: sq.pro, stars, check: { proTwo: p == null || p >= stars[0], anyThree: best >= stars[1] } };
}
d.setAutopilot(false);
return out;
