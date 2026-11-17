// @smoke --seconds 0 --shots 0
// Update 3 balance campaign (quick check, stage 3): fresh save, L1 -> L50 (or ?from=&to=), Pip + Thunderclap,
// bot opts { crates: 'never', ability: true, loadout: 'keep' }, up to 5 attempts per level with the
// foundation-campaign seeds (one running seed per bot, +1 per attempt) and its upgrade rule (after every run buy
// the cheapest of damage / rate / squad / tier). A level not won in 5 is logged as a stall and the campaign goes
// on (so later levels still get a number). Records U[L] = upgrades before level L (scripts/balance/snapshots3.json).
// Query: ?profs=casual,pro (default casual). Run: node scripts/balance/run.mjs scripts/balance/campaign3.js out.json profs=casual
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const { LAST_LEVEL } = await import('/src/data/levels.js');
const q = new URLSearchParams(location.search);
const profs = (q.get('profs') || 'casual').split(',');
const from = Number(q.get('from') || 1), to = Number(q.get('to') || LAST_LEVEL);
const res = {};
for (const prof of profs) {
  g.save.reset();
  d.setLoadout('pip', 'thunderclap');
  const log = [], U = {};
  let seed = 1;
  for (let id = from; id <= to; id++) {
    U[id] = { upgrades: { ...g.save.data.upgrades } };
    let won = false, tries = 0, last;
    while (!won && tries < 5) {
      tries++;
      d.setAutopilot(prof, seed++, { crates: 'never', ability: true, loadout: 'keep' });
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
    log.push({ id, tries, won, stars: last && last.stars, squad: last && last.squad, bossLeft: last && last.bossHp });
  }
  res[prof] = { log, U, ups: { ...g.save.data.upgrades }, line: log.map((l) => `${l.id}:${l.won ? l.tries : 'X'}`).join(' ') };
}
d.setAutopilot(false);
g.save.reset();
return res;
