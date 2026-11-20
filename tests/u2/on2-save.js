// Online stage 1 (builder SHELL): save version 4 (SPEC4 §4.5). A fresh Save instance re-reads localStorage exactly
// like a page reload does for the save layer (same method as foundation-save.js).
// 1. A full v3 save loads as v4 with every v3 field unchanged and an empty `online` block; v1 and v2 saves too.
// 2. The online block (name, cached profile, match history) is written to the main save AND to the backup key
//    nimbusRaiders.online.v4; it stays under 4 KB with a full history, so an older cached tab keeps it.
// 3. Old-tab protection: an older build writes its stale copy (or none at all) over the main key -> the next load
//    still has the name, the profile numbers and every match (the backup wins, histories are joined).
// 4. The history keeps the newest 20 rows, one per match; junk in storage is cleaned, never trusted.
// 5. Reset clears the block and the backup key (the account itself lives on the server), keeps the settings.
const { Save, SAVE_KEY, OWNED_KEY, PROGRESS_KEY, ONLINE_KEY, SAVE_VERSION, sanitize } = await import('/src/save/save.js');
const O = await import('/src/save/onlinesave.js');
const fails = [];
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().map((k) => [k, canon(v[k])]) : Array.isArray(v) ? v.map(canon) : v);
const eq = (a, b, what) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ok = (c, what) => { if (!c) fails.push(what); };
const fresh = () => new Save(null, { delay: 0 });
const clear = () => { for (const k of [SAVE_KEY, OWNED_KEY, PROGRESS_KEY, ONLINE_KEY]) localStorage.removeItem(k); };
const keep = Object.fromEntries([SAVE_KEY, OWNED_KEY, PROGRESS_KEY, ONLINE_KEY].map((k) => [k, localStorage.getItem(k)]));
const EMPTY = { name: '', tr: 0, pk: 0, bt: 0, st: 0, bs: 0, w: 0, hist: [] };

try {
  eq([SAVE_VERSION, ONLINE_KEY], [4, 'nimbusRaiders.online.v4'], 'version / backup key');
  // ---- 1. v3 -> v4: nothing else moves ----
  const v3 = {
    version: 3, coins: 4321, unlockedLevel: 23, stars: { 1: 3, 2: 2, 15: 3, 22: 1 },
    upgrades: { squad: 3, damage: 2, rate: 1, tier: 1, coins: 2 },
    skins: { owned: ['classic', 'factory', 'ninja', 'candy'], hero: 'ninja', weapon: 'candy' },
    daily: { lastClaim: '2026-11-18', streak: 3 }, endlessBest: 900,
    settings: { music: false, sfx: true, quality: 'low', vibration: true, musicVol: 0.4, sfxVol: 0.6, abilitySide: 'left', colorblind: true, haptics: true },
    stats: { kills: 999, runs: 30, wins: 20 },
    heroes: { owned: ['pip', 'vex'], selected: 'vex' }, arsenal: { owned: ['thunderclap', 'spectra'], selected: 'spectra' },
    seen: { heroes: ['pip'], weapons: ['thunderclap'] },
    elite: { 1: 2 }, modes: { bossRushBest: 123456, dailyBest: { '2026-11-17': 500 }, chaosBest: 77, endlessBest: { 1: 900, 2: 300 } },
    achievements: { done: ['first-win'], claimed: ['first-win'], counts: { gates: 12 } },
    squadTypes: { owned: ['shield'], mix: { shield: 30 } }, modifiers: [],
  };
  clear(); localStorage.setItem(SAVE_KEY, JSON.stringify(v3));
  const before = sanitize(v3);
  let s = fresh();
  eq(s.data.version, 4, 'v3 loads as v4');
  eq(s.data.online, EMPTY, 'a v3 save gets the empty online block');
  for (const k of Object.keys(v3)) if (k !== 'version') eq(s.data[k], before[k], 'v3 field ' + k);
  for (const k of ['coins', 'unlockedLevel', 'stars', 'skins', 'daily', 'endlessBest', 'settings', 'stats', 'elite', 'achievements']) eq(s.data[k], v3[k], 'v3 value ' + k);
  eq([s.data.heroes.selected, s.data.arsenal.selected, s.data.arsenal.owned.includes('spectra')], ['vex', 'spectra', true], 'v3 loadout');
  s.flush();
  const w = JSON.parse(localStorage.getItem(SAVE_KEY));
  eq([w.version, w.coins, w.online], [4, 4321, EMPTY], 'written v4');
  eq(JSON.parse(localStorage.getItem(ONLINE_KEY)), { ...EMPTY, skins: [] }, 'backup key written (empty)');
  for (const old of [{ version: 1, coins: 7, unlockedLevel: 3, stars: { 1: 3 } }, { version: 2, coins: 9, unlockedLevel: 15, stars: { 15: 2 } }]) {
    clear(); localStorage.setItem(SAVE_KEY, JSON.stringify(old));
    s = fresh();
    eq([s.data.version, s.data.coins, s.data.online], [4, old.coins, EMPTY], `v${old.version} loads`);
  }
  // ---- 2. the block + its backup, and its size ----
  clear(); localStorage.setItem(SAVE_KEY, JSON.stringify(v3));
  s = fresh();
  O.setOnlineProfile(s, { n: 'Sky Rider', tr: 120, pk: 180, w: 9, l: 4, st: 2, bs: 5, bt: 1873, ws: 0, cd: 0, cc: 0 });
  for (let i = 0; i < 25; i++) O.addOnlineMatch(s, { a: 1790000000 + i * 600, r: 'wld'[i % 3], t: 100.04 + i, d: 1500 + i, n: 'Rival-Name-' + (i % 10), k: 'f' });
  eq({ ...s.data.online, hist: 0 }, { name: 'Sky Rider', tr: 120, pk: 180, bt: 1873, st: 2, bs: 5, w: 9, hist: 0 }, 'profile cache');
  eq([s.data.online.hist.length, s.data.online.hist[0].a, s.data.online.hist[19].a, s.data.online.hist[0].t], [20, 1790000000 + 24 * 600, 1790000000 + 5 * 600, 124], 'history: newest 20, newest first, time in tenths');
  O.addOnlineMatch(s, { a: 1790000000 + 24 * 600, r: 'l', t: 124, d: 1524, n: 'Rival-Name-4', k: 'f' }); // a corrected verdict for the same match
  eq([s.data.online.hist.length, s.data.online.hist[0].r], [20, 'l'], 'a corrected result replaces its row');
  s.flush();
  const size = JSON.stringify(s.data.online).length;
  ok(size < 4096, `the online block is ${size} bytes: an older tab would drop it (limit 4096)`);
  const backup = JSON.parse(localStorage.getItem(ONLINE_KEY));
  eq([backup.name, backup.tr, backup.hist.length, backup.skins], ['Sky Rider', 120, 20, []], 'backup key content');
  const full = JSON.parse(JSON.stringify(s.data.online));
  // ---- 3. an older tab writes over the main key ----
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v3, coins: 50 }));                       // a build that never heard of `online`
  s = fresh();
  eq(s.data.online, full, 'online block survives an old tab that drops it');
  eq(s.data.coins, 50, 'the old tab\'s own fields are taken as written');
  const stale = { ...full, name: 'Old Name', tr: 5, hist: [{ a: 1780000000, r: 'w', t: 60, d: 700, n: 'Ancient', k: 'f' }] };
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v3, online: stale }));                    // a v3 tab keeps the unknown key, but a stale copy
  s = fresh();
  eq([s.data.online.name, s.data.online.tr, s.data.online.hist.length, s.data.online.hist[0].a], ['Sky Rider', 120, 20, full.hist[0].a], 'the backup wins over a stale copy');
  localStorage.removeItem(ONLINE_KEY);                                                         // no backup (first run of this build): the main copy counts
  s = fresh();
  eq([s.data.online.name, s.data.online.tr, s.data.online.hist.length], ['Old Name', 5, 1], 'without a backup the main copy is used');
  // ---- 4. junk is cleaned ----
  const junk = { name: '<b>x</b>', tr: -5, pk: 'lots', bt: 99999, st: 1e99, bs: 2, w: null, extra: 'x'.repeat(5000),
    hist: [{ a: 5, r: 'w', t: 1e9, d: -3, n: '<script>', k: 'zz' }, { a: 0, r: 'w' }, { a: 9, r: 'x' }, 'nope', null, { a: 7, r: 'd', t: 12.345, d: 80.9, n: 'Okay_Name-1', k: 'q' }] };
  eq(O.cleanOnline(junk), { name: '', tr: 0, pk: 0, bt: 3300, st: 1000000, bs: 1000000, w: 0,
    hist: [{ a: 7, r: 'd', t: 12.3, d: 80, n: 'Okay_Name-1', k: 'q' }, { a: 5, r: 'w', t: 330, d: 0, n: '', k: 'f' }] }, 'cleanOnline');
  eq(O.cleanOnline('nonsense'), EMPTY, 'cleanOnline of a non-object');
  clear(); localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v3, online: junk })); localStorage.setItem(ONLINE_KEY, '{"name": 5, "hist": "x", "skins": ["classic", "nope", 7]}');
  s = fresh();
  eq([s.data.online.name, s.data.online.hist.length, s.data.skins.owned.includes('nope')], ['', 2, false], 'junk in both keys');
  // ---- 5. reset ----
  O.setOnlineProfile(s, { n: 'Gone Soon', tr: 30 });
  s.flush();
  ok(JSON.parse(localStorage.getItem(ONLINE_KEY)).name === 'Gone Soon', 'backup before reset');
  s.reset();
  s = fresh();
  eq(s.data.online, EMPTY, 'online block after Reset');
  eq(JSON.parse(localStorage.getItem(ONLINE_KEY)), { ...EMPTY, skins: [] }, 'backup key after Reset');
  eq(s.data.settings, v3.settings, 'settings kept by Reset');
  eq([s.data.coins, s.data.unlockedLevel], [0, 1], 'progress cleared by Reset');
} catch (e) { fails.push('threw: ' + (e.stack || e)); }
clear();
for (const [k, v] of Object.entries(keep)) if (v !== null) localStorage.setItem(k, v);
return { pass: fails.length === 0, fails };
