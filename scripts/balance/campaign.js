// @smoke --seconds 0 --shots 0
// Balance campaign (SPEC2 §8.1, matrix E). Copied from the design-time probe (scratchpad probe/campaign.js) and
// adapted to the update-2 loadout API: Pip + Thunderclap, bot opts { crates: 'never', ability: true, loadout:
// 'keep' }, fresh save, L1 -> L15 with up to 5 attempts per level (attempt k uses bot seed 1 + 100 * k). After
// every run it greedily buys the cheapest of damage / rate / squad / tier. Before each level L it records
// U[L] = { upgrades, unlockedLevel } (the casual run's U is scripts/balance/snapshots.json).
// Query: ?profs=casual,pro,novice (default casual). Returns { [prof]: { log, U, ups, coins } }.
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const q = new URLSearchParams(location.search);
const profs = (q.get('profs') || 'casual').split(',');
const res = {};
for (const prof of profs) {
  g.save.reset();
  d.setLoadout('pip', 'thunderclap');
  const log = [], U = {};
  for (let id = 1; id <= 15; id++) {
    U[id] = { upgrades: { ...g.save.data.upgrades }, unlockedLevel: g.save.data.unlockedLevel };
    let won = false, tries = 0, last;
    while (!won && tries < 5) {
      d.setLoadout('pip', 'thunderclap');
      d.setAutopilot(prof, 1 + 100 * tries, { crates: 'never', ability: true, loadout: 'keep' });
      tries++;
      d.startLevel(id);
      let s, guard = 0;
      do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
      last = s.result; won = !!(last && last.win);
      for (let k = 0; k < 50; k++) {
        const ups = g.save.data.upgrades;
        let best = null, bc = Infinity;
        for (const u of ['damage', 'rate', 'squad', 'tier']) { const c = upgradeCost(u, ups[u]); if (c != null && c < bc) { bc = c; best = u; } }
        if (!best || g.save.data.coins < bc) break;
        g.save.spend(bc); g.save.data.upgrades[best]++;
      }
    }
    log.push({ id, tries, won, stars: last && last.stars, squad: last && last.squad, bossLeft: last && last.bossHp, t: Math.round(g.run.time) });
    if (!won) break;
  }
  res[prof] = { log, U, ups: { ...g.save.data.upgrades }, coins: g.save.data.coins };
}
g.save.reset();
return res;
