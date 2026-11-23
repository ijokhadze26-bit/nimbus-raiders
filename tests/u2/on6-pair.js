// @smoke --seconds 0 --shots 0
// Online stage 3 (QUICK MATCH), two people: this page and a plain second searcher "Buddy" (transport + quick.js) on a
// local hub with the real rules. Buddy taps first, I tap 0.1 s later: I claim Buddy's ticket, Buddy sits in my room.
// RIVAL FOUND! with Buddy's name and picks -> the VS card -> a live match on a human link (the same seed on both
// sides) -> Buddy falls -> YOU WIN! -> the big button reads PLAY AGAIN -> a new search (a new ticket) -> BACK.
// Also: the history row is a quick one ('q'), the day meter counted this match once (my seat is the lowest),
// flow.quick.match describes it, and no word on any screen says what kind of rival this is.
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const Q = await import('/tests/u2/lib/on6kit.js');
const { meterKey } = await import('/src/online/quick.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
// one frame without rendering (on3kit's way): the match's pump, or a plain step, and the UI
const frame = () => { const dt = 1 / 60, v = g.versus; if (v && v.live) v.pump(dt, dt); else if (g.state === 'playing' || g.state === 'result') g.step(dt); ui.update(dt); };
const pump = async (seconds, stop) => { for (let i = 0; i < seconds * 60 && !(stop && stop()); i++) { frame(); if (i % 6 === 5) await K.wait(0); } };

let buddy = null;
try {
  const hub = await K.makeHub();
  const P = await Q.openHub(g, hub, 'me-1');
  const flow = P.flow;
  buddy = await Q.searcher(hub, 'buddy-2', 'Buddy');
  // ---- pairing ----
  buddy.tap();
  await K.wait(100);
  P.q('.on-quick').click();
  const tap = performance.now();
  await Q.until(() => flow.quickView() && flow.quickView().phase === 'found', 4000);
  info.foundMs = Math.round(performance.now() - tap);
  ok(info.foundMs < 2000, `paired ${info.foundMs} ms after my tap`);
  const v = flow.quickView();
  ok(v && v.phase === 'found' && v.name === 'Buddy' && v.hero === 'cinder' && v.weapon === 'emberstorm', 'quickView: ' + JSON.stringify(v));
  await K.wait(80);
  ok(P.view() === 'quick' && P.q('.on-find').classList.contains('found'), 'no RIVAL FOUND! view: ' + P.view());
  ok(P.text('.on-find-h') === 'RIVAL FOUND!' && P.text('.on-find-name') === 'Buddy' && P.text('.on-find-hero') === 'Cinder' && P.text('.on-find-weapon') === 'Emberstorm' && P.text('.on-find-go') === 'GET READY!', 'found view: ' + P.text('.on-find'));
  ok(P.q('.on-find-cancel').hidden, 'CANCEL still shows once the rival is found');
  ok(flow.room && flow.room.state.k === 'quick' && flow.room.state.me === 0 && flow.room.state.seats[1] && flow.room.state.seats[1].uid === 'buddy-2', 'not seated in my own quick room with Buddy');
  ok(!Q.saysKind(), 'RIVAL FOUND! says what kind of rival this is');
  await Q.shot('found');
  // ---- READY on both sides -> the match ----
  await Q.until(() => !!flow.link && g.versus.live, 6000);
  ok(!!flow.link && g.versus.live && g.state === 'playing' && g.run && g.run.mode === 'versus', `no match: link ${!!flow.link} live ${g.versus.live} state ${g.state}`);
  await Q.until(() => !!buddy.link, 3000);
  ok(buddy.link && flow.link.seed === buddy.link.seed && flow.link.mid === buddy.link.mid, 'not the same match / seed on both sides');
  ok(flow.link.peers.length === 1 && flow.link.peers[0].name === 'Buddy' && flow.link.peers[0].bot === false, 'peers: ' + JSON.stringify(flow.link.peers));
  const m = flow.quick.match;
  ok(m && m.kind === 'human' && m.mid === flow.link.mid && m.slot === 0 && m.rivalSlot === 1 && m.seed === flow.link.seed && m.t0 === flow.link.t0, 'quick.match: ' + JSON.stringify(m));
  frame();
  const card = document.querySelector('.vs-card');
  ok(card && !card.classList.contains('hidden') && /Buddy/i.test(card.textContent), 'no VS card with Buddy on it');
  await Q.shot('vscard');
  await Q.until(() => hub.admin.get(`meter/${meterKey(Date.now())}`) === 1, 2000);
  ok(hub.admin.get(`meter/${meterKey(Date.now())}`) === 1, 'the day meter did not count this match once: ' + hub.admin.get(`meter/${meterKey(Date.now())}`));
  // ---- Buddy falls, I win ----
  g.debug.setAutopilot('pro', 1);
  await Q.until(() => flow.link.clock() > 0.6, 8000, 50); // real time: the 4 s countdown
  buddy.link.fall({ t: 0.5, d: 6, by: 'dead' });
  await pump(14, () => g.state === 'result' && ui.current === 'vsresult');
  ok(g.versus.result && g.versus.result.result === 'win', 'verdict: ' + JSON.stringify(g.versus.result));
  await Q.until(() => ui.current === 'vsresult', 3000);
  const rbtn = document.querySelector('.vsr-rematch');
  ok(ui.current === 'vsresult' && rbtn && rbtn.textContent.trim() === 'PLAY AGAIN' && !rbtn.classList.contains('is-disabled') && rbtn.classList.contains('btn-gold'), 'result button: ' + (rbtn && rbtn.className + ' ' + rbtn.textContent));
  const row = g.save.data.online.hist[0];
  ok(row && row.k === 'q' && row.r === 'w' && row.n === 'Buddy', 'history row: ' + JSON.stringify(row));
  ok(!Q.saysKind(), 'the result screen says what kind of rival this is');
  await Q.shot('result');
  // ---- PLAY AGAIN: a new search ----
  rbtn.click();
  await Q.until(() => ui.current === 'online' && P.view() === 'quick', 4000);
  ok(ui.current === 'online' && P.view() === 'quick' && flow.mode === 'quick' && !flow.link && !flow.room, `after PLAY AGAIN: screen ${ui.current}, view ${P.view()}, link ${!!flow.link}, room ${!!flow.room}`);
  await Q.until(() => !!hub.admin.get('queue/me-1'), 3000);
  ok(!!hub.admin.get('queue/me-1') && P.text('.on-find-h') === 'FINDING A RIVAL...', 'PLAY AGAIN did not start a new search');
  ok(Q.leftovers(hub, 'me-1').seats.length === 0, 'I still sit in the last room');
  // ---- BACK: out of Quick Match ----
  P.scr.onBack();
  await Q.until(() => P.view() === 'hub' && !hub.admin.get('queue/me-1'), 3000);
  const left = Q.leftovers(hub, 'me-1');
  ok(P.view() === 'hub' && flow.mode === null && !left.ticket && !left.rooms.length && !left.seats.length, `after BACK: view ${P.view()} left ${JSON.stringify(left)}`);
  info.hist = g.save.data.online.hist.length;
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
} finally {
  if (buddy) await buddy.stop().catch(() => {});
}
return { pass: fails.length === 0, fails, info };
