// @smoke --seconds 0 --shots 0
// Online stage 4: a FRIEND room never changes trophies but pays friend coins: 20 for a win, 10 otherwise, for the
// first 10 friend matches of the UTC day, then 0 ("Friend matches pay coins 10 times a day"). This page and a plain
// second player "Buddy" (transport + room.js) on an in-page hub with the real rules: three matches through REMATCH,
// the day counter set to 9 before the second one (so the second is the 10th of the day, the third the 11th).
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const E = await import('/tests/u2/lib/on8kit.js');
const { dayOf } = await import('/src/online/leagues.js');
const fails = [], info = { coins: [] };
const ok = (c, what) => { if (!c) fails.push(what); };
const { frames } = E.framer(g);
const COINS = 'nimbusRaiders.online.coins';

try {
  E.clearKeys();
  const hub = await E.makeHub();
  const P = await E.openOnline(g, hub, { fields: { tr: 150, pk: 150 } });
  const flow = P.flow;
  const before = JSON.stringify(hub.admin.get('users/me-1'));
  const buddy = await K.player(hub, 'buddy-2', 'Buddy');
  await flow.createRoom();
  const roomB = await buddy.join(flow.room.code);
  await flow.ready(true); await roomB.ready(true);
  let seen = null;
  /** One friend match: `win` = Buddy falls first; else my squad goes first and Buddy a moment later. */
  async function play(win) {
    await E.until(() => !!flow.link && g.versus.live && roomB.state.mid === flow.link.mid, 8000, 50);
    const link = flow.link, linkB = buddy.match(roomB);
    ok(link.mid !== seen, 'a new match');
    seen = link.mid;
    g.debug.setAutopilot('pro', 1);
    await E.until(() => link.clock() > 3.2, 9000, 50);
    const c0 = g.save.data.coins;
    if (win) linkB.fall({ t: 3, d: 30, by: 'dead' });
    else { g.squad.setCount(0, 'versus'); await frames(1); linkB.fall({ t: 3, d: 40, by: 'dead' }); }
    await frames(14, () => g.state === 'result' && ui.current === 'vsresult');
    await E.until(() => ui.current === 'vsresult', 3000);
    for (let i = 0; i < 3; i++) ui.update(1 / 60);
    const res = g.versus.result && g.versus.result.result;
    info.coins.push({ res, paid: g.save.data.coins - c0, text: E.rankText(), key: localStorage.getItem(COINS) });
    return linkB;
  }
  // ---- 1. a win: 20 ----
  let linkB = await play(true);
  let x = info.coins[0];
  ok(x.res === 'win' && x.paid === 20 && /FRIEND MATCH - NO TROPHIES/.test(x.text) && /\+20 COINS/.test(x.text), 'first friend match: ' + JSON.stringify(x));
  ok(!document.querySelector('.screen-vsresult .vsr-rg') && document.querySelector('.vsr-tr').dataset.g === '', 'no trophy numbers in a friend room');
  ok(g.save.data.online.hist[0].k === 'f' && g.save.data.online.hist[0].c === 20 && !('g' in g.save.data.online.hist[0]), 'history row: ' + JSON.stringify(g.save.data.online.hist[0]));
  await E.shot(g, 'friend-win');
  // ---- 2. the 10th friend match of the day, a loss: 10 ----
  localStorage.setItem(COINS, JSON.stringify({ day: dayOf(flow.transport.now()), fw: 0, fp: 9 }));
  roomB.rematch({ ready: true });
  flow.rematch();
  linkB.leave();
  linkB = await play(false);
  x = info.coins[1];
  ok(x.res === 'lose' && x.paid === 10 && /\+10 COINS/.test(x.text) && JSON.parse(x.key).fp === 10, '10th friend match: ' + JSON.stringify(x));
  await E.shot(g, 'friend-lose');
  // ---- 3. the 11th: 0 ----
  roomB.rematch({ ready: true });
  flow.rematch();
  linkB.leave();
  linkB = await play(true);
  x = info.coins[2];
  ok(x.res === 'win' && x.paid === 0 && /Friend matches pay coins 10 times a day/.test(x.text) && document.querySelector('.vsr-coins').dataset.c === '0', '11th friend match: ' + JSON.stringify(x));
  await E.shot(g, 'friend-nocoins');
  // ---- trophies: nothing changed ----
  ok(JSON.stringify(hub.admin.get('users/me-1')) === before && hub.admin.get('users/buddy-2/tr') === 0, 'a friend room changed a profile: ' + JSON.stringify(hub.admin.get('users/me-1')));
  ok(!flow.session.ranked.test.writes.some((w) => w.kind !== 'rk'), 'ranked writes in a friend room (the rank mirror of the visit aside): ' + JSON.stringify(flow.session.ranked.test.writes));
  linkB.leave(); await roomB.leave();
  flow.leave('online');
  await E.until(() => P.view() === 'hub', 3000);
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
E.clearKeys();
return { pass: fails.length === 0, fails, info };
