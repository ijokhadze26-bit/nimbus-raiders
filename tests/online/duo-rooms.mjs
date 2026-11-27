// Two real pages, the screens before a match (SPEC4 §12 stage 1): the ONLINE button, the name, CREATE ROOM, a code
// typed by hand, a friend's ?room= link, a connection blip in the lobby (mine, then the host's), the host closing the
// room, and the game without the online chunk (also with a friend's link: the next tap still joins that room).
// Run with `node scripts/duo.mjs rooms`.

export const scenarios = [
  {
    name: 'create a room and join it by typing the code',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B', { size: [360, 640] });
      const code = await duo.lobby(A, B, ['Ann', 'Ben']);
      note(`room ${code}`);
      const [a, b] = [await A.view(), await B.view()];
      eq(a.room.seats.map((s) => s && s.n), ['Ann', 'Ben', null, null], 'the host page shows both players (of 4 seats)');
      eq(b.room.seats.map((s) => s && s.n), ['Ann', 'Ben', null, null], 'the joining page shows both players (of 4 seats)');
      eq([a.room.me, b.room.me], [0, 1], 'seats');
      ok(/ANN|Ann/.test(await B.text('.on-seats')) && /Ben/i.test(await A.text('.on-seats')), 'both names are on both lobby screens');
      eq(duo.hub.admin.get(`rooms/${code}/sl`), { 0: 'A', 1: 'B' }, 'the hub holds both seats');
      // a pick changed on one page shows on the other before anyone is ready
      await B.click('.on-change');
      await duo.until(() => B.has('.on-picker'), 'B: the picker');
      const picked = await B.ev(() => { const chips = [...document.querySelectorAll('.on-weapons .chip:not(.locked)')]; const c = chips.find((x) => !x.classList.contains('sel')) || chips[0]; c.click(); return c.dataset.id; });
      await B.click('[data-act="pick-done"]');
      await duo.until(async () => (await A.view()).room.seats[1].we === picked, `A to see B's new weapon (${picked})`);
      await A.shot('lobby'); await B.shot('lobby');
      // a third player with the same code sits (a friend room takes 4); with the 4th seat taken too (seeded as the
      // owner's console would), the 5th is told the room is full and nothing is written for them
      const C = await duo.page('C');
      await duo.signIn(C, 'Cyd');
      await C.type('.on-code', code);
      await C.key('Enter');
      await duo.until(async () => (await C.view()).view === 'lobby' && (await A.view()).room.seats[2], 'C sits in seat 3');
      eq((await C.view()).room.me, 2, 'C\'s seat');
      duo.hub.admin.update({ [`rooms/${code}/sl/3`]: 'X', [`rooms/${code}/p/3`]: { n: 'Dan', tr: 0, he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' } });
      const D = await duo.page('D');
      await duo.signIn(D, 'Eve');
      await D.type('.on-code', code);
      await D.key('Enter');
      await duo.until(async () => (await D.view()).notice === 'full', 'D: ROOM IS FULL');
      ok(/ROOM IS FULL/.test(await D.text('.on-hub .on-msg')), 'D reads ROOM IS FULL');
      eq(duo.hub.admin.get(`rooms/${code}/sp`), null, 'no watcher marker for the 5th');
      // a wrong code
      await D.type('.on-code', code === 'ZZZZ' ? 'YYYY' : 'ZZZZ');
      await D.key('Enter');
      await duo.until(async () => (await D.view()).notice === 'notfound', 'D: ROOM NOT FOUND');
      // LEAVE ROOM on the joining page: the host waits for a friend again
      await B.click('[data-act="leave"]');
      await duo.until(async () => (await B.view()).view === 'hub' && (await A.view()).room.seats[1] === null, 'B back on the hub and its seat free');
      ok(/WAITING FOR A FRIEND/.test(await A.text('.on-seats')), 'A waits for a friend again');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'a friend opens the room link',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A');
      await duo.signIn(A, 'Ann');
      const code = await duo.create(A);
      const link = await A.ev(() => window.__game.online.flow.shareLink());
      ok(link.includes(`room=${code}`), `share link: ${link}`);
      // the friend's first visit: the link asks for a name, then lands in the lobby
      const B = await duo.page('B', { room: code.toLowerCase() });
      await duo.signIn(B, 'Link Kid', { tap: false });
      await duo.until(async () => (await B.view()).view === 'lobby', 'B: the lobby after the link');
      const b = await B.view();
      eq([b.room.code, b.room.me, b.room.seats[0] && b.room.seats[0].n], [code, 1, 'Ann'], 'B sits in A\'s room');
      ok(!(await B.ev(() => location.search)).includes('room='), 'the room has left the address (a reload does not rejoin)');
      await duo.until(async () => (await A.view()).room.seats[1], 'A to see the friend');
      note(`link ${link}`);
    },
  },
  {
    name: 'a short connection blip in the lobby keeps the seat',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A'), B = await duo.page('B');
      const code = await duo.lobby(A, B);
      await duo.ready(B);
      await B.offline(true);
      await duo.until(async () => /RECONNECTING/.test((await B.view()).banner || ''), 'B: the RECONNECTING banner');
      await duo.tick(1500);
      await B.offline(false);
      await duo.tick(200);
      await duo.until(async () => { const v = await B.view(); return v.net === 'on' && !v.banner && v.room && v.room.me === 1 && v.room.seats[1] && v.room.seats[1].rdy; }, 'B: seat and READY back after the blip');
      await duo.until(async () => { const v = await A.view(); return v.room.seats[1] && v.room.seats[1].n === 'Ben' && v.room.seats[1].rdy; }, 'A still sees Ben, ready');
      await duo.until(() => duo.hub.admin.get(`rooms/${code}/sl/1`) === 'B' && !!duo.hub.admin.get(`rooms/${code}/p/1`), 'the seat to be B\'s on the hub again');
      // now the HOST's connection drops for longer than the hub keeps a dead seat (5 s): B waits for the host, READY kept
      await A.offline(true);
      await duo.until(async () => /WAITING FOR THE HOST/.test((await B.view()).banner || ''), 'B: WAITING FOR THE HOST');
      const bw = await B.view();
      ok(!/HOST LEFT/.test(bw.banner) && bw.room.seats[1].rdy && !(await B.ev(() => document.querySelector('.on-ready').classList.contains('is-disabled'))), `B while the host is away: ${bw.banner}`);
      ok(await B.ev(() => document.querySelector('.on-sharerow').hidden), 'B can still share a link to a room nobody can join');
      await B.shot('host-away');
      await A.offline(false);
      await duo.until(async () => { const v = await B.view(); return !v.banner && !v.room.hostLeft && v.room.seats[0] && v.room.seats[1].rdy; }, 'B: the host is back');
      // and the room still works: the host readies, the match starts
      await duo.ready(A);
      const [a, b] = await duo.go(A, B);
      ok(a.seed === b.seed && a.seed > 0, `one road after the blips: ${a.seed} / ${b.seed}`);
    },
  },
  {
    name: 'the host leaves the lobby: the room is closed for everyone, and its old code says ROOM CLOSED',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A'), B = await duo.page('B');
      const code = await duo.lobby(A, B);
      await duo.ready(B);
      await A.click('[data-act="leave"]');
      await duo.until(async () => { const v = await B.view(); return v.view === 'hub' && v.notice === 'closed'; }, 'B: ROOM CLOSED on the hub');
      ok(/ROOM CLOSED/.test(await B.text('.on-hub .on-msg')), 'B reads ROOM CLOSED');
      eq(duo.hub.admin.get(`rooms/${code}`), null, 'the room is gone from the hub');
      // a host whose tab closed while waiting alone: a friend with that code is told ROOM CLOSED (not a dead lobby)
      const code2 = await duo.create(A);
      await A.offline(true);
      await duo.until(() => !duo.hub.admin.get(`rooms/${code2}/sl`), 'the host seat to be freed');
      await B.type('.on-code', code2);
      await B.key('Enter');
      await duo.until(async () => (await B.view()).notice === 'closed', 'B: ROOM CLOSED for the dead room');
      eq((await B.view()).view, 'hub', 'B stays on the hub');
      await A.offline(false);
      A.errors.length = 0;
    },
  },
  {
    name: 'online chunk blocked: UNAVAILABLE, and single-player still starts',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A', { bridge: false, before: (page) => page.route(/\/src\/online\/index\.js|\/assets\/online-[^/]*\.js/, (r) => r.abort()) });
      await A.ev(() => window.__game.loop.start());
      eq((await A.view()).btn, 'ONLINE', 'the button before the tap');
      await A.click('.btn-online');
      await A.page.waitForFunction(() => window.__game.ui.online.state === 'unavailable', null, { timeout: 15000 });
      const v = await A.view();
      eq([v.btn, v.state, v.screen], ['ONLINE · UNAVAILABLE', 'title', 'title'], 'the button says so and the title stays');
      await A.shot('unavailable');
      await A.click('[data-act="play"]');
      await A.page.waitForFunction(() => window.__game.ui.current === 'map', null, { timeout: 8000 });
      await A.click('[data-act="play-current"]');
      await A.page.waitForFunction(() => window.__game.ui.current === 'loadout' || window.__game.state === 'playing', null, { timeout: 8000 });
      if ((await A.view()).screen === 'loadout') await A.click('.lo-start');
      await A.page.waitForFunction(() => window.__game.state === 'playing' && window.__game.run && window.__game.run.dist > 5, null, { timeout: 20000 });
      const r = await A.view();
      ok(r.mode !== 'versus' && r.n > 0, `a single-player run is going: ${JSON.stringify({ mode: r.mode, n: r.n, dist: r.dist })}`);
      ok(!(await A.ev(() => !!window.__game.versus)), 'nothing of the online code was loaded');
      A.errors.length = 0; // (the blocked download itself is logged by the browser)
    },
  },
  {
    name: 'a friend\'s link while the online code cannot load: the next tap still joins that room',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A');
      await duo.signIn(A, 'Ann');
      const code = await duo.create(A);
      let block = true;
      const B = await duo.page('B', { room: code, before: (page) => page.route(/\/src\/online\/index\.js|\/assets\/online-[^/]*\.js/, (r) => (block ? r.abort() : r.continue())) });
      await B.page.waitForFunction(() => window.__game.ui.online.state === 'unavailable', null, { timeout: 15000 });
      ok(!(await B.ev(() => location.search)).includes('room='), 'the room left the address');
      block = false;
      await duo.signIn(B, 'Ben'); // (taps ONLINE again: the chunk loads now)
      await duo.until(async () => (await B.view()).view === 'lobby', 'B: the lobby of the linked room');
      eq([(await B.view()).room.code, (await B.view()).room.me], [code, 1], 'B sits in A\'s room');
      B.errors.length = 0; // (the first, blocked download is logged by the browser)
    },
  },
];
