// SPEC2 §6.11 / §9 foundation-api: every debug function exists and returns the documented shape;
// setLoadout affects the next startLevel; useAbility works for Rally (the squad grows).
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [];
const need = ['setLoadout', 'getLoadout', 'useAbility', 'abilityState', 'setMk', 'give', 'setUpgrades', 'unlockAll', 'startPractice',
  'setAutopilot', 'bossTest', 'zones', 'state', 'startLevel', 'startEndless', 'simulate', 'skipToBoss', 'startCustom', 'perfStart', 'perfStop'];
for (const k of need) if (typeof d[k] !== 'function') fails.push('missing debug.' + k);
const has = (o, keys, what) => { for (const k of keys) if (!(o && k in o)) fails.push(`${what} lacks ${k}`); };
// loadout
const lo = d.setLoadout('rime', 'glacier');
has(lo, ['hero', 'weapon'], 'setLoadout()');
if (JSON.stringify(d.getLoadout()) !== JSON.stringify({ hero: 'rime', weapon: 'glacier' })) fails.push('getLoadout ' + JSON.stringify(d.getLoadout()));
if (g.save.data.heroes.selected !== 'pip') fails.push('setLoadout wrote the save without {save:true}');
let s = d.startLevel(3);
has(s, ['weapon', 'mk', 'tier', 'hero', 'ability', 'guard', 'crates', 'mode', 'killsBy'], 'state()');
has(s.killsBy, ['weapon', 'ability', 'helper', 'other'], 'state().killsBy');
has(s.ability, ['ready', 'left'], 'state().ability');
if (s.hero !== 'rime' || s.weapon !== 'glacier') fails.push(`startLevel used ${s.hero}+${s.weapon}`);
if (s.tier !== s.mk) fails.push('tier alias');
if (s.guard !== 2) fails.push('Rime guard ' + s.guard);
// ref weapon
d.setLoadout('pip', 'ref'); s = d.startLevel(1);
if (s.weapon !== 'ref') fails.push('ref weapon not equipped: ' + s.weapon);
d.simulate(3);
// Mk
if (d.setMk(4) !== 4 || d.state().mk !== 4) fails.push('setMk');
if (d.give('mk', 1) !== 5 || d.give('tier', 1) !== 5) fails.push('give mk / tier alias');
// ability state + Rally
d.setLoadout('pip', 'thunderclap');
d.startPractice({ hero: 'pip', weapon: 'thunderclap', mk: 2 });
const ab = d.abilityState();
has(ab, ['hero', 'ready', 'left', 'cd', 'activeT', 'guard', 'guardMax'], 'abilityState()');
if (!ab.ready) fails.push('practice ability not charged');
const before = g.squad.count;
const used = d.useAbility();
if (used !== true || !(g.squad.count > before)) fails.push(`Rally: used ${used}, ${before} -> ${g.squad.count}`);
if (d.useAbility() !== false) fails.push('ability usable twice');
if (Math.abs(d.abilityState().left - 20) > 0.01) fails.push('cooldown ' + d.abilityState().left);
// upgrades (sanitized)
const ups = d.setUpgrades({ squad: 99, damage: -3, rate: 2.7, tier: 1, coins: 'x' });
if (JSON.stringify(ups) !== JSON.stringify({ squad: 15, damage: 0, rate: 2, tier: 1, coins: 0 })) fails.push('setUpgrades ' + JSON.stringify(ups));
d.setUpgrades({ squad: 0, damage: 0, rate: 0, tier: 0, coins: 0 });
// zones
const z = d.zones();
has(z, ['puddles', 'holes', 'roadTurrets'], 'zones()');
// autopilot opts
if (d.setAutopilot('casual', 3, { crates: 'never', ability: false, loadout: 'auto' }) !== 'casual') fails.push('setAutopilot');
if (g.autopilot.opts.crates !== 'never' || g.autopilot.opts.ability !== false || g.autopilot.opts.loadout !== 'auto') fails.push('autopilot opts');
d.setAutopilot(false);
// bossTest
s = d.bossTest('ironhorn', { weapon: 'gearworks', mk: 4, hero: 'bolt', squad: 40 });
if (s.mode !== 'test' || s.weapon !== 'gearworks' || s.mk !== 4 || s.hero !== 'bolt' || s.squad !== 40) fails.push('bossTest ' + JSON.stringify({ m: s.mode, w: s.weapon, mk: s.mk, h: s.hero, q: s.squad }));
s = d.bossTest('oculon', { weapon: 3 });
if (s.mk !== 3) fails.push('bossTest weapon number = Mk');
// unlockAll (screenshots)
d.unlockAll();
if (g.save.data.arsenal.owned.length !== 7 || g.save.data.heroes.owned.length !== 6) fails.push('unlockAll');
g.save.reset();
d.toTitle();
return { pass: fails.length === 0, fails };
