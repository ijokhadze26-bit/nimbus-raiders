// SPEC2 §9 WEAPONS / Gearworks (Mk III): one gear damages 1 + bounces distinct enemies in a spaced cluster
// (x0.8 per bounce) and removes 3 shield hits; a mini turret appears within `turretEvery + 0.1` s, expires
// at `turretLife`, at most 3 exist; turrets fire small gears with element gearworks.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('gearworks').mk[2];
const beh = () => g.weapons.behaviours.gearworks;
const L = () => g.squad.leader;
function arena(events, { speed = 0, squad = 1, fire = false, mk = 3, hero = 'pip' } = {}) {
  d.setAutopilot(false);
  d.setLoadout(hero, 'gearworks');
  d.startCustom({ length: 900, speed, events });
  d.setMk(mk);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
// held in place: frozen (no shatter) so neither the charge nor the lateral steering moves it
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; g.status.freeze(e, 999, { shatter: false }); };
function gear(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk;
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: 60, pierce: 0, idx: 0 });
}
// 1. bounces: a spaced cluster (3 u apart, inside the 7 u bounce reach), 7 enemies
let es = arena([horde(40, 7, { grunt: 1 }, 'C', { hpMul: 900 })]);
const spots = [[0, -14], [-2.5, -16], [2.2, -18], [-1.5, -20.5], [2, -22.5], [-2.4, -25], [1.6, -27]];
es.forEach((e, i) => hold(e, L().x + spots[i][0], L().z + spots[i][1]));
const hp0 = es.map((e) => e.hp);
gear(L().x, L().z - 1, 1);
d.simulate(1.5);
const dealt = es.map((e, i) => Math.round((hp0[i] - e.hp) * 10000) / 10000);
const hit = dealt.filter((v) => v > 0).length;
const sorted = dealt.filter((v) => v > 0).sort((a, b) => b - a);
info.bounce = { hit, want: 1 + R3.bounces, dealt: sorted };
if (hit !== 1 + R3.bounces) fails.push(`one gear hit ${hit} enemies (want ${1 + R3.bounces})`);
for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i] / sorted[i - 1] - R3.bounceMul) > 0.02) fails.push(`bounce falloff ${sorted[i] / sorted[i - 1]}`);
// 2. 3 shield hits per gear
es = arena([horde(40, 1, { shield: 1 }, 'C', { hpMul: 50 })]);
hold(es[0], L().x, L().z - 12);
const sh = es[0].shield;
gear(L().x, L().z - 1, 0.01);
d.simulate(1);
info.shield = [sh, es[0].shield];
if (es[0].shield !== sh - 3) fails.push(`shield ${sh} -> ${es[0].shield} (want -3)`);
// 3. turrets: first within every + 0.1 s, life = turretLife, max 3
arena([horde(60, 30, { grunt: 1 }, 'both', { hpMul: 60 })], { squad: 10, fire: true });
for (const e of g.horde.list) hold(e, e.x, L().z - 28 - (e.z - g.horde.list[0].z) * 0.3);
const t0 = g.time;
let first = -1, firstLife = 0, expired = -1, maxN = 0;
const seen = new Map();
for (let i = 0; i < 60 * 16; i++) {
  d.simulate(1 / 60);
  const road = g.helpers.roadList.filter((h) => h.kind === 'gearturret');
  maxN = Math.max(maxN, road.length);
  if (first < 0 && road.length) { first = g.time - t0; firstLife = road[0].life; seen.set(road[0], g.time); }
  for (const [h, born] of seen) if (!g.helpers.roadList.includes(h) && expired < 0) expired = g.time - born;
}
const shots = g.helpers.roadList.reduce((s, h) => s + h.shots, 0);
info.turret = { first: Math.round(first * 100) / 100, every: R3.turretEvery, lifeAtDrop: Math.round(firstLife * 100) / 100, livedS: Math.round(expired * 100) / 100, life: R3.turretLife, maxN, shots };
if (first < 0 || first > R3.turretEvery + 0.1) fails.push(`first turret at ${first}s (every ${R3.turretEvery})`);
if (Math.abs(expired - R3.turretLife) > 0.1) fails.push(`turret lived ${expired}s (life ${R3.turretLife})`);
const el = new Set(g.bullets.active.filter((b) => b.style === beh().miniStyle).map((b) => b.el));
if (el.size && (el.size !== 1 || !el.has('gearworks'))) fails.push('turret gear element ' + [...el]);
// cap: force six drops back to back
for (let k = 0; k < 6; k++) { beh().tt = 99; d.simulate(1 / 60); }
const n = g.helpers.roadList.filter((h) => h.kind === 'gearturret').length;
info.turret.forced = n;
if (n > 3) fails.push('more than 3 turrets: ' + n);
d.toTitle();
return { pass: fails.length === 0, fails, info };
