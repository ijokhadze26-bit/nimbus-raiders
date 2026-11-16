// SPEC2 §9 WEAPONS / Sugar Rush (Mk III): nothing is hit while a bomb is airborne; a landing hits every enemy
// within r, shielded ones' hp included; puddles <= 5 alive and >= 0.5 s apart; a puddle slows; the bounce
// splashes again; no dead zone (a lone enemy 8 u ahead in the shooter's lane takes splash within 1.2 s);
// boss phase: each bomb damages the boss twice (splash + bounce).
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('sugarrush').mk[2];
const beh = () => g.weapons.behaviours.sugarrush;
const L = () => g.squad.leader;
function arena(events, { speed = 0, squad = 1, fire = false } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'sugarrush');
  d.startCustom({ length: 900, speed, events });
  d.setMk(3);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; e.slowPct = 1; e.slowT = 999; };
function bomb(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk;
  const n0 = g.bullets.active.length;
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: 60, pierce: 0, idx: 0 });
  return g.bullets.active[n0];
}
// 1 + 2. airborne bombs touch nothing; the landing splashes every enemy within r (shields too)
let es = arena([horde(40, 6, { grunt: 0.5, shield: 0.5 }, 'C', { hpMul: 20 })]);
const target = es[0];
hold(target, L().x, L().z - 14);
const ring = es.slice(1, 5);
ring.forEach((e, i) => hold(e, target.x + Math.cos(i * 1.57) * R3.splashR * 0.45, target.z + Math.sin(i * 1.57) * R3.splashR * 0.45));
const bait = es[5];
const hp0 = es.map((e) => e.hp), sh0 = es.map((e) => e.shield);
const b = bomb(L().x, L().z - 0.5, 0.2);
let airHit = 0;
for (let i = 0; i < 120 && b.air; i++) {
  if (b.y > 1.0) { bait.x = b.x; bait.z = b.z; } // ride under the bomb until just before it lands
  else { bait.z = L().z + 30; bait.x = 4; }
  const hb = bait.hp;
  d.simulate(1 / 60);
  if (b.air && bait.hp < hb) airHit++;
}
bait.z = L().z + 30; bait.x = 4; // away from the landing
const landed = [target, ...ring];
const hitLanding = landed.filter((e) => e.hp < hp0[es.indexOf(e)]).length;
const shieldsHit = landed.filter((e) => sh0[es.indexOf(e)] > 0 && e.hp < hp0[es.indexOf(e)] && e.shield === sh0[es.indexOf(e)]).length;
info.landing = { hit: hitLanding, of: landed.length, shieldedHpHit: shieldsHit, shielded: landed.filter((e) => sh0[es.indexOf(e)] > 0).length, airHits: airHit };
if (airHit) fails.push('hit while airborne x' + airHit);
if (hitLanding !== landed.length) fails.push(`landing hit ${hitLanding}/${landed.length}`);
if (!shieldsHit) fails.push('splash did not reach shielded hp');
// 5. the bounce splashes again (Mk III: one bounce)
d.simulate(0.6);
info.bounce = { landings: beh().stats.landings };
if (beh().stats.landings !== 2) fails.push(`one bomb landed ${beh().stats.landings} times (want 2)`);
// 3 + 4. puddles: <= 5 alive, >= 0.5 s apart, they slow
arena([horde(26, 40, { grunt: 1 }, 'both', { hpMul: 400 })], { speed: 0, squad: 30, fire: true });
for (const e of g.horde.list) hold(e, e.x, e.z);
const made = [];
const orig = g.zones.addPuddle.bind(g.zones);
g.zones.addPuddle = (...a) => { made.push(g.time); return orig(...a); };
let maxAlive = 0;
for (let i = 0; i < 400; i++) { d.simulate(1 / 60); maxAlive = Math.max(maxAlive, g.zones.puddles.length); }
g.zones.addPuddle = orig;
let minGap = Infinity;
for (let i = 1; i < made.length; i++) minGap = Math.min(minGap, made[i] - made[i - 1]);
info.puddles = { made: made.length, maxAlive, minGap: Math.round(minGap * 1000) / 1000 };
if (made.length < 3) fails.push('only ' + made.length + ' puddles');
if (maxAlive > 5) fails.push('more than 5 puddles: ' + maxAlive);
if (minGap < 0.5 - 1e-6) fails.push('puddles closer than 0.5 s: ' + minGap);
g.weapons.enabled = false;
const p = g.zones.puddles[g.zones.puddles.length - 1];
const walker = g.horde.list.find((e) => e.state === 0);
walker.slowPct = 0; walker.slowT = 0; walker.stickyT = 0; walker.x = p.x; walker.z = p.z; walker.charging = true;
d.simulate(1 / 60);
info.puddleSlow = { spd: Math.round(walker.spd * 1000) / 1000, pct: p.pct };
if (Math.abs(walker.spd - (1 - p.pct)) > 1e-6) fails.push(`in puddle spd ${walker.spd} vs ${1 - p.pct}`);
// 6. no dead zone: a lone (held) enemy 8 u ahead in the lane takes splash within 1.2 s. The run moves at 4 u/s:
// at 9 u/s the squad itself covers the 0.8 s lob in 7.2 u and touches an 8 u enemy first, so no lobbed
// weapon could ever reach it; the check is that the aim does not skip close enemies (no minimum gap).
es = arena([horde(40, 1, { grunt: 1 }, 'C', { hpMul: 400 })], { speed: 4, squad: 6 });
const lone = es[0];
g.status.freeze(lone, 9, { shatter: false });
lone.x = L().x; lone.z = L().z - 8;
const hpL = lone.hp, t0 = g.time;
g.weapons.enabled = true;
let hitAt = -1;
for (let i = 0; i < 72 && hitAt < 0; i++) { d.simulate(1 / 60); if (lone.hp < hpL) hitAt = g.time - t0; }
info.deadZone = { hitAfterS: Math.round(hitAt * 100) / 100 };
if (hitAt < 0) fails.push('lone enemy 8 u ahead not splashed within 1.2 s');
// 7. boss phase: every bomb damages the boss twice (splash + bounce)
d.bossTest('grawlstone', { weapon: 'sugarrush', mk: 3, squad: 10, hp: 999999 });
let guard = 0;
while (g.boss && g.boss.state !== 'fight' && guard++ < 100) d.simulate(0.1);
g.weapons.enabled = false;
d.simulate(1.5);
const B = g.boss;
let calls = 0;
const dt0 = B.damageTyped.bind(B);
B.damageTyped = (dd, el) => { if (el === 'sugarrush') calls++; return dt0(dd, el); };
const bb = bomb(L().x, L().z - 0.5, 0.5);
for (let i = 0; i < 150 && !bb.dead && g.bullets.active.includes(bb); i++) d.simulate(1 / 60);
d.simulate(0.2);
B.damageTyped = dt0;
info.boss = { calls };
if (calls !== 2) fails.push(`one bomb hit the boss ${calls} times (want 2)`);
d.toTitle();
return { pass: fails.length === 0, fails, info };
