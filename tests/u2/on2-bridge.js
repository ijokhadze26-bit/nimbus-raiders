// @smoke --query test=1&net=bridge&pid=BR&nettest=lat60,jit20
// Online stage 1 (builder SHELL): the network the page address asks for.
// ?net=bridge: the page waits for the port the two-page harness injects (window.__netPort = { post(msg), onmessage })
// and talks to the hub behind it; ?pid=BR is this tab's player id; ?nettest=lat60,jit20 wraps the transport in the
// slow-network shim. Here the "harness" is a hub in the same page behind a port pair, and the port arrives a
// moment AFTER the tap, as it does when a harness injects it right after load.
// Then the flow still works end to end on that transport: name -> hub -> CREATE ROOM -> a lobby with a code.
const g = window.__game, ui = g.ui;
const K = await import('/tests/u2/lib/on2kit.js');
const { portPair } = await import('/src/online/localhub.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
try {
  ok(ui.params.net === 'bridge' && ui.params.pid === 'BR' && ui.params.nettest === 'lat60,jit20', 'params: ' + JSON.stringify(ui.params));
  const hub = await K.makeHub();
  const [mine, theirs] = portPair();
  ui.nav('title');
  const btn = ui.screens.title.el.querySelector('.btn-online');
  btn.click();                                   // a real tap: no options, everything comes from the address
  await K.wait(350);
  ok(ui.online.state === 'loading' && !g.online, 'the page did not wait for the bridge port');
  hub.attach(mine); window.__netPort = theirs;   // the harness arrives
  const r = await ui.openOnline();
  const P = K.page(g), flow = P.flow;
  ok(r.ok && g.state === 'online' && P.view() === 'name', `bridge: ${JSON.stringify(r)} state ${g.state} view ${P.view()}`);
  ok(flow.session.uid === 'BR' && flow.transport.uid === 'BR', `player id: ${flow.session.uid}`);
  ok(flow.transport.net && typeof flow.transport.net.offline === 'function', 'the slow-network shim does not wrap the transport');
  // the harness owns the clock: this page's "now" is what the hub last said
  ok(Math.abs(flow.transport.now() - hub.now()) < 1500, `now() ${flow.transport.now()} vs hub ${hub.now()}`);
  const t0 = performance.now();
  P.type('.on-nameinput', 'Bridge Kid'); await P.scr.views.name.submit();
  await K.until(() => P.view() === 'hub', 6000);
  info.nameMs = Math.round(performance.now() - t0);
  ok(P.view() === 'hub' && hub.admin.get('users/BR/n') === 'Bridge Kid', 'the name did not reach the hub behind the bridge');
  ok(info.nameMs >= 100, `no delay from nettest (${info.nameMs} ms for a write with 60 ms each way)`);
  P.tap('[data-act="create"]');
  await K.until(() => P.view() === 'lobby', 8000);
  const code = flow.room && flow.room.code;
  ok(P.view() === 'lobby' && !!code && hub.admin.get(`rooms/${code}/sl/0`) === 'BR', `no room behind the bridge: ${P.view()} ${code}`);
  // my connection drops (the shim's switch): the lobby says RECONNECTING, and says nothing once it is back
  flow.transport.net.offline(true);
  await K.until(() => /RECONNECTING/.test(P.text('.on-banner') || ''), 2000);
  ok(/RECONNECTING/.test(P.text('.on-banner') || ''), 'no RECONNECTING banner when my connection drops');
  flow.transport.net.offline(false);
  await K.until(() => P.q('.on-banner').hidden && flow.room && flow.room.state.me === 0, 6000);
  ok(P.q('.on-banner').hidden && flow.room && flow.room.state.me === 0, 'the lobby did not recover after the drop');
  P.tap('[data-act="leave"]');
  await K.until(() => P.view() === 'hub');
  ui.onKey({ key: 'Escape' });
  ok(g.state === 'title' && flow.listeners('change') === 0, 'BACK to the title');
} catch (e) { fails.push('threw: ' + (e.stack || e)); }
return { pass: fails.length === 0, fails, info };
