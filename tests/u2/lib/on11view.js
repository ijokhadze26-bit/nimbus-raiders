// The scenario of tests/u2/on11-view.js and on11-view-small.js (online stage 5, builder WATCH): the watch cards
// (src/online/ui/watchcards.js) on the fake listen link (on11link.js) with 4, 3 and 2 players, at whatever size the
// page has. Mid-match with one in danger, one at a boss, one LOST CONNECTION, one fallen with an emote and a full
// feed; the final table; a fallen me (mode 'fallen') with 3; a draw for first with 2. No network at all.
import { createWatch, WATCH } from '/src/online/game/watch.js';
import { mountWatchView } from '/src/online/ui/watchview.js';
import { createFakeLink } from '/tests/u2/lib/on11link.js';
import { fixture, step, idle, fits, bottom, shot, wait } from '/tests/u2/lib/on11kit.js';
import { defaultCurve } from '/src/online/game/testlink.js';
import { SAB } from '/src/online/game/sabdata.js';

const NAMES = [{ name: 'Ann', tr: 120 }, { name: 'Benjamin Rex', tr: 740 }, { name: 'Cyd', tr: 2300 }, { name: 'Dot', tr: 1900 }];
const roster = (n) => NAMES.slice(0, n).map((r, i) => ({ slot: i, ...r }));

export async function viewScenario(g) {
  const fails = [], notes = [];
  g.ui.nav('title');
  await wait(300);
  const size = `${innerWidth}x${innerHeight}`;
  const small = innerHeight < 700;

  // ------------------------------------------------------------ 4 players, spectator, mid-match
  {
    const link = createFakeLink({ players: roster(4).map((r, i) => ({ ...r, fallAt: i === 3 ? 12 : Infinity })) });
    const watch = createWatch({ link, roster: roster(4) });
    const fx = fixture('spectator');
    const view = mountWatchView(fx.host, watch, { mode: 'spectator' });
    step(link, watch, view, 9);
    link.test.set(1, { danger: 6 });
    link.test.set(2, { flags: 1, boss: 0.62 });
    link.test.sab(0, SAB.code.fog, 1);
    link.test.sab(2, SAB.code.blackout, -1);
    link.test.emote(1, 3);
    step(link, watch, view, 13);
    link.test.silence(0, true);
    link.test.sab(1, SAB.code.freeze, 2);
    link.test.sab(0, SAB.code.red, 3);
    step(link, watch, view, 16.5);
    link.test.sab(2, SAB.code.speed, 0);
    link.test.emote(3, 1);
    step(link, watch, view, 17.5);
    view.test.flush();
    const r = view.test.read();
    const c = (s) => r.cards.find((x) => x.slot === s);
    if (r.cards.length !== 4) fails.push(`4: ${r.cards.length} cards`);
    if (!/^0:1[67]$/.test(r.clock)) fails.push(`4: clock ${r.clock}`);
    if (!c(0).cls.includes('silent')) fails.push(`4: ANN should be LOST CONNECTION (${c(0).cls})`);
    if (!c(1).cls.includes('danger') || c(1).danger !== 6) fails.push(`4: BEN not in danger (${c(1).cls}, ${c(1).danger})`);
    if (!c(2).cls.includes('boss')) fails.push(`4: CYD not at a boss (${c(2).cls})`);
    if (!c(3).cls.includes('down') || c(3).place !== '4TH' || !/^0:12\.0 · 111m$/.test(c(3).res)) fails.push(`4: DOT fallen card ${JSON.stringify(c(3))}`);
    if (!c(3).emote) fails.push('4: DOT emote bubble missing');
    if (r.feed.length !== WATCH.feedMax) fails.push(`4: feed has ${r.feed.length} lines`);
    if (!r.feed.includes('DOT · HA HA')) fails.push(`4: feed ${JSON.stringify(r.feed)}`);
    if (!r.feed.some((l) => /^CYD → EVERYONE · /.test(l))) fails.push(`4: no EVERYONE line ${JSON.stringify(r.feed)}`);
    if (r.table) fails.push('4: a table before final');
    const lost = fx.host.querySelector('.wv-card[data-slot="0"] .wv-lost');
    if (!lost || !lost.getClientRects().length) fails.push('4: LOST CONNECTION not visible');
    fits(fx.el, fails, `4 mid ${size}`);
    const b = bottom(fx.host);
    if (b > innerHeight - 70) fails.push(`4 mid: the cards + feed end at ${Math.round(b)} (page ${innerHeight}: no room for LEAVE)`);
    notes.push({ mid4: r, bottom: Math.round(b) });
    await shot('on11-wv4-mid');

    // the end: CYD, then BEN fall; ANN (silent) gets her record from a standing... here the fake link judges it
    link.test.silence(0, false);
    step(link, watch, view, 20);
    link.test.fall(2);
    step(link, watch, view, 26);
    link.test.fall(0, { by: 'dc' });
    step(link, watch, view, 34);
    link.test.fall(1);
    step(link, watch, view, 34.5);
    if (!watch.final) fails.push('4: no final');
    idle(watch, view, WATCH.doneHoldMs / 1000 + 0.3);
    view.test.flush();
    const e = view.test.read();
    if (!e.table || e.table.length !== 4) fails.push(`4: final table ${JSON.stringify(e.table)}`);
    else {
      if (!/^1ST BENJAMIN REX STILL STANDING$/.test(e.table[0]) || !/^2ND ANN OFFLINE 0:26\.0 241m$/.test(e.table[1]) || !/^3RD CYD/.test(e.table[2]) || !/^4TH DOT/.test(e.table[3])) fails.push(`4: table order ${JSON.stringify(e.table)}`);
      if (e.head !== 'BENJAMIN REX WINS!') fails.push(`4: head ${e.head}`);
    }
    if (!fx.host.querySelector('.wv-rows li.gold[data-slot="1"]')) fails.push('4: winner row not gold');
    if (!/WAITING FOR THE NEXT MATCH/.test(fx.host.textContent)) fails.push('4: no WAITING FOR THE NEXT MATCH');
    fits(fx.el, fails, `4 final ${size}`);
    const b2 = bottom(fx.host);
    if (b2 > innerHeight - 70) fails.push(`4 final: ends at ${Math.round(b2)}`);
    notes.push({ final4: e, bottom: Math.round(b2) });
    await shot('on11-wv4-final');
    view.dispose(); watch.dispose(); fx.remove();
    if (link.test.listeners() !== 0) fails.push(`4: ${link.test.listeners()} listeners left after dispose`);
  }

  // ------------------------------------------------------------ 3 players, I fell (mode 'fallen', inside a result panel)
  {
    const link = createFakeLink({ slot: 2, players: roster(3).map((r, i) => ({ ...r, fallAt: i === 2 ? 11 : Infinity })) });
    link.test.to(11.2);
    const watch = createWatch({ link, roster: roster(3) });
    const fx = fixture('fallen');
    const view = mountWatchView(fx.host, watch, { mode: 'fallen', mySlot: 2 });
    step(link, watch, view, 14);
    link.test.emote(2, 0);
    link.test.sab(0, SAB.code.fog, 1);
    step(link, watch, view, 16);
    view.test.flush();
    const r = view.test.read();
    const me = r.cards.find((x) => x.slot === 2);
    if (r.cards.length !== 3) fails.push(`3: ${r.cards.length} cards`);
    if (me.name !== 'YOU' || !me.cls.includes('down') || me.place !== '3RD') fails.push(`3: my card ${JSON.stringify(me)}`);
    if (!r.feed.includes('YOU · THUMBS UP')) fails.push(`3: feed ${JSON.stringify(r.feed)}`);
    const cards = [...fx.host.querySelectorAll('.wv-card')].map((n) => n.getBoundingClientRect());
    if (cards.length === 3 && Math.abs((cards[2].left + cards[2].right) / 2 - (cards[0].left + cards[1].right) / 2) > 3) fails.push('3: the third card is not centred under the two');
    fits(fx.el, fails, `3 fallen ${size}`);
    notes.push({ fallen3: r });
    await shot('on11-wv3-fallen');
    // fallen mode never shows the table (the result screen does)
    link.test.fall(0); link.test.fall(1);
    idle(watch, view, 2);
    view.test.flush();
    if (view.test.read().table) fails.push('3: the fallen mode drew a table');
    view.dispose(); watch.dispose(); fx.remove();
  }

  // ------------------------------------------------------------ 2 players, a draw for first (equal metres inside 1 s)
  {
    const flat = (fallAt, ph) => { const c = defaultCurve(fallAt, ph); return (t) => ({ ...c(t), dist: 9.3 * Math.min(t, 30) }); };
    const link = createFakeLink({ players: roster(2).map((r, i) => ({ ...r, fallAt: i === 0 ? 40 : 40.5, curve: flat(i === 0 ? 40 : 40.5, i) })) });
    const watch = createWatch({ link, roster: roster(2) });
    const fx = fixture('spectator');
    const view = mountWatchView(fx.host, watch, { mode: 'spectator' });
    step(link, watch, view, 25);
    view.test.flush();
    const cards = [...fx.host.querySelectorAll('.wv-card')].map((n) => n.getBoundingClientRect());
    if (cards.length !== 2 || Math.abs(cards[0].top - cards[1].top) > 1) fails.push('2: the cards are not side by side');
    await shot('on11-wv2-mid');
    step(link, watch, view, 41);
    idle(watch, view, WATCH.doneHoldMs / 1000 + 0.3);
    view.test.flush();
    const e = view.test.read();
    if (!watch.draw || e.head !== 'IT IS A DRAW!' || !e.table || !e.table.every((l) => l.startsWith('='))) fails.push(`2: draw ${JSON.stringify({ draw: watch.draw, head: e.head, table: e.table })}`);
    fits(fx.el, fails, `2 draw ${size}`);
    notes.push({ draw2: e });
    await shot('on11-wv2-draw');
    view.dispose(); watch.dispose(); fx.remove();
  }

  return { pass: fails.length === 0, fails, size, small, notes };
}
