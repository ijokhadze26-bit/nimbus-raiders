// SPEC2 §9 foundation-determinism: L8 and L15 with the pro bot and three loadouts, each run twice on High and
// once on Low -> identical results (the simulation never reads quality, show flags or the wall clock).
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], table = {};
function play(id, hero, weapon) {
  d.setLoadout(hero, weapon);
  d.setAutopilot('pro', 1, { crates: 'auto', ability: true, loadout: 'keep' });
  d.startLevel(id);
  let s, guard = 0;
  do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
  const r = s.result || {};
  return JSON.stringify({ win: r.win, squad: r.squad, kills: r.kills, stars: r.stars, time: r.time, bossHp: r.bossHp, weapon: s.weapon, mk: s.mk, killsBy: s.killsBy });
}
const loadouts = [['pip', 'thunderclap'], ['vex', 'voidsiphon'], ['rime', 'glacier']];
for (const id of [8, 15]) for (const [h, w] of loadouts) {
  g.applyQuality('high');
  const a = play(id, h, w), b = play(id, h, w);
  g.applyQuality('low');
  const c = play(id, h, w);
  g.applyQuality('high');
  const key = `L${id} ${h}+${w}`;
  table[key] = JSON.parse(a);
  if (a !== b) fails.push(`${key}: rerun differs ${a} vs ${b}`);
  if (a !== c) fails.push(`${key}: Low differs ${a} vs ${c}`);
}
d.setLoadout('pip', 'thunderclap');
d.toTitle();
return { pass: fails.length === 0, fails, table };
