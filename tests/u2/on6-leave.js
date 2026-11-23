// @smoke --seconds 0 --shots 0
// Online stage 3 (QUICK MATCH), walking away: HOME (another menu) while searching, HOME during RIVAL FOUND! with a
// person, BACK during RIVAL FOUND! with a scripted rival: no ticket, no room and no seat stay behind, the person goes
// back to searching, the scripted match never starts later, and a single-player level afterwards plays as before
// (no online listener reacts: nothing reaches the hub, no versus run, the flow stays out of quick mode).
const g = window.__game, ui = g.ui;
g.loop.stop();
const K = await import('/tests/u2/lib/on2kit.js');
const Q = await import('/tests/u2/lib/on6kit.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const clean = (hub, what) => { const l = Q.leftovers(hub, 'me-1'); ok(!l.ticket && !l.rooms.length && !l.seats.length, `${what}: left ${JSON.stringify(l)}`); };
let buddy = null;

try {
  const hub = await K.makeHub();
  let P = await Q.openHub(g, hub, 'me-1');
  const flow = P.flow;
  // ---- 1. HOME while searching ----
  P.q('.on-quick').click();
  await Q.until(() => !!hub.admin.get('queue/me-1'), 3000);
  ok(flow.mode === 'quick' && !!hub.admin.get('queue/me-1'), 'not searching');
  ui.nav('title');
  await Q.until(() => !hub.admin.get('queue/me-1'), 3000);
  ok(g.state === 'title' && flow.mode === null && !flow.quick.q, `HOME while searching: state ${g.state} mode ${flow.mode}`);
  clean(hub, 'HOME while searching');
  // ---- 2. HOME during RIVAL FOUND! with a person ----
  P = await Q.openHub(g, hub, 'me-1');
  buddy = await Q.searcher(hub, 'buddy-2', 'Buddy');
  buddy.q.on('paired', () => {}); // (Buddy readies 0.3 s after pairing; I wait QUICK.foundMs, so I leave first)
  buddy.tap();
  await K.wait(100);
  P.q('.on-quick').click();
  await Q.until(() => flow.quickView() && flow.quickView().phase === 'found', 4000);
  ok(flow.quickView() && flow.quickView().name === 'Buddy' && flow.room, 'no RIVAL FOUND! with Buddy');
  ui.nav('title');
  await Q.until(() => !Q.leftovers(hub, 'me-1').seats.length && !hub.admin.get('queue/me-1'), 3000);
  ok(!flow.room && !flow.link && flow.mode === null, 'HOME during RIVAL FOUND! kept the room');
  clean(hub, 'HOME during RIVAL FOUND! (person)');
  await Q.until(() => buddy.q.state.phase === 'search' && !buddy.room?.state?.mid, 3000);
  await K.wait(400);
  ok(!g.versus.live && g.state === 'title', `a match started after HOME: live ${g.versus.live} state ${g.state}`);
  info.buddy = buddy.q.state.phase;
  ok(['search', 'bot'].includes(buddy.q.state.phase), "Buddy is not searching again: " + buddy.q.state.phase);
  await buddy.stop();
  buddy = null;
  // ---- 3. BACK during RIVAL FOUND! with a scripted rival ----
  P = await Q.openHub(g, hub, 'me-1');
  P.q('.on-quick').click();
  await Q.until(() => flow.quickView() && flow.quickView().phase === 'found', 13000, 50);
  ok(flow.quickView() && flow.quickView().phase === 'found', 'no scripted rival after 10 s');
  P.scr.onBack();
  await Q.until(() => P.view() === 'hub', 2000);
  ok(P.view() === 'hub' && ui.current === 'online' && flow.mode === null, `BACK during RIVAL FOUND!: view ${P.view()} screen ${ui.current}`);
  await K.wait(4500); // longer than any RIVAL FOUND! (pick.readyIn <= 4 s)
  ok(!flow.link && !g.versus.live && g.state === 'online', `the scripted match started after BACK: link ${!!flow.link} state ${g.state}`);
  clean(hub, 'BACK during RIVAL FOUND! (scripted)');
  // ---- 4. single-player afterwards ----
  ui.nav('title');
  let changes = 0;
  const off = flow.on('change', () => changes++);
  const w0 = hub.stats.writes;
  ok(g.startLevel(1) && g.state === 'playing' && g.run && g.run.mode !== 'versus', 'level 1 does not start');
  g.debug.setAutopilot('pro', 1);
  g.debug.simulate(8);
  off();
  ok(!g.versus.live && g.run && g.run.mode !== 'versus' && flow.mode === null && !flow.link && !flow.room, 'online reacted to a single-player level');
  ok(hub.stats.writes === w0, `the hub saw ${hub.stats.writes - w0} writes during a single-player level`);
  info.changes = changes;
  ok(changes === 0, `the flow changed ${changes} times during a single-player level`);
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
} finally {
  if (buddy) await buddy.stop().catch(() => {});
}
return { pass: fails.length === 0, fails, info };
