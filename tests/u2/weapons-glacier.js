// SPEC2 §9 WEAPONS / Glacier Lance (Mk III): one shard damages >= 3 enemies in a column; a slowed enemy's z
// speed is ~(1 - slow%); at least one freeze in 200 shots and the same count on a rerun; a Glacier-frozen
// enemy shatters on contact with 0 members lost; at Mk V with 900 raiders on a grunt-only horde, freezes per
// enemy hit stay <= 15% and no single roll has p_eff above 0.35. Each shard removes 2 shield hits.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('glacier').mk[2];
const beh = () => g.weapons.behaviours.glacier;
function arena(events, { speed = 0, mk = 3, squad = 1, fire = false } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'glacier');
  d.startCustom({ length: 900, speed, events });
  d.setMk(mk);
  if (squad > 1) d.give('troops', squad - 1);
  g.weapons.enabled = fire;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; e.slowPct = 1; e.slowT = 999; };
function shard(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk, r = b.row(mk);
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: 60, pierce: r.pierce, idx: 0 });
}
const L = () => g.squad.leader;
// 1. one shard through a column
let es = arena([horde(40, 6, { grunt: 1 }, 'C', { hpMul: 50 })]);
es.forEach((e, i) => hold(e, L().x, L().z - 10 - i * 1.6));
const hp0 = es.map((e) => e.hp);
shard(L().x, L().z - 1, 0.5);
d.simulate(0.6);
const hitN = es.filter((e, i) => e.hp < hp0[i]).length;
info.column = { hit: hitN, pierce: R3.pierce };
if (hitN < 3) fails.push(`one shard hit ${hitN} enemies in a column`);
// 2. slow: z speed ~ (1 - slow%)
es = arena([horde(30, 2, { grunt: 1 }, 'C', { hpMul: 50 })]);
const [a, b] = es;
a.x = -1; b.x = 1; a.z = b.z = L().z - 25; a.charging = b.charging = true;
g.status.slow(a, R3.slow, 5);
const za = a.z, zb = b.z;
d.simulate(0.5);
const ratio = (a.z - za) / (b.z - zb);
info.slowRatio = Math.round(ratio * 1000) / 1000;
if (Math.abs(ratio - (1 - R3.slow)) > 0.06) fails.push(`slow ratio ${ratio} vs ${1 - R3.slow}`);
// and a real shard applies it (strongest wins, timer refreshes)
es = arena([horde(30, 1, { grunt: 1 }, 'C', { hpMul: 50 })]);
hold(es[0], L().x, L().z - 12); es[0].slowPct = 0; es[0].slowT = 0; es[0].spd = 1;
const hpS = es[0].hp;
shard(L().x, L().z - 1, 0.01);
d.simulate(0.3);
if (!(es[0].slowT > 0 && Math.abs(es[0].slowPct - R3.slow) < 1e-9)) fails.push(`shard slow ${es[0].slowPct} for ${es[0].slowT}`);
if (!(es[0].hp < hpS)) fails.push('slow shard did not damage');
// 3. freezes in 200 shots (1 real shot each -> p = Mk III freeze chance), identical on a rerun
function freezes() {
  const list = arena([horde(30, 40, { grunt: 1 }, 'C', { hpMul: 900 })]);
  list.forEach((e, i) => hold(e, -4 + (i % 10) * 0.9, L().z - 14 - Math.floor(i / 10) * 1.2));
  for (let k = 0; k < 200; k++) {
    for (const e of list) if (e.freezeT > 0) e.freezeT = 0.0001; // let every hit roll fresh
    shard(-4 + (k % 10) * 0.9, L().z - 1, 0.001);
    d.simulate(1 / 30);
  }
  d.simulate(0.5);
  return { ...beh().stats };
}
const F1 = freezes(), F2 = freezes();
info.freezes = { first: F1.freezes, rerun: F2.freezes, rolls: F1.rolls, maxPe: F1.maxPe };
if (F1.freezes < 1) fails.push('no freeze in 200 shots');
if (F1.freezes !== F2.freezes || F1.rolls !== F2.rolls) fails.push(`rerun differs: ${F1.freezes}/${F1.rolls} vs ${F2.freezes}/${F2.rolls}`);
// 4. a Glacier-frozen enemy shatters on contact, no member lost
es = arena([horde(30, 30, { grunt: 1 }, 'C', { hpMul: 900 })], { squad: 12 });
es.forEach((e, i) => hold(e, -4 + (i % 10) * 0.9, L().z - 14 - Math.floor(i / 10) * 1.2));
let frozen = null;
for (let k = 0; k < 400 && !frozen; k++) {
  shard(-4 + (k % 10) * 0.9, L().z - 1, 0.001);
  d.simulate(1 / 30);
  frozen = es.find((e) => e.state === 0 && e.freezeT > 0 && e.shatter);
}
if (!frozen) fails.push('no Glacier freeze to shatter');
else {
  const c0 = g.squad.count, sh0 = beh().stats.shatters, guard0 = g.heroes.guard;
  frozen.x = L().x; frozen.z = L().z - 0.2; frozen.freezeT = 5;
  d.simulate(2 / 60);
  info.shatter = { alive: frozen.state === 0, before: c0, after: g.squad.count, guard: [guard0, g.heroes.guard], fx: beh().stats.shatters - sh0 };
  if (frozen.state === 0) fails.push('frozen enemy did not shatter');
  if (g.squad.count !== c0 || g.heroes.guard !== guard0) fails.push(`shatter cost: count ${c0}->${g.squad.count}, guard ${guard0}->${g.heroes.guard}`);
  if (beh().stats.shatters - sh0 !== 1) fails.push('shatter feedback not raised');
}
// 5. each shard removes 2 shield hits
es = arena([horde(30, 1, { shield: 1 }, 'C', { hpMul: 50 })]);
hold(es[0], L().x, L().z - 12);
const sh = es[0].shield;
shard(L().x, L().z - 1, 0.01);
d.simulate(0.4);
if (es[0].shield !== sh - 2) fails.push(`shield ${sh} -> ${es[0].shield} (want -2)`);
// 6. Mk V, 900 raiders, grunt-only horde: freezes per hit <= 15%, p_eff never > 0.35. A plain custom horde
// (hp as authored) and a late-game toughness one (L14 end, hpMul = toughFor(100, 5)) both stay under 15%.
const { toughFor } = await import('/src/data/levels.js');
function mk5(hpMul) {
  const ev = (at) => horde(at, 300, { grunt: 1 }, 'both', hpMul ? { hpMul } : {});
  arena([ev(60), ev(110), ev(160)], { speed: 9, mk: 5, squad: 900, fire: true });
  g.heroes.guard = 99;
  d.simulate(14);
  const S = beh().stats;
  return { hits: S.hits, freezes: S.freezes, rate: Math.round((S.freezes / Math.max(1, S.hits)) * 1000) / 1000, maxPe: Math.round(S.maxPe * 1000) / 1000, kills: g.run.kills };
}
info.mk5 = mk5(0);
info.mk5Tough = mk5(toughFor(100, 5));
if (info.mk5.hits < 100) fails.push('Mk V run made only ' + info.mk5.hits + ' hits');
for (const k of ['mk5', 'mk5Tough']) if (info[k].rate > 0.15) fails.push(`${k}: freezes per hit ${info[k].freezes}/${info[k].hits}`);
for (const k of ['mk5', 'mk5Tough']) if (info[k].maxPe > 0.35 + 1e-9) fails.push(`${k}: p_eff above 0.35: ${info[k].maxPe}`);
d.toTitle();
return { pass: fails.length === 0, fails, info };
