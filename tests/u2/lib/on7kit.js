// Shared setup of the tests/u2/on7-*.js scenarios (the scripted Quick Match rival: src/online/bot*.js). One page, no
// network: the online chunk is installed the minimal way (installOnline, game side), matches run on the bot link with
// `clock: () => versus.simT` (the match clock IS the simulated time, so nothing waits), the autopilot plays me.
//
//   const k = await (await import('/tests/u2/lib/on7kit.js')).on7(window.__game);
//   k.start({ seed, level, ap, apSeed, pick, fallAt })  -> link   a match against the bot (autopilot `ap`, default
//                                                      'casual'; `fallAt` forces the bot's fall time)
//   k.solo({ seed, level, c0 })     -> { link, rec, step(s), clock }   the bot link alone on a hand clock that starts
//                                   at c0 (default -4: the countdown), no game run (its lane weaves: no gate rows)
//   k.rec                           what the current match's link emitted: states [{ c, slot, s }], outs, verdicts,
//                                   events (each with the clock at emission)
//   k.run(seconds, each?) / k.until(fn, seconds)   pump at 60 steps a second
//   k.tough()                       my squad cannot lose this step; k.killBoss() my boss down, the road back
//   k.sendMine(code)                I send sabotage `code` now (sab.test.give + sab.send) -> the send result
//   k.end()                         leaves the match, autopilot off, back to the title
export const STEP = 1 / 60;

export async function on7(g) {
  const [{ installOnline }, bot, plan, data, curves, names, codec, verdict, sab] = await Promise.all([
    import('/src/online/index.js'), import('/src/online/bot.js'), import('/src/online/botplan.js'), import('/src/online/botdata.js'),
    import('/src/online/botcurves.js'), import('/src/online/botnames.js'), import('/src/online/codec.js'), import('/src/online/verdict.js'),
    import('/src/online/game/sabdata.js'),
  ]);
  const d = g.debug;
  g.loop.stop();
  const { versus } = await installOnline(g, g.ui);
  const recorder = (link, clock) => {
    const rec = { states: [], outs: [], verdicts: [], events: [] };
    link.on('state', (slot, s) => rec.states.push({ c: clock(), slot, s }));
    link.on('out', (slot, o) => rec.outs.push({ c: clock(), slot, ...o }));
    link.on('verdict', (v) => rec.verdicts.push({ c: clock(), ...v }));
    link.on('event', (e) => rec.events.push({ c: clock(), ...e }));
    return rec;
  };

  const k = {
    g, d, versus, bot, plan, BOT: data.BOT, BOT_CURVES: curves.BOT_CURVES, names, codec, verdict, sab, rec: null,
    pick: (seed, level = 0) => ({ ...bot.pickBot({ seed, avoid: 'Nino' }), level }),
    start(o = {}) {
      d.setLoadout('pip', 'thunderclap');
      d.setAutopilot(o.ap === undefined ? 'casual' : o.ap, o.apSeed ?? 1);
      const seed = o.seed ?? 7;
      const link = bot.createBotLink({ seed, pick: o.pick || k.pick(seed, o.level ?? 0), game: g, clock: () => versus.simT });
      if (o.fallAt != null) link.bot.test.fallAt(o.fallAt);
      versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
      k.rec = recorder(link, () => link.clock());
      return link;
    },
    solo(o = {}) {
      let c = o.c0 ?? -4;
      const seed = o.seed ?? 7;
      const link = bot.createBotLink({ seed, pick: o.pick || k.pick(seed, o.level ?? 0), game: null, clock: () => c });
      const rec = recorder(link, () => c);
      return {
        link, rec,
        get clock() { return c; },
        step(seconds, each) { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) { c += STEP; link.push({ t: Math.max(0, c) }); link.tick(); if (each && each(c) === false) break; } },
      };
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
    tough() { g.heroes.guard = 99; if (g.run && g.run.active && g.squad.count < 120) g.squad.setCount(120, 'start'); },
    killBoss() {
      const zone = g.endless.zone;
      d.killBoss();
      return k.until(() => { k.tough(); return g.endless.zone > zone && g.run.phase === 'run'; }, 20);
    },
    sendMine(code) {
      versus.sab.test.give(code);
      return versus.sab.send();
    },
    end() { if (versus.live) versus.stop({ toTitle: false }); d.setAutopilot(false); d.toTitle(); },
  };
  return k;
}

/** Deep equality of two decoded states (numbers within 1e-9). */
export function same(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((x) => same(a[x], b[x]));
}
