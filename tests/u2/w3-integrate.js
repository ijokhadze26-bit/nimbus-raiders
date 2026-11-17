// @smoke --seconds 0 --shots 0
// Update 3 stage 3 integration (enemies x levels): the two halves working together.
// 1. Real campaign levels spawn the new enemy types of their world (W2 blaster + healer, W3 + sniper + spawner,
//    W4-5 + flyer) and their elite fraction (W4-5) through the enemies' elite flag; big hordes split into waves.
// 2. Hidden gates x waves: a hidden gate's screening horde arrives as probe + held rush, and the gate is still
//    uncovered while the squad is in front of it (not only by running through it) - in a controlled run and on
//    real levels with the pro bot.
// 3. ELITE mode: eliteDef's +20% elite fraction becomes elite enemies (x3 hp, counted in run.stats.elites) - also
//    on world 1, whose hordes have no elite share of their own.
// When run by the screenshot harness, window.__shot(name) saves the hidden gate behind its waves and an elite horde.
const g = window.__game, d = g.debug;
g.loop.stop();
const L = await import('/src/data/levels.js');
const H = await import('/src/data/harder.js');
const E = await import('/src/data/elite.js');
const { ELITE } = await import('/src/data/enemies.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const errs = [];
const onErr = (e) => errs.push(String(e.message || e));
window.addEventListener('error', onErr);
const NEW = ['blaster', 'healer', 'sniper', 'spawner', 'flyer'];
const WANT = { 2: ['blaster', 'healer'], 3: ['blaster', 'healer', 'sniper', 'spawner'], 4: NEW, 5: NEW };

/** Watches the horde while a run plays: types / elites placed, elite kills, wave splits, hidden-gate reveals. */
function watch() {
  const types = {}, elites = {}, gates = new Map();
  let rushes = 0;
  const h = g.horde, place = h.place;
  h.place = function (...a) { // (instance override: count every enemy placed, pooled objects included)
    const e = place.apply(this, a);
    if (e) { types[e.def.id] = (types[e.def.id] || 0) + 1; if (e.elite) elites[e.def.id] = (elites[e.def.id] || 0) + 1; }
    return e;
  };
  const offs = [
    g.events.on('horde:rush', () => { rushes++; }),
    g.events.on('gate:reveal', (p) => { const gt = g.gates.live.find((x) => x.id === p.id); if (gt) gates.set(gt.id, { ahead: g.squad.leader.z - gt.z, lane: gt.lane }); }),
  ];
  const scan = () => { for (const gt of g.gates.live) if (gt.hidden && !gates.has(gt.id)) gates.set(gt.id, null); };
  return { scan, done: () => { offs.forEach((f) => f()); delete h.place; return { types, elites, rushes, gates: [...gates.values()] }; } };
}
function play(id, opts = {}, maxS = 200) {
  g.save.reset();
  d.setUpgrades({ damage: 14, rate: 14, squad: 12, tier: 3 });
  d.setAutopilot('pro', opts.seed || 1, { crates: 'never', ability: true, loadout: 'keep' });
  g.startLevel(id, opts);
  const w = watch();
  let t = 0;
  // guard the squad so the whole level is seen (this checks spawning, not balance)
  while (g.state === 'playing' && t < maxS) { g.heroes.guard = 999; d.simulate(0.25); w.scan(); t += 0.25; }
  const r = w.done();
  r.split = g.horde.waveStats.split; r.elitesKilled = (g.run && g.run.stats.elites) || 0;
  r.win = !!(g.lastResult && g.lastResult.win); r.t = t;
  return r;
}

// ---------------- 1. real levels spawn the new types + elites ----------------
d.setLoadout('pip', 'thunderclap');
const lv = {};
for (const id of [16, 26, 36, 47]) {
  const def = L.LEVELS.find((x) => x.id === id), w = def.world;
  const r = play(id);
  lv[id] = { types: r.types, elites: r.elites, split: r.split, rushes: r.rushes, elitesKilled: r.elitesKilled, win: r.win };
  // a type is expected when some horde gives it at least 2 enemies
  const want = WANT[w].filter((k) => def.events.some((e) => e.type === 'horde' && (e.mix[k] || 0) * e.count >= 2));
  ok(want.length >= 2, `L${id}: data has only ${want} of the new types`);
  for (const k of want) ok((r.types[k] || 0) > 0, `L${id}: no ${k} spawned (${JSON.stringify(r.types)})`);
  ok(r.split >= 2 && r.rushes >= 2, `L${id}: hordes not split into waves (split ${r.split}, rushes ${r.rushes})`);
  const nElite = Object.values(r.elites).reduce((a, b) => a + b, 0), nAll = Object.values(r.types).reduce((a, b) => a + b, 0);
  if (w >= 4) {
    const maxFrac = Math.max(...def.events.filter((e) => e.type === 'horde').map((e) => e.elite || 0));
    ok(nElite > 0 && nElite / nAll <= maxFrac + 0.02, `L${id}: elites ${nElite}/${nAll} (data max ${maxFrac})`);
    ok(r.elitesKilled > 0, `L${id}: no elite kill counted in run.stats.elites`);
  } else ok(nElite === 0, `L${id}: world ${w} spawned ${nElite} elites`);
}
info.levels = lv;

// ---------------- 2a. hidden gate x waves, controlled ----------------
const SCREEN_AT = 150;
const gateEv = [L.gate(SCREEN_AT, 'L', 'add', { value: 12, max: 60, hidden: true }), L.gate(SCREEN_AT, 'R', 'add', { value: 2, max: 5 })];
const ctl = [];
for (const [world, hpMul] of [[2, 2.5], [5, 2.5], [3, 40]]) { // the last screen is too tough to break: its rush is held
  d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
  d.startCustom({ world, length: 520, speed: 10, events: [...gateEv, L.horde(SCREEN_AT - H.SCREEN_DZ, 48, { grunt: 0.5, shield: 0.3, healer: 0.2 }, 'L', { screen: true, gateAt: SCREEN_AT, hpMul })] });
  d.setUpgrades({ damage: 10, rate: 10, squad: 8, tier: 2 });
  d.give('troops', 40 - g.squad.count);
  let gt = null, guard = 0, heldSeen = false, heldAt = null, revealAhead = null, releaseAhead = null, revealT = null, t = 0, rushes = 0, behind = 0;
  const offR = g.events.on('gate:reveal', () => { if (gt) { revealAhead = g.squad.leader.z - gt.z; revealT = t; } });
  const offW = g.events.on('horde:rush', () => { rushes++; if (gt && releaseAhead == null) releaseAhead = g.squad.leader.z - gt.z; });
  let shotDone = false;
  while (g.state === 'playing' && guard++ < 60 * 40) {
    g.heroes.guard = 999;
    g.step(1 / 60); t += 1 / 60;
    if (!gt && (gt = g.gates.live.find((x) => x.lane === 'L' && x.hidden) || null)) {
      // every wave of the screen spawned in front of its gate (hordewaves.fitScreen)
      for (const e of g.horde.list) if (e.state === 0 && e.z <= gt.z) behind++;
    }
    // before the reveal a held screen wave stands in front of the gate (it does not walk back through it)
    if (gt && gt.hidden) for (const e of g.horde.list) if (e.state === 0 && e.wave && !e.wave.go && e.z <= gt.z) behind++;
    const ws = g.horde.info().waves;
    if (ws.some((w) => w.locked && !w.go)) { heldSeen = true; if (heldAt == null && gt) heldAt = g.squad.leader.z - gt.z; }
    if (!shotDone && world === 5 && gt && gt.hidden && g.squad.leader.z - gt.z < 52) { shotDone = true; await shot('hidden-gate-waves'); }
    if (gt && gt.state !== 'live') break;
  }
  offR(); offW();
  const c = { world, hpMul, behind, split: g.horde.waveStats.split, rushes, heldSeen, heldAt: heldAt && Math.round(heldAt), revealAhead: revealAhead && Math.round(revealAhead * 10) / 10, releaseAhead: releaseAhead && Math.round(releaseAhead), revealT: revealT && Math.round(revealT * 10) / 10 };
  ctl.push(c);
  ok(c.split === 1 && rushes >= 1, `W${world}: the screen horde did not come as waves ${JSON.stringify(c)}`);
  ok(behind === 0, `W${world}: screen enemies stood behind the hidden gate ${JSON.stringify(c)}`);
  ok(revealAhead != null && revealAhead > 2, `W${world}: the hidden gate was not uncovered before the squad reached it ${JSON.stringify(c)}`);
}
info.controlled = ctl;

// ---------------- 2b. hidden gates on real levels (pro bot) ----------------
const withHidden = L.LEVELS.filter((x) => x.world >= 2 && x.events.some((e) => e.type === 'horde' && e.screen && e.count >= 18)).map((x) => x.id);
const pick = [withHidden.find((x) => x >= 16 && x <= 20), withHidden.find((x) => x > 30 && x < 40), withHidden.find((x) => x > 41 && x < 50)].filter(Boolean);
const real = {};
let total = 0, early = 0;
for (const id of pick) {
  const r = play(id, { seed: 2 });
  const gs = r.gates;
  total += gs.length;
  early += gs.filter((x) => x && x.ahead > 2).length;
  real[id] = { hidden: gs.length, early: gs.filter((x) => x && x.ahead > 2).length, atPass: gs.filter((x) => x && x.ahead <= 2).length, never: gs.filter((x) => !x).length, split: r.split };
  ok(gs.every((x) => x), `L${id}: a hidden gate was never uncovered ${JSON.stringify(real[id])}`);
}
info.real = real;
ok(pick.length >= 2 && total >= 3 && early / total >= 0.6, `hidden gates uncovered ahead of the squad: ${early}/${total}`);

// ---------------- 3. ELITE mode -> elite enemies ----------------
const eliteRuns = {};
for (const id of [3, 44]) {
  g.save.reset();
  d.setUpgrades({ damage: 14, rate: 14, squad: 12, tier: 3 });
  d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
  d.toTitle(); // (clears the last result screen for the screenshot)
  g.startLevel(id, { elite: true });
  ok(g.run.def.elite === true, `L${id}: not an elite run`);
  const base = L.LEVELS.find((x) => x.id === id);
  const want = Math.max(...g.run.def.events.filter((e) => e.type === 'horde').map((e) => e.elite || 0));
  const M = E.eliteMuls(base);
  ok(want >= M.elite, `L${id}: elite def horde fraction ${want}`);
  const w = watch();
  let t = 0, hpOk = true, shotDone = false;
  while (g.state === 'playing' && t < 200) {
    g.heroes.guard = 999; d.simulate(0.25); w.scan(); t += 0.25;
    // an elite has 3x the hp of a normal enemy of its type in the same horde (same hpMul)
    for (const e of g.horde.list) if (e.state === 0 && e.elite && Math.abs(e.maxHp / (e.def.hp * e.hpm) - ELITE.hp) > 0.01) hpOk = false;
    if (!shotDone && id === 3 && t > 4 && g.horde.list.filter((e) => e.state === 0 && e.elite && g.squad.leader.z - e.z < 26).length >= 4) { shotDone = true; await shot('elite-horde-w1'); }
  }
  const r = w.done();
  const nE = Object.values(r.elites).reduce((a, b) => a + b, 0), nA = Object.values(r.types).reduce((a, b) => a + b, 0);
  const baseFrac = Math.max(...base.events.filter((e) => e.type === 'horde').map((e) => e.elite || 0));
  eliteRuns[id] = { elites: nE, all: nA, frac: Math.round((nE / nA) * 1000) / 1000, baseFrac, stats: (g.run && g.run.stats.elites) || 0, win: !!(g.lastResult && g.lastResult.win) };
  ok(nE / nA >= M.elite * 0.8 && nE / nA <= want + 0.05, `L${id}: elite share ${nE}/${nA} (def ${want})`);
  ok(hpOk, `L${id}: elite hp is not x${ELITE.hp}`);
  ok(eliteRuns[id].stats > 0, `L${id}: elite kills not counted`);
}
info.elite = eliteRuns;

window.removeEventListener('error', onErr);
ok(errs.length === 0, `errors: ${errs.join(' | ')}`);
d.toTitle();
g.save.reset();
return { pass: fails.length === 0, fails, info };
