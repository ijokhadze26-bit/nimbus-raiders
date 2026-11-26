// The scenario of tests/u2/on11-hub.js and on11-hub-small.js (online stage 5, builder WATCH): the hub's WATCH ways in,
// on the in-page hub with the REAL rules (on2kit), at whatever size the page has.
//   a WATCH LINK (?room=CODE&watch=1) on a page with no name goes straight to watching (no name asked), and a bad one
//   says ROOM NOT FOUND there; the hub words of stage 5; ROOM IS FULL and MATCH ALREADY STARTED carry a blue WATCH
//   button (nothing overlaps) and WATCH watches the room I tried.
import { makeHub, player, until, wait, openHub, boxes, page, shot } from '/tests/u2/lib/on11kit.js';

export async function hubScenario(g) {
  const fails = [], notes = {};
  const hub = await makeHub();
  const size = `${innerWidth}x${innerHeight}`;
  const pump = async (ms, cond = null) => {
    const end = performance.now() + ms;
    while (performance.now() < end) { g.ui.update(0.05); if (cond && cond()) return true; await wait(50); }
    return cond ? !!cond() : true;
  };
  const X = await player(hub, 'xan-1', 'Xan'), Y = await player(hub, 'yul-1', 'Yul');
  const live = await X.create();
  await Y.join(live.state.code).then((r) => { live.guest = r; });
  live.ready(true); live.guest.ready(true);
  await until(() => live.state.mid, 4000);
  if (!live.state.mid) fails.push('the live room did not start');
  const code = live.state.code;
  try {
    // ---------------------------------------------------------- a watch link, no name yet
    g.ui.nav('title');
    const opened = await g.ui.openOnline({ hub, pid: 'anon-1', room: code, watch: true });
    if (!opened.ok) throw new Error('ONLINE did not open: ' + JSON.stringify(opened));
    const P = page(g);
    const flow = P.flow;
    let sawName = false;
    await pump(4000, () => { if (P.view() === 'name') sawName = true; return P.view() === 'watch' && flow.watch.state && flow.watch.state.phase === 'live'; });
    notes.link = { view: P.view(), phase: flow.watch.state && flow.watch.state.phase, name: flow.name };
    if (P.view() !== 'watch' || !flow.watch.state || flow.watch.state.phase !== 'live') fails.push(`watch link: ${JSON.stringify(notes.link)}`);
    if (flow.name) fails.push('the page has a name already (the test needs a nameless page)');
    if (sawName) fails.push('the watch link asked for a name first');
    if (hub.admin.get(`rooms/${code}/sp/anon-1`) !== true) fails.push('no marker for the watch-link visitor');
    await pump(600);
    if (P.scr.el.querySelectorAll('.wv-card').length !== 2) fails.push(`watch link: ${P.scr.el.querySelectorAll('.wv-card').length} cards`);
    await shot('on11-hub-watchlink');
    P.tap('[data-act="leave"]');
    await pump(2000, () => g.state === 'title');
    if (g.state !== 'title') fails.push(`LEAVE with no name went to ${g.state}`);
    if (hub.admin.get(`rooms/${code}/sp/anon-1`)) fails.push('LEAVE kept the marker');

    // a watch link to a room that is not there: the notice on the watch view, BACK to the title
    g.ui.nav('online', { room: 'QQQQ', watch: true });
    await pump(4000, () => P.view() === 'watch' && /ROOM NOT FOUND/.test(P.text('.wv-head') || ''));
    if (P.view() !== 'watch' || !/ROOM NOT FOUND/.test(P.text('.wv-head') || '') || P.text('.wv-leave') !== 'BACK') fails.push(`bad watch link: ${P.view()} "${P.text('.wv-head')}" "${P.text('.wv-leave')}"`);
    await shot('on11-hub-badlink');
    P.tap('[data-act="leave"]');
    await pump(2000, () => g.state === 'title');
    if (g.state !== 'title') fails.push(`BACK from a bad link went to ${g.state}`);

    // ---------------------------------------------------------- the hub words
    await openHub(g, hub, 'anon-1', 'Sky Rider');
    const friend = P.text('.on-create') && P.scr.el.querySelector('.on-create').closest('.on-card').querySelector('.on-p').textContent;
    if (friend !== 'Make a room for up to 4 players and send the code to your friends. Last squad standing wins!') fails.push(`PLAY A FRIEND words "${friend}"`);
    const how = [...P.scr.el.querySelectorAll('.on-how li')].map((li) => li.textContent);
    if (how[1] !== 'Pick your hero and weapon. Everyone taps READY.') fails.push(`how-it-works "${how[1]}"`);
    for (const sel of ['.on-quick', '.on-create', '.on-code', '[data-act="join"]', '.on-me', '.on-boards']) if (!P.q(sel)) fails.push(`hub lost ${sel}`);

    // ---------------------------------------------------------- ROOM IS FULL -> WATCH
    const full = await X.create();
    const fullGuest = await Y.join(full.state.code);
    P.type('.on-code', full.state.code);
    P.tap('[data-act="join"]');
    await pump(5000, () => flow.notice && flow.notice.kind === 'full' && P.q('.on-msg [data-act="watch"]'));
    notes.full = P.text('.on-msg');
    if (!/^ROOM IS FULL/.test(notes.full || '') || !P.q('.on-msg [data-act="watch"]')) fails.push(`full: "${notes.full}"`);
    else boxes(P.scr.el, ['.on-msg b', '.on-msg span', '.on-msg [data-act="watch"]', '.on-me'], fails, `full ${size}`);
    await shot('on11-hub-full');
    P.tap('.on-msg [data-act="watch"]');
    await pump(4000, () => P.view() === 'watch' && flow.watch.state && flow.watch.state.phase === 'lobby');
    if (P.view() !== 'watch' || !flow.watch.state || flow.watch.state.code !== full.state.code || flow.watch.state.phase !== 'lobby') fails.push(`WATCH on full: ${P.view()} ${JSON.stringify(flow.watch.state && { code: flow.watch.state.code, phase: flow.watch.state.phase })}`);
    P.tap('[data-act="leave"]');
    await pump(2000, () => P.view() === 'hub');
    if (P.view() !== 'hub') fails.push(`LEAVE went to ${P.view()}`);
    await fullGuest.leave(); await full.leave();

    // ---------------------------------------------------------- MATCH ALREADY STARTED -> WATCH
    P.type('.on-code', code);
    P.tap('[data-act="join"]');
    await pump(5000, () => flow.notice && flow.notice.kind === 'playing' && P.q('.on-msg [data-act="watch"]'));
    notes.playing = P.text('.on-msg');
    if (!/^MATCH ALREADY STARTED/.test(notes.playing || '') || !P.q('.on-msg [data-act="watch"]')) fails.push(`playing: "${notes.playing}"`);
    else boxes(P.scr.el, ['.on-msg b', '.on-msg span', '.on-msg [data-act="watch"]', '.on-me'], fails, `playing ${size}`);
    await pump(300);
    const wb = P.q('.on-msg [data-act="watch"]');
    if (wb && wb.getBoundingClientRect().bottom > innerHeight + 0.5) fails.push(`WATCH is below the screen (${Math.round(wb.getBoundingClientRect().bottom)})`);
    await shot('on11-hub-playing');
    P.tap('.on-msg [data-act="watch"]');
    await pump(4000, () => P.view() === 'watch' && flow.watch.state && flow.watch.state.phase === 'live');
    if (P.view() !== 'watch' || !flow.watch.state || flow.watch.state.phase !== 'live') fails.push(`WATCH on playing: ${P.view()} ${flow.watch.state && flow.watch.state.phase}`);
    if (flow.room) fails.push('watching took a seat');
    await pump(600);
    await shot('on11-hub-watching');
    P.tap('[data-act="leave"]');
    await pump(2000, () => P.view() === 'hub');
    if (P.view() !== 'hub' || flow.notice) fails.push(`after LEAVE: ${P.view()} ${JSON.stringify(flow.notice)}`);
    if (hub.admin.get(`rooms/${code}/sp/anon-1`)) fails.push('a marker was left behind');
    notes.denials = hub.denials.filter((d) => JSON.stringify(d).includes('anon-1')).length;
    if (notes.denials) fails.push(`denials of mine: ${JSON.stringify(hub.denials.slice(0, 3))}`);
  } finally {
    await live.guest.leave().catch(() => {});
    await live.leave().catch(() => {});
    if (g.online && g.online.flow && g.online.flow.stopWatching) g.online.flow.stopWatching();
    g.ui.nav('title');
  }
  if (fails.length) throw new Error(fails.join('\n'));
  return { ok: true, size, notes };
}
