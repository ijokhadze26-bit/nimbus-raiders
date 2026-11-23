// The scripted Quick Match rival (STAGE3 "The bot"): a LINK with exactly the shape src/online/match.js gives the game
// (STAGE1 "the LINK"), so game.versus.start(createBotLink(...), picks) plays it like any match. No transport, no
// database traffic, no second game: its run is the plan of botplan.js (fall time, road, arenas, squad, lane x, its
// sabotage), played out sample by sample on the match clock and sent the way a human's state travels: one sample
// every 0.1 s, a bundle every 0.25 s PACKED with codec.js encodeState and unpacked with decodeState, delivered
// 0.12 +- 0.06 s late and never out of order (so every bundle passes verdict.js plausible()). The verdict comes from
// verdict.js judge(), the referee match.js uses. Its sabotage reaches my receiver as an 'event' like a human's (a big
// one only once a state showing its boss kill has been delivered, so the receiver's earned check passes); mine lands
// on it 1.0 s after it arrives: a squad dip, the 'sabotaged' / 'frozen' flags, a slice of its fall time.
//
//   pickBot({ seed, tr = 0, avoid = '' }) -> { id, name, tr, hero, weapon, heroSkin, weaponSkin, readyIn, level }
//                       pure except reading the form (level = botForm.get().lv); `avoid` = my own name
//   createBotLink({ seed, pick, game, now, t0, clock, slot = 0 }) -> link
//                       clock() = (now() - t0) / 1000, or `clock` (() -> s) itself; `game` is read for the gate rows
//                       only. link = { seed, slot, peers: [{ slot: 1 - slot, ..., bot: true }], ranked: false, mid: null,
//                       t0, flushMs, clock(), push(s), fall(out), sendEvent(e), on(type, cb) -> off, leave(), tick(),
//                       bot }; 'state' / 'out' / 'verdict' / 'event' as match.js gives them, 'peer' / 'status' never.
//   link.bot = { pick, plan: { T, median, level, wrongGate }, stats: { bundles, sent, bigs, recv, dips },
//                wire: [the last 50 packed strings], test: { fallAt(T), events, bundles, rows, landed } }
//   botForm = { get() -> { lv, run }, record('win' | 'lose' | 'draw'), reset() }   (MY side's results; per device)
// The link records its own final verdict in botForm, and a leave() of a started match without one as a 'lose'.
import { BOT } from './botdata.js';
import { makePlan, streams, nextRow, newLane, laneStep, MAX_T } from './botplan.js';
import { botName } from './botnames.js';
import { encodeState, decodeState, tenths, SEQ_MOD } from './codec.js';
import { judge } from './verdict.js';
import { sabEncode, sabDecode, sabKnown } from './game/sabdata.js';
import { ENDLESS } from '../data/endless.js';
import { HERO_IDS } from '../data/heroes.js';
import { WEAPON_IDS } from '../data/weapons.js';
import { HERO_SKINS, WEAPON_SKINS } from '../data/skins.js';

const FORM_KEY = 'nimbusRaiders.online.bot';
const EPS = 1e-9;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const upTenth = (t) => Math.ceil(t * 10 - 1e-6) / 10;

// ------------------------------------------------------------------ the form (adaptive difficulty)
function readForm() {
  try {
    const v = JSON.parse(localStorage.getItem(FORM_KEY) || 'null');
    if (v && typeof v === 'object') return { lv: clamp(Math.round(Number(v.lv) || 0), BOT.levels.min, BOT.levels.max), run: Math.round(Number(v.run) || 0) };
  } catch { /* blocked or broken storage: level 0 */ }
  return { lv: 0, run: 0 };
}

export const botForm = {
  get: readForm,
  /** One finished bot match, from MY side: 2 losses in a row -> the next bot one level weaker, 3 wins -> stronger. */
  record(result) {
    const f = readForm(), L = BOT.levels;
    if (result === 'win') { f.run = f.run > 0 ? f.run + 1 : 1; if (f.run >= L.winRun) { f.lv = Math.min(L.max, f.lv + 1); f.run = 0; } }
    else if (result === 'lose') { f.run = f.run < 0 ? f.run - 1 : -1; if (-f.run >= L.loseRun) { f.lv = Math.max(L.min, f.lv - 1); f.run = 0; } }
    else f.run = 0; // a draw breaks a run
    try { localStorage.setItem(FORM_KEY, JSON.stringify(f)); } catch { /* blocked storage: nothing kept */ }
    return f;
  },
  reset() { try { localStorage.removeItem(FORM_KEY); } catch { /* blocked storage */ } },
};

// ------------------------------------------------------------------ who it is
export function pickBot({ seed = 1, tr = 0, avoid = '' } = {}) {
  const S = streams(seed), r = S.id;
  const name = botName(S.name, avoid, BOT.defaultNames);
  const hero = r.next() < 0.4 ? 'pip' : r.pick(HERO_IDS);
  const weapon = r.next() < 0.4 ? 'thunderclap' : r.pick(WEAPON_IDS);
  const heroSkin = r.next() < 0.7 ? 'classic' : r.pick(HERO_SKINS).id;
  const weaponSkin = r.next() < 0.7 ? 'factory' : r.pick(WEAPON_SKINS).id;
  const trv = Math.max(0, Math.round(Number(tr) || 0) + r.int(-BOT.trSpread, BOT.trSpread));
  const readyIn = Math.round(r.range(BOT.ready[0], BOT.ready[1]) * 100) / 100;
  return { id: 'bot-' + (seed >>> 0).toString(36), name, tr: trv, hero, weapon, heroSkin, weaponSkin, readyIn, level: readForm().lv };
}

// ------------------------------------------------------------------ the link
export function createBotLink({ seed = 1, pick, game, now, t0, clock, slot = 0 } = {}) {
  seed >>>= 0;
  const me = slot | 0, bs = 1 - me, slots = [0, 1];
  const p = pick || pickBot({ seed });
  const plan = makePlan(seed, p);
  const S = plan.streams, ST = BOT.stream, R = BOT.react, SB = BOT.sab;
  const g = game || (typeof window !== 'undefined' ? window.__game : null);
  const clk = typeof clock === 'function' ? clock
    : typeof now === 'function' ? () => (now() - (Number(t0) || 0)) / 1000
      : () => (g && g.versus ? g.versus.simT : 0);

  const handlers = new Map();
  let left = false, given = null, recorded = false, ticked = false, alive = true;
  let k = 0, j = 1, seq = 0, buf = [], last = null, lastState = -Infinity, lastAny = -Infinity;
  let q = 0, lastSend = -Infinity, ni = 0, ai = 0, bigN = 0, sabUntil = -1, botOut = null;
  const queue = [], effects = [], dips = [], bigs = [];
  const lane = newLane();
  const ring = new Float32Array(Math.round(2 / ST.sample)); let ri = 0;
  const deliv = { t10: -1, dist: 0 };
  const mine = { live: -1, out: null };
  const stats = { bundles: 0, sent: 0, bigs: 0, recv: 0, dips: 0 };
  const wire = [];
  const test = { events: [], bundles: [], rows: [], landed: [], fallAt: (T) => { plan.T = clamp(Math.round((Number(T) || 0) * 10) / 10, k / 10, MAX_T); } };

  const emit = (type, ...a) => {
    if (left) return;
    const set = handlers.get(type);
    if (set) for (const cb of [...set]) { try { cb(...a); } catch (e) { console.error(e); } }
  };
  const lag = () => ST.lag + S.lag.range(-ST.jitter, ST.jitter);
  const keep = (list, v, max) => { list.push(v); if (list.length > max) list.splice(0, list.length - max); };
  /** Into the delivery queue, sorted by arrival (stable). */
  function enqueue(item) {
    let i = queue.length;
    while (i > 0 && queue[i - 1].at > item.at) i--;
    queue.splice(i, 0, item);
    lastAny = Math.max(lastAny, item.at);
  }
  const rows = () => { const run = g && g.run; return run && run.mode === 'versus' ? run.eventsOf('gate') : null; };
  const knobs = (at) => (g && g.endless && g.endless.gen ? g.endless.gen.knobs(at).E : 50);

  // ---------------- what mine does to it ----------------
  function land(t) {
    while (effects.length && effects[0].at <= t + EPS) {
      const f = effects.shift();
      if (!alive) continue;
      dips.push({ at: f.at, dip: f.dip });
      stats.dips++;
      sabUntil = Math.max(sabUntil, f.at + R.flag);
      if (f.code === 5) lane.frozen = Math.max(lane.frozen, f.at + R.freeze);
      const before = plan.T, floor = Math.max(BOT.fall.min, f.at + BOT.fall.keep);
      plan.T = Math.min(before, upTenth(Math.max(before - f.slice, floor)));
      keep(test.landed, { code: f.code, recv: f.recv, at: f.at, t, T0: before, T: plan.T }, 100);
    }
  }

  // ---------------- its sabotage ----------------
  function send(t, code, big) {
    const e = { k: 's', a: sabEncode(code, t), to: big ? -1 : me, f: bs, q: ++q };
    lastSend = t;
    stats.sent++;
    if (big) stats.bigs++;
    keep(test.events, { t, code, big, e: { ...e } }, 200);
    enqueue({ at: t + lag(), kind: 'event', e });
  }

  function sabotage(t) {
    const nx = plan.normals[ni];
    if (nx && t >= nx.due - EPS && t - lastSend >= SB.gap - EPS) { send(t, nx.code, false); ni++; return; }
    const b = bigs[0];
    if (!b || t < b.due - EPS || t - lastSend < SB.gap - EPS || deliv.dist < b.need) return;
    if (nx && nx.due - t < SB.gap - EPS) return; // a normal one is due soon: the big one goes after it
    send(t, b.code, true);
    bigs.shift();
  }

  function charge(t) {
    const nx = plan.normals[ni], due = Math.min(nx ? nx.due : Infinity, bigs.length ? bigs[0].due : Infinity);
    if (!Number.isFinite(due)) return 0;
    const from = Number.isFinite(lastSend) ? lastSend : 0;
    return clamp(Math.round(35 * (t - from) / Math.max(0.1, due - from)), 0, 35);
  }

  // ---------------- one sample ----------------
  function sample(t) {
    land(t);
    const r = plan.at(t), inArena = r.arena > 0;
    while (ai < plan.arenas.length && plan.arenas[ai].b <= t + EPS) {
      const A = plan.arenas[ai++];
      bigs.push({ due: A.b + SB.bigAfter, code: bigN++ % 2 ? 12 : 11, need: A.z * ENDLESS.bossEvery - 2 });
    }
    let n = plan.squad(t), dangerR = 0;
    for (let i = dips.length - 1; i >= 0; i--) {
      const rem = 1 - (t - dips[i].at) / R.recover;
      if (rem <= 0) { dips.splice(i, 1); continue; }
      n *= 1 - dips[i].dip * rem;
      dangerR = Math.max(dangerR, Math.round(9 * dips[i].dip * R.dangerK * rem));
    }
    let dangerC = 0;
    const leftT = plan.T - t;
    if (leftT < plan.collapse) { const f = Math.max(0, leftT / plan.collapse); n *= f * f; dangerC = Math.round(9 * (1 - f)); }
    n = clamp(Math.round(n), 1, 999);
    ring[ri] = n; ri = (ri + 1) % ring.length;
    let peak = n;
    for (let i = 0; i < ring.length; i++) if (ring[i] > peak) peak = ring[i];
    const dangerL = Math.round(9 * Math.max(t >= 20 ? 1 - n / 15 : 0, peak > 0 ? (peak - n) / peak : 0));
    // the gate row it was aiming at is passed: note where it went through (on7-gates)
    const aim = lane.chosen;
    if (aim && !aim.done && r.dist >= aim.at) { aim.done = true; keep(test.rows, { at: aim.at, x: lane.x, aim: aim.x, best: aim.best, wrong: aim.wrong }, 400); }
    const x = laneStep(lane, plan, t, inArena ? null : nextRow(lane, rows(), r.dist, knobs), inArena);
    if (alive) sabotage(t);
    last = {
      t, dist: r.dist, n, form: plan.formAt(t),
      flags: (inArena ? 1 : 0) | (t < sabUntil - EPS ? 4 : 0) | (t < lane.frozen - EPS ? 8 : 0) | (bigs.length ? 16 : 0),
      boss: inArena ? r.hp : 0, zone: r.zone, charge: charge(t), danger: clamp(Math.max(dangerR, dangerC, dangerL), 0, 9), x,
    };
    buf.push(x);
  }

  function flush(tf) {
    if (!buf.length || !last) return;
    const str = encodeState(seq, last, buf);
    seq = (seq + 1) % SEQ_MOD;
    buf = [];
    keep(wire, str, 50);
    const at = Math.max(lastState, tf + lag());
    lastState = at;
    keep(test.bundles, { f: tf, at, str }, 1400);
    enqueue({ at, kind: 'state', s: decodeState(str) });
  }

  function die() {
    alive = false;
    const T = plan.T, r = plan.at(T);
    const d = Math.round(r.dist) + (r.arena ? Math.floor(30 * (1 - r.hp)) : 0);
    buf = []; // (like a human's link: what was not flushed before the fall is never sent)
    enqueue({ at: Math.max(lastAny, T + lag()), kind: 'out', o: { T: tenths(T) / 10, d, by: 'dead' } });
  }

  // ---------------- delivery and the referee ----------------
  function deliver(now) {
    while (queue.length && queue[0].at <= now + EPS && !left && !given) {
      const it = queue.shift();
      if (it.kind === 'state') {
        deliv.t10 = Math.max(deliv.t10, Math.round(it.s.t * 10));
        deliv.dist = Math.max(deliv.dist, it.s.dist);
        stats.bundles++;
        emit('state', bs, it.s);
      } else if (it.kind === 'event') emit('event', { ...it.e });
      else { botOut = { T10: Math.round(it.o.T * 10), d: it.o.d, by: it.o.by }; emit('out', bs, { ...it.o }); }
    }
  }

  function record(result) { if (!recorded) { recorded = true; botForm.record(result); } }

  function evaluate() {
    if (given || left) return;
    const outs = {}, liveT10 = {};
    if (mine.out) outs[me] = mine.out; else liveT10[me] = mine.live;
    if (botOut) outs[bs] = botOut; else liveT10[bs] = deliv.t10;
    const v = judge({ me, slots, outs, liveT10 });
    if (!v) return;
    given = v;
    queue.length = 0;
    emit('verdict', { ...v, void: false, provisional: false, revised: false });
    record(v.result);
  }

  const link = {
    seed, slot: me, ranked: false, mid: null, t0: typeof now === 'function' && t0 != null ? t0 : null, flushMs: ST.flush * 1000,
    peers: [{ slot: bs, name: p.name, hero: p.hero, weapon: p.weapon, heroSkin: p.heroSkin || null, weaponSkin: p.weaponSkin || null, tr: p.tr | 0, bot: true }],
    clock: clk,
    push(s) { if (!left && !given && !mine.out && s) mine.live = tenths(s.t); },
    fall(out = {}) {
      if (left || given || mine.out) return;
      mine.out = { T10: clamp(tenths(out.t), 0, 3300), d: Math.max(0, Math.round(Number(out.d) || 0)), by: out.by === 'quit' ? 'quit' : 'dead' };
      evaluate();
    },
    sendEvent(e) {
      if (left || given || !alive || !e || String(e.k || 's')[0] !== 's') return;
      const a = Math.round(Number(e.a));
      if (!Number.isFinite(a) || a < 0) return;
      const { code } = sabDecode(a);
      if (!sabKnown(code) || (typeof e.to === 'number' && e.to !== -1 && e.to !== bs)) return;
      stats.recv++;
      const recv = clk() + lag(), f = { ...plan.react(code, recv), recv };
      let i = effects.length;
      while (i > 0 && effects[i - 1].at > f.at) i--;
      effects.splice(i, 0, f);
    },
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => { const set = handlers.get(type); if (set) set.delete(cb); };
    },
    /** Called by the game every frame / step (harmless more often): plays the bot up to the match clock. */
    tick() {
      ticked = true;
      if (left || given) return;
      const now = clk();
      if (!(now >= 0)) return;
      const upto = Math.floor(now * 100 + 1e-6); // hundredths: samples at 10 k, bundles at 25 j
      while (alive) {
        const ts = k * 10, tf = j * 25;
        if (Math.min(ts, tf) > upto) break;
        if (ts <= tf) {
          const t = k / 10;
          if (t >= plan.T - EPS || t > MAX_T) { die(); break; }
          sample(t); k++;
        } else { flush(j * ST.flush); j++; }
      }
      deliver(now);
      evaluate();
    },
    /** Stop everything (idempotent). Leaving a started match before its verdict counts as a loss. */
    leave() {
      if (left) return;
      if (!given && ticked && !recorded) {
        let res = 'lose';
        if (mine.out && botOut) { const v = judge({ me, slots, outs: { [me]: mine.out, [bs]: botOut } }); if (v) res = v.result; }
        record(res);
      }
      left = true;
      queue.length = 0;
      handlers.clear();
    },
    bot: {
      pick: p,
      plan: { get T() { return plan.T; }, T0: plan.T0, median: plan.median, level: plan.level, wrongGate: plan.wrongGate, sigma: plan.sigma, sliceK: plan.sliceK, arenas: plan.arenas, normals: plan.normals },
      stats, wire, test,
      get alive() { return alive; },
      get verdict() { return given; },
    },
  };
  return link;
}
