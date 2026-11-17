// Update 3 stage 3 ELITE mode (STAGE3.md level contract): per level, unlocked by a 3-star clear.
// 1. eliteDef: per world (stage 3 review, data/elite.js ELITE): horde counts x1.5 .. x1.15 (ramping in after the
//    opening hordes, never below normal, capped), toughness x1.4 .. x1.1, elite fraction +20% .. +6%, boss hp x1.5
//    .. x1.1; reward x2, collected coins x1.5, stars x0.8; the campaign def is never touched.
// 4. Winnable: the pro bot with the end-of-campaign upgrades (snapshots3 U[50]) wins L36 / L40 / L50 ELITE within
//    3 tries (bot seeds 1, 101, 201), Pip + Thunderclap.
// 2. Game: startLevel(id, { elite }) runs the elite def (RETRY keeps it); endless / practice never are elite; an elite
//    win pays round(collected x1.5 + reward x2 + 15/star), records save.elite[id] (best) and leaves save.stars alone;
//    the progress backup keeps elite stars.
// 3. UI: the loadout ELITE row is locked below 3 stars, toggles when open, START runs elite and says so; endless has
//    no row; the map node shows the elite badge (open / done with elite stars); the result says ELITE CLEAR!.
// Screenshot case: --query "test=1&elitecase=locked|open|on|map|result" stops on that view (shots3.mjs).
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const L = await import('/src/data/levels.js');
const E = await import('/src/data/elite.js');
const { awardWin } = await import('/src/save/progress.js');
const { PROGRESS_KEY } = await import('/src/save/save.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const settle = (s) => { for (const a of ui.screens[s].el.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); };
const setStars = (stars, elite = {}, unlocked = 50) => g.save.update((x) => { x.stars = { ...stars }; x.elite = { ...elite }; x.unlockedLevel = unlocked; });
const LO = () => ui.screens.loadout;

const shot = new URLSearchParams(location.search).get('elitecase');
g.save.reset();
if (shot) {
  const stars = {}; for (let i = 1; i < 24; i++) stars[i] = i % 4 === 0 ? 2 : 3;
  if (shot === 'locked') { setStars({ ...stars, 18: 2 }, {}, 24); ui.nav('loadout', { levelId: 18 }); await wait(900); settle('loadout'); return { shot }; }
  if (shot === 'open' || shot === 'on') {
    setStars(stars, { 18: 2 }, 24); ui.nav('loadout', { levelId: 18 }); await wait(900); settle('loadout');
    if (shot === 'on') { LO().onAct('elite', {}); await wait(300); }
    return { shot, state: LO().eliteState() };
  }
  if (shot === 'map') {
    setStars(stars, { 13: 3, 14: 2, 15: 1, 17: 3, 19: 2, 10: 3 }, 24); ui.nav('map'); await wait(900); settle('map');
    const sc = ui.screens.map.el.querySelector('.map-scroll'); sc.scrollTop += ui.screens.map.el.querySelector('.map-node[data-id="15"]').getBoundingClientRect().top - sc.clientHeight * 0.45; await wait(300);
    return { shot };
  }
  if (shot === 'result') {
    setStars({ 1: 3 }, {}, 2);
    d.setLoadout('pip', 'thunderclap'); d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
    g.startLevel(1, { elite: true }); let s, k = 0; do { s = d.simulate(20); k++; } while (s.state === 'playing' && k < 20);
    d.setAutopilot(false); g.loop.start && g.loop.start(); await wait(3200); settle('result'); await wait(2500);
    return { shot, win: g.lastResult && g.lastResult.win, elite: g.lastResult && g.lastResult.elite };
  }
}

// ---------------- 1. eliteDef ----------------
for (const id of [1, 9, 10, 23, 40, 47, 50]) {
  const base = L.getLevel(id), before = JSON.stringify(base);
  const e = E.eliteDef(base), M = E.eliteMuls(base), span = base.layout ?? base.length;
  ok(JSON.stringify(base) === before, `L${id}: eliteDef changed the campaign def`);
  ok(e !== base && e.elite === true && e.coinMul === 1.5 && e.reward === base.reward * 2, `L${id}: elite flag / coinMul / reward ${e.reward}`);
  ok(E.eliteDef(e) === e, `L${id}: eliteDef twice`);
  ok(e.name === 'ELITE ' + base.name, `L${id} name "${e.name}"`);
  ok(e.stars[0] === Math.round(base.stars[0] * 0.8) && e.stars[1] === Math.round(base.stars[1] * 0.8), `L${id} stars ${e.stars}`);
  ok(Math.abs(e.tough - base.tough * M.tough) < 0.02 && Math.abs(e.enemyHp - base.enemyHp * M.tough) < 0.02, `L${id} tough ${e.tough} / enemyHp ${e.enemyHp}`);
  if (base.boss) ok(e.boss.hp === Math.round(base.boss.hp * M.bossHp) && e.boss.type === base.boss.type, `L${id} boss hp ${e.boss.hp}`);
  ok(M.count >= 1.1 && M.count <= 1.5 && M.tough >= 1.1 && M.tough <= 1.4 && (base.world >= 4 ? M.count < 1.5 : base.world <= 2 ? M.count === 1.5 : M.count <= 1.5), `L${id} world ${base.world} muls ${JSON.stringify(M)}`);
  ok(e.events.length === base.events.length, `L${id} event count`);
  base.events.forEach((b, i) => {
    const x = e.events[i];
    if (b.type !== 'horde') { ok(JSON.stringify(x) === JSON.stringify(b) && x !== b, `L${id} ${b.type}@${b.at} not a plain copy`); return; }
    const p = b.rush ? 1 : b.at / span;
    ok(x.count >= b.count && x.count <= Math.max(b.count, Math.min(E.ELITE.maxHorde, Math.round(b.count * M.count))), `L${id} horde@${b.at} count ${b.count} -> ${x.count}`);
    if (p < 0.12) ok(x.count === b.count, `L${id} opening horde@${b.at} grew ${b.count} -> ${x.count}`);
    if (p >= 0.4 && b.count * M.count <= E.ELITE.maxHorde) ok(x.count === Math.round(b.count * M.count), `L${id} horde@${b.at} count ${b.count} -> ${x.count}`);
    ok(Math.abs(x.hpMul - b.hpMul * M.tough) < 0.02, `L${id} horde@${b.at} hpMul ${b.hpMul} -> ${x.hpMul}`);
    ok(Math.abs(x.elite - Math.min(1, (b.elite || 0) + M.elite)) < 0.002, `L${id} horde@${b.at} elite ${x.elite}`);
  });
}
const sv = { stars: { 3: 3, 4: 2 }, elite: { 3: 2 } };
ok(E.eliteUnlocked(sv, 3) && !E.eliteUnlocked(sv, 4) && !E.eliteUnlocked(sv, 5) && E.eliteStars(sv, 3) === 2 && E.eliteStars(sv, 4) === 0, 'eliteUnlocked / eliteStars');

// ---------------- 2. game ----------------
d.setLoadout('pip', 'thunderclap');
d.setAutopilot(false);
ok(g.startLevel(10, { elite: true }) && g.run.def.elite && g.run.boss.hp === Math.round(L.getLevel(10).boss.hp * 1.5), 'startLevel(10, elite) runs the elite def');
g.retry();
ok(g.run.def.elite === true && g.run.levelId === 10, 'RETRY keeps ELITE');
g.startLevel(10);
ok(!g.run.def.elite && g.run.boss.hp === L.getLevel(10).boss.hp, 'startLevel without elite is the campaign level');
g.startEndless(5); ok(!g.run.def.elite, 'endless is never elite');
g.startPractice({}); ok(!g.run.def.elite, 'practice is never elite');
d.toTitle();
// a real elite win: pro on L1 ELITE
setStars({ 1: 3 }, {}, 2);
d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
g.startLevel(1, { elite: true });
let s, k = 0;
do { s = d.simulate(20); k++; } while (s.state === 'playing' && k < 20);
const R = g.lastResult || {}, run = g.run;
ok(R.win && R.elite, `elite L1 run: ${JSON.stringify(R)}`);
if (R.win) {
  ok(R.coins === Math.round(run.coins * 1.5 + L.getLevel(1).reward * 2 + 15 * R.stars), `elite payout ${R.coins} (collected ${run.coins}, stars ${R.stars})`);
  ok(g.save.data.elite[1] === R.stars && g.save.data.stars[1] === 3, `elite win recorded: elite ${g.save.data.elite[1]}, stars ${g.save.data.stars[1]}`);
  ok(g.lastAward && g.lastAward.elite === true, 'lastAward says elite');
  g.save.flush();
  ok(JSON.parse(localStorage.getItem(PROGRESS_KEY)).elite[1] === R.stars, 'progress backup keeps elite stars');
}
info.eliteL1 = { win: R.win, stars: R.stars, squad: R.squad, coins: R.coins };
d.setAutopilot(false);
d.toTitle();
// award rules: best elite stars kept; a normal win never writes elite
setStars({ 7: 3 }, { 7: 2 }, 8);
awardWin(g.save, { mode: 'level', levelId: 7, stars: 1, coins: 0, elite: true });
ok(g.save.data.elite[7] === 2 && g.save.data.stars[7] === 3, 'elite best kept');
awardWin(g.save, { mode: 'level', levelId: 7, stars: 3, coins: 0, elite: true });
ok(g.save.data.elite[7] === 3, 'elite best raised');
awardWin(g.save, { mode: 'level', levelId: 7, stars: 1, coins: 0 });
ok(g.save.data.elite[7] === 3 && g.save.data.stars[7] === 3, 'normal win leaves elite alone');

// ---------------- 3. UI ----------------
setStars({ 18: 2 }, {}, 24);
ui.nav('loadout', { levelId: 18 }); await wait(700);
let row = LO().el.querySelector('.lo-elite');
ok(row && row.classList.contains('locked') && !LO().eliteState().open, 'loadout: ELITE locked under 3 stars');
ok(/3/.test(row.textContent) && /unlock/i.test(row.textContent), `locked text "${row.textContent}"`);
LO().onAct('elite', {});
ok(!LO().eliteState().on, 'locked switch does not turn on');
setStars({ 18: 3 }, { 18: 2 }, 24);
ui.nav('loadout', { levelId: 18 }); await wait(700);
row = LO().el.querySelector('.lo-elite');
ok(row && !row.classList.contains('locked') && row.dataset.act === 'elite', 'loadout: ELITE open at 3 stars');
ok(/x2 coins/i.test(row.textContent) && /tougher/i.test(row.textContent), `elite explanation "${row.textContent}"`);
ok(row.querySelectorAll('.le-best .ico.on').length === 2, 'loadout shows the best elite stars');
LO().onAct('elite', {});
row = LO().el.querySelector('.lo-elite');
const start = LO().el.querySelector('.lo-start');
ok(LO().eliteState().on && row.classList.contains('on') && row.getAttribute('aria-checked') === 'true', 'switch on');
ok(/ELITE/.test(start.textContent) && start.classList.contains('is-elite'), `START says ELITE: "${start.textContent}"`);
// the foot stays on screen and the row is a real tap target
const rb = row.getBoundingClientRect(), sb = start.getBoundingClientRect();
ok(rb.height >= 44 && rb.bottom <= sb.top + 1 && sb.bottom <= innerHeight + 1 && rb.right <= innerWidth + 1, `elite row layout ${JSON.stringify([rb.top, rb.bottom, sb.top, sb.bottom])}`);
LO().onAct('start', {});
ok(g.run && g.run.def.elite && g.run.levelId === 18, 'START runs ELITE');
d.toTitle(); await wait(300);
ui.nav('loadout', { levelId: 19 }); await wait(500);
ok(!LO().eliteState().on && LO().el.querySelector('.lo-elite.locked'), 'another level without 3 stars: locked, off');
ui.nav('loadout', { mode: 'endless' }); await wait(500);
ok(LO().el.querySelector('.lo-elite-slot').hidden, 'endless: no ELITE row');
// map badge
setStars({ 1: 3, 2: 3, 3: 2 }, { 2: 3 }, 4);
ui.nav('map'); await wait(700);
const node = (id) => ui.screens.map.el.querySelector(`.map-node[data-id="${id}"]`);
ok(node(1).classList.contains('elite-open') && !node(1).classList.contains('elite-done'), 'map: 3 stars -> elite open badge');
ok(node(2).classList.contains('elite-done') && node(2).querySelectorAll('.wm-elite .e-stars .ico.on').length === 3, 'map: elite clear -> badge + 3 elite stars');
ok(!node(3).classList.contains('elite-open') && !node(3).classList.contains('elite-done'), 'map: 2 stars -> no badge');
const bb = node(2).querySelector('.wm-elite').getBoundingClientRect();
ok(bb.width >= 24 && bb.height >= 24, `badge size ${bb.width}x${bb.height}`);
// result screen of an elite win
g.lastResult = { win: true, levelId: 2, mode: 'level', stars: 2, coins: 300, squad: 40, kills: 100, elite: true };
g.lastAward = null;
ui.nav('result'); await wait(400);
const res = ui.screens.result.el;
ok(res.querySelector('.ribbon-elite') && /ELITE CLEAR/.test(res.textContent) && res.querySelector('.res-elite-tag') && res.querySelector('.elite-bonus'), 'result: ELITE CLEAR ribbon + tag + x2');
g.lastResult = { win: false, levelId: 2, mode: 'level', dist: 100, coins: 10, kills: 10, elite: true };
ui.nav('result'); await wait(300);
ok(res.querySelector('.res-elite-tag') && !res.querySelector('.ribbon-elite'), 'result: elite loss shows the tag');
ui.nav('title'); await wait(200);

// ---------------- 4. late ELITE levels stay winnable ----------------
const snap = await (await fetch('/scripts/balance/snapshots3.json')).json();
const win = {};
for (const id of [36, 40, 50]) {
  let tries = 0, won = false, last = null;
  while (!won && tries < 3) {
    d.setUpgrades(snap.U[50].upgrades);
    d.setLoadout('pip', 'thunderclap');
    d.setAutopilot('pro', 1 + 100 * tries++, { crates: 'never', ability: true, loadout: 'keep' });
    g.startLevel(id, { elite: true });
    let s, k = 0;
    do { s = d.simulate(30); k++; } while (s.state === 'playing' && k < 20);
    last = s.result || {}; won = !!last.win;
  }
  win[id] = won ? tries : `X(${last.squad ?? 0}${last.bossHp != null ? ' boss ' + last.bossHp : ''})`;
  ok(won, `L${id} ELITE: pro with end-of-campaign upgrades did not win in 3 (${win[id]})`);
}
info.eliteWins = win;
d.setAutopilot(false);
g.save.reset();
return { pass: fails.length === 0, fails, info };
