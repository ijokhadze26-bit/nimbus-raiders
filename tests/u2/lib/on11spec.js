// The scenario of tests/u2/on11-spectate.js (online stage 5, builder WATCH): this page WATCHES a friend room on the
// in-page hub with the REAL rules (on2kit), three plain players (room.js + match.js, a scripted road) play in it.
//   TOO MANY WATCHERS with 4 markers seeded; the lobby seats with READY ticks; the match -> live cards; a second,
//   page-less watcher joining mid-match has everyone's numbers within 1 s; a sabotage line in the feed; a fall -> an
//   OUT card; 'final' -> the table; a rematch -> the next match's cards with fresh numbers; LEAVE removes my marker;
//   the room removed -> THE ROOM CLOSED; my client wrote nothing but rooms/CODE/sp/me. Real time (about 50 s).
import { makeHub, player, until, wait, openHub, runner, logWrites, fits, bottom, shot } from '/tests/u2/lib/on11kit.js';
import { joinRoom } from '/src/online/room.js';
import { createMatch } from '/src/online/match.js';
import { createWatch, WATCH } from '/src/online/game/watch.js';
import { SAB } from '/src/online/game/sabdata.js';

export async function spectateScenario(g) {
  const fails = [], notes = {};
  const hub = await makeHub();
  const log = logWrites(hub);
  const P = await openHub(g, hub, 'me-1', 'Sky Rider');
  const flow = P.flow, W = () => flow.watch.state;
  const size = `${innerWidth}x${innerHeight}`;
  /** Real time passes, and the UI gets its frames (ui.update: the watch view's cards run on it). */
  const pump = async (ms, cond = null) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      g.ui.update(0.05);
      if (cond && cond()) return true;
      await wait(50);
    }
    return cond ? !!cond() : true;
  };
  const cards = () => { const v = P.scr.el.querySelector('.wv-host .wv'); return v ? [...v.querySelectorAll('.wv-card')] : []; };
  const cardOf = (slot) => P.scr.el.querySelector(`.wv-card[data-slot="${slot}"]`);
  const num = (n) => Number(String(n || '').replace(/[^0-9]/g, '')) || 0;

  const A = await runner(hub, 'ann-1', 'Ann', { fallAt: 9 });
  const B = await runner(hub, 'ben-1', 'Ben', { fallAt: 15 });
  const C = await runner(hub, 'cyd-1', 'Cyd');
  const room = await A.make4();
  const code = room.state.code;
  await B.sit(code);
  await C.sit(code);
  const others = [];
  try {
    // ---------------------------------------------------------- 4 watching already: TOO MANY WATCHERS
    for (let i = 0; i < 4; i++) hub.admin.set(`rooms/${code}/sp/seed-${i}`, true);
    const full = await flow.watchRoom(code);
    await pump(400);
    if (full !== false || !flow.notice || flow.notice.kind !== 'watchfull') fails.push(`5th watcher: ${full} ${JSON.stringify(flow.notice)}`);
    if (P.view() !== 'hub' || !/TOO MANY WATCHERS/.test(P.text('.on-msg') || '')) fails.push(`5th watcher sees ${P.view()} "${P.text('.on-msg')}"`);
    if (P.scr.el.querySelector('.on-msg [data-act="watch"]')) fails.push('TOO MANY WATCHERS offers a WATCH button');
    if (hub.admin.get(`rooms/${code}/sp/me-1`)) fails.push('a refused watcher left a marker');
    await shot('on11-spec-toomany');
    for (let i = 0; i < 4; i++) hub.admin.remove(`rooms/${code}/sp/seed-${i}`);
    flow.clearNotice();

    // ---------------------------------------------------------- watch before GO: the seats
    const mark = log.length;
    if (!(await flow.watchRoom(code))) fails.push(`watchRoom refused: ${JSON.stringify(flow.notice)}`);
    await pump(3000, () => P.view() === 'watch' && W() && W().phase === 'lobby');
    if (P.view() !== 'watch' || !W() || W().phase !== 'lobby') fails.push(`lobby: view ${P.view()} ${JSON.stringify(W() && W().phase)}`);
    if (hub.admin.get(`rooms/${code}/sp/me-1`) !== true) fails.push('no watcher marker of mine');
    A.ready();
    await pump(2000, () => P.scr.el.querySelector('.wv-seats li .wv-rdy'));
    const seats = [...P.scr.el.querySelectorAll('.wv-seats li')].map((li) => [...li.children].map((c) => c.textContent.trim()).join(' '));
    notes.seats = seats;
    if (seats.length !== 4 || !/^ANN.*READY/.test(seats[0]) || !/^BEN NOT READY/.test(seats[1]) || !/EMPTY SEAT/.test(seats[3])) fails.push(`seats ${JSON.stringify(seats)}`);
    if (!/THE MATCH STARTS WHEN EVERYONE IS READY/.test(P.text('.wv-head') || '')) fails.push(`lobby head "${P.text('.wv-head')}"`);
    if (P.text('.wv-count') !== '1 WATCHING') fails.push(`count "${P.text('.wv-count')}"`);
    if (P.text('.wv-code b') !== code) fails.push(`code "${P.text('.wv-code b')}"`);
    if (P.text('.on-title') !== 'WATCHING') fails.push(`title "${P.text('.on-title')}"`);
    fits(P.scr.el, fails, `lobby ${size}`);
    await shot('on11-spec-lobby');

    // ---------------------------------------------------------- the match: live cards
    B.ready(); C.ready();
    await pump(6000, () => W() && W().phase === 'live');
    if (!W() || W().phase !== 'live') fails.push(`not live: ${W() && W().phase}`);
    const mid1 = room.state.mid;
    await pump(9000, () => A.link && A.link.clock() > 2.5);
    await pump(1200);
    const live = cards().map((c) => ({ slot: c.dataset.slot, n: num(c.querySelector('.wv-n').textContent), d: num(c.querySelector('.wv-ds').textContent) }));
    notes.live = live;
    if (live.length !== 3 || !live.every((c) => c.n > 0 && c.d > 0)) fails.push(`live cards ${JSON.stringify(live)}`);
    if (P.scr.el.querySelector('.wv-pcard') && !P.scr.el.querySelector('.wv-pcard').hidden) fails.push('the lobby card still shows with the cards');

    // a second watcher (no page) joins mid-match: its model has everyone's numbers within 1 s
    const W2 = await player(hub, 'wes-1', 'Wes');
    const r2 = await joinRoom({ transport: W2.tp, code, profile: W2.session.profile, watch: true });
    others.push(r2);
    await until(() => r2.state.mid, 3000);
    const link2 = createMatch({ transport: W2.tp, room: { state: r2.state, uid: '', code }, cfg: W2.session.cfg });
    const roster = r2.state.players.map((p) => ({ slot: p.slot, name: p.n, tr: p.tr }));
    const w2 = createWatch({ link: link2, roster });
    const t2 = performance.now();
    await pump(1000, () => { w2.update(0.05); return w2.players.every((p) => p.n > 0 && p.dist > 0); });
    const in2 = performance.now() - t2;
    notes.second = { ms: Math.round(in2), players: w2.players.map((p) => [p.slot, p.n | 0, p.dist | 0]) };
    if (!w2.players.every((p) => p.n > 0 && p.dist > 0)) fails.push(`2nd watcher after 1 s: ${JSON.stringify(notes.second)}`);
    if (P.text('.wv-count') !== '2 WATCHING') { await pump(1000, () => P.text('.wv-count') === '2 WATCHING'); if (P.text('.wv-count') !== '2 WATCHING') fails.push(`count with 2: "${P.text('.wv-count')}"`); }

    // a sabotage and an emote between players -> the feed
    A.sab(SAB.code.fog, 1);
    C.emote(3);
    await pump(2000, () => (P.text('.wv-feed') || '').includes('FOG') && (P.text('.wv-feed') || '').includes('GG'));
    const feed = [...P.scr.el.querySelectorAll('.wv-feed li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    notes.feed = feed;
    if (!feed.includes('ANN → BEN · FOG') || !feed.includes('CYD · GG')) fails.push(`feed ${JSON.stringify(feed)}`);
    fits(P.scr.el, fails, `live ${size}`);
    if (bottom(P.scr.el, '.wv-leave') > innerHeight + 0.5) fails.push(`LEAVE below the screen (${Math.round(bottom(P.scr.el, '.wv-leave'))})`);
    await shot('on11-spec-live');

    // ---------------------------------------------------------- a fall -> OUT, then 'final' -> the table
    await pump(9000, () => cardOf(0) && cardOf(0).classList.contains('down'));
    if (!cardOf(0) || !cardOf(0).classList.contains('down')) fails.push('ANN fell but her card is not OUT');
    await pump(1500);
    notes.out = cardOf(0) ? cardOf(0).querySelector('.wv-out').textContent.replace(/\s+/g, ' ').trim() : null;
    if (!/^(OUT!|3RD)/.test(notes.out || '')) fails.push(`OUT card "${notes.out}"`);
    await shot('on11-spec-out');
    await pump(14000, () => W() && W().phase === 'done');
    if (!W() || W().phase !== 'done') fails.push(`no final: ${W() && W().phase}`);
    await pump(WATCH.doneHoldMs + 800, () => P.scr.el.querySelector('.wv-table:not(.hidden)'));
    const rows = [...P.scr.el.querySelectorAll('.wv-rows li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    notes.table = rows;
    if (rows.length !== 3 || !/^1ST/.test(rows[0]) || !rows[0].includes('CYD') || !rows[1].includes('BEN') || !rows[2].includes('ANN')) fails.push(`table ${JSON.stringify(rows)}`);
    if (P.text('.wv-win') !== 'CYD WINS!') fails.push(`head "${P.text('.wv-win')}"`);
    if (!/WAITING FOR THE NEXT MATCH/.test(P.text('.wv-table') || '')) fails.push('no WAITING FOR THE NEXT MATCH');
    if (!w2.final || w2.final.map((r) => r.slot).join() !== '2,1,0') fails.push(`2nd watcher final ${JSON.stringify(w2.final)}`);
    w2.dispose(); link2.leave();
    fits(P.scr.el, fails, `final ${size}`);
    await shot('on11-spec-final');

    // ---------------------------------------------------------- a rematch -> the next match's cards, fresh numbers
    const before = Math.max(...cards().map((c) => num(c.querySelector('.wv-ds').textContent)), 0);
    for (const r of [A, B, C]) r.room.rematch({ ready: true });
    await pump(9000, () => room.state.mid && room.state.mid !== mid1 && W() && W().phase === 'live');
    if (!W() || W().phase !== 'live' || room.state.mid === mid1) fails.push(`no next match: ${W() && W().phase}`);
    await pump(9000, () => A.link && A.link.mid !== mid1 && A.link.clock() > 1.5);
    await pump(1200);
    const fresh = cards().map((c) => ({ cls: c.className, d: num(c.querySelector('.wv-ds').textContent) }));
    notes.fresh = { before, fresh };
    if (fresh.length !== 3 || fresh.some((c) => c.cls.includes('down') || c.d <= 0 || c.d >= before)) fails.push(`next match cards ${JSON.stringify(notes.fresh)}`);
    if (P.scr.el.querySelector('.wv-table:not(.hidden)')) fails.push('the old table still shows');

    // ---------------------------------------------------------- LEAVE removes my marker
    P.tap('[data-act="leave"]');
    await pump(2000, () => P.view() === 'hub' && !hub.admin.get(`rooms/${code}/sp/me-1`));
    if (P.view() !== 'hub') fails.push(`LEAVE went to ${P.view()}`);
    if (hub.admin.get(`rooms/${code}/sp/me-1`)) fails.push('LEAVE kept my marker');
    if (W() !== null || flow.watch.link) fails.push('still watching after LEAVE');

    // ---------------------------------------------------------- the room removed -> THE ROOM CLOSED
    if (!(await flow.watchRoom(code))) fails.push('watch again refused');
    await pump(3000, () => W() && W().phase === 'live');
    hub.admin.remove(`rooms/${code}`);
    await pump(3000, () => W() && W().phase === 'gone');
    if (!W() || W().phase !== 'gone') fails.push(`room removed: ${W() && W().phase}`);
    await pump(300);
    if (P.text('.wv-head') !== 'THE ROOM CLOSED' || P.text('.wv-leave') !== 'BACK' || cards().length) fails.push(`gone view "${P.text('.wv-head')}" "${P.text('.wv-leave')}" ${cards().length}`);
    fits(P.scr.el, fails, `gone ${size}`);
    await shot('on11-spec-gone');
    P.tap('[data-act="leave"]');
    await pump(1000, () => P.view() === 'hub');
    if (P.view() !== 'hub') fails.push(`BACK went to ${P.view()}`);

    // ---------------------------------------------------------- what my client wrote
    const mine = log.slice(mark).filter((w) => w.uid === 'me-1');
    const bad = mine.filter((w) => !w.paths.every((p) => p === `rooms/${code}/sp/me-1`));
    notes.writes = mine.length;
    if (!mine.length) fails.push('the write log saw nothing (is it wired?)');
    if (bad.length) fails.push(`my client wrote more than its marker: ${JSON.stringify(bad.slice(0, 4))}`);
    const denied = hub.denials.filter((d) => JSON.stringify(d).includes('me-1'));
    if (denied.length) fails.push(`denials of mine: ${JSON.stringify(denied.slice(0, 3))}`);
    notes.denials = hub.denials.length;
  } finally {
    for (const r of [A, B, C]) await r.stop().catch(() => {});
    for (const r of others) await r.leave().catch(() => {});
    if (flow.stopWatching) flow.stopWatching();
    g.ui.nav('title');
  }
  if (fails.length) throw new Error(fails.join('\n'));
  return { ok: true, size, notes };
}
