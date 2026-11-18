// SPEC2 §9 ui-flow: map node -> loadout -> START runs that level with the chosen loadout; result NEXT ->
// loadout; RETRY skips it; Armory TRY IT -> practice -> BACK returns to the same item (and pause END PRACTICE);
// Heroes TRY IT uses the favourite only when unlocked (Mk III); choosing Cinder keeps a locked favourite out;
// winning L2 on a fresh save shows the Glacier Lance unlock card whose INFO opens the Armory on it; BUY
// deducts coins and unlocks; the title buttons work.
const g = window.__game, ui = g.ui, d = g.debug;
const { WEAPON_BY_ID } = await import('/src/data/weapons.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const act = (name, a, data = {}) => ui.screens[name].onAct(a, { dataset: data });
const run = (max = 12) => { let s; for (let i = 0; i < max; i++) { s = d.simulate(30); if (s.state !== 'playing') break; } return s; };
g.loop.stop();

// ---- map node -> loadout -> START ----
g.save.reset();
g.save.update((s) => { s.unlockedLevel = 3; });
ui.nav('map');
await wait(50);
act('map', 'node', { id: '2' });
check(g.state === 'loadout' && ui.current === 'loadout', 'map node -> ' + g.state);
act('loadout', 'weapon', { id: 'glacier' });
act('loadout', 'start');
let s = d.state();
check(s.state === 'playing' && s.mode === 'level' && s.levelId === 2 && s.weapon === 'glacier' && s.hero === 'pip', 'START ' + JSON.stringify([s.state, s.levelId, s.weapon, s.hero]));
ui.nav('map'); await wait(20);
act('map', 'play-current');
check(g.state === 'loadout', 'map PLAY -> ' + g.state);
// endless PLAY goes through the loadout too
ui.nav('endless'); await wait(20);
act('endless', 'play');
check(g.state === 'loadout' && ui.screens.loadout.el.textContent.includes('ENDLESS'), 'endless PLAY -> ' + g.state);
act('loadout', 'back');
check(g.state === 'endless', 'endless loadout BACK -> ' + g.state);

// ---- Cinder + the favourite rule (level 4: Emberstorm locked; level 5: unlocked) ----
for (const [lvl, want] of [[4, 'glacier'], [5, 'emberstorm']]) {
  g.save.update((x) => { x.unlockedLevel = lvl; x.arsenal.selected = 'glacier'; x.heroes.selected = 'pip'; });
  ui.nav('loadout', { levelId: 1 }); await wait(20);
  act('loadout', 'hero', { id: 'cinder' });
  check(g.save.data.heroes.selected === 'cinder' && g.save.data.arsenal.selected === want, `cinder at level ${lvl}: weapon ${g.save.data.arsenal.selected}, want ${want}`);
}
// a locked chip shows the lock line (+ BUY when affordable) and selects nothing
g.save.update((x) => { x.unlockedLevel = 1; x.coins = 600; x.arsenal.selected = 'thunderclap'; x.heroes.selected = 'pip'; });
ui.nav('loadout', { levelId: 1 }); await wait(20);
act('loadout', 'weapon', { id: 'glacier' });
const lock = ui.screens.loadout.el.querySelector('.lo-lock');
check(!lock.hidden && lock.textContent.includes('LOCKED: reach level 3 or buy for 500 coins') && lock.querySelector('[data-act="buy"]'), 'locked chip lock line / BUY');
check(g.save.data.arsenal.selected === 'thunderclap', 'locked chip selected');
act('loadout', 'buy');
check(g.save.data.coins === 100 && g.save.data.arsenal.owned.includes('glacier') && g.save.data.arsenal.selected === 'glacier', 'loadout BUY ' + g.save.data.coins);

// ---- Armory BUY ----
g.save.update((x) => { x.coins = 1000; });
ui.nav('armory', { from: 'title', weapon: 'emberstorm' }); await wait(20);
act('armory', 'buy');
check(g.save.data.coins === 1000 - WEAPON_BY_ID.emberstorm.unlock.coins && g.save.data.arsenal.owned.includes('emberstorm'), 'armory BUY ' + g.save.data.coins);
check(!!ui.screens.armory.el.querySelector('[data-act="equip"]'), 'armory: EQUIP after BUY');
g.save.update((x) => { x.coins = 10; });
act('armory', 'pick', { id: 'spectra' });
check(!!ui.screens.armory.el.querySelector('[data-act="buy"].is-disabled'), 'armory: BUY disabled when poor');

// ---- Armory TRY IT -> practice -> BACK (same item + Mk); pause END PRACTICE ----
ui.nav('armory', { from: 'title', weapon: 'gearworks' }); await wait(20);
act('armory', 'mk', { mk: '4' });
act('armory', 'try');
s = d.state();
check(s.state === 'playing' && s.mode === 'practice' && s.weapon === 'gearworks' && s.mk === 4 && s.hero === g.loadout.hero, 'armory TRY IT ' + JSON.stringify([s.mode, s.weapon, s.mk, s.hero]));
check(document.querySelector('.hud') ? document.getElementById('ui').textContent.includes('PRACTICE') : true, 'HUD PRACTICE label');
g.pause(); await wait(30);
const pause = ui.screens.pause.el;
check(!pause.querySelector('[data-act="endpractice"]').hidden && pause.querySelector('[data-act="home"]').hidden, 'pause shows END PRACTICE');
act('pause', 'endpractice'); await wait(20);
check(g.state === 'armory' && ui.screens.armory.el.querySelector('.chip.sel[data-id="gearworks"]') && ui.screens.armory.el.querySelector('.mk-b.on')?.textContent === 'IV', 'END PRACTICE -> armory gearworks Mk IV');
act('armory', 'try');
d.setAutopilot('pro', 1);
s = run();
check(s.state === 'result' && ui.current === 'result' && ui.screens.result.el.textContent.includes('PRACTICE DONE'), 'practice result ' + s.state);
check(!!ui.screens.result.el.querySelector('[data-act="retry"]') && !!ui.screens.result.el.querySelector('[data-act="practice-back"]'), 'practice result TRY AGAIN / BACK');
act('result', 'practice-back'); await wait(20);
check(g.state === 'armory' && ui.screens.armory.el.querySelector('.chip.sel[data-id="gearworks"]'), 'practice BACK -> ' + g.state);
d.setAutopilot(false);

// ---- Heroes TRY IT: favourite if unlocked, else the selected weapon; Mk III ----
for (const [lvl, want] of [[1, 'thunderclap'], [3, 'glacier']]) {
  g.save.update((x) => { x.unlockedLevel = lvl; x.arsenal.owned = ['thunderclap']; x.arsenal.selected = 'thunderclap'; });
  ui.nav('heroes', { from: 'title', hero: 'rime' }); await wait(20);
  act('heroes', 'try');
  s = d.state();
  check(s.mode === 'practice' && s.hero === 'rime' && s.weapon === want && s.mk === 3, `heroes TRY IT at level ${lvl}: ${s.weapon} mk ${s.mk}`);
  ui.nav('title'); await wait(20);
}

// ---- win L2 on a fresh save: Glacier Lance card, INFO -> Armory; NEXT -> loadout; RETRY skips it ----
g.save.reset();
d.setLoadout('pip', 'thunderclap');
let won = false;
for (let k = 0; k < 5 && !won; k++) { d.setAutopilot('pro', 1 + 100 * k); d.startLevel(2); s = run(); won = !!(g.lastResult && g.lastResult.win); }
d.setAutopilot(false);
check(won && ui.current === 'result', 'L2 not won');
const res = ui.screens.result.el;
check(res.textContent.replace(/\s+/g, ' ').includes('NEW WEAPON UNLOCKED: GLACIER LANCE'), 'no Glacier unlock card');
const info = res.querySelector('[data-act="info"][data-id="glacier"]');
check(!!info, 'no unlock card INFO');
if (info) { ui.screens.result.onAct('info', info); await wait(20); }
check(g.state === 'armory' && ui.screens.armory.el.querySelector('.chip.sel[data-id="glacier"]'), 'card INFO -> ' + g.state);
act('armory', 'back'); await wait(20);
check(g.state === 'map', 'armory from result BACK -> ' + g.state);
for (let k = 0; k < 5; k++) { d.setAutopilot('pro', 1 + 100 * k); d.startLevel(1); s = run(); if (g.lastResult && g.lastResult.win) break; }
d.setAutopilot(false);
act('result', 'next'); await wait(20);
check(g.state === 'loadout' && ui.screens.loadout.el.textContent.includes('LEVEL 2'), 'NEXT -> ' + g.state);
d.startLevel(1); g.onSquadEmpty('test'); run(1);
check(g.state === 'result', 'lose -> result ' + g.state);
act('result', 'retry');
check(g.state === 'playing' && d.state().levelId === 1, 'RETRY -> ' + g.state);

// ---- title buttons ----
ui.nav('title'); await wait(20);
for (const [a, want] of [['armory', 'armory'], ['heroes', 'heroes'], ['play', 'map'], ['modes', 'modes'], ['shop', 'shop']]) {
  ui.nav('title'); await wait(10);
  act('title', a);
  check(g.state === want, `title ${a} -> ${g.state}`);
}
ui.nav('title');
g.save.reset();
g.loop.start();
return { pass: fails.length === 0, fails };
