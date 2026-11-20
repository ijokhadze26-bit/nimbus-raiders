// The local stand-in for the online service: a pure in-memory tree with child listeners, queries,
// transactions, onDisconnect and server timestamps from an injectable clock. No DOM, no network.
// Every client write goes through the security rules (rulescheck.js over the real rule text).
//
// Clients talk to it over a PORT: `{ post(msg), onmessage }` carrying JSON messages.
//   (a) same process:  const port = hub.connect()            -> give it to createLocalTransport({ port })
//                      (createLocalTransport({ hub }) does this for you)
//   (b) anything else: hub.attach(port)                      -> the other end lives in a browser page
//                      (playwright exposeBinding, BroadcastChannel, ...)
//
// Messages client -> hub (each request carries `id`, answered by `{ re: id, ok, err?, ... , t }`):
//   hello { uid }                    sign in as uid
//   get   { path, q }                -> val
//   write { w: [[path, value], ...] }   one path = set / remove, several = atomic update
//   tx    { path, old, value }       commit only if the current value still serialises to `old`
//                                    -> { committed, val } or { retry: true, val }
//   on    { lid, path, type, q }     start a listener; events arrive as { op:'ev', b:[[lid, type, key, val]], t }
//   off   { lid }      od { path, value }  (onDisconnect set)      odc { path }  (cancel)
//   net   { on }       the client's network went away / came back (onDisconnect fires after dropMs, or the
//                      moment the client is back if that is sooner: a reconnect is a new connection)
//   bye                clean disconnect (fires onDisconnect now)
// hub -> client also: { op:'time', t } from hub.syncTime().

import { segs, getIn, setIn, runQuery } from './tree.js';

const REAL = { now: () => Date.now(), after(ms, fn) { const h = setTimeout(fn, ms); return () => clearTimeout(h); } };

function resolveTS(v, now) {
  if (v === null || typeof v !== 'object') return v;
  if (v['.sv'] === 'timestamp') return now;
  const out = Array.isArray(v) ? [] : {};
  for (const k of Object.keys(v)) out[k] = resolveTS(v[k], now);
  return out;
}

/** Two linked ports for same-process use. Messages are JSON-copied and delivered in a microtask,
 *  so neither side ever shares an object with, or runs inside a call of, the other. */
export function portPair() {
  const mk = () => ({ onmessage: null, peer: null, post(msg) {
    const text = JSON.stringify(msg);
    const to = this.peer;
    queueMicrotask(() => { if (to.onmessage) to.onmessage(JSON.parse(text)); });
  } });
  const a = mk(), b = mk();
  a.peer = b; b.peer = a;
  return [a, b];
}

const related = (a, b) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * createHub({ clock, rules, dropMs }) -> hub
 *   clock   { now(), after(ms, fn) -> cancel }   (a virtual clock makes tests deterministic)
 *   rules   createRules(...) from rulescheck.js, or null for an open database
 *   dropMs  how long a dead connection goes unnoticed before its onDisconnect writes fire (default 5000);
 *           a client that comes back sooner fires them on its return
 */
export function createHub({ clock = REAL, rules = null, dropMs = 5000 } = {}) {
  let root = null;
  let nextConn = 1;
  const conns = new Set();
  const stats = { writes: 0, denied: 0, events: 0 };
  const hub = { stats, onDeny: null };

  // ----------------------------------------------------------------- listeners
  function collect(l, out) {
    const view = runQuery(getIn(root, l.path), l.q);
    if (l.type === 'value') {
      const j = JSON.stringify(view);
      if (j !== l.last) { l.last = j; out.push([l.lid, 'value', l.path[l.path.length - 1] ?? null, view]); }
      return;
    }
    const cur = new Map();
    if (view !== null && typeof view === 'object') for (const k of Object.keys(view)) cur.set(k, JSON.stringify(view[k]));
    const prev = l.last || new Map();
    if (l.type === 'child_removed') { for (const k of prev.keys()) if (!cur.has(k)) out.push([l.lid, l.type, k, JSON.parse(prev.get(k))]); }
    for (const [k, j] of cur) {
      if (!prev.has(k)) { if (l.type === 'child_added') out.push([l.lid, l.type, k, view[k]]); }
      else if (prev.get(k) !== j && l.type === 'child_changed') out.push([l.lid, l.type, k, view[k]]);
    }
    l.last = cur;
  }

  function flush(conn, paths) {
    if (!conn.online) return;
    const out = [];
    for (const l of conn.ls.values()) if (!paths || paths.some((p) => related(p, l.path))) collect(l, out);
    if (out.length) { stats.events += out.length; conn.send({ op: 'ev', b: out, t: clock.now() }); }
  }

  // ----------------------------------------------------------------- writes
  /** Apply writes atomically. Returns null on success, else the rules' refusal. */
  function commit(conn, writes, admin) {
    const now = clock.now();
    const ops = writes.map(([p, v]) => [segs(p), resolveTS(v, now)]);
    let next = root;
    for (const [p, v] of ops) next = setIn(next, p, v);
    if (rules && !admin) {
      const verdict = rules.write(conn.auth, ops.map((o) => o[0]), root, next, now);
      if (!verdict.ok) {
        stats.denied++;
        if (hub.onDeny) hub.onDeny({ uid: conn.auth?.uid ?? null, writes, ...verdict });
        return verdict;
      }
    }
    stats.writes++;
    root = next;
    const paths = ops.map((o) => o[0]);
    for (const c of conns) flush(c, paths);
    return null;
  }

  function fireDisconnect(conn) {
    const list = conn.od;
    conn.od = [];
    conn.dropCancel = null;
    for (const { path, value } of list) commit(conn, [[path, value]], false);
  }

  function setOnline(conn, on) {
    if (on === conn.online) return;
    conn.online = on;
    if (!on) {
      conn.dropCancel = clock.after(dropMs, () => fireDisconnect(conn));
    } else {
      // Back on a NEW connection: the service cleans the old one up at once, so its onDisconnect writes
      // fire now, however short the gap was (dropMs is only how long a dead socket goes unnoticed).
      if (conn.dropCancel) { conn.dropCancel(); fireDisconnect(conn); }
      flush(conn, null); // catch up: one event per listener for whatever changed while it was away
    }
  }

  const canRead = (conn, path, q) => !rules || rules.read(conn.auth, path, root, clock.now(), q || null);

  function onMessage(conn, m) {
    const reply = (extra) => conn.send({ re: m.id, ok: true, t: clock.now(), ...extra });
    const refuse = (err, why) => conn.send({ re: m.id, ok: false, err, why: why || null, t: clock.now() });
    switch (m.op) {
      case 'hello':
        conn.auth = m.uid ? { uid: String(m.uid), token: {} } : null;
        setOnline(conn, true);
        return reply({ uid: conn.auth ? conn.auth.uid : null });
      case 'get': {
        const path = segs(m.path);
        if (!canRead(conn, path, m.q)) return refuse('PERMISSION_DENIED', `read ${m.path}`);
        return reply({ val: runQuery(getIn(root, path), m.q) });
      }
      case 'write': {
        const no = commit(conn, m.w, false);
        return no ? refuse('PERMISSION_DENIED', `${no.kind} ${no.path}${no.why ? `: ${no.why}` : ''}`) : reply();
      }
      case 'tx': {
        const path = segs(m.path);
        if (!canRead(conn, path, null)) return refuse('PERMISSION_DENIED', `read ${m.path}`);
        const cur = getIn(root, path);
        if (JSON.stringify(cur) !== m.old) return reply({ retry: true, val: cur });
        const no = commit(conn, [[m.path, m.value]], false);
        if (no) return refuse('PERMISSION_DENIED', `${no.kind} ${no.path}${no.why ? `: ${no.why}` : ''}`);
        return reply({ committed: true, val: getIn(root, path) });
      }
      case 'on': {
        const path = segs(m.path);
        if (!canRead(conn, path, m.q)) return refuse('PERMISSION_DENIED', `read ${m.path}`);
        const l = { lid: m.lid, path, type: m.type, q: m.q || null, last: m.type === 'value' ? undefined : null };
        conn.ls.set(m.lid, l);
        reply();
        const out = [];
        collect(l, out);
        if (out.length) conn.send({ op: 'ev', b: out, t: clock.now() });
        return undefined;
      }
      case 'off': conn.ls.delete(m.lid); return undefined;
      case 'od': conn.od.push({ path: m.path, value: m.value ?? null }); return reply();
      case 'odc': {
        const at = segs(m.path);
        conn.od = conn.od.filter((o) => { const p = segs(o.path); return !(p.length >= at.length && related(p, at)); });
        return reply();
      }
      case 'net': return setOnline(conn, !!m.on);
      case 'bye':
        if (conn.dropCancel) { conn.dropCancel(); conn.dropCancel = null; }
        fireDisconnect(conn);
        conn.ls.clear();
        conn.online = false;
        return undefined;
      default: return m.id !== undefined ? refuse('BAD_REQUEST') : undefined;
    }
  }

  // ----------------------------------------------------------------- public
  /** Serve a client on `port`. Returns { detach() } (detaching counts as a clean disconnect). */
  hub.attach = (port) => {
    const conn = { id: nextConn++, auth: null, ls: new Map(), od: [], online: true, dropCancel: null, send: (m) => port.post(m) };
    conns.add(conn);
    port.onmessage = (m) => { if (m && typeof m === 'object') onMessage(conn, m); };
    return { detach() { onMessage(conn, { op: 'bye' }); conns.delete(conn); port.onmessage = null; } };
  };
  /** A same-process client port. */
  hub.connect = () => { const [mine, theirs] = portPair(); hub.attach(mine); return theirs; };
  hub.now = () => clock.now();
  hub.clock = clock;
  /** Tell every client the time (needed when the hub's clock is virtual and the client's is not). */
  hub.syncTime = () => { for (const c of conns) c.send({ op: 'time', t: clock.now() }); };
  /** Console-style access that skips the rules (what the owner does in the Firebase console). */
  hub.admin = {
    get: (path) => getIn(root, segs(path)),
    set: (path, value) => { commit(null, [[path, value]], true); },
    update: (map) => { commit(null, Object.entries(map), true); },
    remove: (path) => { commit(null, [[path, null]], true); },
  };
  hub.dump = () => JSON.parse(JSON.stringify(root));
  hub.clients = () => conns.size;
  return hub;
}
