// Two real pages, the screens before a match (SPEC4 §12 stage 1): the ONLINE button, the name, CREATE ROOM, a code
// typed by hand, a friend's ?room= link, a connection blip in the lobby, and the game without the online chunk.
// Run with `node scripts/duo.mjs rooms`.

export const scenarios = [
  {
    name: 'create a room and join it by typing the code',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B', { size: [360, 640] });
      const code = await duo.lobby(A, B, ['Ann', 'Ben']);
      note(`room ${code}`);
      const [a, b] = [await A.view(), await B.view()];
      eq(a.room.seats.map((s) => s && s.n), ['Ann', 'Ben'], 'the host page shows both players');
      eq(b.room.seats.map((s) => s && s.n), ['Ann', 'Ben'], 'the joining page shows both players');
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
      // a third player with the same code is told the room is full
      const C = await duo.page('C');
      await duo.signIn(C, 'Cyd');
      await C.type('.on-code', code);
      await C.key('Enter');
      await duo.until(async () => (await C.view()).notice === 'full', 'C: ROOM IS FULL');
      ok(/ROOM IS FULL/.test(await C.text('.on-hub .on-msg')), 'C reads ROOM IS FULL');
      // a wrong code
      await C.type('.on-code', code === 'ZZZZ' ? 'YYYY' : 'ZZZZ');
      await C.key('Enter');
      await duo.until(async () => (await C.view()).notice === 'notfound', 'C: ROOM NOT FOUND');
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
      // and the room still works: the host readies, the match starts
      await duo.ready(A);
      const [a, b] = await duo.go(A, B);
      ok(a.seed === b.seed && a.seed > 0, `one road after the blip: ${a.seed} / ${b.seed}`);
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
];
