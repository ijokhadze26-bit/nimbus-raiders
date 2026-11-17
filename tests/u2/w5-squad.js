// Update 3 stage 5, part B "squad" (STAGE5.md §B): run modifiers + squad member types.
// 1. data/modifiers.js: all 10 ids (4 player modifiers with coin bonuses, 6 twists for the modes), applyMods() edits
//    copies only (the campaign def is untouched), each modifier does what it says in a real run, RETRY keeps them
//    without applying twice, payouts x(1 + bonus), save.modifiers is sanitized + remembered.
// 2. Squad types: shop purchase / mix, deterministic mixing (none owned = plain Raiders, no extra rng), Shield Bearer
//    blocks one enemy hit, Medic revives under the peak, Heavy Gunner damage bonus (capped), Low quality path.
// 3. UI: loadout MODIFIERS grid (campaign only) -> START runs them; shop SQUAD tab; result shows the modifiers.
// 4. Quick autopilot spot check (pro + casual, Pip + Thunderclap) with modifiers / squad types on.
// Under the screenshot harness (window.__shot) it also saves: loadout-mods, shop-squad, squad-mix-high,
// squad-mix-low, result-mods.
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const M = await import('/src/data/modifiers.js');
const ST = await import('/src/data/squadtypes.js');
const L = await import('/src/data/levels.js');
const { sanitize } = await import('/src/save/save.js');
const { awardWin, awardLose, buySquadType, setSquadMix } = await import('/src/save/progress.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const settle = (s) => { for (const a of ui.screens[s].el.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); };
const shot = async (name, render = true) => { if (!window.__shot) return; if (render) { g.sync(1 / 60); g.engine.render(); } await window.__shot(name); };
const runTo = (sec = 20, max = 20) => { let s, k = 0; do { s = d.simulate(sec); k++; } while (s.state === 'playing' && k < max); return s; };
g.save.reset();
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');

// ---------------- 1. modifiers data ----------------
const IDS = ['noUpgrades', 'halfSquad', 'oneLife', 'fog', 'doubleSpeed', 'tinySquad', 'onlyRed', 'giantEnemies', 'noGuns', 'mirror'];
ok(IDS.every((id) => M.MOD_BY_ID[id] && typeof M.MOD_BY_ID[id].apply === 'function'), 'all 10 modifier ids with apply()');
ok(JSON.stringify(M.PLAYER_MOD_IDS) === JSON.stringify(['noUpgrades', 'halfSquad', 'oneLife', 'fog']), `player mods ${M.PLAYER_MOD_IDS}`);
ok(M.modsBonus(['noUpgrades']) === 0.3 && M.modsBonus(['halfSquad']) === 0.25 && M.modsBonus(['oneLife']) === 0.4 && M.modsBonus(['fog']) === 0.2, 'bonuses 30/25/40/20');
ok(M.modsBonus(['noUpgrades', 'fog', 'oneLife', 'halfSquad']) === 1.15 && M.modsBonus(['fog', 'doubleSpeed', 'bogus']) === 0.2, 'bonuses add up; twists / unknown add nothing');
ok(JSON.stringify(M.cleanIds(['fog', 'fog', 'x', 'mirror'])) === '["fog","mirror"]', 'cleanIds');

// ---------------- each modifier in a run ----------------
const snapshot = (id) => JSON.stringify(L.getLevel(id));
const before = { 3: snapshot(3), 10: snapshot(10), 12: snapshot(12) };
const startWith = (id, mods) => { ok(g.startLevel(id, { mods }), `startLevel(${id}, ${mods})`); return g.run; };
const evs = (type) => g.run.eventsOf(type);
d.setUpgrades({ squad: 9, damage: 5, rate: 4, tier: 2 });

let r = startWith(3, []);
const base = { squad: g.squad.count, dmg: g.weapons.dmgMul, mk: g.weapons.mk, speed: r.speed, gates: evs('gate').map((e) => ({ ...e })) };
ok(base.squad === 10 && Math.abs(base.dmg - 1.5) < 1e-9 && base.mk === 3, `baseline run: squad ${base.squad} dmg ${base.dmg} mk ${base.mk}`);
ok(r.mods && r.mods.ids.length === 0 && r.mods.bonus === 0, 'no modifiers: neutral run.mods');

r = startWith(3, ['noUpgrades']);
ok(g.squad.count === 1 && g.weapons.dmgMul === 1 && g.weapons.mk === 1 && g.weapons.rateMul === 1, `NO UPGRADES: squad ${g.squad.count} dmg ${g.weapons.dmgMul} mk ${g.weapons.mk}`);

r = startWith(3, ['halfSquad']);
ok(g.squad.count === 5, `HALF SQUAD start ${g.squad.count} (10 -> 5)`);
const hg = evs('gate');
ok(hg.length === base.gates.length && hg.every((e, i) => { const b = base.gates[i]; return b.op !== 'add' || b.value <= 0 ? e.value === b.value : e.value === Math.max(1, Math.ceil(b.value / 2)); }), 'HALF SQUAD: + gates give half');

r = startWith(3, ['onlyRed']);
const rg = evs('gate');
ok(rg.length > 0 && rg.every((e) => (e.op === 'add' ? e.value <= 0 : e.rung !== undefined ? e.rung <= 2 : e.op === 'div')), `ONLY RED: every gate starts bad ${JSON.stringify(rg.slice(0, 4).map((e) => [e.op, e.value, e.rung]))}`);
d.simulate(0.2);

r = startWith(3, ['doubleSpeed']);
ok(r.speed === base.speed * 2, `x2 SPEED ${r.speed} vs ${base.speed}`);

r = startWith(3, ['tinySquad']);
g.squad.setCount(100, 'gate');
ok(g.squad.count === M.TINY_CAP && r.starsFor(18) === 3 && r.starsFor(10) === 2 && r.starsFor(9) === 1, `TINY SQUAD cap ${g.squad.count}, stars 10/18`);

r = startWith(12, ['noGuns']);
ok(!evs('barrel').some((e) => e.reward && e.reward.kind === 'weapon') && L.getLevel(12).events.some((e) => e.type === 'barrel' && e.reward?.kind === 'weapon'), 'NO GUN BARRELS: weapon barrels become coins');

r = startWith(12, ['giantEnemies']);
const lvlHorde = L.getLevel(12).events.filter((e) => e.type === 'horde');
ok(evs('horde').every((e, i) => Math.abs(e.hpMul - (lvlHorde[i].hpMul ?? L.getLevel(12).enemyHp ?? 1) * 1.6) < 0.011), 'GIANT: horde hp x1.6');
for (let k = 0; k < 30 && !g.horde.list.some((e) => e.state === 0); k++) d.simulate(1);
const big = g.horde.list.filter((e) => e.state === 0);
ok(big.length > 0 && big.every((e) => e.size >= 1.4), `GIANT: bigger Murklings (${big.length} alive, sizes ${[...new Set(big.map((e) => e.size))].slice(0, 3)})`);

r = startWith(3, ['fog']);
d.simulate(0.5);
ok(Math.abs(g.hazards.mods.fogMul - 0.4) < 1e-6, `FOG fogMul ${g.hazards.mods.fogMul}`);
d.simulate(1); for (let k = 0; k < 6; k++) g.sync(0.5);
ok(g.scene.fog.far < 0.5 * g.world.theme.fog.far, `FOG pulls the fog in: far ${Math.round(g.scene.fog.far)} of ${g.world.theme.fog.far}`);

r = startWith(3, ['mirror']);
g.input.targetX = 3; d.simulate(0.6);
const mx = g.squad.leader.x;
ok(mx < -1.5, `MIRROR: steering right moves left (x ${mx.toFixed(2)})`);
d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
startWith(3, ['mirror']);
ok(g.runMods.steer(2) === -2 && g.autopilot.enabled, 'mirror flips only the player target');
d.setAutopilot(false);

r = startWith(3, ['oneLife']);
ok(g.heroes.guardMax === 0 && !evs('powerup').some((e) => e.kind === 'shield'), 'ONE LIFE: no Guard, no shield power-ups');
g.squad.setCount(20, 'gate'); d.simulate(0.1);
g.squad.setCount(11, 'horde'); d.simulate(0.1);
ok(g.squad.count === 11 && g.run.active, 'ONE LIFE: at half the peak the run goes on');
g.squad.setCount(9, 'horde'); d.simulate(0.1);
ok(g.squad.count === 0 && !g.run.active && g.run.failReason === 'oneLife', `ONE LIFE: under half the peak the run ends (${g.squad.count}, ${g.run.phase})`);
d.simulate(2);
ok(g.lastAward && g.lastAward.failReason === 'oneLife' && g.lastAward.mods.includes('oneLife'), 'ONE LIFE loss reported');

// RETRY keeps them, never applies twice; the campaign defs are untouched
r = startWith(3, ['halfSquad', 'onlyRed', 'giantEnemies']);
const once = JSON.stringify(evs('gate'));
g.retry();
ok(JSON.stringify(g.run.mods.ids) === '["halfSquad","onlyRed","giantEnemies"]' && JSON.stringify(evs('gate')) === once, 'RETRY keeps the modifiers (applied once)');
for (const id of [3, 10, 12]) ok(snapshot(id) === before[id], `L${id} campaign def untouched`);
g.startPractice({}); ok(g.run.mods.ids.length === 0, 'practice never has modifiers');
g.startEndless(5); ok(g.run.mods.ids.length === 0 && g.squad.capMax === 999, 'endless without modifiers');
d.toTitle();
ok(g.squad.capMax === 999, 'menus: squad cap restored');

// payouts
const fakeRun = { mods: { bonus: 0.7, ids: ['noUpgrades', 'fog', 'oneLife'] } };
g.save.update((x) => { x.upgrades.coins = 0; x.coins = 0; });
const aw = awardWin(g.save, { mode: 'level', levelId: 1, stars: 2, coins: 100 }, fakeRun);
ok(aw.coins === 170 && aw.modMul === 1.7 && aw.mods.length === 3, `win payout x1.7: ${aw.coins}`);
const al = awardLose(g.save, { mode: 'level', levelId: 1, coins: 50 }, fakeRun);
ok(al.coins === 85, `loss payout x1.7: ${al.coins}`);

// save
const sv = sanitize({ modifiers: ['fog', 'oneLife', 'fog', 'mirror', 'nope', 3], squadTypes: { owned: ['shield', 'medic'], mix: { shield: 20, medic: 999 } } });
ok(JSON.stringify(sv.modifiers) === '["fog","oneLife"]', `save.modifiers sanitized ${JSON.stringify(sv.modifiers)}`);
ok(sv.squadTypes.owned.length === 2 && sv.squadTypes.mix.shield === 20 && sv.squadTypes.mix.medic === 100, 'squadTypes sanitized');
ok(JSON.stringify(sanitize({ version: 2, coins: 5 }).modifiers) === '[]', 'old save: no modifiers');

// ---------------- 2. squad types ----------------
g.save.reset();
d.setUpgrades({ squad: 9 });
startWith(3, []);
g.squad.setCount(120, 'gate');
ok(g.squad.members.every((m) => !m.type) && !g.squadTypes.on, 'no types owned: plain Raiders');
g.save.update((x) => { x.coins = 4000; });
ok(!buySquadType(g.save, 'bogus') && buySquadType(g.save, 'shield') && !buySquadType(g.save, 'shield'), 'buy shield once');
ok(buySquadType(g.save, 'medic') && buySquadType(g.save, 'gunner') === false && g.save.data.coins === 0, `prices 1500 / 2500, gunner unaffordable (${g.save.data.coins})`);
g.save.update((x) => { x.coins += 5000; });
ok(buySquadType(g.save, 'gunner') && g.save.data.squadTypes.mix.gunner === 10, 'gunner bought, joins at FEW');
ok(setSquadMix(g.save, 'shield', 'many') && g.save.data.squadTypes.mix.shield === 20 && !setSquadMix(g.save, 'shield', 'lots'), 'mix MANY');
startWith(3, []);
g.squad.setCount(101, 'gate');
let st = g.squadTypes.state();
const near = (a, b) => Math.abs(a - b) <= 1;
ok(st.on && near(st.counts.shield, 20) && near(st.counts.medic, 10) && near(st.counts.gunner, 10), `mix 20/10/10 of 100: ${JSON.stringify(st.counts)}`);
d.simulate(0.3);
ok(Math.abs(g.weapons.dmgMul - 1 * 1.15) < 1e-9, `HEAVY GUNNER: 10 gunners -> +15% cap (dmgMul ${g.weapons.dmgMul})`);
// shield blocks an enemy hit
g.heroes.guard = 0; g.heroes.guardMax = 0; // Pip's Guard would take the hit first
const shields0 = g.squadTypes.state().counts.shield, c0 = g.squad.count;
g.squad.killMember(5, 'horde');
ok(g.squad.count === c0 && g.squadTypes.state().counts.shield === shields0 - 1 && g.squadTypes.stats.blocked === 1, 'SHIELD BEARER blocks one enemy hit, loses the shield');
g.squad.killMember(5, 'blade');
ok(g.squad.count === c0 - 1, 'a blade is not an enemy hit');
g.squad.remove(3, 'boss');
ok(g.squad.count === c0 - 1 && g.squadTypes.state().counts.shield === shields0 - 4, 'boss hits use up 3 more shields');
// medic
g.squad.setCount(60, 'horde');
const c1 = g.squad.count;
d.simulate(6.4);
ok(g.squad.count >= c1 + 3 && g.squadTypes.stats.revived >= 3, `MEDIC revives under the peak (${c1} -> ${g.squad.count})`);
// low quality
g.applyQuality('low');
d.simulate(0.5); g.sync(1 / 60); g.engine.render();
ok(g.squad.typeMeshes[1].mesh.geometry === g.squad.typeMeshes[1].geo.low && g.squad.typeMeshes[3].mesh.visible, 'Low: accessory geometry swapped, still drawn');
ok(g.squad.typeMeshes.slice(1).every((T) => !T.mesh.castShadow), 'no shadow casters');
g.applyQuality('high');
g.startPractice({}); g.squad.setCount(40, 'gate');
ok(!g.squadTypes.on && g.squad.members.every((m) => !m.type), 'practice: no squad types');
d.toTitle();

// ---------------- 3. UI ----------------
g.save.update((x) => { x.unlockedLevel = 6; x.stars = { 1: 3, 2: 2, 3: 3, 4: 2, 5: 1 }; x.modifiers = []; });
ui.nav('loadout', { levelId: 4 }); await wait(800); settle('loadout');
const LO = ui.screens.loadout, cards = () => LO.el.querySelectorAll('.mod-card');
ok(cards().length === 4 && !LO.el.querySelector('.lo-mods').hidden, 'loadout: 4 modifier cards');
LO.onAct('mod', { dataset: { id: 'noUpgrades' } }); LO.onAct('mod', { dataset: { id: 'fog' } });
ok(JSON.stringify(g.save.data.modifiers) === '["noUpgrades","fog"]' && JSON.stringify(LO.modsState()) === '["noUpgrades","fog"]', 'toggles remembered in the save');
ok(/\+50% COINS/.test(LO.el.querySelector('.lo-modsum').textContent) && /\+50%/.test(LO.el.querySelector('.lo-modtag').textContent), 'bonus shown (+50%)');
ok(LO.el.querySelectorAll('.mod-card.on').length === 2, 'two cards on');
LO.onAct('mod', { dataset: { id: 'oneLife' } });
if (window.__shot) { g.loop.start && g.loop.start(); await wait(500); { const b = LO.el.querySelector('.lo-body'), sec = LO.el.querySelector('.lo-modsec'); b.scrollTop += sec.getBoundingClientRect().top - b.getBoundingClientRect().top - 2; } await wait(400); settle('loadout'); await wait(100); await shot('loadout-mods', false); g.loop.stop(); }
LO.onAct('mod', { dataset: { id: 'oneLife' } });
LO.onAct('start', {});
ok(g.run && g.run.levelId === 4 && JSON.stringify(g.run.mods.ids) === '["noUpgrades","fog"]' && g.run.mods.bonus === 0.5, 'START runs the modifiers');
d.toTitle();
ui.nav('loadout', { mode: 'endless' }); await wait(700);
ok(LO.el.querySelector('.lo-mods').hidden && LO.modsState().length === 0, 'endless loadout: no modifiers');
ui.nav('shop', { tab: 'squad' }); await wait(700); settle('shop');
const SH = ui.screens.shop.el;
ok(SH.querySelectorAll('.tab').length === 4 && SH.querySelectorAll('.sq-card').length === 3, 'shop: SQUAD tab with 3 cards');
ok(SH.querySelectorAll('.mix-seg').length === 3 && SH.querySelector('.sq-card[data-id="shield"] .mix-b.m-many.on'), 'owned types show the mix (shield MANY)');
if (window.__shot) {
  g.save.update((x) => { x.squadTypes.owned = ['shield']; x.squadTypes.mix = { shield: 10 }; x.coins = 2730; });
  ui.screens.shop.show({ tab: 'squad' }); g.loop.start && g.loop.start(); await wait(600); settle('shop'); await shot('shop-squad', false); g.loop.stop();
  g.save.update((x) => { x.squadTypes.owned = ['shield', 'medic', 'gunner']; x.squadTypes.mix = { shield: 20, medic: 20, gunner: 20 }; });
}
ui.screens.shop.onAct('mix', { dataset: { id: 'medic', mix: 'off' } });
ok(g.save.data.squadTypes.mix.medic === 0 && SH.querySelector('.sq-card[data-id="medic"] .mix-b.m-off.on'), 'mix OFF from the tab');
ui.screens.shop.onAct('mix', { dataset: { id: 'medic', mix: 'many' } });

// in-run look (screenshots)
if (window.__shot) {
  g.save.update((x) => { x.squadTypes.owned = ['shield', 'medic', 'gunner']; x.squadTypes.mix = { shield: 20, medic: 20, gunner: 20 }; x.modifiers = []; });
  for (const q of ['high', 'low']) {
    g.applyQuality(q);
    ui.nav('loadout', { levelId: 2 }); await wait(300); LO.onAct('start', {});
    g.squad.setCount(70, 'gate'); d.simulate(1.2);
    g.loop.start && g.loop.start(); await wait(700); g.loop.stop();
    await shot('squad-mix-' + q);
  }
  g.applyQuality('high');
  d.toTitle();
}

// ---------------- 4. autopilot spot check ----------------
g.save.reset();
const spot = {};
const play = (id, prof, mods, seed = 1) => {
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot(prof, seed, { crates: 'never', ability: true, loadout: 'keep' });
  g.startLevel(id, { mods });
  const s = runTo(20, 20);
  const R = s.result || g.lastResult || {};
  return R.win ? `WIN ${R.stars}* sq${R.squad}` : `LOSS sq${R.squad ?? 0}`;
};
d.setUpgrades({ squad: 4, damage: 3, rate: 3, tier: 0 });
spot['L2 pro fog+half'] = play(2, 'pro', ['fog', 'halfSquad']);
spot['L3 casual fog'] = play(3, 'casual', ['fog']);
spot['L5 pro noUpgrades'] = play(5, 'pro', ['noUpgrades']);
spot['L4 pro oneLife'] = play(4, 'pro', ['oneLife']);
spot['L3 pro x2speed+onlyRed'] = play(3, 'pro', ['doubleSpeed', 'onlyRed']);
g.save.update((x) => { x.squadTypes.owned = ['shield', 'medic', 'gunner']; x.squadTypes.mix = { shield: 10, medic: 10, gunner: 10 }; });
spot['L5 casual types'] = play(5, 'casual', []);
spot['L10 pro types'] = play(10, 'pro', []);
info.spot = spot;
ok(/WIN/.test(spot['L2 pro fog+half']) && /WIN/.test(spot['L5 casual types']), `spot check ${JSON.stringify(spot)}`);

// result screen with modifiers (screenshot)
if (window.__shot) {
  d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
  g.startLevel(1, { mods: ['noUpgrades', 'fog', 'halfSquad'] }); runTo(20, 20);
  d.setAutopilot(false); g.loop.start && g.loop.start(); await wait(3200); settle('result'); await wait(2500);
  ok(ui.screens.result.el.querySelectorAll('.rm-tag').length === 3, 'result shows 3 modifier tags');
  await shot('result-mods', false);
}
d.setAutopilot(false);
d.toTitle();
g.save.reset();
g.loop.start && g.loop.start();
return { pass: fails.length === 0, fails, info };
