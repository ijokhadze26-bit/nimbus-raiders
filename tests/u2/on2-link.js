// @smoke --query test=1&room=abcd&watch=1&net=nope&pid=A1&nettest=lat400,jit200,loss5
// Online stage 1 (builder SHELL): a friend's link and everything that can go wrong around a room, in one page over
// a local hub (the real rules). The other players (Holly, Carl) are plain room.js calls.
// 1. The page address: ?room=abcd is read (upper case), online is opened at boot, and room / watch leave the address
//    so a reload does not join again; the other parameters stay. With no service set up the title says COMING SOON.
// 2. A link to a real room: first visit -> name first, then straight into that lobby as the second player.
// 3. THE HOST LEFT: banner, READY off, LEAVE ROOM goes back to the hub. A short connection blip keeps my seat.
// 4. ROOM NOT FOUND (a wrong code), ROOM IS FULL, MATCH ALREADY STARTED, ROOM CLOSED: plain words on the hub, and
//    nothing of me is left in those rooms.
// 5. YOU LOST YOUR SEAT: my connection drops, someone takes the seat, I come back.
// 6. A tab reloaded in the middle of a match: on the next visit my fall is written ('quit') and the hub says so.
// 7. BACK to the title: no room, no listeners; any other menu also closes the room.
const g = window.__game, ui = g.ui;
const K = await import('/tests/u2/lib/on2kit.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const PENDING = 'nimbusRaiders.online.pending';
let offline = () => {};

try {
  // ---- 1. the address ----
  const q = new URLSearchParams(location.search);
  ok(ui.params.room === 'ABCD' && ui.params.watch === true && ui.params.net === null && ui.params.pid === 'A1' && ui.params.nettest === 'lat400,jit200,loss5', 'params: ' + JSON.stringify(ui.params));
  ok(!q.has('room') && !q.has('watch') && q.get('test') === '1' && q.get('pid') === 'A1', 'address after boot: ' + location.search);
  await K.until(() => ui.online.state !== 'loading' && ui.online.state !== 'idle', 6000);
  const lbl = ui.screens.title.el.querySelector('.btn-online .on-lbl').textContent;
  ok(ui.online.state === 'soon' && lbl === 'ONLINE · COMING SOON' && g.state === 'title', `link with no service: ${ui.online.state} "${lbl}" ${g.state}`);
  for (const bad of ['ABC', 'ABCDE', 'AB1D', 'ABIO', 'A<CD']) ok(!/^[A-HJ-NP-Z]{4}$/i.test(bad), 'room pattern lets through ' + bad);
  // ---- 2. a link to a real room ----
  localStorage.removeItem(PENDING);
  const hub = await K.makeHub({ dropMs: 300 });
  const holly = await K.player(hub, 'holly', 'Holly'), carl = await K.player(hub, 'carl', 'Carl');
  let room = await holly.create({ he: 'vex', we: 'voidsiphon', hs: 'galaxy', ws: 'prism' });
  let r = await ui.openOnline({ hub, pid: 'me-9', room: room.code, watch: false, nettest: null }); // (no slow-network shim here: this test is about words, not timing)
  const P = K.page(g), flow = P.flow;
  offline = (off) => flow.transport._net(!off); // my connection goes away / comes back
  ok(r.ok && P.view() === 'name' && flow.room === null, `link, first visit: view ${P.view()}`);
  P.type('.on-nameinput', 'Linky'); await P.scr.views.name.submit();
  await K.until(() => P.view() === 'lobby', 5000);
  ok(P.view() === 'lobby' && flow.room && flow.room.code === room.code && flow.room.state.me === 1, `the link did not land in the lobby: ${P.view()} ${flow.room && flow.room.code}`);
  await K.until(() => /Holly/.test(P.text('.on-seats')) && /Linky/.test(P.text('.on-seat.me')));
  const rival = P.text('.on-seat:not(.me)');
  ok(/Holly/.test(rival) && /Vex/.test(rival) && /Void Siphon/.test(rival) && /Galaxy/.test(rival), 'host seat: ' + rival);
  ok(room.state.seats[1] && room.state.seats[1].n === 'Linky', 'the host does not see me');
  // a rival's pick that is not a real id shows the starter, never the raw text
  const raw = await holly.tp.update({ [`rooms/${room.code}/p/0/he`]: '<img src=x>', [`rooms/${room.code}/p/0/hs`]: 'nope' }).then(() => true, () => false);
  info.rawPickAccepted = raw; // (if the rules ever refuse such a pick outright, there is nothing to show)
  if (raw) await K.until(() => /Pip/.test(P.text('.on-seat:not(.me)')));
  if (raw) ok(/Pip/.test(P.text('.on-seat:not(.me)')) && !P.q('.on-seats img') && /Classic/.test(P.text('.on-seat:not(.me)')), 'an unknown hero id was shown raw: ' + P.text('.on-seat:not(.me)'));
  // ---- 3. a blip keeps the seat; the host leaves ----
  flow.ready(true);
  await K.until(() => flow.room.state.seats[1] && flow.room.state.seats[1].rdy);
  offline(true);
  await K.until(() => /RECONNECTING/.test(P.text('.on-banner') || ''), 1000);
  ok(/RECONNECTING/.test(P.text('.on-banner') || '') && P.q('.on-ready').classList.contains('is-disabled'), 'no RECONNECTING banner in the lobby');
  await K.wait(120);
  offline(false);
  await K.until(() => flow.room && flow.room.state.me === 1 && flow.room.state.seats[1].rdy && P.q('.on-banner').hidden, 4000);
  ok(P.view() === 'lobby' && flow.room && flow.room.state.me === 1 && flow.room.state.seats[1].rdy && flow.room.state.seats[1].n === 'Linky', 'a short blip lost my seat / my READY');
  await room.leave();
  await K.until(() => flow.room && flow.room.state.hostLeft);
  await K.wait(50);
  ok(/THE HOST LEFT/.test(P.text('.on-banner')) && P.q('.on-ready').classList.contains('is-disabled') && !/WAITING FOR A FRIEND/.test(P.text('.on-seats')), 'host left: ' + P.text('.on-banner'));
  P.tap('[data-act="leave"]');
  await K.until(() => P.view() === 'hub');
  ok(P.view() === 'hub' && flow.room === null && !flow.notice, 'LEAVE ROOM after the host left');
  // ---- 4. wrong code / full / playing / closed ----
  ui.nav('title');
  r = await ui.openOnline({ room: 'ZZZZ' });
  await K.until(() => !!flow.notice, 4000);
  ok(P.view() === 'hub' && flow.notice && flow.notice.kind === 'notfound' && /ROOM NOT FOUND/.test(P.text('.on-hub .on-msg')) && P.q('.on-code').value === 'ZZZZ', 'wrong code: ' + P.text('.on-hub .on-msg'));
  room = await holly.create();
  const roomC = await carl.join(room.code);
  const seen = []; const offS = flow.on('change', () => seen.push([flow.busy, P.text('.on-hub .on-msg'), P.q('[data-act="create"]').classList.contains('is-disabled')]));
  P.type('.on-code', room.code.toLowerCase()); P.tap('[data-act="join"]');
  await K.until(() => !flow.busy && !!flow.notice, 4000);
  offS();
  ok(seen.some((s) => s[0] === 'join' && /JOINING/.test(s[1]) && s[2]), 'no "joining" state on the hub: ' + JSON.stringify(seen));
  ok(flow.notice && flow.notice.kind === 'full' && /ROOM IS FULL/.test(P.text('.on-hub .on-msg')) && flow.room === null, 'full room: ' + P.text('.on-hub .on-msg'));
  await K.until(() => hub.admin.get(`rooms/${room.code}/sp`) === null, 3000);
  ok(hub.admin.get(`rooms/${room.code}/sp`) === null, 'I am still marked as a watcher of the full room');
  await room.ready(true); await roomC.ready(true);
  await K.until(() => room.state.mid, 4000);
  P.tap('[data-act="join"]');
  await K.until(() => !flow.busy && flow.notice && flow.notice.kind !== 'full', 4000);
  ok(flow.notice && flow.notice.kind === 'playing' && /MATCH ALREADY STARTED/.test(P.text('.on-hub .on-msg')), 'room in a match: ' + P.text('.on-hub .on-msg'));
  await roomC.leave(); await room.leave();
  P.tap('[data-act="create"]');
  await K.until(() => P.view() === 'lobby');
  ok(!flow.notice, 'the old message is still up in a new room');
  hub.admin.remove(`rooms/${flow.room.code}`);
  await K.until(() => P.view() === 'hub', 3000);
  ok(P.view() === 'hub' && flow.room === null && flow.notice && flow.notice.kind === 'closed' && /ROOM CLOSED/.test(P.text('.on-hub .on-msg')), 'room removed under me: ' + P.text('.on-hub .on-msg'));
  // ---- 5. my seat is taken while I am away ----
  room = await holly.create();
  P.type('.on-code', room.code); P.tap('[data-act="join"]');
  await K.until(() => P.view() === 'lobby' && flow.room.state.me === 1);
  offline(true);
  await K.until(() => room.state.seats[1] === null, 3000); // the hub notices the dead connection (300 ms here)
  const roomC2 = await carl.join(room.code);
  ok(roomC2.state.me === 1, 'Carl could not take the free seat');
  offline(false);
  await K.until(() => P.view() === 'hub' && !!flow.notice, 5000);
  ok(P.view() === 'hub' && flow.notice && flow.notice.kind === 'lostseat' && /YOU LOST YOUR SEAT/.test(P.text('.on-hub .on-msg')), `seat taken: view ${P.view()} ${JSON.stringify(flow.notice)}`);
  await roomC2.leave(); await room.leave();
  // ---- 6. a tab that reloaded in the middle of a match ----
  ui.nav('title');
  const twin = await K.player(hub, 'me-9', 'Linky');       // "my other tab": the same player
  room = await holly.create();
  const roomT = await twin.join(room.code);
  await room.ready(true); await roomT.ready(true);
  await K.until(() => room.state.mid && roomT.state.mid, 4000);
  const mid = room.state.mid;
  localStorage.setItem(PENDING, JSON.stringify({ mid, slot: roomT.state.me, uid: 'me-9', ts0: room.state.t0 - 4000 }));
  roomT.close(); twin.tp.close();                            // the tab is gone: no fall was written
  await K.wait(2700);                                        // (the rules take a fall only a moment after the start)
  ok(!hub.admin.get(`matches/${mid}/out`), 'a fall exists before the next visit');
  r = await ui.openOnline({});
  await K.until(() => !!hub.admin.get(`matches/${mid}/out/1`) && !!flow.notice, 4000);
  const out = hub.admin.get(`matches/${mid}/out/1`);
  ok(out && out.by === 'quit' && out.t === 0, 'the left match was not settled: ' + JSON.stringify(out));
  ok(flow.notice && flow.notice.kind === 'quit' && /YOU LEFT YOUR LAST MATCH/.test(P.text('.on-hub .on-msg')) && localStorage.getItem(PENDING) === null, 'no word about the left match: ' + P.text('.on-hub .on-msg'));
  await room.leave();
  // ---- 7. leaving ----
  P.tap('[data-act="create"]');
  await K.until(() => P.view() === 'lobby');
  const code = flow.room.code;
  ui.nav('shop'); // any other menu: the room is not kept open behind it
  await K.until(() => hub.admin.get(`rooms/${code}`) === null, 3000);
  ok(flow.room === null && flow.listeners('change') === 0 && hub.admin.get(`rooms/${code}`) === null, 'the room stayed open behind another menu');
  ui.nav('title');
  r = await ui.openOnline({});
  ok(r.ok && P.view() === 'hub' && flow.listeners('change') === 1, 'coming back to the hub');
  P.tap('[data-act="back"]');
  ok(g.state === 'title' && flow.listeners('change') === 0 && flow.room === null && flow.link === null, 'BACK from the hub');
  info.denied = hub.denials.map((d) => `${d.uid}:${d.path}`).slice(0, 8);
} catch (e) { fails.push('threw: ' + (e.stack || e)); }
return { pass: fails.length === 0, fails, info };
