// RANKED Quick Match in REAL TIME (STAGE4 "INTEGRATOR" point 3), real frames, real clicks, ?net=local (the first tab
// hosts the local hub with the real rules; profiles are seeded through that hub's admin, the owner's console):
//   1. two tabs: badges on the VS card, an emote bubble, the result with trophies and coins (SAVING... then saved),
//      the league-up moment, the share sheet (PICTURE SAVED!), the hub's badge, LEADERBOARDS and MY PROFILE;
//   2. one tab against the bot at 360x640: SAVING... then saved, the league-up moment and the new-skin lines.
// Screenshots go to `--shots <dir>`: look at them. Run with `node scripts/duo.mjs rankreal`.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function opener(T, ctx) {
  const errors = (T.errors = T.errors || []);
  return async (pid, query) => {
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`${pid}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${pid}: [pageerror] ${e.stack || e.message}`));
    await page.goto(`${T.base}/?${query}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout: 120000 });
    await page.evaluate(() => { for (const k of ['pending', 'stake', 'coins', 'bot', 'mute']) { try { localStorage.removeItem(`nimbusRaiders.online.${k}`); } catch { /* blocked */ } } });
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
  await page.waitForSelector('.on-quick', { timeout: 20000 });
  await sleep(700);
}
/** The owner's console on the hosting tab: users/{uid} fields and rk. */
const seed = (host, uid, fields) => host.evaluate(([u, f]) => {
  const hub = window.__game.online.hub;
  hub.admin.update(Object.fromEntries(Object.entries(f).map(([k, v]) => [`users/${u}/${k}`, v])));
  if ('tr' in f) hub.admin.set(`rk/${u}`, f.tr);
}, [uid, fields]);
const reconnect = (page) => page.evaluate(() => window.__game.online.flow.connect().then(() => window.__game.online.flow.session.profile.tr));
/** Autopilot on; my squad kept at 60 while window.__keep (the scenario lets go). */
const arm = (page) => page.evaluate(() => {
  const g = window.__game;
  g.debug.setAutopilot('pro', 1);
  window.__keep = true;
  g.runMods.ext.push(() => { if (window.__keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < 60) g.squad.setCount(60, 'test'); } });
});
const txt = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const live = (page) => page.waitForFunction(() => window.__game.versus && window.__game.versus.live && window.__game.state === 'playing', null, { timeout: 20000 });
const atResult = (page) => page.waitForFunction(() => window.__game.state === 'result' && window.__game.ui.current === 'vsresult', null, { timeout: 40000 });
const saved = (page) => page.waitForSelector('.vsr .vsr-tr[data-state="saved"]', { timeout: 45000 });
const ctxOf = (browser, w, h) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, acceptDownloads: true });

export const scenarios = [
  {
    name: 'real time, two tabs: ranked Quick Match with badges, an emote, SAVING... then saved, SILVER moment, share sheet, hub, boards, profile',
    real: true,
    async run(_, T) {
      const { ok, eq, note, browser, shots, label } = T;
      const ctx = await ctxOf(browser, 390, 844);
      const open = opener(T, ctx);
      const shot = async (page, pid, name) => { await page.bringToFront(); await page.screenshot({ path: `${shots}/${label}-${pid}-${name}.png` }); };
      try {
        const A = await open('A', 'test=1&net=local&pid=A&quality=low');
        await sleep(500);
        await signIn(A, 'Ann');
        const B = await open('B', 'test=1&net=local&pid=B&quality=low');
        await signIn(B, 'Ben');
        ok(await A.evaluate(() => !!window.__game.online.hub), 'the first tab hosts the local hub');
        await seed(A, 'A', { tr: 290, pk: 290 });
        await seed(A, 'B', { tr: 310, pk: 310 });
        for (const [uid, n, tr] of [['p1', 'Zed', 1400], ['p2', 'Kay', 820], ['p3', 'Lou', 330], ['p4', 'Moe', 120]]) {
          await A.evaluate(([u, name, t]) => { const hub = window.__game.online.hub; hub.admin.set(`users/${u}`, { n: name, tr: t, pk: t, w: 3, l: 2, st: 1, bs: 2, bt: t * 2, ws: 0, cd: 0, cc: 0 }); hub.admin.set(`rk/${u}`, t); }, [uid, n, tr]);
        }
        eq([await reconnect(A), await reconnect(B)], [290, 310], 'both pages read their seeded trophies');
        for (const p of [A, B]) await arm(p);
        await A.bringToFront();
        await A.click('.on-quick', { force: true });
        await sleep(600);
        await B.click('.on-quick', { force: true });
        for (const p of [A, B]) await live(p);
        await sleep(700);
        await shot(A, 'A', '1-vscard'); await shot(B, 'B', '1-vscard');
        const card = await txt(A, '.vs-card');
        ok(/290/.test(card) && /310/.test(card) && (await A.evaluate(() => document.querySelectorAll('.vs-card .lg-badge svg').length)) === 2, `the VS card: ${card}`);
        // ---- an emote with real taps, seen on the other tab ----
        // (every text the trophies line shows, sampled in the page: screenshots of two tabs take seconds)
        // (and the ranked side's own states: with two tabs rendering, game time runs slower than wall time, so the claim
        // may need no wait and the in-process hub acks it within a millisecond, before a 50 ms sampler sees SAVING...)
        await A.evaluate(() => { const st = (window.__states = []); window.__game.online.flow.session.onRanked((v) => { if (st[st.length - 1] !== v.state) st.push(v.state); }); });
        await A.evaluate(() => { const seen = (window.__lines = []); setInterval(() => { const n = document.querySelector('.vsr .vsr-tr'); const t = n && n.isConnected ? `${n.dataset.state}:${n.textContent.trim()}` : null; if (t && seen[seen.length - 1] !== t) seen.push(t); }, 50); });
        await A.waitForFunction(() => window.__game.versus.t >= 3, null, { timeout: 60000 });
        await A.bringToFront();
        await A.click('.emo-btn', { force: true });
        await sleep(250);
        await shot(A, 'A', '2-fan');
        await A.click('.emo-pick[data-emo="1"]', { force: true });
        await B.waitForSelector('.emo-bub:not(.mine)', { timeout: 6000 });
        await shot(B, 'B', '3-emote');
        // ---- B falls: A wins ----
        await A.waitForFunction(() => window.__game.versus.t >= 10.5, null, { timeout: 60000 }); // (a loss under 10 s pays no coins)
        await B.evaluate(() => { window.__keep = false; window.__game.squad.setCount(0, 'horde'); });
        for (const p of [A, B]) await atResult(p);
        await sleep(300);
        await shot(A, 'A', '4-saving');
        const t0 = Date.now();
        await saved(A);
        const lines = await A.evaluate(() => window.__lines), states = await A.evaluate(() => window.__states);
        ok(states.includes('saving') && states.indexOf('saving') < states.lastIndexOf('saved') && /^saved:/.test(lines[lines.length - 1]), `A's line: SAVING... first, then saved: states ${JSON.stringify(states)}, lines ${JSON.stringify(lines)}`);
        note(`A's trophies line as sampled: ${JSON.stringify(lines)}`);
        await A.waitForSelector('.vsr-lgup', { timeout: 5000 });
        const claimMs = Date.now() - t0;
        await sleep(500);
        await shot(A, 'A', '5-leagueup');
        await saved(B);
        await sleep(3000);
        await shot(A, 'A', '6-saved'); await shot(B, 'B', '6-saved');
        const [la, lb] = [await txt(A, '.vsr .vsr-tr'), await txt(B, '.vsr .vsr-tr')];
        const [ga, gb] = [await txt(A, '.vsr-places li:not(.me) .vsr-rg'), await txt(B, '.vsr-places li:not(.me) .vsr-rg')];
        const gOf = (page) => page.evaluate(() => Number(document.querySelector('.vsr .vsr-tr').dataset.g));
        const [na, nb] = [await gOf(A), await gOf(B)];
        ok(na > 0 && nb < 0, `the changes: ${na} / ${nb} ("${la}" / "${lb}")`);
        eq([ga, gb], [`${nb} TROPHIES`, `+${na} TROPHIES`], 'the rival tags mirror the other screen');
        ok(/COINS/.test((await txt(A, '.vsr .vsr-coins')) || '') && /COINS/.test((await txt(B, '.vsr .vsr-coins')) || ''), 'coins lines on both');
        ok(/SILVER STORM/.test((await txt(A, '.vsr')) || ''), 'A\'s new-skin line');
        // ---- SHARE on B: no share sheet in this browser -> the picture is downloaded, PICTURE SAVED! ----
        await B.evaluate(() => { navigator.canShare = () => false; });
        await B.bringToFront();
        const dl = B.waitForEvent('download', { timeout: 10000 });
        await B.click('.vsr [data-act="share"]', { force: true });
        const file = await dl;
        await B.waitForSelector('.shr-card', { timeout: 5000 });
        await sleep(400);
        await shot(B, 'B', '7-share');
        eq(file.suggestedFilename(), 'nimbus-raiders-match.png', 'the downloaded picture');
        await file.saveAs(`${shots}/${label}-B-picture.png`);
        await B.click('.shr-card [data-shr="ok"]', { force: true }).catch(() => B.keyboard.press('Escape'));
        // ---- the hub, LEADERBOARDS, MY PROFILE ----
        await A.bringToFront();
        await A.click('.vsr [data-act="leave"]', { force: true });
        await A.waitForSelector('.on-quick', { timeout: 10000 });
        await sleep(800);
        ok(!(await A.evaluate(() => { const b = document.querySelector('.emo-dock .emo-btn'); return !!b && b.getClientRects().length > 0; })), 'no emote button on the hub');
        await shot(A, 'A', '8-hub');
        const me = await txt(A, '.on-me');
        ok(/TROPHIES/.test(me || ''), `the hub's name row: ${me}`);
        await A.click('[data-act="boards"]', { force: true });
        await A.waitForSelector('.bd[data-state="rows"]', { timeout: 10000 });
        await A.waitForFunction(() => /#\d/.test(document.querySelector('.bd-mine').textContent), null, { timeout: 10000 });
        await sleep(500);
        await shot(A, 'A', '9-boards');
        const rows = await A.evaluate(() => [...document.querySelectorAll('.bd-row .bd-nm')].map((n) => n.firstChild.textContent.trim()));
        eq(rows, ['ZED', 'KAY', 'LOU', 'ANN', 'BEN', 'MOE'], 'TOP 100 order');
        await A.click('[data-act="bd-tab"][data-tab="week"]', { force: true });
        await A.waitForFunction(() => document.querySelector('.bd').dataset.tab === 'week' && document.querySelector('.bd').dataset.state !== 'loading', null, { timeout: 10000 });
        await sleep(400);
        await shot(A, 'A', '10-week');
        await A.keyboard.press('Escape');
        await A.waitForSelector('.on-quick', { timeout: 10000 });
        await A.click('[data-act="profile"]', { force: true });
        await A.waitForSelector('.pf-head', { timeout: 10000 });
        await sleep(600);
        await shot(A, 'A', '11-profile');
        await A.evaluate(() => { const h = document.querySelector('.pf-hist'); if (h) h.scrollIntoView(); });
        await sleep(300);
        await shot(A, 'A', '12-profile-hist');
        ok(/SILVER LEAGUE/.test((await txt(A, '.pf-league')) || ''), `the profile's league: ${await txt(A, '.pf-league')}`);
        note(`A "${la}" / B "${lb}"; A's line went ${JSON.stringify(lines)}; claim saved ${claimMs} ms after the result showed; picture ${file.suggestedFilename()}`);
      } finally { await ctx.close(); }
    },
  },
  {
    name: 'real time, one tab at 360x640: a ranked bot win from 290 trophies, SAVING... then saved, the SILVER moment',
    real: true,
    async run(_, T) {
      const { ok, note, browser, shots, label } = T;
      const ctx = await ctxOf(browser, 360, 640);
      const open = opener(T, ctx);
      try {
        const A = await open('A', 'test=1&net=local&pid=solo&quality=low');
        const shot = (name) => A.screenshot({ path: `${shots}/${label}-A-${name}.png` });
        await sleep(500);
        await signIn(A, 'Sky Rider');
        await seed(A, 'solo', { tr: 290, pk: 290, w: 9 });
        ok((await reconnect(A)) === 290, 'the seeded trophies');
        await sleep(400);
        await shot('1-hub');
        await arm(A);
        await A.click('.on-quick', { force: true });
        await A.waitForSelector('.on-find.found', { timeout: 15000 });
        await live(A);
        await sleep(600);
        await shot('2-vscard');
        await A.waitForFunction(() => window.__game.versus.t >= 6, null, { timeout: 30000 });
        await A.evaluate(() => { const l = window.__game.online.flow.link; l.bot.test.fallAt(l.clock() + 3); });
        await atResult(A);
        await sleep(700);
        await shot('3-saving');
        ok(/SAVING/.test((await txt(A, '.vsr .vsr-tr')) || ''), `before the claim: ${await txt(A, '.vsr .vsr-tr')}`);
        await saved(A);
        await A.waitForSelector('.vsr-lgup', { timeout: 5000 });
        await sleep(500);
        await shot('4-leagueup');
        await sleep(3000);
        await shot('5-saved');
        const all = await txt(A, '.vsr');
        ok(/SILVER STORM/.test(all) && /VICTORY GOLD/.test(all), `the new-skin lines: ${all}`);
        note(`result: ${await txt(A, '.vsr .vsr-tr')} / ${await txt(A, '.vsr .vsr-coins')}`);
      } finally { await ctx.close(); }
    },
  },
];
