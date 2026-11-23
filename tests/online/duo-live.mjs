// The REAL SERVICE run: the same real-time match as duo-real.mjs, but on the owner's Firebase project (src/online/config.js)
// instead of the local hub. Two separate browser profiles, so two separate anonymous players. It writes real records
// (two profiles, a room, two matches), so it runs ONLY when asked:
//   DUO_LIVE=1 node scripts/duo.mjs live

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NETTEST = /^[a-z0-9,]+$/.test(process.env.DUO_NETTEST || '') ? `&nettest=${process.env.DUO_NETTEST}` : '';

export const scenarios = !process.env.DUO_LIVE ? [] : [
  {
    name: 'LIVE Firebase, two players: lobby, VS card, match with ghost and bar, results, rematch, leave',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, base, shots, label } = T;
      const errors = (T.errors = []);
      const ctxs = [];
      const open = async (pid, query) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        ctxs.push(ctx);
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`${pid}: ${m.text()}`); });
        page.on('pageerror', (e) => errors.push(`${pid}: [pageerror] ${e.stack || e.message}`));
        await page.goto(`${base}/?${query}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout: 120000 });
        return page;
      };
      const shot = async (page, pid, name) => { await page.bringToFront(); await page.screenshot({ path: `${shots}/${label}-${pid}-${name}.png` }); };
      const view = (page) => page.evaluate(() => {
        const g = window.__game, v = g.versus, txt = (s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
        const p = v && v.ghost.peers[0];
        return { state: g.state, screen: g.ui.current, live: !!(v && v.live), seed: v ? v.seed : 0, t: v ? Math.round(v.t * 10) / 10 : 0, clock: v && v.link ? Math.round(v.link.clock() * 10) / 10 : null,
          fps: Math.round(g.loopFps || 0), n: g.squad.count, dist: g.run ? Math.round(g.run.dist) : 0, stall: v ? Math.round((v.stall || 0) * 10) / 10 : 0,
          bar: txt('.vs-rivals'), barClock: txt('.vs-clock'), card: txt('.vs-card .vc-num'), ribbon: txt('.vsr .ribbon'), why: txt('.vsr .vsr-why b'), note: txt('.vsr .vsr-rm'),
          result: v && v.result ? `${v.result.result}/${v.result.reason}` : null, ghost: p ? { shown: Math.round(p.shown * 100) / 100, rel: Math.round((p.rel || 0) * 10) / 10 } : null, vis: document.visibilityState };
      });
      const name = async (page, text) => {
        await page.waitForSelector('.on-nameinput', { timeout: 20000 });
        await page.click('.on-nameinput', { force: true });
        await page.fill('.on-nameinput', '');
        await page.keyboard.type(text, { delay: 20 });
        await page.keyboard.press('Enter');
      };
      // every rendered frame: how fast the rival's ghost moved against my squad and across the road (a jump would show here)
      const watch = (page) => page.evaluate(() => {
        const w = (window.__watch = { rel: 0, x: 0, frames: 0, shown: 0, slow: 0, last: null, at: 0 });
        const tick = (now) => {
          requestAnimationFrame(tick);
          const dt = Math.max(1, now - w.at) / 1000;
          w.at = now;
          const v = window.__game.versus, p = v && v.live && v.go && v.ghost.peers[0];
          if (!p || !p.alive || !(v.t > 3)) { w.last = null; return; }
          w.frames++;
          if (dt > 0.2) w.slow++;
          if (!(p.shown > 0)) { w.last = null; return; }
          const cur = { rel: p.rel, x: p.track.out.x };
          // (a frame longer than 0.1 s moves the ghost no further than a 0.1 s one: measured against that)
          if (w.last) { const d = Math.max(dt, 0.1); w.rel = Math.max(w.rel, Math.abs(cur.rel - w.last.rel) / d); w.x = Math.max(w.x, Math.abs(cur.x - w.last.x) / Math.min(dt, 0.25)); }
          w.shown++; w.last = cur;
        };
        requestAnimationFrame(tick);
      });

      try {
        // ---- lobby through the real screens ----
        const A = await open('A', `test=1&quality=low${NETTEST}`);
        await sleep(500);
        await A.click('.btn-online', { force: true });
        await name(A, 'Ann');
        await A.waitForSelector('.on-create', { timeout: 30000 });
        await A.click('.on-create', { force: true });
        await A.waitForSelector('.on-tile', { timeout: 15000 });
        const code = (await A.$eval('.on-tiles', (n) => n.textContent)).replace(/\s+/g, '');
        const link = await A.evaluate(() => window.__game.online.flow.shareLink());
        ok(/^[A-HJ-NP-Z]{4}$/.test(code) && link.includes(`room=${code}`) && !link.includes('net='), `room ${code}, link ${link}`);
        // B opens the link (its own tab gets its own player id)
        const B = await open('B', `${link.split('?')[1]}&test=1&quality=low${NETTEST}`);
        await name(B, 'Ben');
        await B.waitForSelector('.on-tile', { timeout: 15000 });
        await A.waitForFunction(() => /Ben/.test((document.querySelector('.on-seats') || {}).textContent || ''), null, { timeout: 15000 });
        await sleep(700);
        await shot(A, 'A', '1-lobby'); await shot(B, 'B', '1-lobby');
        for (const p of [A, B]) await p.evaluate(() => window.__game.debug.setAutopilot('pro', 1));
        await watch(A); await watch(B);
        await B.click('.on-ready', { force: true });
        await A.waitForFunction(() => /BEN IS READY/.test((document.querySelector('.on-status') || {}).textContent || ''), null, { timeout: 10000 });
        await A.click('.on-ready', { force: true });
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 15000 });
        // ---- VS card (it is up for about 4 s; a slow start on this machine eats into that) ----
        await shot(A, 'A', '2-card'); await shot(B, 'B', '2-card');
        const [ca, cb] = [await view(A), await view(B)];
        note(`countdown: A clock ${ca.clock} card "${ca.card}" ${ca.fps} fps (${ca.vis}); B clock ${cb.clock} card "${cb.card}" ${cb.fps} fps (${cb.vis})`);
        ok(ca.seed === cb.seed && ca.seed > 0, `one road: ${ca.seed} / ${cb.seed}`);
        // ---- mid-match ----
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus.t >= 12, null, { timeout: 60000 });
        await shot(A, 'A', '3-mid'); await shot(B, 'B', '3-mid');
        const [ma, mb] = [await view(A), await view(B)];
        note(`mid: A t ${ma.t} clock ${ma.clock} ${ma.fps} fps stall ${ma.stall} bar "${ma.bar}" ghost ${JSON.stringify(ma.ghost)}; B t ${mb.t} clock ${mb.clock} ${mb.fps} fps stall ${mb.stall} bar "${mb.bar}" ghost ${JSON.stringify(mb.ghost)}`);
        ok(/BEN/.test(ma.bar || '') && /ANN/.test(mb.bar || ''), `versus bars: "${ma.bar}" / "${mb.bar}"`);
        ok(ma.live && mb.live && ma.card === null && mb.card === null, 'both are playing, the card is gone');
        await A.waitForFunction(() => window.__game.versus.t >= 22, null, { timeout: 60000 });
        const [ga, gb] = [await A.evaluate(() => window.__watch), await B.evaluate(() => window.__watch)];
        note(`ghost, fastest move in one frame: A ${ga.rel.toFixed(1)} u/s along the road, ${ga.x.toFixed(1)} u/s sideways (on screen ${ga.shown} of ${ga.frames} frames, ${ga.slow} frames over 0.2 s); B ${gb.rel.toFixed(1)} / ${gb.x.toFixed(1)} (${gb.shown} of ${gb.frames}, ${gb.slow} slow)`);
        // (a rival more than 5 m behind me is not drawn: the bar shows it. Whoever is in front sees the other's ghost.)
        // The game allows 24 u/s along the road and 16 u/s sideways, timed on the match clock; a frame's own time differs a little.
        ok(Math.max(ga.shown / Math.max(1, ga.frames), gb.shown / Math.max(1, gb.frames)) > 0.5, `nobody saw a ghost: A ${ga.shown}/${ga.frames}, B ${gb.shown}/${gb.frames}`);
        for (const [pid, g] of [['A', ga], ['B', gb]]) ok(g.rel <= 26 && g.x <= 21, `${pid}: the ghost jumped (${g.rel.toFixed(1)} u/s along, ${g.x.toFixed(1)} u/s sideways in one frame)`);
        // ---- B's squad is wiped: both result screens ----
        await B.evaluate(() => window.__game.squad.setCount(0, 'horde'));
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 30000 });
        await sleep(900);
        await shot(A, 'A', '4-result'); await shot(B, 'B', '4-result');
        const [ra, rb] = [await view(A), await view(B)];
        eq([ra.result, ra.ribbon, ra.why], ['win/standing', 'YOU WIN!', 'LAST SQUAD STANDING'], 'A\'s result');
        eq([rb.result, rb.ribbon, rb.why], ['lose/fell', 'YOU LOSE', 'SQUAD DOWN'], 'B\'s result');
        // ---- rematch on both, then B leaves in the middle ----
        await B.click('.vsr-rematch', { force: true });
        await A.waitForFunction(() => /BEN WANTS A REMATCH/.test((document.querySelector('.vsr-rm') || {}).textContent || ''), null, { timeout: 10000 });
        await shot(A, 'A', '5-rematch-asked');
        await A.click('.vsr-rematch', { force: true });
        for (const p of [A, B]) await p.waitForFunction((old) => window.__game.versus.live && window.__game.state === 'playing' && window.__game.versus.seed !== old, ra.seed, { timeout: 20000 });
        const [sa, sb] = [await view(A), await view(B)];
        ok(sa.seed === sb.seed && sa.seed !== ra.seed, `a new road for the rematch: ${ra.seed} -> ${sa.seed} / ${sb.seed}`);
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus.t >= 4, null, { timeout: 40000 });
        await B.bringToFront();
        await B.click('.hud-pause', { force: true });
        await B.waitForFunction(() => window.__game.ui.top() === 'confirm', null, { timeout: 5000 });
        await sleep(500);
        await shot(B, 'B', '6-leave-ask');
        await B.click('[data-screen="confirm"] [data-act="yes"]', { force: true });
        await B.waitForFunction(() => window.__game.state === 'online' && !window.__game.online.flow.room, null, { timeout: 10000 });
        await A.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 30000 });
        await sleep(900);
        await shot(A, 'A', '7-rival-left'); await shot(B, 'B', '7-hub');
        const la = await view(A);
        eq([la.result, la.why, la.note], ['win/quit', 'RIVAL LEFT', 'RIVAL LEFT'], 'A after B left');
      } finally { for (const c of ctxs) await c.close(); }
    },
  },
];
