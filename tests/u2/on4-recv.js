// @smoke --seconds 0 --shots 0
// Online stage 2, sabotage receiver side (src/online/game/sabotage.js):
// 1. Each of the 7 kinds is warned at receipt and lands 1.0 s later on the played clock (within one step), also when
//    it arrives 0.4 s after it was sent (lag 0.4).
// 2. Limits: 3 from one sender inside 2 s -> 1 lands, 2 dropped 'spam'; a replay -> 'dup'; sent before my join or
//    more than 8 s ago -> 'old'; an unknown code -> 'bad'; from a fallen rival -> 'out'; a rival's out drops what it
//    sent that has not landed ('gone'); after my fall -> 'off' and nothing lands.
// 3. Boss arena: RED GATE / SPEED UP / FREEZE wait (sab:wait), warn again when the road is back and land 1.0 s
//    later; a 4th waiting -> 'full'; still waiting after 20 s -> an EXTRA WAVE (x0.3 in the arena).
const g = window.__game;
const { on4, near, STEP } = await import('/tests/u2/lib/on4kit.js');
const k = await on4(g);
const { SAB, sabEncode } = k.data;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const r2 = (x) => Math.round(x * 1000) / 1000;

try {
  // ---- 1. timing of every kind ----
  const timing = [];
  for (const lag of [0, 0.4]) {
    const link = k.start({ seed: 5 });
    k.run(4, () => k.tough());
    for (const code of [1, 2, 3, 4, 5, 11, 12]) {
      // one sender per kind slot, 5 s apart: never 'spam'
      const slot = 1 + (code % 3);
      k.log.length = 0;
      const e = link.test.sab(slot, code, { lag });
      const sentAt = link.clock();
      k.until(() => { k.tough(); return k.of('sab:land').length > 0; }, 3);
      const w = k.of('sab:warn')[0], l = k.of('sab:land')[0];
      const row = { lag, code, recv: w ? r2(w.clock - sentAt) : null, land: w && l ? r2(l.t - w.t) : null, again: w && w.again, big: w && w.big, name: w && w.name };
      timing.push(row);
      ok(w && l && l.id === w.id && w.code === code && l.code === code && w.lands === 1 && w.from === slot, `kind ${code} lag ${lag}: ${JSON.stringify(row)}`);
      ok(row.land != null && row.land >= 1 - 1e-6 && row.land <= 1 + STEP + 1e-6, `kind ${code} lag ${lag} landed ${row.land} s after receipt`);
      ok(row.recv != null && row.recv >= lag - 1e-6 && row.recv <= lag + 0.1 + STEP, `kind ${code} lag ${lag} received ${row.recv} s after it was sent`);
      ok(w && w.big === (code >= 11) && w.name === ['Ann', 'Bo', 'Cy'][slot - 1] && !w.again, `warn payload of ${code}: ${JSON.stringify(w)}`);
      ok(e.a === code + 100 * Math.floor(sentAt * 10 + 1e-6) || e.a === code + 100 * Math.floor((sentAt - STEP) * 10 + 1e-6), `test.sab a = ${e.a} at ${sentAt}`);
      k.run(5.1, () => k.tough()); // timed effects end, the sender may send again
    }
    k.end();
  }
  info.timing = timing.map((r) => `${r.lag}/${r.code}: recv ${r.recv} land ${r.land}`).join('; ');

  // ---- 2. limits ----
  let link = k.start({ seed: 6 });
  k.run(3, () => k.tough());
  k.log.length = 0;
  link.test.sab(1, 2);
  k.run(0.7, () => k.tough());
  link.test.sab(1, 4);
  k.run(0.7, () => k.tough());
  link.test.sab(1, 1);
  k.run(2, () => k.tough());
  const spam = k.of('sab:drop').filter((x) => x.why === 'spam');
  ok(k.of('sab:land').length === 1 && k.of('sab:land')[0].code === 2 && spam.length === 2 && spam.map((x) => x.code).join() === '4,1', `spam: lands ${k.of('sab:land').length}, drops ${JSON.stringify(k.of('sab:drop'))}`);
  // a replay of the landed one
  k.log.length = 0;
  link.test.dupe(link.test.delivered[0]);
  k.run(1.2, () => k.tough());
  ok(k.of('sab:drop').length === 1 && k.of('sab:drop')[0].why === 'dup' && k.of('sab:land').length === 0, `replay: ${JSON.stringify(k.log)}`);
  // old: sent 9 s ago; an unknown code
  k.run(3, () => k.tough());
  k.log.length = 0;
  link.test.sab(2, 2, { sent: link.clock() - 9 });
  link.test.sab(3, 7);
  k.run(1.2, () => k.tough());
  ok(k.of('sab:drop').map((x) => x.why).join() === 'old,bad' && k.of('sab:land').length === 0, `old / bad: ${JSON.stringify(k.of('sab:drop'))}`);
  // a rival's out drops its pending one; a fallen rival's later ones are 'out'
  k.run(5.5, () => k.tough());
  k.log.length = 0;
  link.test.sab(2, 2);
  k.run(0.3, () => k.tough());
  link.test.rivalFall(2);
  k.run(1.2, () => k.tough());
  link.test.sab(2, 4);
  k.run(1.2, () => k.tough());
  ok(k.of('sab:warn').length === 1 && k.of('sab:land').length === 0 && k.of('sab:drop').map((x) => x.why).join() === 'gone,out', `gone / out: ${JSON.stringify(k.log)}`);
  // after my fall: everything pending is dropped, nothing lands, later ones are 'off'
  k.log.length = 0;
  link.test.sab(3, 5);
  k.run(0.3, () => k.tough());
  g.squad.setCount(0, 'test');
  link.test.sab(1, 2);
  k.run(1.5);
  ok(k.of('sab:land').length === 0 && k.of('sab:drop').map((x) => x.why).join() === 'off,off' && g.runMods.holdFn === null, `after my fall: ${JSON.stringify(k.log)}`);
  k.end();
  // sent before my join (joinT = link.clock() at versus.start, about -4 in a real match): the rule with a join at 6 s
  link = k.start({ seed: 6 });
  ok(k.sab.joinT === 0, `joinT ${k.sab.joinT} (the sim clock starts at 0)`);
  k.run(7, () => k.tough());
  k.sab.joinT = 6;
  k.log.length = 0;
  link.test.sab(1, 2, { sent: 4.9 });
  link.test.sab(2, 2, { sent: 5.1 });
  k.run(1.2, () => k.tough());
  ok(k.of('sab:drop').map((x) => x.why).join() === 'old' && k.of('sab:drop')[0].from === 1 && k.of('sab:land').length === 1, `before my join: ${JSON.stringify(k.log)}`);
  // raw events with a broken `a`, and other kinds (emotes later) are not sabotage
  k.log.length = 0;
  k.run(5, () => k.tough());
  link.test.event({ k: 's', a: -5, to: 0, f: 3, q: 99 });
  link.test.event({ k: 'e', a: sabEncode(2, 20), to: 0, f: 3, q: 98 });
  k.run(1.2, () => k.tough());
  ok(k.of('sab:drop').map((x) => x.why).join() === 'bad' && k.of('sab:warn').length === 0, `broken event: ${JSON.stringify(k.log)}`);
  k.end();

  // ---- 3. boss arena ----
  link = k.start({ seed: 8 });
  k.run(3, () => k.tough());
  ok(k.toArena(), 'never reached the arena');
  k.log.length = 0;
  link.test.sab(1, 3); link.test.sab(2, 4); link.test.sab(3, 5);
  k.run(0.5, () => k.tough());
  ok(k.of('sab:warn').length === 3 && k.of('sab:wait').length === 3 && k.sab.view().incoming === 3, `arena: warn ${k.of('sab:warn').length}, wait ${k.of('sab:wait').length}`);
  k.run(5, () => { k.tough(); if (g.boss) g.boss.hp = g.boss.maxHp; });
  link.test.sab(1, 2);
  k.run(0.2, () => k.tough());
  ok(k.of('sab:drop').map((x) => x.why).join() === 'full', `a 4th waiting: ${JSON.stringify(k.of('sab:drop'))}`);
  // a wave in the arena is x0.3
  const waves = [];
  const wave0 = k.versus.ramp.wave;
  k.versus.ramp.wave = function w(n, h, e) { waves.push(n); return wave0.call(this, n, h, e); };
  // the boss falls 2 s in: the road is back, the three warn again and land 1.0 s later
  k.run(1, () => { k.tough(); if (g.boss) g.boss.hp = g.boss.maxHp; });
  ok(k.of('sab:land').length === 0, 'something needing the road landed in the arena');
  k.log.length = 0;
  ok(k.killBoss(), 'the boss did not fall');
  const tRoad = k.versus.t;
  k.until(() => { k.tough(); return k.of('sab:land').length >= 3; }, 4);
  const again = k.of('sab:warn').filter((x) => x.again), lands = k.of('sab:land');
  const dt = lands.map((l) => { const w = again.find((x) => x.id === l.id); return w ? r2(l.t - w.t) : null; });
  info.arena = { again: again.map((x) => x.code), lands: lands.map((x) => x.code), dt, after: r2(again.length ? again[0].t - tRoad : -1) };
  ok(again.length === 3 && lands.length === 3 && dt.every((x) => x != null && x >= 1 - 1e-6 && x <= 1 + STEP + 1e-6) && again[0].t - tRoad < 0.1, `back on the road: ${JSON.stringify(info.arena)}`);
  ok(g.runMods.holdFn !== null && k.sab.view().frozen > 0 && k.sab.view().speed > 0, 'freeze / speed did not run after the arena');
  k.run(2.5, () => k.tough());
  ok(g.runMods.holdFn === null, 'the freeze did not end');
  // still waiting after 20 s -> an EXTRA WAVE, arena-scaled
  k.run(5, () => k.tough());
  ok(k.toArena(), 'never reached the second arena');
  k.log.length = 0; waves.length = 0;
  link.test.sab(2, 4);
  let landPhase = null;
  const offPh = g.events.on('sab:land', () => { landPhase = g.run.phase; });
  k.until(() => { k.tough(); if (g.boss) g.boss.hp = g.boss.maxHp; return k.of('sab:land').length > 0; }, 23);
  offPh();
  const w2 = k.of('sab:warn'), l2 = k.of('sab:land')[0], wt = k.of('sab:wait')[0];
  const turned = w2.find((x) => x.again);
  const full = Math.max(SAB.wave.min, Math.min(SAB.wave.max, Math.round(SAB.wave.frac * g.endless.gen.knobs(g.run.dist).E)));
  const want = Math.max(SAB.arenaMin, Math.round(full * SAB.arenaMul));
  info.turned = { landPhase, full, wait: wt && r2(wt.t), turned: turned && r2(turned.t), land: l2 && r2(l2.t), code: l2 && l2.code, count: l2 && l2.count, want, waves: waves.slice() };
  ok(wt && turned && turned.code === 1 && near(turned.t - wt.t, 20, STEP + 1e-6) && l2 && l2.code === 1 && near(l2.t - turned.t, 1, STEP + 1e-6), `a waiting one after 20 s: ${JSON.stringify(info.turned)}`);
  ok(l2 && landPhase === 'boss' && l2.count === want && waves.includes(want) && want < full, `arena wave count: ${JSON.stringify(info.turned)}`);
  k.versus.ramp.wave = wave0;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
