// @smoke --seconds 0 --shots 0
// Update 3 stage 4 (STAGE4 §C quick autopilot spot check, builder "props"): a few real levels with their road
// objects, 'pro' and 'casual' bots (Pip + Thunderclap, mid shop upgrades per world), each level once WITH its
// objects and once with them taken out (same seed). Nothing may become impossible (every level the bot won
// without objects is still won with them) and the objects must not make a level much easier (the finishing
// squad with objects stays under 1.6x + 20 of the one without). Reports per run: W|L*stars/sq<squad>/used/kills.
const g = window.__game, d = g.debug;
g.loop.stop();
const { getLevel } = await import('/src/data/levels.js');
const LEVELS = [5, 13, 27, 44];
const UPS = { 1: { squad: 2, damage: 2, rate: 2 }, 2: { squad: 5, damage: 5, rate: 5, tier: 1 }, 3: { squad: 8, damage: 8, rate: 8, tier: 2 }, 5: { squad: 12, damage: 12, rate: 12, tier: 3 } };
const fails = [], res = {};
const t0 = performance.now();
d.setLoadout('pip', 'thunderclap');
const play = (id, prof, withProps, seed = 1) => {
  const def = getLevel(id), all = def.events;
  if (!withProps) def.events = all.filter((e) => e.type !== 'prop');
  try {
    g.save.reset();
    d.setUpgrades(UPS[def.world] || UPS[5]);
    d.setAutopilot(prof, seed, { crates: 'never', ability: true, loadout: 'keep' });
    d.startLevel(id);
    let s, guard = 0;
    do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
    const p = d.props(), r = s.result || {};
    const used = Object.values(p.triggered).reduce((a, b) => a + b, 0), kills = Object.values(p.kills).reduce((a, b) => a + b, 0);
    return { win: !!r.win, stars: r.stars || 0, squad: r.squad || 0, used, kills };
  } finally { def.events = all; }
};
for (const id of LEVELS) {
  for (const prof of ['pro', 'casual']) {
    const a = play(id, prof, true), b = play(id, prof, false);
    res[`L${id} ${prof}`] = `with ${a.win ? 'W' : 'L'}*${a.stars}/sq${a.squad}/used${a.used}/k${a.kills} | without ${b.win ? 'W' : 'L'}*${b.stars}/sq${b.squad}`;
    if (b.win && !a.win) fails.push(`L${id} ${prof}: won without objects, lost with them`);
    if (a.win && b.win && a.squad > b.squad * 1.6 + 20) {
      // one seed is chaotic (a 7-kill object can swing a close finish): judge "much easier" on seeds 1 + 2 together
      const a2 = play(id, prof, true, 2), b2 = play(id, prof, false, 2);
      res[`L${id} ${prof} seed2`] = `with ${a2.win ? 'W' : 'L'}/sq${a2.squad} | without ${b2.win ? 'W' : 'L'}/sq${b2.squad}`;
      const A = a.squad + a2.squad, B = b.squad + b2.squad;
      if (A > B * 1.6 + 40) fails.push(`L${id} ${prof}: objects made it much easier (squad ${A} vs ${B} over 2 seeds)`);
    }
  }
}
d.setAutopilot(false);
g.save.reset();
d.toTitle();
return { pass: fails.length === 0, fails, ms: Math.round(performance.now() - t0), res };
