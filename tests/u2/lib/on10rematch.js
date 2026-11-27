// Body of tests/u2/on10-rematch.js (390 x 844) and on10-rematch-small.js (360 x 640): a friend match of four (this
// page + Ben, Cyd and Dan made of transport + room.js + match.js on an in-page hub with the real rules) through the
// real screens: I fall first and WATCH, the others fall, everyone gets the same final table; then REMATCH: BEN WANTS A
// REMATCH, my tap -> WAITING FOR 2 FRIENDS, Cyd asks -> WAITING FOR DAN, Dan leaves -> the rematch starts with 3.
import * as F from '/tests/u2/lib/on10kit.js';

export async function rematchScenario(g) {
  const ui = g.ui;
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  const { frames } = F.framer(g);
  const note = () => F.txt(document.querySelector('.screen-vsresult .vsr-rm'));
  const rows = () => [...document.querySelectorAll('.screen-vsresult .vsr-places li:not(.vsr-h)')].map((li) => Number(li.dataset.slot)).join('');
  let fr = [];
  try {
    F.clearKeys();
    const hub = await F.makeHub();
    const P = await F.openOnline(g, hub);
    const flow = P.flow;
    await flow.createRoom();
    const code = flow.room.code;
    fr = await F.friends(hub, code, 3);
    await F.until(() => flow.room.state.seats.filter(Boolean).length === 4);
    for (const f of fr) await f.room.ready(true);
    await flow.ready(true);
    await F.until(() => !!flow.link && g.versus.live && fr.every((f) => f.link && f.link.mid === flow.link.mid), 8000, 50);
    const link = flow.link;
    ok(link.peers.length === 3 && link.slots.length === 4, `a match of 4: ${link.peers.length} rivals`);
    g.debug.setAutopilot('pro', 1);
    for (let i = 0; i < 300 && link.clock() < 3.4; i++) { await frames(1 / 20); await F.wait(40); } // (my run moves too)
    ok(g.versus.t > 1, 'my run did not move: ' + g.versus.t);
    // ---- I fall first: my place is known once the others are 1.1 s past me, then I WATCH ----
    g.squad.setCount(0, 'versus');
    await frames(1);
    for (let t = performance.now(); performance.now() - t < 9000 && ui.current !== 'vsresult';) { await frames(1 / 20); await F.wait(40); }
    info.fell = { t: g.versus.result && g.versus.result.t, state: g.state, screen: ui.current };
    const scr = ui.screens.vsresult;
    ok(ui.current === 'vsresult' && scr.watching(), `I fell first: screen ${ui.current}, watching ${scr.watching && scr.watching()}`);
    ok(F.txt(document.querySelector('.screen-vsresult .ribbon')) === 'YOU CAME 4TH', 'ribbon: ' + F.txt(document.querySelector('.screen-vsresult .ribbon')));
    await F.shot(g, 'rematch-watching');
    // Dan, Cyd and Ben fall one after the other: the final table, on my screen and on every link
    fr[2].fall(); await F.wait(600); fr[1].fall(); await F.wait(1500); fr[0].fall();
    await F.until(() => !scr.watching() && !!g.versus.final, 6000, 50);
    for (let i = 0; i < 3; i++) ui.update(1 / 60);
    await F.until(() => fr.every((f) => f.link.final), 4000, 50);
    const mine = JSON.stringify(g.versus.final);
    ok(!scr.watching() && rows() === '1230', `the final table: watching ${scr.watching()}, rows ${rows()}`);
    ok(fr.every((f) => JSON.stringify(f.link.final) === mine), 'the same table on every link: ' + JSON.stringify([mine, ...fr.map((f) => f.link.final)]));
    info.final = g.versus.final;
    const me = F.txt(document.querySelector('.screen-vsresult .vsr-places li.me'));
    ok(/^4 ?YOU.*[1-9]\d*m$/.test(me) && !/0:00\.0/.test(me), 'my row: ' + me);
    // ---- REMATCH with 1 and 2 missing ----
    await fr[0].room.rematch({ ready: true });
    await F.until(() => note() === 'BEN WANTS A REMATCH', 3000);
    ok(note() === 'BEN WANTS A REMATCH', 'Ben asked: ' + note());
    document.querySelector('.screen-vsresult [data-act="rematch"]').click();
    await F.until(() => note() === 'WAITING FOR 2 FRIENDS', 3000);
    ok(note() === 'WAITING FOR 2 FRIENDS', 'my tap: ' + note());
    await F.shot(g, 'rematch-waiting-2');
    await fr[1].room.rematch({ ready: true });
    await F.until(() => note() === 'WAITING FOR DAN', 3000);
    ok(note() === 'WAITING FOR DAN', 'Cyd asked: ' + note());
    await F.shot(g, 'rematch-waiting-1');
    // ---- Dan leaves: nobody waits for him; the rematch starts with three ----
    const mid0 = link.mid;
    await fr[2].stop();
    await F.until(() => !!flow.link && flow.link.mid !== mid0 && g.versus.live, 9000, 50);
    const l2 = flow.link;
    ok(l2 && l2.mid !== mid0 && l2.peers.length === 2 && l2.peers.map((p) => p.slot).join('') === '12', 'the rematch: ' + JSON.stringify(l2 && l2.peers.map((p) => p.slot)));
    ok(fr.slice(0, 2).every((f) => f.link && f.link.mid === l2.mid), 'Ben and Cyd are in the rematch');
    await frames(0.5);
    ok(document.querySelectorAll('.vs-card .vc-p').length === 3, 'the VS card of the rematch: ' + document.querySelectorAll('.vs-card .vc-p').length);
    await F.shot(g, 'rematch-card-3');
    info.denials = hub.denials.map((d) => d.path || d);
    ok(hub.denials.length === 0, 'denials: ' + JSON.stringify(info.denials));
    g.debug.setAutopilot(false);
    flow.leave('online');
    await F.until(() => P.view() === 'hub', 3000);
    ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  for (const f of fr) await f.stop().catch(() => {});
  F.clearKeys();
  return { pass: fails.length === 0, fails, info };
}
