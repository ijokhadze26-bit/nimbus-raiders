// @smoke --seconds 0 --shots 0
// Update 3 stage 2 (STAGE2 §A): world hazard framework + Volcanic Forge / Frozen Peaks kinds.
// 1. plan: every world 2-3 level gets hazards of its own world only, never over a gate / barrel / crate / gap /
//    blade (lethal ones also off power-ups / coins), all before the final rush / arena, deterministic; the intro
//    levels (L11, L21) teach every kind of their world once, with a hint; world 1 has none.
// 2. each kind on a scratch level: lava burns members standing in it (stones are safe, a shield stops it),
//    embers / icicles telegraph (flagged hazard) and kill on impact, a cracked lane collapses into a gap that
//    drops whoever lingers, geysers erupt on a cycle, ice makes steering slide, a snowstorm pulls the fog in and
//    lets it go, an avalanche pushes the squad sideways and sweeps edge members off.
// 3. the hint line and the autopilot (pro keeps far more of the squad than standing still). The real levels on
//    High / Low are tests/u2/w3-hazards-levels.js. window.__shot (screenshot harness) saves pictures.
const g = window.__game, d = g.debug;
g.loop.stop();
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const L = await import('/src/data/levels.js');
const HP = await import('/src/data/hazardplan.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const steps = (n, x) => { for (let i = 0; i < n; i++) { if (x != null) g.input.setTarget(x); g.step(1 / 60); } };
const frames = (n, x) => { for (let i = 0; i < n; i++) { if (x != null) g.input.setTarget(x); g.step(1 / 60); g.sync(1 / 60); g.engine.render(); } };
const hz = g.hazards;

// ---------------- 1. plan ----------------
const KINDS = { 2: HP.WORLD_KINDS[2], 3: HP.WORLD_KINDS[3] };
for (const lv of L.LEVELS) {
  const hs = HP.hazardsOf(lv);
  if (lv.world === 1) { ok(hs.length === 0, `L${lv.id} (sky) has hazards`); continue; }
  if (!KINDS[lv.world]) continue;
  ok(hs.length >= 2, `L${lv.id}: only ${hs.length} hazards`);
  const rush = lv.events.find((e) => e.rush);
  const end = rush ? rush.at : (lv.layout ?? lv.length) - 30;
  for (const h of hs) {
    ok(KINDS[lv.world].includes(h.kind), `L${lv.id}: ${h.kind} is not a world ${lv.world} kind`);
    ok(h.at + (h.length || 0) < end, `L${lv.id}: ${h.kind}@${h.at} runs into the rush / arena (${end})`);
    const overlay = HP.OVERLAY.has(h.kind) && !h.hint;
    for (const e of lv.events) {
      const c = HP.CLEAR[e.type];
      if (!c || e === h || e.type === 'hazard' || (overlay && e.type !== 'crate')) continue;
      if ((e.type === 'powerup' || e.type === 'coins') && !HP.LETHAL.has(h.kind)) continue;
      const a = e.at - c[0], b = e.at + (e.length || (e.type === 'coins' ? 12 : 0)) + c[1];
      if (h.at < b && h.at + (h.length || 0) > a) fails.push(`L${lv.id}: ${h.kind}@${h.at}+${h.length} overlaps ${e.type}@${e.at}`);
    }
  }
  info['L' + lv.id] = hs.length;
}
for (const id of [11, 21]) {
  const hs = HP.hazardsOf(L.getLevel(id)), w = L.getLevel(id).world;
  for (const k of KINDS[w]) ok(hs.some((h) => h.kind === k && h.hint), `L${id} does not teach ${k} with a hint`);
}
const again = HP.planHazards(L.getLevel(16));
ok(HP.hazardsOf(again).length === info.L16, 'planHazards is not idempotent');

// ---------------- 2. kinds on scratch levels ----------------
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
const custom = (events, extra = {}) => { d.startCustom({ length: 260, speed: 10, theme: 'forge', events, ...extra }); g.weapons.enabled = false; };
const lost = {};
g.events.on('squad:change', (p) => { if (p.delta < 0) lost[p.reason] = (lost[p.reason] || 0) - p.delta; }); // squad:lost is rate-limited
const reset = () => { for (const k in lost) delete lost[k]; };

// lava: a whole-road river with a stone causeway at x = 0
custom([{ type: 'hazard', kind: 'lava', at: 40, length: 6, lane: 'both', paths: [0], pathHalf: 1.2, rate: 30 }]);
d.give('troops', 40);
reset(); steps(300, 3.5);
info.lavaSide = lost.lava || 0;
ok((lost.lava || 0) >= 5, `lava: only ${lost.lava || 0} burned running through it`);
custom([{ type: 'hazard', kind: 'lava', at: 40, length: 6, lane: 'both', paths: [0], pathHalf: 1.2, rate: 30 }]);
reset(); steps(300, 0);
ok(!lost.lava, `lava: Pip alone on the stones burned (${lost.lava})`);
custom([{ type: 'hazard', kind: 'lava', at: 40, length: 6, lane: 'L', rate: 30 }]);
d.give('troops', 30); d.give('shield');
reset(); steps(300, -2.5);
ok(!lost.lava, `lava: shield did not protect (${lost.lava})`);
await (async () => { custom([{ type: 'hazard', kind: 'lava', at: 30, length: 8, lane: 'both', paths: [-2.5], rate: 14 }]); d.give('troops', 60); frames(70, -2.5); await shot('lava'); })();

// ember: telegraphed, flagged, lands and kills members under it
custom([{ type: 'hazard', kind: 'ember', at: 20, length: 200, every: 0.6, r: 1.6, warn: 1.0 }]);
d.give('troops', 80);
reset();
let tel = 0, flagged = 0;
for (let i = 0; i < 600; i++) { g.input.setTarget(0); g.step(1 / 60); tel = Math.max(tel, g.telegraph.active.length); flagged = Math.max(flagged, g.telegraph.active.filter((h) => h.hazard).length); }
ok(flagged > 0 && flagged === tel, `ember: telegraphs ${tel}, flagged ${flagged}`);
ok((lost.ember || 0) > 0, 'ember: nobody hit while standing in the rain');
info.ember = lost.ember || 0;
frames(40, 0); await shot('ember');

// crack: running down the cracked lane drops the back of the squad
custom([{ type: 'hazard', kind: 'crack', at: 30, length: 40, lane: 'R', delay: 1.6 }]);
d.give('troops', 50);
reset();
let cracked = false, gapSeen = false;
for (let i = 0; i < 420; i++) { g.input.setTarget(2.6); g.step(1 / 60); const s = hz.state(); if (s.live.some((o) => o.state === 'crack')) cracked = true; if (g.obstacles.gaps.some((x) => x.crack)) gapSeen = true; if (i === 120) { g.sync(1 / 60); g.engine.render(); await shot('crack'); } }
ok(cracked && gapSeen, `crack: cracked ${cracked}, gap ${gapSeen}`);
ok((lost.gap || 0) > 0, 'crack: nobody fell through the collapsed floor');
info.crack = lost.gap || 0;

// geyser: a vent in the left lane erupts on its cycle
custom([{ type: 'hazard', kind: 'geyser', at: 30, lane: 'L', count: 3, spacing: 8, period: 1.6, on: 0.9, warn: 0.5, r: 1.6, length: 20 }], { speed: 6 });
d.give('troops', 50);
reset(); let erupt = false;
for (let i = 0; i < 420; i++) { g.input.setTarget(-2.5); g.step(1 / 60); if (hz.list.some((o) => o.vents && o.vents.some((v) => v.erupt))) erupt = true; }
ok(erupt && (lost.geyser || 0) > 0, `geyser: erupted ${erupt}, burned ${lost.geyser || 0}`);
custom([{ type: 'hazard', kind: 'geyser', at: 22, lane: 'L', count: 2, spacing: 8, period: 2, on: 1.2, warn: 0.6, r: 1.5, length: 12 }], { speed: 6 });
d.give('troops', 40);
for (let i = 0; i < 240 && !hz.list.some((o) => o.vents && o.vents[0].erupt && o.vents[0].h > 0.8); i++) { g.input.setTarget(1.5); g.step(1 / 60); g.sync(1 / 60); }
frames(2, 1.5); await shot('geyser');

// ice: steering slides (leader lags then overshoots); off the ice it snaps as before
const slideTest = (iceOn) => {
  custom(iceOn ? [{ type: 'hazard', kind: 'ice', at: 2, length: 200, lane: 'both', slide: 0.85 }] : []);
  steps(30, 0);
  const x0 = g.squad.leader.x; let peak = -9, mods = 0;
  for (let i = 0; i < 90; i++) { g.input.setTarget(3); g.step(1 / 60); peak = Math.max(peak, g.squad.leader.x); mods = Math.max(mods, hz.mods.slide); if (i === 10) info['x10_' + iceOn] = Math.round((g.squad.leader.x - x0) * 100) / 100; }
  return { peak, mods };
};
const dry = slideTest(false), wet = slideTest(true);
ok(wet.mods > 0.5 && dry.mods === 0, `ice: slide mods ${wet.mods} / ${dry.mods}`);
ok(info.x10_true < info.x10_false * 0.8, `ice: leader not slower to turn (${info.x10_true} vs ${info.x10_false})`);
ok(wet.peak > 3.05, `ice: no overshoot (${wet.peak})`);
frames(20, -2); await shot('ice');

// snowstorm: fog pulls in, then lets go after the zone
custom([{ type: 'hazard', kind: 'snow', at: 20, length: 50, fog: 0.35 }], { theme: 'frost' });
const far0 = g.scene.fog.far;
let minK = 1;
for (let i = 0; i < 300; i++) { g.step(1 / 60); g.sync(1 / 60); minK = Math.min(minK, g.world.fogK); if (i === 200) { g.engine.render(); await shot('snow'); } }
ok(minK < 0.5 && g.scene.fog.far < far0 * 0.6, `snow: fogK ${minK}, far ${g.scene.fog.far} of ${far0}`);
for (let i = 0; i < 600; i++) { g.step(1 / 60); g.sync(1 / 60); }
ok(g.world.fogK === 1 && Math.abs(g.scene.fog.far - far0) < 0.01, `snow: fog not restored (${g.world.fogK})`);

// icicles: blue shadow telegraphs, spikes drop and shatter
custom([{ type: 'hazard', kind: 'icicle', at: 20, length: 200, every: 0.6, r: 1.4, warn: 1.0 }], { theme: 'frost' });
d.give('troops', 80);
reset(); for (let i = 0; i < 600; i++) { g.input.setTarget(0); g.step(1 / 60); if (i === 400) { g.sync(1 / 60); g.engine.render(); await shot('icicle'); } }
ok((lost.icicle || 0) > 0, 'icicle: nobody hit');

// avalanche: telegraph, then a sideways push; members at the edge are swept off
custom([{ type: 'hazard', kind: 'avalanche', at: 40, length: 18, from: 'L', push: 9, dur: 1.5, warn: 1.2 }], { theme: 'frost' });
d.give('troops', 80);
reset(); let push = 0, warned = false;
for (let i = 0; i < 420; i++) { g.input.setTarget(1.5); g.step(1 / 60); push = Math.max(push, hz.mods.pushX); if (hz.list.some((o) => o.state === 'warn')) warned = true; if (i > 0 && hz.mods.pushX && !info.avShot) { info.avShot = 1; g.sync(1 / 60); g.engine.render(); await shot('avalanche'); } }
ok(warned && push > 5, `avalanche: warned ${warned}, push ${push}`);
ok((lost.avalanche || 0) > 0, 'avalanche: nobody swept off the edge');
info.avalanche = lost.avalanche || 0;

// ---------------- 3. hint, autopilot, real levels on High / Low ----------------
const hints = [];
g.events.on('hazard:hint', (p) => hints.push(p.text));
const course = [
  { type: 'hazard', kind: 'lava', at: 40, length: 10, lane: 'L', rate: 20 },
  { type: 'hazard', kind: 'geyser', at: 80, lane: 'R', count: 2, spacing: 9, period: 3, on: 1.1, warn: 1, r: 1.5, length: 13 },
  { type: 'hazard', kind: 'ember', at: 110, length: 40, every: 0.9, r: 1.35, warn: 1.1 },
  { type: 'hazard', kind: 'crack', at: 170, length: 24, lane: 'L', delay: 2.0 },
  { type: 'hazard', kind: 'lava', at: 210, length: 5, lane: 'both', paths: [2.5], rate: 18, hint: 'LAVA! Stay on the stones' },
];
const runCourse = (bot) => {
  d.setAutopilot(bot, 3, { crates: 'never', ability: false, loadout: 'keep' });
  custom(course, { length: 250 });
  d.give('troops', 60);
  const start = g.squad.count;
  for (let i = 0; i < 1800 && g.run.active; i++) { if (!bot) g.input.setTarget(0); g.step(1 / 60); }
  return { start, end: g.squad.count };
};
const still = runCourse(false), pro = runCourse('pro'), casual = runCourse('casual');
info.course = { still, pro, casual };
ok(pro.end > still.end + 8, `autopilot pro ${pro.end} vs standing still ${still.end}`);
ok(casual.end > 5, `autopilot casual wiped (${casual.end})`);
ok(hints.includes('LAVA! Stay on the stones'), `hint not emitted (${hints})`);
d.setAutopilot(false);

d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, info };
