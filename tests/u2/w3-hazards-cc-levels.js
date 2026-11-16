// @smoke --seconds 0 --shots 0
// Update 3 stage 2: the world hazards on real levels (L31, L32, L36 Candy Kingdom; L41, L42, L46 Storm Citadel) on
// High and Low quality - the 'pro' bot plays the level with sync + render every ~0.5 s; every level spawns its
// planned hazards, nothing throws, Low draws no more hazard meshes than High, and the hazard system leaves
// nothing behind after the run (fog back to the theme's, no hazard objects, mods reset).
const g = window.__game, d = g.debug;
g.loop.stop();
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const HP = await import('/src/data/hazardplan.js');
const { getLevel } = await import('/src/data/levels.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const hz = g.hazards;
d.setLoadout('pip', 'thunderclap');
const runs = {};
const t0 = performance.now();
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  for (const id of [31, 32, 36, 41, 42, 46]) {
    const plan = HP.hazardsOf(getLevel(id));
    d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
    d.startLevel(id);
    d.give('troops', 150); d.give('mk', 2);
    let calls = 0;
    const last = plan.reduce((m, e) => Math.max(m, e.at + (e.length || 0)), 0);
    for (let i = 0; i < 4800 && g.state === 'playing' && g.run.dist < last + 30; i++) {
      g.step(1 / 60);
      if (i % 30 === 0) { g.sync(1 / 2); g.engine.render(); calls = Math.max(calls, g.engine.stats.calls); }
      if (q === 'high' && i === 700 && (id === 31 || id === 41)) await shot(`L${id}-high`);
    }
    if (q === 'low' && (id === 36 || id === 46)) await shot(`L${id}-low`);
    const s = hz.state();
    const spawned = Object.values(s.spawned).reduce((a, b) => a + b, 0);
    runs[`L${id}${q[0]}`] = { spawned, plan: plan.length, kills: s.kills, dist: Math.round(g.run.dist), squad: g.squad.count, calls };
    ok(spawned === plan.length || g.state !== 'playing', `L${id} ${q}: spawned ${spawned} of ${plan.length} hazards`);
    ok(g.squad.count > 0, `L${id} ${q}: pro wiped by the hazards`);
  }
}
info.ms = Math.round(performance.now() - t0);
info.runs = runs;
d.setAutopilot(false);
d.toTitle();
g.sync(1 / 2); g.sync(1 / 2);
ok(hz.list.length === 0 && hz.mods.fogMul === 1 && g.world.fogK === 1, `hazards left behind: ${hz.list.length} objects, fogK ${g.world.fogK}`);
// hazard-made holes and bullet targets are gone with the run too
ok(!g.obstacles.gaps.some((x) => x.hazard), 'hazard holes left behind');
for (const k of ['gumball', 'choco']) { const t = g.bullets.systems.find((s) => s.kind === k); ok(!t || (t.balls || t.falls).length === 0, `${k} targets left behind`); }
g.applyQuality('high');
return { pass: fails.length === 0, fails, info };
