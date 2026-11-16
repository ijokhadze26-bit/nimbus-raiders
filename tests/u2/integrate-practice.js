// SPEC2 §9 integrate-practice: the pro bot wins a TRY IT practice run within 90 s of game time for every weapon at
// Mk I and Mk V (Pip), and for every hero with its favourite weapon at Mk III.
const g = window.__game, d = g.debug;
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const { HERO_DEFS } = await import('/src/data/heroes.js');
g.loop.stop();
const fails = [], rows = [];
function play(hero, weapon, mk) {
  d.setAutopilot('pro', 1);
  let s = d.startPractice({ hero, weapon, mk });
  let t = 0;
  while (s.state === 'playing' && t < 150) { s = d.simulate(1); t += 1; }
  const r = s.result || {};
  const row = { hero, weapon, mk, win: !!r.win, seconds: t, squad: s.squad, bossHp: s.bossHp, abilityKills: s.killsBy.ability };
  rows.push(row);
  if (!row.win) fails.push(`${hero}+${weapon} Mk ${mk}: lost (state ${s.state}, boss hp ${s.bossHp}, squad ${s.squad})`);
  else if (t > 90) fails.push(`${hero}+${weapon} Mk ${mk}: ${t} s > 90 s`);
}
for (const w of WEAPON_IDS) for (const mk of [1, 5]) play('pip', w, mk);
for (const h of HERO_DEFS) play(h.id, h.favourite, 3);
d.setAutopilot(false);
d.toTitle();
g.loop.start();
return { pass: fails.length === 0, fails, rows };
