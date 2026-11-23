// @smoke --seconds 0 --shots 0
// Online stage 4: a ranked Quick Match against a person (a plain second searcher "Buddy", transport + quick.js), then
// a league-up against the bot. In-page hub with the real rules; its clock jumps over the 20 s claim wait.
// 1. 200 trophies vs Buddy's 0: the VS card shows both badges; at GO my stake (10, o = Buddy's record trophies) is
//    on the hub, in session.profile and in the save's cache; Buddy falls -> YOU WIN! -> "+20" SAVING... -> saved,
//    coins and the first win of the day; rk mirrors my trophies.
// 2. 290 trophies + a bot win -> 318: the YOU REACHED SILVER LEAGUE! moment, on-silver owned and its line on the result.
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const Q = await import('/tests/u2/lib/on6kit.js');
const E = await import('/tests/u2/lib/on8kit.js');
const { humanStake, humanGain, leagueOf } = await import('/src/online/leagues.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { frame, frames } = E.framer(g);
let buddy = null;

try {
  E.clearKeys();
  const hub = await E.makeHub();
  const P = await E.openOnline(g, hub, { fields: { tr: 200, pk: 200 } });
  const flow = P.flow;
  buddy = await Q.searcher(hub, 'buddy-2', 'Buddy');
  buddy.tap();
  await E.wait(100);
  P.q('.on-quick').click();
  await E.until(() => !!flow.link && g.versus.live, 9000, 50);
  ok(!!flow.link && flow.quick.match && flow.quick.match.kind === 'human', 'no human quick match');
  frame();
  const card = document.querySelector('.vs-card');
  const trs = [...card.querySelectorAll('.vc-tr')].map((n) => n.textContent.trim());
  ok(trs.join() === '200,0' && card.querySelectorAll('.vc-tr .lg-badge').length === 2, 'VS card trophies: ' + trs.join());
  await E.shot(g, 'ranked-vscard');
  await E.until(() => flow.link.clock() > 0.3, 8000, 50);
  frame();
  await E.until(() => flow.session.ranked.state === 'staked', 5000);
  const me = hub.admin.get('users/me-1');
  ok(me && me.tr === 200 - humanStake(200) && me.l === 1 && me.sk && me.sk.b === false && me.sk.o === 0 && me.sk.s === 10 && me.sk.m === flow.link.mid, 'the stake on the hub: ' + JSON.stringify(me));
  ok(flow.session.profile.tr === 190 && g.save.data.online.tr === 190 && hub.admin.get('rk/me-1') === 190, `staked trophies shown: profile ${flow.session.profile.tr} save ${g.save.data.online.tr} rk ${hub.admin.get('rk/me-1')}`);
  g.debug.setAutopilot('pro', 1);
  await E.until(() => flow.link.clock() > 0.6, 4000, 50);
  buddy.link.fall({ t: 0.5, d: 6, by: 'dead' });
  await frames(14, () => g.state === 'result' && ui.current === 'vsresult');
  await E.until(() => ui.current === 'vsresult', 3000);
  ok(g.versus.result && g.versus.result.result === 'win', 'verdict: ' + JSON.stringify(g.versus.result));
  await E.until(() => flow.session.ranked.state === 'saving', 3000);
  for (let i = 0; i < 2; i++) ui.update(1 / 60);
  const G = humanGain(200, 0);
  info.saving = E.rankText();
  ok(new RegExp(`\\+${G}`).test(info.saving) && /SAVING\.\.\./.test(info.saving), 'SAVING... line: ' + info.saving);
  await E.shot(g, 'ranked-saving');
  await E.claimNow(g, hub, flow);
  info.saved = E.rankText();
  const t = g.versus.result.t, c = 60 + Math.min(60, Math.floor(t / 4)) + 100;
  const tr = document.querySelector('.screen-vsresult .vsr-tr');
  ok(tr.dataset.state === 'saved' && tr.dataset.g === String(G) && new RegExp(`\\+${G}`).test(info.saved) && /220/.test(info.saved) && !/SAVING/.test(info.saved), 'saved line: ' + info.saved);
  ok(document.querySelector('.vsr-coins').dataset.c === String(c) && /FIRST WIN TODAY/.test(info.saved), `coins (want ${c}): ${info.saved}`);
  const p = hub.admin.get('users/me-1');
  ok(p.tr === 200 + G && p.w === 1 && p.l === 0 && !p.sk && hub.admin.get('rk/me-1') === 200 + G && g.save.data.online.tr === 200 + G, 'after the claim: ' + JSON.stringify(p));
  const rg = document.querySelector('.screen-vsresult .vsr-places li:not(.me) .vsr-rg');
  ok(rg && rg.textContent === '0 TROPHIES', `Buddy's row (0 trophies: nothing to lose): ${rg && rg.textContent}`);
  await E.shot(g, 'ranked-saved');
  document.querySelector('.screen-vsresult [data-act="leave"]').click();
  await E.until(() => ui.current === 'online', 4000);
  await buddy.stop(); buddy = null;
  // ---- 2. the league-up moment ----
  E.seed(hub, 'me-1', { tr: 290, pk: 290 });
  await flow.connect();
  ok(!g.save.owns('on-silver'), 'on-silver owned before reaching SILVER');
  await E.botMatch(g, P, { win: true, botAt: 12, saveWait: false });
  await E.until(() => flow.session.ranked.state === 'saving', 4000);
  hub.jump(21000);
  await E.until(() => !!document.querySelector('.screen-vsresult .vsr-lgup'), 12000);
  const up = document.querySelector('.screen-vsresult .vsr-lgup');
  info.up = up && up.textContent.replace(/\s+/g, ' ').trim();
  ok(up && /YOU REACHED ?SILVER LEAGUE!/.test(info.up) && up.querySelector('.lg-badge.lg-silver.lg-lg'), 'league-up moment: ' + info.up);
  ok(flow.reward.last.leagueUp === true && leagueOf(hub.admin.get('users/me-1/tr')).id === 'silver', 'leagueUp: ' + JSON.stringify(flow.reward.last));
  ok(g.save.owns('on-silver') && !g.save.owns('on-champion') && !g.save.owns('on-wins10'), 'on-silver only: ' + g.save.data.skins.owned.join());
  await E.wait(250);
  await E.shot(g, 'ranked-leagueup');
  await E.wait(3200);
  info.skin = E.rankText();
  ok(/NEW PIP OUTFIT: SILVER STORM! Find it in the SHOP\./.test(info.skin) && !document.querySelector('.screen-vsresult .vsr-lgup'), 'new-skin line / the moment went away: ' + info.skin);
  await E.shot(g, 'ranked-newskin');
  const bad = hub.denials.filter((d) => d.writes.some(([q]) => /^(users|rk)\//.test(q)));
  ok(bad.length === 0, 'profile denials: ' + JSON.stringify(bad).slice(0, 400));
  ok(!E.saysKind(), 'a screen says what kind of rival this is');
  document.querySelector('.screen-vsresult [data-act="leave"]').click();
  await E.until(() => ui.current === 'online', 4000);
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
if (buddy) await buddy.stop().catch(() => {});
E.clearKeys();
return { pass: fails.length === 0, fails, info };
