// The LINK: the one object that crosses between the network side and the game side (STAGE1.md).
//
// TICKING: match.js runs its OWN timer (every 50 ms) and ALSO exposes link.tick(nowMs?). Everything
// is driven by the server-synced clock, so calling tick() more often is harmless: GAME may call
// `link.tick?.()` every frame for tighter timing, and the two-page harness calls it after each step
// of its virtual clock. Heartbeats therefore keep going when a hidden tab stops drawing frames.
//
// The link is a SUPERSET of STAGE1.md (nothing removed or renamed). Additions:
//   link.tick(nowMs?)            see above
//   link.mid / link.t0 / link.code / link.slots / link.flushMs / link.stats
//   decoded state `s` also has   seq, v, step (seconds between xs; 0.1 unless the sender had to thin a backlog)
//   'event' e also has           f (the sender's slot) and q (the sender's event counter)
//   'verdict' also has           void (true when a rival's stream was implausible: SPEC4 section 10),
//                                provisional, revised (see below)
//   'final' ({ places })         the whole ranking once it can no longer change (3-4 players, watchers)
//   verdict.reason is one of     'standing' | 'fell' | 'distance' | 'draw' | 'dc' | 'quit' | 'cap' | 'offline'
//                                ('dc' on a lose = my own connection was lost: show CONNECTION LOST)
//
// WHO IS IN THE MATCH comes from the match record (room.state.players), not from the room's seats, so
// every link has the same list. A watcher, or a seated player who is not in the record, gets a link
// that only listens ('state', 'out', 'event', 'final'); its `slot` is null.
//
// THE VERDICT is judged from the write-once fall records as the SERVER holds them. My own fall counts
// only once the server has answered my write (never my local copy or its guessed timestamp), and
// every played time is in whole tenths rounded down (codec.tenths), so two screens cannot disagree.
// A verdict is normally final. Twice it cannot be, and then it carries `provisional: true`:
//   - I fell while offline and 8 s have passed (reason 'offline');
//   - I fell and the last running rival went silent for 13 s (I can no longer close their seat: the
//     rules let only players who are still standing do that), so they are taken to have outlasted me.
// If the records settle later, ONE more 'verdict' follows with `provisional: false, revised: true`;
// it is the result that counts (and what stage 4 claims by).
//
// Winning needs my played clock 1.1 s past the last rival's ranking time (1.0 s tie window + one
// tenth), and the winner sends one last state straight away so the loser's screen can settle.

import { NET } from './config.js';
import { TS, realClock } from './transport.js';
import { encodeState, decodeState, tenths, SEQ_MOD } from './codec.js';
import { judge, finalPlaces, toRank, plausible } from './verdict.js';
import { censor } from './names.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The largest played time (tenths) the rules accept in a fall record written right now. */
const maxT10 = (now, ts0) => Math.min(NET.maxT10, Math.floor((now - ts0 - 2500) / 100) - 1);
const maxD = (t10) => Math.floor(40 + t10 * 1.8);

/** Reload / closed-tab path (SPEC4 5.7): on the next visit write my own fall for a match I left. */
export function quitOut(transport, { mid, slot, t = 0, d = 0, ts0 }) {
  const t10 = clamp(tenths(t), 0, ts0 ? Math.max(0, maxT10(transport.now(), ts0)) : NET.maxT10);
  return transport.set(`matches/${mid}/out/${slot}`, { t: t10, d: clamp(Math.round(d), 0, maxD(t10)), ts: TS, by: 'quit' })
    .then(() => true, () => false);
}

/**
 * createMatch({ transport, room, cfg, timer }) -> link
 *   room   a room.js room whose state has mid / t0 / seed / players (call this from room.on('start'))
 *   cfg    { flush2, flush4 } (session.cfg); defaults 250 / 500
 *   timer  { every(ms, fn) -> cancel }; the real setInterval by default (tests pass a virtual clock)
 */
export function createMatch({ transport: tp, room, cfg = {}, timer = realClock }) {
  const rs = room.state;
  if (!rs || !rs.mid || rs.t0 === null) throw new Error('createMatch: the room has no live match yet');
  const { code, mid, t0, seed } = rs;
  const ts0 = t0 - NET.goMs;                       // the match record's server timestamp
  const players = rs.players && rs.players.length ? rs.players : rs.seats.filter(Boolean);
  const mine = players.find((p) => p.uid === (room.uid ?? tp.uid));
  const me = mine ? mine.slot : null;
  const slots = players.map((p) => p.slot);
  const peers = players.filter((p) => p.slot !== me).map((s) => ({
    slot: s.slot, name: censor(s.n), hero: s.he, weapon: s.we, heroSkin: s.hs, weaponSkin: s.ws, tr: s.tr, bot: false,
  }));
  const flushMs = clamp(Number(slots.length <= 2 ? cfg.flush2 : cfg.flush4) || (slots.length <= 2 ? 250 : 500), 100, 2000);
  const R = `rooms/${code}`;
  const M = `matches/${mid}`;

  const handlers = new Map();
  const offs = [];
  const stats = { sent: 0, held: 0, thinned: 0, recv: 0, hb: 0 };
  // what I know about each rival (heard: nobody can have been silent since before this link existed)
  const born = Math.max(ts0, tp.now());
  const P = new Map(peers.map((p) => [p.slot, { slot: p.slot, heard: born, stateAt: 0, t10: 0, d: 0, str: null, last: null, out: null,
    hbA: 0, hbT: null, cd: null, tryAt: 0, closing: 0, suspect: false, gone: false }]));
  // out: what my listener shows for my seat; rec: my fall record once it is known to be the server's copy
  const my = { fell: false, t10: 0, d: 0, by: 'dead', acked: false, sure: false, out: null, rec: null, tries: 0, retryAt: 0, fellAt: 0, liveT10: -1 };
  const seenEv = new Set();

  let left = false, draining = false, given = null, finalSent = false; // given: null | 'provisional' | 'final'
  let buf = [], last = null, seq = 0, halvings = 0, stride = 1, skip = 0, evQ = 0;
  let nextFlush = 0, nextHb = 0, offAt = null, stopTimer = null, lastOuts = {};

  const emit = (type, ...args) => {
    if (left) return;
    for (const cb of [...(handlers.get(type) || [])]) { try { cb(...args); } catch (e) { console.error(e); } }
  };
  const quiet = (p) => { p.catch(() => {}); };
  const clock = () => (tp.now() - t0) / 1000;

  // ------------------------------------------------------------------ sending
  function flush(force) {
    if (!last || me === null) return;
    if (!force && (tp.pending() > 0 || tp.status() !== 'on')) { stats.held++; return; } // backpressure: keep collecting
    const str = encodeState(seq, last, buf, halvings);
    seq = (seq + 1) % SEQ_MOD;
    buf = []; halvings = 0; stride = 1; skip = 0;
    nextFlush = tp.now() + flushMs;
    stats.sent++;
    quiet(tp.set(`${R}/l/${me}`, str));
  }

  function heartbeat() {
    stats.hb++;
    quiet(tp.set(`${R}/hb/${me}`, { a: TS, t: clamp(my.fell ? my.t10 : Math.max(0, my.liveT10), 0, NET.maxT10) }));
  }

  function writeOut() {
    const cap = maxT10(tp.now(), ts0);
    if (cap < 0) { my.retryAt = tp.now() + NET.outRetryMs; return; } // quit inside the first seconds: the rules want a little real time first
    my.tries++;
    my.retryAt = 0;
    my.sure = false;
    const t10 = clamp(my.t10, 0, cap);
    // While the write is on its way my listener may show my own copy with a guessed timestamp (the real
    // SDK does). Once the server has answered - accepted or refused - what the listener shows for my seat
    // is the server's: its own timestamp, or a rival's forfeit that got there first. Only that decides.
    const settled = (ok) => () => {
      if (ok) my.acked = true;
      my.sure = true;
      if (my.out) { my.rec = my.out; evaluate(); } else if (!ok && my.tries < 8) my.retryAt = tp.now() + NET.outRetryMs;
    };
    tp.set(`${M}/out/${me}`, { t: t10, d: clamp(my.d, 0, maxD(t10)), ts: TS, by: my.by }).then(settled(true), settled(false));
  }

  function closeSeat(p, by, now) {
    if (now < p.tryAt) return;
    if (by === 'dc' && now - ts0 <= 13250) return; // the rules refuse a forfeit in the first 13 s of a match
    p.tryAt = now + 1000;
    const t10 = clamp(p.t10, 0, Math.max(0, maxT10(now, ts0)));
    // Until the server has answered, a record for this seat may only be my own unconfirmed write
    // (the real SDK shows it to my listeners at once): it must not decide anything yet.
    p.closing++;
    const settled = () => { p.closing--; if (!left) onOuts(lastOuts); };
    tp.set(`${M}/out/${p.slot}`, { t: t10, d: clamp(p.d, 0, maxD(t10)), ts: TS, by }).then(settled, settled);
  }

  // ------------------------------------------------------------------ receiving
  function onStates(all) {
    const now = tp.now();
    for (const p of P.values()) {
      const str = all[p.slot];
      if (!str || str === p.str) continue;
      p.str = str;
      const s = decodeState(str);
      if (!s) continue;
      const why = plausible(p.last, s, clock());
      if (why && !p.last) continue;          // left over from an earlier round in this room: not this match
      if (why) p.suspect = true;
      stats.recv++;
      p.last = s;
      p.heard = now;
      p.stateAt = now;
      p.t10 = Math.max(p.t10, Math.round(s.t * 10));
      p.d = Math.floor(s.dist) + ((s.flags & 1) && s.boss > 0 ? Math.floor(30 * (1 - s.boss)) : 0);
      emit('state', p.slot, s);
    }
    evaluate();
  }

  function onHeartbeats(all) {
    const now = tp.now();
    for (const p of P.values()) {
      const h = all[p.slot];
      if (!h || typeof h.a !== 'number' || h.a === p.hbA || h.a < ts0) continue;
      p.hbA = h.a;
      p.hbT = Number(h.t) || 0;
      p.heard = Math.max(p.heard, now);
      p.t10 = Math.max(p.t10, Math.round(p.hbT));
    }
    evaluate();
  }

  function onOuts(all) {
    lastOuts = all;
    for (const slot of slots) {
      const o = all[slot];
      const there = !!o && typeof o.ts === 'number';
      if (slot === me) { // null again if my write was refused
        my.out = there ? toRank(o, t0) : null;
        if (my.sure && my.out && !my.rec) my.rec = my.out;
        continue;
      }
      const p = P.get(slot);
      if (!there || p.closing > 0) continue;
      const rank = toRank(o, t0);
      const first = !p.out;
      p.out = rank;
      if (first) emit('out', slot, { T: rank.T, d: rank.d, by: rank.by });
    }
    evaluate();
  }

  function onEvent(v, key) {
    if (!v || seenEv.has(key) || v.f === me) return;
    seenEv.add(key);
    if (me !== null && v.to !== -1 && v.to !== me) return;
    emit('event', { k: v.k, a: v.a, to: v.to, f: v.f, q: v.q ?? 0 });
  }

  // ------------------------------------------------------------------ deciding
  function standing() {
    const outs = {};
    const liveT10 = {};
    let presumed = false;
    for (const p of P.values()) {
      if (p.out) outs[p.slot] = p.out;
      else if (p.gone) { liveT10[p.slot] = Infinity; presumed = true; } // silent and I cannot close them: they outlast me
      else liveT10[p.slot] = p.t10;
    }
    if (me !== null) {
      // Before my own fall a record in my seat can only be a rival's forfeit (the server's). After it,
      // only the confirmed record counts; until then I am neither fallen nor running: nothing is decided.
      const rec = my.rec || (my.fell ? null : my.out);
      if (rec) outs[me] = rec;
      else if (!my.fell) liveT10[me] = my.liveT10; // whole tenths, so 'past the window' already means 1.1 s (see the header)
    }
    return { me, slots, outs, liveT10, presumed };
  }

  function finish(v, provisional) {
    const first = given === null;
    given = provisional ? 'provisional' : 'final';
    if (first && v.result === 'win' && !my.fell) { flush(true); heartbeat(); } // tell the loser I am past the tie window
    emit('verdict', { ...v, void: [...P.values()].some((p) => p.suspect), provisional: !!provisional, revised: !first });
  }

  function evaluate() {
    if (left) return;
    const st = standing();
    if (me !== null && given !== 'final' && !(given === 'provisional' && st.presumed)) {
      const v = judge(st);
      if (v) finish(v, st.presumed);
    }
    if (!finalSent && !st.presumed) {
      const places = finalPlaces(st);
      if (places) { finalSent = true; emit('final', { places }); }
    }
  }

  // ------------------------------------------------------------------ the clock tick
  function tick(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : tp.now();
    if (draining) {
      if (my.acked || my.rec || my.tries >= 8 || now > my.fellAt + 6000) { stop(); return; }
      if (my.retryAt && now >= my.retryAt) writeOut();
      return;
    }
    if (left) return;
    const on = tp.status() === 'on';
    if (!on) {
      if (offAt === null) offAt = now;
    } else if (offAt !== null) {
      // my own gap must not count as their silence (but a catch-up message that just came in is not from the future)
      for (const p of P.values()) { p.heard = Math.min(now, p.heard + now - offAt); p.stateAt = Math.min(now, p.stateAt + now - offAt); }
      offAt = null;
    }

    if (me !== null) {
      // the clock stepped back (a corrected device clock): do not sit out the difference in silence
      if (nextHb - now > NET.hbMs) nextHb = now;
      if (nextFlush - now > flushMs) nextFlush = now;
      const hbOn = on && given !== 'final' && !(my.fell && (my.acked || my.rec)); // offline nothing gets through: no pile-up
      if (hbOn && now >= nextHb) { nextHb = now + NET.hbMs; heartbeat(); }
      if (!my.fell && given === null && buf.length && now >= nextFlush) flush(false);
      if (my.fell && !my.rec && my.retryAt && now >= my.retryAt) writeOut();
    }

    if (on && me !== null && !finalSent) { // once the ranking is final nobody needs forfeiting
      for (const p of P.values()) {
        if (p.out) continue;
        const silent = (now - p.heard) / 1000;
        // A rival who only heartbeats (before GO, a frozen tab) is heard once every 3 s: give a late
        // beat some room before calling it silence. Nothing is silence before the match has begun.
        const chipS = NET.silentS + (p.heard > p.stateAt ? NET.hbSlackS : 0);
        if (silent >= chipS && now >= t0 + 1000) {
          const cd = Math.max(0, Math.ceil(NET.silentS + NET.countdownS - silent));
          // only a player still standing may close a seat (the rules): once I fell there is no "win in N" to show,
          // and at the end of the countdown the silent rival is taken to have outlasted me
          if (cd !== p.cd) { p.cd = cd; emit('peer', p.slot, { silent, countdown: my.fell ? null : cd }); }
          if (cd === 0) { if (my.fell) p.gone = true; else closeSeat(p, 'dc', now); }
        } else if (p.cd !== null) {
          p.cd = null;
          p.gone = false;
          emit('peer', p.slot, { silent: 0, countdown: null });
        }
        if (my.fell) continue;
        // their played clock stopped (hidden tab, frozen phone): the rules allow the same forfeit
        if (p.hbT !== null && p.hbT * 100 < now - ts0 - NET.stallMs - 1000) closeSeat(p, 'dc', now);
        if (now - ts0 > NET.capMs + 1000) closeSeat(p, 'cap', now);
      }
    }
    evaluate();

    if (me !== null && my.fell && !my.rec && given === null && !on && now - my.fellAt > NET.giveUpMs) {
      finish({ result: 'lose', place: slots.length, places: [], reason: 'offline' }, true);
    }
  }

  function stop() {
    left = true;
    draining = false;
    if (stopTimer) { stopTimer(); stopTimer = null; }
    for (const off of offs.splice(0)) off();
    handlers.clear();
  }

  // ------------------------------------------------------------------ the link
  const link = {
    seed, slot: me, peers, ranked: false,
    mid, t0, code, slots, flushMs, stats,
    clock,

    push(s) {
      if (left || me === null || my.fell || given !== null || !s) return;
      last = { t: s.t, dist: s.dist, n: s.n, form: s.form, flags: s.flags, boss: s.boss, zone: s.zone, charge: s.charge, danger: s.danger, x: s.x };
      my.liveT10 = tenths(s.t);
      if (++skip >= stride) { skip = 0; buf.push(s.x); }
      if (buf.length > NET.maxSamples) {
        // cannot send: keep every other sample (the newest stays) and collect at half the rate from here
        const kept = [];
        for (let i = buf.length - 1; i >= 0; i -= 2) kept.unshift(buf[i]);
        buf = kept; stride *= 2; halvings++; skip = 0;
        stats.thinned++;
      }
    },

    fall(out = {}) {
      if (left || me === null || my.fell || given !== null) return;
      my.fell = true;
      my.fellAt = tp.now();
      my.t10 = clamp(tenths(out.t), 0, NET.maxT10);
      my.d = Math.max(0, Math.round(Number(out.d) || 0));
      my.by = out.by === 'quit' ? 'quit' : 'dead';
      writeOut();
      evaluate();
    },

    sendEvent(e) {
      if (left || me === null || !e) return;
      quiet(tp.push(`${R}/ev/${mid}`, { k: String(e.k || 's')[0], a: Math.round(Number(e.a) || 0), f: me,
        to: typeof e.to === 'number' ? e.to : -1, q: ++evQ }));
    },

    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => { const set = handlers.get(type); if (set) set.delete(cb); };
    },

    tick,

    /** Stop everything (idempotent). Leaving a match that is still running counts as quitting it. */
    leave() {
      if (left) return;
      if (me !== null && !my.fell && given === null) link.fall({ t: last ? last.t : 0, d: last ? last.dist : 0, by: 'quit' });
      if (me !== null && my.fell && !my.acked && !my.rec) {
        // keep only the retry of my own fall record alive for a few seconds, then stop
        left = true;
        draining = true;
        for (const off of offs.splice(0)) off();
        handlers.clear();
        return;
      }
      stop();
    },
  };

  offs.push(tp.on(`${R}/l`, 'value', (v) => onStates(v || {})));
  offs.push(tp.on(`${R}/hb`, 'value', (v) => onHeartbeats(v || {})));
  offs.push(tp.on(`${M}/out`, 'value', (v) => onOuts(v || {})));
  offs.push(tp.on(`${R}/ev/${mid}`, 'child_added', onEvent));
  offs.push(tp.onStatus((s) => emit('status', s === 'on' ? 'on' : 'lost')));
  stopTimer = timer.every(NET.tickMs, () => tick());
  return link;
}
