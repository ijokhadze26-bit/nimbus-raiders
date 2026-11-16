// SPEC2 §9 WEAPONS / Emberstorm (Mk III): flames never reach an enemy 32 u away in the run phase (range 26);
// an enemy that was hit keeps burning for ~burnTime after the flames stop; a shielded enemy gets no burn
// until its shield breaks; boss phase: the halted squad's jet reaches the boss. Plus: flames pass gates /
// barrels (mask), the cone is deterministic (two identical runs give identical numbers).
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('emberstorm').mk[2];
const r3 = (v) => Math.round(v * 1000) / 1000;
function arena(events, { fire = true, speed = 0, squad = 20 } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'emberstorm');
  d.startCustom({ length: 800, speed, events });
  d.setMk(3);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; g.status.slow(e, 1, 999); }; // immobile, not frozen (no +25%)
function once() {
  const nums = [];
  // 1. range: an enemy 32 u ahead is never hit; one at 20 u is
  let es = arena([horde(40, 2, { grunt: 1 }, 'C', { hpMul: 400 })], { fire: false });
  const L = g.squad.leader;
  hold(es[0], L.x, L.z - 32); hold(es[1], L.x + 0.3, L.z - 32);
  const hp0 = es[0].hp;
  g.weapons.enabled = true;
  d.simulate(3);
  nums.push(r3(es[0].hp));
  if (es[0].hp !== hp0 || es[1].hp !== hp0) fails.push(`32 u enemy was hit (${hp0} -> ${es[0].hp})`);
  hold(es[1], L.x, L.z - 20);
  d.simulate(1.5);
  if (!(es[1].hp < hp0)) fails.push('20 u enemy was never hit');
  info.rangeMk3 = R3.range;
  // 2. burn keeps ticking after the flames stop, for about burnTime
  es = arena([horde(40, 1, { grunt: 1 }, 'C', { hpMul: 400 })], { fire: false });
  const e = es[0];
  hold(e, L.x, L.z - 12);
  g.weapons.enabled = true;
  d.simulate(0.5);
  g.weapons.enabled = false;
  d.simulate(0.6); // flames in flight land
  const pool0 = e.burnPool, hpA = e.hp;
  if (!(pool0 > 0)) fails.push('no burn pool after being hit');
  const t0 = g.time; let lastDrop = t0, prev = e.hp;
  for (let i = 0; i < 180; i++) { d.simulate(1 / 60); if (e.hp < prev - 1e-9) lastDrop = g.time; prev = e.hp; }
  const burnFor = lastDrop - t0 + 0.6;
  nums.push(r3(hpA - e.hp), r3(burnFor));
  info.burn = { pool: r3(pool0), dealtAfter: r3(hpA - e.hp), burnedForS: r3(burnFor), burnTime: R3.burnTime };
  if (!(hpA - e.hp > pool0 * 0.95)) fails.push(`burn after stop dealt ${hpA - e.hp} of pool ${pool0}`);
  if (!(burnFor > R3.burnTime * 0.7 && burnFor < R3.burnTime * 1.35)) fails.push(`burn lasted ${burnFor}s, burnTime ${R3.burnTime}`);
  // 3. a shielded enemy: no burn while its shield holds
  es = arena([horde(40, 1, { shield: 1 }, 'C', { hpMul: 400 })], { fire: false });
  const s = es[0];
  hold(s, L.x, L.z - 12);
  g.weapons.enabled = true;
  let burnWhileShield = 0, broke = -1, burnedAfter = false;
  for (let i = 0; i < 240; i++) {
    d.simulate(1 / 60);
    if (s.shield > 0 && s.burnPool > 0) burnWhileShield++;
    if (s.shield === 0 && broke < 0) broke = g.time;
    if (broke >= 0 && s.burnPool > 0) burnedAfter = true;
  }
  nums.push(broke >= 0 ? 1 : 0);
  if (burnWhileShield) fails.push(`burn applied while shielded (${burnWhileShield} steps)`);
  if (broke < 0) fails.push('shield never broke (flames should still strip shield hits)');
  else if (!burnedAfter) fails.push('no burn after the shield broke');
  // 4. flames pass gates and barrels (mask ENEMY | BOSS); tracers carry the gate economy
  const masks = new Set();
  for (const b of g.bullets.active) if (b.owner === g.weapons.beh) masks.add(b.mask);
  if ([...masks].some((m) => m !== 12)) fails.push('flame mask ' + [...masks]);
  // 5. boss phase: the halted squad's jet reaches the boss
  d.setLoadout('pip', 'emberstorm');
  d.bossTest('grawlstone', { weapon: 'emberstorm', mk: 3, squad: 30, hp: 99999 });
  let guard = 0;
  while (g.boss && g.boss.state !== 'fight' && guard++ < 100) d.simulate(0.1);
  const bh0 = g.boss.hp;
  d.simulate(3);
  const dist = g.squad.leader.z - (g.boss.z + g.boss.def.hitbox.front);
  info.boss = { dealt: r3(bh0 - g.boss.hp), dist: r3(dist), burnPool: r3(g.boss.burnPool) };
  nums.push(r3(bh0 - g.boss.hp));
  if (!(bh0 - g.boss.hp > 0)) fails.push(`boss not hit from ${dist} u`);
  if (!(g.boss.burnPool > 0)) fails.push('boss not burning');
  return nums;
}
const A = once(), B = once();
if (JSON.stringify(A) !== JSON.stringify(B)) fails.push('rerun differs ' + JSON.stringify(A) + ' vs ' + JSON.stringify(B));
d.toTitle();
return { pass: fails.length === 0, fails, info, nums: A };
