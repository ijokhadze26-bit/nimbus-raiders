// SPEC2 §9 WEAPONS / Thunderclap (Mk III): the chain damages jumps + 1 enemies within reach with falloff 0.7
// (an enemy beyond reach is never chained); one shield hit per jump; on a boss hit it jumps to minions.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const R3 = weaponDef('thunderclap').mk[2];
const beh = () => g.weapons.behaviours.thunderclap;
const L = () => g.squad.leader;
function arena(events, { mk = 3 } = {}) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'thunderclap');
  d.startCustom({ length: 900, speed: 0, events });
  d.setMk(mk);
  g.weapons.enabled = false;
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
// held in place: frozen (no shatter) so neither the charge nor the lateral steering moves it
const hold = (e, x, z) => { e.x = x; e.z = z; e.vx = 0; g.status.freeze(e, 999, { shatter: false }); };
function bolt(x, z, dmg) {
  const b = beh(), mk = g.weapons.mk;
  b.fire({ x, y: 0.6, z, lead: 0, dmg, unit: dmg, shots: 1, show: true, mk, range: 60, pierce: 0, idx: 0 });
}
// 1. a chain of jumps + 2 enemies, each within reach of the previous (3 u apart); the last is one too many
let es = arena([horde(40, R3.jumps + 2, { grunt: 1 }, 'C', { hpMul: 900 })]);
es.forEach((e, i) => hold(e, L().x + (i % 2 ? 1.5 : -1.5) * (i > 0 ? 1 : 0), L().z - 12 - i * 2.6));
es[0].x = L().x;
const hp0 = es.map((e) => e.hp);
bolt(L().x, L().z - 1, 1);
d.simulate(0.5);
const dealt = es.map((e, i) => hp0[i] - e.hp);
const hit = dealt.filter((v) => v > 1e-9).length;
info.chain = { hit, want: R3.jumps + 1, dealt: dealt.map((v) => Math.round(v * 10000) / 10000) };
if (hit !== R3.jumps + 1) fails.push(`chain damaged ${hit} enemies (want ${R3.jumps + 1})`);
for (let i = 1; i <= R3.jumps; i++) if (Math.abs(dealt[i] / dealt[0] - Math.pow(R3.falloff, i)) > 0.01) fails.push(`jump ${i}: ${dealt[i] / dealt[0]} vs ${Math.pow(R3.falloff, i)}`);
// 2. nothing beyond reach
es = arena([horde(40, 3, { grunt: 1 }, 'C', { hpMul: 900 })]);
hold(es[0], L().x, L().z - 12); hold(es[1], L().x + R3.reach + 0.6, L().z - 12); hold(es[2], L().x - R3.reach - 0.6, L().z - 12);
const h1 = es[1].hp, h2 = es[2].hp;
bolt(L().x, L().z - 1, 1);
d.simulate(0.5);
if (es[1].hp !== h1 || es[2].hp !== h2) fails.push('chained beyond reach');
// 3. shields: one shield hit per jump
es = arena([horde(40, 3, { shield: 1 }, 'C', { hpMul: 50 })]);
es.forEach((e, i) => hold(e, L().x + (i ? 1.2 * (i % 2 ? 1 : -1) : 0), L().z - 12 - i * 2));
const s0 = es.map((e) => e.shield);
bolt(L().x, L().z - 1, 0.01);
d.simulate(0.5);
info.shields = es.map((e, i) => s0[i] - e.shield);
if (info.shields.some((v) => v !== 1)) fails.push('shield hits per jump ' + info.shields);
// 4. boss hit: jumps to minions
d.bossTest('mothermurk', { weapon: 'thunderclap', mk: 3, squad: 20, hp: 9999999 });
let guard = 0;
while (g.boss && g.boss.state !== 'fight' && guard++ < 100) d.simulate(0.1);
d.simulate(6);
info.boss = { chains: beh().stats.chains, jumps: beh().stats.jumps, kills: g.run.kills };
d.toTitle();
return { pass: fails.length === 0, fails, info };
