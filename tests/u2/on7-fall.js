// @smoke --seconds 0 --shots 0
// Online stage 3, the scripted rival's fall and road (src/online/bot.js, botplan.js):
// 1. Over 20 seeds (and every level) the bot falls between 25 and 300 s: its 'out' arrives at its planned T, after its
//    last state; nothing is emitted before GO (a hand clock from -4 s) or after its fall (no state, no event).
// 2. My scripted sabotage every 6 s from 10 s (sab.test.give + send, real receiver path into its sendEvent): it still
//    falls at >= 25 s, every landing that shortened its fall left it >= that landing + 7 s, it never grew.
// 3. Its distance is the road's real speed: within 5 % of BOT_CURVES.casual.dist (level 0) / .pro.dist (level 2) at
//    30 / 60 / 90 s on 5 seeds, in the plan and in the delivered stream.
const g = window.__game;
const { on7 } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { BOT_CURVES } = k;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };

try {
  // ---- 1. 20 seeds alone on a hand clock ----
  const falls = [];
  for (let seed = 1; seed <= 20; seed++) {
    const level = (seed % 7) - 3;
    const s = k.solo({ seed, level });
    const T = s.link.bot.plan.T;
    let early = 0;
    s.step(4, (c) => { if (c < 0 && (s.rec.states.length || s.rec.events.length)) early++; });
    s.step(305, () => !s.rec.outs.length || s.rec.outs[0].c + 2 > s.clock); // two more seconds after the out
    const o = s.rec.outs[0];
    const lastState = s.rec.states[s.rec.states.length - 1], lastEvent = s.rec.events[s.rec.events.length - 1];
    falls.push(o ? o.T : null);
    ok(o && o.T >= 25 && o.T <= 300 && Math.abs(o.T - T) < 0.05, `seed ${seed} level ${level}: out ${JSON.stringify(o)}, planned T ${T}`);
    ok(!early, `seed ${seed}: emitted before GO`);
    ok(o && lastState && lastState.c <= o.c && lastState.s.t < o.T && (!lastEvent || lastEvent.c <= o.c), `seed ${seed}: something after its fall (${lastState && lastState.c} / ${lastEvent && lastEvent.c} / out ${o && o.c})`);
    ok(o && o.c - o.T >= 0.06 - 1e-6 && o.c - o.T <= 0.2, `seed ${seed}: out delivered ${o && (o.c - o.T).toFixed(3)} s after T`);
    ok(s.rec.verdicts.length === 1 && s.rec.verdicts[0].result === 'win', `seed ${seed}: my verdict ${JSON.stringify(s.rec.verdicts)}`);
    s.link.leave();
  }
  info.falls = falls.join(' ');
  k.bot.botForm.reset();

  // ---- 2. my sabotage every 6 s from 10 s ----
  const sabRuns = [];
  for (const [seed, fallAt] of [[3, 90], [5, 40], [8, 33]]) {
    const link = k.start({ seed, fallAt, ap: 'pro' });
    const T0 = link.bot.plan.T;
    let next = 10, sends = 0, guard = 0;
    while (versus().live && !k.rec.outs.length && guard++ < 400 * 60) {
      k.run(1 / 60, () => k.tough());
      if (versus().t >= next) { const r = k.sendMine(1 + (sends % 5)); if (r.ok) sends++; next += 6; }
    }
    const o = k.rec.outs[0], landed = link.bot.test.landed;
    const lastShort = landed.filter((x) => x.T < x.T0 - 1e-6).pop();
    sabRuns.push({ seed, T0, T: o && o.T, sends, recv: link.bot.stats.recv, landed: landed.length, short: landed.filter((x) => x.T < x.T0 - 1e-6).length });
    ok(o && o.T >= 25 && link.bot.stats.recv >= 2 && landed.length >= 2, `seed ${seed}: out ${JSON.stringify(o)}, recv ${link.bot.stats.recv}, landed ${landed.length}`);
    ok(landed.every((x) => x.T <= x.T0 + 1e-6 && (x.T >= x.T0 - 1e-6 || (x.T >= x.at + 7 - 1e-6 && x.T >= 25))), `seed ${seed}: a landing broke the floor: ${JSON.stringify(landed)}`);
    ok(o && (!lastShort || o.T >= lastShort.at + 7 - 1e-6), `seed ${seed}: fell ${o && o.T} < last shortening landing ${lastShort && lastShort.at} + 7`);
    k.end();
  }
  info.sab = sabRuns;
  k.bot.botForm.reset();

  // ---- 3. distance = the road ----
  const dist = [];
  for (const [level, prof] of [[0, 'casual'], [2, 'pro']]) {
    for (let seed = 11; seed <= 15; seed++) {
      const s = k.solo({ seed, level, c0: 0 });
      s.step(95);
      for (const t of [30, 60, 90]) {
        const want = BOT_CURVES[prof].dist[t / 5], plan = s.link.bot.plan, got = k.plan.makePlan(seed, { level }).at(t).dist;
        const st = s.rec.states.filter((x) => x.s.t <= t + 1e-6).pop();
        dist.push(`${prof} ${seed} ${t}s: ${Math.round(got)} / stream ${st ? Math.round(st.s.dist) : '-'} (want ${want})`);
        ok(Math.abs(got - want) <= 0.05 * want && st && Math.abs(st.s.dist - want) <= 0.05 * want + 4, `${prof} seed ${seed} at ${t} s: plan ${got}, stream ${st && st.s.dist}, curves ${want} (T ${plan.T})`);
      }
      s.link.leave();
    }
  }
  info.dist = dist.filter((_, i) => i % 3 === 2).join('; ');
  k.bot.botForm.reset();
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
}
function versus() { return k.versus; }
return { pass: fails.length === 0, fails, info };
