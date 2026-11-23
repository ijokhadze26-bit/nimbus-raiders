// @smoke --seconds 0 --shots 0
// In-page part of the bot curve generator (driver: scripts/balance/botcurves.mjs, STAGE3 "botcurves.js"). Plays the
// casual and pro autopilots through versus matches with no rival (scripted link, src/online/game/testlink.js), shop
// upgrades off as in every online match, Pip + Thunderclap, road seeds (i + 1) * 7919 + 13 like versus.js, and
// records every run: its fall time, its squad and distance every 5 s of the played clock, and each boss arena (how
// long it held the road, the share of the squad it cost). Two passes: no sabotage, and `mirror` (a rival of equal
// skill sends back every sabotage the autopilot sends, and the autopilot sends whenever it can, as versus.js
// --sab mirror). The driver turns the runs into src/online/botcurves.js.
// Query: ?seeds=20&profs=casual,pro&hero=pip&weapon=thunderclap&seed0=1&passes=plain,mirror
const g = window.__game, d = g.debug;
g.loop.stop();
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const q = new URLSearchParams(location.search);
const seeds = Number(q.get('seeds') || 20), seed0 = Number(q.get('seed0') || 1);
const profs = (q.get('profs') || 'casual,pro').split(',');
const passes = (q.get('passes') || 'plain,mirror').split(',');
const hero = q.get('hero') || 'pip', weapon = q.get('weapon') || 'thunderclap';
const EVERY = 5, MAX_T = 360;
d.setUpgrades({ squad: 99, damage: 99, rate: 99, tier: 99, coins: 99 }); // a versus run must ignore all of it
const { versus } = await installOnline(g, g.ui);

let arena = null, arenas = [];
const live = () => versus.live && g.run && g.run.mode === 'versus';
g.events.on('run:phase', (p) => {
  if (!live()) return;
  if (p.phase === 'boss') arena = { z: g.endless.zone, a: versus.t, n0: g.squad.count, n1: null };
  else if (p.phase === 'run' && arena) { arenas.push({ z: arena.z, dur: versus.t - arena.a, loss: arena.n0 > 0 ? (arena.n0 - (arena.n1 ?? g.squad.count)) / arena.n0 : 0 }); arena = null; }
});
g.events.on('boss:defeated', () => { if (live() && arena) arena.n1 = g.squad.count; });

const r1 = (x) => Math.round(x * 10) / 10;
const out = {};
for (const pass of passes) {
  const mirror = pass === 'mirror';
  for (const prof of profs) {
    const runs = (out[pass + ':' + prof] = []);
    for (let i = 0; i < seeds; i++) {
      const seed = (seed0 + i) * 7919 + 13;
      d.setLoadout(hero, weapon);
      d.setAutopilot(prof, seed0 + i);
      arena = null; arenas = [];
      versus.start(createTestLink({ game: g, seed, ...(mirror ? { mirror: true, rivals: [{ slot: 1, name: 'Mirror' }] } : {}) }), { hero, weapon });
      if (mirror) versus.sab.test.trust(true); // the mirror earns its big ones with my boss kills, not its scripted curve
      const n = [g.squad.count], dist = [0];
      let next = EVERY;
      while (g.run && g.run.active && g.state === 'playing' && versus.t < MAX_T) {
        versus.simulate(0.1);
        if (mirror && versus.sab.view().can) versus.sab.send();
        while (g.run && g.run.active && versus.t >= next - 1e-6) { n.push(g.squad.count); dist.push(r1(g.run.dist)); next += EVERY; }
      }
      if (arena) arenas.push({ z: arena.z, dur: versus.t - arena.a, loss: 1, died: true });
      runs.push({ seed, T: r1(versus.t), n, dist, arenas: arenas.map((x) => ({ ...x, dur: r1(x.dur), loss: Math.round(x.loss * 1000) / 1000 })), sends: versus.sab.stats.sent });
      versus.stop();
    }
  }
}
d.setAutopilot(false);
g.save.reset();
return { pass: true, hero, weapon, seeds, seed0, every: EVERY, out };
