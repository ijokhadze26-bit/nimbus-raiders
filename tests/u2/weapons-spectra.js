// SPEC2 §9 WEAPONS / Spectra Prism (Mk III): a beam hit spawns exactly `splits` children; children never split
// and never hit the parent's target; on a boss the boss takes exactly one beam per beam (children hit
// minions only); the active bullet count stays <= 1600 (Mk V, 900 raiders).
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const { BULLETS } = await import('/src/config.js');
const fails = [], info = {};
const R3 = weaponDef('spectra').mk[2];
const beh = () => g.weapons.behaviours.spectra;
const L = () => g.squad.leader;
function arena(events, { speed = 0, squad = 1, fire = false, mk = 3 } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'spectra');
  d.startCustom({ length: 900, speed, events });
  d.setMk(mk);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
// held in place: frozen (no shatter) so neither the charge nor the lateral steering moves it
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; g.status.freeze(e, 999, { shatter: false }); };
function beam(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk;
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: 60, pierce: 0, idx: 0 });
}
// 1. one beam -> exactly `splits` children; each child gets 35% and gen 1
let es = arena([horde(40, 12, { grunt: 1 }, 'both', { hpMul: 900 })]);
es.forEach((e, i) => hold(e, -3 + (i % 6) * 1.2, L().z - 14 - Math.floor(i / 6) * 4));
const main = es.find((e) => Math.abs(e.x - L().x) < 0.5) || es[2];
hold(main, L().x, L().z - 12);
const before = g.bullets.active.length;
beam(L().x, L().z - 1, 1);
let kids = [];
for (let i = 0; i < 20 && !beh().stats.splits; i++) d.simulate(1 / 60);
kids = g.bullets.active.filter((b) => b.owner === beh() && b.gen === 1);
info.split = { splits: beh().stats.splits, children: beh().stats.children, live: kids.length, want: R3.splits, dmg: kids.map((k) => Math.round((k.dmg / 1) * 1000) / 1000) };
if (beh().stats.splits !== 1) fails.push('one beam split ' + beh().stats.splits + ' times');
if (beh().stats.children !== R3.splits) fails.push(`children ${beh().stats.children} != ${R3.splits}`);
if (kids.some((k) => Math.abs(k.dmg - R3.splitDmg) > 1e-9)) fails.push('child damage != 35%');
if (kids.some((k) => k.hits[0] !== main)) fails.push('child does not start with the parent target in hits[0]');
d.simulate(0.5);
if (beh().stats.splits !== 1) fails.push('children split again: ' + beh().stats.splits);
// 2. a crowd for 3 s: children never split and never hit the parent target
es = arena([horde(25, 80, { grunt: 0.7, tank: 0.3 }, 'both', { hpMul: 60 })], { squad: 40, fire: true });
for (const e of es) hold(e, e.x, e.z);
d.simulate(3);
const S = beh().stats;
info.crowd = { beams: S.beams, splits: S.splits, children: S.children, childHits: S.childHits, onParent: S.childOnParent };
if (S.childOnParent) fails.push('children hit their parent target ' + S.childOnParent + 'x');
if (S.splits > S.beams) fails.push('more splits than beams');
if (!(S.childHits > 0)) fails.push('children never hit anything');
if (g.bullets.active.some((b) => b.owner === beh() && b.gen > 1)) fails.push('a grandchild beam exists');
// 3. boss: exactly one beam per beam (children hit minions only)
d.setLoadout('pip', 'spectra');
d.bossTest('mothermurk', { weapon: 'spectra', mk: 3, squad: 30, hp: 9999999 });
let guard = 0;
while (g.boss && g.boss.state !== 'fight' && guard++ < 100) d.simulate(0.1);
const B = g.boss;
let calls = 0, bossBeams = 0;
const dt0 = B.damageTyped.bind(B);
B.damageTyped = (dd, el) => { if (el === 'spectra') calls++; return dt0(dd, el); };
const oh = beh().onHit.bind(beh());
beh().onHit = (b, kind, t, res) => { if (kind === 'boss' && b.gen === 0) bossBeams++; if (kind === 'boss' && b.gen !== 0) fails.push('a child hit the boss'); return oh(b, kind, t, res); };
d.simulate(4);
delete beh().onHit;
B.damageTyped = dt0;
const kidMasks = new Set(g.bullets.active.filter((b) => b.owner === beh() && b.gen === 1).map((b) => b.mask));
info.boss = { calls, bossBeams, childMasks: [...kidMasks], minionKills: g.run.kills };
if (calls !== bossBeams || calls === 0) fails.push(`boss took ${calls} spectra hits from ${bossBeams} beams`);
// 4. active count <= cap (Mk V, 900 raiders, a big crowd)
arena([horde(30, 300, { grunt: 1 }, 'both', { hpMul: 30 }), horde(60, 300, { grunt: 1 }, 'both', { hpMul: 30 })], { speed: 9, squad: 900, fire: true, mk: 5 });
g.heroes.guard = 99;
let maxActive = 0;
for (let i = 0; i < 300; i++) { d.simulate(1 / 60); maxActive = Math.max(maxActive, g.bullets.count); }
info.cap = { maxActive, children: beh().stats.children };
if (maxActive > BULLETS.maxActive) fails.push('active bullets ' + maxActive);
d.toTitle();
return { pass: fails.length === 0, fails, info };
