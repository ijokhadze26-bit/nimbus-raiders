// The transport interface (SPEC4 3.4) and the one place that picks an adapter.
//
//   connect() -> Promise<{ uid }>        anonymous sign-in + clock offset; rejects after 8 s
//   now() -> ms                          server-synced clock
//   status(), onStatus(cb) -> off        'off' | 'connecting' | 'on' | 'lost'
//   get(path, query?) -> Promise<value>  query: { orderBy:'child'|'value', child, startAt, startAfter,
//                                                 limitToFirst, limitToLast }
//   set(path, value)  update(map)  remove(path)      -> Promise (rejects with err.code 'PERMISSION_DENIED')
//   push(path, value) -> Promise<id>     newId() -> id   (a fresh push id with no write: superset)
//   tx(path, fn) -> Promise<{ committed, value }>     fn(current) returns the new value, undefined aborts
//   on(path, 'value'|'child_added'|'child_changed'|'child_removed', cb(value, key), query?, onError?) -> off
//   onDisconnect(path, valueOrNull) -> { cancel() }
//   pending() -> number                  unacknowledged writes, for backpressure
//   idle()  close()  TS                  TS = server-timestamp sentinel
//
// Values handed to callbacks are always plain objects (never arrays), null when nothing is there.
// update(map) takes full paths from the root: { 'rooms/ABCD/st': 'live', ... } and is atomic.
// Both adapters pass the same tests through this interface; transport-fire.js is the only file
// that imports firebase and is loaded with a dynamic import() so nothing else ever pulls it in.

import { configured, firebaseConfig } from './config.js';

export { plain } from './tree.js';

/** Server-timestamp sentinel (the same wire shape the Realtime Database uses). */
export const TS = Object.freeze({ '.sv': 'timestamp' });
export const isTS = (v) => !!v && typeof v === 'object' && v['.sv'] === 'timestamp';

export const DENIED = 'PERMISSION_DENIED';
export function netError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}
export const isDenied = (e) => !!e && (e.code === DENIED || /permission.denied/i.test(String(e.message || e)));

/** uint32 road seed from the match record's server timestamp and id (SPEC4 4.1): nobody picks the road. */
export function hash32(ts, mid) {
  const s = `${ts}:${mid}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) || 1;
}

/** Tiny status holder shared by the adapters. */
export function statusBox(initial = 'off') {
  let st = initial;
  const cbs = new Set();
  return {
    get: () => st,
    set(next) {
      if (next === st) return;
      st = next;
      for (const cb of [...cbs]) { try { cb(st); } catch (e) { console.error(e); } }
    },
    on(cb) { cbs.add(cb); return () => cbs.delete(cb); },
  };
}

/** Real wall clock in the shape every online module takes: { now(), after(ms, fn) -> cancel, every(ms, fn) -> cancel }. */
export const realClock = Object.freeze({
  now: () => Date.now(),
  after(ms, fn) { const h = setTimeout(fn, ms); return () => clearTimeout(h); },
  every(ms, fn) { const h = setInterval(fn, ms); return () => clearInterval(h); },
});

/** 'ok' or the reason an adapter cannot be made: 'unconfigured' (no account pasted in yet). */
export function availability(kind = 'fire', opts = {}) {
  if (kind === 'fire') return configured(opts.config || firebaseConfig) ? 'ok' : 'unconfigured';
  return 'ok';
}

/**
 * createTransport(kind, opts) -> Promise<{ transport, reason }>
 *   kind 'fire'  : the real service. reason 'unconfigured' while config.js has no apiKey,
 *                  'load-failed' when the SDK chunk cannot be fetched.
 *   kind 'local' : opts.hub (same process) or opts.port ({ post(msg), onmessage }); opts.uid, opts.clock.
 * opts.nettest ({ lat, jit, loss } or the '?nettest=' string) wraps either adapter in the slow-network shim.
 */
export async function createTransport(kind = 'fire', opts = {}) {
  let transport = null;
  if (kind === 'fire') {
    const config = opts.config || firebaseConfig;
    if (!configured(config)) return { transport: null, reason: 'unconfigured' };
    try {
      const mod = await import('./transport-fire.js');
      transport = mod.createFireTransport(config, opts);
    } catch (e) {
      return { transport: null, reason: 'load-failed', error: e };
    }
  } else if (kind === 'local') {
    if (!opts.hub && !opts.port) return { transport: null, reason: 'no-hub' };
    const mod = await import('./transport-local.js');
    transport = mod.createLocalTransport(opts);
  } else {
    return { transport: null, reason: 'unknown-kind' };
  }
  if (opts.nettest) {
    const nt = await import('./nettest.js');
    const o = typeof opts.nettest === 'string' ? nt.parseNettest(opts.nettest) : opts.nettest;
    if (o) transport = nt.shape(transport, { clock: opts.clock, ...o });
  }
  return { transport, reason: null };
}
