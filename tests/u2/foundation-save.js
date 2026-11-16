// SPEC2 §4 / §9 foundation-save: a v1 save migrates in place with nothing lost, level-10 unlocks are derived,
// outfits / paints survive, the owned backup key survives an old tab, Reset clears it, unknown keys survive.
// A fresh Save instance re-reads localStorage exactly like a page reload does for the save layer.
const { Save, SAVE_KEY, OWNED_KEY, PROGRESS_KEY } = await import('/src/save/save.js');
const U = await import('/src/save/unlocks.js');
const fails = [];
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().map((k) => [k, canon(v[k])]) : Array.isArray(v) ? v.map(canon) : v);
const eq = (a, b, what) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const v1 = {
  version: 1, coins: 1234, unlockedLevel: 10,
  stars: { 1: 3, 2: 2, 3: 3, 4: 1, 5: 2, 6: 3, 7: 2, 8: 2, 9: 1 },
  upgrades: { squad: 4, damage: 6, rate: 5, tier: 2, coins: 3 },
  skins: { owned: ['classic', 'factory', 'ninja', 'candy', 'prism'], hero: 'ninja', weapon: 'candy' },
  settings: { quality: 'low', music: false, sfx: true, vibration: false },
  stats: { kills: 12345, runs: 40, wins: 31 },
  daily: { lastClaim: '2026-11-10', streak: 4 },
  endlessBest: 812,
};
const fresh = () => new Save(null, { delay: 0 });
// v3 adds settings fields: the v1 ones must come through unchanged, the new ones take their defaults
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const same = (got, want, what) => (want && typeof want === 'object' && !Array.isArray(want) && got && typeof got === 'object' ? eq(pick(got, Object.keys(want)), want, what) : eq(got, want, what));
// ---- 1. v1 -> v3 in place ----
localStorage.removeItem(OWNED_KEY); localStorage.removeItem(PROGRESS_KEY);
localStorage.setItem(SAVE_KEY, JSON.stringify(v1));
let s = fresh();
for (const k of Object.keys(v1)) if (k !== 'version') same(s.data[k], v1[k], 'v1 field ' + k);
eq(s.data.version, 3, 'version');
eq([s.data.settings.musicVol, s.data.settings.sfxVol, s.data.settings.abilitySide, s.data.settings.colorblind, s.data.settings.haptics], [0.8, 0.9, 'right', false, false], 'v3 settings defaults (haptics = old vibration)');
eq(U.unlockedWeapons(s.data).slice().sort(), ['emberstorm', 'gearworks', 'glacier', 'sugarrush', 'thunderclap'], 'unlocked weapons');
eq(U.unlockedHeroes(s.data).slice().sort(), ['bolt', 'bonbon', 'cinder', 'pip', 'rime'], 'unlocked heroes');
eq([s.data.skins.hero, s.data.skins.weapon], ['ninja', 'candy'], 'outfit + paint');
for (const id of v1.skins.owned) if (!s.owns(id)) fails.push('lost owned skin ' + id);
eq([s.data.heroes.selected, s.data.arsenal.selected], ['pip', 'thunderclap'], 'v2 defaults selected');
s.flush();
const written = JSON.parse(localStorage.getItem(SAVE_KEY));
eq(written.version, 3, 'written version');
for (const k of Object.keys(v1)) if (k !== 'version') same(written[k], v1[k], 'written v1 field ' + k);
// ---- 2. buy Spectra, then an old tab writes a v1-shaped object over the main key ----
s.addCoins(3000);
if (!U.buyWeapon(s, 'spectra')) fails.push('buyWeapon spectra failed');
s.flush();
eq(JSON.parse(localStorage.getItem(OWNED_KEY)).arsenal.includes('spectra'), true, 'backup key has spectra');
localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v1, coins: 50 }));
s = fresh();
eq(s.data.arsenal.owned.includes('spectra'), true, 'spectra survives an old-tab write');
eq(U.isWeaponUnlocked(s.data, 'spectra'), true, 'spectra unlocked after old-tab write');
// ---- 3. reset clears the backup ----
s.addCoins(3000);
U.buyWeapon(s, 'spectra');
s.flush();
s.reset();
s = fresh();
eq(s.data.arsenal.owned.includes('spectra'), false, 'spectra gone after reset');
eq(JSON.parse(localStorage.getItem(OWNED_KEY)), { heroes: ['pip'], arsenal: ['thunderclap'] }, 'backup holds only defaults');
same(s.data.settings, v1.settings, 'settings kept by reset');
eq(JSON.parse(localStorage.getItem(PROGRESS_KEY)), { unlockedLevel: 1, stars: {}, elite: {} }, 'progress backup reset');
eq(s.data.coins, 0, 'coins reset');
// ---- 4. unknown top-level keys survive a round trip ----
localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v1, futureX: { a: 1, b: [2, 3] } }));
s = fresh();
eq(s.data.futureX, { a: 1, b: [2, 3] }, 'futureX loaded');
s.flush();
eq(JSON.parse(localStorage.getItem(SAVE_KEY)).futureX, { a: 1, b: [2, 3] }, 'futureX written back');
// ---- 5. selection rules (a hand-written lower level: no progress backup may lift it) ----
localStorage.removeItem(PROGRESS_KEY);
localStorage.setItem(SAVE_KEY, JSON.stringify({ ...v1, unlockedLevel: 4, heroes: { owned: ['pip'], selected: 'vex' }, arsenal: { owned: ['thunderclap'], selected: 'voidsiphon' } }));
s = fresh();
eq([s.data.heroes.selected, s.data.arsenal.selected], ['pip', 'thunderclap'], 'locked selections fall back');
U.selectHero(s, 'cinder');
eq([s.data.heroes.selected, s.data.arsenal.selected], ['cinder', 'thunderclap'], 'Cinder on level 4 keeps the weapon');
s.update((d) => { d.unlockedLevel = 5; });
U.selectHero(s, 'cinder');
eq(s.data.arsenal.selected, 'emberstorm', 'Cinder on level 5 brings Emberstorm');
eq(U.selectWeapon(s, 'voidsiphon'), false, 'locked weapon cannot be selected');
eq(U.newlyUnlocked({ ...s.data, unlockedLevel: 2 }, { ...s.data, unlockedLevel: 3 }).map((x) => x.id), ['glacier'], 'newlyUnlocked L2->L3');
localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OWNED_KEY); localStorage.removeItem(PROGRESS_KEY);
return { pass: fails.length === 0, fails };
