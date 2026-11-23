// RANKED Quick Match (online stage 4, STAGE4 "Ranked writes"): the stake at GO, the win claim, the draw, the close,
// the pending stake across reloads and the rank mirror. Every profile write is ONE whole-profile set(users/{uid})
// built from a fresh read of the server's copy (the rules accept nothing else) and goes through one queue, so two
// writes of mine never race. session.js wraps it: session.prepare / stake / claim / close / settle / ranked.
//
//   createRanked({ transport, session, clock, storage, wall }) -> ranked
//   ranked.prepare(match)        'versus:start': fresh profile, the match record, the daily limit
//   ranked.stake(match)          'versus:go' -> { ok, reason: null|'cap'|'offline'|'busy'|'late'|'denied', s }
//   ranked.claim(match, result)  the verdict (provisional ones are skipped) -> { ok, kind: 'win'|'draw'|'close', g, reason }
//   ranked.close(match)          left mid-match: the loss stands, the stake goes -> { ok }
//   ranked.settle()              each connect: a pending win is claimed, anything else of mine closed, rk mirrored
//   ranked.view                  { id, mid, kind, state, why, s, g, tr0, tr, o, at, test: { writes: [{ kind, ok }] } }
//                                state 'none'|'staking'|'staked'|'saving'|'saved'|'failed'; why null|'cap'|'offline'|
//                                'busy'|'late'|'denied'|'pending' (a win left for the next visit)
//   ranked.on(cb) -> off         cb(v) after every change (a write, a state): v = that match's view (v.id = match.t0;
//                                a claim of the last match may settle after the next match began)
//   match = flow.quick.match = { kind: 'human'|'bot', mid, slot, rivalSlot, rivalTr, seed, t0 }
// The pending stake lives in localStorage 'nimbusRaiders.online.stake' = { uid, kind, mid, ms, ts0, a0, a1, res, t10,
// live }; the page that plays the match stamps `live` every 2 s, and nobody else settles it while that stamp is fresh.
import { TS, isDenied, netError, realClock } from './transport.js';
import { NET } from './config.js';
import { quitOut } from './match.js';
import { TROPHY, humanStake, botStake, botGain, humanGain, weekBase, dayOf } from './leagues.js';

export const STAKE_KEY = 'nimbusRaiders.online.stake';
const NUMS = ['tr', 'pk', 'w', 'l', 'st', 'bs', 'bt', 'ws', 'cd', 'cc'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const validProfile = (v) => !!v && typeof v === 'object' && typeof v.n === 'string' && NUMS.every((f) => isNum(v[f]));

/** localStorage, or a private map when it is missing / blocked (Node tests pass their own shared one). */
function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function defaultStore() { try { if (globalThis.localStorage) return globalThis.localStorage; } catch { /* blocked */ } return memoryStore(); }

// ---- the bodies the rules accept (config/firebase/rules.src.mjs, transitions C-F) ----
const base = (D) => { const P = { n: D.n }; for (const f of NUMS) P[f] = D[f]; return P; };
export function stakeBody(D, m, rec) {
  const bot = m.kind === 'bot', s = bot ? botStake(D.tr) : humanStake(D.tr);
  const sk = { a: TS, s, st: D.st, b: bot };
  if (!bot) { const os = 1 - m.slot; Object.assign(sk, { m: m.mid, ms: m.slot, os, o: Number(rec.tr[os]) }); }
  return { ...base(D), tr: D.tr - s, l: D.l + 1, st: 0, sk };
}
export function winBody(D, at, bt) {
  const sk = D.sk, TR0 = D.tr + sk.s, G = sk.b ? botGain(TR0) : humanGain(TR0, sk.o);
  const tr = TR0 + G, WK = weekBase(at), DAY = dayOf(at);
  return { ...base(D), tr, pk: Math.max(D.pk, tr), w: D.w + 1, l: D.l - 1, st: sk.st + 1, bs: Math.max(D.bs, sk.st + 1), bt,
    ws: (D.ws >= WK ? D.ws : WK) + G, cd: DAY, cc: D.cd === DAY ? D.cc + 1 : 1 };
}
export const drawBody = (D) => ({ ...base(D), tr: D.tr + D.sk.s, l: D.l - 1, st: D.sk.st });
export const closeBody = (D, bt) => ({ ...base(D), bt });
/** The highest bt a bot claim / close may write now (rules: <= 3300 and bt * 100 <= now - sk.a + 2000). */
export const botBtCap = (sk, now, margin = 0) => Math.min(NET.maxT10, Math.floor((now - sk.a + 2000 - margin) / 100));

export function createRanked({ transport: tp, session, clock = realClock, storage = defaultStore(), wall = () => Date.now() }) {
  const listeners = new Set();
  const view = { id: null, mid: null, kind: null, state: 'none', why: null, s: 0, g: null, tr0: null, tr: null, o: null, at: null, test: { writes: [] } };
  let chain = Promise.resolve(), cur = null, stampOff = null;
  const R = { view, on(cb) { listeners.add(cb); return () => listeners.delete(cb); }, get clock() { return clock; }, set clock(c) { if (c) clock = c; } };

  const emit = (v = view) => { for (const cb of [...listeners]) { try { cb(v); } catch (e) { console.error(e); } } };
  /** A match's state changed: `view` follows the current match only, listeners hear about every match (by id). */
  const show = (c, patch) => { Object.assign(c.v, patch); if (cur === c) Object.assign(view, c.v); emit(c.v); };
  const uid = () => session.uid;
  const sleep = (ms) => new Promise((r) => clock.after(Math.max(0, ms), r));
  /** Until the server-synced clock reaches `at` (in short steps: a corrected clock is followed at once). */
  const sleepUntil = async (at) => { for (let d = at - tp.now(); d > 0; d = at - tp.now()) await sleep(Math.min(1000, d)); };
  const timed = (p, ms = 8000) => new Promise((res, rej) => {
    let done = false;
    const off = clock.after(ms, () => { if (!done) { done = true; rej(netError('timeout')); } });
    p.then((v) => { if (!done) { done = true; off(); res(v); } }, (e) => { if (!done) { done = true; off(); rej(e); } });
  });
  /** One profile write at a time (Decision 9). */
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  // ---------------- the server ----------------
  async function readMe() { try { const v = await timed(tp.get(`users/${uid()}`)); return validProfile(v) ? v : null; } catch { return null; } }
  async function readOuts(mid) { try { return (await timed(tp.get(`matches/${mid}/out`))) || {}; } catch { return null; } }
  /** -> 'ok' | 'denied' | 'offline'. A written profile becomes session.profile (a new object). */
  async function write(kind, P) {
    try {
      await timed(tp.set(`users/${uid()}`, P));
    } catch (e) { view.test.writes.push({ kind, ok: false }); return isDenied(e) ? 'denied' : 'offline'; }
    view.test.writes.push({ kind, ok: true });
    session.profile = P.sk ? { ...P, sk: { ...P.sk, a: tp.now() } } : P;
    if (kind !== 'close') await mirror(P.tr);
    else emit();
    return 'ok';
  }
  async function mirror(tr) {
    let ok = true;
    try { await timed(tp.set(`rk/${uid()}`, tr)); } catch { ok = false; }
    view.test.writes.push({ kind: 'rk', ok });
    emit();
  }

  // ---------------- the pending stake (SPEC4 5.7, Decision 10) ----------------
  const pend = {
    read() { try { const v = JSON.parse(storage.getItem(STAKE_KEY) || 'null'); return v && typeof v === 'object' && v.uid === uid() ? v : null; } catch { return null; } },
    write(v) { try { storage.setItem(STAKE_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } },
    patch(c, fields) { const p = pend.read(); if (p && pend.is(p, c)) pend.write({ ...p, ...fields }); },
    clear(c) { const p = pend.read(); if (p && (!c || pend.is(p, c))) { try { storage.removeItem(STAKE_KEY); } catch { /* blocked */ } } if (cur === c || !c) stopStamp(); },
    is: (p, c) => p.kind === c.kind && (c.kind === 'human' ? p.mid === c.mid : p.a0 === c.a0),
  };
  function startStamp(c) {
    stopStamp();
    stampOff = clock.every(TROPHY.liveStampMs, () => { if (c.settled) stopStamp(); else pend.patch(c, { live: wall() }); });
  }
  function stopStamp() { if (stampOff) { stampOff(); stampOff = null; } }
  /** Is the open stake `sk` the one of context `c`? (A human stake names its match; a bot stake is known by its time.) */
  // (skA: the server's own stamp, read back once after the stake; without it the moments around the write)
  const owns = (sk, c) => !!sk && (c.kind === 'human' ? sk.b === false && sk.m === c.mid
    : sk.b === true && (c.skA ? sk.a === c.skA : sk.a >= c.a0 - 3000 && sk.a <= c.a1 + 3000));

  // ---------------- one match ----------------
  function context(m) {
    const human = m.kind === 'human';
    return { id: m.t0, match: m, kind: human ? 'human' : 'bot', mid: human ? m.mid : null, slot: m.slot, rec: null,
      why: null, staked: false, over: false, settled: false, verdict: null, t10: 0, a0: 0, a1: 0, s: 0, tr0: null, o: null,
      prepared: null, staking: null, claiming: null, closing: null,
      v: { id: m.t0, mid: human ? m.mid : null, kind: human ? 'human' : 'bot', state: 'none', why: null, s: 0, g: null, tr0: null, tr: null, o: human ? null : Number(m.rivalTr) || 0, at: null } };
  }
  const ctxOf = (m) => (m && cur && cur.id === m.t0 ? cur : null);
  const capped = (D, now) => D.cd === dayOf(now) && D.cc >= TROPHY.dayCap;

  R.prepare = (m) => {
    if (!m) return Promise.resolve();
    const prev = cur, c = context(m);
    if (prev) prev.prev = null;
    c.prev = prev;
    cur = c;
    Object.assign(view, c.v); emit();
    c.prepared = (async () => {
      const D = await readMe();
      if (D) { session.profile = D; c.tr0 = D.tr; if (capped(D, tp.now())) { c.why = 'cap'; show(c, { why: 'cap', tr0: D.tr, tr: D.tr }); } else show(c, { tr0: D.tr, tr: D.tr }); }
      if (c.kind === 'human' && m.mid) { try { c.rec = await timed(tp.get(`matches/${m.mid}`)); } catch { c.rec = null; } }
    })();
    return c.prepared;
  };

  R.stake = (m) => {
    const c = ctxOf(m) || (R.prepare(m), cur);
    if (!c.staking) c.staking = runStake(c);
    return c.staking;
  };

  async function runStake(c) {
    await c.prepared;
    const unranked = (why) => { c.why = why; c.stakeDone = true; if (!c.staked) c.settled = true; show(c, { state: 'none', why }); return { ok: false, reason: why, s: 0 }; };
    if (c.why) return unranked(c.why);
    show(c, { state: 'staking' });
    const deadline = c.kind === 'human' ? (c.rec && isNum(c.rec.ts) ? c.rec.ts : c.match.t0 - NET.goMs) + TROPHY.stakeHumanMs : c.match.t0 + TROPHY.stakeBotMs;
    // the last match's win claim goes first: a fresh stake would replace its open stake and lose that win
    const prev = c.prev;
    if (prev && prev.claiming && !prev.settled) {
      await Promise.race([prev.claiming, sleep(deadline - tp.now())]);
      if (!prev.settled && prev.verdict === 'win') return unranked('busy');
    }
    let denials = 0;
    for (;;) {
      if (c.over) return unranked('late');
      if (tp.now() > deadline) return unranked('offline');
      const r = await serial(() => tryStake(c, deadline));
      if (r === 'ok') { c.stakeDone = true; return { ok: true, reason: null, s: c.s }; }
      if (r === 'cap') return unranked('cap');
      if (r === 'denied' && ++denials >= 2) return unranked('denied');
      if (r === 'gone') return unranked('late');
      await sleep(TROPHY.stakeRetryMs);
    }
  }

  async function tryStake(c, deadline) {
    if (c.over || tp.now() > deadline) return 'gone';
    const D = await readMe();
    if (!D) return 'offline';
    if (capped(D, tp.now())) return 'cap';
    const p = pend.read();
    if (D.sk && p && p.res === 'win' && owns(D.sk, p)) return 'busy'; // a win of an earlier visit still waits for its claim
    if (c.kind === 'human' && !c.rec) { try { c.rec = await timed(tp.get(`matches/${c.mid}`)); } catch { return 'offline'; } }
    if (c.kind === 'human' && !(c.rec && c.rec.tr && isNum(Number(c.rec.tr[1 - c.slot])))) return 'denied';
    if (c.over) return 'gone';
    const P = stakeBody(D, c.match, c.rec);
    c.a0 = tp.now();
    const r = await write('stake', P);
    if (r !== 'ok') return r;
    c.a1 = tp.now();
    c.staked = true; c.s = P.sk.s; c.tr0 = D.tr; c.o = c.kind === 'human' ? P.sk.o : c.v.o;
    const back = await readMe(); // the server's sk.a: what this stake is known by from now on
    if (back && back.sk && back.sk.b === P.sk.b && back.sk.s === P.sk.s && back.sk.a >= c.a0 - 60000) { c.skA = back.sk.a; session.profile = back; }
    pend.write({ uid: uid(), kind: c.kind, mid: c.mid, ms: c.slot, ts0: c.match.t0 - NET.goMs, a0: c.a0, a1: c.a1, skA: c.skA || 0, res: null, t10: 0, live: wall() });
    startStamp(c);
    show(c, { state: 'staked', s: c.s, g: -c.s, tr0: D.tr, tr: P.tr, o: c.o, at: c.a1 });
    return 'ok';
  }

  R.claim = async (m, result) => {
    const c = ctxOf(m);
    if (!c || !result || result.provisional) return { ok: false, kind: null, g: null, reason: result && result.provisional ? 'provisional' : 'none' };
    if (c.verdict) return c.claiming || { ok: false, kind: null, g: null, reason: 'done' };
    c.over = true;
    c.verdict = result.result === 'win' || result.result === 'draw' ? result.result : 'lose';
    c.t10 = Math.max(0, Math.round((Number(result.t) || 0) * 10));
    const told = () => {
      if (c.verdict === 'lose') show(c, { state: 'saved', g: -c.s }); // the loss was saved at GO
      else show(c, { state: 'saving', g: c.verdict === 'draw' ? 0 : gainOf(c), tr: c.tr0 + (c.verdict === 'draw' ? 0 : gainOf(c)) });
    };
    if (c.staked) told();
    c.claiming = (async () => {
      if (!c.staked && c.staking) { await c.staking; if (c.staked) told(); }
      if (!c.staked) { c.settled = true; return { ok: false, kind: null, g: null, reason: c.why }; }
      pend.patch(c, { res: c.verdict, t10: c.t10 });
      return finish(c);
    })();
    return c.claiming;
  };
  const gainOf = (c) => (c.kind === 'bot' ? botGain(c.tr0) : humanGain(c.tr0, c.o));

  /** The verdict of a staked match onto the server: win / draw / close (also from settle() on the next visit). */
  async function finish(c) {
    if (c.verdict === 'win') return claimWin(c);
    if (c.verdict === 'draw') {
      const r = await serial(() => tryDraw(c));
      if (r === 'ok') return { ok: true, kind: 'draw', g: 0, reason: null };
    }
    if (c.kind === 'human') await mineRecorded(c);
    const r = await closeNow(c, c.verdict === 'draw' ? 'denied' : null);
    return { ok: r, kind: 'close', g: -c.s, reason: null };
  }

  /** A human close may raise bt only with my own fall record: give it a few seconds to reach the server. */
  async function mineRecorded(c) {
    for (let i = 0; i < 5; i++) {
      const outs = await readOuts(c.mid);
      if (outs && outs[c.slot]) return;
      await sleep(1000);
    }
  }

  async function claimWin(c) {
    let tries = 0, again = false, alt = false;
    await sleepUntil(c.a1 + TROPHY.claimAfterMs);
    while (tries < TROPHY.claimTries) {
      const r = await serial(() => tryWin(c, { alt }));
      if (r.done) return r.done;
      if (r.wait) { await sleepUntil(tp.now() + r.wait); continue; }
      if (r.denied) {
        if (!alt && nearEdge(tp.now())) { alt = true; continue; }        // the other side of a UTC day / week edge
        if (!again) { again = true; continue; }                         // re-read and rebuild once
        const ok = await closeNow(c, 'denied');
        return { ok, kind: 'close', g: -c.s, reason: 'denied' };
      }
      tries++;
      if (tries < TROPHY.claimTries) await sleep(TROPHY.claimRetryMs);
    }
    c.gaveUp = true; if (cur === c) stopStamp(); // still offline: the next visit (or another tab) claims it (settle)
    show(c, { state: 'failed', why: 'pending' });
    return { ok: false, kind: 'win', g: null, reason: 'offline' };
  }
  const nearEdge = (now) => { const x = now % 86400000; return x < TROPHY.boundaryMs || x > 86400000 - TROPHY.boundaryMs; };
  const otherSide = (now) => (now % 86400000 < TROPHY.boundaryMs ? now - TROPHY.boundaryMs : now + TROPHY.boundaryMs);

  async function tryWin(c, { alt }) {
    const D = await readMe();
    if (!D) return {};
    if (!owns(D.sk, c)) { // settled elsewhere (another tab claimed it, or replaced it with a new stake)
      settled(c, D, D.sk ? 'failed' : 'saved', D.sk ? -c.s : gainOf(c), D.sk ? 'denied' : null);
      return { done: { ok: !D.sk, kind: 'win', g: c.v.g, reason: null } };
    }
    // (my clock was at least `ahead` ms ahead of the server's when the stake went out: the waits use the server's time)
    const now = tp.now(), ahead = Math.max(0, (c.a0 || 0) - D.sk.a), age = now - ahead - D.sk.a;
    if (age < 20000) return { wait: 20000 - age + 500 };
    const late = age > (D.sk.b ? TROPHY.botClaimMs : TROPHY.humanClaimMs);
    if (late || capped(D, now)) {
      const why = late ? 'late' : 'cap';
      const ok = await closeIn(c, D, why);
      return { done: { ok, kind: 'close', g: -D.sk.s, reason: why } };
    }
    let bt = D.bt;
    if (D.sk.b) bt = Math.max(D.bt, Math.min(c.t10, botBtCap(D.sk, now - ahead, alt ? 1000 : 0)));
    else {
      const outs = await readOuts(D.sk.m);
      if (!outs) return {};
      const ME = outs[D.sk.ms], OPP = outs[D.sk.os];
      if (!OPP) return {}; // (the rival's record is how the rules know I won: it is on its way)
      const v = ME ? Number(ME.t) || 0 : Math.min(c.t10, (Number(OPP.t) || 0) + 10);
      bt = Math.max(D.bt, v);
    }
    const P = winBody(D, alt ? otherSide(now) : now, bt);
    const r = await write('win', P);
    if (r === 'denied') return { denied: true };
    if (r !== 'ok') return {};
    settled(c, P, 'saved');
    return { done: { ok: true, kind: 'win', g: P.tr - D.tr - D.sk.s, reason: null } };
  }

  async function tryDraw(c) {
    const D = await readMe();
    if (!D) return 'offline';
    if (!owns(D.sk, c)) { settled(c, D, 'saved'); return 'ok'; }
    const r = await write('draw', drawBody(D));
    if (r === 'ok') settled(c, session.profile, 'saved', 0);
    return r;
  }

  /** Close the stake of `c` (the loss stays); retried while offline, a denial is rebuilt once with bt unchanged. */
  function closeNow(c, why = null) {
    if (!c.closing) {
      c.closing = (async () => {
        for (let i = 0; i < TROPHY.claimTries; i++) {
          const done = await serial(async () => {
            const D = await readMe();
            if (!D) return false;
            if (!owns(D.sk, c)) { settled(c, D, c.v.state === 'failed' ? 'failed' : 'saved', -c.s); return true; }
            return closeIn(c, D, why);
          });
          if (done) return true;
          await sleep(TROPHY.claimRetryMs);
        }
        return false;
      })();
    }
    return c.closing;
  }

  async function closeIn(c, D, why) {
    const sk = D.sk, now = tp.now();
    let bt = D.bt;
    if (sk.b) { const t = now - Math.max(0, (c.a0 || 0) - sk.a); if (t - sk.a <= TROPHY.botClaimMs) bt = Math.max(D.bt, Math.min(c.t10, botBtCap(sk, t))); }
    else {
      const outs = await readOuts(sk.m), ME = outs && outs[sk.ms];
      if (ME) bt = Math.max(D.bt, Number(ME.t) || 0);
    }
    let r = await write('close', closeBody(D, bt));
    if (r === 'denied' && bt !== D.bt) r = await write('close', closeBody(D, D.bt));
    if (r !== 'ok') return false;
    settled(c, session.profile, why ? 'failed' : 'saved', -sk.s, why);
    return true;
  }

  function settled(c, P, state, g = null, why = null) {
    c.settled = true;
    pend.clear(c);
    const patch = { state, tr: P ? P.tr : c.v.tr };
    if (g !== null) patch.g = g; else if (P && c.tr0 !== null) patch.g = P.tr - c.tr0;
    if (why) patch.why = why;
    show(c, patch);
  }

  R.close = (m) => {
    const c = ctxOf(m);
    if (!c || c.over) return Promise.resolve({ ok: false });
    c.over = true; c.verdict = 'lose';
    return (async () => {
      if (c.staking) await c.staking;
      if (!c.staked) { c.settled = true; return { ok: false }; }
      pend.patch(c, { res: 'lose' });
      show(c, { state: 'saved', g: -c.s });
      return { ok: await closeNow(c) };
    })();
  };

  /** Each connect (after flow's quit record): settle what an earlier page left, then mirror my trophies once. */
  R.settle = () => (async () => {
    const out = { quit: false, claimed: false, closed: false };
    const D = await serial(readMe);
    if (!D) return out;
    session.profile = D;
    const p = pend.read();
    const mine = !!(D.sk && p && owns(D.sk, p));
    const busy = !!cur && !cur.settled && !cur.gaveUp && ((cur.staked && owns(D.sk, cur)) || (!!cur.staking && !cur.stakeDone));
    if (!D.sk) { if (p && !busy) pend.clear(); }
    else if (busy) { /* this page is playing / claiming it */ }
    else if (mine && !(p.live && wall() - p.live < TROPHY.liveDeadMs)) {
      const c = { ...context({ kind: p.kind, mid: p.mid, slot: p.ms, t0: (p.ts0 || 0) + NET.goMs, rivalTr: 0 }), staked: true, over: true,
        verdict: p.res || 'lose', t10: Number(p.t10) || 0, a0: p.a0, a1: p.a1, skA: p.skA || 0, s: D.sk.s, tr0: D.tr + D.sk.s, o: D.sk.o ?? null };
      if (c.kind === 'human' && !p.res) {
        // left in the middle: my own fall record first (flow.js writes it on connect too; whoever is first wins)
        const outs = await readOuts(p.mid);
        if (outs && !outs[p.ms]) await quitOut(tp, { mid: p.mid, slot: p.ms, t: 0, d: 0, ts0: p.ts0 });
      }
      const r = await finish(c);
      out.claimed = r.kind === 'win' && r.ok;
      out.closed = r.kind === 'close';
      out.quit = !p.res;
    } else if (!mine && tp.now() - D.sk.a > TROPHY.staleStakeMs) {
      const c = { ...context({ kind: D.sk.b ? 'bot' : 'human', mid: D.sk.m, slot: D.sk.ms, t0: D.sk.a, rivalTr: 0 }), staked: true, over: true, verdict: 'lose', a0: D.sk.a, a1: D.sk.a, skA: D.sk.a, s: D.sk.s };
      out.closed = await closeNow(c);
    }
    const now = await serial(readMe);
    if (now) await serial(() => mirror(now.tr));
    return out;
  })();

  return R;
}
