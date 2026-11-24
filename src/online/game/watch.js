// The WATCH model (STAGE5 "Builder WATCH"): what a fallen player and a spectator see of a match that is still on.
// Pure: no DOM, no game, Node-testable. It listens to a match link (src/online/match.js, a listen-only one for a
// spectator) and keeps one plain row per player that a view reads 8 times a second.
//
//   const watch = createWatch({ link, roster })
//     roster  [{ slot, name, tr, hero, weapon, heroSkin, weaponSkin, out? }] EVERY player of the match (me too when I
//             played; `out` { T, d, by } is my own fall when the link has no snapshot to say it)
//   watch.players  [{ slot, name, tr, me, alive, n, dist, danger, boss, inBoss, zone, flags, T, d, by, place, silent,
//                     emote }]  by seat order. n / dist are the eased numbers (no jumps); boss 0..1 (0 = none);
//                     place null while running; silent = seconds with nothing heard; emote { a, until } | null
//   watch.feed     [{ id, k: 's'|'e', a, f, to, fromName, toName, what }] newest first, at most WATCH.feedMax
//                  (a = the sabotage code for 's', the emote 0..3 for 'e'; what = 'FOG' / 'GG'; toName 'EVERYONE')
//   watch.t        match clock (s)       watch.phase  '' | 'sudden' | 'storm'
//   watch.final    null | places (verdict.js finalPlaces: [{ slot, T, d, by }], T null = still standing)
//   watch.draw     true when 'final' gave first place to two or more players
//   watch.stale    boolean               watch.version  +1 on every change a view must redraw
//   watch.on('change' | 'final' | 'stale', cb) -> off     watch.update(dt)     watch.dispose()
//
// It works with any link: one with `feeds` / 'feed' (every event of the match), else 'event' (a spectator's link
// already brings every event); with or without `snapshot()` (then it waits for the next messages), `final`,
// `stale`, 'peer'. A link that does not know an event type may throw on on(): that type is simply not heard.
// update(dt) eases the numbers and ages the silence and the emotes; it allocates nothing.
import { VS } from './vsdata.js';
import { sabDecode, sabKnown } from './sabdata.js';
import { sabKind } from '../ui/sabwords.js';

export const WATCH = {
  stepS: 0.125,               // the view reads the model 8 times a second; DOM writes only on change
  feedMax: 6,                 // newest-first sabotage / emote lines kept
  emoteMs: 2200,              // = EMOTE.showMs: a bubble on that player's card
  danger: 5,                  // = hudvs DANGER: a card pulses red from danger 5 of 9
  silentS: 3,                 // a card reads LOST CONNECTION after 3 s with nothing from that player
  ease: 0.25,                 // s to ease squad / distance numbers (no jumps)
  doneHoldMs: 1500,           // the final table appears this long after 'final' (lets the last DOWN show)
};
export const EMOTE_WORDS = ['THUMBS UP', 'HA HA', 'BOO HOO', 'GG'];
const EMOTE_GAP = 1;          // s: one emote a second per sender at most
const TIE = 1.0;              // s: the first-place tie window (NET.tie10)

const isEmote = (a) => typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 3;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createWatch({ link, roster = [] } = {}) {
  const handlers = new Map();
  const offs = [];
  const mySlot = link && typeof link.slot === 'number' ? link.slot : null;
  const list = [...(roster || [])].filter((r) => r && Number.isInteger(r.slot)).sort((a, b) => a.slot - b.slot);
  // shown rows (what a view reads) and what is behind them (targets, last heard, emote gap)
  const rows = list.map((r) => ({
    slot: r.slot, name: String(r.name || ''), tr: Math.max(0, Math.round(num(r.tr))), me: r.slot === mySlot,
    hero: r.hero || '', weapon: r.weapon || '', heroSkin: r.heroSkin || '', weaponSkin: r.weaponSkin || '',
    alive: r.slot !== mySlot, n: 0, dist: 0, danger: 0, boss: 0, inBoss: false, zone: 1, flags: 0,
    T: null, d: null, by: null, place: null, silent: 0, emote: null,
  }));
  const back = new Map(rows.map((p) => [p.slot, { p, tn: 0, td: 0, got: false, heard: 0, emoAt: -Infinity }]));
  const seen = new Set();
  let now = 0;                // my own seconds (update dt): emote bubbles and the emote gap run on it
  let disposed = false, booting = true, dirty = false, frozenT = null;

  const watch = {
    players: rows, feed: [], t: 0, phase: '', final: null, draw: false, stale: false, version: 0,
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => { const s = handlers.get(type); if (s) s.delete(cb); };
    },
    update, dispose,
  };

  const emit = (type, arg) => {
    const set = handlers.get(type);
    if (!set || disposed) return;
    for (const cb of set) { try { cb(arg); } catch (e) { console.error(e); } }
  };
  const changed = () => { dirty = true; };
  const nameOf = (slot) => { const b = back.get(slot); return b ? b.p.name : ''; };
  const clockNow = () => (link && typeof link.clock === 'function' ? num(link.clock(), watch.t) : watch.t);
  const listen = (type, cb) => {
    if (!link || typeof link.on !== 'function') return;
    try { const off = link.on(type, cb); if (typeof off === 'function') offs.push(off); } catch { /* this link has no such event */ }
  };

  // ---------------------------------------------------------------- what the link says
  function onState(slot, s) {
    const b = back.get(slot);
    if (!b || !s || !b.p.alive) return;
    const p = b.p;
    b.tn = Math.max(0, num(s.n));
    b.td = Math.max(0, num(s.dist));
    if (!b.got) { b.got = true; p.n = b.tn; p.dist = b.td; } // the first numbers show at once (no easing up from 0)
    p.danger = Math.max(0, Math.min(9, Math.round(num(s.danger))));
    p.flags = num(s.flags) | 0;
    p.inBoss = (p.flags & 1) === 1;
    p.boss = p.inBoss ? Math.max(0, Math.min(1, num(s.boss))) : 0;
    p.zone = num(s.zone, p.zone);
    b.heard = Math.max(b.heard, Math.max(0, clockNow()));
    if (p.silent) p.silent = 0;
    changed();
  }

  function onOut(slot, o) {
    const b = back.get(slot);
    if (!b || !o) return;
    const p = b.p, first = p.alive || p.T === null;
    p.alive = false;
    p.T = num(o.T, p.T ?? 0);
    p.d = Math.max(0, num(o.d, p.d ?? b.td));
    p.by = o.by || 'dead';
    p.dist = b.td = p.d; p.danger = 0; p.inBoss = false; p.boss = 0; p.silent = 0;
    if (first) places();
    changed();
  }

  function onPeer(slot, info) {
    const b = back.get(slot);
    if (!b || !b.p.alive || !info) return;
    const s = num(info.silent);
    const t = Math.max(0, clockNow());
    b.heard = s > 0 ? Math.min(b.heard, t - s) : t;
    changed();
  }

  function onEvent(e) {
    if (!e || typeof e !== 'object') return;
    const id = e.id != null ? String(e.id) : `${e.f}:${e.q}`;
    if (seen.has(id)) return;
    seen.add(id);
    const from = back.get(e.f);
    if (!from) return;
    let line = null;
    if (e.k === 's') {
      const a = num(e.a, -1);
      const { code } = sabDecode(a);
      if (a < 0 || !sabKnown(code)) return;
      const to = typeof e.to === 'number' ? e.to : -1;
      line = { id, k: 's', a: code, f: e.f, to, fromName: from.p.name, toName: to === -1 ? 'EVERYONE' : nameOf(to), what: sabKind(code).name };
    } else if (e.k === 'e') {
      if (!isEmote(e.a)) return;
      if (now - from.emoAt < EMOTE_GAP) return;    // one a second per sender
      from.emoAt = now;
      // events from before this model existed (a replay on attach) go to the feed, but bubble no more
      if (!booting) from.p.emote = { a: e.a, until: now + WATCH.emoteMs / 1000 };
      line = { id, k: 'e', a: e.a, f: e.f, to: -1, fromName: from.p.name, toName: '', what: EMOTE_WORDS[e.a] };
    } else return;
    watch.feed.unshift(line);
    if (watch.feed.length > WATCH.feedMax) watch.feed.length = WATCH.feedMax;
    changed();
  }

  function onFinal(v) {
    const pl = Array.isArray(v) ? v : v && Array.isArray(v.places) ? v.places : null;
    if (!pl || watch.final) return;
    watch.final = pl;
    for (const r of pl) {
      const b = back.get(r.slot);
      if (b && r.T != null && b.p.T === null) onOut(r.slot, r);
      else if (b && r.T != null) { b.p.T = r.T; b.p.d = r.d; b.p.by = r.by || b.p.by; }
    }
    frozenT = Math.max(0, clockNow());
    places();
    changed();
    emit('final', pl);
    flush();
  }

  function onStale() {
    if (watch.stale) return;
    watch.stale = true;
    frozenT = frozenT ?? Math.max(0, clockNow());
    changed();
    emit('stale');
    flush();
  }

  /** Places: from 'final' when it is there, else the order of the falls so far (the last to fall placed highest). */
  function places() {
    const f = watch.final;
    if (f) {
      const top = Math.max(...f.map((r) => (r.T == null ? Infinity : r.T)));
      const near = Number.isFinite(top) ? f.filter((r) => r.T != null && r.T >= top - TIE - 1e-6) : [];
      const bestD = near.length ? Math.max(...near.map((r) => r.d)) : null;
      const winners = near.filter((r) => r.d === bestD);
      watch.draw = winners.length > 1;
      f.forEach((r, i) => {
        const b = back.get(r.slot);
        if (b) b.p.place = watch.draw && winners.includes(r) ? 1 : i + 1;
      });
      return;
    }
    const fallen = rows.filter((p) => !p.alive && p.T !== null).sort((a, b) => b.T - a.T || b.d - a.d || a.slot - b.slot);
    const standing = rows.length - fallen.length;
    fallen.forEach((p, i) => { p.place = standing + i + 1; });
  }

  function flush() {
    if (!dirty || disposed) return;
    dirty = false;
    watch.version++;
    emit('change', watch);
  }

  // ---------------------------------------------------------------- the clock
  function update(dt) {
    if (disposed) return;
    const step = Math.max(0, num(dt));
    now += step;
    const t = frozenT ?? Math.max(0, clockNow());
    if (t !== watch.t) watch.t = t;
    const phase = t >= VS.storm.at ? 'storm' : t >= VS.sudden.at ? 'sudden' : '';
    if (phase !== watch.phase) { watch.phase = phase; changed(); }
    const k = Math.min(1, step / WATCH.ease);
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i], b = back.get(p.slot);
      if (p.alive) {
        if (p.n !== b.tn) { const v = p.n + (b.tn - p.n) * k; p.n = Math.abs(b.tn - v) < 0.5 ? b.tn : v; }
        if (p.dist !== b.td) { const v = p.dist + (b.td - p.dist) * k; p.dist = Math.abs(b.td - v) < 0.5 ? b.td : v; }
        // nothing heard is silence only once the match runs (before GO nobody sends a state)
        const s = frozenT === null && t > 1 ? Math.max(0, t - Math.max(b.heard, 0)) : 0;
        if ((s >= WATCH.silentS) !== (p.silent >= WATCH.silentS)) changed();
        p.silent = s;
      }
      if (p.emote && now >= p.emote.until) { p.emote = null; changed(); }
    }
    flush();
  }

  function dispose() {
    if (disposed) return;
    for (const off of offs.splice(0)) { try { off(); } catch { /* gone */ } }
    handlers.clear();
    disposed = true;
  }

  // ---------------------------------------------------------------- start
  const t0 = Math.max(0, clockNow());
  for (const b of back.values()) b.heard = t0;
  const snap = link && typeof link.snapshot === 'function' ? link.snapshot() : null;
  if (snap) {
    for (const [slot, s] of Object.entries(snap.states || {})) onState(Number(slot), s);
    for (const [slot, o] of Object.entries(snap.outs || {})) onOut(Number(slot), o);
    for (const [slot, s] of Object.entries(snap.silent || {})) { const b = back.get(Number(slot)); if (b) b.heard = t0 - num(s); }
  }
  for (const r of list) if (r.out && back.get(r.slot).p.T === null) onOut(r.slot, r.out);
  listen('state', onState);
  listen('out', onOut);
  listen('peer', onPeer);
  listen(link && link.feeds ? 'feed' : 'event', onEvent);
  listen('final', onFinal);
  listen('stale', onStale);
  booting = false;
  if (link && link.final) onFinal(link.final);
  if (link && link.stale) onStale();
  watch.t = frozenT ?? t0;
  dirty = true;
  flush();
  return watch;
}
