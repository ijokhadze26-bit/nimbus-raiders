// @smoke --seconds 0 --shots 0
// Online stage 4: a ranked match left by a closed / reloaded tab is settled on the next visit (SPEC4 5.7, STAGE4 #10).
// "The old tab" is a second session of the same player in this browser (it shares localStorage, like a tab does): it
// stakes a bot match at GO, writes its pending stake, then dies without a verdict.
// 1. its live stamp 1 s old: opening ONLINE touches nothing (the other tab may still be playing it);
// 2. the stamp 7 s old: opening ONLINE closes the stake (the loss stays) and the hub says YOU LEFT YOUR LAST MATCH.
const g = window.__game, ui = g.ui;
g.loop.stop();
const E = await import('/tests/u2/lib/on8kit.js');
const { createLocalTransport } = await import('/src/online/transport-local.js');
const { createSession } = await import('/src/online/session.js');
const { realClock } = await import('/src/online/transport.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const STAKE = 'nimbusRaiders.online.stake';

try {
  E.clearKeys();
  const hub = await E.makeHub();
  // ---- the old tab: a profile, a stake at GO, then gone ----
  E.seed(hub, 'me-1', { n: 'Sky Rider', tr: 120, pk: 120, w: 0, l: 0, st: 2, bs: 3, bt: 0, ws: 0, cd: 0, cc: 0 });
  const dead = { on: true };
  const clock = { now: () => Date.now(), after: (ms, fn) => realClock.after(ms, () => { if (dead.on) fn(); }), every: (ms, fn) => realClock.every(ms, () => { if (dead.on) fn(); }) };
  const tp = createLocalTransport({ hub, uid: 'me-1' });
  const old = createSession({ transport: tp, clock });
  await old.connect();
  const m = { kind: 'bot', mid: null, slot: 0, rivalSlot: 1, rivalTr: 120, seed: 9, t0: tp.now() };
  await old.prepare(m);
  const st = await old.stake(m);
  ok(st.ok && hub.admin.get('users/me-1/sk/b') === true && hub.admin.get('users/me-1/tr') === 110, 'the old tab staked: ' + JSON.stringify(hub.admin.get('users/me-1')));
  const p = JSON.parse(localStorage.getItem(STAKE) || 'null');
  ok(p && p.uid === 'me-1' && p.kind === 'bot' && p.res === null, 'pending stake: ' + JSON.stringify(p));
  dead.on = false; tp.close();                            // the tab is gone: no verdict, no close
  // ---- 1. a fresh stamp: left alone ----
  localStorage.setItem(STAKE, JSON.stringify({ ...p, live: Date.now() - 1000 }));
  const P = await E.openOnline(g, hub, { pid: 'me-1' });
  const flow = P.flow;
  await E.wait(700);
  ok(!!hub.admin.get('users/me-1/sk') && !flow.notice, `a fresh stamp was settled: sk ${JSON.stringify(hub.admin.get('users/me-1/sk'))} notice ${JSON.stringify(flow.notice)}`);
  ok(localStorage.getItem(STAKE) !== null, 'the pending stake of the other tab was taken');
  // ---- 2. a stale stamp: closed on the next visit, with the hub notice ----
  localStorage.setItem(STAKE, JSON.stringify({ ...p, live: Date.now() - 7000 }));
  ui.nav('title');
  await E.wait(200);
  await g.ui.openOnline({ hub, pid: 'me-1' });
  await E.until(() => !hub.admin.get('users/me-1/sk') && !!flow.notice, 5000);
  const me = hub.admin.get('users/me-1');
  info.after = me;
  ok(!me.sk && me.tr === 110 && me.l === 1 && me.st === 0 && me.bs === 3, 'closed as a loss: ' + JSON.stringify(me));
  ok(localStorage.getItem(STAKE) === null, 'the pending stake is still there');
  await E.until(() => P.view() === 'hub', 2000);
  for (let i = 0; i < 3; i++) ui.update(1 / 60);
  info.notice = P.text('.on-hub .on-msg');
  ok(flow.notice && flow.notice.kind === 'quit' && /YOU LEFT YOUR LAST MATCH/.test(info.notice || ''), 'hub notice: ' + info.notice);
  ok(g.save.data.online.tr === 110, 'the save cache follows the server: ' + g.save.data.online.tr);
  await E.shot(g, 'reload-notice');
  const bad = hub.denials.filter((d) => d.writes.some(([q]) => /^(users|rk)\//.test(q)));
  ok(bad.length === 0, 'profile denials: ' + JSON.stringify(bad).slice(0, 300));
  ui.nav('title');
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
E.clearKeys();
return { pass: fails.length === 0, fails, info };
