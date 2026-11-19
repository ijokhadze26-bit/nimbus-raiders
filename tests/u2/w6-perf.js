// @smoke --seconds 0 --shots 0
// Update 3 stage 6 (STAGE6 §C, builder "perf"): phone / Low smoothness audit with deterministic counters only (no
// frame times - the machine is shared). Logic steps at 1/60, the scene renders every few frames.
// 1. DRAW CALLS on Low at a fixed busy W5 moment (L49, pro bot seed 1, Pip + Thunderclap Mk IV: hazards, a cage,
//    road objects, new enemies) stay <= the recorded budget, and no EMPTY instanced mesh of the stage 2-5 systems
//    (hazard pools, horde types / extras) is in the render list (each cost a program + uniform setup per frame).
// 2. HUD DOM writes: <= budget per 60 steady frames in a W2 level and a raging Tempest King fight; and with the
//    game frozen (ui.update only) the HUD touches the DOM 0 times (combo meter, formation / dodge buttons, boss
//    bar, hazard hint, ability button, mode chip: writes only on a value change).
// 3. No geometry / material growth after warm-up: two identical W5 replays end on the same renderer geometry /
//    texture count, the per-spawn hazard builds stay within a budget and gap lips come from a few cached variants
//    (they used to be one new ~60-part geometry per hole, cached for good).
// 4. Every stage 2-5 system runs its Low branch without errors: a slice of every hazard world + its cage / props
//    level + every world boss (rage + safe spot) on Low, all 16 hazard kinds and 4 road objects spawned, no light
//    added to the scene by them.
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
// budgets recorded 2026-11-19 after the stage 6 fixes (measured: 111 calls, 103.6 / 135 and 68.4 DOM writes, 117 geometries
// and 31 materials per warm replay, 6 lip variants) with a little headroom
const BUDGET = { lowCallsL49: 115, domPer60: 125, domWin: 170, domPer60Boss: 85, memGeoGrow: 0, replayGeo: 160, replayMat: 45 };
const r = g.engine.renderer, rinfo = r.info;
let mesh = null;
g.engine.scene.traverse((o) => { if (!mesh && o.isMesh && o.geometry && o.material && !Array.isArray(o.material)) mesh = o; });
const base = (C) => { while (C && Object.getPrototypeOf(C) && Object.getPrototypeOf(C).name && Object.getPrototypeOf(C).name !== 'EventDispatcher') C = Object.getPrototypeOf(C); return C; };
const GeoC = base(mesh.geometry.constructor), MatC = base(mesh.material.constructor);
const ids = () => { const a = new GeoC(), b = new MatC(); a.dispose(); b.dispose(); return { geo: a.id, mat: b.id }; };
let frameNo = 0;
const frame = (renderEvery = 3) => { g.step(1 / 60); g.sync(1 / 60); if (frameNo++ % renderEvery === 0) g.engine.render(); ui.update(1 / 60); };
const run = (lv, secs, opts = {}) => {
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('pro', opts.seed || 1);
  d.startLevel(lv);
  d.setMk(opts.mk || 4);
  if (opts.boss) { d.skipToBoss(); d.give('troops', 150); d.setMk(5); }
  g.heroes.guard = 99;
  for (let i = 0; i < secs * 60 && g.state === 'playing'; i++) {
    frame(opts.renderEvery || 3);
    if (opts.boss && g.boss && g.boss.state === 'fight' && !g.boss.rage) g.boss.damage(g.boss.hp - g.boss.maxHp * 0.24);
    if (opts.each) opts.each(i);
  }
};
// owners of the stage 2-5 instanced meshes (hazard pools, horde type meshes + extras)
function stageMeshes() {
  const set = new Set();
  const H = g.hazards;
  for (const k of Object.keys(H.views || {})) for (const p of Object.values(H.views[k] || {})) if (p && p.mesh && p.mesh.isInstancedMesh) set.add(p.mesh);
  const v = g.horde.view;
  for (const m of v.meshes) set.add(m.mesh);
  for (const m of [v.shields, v.sparks, v.blobs, v.blastMesh, v.extras.rings, v.extras.goo, v.extras.halos]) if (m) set.add(m);
  return set;
}
const orig = r.renderBufferDirect.bind(r);
let watch = null;
r.renderBufferDirect = function (camera, scene, geo, mat, obj, group) {
  if (watch && obj.isInstancedMesh && obj.count === 0 && watch.set.has(obj)) watch.empty++;
  return orig(camera, scene, geo, mat, obj, group);
};
const lights = () => { let n = 0; g.engine.scene.traverse((o) => { if (o.isLight) n++; }); return n; };

try {
  g.applyQuality('low');
  const lights0 = lights();
  // ---------------- 4 (first: also the warm-up for 3). Low branches of every stage 2-5 system ----------------
  const spawnedH = {}, spawnedP = {};
  let cages = 0;
  const collect = () => {
    const s = g.hazards.state(); for (const k in s.spawned) spawnedH[k] = Math.max(spawnedH[k] || 0, s.spawned[k]);
    const p = g.props.state(); if (p) for (const k in p.spawned) spawnedP[k] = Math.max(spawnedP[k] || 0, p.spawned[k]);
  };
  for (const lv of [11, 19, 21, 29, 31, 39, 41, 49, 47, 48]) {
    run(lv, 30, { renderEvery: 30, each: (i) => { if (i % 120 === 0) { collect(); cages = Math.max(cages, g.cages.live.length); } } });
    collect();
    ok(g.hazards.low === true || g.engine.quality === 'low', `L${lv}: hazards not on Low`);
  }
  for (const lv of [20, 30, 40, 50]) run(lv, 12, { boss: true, renderEvery: 30 });
  info.spawned = { hazards: spawnedH, props: spawnedP, cagesSeen: cages };
  const { KIND_LIST } = await import('/src/game/hazards/registry.js');
  for (const k of KIND_LIST) ok(spawnedH[k.kind] > 0, `hazard ${k.kind} never spawned on Low`);
  for (const k of ['crane', 'dam', 'bell', 'boulder']) ok(spawnedP[k] > 0, `road object ${k} never spawned on Low`);
  ok(cages > 0, 'no rescue cage seen on Low');
  ok(lights() === lights0, `stage 2-5 systems added lights (${lights0} -> ${lights()})`);

  // ---------------- 3. no geometry / material growth after warm-up ----------------
  // (hazards still build their own strip / rim meshes when they spawn and free them when they go: replays of the
  // same levels must end on the same renderer geometry count, and gap lips come from a few cached variants)
  const replay = () => { const id0 = ids(); for (const lv of [49, 48]) run(lv, 30, { renderEvery: 30 }); const id1 = ids(); return { geo: id1.geo - id0.geo - 1, mat: id1.mat - id0.mat - 1, mem: rinfo.memory.geometries, tex: rinfo.memory.textures }; };
  const rA = replay(), rB = replay();
  info.replay = { a: rA, b: rB };
  ok(rB.mem - rA.mem <= BUDGET.memGeoGrow, `renderer geometries grew ${rA.mem} -> ${rB.mem} between two identical W5 replays`);
  ok(rB.tex - rA.tex <= 0, `renderer textures grew ${rA.tex} -> ${rB.tex} between two identical W5 replays`);
  ok(rB.geo <= BUDGET.replayGeo, `W5 replay built ${rB.geo} geometries (budget ${BUDGET.replayGeo}: hazard strips / rims per spawn)`);
  ok(rB.mat <= BUDGET.replayMat, `W5 replay built ${rB.mat} materials (budget ${BUDGET.replayMat})`);
  {
    const { gapLipGeometry } = await import('/src/models/obstacles.js');
    const lips = new Set();
    for (let s = 0; s < 400; s += 7) lips.add(gapLipGeometry(4.2, g.world.theme, s));
    info.lipVariants = lips.size;
    ok(lips.size <= 8, `gap lips: ${lips.size} different geometries for 58 holes (want a few cached variants)`);
  }

  // ---------------- 1. Low draw calls at a busy W5 moment + no empty stage meshes drawn ----------------
  {
    let max = 0, at = 0, empty = 0, samples = 0;
    d.setLoadout('pip', 'thunderclap'); d.setAutopilot('pro', 1); d.startLevel(49); d.setMk(4); g.heroes.guard = 99;
    for (let i = 0; i < 20 * 60 && g.state === 'playing'; i++) {
      g.step(1 / 60); g.sync(1 / 60);
      if (i % 30 === 0) {
        watch = { set: stageMeshes(), empty: 0 };
        g.engine.render();
        empty += watch.empty; samples++; watch = null;
        if (g.engine.stats.calls > max) { max = g.engine.stats.calls; at = Math.round(g.run.time * 10) / 10; }
      }
      ui.update(1 / 60);
    }
    info.lowL49 = { maxCalls: max, at, emptyStageMeshesDrawn: empty, samples };
    ok(max > 40 && max <= BUDGET.lowCallsL49, `Low L49 max draw calls ${max} (budget ${BUDGET.lowCallsL49})`);
    ok(empty === 0, `empty stage 2-5 instanced meshes still rendered ${empty}x over ${samples} frames`);
  }

  // ---------------- 2. HUD DOM writes ----------------
  const root = document.getElementById('ui');
  const mo = new MutationObserver(() => {});
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const domRun = async (setup, secs) => {
    setup();
    for (let i = 0; i < 180; i++) frame();
    mo.takeRecords();
    let total = 0, win = 0, maxWin = 0, n = 0;
    for (let i = 0; i < secs * 60 && g.state === 'playing'; i++) {
      frame(); n++;
      const k = mo.takeRecords().length; total += k; win += k;
      if (i % 60 === 59) { maxWin = Math.max(maxWin, win); win = 0; }
    }
    // frozen: the HUD alone, nothing in the game changes -> no DOM write at all
    // (the squad bubble's red 'loss' flash ends on a wall-clock timer: let it end first)
    await new Promise((res) => setTimeout(res, 300));
    for (let i = 0; i < 240; i++) ui.update(1 / 60); // eased bars (progress 0.2 / frame, boss lag 0.06 / frame) settle
    mo.takeRecords();
    let frozen = 0; const what = [];
    for (let i = 0; i < 60; i++) {
      ui.update(1 / 60);
      for (const rec of mo.takeRecords()) { frozen++; const t = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement; what.push(rec.type + ':' + (t && t.className) + (rec.attributeName ? '@' + rec.attributeName : '')); }
    }
    return { per60: Math.round(total / Math.max(1, n) * 600) / 10, maxWin, frozen, what: what.slice(0, 6), frames: n };
  };
  info.dom = {
    L19: await domRun(() => { d.setLoadout('pip', 'thunderclap'); d.setAutopilot('pro', 1); d.startLevel(19); d.setMk(4); g.heroes.guard = 99; }, 12),
    B50: await domRun(() => {
      d.setLoadout('pip', 'thunderclap'); d.setAutopilot('pro', 1); d.startLevel(50); d.skipToBoss(); d.give('troops', 150); d.setMk(5); g.heroes.guard = 99;
      for (let i = 0; i < 600 && (!g.boss || g.boss.state !== 'fight'); i++) frame();
      if (g.boss) g.boss.damage(g.boss.hp - g.boss.maxHp * 0.24);
    }, 10),
  };
  mo.disconnect();
  ok(info.dom.L19.per60 <= BUDGET.domPer60 && info.dom.L19.maxWin <= BUDGET.domWin, `HUD DOM writes L19 ${info.dom.L19.per60}/60 frames (max ${info.dom.L19.maxWin})`);
  ok(info.dom.B50.per60 <= BUDGET.domPer60Boss, `HUD DOM writes Tempest King ${info.dom.B50.per60}/60 frames`);
  ok(info.dom.L19.frozen === 0 && info.dom.B50.frozen === 0, `HUD wrote to the DOM with the game frozen (${info.dom.L19.frozen}, ${info.dom.B50.frozen}): ${info.dom.L19.what.concat(info.dom.B50.what).join(', ')}`);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  r.renderBufferDirect = orig;
  d.toTitle();
  g.applyQuality('high');
}
return { pass: fails.length === 0, fails, info, budget: BUDGET };
