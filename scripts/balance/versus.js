// @smoke --seconds 0 --shots 0
// In-page part of the online survival calibration (driver: scripts/balance/versus.mjs). Runs the autopilot profiles
// through versus matches with no rival (scripted link, src/online/game/testlink.js), shop upgrades off as in every
// online match, and returns the survival time of every run.
// Query: ?seeds=10&profs=casual,pro&hero=pip&weapon=thunderclap&seed0=1&max=360&vs=<JSON merged over VS (vsdata.js)>
//        &sab=mirror: one scripted rival of equal skill sends back every sabotage I send (testlink `mirror: true`), and
//        the bot sends whenever sab.view().can (checked every 0.1 s). Fog / blackout are visual only: the autopilot
//        does not see them, so a real player suffers more than this measures.
const g = window.__game, d = g.debug;
g.loop.stop();
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { VS } = await import('/src/online/game/vsdata.js');
const q = new URLSearchParams(location.search);
const seeds = Number(q.get('seeds') || 10), seed0 = Number(q.get('seed0') || 1), maxT = Number(q.get('max') || 360);
const profs = (q.get('profs') || 'casual,pro').split(',');
const hero = q.get('hero') || 'pip', weapon = q.get('weapon') || 'thunderclap';
const mirror = q.get('sab') === 'mirror';
const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } };
if (q.get('vs')) merge(VS, JSON.parse(q.get('vs')));
// a save full of shop upgrades and bought Raider types: a versus run must ignore all of it
d.setUpgrades({ squad: 99, damage: 99, rate: 99, tier: 99, coins: 99 });
const { versus } = await installOnline(g, g.ui);
const runs = [];
let reason = '';
g.events.on('squad:change', (p) => { if (p.delta < 0) reason = p.reason; });
for (const prof of profs) {
  for (let i = 0; i < seeds; i++) {
    const seed = (seed0 + i) * 7919 + 13;
    d.setLoadout(hero, weapon);
    d.setAutopilot(prof, seed0 + i);
    versus.start(createTestLink({ game: g, seed, ...(mirror ? { mirror: true, rivals: [{ slot: 1, name: 'Mirror' }] } : {}) }), { hero, weapon });
    if (mirror) versus.sab.test.trust(true); // the mirror earns its big ones with my boss kills, not its scripted curve
    const marks = {};
    let peak = 0, next = 30;
    while (g.run && g.run.active && g.state === 'playing' && versus.t < maxT) {
      if (!mirror) versus.simulate(1);
      else for (let s = 0; s < 10 && g.run && g.run.active && g.state === 'playing'; s++) { versus.simulate(0.1); if (versus.sab.view().can) versus.sab.send(); }
      peak = Math.max(peak, g.squad.count);
      if (versus.t >= next) { marks[next] = g.squad.count; next += 30; }
    }
    runs.push({ prof, seed, t: Math.round(versus.t * 10) / 10, alive: !!(g.run && g.run.active), d: versus.metres(), zone: g.endless.zone, mk: g.weapons.mk, peak, by: reason, marks, ramp: { ...versus.ramp.stats }, sab: mirror ? { sent: versus.sab.stats.sent, landed: versus.sab.stats.landed } : null });
    versus.stop();
  }
}
d.setAutopilot(false);
g.save.reset();
return { pass: true, hero, weapon, sab: mirror ? 'mirror' : null, vs: JSON.parse(JSON.stringify(VS)), runs };
