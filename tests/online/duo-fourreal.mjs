// Three players and a watcher in REAL TIME (STAGE5 "INTEGRATOR" point 3): four tabs of one browser on `?net=local`
// (the first tab holds the hub), real frames, real clicks. A makes a room, B and C type the code, S opens the WATCH
// LINK; all three READY -> the VS card, the bar with 2 rivals and their ghosts; C is wiped: YOU CAME 3RD and C watches
// the other two; B is wiped: A wins, C's watch turns into the table, S shows ANN WINS!, the same places on all four.
// C is 360x640, the others 390x844. Screenshots go to `--shots <dir>`: look at them.
// Run with `node scripts/duo.mjs fourreal`.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function opener(T, ctx) {
  const errors = (T.errors = T.errors || []);
  return async (pid, query, size = null) => {
    const page = await ctx.newPage();
    if (size) await page.setViewportSize({ width: size[0], height: size[1] });
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`${pid}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${pid}: [pageerror] ${e.stack || e.message}`));
    await page.goto(`${T.base}/?${query}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout: 120000 });
    return page;
  };
}
async function signIn(page, text) {
  await page.click('.btn-online', { force: true });
  await page.waitForSelector('.on-nameinput', { timeout: 20000 });
  await page.click('.on-nameinput', { force: true });
  await page.fill('.on-nameinput', '');
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.on-create', { timeout: 20000 });
  await sleep(700);
}
async function join(page, code) {
  await page.click('.on-code', { force: true });
  await page.fill('.on-code', '');
  await page.keyboard.type(code, { delay: 20 });
  await page.click('[data-act="join"]', { force: true });
  await page.waitForSelector('.on-ready', { timeout: 15000 });
}
/** Autopilot and a squad floor the scenario lifts with wipe(). */
const arm = (page) => page.evaluate(() => {
  const g = window.__game;
  window.__keep = 150;
  g.debug.setAutopilot('pro', 1);
  g.runMods.ext.push(() => { if (window.__keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < window.__keep) g.squad.setCount(window.__keep, 'test'); } });
});
const wipe = (page) => page.evaluate(() => { window.__keep = 0; window.__game.squad.setCount(0, 'horde'); });
const txt = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.screen-vsresult .vsr-places li:not(.vsr-h)')].map((li) => `${li.querySelector('.vsr-pl').textContent}:${li.dataset.slot}`).join(' '));
const isTable = (page) => page.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult' && document.querySelector('.screen-vsresult .vsr-places') && !document.querySelector('.vsr[data-watching="1"]'), null, { timeout: 60000 });

export const scenarios = [
  {
    name: 'real time, three tabs and a watcher: lobby with 3 + WATCHING, a fall, the fallen tab watches, one table on all four',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, shots, label } = T;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const open = opener(T, ctx);
      const shot = async (page, pid, name) => { await page.bringToFront(); await page.screenshot({ path: `${shots}/${label}-${pid}-${name}.png` }); };
      try {
        const A = await open('A', 'test=1&net=local&pid=A&quality=low');
        await sleep(500);
        await signIn(A, 'Ann');
        await A.click('.on-create', { force: true });
        await A.waitForSelector('.on-ready', { timeout: 15000 });
        const code = (await txt(A, '.on-tiles')).replace(/\s+/g, '');
        ok(/^[A-HJ-NP-Z]{4}$/.test(code), `room ${code}`);
        const B = await open('B', 'test=1&net=local&pid=B&quality=low');
        await signIn(B, 'Ben');
        await join(B, code);
        const C = await open('C', 'test=1&net=local&pid=C&quality=low', [360, 640]);
        await signIn(C, 'Cyd');
        await join(C, code);
        const S = await open('S', `test=1&net=local&pid=S&quality=low&room=${code}&watch=1`);
        await S.waitForFunction(() => { const w = window.__game.online && window.__game.online.flow.watch; return w && w.state && w.state.phase === 'lobby'; }, null, { timeout: 20000 });
        await A.waitForFunction(() => /1 WATCHING/.test(document.body.innerText), null, { timeout: 10000 });
        await sleep(600);
        await shot(A, 'A', '1-lobby'); await shot(C, 'C', '1-lobby'); await shot(S, 'S', '1-lobby');
        const seats = await A.evaluate(() => window.__game.online.flow.room.state.seats.map((s) => s && s.n));
        eq(seats, ['Ann', 'Ben', 'Cyd', null], 'three seats of four');
        for (const p of [A, B, C]) await arm(p);
        for (const p of [A, B, C]) { await p.bringToFront(); await p.click('.on-ready', { force: true }); await sleep(300); }
        for (const p of [A, B, C]) await p.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 15000 });
        await sleep(700);
        await shot(A, 'A', '2-vscard'); await shot(C, 'C', '2-vscard');
        await S.waitForFunction(() => document.querySelectorAll('.wv-page .wv-card').length === 3, null, { timeout: 10000 });
        // every 3 s: each tab's played clock against the match clock, its frame rate and whether it is visible
        let probing = true;
        const probe = (async () => {
          while (probing) {
            const row = await Promise.all([A, B, C, S].map((p) => p.evaluate(() => { const g = window.__game, v = g.versus, l = v && v.link; return `${document.visibilityState[0]} fps ${Math.round(g.loop.fps || 0)} t ${v && v.live ? v.t.toFixed(1) : '-'}/${l ? l.clock().toFixed(1) : '-'}`; }).catch(() => 'gone')));
            note(`tabs A B C S: ${row.join(' | ')}`);
            await sleep(3000);
          }
        })();
        for (const p of [A, B, C]) await p.waitForFunction(() => window.__game.versus.t >= 6, null, { timeout: 90000 });
        await shot(A, 'A', '3-bar-ghosts'); await shot(C, 'C', '3-bar-ghosts'); await shot(S, 'S', '3-live');
        const ghosts = await A.evaluate(() => window.__game.versus.ghost.peers.filter((p) => p.shown > 0).length);
        eq(ghosts, 2, 'A draws 2 ghosts');
        const bar = await txt(A, '.vs-rivals');
        ok(/BEN/.test(bar) && /CYD/.test(bar), `A's bar: ${bar}`);
        // the spectator's numbers follow the players (a moment behind)
        const [sa, aDist] = [await S.evaluate(() => window.__game.online.flow.watch.state.watch.players[0].dist), await A.evaluate(() => window.__game.run.dist)];
        note(`S sees A at ${Math.round(sa)} m, A is at ${Math.round(aDist)} m`);
        ok(Math.abs(sa - aDist) < 40, `S's card of A: ${sa} vs ${aDist}`);
        // C falls: 3rd, C watches A and B
        await wipe(C);
        await C.waitForFunction(() => document.querySelector('.vsr[data-watching="1"]'), null, { timeout: 60000 }).catch(async (e) => {
          const st = await C.evaluate(() => { const g = window.__game, v = g.versus; return { state: g.state, cur: g.ui.current, t: v && v.t, live: v && v.live, res: v && v.result, fin: v && v.final, n: g.squad.count, ribbon: (document.querySelector('.vsr .ribbon') || {}).textContent, fps: g.loop && g.loop.fps }; });
          probing = false; await probe;
          throw new Error(`C: no watching mode: ${JSON.stringify(st)} (${e.message})`);
        });
        await sleep(1500);
        await shot(C, 'C', '4-watching'); await shot(S, 'S', '4-one-out');
        eq(await txt(C, '.vsr .ribbon'), 'YOU CAME 3RD', 'C\'s ribbon');
        const cw = await C.evaluate(() => [...document.querySelectorAll('.vsr-watch .wv-card')].map((c) => [c.dataset.slot, c.classList.contains('down'), c.querySelector('.wv-ds').textContent]));
        const outs = await A.evaluate(() => { const v = window.__game.versus; return { outs: v.link.snapshot().outs, a: v.result, b: v.v.peers.map((p) => [p.alive, p.by]) }; });
        ok(cw.length === 3 && cw.filter((c) => c[1]).length === 1 && !cw[0][1] && !cw[1][1], `C's cards: ${JSON.stringify(cw)}; out records ${JSON.stringify(outs)}`);
        // B falls: A wins
        await wipe(B);
        for (const p of [A, B, C]) await isTable(p);
        probing = false; await probe;
        await S.waitForFunction(() => document.querySelector('.wv-page .wv-table:not(.hidden) .wv-rows li'), null, { timeout: 30000 });
        await sleep(900);
        for (const [p, pid] of [[A, 'A'], [B, 'B'], [C, 'C'], [S, 'S']]) await shot(p, pid, '5-table');
        const [ra, rb, rc] = [await rows(A), await rows(B), await rows(C)];
        note(`tables: A ${ra} | B ${rb} | C ${rc}`);
        eq([rb, rc], [ra, ra], 'the same places on the three result screens');
        eq(ra, '1:0 2:1 3:2', 'Ann, Ben, Cyd');
        eq(await txt(S, '.wv-page .wv-win'), 'ANN WINS!', 'the watcher\'s head');
        const sr = await S.evaluate(() => [...document.querySelectorAll('.wv-page .wv-rows li')].map((li) => li.dataset.slot).join(' '));
        eq(sr, '0 1 2', 'the watcher\'s table');
        eq([await txt(A, '.vsr .ribbon'), await txt(B, '.vsr .ribbon'), await txt(C, '.vsr .ribbon')], ['YOU WIN!', 'YOU LOSE', 'YOU LOSE'], 'ribbons');
      } finally { await ctx.close(); }
    },
  },
];
