// RANKED Quick Match, rewards, boards, emotes and share between REAL pages (STAGE4 "INTEGRATOR" step 2): the bridge,
// the hub's virtual clock, the real rules. Every check reads both screens and the hub's tree. Profiles are seeded
// through hub.admin (the owner's console), never through a client write. Run with `node scripts/duo.mjs ranked`.
import { humanStake, humanGain, botStake, botGain } from '../../src/online/verdict.js';

const dayOf = (now) => (now - (now % 86400000)) / 86400000;
const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const wipe = (p) => p.ev(() => { window.__keep = false; window.__game.squad.setCount(0, 'horde'); });
const shown = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;
/** My squad never drops under 60 while window.__keep (a win against the bot needs me standing). */
const tough = (p) => p.ev(() => {
  const g = window.__game;
  window.__keep = true;
  if (window.__tough) return;
  window.__tough = true;
  g.runMods.ext.push(() => { if (window.__keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < 60) g.squad.setCount(60, 'test'); } });
});
/** The ranked side, the reward and the result screen's block, as plain data. */
const rank = (p) => p.ev(() => {
  const g = window.__game, f = g.online.flow, v = f.session.ranked, L = f.reward.last;
  const q = (s) => { const n = document.querySelector(s); return n && n.isConnected ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
  const tr = document.querySelector('.screen-vsresult .vsr-tr, .vsr .vsr-tr'), c = document.querySelector('.vsr .vsr-coins');
  return {
    state: v.state, why: v.why, s: v.s, g: v.g, tr0: v.tr0, tr: v.tr, o: v.o,
    reward: L && { kind: L.kind, ranked: L.ranked, state: L.state, why: L.why, g: L.g, coins: L.coins, leagueUp: L.leagueUp, skins: L.skins },
    line: tr ? { g: tr.dataset.g, state: tr.dataset.state, text: q('.vsr .vsr-tr') } : null,
    coinsLine: c ? { c: c.dataset.c, text: q('.vsr .vsr-coins') } : null,
    rivalTag: q('.vsr-places li[data-slot]:not(.me) .vsr-rg'), coins: g.save.data.coins,
    owned: g.save.data.skins.owned.filter((id) => id.startsWith('on-')), moment: q('.vsr-lgup'), skinLine: q('.vsr .vsr-skin'),
    hist: g.save.data.online.hist.slice(0, 3).map((h) => ({ r: h.r, k: h.k, g: h.g, c: h.c })),
  };
});
/** The MUTE / UNMUTE toggle in the emote fan (the fan opened first when it is shut). */
async function mute(p) {
  if (!(await p.ev(() => window.__game.ui.matchUi.emotes.open))) await p.click('.emo-btn');
  await p.click('.emo-mute');
}
const done = (r) => ['saved', 'failed'].includes(r.state);
async function settled(duo, ps, what) {
  return duo.until(async () => { const r = await Promise.all(ps.map(rank)); return r.every(done) ? r : null; }, what, { max: 45000, step: 250 });
}
async function toResults(duo, ps, max = 40) {
  const got = await duo.play(max, async () => { const vs = await Promise.all(ps.map((p) => p.view())); return vs.every(shown) ? vs : null; }, 5);
  if (!got) throw new Error(`no result screen on every page: ${JSON.stringify(await Promise.all(ps.map((p) => p.view())))}`);
  return got;
}
/** Seeds a profile and lets the page read it again (flow.connect: what a new visit does). */
async function seedMine(duo, p, fields) {
  duo.seed(p.pid, fields);
  await p.ev(() => { window.__game.online.flow.connect(); });
  await duo.until(() => p.ev((tr) => { const P = window.__game.online.flow.session.profile; return !!P && P.tr === tr; }, fields.tr), `${p.pid}: the seeded profile`);
}
async function pairUp(duo, A, B) {
  await duo.quick(A);
  await duo.tick(100);
  await duo.quick(B);
  await duo.found(A); await duo.found(B);
  return duo.go(A, B);
}
/** A quick match against the bot from the hub (or the finding view): win = the bot falls at 8 s; else I fall at 11 s. */
async function botMatch(duo, A, { win }) {
  if ((await A.view()).view !== 'quick') await duo.quick(A);
  await duo.found(A);
  await duo.go(A);
  await tough(A);
  await A.ev((w) => window.__game.online.flow.link.bot.test.fallAt(w ? 8 : 300), win);
  await duo.until(async () => ['staked', 'none', 'failed'].includes((await rank(A)).state) && (await A.view()).clock >= 0, 'A: GO and the stake', { max: 12000 });
  if (!win) { await duo.play(15, async () => (await A.view()).t >= 11); await wipe(A); }
  const [v] = await toResults(duo, [A]);
  return v;
}
const profNums = (P) => P && { tr: P.tr, pk: P.pk, w: P.w, l: P.l, st: P.st, sk: !!P.sk };
const noDenials = (duo, eq, what) => eq(duo.denials.filter((d) => (d.writes || []).some(([p]) => /^(users|rk)\//.test(p))).map((d) => d.writes.map(([p]) => p)), [], `${what}: profile writes the rules refused`);

export const scenarios = [
  {
    name: 'a person vs a person (750 vs 300): stakes at GO, the win claimed after 20 s, mirrored numbers on both screens, rk, coins, emotes, share',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B', { size: [360, 640] });
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await seedMine(duo, A, { tr: 750, pk: 750 });
      await seedMine(duo, B, { tr: 300, pk: 300 });
      await bots(A, B);
      const coins0 = [(await rank(A)).coins, (await rank(B)).coins];
      await pairUp(duo, A, B);
      await duo.play(1);
      const [ca, cb] = [await A.text('.vs-card'), await B.text('.vs-card')];
      ok(/750/.test(ca) && /300/.test(ca) && /750/.test(cb) && /300/.test(cb), `the VS cards show both trophy counts: "${ca}" / "${cb}"`);
      ok(await A.ev(() => document.querySelectorAll('.vs-card .lg-badge svg').length === 2), 'two league badges on the VS card');
      await A.shot('card'); await B.shot('card');
      await duo.play(8, async () => (await rank(A)).state === 'staked' && (await rank(B)).state === 'staked');
      const [sa, sb] = [duo.profile(A), duo.profile(B)];
      eq([sa.tr, sa.sk && sa.sk.s, sa.sk && sa.sk.o, sb.tr, sb.sk && sb.sk.s, sb.sk && sb.sk.o], [750 - humanStake(750), humanStake(750), 300, 300 - humanStake(300), humanStake(300), 750], 'both stakes on the hub (s and the rival\'s trophies o)');
      eq([duo.hub.admin.get('rk/A'), duo.hub.admin.get('rk/B')], [sa.tr, sb.tr], 'rk mirrors after the stakes');
      // ---- emotes both ways: the 2 s cooldown, mute ----
      await duo.play(4, async () => (await A.view()).t >= 6);
      ok(await duo.emote(A, 0), 'A\'s thumbs up was sent');
      ok(!(await duo.emote(A, 1)), 'a second emote inside 2 s is refused');
      await duo.play(0.5);
      const gotB = await B.ev(() => window.__game.ui.matchUi.emotes.test.shown.filter((s) => !s.mine && s.where === 'bar').map((s) => s.a));
      eq(gotB, [0], 'B saw A\'s thumbs up over A\'s bar row');
      ok(await B.has('.emo-bub'), 'the bubble is on B\'s screen');
      await B.shot('emote');
      await duo.play(2.2);
      ok(await duo.emote(B, 1), 'B laughs back');
      await duo.play(0.5);
      eq(await A.ev(() => window.__game.ui.matchUi.emotes.test.shown.filter((s) => s.where === 'bar').map((s) => s.a)), [1], 'A saw B\'s laugh');
      await mute(B);
      ok(await B.ev(() => window.__game.ui.matchUi.emotes.test.muted), 'B muted emotes');
      await duo.play(2.1);
      ok(await duo.emote(A, 3), 'A sends GG');
      await duo.play(0.5);
      eq(await B.ev(() => window.__game.ui.matchUi.emotes.test.shown.filter((s) => s.where === 'bar').length), 1, 'muted: B shows no new bubble');
      await mute(B); // (unmute: it is kept in localStorage)
      // ---- B falls: A wins ----
      await duo.play(10, async () => (await A.view()).t >= 12 && (await B.view()).t >= 12);
      await wipe(B);
      await toResults(duo, [A, B]);
      const early = await rank(A);
      ok(early.state === 'saving' || early.state === 'staked', `A's win waits for the 20 s: ${early.state}`);
      ok(/SAVING/.test((early.line && early.line.text) || ''), `A's line says SAVING...: ${JSON.stringify(early.line)}`);
      await A.shot('saving');
      const [ra, rb] = await settled(duo, [A, B], 'both ranked writes to settle');
      const G = humanGain(750, 300), S = humanStake(300);
      eq([ra.state, ra.g, rb.state, rb.g], ['saved', G, 'saved', -S], 'the two ranked results');
      eq([ra.line.g, ra.rivalTag, rb.line.g, rb.rivalTag], [String(G), `-${S} TROPHIES`, String(-S), `+${G} TROPHIES`], 'both screens show the same pair, mirrored');
      const [pa, pb] = [duo.profile(A), duo.profile(B)];
      eq([profNums(pa), profNums(pb)], [{ tr: 750 + G, pk: 750 + G, w: 1, l: 0, st: 1, sk: false }, { tr: 300 - S, pk: 300, w: 0, l: 1, st: 0, sk: false }], 'the hub\'s profiles');
      eq([duo.hub.admin.get('rk/A'), duo.hub.admin.get('rk/B')], [pa.tr, pb.tr], 'rk mirrors equal tr');
      eq([pa.cd, pa.cc, pa.ws > 0], [dayOf(duo.clock.now()), 1, true], 'A\'s day counter and week score');
      const dc = [ra.coins - coins0[0], rb.coins - coins0[1]];
      ok(dc[0] === ra.reward.coins && dc[1] === rb.reward.coins && dc[0] >= 160 && dc[1] >= 15, `coins paid on both pages: ${dc} (reward says ${ra.reward.coins} / ${rb.reward.coins})`);
      ok(/FIRST WIN TODAY/.test(ra.coinsLine.text) && /COINS/.test(rb.coinsLine.text), `coins lines: "${ra.coinsLine.text}" / "${rb.coinsLine.text}"`);
      eq([ra.hist[0], rb.hist[0]], [{ r: 'w', k: 'q', g: G, c: ra.reward.coins }, { r: 'l', k: 'q', g: -S, c: rb.reward.coins }], 'history rows with g and c');
      await A.shot('saved'); await B.shot('saved');
      // ---- a GG on the result screen ----
      ok(await duo.emote(B, 3), 'B sends GG from the result screen');
      await duo.play(0.3);
      eq(await A.ev(() => window.__game.ui.matchUi.emotes.test.shown.filter((s) => s.where === 'result').map((s) => s.a)), [3], 'A saw the GG over B\'s result row');
      // ---- SHARE (the system share sheet stubbed in) ----
      await A.ev(() => { navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text }; }; });
      await A.click('.vsr [data-act="share"]');
      const sh = await duo.until(() => A.ev(() => window.__shared || null), 'the share sheet to get the picture', { max: 4000 });
      const last = await A.ev(async () => (await import('/src/online/share.js')).share.test.last);
      ok(sh.n === 1 && sh.name === 'nimbus-raiders-match.png' && sh.type === 'image/png' && sh.size > 20000, `navigator.share got: ${JSON.stringify(sh)}`);
      ok(last && last.w === 1080 && last.h === 1350 && last.via === 'share' && /Nimbus Raiders|NIMBUS/i.test(last.text || sh.text || ''), `share.test.last: ${JSON.stringify(last)}`);
      noDenials(duo, eq, 'the match');
      note(`A +${G} (rival tag ${ra.rivalTag}), B -${S}; coins ${dc}; share ${sh.size} bytes`);
    },
  },
  {
    name: 'against the bot at 0 and at 750 trophies: a win and a loss each, the tier\'s numbers (PLAY AGAIN in between)',
    async run(duo, { eq, ok, note }) {
      const A = await duo.page('A');
      await duo.signIn(A, 'Ann');
      await bots(A);
      const seen = [];
      for (const [tr, win] of [[0, true], [0, false], [750, true], [750, false]]) {
        duo.seed('A', { tr, pk: Math.max(tr, duo.profile(A).pk), st: 0 });
        const v = await botMatch(duo, A, { win });
        const [r] = await settled(duo, [A], `the ranked write after a bot ${win ? 'win' : 'loss'} at ${tr}`);
        const P = duo.profile(A), want = win ? tr + botGain(tr) : tr - botStake(tr);
        eq([v.result.result, r.state, P.tr, !!P.sk, duo.hub.admin.get('rk/A')], [win ? 'win' : 'lose', 'saved', want, false, want], `a bot ${win ? 'win' : 'loss'} at ${tr}`);
        eq(r.line.g, String(win ? botGain(tr) : -botStake(tr)), `the result line at ${tr}`);
        ok(r.rivalTag !== null, 'the rival row has its change tag (a bot is not labelled)');
        seen.push(`${tr}${win ? 'W' : 'L'} -> ${P.tr} (${r.line.text})`);
        if (tr === 750 && !win) await A.shot('bot-loss-750');
        await A.click('.vsr-rematch');
        await duo.until(async () => (await A.view()).view === 'quick', 'A: the finding view after PLAY AGAIN');
      }
      await A.click('.on-find-cancel');
      eq([duo.profile(A).w, duo.profile(A).l], [2, 2], 'two wins and two losses on the hub');
      noDenials(duo, eq, 'four bot matches');
      note(seen.join('; '));
    },
  },
  {
    name: 'a draw (both fall in the same step with equal metres) gives both stakes back',
    async run(duo, { eq, ok }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.signIn(A, 'Ann');
      await duo.signIn(B, 'Ben');
      await seedMine(duo, A, { tr: 300, pk: 300 });
      await seedMine(duo, B, { tr: 310, pk: 310 });
      await bots(A, B);
      await pairUp(duo, A, B);
      await duo.play(20, async () => (await A.view()).t >= 12 && (await B.view()).t >= 12 && (await rank(A)).state === 'staked' && (await rank(B)).state === 'staked');
      for (const p of [A, B]) await p.ev(() => { const l = window.__game.versus.link, f = l.fall; l.fall = (o) => f.call(l, { ...o, d: 150 }); });
      await wipe(A); await wipe(B);
      const [a, b] = await toResults(duo, [A, B]);
      eq([a.result.result, b.result.result], ['draw', 'draw'], 'both pages say DRAW');
      const [ra, rb] = await settled(duo, [A, B], 'both draws to settle');
      eq([ra.state, rb.state, duo.profile(A).tr, duo.profile(B).tr, duo.profile(A).l, duo.profile(B).l, !!duo.profile(A).sk], ['saved', 'saved', 300, 310, 0, 0, false], 'stakes back on the hub');
      ok(/TROPHIES BACK/.test(ra.line.text) && /TROPHIES BACK/.test(rb.line.text), `the lines: "${ra.line.text}" / "${rb.line.text}"`);
      eq([duo.hub.admin.get('rk/A'), duo.hub.admin.get('rk/B')], [300, 310], 'rk mirrors');
      noDenials(duo, eq, 'a draw');
      await A.shot('draw');
    },
  },
  {
    name: 'a reload mid-match (bot, then a person): the next visit closes the stake as a loss (a person: the quit record first)',
    async run(duo, { eq, ok, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.signIn(A, 'Ann');
      await seedMine(duo, A, { tr: 750, pk: 750 });
      await bots(A);
      await duo.quick(A);
      await duo.found(A);
      await duo.go(A);
      await duo.play(14, async () => (await A.view()).t >= 6 && (await rank(A)).state === 'staked');
      eq([duo.profile(A).tr, !!duo.profile(A).sk], [750 - botStake(750), true], 'the bot stake is on the hub');
      await duo.reload(A);
      await A.page.waitForTimeout(6500); // (the dead page's live stamp has to be over 6 s old)
      await A.click('.btn-online');
      await duo.until(() => !duo.profile(A).sk, 'A\'s next visit closes the bot stake');
      eq(profNums(duo.profile(A)), { tr: 750 - botStake(750), pk: 750, w: 0, l: 1, st: 0, sk: false }, 'the loss stands');
      // ---- a person: A reloads, B wins by the forfeit ----
      await duo.signIn(B, 'Ben');
      await seedMine(duo, B, { tr: 300, pk: 300 });
      await bots(A, B);
      await pairUp(duo, A, B);
      await duo.play(14, async () => (await A.view()).t >= 6 && (await rank(A)).state === 'staked' && (await rank(B)).state === 'staked');
      const mid = (await A.ev(() => window.__game.online.flow.quick.match)).mid, slotA = (await A.ev(() => window.__game.online.flow.quick.match.slot));
      const trA = duo.profile(A).tr;
      await duo.reload(A);
      const [vb] = await toResults(duo, [B], 30);
      eq(vb.result.result, 'win', 'B wins when A is gone');
      const [rb] = await settled(duo, [B], 'B\'s claim');
      eq([rb.state, duo.profile(B).tr], ['saved', 300 + humanGain(300, 750 - botStake(750))], 'B\'s win on the hub');
      await A.page.waitForTimeout(6500);
      await A.click('.btn-online');
      await duo.until(() => !duo.profile(A).sk, 'A\'s next visit closes the human stake');
      const out = duo.hub.admin.get(`matches/${mid}/out/${slotA}`);
      ok(out && ['quit', 'dc'].includes(out.by), `A's fall record: ${JSON.stringify(out)}`);
      eq([duo.profile(A).tr, duo.profile(A).l], [trA, 2], 'A\'s loss stands');
      noDenials(duo, eq, 'two reloads');
      note(`A's record by ${out.by}; notice ${(await A.view()).notice}`);
    },
  },
  {
    name: 'a 41st win of the day (cc set to 40 after the stake) is refused gracefully: DAILY TROPHY LIMIT, no error',
    async run(duo, { eq, ok, note }) {
      const A = await duo.page('A', { size: [360, 640] });
      await duo.signIn(A, 'Ann');
      await seedMine(duo, A, { tr: 750, pk: 750 });
      await bots(A);
      await duo.quick(A);
      await duo.found(A);
      await duo.go(A);
      await tough(A);
      await A.ev(() => window.__game.online.flow.link.bot.test.fallAt(8));
      await duo.play(14, async () => (await rank(A)).state === 'staked');
      eq((await rank(A)).state, 'staked', 'the stake landed');
      duo.seed('A', { cd: dayOf(duo.clock.now()), cc: 40 });
      const [v] = await toResults(duo, [A]);
      eq(v.result.result, 'win', 'A wins');
      const [r] = await settled(duo, [A], 'the refused claim');
      eq([r.state, r.why, duo.profile(A).tr, duo.profile(A).cc, !!duo.profile(A).sk], ['failed', 'cap', 750 - botStake(750), 40, false], 'the stake is closed, the loss stays');
      ok(/DAILY TROPHY LIMIT/.test(r.line.text), `the line: "${r.line.text}"`);
      await A.shot('cap');
      note(`line "${r.line.text}"; denials ${duo.denials.length}`);
    },
  },
  {
    name: 'a friend room changes no trophies but pays 20 / 10 friend coins',
    async run(duo, { eq, ok }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.lobby(A, B);
      await seedMine(duo, A, { tr: 500, pk: 500 });
      await seedMine(duo, B, { tr: 520, pk: 520 });
      const c0 = [(await rank(A)).coins, (await rank(B)).coins];
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(20, async () => (await A.view()).t >= 12);
      await wipe(B);
      await toResults(duo, [A, B]);
      await duo.play(1);
      const [ra, rb] = [await rank(A), await rank(B)];
      eq([ra.coins - c0[0], rb.coins - c0[1]], [20, 10], 'friend coins');
      ok(/FRIEND MATCH - NO TROPHIES/.test(ra.line.text) && ra.rivalTag === null, `A's line: "${ra.line.text}" / tag ${ra.rivalTag}`);
      eq([profNums(duo.profile(A)), profNums(duo.profile(B))], [{ tr: 500, pk: 500, w: 0, l: 0, st: 0, sk: false }, { tr: 520, pk: 520, w: 0, l: 0, st: 0, sk: false }], 'no profile change');
    },
  },
  {
    name: 'tr 290 and 9 wins + a bot win: SILVER league moment, Silver Storm and Victory Gold unlocked, Victory Gold equipped in the SHOP',
    async run(duo, { eq, ok }) {
      const A = await duo.page('A', { size: [360, 640] });
      await duo.signIn(A, 'Ann');
      await seedMine(duo, A, { tr: 290, pk: 290, w: 9 });
      await bots(A);
      ok((await rank(A)).owned.length === 0, 'no online skin before');
      await botMatch(duo, A, { win: true });
      await A.shot('saving');
      const r = await duo.until(async () => { const x = await rank(A); return x.state === 'saved' && x.moment ? x : null; }, 'the league-up moment', { max: 40000, step: 250 });
      ok(/YOU REACHED ?SILVER LEAGUE!/.test(r.moment), `the moment: ${r.moment}`);
      await A.shot('leagueup');
      eq([duo.profile(A).tr, duo.profile(A).pk, duo.profile(A).w], [290 + botGain(290), 290 + botGain(290), 10], 'the hub');
      eq(r.owned.sort(), ['on-silver', 'on-wins10'], 'online skins owned');
      ok(/SILVER STORM/.test(r.skinLine || '') && (await A.text('.vsr')).includes('VICTORY GOLD'), `the new-skin lines: ${await A.text('.vsr')}`);
      await A.page.waitForTimeout(3200); // (the moment goes by itself)
      await A.shot('skins');
      // ---- the SHOP's GUN PAINT tab: Victory Gold is mine, EQUIP works ----
      await A.click('.vsr [data-act="leave"]');
      await duo.until(async () => (await A.view()).view === 'hub', 'the hub after LEAVE');
      await A.ev(() => window.__game.ui.nav('title'));
      await A.click('[data-act="shop"]');
      await A.click('[data-act="tab"][data-tab="weapons"]');
      await A.page.waitForTimeout(500);
      const card = await A.text('.skin-card[data-id="on-wins10"]');
      ok(/EQUIP/.test(card || '') && !/EARN ONLINE/.test(card || ''), `the Victory Gold card: ${card}`);
      ok(/EARN ONLINE/.test((await A.text('.skin-card[data-id="on-streak5"]')) || ''), 'Hot Streak is still locked');
      await A.click('.skin-card[data-id="on-wins10"] [data-act="equip"]');
      eq(await A.ev(() => window.__game.save.data.skins.weapon), 'on-wins10', 'Victory Gold equipped');
      await A.ev(() => window.__game.ui.update(1 / 60)); // (one frame: the bridge pages draw no frames of their own)
      ok(!(await A.has('.emo-dock .emo-btn')), 'the emote button is gone outside the match and its result');
      await A.shot('shop');
    },
  },
  {
    name: 'LEADERBOARDS: seeded players in order on the three tabs, my rank and my place',
    async run(duo, { eq, ok }) {
      const A = await duo.page('A');
      await duo.signIn(A, 'Ann');
      const WK = ((now) => { const x = now - 345600000; return (x - (x % 604800000)) / 6048; })(duo.clock.now());
      const P = (n, tr, ws, bt) => ({ n, tr, pk: tr, w: 0, l: 0, st: 0, bs: 0, bt, ws, cd: 0, cc: 0 });
      const ppl = { u1: P('Zed', 900, WK + 40, 1200), u2: P('Kay', 640, WK + 90, 0), u3: P('Lou', 640, WK - 5, 2500), u4: P('Moe', 120, WK + 3, 300) };
      for (const [uid, p] of Object.entries(ppl)) { duo.hub.admin.set(`users/${uid}`, p); duo.hub.admin.set(`rk/${uid}`, p.tr); }
      await seedMine(duo, A, { tr: 400, pk: 400, ws: WK + 60, bt: 900 });
      const top = await duo.boards(A, 'top');
      eq(top.rows.map((r) => `${r.rank}${r.name}${r.me ? '*' : ''}`), ['1ZED', '2KAY', '2LOU', '4ANN*', '5MOE'], 'TOP 100');
      ok(/#4/.test(top.mine), `my rank: ${top.mine}`);
      await A.shot('top');
      const week = await duo.boards(A, 'week');
      eq(week.rows.map((r) => `${r.name}${r.v}`), ['KAY+90', 'ANN+60', 'ZED+40', 'MOE+3'], 'THIS WEEK (last week\'s Lou missing)');
      ok(/#2/.test(week.mine), `my place this week: ${week.mine}`);
      const long = await duo.boards(A, 'long');
      eq(long.rows.map((r) => r.name), ['LOU', 'ZED', 'ANN', 'MOE'], 'LONGEST (Kay with no time missing)');
      await A.shot('long');
      noDenials(duo, eq, 'board reads');
    },
  },
];
