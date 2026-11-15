// SPEC2 §5 / §9 foundation-practice: a TRY IT run never touches coins, stars, unlockedLevel or stats; the
// squad is 60 + the hero's start bonus whatever the shop upgrades; the ability starts charged.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [];
g.save.update((s) => { s.coins = 777; s.upgrades.squad = 9; s.upgrades.damage = 5; s.stars[1] = 2; s.unlockedLevel = 3; });
const snap = () => JSON.stringify({ c: g.save.data.coins, s: g.save.data.stars, u: g.save.data.unlockedLevel, st: g.save.data.stats });
const before = snap();
for (const [hero, weapon, mk, want] of [['pip', 'spectra', 3, 60], ['vex', 'glacier', 5, 66]]) {
  d.setAutopilot('pro', 1);
  let s = d.startPractice({ hero, weapon, mk });
  if (s.mode !== 'practice' || s.squad !== want || s.mk !== mk || s.weapon !== weapon || s.hero !== hero) fails.push(`start ${JSON.stringify({ m: s.mode, q: s.squad, mk: s.mk, w: s.weapon, h: s.hero })}`);
  if (!s.ability.ready) fails.push(hero + ' ability not charged');
  if (Math.abs(g.weapons.dmgMul - 1) > 1e-9) fails.push('shop damage applied in practice');
  let guard = 0;
  do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 10);
  if (s.state !== 'result') fails.push(`${hero}: practice did not end (${s.state})`);
  if (g.lastAward) fails.push('practice produced an award');
  if (snap() !== before) fails.push(`${hero}: save changed ${snap()} vs ${before}`);
}
g.save.reset();
d.toTitle();
return { pass: fails.length === 0, fails };
