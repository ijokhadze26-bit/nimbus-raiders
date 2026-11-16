// @smoke --seconds 0 --shots 0
// Update 3 stage 2 (STAGE2 §A, builder "hazards-candy-citadel"): Candy Kingdom + Storm Citadel world hazards.
// 1. plan: every world 4-5 level gets hazards of its own world only, never over a gate / barrel / crate / gap /
//    blade (lethal ones also off power-ups / coins), all before the final rush / arena, deterministic; the intro
//    levels (L31, L41) teach every kind of their world once, with a hint.
// 2. each kind on a scratch level: a jelly pad launches the squad over its hole (miss it and the hole takes
//    them), syrup slows the run + steering + enemies, gumballs roll down a lane, crush members and burst when
//    shot, chocolate falls pour on a cycle, drown members and stop bullets, the moving platform carries whoever
//    follows it (the rest fall), lightning strikes are marked (flagged hazard) and kill, wind pushes sideways
//    and blows edge members off, a collapsing bridge drops the cracked lane under the squad and keeps the other.
// 3. the hints and the autopilot (pro keeps far more of the squad than standing still; casual survives).
//    The real levels on High / Low are tests/u2/w3-hazards-cc-levels.js. window.__shot saves pictures.
const g = window.__game, d = g.debug;
g.loop.stop();
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const L = await import('/src/data/levels.js');
const HP = await import('/src/data/hazardplan.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const steps = (n, x) => { for (let i = 0; i < n; i++) { if (x != null) g.input.setTarget(typeof x === 'function' ? x() : x); g.step(1 / 60); } };
const hz = g.hazards;

// ---------------- 1. plan ----------------
const KINDS = { 4: HP.WORLD_KINDS[4], 5: HP.WORLD_KINDS[5] };
for (const w of [4, 5]) ok(KINDS[w] && KINDS[w].length === 4, `world ${w} kinds ${KINDS[w]}`);
for (const lv of L.LEVELS) {
  if (!KINDS[lv.world]) continue;
  const hs = HP.hazardsOf(lv);
  ok(hs.length >= 2, `L${lv.id}: only ${hs.length} hazards`);
  const rush = lv.events.find((e) => e.rush);
  const end = rush ? rush.at : (lv.layout ?? lv.length) - 30;
  for (const h of hs) {
    ok(KINDS[lv.world].includes(h.kind), `L${lv.id}: ${h.kind} is not a world ${lv.world} kind`);
    ok(h.at + (h.length || 0) < end, `L${lv.id}: ${h.kind}@${h.at} runs into the rush / arena (${end})`);
    for (const e of lv.events) {
      const c = HP.CLEAR[e.type];
      if (!c || e === h || e.type === 'hazard') continue;
      if ((e.type === 'powerup' || e.type === 'coins') && !HP.LETHAL.has(h.kind)) continue;
      const a = e.at - c[0], b = e.at + (e.length || (e.type === 'coins' ? 12 : 0)) + c[1];
      if (h.at < b && h.at + (h.length || 0) > a) fails.push(`L${lv.id}: ${h.kind}@${h.at}+${h.length} overlaps ${e.type}@${e.at}`);
    }
    for (const o of hs) if (o !== h && h.at < o.at + (o.length || 0) && h.at + (h.length || 0) > o.at) fails.push(`L${lv.id}: ${h.kind}@${h.at} overlaps ${o.kind}@${o.at}`);
  }
  info['L' + lv.id] = hs.map((h) => h.kind[0] + h.kind[1]).join('');
}
for (const id of [31, 41]) {
  const hs = HP.hazardsOf(L.getLevel(id)), w = L.getLevel(id).world;
  for (const k of KINDS[w]) ok(hs.some((h) => h.kind === k && h.hint), `L${id} does not teach ${k} with a hint`);
}
const again = HP.planHazards(L.getLevel(36));
ok(HP.hazardsOf(again).length === info.L36.length / 2, 'planHazards is not idempotent');

// ---------------- 2. kinds on scratch levels ----------------
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
const custom = (events, extra = {}) => { d.startCustom({ length: 260, speed: 10, theme: 'candy', events, ...extra }); g.weapons.enabled = false; };
const lost = {};
g.events.on('squad:change', (p) => { if (p.delta < 0) lost[p.reason] = (lost[p.reason] || 0) - p.delta; });
const reset = () => { for (const k in lost) delete lost[k]; };
const live = (kind) => hz.list.find((o) => o.ev.kind === kind);

// jelly: on the pad -> launched over the hole, nobody falls; beside the pad -> the hole takes them
const JE = [{ type: 'hazard', kind: 'jelly', at: 40, side: 'L', frac: 0.6, pad: 3.5, gap: 8, length: 15 }];
custom(JE); d.give('troops', 40); reset();
let lift = 0, air = false, snap = false;
for (let i = 0; i < 360; i++) {
  g.input.setTarget(-2.5); g.step(1 / 60); lift = Math.max(lift, hz.mods.lift); air = air || hz.mods.airborne;
  if (!snap && hz.mods.lift > 2.2) { snap = true; await shot('jelly'); }
}
ok(g.obstacles.gaps.length > 0 || g.run.dist > 60, 'jelly: no hole was cut');
ok(air && lift > 2, `jelly: not launched (air ${air}, lift ${lift})`);
ok(!lost.gap, `jelly: ${lost.gap} fell although the squad hit the pad`);
info.jellyHit = { lift: Math.round(lift * 10) / 10, squad: g.squad.count };
custom(JE); reset();
steps(360, 4.5);
ok(lost.gap > 0 || g.squad.count === 0, `jelly: Pip alone missed the pad and did not fall (${JSON.stringify(lost)})`);
custom([{ ...JE[0], side: 'both' }]); d.give('troops', 30); reset();
steps(360, 4.5);
ok(!lost.gap, `jelly: full-width pad dropped ${lost.gap}`);

// syrup: slows the run and the steering while Pip is in it; enemies in it are slowed too
custom([{ type: 'hazard', kind: 'syrup', at: 20, length: 30, lane: 'both', slow: 0.6, ease: 0.4 }, { type: 'horde', at: 55, count: 10, mix: { grunt: 1 }, lane: 'both' }]);
d.give('troops', 60);
let minSpeed = 99, minEase = 1, slowed = 0;
for (let i = 0; i < 300; i++) {
  g.input.setTarget(i < 200 ? 0 : 3); g.step(1 / 60);
  minSpeed = Math.min(minSpeed, g.forwardSpeed(1 / 60)); minEase = Math.min(minEase, hz.mods.easeMul);
  for (const e of g.horde.list) if (e.slowT > 0 && e.slowPct >= 0.5) slowed++;
}
ok(minSpeed < 10 * 0.7 && minEase < 0.5, `syrup: speed ${minSpeed}, ease ${minEase}`);
ok(slowed > 0, 'syrup: no enemy slowed');
for (let i = 0; i < 600 && g.run.dist < 54; i++) steps(1, 0);
steps(30, 0);
ok(g.run.phase === 'run' && Math.abs(g.forwardSpeed(1 / 60) - 10) < 0.01, `syrup: speed not restored (${g.forwardSpeed(1 / 60)})`);
info.syrup = { minSpeed: Math.round(minSpeed * 100) / 100, slowed };

// gumball: rolls down its lane, crushes members standing there; shot down by a big squad it bursts
const GB = { type: 'hazard', kind: 'gumball', at: 40, lane: 'L', count: 1, spacing: 10, roll: 6, hp: 60, length: 20 };
custom([GB]); d.give('troops', 50); reset();
let rolled = false;
for (let i = 0; i < 420; i++) { g.input.setTarget(-2.5); g.step(1 / 60); const o = live('gumball'); if (o && o.balls[0].state === 'roll') rolled = true; }
ok(rolled && lost.gumball > 0, `gumball: rolled ${rolled}, crushed ${lost.gumball || 0}`);
info.gumball = lost.gumball || 0;
custom([{ ...GB, hp: 30 }]); g.weapons.enabled = true; d.give('troops', 120); reset();
let burst = false;
for (let i = 0; i < 420; i++) { g.input.setTarget(-2.5); g.step(1 / 60); const o = live('gumball'); if (o && o.balls[0].state === 'burst') burst = true; }
ok(burst && !lost.gumball, `gumball: shot ${burst}, crushed ${lost.gumball || 0}`);
custom([{ ...GB, count: 2, zigzag: true, hp: 9999, at: 30 }], {}); d.give('troops', 60);
for (let i = 0; i < 200; i++) { g.input.setTarget(0); g.step(1 / 60); g.sync(1 / 60); }
await shot('gumball');

// choco: pours on its cycle, drowns members in the lane, stops bullets while pouring
const CH = { type: 'hazard', kind: 'choco', at: 30, lane: 'R', count: 3, spacing: 8, period: 1.6, on: 1.0, warn: 0.5, length: 20 };
custom([CH], { speed: 6 }); d.give('troops', 50); reset();
let poured = false, blocked = 0, passed = 0;
for (let i = 0; i < 480; i++) {
  g.input.setTarget(2.5); g.step(1 / 60);
  const o = live('choco');
  const blocker = g.bullets.systems.find((s) => s.kind === 'choco');
  if (!o || !blocker) continue;
  for (const f of o.falls) {
    const b = { nh: 0, hits: [] };
    const t = blocker.sweep(b, f.x, f.z + 1, f.z - 1);
    if (f.pour) { poured = true; if (t === f) blocked++; } else if (!t) passed++;
  }
}
ok(poured && lost.choco > 0, `choco: poured ${poured}, drowned ${lost.choco || 0}`);
ok(blocked > 0 && passed > 0, `choco: bullets blocked ${blocked} (pouring) / passed ${passed} (dry)`);
info.choco = lost.choco || 0;
custom([{ ...CH, lane: 'L', count: 2, zigzag: true, period: 2.4, on: 1.4 }], { speed: 6 }); d.give('troops', 40);
for (let i = 0; i < 300 && !hz.list.some((o) => o.falls && o.falls.some((f) => f.h > 0.9)); i++) { g.input.setTarget(0); g.step(1 / 60); g.sync(1 / 60); }
await shot('choco');

// platform: following the deck keeps the squad; staying at the edge drops it
const PL = [{ type: 'hazard', kind: 'platform', at: 40, length: 18, w: 6, amp: 1.8, period: 4 }];
custom(PL, { theme: 'citadel' }); d.give('troops', 50); reset();
let xs = [];
for (let i = 0; i < 480; i++) { const o = live('platform'); g.input.setTarget(o ? o.x : 0); g.step(1 / 60); if (o) xs.push(o.x); if (i === 300) await shot('platform'); }
const follow = lost.gap || 0;
custom(PL, { theme: 'citadel' }); d.give('troops', 50); reset();
steps(480, 4.6);
const edge = lost.gap || 0;
ok(Math.max(...xs) - Math.min(...xs) > 2, `platform: deck did not move (${Math.min(...xs)}..${Math.max(...xs)})`);
ok(edge > follow + 15, `platform: follow lost ${follow}, edge lost ${edge}`);
info.platform = { follow, edge, w: hz.list.length ? live('platform')?.w : null };

// lightning: marked (flagged) strikes kill under them
custom([{ type: 'hazard', kind: 'lightning', at: 20, length: 200, every: 0.6, r: 1.5, warn: 1.0 }], { theme: 'citadel' });
d.give('troops', 80); reset();
let tel = 0, flagged = 0;
for (let i = 0; i < 600; i++) { g.input.setTarget(0); g.step(1 / 60); tel = Math.max(tel, g.telegraph.active.length); flagged = Math.max(flagged, g.telegraph.active.filter((h) => h.hazard).length); if (i === 420) await shot('lightning'); }
ok(flagged > 0 && flagged === tel, `lightning: telegraphs ${tel}, flagged ${flagged}`);
ok(lost.lightning > 0, 'lightning: nobody struck');
info.lightning = lost.lightning || 0;

// wind: pushes sideways; a squad left near the downwind edge is blown off, steering upwind saves it
const WI = [{ type: 'hazard', kind: 'wind', at: 30, length: 50, dir: 1, push: 8, period: 2.4 }];
custom(WI, { theme: 'citadel' }); d.give('troops', 80); reset();
let push = 0, drift = 0;
for (let i = 0; i < 480; i++) { g.input.setTarget(2.5); g.step(1 / 60); push = Math.max(push, hz.mods.pushX); drift = Math.max(drift, g.squad.leader.x - 2.5); if (i === 300) await shot('wind'); }
const blown = lost.wind || 0;
custom(WI, { theme: 'citadel' }); d.give('troops', 80); reset();
steps(480, -1.5);
ok(push > 4 && drift > 0.3, `wind: push ${push}, drift ${drift}`);
ok(blown > 3 && blown > (lost.wind || 0) + 3, `wind: downwind lost ${blown}, upwind lost ${lost.wind || 0}`);
info.wind = { blown, upwind: lost.wind || 0 };

// collapse: the cracked lane falls away under the squad, the solid lane holds
const CO = [{ type: 'hazard', kind: 'collapse', at: 40, length: 24, weak: 'L', warn: 0.6, fast: 1.6, slow: 0.85 }];
custom(CO, { theme: 'citadel' }); d.give('troops', 60); reset();
let shook = false;
for (let i = 0; i < 480; i++) { g.input.setTarget(-2.5); g.step(1 / 60); const o = live('collapse'); if (o && o.state !== 'idle') shook = true; if (i === 290) await shot('collapse'); }
const weakLost = lost.gap || 0;
custom(CO, { theme: 'citadel' }); d.give('troops', 60); reset();
steps(480, 2.6);
ok(shook && weakLost > 5, `collapse: shook ${shook}, weak lane lost ${weakLost}`);
ok((lost.gap || 0) < weakLost / 3, `collapse: solid lane lost ${lost.gap || 0} (weak ${weakLost})`);
info.collapse = { weak: weakLost, solid: lost.gap || 0 };

// ---------------- 3. hints, autopilot ----------------
const hints = [];
g.events.on('hazard:hint', (p) => hints.push(p.text));
const course = [
  { type: 'hazard', kind: 'jelly', at: 30, side: 'R', frac: 0.6, pad: 3.5, gap: 8, length: 15, hint: HP.HINTS.jelly },
  { type: 'hazard', kind: 'gumball', at: 60, lane: 'L', count: 2, spacing: 10, roll: 6, hp: 9999, zigzag: true, length: 30 },
  { type: 'hazard', kind: 'choco', at: 100, lane: 'R', count: 2, spacing: 10, period: 3, on: 1.4, warn: 0.9, length: 14 },
  { type: 'hazard', kind: 'platform', at: 130, length: 18, w: 5.6, amp: 1.6, period: 4.2 },
  { type: 'hazard', kind: 'wind', at: 160, length: 34, dir: -1, push: 8, period: 2.4 },
  { type: 'hazard', kind: 'collapse', at: 205, length: 22, weak: 'R', warn: 0.6, fast: 1.6, slow: 0.85, hint: HP.HINTS.collapse },
];
const runCourse = (bot) => {
  d.setAutopilot(bot, 3, { crates: 'never', ability: false, loadout: 'keep' });
  custom(course, { length: 260, theme: 'citadel' });
  d.give('troops', 60);
  const start = g.squad.count;
  for (let i = 0; i < 1800 && g.run.active; i++) { if (!bot) g.input.setTarget(0); g.step(1 / 60); }
  return { start, end: g.squad.count, kills: { ...hz.stats.kills } };
};
const still = runCourse(false), pro = runCourse('pro'), casual = runCourse('casual');
info.course = { still, pro, casual };
ok(pro.end > still.end + 8, `autopilot pro ${pro.end} vs standing still ${still.end}`);
ok(casual.end > 5, `autopilot casual wiped (${casual.end})`);
ok(hints.includes(HP.HINTS.jelly) && hints.includes(HP.HINTS.collapse), `hints not emitted (${hints})`);
d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, info };
