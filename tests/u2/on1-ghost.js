// @smoke --seconds 0 --shots 0
// Online stage 1: the rival ghost (src/online/game/ghost.js + track.js).
// 1. No peers: the ghost mesh is hidden (count 0) for a whole match and costs no draw call; single-player never shows it.
// 2. One rival: ONE instanced mesh draws it (+1 draw call on Low, +2 on High: the name tag), more Raiders for a bigger
//    squad, fewer on Low than on High, placed at the rival's own distance and lane.
// 3. A rival far ahead is pinned at the edge of the view window, a rival behind fades out; a fallen rival's ghost goes.
// 4. Playback never jumps: bundles arriving with jitter, bursts and a lost message move the ghost smoothly
//    (distance never runs backwards, no step bigger than a fast run allows); a silent rival fades instead.
// 5. After the match (stop / result) the mesh is hidden again.
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
    // the ghost is shown a little late (jitter buffer), so a rival 12 m ahead stands 12 m minus what I ran meanwhile
    ok(one[q].vis && one[q].count === i.drawn && one[q].count >= 5, `${q}: ghost not drawn (${JSON.stringify(one[q])})`);
    ok(one[q].rel > 7 && one[q].rel < 12.5 && Math.abs(one[q].dz - one[q].rel) < 0.11 && Math.abs(one[q].x + 2) < 0.2, `${q}: ghost not at the rival's place (${JSON.stringify(one[q])})`);
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
    ok(maxLate < 1.1 && tr.goalD >= VS.ghost.delayMin && tr.goalD <= 0.75, `ghost shown ${maxLate} s late, delay ${tr.goalD}`);
    ok(minAlpha > 0.8, `ghost flickered under jitter (alpha down to ${minAlpha})`);
    // silence: no more data -> runs on briefly, then fades to the starve opacity, never past the last distance + speed * 0.4
    let o = null;
    for (let clock = 41; clock < 45; clock += 1 / 60) o = tr.play(clock);
    ok(o.alpha <= VS.ghost.starveAlpha + 1e-6 && o.dist <= distAt(40) + 11 * VS.ghost.extrapolate + 0.01, `silent rival: alpha ${o.alpha}, dist ${o.dist}`);
  }
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false);
  g.applyQuality('high');
  d.toTitle();
}
return { pass: fails.length === 0, fails, info };
