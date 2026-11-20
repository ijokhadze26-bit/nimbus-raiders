// @smoke --seconds 0 --shots 0
// Online stage 1: a versus match is about skill and leaves single-player alone.
// 1. Shop upgrades are ignored: with every upgrade maxed and every Raider type bought (MANY), the match starts with
//    the same squad, Mk I and damage / fire-rate multipliers as with an empty shop; no typed Raider is in the squad.
// 2. A versus run writes NOTHING to the save: a lost match and a won match leave save.data and the three
//    localStorage keys byte-for-byte as they were (coins, stats, endless best, achievements, daily, modes ...).
// 3. game.pause() is blocked while the match is live and works again afterwards.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { SQUAD_TYPE_IDS } = await import('/src/data/squadtypes.js');
const { versus } = await installOnline(g, g.ui);
const KEYS = ['nimbusRaiders.save.v1', 'nimbusRaiders.owned.v2', 'nimbusRaiders.progress.v3'];
const snap = () => JSON.stringify([g.save.data, KEYS.map((k) => localStorage.getItem(k))]);
const start = (opts = {}) => {
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('pro', 1);
  const link = createTestLink({ game: g, seed: 99, ...opts });
  versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
  return link;
};
const look = () => ({ squad: g.squad.count, mk: g.weapons.mk, dmg: g.weapons.dmgMul, rate: g.weapons.rateMul, typesOn: g.squadTypes.on, typed: g.squad.members.filter((m) => m.type).length, noUp: !!g.run.mods.noUpgrades });

try {
  // ---- 1. upgrades off ----
  g.save.reset();
  start();
  const plain = look();
  versus.simulate(20);
  const plain20 = [Math.round(g.run.dist * 100), g.squad.count, g.run.kills];
  versus.stop();
  d.setUpgrades({ squad: 99, damage: 99, rate: 99, tier: 99, coins: 99 });
  g.save.update((s) => { for (const id of SQUAD_TYPE_IDS) { if (!s.squadTypes.owned.includes(id)) s.squadTypes.owned.push(id); s.squadTypes.mix[id] = 20; } s.coins = 5000; });
  const ups = { ...g.save.data.upgrades };
  ok(Object.values(ups).every((v) => v > 0), 'test setup: upgrades not maxed ' + JSON.stringify(ups));
  // the same save in single-player DOES use them (so the check below means something)
  d.startEndless(99);
  const single = { squad: g.squad.count, mk: g.weapons.mk, dmg: g.weapons.dmgMul, typesOn: g.squadTypes.on };
  d.toTitle();
  start();
  const maxed = look();
  versus.simulate(20);
  const maxed20 = [Math.round(g.run.dist * 100), g.squad.count, g.run.kills];
  info.start = { plain, maxed, single, plain20, maxed20 };
  ok(single.squad > plain.squad && single.dmg > 1 && single.typesOn, `single-player ignored the maxed shop? ${JSON.stringify(single)}`);
  ok(JSON.stringify(plain) === JSON.stringify(maxed), `versus start differs with a maxed shop: ${JSON.stringify(plain)} vs ${JSON.stringify(maxed)}`);
  ok(maxed.mk === 1 && maxed.dmg === 1 && maxed.rate === 1 && !maxed.typesOn && maxed.typed === 0 && maxed.noUp, `versus start not clean: ${JSON.stringify(maxed)}`);
  ok(JSON.stringify(plain20) === JSON.stringify(maxed20), `20 s of the same match differ with a maxed shop: ${plain20} vs ${maxed20}`);
  ok(g.squad.members.every((m) => !m.type), 'a typed Raider joined during the match');

  // ---- 3. pause blocked while live ----
  ok(versus.live && g.state === 'playing', 'match not live');
  g.pause();
  ok(g.state === 'playing', 'game.pause() paused a live match');
  versus.stop();
  ok(!versus.live && g.state === 'title', `stop(): live ${versus.live}, state ${g.state}`);
  d.startEndless(5);
  g.pause();
  ok(g.state === 'paused', 'pause does not work in single-player after a match');
  g.resume(); d.toTitle();

  // ---- 2. nothing saved ----
  await wait(450); // the debounced save of the setup above lands first
  const before = snap();
  // a lost match (rival never falls; the squad is wiped by hand after 25 s)
  let link = start({ rivals: [{ slot: 1, name: 'Rival' }] });
  versus.simulate(25);
  g.squad.setCount(0, 'horde');
  let guard = 0;
  while (g.state === 'playing' && guard++ < 1200) versus.pump(1 / 60, 1 / 60);
  info.lose = { state: g.state, result: versus.result && versus.result.result, award: g.lastAward, fall: link.test.falls.length };
  ok(g.state === 'result' && versus.result && versus.result.result === 'lose', `lost match: ${JSON.stringify(info.lose)}`);
  ok(g.lastAward == null, 'a lost versus run produced a payout');
  d.toTitle();
  // a won match (the rival falls at 12 s)
  link = start({ rivals: [{ slot: 1, name: 'Rival', fallAt: 12 }] });
  guard = 0;
  while (g.state === 'playing' && guard++ < 60 * 40) versus.pump(1 / 60, 1 / 60);
  info.win = { state: g.state, result: versus.result && versus.result.result, award: g.lastAward };
  ok(g.state === 'result' && versus.result && versus.result.result === 'win', `won match: ${JSON.stringify(info.win)}`);
  ok(g.lastAward == null, 'a won versus run produced a payout');
  d.toTitle();
  await wait(450);
  const after = snap();
  ok(before === after, 'a versus run changed the save: ' + diff(JSON.parse(before), JSON.parse(after)));
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false);
  d.toTitle();
  g.save.reset();
}
return { pass: fails.length === 0, fails, info };

function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const r = diff(a[k], b[k], path + '.' + k); if (r) return r; }
  }
  return `${path}: ${JSON.stringify(a).slice(0, 80)} -> ${JSON.stringify(b).slice(0, 80)}`;
}
