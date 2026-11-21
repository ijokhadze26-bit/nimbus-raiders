// @smoke --seconds 0 --shots 0
// Online stage 1, the screens (builder SHELL): the whole friend-room flow in ONE page over a local hub that lives in
// the page (the real rules, no network, no account). The second player "Buddy" is plain room.js / match.js calls.
// 1. ONLINE -> first visit asks for a name: rude / short / odd names get the plain sentences of names.js, a good one
//    lands on the hub and is cached in the save (save.data.online.name).
// 2. Typing: a, d, w and the arrows typed into a text box are not eaten by the game's keyboard steering; outside a
//    text box they steer exactly as before.
// 3. CREATE ROOM -> the lobby shows the 4-letter code, the share link carries it, my seat shows my pick.
// 4. Buddy joins by code -> both seats, his name / hero / weapon; my pick change reaches his screen; picks lock at READY.
// 5. Both READY -> flow.startMatch ran: a link, game.versus.live, a 'versus' run on the seed both sides derived.
// 6. Buddy falls, I outlast the tie window -> win; the result is one row in the save's online history.
// 7. Rematch: rematchState() before / after both asked; a second match starts on a NEW seed.
// 8. The rival leaves -> rematchState().can is false. LEAVE -> hub; BACK -> title: no room, no link, no listeners left.
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const { CODE_RE } = await import('/src/online/config.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const frame = () => { g.frame(1 / 60, 1 / 60); ui.update(1 / 60); };
const pump = async (seconds, stop) => { for (let i = 0; i < seconds * 60 && !(stop && stop()); i++) { frame(); if (i % 6 === 5) await K.wait(0); } };

try {
  localStorage.removeItem('nimbusRaiders.online.pending');
  const hub = await K.makeHub();
  ui.nav('title');
  // ---- 1. first visit: the name view ----
  const opened = await ui.openOnline({ hub, pid: 'me-1' });
  ok(opened.ok && g.state === 'online' && ui.current === 'online', `ONLINE did not open: ${JSON.stringify(opened)} state ${g.state}`);
  const P = K.page(g), flow = P.flow;
  ok(!!flow && flow.session && flow.transport && flow.room === null && flow.link === null, 'flow shape');
  ok(P.view() === 'name', `first visit shows ${P.view()}, wanted the name view`);
  const first = P.q('.on-nameinput').value;
  ok(/^Raider-\d{4}$/.test(first), `no friendly name filled in: "${first}"`);
  ok(/browser data/i.test(P.text('.on-fine')), 'the "clearing browser data starts a new one" line is missing');
  const NV = P.scr.views.name;
  const tryName = async (text) => { P.type('.on-nameinput', text); await NV.submit(); await K.wait(30); return P.text('.on-name .on-msg'); };
  info.nameHelp = { short: await tryName('ab'), chars: await tryName('n@me!'), rude: await tryName('sh1t head'), long: (P.type('.on-nameinput', 'abcdefghijklmnop'), P.text('.on-name .on-msg')) };
  ok(/at least 3/i.test(info.nameHelp.short) && /only letters/i.test(info.nameHelp.chars) && /kinder/i.test(info.nameHelp.rude), 'name help: ' + JSON.stringify(info.nameHelp));
  ok(P.view() === 'name' && !flow.name, 'a refused name was taken');
  // ---- 2. typing ----
  const box = P.q('.on-nameinput');
  const key = (target, k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); target.dispatchEvent(e); const up = new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }); const left = g.input.keys.left, right = g.input.keys.right; target.dispatchEvent(up); return { prevented: e.defaultPrevented, left, right }; };
  for (const k of ['a', 'd', 'w', 'A', 'ArrowLeft', 'ArrowRight']) { const r = key(box, k); ok(!r.prevented && !r.left && !r.right, `"${k}" typed in the name box was taken by the game`); }
  const steer = key(document.body, 'a'), steer2 = key(document.body, 'ArrowRight');
  ok(steer.prevented && steer.left && steer2.prevented && steer2.right, 'a / ArrowRight outside a text box no longer steer');
  // a volume slider (the only input single-player has) is not a text box: the game keeps its keys there, as before
  const slider = document.createElement('input'); slider.type = 'range'; document.body.appendChild(slider);
  const sl = key(slider, 'ArrowRight'), sl2 = key(slider, 'd');
  slider.remove();
  ok(sl.prevented && sl.right && sl2.right, `keys on a focused slider are no longer the game's: ${JSON.stringify([sl, sl2])}`);
  ok(getComputedStyle(box).userSelect !== 'none' && getComputedStyle(box).touchAction !== 'none', 'the text box cannot be selected / touched');
  P.type('.on-nameinput', '  Sky   Rider ');
  await NV.submit();
  await K.until(() => P.view() === 'hub');
  ok(P.view() === 'hub' && flow.name === 'Sky Rider', `after a good name: view ${P.view()}, name "${flow.name}"`);
  ok(g.save.data.online.name === 'Sky Rider', 'the name is not cached in the save');
  ok(P.text('.on-me-n') === 'Sky Rider', 'the hub does not show my name');
  ok(!P.q('.on-hub').textContent.match(/QUICK|LEADERBOARD|TROPH/i), 'the hub shows something that is not built yet');
  K.layout(P.el, ['.topbar', '.on-hub .on-card', '.on-me'], fails, 'hub');
  ok(P.q('.on-code').getBoundingClientRect().bottom < innerHeight * 0.5, 'the code box sits in the lower half: a phone keyboard would cover it');
  // CHANGE -> rename -> back on the hub with the new name
  P.tap('[data-act="rename"]');
  ok(P.view() === 'name' && P.q('.on-nameinput').value === 'Sky Rider' && !P.q('.on-cancel').hidden, 'CHANGE does not open the name view with CANCEL');
  P.type('.on-nameinput', 'Sky-Rider2'); await NV.submit();
  await K.until(() => P.view() === 'hub');
  ok(flow.name === 'Sky-Rider2' && hub.admin.get('users/me-1/n') === 'Sky-Rider2', 'rename did not reach the service');
  // JOIN with a short code says so and asks nothing of the network
  P.type('.on-code', 'ab'); P.tap('[data-act="join"]');
  ok(/4 letters/i.test(P.text('.on-hub .on-msg')) && !flow.busy, 'a 2-letter code was sent');
  P.type('.on-code', 'q1r-s tu'); ok(P.q('.on-code').value === 'QRST', `code box keeps "${P.q('.on-code').value}"`);
  // ---- 3. create ----
  P.tap('[data-act="create"]');
  await K.until(() => P.view() === 'lobby');
  const code = flow.room && flow.room.code;
  ok(P.view() === 'lobby' && CODE_RE.test(code || ''), `no lobby / code: ${P.view()} ${code}`);
  ok(P.text('.on-tiles') === code && P.el.querySelectorAll('.on-tile').length === 4, `the code on screen is "${P.text('.on-tiles')}"`);
  ok(new URL(flow.shareLink()).searchParams.get('room') === code, 'share link: ' + flow.shareLink());
  ok(/WAITING FOR A FRIEND/.test(P.text('.on-seats')), 'no "WAITING FOR A FRIEND" seat');
  ok(/YOU/.test(P.text('.on-seat.me')) && /Sky-Rider2/.test(P.text('.on-seat.me')) && /Pip/.test(P.text('.on-seat.me')), 'my seat: ' + P.text('.on-seat.me'));
  K.layout(P.el, ['.topbar', '.on-roomcard', '.on-seats', '.on-foot .btn-row', '.on-status', '.on-leave'], fails, 'lobby alone');
  // ---- 4. Buddy joins ----
  const buddy = await K.player(hub, 'buddy-2', 'Buddy');
  const roomB = await buddy.join(code, { he: 'cinder', we: 'emberstorm' });
  await K.until(() => /Buddy/.test(P.text('.on-seats')));
  const rival = P.text('.on-seat:not(.me)');
  ok(/RIVAL/.test(rival) && /Buddy/.test(rival) && /Cinder/.test(rival) && /Emberstorm/.test(rival) && /Classic/.test(rival), 'rival seat: ' + rival);
  // my pick: only what I own; a locked chip explains itself
  P.tap('[data-act="pick-open"]');
  ok(P.scr.views.lobby.picking() && !P.q('.on-picker').hidden && P.q('.on-seats').hidden, 'CHANGE HERO did not open the picker');
  ok(P.el.querySelectorAll('.on-heroes .chip').length >= 5 && P.el.querySelectorAll('.on-weapons .chip').length >= 5, 'picker chips missing');
  const locked = P.q('.on-heroes .chip.locked');
  if (locked) { locked.click(); ok(/LOCKED/.test(P.text('.on-lockline')) && flow.picks.hero === 'pip', 'a locked hero could be picked: ' + P.text('.on-lockline')); }
  g.save.update((s) => { s.unlockedLevel = 12; });
  P.tap('[data-act="pick-done"]'); P.tap('[data-act="pick-open"]');
  P.tap('.on-heroes .chip[data-id="rime"]');
  await K.until(() => roomB.state.seats[0] && roomB.state.seats[0].he === 'rime');
  ok(flow.picks.hero === 'rime' && roomB.state.seats[0].he === 'rime' && roomB.state.seats[0].we === flow.picks.weapon, `pick did not reach the room: ${JSON.stringify(roomB.state.seats[0])} vs ${JSON.stringify(flow.picks)}`);
  K.layout(P.el, ['.topbar', '.on-roomcard', '.on-picker', '.on-status'], fails, 'picker');
  ui.onKey({ key: 'Escape' }); // BACK closes the picker first, not the room
  ok(!P.scr.views.lobby.picking() && P.view() === 'lobby' && !!flow.room, 'Escape in the picker left the room');
  await K.until(() => /Rime/.test(P.text('.on-seat.me')));
  ok(/Rime/.test(P.text('.on-seat.me')), 'my seat does not show the new hero');
  // ---- 5. ready, ready, go ----
  P.tap('[data-act="ready"]');
  await K.until(() => flow.room.state.seats[0].rdy);
  ok(P.text('.on-ready') === 'NOT READY' && /WAITING FOR BUDDY/.test(P.text('.on-status')), `after READY: "${P.text('.on-ready')}" / "${P.text('.on-status')}"`);
  ok(P.q('.on-change').classList.contains('is-disabled') && flow.setPicks({ hero: 'pip' }) === false && flow.picks.hero === 'rime', 'picks do not lock at READY');
  ok(!flow.link && !g.versus.live, 'the match began with one player ready');
  await roomB.ready(true);
  await K.until(() => !!flow.link && g.versus.live, 5000);
  ok(!!flow.link && g.versus.live && g.state === 'playing' && g.run && g.run.mode === 'versus', `no match: link ${!!flow.link} live ${g.versus.live} state ${g.state}`);
  ok(ui.current === null && g.run.hero === 'rime', `match start: screen ${ui.current}, hero ${g.run && g.run.hero}`);
  await K.until(() => roomB.state.seed !== null);
  ok(flow.link.seed === roomB.state.seed && g.versus.seed === roomB.state.seed && flow.link.peers.length === 1 && flow.link.peers[0].name === 'Buddy', 'both sides must derive the same seed / peers');
  const seed1 = flow.link.seed;
  // ---- 6. Buddy falls, I win ----
  const linkB = buddy.match(roomB);
  g.debug.setAutopilot('pro', 1);
  await K.until(() => flow.link.clock() > 0.6, 8000, 50);   // real time: the 4 s countdown
  linkB.fall({ t: 0.5, d: 6, by: 'dead' });
  await pump(12, () => g.state === 'result');
  ok(g.versus.result && g.versus.result.result === 'win', 'verdict: ' + JSON.stringify(g.versus.result));
  ok(g.state === 'result', 'no result screen after the win: ' + g.state);
  const row = g.save.data.online.hist[0];
  ok(row && row.r === 'w' && row.n === 'Buddy' && row.k === 'f' && g.save.data.online.hist.length === 1, 'history row: ' + JSON.stringify(g.save.data.online.hist));
  ok(g.save.data.coins === 0 && g.save.data.stats.runs === 0, 'a friend match changed coins / stats');
  // ---- 7. rematch ----
  let rs = flow.rematchState();
  ok(rs.can && !rs.mine && rs.others.length === 1 && rs.others[0].name === 'Buddy' && rs.others[0].here && !rs.others[0].wants && rs.waitingFor === null && !rs.lost, 'rematchState after the match: ' + JSON.stringify(rs));
  let changes = 0; const offC = flow.on('change', () => changes++);
  await roomB.rematch({ ready: true });
  await K.until(() => flow.rematchState().others[0].wants);
  rs = flow.rematchState();
  ok(rs.others[0].wants && !rs.mine && changes > 0, 'the rival asking for a rematch is not shown: ' + JSON.stringify(rs));
  flow.rematch();
  ok(flow.rematchState().mine, 'my rematch wish is not shown at once');
  await K.until(() => g.versus.live && flow.link && flow.link.seed !== seed1, 6000);
  offC();
  ok(g.versus.live && g.state === 'playing' && flow.link.seed !== seed1, `no second match on a new seed: live ${g.versus.live}, seed ${flow.link && flow.link.seed} vs ${seed1}`);
  info.seeds = [seed1, flow.link && flow.link.seed];
  // ---- 8. the rival leaves; LEAVE; BACK ----
  linkB.leave();
  await roomB.leave();
  await K.until(() => !flow.rematchState().can);
  rs = flow.rematchState();
  ok(!rs.can && rs.others[0].here === false, 'rival left but a rematch is still offered: ' + JSON.stringify(rs));
  ok(flow.listeners('change') === 0, `listeners while playing: ${flow.listeners('change')}`);
  flow.leave('online');
  await K.until(() => P.view() === 'hub');
  ok(g.state === 'online' && P.view() === 'hub' && flow.room === null && flow.link === null && !g.versus.live && g.run === null, `after LEAVE: state ${g.state} view ${P.view()} room ${!!flow.room} live ${g.versus.live}`);
  ok(flow.listeners('change') === 1, `listeners on the hub: ${flow.listeners('change')}`);
  await K.until(() => hub.admin.get(`rooms/${code}`) === null, 3000);
  ok(hub.admin.get(`rooms/${code}`) === null, 'the empty room was not cleared away');
  ui.onKey({ key: 'Escape' });
  ok(g.state === 'title' && ui.current === 'title' && flow.listeners('change') === 0, `after BACK: state ${g.state}, listeners ${flow.listeners('change')}`);
  ok(localStorage.getItem('nimbusRaiders.online.pending') === null, 'a finished match is still marked as left');
  info.denied = hub.denials.length; info.hubWrites = hub.stats.writes;
} catch (e) { fails.push('threw: ' + (e.stack || e)); }
g.toTitle();
return { pass: fails.length === 0, fails, info };
