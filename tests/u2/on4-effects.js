// @smoke --seconds 0 --shots 0
// Online stage 2, what a sabotage does when it lands (src/online/game/sabeffects.js):
// 1. The numbers: EXTRA WAVE count from the generator's E, FOG / BLACKOUT fogMul and dark for their seconds, SPEED UP
//    speedMul x 1.35 on top of the ramp's pace, HORDE STORM ramp.wave(90, 1, 0.33) + 4 s of fog, the RED GATE row
//    (two -N gates, N = max(4, round(0.2 x squad)), at >= dist + 115, 12 u clear of every row). sab:end at the end.
// 2. FREEZE holds the leader's x for 2 s while the drag target moves, then releases without a jump; with the
//    autopilot too. holdFn is null after it, after my fall and after a run of another mode.
// 3. A red gate splice keeps the ramp's red rows identical to a run without it (gate rows of zones 1-2).
// 4. Low graphics gives the same sim: the same scripted match with all seven kinds on High and on Low.
const g = window.__game;
const { on4, near, STEP } = await import('/tests/u2/lib/on4kit.js');
const { MEMBER_CLAMP } = await import('/src/config.js').then((m) => ({ MEMBER_CLAMP: m.MEMBER_CLAMP ?? 5.5 }));
const k = await on4(g);
const { SAB } = k.data;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const mods = () => g.hazards.mods;
const landNow = (link, slot, code) => { k.log.length = 0; link.test.sab(slot, code); return k.until(() => { k.tough(); return k.of('sab:land').length > 0; }, 2) ? k.of('sab:land')[0] : null; };

try {
  // ---- 1. numbers ----
  let link = k.start({ seed: 12 });
  k.run(5, () => k.tough());
  const waves = [];
  const wave0 = k.versus.ramp.wave;
  k.versus.ramp.wave = function w(n, h = 1, e = 0) { waves.push([n, h, e]); return wave0.call(this, n, h, e); };
  // wave
  let l = landNow(link, 1, 1);
  const E = g.endless.gen.knobs(g.run.dist).E, wantN = Math.max(12, Math.min(120, Math.round(0.35 * E)));
  ok(l && l.count === wantN && waves.length === 1 && waves[0][0] === wantN && waves[0][1] === 1 && waves[0][2] === 0, `wave: ${JSON.stringify(l)} want ${wantN} (E ${E}), calls ${JSON.stringify(waves)}`);
  ok((link.test.sent.at(-1).flags & 4) !== 0 || k.until(() => (link.test.sent.at(-1).flags & 4) !== 0, 0.2), 'the sabotaged flag after a wave');
  // fog
  k.run(5.1, () => k.tough());
  ok(mods().fogMul === 1 && mods().dark === 0, `mods before fog: ${JSON.stringify(mods())}`);
  l = landNow(link, 2, 2);
  ok(l && l.dur === 6 && mods().fogMul === 0.4, `fog: ${JSON.stringify(l)} fogMul ${mods().fogMul}`);
  k.log.length = 0;
  k.run(5.9, () => k.tough());
  ok(mods().fogMul === 0.4 && k.of('sab:end').length === 0, 'fog ended early');
  k.run(0.2, () => k.tough());
  ok(mods().fogMul === 1 && k.of('sab:end').map((x) => x.code).join() === '2', `fog end: ${mods().fogMul} ${JSON.stringify(k.of('sab:end'))}`);
  // speed: x1.35 on top of the pace
  const pace0 = mods().speedMul / k.versus.ramp.pace;
  l = landNow(link, 3, 4);
  const ratio = mods().speedMul / k.versus.ramp.pace;
  ok(near(pace0, 1, 1e-9) && l && l.dur === 5 && near(ratio, 1.35, 1e-9), `speed: before ${pace0}, after ${ratio}`);
  k.run(5.1, () => k.tough());
  ok(near(mods().speedMul / k.versus.ramp.pace, 1, 1e-9) && k.sab.view().speed === 0, 'speed did not end');
  // blackout
  l = landNow(link, 1, 12);
  ok(l && l.big && l.dur === 5 && mods().dark === 0.8 && mods().fogMul === 0.3, `blackout: ${JSON.stringify(l)} ${JSON.stringify(mods())}`);
  k.run(5.1, () => k.tough());
  ok(mods().dark === 0 && mods().fogMul === 1, 'blackout did not end');
  // storm
  waves.length = 0;
  l = landNow(link, 2, 11);
  ok(l && l.count === 90 && waves.length === 1 && waves[0].join() === '90,1,0.33' && mods().fogMul === 0.4 && near(k.sab.view().fog, 4, STEP + 1e-9), `storm: ${JSON.stringify(l)} ${JSON.stringify(waves)} fog ${k.sab.view().fog}`);
  k.run(5.1, () => k.tough());
  // red gate
  const sq = g.squad.count, dist = g.run.dist;
  l = landNow(link, 3, 3);
  const ev = g.run.eventsOf('gate'), row = ev.filter((e) => e.sab);
  const N = Math.max(4, Math.round(0.2 * sq)), at = row[0] && row[0].at;
  const others = ev.filter((e) => !e.sab);
  ok(l && l.count === -N && row.length === 2 && row.every((e) => e.at === at && e.op === 'add' && e.value === -N && e.max === -1) && row.map((e) => e.lane).sort().join() === 'L,R', `red gate: ${JSON.stringify(l)} ${JSON.stringify(row)} squad ${sq}`);
  ok(at >= dist + 115 && at < g.run.length - 55 && others.every((e) => Math.abs(e.at - at) >= 12) && ev.every((e, i) => i === 0 || ev[i - 1].at <= e.at) && ev.indexOf(row[0]) >= g.gates.cursor, `red gate spot ${at} (dist ${dist}, length ${g.run.length})`);
  // it reaches the road: two red gates spawn and passing one costs N
  ok(k.until(() => { k.tough(); return g.gates.live.some((x) => x.z === -at); }, 15), 'the red gate row never spawned');
  ok(g.gates.live.filter((x) => x.z === -at).every((x) => x.value === -N && x.op === 'add'), 'the spawned red gates');
  k.versus.ramp.wave = wave0;
  k.end();

  // ---- 2. freeze ----
  for (const ap of [false, 'pro']) {
    link = k.start({ seed: 14, ap });
    k.run(3, () => k.tough());
    const inp = g.input, L = g.squad.leader;
    if (!ap) { inp.targetX = inp.startTarget = -2.5; k.run(1.5, () => k.tough()); }
    l = landNow(link, 1, 5);
    const held = L.x;
    let maxOff = 0;
    k.run(1.95, (i) => { k.tough(); if (!ap) inp.targetX = 4 * Math.sin(i / 9); maxOff = Math.max(maxOff, Math.abs(L.x - held)); });
    ok(l && l.dur === 2 && maxOff < 1e-3 && g.runMods.holdFn !== null && k.sab.view().frozen > 0, `freeze (${ap}): held ${held}, moved ${maxOff}, ${JSON.stringify(l)}`);
    ok((link.test.sent.at(-1).flags & 8) !== 0, `frozen flag (${ap})`);
    if (!ap) inp.targetX = 4; // the finger is far away when it ends
    let x0 = L.x, maxDx = 0, released = -1;
    k.log.length = 0;
    k.run(1, (i) => { k.tough(); maxDx = Math.max(maxDx, Math.abs(L.x - x0)); x0 = L.x; if (released < 0 && g.runMods.holdFn === null) released = i; });
    const bound = 2 * MEMBER_CLAMP * (1 - Math.exp(-14 * STEP));
    info['freeze_' + ap] = { held: Math.round(held * 100) / 100, maxDx: Math.round(maxDx * 1000) / 1000, released, bound: Math.round(bound * 1000) / 1000, target: inp.targetX };
    ok(released >= 0 && released < 6 && k.of('sab:end').some((x) => x.code === 5), `freeze (${ap}) did not end at 2 s: ${JSON.stringify(info['freeze_' + ap])}`);
    if (!ap) ok(maxDx < 0.02 && near(inp.targetX, held, 1e-6), `freeze release jumped (no autopilot): ${JSON.stringify(info.freeze_false)}`);
    else ok(maxDx <= bound, `freeze release faster than normal steering (autopilot): ${JSON.stringify(info.freeze_pro)}`);
    k.end();
  }
  // holdFn is null after my fall, after stop() and after a run of another mode
  link = k.start({ seed: 14 });
  k.run(3, () => k.tough());
  landNow(link, 1, 5);
  g.squad.setCount(0, 'test');
  ok(g.runMods.holdFn === null && k.sab.view().frozen === 0, 'a freeze kept running after my fall');
  k.end();
  link = k.start({ seed: 14 });
  k.run(3, () => k.tough());
  landNow(link, 1, 5);
  g.debug.startEndless(3);
  ok(g.runMods.holdFn === null && !k.versus.live, 'a freeze leaked into single-player endless');
  k.end();

  // ---- 3. a red gate splice and the ramp's red rows ----
  const rows = (red) => {
    const ln = k.start({ seed: 16 });
    k.run(6, () => k.tough());
    if (red) landNow(ln, 1, 3);
    const spliced = g.run.eventsOf('gate').filter((e) => e.sab).length;
    ok(k.toArena() && k.killBoss(), `zone 2 not reached (red ${red})`);
    const list = g.run.eventsOf('gate').filter((e) => !e.sab).map((e) => [e.at, e.lane, e.op, e.value, e.rung, e.max, e.hitsPerStep].join(':'));
    const out = { spliced, n: list.length, hash: list.join('|'), reds: k.versus.ramp.stats.reds, rows: k.versus.ramp.stats.rows, zone2: g.run.eventsOf('gate').filter((e) => e.at > 700).length };
    k.end();
    return out;
  };
  const A = rows(true), B = rows(false);
  info.red = { A: { spliced: A.spliced, n: A.n, reds: A.reds, rows: A.rows, zone2: A.zone2 }, B: { n: B.n, reds: B.reds, rows: B.rows } };
  ok(A.spliced === 2 && A.zone2 > 4 && A.hash === B.hash && A.reds === B.reds && A.rows === B.rows, `red rows differ after a red gate splice: ${JSON.stringify(info.red)}`);

  // ---- 4. High and Low ----
  const script = (q) => {
    g.applyQuality(q);
    const ln = k.start({ seed: 18 });
    const marks = [];
    let next = 3, si = 0;
    const kinds = [1, 2, 3, 4, 5, 11, 12, 1, 3, 5];
    k.run(33, () => {
      if (k.versus.t >= 2 + si * 3 && si < kinds.length) { ln.test.sab(1 + (si % 3), kinds[si]); si++; }
      if (k.versus.t >= next) { marks.push([Math.round(k.versus.t * 10) / 10, g.squad.count, g.run.kills, Math.round(g.run.dist * 1000) / 1000, g.horde.count]); next += 3; }
    });
    const out = { marks, landed: k.sab.stats.landed, alive: g.run && g.run.active };
    k.end();
    return out;
  };
  const H = script('high'), Lo = script('low');
  info.lowHigh = { marks: H.marks.length, landed: H.landed, last: H.marks.at(-1) };
  ok(H.marks.length === 10 && H.landed >= 8 && JSON.stringify(H.marks) === JSON.stringify(Lo.marks) && H.landed === Lo.landed, `Low differs from High: ${JSON.stringify(H)} vs ${JSON.stringify(Lo)}`);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  g.applyQuality('high');
  k.end();
}
return { pass: fails.length === 0, fails, info };
