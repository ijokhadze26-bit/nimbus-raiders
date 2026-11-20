// Friend rooms: create, join by code, seats, picks, ready, start, rematch, leave (SPEC4 5.1, 5.2, 5.8).
//
//   const room = await createRoom({ transport, profile, picks })            // I am seat 0 and the host
//   const room = await joinRoom({ transport, code, profile, picks, watch }) // lowest empty seat, else a watcher
//   room.on('change', (state) => ...)   room.on('start', ({ mid, t0, seed }) => ...)   room.on('error', (e) => ...)
//   room.pick({ he, we, hs, ws })   room.ready(true)   room.rematch({ ready })   room.leave()
//
//   state = { code, k, max, st, host, me: slot|null, seats: [{ slot, uid, n, he, we, hs, ws, tr, rdy, rm } | null],
//             spectators, mid, t0, seed, rn,   + hostLeft, watching, gone }
//
// - `mid`, `t0`, `seed` are null until the match record has been read from the server, then appear
//   together ('start' fires at the same moment; a listener added later is told as well).
//   t0 = record ts + 4000, seed = hash32(ts, mid). While st is 'live' and mid is still null: wait.
// - Ready and rematch are stored as the round they belong to (rn + 1), so an old "ready" can never
//   start the next round by accident and nobody has to clear another player's seat. `rdy` / `rm` in the
//   state are plain booleans for the current round.
// - The lowest seat starts the match when everyone seated (2 or more) is ready, and turns the room back
//   to the lobby (rn + 1) when everyone still seated asked for a rematch. rematch({ ready: true }) also
//   readies me for the new round, so two players pressing REMATCH go straight into the next match.
// - Seats are held with onDisconnect while in the lobby and kept through a match (a reload mid-match
//   keeps the seat; SPEC4 5.7).

import { NET, CODE_RE } from './config.js';
import { TS, hash32, isDenied, netError, realClock } from './transport.js';
import { censor, makeCode } from './names.js';

const PICKS = ['he', 'we', 'hs', 'ws'];
const s20 = (v) => (typeof v === 'string' ? v.slice(0, 20) : '');

function seatData(profile, picks) {
  const out = { n: s20(profile?.n || 'Raider'), tr: Math.max(0, Math.round(Number(profile?.tr) || 0)) };
  for (const k of PICKS) out[k] = s20(picks?.[k]);
  return out;
}

function makeRoom(tp, code, uid, { clock = realClock, autoStart = true } = {}) {
  const R = `rooms/${code}`;
  const raw = { h: null, k: null, max: 2, st: null, mid: null, rn: 0, sl: {}, p: {}, sp: {} };
  const handlers = new Map();
  const offs = [];
  let closed = false, loaded = false, queued = false;
  let derived = null;        // { mid, ts, t0, seed } of the live match, read from the server
  let fetching = null, pendingMid = null, startedMid = null;
  let starting = false, turning = false, holdStart = false, wantReady = false, lastRn = null;
  let guardSeat = null, guards = [];

  const emit = (type, arg) => {
    for (const cb of [...(handlers.get(type) || [])]) { try { cb(arg); } catch (e) { console.error(e); } }
  };
  const mySlot = () => {
    for (let i = 0; i < raw.max; i++) if (raw.sl[i] === uid) return i;
    return null;
  };

  function build() {
    const rn = raw.rn || 0;
    const seats = [];
    for (let i = 0; i < raw.max; i++) {
      const u = raw.sl[i];
      const p = raw.p[i] || {};
      seats.push(u ? { slot: i, uid: u, n: p.n ? censor(p.n) : '', he: p.he || '', we: p.we || '', hs: p.hs || '',
        ws: p.ws || '', tr: p.tr || 0, rdy: p.rdy === rn + 1, rm: p.rm === rn + 1 } : null);
    }
    const me = mySlot();
    const live = raw.st === 'live' && !!derived && derived.mid === raw.mid;
    return {
      code, k: raw.k, max: raw.max, st: raw.st, host: raw.h, me, seats,
      spectators: Object.keys(raw.sp).length,
      mid: live ? derived.mid : null, t0: live ? derived.t0 : null, seed: live ? derived.seed : null,
      rn,
      hostLeft: raw.st === 'lobby' && !!raw.h && !Object.values(raw.sl).includes(raw.h),
      watching: me === null && raw.sp[uid] === true,
      gone: raw.st === null,
    };
  }

  function fetchMatch(mid) {
    if (fetching === mid) return;
    fetching = mid;
    tp.get(`matches/${mid}`).then((rec) => {
      fetching = null;
      if (closed || raw.mid !== mid || raw.st !== 'live') return;
      if (!rec || rec.code !== code || typeof rec.ts !== 'number') { clock.after(600, dirty); return; }
      derived = { mid, ts: rec.ts, t0: rec.ts + NET.goMs, seed: hash32(rec.ts, mid) };
      dirty();
    }, () => { fetching = null; if (!closed) clock.after(600, dirty); });
  }

  // Hold my lobby seat with onDisconnect; let go of the hold once the match is on.
  function syncGuard(state) {
    const want = state.me !== null && state.st === 'lobby' && tp.status() === 'on' ? state.me : null;
    if (want === guardSeat) return;
    for (const g of guards) g.cancel();
    guards = [];
    guardSeat = want;
    if (want !== null) guards = [tp.onDisconnect(`${R}/p/${want}`, null), tp.onDisconnect(`${R}/sl/${want}`, null)];
  }

  function auto(state) {
    const seated = state.seats.filter(Boolean);
    if (state.me === null || !seated.length || seated[0].slot !== state.me || tp.status() !== 'on') return;
    if (state.st === 'lobby' && autoStart && !starting && !holdStart && seated.length >= 2 && seated.every((s) => s.rdy)) {
      room.start();
    } else if (state.st === 'live' && !turning && seated.every((s) => s.rm)) {
      turning = true;
      tp.update({ [`${R}/st`]: 'lobby', [`${R}/rn`]: state.rn + 1 }).catch(() => { turning = false; });
    }
  }

  function step() {
    if (raw.st !== 'live') derived = null;
    else if (raw.mid && raw.mid !== pendingMid && (!derived || derived.mid !== raw.mid)) { derived = null; fetchMatch(raw.mid); }
    const state = build();
    room.state = state;
    if (lastRn !== null && state.rn !== lastRn) {
      turning = false;
      if (wantReady && state.me !== null) { wantReady = false; room.ready(true); }
    }
    lastRn = state.rn;
    syncGuard(state);
    emit('change', state);
    if (state.mid && state.mid !== startedMid) {
      startedMid = state.mid;
      emit('start', { mid: state.mid, t0: state.t0, seed: state.seed });
    }
    auto(state);
  }

  function dirty() {
    if (queued || closed) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!closed && loaded) step(); });
  }

  const mine = () => (room.state && room.state.me !== null ? room.state.me : null);
  const done = (p) => p.then(() => true, (e) => { emit('error', e); return false; });

  const room = {
    code,
    uid,
    state: null,
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      // joining a room whose match is already on (a reload, a watcher): tell a late listener too
      const st = room.state;
      if (type === 'start' && st && st.mid && st.mid === startedMid) {
        queueMicrotask(() => { if (!closed && handlers.get(type)?.has(cb)) cb({ mid: st.mid, t0: st.t0, seed: st.seed }); });
      }
      return () => handlers.get(type)?.delete(cb);
    },

    /** Change my hero / weapon / skins. Locked once I am ready. */
    pick(p) {
      const me = mine();
      if (me === null || room.state.seats[me].rdy) return Promise.resolve(false);
      const map = {};
      for (const k of PICKS) if (typeof p?.[k] === 'string') map[`${R}/p/${me}/${k}`] = s20(p[k]);
      return Object.keys(map).length ? done(tp.update(map)) : Promise.resolve(false);
    },
    ready(on = true) {
      const me = mine();
      if (me === null) return Promise.resolve(false);
      return done(tp.set(`${R}/p/${me}/rdy`, on ? room.state.rn + 1 : 0));
    },
    /** Ask for another round. `ready: true` also readies me as soon as the room is back in the lobby. */
    rematch({ ready = false } = {}) {
      const me = mine();
      if (me === null) return Promise.resolve(false);
      wantReady = !!ready;
      return done(tp.set(`${R}/p/${me}/rm`, room.state.rn + 1));
    },

    /** Lowest seat only: write the match record, then flip the room to live (SPEC4 5.2 step 3). */
    async start() {
      const state = room.state;
      const seated = state ? state.seats.filter(Boolean) : [];
      if (starting || !state || state.st !== 'lobby' || state.me === null || seated.length < 2) return false;
      starting = true;
      let ok = false;
      try {
        const mid = tp.newId();
        const trs = await Promise.all(seated.map((s) => tp.get(`users/${s.uid}/tr`).catch(() => null)));
        const u = {}, us = {}, tr = {};
        seated.forEach((s, i) => { u[s.slot] = s.uid; us[s.uid] = s.slot; if (typeof trs[i] === 'number') tr[s.slot] = trs[i]; });
        await tp.set(`matches/${mid}`, { code, k: state.k, ts: TS, u, us, tr });
        pendingMid = mid; // do not act on my own optimistic echo before the server has agreed
        await tp.update({ [`${R}/st`]: 'live', [`${R}/mid`]: mid, [`${R}/mts`]: TS, [`${R}/ts`]: TS });
        ok = true;
      } catch (e) {
        // usually a seat changed between reading and writing; try again shortly if everyone is still ready
        holdStart = true;
        clock.after(1000, () => { holdStart = false; dirty(); });
        if (!isDenied(e)) emit('error', e);
      }
      pendingMid = null;
      starting = false;
      dirty();
      return ok;
    },

    /** Give up my seat (or my watcher marker) and stop listening. */
    async leave() {
      if (closed) return;
      const me = mySlot();
      for (const g of guards) g.cancel();
      guards = [];
      try {
        if (me !== null) {
          const alone = !Object.keys(raw.sl).some((i) => raw.sl[i] && raw.sl[i] !== uid);
          const seat = { [`${R}/p/${me}`]: null, [`${R}/sl/${me}`]: null };
          if (alone && raw.h === uid) await tp.remove(R).catch(() => tp.update(seat));
          else await tp.update(seat);
        } else if (raw.sp[uid]) {
          await tp.remove(`${R}/sp/${uid}`);
        }
      } catch (e) { /* offline: onDisconnect or the 2 hour rule tidies up */ }
      room.close();
    },
    /** Stop listening without giving up the seat. */
    close() {
      closed = true;
      for (const off of offs.splice(0)) off();
      handlers.clear();
    },

    // --- used by createRoom / joinRoom ---
    _raw: raw,
    _slot: mySlot,
    _sync() { if (!closed) step(); },
    async _load() {
      const watch = (key, dflt) => new Promise((res) => {
        offs.push(tp.on(`${R}/${key}`, 'value', (v) => { raw[key] = v === null ? dflt : v; res(); dirty(); }, null, () => res()));
      });
      const first = [watch('st', null), watch('mid', null), watch('rn', 0), watch('sl', {}), watch('p', {}), watch('sp', {})];
      const all = Promise.all([tp.get(`${R}/h`), tp.get(`${R}/k`), tp.get(`${R}/max`), ...first]);
      const [h, k, max] = await new Promise((res, rej) => {
        const cancel = clock.after(NET.connectMs, () => rej(netError('timeout', 'the room did not load')));
        all.then((v) => { cancel(); res(v); }, (e) => { cancel(); rej(e); });
      });
      raw.h = h; raw.k = k; raw.max = max === 4 ? 4 : 2;
      offs.push(tp.onStatus(() => { guardSeat = null; guards = []; dirty(); }));
      loaded = true;
      step();
    },
  };
  return room;
}

/**
 * createRoom({ transport, profile, picks, kind, max, rand, clock, autoStart }) -> room
 * Writes the whole room with me in seat 0; a taken code is retried up to 5 times.
 * Throws err.code 'no-code' when none could be made (also what a banned player gets).
 */
export async function createRoom({ transport: tp, uid = tp.uid, profile, picks, kind = 'friend', max = 2, rand = Math.random, ...opts }) {
  for (let i = 0; i < NET.seatTries; i++) {
    const code = makeCode(rand);
    try {
      await tp.set(`rooms/${code}`, { h: uid, k: kind, max: max === 4 ? 4 : 2, ts: TS, st: 'lobby', rn: 0, sl: { 0: uid }, p: { 0: seatData(profile, picks) } });
    } catch (e) {
      if (isDenied(e)) continue;
      throw e;
    }
    const room = makeRoom(tp, code, uid, opts);
    await room._load();
    return room;
  }
  throw netError('no-code', 'could not make a room');
}

/**
 * joinRoom({ transport, code, profile, picks, watch, clock, autoStart }) -> room
 * Takes the lowest empty seat; when the room is full or already playing (or watch is true) joins as a
 * watcher (state.watching). Throws err.code 'not-found' for a wrong code, 'full' when 4 already watch.
 */
export async function joinRoom({ transport: tp, uid = tp.uid, code, profile, picks, watch = false, ...opts }) {
  const cc = String(code || '').trim().toUpperCase();
  if (!CODE_RE.test(cc)) throw netError('not-found', 'no such room');
  const room = makeRoom(tp, cc, uid, opts);
  const raw = room._raw;
  const R = `rooms/${cc}`;
  try {
    await room._load();
    if (!raw.h || raw.st === null) throw netError('not-found', 'no such room');
    if (room._slot() === null) {
      let seated = false;
      if (!watch && raw.st === 'lobby') {
        for (let i = 0; i < raw.max && !seated; i++) {
          if (raw.sl[i]) continue;
          try {
            const r = await tp.tx(`${R}/sl/${i}`, (cur) => (cur === null ? uid : undefined));
            if (r.committed && r.value === uid) {
              seated = true;
              await tp.set(`${R}/p/${i}`, seatData(profile, picks));
            }
          } catch (e) {
            if (!isDenied(e)) throw e; // denied: the room went live or the seat is not for me
          }
        }
      }
      if (!seated) {
        if (!raw.sp[uid] && Object.keys(raw.sp).length >= NET.maxWatchers) throw netError('full', 'the room is full');
        await tp.set(`${R}/sp/${uid}`, true);
        tp.onDisconnect(`${R}/sp/${uid}`, null);
      }
    }
  } catch (e) {
    room.close();
    throw e;
  }
  room._sync();
  return room;
}
