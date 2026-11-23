// QUICK MATCH on the REAL SERVICE: the same two real-time runs as duo-quickreal.mjs, but on the owner's Firebase project
// (src/online/config.js) instead of ?net=local. Every page gets its own browser profile, so its own anonymous player.
// It writes real records (profiles, tickets, a room, a match, a day-meter count), so it runs ONLY when asked:
//   DUO_LIVE=1 node scripts/duo.mjs livequick [--base https://ijokhadze26-bit.github.io/nimbus-raiders]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = ['sab:warn', 'sab:land', 'sab:sent'];

/** Each page in its own browser profile: its own anonymous player on the real service. */
function opener(T, ctxs) {
  const errors = (T.errors = T.errors || []);
  return async (pid, query) => {
    const ctx = await T.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    ctxs.push(ctx);
    const page = await ctx.newPage();
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
  await page.waitForSelector('.on-quick', { timeout: 30000 });
  await sleep(700); // (the hub's pop-in animation)
}
/** A log of sabotage events, and a squad that never drops under `keep` while the log says so (the scenario decides). */
const arm = (page) => page.evaluate((TY) => {
  const g = window.__game, L = (window.__sab = { log: [], keep: 60 });
  for (const type of TY) g.events.on(type, (e) => L.log.push({ ...e, type, t: g.versus ? g.versus.t : 0 }));
  g.runMods.ext.push(() => { if (L.keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < L.keep) g.squad.setCount(L.keep, 'test'); } });
}, TYPES);
const txt = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const says = (page, sel, re, timeout) => page.waitForFunction(([s, r]) => new RegExp(r).test((document.querySelector(s) || {}).textContent || ''), [sel, re.source], { timeout });
const saysKind = (page) => page.evaluate(() => /\b(BOT|COMPUTER|HUMAN|PLAYER FOUND)\b/i.test(document.body.innerText));
/** The rival's ghost as drawn: its lane x and how far it is from my squad, sampled every `ms` for `n` samples. */
const ghostTrace = (page, n, ms) => page.evaluate(async ([N, MS]) => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const v = window.__game.versus, p = v && v.ghost.peers[0];
    if (p && p.track.out.ok) out.push({ t: Math.round(v.t * 10) / 10, x: Math.round(p.track.out.x * 100) / 100, rel: Math.round(p.rel), shown: Math.round(p.shown * 100) / 100 });
    await new Promise((r) => setTimeout(r, MS));
  }
  return out;
}, [n, ms]);

export const scenarios = !process.env.DUO_LIVE ? [] : [
  {
    name: 'LIVE Firebase, two players: QUICK MATCH pairs them, sabotage both ways, a wipe, both results with PLAY AGAIN',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, shots, label } = T;
      const ctxs = [];
      const open = opener(T, ctxs);
      const shot = async (page, pid, name) => { await page.bringToFront(); await page.screenshot({ path: `${shots}/${label}-${pid}-${name}.png` }); };
      const both = async (name) => { await shot(A, 'A', name); await shot(B, 'B', name); };
      let A = null, B = null;
      try {
        A = await open('A', 'test=1&quality=low');
        await sleep(500);
        await signIn(A, 'Ann');
        B = await open('B', 'test=1&quality=low');
        await signIn(B, 'Ben');
        for (const p of [A, B]) { await p.evaluate(() => window.__game.debug.setAutopilot('pro', 1)); await arm(p); }
        await A.bringToFront();
        await A.click('.on-quick', { force: true });
        await A.waitForSelector('.on-find:not(.found)', { timeout: 5000 });
        await sleep(1200);
        await shot(A, 'A', '1-finding');
        const tapB = Date.now();
        await B.click('.on-quick', { force: true });
        for (const p of [A, B]) await p.waitForSelector('.on-find.found', { timeout: 8000 });
        const pairedMs = Date.now() - tapB;
        await sleep(400);
        await both('2-found');
        eq([await txt(A, '.on-find-name'), await txt(B, '.on-find-name')], ['Ben', 'Ann'], 'RIVAL FOUND! names');
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 15000 });
        const liveMs = Date.now() - tapB;
        await sleep(600);
        await both('3-vscard');
        ok(await A.evaluate(() => !document.querySelector('.vs-card').classList.contains('hidden')), 'the VS card');
        const kinds = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.online.flow.quick.match.kind)));
        eq(kinds, ['human', 'human'], 'both play each other');
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.versus.t >= 14, null, { timeout: 90000 });
        await both('4-bar-ghost');
        const bar = await txt(A, '.vs-rivals');
        ok(/BEN/.test(bar || ''), `A's bar: ${bar}`);
        // ---- sabotage both ways ----
        await A.evaluate(() => { const s = window.__game.versus.sab; s.test.clear(); s.test.give(1); });
        await B.evaluate(() => { const s = window.__game.versus.sab; s.test.clear(); s.test.give(3); });
        await sleep(400);
        await A.bringToFront(); await A.click('.sab-btn', { force: true });
        await B.waitForFunction(() => window.__sab.log.some((e) => e.type === 'sab:warn'), null, { timeout: 6000 });
        await shot(B, 'B', '5-warning');
        await B.bringToFront(); await B.click('.sab-btn', { force: true });
        await A.waitForFunction(() => window.__sab.log.some((e) => e.type === 'sab:warn'), null, { timeout: 6000 });
        await shot(A, 'A', '5-warning');
        const warnA = await txt(A, '.sab-warns');
        ok(/FROM BEN/.test(warnA || ''), `A's warning: ${warnA}`);
        await sleep(2500);
        // ---- B is wiped ----
        await B.evaluate(() => { window.__sab.keep = 0; window.__game.squad.setCount(0, 'horde'); });
        await says(B, '.vs-down', /SQUAD DOWN!/, 10000);
        await shot(B, 'B', '6-down');
        await says(A, '.vs-down', /RIVAL DOWN!/, 10000);
        await shot(A, 'A', '6-down');
        for (const p of [A, B]) await p.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 30000 });
        await sleep(900);
        await both('7-result');
        const res = (p) => p.evaluate(() => [window.__game.versus.result.result, document.querySelector('.vsr .ribbon').textContent.trim(), document.querySelector('.vsr-rematch').textContent.trim()]);
        eq(await res(A), ['win', 'YOU WIN!', 'PLAY AGAIN'], 'A\'s result');
        eq(await res(B), ['lose', 'YOU LOSE', 'PLAY AGAIN'], 'B\'s result');
        ok(!(await saysKind(A)) && !(await saysKind(B)), 'a screen says what kind of rival this is');
        note(`paired ${pairedMs} ms after B's tap, live ${liveMs} ms; A's warning "${warnA}"`);
        for (const p of [A, B]) await p.click('.vsr [data-act="leave"]', { force: true });
        for (const p of [A, B]) await p.waitForSelector('.on-quick', { timeout: 10000 });
      } finally { for (const c of ctxs) await c.close(); }
    },
  },
  {
    name: 'LIVE Firebase, one player: nobody else searching, a rival at 10 s, a whole bot match, RIVAL DOWN!, PLAY AGAIN',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, shots, label } = T;
      const ctxs = [];
      const open = opener(T, ctxs);
      const shot = async (name) => { await A.screenshot({ path: `${shots}/${label}-A-${name}.png` }); };
      let A = null;
      try {
        A = await open('A', 'test=1&quality=low');
        await sleep(500);
        await signIn(A, 'Ann');
        await A.evaluate(() => { try { localStorage.removeItem('nimbusRaiders.online.bot'); } catch { /* blocked */ } window.__game.debug.setAutopilot('pro', 1); });
        await arm(A);
        const tap = Date.now();
        await A.click('.on-quick', { force: true });
        await sleep(3200);
        await shot('1-finding');
        const secs = await txt(A, '.on-find-secs');
        ok(/^0:0[2-4]$/.test(secs || ''), `the counter: ${secs}`);
        await A.waitForSelector('.on-find.found', { timeout: 14000 });
        const foundMs = Date.now() - tap;
        await sleep(300);
        await shot('2-found');
        const name = await txt(A, '.on-find-name');
        await A.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 10000 });
        await sleep(600);
        await shot('3-vscard');
        const peer = await A.evaluate(() => { const l = window.__game.online.flow.link; return { ...l.peers[0], ranked: l.ranked, kind: window.__game.online.flow.quick.match.kind }; });
        ok(peer.bot && peer.kind === 'bot' && peer.name === name && peer.ranked === false, `the link: ${JSON.stringify(peer)}`);
        await A.waitForFunction(() => window.__game.versus.t >= 12, null, { timeout: 60000 });
        await shot('4-bar-ghost');
        // the ghost as drawn for 6 s: it steers between lanes, it does not swing like a sine
        const trace = await ghostTrace(A, 60, 100);
        await shot('5-ghost');
        const xs = trace.map((s) => s.x), moves = xs.slice(1).map((x, i) => x - xs[i]);
        const flips = moves.filter((d, i) => i && Math.sign(d) && Math.sign(moves[i - 1]) && Math.sign(d) !== Math.sign(moves[i - 1])).length;
        note(`ghost x over 6 s: ${xs.filter((_, i) => i % 6 === 0).join(' ')} (min ${Math.min(...xs)}, max ${Math.max(...xs)}, direction changes ${flips}); rel ${trace.length ? trace[trace.length - 1].rel : '-'}`);
        ok(trace.length >= 30, `the ghost was drawn in ${trace.length} of 60 samples`);
        const rows = await A.evaluate(() => window.__game.online.flow.link.bot.test.rows.map((r) => [Math.round(r.at), Math.round(r.x * 10) / 10, r.aim]));
        note(`gate rows the bot went through: ${JSON.stringify(rows.slice(0, 8))}`);
        ok(rows.length >= 2 && rows.filter((r) => Math.abs(r[1] - r[2]) < 1.2).length >= rows.length * 0.6, `the bot steers at the gate lanes: ${JSON.stringify(rows.slice(0, 10))}`);
        // its first sabotage: a warning on my screen, FROM <its name>
        await A.waitForFunction(() => window.__sab.log.some((e) => e.type === 'sab:warn'), null, { timeout: 45000 });
        await sleep(150);
        await shot('6-warning');
        const warn = await txt(A, '.sab-warns');
        ok(new RegExp(`FROM ${name.toUpperCase()}`).test(warn || ''), `the warning: ${warn}`);
        // mine on it
        await A.evaluate(() => { const s = window.__game.versus.sab; s.test.clear(); s.test.give(1); });
        await sleep(300);
        await A.click('.sab-btn', { force: true });
        await A.waitForFunction(() => window.__game.online.flow.link.bot.stats.dips > 0, null, { timeout: 5000 });
        await sleep(1500);
        await shot('7-sabotaged');
        // the bot falls 3 s from now
        await A.evaluate(() => { const l = window.__game.online.flow.link; l.bot.test.fallAt(l.clock() + 3); });
        await says(A, '.vs-down', /RIVAL DOWN!/, 12000);
        await shot('8-rival-down');
        await A.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 30000 });
        await sleep(900);
        await shot('9-result');
        const res = await A.evaluate(() => [window.__game.versus.result.result, document.querySelector('.vsr .ribbon').textContent.trim(), document.querySelector('.vsr-rematch').textContent.trim()]);
        eq(res, ['win', 'YOU WIN!', 'PLAY AGAIN'], 'the result');
        ok(!(await saysKind(A)), 'a screen says what kind of rival this is');
        await A.click('.vsr-rematch', { force: true });
        await A.waitForSelector('.on-find:not(.found)', { timeout: 8000 });
        await sleep(1200);
        await shot('10-again');
        await A.click('.on-find-cancel', { force: true });
        await A.waitForSelector('.on-quick', { timeout: 8000 });
        note(`RIVAL FOUND! ${foundMs} ms after the tap (${name}); warning "${warn}"`);
      } finally { for (const c of ctxs) await c.close(); }
    },
  },
];
