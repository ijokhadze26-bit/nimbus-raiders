// Two real pages play whole matches against each other (SPEC4 §12 stage 1): the same road for both, a fall and
// its two result screens, the tie rule, a rematch on a new road, and leaving in the middle.
// Run with `node scripts/duo.mjs match`.

const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const wipe = (p, extra = 0) => p.ev((d) => { const g = window.__game; if (d) g.run.dist += d; g.squad.setCount(0, 'horde'); }, extra);
const shown = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;
/** Plays until both pages show their result screen; returns the two views. */
async function toResults(duo, A, B, max = 30) {
  const done = await duo.play(max, async () => { const vs = [await A.view(), await B.view()]; return shown(vs[0]) && shown(vs[1]) ? vs : null; });
  if (!done) throw new Error(`no result screen on both pages: A ${JSON.stringify(await A.view())}\n B ${JSON.stringify(await B.view())}`);
  return done;
}
const save = (p) => p.ev(() => { const d = window.__game.save.data; return { coins: d.coins, level: d.unlockedLevel, best: d.endlessBest, hist: d.online.hist.map((h) => h.r + ':' + h.n).join(',') }; });

export const scenarios = [
  {
    name: 'same road on both pages; one squad falls: WIN on one screen, LOSE on the other',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B', { size: [360, 640], quality: 'high' });
      await duo.lobby(A, B, ['Ann', 'Ben']);
      const before = [await save(A), await save(B)];
      await bots(A, B);
      await duo.ready(B, A);
      const [a0, b0] = await duo.go(A, B);
      ok(a0.seed === b0.seed && a0.seed > 0, `the same seed: ${a0.seed} / ${b0.seed}`);
      // the VS card: both players and their picks, the run waiting at the start line
      await duo.play(1.5);
      const [ac, bc] = [await A.view(), await B.view()];
      ok(ac.card !== null && bc.card !== null, `VS card on both pages: ${ac.card} / ${bc.card}`);
      const names = await A.ev(() => [...document.querySelectorAll('.vs-card .vc-name')].map((n) => n.textContent));
      eq(names, ['ANN', 'BEN'], 'A\'s card shows both players');
      eq([ac.t, bc.t, ac.dist, bc.dist], [0, 0, 0, 0], 'nobody moves before GO');
      await A.shot('card'); await B.shot('card');
      const count = await duo.play(4, async () => { const v = await A.view(); return v.clock < 0 && /^[123]$/.test(v.card || '') ? v.card : null; }, 1);
      ok(count, 'the card counts 3-2-1');
      // GO, then 12 s of play
      await duo.play(16, async () => (await A.view()).t >= 12 && (await B.view()).t >= 12);
      await A.page.waitForTimeout(1000); // (the GO! flash is a real-time animation; the harness plays faster than that)
      await duo.step();
      const [a1, b1] = [await A.view(), await B.view()];
      ok(a1.card === null && b1.card === null, `the card is gone after GO: ${a1.card} / ${b1.card}`);
      ok(Math.abs(a1.t - a1.clock) < 0.35 && Math.abs(b1.t - b1.clock) < 0.35, `played clocks follow the match clock: A ${a1.t}/${a1.clock} B ${b1.t}/${b1.clock}`);
      // the rival on my bar is the other page, a moment ago
      eq([a1.peers[0].name, b1.peers[0].name], ['Ben', 'Ann'], 'rival names');
      ok(/BEN/.test(a1.bar) && /ANN/.test(b1.bar) && /^0:1\d$/.test(a1.barClock), `versus bars: "${a1.bar}" / "${b1.bar}" clock ${a1.barClock}`);
      ok(Math.abs(a1.peers[0].dist - b1.dist) < 25 && Math.abs(b1.peers[0].dist - a1.dist) < 25, `rival distance on the bar is the other page's: A sees ${a1.peers[0].dist} (B is at ${b1.dist}), B sees ${b1.peers[0].dist} (A is at ${a1.dist})`);
      ok(a1.peers[0].n > 0 && b1.peers[0].n > 0, 'rival squad sizes arrive');
      const ghost = await A.ev(() => { const p = window.__game.versus.ghost.peers[0]; return { shown: p.shown, drawn: p.drawn, mesh: window.__game.versus.ghost.mesh.visible }; });
      ok(ghost.shown > 0 && ghost.mesh, `A sees B's ghost: ${JSON.stringify(ghost)}`);
      // the same road: every event both pages have generated so far (gate rows, hordes, crates, coins, ...)
      const limit = Math.min((await A.ev(() => window.__duo.road(1e9))).far, (await B.ev(() => window.__duo.road(1e9))).far);
      const [ra, rb] = [await A.ev((l) => window.__duo.road(l), limit), await B.ev((l) => window.__duo.road(l), limit)];
      note(`road up to ${Math.round(limit)} u: ${ra.count} events, ${ra.gates} gate rows, hash ${ra.hash}`);
      ok(ra.count > 20 && ra.gates > 3, `enough road to compare (${ra.count} events, ${ra.gates} gate rows)`);
      eq([rb.hash, rb.count], [ra.hash, ra.count], 'both pages generated the same road');
      await A.shot('mid'); await B.shot('mid');
      // B's squad is wiped out
      await wipe(B);
      const [a2, b2] = await toResults(duo, A, B);
      eq([a2.result.result, a2.result.reason, a2.ribbon, a2.why], ['win', 'standing', 'YOU WIN!', 'LAST SQUAD STANDING'], 'the survivor\'s screen');
      eq([b2.result.result, b2.result.reason, b2.ribbon, b2.why], ['lose', 'fell', 'YOU LOSE', 'SQUAD DOWN'], 'the faller\'s screen');
      // both screens show the same numbers for the fall
      const rows = (p) => p.ev(() => [...document.querySelectorAll('.vsr-places li:not(.vsr-h)')].map((li) => [li.dataset.slot, li.querySelector('.vsr-tm') ? li.querySelector('.vsr-tm').textContent : 'standing', li.querySelector('.vsr-ds') ? li.querySelector('.vsr-ds').textContent : '']));
      const [ta, tb] = [await rows(A), await rows(B)];
      note(`result rows A ${JSON.stringify(ta)} B ${JSON.stringify(tb)}`);
      eq(ta.find((r) => r[0] === '1'), tb.find((r) => r[0] === '1'), 'the faller\'s time and distance read the same on both screens');
      eq(ta[0][0], '0', 'the winner is first on the winner\'s screen');
      eq(tb[0][0], '0', 'the winner is first on the loser\'s screen');
      await A.shot('result'); await B.shot('result');
      // a friend match pays only its friend coins (stage 4: 20 for the win, 10 for the loss), touches no single-player
      // progress, and leaves one row in the online history
      const after = [await save(A), await save(B)];
      eq([after[0].coins, after[0].level, after[0].best, after[1].coins, after[1].level, after[1].best], [before[0].coins + 20, before[0].level, before[0].best, before[1].coins + 10, before[1].level, before[1].best], 'saves');
      eq([after[0].hist, after[1].hist], ['w:Ben', 'l:Ann'], 'online history rows');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'both fall inside one second: the squad that got further wins on both screens',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(14, async () => (await A.view()).t >= 8);
      // A falls first but is a few metres further down the road; B falls 0.5 s later
      await wipe(A, 14);
      await duo.play(0.5);
      await wipe(B);
      const [a, b] = await toResults(duo, A, B);
      note(`A ${JSON.stringify(a.result)}  B ${JSON.stringify(b.result)}`);
      ok(Math.abs(a.result.t - b.result.t) <= 1 && a.result.t < b.result.t, `the falls are within a second (A ${a.result.t} s, B ${b.result.t} s)`);
      ok(a.result.d > b.result.d, `A got further (${a.result.d} m vs ${b.result.d} m)`);
      eq([a.result.result, a.result.reason, a.ribbon, a.why], ['win', 'distance', 'YOU WIN!', 'YOU WENT FURTHER'], 'A\'s screen');
      eq([b.result.result, b.result.reason, b.ribbon, b.why], ['lose', 'distance', 'YOU LOSE', 'RIVAL WENT FURTHER'], 'B\'s screen');
      await A.shot('tie-win'); await B.shot('tie-lose');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'rematch: a new road and a second full match, then LEAVE',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      const code = await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      const [s1] = await duo.go(A, B);
      await duo.play(10, async () => (await A.view()).t >= 5);
      await wipe(B);
      let [a, b] = await toResults(duo, A, B);
      eq([a.result.result, b.result.result], ['win', 'lose'], 'match 1');
      // A asks first: B is told, A waits
      await A.click('.vsr-rematch');
      await duo.until(async () => /ANN WANTS A REMATCH/.test((await B.view()).rematchNote || ''), 'B: ANN WANTS A REMATCH');
      eq((await A.view()).rematchNote, 'WAITING FOR BEN', 'A waits for Ben');
      await B.shot('rematch-asked');
      await B.click('.vsr-rematch');
      const [a0, b0] = await duo.go(A, B);
      ok(a0.seed === b0.seed && a0.seed !== s1.seed, `a new road for both: ${s1.seed} -> ${a0.seed} / ${b0.seed}`);
      note(`seeds ${s1.seed} -> ${a0.seed}`);
      eq([a0.t, b0.t, a0.result, b0.result], [0, 0, null, null], 'the second match starts clean');
      await duo.play(1.5);
      ok((await A.view()).card !== null && (await B.view()).card !== null, 'the VS card shows again');
      await duo.play(14, async () => (await B.view()).t >= 6);
      const mid = await B.view();
      ok(mid.peers[0].alive && mid.peers[0].n > 0 && /ANN/.test(mid.bar), `B's bar in match 2: ${mid.bar}`);
      // this time A falls
      await wipe(A);
      [a, b] = await toResults(duo, A, B);
      eq([a.result.result, a.ribbon, b.result.result, b.ribbon], ['lose', 'YOU LOSE', 'win', 'YOU WIN!'], 'match 2');
      eq((await A.ev(() => window.__game.save.data.online.hist.map((h) => h.r).join(''))).split('').sort().join(''), 'lw', 'A\'s history has both matches');
      // B leaves: back on the hub, and A's REMATCH goes grey
      await B.click('.screen-vsresult [data-act="leave"], [data-screen="vsresult"] [data-act="leave"]');
      await duo.until(async () => { const v = await B.view(); return v.state === 'online' && v.view === 'hub' && !v.room; }, 'B on the hub after LEAVE');
      await duo.until(async () => (await A.view()).rematchNote === 'RIVAL LEFT', 'A: RIVAL LEFT');
      ok(await A.ev(() => document.querySelector('.vsr-rematch').classList.contains('is-disabled')), 'A cannot ask for a rematch any more');
      await A.shot('rival-left');
      await A.click('.screen-vsresult [data-act="leave"], [data-screen="vsresult"] [data-act="leave"]');
      await duo.until(async () => { const v = await A.view(); return v.state === 'online' && v.view === 'hub' && !v.room; }, 'A on the hub after LEAVE');
      await duo.until(() => duo.hub.admin.get(`rooms/${code}/sl`) === null, 'both seats to be free on the hub');
      // the same two pages meet again in a NEW room: a third match starts clean
      const code2 = await duo.create(B);
      await duo.join(A, code2);
      await duo.ready(A, B);
      const [a3, b3] = await duo.go(A, B);
      ok(code2 !== code && a3.seed === b3.seed && a3.seed !== a0.seed, `a new room and a new road: ${code} -> ${code2}, seed ${a3.seed}`);
      eq([a3.t, a3.result, a3.peers.length, a3.peers[0].name], [0, null, 1, 'Ben'], 'match 3 on A starts clean');
      await duo.play(8, async () => (await A.view()).t >= 3);
      // ... and A walks out to the title and plays a normal level: the single-player HUD is back as it was
      await A.click('.hud-pause');
      await duo.until(async () => (await A.view()).top === 'confirm', 'A: LEAVE MATCH?');
      await A.click('[data-screen="confirm"] [data-act="yes"]');
      await duo.until(async () => (await A.view()).view === 'hub', 'A on the hub');
      await A.click('.screen-online [data-act="back"], [data-screen="online"] [data-act="back"]');
      await duo.until(async () => (await A.view()).state === 'title', 'A on the title');
      const solo = await A.ev(() => {
        const g = window.__game, hud = g.ui.hud.el;
        g.debug.startLevel(1);
        g.debug.simulate(2);
        g.ui.update(0.1);
        const seen = (sel) => { const n = document.querySelector(sel); return !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; };
        const out = { mode: g.run.mode, vs: hud.classList.contains('vs'), rivals: seen('.vs-rivals'), level: g.ui.hud.levelEl.textContent.trim(), live: g.versus.live };
        g.pause();
        out.paused = g.state === 'paused';
        g.resume();
        g.debug.toTitle();
        return out;
      });
      eq([solo.mode, solo.vs, solo.rivals, solo.live, solo.paused], ['level', false, false, false, true], `single-player after online (HUD label "${solo.level}")`);
      ok(/^LV\s*1|1/.test(solo.level) && !/ONLINE|:/.test(solo.level), `the HUD shows the level again: "${solo.level}"`);
      const b4 = await duo.play(20, async () => { const v = await B.view(); return shown(v) ? v : null; });
      eq([b4 && b4.result.result, b4 && b4.result.reason], ['win', 'quit'], 'B wins match 3 when A walks out');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'I asked for a rematch and my rival left: a newcomer with the code cannot start a match on my result screen',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A'), B = await duo.page('B');
      const code = await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(8, async () => (await A.view()).t >= 4);
      await wipe(B);
      await toResults(duo, A, B);
      await A.click('.vsr-rematch');
      await duo.tick(300);
      await B.click('[data-screen="vsresult"] [data-act="leave"], .screen-vsresult [data-act="leave"]');
      await duo.until(async () => (await B.view()).view === 'hub', 'B on the hub');
      await duo.until(async () => (await A.view()).rematchNote === 'RIVAL LEFT', 'A: RIVAL LEFT');
      await duo.tick(1500);
      ok(!(await A.view()).room.seats[0].rdy, 'A is still READY alone in the reopened room');
      const C = await duo.page('C');
      await duo.signIn(C, 'Cyd');
      await C.type('.on-code', code);
      await C.key('Enter');
      await duo.until(async () => (await C.view()).view === 'lobby', 'C in the lobby');
      // A is shown the newcomer in the lobby (not READY); C's READY alone starts nothing
      await duo.until(async () => (await A.view()).view === 'lobby', 'A taken to the lobby');
      await C.click('.on-ready');
      await duo.tick(3000);
      const [a, c] = [await A.view(), await C.view()];
      eq([a.live, c.live, a.view, a.room.seats.map((s) => s && s.n)], [false, false, 'lobby', ['Ann', 'Cyd']], 'no match started on A');
      // when A taps READY too, the two of them play
      await duo.ready(A);
      const [a2, c2] = await duo.go(A, C);
      ok(a2.seed === c2.seed && a2.peers[0].name === 'Cyd', `A and Cyd play: ${a2.peers.map((p) => p.name)}`);
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'leaving in the middle of a match: the rival wins',
    async run(duo, { ok, eq }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(12, async () => (await A.view()).t >= 6);
      // the pause button asks first; STAY keeps playing
      await A.click('.hud-pause');
      await duo.until(async () => (await A.view()).top === 'confirm', 'A: LEAVE MATCH?');
      ok(/LEAVE MATCH\?/.test(await A.text('.screen-confirm, [data-screen="confirm"]')), 'the question reads LEAVE MATCH?');
      await A.shot('leave-ask');
      await A.click('[data-screen="confirm"] [data-act="no"]');
      await duo.play(1);
      const still = await A.view();
      ok(still.live && still.state === 'playing' && still.top !== 'confirm', 'STAY keeps the match going');
      await A.click('.hud-pause');
      await duo.until(async () => (await A.view()).top === 'confirm', 'A: LEAVE MATCH? again');
      await A.click('[data-screen="confirm"] [data-act="yes"]');
      await duo.until(async () => { const v = await A.view(); return v.state === 'online' && v.view === 'hub' && !v.room && !v.live; }, 'A on the hub after leaving');
      const done = await duo.play(20, async () => { const v = await B.view(); return shown(v) ? v : null; });
      ok(done, `B gets a result: ${JSON.stringify(await B.view())}`);
      eq([done.result.result, done.result.reason, done.ribbon, done.why], ['win', 'quit', 'YOU WIN!', 'RIVAL LEFT'], 'B\'s screen');
      await duo.until(async () => (await B.view()).rematchNote === 'RIVAL LEFT', 'B: no rematch, RIVAL LEFT');
      await B.shot('rival-quit');
      eq(await A.ev(() => window.__game.save.data.online.hist.length), 0, 'the leaver has no history row yet (nothing was decided on its page)');
    },
  },
];
