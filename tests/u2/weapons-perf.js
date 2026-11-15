// @smoke --size 390x844
// SPEC2 §9 WEAPONS / perf: L8 (pro bot, 150 extra raiders) at Mk V for each weapon: draw calls <= 110 High and
// <= 90 Low (renderer.info, shadow pass included, via the perf probe), and no new shader programs after the
// first 2 s of the run (all weapon styles, zone views, turret and crate are warmed at boot).
const g = window.__game, d = g.debug;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const fails = [], out = {};
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  // a quality switch recompiles the scene's variants: one throwaway run settles them before measuring
  d.setLoadout('pip', 'thunderclap'); d.setAutopilot('pro', 1); d.startLevel(8); await wait(2500); d.simulate(18); await wait(2500);
  for (const w of WEAPON_IDS) {
    d.setLoadout('pip', w);
    d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
    d.startLevel(8);
    await wait(2000);
    const p0 = g.engine.renderer.info.programs.length;
    d.simulate(18);
    d.give('troops', 150);
    d.setMk(5);
    await wait(500);
    d.perfStart(); await wait(2500);
    const p = d.perfStop();
    const p1 = g.engine.renderer.info.programs.length;
    out[q + ':' + w] = { calls: p.calls, programs: [p0, p1], squad: g.squad.count, bullets: g.bullets.count };
    const cap = q === 'high' ? 110 : 90;
    if (p.calls.max > cap) fails.push(`${q} ${w}: ${p.calls.max} calls > ${cap}`);
    if (p1 > p0) fails.push(`${q} ${w}: programs grew ${p0} -> ${p1}`);
  }
}
g.applyQuality('high');
d.toTitle();
return { pass: fails.length === 0, fails, out };
