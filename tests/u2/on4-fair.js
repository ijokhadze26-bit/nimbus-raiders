// @smoke --seconds 0 --shots 0
// Online stage 2, what a receiver refuses (src/online/game/sabotage.js onEvent), with the earned check ON:
// 1. A big one needs a boss behind it: from a rival whose states are still in zone 1 -> 'bad'; once its distance
//    passes the first boss, one is taken and the next one is 'bad' again. A normal kind sent to everyone, or a big
//    one sent to one rival -> 'bad'. Sent 500 s in the future -> 'old'.
// 2. The 5 s per-sender limit runs on the SENDER's clock: two sends 6.0 s apart that arrive 4.8 s apart (a slow
//    first one) both land; two sent 4 s apart that arrive 6 s apart -> the second is 'spam'; a forged burst (sent
//    stamps 5 s apart, all arriving at once) -> one lands, the rest 'spam'.
// 3. A RED GATE row is never put within 12 u of a gate, barrel or crate row, from anywhere on the road of zone 1.
const g = window.__game;
const { on4 } = await import('/tests/u2/lib/on4kit.js');
const k = await on4(g);
const { SAB, sabEncode } = k.data;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const why = () => k.of('sab:drop').map((x) => x.why).join();
const rival = (slot, name, dist) => ({ slot, name, curve: (t) => ({ dist: dist(t), n: 40, x: 0, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 }) });

try {
  // ---- 1. big ones need a boss; the direction of an event; the future ----
  let link = k.start({ seed: 5, trust: false, rivals: [rival(1, 'Ann', (t) => 9.3 * t), rival(2, 'Bo', (t) => 705 + 9.3 * t)] });
  k.run(2, () => k.tough());
  k.log.length = 0;
  link.test.sab(1, 11);                                   // Ann: about 20 u, no boss yet
  link.test.sab(2, 12);                                   // Bo: past the first boss
  k.run(1.2, () => k.tough());
  ok(why() === 'bad' && k.of('sab:drop')[0].from === 1 && k.of('sab:land').map((x) => x.code + '/' + x.from).join() === '12/2', `bigs by distance: ${JSON.stringify(k.log)}`);
  k.run(6, () => k.tough());
  k.log.length = 0;
  link.test.sab(2, 11);                                   // Bo's second big one with one boss behind it
  k.run(1.2, () => k.tough());
  ok(why() === 'bad' && k.of('sab:land').length === 0, `a second big one for one boss: ${JSON.stringify(k.log)}`);
  k.run(6, () => k.tough());
  k.log.length = 0;
  link.test.sab(1, 2, { to: -1 });                        // a normal kind to everyone
  k.run(6, () => k.tough());
  link.test.sab(1, 11, { to: link.slot });                // a big kind to one rival
  k.run(6, () => k.tough());
  link.test.event({ k: 's', a: sabEncode(4, link.clock() + 500), to: link.slot, f: 1, q: 800 }); // from the future
  k.run(1.2, () => k.tough());
  ok(why() === 'bad,bad,old' && k.of('sab:warn').length === 0, `direction / future: ${JSON.stringify(k.of('sab:drop'))}`);
  info.part1 = k.sab.stats;
  k.end();

  // ---- 2. the per-sender limit on the sender's clock ----
  link = k.start({ seed: 6, trust: false, rivals: k.peers([30]) });
  k.run(3, () => k.tough());
  k.log.length = 0;
  const s0 = link.clock();
  link.test.sab(1, 2, { sent: s0, lag: 1.2 });            // arrives at s0 + 1.2
  link.test.sab(1, 4, { sent: s0 + 6, lag: 0 });          // arrives at s0 + 6.0: 4.8 s after the first
  k.run(7.5, () => k.tough());
  const w2 = k.of('sab:warn');
  info.jitter = w2.map((x) => `${x.code}@${Math.round(x.clock * 100) / 100}`);
  ok(k.of('sab:land').length === 2 && why() === '' && w2.length === 2 && w2[1].clock - w2[0].clock < 5, `legit sends 6 s apart, arriving 4.8 s apart: ${JSON.stringify(k.log)}`);
  k.run(5, () => k.tough());
  k.log.length = 0;
  const s1 = link.clock();
  link.test.sab(1, 1, { sent: s1 });
  link.test.sab(1, 5, { sent: s1 + 4, lag: 2 });          // sent 4 s later, arrives 6 s later
  k.run(7, () => k.tough());
  ok(k.of('sab:land').length === 1 && why() === 'spam', `sent 4 s apart: ${JSON.stringify(k.log)}`);
  k.run(6, () => k.tough());
  k.log.length = 0;
  const s2 = link.clock();
  for (const [i, d] of [-7.5, -2.5, 1.5].entries()) link.test.event({ k: 's', a: sabEncode(1 + i, s2 + d), to: link.slot, f: 1, q: 900 + i });
  k.run(1.2, () => k.tough());
  ok(k.of('sab:warn').length === 1 && why() === 'spam,spam', `a forged burst: ${JSON.stringify(k.log)}`);
  k.end();

  // ---- 3. red gate spots keep clear of gates, barrels and crates ----
  const bad = [];
  let spots = 0;
  for (const seed of [5, 41, 77]) {
    k.start({ seed, rivals: k.peers([30]) });
    k.run(0.5, () => k.tough());
    const run = g.run, save = run.dist;
    const rows = ['gate', 'barrel', 'crate'].flatMap((t) => run.eventsOf(t).map((e) => ({ t: t + (e.kind ? ':' + e.kind : ''), at: e.at })));
    for (let d = save; d < run.length - SAB.red.preBoss - SAB.red.ahead; d += 0.5) {
      run.dist = d;
      const at = k.sab.fx.redSpot();
      if (at == null) continue;
      spots++;
      const near = rows.filter((r) => Math.abs(r.at - at) < SAB.red.clear);
      if (near.length && bad.length < 4) bad.push({ seed, d, at, near });
    }
    run.dist = save;
    k.end();
  }
  info.redSpots = spots;
  ok(spots > 100 && bad.length === 0, `red gate spots on other rows: ${JSON.stringify(bad)}`);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
