// @smoke --seconds 0 --shots 0
// Online stage 3, the scripted rival's win rate (src/online/bot.js at level 0) against the casual autopilot:
// 20 matches, seeds 1-20 (road seed i * 7919 + 13, autopilot seed i, like scripts/balance/versus.mjs --bot 0), the form
// reset before each, Pip + Thunderclap, sabotage both ways (I send whenever I can, my receiver keeps its earned check):
// - the bot wins 7-13 of them (35-65 %);
// - every match ends with a verdict by 330 s of match clock;
// - my receiver dropped none of the bot's sabotage as 'bad', 'spam', 'old' or 'out' (only 'off' after my fall, and
//   'gone' when it fell before one landed).
// Deterministic: it either passes or the integrator re-tunes BOT.level.median[3] (STAGE3 "Calibration").
const g = window.__game;
const { on7 } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { versus } = k;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const drops = {};
g.events.on('sab:drop', (p) => { if (p.from === 1) drops[p.why] = (drops[p.why] || 0) + 1; });

try {
  const runs = [];
  let botWins = 0;
  for (let i = 1; i <= 20; i++) {
    k.bot.botForm.reset();
    const seed = i * 7919 + 13;
    const link = k.start({ seed, ap: 'casual', apSeed: i, pick: { ...k.bot.pickBot({ seed }), level: 0 } });
    ok(versus.sab.trust === false, 'the receiver trusts big ones');
    let guard = 0;
    while (versus.live && g.state === 'playing' && !versus.result && versus.simT < 340 && guard++ < 4000) {
      versus.simulate(0.1);
      if (versus.sab.view().can) versus.sab.send();
    }
    const v = k.rec.verdicts[0];
    if (v && v.result === 'lose') botWins++;
    runs.push(`${i}: me ${versus.t.toFixed(1)} bot ${link.bot.plan.T} -> ${v ? v.result : 'NONE'} @${v ? v.c.toFixed(1) : '-'}`);
    ok(v && v.c <= 330 && k.rec.verdicts.length === 1, `match ${i}: verdict ${JSON.stringify(v)}`);
    k.end();
  }
  info.runs = runs.join('; ');
  info.botWins = botWins;
  info.drops = drops;
  ok(botWins >= 7 && botWins <= 13, `the bot won ${botWins} of 20`);
  ok(!drops.bad && !drops.spam && !drops.old && !drops.out, 'my receiver dropped the bot\'s sabotage: ' + JSON.stringify(drops));
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
}
k.bot.botForm.reset();
return { pass: fails.length === 0, fails, info };
