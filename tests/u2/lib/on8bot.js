// Body of tests/u2/on8-bot.js (390 x 844) and on8-bot-small.js (360 x 640).
// Online stage 4: ranked Quick Match against the bot, this page alone on an in-page hub with the real rules.
// 1. a win at 100 trophies: staked 10 at GO, SAVING... then "+28" with the badge and 128, +coins and the first win
//    of the day, the rival's row shows its change, the history row has g / c, the hub profile and rk agree;
// 2. a loss: "-10" (the loss was saved at GO), the stake closed, coins for the time played;
// 3. the daily limit reached (cc 40 today): no stake, "NO TROPHIES THIS TIME" + why, coins still paid.
// Nothing on the page says what kind of rival this is.
import * as E from '/tests/u2/lib/on8kit.js';
import { dayOf, botGain, botStake, humanStake } from '/src/online/leagues.js';

export async function botScenario(g) {
const ui = g.ui;
g.loop.stop();
const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
const ok = (c, what) => { if (!c) fails.push(what); };
const tr = () => document.querySelector('.screen-vsresult .vsr-tr');
const leave = async () => { document.querySelector('.screen-vsresult [data-act="leave"]').click(); await E.until(() => ui.current === 'online', 4000); await E.wait(400); };
let said = false;
/** Every piece of the result is inside the frame, and the panel can be scrolled to its buttons. */
const fits = async (what) => {
  E.inFrame(['.screen-vsresult .vsr-tr', '.screen-vsresult .vsr-coins', '.screen-vsresult [data-act="share"]', '.screen-vsresult [data-act="leave"]'], fails, what);
  const b = document.querySelector('.screen-vsresult [data-act="share"]');
  b.scrollIntoView({ block: 'nearest' });
  await E.wait(50);
  const r = b.getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
  ok(r.bottom <= app.bottom + 1 && r.top >= app.top - 1, `${what}: SHARE cannot be reached (${Math.round(r.top)}..${Math.round(r.bottom)} in ${Math.round(app.height)})`);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  ok(hit && hit.closest('[data-act="share"]'), `${what}: SHARE is covered by ${hit && hit.className}`);
  const sc = b.closest('.screen'); if (sc) sc.scrollTop = 0;
  info[what + 'H'] = Math.round(document.querySelector('.screen-vsresult .panel').getBoundingClientRect().height);
};

try {
  E.clearKeys();
  const hub = await E.makeHub();
  const P = await E.openOnline(g, hub, { fields: { tr: 100, pk: 100 } });
  const flow = P.flow;
  ok(flow.session.profile.tr === 100, 'seeded profile read: ' + JSON.stringify(flow.session.profile));
  // ---- 1. a win ----
  const coins0 = g.save.data.coins;
  const m1 = await E.botMatch(g, P, { win: true, botAt: 14, saveWait: false });
  ok(ui.current === 'vsresult' && m1.result.result === 'win', 'win: ' + JSON.stringify(m1.result));
  await E.until(() => flow.session.ranked.state === 'saving', 4000);
  info.saving = E.rankText();
  ok(tr() && tr().dataset.state === 'saving' && /\+28/.test(info.saving) && /SAVING\.\.\./.test(info.saving) && /128/.test(info.saving), 'SAVING... line: ' + info.saving);
  ok(hub.admin.get('users/me-1/tr') === 100 - botStake(100) && hub.admin.get('users/me-1/sk/b') === true, 'staked 10 at GO: ' + JSON.stringify(hub.admin.get('users/me-1')));
  if (/\bBOT\b/i.test(document.body.innerText)) said = true;
  await E.shot(g, 'bot-win-saving');
  await E.claimNow(g, hub, flow);
  info.saved = E.rankText();
  const t1 = m1.result.t, c1 = 60 + Math.min(60, Math.floor(t1 / 4)) + 100;
  ok(tr().dataset.state === 'saved' && tr().dataset.g === '28' && /\+28/.test(info.saved) && !/SAVING/.test(info.saved) && tr().querySelector('.vsr-ok') && tr().querySelector('.lg-badge'), 'saved line: ' + info.saved);
  ok(new RegExp(`\\+${c1 - 100} COINS`).test(info.saved) && /\+100 FIRST WIN TODAY!/.test(info.saved) && document.querySelector('.vsr-coins').dataset.c === String(c1), `coins line (want ${c1}): ${info.saved}`);
  ok(g.save.data.coins - coins0 === c1, `coins paid: ${g.save.data.coins - coins0} (want ${c1})`);
  const p1 = hub.admin.get('users/me-1');
  ok(p1.tr === 100 + botGain(100) && p1.w === 1 && p1.l === 0 && !p1.sk && hub.admin.get('rk/me-1') === 128 && p1.cc === 1 && p1.cd === dayOf(hub.now()), 'hub after the win: ' + JSON.stringify(p1));
  const rg = document.querySelector('.screen-vsresult .vsr-places li:not(.me) .vsr-rg');
  ok(rg && rg.textContent === `-${humanStake(m1.pick.tr)} TROPHIES`, `rival's row tag: ${rg && rg.textContent} (rival had ${m1.pick.tr})`);
  const row1 = g.save.data.online.hist[0];
  ok(row1 && row1.k === 'q' && row1.r === 'w' && row1.g === 28 && row1.c === c1, 'history row: ' + JSON.stringify(row1));
  ok(g.save.data.online.tr === 128 && flow.reward.last.state === 'saved', 'save cache / reward: ' + JSON.stringify({ tr: g.save.data.online.tr, last: flow.reward.last }));
  if (E.saysKind()) said = true;
  await fits('win');
  await E.shot(g, 'bot-win-saved');
  await leave();
  // ---- 2. a loss ----
  const coins1 = g.save.data.coins;
  const m2 = await E.botMatch(g, P, { win: false, meAt: 16 });
  ok(ui.current === 'vsresult' && m2.result.result === 'lose', 'loss: ' + JSON.stringify(m2.result));
  await E.until(() => !hub.admin.get('users/me-1/sk'), 6000);
  for (let i = 0; i < 3; i++) ui.update(1 / 60);
  info.lost = E.rankText();
  const c2 = 15 + Math.min(60, Math.floor(m2.result.t / 4));
  ok(tr().dataset.state === 'saved' && tr().dataset.g === '-10' && /-10/.test(info.lost) && /118/.test(info.lost), 'loss line: ' + info.lost);
  ok(new RegExp(`\\+${c2} COINS`).test(info.lost) && !/FIRST WIN/.test(info.lost) && g.save.data.coins - coins1 === c2, `loss coins (want ${c2}): ${info.lost}`);
  const p2 = hub.admin.get('users/me-1');
  ok(p2.tr === 118 && p2.l === 1 && p2.st === 0 && p2.bs === 1 && !p2.sk && hub.admin.get('rk/me-1') === 118, 'hub after the loss: ' + JSON.stringify(p2));
  ok(g.save.data.online.hist[0].g === -10, 'loss row g: ' + JSON.stringify(g.save.data.online.hist[0]));
  if (E.saysKind()) said = true;
  await fits('lose');
  await E.shot(g, 'bot-lose');
  await leave();
  // ---- 3. the daily limit ----
  E.seed(hub, 'me-1', { cd: dayOf(hub.now()), cc: 40 });
  await flow.connect();
  const m3 = await E.botMatch(g, P, { win: true, botAt: 12, saveWait: false });
  await E.wait(800);
  for (let i = 0; i < 3; i++) ui.update(1 / 60);
  info.cap = E.rankText();
  ok(m3.result.result === 'win' && /NO TROPHIES THIS TIME/.test(info.cap) && /You won 40 times today! Trophies come back tomorrow\./.test(info.cap) && tr().dataset.g === '', 'cap line: ' + info.cap);
  ok(flow.session.ranked.why === 'cap' && hub.admin.get('users/me-1/tr') === 118 && hub.admin.get('users/me-1/l') === 1 && !hub.admin.get('users/me-1/sk'), 'nothing staked at the limit: ' + JSON.stringify(hub.admin.get('users/me-1')));
  ok(/\+\d+ COINS/.test(info.cap) && !/FIRST WIN/.test(info.cap), 'coins at the limit (no second first win): ' + info.cap);
  ok(!document.querySelector('.screen-vsresult .vsr-rg'), 'no rival tag in an unranked match');
  if (E.saysKind()) said = true;
  await fits('cap');
  await E.shot(g, 'bot-cap');
  await leave();
  // ---- 4. a win over 300: the league-up moment and the new skin line (the longest result) ----
  E.seed(hub, 'me-1', { tr: 295, pk: 295, cd: 0, cc: 0 });
  await flow.connect();
  await E.botMatch(g, P, { win: true, botAt: 12, saveWait: false });
  await E.until(() => flow.session.ranked.state === 'saving', 4000);
  hub.jump(21000);
  await E.until(() => !!document.querySelector('.screen-vsresult .vsr-lgup'), 12000);
  const up = document.querySelector('.screen-vsresult .vsr-lgup');
  ok(up && /YOU REACHED ?SILVER LEAGUE!/.test(up.textContent) && g.save.owns('on-silver'), 'league-up: ' + (up && up.textContent));
  await E.wait(700); // (the pop-in is over: sizes are final)
  if (up) E.inFrame(['.screen-vsresult .vsr-lg-in'], fails, 'league-up');
  await E.shot(g, 'bot-leagueup');
  await E.wait(2600);
  info.skin = E.rankText();
  ok(/NEW PIP OUTFIT: SILVER STORM!/.test(info.skin), 'skin line: ' + info.skin);
  await fits('skin');
  await E.shot(g, 'bot-newskin');
  ok(!said, 'a screen said what kind of rival this is');
  const bad = hub.denials.filter((d) => d.writes.some(([p]) => /^(users|rk)\//.test(p)));
  ok(bad.length === 0, 'profile denials: ' + JSON.stringify(bad).slice(0, 400));
  await leave();
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
E.clearKeys();
return { pass: fails.length === 0, fails, info };
}
