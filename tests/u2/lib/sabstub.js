// A stand-in for game.versus.sab (STAGE2 "THE API between the two builders") so the on5-* scenarios test the
// sabotage UI on its own, with or without SABGAME's real Sabotage. It has the exact API and emits the exact events:
//   sab.view() -> V (the same object every call), sab.send() -> { ok, code, big, to, why }, sab.test.{ give, giveBig, clear }
// plus drivers for the tests:
//   stub.set(partialView)          force fields of V (on, ready, fill, next, big, wait, target, targetDanger, incoming,
//                                  frozen, fog, speed, blackout); `on`, `target` and `targetDanger` follow the match
//                                  (live, after GO, my squad standing / the alive rival with the largest squad) until set
//   stub.unset(...keys)            let forced fields follow the match / the stub again
//   stub.warn(code, name, o)  -> id   emits sab:warn (o: { from, lands, again, id })
//   stub.hold(id)                  emits sab:wait (needs the road: waits for the arena to end)
//   stub.land(id)                  emits sab:land; timed kinds start their timer on V (counted down on versus.t)
//   stub.sent(code, names)         emits sab:sent
//   stub.charge(source, o)         emits sab:charge ('meter' | 'crate' | 'boss'; o: { lost, code })
//   stub.drop(why, o)              emits sab:drop (o: { code, from })
//   stub.endEffect(code)           emits sab:end
//   stub.calls                     { send: n, results: [...] }
//   stub.real                      SABGAME's own Sabotage when it exists (null before the merge)
//   stub.remove()                  puts the previous game.versus.sab and game.events.emit back
// With SABGAME's real one present, game.versus.sab becomes a Proxy: the UI-facing API (view, send, test) is the stub's,
// every other member (what versus.js calls on its own Sabotage: step, end, dropFrom, ...) goes to the real one so the
// match keeps running, and while the stub is installed only the stub's own sab:* events reach the bus (the real
// meter / crates / receiver cannot add lines the scenario did not ask for).
const DUR = { 2: 6, 4: 5, 5: 2, 12: 5 };
const FIELD = { 2: 'fog', 4: 'speed', 5: 'frozen', 12: 'blackout' };
const CYCLE = [2, 5, 1, 4, 3];
const API = new Set(['view', 'send', 'test']);

export function installSabStub(game, init = {}) {
  const vs = game.versus;
  if (!vs) throw new Error('sabstub: game.versus is missing (install the online chunk first)');
  const hadSab = Object.prototype.hasOwnProperty.call(vs, 'sab');
  const prev = hadSab ? vs.sab : undefined;
  const real = prev && typeof prev === 'object' && !prev.__sabStub ? prev : null;
  const ev = game.events;
  const V = { on: false, ready: 0, fill: 0, next: CYCLE[0], big: 0, wait: 0, can: false, target: null, targetDanger: 0, incoming: 0, frozen: 0, fog: 0, speed: 0, blackout: 0 };
  const forced = {};
  const warns = new Map();
  let idN = 0, ci = 0, lastT = null;
  const calls = { send: 0, results: [] };

  // ---- only the stub's sab:* events reach the bus while it is installed ----
  const hadOwnEmit = Object.prototype.hasOwnProperty.call(ev, 'emit');
  const emit0 = ev.emit;
  let own = 0;
  const filtered = function emit(name, payload, force) {
    if (!own && typeof name === 'string' && name.startsWith('sab:')) return false;
    return emit0.call(this, name, payload, force);
  };
  ev.emit = filtered;
  const fire = (name, p) => { own++; try { ev.emit(name, p); } finally { own--; } };

  const peers = () => (vs.view ? vs.view().peers : []) || [];
  const nameOf = (slot) => { const p = peers().find((q) => q.slot === slot); return p ? p.name : 'Rival'; };
  const slotOf = (name) => { const p = peers().find((q) => q.name === name); return p ? p.slot : 1; };
  const autoOn = () => !!(vs.live && vs.v && vs.v.go && !vs.fallen && game.run && game.run.mode === 'versus' && game.run.active);
  function autoTarget() {
    let best = null;
    for (const p of peers()) if (p.alive && (!best || p.n > best.n || (p.n === best.n && p.slot < best.slot))) best = p;
    return best;
  }

  /** The timers of effects on me and the send gap run on the played clock, like the real one. */
  function tick() {
    const t = Number.isFinite(vs.t) ? vs.t : 0;
    const dt = lastT == null ? 0 : Math.max(0, t - lastT);
    lastT = t;
    if (!dt) return;
    if (V.wait > 0 && !('wait' in forced)) V.wait = Math.max(0, V.wait - dt);
    for (const code of Object.keys(FIELD)) {
      const f = FIELD[code];
      if (V[f] > 0 && !(f in forced)) { V[f] = Math.max(0, V[f] - dt); if (V[f] === 0) fire('sab:end', { code: Number(code) }); }
    }
  }

  const stub = {
    __sabStub: true,
    view() {
      tick();
      Object.assign(V, forced);
      if (!('on' in forced)) V.on = autoOn();
      const tp = autoTarget();
      if (!('target' in forced)) V.target = tp ? tp.slot : null;
      if (!('targetDanger' in forced)) V.targetDanger = tp ? tp.danger | 0 : 0;
      V.can = !!(V.on && (V.big || V.ready) && V.wait === 0 && V.target !== null);
      return V;
    },
    send() {
      calls.send++;
      stub.view();
      let r;
      if (!V.on) r = { ok: false, code: 0, big: false, to: null, why: 'off' };
      else if (!V.big && !V.ready) r = { ok: false, code: 0, big: false, to: null, why: 'empty' };
      else if (V.wait > 0) r = { ok: false, code: 0, big: false, to: null, why: 'wait' };
      else if (V.target === null) r = { ok: false, code: 0, big: false, to: null, why: 'nobody' };
      else if (V.big) {
        const code = V.big;
        V.big = 0; delete forced.big;
        const all = peers().filter((p) => p.alive);
        r = { ok: true, code, big: true, to: -1, why: null };
        fire('sab:sent', { code, big: true, to: all.map((p) => p.slot), names: all.map((p) => p.name) });
      } else {
        const code = V.next;
        V.ready--; delete forced.ready;
        ci = (ci + 1) % CYCLE.length; V.next = CYCLE[ci]; delete forced.next;
        r = { ok: true, code, big: false, to: V.target, why: null };
        fire('sab:sent', { code, big: false, to: [V.target], names: [nameOf(V.target)] });
      }
      if (r.ok) { V.wait = 6; delete forced.wait; }
      calls.results.push(r);
      return r;
    },
    test: {
      give(code = V.next, n = 1) { V.next = code; V.ready = Math.min(2, V.ready + n); delete forced.next; delete forced.ready; },
      giveBig(code = 11) { V.big = code; delete forced.big; },
      clear() { V.ready = 0; V.big = 0; V.fill = 0; V.wait = 0; for (const k of Object.keys(forced)) delete forced[k]; },
    },

    // ---- drivers ----
    calls, V, forced, real,
    set(o) { Object.assign(forced, o); return stub.view(); },
    unset(...keys) { for (const k of keys) delete forced[k]; return stub.view(); },
    warn(code, name = 'Mika', o = {}) {
      const id = o.id ?? ++idN;
      const from = o.from ?? slotOf(name);
      warns.set(id, { id, code, from, name });
      V.incoming = Math.min(3, V.incoming + 1);
      fire('sab:warn', { id, code, big: code > 10, from, name, lands: o.lands ?? 1, again: !!o.again });
      return id;
    },
    hold(id) { const w = warns.get(id); if (w) fire('sab:wait', { id, code: w.code, from: w.from, name: w.name }); },
    land(id) {
      const w = warns.get(id);
      if (!w) return;
      warns.delete(id);
      V.incoming = Math.max(0, V.incoming - 1);
      const timed = w.code === 11 ? 2 : w.code;
      if (FIELD[timed]) V[FIELD[timed]] = w.code === 11 ? 4 : DUR[timed];
      fire('sab:land', { id, code: w.code, big: w.code > 10, from: w.from, name: w.name, dur: FIELD[timed] ? V[FIELD[timed]] : 0, count: w.code === 1 ? 24 : w.code === 11 ? 90 : w.code === 3 ? -8 : 0 });
    },
    sent(code, names = ['Mika']) { fire('sab:sent', { code, big: code > 10, to: names.map(slotOf), names }); },
    charge(source = 'meter', o = {}) {
      if (!o.lost) { if (source === 'boss') V.big = o.code || 11; else V.ready = Math.min(2, V.ready + 1); }
      fire('sab:charge', { source, ready: V.ready, big: V.big, code: o.code || (source === 'boss' ? V.big || 11 : V.next), lost: !!o.lost });
    },
    drop(why = 'spam', o = {}) { fire('sab:drop', { code: o.code || 1, from: o.from ?? 1, why }); },
    endEffect(code) { const f = FIELD[code]; if (f) V[f] = 0; fire('sab:end', { code }); },
    remove() {
      offStart();
      if (ev.emit === filtered) { if (hadOwnEmit) ev.emit = emit0; else delete ev.emit; }
      if (!hadSab) delete vs.sab; else vs.sab = prev;
    },
  };
  // every start() of the real one resets it: a new match starts with an empty meter and nothing on me
  const offStart = ev.on('versus:start', () => {
    Object.assign(V, { ready: 0, fill: 0, next: CYCLE[0], big: 0, wait: 0, incoming: 0, frozen: 0, fog: 0, speed: 0, blackout: 0 });
    ci = 0; lastT = null; warns.clear();
    for (const k of Object.keys(forced)) delete forced[k];
  }) || (() => {});
  // the UI sees the stub's view / send / test; versus.js keeps talking to its own Sabotage for everything else
  vs.sab = real ? new Proxy(stub, {
    get(t, p) {
      if (API.has(p) || !(p in real)) return t[p];
      const v = real[p];
      return typeof v === 'function' ? v.bind(real) : v;
    },
    set(t, p, v) { if (API.has(p)) t[p] = v; else real[p] = v; return true; },
  }) : stub;
  if (init && Object.keys(init).length) stub.set(init);
  return stub;
}
