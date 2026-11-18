// Stage 5 integration: modes x modifiers x squad types x achievements x settings x stage 4 controls.
// 1. Modes twists ARE the shared modifiers (data/modifiers.js via game/runmods.js): mirror / fog / tiny squad in a
//    Chaos run, nothing carried into Boss Rush or a campaign run; the loadout modifiers never reach mode runs.
// 2. Squad types in modes: owned types still mix in under TINY SQUAD (cap 20) and in Boss Rush.
// 3. Achievements see the stage 4 events (combo, cages, bell, dam, crane, boulder, dodge) and the modes
//    (Chaos win, Daily clears, Boss Rush bosses, Endless in every world).
// 4. abilitySide LEFT moves the stage 4 formation + dodge buttons with the ability button.
// 5. Save: achievements / modes / squad fields survive a sanitize round trip and drop junk.
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { sanitize } = await import('/src/save/save.js');
const { buySquadType } = await import('/src/save/progress.js');
d.setLoadout('pip', 'thunderclap');
d.setAutopilot(false);
g.save.reset();
g.save.update((x) => { x.coins = 50000; x.unlockedLevel = 30; for (let i = 1; i < 30; i++) x.stars[i] = 2; x.modifiers = ['fog', 'halfSquad']; });

// ---------------- 1. twists = shared modifiers ----------------
g.startMode('chaos', { roll: { seed: 3, levelId: 12, twists: ['mirror', 'fog', 'tinySquad'] } });
ok(g.run.mode === 'chaos' && JSON.stringify(g.run.mods.ids) === '["mirror","fog","tinySquad"]', `chaos run.mods ${JSON.stringify(g.run.mods.ids)}`);
ok(g.runMods.steer(3) === -3 && g.squad.capMax === 20 && g.squad.count <= 20, 'mirror + tiny squad through runmods');
ok(g.run.mods.bonus === 0, 'twists carry no modifier coin bonus (chaos pays its own)');
d.simulate(1);
ok(g.hazards.mods.fogMul <= 0.41, `fog ${g.hazards.mods.fogMul}`);
g.squad.add(100, 'gate');
ok(g.squad.count === 20, `tiny squad cap holds (${g.squad.count})`);
g.startMode('bossrush');
ok(g.run.mode === 'bossrush' && !g.run.mods.ids.length && g.squad.capMax > 20 && g.runMods.steer(3) === 3, 'boss rush: no modifiers, loadout ones ignored');
g.startMode('daily', { date: '2026-11-19' });
ok(g.run.mods.ids.every((id) => id === g.modes.twists[0]) && !g.run.mods.ids.includes('halfSquad') || g.modes.twists[0] === 'halfSquad', `daily: only its twist ${JSON.stringify(g.run.mods.ids)} / ${g.modes.twists}`);
g.startLevel(4, { mods: ['fog'] });
ok(g.run.mods.ids.length === 1 && g.run.mods.bonus > 0 && !g.modes.kind, 'campaign run: its own modifiers, no mode');

// ---------------- 2. squad types in modes ----------------
ok(buySquadType(g.save, 'shield') && buySquadType(g.save, 'medic'), 'types bought');
g.save.update((x) => { x.squadTypes.mix.shield = 20; x.squadTypes.mix.medic = 20; });
g.startMode('chaos', { roll: { seed: 3, levelId: 12, twists: ['tinySquad', 'doubleSpeed'] } });
g.squad.add(30, 'gate');
info.tinyTypes = g.squad.members.filter((m) => m.type).length;
ok(g.squad.count === 20 && info.tinyTypes > 0, `types mix in under TINY SQUAD (${info.tinyTypes})`);
g.startMode('bossrush');
info.rushTypes = g.squad.members.filter((m) => m.type).length;
ok(info.rushTypes > 0, `types mix into Boss Rush (${info.rushTypes})`);
d.simulate(2);
ok(g.state === 'playing', 'boss rush with types plays');

// ---------------- 3. achievements: stage 4 + modes events ----------------
const A = g.achievements;
const ids = A.list().map((x) => x.def ? x.def.id : x.id);
for (const id of ['combo-100', 'combo-250', 'dodge-25', 'rescue-100', 'prop-bell', 'prop-dam', 'prop-crane', 'prop-boulder', 'bossrush', 'bossrush-5', 'chaos-win', 'daily-clear', 'daily-5', 'endless-worlds']) ok(ids.includes(id), `goal ${id} visible`);
info.visible = ids.length;
g.startLevel(3);
const ev = g.events;
for (const k of ['bell', 'dam', 'crane', 'boulder']) ev.emit('prop:trigger', { kind: k, x: 0, z: -40 });
ev.emit('cage:join', { count: 100, pos: { x: 0, y: 1, z: -40 } });
for (let i = 0; i < 25; i++) ev.emit('dodge:skip', { reason: 'horde', pos: { x: 0, y: 0, z: 0 } });
g.run.stats.maxCombo = 260; // a combo that peaked between tier steps still counts
g.time += 1; A.tick();
const done = () => g.save.data.achievements.done;
for (const id of ['prop-bell', 'prop-dam', 'prop-crane', 'prop-boulder', 'rescue-100', 'dodge-25', 'combo-100', 'combo-250']) ok(done().includes(id), `${id} done`);
g.startMode('chaos', { roll: { seed: 3, levelId: 4, twists: ['fog', 'noGuns'] } });
g.squad.reset(40, 0); g.win();
await wait(20);
ok(done().includes('chaos-win'), 'chaos win counts');
g.startMode('bossrush');
g.modes.rush.beaten = 5; g.modes.rush.index = 4; g.onSquadEmpty('horde');
d.simulate(0.5); await wait(20);
ok(done().includes('bossrush-5'), `5 boss rush bosses count (${A.count('rushBosses')})`);
g.save.update((x) => { x.endlessBest = 600; for (const w of [2, 3, 4, 5]) x.modes.endlessBest[w] = 520 + w; });
await wait(20); A.check();
ok(done().includes('endless-worlds'), 'endless in all worlds');

// ---------------- 4. left hand moves the stage 4 buttons ----------------
g.startLevel(3); d.simulate(0.2);
ui.update(1 / 60); ui.hud.update(1 / 60);
const W = window.innerWidth;
const rect = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
g.save.setSetting('abilitySide', 'left'); await wait(30); ui.hud.update(1 / 60);
const fL = rect('.form-btn'), dL = rect('.dodge-btn');
ok(g.hud.el.classList.contains('side-left') && fL && dL && fL.right < W / 2 && dL.right < W / 2, `left: formation ${fL && fL.left} dodge ${dL && dL.left}`);
g.save.setSetting('abilitySide', 'right'); await wait(30); ui.hud.update(1 / 60);
const fR = rect('.form-btn'), dR = rect('.dodge-btn');
ok(fR && dR && fR.left > W / 2 && dR.left > W / 2, `right: formation ${fR && fR.left} dodge ${dR && dR.left}`);
info.hand = { fL: fL && Math.round(fL.left), dL: dL && Math.round(dL.left), fR: fR && Math.round(fR.left), dR: dR && Math.round(dR.left), W };

// ---------------- 5. save round trip ----------------
const back = sanitize(JSON.parse(JSON.stringify(g.save.data)));
ok(JSON.stringify(back.achievements) === JSON.stringify(g.save.data.achievements), 'achievements survive');
ok(JSON.stringify(back.modes) === JSON.stringify(g.save.data.modes), 'modes survive');
ok(JSON.stringify(back.squadTypes) === JSON.stringify(g.save.data.squadTypes), 'squad types survive');
const junk = sanitize({ modes: { bossRushBest: -5, chaosBest: 'x', dailyBest: { '2026-11-19': 99, bad: 3 }, endlessBest: { 9: 100, 2: -1, 3: 77 } }, achievements: { done: ['ok-id', 5, '<b>'], counts: { 'prop-bell': 2, 'x y': 1, gates: -4 } }, squadTypes: { owned: ['gunner', 'nope'], mix: { gunner: 50 } } });
ok(junk.modes.bossRushBest === 0 && junk.modes.chaosBest === 0 && JSON.stringify(junk.modes.dailyBest) === '{"2026-11-19":99}' && JSON.stringify(junk.modes.endlessBest) === '{"3":77}', `modes junk ${JSON.stringify(junk.modes)}`);
ok(JSON.stringify(junk.achievements.done) === '["ok-id"]' && JSON.stringify(junk.achievements.counts) === '{"prop-bell":2}', `achievements junk ${JSON.stringify(junk.achievements)}`);
ok(JSON.stringify(junk.squadTypes) === '{"owned":["gunner"],"mix":{"gunner":20}}', `squad junk ${JSON.stringify(junk.squadTypes)}`);

g.save.reset();
g.toTitle();
return { pass: fails.length === 0, fails, info };
