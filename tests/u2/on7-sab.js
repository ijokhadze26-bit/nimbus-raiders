// @smoke --seconds 0 --shots 0
// Online stage 3, sabotage both ways with the scripted rival (src/online/bot.js), my receiver's earned check ON:
// 1. It sends: the first normal one at 28-40 s, then every 18-35 s (30 plans), never two within 6 s in a match; a BIG
//    one after each of its boss kills, accepted by my receiver (no 'bad' / 'spam' / 'old' / 'out' drop at all).
// 2. Mine land on it 1.0 s after it receives them (+- one 0.1 s sample): FOG, WAVE, FREEZE -> the next bundles show
//    the squad dip (WAVE), the danger, flags bit 2, bit 3 and a held lane (FREEZE); its fall time shrinks by
//    react.slice[code] x sliceK (whole tenths, rounded up).
// 3. A road kind (RED GATE) arriving in its boss arena waits for the arena end, then lands.
const g = window.__game;
const { on7 } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { versus, BOT } = k;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const log = [];
for (const type of ['sab:warn', 'sab:land', 'sab:drop']) g.events.on(type, (p) => log.push({ type, t: versus.t, ...p }));

try {
  // ---- 1a. the schedule of 30 plans ----
  const bad = [];
  for (let seed = 100; seed < 130; seed++) {
    const N = k.plan.makePlan(seed, { level: (seed % 7) - 3 }).normals;
    if (!(N[0].due >= 28 && N[0].due <= 40)) bad.push(`seed ${seed}: first at ${N[0].due}`);
    for (let i = 1; i < N.length; i++) { const gap = N[i].due - N[i - 1].due; if (gap < 18 - 0.051 || gap > 35 + 0.051) bad.push(`seed ${seed}: gap ${gap.toFixed(2)}`); }
    if (new Set(N.slice(0, 5).map((x) => x.code)).size !== 5) bad.push(`seed ${seed}: the first five are not the five kinds`);
  }
  ok(!bad.length, 'schedule: ' + bad.slice(0, 5).join('; '));

  // ---- 1b + 2 + 3: one long match ----
  const seed = 51, pick = k.pick(seed, 0);
  const link = k.start({ seed, pick, fallAt: 300, ap: 'pro' });
  const base = k.plan.makePlan(seed, pick);
  const A1 = link.bot.plan.arenas[0];
  const mine = [];
  const plan = [[20, 2], [30, 1], [40, 5], [A1.a + 1, 3]];
  let pi = 0;
  k.until(() => {
    k.tough();
    if (g.run.phase === 'boss' && g.boss && g.boss.state === 'fight') k.d.killBoss();
    if (pi < plan.length && versus.simT >= plan[pi][0]) { const r = k.sendMine(plan[pi][1]); mine.push({ at: versus.simT, code: plan[pi][1], ok: r.ok, why: r.why }); pi++; }
    return versus.simT >= 150;
  }, 160);
  ok(mine.length === 4 && mine.every((m) => m.ok), 'my sends: ' + JSON.stringify(mine));
  const ev = link.bot.test.events;
  info.sent = ev.map((e) => (e.big ? 'BIG ' : '') + e.code + '@' + e.t).join(', ');
  ok(ev.length >= 4 && ev.every((e, i) => !i || e.t - ev[i - 1].t >= 6 - 1e-6), 'its sends closer than 6 s: ' + info.sent);
  const norm = ev.filter((e) => !e.big);
  ok(norm[0] && norm[0].t >= 28 && norm[0].t <= 40, 'its first send at ' + (norm[0] && norm[0].t));
  ok(norm.every((e, i) => !i || (e.t - norm[i - 1].t >= 18 - 0.051 && e.t - norm[i - 1].t <= 35 + 0.051)), 'its normal gaps: ' + norm.map((e) => e.t).join(' '));
  const kills = link.bot.plan.arenas.filter((A) => A.b < 149);
  const bigs = ev.filter((e) => e.big);
  ok(kills.length >= 2 && bigs.length === kills.length && bigs.every((b, i) => b.t >= kills[i].b + BOT.sab.bigAfter - 1e-6 && b.code === (i % 2 ? 12 : 11)), `bigs ${bigs.map((b) => b.code + '@' + b.t).join(' ')} after kills ${kills.map((A) => A.b).join(' ')}`);
  const fromBot = log.filter((x) => x.from === 1);
  const warnsBig = fromBot.filter((x) => x.type === 'sab:warn' && x.big && !x.again);
  ok(warnsBig.length === bigs.length, `my receiver took ${warnsBig.length} of its ${bigs.length} big ones`);
  const drops = fromBot.filter((x) => x.type === 'sab:drop');
  ok(!drops.length && versus.sab.trust === false, 'my receiver dropped: ' + JSON.stringify(drops));
  ok(fromBot.filter((x) => x.type === 'sab:warn' && !x.again).length === ev.length, `warned ${fromBot.filter((x) => x.type === 'sab:warn' && !x.again).length} of ${ev.length}`);

  // ---- 2. mine on it ----
  const L = link.bot.test.landed, S = k.rec.states, R = BOT.react, sliceK = link.bot.plan.sliceK;
  info.landed = L.map((x) => `${x.code}: recv ${x.recv.toFixed(2)} at ${x.at.toFixed(2)} applied ${x.t} T ${x.T0}->${x.T}`).join('; ');
  ok(L.length === 4, 'landed on it: ' + L.length);
  for (const x of L.filter((y) => y.code !== 3)) {
    const late = x.t - x.recv;
    ok(late >= R.delay - 1e-6 && late <= R.delay + 0.1 + 1e-6, `${x.code} landed ${late.toFixed(3)} s after receipt`);
    const want = R.slice[x.code] * sliceK;
    ok(Math.abs(x.T0 - x.T - want) <= 0.1 + 1e-6, `${x.code}: T ${x.T0} -> ${x.T}, slice ${want.toFixed(3)}`);
    const next = S.filter((st) => st.s.t >= x.t - 1e-6 && st.s.t <= x.t + 0.6);
    ok(next.length >= 1 && next.every((st) => st.s.flags & 4), `${x.code}: bit 2 missing in the next bundles`);
    if (x.code === 1) {
      const dip = next.every((st) => st.s.n <= Math.round(base.squad(st.s.t) * (1 - 0.8 * R.dip[1])) + 1) && next.every((st) => st.s.danger >= Math.round(9 * R.dip[1] * R.dangerK * 0.9));
      ok(dip, `WAVE: no dip: ${next.map((st) => `${st.s.n}/${Math.round(base.squad(st.s.t))} d${st.s.danger}`).join(' ')}`);
    }
    if (x.code === 5) {
      const held = S.filter((st) => st.s.t >= x.t + 0.3 && st.s.t <= x.t + 1.8), xs = held.flatMap((st) => st.s.xs);
      ok(held.length && held.every((st) => st.s.flags & 8) && Math.max(...xs) - Math.min(...xs) < 0.01, `FREEZE: lane not held / bit 3 (${xs.map((v) => v.toFixed(2)).join(' ')})`);
    }
  }
  // ---- 3. RED GATE in its arena ----
  const red = L.find((x) => x.code === 3);
  ok(red && red.recv >= A1.a && red.recv < A1.b && red.at >= A1.b - 1e-6 && red.t >= A1.b - 1e-6 && red.t <= A1.b + 0.1 + 1e-6, `RED GATE in its arena ${A1.a}-${A1.b}: ${JSON.stringify(red)}`);
  info.arena = `${A1.a}-${A1.b}`;
  k.end();
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
}
k.bot.botForm.reset();
return { pass: fails.length === 0, fails, info };
