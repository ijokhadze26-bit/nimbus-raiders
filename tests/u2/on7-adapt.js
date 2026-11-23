// @smoke --seconds 0 --shots 0
// Online stage 3, the scripted rival's adaptive level (src/online/bot.js botForm, pickBot) and its identity:
// 1. botForm.reset(): level 0. 2 losses in a row -> level -1, and the next pickBot plans a lower median fall time;
//    3 wins in a row -> one level up; clamped at -3 / 3; a draw breaks a run.
// 2. A bot match records its own verdict (a win of mine counts as a win); leaving a started match early counts as a
//    loss; a link that never started records nothing.
// 3. Blocked localStorage: level 0, nothing throws, matches still play.
// 4. Identity: every hand name and every picked name passes names.js checkName and !isRude, a bot never takes my own
//    name, about 30 % are Raider-NNNN, heroes / weapons / skins are real ids, trophies within +-60 of mine (>= 0),
//    RIVAL FOUND! lasts 1.5-4 s; the same seed gives the same bot.
const g = window.__game;
const { on7 } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { bot, names } = k;
const { botForm, pickBot, createBotLink } = bot;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const lv = () => botForm.get().lv;
const median = (level) => createBotLink({ seed: 5, pick: { ...pickBot({ seed: 5 }), level }, game: null, clock: () => 0 }).bot.plan.median;

try {
  // ---- 1. the form ----
  botForm.reset();
  ok(lv() === 0 && botForm.get().run === 0 && pickBot({ seed: 3 }).level === 0, 'reset: ' + JSON.stringify(botForm.get()));
  const m0 = median(pickBot({ seed: 5 }).level);
  botForm.record('lose');
  ok(lv() === 0, 'one loss moved the level');
  botForm.record('lose');
  const p1 = pickBot({ seed: 5 });
  ok(lv() === -1 && p1.level === -1 && median(p1.level) < m0, `2 losses: level ${lv()}, pick ${p1.level}, median ${median(p1.level)} vs ${m0}`);
  botForm.record('win'); botForm.record('win');
  ok(lv() === -1, 'two wins moved the level');
  botForm.record('win');
  ok(lv() === 0 && median(pickBot({ seed: 5 }).level) === m0, '3 wins: level ' + lv());
  for (let i = 0; i < 12; i++) botForm.record('lose');
  ok(lv() === -3, 'clamped low: ' + lv());
  for (let i = 0; i < 30; i++) botForm.record('win');
  ok(lv() === 3 && median(3) > m0, 'clamped high: ' + lv());
  botForm.reset();
  botForm.record('lose'); botForm.record('draw'); botForm.record('lose');
  ok(lv() === 0, 'a draw did not break the run of losses: ' + lv());
  botForm.record('win'); botForm.record('win'); botForm.record('draw'); botForm.record('win');
  ok(lv() === 0, 'a draw did not break the run of wins: ' + lv());
  const levels = [-3, -2, -1, 0, 1, 2, 3].map((l) => Math.round(median(l)));
  ok(levels.every((m, i) => !i || m > levels[i - 1]), 'medians by level: ' + levels.join(' '));
  info.medians = levels.join(' ');

  // ---- 2. matches record themselves ----
  botForm.reset();
  let link = k.start({ seed: 9, fallAt: 30, ap: 'pro' });
  k.until(() => { k.tough(); return k.rec.verdicts.length > 0; }, 40);
  ok(k.rec.verdicts.length === 1 && k.rec.verdicts[0].result === 'win' && botForm.get().run === 1, `a won match: ${JSON.stringify(k.rec.verdicts)} form ${JSON.stringify(botForm.get())}`);
  k.run(4);
  k.end();
  ok(botForm.get().run === 1, 'leaving after the verdict recorded again: ' + JSON.stringify(botForm.get()));
  botForm.reset();
  link = k.start({ seed: 10 });
  k.run(6);
  k.end(); // HOME in the middle of the match
  ok(botForm.get().run === -1, 'leaving early is not a loss: ' + JSON.stringify(botForm.get()));
  link = k.start({ seed: 11 });
  k.run(3);
  k.end();
  ok(lv() === -1, 'two early leaves are not two losses: ' + JSON.stringify(botForm.get()));
  botForm.reset();
  createBotLink({ seed: 12, game: null, clock: () => -3 }).leave(); // made for RIVAL FOUND!, never played
  ok(botForm.get().run === 0, 'a link that never started recorded a result');
  // a lost match: I fall first
  botForm.reset();
  link = k.start({ seed: 13, fallAt: 200 });
  k.run(5);
  g.squad.setCount(0, 'test');
  k.until(() => k.rec.verdicts.length > 0, 10);
  ok(k.rec.verdicts.length === 1 && k.rec.verdicts[0].result === 'lose' && botForm.get().run === -1, `a lost match: ${JSON.stringify(k.rec.verdicts)} ${JSON.stringify(botForm.get())}`);
  k.end();

  // ---- 3. blocked storage ----
  botForm.reset();
  const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const block = (on) => { if (on) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } }); else if (desc) Object.defineProperty(window, 'localStorage', desc); };
  let threw = null;
  link = k.start({ seed: 14, fallAt: 26, ap: 'pro' }); // (the game's own save is not under test: block only around the bot)
  block(true);
  try {
    ok(lv() === 0 && pickBot({ seed: 4 }).level === 0, 'blocked storage: level ' + lv());
    botForm.record('lose'); botForm.record('lose'); botForm.reset();
    ok(lv() === 0, 'blocked storage kept a level');
    k.until(() => { k.tough(); return k.rec.verdicts.length > 0; }, 40);
    ok(k.rec.verdicts.length === 1, 'blocked storage: the match did not finish');
  } catch (e) { threw = e.message; } finally { block(false); }
  k.end();
  ok(!!desc, 'localStorage is not an own property of window here');
  ok(!threw, 'blocked storage threw: ' + threw);

  // ---- 4. identity ----
  const badNames = [];
  const { checkName, isRude } = await import('/src/online/names.js');
  const { HERO_IDS } = await import('/src/data/heroes.js');
  const { WEAPON_IDS } = await import('/src/data/weapons.js');
  const { HERO_BY_ID, WEAPON_SKIN_BY_ID } = await import('/src/data/skins.js');
  for (const n of names.BOT_NAMES) if (!checkName(n).ok || isRude(n) || checkName(n).name !== n) badNames.push(n);
  ok(!badNames.length && names.BOT_NAMES.length >= 40, 'hand names that fail the filter: ' + badNames.join(', '));
  let raiders = 0, pips = 0, starters = 0, defaults = 0;
  const bad = [];
  for (let seed = 1; seed <= 300; seed++) {
    const p = pickBot({ seed, tr: seed % 3 ? 500 : 20 });
    const mine = pickBot({ seed, avoid: p.name.toUpperCase() });
    if (mine.name === p.name) bad.push(`seed ${seed}: took my name ${p.name}`);
    if (!checkName(p.name).ok || isRude(p.name)) bad.push(`seed ${seed}: name ${p.name}`);
    if (!HERO_IDS.includes(p.hero) || !WEAPON_IDS.includes(p.weapon) || !HERO_BY_ID[p.heroSkin] || !WEAPON_SKIN_BY_ID[p.weaponSkin]) bad.push(`seed ${seed}: ids ${JSON.stringify(p)}`);
    const base = seed % 3 ? 500 : 20;
    if (p.tr < Math.max(0, base - 60) || p.tr > base + 60) bad.push(`seed ${seed}: tr ${p.tr} for ${base}`);
    if (!(p.readyIn >= 1.5 && p.readyIn <= 4)) bad.push(`seed ${seed}: readyIn ${p.readyIn}`);
    if (JSON.stringify(pickBot({ seed, tr: base })) !== JSON.stringify(p)) bad.push(`seed ${seed}: not the same bot twice`);
    if (/^Raider-\d{4}$/.test(p.name)) raiders++;
    if (p.hero === 'pip') pips++;
    if (p.weapon === 'thunderclap') starters++;
    if (p.heroSkin === 'classic' && p.weaponSkin === 'factory') defaults++;
  }
  ok(!bad.length, bad.slice(0, 6).join('; '));
  ok(raiders >= 60 && raiders <= 120, `Raider-NNNN names: ${raiders} / 300`);
  ok(pips >= 120 && pips <= 210 && starters >= 120 && starters <= 210, `starters: pip ${pips}, thunderclap ${starters} / 300`);
  info.identity = `Raider-NNNN ${raiders}/300, pip ${pips}, thunderclap ${starters}, both skins default ${defaults}; e.g. ${[1, 2, 3, 4, 5].map((s) => pickBot({ seed: s }).name).join(', ')}`;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
}
botForm.reset();
return { pass: fails.length === 0, fails, info };
