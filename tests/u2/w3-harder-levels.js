// @smoke --seconds 0 --shots 0
// Update 3 stage 3 "levels" (STAGE3.md level contract): harder level data per world and its runtime pieces.
// 1. Data: world 1 untouched; L11-15 keep every non-horde event and only gain Boomlings + Mendlings in their mixes;
//    new enemy type ids per world (W2 blaster + healer, W3 + sniper + spawner, W4 + flyer, W5 all), elite fractions
//    0 in W2-3 rising to <= 15% in W4-5; more red / ÷ gates in later worlds (a gate row always keeps a good gate);
//    cursed barrels (always next to a good barrel, never in the first two barrel rows), rising W3-5; hidden gates
//    with their screening horde right in front on the same lane (W2+).
// 2. Runtime: a cursed barrel shot open costs troops (never the last member, the shield blocks it) or one Mk;
//    running into it costs one member and no curse; it renders as the purple skull drum. A hidden gate shows '?',
//    ignores raise hits, reveals when the enemies in front are gone (or after REVEAL_HITS), and passing it applies
//    its real op. 3. Later-world levels run on High and Low without errors, and the pro bot clears L16 / L26.
const g = window.__game, d = g.debug;
g.loop.stop();
const L = await import('/src/data/levels.js');
const GEN = await import('/src/data/levelgen.js');
const H = await import('/src/data/harder.js');
const { REVEAL_NEAR, REVEAL_HITS } = await import('/src/game/gates.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const NEW = ['blaster', 'healer', 'sniper', 'spawner', 'flyer'];
const WANT = { 2: ['blaster', 'healer'], 3: ['blaster', 'healer', 'sniper', 'spawner'], 4: NEW, 5: NEW };
const worth = (e) => (e.op === 'add' ? e.value : e.op === 'mul' ? 100 : -100);

// ---------------- 1. data ----------------
const perWorld = {};
for (const lv of L.LEVELS) {
  const w = lv.world, s = H.hardStats(lv);
  const pw = (perWorld[w] ||= { levels: 0, red: 0, gates: 0, cursed: 0, hidden: 0, elite: 0, types: new Set() });
  pw.levels++; pw.red += s.red; pw.cursed += s.cursed; pw.hidden += s.hidden; pw.elite = Math.max(pw.elite, s.elite);
  pw.gates += lv.events.filter((e) => e.type === 'gate').length;
  pw.turned = (pw.turned || 0) + lv.events.filter((e) => e.type === 'gate' && e.red).length;
  const grow = new Map();
  for (const e of lv.events) if (e.type === 'gate') (grow.get(e.at) || grow.set(e.at, []).get(e.at)).push(e);
  for (const row of grow.values()) if (row.length === 2) { pw.rows = (pw.rows || 0) + 1; if (row.every((e) => worth(e) > 0)) pw.free = (pw.free || 0) + 1; }
  for (const k of Object.keys(s.types)) if (NEW.includes(k)) pw.types.add(k);
  const hordes = lv.events.filter((e) => e.type === 'horde');
  if (w === 1) {
    ok(s.cursed === 0 && s.hidden === 0 && s.screens === 0 && s.elite === 0, `L${lv.id}: world 1 got stage-3 items ${JSON.stringify(s)}`);
    ok(hordes.every((e) => NEW.every((k) => !e.mix[k])), `L${lv.id}: world 1 mix has a new type`);
    ok(lv.events.every((e) => !e.red), `L${lv.id}: world 1 gate turned red`);
    continue;
  }
  // mixes still sum to 1 and only use known / contract type ids
  for (const e of hordes) {
    const sum = Object.values(e.mix).reduce((a, b) => a + b, 0);
    ok(Math.abs(sum - 1) < 0.02, `L${lv.id} horde@${e.at} mix sums to ${sum}`);
    ok(Object.keys(e.mix).every((k) => ['grunt', 'runner', 'tank', 'shield', 'bomber', ...NEW].includes(k)), `L${lv.id} mix keys ${Object.keys(e.mix)}`);
    ok(!(e.elite > 0) || (w >= 4 && e.elite <= 0.18), `L${lv.id} elite ${e.elite} in world ${w}`);
  }
  if (lv.id <= 15) {
    ok(s.cursed === 0 && s.screens === 0 && lv.events.every((e) => !e.red && !e.hidden), `L${lv.id}: hand-made level got more than a mix pass`);
    continue;
  }
  // every L/R gate row keeps a gate worth taking
  const rows = new Map();
  for (const e of lv.events) if (e.type === 'gate') (rows.get(e.at) || rows.set(e.at, []).get(e.at)).push(e);
  for (const [at, row] of rows) if (row.length === 2) ok(row.some((e) => worth(e) > 0), `L${lv.id} row@${at}: no good gate (${row.map((e) => e.op + (e.value ?? e.rung)).join(' / ')})`);
  // cursed barrels sit next to a good barrel and never in the first two barrel rows
  const brows = [...new Set(lv.events.filter((e) => e.type === 'barrel').map((e) => e.at))].sort((a, b) => a - b);
  for (const e of lv.events.filter((x) => x.type === 'barrel' && x.reward.kind === 'cursed')) {
    ok(brows.indexOf(e.at) >= 2, `L${lv.id}: cursed barrel in barrel row ${brows.indexOf(e.at)}`);
    ok(lv.events.some((o) => o.type === 'barrel' && o !== e && o.at === e.at && o.reward.kind !== 'cursed'), `L${lv.id}: cursed barrel @${e.at} has no good partner`);
    ok(['troops', 'mk'].includes(e.reward.curse) && e.reward.amount > 0, `L${lv.id}: cursed reward ${JSON.stringify(e.reward)}`);
  }
  // hidden gates: a screen horde on the same lane right in front
  for (const e of lv.events.filter((x) => x.type === 'gate' && x.hidden)) {
    const scr = hordes.find((h) => h.screen && h.lane === e.lane && h.at === e.at - H.SCREEN_DZ);
    ok(!!scr && scr.count >= 10 && scr.hpMul > 0, `L${lv.id}: hidden gate @${e.at}${e.lane} has no screen horde`);
  }
}
for (const w of [2, 3, 4, 5]) {
  const pw = perWorld[w];
  ok(WANT[w].every((k) => pw.types.has(k)), `world ${w} types ${[...pw.types]} (want ${WANT[w]})`);
  if (w <= 3) ok(!pw.types.has('flyer') && pw.elite === 0, `world ${w}: flyers / elites too early`);
  ok(pw.hidden >= 3, `world ${w}: only ${pw.hidden} hidden gates`);
}
ok(perWorld[2].types.size === 2 && !perWorld[2].types.has('sniper'), 'world 2 types');
ok(perWorld[5].elite > perWorld[4].elite && perWorld[5].elite <= 0.18 && perWorld[4].elite >= 0.08, `elite W4 ${perWorld[4].elite} W5 ${perWorld[5].elite}`);
const redShare = (w) => perWorld[w].red / perWorld[w].gates;
ok(redShare(5) > redShare(3) && redShare(4) > redShare(2) && redShare(3) >= redShare(2), `red share ${[1, 2, 3, 4, 5].map((w) => redShare(w).toFixed(2))}`);
// the red pass turned free + gates red in every later world (more of them later); free rows (both gates good) get rarer
for (const w of [2, 3, 4, 5]) ok(perWorld[w].turned >= 4, `world ${w}: only ${perWorld[w].turned} gates turned red`);
const freeShare = (w) => perWorld[w].free / perWorld[w].rows;
ok(freeShare(5) < freeShare(2) && freeShare(4) < freeShare(2), `free rows ${[2, 3, 4, 5].map((w) => freeShare(w).toFixed(2))}`);
const curse = (w) => perWorld[w].cursed / perWorld[w].levels;
ok(curse(3) > curse(2) && curse(5) >= curse(3) && curse(4) >= curse(3) * 0.8, `cursed per level ${[2, 3, 4, 5].map((w) => curse(w).toFixed(2))}`);
info.worlds = Object.fromEntries(Object.entries(perWorld).map(([w, p]) => [w, { red: redShare(w).toFixed(2), turned: p.turned, free: `${p.free || 0}/${p.rows}`, cursed: p.cursed, hidden: p.hidden, elite: p.elite, types: [...p.types].join(',') }]));
// the passes are deterministic and part of generateLevel (w3-levels compares it to the shipped list)
for (const id of [18, 37, 49]) {
  const a = JSON.stringify(GEN.generateLevel(id)), b = JSON.stringify(GEN.generateLevel(id));
  ok(a === b && /"cursed"|"hidden"|"blaster"/.test(a), `L${id} regenerates with the stage-3 items`);
}

// ---------------- 2a. cursed barrel at runtime ----------------
d.setLoadout('pip', 'thunderclap');
d.setAutopilot(false);
const cursedRun = (curse, { shield = false, mk = 3, troops = 60, run = false } = {}) => {
  d.startCustom({ length: 400, speed: 9, events: [{ ...L.barrel(40, 'C', 50, 'cursed', 12), reward: { kind: 'cursed', amount: 12, curse } }] });
  g.weapons.enabled = false;
  d.setMk(mk); d.give('troops', troops - g.squad.count);
  if (shield) d.give('shield');
  let b = null, guard = 0;
  while (!(b = g.barrels.live.find((x) => x.state === 'live')) && guard++ < 200) g.step(1 / 60);
  const before = { n: g.squad.count, mk: g.weapons.mk };
  let popped = null;
  const off = g.events.on('barrel:break', (p) => { popped = p.reward; });
  if (run) { guard = 0; while (b.state === 'live' && guard++ < 600) g.step(1 / 60); }
  else g.barrels.breakBarrel(b, true);
  off();
  g.step(1 / 60);
  return { before, after: { n: g.squad.count, mk: g.weapons.mk }, popped, b };
};
let r = cursedRun('troops');
ok(r.b.visual === null || r.b.visual.cursed, 'cursed barrel uses the cursed drum');
ok(r.before.n - r.after.n === Math.max(12, Math.round(60 * 0.15)), `troops curse: ${r.before.n} -> ${r.after.n}`);
ok(r.popped && r.popped.kind === 'cursed' && r.popped.amount === r.before.n - r.after.n, `curse popup ${JSON.stringify(r.popped)}`);
r = cursedRun('troops', { troops: 5 });
ok(r.after.n === 1, `troops curse never takes the last member: ${r.before.n} -> ${r.after.n}`);
r = cursedRun('troops', { shield: true });
ok(r.after.n === r.before.n && r.popped.blocked, `shield blocks the curse: ${r.before.n} -> ${r.after.n}`);
r = cursedRun('mk', { mk: 3 });
ok(r.after.mk === 2 && r.after.n === r.before.n, `mk curse: Mk ${r.before.mk} -> ${r.after.mk}, squad ${r.before.n} -> ${r.after.n}`);
r = cursedRun('mk', { mk: 1 });
ok(r.after.mk === 1 && r.after.n < r.before.n, 'mk curse at Mk I costs troops instead');
r = cursedRun('troops', { run: true });
ok(r.before.n - r.after.n === 1 && r.popped && r.popped.granted === false, `running into a cursed barrel: ${r.before.n} -> ${r.after.n}`);
// the display flickers between the treasure heap and the skull
d.startCustom({ length: 400, speed: 9, events: [{ ...L.barrel(60, 'L', 500, 'cursed', 12), reward: { kind: 'cursed', amount: 12, curse: 'troops' } }] });
g.weapons.enabled = false;
let seenSkull = false, seenPile = false;
for (let i = 0; i < 300; i++) {
  g.step(1 / 60); g.barrels.sync(1 / 60);
  const b = g.barrels.live[0], t = b && b.display && b.display.userData.tell;
  if (t) { if (t.skull.visible) seenSkull = true; else if (t.pile.visible) seenPile = true; }
}
ok(seenSkull && seenPile, `cursed display tell (skull ${seenSkull}, pile ${seenPile})`);

// ---------------- 2b. hidden gate at runtime ----------------
const hiddenRun = (screen) => {
  const ev = [L.gate(80, 'L', 'add', { value: 20, max: 60, hidden: true }), L.gate(80, 'R', 'add', { value: 2, max: 5 })];
  if (screen) ev.push(L.horde(80 - H.SCREEN_DZ, 30, { grunt: 0.6, shield: 0.4 }, 'L', { hpMul: 400 }));
  d.startCustom({ length: 400, speed: 9, events: ev });
  d.give('troops', 20 - g.squad.count);
  g.weapons.enabled = false;
  g.heroes.guard = 999;
  let guard = 0, gt = null;
  while (!(gt = g.gates.live.find((x) => x.lane === 'L')) && guard++ < 300) g.step(1 / 60);
  return gt;
};
let gt = hiddenRun(true);
ok(gt && gt.hidden, 'hidden gate spawns hidden');
g.gates.sync(1 / 60);
ok(gt.visual.label.key && gt.visual.label.key.startsWith('?|'), `hidden label ${gt.visual.label.key}`);
g.gates.hit(gt, { gw: 5, x: gt.x, y: 1, z: gt.z });
ok(gt.value === 20 && gt.hidden, `a hit on a hidden gate does not raise it (${gt.value})`);
// enemies in front: still hidden at REVEAL_NEAR - 5 while they stand there
let guard = 0;
while (g.squad.leader.z - gt.z > REVEAL_NEAR - 5 && guard++ < 900) g.step(1 / 60);
ok(gt.hidden, 'stays hidden while the screen stands in front');
g.horde.skipAll(); // the screen is cleared
for (let i = 0; i < 20; i++) g.step(1 / 60);
ok(!gt.hidden, 'revealed once the enemies in front are gone');
g.gates.hit(gt, { gw: 5, x: gt.x, y: 1, z: gt.z });
ok(gt.value > 20, `a revealed gate raises again (${gt.value})`);
// REVEAL_HITS path + pass applies the real op while hidden
gt = hiddenRun(true);
g.gates.hit(gt, { gw: REVEAL_HITS + 1, x: gt.x, y: 1, z: gt.z });
for (let i = 0; i < 10; i++) g.step(1 / 60);
ok(!gt.hidden, 'revealed after REVEAL_HITS hits');
// a single centre gate (the squad runs straight through it), kept hidden up to the pass
d.startCustom({ length: 400, speed: 9, events: [L.gate(80, 'C', 'add', { value: 20, max: 60, hidden: true })] });
g.weapons.enabled = false;
guard = 0;
while (!(gt = g.gates.live[0]) && guard++ < 300) g.step(1 / 60);
g.gates.checkReveal = () => {}; // (instance override: never reveals before the pass)
const n0 = g.squad.count;
guard = 0;
while (gt.state === 'live' && guard++ < 1200) g.step(1 / 60);
delete g.gates.checkReveal;
ok(!gt.hidden, 'passing reveals the gate');
ok(g.squad.count >= n0 + 20 - 1, `passing a hidden gate applies +20: ${n0} -> ${g.squad.count}`);
d.toTitle();

// ---------------- 3. later worlds on High + Low, quick playability ----------------
const errs = [];
const onErr = (e) => errs.push(String(e.message || e));
window.addEventListener('error', onErr);
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  for (const id of [18, 36, 47]) {
    d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
    d.startLevel(id);
    for (let i = 0; i < 4; i++) { d.simulate(6); g.barrels.sync(1 / 60); g.gates.sync(1 / 60); }
    ok(g.state === 'playing' || g.state === 'result' || (g.lastResult != null), `L${id} on ${q}: state ${g.state}`);
  }
}
g.applyQuality('high');
const play = {};
for (const id of [16, 26]) {
  g.save.reset();
  d.setUpgrades({ damage: 14, rate: 14, squad: 12, tier: 3 });
  let won = false, tries = 0;
  while (!won && tries < 3) {
    tries++;
    d.setAutopilot('pro', tries, { crates: 'never', ability: true, loadout: 'keep' });
    d.startLevel(id);
    let s, k = 0;
    do { s = d.simulate(30); k++; } while (s.state === 'playing' && k < 20);
    won = !!(s.result && s.result.win);
  }
  play[id] = `${won ? 'won' : 'LOST'} in ${tries}`;
  ok(won, `pro could not clear L${id} in 3 tries`);
}
info.play = play;
window.removeEventListener('error', onErr);
ok(errs.length === 0, `errors: ${errs.join(' | ')}`);
d.toTitle();
g.save.reset();
return { pass: fails.length === 0, fails, info };
