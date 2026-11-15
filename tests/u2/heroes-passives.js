// SPEC2 §3 / §9 heroes-passives: Vex starts 6 bigger and dodges at x0.7; Bonbon's win payout = shop x 1.25;
// Rime's weapon range x1.2; Pip's fire rate x1.1; Cinder's burns finish 20% sooner with the same total; Guard
// blocks the first `health` contact losses and refills 1 point in 4 s.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { HERO_DEF_BY_ID } = await import('/src/data/heroes.js');
const { awardWin, coinMul } = await import('/src/save/progress.js');
const fails = [], info = {};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
d.setAutopilot(false);
d.setUpgrades({ squad: 0, damage: 0, rate: 0, tier: 0, coins: 0 });

// Vex: +6 start, dodge x0.7 (measured: the same steering step moves him 0.7x as far... in ease terms)
d.setLoadout('pip', 'thunderclap'); d.startLevel(1); const pipStart = g.squad.count;
d.setLoadout('vex', 'voidsiphon'); d.startLevel(1); const vexStart = g.squad.count;
if (vexStart !== pipStart + 6) fails.push(`Vex start ${vexStart} vs Pip ${pipStart}`);
const dodge = (hero) => {
  d.setLoadout(hero, 'thunderclap'); d.startCustom({ length: 400, events: [] });
  g.squad.leader.x = 0; g.input.targetX = 3;
  const L = g.squad.leader;
  g.squad.update(0.05, 3, 0);
  return L.x;
};
const kPip = -Math.log(1 - dodge('pip') / 3), kVex = -Math.log(1 - dodge('vex') / 3);
info.dodge = Math.round(kVex / kPip * 1000) / 1000;
if (!near(kVex / kPip, 0.7, 1e-3)) fails.push('Vex dodge ease ratio ' + kVex / kPip);
// Bonbon: win payout = base x shop coin bonus x 1.25
d.setUpgrades({ coins: 2 });
d.setLoadout('bonbon', 'sugarrush'); d.startLevel(1);
const p = { levelId: 1, mode: 'level', stars: 3, coins: 200, kills: 0, squad: 10 };
const c0 = g.save.data.coins;
const r = awardWin(g.save, p, g.run);
const want = Math.round(200 * coinMul(g.save) * 1.25);
if (r.coins !== want || g.save.data.coins - c0 !== want) fails.push(`Bonbon payout ${r.coins} want ${want}`);
info.bonbon = { coins: r.coins, shop: coinMul(g.save) };
d.setUpgrades({ coins: 0 });
// Rime range x1.2, Pip rate x1.1
d.setLoadout('rime', 'glacier'); d.startLevel(1); d.simulate(1);
const rimeRange = g.weapons.v.range;
d.setLoadout('cinder', 'glacier'); d.startLevel(1); d.simulate(1);
const baseRange = g.weapons.v.range;
if (!near(rimeRange / baseRange, 1.2, 1e-6)) fails.push(`Rime range ${rimeRange} vs ${baseRange}`);
d.setLoadout('pip', 'glacier'); d.startLevel(1); const pipRate = g.weapons.rates();
d.setLoadout('cinder', 'glacier'); d.startLevel(1); const baseRate = g.weapons.rates();
if (!near(pipRate / baseRate, 1.1, 1e-6)) fails.push(`Pip rate ${pipRate} vs ${baseRate}`);
info.range = rimeRange / baseRange; info.rate = pipRate / baseRate;
// Cinder: burn time x0.8, same total
const burn = (hero) => {
  d.setLoadout(hero, 'emberstorm');
  d.startCustom({ length: 400, events: [horde(40, 4, { grunt: 1 }, 'both', { hpMul: 10 })] });
  g.weapons.enabled = false; d.simulate(0.05);
  const e = g.horde.list.find((x) => x.state === 0);
  g.status.slow(e, 1, 60);
  const hp0 = e.hp;
  g.status.burn(e, 2, 1.5);
  const out = { t: e.burnT };
  let t = 0;
  while (e.burnPool > 0 && t < 3) { g.step(1 / 60); t += 1 / 60; }
  out.done = Math.round(t * 100) / 100; out.total = Math.round((hp0 - e.hp) * 1000) / 1000;
  return out;
};
const bc = burn('cinder'), bp = burn('pip');
info.burn = { cinder: bc, pip: bp };
if (!near(bc.t, 1.2, 1e-6) || !near(bp.t, 1.5, 1e-6)) fails.push(`burn time cinder ${bc.t} pip ${bp.t}`);
if (!near(bc.total, bp.total, 0.002) || !near(bc.total, 2, 0.002)) fails.push(`burn totals ${bc.total} vs ${bp.total}`);
if (!(bc.done < bp.done)) fails.push('Cinder burn did not finish sooner');
// Guard: blocks the first `health` touches, then raiders are lost; refills 1 point in 4 s
for (const hero of ['rime', 'vex']) {
  const hp = HERO_DEF_BY_ID[hero].health;
  d.setLoadout(hero, 'thunderclap');
  d.startCustom({ length: 2000, events: [horde(40, 12, { grunt: 1 }, 'both', { hpMul: 50 })] });
  g.weapons.enabled = false; d.give('troops', 20); d.simulate(0.05);
  const es = g.horde.list.filter((x) => x.state === 0);
  const L = g.squad.leader, c = g.squad.count;
  if (g.heroes.guard !== hp) fails.push(`${hero} guard ${g.heroes.guard} != ${hp}`);
  for (let i = 0; i < hp + 2; i++) { const e = es[i]; e.x = L.x; e.z = L.z - 0.2; g.step(1 / 60); }
  const lost = c - g.squad.count;
  if (lost !== 2 || g.heroes.guard !== 0) fails.push(`${hero}: ${hp + 2} touches lost ${lost} raiders, guard ${g.heroes.guard}`);
  // refill: 1 point 4 s after the first point was spent (the timer runs while below max)
  let t = (hp + 2) / 60;
  while (g.heroes.guard === 0 && t < 6) { g.step(1 / 60); t += 1 / 60; }
  if (Math.abs(t - 4) > 0.05 || g.heroes.guard !== 1) fails.push(`${hero} guard refill after ${t.toFixed(2)} s (guard ${g.heroes.guard})`);
  info['guard_' + hero] = { health: hp, lost, refill: Math.round(t * 100) / 100 };
}
d.toTitle();
return { pass: fails.length === 0, fails, info };
