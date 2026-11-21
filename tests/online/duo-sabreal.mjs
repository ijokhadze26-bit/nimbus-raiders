// Sabotage in REAL TIME (STAGE2 "INTEGRATOR" point 3): two tabs of one browser on `?net=local`, real frames, real
// clicks on the SABOTAGE button. A freezes B, B fogs A, then B's squad is wiped: SQUAD DOWN! on B, RIVAL DOWN! on A,
// both result screens. Screenshots of BOTH pages at: button ready, an incoming warning, frozen, the big moment, the
// results (`--shots <dir>`): look at them.
// Run with `node scripts/duo.mjs sabreal`.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = ['sab:charge', 'sab:sent', 'sab:warn', 'sab:wait', 'sab:land', 'sab:end', 'sab:drop'];

export const scenarios = [
  {
    name: 'real time, two tabs: a freeze A -> B, fog B -> A, a wipe, SQUAD DOWN! / RIVAL DOWN!, both results',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, base, shots, label } = T;
      const errors = (T.errors = []);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const open = async (pid, query) => {
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`${pid}: ${m.text()}`); });
        page.on('pageerror', (e) => errors.push(`${pid}: [pageerror] ${e.stack || e.message}`));
        await page.goto(`${base}/?${query}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout: 120000 });
        return page;
      };
      const shot = async (page, pid, name) => { await page.bringToFront(); await page.screenshot({ path: `${shots}/${label}-${pid}-${name}.png` }); };
      const both = async (name) => { await shot(A, 'A', name); await shot(B, 'B', name); };
      const name = async (page, text) => {
        await page.waitForSelector('.on-nameinput', { timeout: 20000 });
        await page.click('.on-nameinput', { force: true });
        await page.fill('.on-nameinput', '');
        await page.keyboard.type(text, { delay: 20 });
        await page.keyboard.press('Enter');
      };
      const arm = (page) => page.evaluate((TY) => {
        const g = window.__game, L = (window.__sab = { log: [], keep: 100 });
        for (const type of TY) g.events.on(type, (e) => L.log.push({ ...e, type, t: g.versus ? g.versus.t : 0 }));
        g.runMods.ext.push(() => { if (L.keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < L.keep) g.squad.setCount(L.keep, 'test'); } });
      }, TYPES);
      const find = (page, type, code) => page.evaluate(([ty, c]) => window.__sab.log.find((e) => e.type === ty && (c == null || e.code === c)) || null, [type, code]);
      const waitLog = (page, type, code, timeout = 15000) => page.waitForFunction(([ty, c]) => window.__sab.log.some((e) => e.type === ty && e.code === c), [type, code], { timeout });
      const load = (page, code) => page.evaluate((c) => { const s = window.__game.versus.sab; s.test.clear(); s.test.give(c); }, code);
      const fps = (page) => page.evaluate(() => Math.round(window.__game.loopFps || 0));
      let A = null, B = null;

      try {
        A = await open('A', 'test=1&net=local&pid=A&quality=low');
        await sleep(500);
        await A.click('.btn-online', { force: true });
        await name(A, 'Ann');
        await A.waitForSelector('.on-create', { timeout: 15000 });
        await A.click('.on-create', { force: true });
        await A.waitForSelector('.on-tile', { timeout: 15000 });
        const link = await A.evaluate(() => window.__game.online.flow.shareLink());
        B = await open('B', `${link.split('?')[1]}&pid=B&test=1`);
        await name(B, 'Ben');
        await B.waitForSelector('.on-tile', { timeout: 15000 });
        await A.waitForFunction(() => /Ben/.test((document.querySelector('.on-seats') || {}).textContent || ''), null, { timeout: 15000 });
        for (const p of [A, B]) { await p.evaluate(() => window.__game.debug.setAutopilot('pro', 1)); await arm(p); }
        await B.click('.on-ready', { force: true });
        await A.waitForFunction(() => /BEN IS READY/.test((document.querySelector('.on-status') || {}).textContent || ''), null, { timeout: 10000 });
        await A.click('.on-ready', { force: true });
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 20000 });
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus.t >= 6, null, { timeout: 90000 });

        // ---- both buttons ready ----
        await load(A, 5); await load(B, 2);
        await sleep(400);
        ok(await A.evaluate(() => document.querySelector('.sab-btn').classList.contains('can')) && await B.evaluate(() => document.querySelector('.sab-btn').classList.contains('can')), 'the buttons are not ready');
        await both('1-ready');
        // ---- A taps: FREEZE on B ----
        await A.bringToFront();
        await A.click('.sab-btn', { force: true });
        await waitLog(B, 'sab:warn', 5);
        await both('2-warn');
        const warnB = await B.evaluate(() => [...document.querySelectorAll('.sab-warns .sab-warn')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
        ok(warnB.some((t) => /FREEZE!.*FROM ANN/.test(t)), `B's warning: ${JSON.stringify(warnB)}`);
        const feedA = await A.evaluate(() => [...document.querySelectorAll('.sab-feed .sf-line')].map((e) => e.textContent));
        ok(feedA.includes('FREEZE SENT TO BEN'), `A's feed: ${JSON.stringify(feedA)}`);
        await waitLog(B, 'sab:land', 5);
        const fr = await B.evaluate(() => ({ frozen: window.__game.versus.sab.view().frozen, hold: !!window.__game.runMods.holdFn, ice: !document.querySelector('.sab-ice').classList.contains('hidden') }));
        await shot(B, 'B', '3-frozen'); await shot(A, 'A', '3-frozen'); // (2 s of freeze: B first)
        const [w1, l1] = [await find(B, 'sab:warn', 5), await find(B, 'sab:land', 5)];
        note(`freeze on B: received t ${w1.t.toFixed(3)}, landed ${l1.t.toFixed(3)} (+${(l1.t - w1.t).toFixed(3)} s), ${JSON.stringify(fr)}; fps A ${await fps(A)} B ${await fps(B)}`);
        ok(l1.t - w1.t >= 1 - 1e-6 && l1.t - w1.t <= 1.1, `the freeze landed ${(l1.t - w1.t).toFixed(3)} s after receipt`);
        ok(fr.hold && fr.ice, `B is not frozen: ${JSON.stringify(fr)}`);
        await B.waitForFunction(() => !window.__game.runMods.holdFn && window.__game.versus.sab.view().frozen === 0, null, { timeout: 15000 });
        // ---- B taps: FOG on A (5 s after the last one from... A's side gets one per 5 s per sender: this is B's first) ----
        await B.bringToFront();
        await B.click('.sab-btn', { force: true });
        await waitLog(A, 'sab:land', 2);
        const [w2, l2] = [await find(A, 'sab:warn', 2), await find(A, 'sab:land', 2)];
        note(`fog on A: +${(l2.t - w2.t).toFixed(3)} s`);
        ok(l2.t - w2.t >= 1 - 1e-6 && l2.t - w2.t <= 1.1, `the fog landed ${(l2.t - w2.t).toFixed(3)} s after receipt`);
        await sleep(1200);
        await shot(A, 'A', '4-fog');
        // ---- B is wiped: the big moment on both ----
        await B.evaluate(() => { window.__sab.keep = 0; window.__game.squad.setCount(0, 'horde'); });
        await B.waitForFunction(() => /SQUAD DOWN!/.test((document.querySelector('.vs-down') || {}).textContent || ''), null, { timeout: 10000 });
        await shot(B, 'B', '5-down');
        await A.waitForFunction(() => /RIVAL DOWN!/.test((document.querySelector('.vs-down') || {}).textContent || ''), null, { timeout: 10000 });
        await shot(A, 'A', '5-down');
        await A.waitForFunction(() => /YOU WIN!/.test((document.querySelector('.vs-moment') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
        await shot(A, 'A', '6-verdict');
        await B.waitForFunction(() => /YOU LOSE/.test((document.querySelector('.vs-moment') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
        await shot(B, 'B', '6-verdict');
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 30000 });
        await sleep(900);
        await both('7-result');
        const res = async (p) => p.evaluate(() => { const v = window.__game.versus, t = (s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }; return [v.result.result, t('.vsr .ribbon'), !!document.querySelector('.vs-down:not(.hidden)'), window.__game.runMods.holdFn === null]; });
        eq(await res(A), ['win', 'YOU WIN!', false, true], 'A\'s result');
        eq(await res(B), ['lose', 'YOU LOSE', false, true], 'B\'s result');
      } finally { await ctx.close(); }
    },
  },
];
