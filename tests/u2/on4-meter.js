// @smoke --seconds 0 --shots 0
// Online stage 2, sabotage sender side (src/online/game/sabotage.js):
// 1. The meter fills by kills x combo.mul every step (checked step by step, scripted extra kills on top of the
//    autopilot's); the charges cost 60 / 100 / 140 ... (sabCost of the normal sends so far); at most 2 are stored.
// 2. A sabotage crate (crate:take kind 'sabotage') gives +1 (lost with 2 stored); a boss kill gives HORDE STORM,
//    another boss kill while it is held gives nothing, the next one after a send gives BLACKOUT.
// 3. One send per 6 s; nothing before GO or after my fall; a normal one hits the alive rival with the largest squad,
//    a big one goes to -1 (every rival); the event's `a` is the code plus my match clock in tenths.
// 4. The order of the loaded kinds is a shuffled cycle from the seed: the same for two links with the same seed.
const g = window.__game;
const { on4, near } = await import('/tests/u2/lib/on4kit.js');
const k = await on4(g);
const { SAB, sabCost, sabDecode } = k.data;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };

try {
  // ---- 1. fill accounting, costs, the store ----
  let link = k.start({ seed: 21 });
  const sab = k.sab;
  ok(!sab.view().on && sab.send().why === 'off', 'a send before the first step (countdown) must be off');
  const costs = [], bad = [];
  k.end();

  // step-by-step: fill' = fill + dk * combo.mul (minus the cost at a charge, the rest kept), costs 60 / 100 / 140
  link = k.start({ seed: 21 });
  let prev = { fill: 0, ready: 0, kills: 0, sent: 0, crates: 0 };
  const crates = () => k.log.filter((e) => e.type === 'sab:charge' && e.source === 'crate').length;
  k.run(140, (i) => {
    k.tough();
    if (g.run.phase === 'boss' && g.boss && g.boss.state === 'fight') g.debug.killBoss();
    const run = g.run, dk = run.kills - prev.kills, add = dk * g.combo.mul;
    if (crates() !== prev.crates) { /* a sabotage crate on the road was taken this step */ }
    else if (sab.ready === prev.ready && prev.ready < 2) { if (!near(sab.fill, prev.fill + add, 1e-6)) bad.push({ t: k.versus.t, fill: sab.fill, want: prev.fill + add }); }
    else if (sab.ready === prev.ready + 1 && sab.ready < 2) costs.push({ cost: Math.round((prev.fill + add - sab.fill) * 1e6) / 1e6, sent: sab.sent });
    else if (sab.ready === 2 && sab.fill !== 0) bad.push({ t: k.versus.t, full: sab.fill });
    // send at once whenever one is stored (6 s apart): the next costs more
    if (sab.ready >= 1 && sab.view().can) sab.send();
    prev = { fill: sab.fill, ready: sab.ready, kills: run.kills, sent: sab.sent, crates: crates() };
    if (run.active && i % 12 === 0) run.kills += 1; // scripted kills (counted by the combo and the meter next step)
    return costs.length < 4;
  });
  info.costs = costs; info.pass2 = { t: k.versus.t, live: k.versus.live, state: g.state, phase: g.run && g.run.phase, sent: sab.sent, ready: sab.ready, fill: sab.fill, log: k.log.filter((e) => e.type !== 'crate:take').slice(0, 12).map((e) => [e.type, Math.round(e.t * 10) / 10, e.source || e.why || '', e.code]) };
  ok(bad.length === 0, `fill accounting broken: ${JSON.stringify(bad.slice(0, 4))}`);
  ok(costs.length >= 3 && costs.every((c) => near(c.cost, sabCost(c.sent), 1e-6)) && costs[0].cost === 60 && costs.some((c) => c.cost === 100) && costs.some((c) => c.cost === 140), `charge costs: ${JSON.stringify(costs)}`);
  ok([0, 1, 2, 3, 4, 5, 9].map(sabCost).join() === '60,100,140,180,220,240,240', 'sabCost table');

  // the store: no sends, the meter fills to 2 and holds (fill 0, view fill 1, charge 35)
  sab.test.clear();
  ok(k.until(() => { k.tough(); g.run.kills += 3; return sab.ready === 2; }, 60), 'the meter never stored 2');
  k.run(2, () => { k.tough(); g.run.kills += 3; });
  let v = sab.view();
  ok(sab.ready === 2 && sab.fill === 0 && v.fill === 1 && sab.charge() === 35 && v.ready === 2, `the store of 2: ${JSON.stringify({ ready: sab.ready, fill: sab.fill, v: v.fill })}`);

  // ---- 2. crate, boss ----
  k.log.length = 0;
  g.events.emit('crate:take', { kind: 'sabotage', weapon: 'voidsiphon', pos: { x: 0, y: 1, z: 0 } });
  let ch = k.of('sab:charge').at(-1);
  ok(ch && ch.source === 'crate' && ch.lost === true && sab.ready === 2, `crate with 2 stored: ${JSON.stringify(ch)}`);
  sab.test.clear();
  g.events.emit('crate:take', { kind: 'sabotage', weapon: 'voidsiphon', pos: { x: 0, y: 1, z: 0 } });
  ch = k.of('sab:charge').at(-1);
  ok(ch && ch.source === 'crate' && !ch.lost && ch.ready === 1 && sab.ready === 1, `crate +1: ${JSON.stringify(ch)}`);
  g.events.emit('crate:take', { weapon: 'thunderclap', pos: { x: 0, y: 1, z: 0 } }); // a weapon crate gives nothing
  ok(sab.ready === 1, 'a weapon crate gave a sabotage charge');
  sab.test.clear();
  const zone0 = g.endless.zone;
  ok(k.toArena() && k.killBoss(), 'first boss: arena / kill');
  ch = k.of('sab:charge').filter((c) => c.source === 'boss');
  ok(ch.length === 1 && ch[0].code === SAB.code.storm && !ch[0].lost && sab.big === SAB.code.storm && g.endless.zone === zone0 + 1 && sab.view().big === 11, `boss kill -> HORDE STORM: ${JSON.stringify(ch)}`);
  ok(k.toArena() && k.killBoss(), 'second boss: arena / kill');
  ch = k.of('sab:charge').filter((c) => c.source === 'boss');
  ok(ch.length === 2 && ch[1].lost === true && sab.big === SAB.code.storm, `a second boss kill while one is held: ${JSON.stringify(ch)}`);
  // a big send goes first, to -1; the next boss gives BLACKOUT
  sab.test.give(); sab.lastSend = -Infinity;
  k.log.length = 0;
  let r = sab.send();
  const evBig = link.test.events.at(-1);
  ok(r.ok && r.big && r.code === 11 && r.to === -1 && evBig.k === 's' && evBig.to === -1 && sabDecode(evBig.a).code === 11 && sab.big === 0 && sab.ready === 1, `big send: ${JSON.stringify(r)} ${JSON.stringify(evBig)}`);
  const sent = k.of('sab:sent')[0];
  ok(sent && sent.big && sent.to.join() === '1,2,3' && sent.names.join() === 'Ann,Bo,Cy', `sab:sent of a big one: ${JSON.stringify(sent)}`);
  ok(k.toArena() && k.killBoss(), 'third boss: arena / kill');
  ok(sab.big === SAB.code.blackout, `third boss after a big send gave ${sab.big}`);

  // ---- 3. the 6 s gap, targeting, the event, my fall ----
  sab.test.clear(); sab.test.give(undefined, 2);
  r = sab.send();
  const ev1 = link.test.events.at(-1), dec = sabDecode(ev1.a);
  ok(r.ok && !r.big && r.to === 2 && ev1.to === 2 && dec.code === r.code && Math.abs(dec.sent - link.clock()) < 0.11 && dec.sent <= link.clock(), `normal send to the largest squad (Bo, 80): ${JSON.stringify(r)} ${JSON.stringify(ev1)} clock ${link.clock()}`);
  v = sab.view();
  ok(v.target === 2 && v.targetDanger === 6 && !v.can && v.wait > 5.9 && v.ready === 1, `view after a send: ${JSON.stringify(v)}`);
  r = sab.send();
  ok(!r.ok && r.why === 'wait', `a second send at once: ${JSON.stringify(r)}`);
  k.run(5.9, () => k.tough());
  ok(!sab.send().ok, 'sent again before 6 s');
  k.run(0.15, () => k.tough());
  ok(sab.view().wait === 0 && sab.view().can && sab.send().ok, `no send after 6 s: wait ${sab.view().wait}`);
  // Bo falls: the next normal one goes to Cy (50) over Ann (30); everyone out: 'nobody'
  link.test.rivalFall(2);
  sab.test.give(); sab.lastSend = -Infinity;
  r = sab.send();
  ok(r.ok && r.to === 3, `after Bo fell, a normal one went to ${r.to}`);
  link.test.rivalFall(3); link.test.rivalFall(1, {});
  // (the referee would decide now: this test only needs the view in the moment before)
  ok(sab.view().target === null || !k.versus.live, 'target with nobody alive');
  k.end();

  // my fall: nothing more is sent
  link = k.start({ seed: 21 });
  k.run(3);
  sab.test.give(undefined, 2);
  g.squad.setCount(0, 'test');
  const n0 = link.test.events.length;
  r = sab.send();
  ok(!r.ok && r.why === 'off' && !sab.view().on && link.test.events.length === n0, `a send after my fall: ${JSON.stringify(r)}`);
  k.end();

  // ---- 4. the cycle ----
  const order = (seed) => {
    k.start({ seed });
    k.run(1);
    const out = [];
    for (let i = 0; i < 15; i++) { k.sab.test.give(); k.sab.lastSend = -Infinity; const s = k.sab.send(); out.push(s.code); }
    k.end();
    return out;
  };
  const a1 = order(77), a2 = order(77), b = order(78), c = order(79);
  info.cycle = { a1: a1.join(''), b: b.join(''), c: c.join('') };
  const perm = (x) => x.slice().sort().join('') === '12345';
  ok(a1.join() === a2.join(), `same seed, different order: ${a1} vs ${a2}`);
  ok(perm(a1.slice(0, 5)) && perm(a1.slice(5, 10)) && perm(a1.slice(10, 15)), `not a cycle of the 5 kinds: ${a1}`);
  ok(a1.join() !== b.join() || a1.join() !== c.join(), 'three seeds gave the same order');
  // test.give(code) loads that kind for the next send
  k.start({ seed: 77 });
  k.run(1);
  k.sab.test.give(SAB.code.freeze);
  ok(k.sab.view().next === 5 && k.sab.send().code === 5, 'test.give(5) did not load FREEZE');
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
