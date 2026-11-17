// @smoke --seconds 0 --shots 0
// SPEC2 §9 foundation-campaign: Pip + the Thunderclap stub (old ladder, damage x0.8, neutral) with the same
// upgrade-buying rule and seeds as tests/u2/baseline/campaign-5d67da5.json (probe/campaign.js): pro clears
// L1-15 with <= 2 attempts per level, casual with <= 5, and none of L1-15 needs more than baseline + 1.
// Update 3: the campaign is 50 levels (most end with a final rush instead of a boss). Stage 3 balance
// (scripts/balance/CHANGELOG.md "Update 3"): worlds 4-5 are meant to be genuinely hard, so a level not won in 5
// attempts no longer ends the campaign (it goes on with the upgrades bought so far). L16-30 must still be cleared
// within 5 by both bots; in L31-50 the casual bot may stall on up to STALL_CASUAL levels and the pro bot on up to
// STALL_PRO, and every one of L31-50 must be cleared by at least one of the two bots (nothing impossible).
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const base = await (await fetch('/tests/u2/baseline/campaign-5d67da5.json')).json();
const { LAST_LEVEL: LAST } = await import('/src/data/levels.js');
const HARD = 31, STALL_CASUAL = 5, STALL_PRO = 3;
d.setLoadout('pip', 'thunderclap');
const res = {};
for (const prof of ['pro', 'casual']) {
  g.save.reset();
  d.setLoadout('pip', 'thunderclap');
  const log = [];
  let seed = 1;
  for (let id = 1; id <= LAST; id++) {
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
    if (!won && id < HARD) break;
  }
  res[prof] = { ups: { ...g.save.data.upgrades }, log };
}
const fails = [];
for (const prof of ['pro', 'casual']) {
  const b = base.result[prof].log;
  const log = res[prof].log;
  if (log.length < LAST) fails.push(`${prof}: stalled before L${HARD} (L${log.length})`);
  const stalls = log.filter((l) => l.id >= HARD && !l.won).map((l) => l.id);
  if (stalls.length > (prof === 'pro' ? STALL_PRO : STALL_CASUAL)) fails.push(`${prof}: stalls on ${stalls.join(', ')}`);
  for (const l of log) {
    const cap = prof === 'pro' && l.id <= 15 ? 2 : 5;
    if (l.id < HARD && l.tries > cap) fails.push(`${prof} L${l.id}: ${l.tries} attempts > ${cap}`);
    const bl = b.find((x) => x.id === l.id);
    if (bl && l.tries > bl.tries + 1) fails.push(`${prof} L${l.id}: ${l.tries} attempts > baseline ${bl.tries} + 1`);
  }
}
for (let id = HARD; id <= LAST; id++) if (!['pro', 'casual'].some((p) => res[p].log.some((l) => l.id === id && l.won))) fails.push(`L${id}: neither bot cleared it`);
g.save.reset();
return { pass: fails.length === 0, fails, pro: res.pro.log.map((l) => `${l.id}:${l.tries}${l.won ? '' : 'X'}`).join(' '), casual: res.casual.log.map((l) => `${l.id}:${l.tries}${l.won ? '' : 'X'}`).join(' '), ups: { pro: res.pro.ups, casual: res.casual.ups } };
