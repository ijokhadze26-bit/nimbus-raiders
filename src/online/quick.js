// QUICK MATCH, the network side (SPEC4 §8, STAGE3 "The queue"): a ticket in the queue, pairing with another ticket,
// the 10 s bot fallback and the day meter. No DOM, no game: quickflow.js turns what this reports into screens.
//
//   const q = createQuick({ transport, profile, picks, cfg, clock, rand })
//   q.start()      a new search (the seconds counter starts now)          q.resume()  give up a pairing, search on
//   q.cancel()     -> Promise (never waits longer than NET.leaveMs): no ticket, no room, no listener, no timer left
//   q.state        { phase: 'search'|'claim'|'wait'|'paired'|'bot'|'off', since, code, rival, why, busy }
//                  since = clock ms of the tap; rival = the rival's room seat once paired; busy = meter > cfg.dayCap
//   q.on('change' | 'paired' (room) | 'bot' ({ why }), cb) -> off      q.open() -> what is still held (tests)
//   why: 'alone' (nobody came in 10 s) | 'nofill' (a ticket I claimed never sat down) | 'busy' (meter > 2 x dayCap)
//        | 'offline' (no connection at the 10 s mark) | 'lost' (a pairing fell through after the 10 s mark)
//
// How a search goes (the rules in config/firebase decide every race; nothing here trusts the other client):
// - My ticket queue/{me} = { tr, ts: TS } with onDisconnect remove; I listen to it and to the 10 oldest tickets.
// - A CANDIDATE is an older ticket with no `m`, not stale, and compatible (trophies within trBand, or either side
//   has waited anyAfterMs). I make a quick room for the oldest one first, then set its `m` = { by: me, code }.
//   Denied = somebody else got there first (or my own ticket was claimed meanwhile): my room goes, I go on.
//   One attempt at a time, one every retryMs (each makes a room).
// - My own `m` appears with a code: I join that room's seat 1 (only I may sit there), then my ticket goes.
//   A room that is gone: back in line with a fresh ticket (or a bot, after botAtMs).
// - At botAtMs my unclaimed ticket is marked { by: me, bot: true } in a transaction (nobody can claim it while I
//   switch), then removed: 'bot'. A claim that landed first aborts it: I join that room instead.
// - A claimer whose room has no seat 1 after fillMs takes a bot ('nofill'). Paired but not live after startMs, or
//   the rival's seat empties: the room goes and the search goes on (the counter keeps running).
// Once the paired room's match is on (room state mid), this lets go of it (phase 'off', why 'live'): it is the flow's.
//
// The day meter (SPEC4 §14): readMeter() at the start of every search; countMatch() is called by the flow for every
// human match (friend or quick) and adds 1 from the lowest seat; matchCfg() gives a busy day's slower flush.
import { NET } from './config.js';
import { TS, isDenied, netError, realClock } from './transport.js';
import { createRoom, joinRoom } from './room.js';

export const QUICK = {
  listen: 10,          // tickets in the query (rules: limitToFirst <= 10)
  trBand: 300,         // compatible within this many trophies...
  anyAfterMs: 5000,    // ...or anyone once either ticket has waited this long
  staleMs: 20000,      // a ticket older than this is ignored (its owner is gone)
  retryMs: 500,        // at most one claim attempt this often (each makes a room)
  botAtMs: 10000,      // my ticket still unclaimed: take a bot
  fillMs: 4000,        // a room I claimed for has no seat 1 after this: give it up, take a bot
  startMs: 6000,       // paired but the room not live after this: give it up, search again
  busyBotMs: [3000, 6000],  // a bots-only day (meter > 2 x dayCap): the bot comes after this long
  meterMs: 1500,       // reading the day meter waits at most this long (missing = 0)
  busyFlushMs: 500,    // flush2 for a match started on a busy day (meter > dayCap)
  lookMs: 250,         // how often the candidates are looked at again (compatibility grows with time)
  markMs: 2000,        // the bot marker transaction waits at most this long (then: offline)
  foundMs: 1500,       // RIVAL FOUND! shows at least this long before a paired player is READY (quickflow.js)
};

const QUERY = { orderBy: 'child', child: 'ts', limitToFirst: QUICK.listen };
const quiet = (p) => { if (p && p.catch) p.catch(() => {}); return p; };
const within = (clock, ms, p, what) => new Promise((res, rej) => {
  const cancel = clock.after(ms, () => rej(netError('timeout', what)));
  p.then((v) => { cancel(); res(v); }, (e) => { cancel(); rej(e); });
});
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

// ------------------------------------------------------------------ the day meter
const pad = (n) => String(n).padStart(2, '0');
/** meter/dYYYYMMDD of a server time (UTC). */
export const meterKey = (ms) => { const d = new Date(ms); return `d${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
/** Human matches started today (0 when missing, unreadable or slower than meterMs). */
export function readMeter(tp, clock = realClock) {
  return within(clock, QUICK.meterMs, tp.get(`meter/${meterKey(tp.now())}`), 'meter').then(int, () => 0);
}
/** One more human match today (the rules allow exactly +1 per write). */
export function bumpMeter(tp) {
  return tp.tx(`meter/${meterKey(tp.now())}`, (cur) => int(cur) + 1).then((r) => !!r.committed, () => false);
}
/** The flow calls this for every human match it starts: only the lowest seat counts it. */
export function countMatch(tp, link) {
  if (!link || link.slot === null || link.slot === undefined || !link.mid) return Promise.resolve(false);
  const slots = Array.isArray(link.slots) && link.slots.length ? link.slots : [link.slot];
  return link.slot === Math.min(...slots) ? bumpMeter(tp) : Promise.resolve(false);
}
/** The match cfg of a search that saw a busy day: states sent every busyFlushMs (never faster than cfg says). */
export const matchCfg = (cfg = {}, busy = false) => (busy ? { ...cfg, flush2: Math.max(Number(cfg.flush2) || 0, QUICK.busyFlushMs) } : cfg);

// ------------------------------------------------------------------ the queue
export function createQuick({ transport: tp, uid = tp.uid, profile, picks, cfg = {}, clock = realClock, rand = Math.random }) {
  const T = `queue/${uid}`;
  const handlers = new Map();
  const state = { phase: 'off', since: 0, code: null, rival: null, why: null, busy: false };
  let run = 0;               // one search, from start() to cancel(): everything older is ignored
  let subs = [];             // transport listeners of the search
  let timers = [];           // timers of the search: { off, kind }
  let od = null, ticketOn = false, myTr = int(profile && profile.tr), reread = false;
  let myTs = null, myM = null, tickets = null;
  let attempt = false, joining = false, marking = false, lastTry = -Infinity;
  const tried = new Set();
  let room = null, roomOff = null, rivalUid = null;
  const stats = { claims: 0, denied: 0, joins: 0, tickets: 0, marks: 0, aborted: 0 }; // (tests)

  const emit = (type, arg) => { for (const cb of [...(handlers.get(type) || [])]) { try { cb(arg); } catch (e) { console.error(e); } } };
  const setPhase = (ph) => { state.phase = ph; emit('change', state); };
  const waited = () => clock.now() - state.since;
  const dueBot = () => waited() >= QUICK.botAtMs;
  const after = (ms, fn, kind) => { const t = { kind, off: null }; t.off = clock.after(ms, () => { timers = timers.filter((x) => x !== t); fn(); }); timers.push(t); return t; };
  const clear = (kind) => { for (const t of timers.filter((x) => !kind || x.kind === kind)) t.off(); timers = kind ? timers.filter((x) => x.kind !== kind) : []; };

  // ---------------- my ticket ----------------
  function writeTicket(r) {
    ticketOn = true;
    myTs = null; myM = null;
    if (!od) od = tp.onDisconnect(T, null);
    stats.tickets++;
    tp.set(T, { tr: myTr, ts: TS }).catch(async (e) => {
      if (r !== run || !ticketOn || !isDenied(e)) return;
      // my trophies changed on the server (the rules want them equal): read them once and try again
      if (reread) { toBot('lost'); return; }
      reread = true;
      myTr = int(await tp.get(`users/${uid}/tr`).catch(() => myTr));
      if (r === run && ticketOn && state.phase === 'search') writeTicket(r);
    });
  }
  function dropTicket() {
    if (!ticketOn && !od) return Promise.resolve();
    ticketOn = false;
    myTs = null; myM = null;
    const keep = od;
    // the onDisconnect stays until the remove has landed (a page closed while offline still loses its ticket);
    // it is not cancelled when a new ticket wanted it again meanwhile (the same path, the same job)
    return tp.remove(T).then(() => { if (!ticketOn && od === keep && od) { od.cancel(); od = null; } }, () => {});
  }

  // ---------------- searching ----------------
  function search(r) {
    setPhase('search');
    subs.push(tp.on(T, 'value', (v) => onMine(r, v)));
    subs.push(tp.on('queue', 'value', (v) => { if (r === run) { tickets = v; look(r); } }, QUERY, () => {}));
    timers.push({ kind: 'look', off: clock.every(QUICK.lookMs, () => look(r)) });
    writeTicket(r);
  }
  /** Out of the line: no ticket, no queue listener. */
  function unsearch() {
    for (const off of subs.splice(0)) off();
    clear('look');
    tickets = null;
    return dropTicket();
  }

  function onMine(r, v) {
    if (r !== run || !ticketOn) return;
    myTs = v && typeof v.ts === 'number' ? v.ts : null;
    myM = v && v.m && typeof v.m === 'object' ? v.m : null;
    if (myM && typeof myM.code === 'string' && myM.by !== uid) waiter(r);
  }

  function compatible(v, now) {
    return Math.abs(int(v.tr) - myTr) <= QUICK.trBand || now - v.ts >= QUICK.anyAfterMs || waited() >= QUICK.anyAfterMs;
  }

  function look(r) {
    if (r !== run || state.phase !== 'search' || attempt || joining || marking) return;
    if (dueBot()) { botNow(r); return; }
    if (myTs === null || myM || !tickets || clock.now() - lastTry < QUICK.retryMs) return;
    const now = tp.now();
    let best = null;
    for (const [k, v] of Object.entries(tickets)) {
      if (k === uid || !v || typeof v.ts !== 'number' || v.m) continue;
      if (!(v.ts < myTs) || v.ts <= now - QUICK.staleMs || tried.has(`${k}:${v.ts}`) || !compatible(v, now)) continue;
      if (!best || v.ts < best.v.ts) best = { k, v };
    }
    if (best) claim(r, best.k, best.v);
  }

  async function claim(r, them, v) {
    const key = `${them}:${v.ts}`;
    attempt = true; lastTry = clock.now(); tried.add(key);
    stats.claims++;
    let made = null;
    try {
      made = await createRoom({ transport: tp, uid, profile, picks, kind: 'quick', max: 2, madeFor: them, rand, clock });
    } catch { attempt = false; tried.delete(key); return; } // no room this time: the next look may try that ticket again
    const stale = () => r !== run || state.phase !== 'search';
    if (stale() || myM) { attempt = false; quiet(made.leave()); if (!stale()) waiter(r); return; }
    let won = false;
    try {
      await within(clock, NET.connectMs, tp.set(`queue/${them}/m`, { by: uid, code: made.code }), 'claim');
      won = true;
    } catch (e) { if (isDenied(e)) stats.denied++; }
    attempt = false;
    if (!won || stale()) {
      quiet(made.leave()); // (a host leaving a lobby removes it)
      if (stale()) return;
      if (myM) waiter(r);
      else if (dueBot()) botNow(r);
      return;
    }
    unsearch();
    room = made; rivalUid = them; state.code = made.code;
    setPhase('claim');
    after(QUICK.fillMs, () => { if (r === run && state.phase === 'claim') toBot('nofill'); }, 'fill');
    watch(r, made);
  }

  async function waiter(r) {
    if (r !== run || state.phase !== 'search' || attempt || joining || marking || !myM) return;
    const code = myM.code;
    joining = true; state.code = code;
    setPhase('wait');
    let jr = null;
    try { jr = await joinRoom({ transport: tp, uid, code, profile, picks, clock }); } catch { jr = null; }
    joining = false;
    if (r !== run) { if (jr) quiet(jr.leave()); return; }
    if (!jr || jr.state.me === null || jr.state.k !== 'quick') {
      // no seat for me there (the room is gone, or it was not made for me): back in line, or a bot by now
      if (jr) quiet(jr.leave());
      stats.joins++;
      state.code = null;
      if (dueBot()) { toBot('lost'); return; }
      for (const off of subs.splice(0)) off();
      clear('look');
      dropTicket();
      search(r);
      return;
    }
    stats.joins++;
    unsearch();
    room = jr; rivalUid = jr.state.host;
    watch(r, jr);
  }

  // ---------------- the room of a pairing ----------------
  function watch(r, rm) {
    roomOff = rm.on('change', (st) => onRoom(r, rm, st));
    onRoom(r, rm, rm.state);
  }
  function onRoom(r, rm, st) {
    if (r !== run || rm !== room || !st) return;
    const rival = st.seats.find((s) => s && s.uid === rivalUid) || null;
    const broken = st.gone || st.me === null;
    if (state.phase === 'claim' || state.phase === 'wait') {
      if (broken) { if (state.phase === 'claim') toBot('nofill'); else resume(); return; }
      if (!rival) return;
      clear('fill');
      state.rival = rival;
      setPhase('paired');
      after(QUICK.startMs, () => { if (r === run && room === rm && state.phase === 'paired') resume(); }, 'start');
      emit('paired', rm);
      return;
    }
    if (state.phase !== 'paired') return;
    if (st.st === 'live' && st.mid) { release(); return; }
    if (broken || !rival) { resume(); return; }
    if (rival !== state.rival) { state.rival = rival; emit('change', state); }
  }
  /** The match of the paired room is on: from now on the room belongs to the flow. */
  function release() {
    if (roomOff) { roomOff(); roomOff = null; }
    room = null;
    clear();
    run++;
    state.why = 'live';
    setPhase('off');
  }
  function leaveRoom() {
    if (roomOff) { roomOff(); roomOff = null; }
    const rm = room;
    room = null; rivalUid = null; state.rival = null; state.code = null;
    return rm ? rm.leave().catch(() => {}) : Promise.resolve();
  }

  // ---------------- a bot ----------------
  async function botNow(r) {
    if (r !== run || state.phase !== 'search' || marking) return;
    if (tp.status() !== 'on') { toBot('offline'); return; }
    if (myTs === null) { toBot('alone'); return; } // my ticket never landed: nobody can claim it anyway
    marking = true;
    let res = null;
    try {
      res = await within(clock, QUICK.markMs, tp.tx(`${T}/m`, (cur) => (cur === null ? { by: uid, bot: true } : undefined)), 'mark');
    } catch { res = null; }
    marking = false;
    if (r !== run || state.phase !== 'search') return;
    if (!res) { toBot(tp.status() === 'on' ? 'alone' : 'offline'); return; }
    stats.marks++;
    if (res.committed) { toBot('alone'); return; }
    stats.aborted++;
    const m = res.value && typeof res.value === 'object' ? res.value : null;
    if (m && typeof m.code === 'string' && m.by !== uid) { myM = m; waiter(r); return; } // a claim landed first
    toBot('alone');
  }
  function toBot(why) {
    unsearch();
    leaveRoom();
    clear();
    state.why = why;
    setPhase('bot');
    emit('bot', { why });
  }

  /** Give up the current pairing (if any) and search on; the counter keeps running. */
  function resume() {
    if (state.phase === 'off' || state.phase === 'bot') return;
    const r = run;
    clear('fill'); clear('start');
    leaveRoom();
    if (dueBot()) { toBot('lost'); return; }
    if (state.phase !== 'search' || !ticketOn) { for (const off of subs.splice(0)) off(); clear('look'); search(r); }
  }

  async function begin(r) {
    const n = await readMeter(tp, clock);
    if (r !== run) return;
    const cap = int(cfg && cfg.dayCap);
    state.busy = n > cap;
    if (n > 2 * cap) { // a bots-only day: no ticket at all
      const [a, b] = QUICK.busyBotMs;
      after(a + rand() * (b - a), () => { if (r === run) toBot('busy'); }, 'busy');
      return;
    }
    after(Math.max(0, QUICK.botAtMs - waited()), () => look(r), 'bot');
    search(r);
  }

  const q = {
    state,
    stats,
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => handlers.get(type)?.delete(cb);
    },
    start() {
      if (state.phase !== 'off' && state.phase !== 'bot') return false;
      run++;
      tried.clear();
      Object.assign(state, { since: clock.now(), code: null, rival: null, why: null, busy: false });
      reread = false; lastTry = -Infinity;
      setPhase('search');
      begin(run);
      return true;
    },
    resume,
    cancel() {
      const live = state.phase !== 'off' || ticketOn || !!od || !!room;
      run++;
      for (const off of subs.splice(0)) off();
      clear();
      const waits = [dropTicket(), leaveRoom()];
      attempt = false; joining = false; marking = false;
      if (state.phase !== 'off') { state.why = 'cancel'; setPhase('off'); }
      if (!live) return Promise.resolve();
      return within(clock, NET.leaveMs, Promise.all(waits), 'cancel').catch(() => {});
    },
    /** What this still holds (tests: nothing may be left after cancel). */
    open: () => ({ subs: subs.length, timers: timers.length, room: !!room, ticket: ticketOn, od: !!od }),
  };
  return q;
}
