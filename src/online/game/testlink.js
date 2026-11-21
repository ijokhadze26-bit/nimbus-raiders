// A scripted in-page LINK (STAGE1 "the LINK"): no network. For the on1-* tests, the calibration script, screenshots
// and, later, the practice bot. It implements exactly what src/online/match.js gives the game:
//   { seed, slot, peers, ranked, clock(), push(s), fall(out), sendEvent(e), on(type, cb) -> off, leave(), tick() }
// plus `link.test`, the hooks a test uses to make a rival fall, go silent or to deliver a verdict by hand.
//
// createTestLink(opts):
//   seed, slot (0), ranked (false)
//   clock: 'sim' (default: the match clock IS the simulated time of the match, opts.game.versus.simT, so a test that
//          steps the game by hand never waits and never catches up) | 'real' (performance.now(), GO after
//          opts.countdown seconds) | a function returning seconds since GO
//   rivals: [{ slot, name, hero, weapon, heroSkin, weaponSkin, tr, bot, fallAt (s, Infinity = never), lag (0.12 s),
//             flush (0.25 s), curve(t) -> { dist, n, x, form, boss, zone, flags, danger } }]
//           default curve: a plausible run (9.3 u/s, a squad that grows, weaving lanes, collapsing before fallAt)
//   mirror: true = every sendEvent of mine comes back as an event from rivals[0] after its `lag` (calibration: a
//           rival of equal skill sends what I earn)
//   referee: true (default) = decide the verdict here with the rules of SPEC4 §5.6 (ranking time, 1 s tie window,
//            further distance wins a tie, equal distance = draw); false = only link.test.verdict() ends a match.
// A scripted rival is sampled 10 times a second on the match clock and delivered in bundles like the real thing
// (newest sample + `xs`), `lag` seconds late.
// Sabotage (STAGE2): test.sab(slot, code, { lag, sent, to }) = that rival sends one now, delivered as 'event' from
// tick() once clock() >= sent + lag; test.dupe(e) re-delivers a delivered event (a replay); test.events records mine.
import { sabEncode, sabBig } from './sabdata.js';

const TIE = 1.0, SAMPLE = 0.1;

export function defaultCurve(fallAt = Infinity, phase = 0) {
  return (t) => {
    const left = fallAt - t;
    let n = Math.round(6 + 170 * (1 - Math.exp(-t / 45)));
    let danger = 0;
    if (left < 7) { const f = Math.max(0, left / 7); n = Math.max(1, Math.round(n * f * f)); danger = Math.min(9, Math.round(9 * (1 - f))); }
    return { dist: 9.3 * t, n, x: 2.6 * Math.sin(t * 0.55 + phase) + 0.5 * Math.sin(t * 1.9), form: 0, boss: 0, zone: 1 + Math.floor((9.3 * t) / 700), flags: 0, danger };
  };
}

export function createTestLink(opts = {}) {
  const listeners = { state: [], out: [], peer: [], verdict: [], event: [], status: [] };
  const emit = (type, ...a) => { for (const cb of listeners[type].slice()) cb(...a); };
  const game = opts.game || (typeof window !== 'undefined' ? window.__game : null);
  let t0 = 0, manual = null;
  const clock = typeof opts.clock === 'function' ? opts.clock
    : opts.clock === 'real' ? () => (performance.now() - t0) / 1000
      : () => (manual != null ? manual : (game && game.versus ? game.versus.simT : 0));
  if (opts.clock === 'real') t0 = performance.now() + (opts.countdown ?? 3) * 1000;

  const rivals = (opts.rivals || []).map((r, i) => ({
    slot: r.slot ?? i + 1, name: r.name || 'Rival ' + (i + 1), hero: r.hero || 'pip', weapon: r.weapon || 'thunderclap',
    heroSkin: r.heroSkin || null, weaponSkin: r.weaponSkin || null, tr: r.tr | 0, bot: r.bot !== false,
    fallAt: r.fallAt ?? Infinity, lag: r.lag ?? 0.12, flush: r.flush ?? 0.25,
    curve: r.curve || defaultCurve(r.fallAt ?? Infinity, i * 1.7),
    next: 0, lastFlush: 0, q: 0, xs: [], out: null, silent: false, last: null,
  }));
  const outbox = [], delivered = [];
  const test = { delivered, sent: [], pushed: 0, lastT: 0, falls: [], events: [], verdicts: [], ticks: 0, left: false, mine: null, done: false };
  const mySlot = opts.slot | 0;

  function decide() {
    if (opts.referee === false || test.done || !rivals.length) return;
    const alive = rivals.filter((r) => !r.out);
    if (!test.mine) {
      // I am alive: I win once every rival is out and I have outlived the last of them by the tie window
      if (alive.length) return;
      let lastT = 0;
      for (const r of rivals) lastT = Math.max(lastT, r.out.T);
      if (test.lastT > lastT + TIE) finish(null, null);
      return;
    }
    // I fell: every rival still alive must first pass my time by the tie window (it then beat me) or fall
    for (const r of alive) if (!r.last || r.last.t <= test.mine.T + TIE) return;
    finish(null, test.mine);
  }

  function finish(forced, me, reason) {
    if (test.done) return;
    const rows = rivals.map((r) => ({ slot: r.slot, T: r.out ? r.out.T : Infinity, d: r.out ? r.out.d : Infinity, by: r.out ? r.out.by : null }));
    rows.push({ slot: mySlot, T: me ? me.T : Infinity, d: me ? me.d : Infinity, by: me ? me.by : null });
    rows.sort((a, b) => b.T - a.T);
    // only first place uses the tie rule: within 1 s of the best time, the further distance wins; equal = draw
    let result = forced;
    if (rows.length > 1 && rows[0].T - rows[1].T <= TIE && Number.isFinite(rows[0].T)) {
      const top = rows.filter((r) => rows[0].T - r.T <= TIE).sort((a, b) => b.d - a.d);
      const rest = rows.filter((r) => rows[0].T - r.T > TIE);
      rows.length = 0; rows.push(...top, ...rest);
      if (!forced && top[0].d === top[1].d && (top[0].slot === mySlot || top[1].slot === mySlot)) result = 'draw';
    }
    const place = rows.findIndex((r) => r.slot === mySlot) + 1;
    if (!result) result = place === 1 ? 'win' : 'lose';
    const places = rows.map((r) => ({ slot: r.slot, T: Number.isFinite(r.T) ? r.T : null, d: Number.isFinite(r.d) ? r.d : null, by: r.by }));
    test.verdict({ result, place, places, reason: reason || (me && me.by === 'quit' ? 'quit' : null) });
  }

  function rivalOut(r, o) {
    if (r.out || test.done) return;
    r.out = { T: o.T ?? o.t ?? clock(), d: Math.round(o.d ?? r.curve(o.T ?? clock()).dist), by: o.by || 'dead' };
    emit('out', r.slot, { ...r.out });
    decide();
  }

  const link = {
    seed: (opts.seed ?? 1) >>> 0,
    slot: mySlot,
    peers: rivals.map(({ slot, name, hero, weapon, heroSkin, weaponSkin, tr, bot }) => ({ slot, name, hero, weapon, heroSkin, weaponSkin, tr, bot })),
    ranked: !!opts.ranked,
    clock,
    push(s) {
      test.pushed++; test.lastT = s.t;
      test.sent.push(s);
      if (test.sent.length > 800) test.sent.splice(0, 400);
    },
    fall(out) {
      test.falls.push(out);
      if (!test.mine) test.mine = { T: out.t, d: out.d, by: out.by };
      decide();
    },
    sendEvent(e) {
      test.events.push(e);
      const r = rivals[0];
      if (opts.mirror && r && !r.out && e) outbox.push({ at: clock() + r.lag, e: { k: e.k, a: e.a, to: e.to === -1 ? -1 : mySlot, f: r.slot, q: ++r.q } });
    },
    on(type, cb) {
      if (!listeners[type]) throw new Error('testlink: unknown event ' + type);
      listeners[type].push(cb);
      return () => { const i = listeners[type].indexOf(cb); if (i >= 0) listeners[type].splice(i, 1); };
    },
    leave() { test.left = true; for (const k in listeners) listeners[k].length = 0; },
    /** Called by the game every frame / step: moves the scripted rivals up to the match clock. */
    tick() {
      test.ticks++;
      if (test.left) return;
      const now = clock();
      for (const r of rivals) {
        if (r.out) continue;
        const upTo = Math.min(now - r.lag, r.fallAt);
        while (!r.silent && r.next <= upTo) {
          const t = r.next;
          r.last = { t, charge: 0, ...r.curve(t) };
          r.xs.push(r.last.x);
          r.next = Math.round((t + SAMPLE) * 10) / 10;
          if (t - r.lastFlush >= r.flush - 1e-6 || t === 0) {
            r.lastFlush = t;
            emit('state', r.slot, { ...r.last, xs: r.xs.slice() });
            r.xs.length = 0;
          }
        }
        if (now - r.lag >= r.fallAt) rivalOut(r, { T: r.fallAt, d: r.curve(r.fallAt).dist, by: 'dead' });
      }
      for (let i = 0; i < outbox.length; i++) {
        if (outbox[i].at > now + 1e-9) continue;
        const { e } = outbox.splice(i--, 1)[0];
        if (e.to !== -1 && e.to !== mySlot) continue; // routed like match.js: only mine or everyone's
        delivered.push(e);
        emit('event', { ...e });
        if (test.left) return;
      }
      decide();
    },
    test,
  };

  // ---- test hooks ----
  /** A rival falls now (or at o.T): 'out' goes to the game and the referee decides. */
  test.rivalFall = (slot, o = {}) => { const r = rivals.find((x) => x.slot === slot) || rivals[0]; if (r) rivalOut(r, { T: o.T ?? Math.max(0, clock() - r.lag), d: o.d, by: o.by || 'dead' }); };
  /** A rival stops sending (silent seconds) and, with countdown, shows the disconnect countdown; null clears it. */
  test.silence = (slot, silent = 3, countdown = null) => {
    const r = rivals.find((x) => x.slot === slot) || rivals[0];
    if (!r) return;
    r.silent = silent > 0;
    if (!r.silent) r.next = Math.max(r.next, Math.round(Math.max(0, clock() - r.lag) * 10) / 10);
    emit('peer', r.slot, { silent, countdown });
  };
  /** Delivers a verdict by hand ({ result, place, places, reason }); a match gets exactly one, except that a
   *  verdict marked `revised: true` may follow a provisional one (as src/online/match.js does). */
  test.verdict = (v) => { if (test.done && !(v && v.revised)) return; test.done = true; test.verdicts.push(v); emit('verdict', v); };
  test.status = (s) => emit('status', s);
  test.event = (e) => emit('event', e);
  /** 'sim' clock only: freeze the match clock at a value (null = follow the game again). */
  test.setClock = (v) => { manual = v; };
  test.rivals = rivals;
  /** Rival `slot` sends sabotage `code` now (sent = its match clock at send; big ones go to -1). Returns the event. */
  test.sab = (slot, code, o = {}) => {
    const r = rivals.find((x) => x.slot === slot) || rivals[0];
    const sent = o.sent ?? clock();
    const e = { k: 's', a: sabEncode(code, sent), to: o.to ?? (sabBig(code) ? -1 : mySlot), f: r ? r.slot : slot, q: r ? ++r.q : 0 };
    outbox.push({ at: sent + (o.lag || 0), e });
    return e;
  };
  /** Re-delivers a delivered event (default: the last one), as a re-attached listener would replay it. */
  test.dupe = (e = delivered[delivered.length - 1]) => { if (e) emit('event', { ...e }); };
  return link;
}
