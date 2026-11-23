// The on9-boards scenario (tests/u2/on9-boards.js at 390x844, on9-boards-small.js at 360x640): LEADERBOARDS on the
// in-page hub with the real rules. 0, 1 and 100 rows on each tab; order, shared ranks on ties, my row highlighted, a
// rude name shown as Raider-NNNN, last week's score missing from THIS WEEK, bt 0 hidden from LONGEST; my rank 37, 1
// and 500+ (600 seeded rk); a second open inside 5 minutes reads nothing; a trophy change reads the rank again; a read
// error -> COULD NOT LOAD -> TRY AGAIN works. Nothing sticks out sideways.
import * as N from '/tests/u2/lib/on9kit.js';

export async function boardsScenario(g) {
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  try {
    const hub = await N.makeHub();
    const P = await N.openHub(g, hub, 'me-1', 'Sky Rider');
    const flow = P.flow, V = N.views(P), B = V.boards.boards;
    const WK = N.weekBase(flow.transport.now());
    const state = () => P.q('.bd').dataset.state;
    const pinned = () => [...P.q('.bd-mine').querySelectorAll('span, b')].filter((n) => !n.children.length).map((n) => n.textContent.trim()).join(' | ');
    const sizeCheck = (what) => { N.fitsWidth(P.el, '.bd-tabs, .bd-row, .bd-mine, .bd-state', fails, what); const b = P.q('.on-body'); ok(b.scrollWidth <= b.clientWidth + 1, `${what}: the page scrolls sideways`); };

    // ---------- 0 rows (my own profile is not on the server) ----------
    hub.admin.remove('users/me-1');
    ok(B.stats.reads === 0, 'a board was read before LEADERBOARDS was opened: ' + B.stats.reads);
    await N.openBoards(P);
    ok(P.text('.on-title') === 'LEADERBOARDS', 'title: ' + P.text('.on-title'));
    ok(state() === 'empty' && P.text('.bd-state') === 'NO PLAYERS YET - BE THE FIRST!', `TOP 100 with nobody: ${state()} "${P.text('.bd-state')}"`);
    await N.until(() => /#1\b/.test(pinned()), 3000);
    ok(/YOUR RANK/.test(pinned()) && /#1\b/.test(pinned()), 'my rank with nobody else: ' + pinned());
    await N.shot('boards-empty');
    for (const t of ['week', 'long']) {
      await N.tab(P, t);
      ok(state() === 'empty' && N.rowsOf(P).length === 0, `${t} with nobody: ${state()}`);
      ok(/NOT IN THE TOP 100 YET/.test(pinned()), `${t} pinned: ${pinned()}`);
    }
    sizeCheck('empty');

    // ---------- 1 row: just me ----------
    await N.setMine(hub, flow, 'me-1', N.prof('Sky Rider', { tr: 40, ws: WK + 12, bt: 655 }));
    for (const [t, v] of [['top', '40'], ['week', '+12'], ['long', '1:05.5']]) {
      await V.boards.open(t, true); await N.settle(P); await N.wait(30);
      const rows = N.rowsOf(P);
      ok(rows.length === 1 && rows[0].me && rows[0].rank === 1 && rows[0].v === v && rows[0].name === 'SKY RIDER', `${t} with only me: ${JSON.stringify(rows)}`);
      ok(new RegExp(`#1\\b`).test(pinned()) || t === 'top', `${t}: my place is not #1: ${pinned()}`);
      if (t === 'long') await N.shot('boards-one');
    }

    // ---------- 100 rows ----------
    const list = [];
    for (let i = 0; i < 130; i++) {
      list.push({ uid: `p${String(i).padStart(3, '0')}`, n: i === 7 ? 'fuuuck you' : `Raider ${i}`, tr: 3000 - Math.floor(i / 2) * 20,
        ws: WK + 400 - Math.floor(i / 2) * 3, bt: i % 5 === 4 ? 0 : 3200 - i * 10, w: i });
    }
    list.push({ uid: 'lastweek', n: 'Old Timer', tr: 10, ws: WK - 1, bt: 3290 });
    N.seed(hub, list);
    B.clear(); // (the tabs read above are still fresh in the cache: these numbers are new)
    await N.setMine(hub, flow, 'me-1', N.prof('Sky Rider', { tr: 2650, ws: WK + 390, bt: 3150 }));   // 36 players above me
    await V.boards.open('top', true); await N.settle(P);
    await N.until(() => /#37\b/.test(pinned()), 4000);
    let rows = N.rowsOf(P);
    info.top = rows.slice(0, 4).map((r) => `${r.rank} ${r.name} ${r.v}`);
    ok(rows.length === 100, 'TOP 100 rows: ' + rows.length);
    const num = (v) => Number(String(v).replace(/[^0-9]/g, ''));
    const order = (rs) => rs.every((r, i) => i === 0 || num(rs[i - 1].v) >= num(r.v));
    const shared = (rs) => rs.every((r, i) => r.rank === (i > 0 && rs[i - 1].v === r.v ? rs[i - 1].rank : i + 1));
    ok(order(rows) && shared(rows), 'TOP 100 not in order / ranks not shared: ' + JSON.stringify(rows.slice(0, 6)));
    ok(rows[0].rank === 1 && rows[1].rank === 1 && rows[2].rank === 3, 'tie at the top: ' + JSON.stringify(rows.slice(0, 3)));
    const me = rows.filter((r) => r.me);
    ok(me.length === 1 && me[0].rank === 37 && P.q('.bd-row.me') && getComputedStyle(P.q('.bd-row.me')).boxShadow !== 'none', 'my row: ' + JSON.stringify(me));
    const rude = rows.find((r) => r.uid === 'p007');
    ok(rude && /^RAIDER-\d{4}$/.test(rude.name) && !/fu+ck/i.test(P.el.textContent), 'the rude name: ' + JSON.stringify(rude));
    ok(/YOUR RANK/.test(pinned()) && /#37\b/.test(pinned()) && /2,650/.test(pinned()), 'pinned rank: ' + pinned());
    sizeCheck('top');
    await N.shotAt(P, 'boards-top', 0);
    await N.shotAt(P, 'boards-top-me', P.q('.bd-row.me').offsetTop - 200);
    await N.tab(P, 'week');
    rows = N.rowsOf(P);
    ok(rows.length === 100 && order(rows) && shared(rows) && rows.every((r) => /^\+\d/.test(r.v)), 'THIS WEEK rows: ' + rows.length + ' ' + JSON.stringify(rows.slice(0, 3)));
    ok(!rows.some((r) => r.uid === 'lastweek'), "last week's score is on THIS WEEK");
    ok(/Starts again every Monday/.test(P.text('.bd-note')), 'week note: ' + P.text('.bd-note'));
    ok(rows.some((r) => r.me && r.v === '+390') && /\+390/.test(pinned()) && /YOUR PLACE/.test(pinned()), 'my week row / pinned: ' + pinned());
    await N.shotAt(P, 'boards-week', 0);
    await N.tab(P, 'long');
    rows = N.rowsOf(P);
    const zero = list.filter((p) => !p.bt).map((p) => p.uid);
    ok(rows.length === 100 && order(rows) && !rows.some((r) => zero.includes(r.uid)), 'LONGEST: bt 0 rows shown or out of order: ' + rows.length);
    ok(rows[0].uid === 'lastweek' && rows[0].v === '5:29.0', 'LONGEST first row: ' + JSON.stringify(rows[0]));
    ok(rows.some((r) => r.me && r.v === '5:15.0'), 'my LONGEST row');
    sizeCheck('long');
    await N.shotAt(P, 'boards-long', 1e5);

    // ---------- cache: a second open inside 5 minutes reads nothing ----------
    await N.tab(P, 'top');
    P.scr.onBack();
    await N.until(() => P.view() === 'hub');
    const before = B.stats.reads;
    await N.openBoards(P);
    await N.tab(P, 'week'); await N.tab(P, 'long'); await N.tab(P, 'top');
    await N.wait(200);
    info.reads = B.stats.reads;
    ok(B.stats.reads === before && N.rowsOf(P).length === 100, `a second open read ${B.stats.reads - before} times`);

    // ---------- my trophies change: the rank is read again ----------
    await N.setMine(hub, flow, 'me-1', { tr: 99999 });
    await N.until(() => /#1\b/.test(pinned()), 4000);
    ok(B.stats.reads === before + 1 && /#1\b/.test(pinned()) && /99,999/.test(pinned()), `after a trophy change: reads +${B.stats.reads - before}, pinned ${pinned()}`);
    const rk = {};
    for (let i = 0; i < 600; i++) rk[`rk/x${i}`] = 5000 + i;
    hub.admin.update(rk);
    await N.setMine(hub, flow, 'me-1', { tr: 100 });
    await N.until(() => /500\+/.test(pinned()), 4000);
    ok(/500\+/.test(pinned()), '600 above me: ' + pinned());
    await N.shotAt(P, 'boards-500plus', 0);

    // ---------- a read error, then TRY AGAIN ----------
    const tp = flow.transport, get = tp.get;
    tp.get = (path, q) => (path === 'users' ? Promise.reject(Object.assign(new Error('offline'), { code: 'offline' })) : get(path, q));
    await V.boards.open('week', true); await N.settle(P);
    ok(state() === 'error' && /COULD NOT LOAD/.test(P.text('.bd-state')) && P.q('[data-act="bd-retry"]'), 'read error: ' + state() + ' ' + P.text('.bd-state'));
    await N.shot('boards-error');
    tp.get = get;
    P.tap('[data-act="bd-retry"]');
    await N.until(() => state() === 'rows', 4000);
    ok(state() === 'rows' && N.rowsOf(P).length === 100, 'TRY AGAIN did not load: ' + state());
    ok(hub.denials.length === 0, 'denied writes: ' + JSON.stringify(hub.denials.slice(0, 2)));
    P.scr.onBack();
    await N.until(() => P.view() === 'hub');
    ok(P.view() === 'hub', 'BACK from LEADERBOARDS: ' + P.view());
    g.ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  return { pass: fails.length === 0, fails, info };
}
