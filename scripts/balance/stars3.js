// @smoke --seconds 0 --shots 0
// Update 3 stage 3 star re-derivation (levels 16-50 or ?from=&to=): with the casual campaign's upgrades
// (scripts/balance/snapshots3.json) Pip + Thunderclap plays each level as 'casual' (seeds 1-3) and 'pro'
// (seeds 1-2); finish squads of the won runs. Suggests [2 stars, 3 stars] = [casual median, max(pro median,
// 1.3 x casual median)] (rounded to 5, capped below the 999 formation cap); a level no casual run won keeps
// 0.8 x its pro median for 2 stars. Run: node scripts/balance/run.mjs scripts/balance/stars3.js out.json
const g = window.__game, d = g.debug;
g.loop.stop();
const q = new URLSearchParams(location.search);
const from = Number(q.get('from') || 16), to = Number(q.get('to') || 50);
const snap = await (await fetch('/scripts/balance/snapshots3.json')).json();
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
const out = {};
for (let id = from; id <= to; id++) {
  const sq = { casual: [], pro: [] };
  for (const [prof, seeds] of [['casual', [1, 2, 3]], ['pro', [1, 2]]]) {
    for (const s of seeds) {
      d.setUpgrades(snap.U[id].upgrades);
      d.setLoadout('pip', 'thunderclap');
      d.setAutopilot(prof, s, { crates: 'never', ability: true, loadout: 'keep' });
      d.startLevel(id);
      let st, guard = 0;
      do { st = d.simulate(30); guard++; } while (st.state === 'playing' && guard < 10);
      if (st.result && st.result.win) sq[prof].push(st.result.squad);
    }
  }
  const c = med(sq.casual), p = med(sq.pro);
  const two = c ?? (p != null ? 0.8 * p : null);
  const three = two == null ? null : Math.max(p ?? 0, 1.3 * two);
  out[id] = { casual: sq.casual, pro: sq.pro, stars: two == null ? null : [Math.min(950, r5(two)), Math.min(990, r5(Math.max(three, two + 20)))] };
}
d.setAutopilot(false);
return out;
