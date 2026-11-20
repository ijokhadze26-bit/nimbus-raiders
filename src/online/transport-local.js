// Local adapter: the transport interface (transport.js) over a port to a localhub.js hub.
// Used by the Node tests, the two-page harness (?net=bridge) and two-tab play (?net=local).
// By default it has no optimistic local echo: listeners hear a write only once the hub has accepted it.
// The real SDK does the opposite (my own listeners fire inside set(), a server timestamp first shows a
// local estimate, and a refused write is rolled back afterwards). `echo: true` imitates that for plain
// 'value' listeners, so the room and match code can be tested against both behaviours before the real
// service exists. Code written against the interface must not depend on either.

import { NET } from './config.js';
import { TS, DENIED, netError, statusBox, realClock } from './transport.js';
import { plain, segs, getIn, setIn } from './tree.js';

const ID_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * createLocalTransport({ hub | port, uid, clock, follow }) -> transport
 *   hub     a localhub in this process (a port is made for you), or
 *   port    { post(msg), onmessage } leading to hub.attach(port) somewhere else
 *   uid     the player id to sign in as (one is invented when missing)
 *   clock   { now(), after(ms, fn) -> cancel }; the real clock by default
 *   follow  true: now() is the last time the hub told us (for a hub on a virtual clock driven from
 *           outside this page); false: now() runs on `clock` plus the offset measured from the hub.
 *   echo    true: imitate the real SDK's optimistic local events (see the top of this file)
 */
export function createLocalTransport({ hub = null, port = null, uid = null, clock = realClock, follow = false, echo = false } = {}) {
  const link = port || hub.connect();
  const status = statusBox('off');
  const waits = new Map();   // request id -> { res, rej }
  const subs = new Map();    // listener id -> { cb, msg }
  let nextId = 1;
  let pend = 0;
  let offset = 0;
  let synced = false;
  let hubTime = 0;
  let idCount = 0;
  let idleCancel = null;
  let me = uid ? String(uid) : null;
  let rnd = 0x9e3779b9 ^ (me ? [...me].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) : (Math.random() * 2 ** 32) | 0);
  const rand = () => { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return (rnd >>> 0) / 4294967296; };

  link.onmessage = (m) => {
    if (typeof m.t === 'number') {
      hubTime = m.t;
      const o = m.t - clock.now();
      if (!synced || o > offset) { offset = o; synced = true; }
    }
    if (m.re !== undefined) {
      const w = waits.get(m.re);
      if (!w) return;
      waits.delete(m.re);
      if (m.ok) w.res(m); else w.rej(netError(m.err || 'ERROR', m.why || m.err));
    } else if (m.op === 'ev') {
      for (const [lid, , key, val] of m.b) {
        const s = subs.get(lid);
        if (!s) continue;
        const v = val === undefined ? null : val;
        if (s.plainValue) { s.have = true; s.server = v; s.shown = v; }
        try { s.cb(v, key); } catch (e) { console.error(e); }
      }
    }
  };

  const post = (m) => link.post(m);
  const req = (m) => new Promise((res, rej) => {
    const id = nextId++;
    waits.set(id, { res, rej });
    post({ ...m, id });
  });
  const now = () => (follow ? hubTime : clock.now() + offset);

  // --- echo mode: what the real SDK does with my own writes before the server has answered ---
  const estimate = (v, at) => {
    if (v === null || typeof v !== 'object') return v;
    if (v['.sv'] === 'timestamp') return at;
    const out = {};
    for (const k of Object.keys(v)) out[k] = estimate(v[k], at);
    return out;
  };
  function showLocally(w) {
    const touched = [];
    const at = now() + 3; // a local guess, deliberately not the server's value
    for (const s of subs.values()) {
      if (!s.plainValue || !s.have) continue;
      let next = s.shown, hit = false;
      for (const [path, value] of w) {
        const wp = segs(path), lp = s.path;
        const n = Math.min(wp.length, lp.length);
        if (wp.slice(0, n).join('/') !== lp.slice(0, n).join('/')) continue;
        hit = true;
        const v = estimate(value, at);
        next = wp.length >= lp.length ? setIn(next, wp.slice(lp.length), v) : plain(getIn(plain(v), lp.slice(wp.length)));
      }
      if (!hit || JSON.stringify(next) === JSON.stringify(s.shown)) continue;
      s.shown = next;
      touched.push(s);
      try { s.cb(next === null ? null : JSON.parse(JSON.stringify(next)), s.path[s.path.length - 1] ?? null); } catch (e) { console.error(e); }
    }
    return touched;
  }
  function rollBack(touched) {
    for (const s of touched) {
      if (JSON.stringify(s.shown) === JSON.stringify(s.server)) continue;
      s.shown = s.server;
      try { s.cb(s.server, s.path[s.path.length - 1] ?? null); } catch (e) { console.error(e); }
    }
  }

  const write = (w) => {
    pend++;
    const touched = echo ? showLocally(w) : null;
    return req({ op: 'write', w }).then(() => { pend--; }, (e) => { pend--; if (touched) rollBack(touched); throw e; });
  };

  function newId() {
    // push-id shaped: sorts by creation time, then a per-client counter, then noise
    let t = Math.max(0, Math.floor(now()));
    let head = '';
    for (let i = 0; i < 8; i++) { head = ID_CHARS[t % ID_CHARS.length] + head; t = Math.floor(t / ID_CHARS.length); }
    let n = idCount++;
    let mid = '';
    for (let i = 0; i < 3; i++) { mid = ID_CHARS[n % ID_CHARS.length] + mid; n = Math.floor(n / ID_CHARS.length); }
    let tail = '';
    for (let i = 0; i < 8; i++) tail += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
    return `L${head}${mid}${tail}`;
  }

  const transport = {
    TS,
    kind: 'local',
    get uid() { return me; },

    connect() {
      if (idleCancel) { idleCancel(); idleCancel = null; }
      if (status.get() === 'on') return Promise.resolve({ uid: me });
      status.set('connecting');
      if (!me) me = `local-${newId().slice(-8)}`;
      return new Promise((res, rej) => {
        const cancel = clock.after(NET.connectMs, () => { status.set('off'); rej(netError('timeout', 'could not connect')); });
        req({ op: 'hello', uid: me }).then(() => { cancel(); status.set('on'); res({ uid: me }); },
          (e) => { cancel(); status.set('off'); rej(e); });
      });
    },
    now,
    status: () => status.get(),
    onStatus: (cb) => status.on(cb),

    get: (path, q) => req({ op: 'get', path, q: q || null }).then((m) => plain(m.val)),
    set: (path, value) => write([[path, value === undefined ? null : value]]),
    update: (map) => write(Object.entries(map)),
    remove: (path) => write([[path, null]]),
    push(path, value) {
      const id = newId();
      return write([[`${path}/${id}`, value]]).then(() => id);
    },
    newId,

    async tx(path, fn) {
      let cur = plain((await req({ op: 'get', path, q: null })).val);
      for (let tries = 0; tries < 25; tries++) {
        const old = JSON.stringify(cur);
        const next = fn(cur === null ? null : JSON.parse(old));
        if (next === undefined) return { committed: false, value: cur };
        pend++;
        let m;
        try { m = await req({ op: 'tx', path, old, value: next }); } finally { pend--; }
        if (m.committed) return { committed: true, value: plain(m.val) };
        cur = plain(m.val);
      }
      throw netError('maxretries', 'transaction gave up');
    },

    on(path, type, cb, q, onError) {
      const lid = nextId++;
      subs.set(lid, { cb, path: segs(path), plainValue: type === 'value' && !q, have: false, server: null, shown: null });
      req({ op: 'on', lid, path, type, q: q || null }).catch((e) => {
        subs.delete(lid);
        if (onError) onError(e); else if (e.code !== DENIED) console.error(e);
      });
      return () => { if (subs.delete(lid)) post({ op: 'off', lid }); };
    },

    onDisconnect(path, value) {
      const done = req({ op: 'od', path, value: value === undefined ? null : value }).catch(() => {});
      return { cancel: () => done.then(() => req({ op: 'odc', path })).catch(() => {}) };
    },

    pending: () => pend,

    /** Leaving the online screens: drop the connection in 20 s unless connect() is called again. */
    idle() {
      if (idleCancel) return;
      idleCancel = clock.after(NET.idleMs, () => { idleCancel = null; transport._net(false); status.set('off'); });
    },
    close() {
      if (idleCancel) { idleCancel(); idleCancel = null; }
      post({ op: 'bye' });
      subs.clear();
      waits.clear();
      pend = 0;
      status.set('off');
    },

    /** Test hook (nettest.js): the network went away / came back. */
    _net(on) {
      post({ op: 'net', on: !!on });
      if (status.get() === 'off' || status.get() === 'connecting') return;
      status.set(on ? 'on' : 'lost');
    },
  };
  return transport;
}
