// SPEC2 §9 WEAPONS: each weapon on L8 with Pip and the casual bot (seed 1) wins or loses deterministically -
// the result is identical on a rerun and on Low quality (weapon dice only on game.procRng; effects never
// feed back into the simulation).
const g = window.__game, d = g.debug;
g.loop.stop();
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const fails = [], table = {};
function play(weapon) {
  d.setLoadout('pip', weapon);
  d.setAutopilot('casual', 1, { crates: 'never', ability: true, loadout: 'keep' });
  d.startLevel(8);
  let s, guard = 0;
  do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
  const r = s.result || {};
  return JSON.stringify({ win: r.win, squad: r.squad, kills: r.kills, stars: r.stars, time: r.time, bossHp: r.bossHp, mk: s.mk, killsBy: s.killsBy, zones: g.zones.holes.length + '/' + g.zones.puddles.length });
}
for (const w of WEAPON_IDS) {
  g.applyQuality('high');
  const a = play(w), b = play(w);
  g.applyQuality('low');
  const c = play(w);
  g.applyQuality('high');
  table[w] = JSON.parse(a);
  if (a !== b) fails.push(`${w}: rerun differs ${a} vs ${b}`);
  if (a !== c) fails.push(`${w}: Low differs ${a} vs ${c}`);
}
d.setLoadout('pip', 'thunderclap');
d.toTitle();
return { pass: fails.length === 0, fails, table };
