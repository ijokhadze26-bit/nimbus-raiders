// Slow-network shim: wraps ANY transport (local or real) and adds delay, jitter, "loss" and an
// offline switch per client. `?nettest=lat400,jit200,loss5` in the page, or shape(...) in a test.
//
// The connection underneath is reliable and ordered (a web socket), so a "lost" message is not gone:
// it arrives late, after a resend, and everything behind it waits. That is what is modelled:
//   lat   one-way delay in ms (a write is acknowledged after about 2 x lat)
//   jit   extra random delay 0..jit ms per message
//   loss  percent of messages that need a resend (adds max(250, 3 x lat) ms)
//   offline(true)  nothing moves in either direction; writes queue up (pending() grows) and are
//                  sent in order when the network returns, like the real SDK does.

import { realClock } from './transport.js';

/** 'lat400,jit200,loss5' -> { lat: 400, jit: 200, loss: 5 } (null when nothing usable). */
export function parseNettest(text) {
  if (!text || typeof text !== 'string') return null;
  const out = { lat: 0, jit: 0, loss: 0 };
  let any = false;
  for (const part of text.split(/[,; ]+/)) {
    const m = /^(lat|jit|loss)(\d+(?:\.\d+)?)$/i.exec(part.trim());
    if (m) { out[m[1].toLowerCase()] = Number(m[2]); any = true; }
  }
  return any ? out : null;
}

/**
 * shape(inner, { lat, jit, loss, clock, seed }) -> a transport with the same interface plus
 *   .net.set({ lat, jit, loss })   .net.offline(bool)   .net.isOffline()
 */
export function shape(inner, { lat = 0, jit = 0, loss = 0, clock = realClock, seed = 12345 } = {}) {
  const cfg = { lat, jit, loss };
  let rs = (seed >>> 0) || 1;
  const rand = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
  const delay = () => cfg.lat + rand() * cfg.jit + (rand() * 100 < cfg.loss ? Math.max(250, 3 * cfg.lat) : 0);

  let offline = false;
  let pend = 0;
  const stCbs = new Set();
  const lanes = { up: { last: 0, held: [] }, down: { last: 0, held: [] } };

  // One ordered lane per direction: a late message holds back everything queued after it.
  function sched(lane, fn) {
    const at = Math.max(lane.last, clock.now() + delay());
    lane.last = at;
    clock.after(at - clock.now(), () => { if (offline) lane.held.push(fn); else fn(); });
  }
  // A request goes up the wire, is answered, and the answer comes back down.
  const trip = (call, counts) => {
    if (counts) pend++;
    return new Promise((res, rej) => {
      sched(lanes.up, () => {
        let p;
        try { p = Promise.resolve(call()); } catch (e) { p = Promise.reject(e); }
        p.then((v) => sched(lanes.down, () => { if (counts) pend--; res(v); }),
          (e) => sched(lanes.down, () => { if (counts) pend--; rej(e); }));
      });
    });
  };
  const status = () => (offline && inner.status() !== 'off' ? 'lost' : inner.status());
  let told = null;
  const tell = () => {
    const s = status();
    if (s === told) return;
    told = s;
    for (const cb of [...stCbs]) { try { cb(s); } catch (e) { console.error(e); } }
  };
  inner.onStatus(() => tell());

  return {
    TS: inner.TS,
    kind: inner.kind,
    inner,
    get uid() { return inner.uid; },
    connect: () => inner.connect(),
    now: () => inner.now(),
    status,
    onStatus(cb) { stCbs.add(cb); return () => stCbs.delete(cb); },
    get: (path, q) => trip(() => inner.get(path, q), false),
    set: (path, value) => trip(() => inner.set(path, value), true),
    update: (map) => trip(() => inner.update(map), true),
    remove: (path) => trip(() => inner.remove(path), true),
    push: (path, value) => trip(() => inner.push(path, value), true),
    newId: () => inner.newId(),
    tx: (path, fn) => trip(() => inner.tx(path, fn), true),
    on(path, type, cb, q, onError) {
      let live = true;
      const off = inner.on(path, type, (v, k) => sched(lanes.down, () => { if (live) cb(v, k); }), q, onError);
      return () => { live = false; off(); };
    },
    onDisconnect(path, value) {
      // registered straight away: the server has to know it before the network can fail
      return inner.onDisconnect(path, value);
    },
    pending: () => pend,
    idle: () => inner.idle(),
    close: () => inner.close(),
    net: {
      set(o) { Object.assign(cfg, o); },
      isOffline: () => offline,
      offline(on) {
        if (!!on === offline) return;
        offline = !!on;
        if (inner._net) inner._net(!offline);
        if (!offline) {
          for (const lane of [lanes.up, lanes.down]) {
            const held = lane.held;
            lane.held = [];
            for (const fn of held) fn();
          }
        }
        tell();
      },
    },
  };
}
