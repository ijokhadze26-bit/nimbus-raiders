// Friend rooms: create, join by code, seats, picks, ready, start, rematch, leave (SPEC4 5.1, 5.2, 5.8).
//
//   const room = await createRoom({ transport, profile, picks })            // I am seat 0 and the host
//   const room = await joinRoom({ transport, code, profile, picks, watch }) // lowest empty seat; watch: true = a watcher
//   room.on('change', (state) => ...)   room.on('start', ({ mid, t0, seed }) => ...)   room.on('error', (e) => ...)
//   room.pick({ he, we, hs, ws })   room.ready(true)   room.rematch({ ready })   room.leave()
//
//   state = { code, k, max, st, host, me: slot|null, seats: [{ slot, uid, n, he, we, hs, ws, tr, rdy, rm } | null],
//             spectators, mid, t0, seed, rn,   + players, hostLeft, watching, lost, gone }
//
// - `mid`, `t0`, `seed`, `players` are null until the match record has been read from the server, then
//   appear together ('start' fires at the same moment; a listener added later is told as well).
//   t0 = record ts + 4000, seed = hash32(ts, mid). While st is 'live' and mid is still null: wait.
// - `players` ([{ slot, uid, n, he, we, hs, ws, tr }]) is who is IN the live match: it comes from the match
//   record, not from the seats. match.js builds the link from it, so everyone has the same list even when
//   a seat appears or disappears around the start.
// - A SEAT IS PRESENCE. It is held with onDisconnect the whole time (lobby and match), so a closed tab
//   or a dead connection frees it and nobody waits for a ghost. When my seat goes while I am still here
//   (the service drops it on every reconnect), I take it back and write my picks and ready flag again:
//   the old seat if it is free, else the lowest free one; during a match only a player of that match
//   can come back. `lost` is true when that did not work (the room filled up or started without me).
// - Ready and rematch are stored as the round they belong to (rn + 1), so an old "ready" can never
//   start the next round by accident and nobody has to clear another player's seat. `rdy` / `rm` in the
//   state are plain booleans for the current round.
// - The lowest seat starts the match when everyone seated (2 or more) is ready, and turns the room back
//   to the lobby (rn + 1) when everyone still seated asked for a rematch (the rules allow that once the
//   match is over). rematch({ ready: true }) also readies me for the new round. (A player left alone on the
//   result screen is kept from being started on by a newcomer in flow.js, not here.)
// - The host leaving a lobby removes the whole room (the guests read `gone`): `hostLeft` therefore means the
//   host's seat is empty for another reason, usually a dropped connection (they may come back). Joining a
//   lobby whose host is not seated is refused: 'closed' when nobody sits there (it is removed), else 'hostaway'.
// - createRoom first reserves the code under host/{uid} (the rules allow one hosted room per account).

import { NET, CODE_RE } from './config.js';
import { TS, hash32, isDenied, netError, realClock } from './transport.js';
import { censor, makeCode } from './names.js';

const PICKS = ['he', 'we', 'hs', 'ws'];
const s20 = (v) => (typeof v === 'string' ? v.slice(0, 20) : '');
const quiet = (p) => { p.catch(() => {}); };

function seatData(profile, picks) {
  const out = { n: s20(profile?.n || 'Raider'), tr: Math.max(0, Math.round(Number(profile?.tr) || 0)) };
  for (const k of PICKS) out[k] = s20(picks?.[k]);
  return out;
}
const shown = (slot, uid, p = {}) => ({ slot, uid, n: p.n ? censor(p.n) : '', he: p.he || '', we: p.we || '', hs: p.hs || '', ws: p.ws || '', tr: p.tr || 0 });

/** Wait for `p`, but not longer than `ms`: rejects with err.code 'timeout' (an offline write never settles). */
const within = (clock, ms, p, what) => new Promise((res, rej) => {
  const cancel = clock.after(ms, () => rej(netError('timeout', what)));
  p.then((v) => { cancel(); res(v); }, (e) => { cancel(); rej(e); });
});

function makeRoom(tp, code, uid, { clock = realClock, autoStart = true } = {}) {
  const R = `rooms/${code}`;
  const raw = { h: null, k: null, max: 2, st: null, mid: null, rn: 0, sl: {}, p: {}, sp: {} };
  const handlers = new Map();
  const offs = [];
  let closed = false, loaded = false, queued = false;
  let derived = null;        // { mid, ts, t0, seed, players } of the live match, read from the server
  let fetching = null, pendingMid = null, startedMid = null;
  let starting = false, turning = false, holdStart = false, wantReady = false, lastRn = null;
  let guardSeat = null, guards = [];
  let spectating = false, stopTouch = null;
  let held = null, reseating = false, holdSeat = false, lost = false; // my seat as I last had it: { slot, data }

  const emit = (type, arg) => {
    for (const cb of [...(handlers.get(type) || [])]) { try { cb(arg); } catch (e) { console.error(e); } }
  };
  const mySlot = () => {
    for (let i = 0; i < raw.max; i++) if (raw.sl[i] === uid) return i;
    return null;
  };
  const sameSeats = (u) => [0, 1, 2, 3].every((i) => (raw.sl[i] || null) === (u[i] || null));

  function build() {
    const rn = raw.rn || 0;
    const seats = [];
    for (let i = 0; i < raw.max; i++) {
      const u = raw.sl[i];
      const p = raw.p[i] || {};
      seats.push(u ? { ...shown(i, u, p), rdy: p.rdy === rn + 1, rm: p.rm === rn + 1 } : null);
    }
    const me = mySlot();
    const live = raw.st === 'live' && !!derived && derived.mid === raw.mid;
    if (live) { // keep the players' looks fresh while their seats are there; remember them when a seat drops
      derived.players = derived.players.map((pl) => (raw.sl[pl.slot] === pl.uid && raw.p[pl.slot] ? shown(pl.slot, pl.uid, raw.p[pl.slot]) : pl));
    }
    return {
      code, k: raw.k, max: raw.max, st: raw.st, host: raw.h, me, seats,
      spectators: Object.keys(raw.sp).length,
      mid: live ? derived.mid : null, t0: live ? derived.t0 : null, seed: live ? derived.seed : null,
      players: live ? derived.players : null,
      rn,
      hostLeft: raw.st === 'lobby' && !!raw.h && !Object.values(raw.sl).includes(raw.h),
      watching: me === null && raw.sp[uid] === true,
      lost: me === null && lost,
      gone: raw.st === null,
    };
  }

  function fetchMatch(mid) {
    if (fetching === mid) return;
    fetching = mid;
    tp.get(`matches/${mid}`).then((rec) => {
      fetching = null;
      if (closed || raw.mid !== mid || raw.st !== 'live') return;
      if (!rec || rec.code !== code || typeof rec.ts !== 'number' || !rec.u) { clock.after(600, dirty); return; }
      const players = Object.keys(rec.u).map(Number).sort((a, b) => a - b)
        .map((i) => shown(i, rec.u[i], raw.sl[i] === rec.u[i] ? raw.p[i] : undefined));
      derived = { mid, ts: rec.ts, t0: rec.ts + NET.goMs, seed: hash32(rec.ts, mid), players };
      dirty();
    }, () => { fetching = null; if (!closed) clock.after(600, dirty); });
  }

  // Hold my seat with onDisconnect for as long as I sit in it: a seat is presence.
  function syncGuard(state) {
    const want = state.me !== null && tp.status() === 'on' ? state.me : null;
    if (want === guardSeat) return;
    for (const g of guards) g.cancel();
    guards = [];
    guardSeat = want;
    if (want !== null) guards = [tp.onDisconnect(`${R}/p/${want}`, null), tp.onDisconnect(`${R}/sl/${want}`, null)];
  }

  // My seat went although I did not leave (the connection dropped): take it back, picks and ready included.
  function seatBack() {
    if (!held || lost || reseating || holdSeat || closed || raw.st === null || tp.status() !== 'on') return;
    const inMatch = raw.st === 'live';
    if (inMatch && !derived) return;                                         // not known yet: step() runs again
    if (inMatch && !derived.players.some((pl) => pl.uid === uid && pl.slot === held.slot)) { lost = true; dirty(); return; } // it began without me
    reseating = true;
    const want = held;
    const order = [want.slot];
    for (let i = 0; i < raw.max && !inMatch; i++) if (i !== want.slot) order.push(i);
    (async () => {
      let got = null;
      for (const i of order) {
        if (raw.sl[i] && raw.sl[i] !== uid) continue;
        try {
          const r = await tp.tx(`${R}/sl/${i}`, (cur) => (cur === null ? uid : undefined));
          if (r.value === uid) { got = i; break; }
        } catch (e) { if (!isDenied(e)) throw e; }
      }
      if (got === null) lost = true;                                         // every seat is taken
      else await tp.set(`${R}/p/${got}`, want.data);
    })().catch(() => { holdSeat = true; clock.after(1000, () => { holdSeat = false; dirty(); }); })
      .then(() => { reseating = false; dirty(); });
  }

  function auto(state) {
    const seated = state.seats.filter(Boolean);
    if (state.me === null || !seated.length || seated[0].slot !== state.me || tp.status() !== 'on') return;
    if (state.st === 'lobby' && autoStart && !starting && !holdStart && seated.length >= 2 && seated.every((s) => s.rdy)) {
      room.start();
    } else if (state.st === 'live' && !turning && seated.every((s) => s.rm)) {
      turning = true; // refused while the match is still on: ask again a little later
      tp.update({ [`${R}/st`]: 'lobby', [`${R}/rn`]: state.rn + 1 })
        .then(() => { turning = false; }, () => { clock.after(1500, () => { turning = false; dirty(); }); });
    }
  }

  function step() {
    if (raw.st !== 'live') derived = null;
    else if (raw.mid && raw.mid !== pendingMid && (!derived || derived.mid !== raw.mid)) { derived = null; fetchMatch(raw.mid); }
    const state = build();
    room.state = state;
    if (state.me !== null && raw.p[state.me]) { held = { slot: state.me, data: { ...raw.p[state.me] } }; lost = false; }
    if (lastRn !== null && state.rn !== lastRn && wantReady && state.me !== null) { wantReady = false; room.ready(true); }
    lastRn = state.rn;
    syncGuard(state);
    emit('change', state);
    if (state.mid && state.mid !== startedMid) {
      startedMid = state.mid;
      emit('start', { mid: state.mid, t0: state.t0, seed: state.seed });
    }
    if (state.me === null) seatBack();
    auto(state);
  }

  function dirty() {
    if (queued || closed) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!closed && loaded) step(); });
  }

  // A lobby that stays open keeps its code: the lowest seat refreshes the room's ts now and then.
  function touch() {
    stopTouch = clock.after(NET.touchMs, touch);
    const seated = room.state ? room.state.seats.filter(Boolean) : [];
    if (seated.length && seated[0].slot === room.state.me && tp.status() === 'on') quiet(tp.set(`${R}/ts`, TS));
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
      let ok = false, written = null;
      try {
        const mid = tp.newId();
        const trs = await Promise.all(seated.map((s) => tp.get(`users/${s.uid}/tr`).catch(() => null)));
        const u = {}, us = {}, tr = {};
        seated.forEach((s, i) => { u[s.slot] = s.uid; us[s.uid] = s.slot; if (typeof trs[i] === 'number') tr[s.slot] = trs[i]; });
        await tp.set(`matches/${mid}`, { code, k: state.k, ts: TS, u, us, tr });
        written = mid;
        pendingMid = mid; // do not act on my own optimistic echo before the server has agreed
        // a seat came or went while the record was on its way: it no longer describes the room (the
        // rules refuse the update below for the same reason when the change lands in between)
        if (!sameSeats(u)) throw netError('seats-changed', 'a seat changed during the start');
        await tp.update({ [`${R}/st`]: 'live', [`${R}/mid`]: mid, [`${R}/mts`]: TS, [`${R}/ts`]: TS });
        ok = true;
      } catch (e) {
        // usually a seat changed between reading and writing; try again shortly if everyone is still ready
        if (written) quiet(tp.remove(`matches/${written}`)); // the unused record is tidied away
        holdStart = true;
        clock.after(1000, () => { holdStart = false; dirty(); });
        if (!isDenied(e) && e.code !== 'seats-changed') emit('error', e);
      }
      pendingMid = null;
      starting = false;
      dirty();
      return ok;
    },

    /** Give up my seat (or my watcher marker) and stop listening. Never waits long: offline, the write
     *  is sent when the network is back (and onDisconnect has freed the seat by then anyway). */
    async leave() {
      if (closed) return;
      const me = mySlot();
      const watching = raw.sp[uid] === true;
      for (const g of guards) g.cancel();
      guards = [];
      room.close(); // first: nothing more reaches a screen the player has left
      let write = null;
      if (me !== null) {
        const seat = { [`${R}/p/${me}`]: null, [`${R}/sl/${me}`]: null };
        // the last one out also removes the room (the rules let anyone clear a room nobody sits in)
        const free = () => tp.update(seat).then(() => tp.get(`${R}/sl`)).then((sl) => (sl ? null : tp.remove(R)));
        // the host leaving a lobby closes it for everyone (refused when it went live meanwhile: then only my seat goes)
        write = raw.h === uid && raw.st === 'lobby' ? tp.remove(R).catch(free) : free();
      } else if (watching) {
        write = tp.remove(`${R}/sp/${uid}`);
      }
      if (write) await within(clock, NET.leaveMs, write, 'leave').catch(() => {});
    },
    /** Stop listening without giving up the seat. */
    close() {
      closed = true;
      if (stopTouch) stopTouch();
      for (const off of offs.splice(0)) off();
      handlers.clear();
    },

    // --- used by createRoom / joinRoom ---
    _raw: raw,
    _slot: mySlot,
    _sync() { if (!closed) step(); },
    /** I am a watcher: keep my marker for as long as I am connected (a reconnect drops it, so it is put back). */
    _watching() {
      spectating = true;
      tp.onDisconnect(`${R}/sp/${uid}`, null);
      return tp.set(`${R}/sp/${uid}`, true);
    },
    async _load() {
      const watch = (key, dflt) => new Promise((res) => {
        offs.push(tp.on(`${R}/${key}`, 'value', (v) => { raw[key] = v === null ? dflt : v; res(); dirty(); }, null, () => res()));
      });
      const first = [watch('st', null), watch('mid', null), watch('rn', 0), watch('sl', {}), watch('p', {}), watch('sp', {})];
      const all = Promise.all([tp.get(`${R}/h`), tp.get(`${R}/k`), tp.get(`${R}/max`), ...first]);
      const [h, k, max] = await within(clock, NET.connectMs, all, 'the room did not load');
      raw.h = h; raw.k = k; raw.max = max === 4 ? 4 : 2;
      offs.push(tp.onStatus((s) => { guardSeat = null; guards = []; if (s === 'on' && spectating) room._watching(); dirty(); }));
      loaded = true;
      stopTouch = clock.after(NET.touchMs, touch);
      step();
    },
  };
  return room;
}

/** Point host/{uid} at `code`. Refused while I still sit in the room I hosted before (a reload, a tab
 *  that was closed mid-match): let go of that seat first, then try once more. */
async function reserve(tp, uid, code) {
  try { await tp.set(`host/${uid}`, code); return; } catch (e) { if (!isDenied(e)) throw e; }
  const old = await tp.get(`host/${uid}`);
  const sl = typeof old === 'string' ? (await tp.get(`rooms/${old}/sl`)) || {} : {};
  const map = {};
  for (const i of Object.keys(sl)) if (sl[i] === uid) { map[`rooms/${old}/p/${i}`] = null; map[`rooms/${old}/sl/${i}`] = null; }
  if (Object.keys(map).length) await tp.update(map);
  await tp.set(`host/${uid}`, code);
}

/**
 * createRoom({ transport, profile, picks, kind, max, madeFor, rand, clock, autoStart }) -> room
 * Reserves a code, then writes the whole room with me in seat 0. A taken code is retried up to 5 times;
 * a room on that code that is 2 hours old or has no seats left is cleared away and the code reused.
 * `madeFor` (quick rooms): the one other player who may take a seat. Throws err.code 'no-code' when no
 * room could be made (also what a banned player gets) and 'timeout' when the service does not answer.
 */
export async function createRoom({ transport: tp, uid = tp.uid, profile, picks, kind = 'friend', max = 2, madeFor = null, rand = Math.random, ...opts }) {
  const clock = opts.clock || realClock;
  for (let i = 0; i < NET.seatTries; i++) {
    const code = makeCode(rand);
    const value = { h: uid, k: kind, max: max === 4 ? 4 : 2, ts: TS, st: 'lobby', rn: 0, sl: { 0: uid }, p: { 0: seatData(profile, picks) } };
    if (kind === 'quick' && madeFor) value.q = String(madeFor);
    let dead = false; // gave up waiting: whatever still lands afterwards is undone
    const make = async () => {
      await reserve(tp, uid, code);
      if (dead) return;
      try { await tp.set(`rooms/${code}`, value); } catch (e) {
        if (!isDenied(e)) throw e;
        await tp.remove(`rooms/${code}`); // refused unless that room is stale or empty
        await tp.set(`rooms/${code}`, value);
      }
      if (dead) quiet(tp.remove(`rooms/${code}`));
    };
    try {
      await within(clock, NET.connectMs, make(), 'the room could not be made');
    } catch (e) {
      if (isDenied(e)) continue;
      dead = true;
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
 * Takes the lowest empty seat. No seat free: throws err.code 'playing' (the room's match is on) or 'full' (a full
 * lobby), and writes nothing. watch: true joins as a watcher instead (state.watching; an `sp` marker, no seat),
 * or throws 'full' when 4 already watch. Throws 'not-found' for a wrong code.
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
    if (room._slot() === null && raw.st === 'lobby' && raw.h !== uid && !Object.values(raw.sl).includes(raw.h)) {
      // the host is not in their lobby: a room nobody sits in is dead (tidied away); else the host's link dropped
      if (!Object.keys(raw.sl).length) { quiet(tp.remove(R)); throw netError('closed', 'the room is closed'); }
      throw netError('hostaway', 'the host is away');
    }
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
      // no seat: only a watch request becomes a watcher (never a marker left behind by a plain join)
      if (!seated && !watch) throw raw.st === 'live' ? netError('playing', 'the match already started') : Object.assign(netError('full', 'the room is full'), { max: raw.max });
      if (!seated) {
        if (!raw.sp[uid] && Object.keys(raw.sp).length >= NET.maxWatchers) throw netError('full', 'too many watchers');
        await room._watching();
      }
    }
  } catch (e) {
    room.close();
    throw e;
  }
  room._sync();
  return room;
}
