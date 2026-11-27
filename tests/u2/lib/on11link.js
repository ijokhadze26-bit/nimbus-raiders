// A fake LISTEN link for the watch tests (tests/u2/on11-*.js and tests/online/watch.mjs; plain ES module, no DOM, so
// Node imports it too). 2-4 scripted players run testlink's defaultCurve on a MANUAL match clock; nothing is sent.
// It speaks the stage-5 link API of STAGE5.md: 'state', 'out', 'peer', 'event' / 'feed', 'final', 'stale',
// link.final, link.stale, link.feeds, link.snapshot().
//
//   const link = createFakeLink({ players, slot, feeds, snapshot, flush })
//     players  [{ slot, name, tr, fallAt (s, Infinity), curve }]   slot: null (a spectator) or my seat (I fell at
//              my fallAt: my own 'out' is never emitted, like match.js; snapshot() has it)
//     feeds    true (default): 'feed' brings every event and 'event' only mine / everyone's (match.js); false: a link
//              of before stage 5 ('event' only, every event when slot is null)
//     snapshot true (default): link.snapshot() exists;  flush: s between states (0.5)
//   link.test.to(t)               move the clock to t: states every `flush`, falls at fallAt, 'final' when the ranking
//                                 can no longer change (verdict.js finalPlaces, the real tie rule)
//   link.test.set(slot, patch)    override the curve's numbers of one player from now on ({ danger, boss, flags, n })
//   link.test.silence(slot, on)   that player stops (on) / starts again; 'peer' says how long once a second
//   link.test.fall(slot, { by })  falls now;  .sab(from, code, to);  .emote(from, a);  .stale();  .final(places)
//   link.test.listeners()         how many listeners are attached (a disposed model leaves 0)
import { defaultCurve } from '../../../src/online/game/testlink.js';
import { sabEncode } from '../../../src/online/game/sabdata.js';
import { finalPlaces } from '../../../src/online/verdict.js';

export function createFakeLink({ players = [], slot = null, feeds = true, snapshot = true, flush = 0.5 } = {}) {
  const L = new Map();
  const emit = (type, ...a) => { for (const cb of [...(L.get(type) || [])]) cb(...a); };
  let t = 0, evN = 0, done = false;
  const P = players.map((p, i) => ({
    slot: p.slot ?? i, name: p.name || `P${i}`, tr: p.tr | 0, fallAt: p.fallAt ?? Infinity,
    curve: p.curve || defaultCurve(p.fallAt ?? Infinity, i * 1.3), next: 0, last: null, out: null, silent: false, quietAt: 0,
    patch: {}, peerAt: 0,
  }));
  const events = [];

  const state = (p, at) => ({ t: at, charge: 0, xs: [], ...p.curve(at), ...p.patch });
  function out(p, by = 'dead', at = t) {
    if (p.out) return;
    const T = Math.round(Math.min(at, p.fallAt) * 10) / 10;
    p.out = { T, d: Math.floor(p.curve(T).dist), by };
    if (p.slot !== slot) emit('out', p.slot, { ...p.out });
  }
  function judge() {
    if (done) return;
    const outs = {}, liveT10 = {};
    for (const p of P) {
      if (p.out) outs[p.slot] = { T10: Math.round(p.out.T * 10), d: p.out.d, by: p.out.by };
      else liveT10[p.slot] = Math.floor((p.last ? p.last.t : 0) * 10);
    }
    const places = finalPlaces({ slots: P.map((p) => p.slot), outs, liveT10 });
    if (places) test.final(places);
  }

  const link = {
    seed: 1, slot, ranked: false, feeds: !!feeds, final: null, stale: false,
    peers: P.filter((p) => p.slot !== slot).map((p) => ({ slot: p.slot, name: p.name, tr: p.tr })),
    clock: () => t,
    on(type, cb) {
      if (!L.has(type)) L.set(type, new Set());
      L.get(type).add(cb);
      return () => L.get(type).delete(cb);
    },
    tick() {}, push() {}, fall() {}, sendEvent() {}, leave() { L.clear(); },
  };
  if (snapshot) {
    link.snapshot = () => {
      const states = {}, outs = {}, silent = {};
      for (const p of P) {
        if (p.slot !== slot && p.last) states[p.slot] = { ...p.last };
        if (p.out) outs[p.slot] = { ...p.out };
        if (p.slot !== slot && !p.out) silent[p.slot] = p.silent ? Math.max(0, t - p.quietAt) : 0;
      }
      return { t, states, outs, silent };
    };
  }

  const test = {
    players: P, events,
    get t() { return t; },
    to(end) {
      while (t < end - 1e-9) {
        // the next 0.1 s step, or `end` itself when it lies between two steps (never a step that does not move on)
        const nt = Math.min(end, Math.round((t + 0.1) * 10) / 10);
        if (!(nt > t)) break;
        t = nt;
        for (const p of P) {
          if (p.out) continue;
          if (t >= p.fallAt) { out(p, 'dead', p.fallAt); continue; }
          if (p.slot === slot || p.silent) {
            if (p.silent && t - p.peerAt >= 1 - 1e-9) { p.peerAt = t; emit('peer', p.slot, { silent: Math.round((t - p.quietAt) * 10) / 10, countdown: null }); }
            continue;
          }
          if (t >= p.next - 1e-9) { p.next = t + flush; p.last = state(p, t); emit('state', p.slot, { ...p.last }); }
        }
        judge();
      }
    },
    set(s, patch) { const p = P.find((x) => x.slot === s); if (p) Object.assign(p.patch, patch); },
    silence(s, on = true) {
      const p = P.find((x) => x.slot === s);
      if (!p) return;
      p.silent = on;
      if (on) { p.quietAt = t; p.peerAt = t; } else { p.next = 0; emit('peer', p.slot, { silent: 0, countdown: null }); }
    },
    fall(s, { by = 'dead' } = {}) { const p = P.find((x) => x.slot === s); if (p) { out(p, by); judge(); } },
    /** Delivers one event the way match.js does: 'feed' for everyone, 'event' after the filter. */
    send(e) {
      const ev = { q: ++evN, id: `-ev${String(evN).padStart(4, '0')}`, ...e };
      events.push(ev);
      if (feeds) emit('feed', { ...ev });
      const mine = slot === null || ev.to === -1 || ev.to === slot;
      if (ev.f !== slot && mine) emit('event', { k: ev.k, a: ev.a, to: ev.to, f: ev.f, q: ev.q });
      return ev;
    },
    sab(from, code, to = -1) { return test.send({ k: 's', a: sabEncode(code, t), f: from, to }); },
    emote(from, a) { return test.send({ k: 'e', a, f: from, to: -1 }); },
    final(places) { if (done) return; done = true; link.final = places; emit('final', { places }); },
    stale() { if (link.stale) return; link.stale = true; emit('stale'); },
    listeners() { let n = 0; for (const s of L.values()) n += s.size; return n; },
  };
  link.test = test;
  return link;
}
