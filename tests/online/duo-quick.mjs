// QUICK MATCH between REAL pages (STAGE3 "INTEGRATOR" step 2): the queue on the hub with the real rules, pairing,
// the 10 s bot, a whole match against a person and against the bot, CANCEL, a page that dies while searching, PLAY
// AGAIN, and a bot match on a bad line. The pages' quick timers run on the hub's virtual clock (bridge mode), so the
// times below are the harness's times. Run with `node scripts/duo.mjs quick`.

const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const wipe = (p) => p.ev(() => window.__game.squad.setCount(0, 'horde'));
const shown = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;
const tickets = (duo) => Object.keys(duo.hub.admin.get('queue') || {});
const rooms = (duo) => Object.entries(duo.hub.admin.get('rooms') || {}).filter(([, r]) => r && r.h);
const quick = (p) => p.ev(() => {
  const f = window.__game.online.flow, l = f.link, q = f.quick.q;
  return {
    mode: f.mode, phase: q ? q.state.phase : null, why: q ? q.state.why : null, match: f.quick.match,
    peers: l ? l.peers.map((x) => ({ slot: x.slot, name: x.name, bot: !!x.bot })) : null, ranked: l ? l.ranked : null,
  };
});
/** Nothing on the page says what kind of rival this is. */
const saysKind = (p) => p.ev(() => /\b(BOT|COMPUTER|HUMAN|PLAYER FOUND)\b/i.test(document.body.innerText));
const rematchLabel = (p) => p.text('.vsr-rematch');
const hist = (p) => p.ev(() => window.__game.save.data.online.hist.map((h) => `${h.k}:${h.r}:${h.n}`));
/** Plays until every page shows its result screen; -> their views. */
async function toResults(duo, ps, max = 30) {
  const done = await duo.play(max, async () => { const vs = await Promise.all(ps.map((p) => p.view())); return vs.every(shown) ? vs : null; }, 5);
  if (!done) throw new Error(`no result screen on every page: ${JSON.stringify(await Promise.all(ps.map((p) => p.view())))}`);
  return done;
}
/** Plays until the moment card (RIVAL DOWN! / SQUAD DOWN!) shows on the page or the result screen comes. */
const downText = (p) => p.ev(() => { const n = document.querySelector('.vd-big'); return n && n.getClientRects().length ? n.textContent : null; });

export const scenarios = [
  {
    name: 'two pages pair within 2 s and play a full match: one room, the same road, YOU WIN! / YOU LOSE',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B', { size: [360, 640] });
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await bots(A, B);
      await duo.quick(A);
      await A.shot('finding');
      await duo.tick(100);
      const tapB = duo.clock.now();
      await duo.quick(B);
      const [fa, fb] = [await duo.found(A), await duo.found(B)];
      const pairedIn = duo.clock.now() - tapB;
      note(`paired ${pairedIn} ms after B's tap: A sees ${fa.name} (${fa.hero}/${fa.weapon}), B sees ${fb.name}`);
      eq([fa.name, fb.name], ['Ben', 'Ann'], 'RIVAL FOUND! names');
      eq([fa.hero, fa.weapon], ['pip', 'thunderclap'], 'A reads the rival\'s picks');
      await A.shot('found'); await B.shot('found');
      const [a0, b0] = await duo.go(A, B);
      const liveIn = duo.clock.now() - tapB;
      note(`both matches live ${liveIn} ms after B's tap`);
      ok(a0.seed === b0.seed && a0.seed > 0, `the same seed: ${a0.seed} / ${b0.seed}`);
      const rs = rooms(duo);
      eq(rs.length, 1, `rooms on the hub: ${JSON.stringify(rs)}`);
      const [code, r] = rs[0];
      ok(r.k === 'quick' && r.q === 'A' && r.h === 'B' && r.sl[0] === 'B' && r.sl[1] === 'A' && r.mid, `the quick room ${code}: ${JSON.stringify({ k: r.k, q: r.q, h: r.h, sl: r.sl, st: r.st, mid: r.mid })}`);
      const rec = duo.hub.admin.get(`matches/${r.mid}`);
      ok(rec && rec.k === 'quick' && Object.values(rec.u).sort().join() === 'A,B', `match record: ${JSON.stringify(rec && { k: rec.k, u: rec.u })}`);
      eq(tickets(duo), [], 'no ticket left');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
      // the VS card on both pages
      await duo.play(1);
      const [ac, bc] = [await A.view(), await B.view()];
      ok(ac.card !== null && bc.card !== null, `VS card on both pages: ${ac.card} / ${bc.card}`);
      await A.shot('card'); await B.shot('card');
      eq([(await quick(A)).match.kind, (await quick(B)).match.kind], ['human', 'human'], 'quick.match kind');
      // 12 s of play, then B falls
      await duo.play(20, async () => (await A.view()).t >= 12 && (await B.view()).t >= 12);
      await wipe(B);
      const [a, b] = await toResults(duo, [A, B]);
      eq([a.result.result, a.ribbon, b.result.result, b.ribbon], ['win', 'YOU WIN!', 'lose', 'YOU LOSE'], 'the two result screens');
      eq([await rematchLabel(A), await rematchLabel(B)], ['PLAY AGAIN', 'PLAY AGAIN'], 'the big button in a quick match');
      eq([await hist(A), await hist(B)], [['q:w:Ben'], ['q:l:Ann']], 'history rows (quick)');
      await A.shot('result'); await B.shot('result');
      ok(!(await saysKind(A)) && !(await saysKind(B)), 'a screen says what kind of rival this is');
      eq(duo.hub.admin.get('meter') && Object.values(duo.hub.admin.get('meter'))[0], 1, 'the day meter counted the match once');
    },
  },
  {
    name: 'a lone page gets a rival at 10 s and plays a full match to a result; no hub write from GO to the result',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A');
      await duo.signIn(A, 'Ann');
      await bots(A);
      const tap = duo.clock.now();
      await duo.quick(A);
      await duo.until(() => tickets(duo).includes('A'), 'A\'s ticket');
      await duo.tick(3000);
      await A.page.waitForTimeout(400); // (the finding view redraws itself four times a second, in real time)
      ok(/^0:0[23]$/.test(await A.text('.on-find-secs')), `the counter after 3 s: ${await A.text('.on-find-secs')}`);
      const f = await duo.found(A);
      const at = duo.clock.now() - tap;
      note(`RIVAL FOUND! ${at} ms after the tap: ${f.name} (${f.hero} / ${f.weapon})`);
      ok(at >= 9800 && at <= 11000, `RIVAL FOUND! at ${at} ms`);
      await duo.until(() => !tickets(duo).length, 'the ticket to go');
      eq(rooms(duo), [], 'no room');
      await A.shot('botfound');
      await duo.go(A);
      const qa = await quick(A);
      ok(qa.match && qa.match.kind === 'bot' && qa.peers.length === 1 && qa.peers[0].bot && qa.peers[0].name === f.name && qa.ranked === false, `the bot link: ${JSON.stringify(qa)}`);
      await duo.play(1);
      ok((await A.view()).card !== null, 'the VS card');
      await A.shot('botcard');
      await duo.play(6, async () => (await A.view()).clock >= 0, 1);
      const writes0 = duo.hub.stats.writes, t0 = Date.now();
      // the whole match on the autopilot (whoever falls first; a little over 3 minutes of match at most)
      let moment = null;
      const v = await duo.play(330, async () => { const w = await A.view(); if (!moment) moment = await downText(A); return shown(w) ? w : null; }, 10);
      ok(v && shown(v), `no result: ${JSON.stringify(await A.view())}`);
      const writes = duo.hub.stats.writes - writes0;
      note(`result ${v.result.result} (${v.result.reason}) at ${v.result.t} s, ${v.result.d} m; moment "${moment}"; ${writes} hub writes; ${Math.round((Date.now() - t0) / 1000)} s real`);
      eq(writes, 0, 'hub writes from GO to the result');
      ok(['win', 'lose'].includes(v.result.result) && v.result.t > 60, `a full match: ${JSON.stringify(v.result)}`);
      eq(await rematchLabel(A), 'PLAY AGAIN', 'the big button');
      eq(await hist(A), [`q:${v.result.result[0]}:${f.name}`], 'history row');
      ok(!duo.hub.admin.get('meter'), 'a bot match is not counted on the day meter');
      ok(!(await saysKind(A)), 'a screen says what kind of rival this is');
      await A.shot('botresult');
    },
  },
  {
    name: 'two pages that search 3 s apart pair (no bot)',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await duo.quick(A);
      await duo.tick(3000);
      const tapB = duo.clock.now();
      await duo.quick(B);
      const [fa, fb] = [await duo.found(A), await duo.found(B)];
      note(`paired ${duo.clock.now() - tapB} ms after B's tap (A searched ${fa.secs} s)`);
      eq([fa.name, fb.name], ['Ben', 'Ann'], 'names');
      await duo.go(A, B);
      eq([(await quick(A)).match.kind, (await quick(B)).match.kind], ['human', 'human'], 'both matches are against each other');
      eq(tickets(duo), [], 'no ticket left');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'three pages within 0.5 s: two pair, the third gets a rival by 14 s, no ticket left',
    async run(duo, { ok, eq, note }) {
      const ps = [await duo.page('A'), await duo.page('B'), await duo.page('C', { size: [360, 640] })];
      for (const [i, p] of ps.entries()) await duo.signIn(p, ['Ann', 'Ben', 'Cyd'][i]);
      const taps = [];
      for (const p of ps) { taps.push(duo.clock.now()); await duo.quick(p); await duo.tick(200); }
      const at = {};
      await duo.until(async () => {
        for (const [i, p] of ps.entries()) if (!at[p.pid]) { const f = await p.ev(() => window.__game.online.flow.quickView()); if (f && f.phase === 'found') at[p.pid] = { ms: duo.clock.now() - taps[i], name: f.name }; }
        return Object.keys(at).length === 3;
      }, 'RIVAL FOUND! on all three pages', { max: 16000 });
      await duo.go(...ps);
      const kinds = await Promise.all(ps.map(async (p) => (await quick(p)).match.kind));
      note(`found ${JSON.stringify(at)}; kinds ${kinds.join(',')}; denials ${duo.denials.length}`);
      eq(kinds.filter((k) => k === 'human').length, 2, 'two pages play each other');
      const lone = ps[kinds.indexOf('bot')];
      ok(at[lone.pid].ms <= 14000, `${lone.pid} found its rival ${at[lone.pid].ms} ms after its tap`);
      const pair = ps.filter((p) => p !== lone).map((p) => p.pid);
      eq([at[pair[0]].name, at[pair[1]].name].sort(), pair.map((pid) => ({ A: 'Ann', B: 'Ben', C: 'Cyd' }[pid])).reverse().sort(), 'the pair sees each other');
      eq(tickets(duo), [], 'no ticket left');
      const rs = rooms(duo);
      eq(rs.length, 1, `exactly one room left (the pair's): ${JSON.stringify(rs.map(([c, r]) => [c, r.h, r.sl, r.st]))}`);
      ok(Object.values(rs[0][1].sl).sort().join() === pair.slice().sort().join(), `the room holds the pair: ${JSON.stringify(rs[0][1].sl)}`);
      // the only rule refusals allowed are a lost claim (a `m` somebody else wrote first)
      ok(duo.denials.every((d) => d.writes.every(([p]) => /^queue\/[^/]+\/m$/.test(p))), `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'CANCEL while searching: no ticket, the hub is back, a second search works',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A', { size: [360, 640] });
      await duo.signIn(A, 'Ann');
      await duo.quick(A);
      await duo.until(() => tickets(duo).includes('A'), 'A\'s ticket');
      await duo.tick(2000);
      await duo.cancel(A);
      eq([tickets(duo), rooms(duo)], [[], []], 'nothing left on the hub');
      const q = await A.ev(() => ({ mode: window.__game.online.flow.mode, q: window.__game.online.flow.quick.q }));
      eq(q, { mode: null, q: null }, 'the flow is out of quick mode');
      // nothing fires later: 12 s on, still the hub
      await duo.tick(12000);
      eq((await A.view()).view, 'hub', 'still the hub 12 s later');
      ok(!(await A.has('.on-find')) || (await A.view()).view === 'hub', 'no finding view');
      // a second search
      const tap = duo.clock.now();
      await duo.quick(A);
      await duo.until(() => tickets(duo).includes('A'), 'the second ticket');
      const f = await duo.found(A);
      ok(duo.clock.now() - tap <= 11000 && f.name, `the second search found ${f.name} after ${duo.clock.now() - tap} ms`);
      await duo.until(() => !tickets(duo).length, 'the ticket to go');
      // BACK while RIVAL FOUND! shows: back to the hub, nothing left, no match starts
      await A.key('Escape');
      await duo.until(async () => (await A.view()).view === 'hub', 'BACK on RIVAL FOUND!');
      await duo.tick(6000);
      const v = await A.view();
      ok(!v.live && v.view === 'hub', `no match after BACK: ${JSON.stringify({ live: v.live, view: v.view })}`);
      eq([tickets(duo), rooms(duo)], [[], []], 'nothing left on the hub');
    },
  },
  {
    name: 'a page that dies while searching leaves no ticket; a rival searching meanwhile still gets a match by 14 s',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await duo.quick(A);
      await duo.until(() => tickets(duo).includes('A'), 'A\'s ticket');
      await duo.crash(A);
      const tapB = duo.clock.now();
      await duo.quick(B);
      const f = await duo.found(B);
      const at = duo.clock.now() - tapB;
      const why = (await quick(B)).why;
      note(`B found ${f.name} after ${at} ms (${why}); A's ticket ${tickets(duo).includes('A') ? 'still there' : 'gone'}`);
      ok(at <= 14000, `B's rival came ${at} ms after the tap`);
      ok(f.name !== 'Ann', 'B is not paired with the dead page');
      await duo.until(() => !tickets(duo).includes('A'), 'A\'s ticket to go (onDisconnect)', { max: 8000 });
      await duo.go(B);
      eq((await quick(B)).match.kind, 'bot', 'B plays a bot');
      eq(tickets(duo), [], 'no ticket left');
      eq(rooms(duo).filter(([, r]) => r.h === 'B'), [], 'no room of B\'s left');
    },
  },
  {
    name: 'PLAY AGAIN: both pages search again and pair again; then one leaves and the other gets a rival',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await bots(A, B);
      await duo.quick(A);
      await duo.tick(100);
      await duo.quick(B);
      await duo.found(A); await duo.found(B);
      const [s1] = await duo.go(A, B);
      const code1 = rooms(duo)[0][0];
      await duo.play(12, async () => (await A.view()).t >= 6);
      await wipe(A);
      await toResults(duo, [A, B]);
      // both tap PLAY AGAIN: a new search on both pages, a new room, a new road
      await A.click('.vsr-rematch');
      await duo.until(async () => (await A.view()).view === 'quick', 'A: the finding view after PLAY AGAIN');
      await duo.tick(300);
      await B.click('.vsr-rematch');
      const [fa, fb] = [await duo.found(A), await duo.found(B)];
      eq([fa.name, fb.name], ['Ben', 'Ann'], 'paired again');
      const [s2] = await duo.go(A, B);
      const rs = rooms(duo);
      note(`match 1 seed ${s1.seed} room ${code1}; match 2 seed ${s2.seed} rooms ${rs.map(([c]) => c)}`);
      ok(s2.seed !== s1.seed, 'a new road');
      ok(rs.length === 1 && rs[0][0] !== code1 && rs[0][1].k === 'quick', `a new quick room: ${JSON.stringify(rs.map(([c, r]) => [c, r.k, r.st]))}`);
      await duo.play(12, async () => (await A.view()).t >= 6);
      await wipe(B);
      await toResults(duo, [A, B]);
      eq(await hist(A), ['q:w:Ben', 'q:l:Ben'], 'A\'s history: two quick rows');
      // A taps PLAY AGAIN, B leaves: A gets a rival by itself
      await B.click('.vsr [data-act="leave"]');
      await duo.until(async () => (await B.view()).view === 'hub', 'B on the hub after LEAVE');
      const tap = duo.clock.now();
      await A.click('.vsr-rematch');
      const f = await duo.found(A);
      note(`A found ${f.name} after ${duo.clock.now() - tap} ms`);
      ok(duo.clock.now() - tap <= 11000 && f.name !== 'Ben', 'A\'s new rival');
      await duo.go(A);
      eq((await quick(A)).match.kind, 'bot', 'A plays a bot');
      eq(tickets(duo), [], 'no ticket left');
    },
  },
  {
    name: 'a bot match on a bad line (lat400, jit300, loss5) at 390x844: the timers hold, the match plays to a result',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A', { net: 'lat400,jit300,loss5' });
      await duo.signIn(A, 'Ann');
      await bots(A);
      const tap = duo.clock.now();
      await duo.quick(A);
      const f = await duo.found(A);
      const at = duo.clock.now() - tap;
      ok(at >= 9800 && at <= 12500, `RIVAL FOUND! ${at} ms after the tap`);
      await duo.until(() => !tickets(duo).length, 'the ticket to go');
      await duo.go(A);
      await duo.play(25, async () => (await A.view()).t >= 20);
      const mid = await A.view();
      ok(mid.peers[0].alive && mid.peers[0].dist > 100 && /\S/.test(mid.bar || ''), `the rival on the bar: ${JSON.stringify(mid.peers)} "${mid.bar}"`);
      await A.shot('badline-mid');
      await wipe(A);
      let moment = null;
      const v = await duo.play(15, async () => { const w = await A.view(); if (!moment) moment = await downText(A); return shown(w) ? w : null; }, 2);
      note(`found ${f.name} at ${at} ms; result ${v && JSON.stringify(v.result)}; moment "${moment}"`);
      ok(v && shown(v), `no result: ${JSON.stringify(await A.view())}`);
      eq([v.result.result, v.ribbon], ['lose', 'YOU LOSE'], 'my fall loses');
      eq(moment, 'SQUAD DOWN!', 'the moment card');
      await A.shot('badline-result');
    },
  },
];
