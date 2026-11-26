// Body of tests/u2/on10-lobby.js (390 x 844) and on10-lobby-small.js (360 x 640): the lobby of a 4-seat friend room
// with 1, 2, 3 and 4 seated: four tiles in a 2x2 grid (mine first), names with the seat colour, hero + weapon icons,
// READY ticks, the status words, "2 WATCHING", and WATCH LINK copying `?room=CODE&watch=1`. Everything fits the frame
// without scrolling. This page plus plain friends (transport + room.js) on an in-page hub with the real rules.
import * as F from '/tests/u2/lib/on10kit.js';

export async function lobbyScenario(g) {
  const ui = g.ui;
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}`, status: [] };
  const ok = (c, what) => { if (!c) fails.push(what); };
  let fr = [];
  try {
    F.clearKeys();
    const hub = await F.makeHub();
    const P = await F.openOnline(g, hub);
    const flow = P.flow;
    await flow.createRoom();
    await F.until(() => P.view() === 'lobby');
    const code = flow.room.code;
    ok(flow.room.state.max === 4, 'a friend room has 4 seats: ' + flow.room.state.max);
    const tiles = () => [...P.el.querySelectorAll('.on-seats .on-seat')];
    const status = () => P.text('.on-status');
    const check = async (what, n) => {
      await F.wait(500); // (the pop-in is over)
      const ts = tiles();
      info.status.push(`${what}: ${status()}`);
      ok(ts.length === 4, `${what}: 4 tiles (${ts.length})`);
      ok(ts[0].classList.contains('me') && /YOU/.test(F.txt(ts[0])), `${what}: my tile first`);
      ok(ts.filter((t) => !t.classList.contains('empty')).length === n, `${what}: ${n} filled tiles`);
      ok(ts.filter((t) => t.classList.contains('empty')).every((t) => /WAITING FOR A FRIEND/.test(F.txt(t))), `${what}: the empty ones wait for a friend`);
      ok(!P.q('.on-vs'), `${what}: no VS divider`);
      const r0 = ts[0].getBoundingClientRect(), r1 = ts[1].getBoundingClientRect(), r2 = ts[2].getBoundingClientRect();
      ok(Math.abs(r0.top - r1.top) < 2 && r2.top > r0.bottom && Math.abs(r0.left - r2.left) < 2, `${what}: a 2x2 grid`);
      F.inside([...ts, '.on-roomcard', '.on-foot .btn-row', '.on-status', '.on-leave'], fails, what, P.el);
      const body = P.el.querySelector('.on-body') || P.el;
      ok(body.scrollHeight <= body.clientHeight + 1, `${what}: the lobby scrolls (${body.scrollHeight} > ${body.clientHeight})`);
      for (const t of ts.filter((x) => !x.classList.contains('empty'))) {
        const nm = t.querySelector('.on-seat-name span');
        ok(nm && t.querySelector('.on-dot') && t.querySelectorAll('.on-ico').length === 2, `${what}: a filled tile has a dot, a name and two icons`);
        ok(nm && nm.getBoundingClientRect().right <= t.getBoundingClientRect().right, `${what}: the name fits the tile`);
      }
    };
    // ---- 1. alone ----
    await check('alone', 1);
    ok(status() === 'Share the code. Up to 4 can play!', 'alone: ' + status());
    ok(P.q('.on-watchers').hidden, 'no watchers line at 0');
    await F.shot(g, 'lobby-1');
    // ---- 2. Ben sits ----
    fr = await F.friends(hub, code, 3);
    await fr[1].room.leave(); await fr[2].room.leave(); // (Cyd and Dan step out again: one at a time below)
    await F.until(() => flow.room.state.seats.filter(Boolean).length === 2);
    await check('two', 2);
    ok(status() === 'Tap READY when you are set. The match starts when everyone is ready.', 'two: ' + status());
    await fr[0].room.ready(true);
    await F.until(() => /BEN IS READY/.test(status()));
    ok(/BEN IS READY! Tap READY to start\./.test(status()), 'Ben ready: ' + status());
    await fr[0].room.ready(false);
    await F.shot(g, 'lobby-2');
    // ---- 3. Cyd sits, Ben is ready, I am ready ----
    fr[1].room = await fr[1].join(code); fr[1].room.on('start', () => {});
    await F.until(() => flow.room.state.seats.filter(Boolean).length === 3);
    await fr[0].room.ready(true);
    P.tap('[data-act="ready"]');
    await F.until(() => /WAITING FOR CYD\.\.\./.test(status()));
    await check('three', 3);
    ok(status() === 'WAITING FOR CYD...', 'three: ' + status());
    const ben = tiles().find((t) => /Ben/.test(F.txt(t)));
    ok(ben && ben.classList.contains('ready') && /READY/.test(F.txt(ben.querySelector('.on-seat-state'))), 'Ben has the READY tick');
    await F.shot(g, 'lobby-3');
    // ---- 4. Dan sits: two friends not ready; two watchers ----
    fr[2].room = await fr[2].join(code); fr[2].room.on('start', () => {});
    await F.until(() => flow.room.state.seats.filter(Boolean).length === 4);
    hub.admin.set(`rooms/${code}/sp/watch-1`, true); hub.admin.set(`rooms/${code}/sp/watch-2`, true);
    await F.until(() => P.text('.on-watchers') === '2 WATCHING');
    await check('four', 4);
    ok(status() === 'WAITING FOR 2 FRIENDS...', 'four: ' + status());
    ok(!P.q('.on-watchers').hidden && P.text('.on-watchers') === '2 WATCHING', 'watchers: ' + P.text('.on-watchers'));
    F.inside(['.on-seats', '.on-watchers', '.on-foot .btn-row'], fails, 'watchers line', P.el);
    const colors = tiles().map((t) => getComputedStyle(t.querySelector('.on-dot')).backgroundColor);
    ok(new Set(colors).size === 4, 'four seat colours: ' + colors.join(' '));
    info.names = tiles().map((t) => F.txt(t.querySelector('.on-seat-name')));
    // ---- 5. WATCH LINK ----
    let copied = null;
    const clip = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    P.tap('[data-act="copywatch"]');
    await F.until(() => copied && /COPIED/.test(P.text('.on-watchlink')));
    const u = new URL(copied || 'http://x/');
    ok(u.searchParams.get('room') === code && u.searchParams.get('watch') === '1' && copied === flow.shareLink({ watch: true }), 'watch link: ' + copied);
    ok(P.text('.on-watchlink') === 'WATCH LINK COPIED!', 'button: ' + P.text('.on-watchlink'));
    ok(!new URL(flow.shareLink()).searchParams.has('watch'), 'the plain link has no watch');
    F.inside(['[data-act="copy"]', '.on-watchlink'], fails, 'share row', P.el);
    await F.shot(g, 'lobby-4');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clip });
    // ---- 6. everyone ready: STARTING... (then leave before the match) ----
    ok(!flow.link, 'no match yet');
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
