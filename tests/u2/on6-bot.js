// @smoke --seconds 0 --shots 0
// Online stage 3 (QUICK MATCH), nobody else searching: this page alone on a local hub with the real rules.
// 10 s -> RIVAL FOUND! (a scripted rival through bot.js's API: the stand-in until the merge, the real bot after it)
// -> the VS card -> a live match on a link whose peer has bot: true -> a result -> PLAY AGAIN (a new search).
// Also: the history row is a quick one ('q') with the rival's name, the page wrote NOTHING to the hub from GO to
// the result (a bot match has no database traffic), the day meter did not count it, and no word on any screen says
// what kind of rival this is. The match runs on the simulated clock once GO is reached (flow.quick.test.clockFor),
// so the test does not wait out a whole match in real time; the 4 s countdown before GO is real.
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const Q = await import('/tests/u2/lib/on6kit.js');
const { meterKey, QUICK } = await import('/src/online/quick.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const frame = () => { const dt = 1 / 60, v = g.versus; if (v && v.live) v.pump(dt, dt); else if (g.state === 'playing' || g.state === 'result') g.step(dt); ui.update(dt); };
const frames = async (seconds, stop) => { for (let i = 0; i < seconds * 60 && !(stop && stop()); i++) { frame(); if (i % 30 === 29) await K.wait(0); } };
let said = false;
const look = () => { if (Q.saysKind()) said = true; };

try {
  const hub = await K.makeHub();
  const P = await Q.openHub(g, hub, 'me-1');
  const flow = P.flow;
  info.realBot = flow.quick.real;
  flow.quick.test.clockFor = ({ t0, now }) => () => (g.versus.go ? g.versus.simT : (now() - t0) / 1000);
  // ---- alone for 10 s ----
  P.q('.on-quick').click();
  const tap = performance.now();
  await Q.until(() => P.view() === 'quick');
  await Q.until(() => !!hub.admin.get('queue/me-1'), 3000);
  ok(!!hub.admin.get('queue/me-1'), 'no ticket while searching');
  await Q.until(() => flow.quickView() && flow.quickView().phase === 'found', 13000, 50);
  info.botAt = Math.round(performance.now() - tap);
  ok(info.botAt >= QUICK.botAtMs - 300 && info.botAt <= QUICK.botAtMs + 1200, `RIVAL FOUND! ${info.botAt} ms after the tap`);
  await Q.until(() => !hub.admin.get('queue/me-1'), 2000);
  ok(!hub.admin.get('queue/me-1') && !Q.leftovers(hub, 'me-1').rooms.length, 'a ticket or a room is left once the rival is found');
  const v = flow.quickView();
  await K.wait(80);
  ok(P.text('.on-find-h') === 'RIVAL FOUND!' && P.text('.on-find-name') === v.name && v.name && P.text('.on-find-go') === 'GET READY!' && P.q('.on-find-cancel').hidden, 'found view: ' + P.text('.on-find'));
  ok(Object.keys(v).sort().join() === 'hero,name,phase,secs,weapon', 'quickView shape: ' + JSON.stringify(v));
  look();
  await Q.shot('botfound');
  // ---- the match ----
  await Q.until(() => !!flow.link && g.versus.live, 6000, 50);
  ok(!!flow.link && g.versus.live && g.state === 'playing', `no match: link ${!!flow.link} live ${g.versus.live} state ${g.state}`);
  const link = flow.link;
  ok(link.peers.length === 1 && link.peers[0].bot === true && link.peers[0].name === v.name && link.peers[0].slot === 1 && link.slot === 0 && link.ranked === false, 'bot link: ' + JSON.stringify({ peers: link.peers, slot: link.slot, ranked: link.ranked }));
  const m = flow.quick.match;
  ok(m && m.kind === 'bot' && m.mid === null && m.slot === 0 && m.rivalSlot === 1 && m.seed === link.seed && typeof m.t0 === 'number', 'quick.match: ' + JSON.stringify(m));
  frame();
  const card = document.querySelector('.vs-card');
  ok(card && !card.classList.contains('hidden') && card.textContent.toUpperCase().includes(v.name.toUpperCase()), 'no VS card with the rival on it');
  look();
  await Q.shot('botvs');
  await Q.until(() => link.clock() >= 0, 6000, 50); // the real countdown
  frame();
  ok(g.versus.go, 'no GO after the countdown');
  const writes0 = hub.stats.writes;
  g.debug.setAutopilot('pro', 1);
  for (let i = 0; i < 70 && g.versus.live; i++) { g.versus.simulate(5); if (i === 6) { for (let k = 0; k < 20; k++) { g.frame(1 / 60, 1 / 60); ui.update(1 / 60); } look(); info.mid = { t: Math.round(g.versus.t), rival: g.versus.view().peers.map((p) => [Math.round(p.dist), p.n, p.alive]) }; await Q.shot('botlive'); } await K.wait(0); }
  await frames(30, () => ui.current === 'vsresult');
  ok(ui.current === 'vsresult' && g.versus.result && ['win', 'lose', 'draw'].includes(g.versus.result.result), `no result: screen ${ui.current} ${JSON.stringify(g.versus.result)}`);
  info.result = g.versus.result && { r: g.versus.result.result, t: g.versus.result.t, reason: g.versus.result.reason };
  info.hubWrites = hub.stats.writes - writes0;
  ok(info.hubWrites === 0, `the page wrote ${info.hubWrites} times to the hub from GO to the result`);
  ok(!hub.admin.get(`meter/${meterKey(Date.now())}`), 'a bot match was counted on the day meter');
  const row = g.save.data.online.hist[0];
  ok(row && row.k === 'q' && row.n === v.name && row.r === info.result.r[0], 'history row: ' + JSON.stringify(row));
  const rbtn = document.querySelector('.vsr-rematch');
  ok(rbtn && rbtn.textContent.trim() === 'PLAY AGAIN' && !rbtn.classList.contains('is-disabled'), 'result button: ' + (rbtn && rbtn.textContent));
  look();
  await Q.shot('botresult');
  // ---- PLAY AGAIN ----
  rbtn.click();
  await Q.until(() => ui.current === 'online' && P.view() === 'quick', 4000);
  await Q.until(() => !!hub.admin.get('queue/me-1'), 3000);
  ok(P.view() === 'quick' && flow.mode === 'quick' && !flow.link && !!hub.admin.get('queue/me-1') && P.text('.on-find-h') === 'FINDING A RIVAL...', `PLAY AGAIN: view ${P.view()} mode ${flow.mode} link ${!!flow.link}`);
  ok(!said, 'a screen said what kind of rival this is');
  await flow.quickCancel();
  await Q.until(() => !hub.admin.get('queue/me-1'), 3000);
  ok(P.view() === 'hub' && !hub.admin.get('queue/me-1'), 'CANCEL after PLAY AGAIN');
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
return { pass: fails.length === 0, fails, info };
