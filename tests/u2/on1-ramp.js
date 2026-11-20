// @smoke --seconds 0 --shots 0
// Online stage 1: time pressure and the clock of a versus match (src/online/game/ramp.js, Versus.pump).
// 1. Pressure on the played clock: forward speed follows vsPace(t), enemy hp grows (run.hpRamp), pressure waves come
//    from VS.waves.from on, Sudden Death starts at VS.sudden.at (versus:sudden, darker sky, growing waves) and the
//    storm wall at VS.storm.at (versus:storm): an unbeatable squad (999 Raiders, topped up every step) is still gone
//    before 330 s. Same values on Low (nothing in the ramp reads the graphics quality).
// 2. Countdown: while link.clock() < 0 the run stands at the start line (no step), versus:go fires at 0.
// 3. Catch-up (SPEC4 §5.3): frames clamped to 1/30 s at 20 fps still play in real time (extra steps, at most 3 a
//    frame); a 5 s freeze is NOT replayed (the played clock stays behind); more than 15 s of stalls = out ('quit').
// 4. In a boss arena the squad stands still, so the ramp's waves must come to it: every wave spawned there charges at
//    once (a horde normally wakes up only when the squad comes within 52 u). Nothing waits out of reach, the enemy
//    list does not pile up, and a handful parked in an arena in Sudden Death is taken by the horde.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { VS, vsPace } = await import('/src/online/game/vsdata.js');
const { endlessSpeed } = await import('/src/data/endless.js');
const { versus } = await installOnline(g, g.ui);
const log = [];
for (const k of ['versus:go', 'versus:sudden', 'versus:storm', 'hazard:hint']) g.events.on(k, (p) => log.push([k, Math.round(versus.t * 100) / 100, p && p.text]));
const start = (opts = {}) => {
  log.length = 0;
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('pro', 1);
  const link = createTestLink({ game: g, seed: 31, ...opts });
  versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
  return link;
};

try {
  // ---- 1. the ramp, with a squad that cannot lose (so the run reaches the storm) ----
  const curve = {};
  for (const q of ['high', 'low']) {
    g.applyQuality(q);
    start();
    const marks = [];
    let storm0 = null, next = 30, lastCount = 999;
    while (g.run.active && g.state === 'playing' && versus.t < 340) {
      if (!versus.ramp.storm) { g.heroes.guard = 99; if (g.squad.count < 999) g.squad.setCount(999, 'start'); if (g.run.phase === 'boss' && g.boss && g.boss.state === 'fight') d.killBoss(); }
      else if (storm0 == null) storm0 = g.squad.count;
      versus.pump(1 / 60, 1 / 60);
      if (versus.t >= next) {
        marks.push({ t: next, speed: Math.round(g.squad.speed * 100) / 100, want: g.run.phase === 'run' ? Math.round(g.run.speed * vsPace(versus.t) * 100) / 100 : 0, hp: Math.round((g.run.hpRamp || 1) * 100) / 100, waves: versus.ramp.stats.waves, sudden: versus.ramp.stats.suddenWaves, dark: g.hazards.mods.dark, n: g.squad.count });
        next += 30;
      }
      lastCount = g.squad.count;
    }
    curve[q] = { end: Math.round(versus.t * 10) / 10, marks, log: log.filter((l) => l[0] !== 'hazard:hint').map((l) => l.slice(0, 2)), hints: log.filter((l) => l[0] === 'hazard:hint' && /SUDDEN|STORM/.test(l[2] || '')).length, storm0, stormLost: versus.ramp.stats.stormLost, lastCount };
    versus.stop();
  }
  info.curve = curve.high; info.lowEnd = curve.low.end;
  const H = curve.high, m = (t) => H.marks.find((x) => x.t === t) || {};
  ok(m(30).want > 0 && Math.abs(m(30).speed - m(30).want) < 0.06 && m(30).speed > endlessSpeed(1) * 1.2, `pace at 30 s: ${JSON.stringify(m(30))}`);
  ok(Math.abs(vsPace(0) - 1) < 1e-9 && vsPace(VS.pace.over) === 1 + VS.pace.gain && vsPace(1e4) === VS.pace.max && vsPace(VS.sudden.at + 10) > vsPace(VS.sudden.at), 'vsPace shape');
  ok(m(60).hp === Math.round((1 + 60 / VS.hpRamp.per) * 100) / 100 && m(150).hp > m(60).hp, `hp ramp: ${m(60).hp}, ${m(150).hp}`);
  ok(m(30).waves === 0 && m(60).waves >= 1 && m(150).waves > m(60).waves && m(150).sudden === 0, `pressure waves: ${H.marks.map((x) => x.waves).join(',')}`);
  ok(m(210).sudden >= 5 && m(210).dark >= VS.sudden.dark && m(150).dark < VS.sudden.dark, `Sudden Death waves / dark: ${JSON.stringify(m(210))}`);
  const sd = H.log.find((l) => l[0] === 'versus:sudden'), st = H.log.find((l) => l[0] === 'versus:storm');
  ok(sd && Math.abs(sd[1] - VS.sudden.at) < 0.05 && st && Math.abs(st[1] - VS.storm.at) < 0.05 && H.hints === 2, `sudden / storm events: ${JSON.stringify(H.log)}, hints ${H.hints}`);
  ok(H.storm0 > 600 && H.end > VS.storm.at + 5 && H.end < 330 && H.stormLost > 300 && H.lastCount === 0, `storm wall: ${H.storm0} Raiders at ${VS.storm.at} s, all gone at ${H.end} s (lost to it ${H.stormLost})`);
  ok(JSON.stringify(curve.low.marks) === JSON.stringify(H.marks) && curve.low.end === H.end, `Low differs from High: ends ${curve.low.end} vs ${H.end}`);
  g.applyQuality('high');

  // ---- 2. countdown ----
  let clock = -3;
  let link = start({ clock: () => clock, rivals: [{ slot: 1, name: 'Mika' }] });
  for (let i = 0; i < 120; i++) { clock += 1 / 60; versus.pump(1 / 60, 1 / 60); }
  ok(g.state === 'playing' && versus.live && g.run.dist === 0 && g.run.time === 0 && versus.t === 0 && !versus.view().go, `stepped during the countdown: dist ${g.run.dist}, t ${versus.t}`);
  ok(!log.some((l) => l[0] === 'versus:go') && link.test.pushed === 0, 'versus:go / samples before GO');
  for (let i = 0; i < 90; i++) { clock += 1 / 60; versus.pump(1 / 60, 1 / 60); }
  ok(log.filter((l) => l[0] === 'versus:go').length === 1 && versus.view().go && g.run.dist > 2, 'no GO at clock 0');
  ok(Math.abs(versus.t - clock) < 0.05, `played clock ${versus.t} vs match clock ${clock} after GO`);

  // ---- 3. catch-up ----
  // 20 fps: every frame is 0.05 s of real time but the loop clamps dt to 1/30
  let steps = 0, maxSteps = 0;
  const step0 = g.step.bind(g);
  g.step = (dt) => { steps++; return step0(dt); };
  for (let i = 0; i < 100; i++) { clock += 0.05; steps = 0; versus.pump(1 / 30, 0.05); maxSteps = Math.max(maxSteps, steps); }
  info.slow = { clock: Math.round(clock * 100) / 100, t: Math.round(versus.t * 100) / 100, maxSteps, stall: versus.stall };
  ok(Math.abs(versus.t - clock) < 0.07 && maxSteps <= 1 + VS.pump.extra && maxSteps >= 2 && versus.stall === 0, `20 fps: ${JSON.stringify(info.slow)}`);
  // a 5 s freeze (hidden tab): not replayed
  clock += 5; steps = 0;
  versus.pump(1 / 30, 5);
  ok(steps === 1 && Math.abs(versus.stall - 5) < 0.1, `freeze: ${steps} steps, stall ${versus.stall}`);
  for (let i = 0; i < 60; i++) { clock += 1 / 60; versus.pump(1 / 60, 1 / 60); }
  ok(Math.abs(clock - versus.t - versus.stall) < 0.05 && Math.abs(versus.stall - 5) < 0.1 && g.run.active, `after the freeze: clock ${clock}, t ${versus.t}, stall ${versus.stall}`);
  // 15 s of stalls in total: out
  clock += 11;
  versus.pump(1 / 30, 11);
  ok(!g.run.active && link.test.falls.length === 1 && link.test.falls[0].by === 'quit', `stalled out: active ${g.run.active}, falls ${JSON.stringify(link.test.falls)}`);
  g.step = step0;
  versus.stop();

  // ---- 4. waves in a boss arena ----
  start();
  const horde = g.horde, sq = g.squad;
  // (test only) the boss cannot hurt the squad here, so every Raider lost in the arena is the horde's doing
  const rm = sq.remove, km = sq.killMember;
  sq.remove = (n, reason) => (reason === 'boss' ? 0 : rm.call(sq, n, reason));
  sq.killMember = (i, reason) => (reason === 'boss' ? undefined : km.call(sq, i, reason));
  let arenaAt = null, idle = 0, checks = 0, peakList = 0, lostSudden = 0;
  const off = g.events.on('squad:change', (p) => { if (p.delta < 0 && versus.ramp.sudden && (p.reason === 'horde' || p.reason === 'bomb')) lostSudden -= p.delta; });
  try {
    while (g.run.active && g.state === 'playing' && versus.t < VS.sudden.at + 40) {
      // a modest squad that never beats the boss: it sits in the first arena from about 1:00; in Sudden Death it is
      // down to a handful (what the boss leaves of a squad in a real match)
      g.heroes.guard = 0;
      if (!versus.ramp.sudden) { if (sq.count !== 40) sq.setCount(40, 'start'); } else if (sq.count > 6) sq.setCount(6, 'start');
      if (g.boss && g.boss.alive) g.boss.hp = g.boss.maxHp;
      versus.pump(1 / 60, 1 / 60);
      if (g.run.phase !== 'boss') continue;
      if (arenaAt == null) arenaAt = versus.t;
      checks++;
      peakList = Math.max(peakList, horde.list.length);
      // idle = alive, not charging and older than the longest pause between two ramp waves (a wave spawned just
      // before the arena, 60 u up the road, is roused by the next one at the latest)
      for (const e of horde.list) if (e.state === 0 && !e.charging && !e.wave && e.t > 15) idle++;
    }
  } finally { sq.remove = rm; sq.killMember = km; off(); }
  info.arena = { arenaAt: arenaAt && Math.round(arenaAt), t: Math.round(versus.t * 10) / 10, phase: g.run.phase, waves: versus.ramp.stats.waves, sudden: versus.ramp.stats.suddenWaves, lostSudden, idle, checks, peakList };
  ok(arenaAt != null && arenaAt < 90 && versus.t >= VS.sudden.at && versus.ramp.stats.suddenWaves >= 1 && checks > 6000, `arena test did not sit in the arena into Sudden Death: ${JSON.stringify(info.arena)}`);
  ok(idle === 0, `enemies waiting out of reach in the arena: ${idle} (enemy x step) over ${checks} steps`);
  ok(peakList < 300, `enemies pile up in the arena (${peakList} at once; the pool holds 900)`);
  ok(lostSudden >= 1 && !g.run.active && versus.t < VS.sudden.at + 40, `a handful parked in an arena in Sudden Death is not taken by the horde: ${JSON.stringify(info.arena)}`);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false);
  g.applyQuality('high');
  d.toTitle();
}
return { pass: fails.length === 0, fails, info };
