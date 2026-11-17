// @smoke --seconds 0 --shots 0
// Update 3 stage 4 (STAGE4 §B, builder "road"): quick autopilot spot check (not a balance sweep). Four levels
// that carry 3-lane rows, ramp / chain gates and a rescue cage, Pip + Thunderclap with mid-campaign upgrades per
// world, bots 'pro' and 'casual', one seed. Each level also runs with its road features stripped back to the
// stage 3 shape (no middle gates, no ramps / chains / cages; 3-lane gates back to L / R) so the report shows
// whether the features moved the result. Pass = every level is won by at least one bot with the features.
const g = window.__game, d = g.debug;
g.loop.stop();
const L = await import('/src/data/levels.js');
const LEVELS = [4, 17, 28, 39];
const UPS = { 1: { damage: 2, rate: 2, squad: 2 }, 2: { damage: 6, rate: 6, squad: 5, tier: 1 }, 3: { damage: 10, rate: 10, squad: 8, tier: 1 }, 4: { damage: 14, rate: 14, squad: 10, tier: 2 } };
const strip = (def) => {
  const events = [];
  for (const e of def.events) {
    if (e.type === 'lanes3' || e.type === 'cage' || (e.type === 'gate' && e.lane === 'C3')) continue;
    if (e.type !== 'gate') { events.push(e); continue; }
    const o = { ...e };
    if (o.lane === 'L3') o.lane = 'L';
    if (o.lane === 'R3') o.lane = 'R';
    delete o.ramp; delete o.chain; delete o.link; delete o.alt; delete o.three;
    events.push(o);
  }
  return { ...def, events };
};
const play = (def, prof, custom) => {
  d.setAutopilot(prof, 1, { crates: 'never', ability: true, loadout: 'keep' });
  if (custom) g.beginRun(def, 'level', 1, { hero: 'pip', weapon: 'thunderclap' }); else d.startLevel(def.id);
  let s, guard = 0;
  do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
  const r = s.result || {};
  return { win: !!r.win, stars: r.stars | 0, squad: r.squad | 0, rescued: (g.run && g.run.stats.rescued) || 0 };
};
const out = {}, fails = [];
for (const id of LEVELS) {
  const def = L.getLevel(id);
  g.save.reset();
  d.setUpgrades(UPS[def.world] || UPS[4]);
  d.setLoadout('pip', 'thunderclap');
  const row = {};
  for (const prof of ['pro', 'casual']) {
    row[prof] = play(def, prof, false);
    row[prof + 'Plain'] = play(strip(def), prof, true);
  }
  out['L' + id] = row;
  if (!row.pro.win && !row.casual.win) fails.push(`L${id}: no bot wins with the road features`);
}
d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, info: out };
