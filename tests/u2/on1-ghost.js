// @smoke --seconds 0 --shots 0
// Online stage 1: the rival ghost (src/online/game/ghost.js + track.js).
// 1. No peers: the ghost mesh is hidden (count 0) for a whole match and costs no draw call; single-player never shows it.
// 2. One rival: ONE instanced mesh draws it (+1 draw call on Low, +2 on High: the name tag), more Raiders for a bigger
//    squad, fewer on Low than on High, placed at the rival's own distance and lane.
// 3. A rival far ahead is pinned at the edge of the view window, a rival behind fades out; a fallen rival's ghost goes.
// 4. Playback never jumps: bundles arriving with jitter, bursts and a lost message move the ghost smoothly
//    (distance never runs backwards, no step bigger than a fast run allows); a silent rival fades instead.
//    With a steady link the playhead never runs past the data (the delay covers the wait for the next bundle), at
//    the 2-player and the 4-player cadence; a rival whose clock fell behind (a stall is never replayed) is played in
//    its own time and shown again at once; a run-on past a rival that stopped at its arena settles back onto it.
// 5. After the match (stop / result) the mesh is hidden again.
// 6. A rival running level with me (same distance at the same time: every match until the first boss) is drawn level
//    with me and visible, on the road and standing in the same boss arena, also on a slow link.
// 7. A rival 10 m ahead whose played clock is 4 s behind the match clock is drawn 10 m ahead, not faded.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { Track } = await import('/src/online/game/track.js');
const { VS } = await import('/src/online/game/vsdata.js');
const { versus } = await installOnline(g, g.ui);
const G = versus.ghost, mesh = G.mesh;
const calls = () => { g.sync(0); g.engine.render(); return g.engine.stats.calls; };
const flat = (dist, n, x = 0) => () => ({ dist: dist(), n, x, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 });
const start = (rivals) => {
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('pro', 1);
  const link = createTestLink({ game: g, seed: 11, rivals });
  versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
  return link;
};
const pump = (seconds) => { for (let i = 0; i < seconds * 60 && g.state === 'playing'; i++) versus.pump(1 / 60, 1 / 60); };
// a rival that keeps `lead` metres ahead of me (my own distance is the same road)
const ahead = (lead, n = 60, x = -2) => flat(() => Math.max(0, (g.run ? g.run.dist : 0) + lead), n, x);

try {
  g.applyQuality('high');
  // ---- 1. no peers ----
  ok(mesh.isInstancedMesh && !mesh.visible && mesh.count === 0, 'ghost mesh not hidden before any match');
  start([]);
  let shown = 0;
  for (let i = 0; i < 300; i++) { versus.pump(1 / 60, 1 / 60); if (mesh.visible || mesh.count) shown++; }
  ok(shown === 0, `ghost mesh visible on ${shown} frames of a match without rivals`);
  const callsNone = calls();
  versus.stop();

  // ---- 2. one rival, High and Low ----
  const one = {};
  for (const q of ['high', 'low']) {
    g.applyQuality(q);
    start([{ slot: 1, name: 'Mika', curve: ahead(12, 60) }]);
    pump(5);
    const withGhost = calls();
    const i = G.info(1);
    const z = mesh.instanceMatrix.array[14], x = mesh.instanceMatrix.array[12];
    one[q] = { count: mesh.count, drawn: i.drawn, extra: 0, rel: Math.round(i.rel * 10) / 10, shown: Math.round(i.shown * 100) / 100, x: Math.round(x * 100) / 100, dz: Math.round((-z - g.run.dist) * 10) / 10, tag: G.tags.filter((t) => t.visible).length, vis: mesh.visible };
    mesh.visible = false; G.tags.forEach((t) => { t.visible = false; }); // the same frame without the ghost
    one[q].extra = withGhost - calls();
    // the ghost is shown a little late (jitter buffer) but compared with where I was at that same moment, so a rival
    // 12 m ahead stands 12 m ahead (+ the 0.12 s of road this scripted rival is given on top: its curve reads my
    // distance when the sample is delivered)
    ok(one[q].vis && one[q].count === i.drawn && one[q].count >= 5, `${q}: ghost not drawn (${JSON.stringify(one[q])})`);
    ok(one[q].rel > 11.5 && one[q].rel < 14.5 && Math.abs(one[q].dz - one[q].rel) < 0.11 && Math.abs(one[q].x + 2) < 0.2, `${q}: ghost not at the rival's place (${JSON.stringify(one[q])})`);
    ok(i.pinned === 0 && i.shown > 0.95, `${q}: a rival 12 m ahead should be fully shown (${JSON.stringify(one[q])})`);
    versus.stop();
  }
  info.one = one;
  ok(one.low.extra === 1 && one.low.tag === 0, `Low: the ghost costs ${one.low.extra} draw calls (want 1, no name tag)`);
  ok(one.high.extra >= 1 && one.high.extra <= 2 && one.high.tag === 1, `High: the ghost costs ${one.high.extra} draw calls (want mesh + name tag)`);
  ok(one.low.count < one.high.count && one.high.count <= VS.ghost.perHigh && one.low.count <= VS.ghost.perLow, `ghost Raiders: High ${one.high.count}, Low ${one.low.count}`);
  g.applyQuality('high');
  // squad size reads: 4 Raiders vs 400
  start([{ slot: 1, name: 'Small', curve: ahead(9, 4) }, { slot: 2, name: 'Big', curve: ahead(14, 400, 2) }]);
  pump(4);
  ok(G.info(1).drawn === 4 && G.info(2).drawn === VS.ghost.perHigh && mesh.count === 4 + VS.ghost.perHigh, `size: small ${G.info(1).drawn}, big ${G.info(2).drawn}, mesh ${mesh.count}`);
  versus.stop();

  // ---- 3. far ahead / behind / fallen ----
  let link = start([{ slot: 1, name: 'Far', curve: ahead(120) }, { slot: 2, name: 'Back', curve: ahead(-30) }, { slot: 3, name: 'Near', curve: ahead(12), fallAt: 6 }]);
  pump(5);
  const far = G.info(1), back = G.info(2), near = G.info(3);
  const zFar = -mesh.instanceMatrix.array[14] - g.run.dist;
  info.window = { far, back, near, zFar: Math.round(zFar * 10) / 10 };
  ok(far.pinned === 1 && far.shown > 0.2 && far.shown < 0.7 && Math.abs(zFar - VS.ghost.ahead) < 0.11, `far rival not pinned at ${VS.ghost.ahead} m and faded: ${JSON.stringify(info.window)}`);
  ok(back.pinned === -1 && back.shown === 0 && back.drawn === 0, `rival behind still drawn: ${JSON.stringify(back)}`);
  ok(near.shown > 0.9 && near.drawn > 0, `near rival: ${JSON.stringify(near)}`);
  pump(2.5);
  ok(G.info(3).shown === 0 && G.info(3).drawn === 0 && versus.view().peers[2].alive === false, `a fallen rival is still drawn: ${JSON.stringify(G.info(3))}`);
  versus.stop();
  ok(!mesh.visible && mesh.count === 0 && G.tags.every((t) => !t.visible), 'ghost still visible after the match was left');

  // ---- 4. playback under jitter (pure track) ----
  {
    const tr = new Track();
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    const distAt = (t) => 11 * t, xAt = (t) => 3 * Math.sin(t * 0.9);
    // bundles every 0.25 s; arrival = send + 0.05..0.45 s; every 13th is lost; arrivals may be out of order / in bursts
    const mail = [];
    for (let k = 1; k <= 160; k++) {
      const t = k * 0.25;
      if (k % 13 === 0) continue;
      const xs = [];
      for (let i = 2; i >= 0; i--) xs.push(xAt(Math.round((t - i * 0.1) * 10) / 10));
      mail.push({ at: t + 0.05 + rnd() * 0.4, s: { t, dist: distAt(t), n: 50, form: 0, x: xAt(t), xs } });
    }
    mail.sort((a, b) => a.at - b.at);
    let mi = 0, last = null, back = 0, maxStep = 0, maxDx = 0, frames = 0, maxLate = 0, minAlpha = 1;
    for (let clock = 1; clock < 39; clock += 1 / 60) {
      while (mi < mail.length && mail[mi].at <= clock) tr.feed(mail[mi++].s, clock);
      const o = tr.play(clock);
      if (!o.ok) continue;
      frames++;
      if (last) { const dd = o.dist - last.dist; if (dd < -1e-6) back++; maxStep = Math.max(maxStep, dd); maxDx = Math.max(maxDx, Math.abs(o.x - last.x)); }
      if (clock > 5) { maxLate = Math.max(maxLate, clock - o.dist / 11); minAlpha = Math.min(minAlpha, o.alpha); }
      last = { dist: o.dist, x: o.x };
    }
    info.jitter = { frames, back, maxStep: Math.round(maxStep * 1000) / 1000, maxDx: Math.round(maxDx * 1000) / 1000, maxLate: Math.round(maxLate * 100) / 100, minAlpha: Math.round(minAlpha * 100) / 100, D: Math.round(tr.goalD * 100) / 100 };
    ok(frames > 2000 && back === 0, `ghost distance ran backwards on ${back} frames`);
    ok(maxStep <= 11 / 60 * 1.6, `ghost jumped ${maxStep} u in one frame (a run at 11 u/s moves ${11 / 60})`);
    ok(maxDx <= 0.25, `ghost lane jumped ${maxDx} u in one frame`);
    ok(maxLate < 1.1 && tr.goalD >= VS.ghost.delayMin && tr.goalD <= 0.8, `ghost shown ${maxLate} s late, delay ${tr.goalD}`);
    ok(minAlpha > 0.8, `ghost flickered under jitter (alpha down to ${minAlpha})`);
    // silence: no more data -> runs on briefly, then fades to the starve opacity, never past the last distance + speed * 0.4
    let o = null;
    for (let clock = 41; clock < 45; clock += 1 / 60) o = tr.play(clock);
    ok(o.alpha <= VS.ghost.starveAlpha + 1e-6 && o.dist <= distAt(40) + 11 * VS.ghost.extrapolate + 0.01, `silent rival: alpha ${o.alpha}, dist ${o.dist}`);
  }
  // a steady link (constant latency, no loss): the playhead must stay inside the data at both bundle cadences
  {
    const steady = [];
    for (const [flush, lat] of [[0.25, 0.12], [0.25, 0.3], [0.5, 0.12], [0.5, 0.3]]) {
      const tr = new Track(), xAt = (t) => 3.5 * Math.sin(t * 1.6), per = Math.round(flush / 0.1);
      const mail = [];
      for (let k = 1; k * flush <= 30; k++) {
        const t = Math.round(k * flush * 10) / 10, xs = [];
        for (let i = per - 1; i >= 0; i--) xs.push(xAt(Math.round((t - i * 0.1) * 10) / 10));
        mail.push({ at: t + lat, s: { t, dist: 13.8 * t, n: 50, form: 0, flags: 0, zone: 1, x: xAt(t), xs } });
      }
      let mi = 0, frames = 0, starved = 0, maxDx = 0, lastX = null;
      for (let clock = 0.5; clock < 29; clock += 1 / 60) {
        while (mi < mail.length && mail[mi].at <= clock) tr.feed(mail[mi++].s, clock);
        const o = tr.play(clock);
        if (o.ok && clock > 6) { frames++; if (o.starve > 1e-6) starved++; if (lastX != null) maxDx = Math.max(maxDx, Math.abs(o.x - lastX)); }
        lastX = o.ok ? o.x : null;
      }
      steady.push({ flush, lat, D: Math.round(tr.goalD * 100) / 100, starved, frames, maxDx: Math.round(maxDx * 1000) / 1000 });
      ok(frames > 1300 && starved === 0, `steady link (bundles ${flush} s, latency ${lat} s): playhead past the data on ${starved} of ${frames} frames (delay ${tr.goalD})`);
      ok(maxDx <= 3.5 * 1.6 / 60 * 1.3, `steady link (bundles ${flush} s, latency ${lat} s): lane step ${maxDx} u a frame (the rival moves ${3.5 * 1.6 / 60})`);
      ok(tr.goalD >= flush + VS.ghost.delayPad - 1e-6 && tr.goalD <= flush + 0.2, `steady link: delay ${tr.goalD} for ${flush} s bundles`);
    }
    info.steady = steady;
  }
  // the rival's clock falls S seconds behind in the middle of a match (hidden tab): its ghost is back within 2 s
  {
    const stall = {};
    for (const S of [1.3, 3, 8]) {
      const tr = new Track();
      let nextT = 0.25, mi = 0, late = 0, frames = 0, minAlpha = 1, atErr = 0;
      const mail = [];
      for (let k = 1; k <= 100; k++) { const t = k * 0.25; mail.push({ at: t + 0.12 + (t > 10 ? S : 0), s: { t, dist: 13.8 * t, n: 50, form: 0, flags: 0, zone: 1, x: 0, xs: [0, 0, 0] } }); }
      for (let clock = 0.5; clock < 24 + S; clock += 1 / 60) {
        while (mi < mail.length && mail[mi].at <= clock) tr.feed(mail[mi++].s, clock);
        const o = tr.play(clock);
        if (clock > 10.12 + S + 2) { frames++; if (o.starve > 1e-6) late++; minAlpha = Math.min(minAlpha, o.alpha); atErr = Math.max(atErr, Math.abs((o.at - tr.ph) - (S + 0.12 - VS.ghost.latency))); }
      }
      stall[S] = { late, frames, minAlpha: Math.round(minAlpha * 100) / 100, D: Math.round(tr.goalD * 100) / 100, base: Math.round(tr.base * 100) / 100, atErr: Math.round(atErr * 100) / 100 };
      ok(frames > 600 && late === 0 && minAlpha === 1, `rival ${S} s behind the clock: still starved 2 s after it came back (${JSON.stringify(stall[S])})`);
      ok(Math.abs(tr.base - S - 0.12) < 0.03 && tr.goalD < 0.6 && atErr < 0.02, `rival ${S} s behind the clock: time base ${JSON.stringify(stall[S])}`);
    }
    info.stall = stall;
  }
  // the rival stops at its arena while two bundles are lost: the run-on must settle back onto where it stands
  {
    const tr = new Track(), stopT = 9.6, at = (t) => 13.8 * Math.min(t, stopT);
    const mail = [];
    for (let k = 1; k <= 40; k++) { const t = k * 0.5; if (t === 10 || t === 10.5) continue; mail.push({ at: t + 0.2, s: { t, dist: at(t), n: 50, form: 0, flags: t > stopT ? 1 : 0, zone: 1, x: 0, xs: [0, 0, 0, 0, 0] } }); }
    let mi = 0, over = 0, maxBack = 0, last = null, end = null;
    for (let clock = 0.5; clock < 19; clock += 1 / 60) {
      while (mi < mail.length && mail[mi].at <= clock) tr.feed(mail[mi++].s, clock);
      const o = tr.play(clock);
      over = Math.max(over, o.dist - at(stopT));
      if (last != null) maxBack = Math.max(maxBack, last - o.dist);
      last = o.dist;
      if (clock > 13 && end == null) end = { dist: o.dist, boss: o.boss, clock };
    }
    info.stop = { over: Math.round(over * 100) / 100, maxBack: Math.round(maxBack * 1000) / 1000, end, final: last };
    ok(over > 2, `the stop test did not make the ghost run on past the arena (${over} u)`);
    ok(end && Math.abs(end.dist - at(stopT)) < 0.01 && end.boss === true && Math.abs(last - at(stopT)) < 0.01, `ghost stays ${end && (end.dist - at(stopT)).toFixed(2)} u past a rival that stopped`);
    ok(maxBack <= VS.ghost.settle / 60 + 1e-6, `ghost stepped back ${maxBack} u in one frame`);
  }

  // ---- 6. a rival level with me: on the road and in the same arena ----
  const twin = {};
  for (const [name, net] of [['fast', {}], ['slow', { lag: 0.3, flush: 0.5 }]]) {
    const hist = [];
    const mine = (t) => hist[Math.max(0, Math.min(hist.length - 1, Math.round(t * 10)))] || { dist: 0, boss: false };
    start([{ slot: 1, name: 'Twin', ...net, curve: (t) => { const m = mine(t); return { dist: m.dist, n: 60, x: 2.5, form: 0, boss: m.boss ? 0.9 : 0, zone: 1, flags: m.boss ? 1 : 0, danger: 0 }; } }]);
    const T = { road: { frames: 0, min: 9, sum: 0, rel: 0 }, arena: { frames: 0, min: 9, sum: 0, rel: 0, at: null } };
    for (let i = 0; i < 90 * 60 && g.state === 'playing' && g.run.active; i++) {
      g.heroes.guard = 99; g.heroes.invulnT = 5; if (g.squad.count < 30) d.give('troops', 40);
      if (g.boss && g.boss.alive) g.boss.hp = g.boss.maxHp; // the fight lasts: both stand in the arena
      versus.pump(1 / 60, 1 / 60);
      while (hist.length <= Math.floor(versus.t * 10 + 1e-6)) hist.push({ dist: g.run.dist, boss: g.run.phase === 'boss' });
      const inf = G.info(1), arena = g.run.phase === 'boss';
      if (arena && T.arena.at == null) T.arena.at = versus.t;
      if (arena ? versus.t - T.arena.at < 2 : versus.t < 3) continue;
      const a = arena ? T.arena : T.road;
      a.frames++; a.sum += inf.shown; a.min = Math.min(a.min, inf.shown); a.rel = Math.max(a.rel, Math.abs(inf.rel));
      if (arena && versus.t - T.arena.at > 12) break;
    }
    for (const a of [T.road, T.arena]) { a.avg = Math.round(a.sum / Math.max(1, a.frames) * 100) / 100; a.min = Math.round(a.min * 100) / 100; a.rel = Math.round(a.rel * 100) / 100; delete a.sum; }
    twin[name] = T;
    // (in my own lane the ghost goes fainter on purpose: nearAlpha; anywhere else it is fully shown)
    ok(T.road.frames > 2500 && T.road.min >= VS.ghost.nearAlpha - 0.02 && T.road.avg > 0.75 && T.road.rel < 1.6, `${name} link: a rival level with me on the road: ${JSON.stringify(T.road)}`);
    ok(T.arena.frames > 550 && T.arena.min >= VS.ghost.nearAlpha - 0.02 && T.arena.avg > 0.75 && T.arena.rel < 1.6, `${name} link: a rival in the same arena: ${JSON.stringify(T.arena)}`);
    versus.stop();
  }
  info.twin = twin;

  // ---- 7. a rival ahead whose clock is behind ----
  start([{ slot: 1, name: 'Late', lag: 4, curve: ahead(10) }]); // every sample is stamped 4 s behind the match clock
  let lateMin = 9, lateRel = [9, -9];
  for (let i = 0; i < 20 * 60 && g.state === 'playing' && g.run.active; i++) {
    g.heroes.guard = 99; if (g.squad.count < 30) d.give('troops', 40);
    versus.pump(1 / 60, 1 / 60);
    if (versus.t > 7) { const inf = G.info(1); lateMin = Math.min(lateMin, inf.shown); lateRel = [Math.min(lateRel[0], inf.rel), Math.max(lateRel[1], inf.rel)]; }
  }
  info.late = { min: Math.round(lateMin * 100) / 100, rel: lateRel.map((v) => Math.round(v * 10) / 10) };
  ok(lateMin > 0.95 && lateRel[0] > 8 && lateRel[1] < 15, `a rival 10 m ahead with its clock 4 s behind: ${JSON.stringify(info.late)}`);
  versus.stop();
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false);
  g.applyQuality('high');
  d.toTitle();
}
return { pass: fails.length === 0, fails, info };
