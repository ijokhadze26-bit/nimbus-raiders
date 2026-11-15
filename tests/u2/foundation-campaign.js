// @smoke --seconds 0 --shots 0
// SPEC2 §9 foundation-campaign: Pip + the Thunderclap stub (old ladder, damage x0.8, neutral) with the same
// upgrade-buying rule and seeds as tests/u2/baseline/campaign-5d67da5.json (probe/campaign.js): pro clears all
// 15 with <= 2 attempts per level, casual all 15 with <= 5, and no level needs more than baseline + 1.
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const base = await (await fetch('/tests/u2/baseline/campaign-5d67da5.json')).json();
d.setLoadout('pip', 'thunderclap');
const res = {};
for (const prof of ['pro', 'casual']) {
  g.save.reset();
  d.setLoadout('pip', 'thunderclap');
  const log = [];
  let seed = 1;
  for (let id = 1; id <= 15; id++) {
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
    log.push({ id, tries, won, stars: last && last.stars, squad: last && last.squad });
    if (!won) break;
  }
  res[prof] = { ups: { ...g.save.data.upgrades }, log };
}
const fails = [];
for (const prof of ['pro', 'casual']) {
  const cap = prof === 'pro' ? 2 : 5;
  const b = base.result[prof].log;
  if (res[prof].log.length < 15 || !res[prof].log.every((l) => l.won)) fails.push(`${prof}: did not clear all 15`);
  for (const l of res[prof].log) {
    if (l.tries > cap) fails.push(`${prof} L${l.id}: ${l.tries} attempts > ${cap}`);
    const bl = b.find((x) => x.id === l.id);
    if (bl && l.tries > bl.tries + 1) fails.push(`${prof} L${l.id}: ${l.tries} attempts > baseline ${bl.tries} + 1`);
  }
}
g.save.reset();
return { pass: fails.length === 0, fails, pro: res.pro.log.map((l) => `${l.id}:${l.tries}${l.won ? '' : 'X'}`).join(' '), casual: res.casual.log.map((l) => `${l.id}:${l.tries}${l.won ? '' : 'X'}`).join(' '), ups: { pro: res.pro.ups, casual: res.casual.ups } };
