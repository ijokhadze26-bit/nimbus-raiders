// SPEC2 §6.4 / §9 foundation-status: burn, slow, freeze (shatter / no shatter), the spawn freeze window, the
// boss freeze pause, black-hole pull + lean - and two identical runs give identical numbers.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { leanAngle } = await import('/src/game/hordeview.js');
const r3 = (v) => Math.round(v * 1000) / 1000;
function setup(n = 20, hpMul = 5) {
  d.setAutopilot(false);
  d.setLoadout('pip', 'thunderclap');
  d.startCustom({ length: 400, events: [horde(40, n, { grunt: 1 }, 'both', { hpMul })] });
  g.weapons.enabled = false; // nobody shoots: status alone changes hp
  d.simulate(0.05);
  return g.horde.list.filter((e) => e.state === 0);
}
function once() {
  const fails = [], nums = [];
  const S = g.status;
  // burn: 2 hp over 1.5 s, linear
  let es = setup();
  let e = es[0];
  S.burn(e, 2, 1.5);
  d.simulate(0.75); nums.push(r3(e.hp));
  if (Math.abs(e.hp - 4) > 0.06) fails.push('burn half-way hp ' + e.hp);
  d.simulate(0.8); nums.push(r3(e.hp));
  if (Math.abs(e.hp - 3) > 0.03) fails.push('burn end hp ' + e.hp);
  if (es[1].hp !== 5) fails.push('burn leaked to another enemy');
  // slow 50%: about half the z advance
  es = setup();
  const a = es[0], b = es[1];
  S.slow(a, 0.5, 3);
  const za = a.z, zb = b.z;
  d.simulate(0.5);
  const ratio = (a.z - za) / (b.z - zb); nums.push(r3(ratio));
  if (Math.abs(ratio - 0.5) > 0.06) fails.push('slow ratio ' + ratio);
  // freeze (Glacier): no z advance; a touch shatters it without a loss
  es = setup();
  d.give('troops', 10);
  e = es[0];
  S.freeze(e, 3);
  let z0 = e.z;
  d.simulate(0.5);
  if (e.z !== z0) fails.push('frozen enemy moved ' + (e.z - z0));
  const L = g.squad.leader;
  let c0 = g.squad.count, k0 = g.run.killsBy.weapon;
  e.x = L.x; e.z = L.z - 0.2;
  d.simulate(2 / 60);
  if (e.state === 0) fails.push('shatter: enemy still alive');
  if (g.squad.count !== c0) fails.push(`shatter cost raiders ${c0} -> ${g.squad.count}`);
  if (g.run.killsBy.weapon !== k0 + 1) fails.push('shatter not counted as a weapon kill');
  // freeze without shatter (Whiteout): a touch costs a Guard point, then a raider
  e = es[1];
  S.freeze(e, 3, { shatter: false });
  c0 = g.squad.count; const gd = g.heroes.guard;
  e.x = L.x; e.z = L.z - 0.2;
  d.simulate(2 / 60);
  if (!(g.heroes.guard === gd - 1 && g.squad.count === c0)) fails.push(`no-shatter touch with guard: guard ${gd}->${g.heroes.guard}, count ${c0}->${g.squad.count}`);
  g.heroes.guard = 0;
  e = es[2];
  S.freeze(e, 3, { shatter: false });
  c0 = g.squad.count;
  e.x = L.x; e.z = L.z - 0.2;
  d.simulate(2 / 60);
  if (g.squad.count !== c0 - 1) fails.push(`no-shatter touch without guard: ${c0} -> ${g.squad.count}`);
  nums.push(g.squad.count);
  // spawn freeze window
  setup();
  S.freezeWindow(4);
  d.simulate(1);
  const n0 = g.horde.list.length;
  g.horde.spawnWave({ at: -g.squad.leader.z + 60, count: 5, mix: { grunt: 1 }, hpMul: 1 });
  const late = g.horde.list.slice(n0);
  const ft = late.map((x) => x.freezeT); nums.push(...ft.map(r3));
  if (!late.length || late.some((x) => Math.abs(x.freezeT - 3) > 0.05 || x.shatter)) fails.push('window spawn freezeT ' + JSON.stringify(ft));
  d.simulate(2.9);
  if (late.some((x) => !(x.freezeT > 0))) fails.push('window ended early');
  d.simulate(0.2);
  if (late.some((x) => x.freezeT > 0)) fails.push('window did not end');
  // boss: frozenT = 4 -> no new attack for 4 s
  d.bossTest('grawlstone', { squad: 30, hp: 999999 });
  let guard = 0;
  while (g.boss && (g.boss.state !== 'fight' || g.boss.attack) && guard++ < 200) d.simulate(0.1);
  const B = g.boss;
  B.frozenT = 4; B.cooldown = 0;
  d.simulate(3.8);
  if (B.attack) fails.push('boss attacked while frozen');
  d.simulate(1.2);
  if (!B.attack && !g.telegraph.active.length) fails.push('boss never attacked after the freeze');
  // black hole: pull + lean
  es = setup();
  for (const x of es) S.freeze(x, 5, { shatter: false });
  let cx = 0, cz = 0;
  for (const x of es) { cx += x.x / es.length; cz += x.z / es.length; }
  const dist = () => es.reduce((s, x) => s + Math.hypot(x.x - cx, x.z - cz), 0) / es.length;
  const d0 = dist();
  g.zones.addHole(cx, cz, 6, 0.1, 6, 2, 0, 'voidsiphon');
  d.simulate(0.3);
  const d1 = dist(); nums.push(r3(d0), r3(d1));
  if (!(d1 < d0 - 0.3)) fails.push(`hole pull: mean distance ${d0} -> ${d1}`);
  const leaning = es.filter((x) => leanAngle(x.px, x.pz) > 0.01).length;
  if (leaning < es.length / 2) fails.push(`lean: only ${leaning}/${es.length} pulled enemies lean`);
  nums.push(leaning);
  return { fails, nums };
}
const A = once(), Bn = once();
const fails = [...A.fails];
if (JSON.stringify(A.nums) !== JSON.stringify(Bn.nums)) fails.push('second run differs: ' + JSON.stringify(A.nums) + ' vs ' + JSON.stringify(Bn.nums));
d.toTitle();
return { pass: fails.length === 0, fails, nums: A.nums };
