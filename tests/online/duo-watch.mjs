// WATCHING a friend room from REAL pages through the bridge (STAGE5 "INTEGRATOR" point 2): a WATCH LINK before GO
// and a second one mid-match (their cards carry the players' current numbers), the final table on both, the 5th
// watcher turned away; a rematch of four that the watcher follows; a friend who types the code of a running room
// and taps WATCH. A watcher writes nothing but its own marker. Run with `node scripts/duo.mjs watch`.
import { room, tables } from './duo-four.mjs';

const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const wipe = (p) => p.ev(() => { window.__keep = 0; window.__game.squad.setCount(0, 'horde'); });
const sp = (duo, code) => Object.keys(duo.hub.admin.get(`rooms/${code}/sp`) || {}).sort();
/** Steps the match (pages run their frames) until `fn()` holds; fails with `what` after `secs`. */
async function playUntil(duo, fn, what, secs = 10) {
  const v = await duo.play(secs, fn, 1);
  if (!v) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(await Promise.all(duo.players.map((p) => p.view())))}`);
  return v;
}
/** Steps until the watch view of `p` shows the final table. */
const finalTable = (duo, p, what) => playUntil(duo, async () => { const w = await duo.watchView(p); return w && w.table ? w : null; }, what);

export const scenarios = [
  {
    name: 'a WATCH LINK before GO (360x640) and one mid-match: live cards, the same table; the 5th watcher is turned away',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      const code = await duo.lobby(A, B, ['Ann', 'Ben']);
      await bots(A, B);
      const link = await A.ev(() => window.__game.online.flow.shareLink({ watch: true }));
      ok(link.includes(`room=${code}`) && link.includes('watch=1'), `watch link ${link}`);
      const S = await duo.watch('S', code, { size: [360, 640] });
      let s = await S.view();
      eq([s.watch.phase, s.watch.code], ['lobby', code], 'S watches the lobby');
      ok(/ANN/.test(await S.text('.wv-seats')) && /BEN/.test(await S.text('.wv-seats')), `S sees the seats: ${await S.text('.wv-seats')}`);
      await duo.until(async () => /1 WATCHING/.test((await A.text('.on-lobby, .on-card')) || '') || /1 WATCHING/.test((await A.ev(() => document.body.innerText)) || ''), 'A: 1 WATCHING');
      await S.shot('lobby'); await A.shot('lobby-watching');
      await duo.ready(A, B);
      await duo.go(A, B);
      await playUntil(duo, async () => { const v = await S.view(); return v.watch.phase === 'live' && v.watch.cards === 2; }, 'S: the cards');
      await duo.play(14, async () => (await A.view()).t >= 7);
      // a second watcher mid-match: its cards have everyone's numbers within a second
      const T2 = await duo.watch('T', code);
      eq((await T2.view()).watch.phase, 'live', 'T joins a live match');
      await duo.play(1);
      const [a, b, wt, ws] = [await A.view(), await B.view(), await duo.watchView(T2), await duo.watchView(S)];
      note(`A ${a.dist} m n ${a.n}, B ${b.dist} m n ${b.n}; T sees ${JSON.stringify(wt.cards.map((c) => [c.dist, c.n]))}; S sees ${JSON.stringify(ws.cards.map((c) => [c.dist, c.n]))}`);
      for (const [w, who] of [[wt, 'T'], [ws, 'S']]) {
        ok(Math.abs(w.cards[0].dist - a.dist) < 25 && Math.abs(w.cards[1].dist - b.dist) < 25, `${who}'s distances`);
        ok(w.cards.every((c) => c.n > 0 && !c.down), `${who}'s squads`);
      }
      eq(sp(duo, code), ['S', 'T'], 'two watcher markers');
      await S.shot('live'); await T2.shot('live');
      // two more markers (seeded like the owner's console would): a 5th watcher is told there are too many
      duo.hub.admin.update({ [`rooms/${code}/sp/X1`]: true, [`rooms/${code}/sp/X2`]: true });
      const U = await duo.page('U', { room: code, query: { watch: '1' } });
      await duo.until(async () => (await U.view()).notice === 'watchfull', 'U: TOO MANY WATCHERS');
      ok(/TOO MANY WATCHERS/.test(await U.ev(() => document.body.innerText)), 'U reads TOO MANY WATCHERS');
      eq(sp(duo, code), ['S', 'T', 'X1', 'X2'], 'no marker for the 5th');
      await U.shot('toomany');
      // B falls: both watchers see OUT, then the table ANN WINS!
      await wipe(B);
      await tables(duo, [A, B]);
      const [fs, ft] = [await finalTable(duo, S, 'S: the table'), await finalTable(duo, T2, 'T: the table')];
      eq([fs.head, ft.head], ['ANN WINS!', 'ANN WINS!'], 'the watchers\' heads');
      eq([fs.table.map((r) => r.slot), ft.table.map((r) => r.slot)], [[0, 1], [0, 1]], 'the watchers\' tables');
      const tm = await B.ev(() => document.querySelector('.screen-vsresult .vsr-places li[data-slot="1"] .vsr-tm').textContent);
      ok(fs.table[1].text.includes(tm) && ft.table[1].text.includes(tm), `B's time ${tm} on both watchers: ${JSON.stringify([fs.table, ft.table])}`);
      await S.shot('table'); await T2.shot('table');
      // LEAVE: S's marker goes
      await S.click('.wv-leave');
      await duo.until(async () => !sp(duo, code).includes('S'), 'S\'s marker removed');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'rematch with four: everyone taps REMATCH -> a new match on every page, and the watcher follows it',
    async run(duo, { ok, eq, note }) {
      const { ps, code, vs } = await room(duo, ['Ann', 'Ben', 'Cyd', 'Dan']);
      const [A, B, C, D] = ps;
      await duo.play(10, async () => (await A.view()).t >= 4);
      const S = await duo.watch('S', code);
      await wipe(D); await duo.play(1.5); await wipe(C); await duo.play(1.5); await wipe(B);
      await tables(duo, ps);
      const w1 = await finalTable(duo, S, 'S: the table of match 1');
      eq(w1.table.map((r) => r.slot), [0, 1, 2, 3], 'S\'s table of match 1');
      // REMATCH on every page (OVER is in: everyone has a record or won)
      for (const p of ps) {
        await p.ev(() => { window.__keep = 80; });
        await p.click('.vsr-rematch');
        await duo.pump();
      }
      const vs2 = await duo.go(...ps);
      ok(vs2.every((v) => v.seed === vs2[0].seed && v.seed !== vs[0].seed), `a new road for all four: ${vs[0].seed} -> ${vs2.map((v) => v.seed)}`);
      await playUntil(duo, async () => { const v = await S.view(); return v.watch.phase === 'live' && v.watch.cards === 4; }, 'S: the cards of match 2');
      await duo.play(12, async () => (await A.view()).t >= 5);
      const w2 = await duo.watchView(S), a = await A.view();
      note(`match 2: A at ${a.dist} m; S sees ${JSON.stringify(w2.cards.map((c) => [c.dist, c.down]))}`);
      ok(w2.cards.every((c) => !c.down && c.n > 0) && Math.abs(w2.cards[0].dist - a.dist) < 25 && !w2.table, `S's fresh cards: ${JSON.stringify(w2)}`);
      await S.shot('rematch');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'a friend types the code of a running room: MATCH ALREADY STARTED + WATCH, and watching works from there',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A'), B = await duo.page('B'), C = await duo.page('C', { size: [360, 640] });
      const code = await duo.lobby(A, B, ['Ann', 'Ben']);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(8, async () => (await A.view()).t >= 3);
      await duo.signIn(C, 'Cyd');
      await C.type('.on-code', code);
      await C.key('Enter');
      await duo.until(async () => (await C.view()).notice === 'playing', 'C: MATCH ALREADY STARTED');
      ok(/MATCH ALREADY STARTED/.test(await C.text('.on-hub .on-msg')), 'C reads MATCH ALREADY STARTED');
      ok(await C.has('.on-hub .on-msg [data-act="watch"]'), 'C sees the WATCH button');
      eq(sp(duo, code), [], 'no marker written for a typed code');
      await C.shot('playing');
      await C.click('.on-hub .on-msg [data-act="watch"]');
      await playUntil(duo, async () => { const v = await C.view(); return v.view === 'watch' && v.watch && v.watch.phase === 'live' && v.watch.cards === 2; }, 'C: watching');
      await duo.play(1);
      const w = await duo.watchView(C);
      ok(w.cards.every((c) => c.n > 0), `C's cards: ${JSON.stringify(w.cards)}`);
      eq(sp(duo, code), ['C'], 'C\'s marker');
      await C.shot('watching');
      await C.click('.wv-leave');
      await duo.until(async () => (await C.view()).view === 'hub' && !sp(duo, code).length, 'C back on the hub, the marker gone');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
];
