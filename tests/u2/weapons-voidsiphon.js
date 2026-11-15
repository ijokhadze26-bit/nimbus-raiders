// SPEC2 §9 WEAPONS / Void Siphon (Mk III): an orb collapses into a hole that pulls; Bulwarks move x0.3; the
// crush ignores shields; at most 6 holes, with merging; holes survive a weapon:swap; boss phase crushes the
// boss. Combo: one Sugar Rush splash on a packed hole hits >= 2x the enemies of the same splash on the same
// crowd unpacked.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('voidsiphon').mk[2];
const beh = () => g.weapons.behaviours.voidsiphon;
const L = () => g.squad.leader;
function arena(events, { mk = 3, weapon = 'voidsiphon', speed = 0, fire = false, squad = 1 } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', weapon);
  d.startCustom({ length: 900, speed, events });
  d.setMk(mk);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
// held in place: frozen (no shatter) so neither the charge nor the lateral steering moves it
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; g.status.freeze(e, 999, { shatter: false }); };
function orb(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk, r = b.row(mk);
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: r.range, pierce: 0, idx: 0 });
}
// 1 + 2 + 3. pull (Bulwark x0.3), crush through shields
let es = arena([horde(40, 3, { grunt: 0.34, tank: 0.33, shield: 0.33 }, 'C', { hpMul: 400 })]);
const grunt = es.find((e) => e.def.id === 'grunt'), tank = es.find((e) => e.def.id === 'tank'), shield = es.find((e) => e.def.id === 'shield');
const cz = L().z - 14;
hold(shield, L().x, cz); hold(grunt, L().x - 3.8, cz - 0.5); hold(tank, L().x + 3.8, cz - 0.5);
const sh0 = shield.shield, shp = shield.hp;
orb(L().x, L().z - 1, 2);
let holeAt = -1;
for (let i = 0; i < 120 && holeAt < 0; i++) { d.simulate(1 / 60); if (g.zones.holes.length) holeAt = g.time; }
const H = g.zones.holes[0];
const gd0 = Math.hypot(grunt.x - H.x, grunt.z - H.z), td0 = Math.hypot(tank.x - H.x, tank.z - H.z);
d.simulate(0.15);
const gd1 = Math.hypot(grunt.x - H.x, grunt.z - H.z), td1 = Math.hypot(tank.x - H.x, tank.z - H.z);
const ratio = (td0 - td1) / (gd0 - gd1);
d.simulate(1.0);
info.pull = { grunt: [gd0, gd1].map((v) => Math.round(v * 100) / 100), tank: [td0, td1].map((v) => Math.round(v * 100) / 100), tankRatio: Math.round(ratio * 100) / 100, shield: [sh0, shield.shield], shieldHp: [shp, shield.hp] };
if (!(gd1 < gd0 - 0.5)) fails.push('hole did not pull the grunt');
if (Math.abs(ratio - R3.tankPull) > 0.05) fails.push(`tank pull ratio ${ratio} vs ${R3.tankPull}`);
if (!(shield.hp < shp)) fails.push('crush did not reach shielded hp');
if (shield.shield < sh0 - 1) fails.push(`crush stripped shield hits ${sh0} -> ${shield.shield}`);
// 4. at most 6 holes, merging
arena([], {});
for (let k = 0; k < 14; k++) { orb(-4 + (k % 7) * 1.3, L().z - 1 - (k > 6 ? 4 : 0), 1); }
d.simulate(1.8);
const hs = g.zones.holes;
info.holes = { n: hs.length, merges: hs.reduce((s, h) => s + h.merges, 0), made: beh().stats.holes };
if (hs.length > 6) fails.push('more than 6 holes: ' + hs.length);
if (!(info.holes.merges > 0)) fails.push('no merge happened');
if (hs.some((h) => h.grow > 1.3 + 1e-9)) fails.push('hole grew past x1.3');
// 5. holes survive a weapon swap
const n0 = hs.length;
g.weapons.setWeapon('sugarrush');
if (g.zones.holes.length !== n0 || !n0) fails.push('holes cleared by a weapon swap');
// 6. combo: one Sugar Rush splash on a packed crowd vs the same crowd spread out
function crowd() {
  const list = arena([horde(40, 36, { grunt: 1 }, 'C', { hpMul: 400 })], { weapon: 'sugarrush' });
  list.forEach((e, i) => hold(e, -3.6 + (i % 6) * 1.45, L().z - 18 - Math.floor(i / 6) * 1.45));
  d.simulate(1 / 60); // rebuild the enemy grid at the new spots
  return list;
}
function splashCount(list, x, z) {
  const S = g.weapons.behaviours.sugarrush;
  const hp = list.map((e) => e.hp);
  S.onLand({ x, y: 0.55, z, gen: 0, dmg: 0.001, unit: 0.001, data: 1, bounces: 0, dead: false });
  return list.filter((e, i) => e.hp < hp[i]).length;
}
let list = crowd();
const cx = L().x, czz = L().z - 18 - 2.5 * 1.45;
const loose = splashCount(list, cx, czz);
list = crowd();
g.zones.addHole(cx, czz, R3.pullR * 1.6, 0.01, R3.pullSpeed, 3, 0, 'voidsiphon');
d.simulate(1.6);
const packed = splashCount(list, cx, czz);
info.combo = { loose, packed };
if (!(packed >= 2 * loose)) fails.push(`combo: packed ${packed} vs loose ${loose}`);
// 7. boss phase: the hole sits on the boss front and crushes the boss
d.bossTest('mothermurk', { weapon: 'voidsiphon', mk: 3, squad: 20, hp: 9999999 });
let guard = 0;
while (g.boss && g.boss.state !== 'fight' && guard++ < 100) d.simulate(0.1);
const bh0 = g.boss.hp;
d.simulate(4);
info.boss = { dealt: Math.round(bh0 - g.boss.hp), bossHoles: g.zones.holes.filter((h) => h.boss).length };
if (!(bh0 - g.boss.hp > 0)) fails.push('boss not damaged');
d.toTitle();
return { pass: fails.length === 0, fails, info };
