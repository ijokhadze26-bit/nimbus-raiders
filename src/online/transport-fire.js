// Real adapter: the transport interface (transport.js) over Firebase Realtime Database + Anonymous Auth.
// THE ONLY FILE THAT IMPORTS firebase. It is reached through a dynamic import() in transport.js, so the
// SDK is fetched on the first ONLINE tap and never sits in the main bundle.
//
// NOT YET RUN AGAINST A REAL PROJECT (the owner has no account yet). It is kept thin on purpose: every
// behaviour the game relies on lives above the interface and is tested on the local adapter. Things
// to confirm on the first live run (scripts/rules-probe.mjs --live uses this very file):
//   - the first write right after signInAnonymously() already carries the token (a zero-delay wait is
//     added below as cheap insurance);
//   - '.info/connected' flips false / true fast enough for the RECONNECTING chip;
//   - get() after a server-timestamp set returns the server's value (room.js relies on it for t0 / seed;
//     the SDK source says get() reads the server cache or the server, never a pending local write).
// Differences from the local adapter that callers must tolerate (and do): listeners hear my own writes
// at once, before the server agrees, and a server timestamp first shows a local estimate.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getDatabase, ref, get, set, update, push, remove, runTransaction,
  onValue, onChildAdded, onChildChanged, onChildRemoved,
  query, orderByChild, orderByValue, orderByKey, startAt, startAfter, endAt, limitToFirst, limitToLast,
  onDisconnect, serverTimestamp, goOnline, goOffline,
} from 'firebase/database';
import { NET } from './config.js';
import { TS, isTS, DENIED, netError, statusBox, realClock } from './transport.js';
import { plain } from './tree.js';

const LISTEN = { value: onValue, child_added: onChildAdded, child_changed: onChildChanged, child_removed: onChildRemoved };

/** Swap the TS sentinel for the SDK's own and drop undefined (the SDK refuses it). */
function outgoing(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (isTS(v)) return serverTimestamp();
  const out = {};
  for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = outgoing(v[k]);
  return out;
}

const mapError = (e) => {
  const text = String(e?.message || e || '');
  const code = e?.code === DENIED || /permission.denied/i.test(text) ? DENIED : (e?.code || 'ERROR');
  return netError(code, text || code);
};

/**
 * createFireTransport(config, { name, clock }) -> transport
 *   config  the public firebaseConfig block (must hold databaseURL)
 *   name    app name; give each simulated player its own (the rules probe signs in three)
 */
export function createFireTransport(config, { name = 'nimbus-online', clock = realClock } = {}) {
  const app = getApps().find((a) => a.name === name) || initializeApp(config, name);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const status = statusBox('off');
  let uid = null;
  let offset = 0;
  let pend = 0;
  let wanted = false, linked = false, everOn = false;
  let connecting = null, idleCancel = null, infoOffs = null;

  const refresh = () => {
    const on = wanted && linked && !!uid;
    if (on) everOn = true;
    status.set(!wanted ? 'off' : on ? 'on' : everOn ? 'lost' : 'connecting');
  };

  function watchInfo() {
    if (infoOffs) return;
    infoOffs = [
      onValue(ref(db, '.info/connected'), (s) => { linked = s.val() === true; refresh(); }),
      onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = Number(s.val()) || 0; }),
      onAuthStateChanged(auth, (u) => { uid = u ? u.uid : null; refresh(); }),
    ];
  }

  const track = (p) => {
    pend++;
    return p.then((v) => { pend--; return v; }, (e) => { pend--; throw mapError(e); });
  };

  function target(path, o) {
    const r = ref(db, path);
    if (!o) return r;
    const c = [o.orderBy === 'child' ? orderByChild(o.child) : o.orderBy === 'value' ? orderByValue() : orderByKey()];
    if (o.startAt !== undefined && o.startAt !== null) c.push(startAt(o.startAt));
    if (o.startAfter !== undefined && o.startAfter !== null) c.push(startAfter(o.startAfter));
    if (o.endAt !== undefined && o.endAt !== null) c.push(endAt(o.endAt));
    if (o.limitToFirst) c.push(limitToFirst(o.limitToFirst));
    if (o.limitToLast) c.push(limitToLast(o.limitToLast));
    return query(r, ...c);
  }

  /** Snapshot -> plain value. For a query the children are added in query order. */
  function value(snap, o) {
    if (!o) return plain(snap.val());
    const out = {};
    let any = false;
    snap.forEach((ch) => { const v = plain(ch.val()); if (v !== null) { out[ch.key] = v; any = true; } });
    return any ? out : null;
  }

  const transport = {
    TS,
    kind: 'fire',
    get uid() { return uid; },

    connect() {
      if (idleCancel) { idleCancel(); idleCancel = null; }
      wanted = true;
      if (status.get() === 'on') return Promise.resolve({ uid });
      if (connecting) return connecting;
      everOn = false;
      watchInfo();
      goOnline(db);
      refresh();
      connecting = new Promise((res, rej) => {
        let done = false, signedIn = false, offSt = null, cancel = null;
        const finish = (err) => {
          if (done) return;
          done = true;
          if (cancel) cancel();
          if (offSt) offSt();
          connecting = null;
          if (!err) { res({ uid }); return; }
          wanted = false;
          goOffline(db);
          refresh();
          rej(err);
        };
        const check = () => { if (signedIn && status.get() === 'on') finish(null); };
        cancel = clock.after(NET.connectMs, () => finish(netError('timeout', 'could not reach the online service')));
        offSt = status.on(check);
        signInAnonymously(auth).then((cred) => {
          uid = cred.user.uid;
          // let the database connection pick the new token up before anyone writes
          clock.after(0, () => { signedIn = true; refresh(); check(); });
        }, (e) => finish(netError(e?.code || 'auth', String(e?.message || e))));
      });
      return connecting;
    },

    now: () => Date.now() + offset,
    status: () => status.get(),
    onStatus: (cb) => status.on(cb),

    get: (path, o) => get(target(path, o)).then((snap) => value(snap, o), (e) => { throw mapError(e); }),
    set: (path, v) => track(set(ref(db, path), outgoing(v))),
    update: (map) => track(update(ref(db), outgoing(map))),
    remove: (path) => track(remove(ref(db, path))),
    push(path, v) {
      const r = push(ref(db, path));
      return track(set(r, outgoing(v))).then(() => r.key);
    },
    newId: () => push(ref(db, 'ids')).key, // a push id made on the client: nothing is written

    tx: (path, fn) => track(runTransaction(ref(db, path), (cur) => fn(plain(cur)), { applyLocally: false }))
      .then((r) => ({ committed: r.committed, value: plain(r.snapshot.val()) })),

    on(path, type, cb, o, onError) {
      const listen = LISTEN[type];
      if (!listen) throw new Error(`unknown event type ${type}`);
      return listen(target(path, o),
        (snap) => cb(type === 'value' ? value(snap, o) : plain(snap.val()), snap.key),
        (e) => { if (onError) onError(mapError(e)); });
    },

    onDisconnect(path, v) {
      const od = onDisconnect(ref(db, path));
      const armed = (v === null || v === undefined ? od.remove() : od.set(outgoing(v))).catch(() => {});
      return { cancel: () => armed.then(() => od.cancel()).catch(() => {}) };
    },

    pending: () => pend,

    /** Leaving the online screens: go offline in 20 s unless connect() is called again. */
    idle() {
      if (idleCancel || !wanted) return;
      idleCancel = clock.after(NET.idleMs, () => { idleCancel = null; wanted = false; goOffline(db); refresh(); });
    },
    close() {
      if (idleCancel) { idleCancel(); idleCancel = null; }
      wanted = false;
      goOffline(db);
      if (infoOffs) { for (const off of infoOffs) off(); infoOffs = null; }
      linked = false;
      refresh();
    },

    /** nettest.js hook: really drop / restore the connection. */
    _net(on) { if (on) goOnline(db); else goOffline(db); },
  };
  return transport;
}
