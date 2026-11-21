// Shared setup of the tests/u2/on4-*.js scenarios (sabotage, game side: src/online/game/sab*.js). One page, no
// network, no DOM checks: the online chunk is installed the minimal way and matches are driven by the scripted link
// of src/online/game/testlink.js on its 'sim' clock (the match clock IS the simulated time, so nothing waits).
//
//   const k = await (await import('/tests/u2/lib/on4kit.js')).on4(window.__game);
//   k.start({ rivals, seed, clock, ap, trust })  -> link  a match (autopilot `ap`, default 'pro'); 3 rivals by default;
//                                                       trust: false keeps the receiver's earned check for big ones
//   k.run(seconds, each?)                             pump at 60 steps a second (each(step) after every step)
//   k.until(fn, seconds)                              pump until fn() (false when it never came)
//   k.log / k.of(type)                                every sab:* event as { type, t (played clock), clock, ...payload }
//   k.toArena() / k.killBoss()                        into the next boss arena (fighting) / that boss down, road back
//   k.tough()                                         my squad cannot lose this step (guard, a full squad)
//   k.end()                                           leaves the match, autopilot off, back to the title
export const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
export const STEP = 1 / 60;

export async function on4(g) {
  const [{ installOnline }, { createTestLink }, data] = await Promise.all([
    import('/src/online/index.js'), import('/src/online/game/testlink.js'), import('/src/online/game/sabdata.js'),
  ]);
  const d = g.debug;
  g.loop.stop();
  const { versus } = await installOnline(g, g.ui);
  const log = [];
  const T = ['sab:charge', 'sab:sent', 'sab:warn', 'sab:wait', 'sab:land', 'sab:end', 'sab:drop', 'crate:take'];
  for (const type of T) g.events.on(type, (p) => log.push({ type, t: versus.t, clock: versus.link ? versus.link.clock() : 0, ...p }));
  const peers = (ns) => ns.map((n, i) => ({ slot: i + 1, name: ['Ann', 'Bo', 'Cy'][i], curve: (t) => ({ dist: 9.3 * t, n, x: 0, form: 0, boss: 0, zone: 1, flags: 0, danger: i === 1 ? 6 : 0 }) }));

  const k = {
    g, d, versus, data, log, peers,
    get sab() { return versus.sab; },
    of: (type) => log.filter((e) => e.type === type),
    start(o = {}) {
      log.length = 0;
      d.setLoadout('pip', 'thunderclap');
      d.setAutopilot(o.ap === undefined ? 'pro' : o.ap, 1);
      const link = createTestLink({ game: g, seed: o.seed ?? 11, rivals: o.rivals || peers([30, 80, 50]), ...(o.clock ? { clock: o.clock } : {}), ...(o.link || {}) });
      versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
      // the scripted rivals send big ones long before their curve reaches a boss: skip the earned check unless a test
      // checks it (o.trust === false)
      if (o.trust !== false) versus.sab.test.trust(true);
      return link;
    },
    run(seconds, each) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n && versus.live && g.state === 'playing'; i++) { versus.pump(STEP, STEP); if (each && each(i) === false) break; }
    },
    until(fn, seconds = 30) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n && versus.live && g.state === 'playing'; i++) { if (fn()) return true; versus.pump(STEP, STEP); }
      return !!fn();
    },
    tough() { g.heroes.guard = 99; if (g.squad.count < 120) g.squad.setCount(120, 'start'); },
    toArena() {
      d.skipToBoss();
      return k.until(() => { k.tough(); return g.run.phase === 'boss' && g.boss && g.boss.state === 'fight'; }, 20);
    },
    killBoss() {
      const zone = g.endless.zone;
      d.killBoss();
      return k.until(() => { k.tough(); return g.endless.zone > zone && g.run.phase === 'run'; }, 20);
    },
    end() { if (versus.live) versus.stop({ toTitle: false }); d.setAutopilot(false); d.toTitle(); },
  };
  return k;
}
