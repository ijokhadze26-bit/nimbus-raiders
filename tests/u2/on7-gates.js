// @smoke --seconds 0 --shots 0
// Online stage 3, the scripted rival steers at the REAL gate rows of my road (src/online/botplan.js nextRow /
// laneStep): same seed = the same rows, ramp.js has already reddened them, the better side by ramp.js worth().
// 1. Level 0: it goes through the rows of my road one after the other (its distance crosses each row's `at`), on the
//    better side's lane in >= 70 % of them (20+ rows), never faster than BOT.steer.speed u/s across the road, never
//    outside +-4.75.
// 2. Level -3: on the worse side at least once in 20 rows.
// 3. A red gate row a sabotage spliced onto MY road (`sab: true`) is ignored: never aimed at, never recorded.
// 4. The rows it drives through move its squad (BOT.gate): up just after a better-side row, down after a wrong one,
//    in most rows (its squad curve moves too, so not in every one).
const g = window.__game;
const { on7 } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { versus, BOT } = k;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const side = (x, best) => Math.sign(x) === Math.sign(best) && Math.abs(x) >= 1.0;

function play(level, seeds, want) {
  const rows = [], sabAts = new Set(), speed = [];
  let roadRows = 0, aimedSab = 0;
  for (const seed of seeds) {
    const link = k.start({ seed, level, fallAt: 300, ap: 'pro' });
    let spliced = false, prev = null;
    k.until(() => {
      k.tough();
      if (g.run.phase === 'boss' && g.boss && g.boss.state === 'fight') k.d.killBoss();
      // one sabotage red gate on my road, ahead of both of us (the real effect: sabeffects.js splices two -N gates)
      if (!spliced && versus.t > 12 && g.run.phase === 'run' && versus.sab.fx.canLand(3)) {
        versus.sab.fx.land(3);
        for (const e of g.run.eventsOf('gate')) if (e.sab) sabAts.add(e.at);
        spliced = true;
      }
      return link.bot.test.rows.length >= want || versus.t > 200;
    }, 220);
    const recs = link.bot.test.rows;
    (info.ends ||= []).push(`seed ${seed}: ${recs.length} rows, t ${versus.t.toFixed(1)}, bot d ${k.rec.states.length ? Math.round(k.rec.states[k.rec.states.length - 1].s.dist) : 0}, my d ${Math.round(g.run.dist)}, zone ${g.endless.zone}, state ${g.state}, verdict ${JSON.stringify(k.rec.verdicts[0] || null)}`);
    // its squad on the stream just before a row and 0.5 s after it
    const nAt = (t) => { let n = null; for (const st of k.rec.states) { if (st.s.t > t + 1e-6) break; n = st.s.n; } return n; };
    for (const r of recs) { rows.push({ seed, ...r, n0: nAt(r.t - 0.15), n1: nAt(r.t + 0.5) }); if (sabAts.has(r.at)) aimedSab++; }
    // the stream: lane speed between samples
    for (const st of k.rec.states) {
      const xs = st.s.xs;
      for (let i = 0; i < xs.length; i++) { const x = xs[i]; if (prev !== null) speed.push(Math.abs(x - prev) / 0.1); prev = x; if (Math.abs(x) > 4.75 + 1e-3) speed.push(999); }
    }
    roadRows += new Set(g.run.eventsOf('gate').filter((e) => !e.sab && e.at <= (recs.length ? recs[recs.length - 1].at : 0)).map((e) => e.at)).size;
    k.end();
    if (rows.length >= want) break;
  }
  return { rows, sabAts: [...sabAts], aimedSab, maxSpeed: Math.max(0, ...speed), roadRows };
}

try {
  const a = play(0, [31, 32, 33], 24);
  const good = a.rows.filter((r) => side(r.x, r.best)).length;
  info.level0 = `${a.rows.length} rows (of ${a.roadRows} on my road up to its last one), better side ${good} (${Math.round((100 * good) / Math.max(1, a.rows.length))} %), wrong rolls ${a.rows.filter((r) => r.wrong).length}, max lane speed ${a.maxSpeed.toFixed(2)} u/s, sab rows ${a.sabAts.join(',')}`;
  ok(a.rows.length >= 20, 'level 0: rows passed ' + a.rows.length);
  ok(good >= 0.7 * a.rows.length, 'level 0: better side in ' + good + ' of ' + a.rows.length);
  ok(a.rows.length >= 0.85 * a.roadRows, `level 0: it went through ${a.rows.length} of the ${a.roadRows} rows of my road`);
  ok(a.maxSpeed <= BOT.steer.speed + 0.1, 'lane speed ' + a.maxSpeed);
  ok(a.rows.every((r, i) => !i || r.seed !== a.rows[i - 1].seed || r.at > a.rows[i - 1].at), 'rows out of order');
  ok(a.sabAts.length >= 1 && a.aimedSab === 0, `sabotage rows: ${a.sabAts.length} spliced, ${a.aimedSab} aimed at`);
  // aimed where it went: the wrong-roll rows are the worse side, the others the better one
  const kept = a.rows.filter((r) => side(r.x, r.aim)).length;
  ok(kept >= 0.9 * a.rows.length, `on its chosen side in ${kept} of ${a.rows.length}`);

  const b = play(-3, [41, 42, 43], 24);
  const worse = b.rows.filter((r) => side(r.x, -r.best)).length;
  info.levelM3 = `${b.rows.length} rows, worse side ${worse}, wrong rolls ${b.rows.filter((r) => r.wrong).length}`;
  ok(b.rows.length >= 20 && worse >= 1, `level -3: worse side ${worse} in ${b.rows.length} rows`);
  ok(b.aimedSab === 0, 'level -3: aimed at a sabotage row');
  // 4. the gate rows move its squad
  const all = [...a.rows, ...b.rows].filter((r) => r.n0 !== null && r.n1 !== null && r.n0 < 990);
  const up = all.filter((r) => !r.wrong), down = all.filter((r) => r.wrong);
  const ups = up.filter((r) => r.n1 > r.n0).length, downs = down.filter((r) => r.n1 < r.n0).length;
  info.squad = `better rows ${ups} / ${up.length} up, wrong rows ${downs} / ${down.length} down`;
  ok(up.length >= 10 && ups >= 0.7 * up.length, 'better rows did not lift its squad: ' + info.squad);
  ok(down.length >= 3 && downs >= 0.7 * down.length, 'wrong rows did not cost it: ' + info.squad);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
}
k.bot.botForm.reset();
return { pass: fails.length === 0, fails, info };
