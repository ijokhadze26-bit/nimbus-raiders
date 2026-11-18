// Stage 5 game modes (STAGE5.md A): MODES screen, ENDLESS per world, BOSS RUSH, DAILY CHALLENGE + local
// leaderboard, CHAOS MODE, the run twists (local stub of data/modifiers.js), mode payouts / bests, the loadout and
// result screens of the modes, High and Low quality, and a quick autopilot spot check (casual, Pip + Thunderclap).
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const E = await import('/src/data/endless.js');
const W = await import('/src/data/worlds.js');
const BR = await import('/src/game/modes/bossrush.js');
const DY = await import('/src/game/modes/daily.js');
const CH = await import('/src/game/modes/chaos.js');
const TW = await import('/src/game/modes/twists.js');
const L = await import('/src/data/levels.js');
const SM = await import('/src/save/modes.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const run = (max = 40, step = 10) => { let s; for (let i = 0; i < max; i++) { s = d.simulate(step); if (s.state !== 'playing') break; } return s; };
const setSave = (fn) => g.save.update(fn);
d.setLoadout('pip', 'thunderclap');
d.setAutopilot(false);

// ---------------- 1. MODES screen + locks ----------------
g.save.reset();
ui.nav('title'); await wait(30);
ui.screens.title.onAct('modes');
ok(g.state === 'modes', 'title MODES -> ' + g.state);
await wait(30);
let cards = [...ui.screens.modes.el.querySelectorAll('.mode-card')];
ok(cards.length === 4, 'modes: 4 cards');
const lockOf = (act) => ui.screens.modes.el.querySelector(`.mode-card[data-act="${act}"]`).classList.contains('locked');
ok(!lockOf('endless') && !lockOf('daily') && lockOf('bossrush') && lockOf('chaos'), 'fresh save: endless + daily open, boss rush + chaos locked');
ok(/LEVEL 10/.test(ui.screens.modes.el.textContent) && /LEVEL 20/.test(ui.screens.modes.el.textContent), 'locked cards say what opens them');
ui.screens.modes.onAct('bossrush', ui.screens.modes.el.querySelector('[data-act="bossrush"]'));
ok(g.state === 'modes', 'locked boss rush stays on MODES');
setSave((s) => { s.unlockedLevel = 21; for (let i = 1; i <= 20; i++) s.stars[i] = 3; });
ui.nav('modes'); await wait(20);
ok(!lockOf('bossrush') && !lockOf('chaos'), 'after L20: boss rush + chaos open');

// ---------------- 2. ENDLESS per world ----------------
ok(JSON.stringify(E.endlessDef()) === JSON.stringify(E.endlessDef(1)) && !E.endlessDef(1).world, 'endless world 1 = the old def');
for (const w of [2, 3, 4, 5]) {
  const def = E.endlessDef(w), Wd = W.WORLDS[w - 1];
  ok(def.world === w && def.ai === w && Wd.themes.includes(def.theme), `endless world ${w} def`);
  const R = E.worldBosses(w);
  ok(R.length >= 2 && R.every((b) => b.type), `world ${w} boss rotation`);
  ok(E.endlessBoss(1, w).type === R[0].type && E.endlessBoss(2, w).type === R[1].type, `world ${w} arena bosses follow the rotation`);
  const gen = new E.EndlessGen(77, w), rows = gen.fill(30, 4200);
  const kinds = new Set(rows.filter((e) => e.type === 'hazard').map((e) => e.kind));
  ok(kinds.size >= 2 && [...kinds].every((k) => Wd.hazards.includes(k)), `world ${w} endless hazards ${[...kinds]}`);
  ok(rows.filter((e) => e.type === 'hazard' && e.hint).length === kinds.size, `world ${w}: one hint per kind`);
}
const sky = new E.EndlessGen(5).fill(30, 3000);
ok(!sky.some((e) => e.type === 'hazard'), 'sky endless keeps blades / gaps only');
ok(E.endlessBoss(3).type === E.ENDLESS_BOSSES[2] && !E.endlessBoss(3).skin, 'sky endless bosses unchanged');
ui.nav('endless'); await wait(20);
const ES = ui.screens.endless;
ok(ES.el.querySelectorAll('.ew-chip').length === 5 && ES.el.querySelectorAll('.ew-chip.locked').length === 2, 'endless: 5 world chips, 2 locked at L21');
ES.onAct('world', ES.el.querySelector('.ew-chip[data-id="4"]'));
ok(ES.world() !== 4, 'locked world cannot be picked');
ES.onAct('world', ES.el.querySelector('.ew-chip[data-id="3"]'));
ok(ES.world() === 3 && /FROZEN PEAKS/.test(ES.el.textContent), 'pick world 3');
ES.onAct('play');
ok(g.state === 'loadout' && /FROZEN PEAKS/.test(ui.screens.loadout.el.textContent), 'endless world PLAY -> loadout says the world');
ui.screens.loadout.onAct('start');
let s = d.state();
ok(s.mode === 'endless' && g.run.world === 'frost' && g.run.worldId === 3 && g.run.def.theme.startsWith('frost'), `endless frost run ${g.run.world} ${g.run.def.theme}`);
ok(g.run.boss.type === E.worldBosses(3)[0].type, 'frost endless first arena boss');
d.setAutopilot('casual', 1, { crates: 'never', ability: true, loadout: 'keep' });
s = run(60);
info.endlessFrost = { dist: g.lastResult?.dist, state: s.state };
ok(s.state === 'result' && g.lastAward && g.lastAward.world === 3, 'frost endless ends with a world-3 award');
ok(SM.endlessBestOf(g.save.data, 3) === g.lastResult.dist && g.save.data.modes.endlessBest[3] === g.lastResult.dist, 'frost best saved per world');
ok(g.save.data.endlessBest === 0, 'sky best untouched by a frost run');
d.setAutopilot(false);
g.retry();
ok(g.run.mode === 'endless' && g.run.worldId === 3, 'RETRY keeps the endless world');
g.startEndless(4242, 1);
ok(g.run.worldId === 1 && !g.run.def.world, 'endless world 1 run');
g.onSquadEmpty('test');
ok(g.save.data.endlessBest >= 0 && g.lastAward.world === 1, 'sky endless award');

// ---------------- 3. BOSS RUSH ----------------
d.toTitle();
g.save.update((x) => { x.coins = 0; });
const cfgs = Array.from({ length: BR.RUSH_COUNT }, (_, i) => BR.rushBoss(i));
ok(cfgs.length === 10 && cfgs.map((c) => c.levelId).join() === '5,10,15,20,25,30,35,40,45,50', 'rush order L5..L50');
ok(cfgs.every((c, i) => c.type === L.getLevel(c.levelId).boss.type && c.skin === L.getLevel(c.levelId).boss.skin), 'rush uses the campaign boss configs');
ok(cfgs[9].type === 'tempestking' && cfgs[5].type === 'glacius' && cfgs[6].type === 'gumdrop', 'rush bosses');
const ctxA = { startSquad: 100, startMk: 1, damageMul: 1, rateMul: 1 }, ctxB = { ...ctxA, damageMul: 2, rateMul: 1.5 };
ok(BR.rushBoss(3, ctxB).hp >= BR.rushBoss(3, ctxA).hp * 2.9, 'rush hp scales with firepower');
g.startMode('bossrush');
s = d.state();
ok(s.mode === 'bossrush' && g.run.boss.type === 'oculon' && g.modes.rush.index === 0, 'boss rush starts on Oculon');
ok(g.squad.count === g.modes.rush.startSquad && g.modes.rush.startSquad >= BR.BOSS_RUSH.squad, `rush squad ${g.squad.count}`);
const hud = ui.root.querySelector('.mode-chip');
ok(hud && /1\/10/.test(hud.textContent) && /BOSS RUSH/.test(ui.hud.levelEl.textContent), 'HUD: BOSS RUSH + 1/10');
for (let i = 0; i < 10; i++) {
  const before = g.squad.count, mk = g.weapons.mk;
  let k = 0; while (g.run.phase !== 'boss' && k++ < 60) d.simulate(0.5);
  ok(g.run.phase === 'boss' && g.boss && g.boss.type === cfgs[i].type, `fight ${i + 1}: ${g.boss && g.boss.type}`);
  d.simulate(1.5); d.killBoss(); k = 0;
  while (g.state === 'playing' && g.run.phase === 'boss' && k++ < 40) d.simulate(0.5);
  if (i < 9) {
    ok(g.modes.rush.index === i + 1 && g.run.phase === 'run' && g.squad.count > before - 1, `after fight ${i + 1}: next ${g.modes.rush.index}, squad ${before} -> ${g.squad.count}`);
    if ((i + 1) % 2 === 0 && mk < 5) ok(g.weapons.mk === mk + 1, `Mk up after fight ${i + 1}`);
  }
}
for (let j = 0; g.state === 'playing' && j < 20; j++) d.simulate(0.5);
const RA = g.lastAward || {};
ok(g.lastResult.win && RA.mode === 'bossrush' && RA.beaten === 10 && RA.newBest, `rush win ${JSON.stringify(RA)}`);
ok(g.save.data.modes.bossRushBest === Math.round(RA.time * 1000) && RA.time > 5, 'best rush time saved (ms)');
ok(RA.coins === Math.round(BR.rushCoins(10) + 45) && g.save.data.coins === RA.coins, `rush pay ${RA.coins}`);
info.rushTime = RA.time;
await wait(50);
ok(/RUSH COMPLETE/.test(ui.screens.result.el.textContent) && /10\/10/.test(ui.screens.result.el.textContent), 'rush result screen');
ui.screens.result.onAct('retry');
ok(g.run.mode === 'bossrush' && g.modes.rush.index === 0 && g.run.boss.type === 'oculon', 'RETRY restarts the rush');
for (let j = 0; g.run.phase !== 'boss' && j < 40; j++) d.simulate(0.5);
d.simulate(1.5); d.killBoss();
for (let j = 0; g.modes.rush.index === 0 && j < 40; j++) d.simulate(0.5);
g.onSquadEmpty('test');
ok(g.lastAward && g.lastAward.beaten === 1 && !g.lastAward.newBest && g.lastAward.coins === BR.BOSS_RUSH.coins(1), `rush loss ${JSON.stringify(g.lastAward)}`);

// ---------------- 4. DAILY CHALLENGE ----------------
setSave((x) => { x.unlockedLevel = 50; x.modes.dailyBest = {}; });
const p1 = DY.dailyPlan(g.save.data, '2026-11-17'), p2 = DY.dailyPlan(g.save.data, '2026-11-17');
ok(JSON.stringify(p1) === JSON.stringify(p2), 'daily plan is fixed for a date');
const plans = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((x) => DY.dailyPlan(g.save.data, x));
ok(new Set(plans.map((x) => x.levelId + x.twist)).size >= 4, 'daily changes day to day');
ok(plans.every((x) => ['normal', 'intro'].includes(W.levelKind(x.levelId)) && DY.DAILY.twists.includes(x.twist)), 'daily = a normal level + a twist');
const low = DY.dailyPlan({ unlockedLevel: 4, stars: {} }, '2026-11-17');
ok(low.levelId <= 4 && low.world === 1, `daily on a fresh-ish save picks an open level (${low.levelId})`);
g.startMode('daily', { date: '2026-11-17' });
ok(g.run.mode === 'daily' && g.run.levelId === p1.levelId && g.modes.twists[0] === p1.twist && g.run.def.daily === '2026-11-17', 'daily run');
ok(L.getLevel(p1.levelId).name && g.run.def !== L.getLevel(p1.levelId), 'daily def is a copy');
g.squad.reset(120, 0); g.win();
const DA = g.lastAward;
ok(DA.mode === 'daily' && DA.score === 120 * DA.stars && DA.first && DA.bonus === DY.DAILY.bonus, `daily award ${JSON.stringify(DA)}`);
ok(g.save.data.modes.dailyBest['2026-11-17'] === DA.score, 'daily score saved for the day');
g.retry(); g.squad.reset(60, 0); g.win();
ok(!g.lastAward.first && g.lastAward.bonus === 0 && g.save.data.modes.dailyBest['2026-11-17'] === DA.score, 'second clear: no bonus, best kept');
setSave((x) => { for (let i = 1; i <= 14; i++) x.modes.dailyBest[`2026-10-${String(i).padStart(2, '0')}`] = i * 37; });
const board = DY.dailyBoard(g.save.data);
ok(board.length === 10 && board.every((r, i) => i === 0 || r.score <= board[i - 1].score), 'leaderboard = top 10 sorted');
ui.nav('modes'); await wait(20);
ok(ui.screens.modes.el.querySelectorAll('.lb li').length === 10, 'modes page shows the top 10');

// ---------------- 5. CHAOS ----------------
const r1 = CH.rollChaos(g.save.data, 11), r2 = CH.rollChaos(g.save.data, 11), r3 = CH.rollChaos(g.save.data, 12);
ok(JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(r1) !== JSON.stringify(r3), 'chaos roll seeded');
for (let i = 0; i < 30; i++) {
  const r = CH.rollChaos({ unlockedLevel: 23, stars: {} }, 1000 + i);
  ok(r.twists.length >= 2 && r.twists.length <= 3 && new Set(r.twists).size === r.twists.length && r.twists.every((t) => CH.CHAOS.pool.includes(t)), `chaos twists ${r.twists}`);
  ok(r.levelId <= 23 && !['boss', 'mini'].includes(W.levelKind(r.levelId)), `chaos level ${r.levelId}`);
}
const roll = { seed: 5, levelId: 12, twists: ['doubleSpeed', 'mirror', 'fog'] };
ui.nav('loadout', { mode: 'chaos', roll }); await wait(20);
ok(/CHAOS/.test(ui.screens.loadout.el.textContent) && /x2 SPEED/.test(ui.screens.loadout.el.textContent) && /MIRROR/.test(ui.screens.loadout.el.textContent), 'loadout shows the chaos roll');
ui.screens.loadout.onAct('start');
ok(g.run.mode === 'chaos' && g.run.levelId === 12 && Math.abs(g.run.speed - L.getLevel(12).speed * 2) < 0.02, `chaos x2 speed ${g.run.speed}`);
ok(g.modes.steer(2) === -2 && g.modes.fx.fogMul < 1, 'mirror + fog active');
d.simulate(1);
ok(g.hazards.mods.fogMul <= 0.41, 'fog pulls the view in');
g.squad.reset(80, 0); g.win();
const CA = g.lastAward;
ok(CA.mode === 'chaos' && CA.score === 80 * CA.stars && CA.chaosMul === 1.75 && g.save.data.modes.chaosBest === CA.score, `chaos award ${JSON.stringify(CA)}`);
g.retry();
ok(g.run.mode === 'chaos' && JSON.stringify(g.modes.twists) !== JSON.stringify(roll.twists) || g.run.levelId !== 12, 'chaos RETRY rolls again');
d.startLevel(3);
ok(g.modes.steer(2) === 2 && g.modes.fx.fogMul === 1 && !g.modes.kind, 'a campaign run drops every twist');

// ---------------- 6. twists ----------------
const base = L.getLevel(9), snap = JSON.stringify(base);
for (const id of TW.TWIST_IDS) {
  const def = TW.applyDef([id], base);
  ok(JSON.stringify(base) === snap, `${id}: campaign def untouched`);
  if (id === 'onlyRed') ok(def.events.filter((e) => e.type === 'gate').every((e) => (e.op === 'add' ? e.value < 0 : e.op === 'div')), 'onlyRed: every gate starts red');
  if (id === 'noGuns') ok(!def.events.some((e) => e.type === 'crate' || (e.type === 'barrel' && e.reward.kind === 'weapon')), 'noGuns');
  if (id === 'giantEnemies') ok(def.events.filter((e) => e.type === 'horde').every((e, i) => e.hpMul > (base.events.filter((x) => x.type === 'horde')[i].hpMul || 1)), 'giant hordes are tougher');
  if (id === 'eliteHorde') ok(def.events.filter((e) => e.type === 'horde').every((e) => e.elite >= 0.33), 'elite horde');
}
ok(TW.twistsText(['doubleSpeed', 'tinySquad']) === 'x2 SPEED + TINY SQUAD', 'twist text');
info.sharedModifiers = TW.TWIST_IDS.filter((id) => TW.usesShared(id));
g.startMode('chaos', { roll: { seed: 1, levelId: 4, twists: ['giantEnemies', 'tinySquad'] } });
ok(g.squad.count === 1, 'tiny squad starts alone');
d.simulate(12);
ok(g.horde.list.length === 0 || g.horde.list.some((e) => e.giant && e.size >= 1.5), 'giant enemies drawn big');
g.startMode('chaos', { roll: { seed: 1, levelId: 4, twists: ['halfSquad'] } });
ok(['noUpgrades', 'halfSquad', 'oneLife', 'fog', 'doubleSpeed', 'tinySquad', 'onlyRed', 'giantEnemies', 'noGuns', 'mirror'].every((id) => TW.TWISTS[id] && TW.TWISTS[id].label), 'stub maps all 10 shared modifier ids');
setSave((x) => { x.upgrades.tier = 2; });
g.startMode('chaos', { roll: { seed: 1, levelId: 4, twists: ['oneLife', 'noUpgrades'] } });
ok(g.weapons.mk === 1 && g.heroes.guard === 0 && !g.run.def.events.some((e) => e.type === 'powerup' && e.kind === 'shield'), `noUpgrades + oneLife set up (mk ${g.weapons.mk})`);
g.squad.reset(40, 0); d.simulate(0.2);
ok(g.state === 'playing', 'one life: a full squad plays on');
g.squad.reset(15, 0); d.simulate(0.2);
ok(g.lastResult && !g.lastResult.win, 'one life: below half the peak ends the run');
setSave((x) => { x.upgrades.tier = 0; });

// ---------------- 7. High + Low, autopilot spot check ----------------
for (const q of ['low', 'high']) {
  g.applyQuality(q);
  g.startMode('daily'); d.simulate(4);
  g.startMode('chaos'); d.simulate(4);
  g.startMode('bossrush'); d.simulate(6);
  g.startEndless(9, 5); d.simulate(6);
}
info.spot = {};
setSave((x) => { x.unlockedLevel = 21; });
d.setAutopilot('casual', 1, { crates: 'favoured', ability: true, loadout: 'keep' });
for (const [k, o] of [['daily', { date: '2026-11-17' }], ['chaos', { roll: CH.rollChaos(g.save.data, 3) }]]) {
  g.startMode(k, o); const st = run(30);
  info.spot[k] = { level: g.run.levelId, twists: g.modes.twists, win: !!g.lastResult?.win, squad: g.lastResult?.squad, state: st.state };
  ok(st.state === 'result', `${k} autopilot run finishes`);
}
d.setAutopilot(false);
await wait(50);
ok(ui.screens.result.el.querySelector('.mode-res'), 'mode result panel');
ui.screens.result.onAct('modes');
ok(g.state === 'modes', 'result MODES button');
g.save.reset();
d.toTitle();
g.loop.start();
return { pass: fails.length === 0, fails, info };
