// @smoke --seconds 0 --shots 0
// Update 3 stage 2 (STAGE2 "Every builder" playability check, builder "hazards-candy-citadel"): the Candy Kingdom
// and Storm Citadel levels (L31-50) stay winnable with their hazards. Both bots ('pro', 'casual') x two loadouts
// (Pip + Thunderclap, Rime + Glacier Lance) play the campaign from L1 with the foundation-campaign shop rule
// (after every attempt the cheapest of damage / rate / squad / tier is bought while coins last), <= 5 attempts
// per level; every L31-50 must be won. Stage 3 balance (scripts/balance/CHANGELOG.md "Update 3"): worlds 4-5 are
// meant to be genuinely hard, so a stall no longer ends a campaign; each campaign may stall on up to STALLS[prof]
// (review: pro 0, casual 2)
// of L31-50 and every L31-50 must be won by at least one of the four campaigns. Slow (four full campaigns).
// Reports per level 31-50:
// id:W|L<attempts>*<stars>/sq<squad at the finish>/hz<hazard kills over the attempts (hole kinds included)>.
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const { LAST_LEVEL: LAST } = await import('/src/data/levels.js');
const FIRST = 31;
const fails = [], res = {}, wonBy = [], stalls = {};
const STALLS = { pro: 0, casual: 2 }; // stage 3 review: pro never stalls on L31-50 (was 3), casual at most twice (was 5)
const t0 = performance.now();
for (const [hero, weapon] of [['pip', 'thunderclap'], ['rime', 'glacier']]) {
  for (const prof of ['pro', 'casual']) {
    g.save.reset();
    d.setLoadout(hero, weapon);
    const log = [];
    let seed = 1;
    for (let id = 1; id <= LAST; id++) {
      let won = false, tries = 0, last, hz = 0;
      while (!won && tries < 5) {
        tries++;
        d.setAutopilot(prof, seed++, { crates: 'never', ability: true, loadout: 'keep' });
        d.startLevel(id);
        let s, guard = 0;
        do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
        last = s.result; won = !!(last && last.win);
        hz += Object.values(g.hazards.stats.kills).reduce((a, b) => a + b, 0);
        for (let k = 0; k < 50; k++) {
          const ups = g.save.data.upgrades;
          let best = null, bc = Infinity;
          for (const u of ['damage', 'rate', 'squad', 'tier']) { const c = upgradeCost(u, ups[u]); if (c != null && c < bc) { bc = c; best = u; } }
          if (!best || g.save.data.coins < bc) break;
          g.save.spend(bc); g.save.data.upgrades[best]++;
        }
      }
      if (id >= FIRST) log.push(`${id}:${won ? 'W' : 'L'}${tries}${won ? '*' + last.stars : ''}/sq${last ? last.squad ?? 0 : 0}/hz${hz}`);
      if (!won && id < FIRST) { fails.push(`${hero}+${weapon} ${prof}: L${id} not won in 5 attempts`); break; }
      if (id >= FIRST && won) wonBy.push(id);
      else if (id >= FIRST) (stalls[`${hero}+${weapon} ${prof}`] ||= []).push(id);
    }
    res[`${hero}+${weapon} ${prof}`] = log.join(' ');
  }
}
for (const [k, l] of Object.entries(stalls)) if (l.length > STALLS[k.split(' ')[1]]) fails.push(`${k}: stalls on ${l.join(', ')}`);
for (let id = FIRST; id <= LAST; id++) if (!wonBy.includes(id)) fails.push(`L${id}: no campaign won it`);
d.setAutopilot(false);
g.save.reset();
d.toTitle();
return { pass: fails.length === 0, fails, stalls, ms: Math.round(performance.now() - t0), res };
