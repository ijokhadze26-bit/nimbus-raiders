// Sabotage between REAL pages through the bridge (STAGE2 "INTEGRATOR" point 2). Both pages on autopilot; a kind is
// loaded with sab.test.give / giveBig (the meter is on4's business) and sent with a real click on the SABOTAGE
// button. Every check reads the pages' own sab:* logs (played clock `t`) and their screens.
// Run with `node scripts/duo.mjs sab`.
import { sabKind, sentWords, BIG_WORDS } from '../../src/online/ui/sabwords.js';

const STEP = 1 / 60, EPS = 1e-6;
const TYPES = ['sab:charge', 'sab:sent', 'sab:warn', 'sab:wait', 'sab:land', 'sab:end', 'sab:drop'];
const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const shown = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;

/** Every page logs its sab:* events (with the played clock) and can be kept alive (`keep` = squad floor). */
const arm = (...ps) => Promise.all(ps.map((p) => p.ev((T) => {
  const g = window.__game;
  if (window.__sab) return;
  const L = (window.__sab = { log: [], keep: 0 });
  for (const type of T) g.events.on(type, (e) => L.log.push({ ...e, type, t: g.versus ? Math.round(g.versus.t * 1e4) / 1e4 : 0, clock: g.versus && g.versus.link ? g.versus.link.clock() : 0 }));
  g.runMods.ext.push(() => { if (L.keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < L.keep) g.squad.setCount(L.keep, 'test'); } });
}, TYPES)));
const keep = (p, n) => p.ev((x) => { window.__sab.keep = x; }, n);
/** p takes big ones its rivals have not earned with a boss (the kinds tests load them with giveBig at zone 1). */
const trust = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.versus.sab.test.trust(true))));
const log = (p, from = 0) => p.ev((f) => window.__sab.log.slice(f), from);
const mark = (p) => p.ev(() => window.__sab.log.length);
const sabView = (p) => p.ev(() => ({ ...window.__game.versus.sab.view() }));
/** Clears p's sabotage and loads `code` (a normal one as a charge, a big one as the big one held). */
const load = (p, code) => p.ev((c) => { const s = window.__game.versus.sab; s.test.clear(); if (c > 10) s.test.giveBig(c); else s.test.give(c); return { ...s.view() }; }, code);
const cards = (p) => p.ev(() => [...document.querySelectorAll('.sab-warns .sab-warn')].map((c) => ({ head: c.querySelector('.sw-head').textContent, from: c.querySelector('.sw-from').textContent, code: Number(c.dataset.code) })));
const feed = (p) => p.ev(() => [...document.querySelectorAll('.sab-feed .sf-line')].map((e) => e.textContent));
const find = (list, fn) => list.find(fn) || null;
const wipe = (p) => p.ev(() => { window.__sab.keep = 0; window.__game.squad.setCount(0, 'horde'); });
/** A raw event as a page's sabotage would write it (sabdata.js sabEncode on codec.js tenths). */
const raw = (p, code, to) => p.ev(([c, t]) => { const l = window.__game.versus.link; l.sendEvent({ k: 's', a: c + 100 * Math.max(0, Math.floor(l.clock() * 10 + 1e-6)), to: t }); }, [code, to]);

/** Steps until `fn(list)` finds the entry in p's log after `from` (checked every 0.1 s). */
async function wait(duo, p, from, fn, seconds = 3) {
  const hit = await duo.play(seconds, async () => find(await log(p, from), fn), 1);
  return hit || find(await log(p, from), fn);
}
const landsRight = (w, l) => !!(w && l) && l.t - w.t >= 1 - EPS && l.t - w.t <= 1 + STEP + EPS;

async function match(duo, names = ['Ann', 'Ben'], opts = {}) {
  const A = await duo.page('A', opts), B = await duo.page('B', opts);
  await duo.lobby(A, B, names);
  await arm(A, B);
  await bots(A, B);
  await duo.ready(A, B);
  await duo.go(A, B);
  await keep(A, 100); await keep(B, 100);
  await duo.play(8, async () => (await A.view()).t >= 3 && (await B.view()).t >= 3);
  return [A, B];
}

/** A clicks its SABOTAGE button with `code` loaded; B gets the warning, then the landing. Returns { sent, w, l, cards }. */
async function sendAndLand(duo, A, B, code, { shot = null, ok } = {}) {
  const ma = await mark(A), mb = await mark(B);
  const v = await load(A, code);
  ok(v.can, `A cannot send ${code}: ${JSON.stringify(v)}`);
  await duo.step(); // (the button shows the charge)
  await A.click('.sab-btn');
  const sent = find(await log(A, ma), (e) => e.type === 'sab:sent');
  ok(sent && sent.code === code, `A's tap did not send ${code}: ${JSON.stringify(await log(A, ma))}`);
  const w = await wait(duo, B, mb, (e) => e.type === 'sab:warn' && e.code === code);
  ok(w, `B never got ${code}: ${JSON.stringify(await log(B, mb))}`);
  const cs = await cards(B);
  if (shot) await B.shot(shot);
  const l = await wait(duo, B, mb, (e) => e.type === 'sab:land' && e.id === w.id);
  return { sent, w, l, cards: cs, feedA: await feed(A) };
}

export const scenarios = [
  {
    name: 'each of the 7 kinds A -> B: warning words on B, feed on A, lands 1.0 s after receipt',
    async run(duo, { ok, eq, note }) {
      const [A, B] = await match(duo);
      await trust(B);
      for (const code of [1, 2, 3, 4, 5, 11, 12]) {
        await duo.play(5.2); // (B takes one sabotage per 5 s from one sender)
        const k = sabKind(code);
        const r = await sendAndLand(duo, A, B, code, { shot: `warn-${code}`, ok });
        note(`${k.name}: B received at t ${r.w.t}, landed at ${r.l && r.l.t} (+${r.l && Math.round((r.l.t - r.w.t) * 1000) / 1000} s) count ${r.l && r.l.count} dur ${r.l && r.l.dur}`);
        ok(r.cards.some((c) => c.head === k.head && c.from === 'FROM ANN'), `B's screen for ${k.name}: ${JSON.stringify(r.cards)}`);
        ok(r.feedA.includes(sentWords(code, ['Ben'])), `A's feed for ${k.name}: ${JSON.stringify(r.feedA)}`);
        ok(landsRight(r.w, r.l), `${k.name} did not land 1.0 s after receipt: ${JSON.stringify([r.w, r.l])}`);
        if (code === 5) {
          const [fv, ice] = [await sabView(B), await B.has('.sab-ice:not(.hidden)')];
          ok(fv.frozen > 1.5 && ice && /FROZEN!/.test(await B.text('.sab-ice')), `B frozen: ${fv.frozen} s, frame ${ice}`);
          await B.shot('frozen');
        }
        if (code === 1) await A.shot('feed');
      }
      const drops = (await log(B)).filter((e) => e.type === 'sab:drop');
      eq(drops.map((e) => e.why), [], 'B dropped nothing');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'a real boss kill on A gives HORDE STORM; it lands on B',
    async run(duo, { ok, eq, note }) {
      const [A, B] = await match(duo);
      await A.ev(() => window.__game.debug.skipToBoss());
      ok(await duo.play(20, () => A.ev(() => { const g = window.__game; return g.run.phase === 'boss' && g.boss && g.boss.state === 'fight'; }), 1), 'A never reached the boss arena');
      const ma = await mark(A);
      await A.ev(() => window.__game.debug.killBoss());
      ok(await duo.play(20, () => A.ev(() => window.__game.endless.zone >= 2 && window.__game.run.phase === 'run'), 1), 'A never got back on the road');
      const ch = (await log(A, ma)).filter((e) => e.type === 'sab:charge' && e.source === 'boss');
      const v = await sabView(A);
      ok(ch.length === 1 && v.big === 11, `the boss gave ${JSON.stringify(ch)} / big ${v.big}`);
      ok(await A.has('.sab-btn.big .sb-big') && (await feed(A)).includes(BIG_WORDS), `A's button / feed: ${await A.ev(() => document.querySelector('.sab-btn').className)} ${JSON.stringify(await feed(A))}`);
      await A.shot('big-ready');
      await duo.play(6, async () => (await sabView(A)).can, 1);
      const mb = await mark(B);
      await A.click('.sab-btn');
      const w = await wait(duo, B, mb, (e) => e.type === 'sab:warn' && e.code === 11);
      ok(w && w.big, `B's warning: ${JSON.stringify(await log(B, mb))}`);
      ok((await cards(B)).some((c) => c.head === 'HORDE STORM!'), 'HORDE STORM! is not on B\'s screen');
      await B.shot('storm');
      const l = await wait(duo, B, mb, (e) => e.type === 'sab:land' && e.id === w.id);
      note(`storm on B: ${JSON.stringify(l)}`);
      ok(landsRight(w, l) && l.count >= 4, `the storm on B: ${JSON.stringify([w, l])}`);
      const sent = find(await log(A, ma), (e) => e.type === 'sab:sent' && e.big);
      eq(sent && sent.to, [await B.ev(() => window.__game.versus.link.slot)], 'the big one went to every rival');
    },
  },
  {
    name: 'spam: three raw events from A inside 2 s -> B applies one, drops two as spam',
    async run(duo, { ok, eq }) {
      const [A, B] = await match(duo);
      const bSlot = await B.ev(() => window.__game.versus.link.slot);
      const mb = await mark(B);
      for (let i = 0; i < 3; i++) { await raw(A, 2, bSlot); await duo.play(0.7); }
      await duo.play(2);
      const L = await log(B, mb);
      eq([L.filter((e) => e.type === 'sab:warn').length, L.filter((e) => e.type === 'sab:land').length, L.filter((e) => e.type === 'sab:drop').map((e) => e.why)], [1, 1, ['spam', 'spam']], 'B: warned, landed, dropped');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'in flight when the receiver falls: nothing lands, the verdict is right on both screens',
    async run(duo, { ok, eq }) {
      const [A, B] = await match(duo);
      const mb = await mark(B);
      await load(A, 1);
      await duo.step();
      await A.click('.sab-btn');
      await duo.play(0.5);
      const L0 = await log(B, mb);
      ok(L0.some((e) => e.type === 'sab:warn') && !L0.some((e) => e.type === 'sab:land'), `B 0.5 s after the send: ${JSON.stringify(L0)}`);
      await wipe(B);
      const done = await duo.play(30, async () => { const vs = [await A.view(), await B.view()]; return shown(vs[0]) && shown(vs[1]) ? vs : null; });
      ok(done, 'no result on both pages');
      const L = await log(B, mb);
      eq(L.filter((e) => e.type === 'sab:land').length, 0, 'something landed on a fallen squad');
      ok(L.some((e) => e.type === 'sab:drop' && e.why === 'off'), `the pending one was not dropped: ${JSON.stringify(L)}`);
      eq([done[0].result.result, done[0].ribbon, done[1].result.result, done[1].ribbon], ['win', 'YOU WIN!', 'lose', 'YOU LOSE'], 'the screens');
      eq(await B.ev(() => window.__game.runMods.holdFn), null, 'a hold is left on B');
    },
  },
  {
    name: 'reconnect: B offline 6 s while A sends 2 -> each applies at most once; a later blip replays nothing',
    async run(duo, { ok, eq, note }) {
      const [A, B] = await match(duo);
      const bSlot = await B.ev(() => window.__game.versus.link.slot);
      const mb = await mark(B);
      await B.offline(true);
      await duo.play(0.5);
      await load(A, 2); await duo.step(); await A.click('.sab-btn');
      await duo.play(5);
      await load(A, 4); await duo.step(); await A.click('.sab-btn');
      await duo.play(0.4);
      eq((await log(B, mb)).filter((e) => e.type === 'sab:warn').length, 0, 'B heard something while offline');
      await B.offline(false);
      await duo.play(4);
      const L = await log(B, mb), warns = L.filter((e) => e.type === 'sab:warn'), lands = L.filter((e) => e.type === 'sab:land'), drops = L.filter((e) => e.type === 'sab:drop');
      note(`after the return: warns ${warns.map((e) => e.code)}, lands ${lands.map((e) => e.code)}, drops ${drops.map((e) => `${e.code}:${e.why}`)}`);
      ok(warns.length + drops.filter((e) => e.why === 'old' || e.why === 'spam').length >= 1 && warns.length <= 2, `B on return: ${JSON.stringify(L)}`);
      ok(new Set(lands.map((e) => e.id)).size === lands.length && lands.length === warns.length && lands.every((l) => landsRight(warns.find((w) => w.id === l.id), l)), `landings: ${JSON.stringify(L)}`);
      eq(drops.filter((e) => !['old', 'spam', 'dup'].includes(e.why)).map((e) => e.why), [], 'other drops');
      // a second blip: the listeners re-attach and replay the events; nothing applies again
      const m2 = await mark(B);
      await B.offline(true); await duo.play(1); await B.offline(false); await duo.play(3);
      const L2 = await log(B, m2);
      eq(L2.filter((e) => e.type === 'sab:warn' || e.type === 'sab:land').length, 0, `a blip replayed a sabotage: ${JSON.stringify(L2)}`);
      ok((await B.view()).live && bSlot != null, 'B is still in the match');
    },
  },
  {
    name: 'three pages: a normal one hits the largest squad, a big one hits both; a fallen page sends nothing',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B'), C = await duo.page('C', { size: [360, 640] });
      await duo.signIn(A, 'Ann'); await duo.signIn(B, 'Ben'); await duo.signIn(C, 'Cyd');
      // (the friend screens make 2-seat rooms in this stage; the room record and the rules take 4: A's room is made with 4)
      await A.ev(() => { const tp = window.__game.online.flow.transport, set = tp.set; tp.set = function set4(p, v) { return set.call(this, p, /^rooms\/[A-Z]{4}$/.test(p) && v && v.max === 2 ? { ...v, max: 4 } : v); }; });
      const code = await duo.create(A);
      await duo.join(B, code);
      await duo.join(C, code);
      await duo.until(async () => { const v = await A.view(); return v.room && v.room.seats.filter(Boolean).length === 3; }, 'three seats on the host page');
      await arm(A, B, C);
      await bots(A, B, C);
      await duo.ready(A, B, C);
      await duo.go(A, B, C);
      await keep(A, 100); await keep(B, 160); await keep(C, 60);
      await duo.play(10, async () => { const v = await A.view(); return v.t >= 4 && v.peers.every((p) => p.n > 0); });
      const peersA = (await A.view()).peers;
      note(`A sees ${JSON.stringify(peersA.map((p) => [p.name, p.n]))}`);
      const [mb, mc] = [await mark(B), await mark(C)];
      const r = await sendAndLand(duo, A, B, 2, { ok });
      ok(landsRight(r.w, r.l), 'FOG on Ben (the largest squad)');
      eq(r.sent.names, ['Ben'], 'the normal one went to');
      eq((await log(C, mc)).filter((e) => e.type === 'sab:warn').length, 0, 'Cyd got the normal one');
      await duo.play(6);
      await trust(B, C);
      const [mb2, mc2] = [await mark(B), await mark(C)];
      await load(A, 12); await duo.step(); await A.click('.sab-btn');
      const wb = await wait(duo, B, mb2, (e) => e.type === 'sab:warn' && e.code === 12);
      const wc = await wait(duo, C, mc2, (e) => e.type === 'sab:warn' && e.code === 12);
      const lb = await wait(duo, B, mb2, (e) => e.type === 'sab:land' && e.code === 12);
      const lc = await wait(duo, C, mc2, (e) => e.type === 'sab:land' && e.code === 12);
      ok(landsRight(wb, lb) && landsRight(wc, lc), `BLACKOUT on both: ${JSON.stringify([wb, lb, wc, lc])}`);
      await C.shot('blackout');
      // Cyd falls: the button goes, nothing Cyd sends after that arrives
      await wipe(C);
      await duo.play(1.5);
      ok(!(await C.has('.sab-btn')), 'the fallen page still shows its button');
      const sendC = await C.ev(() => window.__game.versus.sab.send());
      eq([sendC.ok, sendC.why], [false, 'off'], 'a fallen page sends');
      const [ma3, mb3] = [await mark(A), await mark(B)];
      const aSlot = await A.ev(() => window.__game.versus.link.slot);
      await raw(C, 1, aSlot); await raw(C, 11, -1);
      await duo.play(3);
      const got = [...(await log(A, ma3)), ...(await log(B, mb3))];
      note(`after Cyd fell: ${JSON.stringify(got.filter((e) => e.type !== 'sab:charge'))}`);
      eq(got.filter((e) => e.type === 'sab:warn' || e.type === 'sab:land').length, 0, 'what Cyd sent after falling arrived');
      ok((await A.view()).live && (await B.view()).live, 'A and B play on');
    },
  },
  {
    name: 'bad network on both (lat400, jit300, loss5) at 390x844: every landing at receipt + 1.0 s, nothing twice',
    async run(duo, { ok, eq, note }) {
      const net = 'lat400,jit300,loss5';
      const [A, B] = await match(duo, ['Ann', 'Ben'], { size: [390, 844], net });
      const [ma, mb] = [await mark(A), await mark(B)];
      const kinds = [1, 4, 2, 5];
      for (const [i, code] of kinds.entries()) {
        await duo.play(i ? 6.2 : 0.2);
        const [from, to] = i % 2 ? [B, A] : [A, B];
        await load(from, code); await duo.step(); await from.click('.sab-btn');
      }
      await duo.play(4);
      for (const [p, n] of [[A, ma], [B, mb]]) {
        const L = await log(p, n), warns = L.filter((e) => e.type === 'sab:warn'), lands = L.filter((e) => e.type === 'sab:land');
        note(`${p.pid}: warns ${warns.map((e) => `${e.code}@${e.t}`)} lands ${lands.map((e) => `${e.code}@${e.t}`)} drops ${L.filter((e) => e.type === 'sab:drop').map((e) => e.why)}`);
        eq(warns.length, 2, `${p.pid} received`);
        eq(new Set(lands.map((e) => e.id)).size, lands.length, `${p.pid}: one landed twice`);
        ok(lands.length === 2 && lands.every((l) => landsRight(warns.find((w) => w.id === l.id), l)), `${p.pid}: landings ${JSON.stringify(L)}`);
      }
      await A.shot('net'); await B.shot('net');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
];
