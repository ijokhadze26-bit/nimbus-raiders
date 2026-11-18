// @smoke --seconds 0 --shots 0
// Update 3 stage 4 (STAGE4 §B, builder "road"): 3-lane stretches, ramp gates, chain gates, rescue cages.
// 1. plan (data/roadplan.js): 3-lane stretches only in world 2+, each around one row of 3 narrow gates (L3/C3/R3)
//    whose new middle gate never beats the row's best add; chains start on a + / x row and every follow-up gate
//    has an offer per family; ramps from L3; cages 3-12 Raiders, 4 levels per world, clear of gate rows /
//    hazards / the arena; nothing reshapes a hidden gate; planRoad is idempotent.
// 2. scratch levels: a 3-lane row spawns 3 gates at -3.3 / 0 / 3.3 (width 3), the road draws two dividers per
//    row there, the middle gate is taken by steering to 0; a ramp lifts Pip + members ~1.2 u and its gate still
//    applies; a chain follow-up row waits ('?', no raise) and then offers x/÷ after a + pick, +/- after a x pick;
//    shooting a cage lock frees its Raiders who join when Pip reaches the cage (stats.rescued); a cage passed
//    shut changes nothing.
// 3. the autopilot opens a cage, picks chain gates with the look-ahead and passes a 3-lane row; nothing throws on
//    High or Low (real level L12 with every feature). window.__shot saves pictures.
const g = window.__game, d = g.debug;
g.loop.stop();
const shot = async (name) => { if (window.__shot) { g.snapCamera(); g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const L = await import('/src/data/levels.js');
const RP = await import('/src/data/roadplan.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const steps = (n, x) => { for (let i = 0; i < n; i++) { if (x != null) g.input.setTarget(typeof x === 'function' ? x() : x); g.step(1 / 60); } };
const until = (cond, x, max = 3000) => { for (let i = 0; i < max && g.run && g.run.active && !cond(); i++) { if (x != null) g.input.setTarget(typeof x === 'function' ? x() : x); g.step(1 / 60); } return cond(); };

// ---------------- 1. plan ----------------
const perWorld = {}, tally = { lanes3: 0, ramps: 0, chains: 0, cages: 0 };
for (const lv of L.LEVELS) {
  const r = RP.roadOf(lv);
  const rows = new Map();
  for (const e of lv.events) if (e.type === 'gate') (rows.get(e.at) || rows.set(e.at, []).get(e.at)).push(e);
  for (const s of r.lanes3) {
    ok(lv.world >= 2, `L${lv.id}: 3-lane stretch in world 1`);
    const inside = [...rows.keys()].filter((at) => at >= s.at && at <= s.at + s.length);
    ok(inside.length === 1, `L${lv.id}: lanes3@${s.at} holds ${inside.length} rows`);
    const gs = rows.get(inside[0]) || [];
    ok(gs.length === 3 && ['L3', 'C3', 'R3'].every((k) => gs.some((e) => e.lane === k)), `L${lv.id}: 3-lane row lanes ${gs.map((e) => e.lane)}`);
    const best = Math.max(0, ...gs.filter((e) => e.lane !== 'C3' && e.op === 'add').map((e) => e.value));
    const mid = gs.find((e) => e.lane === 'C3');
    ok(!mid || mid.op !== 'add' || mid.value <= best, `L${lv.id}: middle gate +${mid && mid.value} beats the row (${best})`);
  }
  const ids = new Set(r.chains.map((e) => e.chain));
  for (const id of ids) {
    const evs = r.chains.filter((e) => e.chain === id);
    const first = evs.filter((e) => e.link === 0);
    ok(first.some((e) => e.op === 'add' && e.value > 0) && first.some((e) => !(e.op === 'add' && e.value > 0)), `L${lv.id}: chain ${id} first row not + / other`);
    for (const e of evs.filter((e) => e.link > 0)) ok(e.alt && e.alt.add && e.alt.mul, `L${lv.id}: chain ${id} link ${e.link} gate ${e.lane} lacks offers`);
  }
  for (const e of lv.events) if (e.type === 'gate' && e.hidden) ok(!e.ramp && !e.chain && !e.three, `L${lv.id}: hidden gate reshaped`);
  for (const c of r.cages) {
    ok(c.count >= 3 && c.count <= 12 && c.hp > 0, `L${lv.id}: cage ${c.count} / ${c.hp}`);
    ok([...rows.keys()].every((at) => Math.abs(at - c.at) >= 16), `L${lv.id}: cage@${c.at} near a gate row`);
    for (const h of lv.events) if (h.type === 'hazard' && h.kind !== 'snow') ok(c.at < h.at - 6 || c.at > h.at + (h.length || 0) + 6, `L${lv.id}: cage@${c.at} on ${h.kind}@${h.at}`);
    ok(c.at < (lv.layout ?? lv.length) - 30, `L${lv.id}: cage@${c.at} in the arena`);
  }
  if (lv.id >= 3 && r.ramps.length) tally.rampLevels = (tally.rampLevels || 0) + 1;
  perWorld[lv.world] = (perWorld[lv.world] || 0) + r.cages.length;
  tally.lanes3 += r.lanes3.length; tally.ramps += r.ramps.length; tally.chains += ids.size; tally.cages += r.cages.length;
}
for (const w of [1, 2, 3, 4, 5]) ok(perWorld[w] >= 3, `world ${w}: ${perWorld[w]} cages`);
const w2 = L.LEVELS.filter((l) => l.world >= 2 && l.kind === 'normal' && l.id >= RP.FIRST.lanes3);
const w2l3 = w2.filter((l) => RP.roadOf(l).lanes3.length >= 1).length;
ok(w2l3 >= w2.length * 0.85, `only ${w2l3} of ${w2.length} world 2+ levels have a 3-lane stretch`);
ok(tally.rampLevels >= (L.LEVELS.length - 2) * 0.75, `only ${tally.rampLevels} levels have a ramp`);
ok(tally.chains >= 20, `only ${tally.chains} chains`);
info.tally = tally; info.cagesPerWorld = perWorld;
const n0 = L.getLevel(12).events.length;
RP.planRoad(L.getLevel(12));
ok(L.getLevel(12).events.length === n0, 'planRoad is not idempotent');

// ---------------- 2. scratch levels ----------------
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
const custom = (events, extra = {}) => d.startCustom({ length: 260, speed: 10, theme: 'forge', events, ...extra });
const add = (at, lane, value, extra = {}) => ({ type: 'gate', at, lane, op: 'add', value, max: value + 4, ...extra });
const mul = (at, lane, rung = 3, extra = {}) => ({ type: 'gate', at, lane, op: rung >= 3 ? 'mul' : 'div', rung, hitsPerStep: 99999, ...extra });

// 3 lanes: steer to the middle gate
custom([{ type: 'lanes3', at: 30, length: 30, hint: RP.ROAD_HINTS.lanes3 }, add(50, 'L3', 2, { three: true }), add(50, 'C3', 9, { three: true }), add(50, 'R3', 4, { three: true })]);
g.weapons.enabled = false;
steps(60, 0);
const three = g.gates.live.filter((x) => x.row && x.row.z === -50);
ok(three.length === 3 && Math.abs(three.find((x) => x.lane === 'L3').x + 3.3) < 1e-6 && three.every((x) => x.width === 3), `3 lanes: gates ${three.map((x) => x.lane + '@' + x.x + 'w' + x.width)}`);
until(() => g.squad.leader.z < -38, 0);
g.sync(1 / 60);
const nd = g.world.divider.count;
const twoPer = (() => { const arr = g.world.divider.instanceMatrix.array; let side = 0; for (let i = 0; i < nd; i++) if (Math.abs(Math.abs(arr[i * 16 + 12]) - RP.DIV3) < 1e-4) side++; return side; })();
ok(twoPer >= 8, `3 lanes: only ${twoPer} side dividers`);
await shot('road-lanes3');
const c0 = g.squad.count;
until(() => g.squad.leader.z < -52, 0);
ok(g.squad.count === c0 + 9, `3 lanes: middle gate not taken (${c0} -> ${g.squad.count})`);

// ramp: Pip + members ride up ~1.2
custom([add(60, 'L', 6, { ramp: true }), add(60, 'R', 1)]);
g.weapons.enabled = false;
d.give('troops', 20);
let pipY = 0, memY = 0, snapR = false;
for (let i = 0; i < 600 && g.squad.leader.z > -70; i++) {
  g.input.setTarget(-2.5); g.step(1 / 60); g.sync(1 / 60);
  pipY = Math.max(pipY, g.squad.pip.root.position.y);
  memY = Math.max(memY, g.squad.raiders.instanceMatrix.array[13]);
  if (!snapR && g.squad.leader.z < -51) { snapR = true; await shot('road-ramp'); }
}
ok(pipY > 1.1 && memY > 1.0, `ramp: Pip y ${pipY}, member y ${memY}`);
ok(g.squad.count === 27, `ramp gate +6 not applied (${g.squad.count})`);
info.ramp = { pipY: Math.round(pipY * 100) / 100, memY: Math.round(memY * 100) / 100 };

// chain: + first -> x / ÷ next ; x first -> + / - next
const chainEv = () => {
  const alt = { L: { add: { op: 'mul', rung: 3, hitsPerStep: 99999 }, mul: { op: 'add', value: 7, max: 9 } }, R: { add: { op: 'div', rung: 2, hitsPerStep: 99999 }, mul: { op: 'add', value: -4, max: 0 } } };
  return [add(50, 'L', 5, { chain: 1, link: 0 }), mul(50, 'R', 3, { chain: 1, link: 0 }), add(120, 'L', 1, { chain: 1, link: 1, alt: alt.L }), add(120, 'R', 1, { chain: 1, link: 1, alt: alt.R })];
};
for (const [pick, x, want] of [['add', -2.5, 'ladder'], ['mul', 2.5, 'add']]) {
  custom(chainEv());
  g.weapons.enabled = true;
  d.give('troops', 4);
  until(() => g.gates.live.some((q) => q.row && q.row.z === -120), x);
  const waiting = g.gates.live.filter((q) => q.row && q.row.z === -120);
  ok(waiting.length === 2 && waiting.every((q) => q.chainWait && q.hidden), `chain ${pick}: follow-up row not waiting`);
  if (pick === 'add') await shot('road-chain-wait');
  until(() => g.squad.leader.z < -51, x);
  const next = g.gates.live.filter((q) => q.row && q.row.z === -120);
  ok(next.every((q) => !q.chainWait && q.op === want), `chain ${pick}: next row ops ${next.map((q) => q.op)}`);
  if (pick === 'add') { ok(next.find((q) => q.lane === 'L').rung === 3 && next.find((q) => q.lane === 'R').rung === 2, 'chain add: not x2 / ÷2'); steps(40, x); await shot('road-chain-open'); }
  else ok(next.find((q) => q.lane === 'L').value >= 7 && next.find((q) => q.lane === 'R').value <= 0, 'chain mul: not + / -');
}

// cage: shoot it open -> they join when Pip gets there; passed shut -> nothing
custom([{ type: 'cage', at: 70, lane: 'L', count: 6, hp: 15, hint: RP.ROAD_HINTS.cage }]);
g.weapons.enabled = true;
d.give('troops', 6);
const cBefore = g.squad.count;
let opened = false, snapC = false;
g.events.on('cage:open', () => { opened = true; });
for (let i = 0; i < 900 && g.squad.leader.z > -75; i++) {
  g.input.setTarget(-2.5); g.weapons.enabled = g.squad.leader.z < -48; g.step(1 / 60);
  if (!snapC && g.cages.live.length && g.squad.leader.z < -47 && g.cages.live[0].state === 'locked') { snapC = true; await shot('road-cage'); }
  if (opened && !info.cageOpenShot) { steps(20, -2.5); info.cageOpenShot = true; await shot('road-cage-open'); }
}
ok(opened, 'cage: lock never broke');
ok(g.squad.count === cBefore + 6 && g.run.stats.rescued === 6, `cage: ${cBefore} -> ${g.squad.count}, rescued ${g.run.stats.rescued}`);
custom([{ type: 'cage', at: 70, lane: 'L', count: 6, hp: 12 }]);
g.weapons.enabled = false;
const cb2 = g.squad.count;
until(() => g.squad.leader.z < -80, 2.5);
ok(g.squad.count === cb2 && !g.run.stats.rescued, `cage passed shut changed the squad (${cb2} -> ${g.squad.count})`);

// ---------------- 3. autopilot + real level on High / Low ----------------
d.setAutopilot('pro', 1, { crates: 'never', ability: false, loadout: 'keep' });
custom([{ type: 'cage', at: 60, lane: 'R', count: 5, hp: 10 }, add(110, 'L', 2, { chain: 2, link: 0 }), mul(110, 'R', 3, { chain: 2, link: 0 }),
  add(170, 'L', 1, { chain: 2, link: 1, alt: { add: { op: 'add', value: 1 }, mul: { op: 'add', value: 1 } } }),
  add(170, 'R', 1, { chain: 2, link: 1, alt: { add: { op: 'add', value: 60, max: 60 }, mul: { op: 'add', value: 1 } } })]);
d.give('troops', 10);
let apOpen = false;
g.events.on('cage:open', () => { apOpen = true; });
until(() => g.squad.leader.z < -200, null, 4000);
ok(apOpen, 'autopilot: did not open the cage');
ok(g.squad.count > 70, `autopilot: chain look-ahead missed (+2 then +60 beats x2; squad ${g.squad.count})`);
info.apChain = g.squad.count;

const hints = [];
g.events.on('hazard:hint', (p) => hints.push(p.text));
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  d.setAutopilot('pro', 2, { crates: 'never', ability: true, loadout: 'keep' });
  d.startLevel(12);
  const lv = L.getLevel(12), r = RP.roadOf(lv);
  const marks = [['lanes3', r.lanes3[0] && r.lanes3[0].at + 14], ['ramp', r.ramps[0] && r.ramps[0].at - 4], ['cage', r.cages[0] && r.cages[0].at + 20], ['chain', (r.chains.find((e) => e.link === 1) || {}).at + 40]];
  const done = new Set();
  let guard = 0;
  while (g.state === 'playing' && guard++ < 60 * 120) {
    g.step(1 / 60);
    for (const [k, at] of marks) if (at && !done.has(k) && -g.squad.leader.z >= at) { done.add(k); if (q === 'high' || k === 'lanes3') await shot(`road-L12-${k}-${q}`); }
  }
  info['L12' + q] = { win: !!(g.lastResult && g.lastResult.win), squad: g.squad.count, rescued: g.run && g.run.stats.rescued };
}
g.applyQuality('high');
ok(hints.includes(RP.ROAD_HINTS.lanes3), `hint: ${hints}`);
d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, info };
