// @smoke --seconds 0 --shots 0
// Update 3 stage 1 (SPEC3 "World model"): 50 campaign levels with world / kind / boss as specified, a final rush
// + finish on every level without a boss (nothing after the rush, the run wins at `length`, nothing hurts the
// squad after the win), deterministic generated levels 16-50, and the v3 save: a v2 save keeps coins /
// upgrades / outfits / paints / heroes / weapons exactly, a v2 save that beat L15 moves on to L16, stars and
// unlockedLevel accept 1..50, the new fields are sanitized, and the progress backup survives an old-tab write.
const g = window.__game, d = g.debug;
g.loop.stop();
const L = await import('/src/data/levels.js');
const W = await import('/src/data/worlds.js');
const GEN = await import('/src/data/levelgen.js');
const { getTheme } = await import('/src/data/themes.js');
const { Save, SAVE_KEY, OWNED_KEY, PROGRESS_KEY } = await import('/src/save/save.js');
const { awardWin } = await import('/src/save/progress.js');
const fails = [], info = {};
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().map((k) => [k, canon(v[k])]) : Array.isArray(v) ? v.map(canon) : v);
const eq = (a, b, what) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ok = (c, what) => { if (!c) fails.push(what); };

// ---------------- 1. level list ----------------
eq([L.LEVEL_COUNT, L.LAST_LEVEL, L.LEVELS.length], [50, 50, 50], 'LEVEL_COUNT / LAST_LEVEL / count');
ok(!L.getLevel(0) && !L.getLevel(51), 'getLevel outside 1..50 is null');
const BOSSES = {
  5: { type: 'oculon', mini: true }, 10: { type: 'grawlstone' }, 15: { type: 'grawlstone', skin: 'forge', mini: true },
  20: { type: 'ironhorn' }, 25: { type: 'ironhorn', skin: 'frost', mini: true }, 30: { type: 'glacius', skin: 'frost' },
  35: { type: 'gumdrop', skin: 'candy', mini: true }, 40: { type: 'mothermurk', skin: 'candy' },
  45: { type: 'oculon', skin: 'citadel', mini: true }, 50: { type: 'tempestking' },
};
const names = new Set();
for (let id = 1; id <= 50; id++) {
  const lv = L.getLevel(id);
  if (!lv) { fails.push(`L${id} missing`); continue; }
  const w = W.worldOf(id);
  eq([lv.id, lv.world, lv.kind], [id, w.id, W.levelKind(id)], `L${id} id / world / kind`);
  ok(lv.name && !names.has(lv.name), `L${id} name "${lv.name}" empty or repeated`); names.add(lv.name);
  ok(getTheme(lv.theme) && typeof getTheme(lv.theme) === 'object', `L${id} theme ${lv.theme} has no fallback`);
  if (id > 10) ok(w.themes.includes(lv.theme), `L${id} theme ${lv.theme} not a ${w.key} theme`);
  ok(Array.isArray(lv.stars) && lv.stars[0] > 0 && lv.stars[1] > lv.stars[0] && lv.stars[1] <= 999, `L${id} stars ${lv.stars}`);
  ok(lv.favours && lv.favours.length > 0, `L${id} has no favours`);
  ok(lv.length > 300 && lv.speed > 8 && lv.reward > 0 && lv.tough > 0, `L${id} numbers`);
  const want = BOSSES[id];
  const rush = lv.events.filter((e) => e.type === 'horde' && e.rush);
  if (want) {
    const b = lv.boss || {};
    eq({ type: b.type, skin: b.skin, mini: b.mini }, { type: want.type, skin: want.skin, mini: want.mini }, `L${id} boss`);
    ok(b.hp > 0 && b.tier >= 1, `L${id} boss hp / tier`);
    ok(!lv.finish && rush.length === 0, `L${id} boss level has a finish / rush`);
    eq(lv.kind, want.mini ? 'mini' : 'boss', `L${id} kind`);
  } else {
    eq(lv.boss, null, `L${id} boss`);
    ok(lv.finish === true, `L${id} finish flag`);
    if (rush.length !== 1) { fails.push(`L${id}: ${rush.length} rush hordes`); continue; }
    const r = rush[0], others = lv.events.filter((e) => e !== r);
    ok(others.every((e) => e.at + (e.length || 0) < r.at), `L${id}: an event after the final rush`);
    ok(r.at < lv.length && r.count >= Math.max(...others.filter((e) => e.type === 'horde').map((e) => e.count)), `L${id}: rush ${r.count}@${r.at} (length ${lv.length})`);
  }
}
eq([11, 21, 31, 41].map((id) => L.getLevel(id).kind), ['intro', 'intro', 'intro', 'intro'], 'intro levels');
eq([11, 12, 13, 14, 15].every((id) => ['forge', 'forgeNight'].includes(L.getLevel(id).theme)), true, 'L11-15 forge themes');
for (const id of [21, 31, 41]) ok(L.getLevel(id).length <= 420, `L${id} intro length ${L.getLevel(id).length}`);
const rewards = L.LEVELS.slice(15).map((l) => l.reward);
ok(rewards.every((v, i) => i === 0 || v >= rewards[i - 1]), 'rewards 16-50 rise');
ok(Math.abs(L.getLevel(20).reward - 260) <= 30 && Math.abs(L.getLevel(50).reward - 600) <= 40, `rewards L20 ${L.getLevel(20).reward} L50 ${L.getLevel(50).reward}`);
// L1-15 beats unchanged: the old length stays the beat layout; a bossless level only adds the 24 u rush tail
for (let id = 1; id <= 15; id++) { const lv = L.getLevel(id); ok(lv.layout + (lv.finish ? 24 : 0) === lv.length, `L${id} layout ${lv.layout} / length ${lv.length}`); }
// deterministic generation
// (stage 2: the world hazards are added on top by data/hazardplan.js, so they are left out of the comparison)
for (const id of [16, 23, 33, 43, 50]) { const { world, kind, ...lv } = L.getLevel(id); lv.events = lv.events.filter((e) => e.type !== 'hazard'); eq(JSON.stringify(GEN.generateLevel(id)), JSON.stringify(lv), `L${id} regenerates identically`); }
info.table = L.LEVELS.map((l) => `${l.id}${l.boss ? '[' + l.boss.type + (l.boss.skin ? '/' + l.boss.skin : '') + (l.boss.mini ? ' mini' : '') + ']' : ''}`).join(' ');

// ---------------- 2. bossless run: wins at length, nothing hurts after the win ----------------
d.setLoadout('pip', 'thunderclap');
d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
d.startLevel(1);
let s, guard = 0, wonAt = null;
g.events.on('run:win', () => { if (wonAt == null) wonAt = { dist: g.run.dist, squad: g.squad.count, boss: !!g.boss }; });
do { s = d.simulate(5); guard++; } while (s.state === 'playing' && guard < 60);
ok(s.result && s.result.win, 'L1 (bossless) not won');
ok(wonAt && wonAt.dist >= L.getLevel(1).length - 0.01 && !wonAt.boss, `L1 won at ${wonAt && wonAt.dist} of ${L.getLevel(1).length}`);
// a big horde on top of the squad right after the win must not take anyone
d.startCustom({ length: 60, speed: 9, boss: null, finish: true, events: [L.horde(108, 200, { grunt: 1 }, 'both', { hpMul: 50 })] }); // charges as the squad crosses the line
d.setAutopilot(false);
guard = 0;
while (g.run.phase === 'run' && guard++ < 600) g.step(1 / 60);
const after = g.squad.count;
d.simulate(4);
ok(g.lastResult && g.lastResult.win && g.squad.count === after, `post-win losses: ${after} -> ${g.squad.count}`);
d.toTitle();
// game API over 50 levels
ok(g.startLevel(50) === true && g.run.levelId === 50, 'startLevel(50)');
ok(g.startLevel(51) === false, 'startLevel(51) refused');
g.startLevel(15); ok(g.nextLevel() === true && g.run.levelId === 16, 'nextLevel 15 -> 16');
ok(g.getProgress && typeof g.getProgress() === 'object', 'getProgress');
d.toTitle();

// ---------------- 3. save v3 ----------------
const v2 = {
  version: 2, coins: 98765, unlockedLevel: 15,
  stars: { 1: 3, 2: 3, 3: 2, 4: 3, 5: 2, 6: 3, 7: 1, 8: 2, 9: 3, 10: 2, 11: 3, 12: 2, 13: 1, 14: 2, 15: 2 },
  upgrades: { squad: 9, damage: 12, rate: 11, tier: 2, coins: 5 },
  skins: { owned: ['classic', 'factory', 'ninja', 'gold', 'candy', 'prism'], hero: 'gold', weapon: 'prism' },
  daily: { lastClaim: '2026-11-15', streak: 6 }, endlessBest: 1543,
  settings: { music: true, sfx: false, quality: 'high', vibration: false },
  stats: { kills: 456789, runs: 120, wins: 101 },
  heroes: { owned: ['pip', 'vex', 'bolt'], selected: 'vex' },
  arsenal: { owned: ['thunderclap', 'voidsiphon', 'spectra'], selected: 'voidsiphon' },
  seen: { heroes: ['cinder', 'vex'], weapons: ['glacier'] },
};
const clear = () => { for (const k of [SAVE_KEY, OWNED_KEY, PROGRESS_KEY]) localStorage.removeItem(k); };
const fresh = () => new Save(null, { delay: 0 });
clear();
localStorage.setItem(SAVE_KEY, JSON.stringify(v2));
let sv = fresh();
for (const k of ['coins', 'stars', 'upgrades', 'skins', 'daily', 'endlessBest', 'stats', 'heroes', 'arsenal', 'seen']) eq(sv.data[k], v2[k], 'v2 field ' + k);
eq(Object.fromEntries(Object.keys(v2.settings).map((k) => [k, sv.data.settings[k]])), v2.settings, 'v2 settings');
eq([sv.data.version, sv.data.unlockedLevel], [3, 16], 'v2 that beat L15 -> v3, unlockedLevel 16');
eq([sv.data.settings.musicVol, sv.data.settings.sfxVol, sv.data.settings.abilitySide, sv.data.settings.colorblind, sv.data.settings.haptics], [0.8, 0.9, 'right', false, false], 'v3 settings (haptics = old vibration)');
eq([sv.data.elite, sv.data.modes, sv.data.achievements, sv.data.squadTypes], [{}, { bossRushBest: 0, dailyBest: {}, chaosBest: 0, endlessBest: {} }, { done: [], claimed: [] }, { owned: [], mix: {} }], 'v3 defaults');
sv.setSetting('haptics', true); eq(sv.data.settings.vibration, true, 'haptics drives the old vibration switch');
sv.flush();
eq(JSON.parse(localStorage.getItem(SAVE_KEY)).unlockedLevel, 16, 'written unlockedLevel');
// not beaten / already v3: no move
clear(); localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v2, stars: { ...v2.stars, 15: 0 } }));
eq(fresh().data.unlockedLevel, 15, 'v2 at L15 without a L15 win stays on 15');
clear(); localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v2, version: 3 }));
eq(fresh().data.unlockedLevel, 15, 'a v3 save is not migrated again');
// 1..50 range + sanitizing of the new fields
clear();
localStorage.setItem(SAVE_KEY, JSON.stringify({
  ...v2, version: 3, unlockedLevel: 77, stars: { ...v2.stars, 33: 3, 50: 2, 51: 3, x: 2 },
  elite: { 3: 3, 49: 9, 60: 2 }, settings: { ...v2.settings, musicVol: 4, sfxVol: 0.25, abilitySide: 'up', colorblind: true, haptics: 'yes' },
  modes: { bossRushBest: 1234.7, chaosBest: -5, dailyBest: { '2026-11-16': 900, bad: 3 }, endlessBest: { 1: 800, 9: 5 } },
  achievements: { done: ['first_win', 'first_win', '<script>'], claimed: 7 }, squadTypes: { owned: ['medic', 42], mix: { medic: 250, gunner: 30 } },
}));
sv = fresh();
eq(sv.data.unlockedLevel, 50, 'unlockedLevel clamps to 50');
eq([sv.data.stars[33], sv.data.stars[50], sv.data.stars[51], sv.data.stars.x], [3, 2, undefined, undefined], 'stars 1..50');
eq(sv.data.elite, { 3: 3, 49: 3 }, 'elite sanitized');
eq([sv.data.settings.musicVol, sv.data.settings.sfxVol, sv.data.settings.abilitySide, sv.data.settings.colorblind, sv.data.settings.haptics], [1, 0.25, 'right', true, false], 'v3 settings sanitized');
eq(sv.data.modes, { bossRushBest: 1234, chaosBest: 0, dailyBest: { '2026-11-16': 900 }, endlessBest: { 1: 800 } }, 'modes sanitized');
eq(sv.data.achievements, { done: ['first_win'], claimed: [] }, 'achievements sanitized');
eq(sv.data.squadTypes, { owned: ['medic'], mix: { medic: 100, gunner: 30 } }, 'squadTypes sanitized');
// old tab (update 2 build) clamps progress to 15 levels: the v3 progress backup brings it back
clear();
localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v2, version: 3, unlockedLevel: 31, stars: { ...v2.stars, 20: 3, 30: 2 } }));
sv = fresh(); sv.flush();
localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v2, version: 2, unlockedLevel: 15, coins: 5 })); // what an old tab writes
sv = fresh();
eq([sv.data.unlockedLevel, sv.data.stars[20], sv.data.stars[30], sv.data.coins], [31, 3, 2, 5], 'progress survives an old-tab write');
sv.reset();
eq([JSON.parse(localStorage.getItem(PROGRESS_KEY)).unlockedLevel, fresh().data.unlockedLevel], [1, 1], 'reset clears the progress backup');
// winning L15 opens L16; winning L50 never unlocks past it
clear();
sv = fresh();
sv.update((x) => { x.unlockedLevel = 15; });
awardWin(sv, { mode: 'level', levelId: 15, stars: 2, coins: 10 });
eq(sv.data.unlockedLevel, 16, 'win L15 -> unlockedLevel 16');
sv.update((x) => { x.unlockedLevel = 50; });
awardWin(sv, { mode: 'level', levelId: 50, stars: 3, coins: 10 });
eq([sv.data.unlockedLevel, sv.data.stars[50]], [50, 3], 'win L50 stays on 50');
clear();
g.save.reset();
return { pass: fails.length === 0, fails, info };
