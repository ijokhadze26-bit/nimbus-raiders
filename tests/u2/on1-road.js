// @smoke --seconds 0 --shots 0
// Online stage 1 (STAGE1 "GAME side API", tests): the road of a versus match depends on the seed only.
// 1. Two fresh matches with the same seed but different play (pro bot + Pip / Thunderclap on High vs. casual bot with
//    another bot seed + Rime / Glacier on Low, formation switched, bosses killed at different moments) generate the
//    same events up to 1500 u: gate rows (with the red sides of ramp.js), hordes, barrels, hazards, coins, power-ups,
//    crates, and the same boss schedule (type, hp, tier of arenas 1-3).
// 2. Another seed gives another road. 3. The red-gate pass touched rows (so the hash covers it) and drew once per row.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { vsBossHp, vsBossTier } = await import('/src/online/game/vsdata.js');
const { versus } = await installOnline(g, g.ui);
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

function play(seed, o) {
  g.applyQuality(o.quality);
  d.setLoadout(o.hero, o.weapon);
  d.setAutopilot(o.prof, o.botSeed);
  versus.start(createTestLink({ game: g, seed }), { hero: o.hero, weapon: o.weapon });
  const bosses = [];
  const off = g.events.on('boss:spawn', (p) => bosses.push([p.type, p.hp, g.boss ? g.boss.tier : 0]));
  let wait = 0, steps = 0;
  while (g.endless.zone < 3 && g.state === 'playing' && g.run.active && steps++ < 60 * 400) {
    versus.pump(1 / 60, 1 / 60);
    g.heroes.guard = 99; // the test is about the road, not about surviving it
    if (g.squad.count < 40) d.give('troops', 60);
    if (steps % o.formEvery === 0) g.formation.cycle();
    if (g.run.phase === 'boss' && g.boss && g.boss.state === 'fight' && ++wait > o.bossWait) { d.killBoss(); wait = 0; }
  }
  off();
  const zone = g.endless.zone, t = Math.round(versus.t);
  const types = Object.keys(g.run.byType).sort();
  const upto = {};
  let count = 0;
  for (const k of types) { upto[k] = g.run.byType[k].filter((e) => e.at <= 1500); count += upto[k].length; }
  const next = g.run.boss; // arena 3 as it will spawn
  const out = { zone, t, count, gates: upto.gate ? upto.gate.length : 0, hash: hash(JSON.stringify(upto)), bosses: JSON.stringify(bosses), next: JSON.stringify([next.type, next.hp, next.tier]), reds: versus.ramp.stats.reds, rows: versus.ramp.stats.rows, redGates: (upto.gate || []).filter((e) => (e.op === 'add' && e.value < 0) || e.op === 'div').length };
  versus.stop();
  return out;
}

try {
  const A = play(4242, { quality: 'high', hero: 'pip', weapon: 'thunderclap', prof: 'pro', botSeed: 1, formEvery: 100000, bossWait: 30 });
  const B = play(4242, { quality: 'low', hero: 'rime', weapon: 'glacier', prof: 'casual', botSeed: 9, formEvery: 420, bossWait: 420 });
  const C = play(4243, { quality: 'high', hero: 'pip', weapon: 'thunderclap', prof: 'pro', botSeed: 1, formEvery: 100000, bossWait: 30 });
  info.A = A; info.B = B; info.C = C;
  ok(A.zone >= 3 && B.zone >= 3, `runs did not reach zone 3 (${A.zone}, ${B.zone})`);
  ok(A.count > 60 && A.gates > 20, `too few events up to 1500 u (${A.count}, ${A.gates} gates)`);
  ok(A.hash === B.hash, `same seed, different play: events differ (${A.hash} vs ${B.hash}; ${A.count} vs ${B.count})`);
  ok(A.bosses === B.bosses && A.next === B.next, `same seed: boss schedule differs (${A.bosses} | ${B.bosses})`);
  ok(Math.abs(A.t - B.t) > 3, `the two runs did not play differently (zone 3 at ${A.t} s and ${B.t} s)`);
  ok(A.hash !== C.hash, 'another seed built the same road');
  const sched = JSON.parse(A.bosses);
  ok(sched.length === 2 && sched[0][1] === vsBossHp(1) && sched[1][1] === vsBossHp(2), `boss hp is not the versus table: ${A.bosses}`);
  ok(sched[0][2] === vsBossTier(1) && sched[1][2] === vsBossTier(2), `boss tier is not the versus table: ${A.bosses}`);
  ok(JSON.parse(A.next)[1] === vsBossHp(3), `arena 3 hp ${A.next}`);
  ok(A.rows > 10 && A.rows === B.rows && A.reds === B.reds && A.reds >= 1, `red gate pass: ${A.reds} of ${A.rows} rows (B ${B.reds} of ${B.rows})`);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false); d.setLoadout('pip', 'thunderclap');
  g.applyQuality('high');
  d.toTitle();
}
return { pass: fails.length === 0, fails, info };
