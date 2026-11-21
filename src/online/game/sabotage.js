// Sabotage of an online survival match, game side (STAGE2): the meter, sending, the receive queue, dedupe and
// limits. game.versus.sab is one of these from the Versus constructor; every Versus.start() resets it. Simulation
// only: no DOM, fx or audio (src/online/ui shows it from the events below). Every time is the PLAYED clock
// Versus.t (STAGE2 Decision 1): an incoming sabotage lands in the first step where t - receipt >= 1.0 s.
//
//   view() -> V      the SAME object every call: { on, ready, fill, next, big, wait, can, target, targetDanger,
//                    incoming, frozen, fog, speed, blackout } (see STAGE2 "THE API")
//   send()           -> { ok, code, big, to, why } (why when !ok: 'off' | 'empty' | 'wait' | 'nobody')
//   test             { give(code = next, n = 1), giveBig(code = 11), clear() }: charges without the meter (tests / duo)
// Game bus (fresh payloads): sab:charge { source, ready, big, code, lost }, sab:sent { code, big, to, names },
// sab:warn { id, code, big, from, name, lands, again }, sab:wait { id, code, from, name },
// sab:land { id, code, big, from, name, dur, count }, sab:end { code }, sab:drop { code, from, why }.
// Wire: link.sendEvent({ k: 's', a: sabEncode(code, link.clock()), to }) (sabdata.js); a receiver drops a replay
// ('dup', per `f:q`), an event from before its join, more than 8 s old or more than 2 s ahead of my clock ('old'), one
// from a sender that is unknown or out ('out'), an unknown code, a normal one sent to everyone or a big one sent to one
// rival, and a big one the sender cannot have earned yet ('bad': one per boss, so one per 700 u of the distance its
// states report, which verdict.js plausible() bounds), a second one from the same sender less than 5 s later on the
// SENDER's clock in `a` (legit sends are 6 s apart there, however the network delays them) or less than 2 s after
// the last one arrived ('spam'), a 4th waiting ('full'). A modified client can still send a normal kind every 5 s
// without filling its meter: the meter lives on the sender's page and no receiver can check it.
import { Rng } from '../../core/rng.js';
import { SAB, sabEncode, sabDecode, sabCost, sabBig, sabRoad, sabKnown } from './sabdata.js';
import { SabEffects } from './sabeffects.js';
import { SabCrates } from './sabcrate.js';
import { ENDLESS } from '../../data/endless.js';

const EPS = 1e-6;

export class Sabotage {
  constructor(game, versus) {
    this.game = game; this.versus = versus;
    this.fx = new SabEffects(game, versus);
    this.crates = new SabCrates(game);
    this.V = { on: false, ready: 0, fill: 0, next: 1, big: 0, wait: 0, can: false, target: null, targetDanger: 0, incoming: 0, frozen: 0, fog: 0, speed: 0, blackout: 0 };
    this.pending = []; this.seen = new Set(); this.lastFrom = new Map(); this.lastSent = new Map(); this.bigsFrom = new Map();
    this.live = false; this.trust = false;
    this.reset(1, 0);
    this.test = {
      give: (code, n = 1) => { this.ready = Math.min(SAB.meter.store, this.ready + Math.max(1, n | 0)); if (code != null && SAB.normal.includes(code)) { this.force = code; this.forceN = Math.max(1, n | 0); } if (this.ready >= SAB.meter.store) this.fill = 0; return this.view(); },
      giveBig: (code = SAB.code.storm) => { if (SAB.big.includes(code)) this.big = code; return this.view(); },
      clear: () => { this.ready = 0; this.fill = 0; this.big = 0; this.force = 0; this.forceN = 0; this.lastSend = -Infinity; return this.view(); },
      // this receiver takes big ones without the earned check, until the next match (tests whose rivals send bigs early)
      trust: (on = true) => { this.trust = !!on; },
    };
    const ev = game.events;
    ev.on('crate:take', (p) => { if (p && p.kind === 'sabotage') this.onCrate(); });
    ev.on('run:start', (p) => { if (!p || p.mode !== 'versus') this.end('off'); }); // a freeze never leaks into another run
  }

  reset(seed, joinT) {
    this.ready = 0; this.fill = 0; this.big = 0; this.sent = 0; this.bigN = 0; this.lastSend = -Infinity;
    this.force = 0; this.forceN = 0; this.lastKills = 0;
    this.cycleRng = new Rng(seed * SAB.cycle.mul + SAB.cycle.add);
    this.cycle = this.shuffle(); this.ci = 0;
    this.pending.length = 0; this.seen.clear(); this.lastFrom.clear(); this.lastSent.clear(); this.bigsFrom.clear();
    this.trust = false;
    this.joinT = joinT; this.nextId = 1;
    this.stats = { sent: 0, accepted: 0, landed: 0, dropped: {} };
    this.fx.reset();
  }

  shuffle() {
    const a = SAB.normal.slice(), r = this.cycleRng;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /** Match start (Versus.start, right after ramp.begin): empty meter and queue, zone 1's sabotage crate. */
  start(link, seed) {
    this.end('off');
    this.reset(seed >>> 0, link.clock());
    this.live = true;
    this.lastKills = this.game.run ? this.game.run.kills : 0;
    this.crates.begin(seed >>> 0);
    this.crates.place();
  }

  /** A boss fell and the next zone exists (Versus.onZone): its crate first, then the big charge. */
  onZone() {
    if (!this.live) return;
    this.crates.place();
    const lost = this.big !== 0;
    if (!lost) { this.big = SAB.big[this.bigN % SAB.big.length]; this.bigN++; }
    if (this.on()) this.game.events.emit('sab:charge', { source: 'boss', ready: this.ready, big: this.big, code: this.big, lost });
  }

  onCrate() {
    if (!this.live || !this.on()) return;
    const lost = this.ready >= SAB.meter.store;
    if (!lost) { this.ready++; if (this.ready >= SAB.meter.store) this.fill = 0; }
    this.game.events.emit('sab:charge', { source: 'crate', ready: this.ready, big: this.big, code: this.nextCode(), lost });
  }

  /** My squad is down, the match is over or left: every pending one is dropped, every effect stops at once. */
  end(why = 'off') {
    const ev = this.game.events;
    const drops = this.pending.splice(0);
    for (const p of drops) this.drop(p.code, p.from, why);
    for (const code of this.fx.stopAll()) ev.emit('sab:end', { code });
    this.live = false;
  }

  // ---------------- sender ----------------
  on() {
    const v = this.versus, run = this.game.run;
    return this.live && v.live && v.go && !v.fallen && !!run && run.mode === 'versus' && run.active;
  }

  nextCode() { return this.forceN > 0 ? this.force : this.cycle[this.ci]; }

  /** The alive rival with the largest squad (tie: lowest slot); null = nobody. */
  target() {
    let best = null;
    for (const p of this.versus.v.peers) if (p.alive && (!best || p.n > best.n || (p.n === best.n && p.slot < best.slot))) best = p;
    return best;
  }

  wait() { return Math.max(0, this.lastSend + SAB.meter.gap - this.versus.t); }

  meter(run) {
    const k = run.kills - this.lastKills;
    this.lastKills = run.kills;
    if (this.ready >= SAB.meter.store) { this.fill = 0; return; }
    if (k > 0) this.fill += k * (this.game.combo.mul || 1);
    let cost = sabCost(this.sent);
    while (this.ready < SAB.meter.store && this.fill >= cost) {
      this.fill -= cost; this.ready++;
      if (this.ready >= SAB.meter.store) this.fill = 0;
      this.game.events.emit('sab:charge', { source: 'meter', ready: this.ready, big: this.big, code: this.nextCode(), lost: false });
      cost = sabCost(this.sent);
    }
  }

  send() {
    const g = this.game, link = this.versus.link;
    if (!this.on() || !link) return { ok: false, code: 0, big: false, to: null, why: 'off' };
    const big = this.big !== 0;
    if (!big && this.ready <= 0) return { ok: false, code: 0, big: false, to: null, why: 'empty' };
    if (this.wait() > EPS) return { ok: false, code: 0, big, to: null, why: 'wait' };
    const tgt = this.target();
    if (!tgt) return { ok: false, code: 0, big, to: null, why: 'nobody' };
    let code, to, slots, names;
    if (big) {
      code = this.big; this.big = 0; to = -1;
      slots = []; names = [];
      for (const p of this.versus.v.peers) if (p.alive) { slots.push(p.slot); names.push(p.name); }
    } else {
      code = this.nextCode();
      if (this.forceN > 0) this.forceN--;
      else if (++this.ci >= this.cycle.length) { this.cycle = this.shuffle(); this.ci = 0; }
      this.ready--; this.sent++;
      to = tgt.slot; slots = [tgt.slot]; names = [tgt.name];
    }
    this.lastSend = this.versus.t;
    this.stats.sent++;
    link.sendEvent({ k: 's', a: sabEncode(code, link.clock()), to });
    g.events.emit('sab:sent', { code, big, to: slots, names });
    return { ok: true, code, big, to, why: null };
  }

  // ---------------- receiver ----------------
  drop(code, from, why) {
    this.stats.dropped[why] = (this.stats.dropped[why] || 0) + 1;
    this.game.events.emit('sab:drop', { code, from, why });
  }

  /** link 'event' { k, a, to, f, q } (src/online/match.js; testlink.js). */
  onEvent(e) {
    if (!e || e.k !== 's') return; // (other kinds: emotes, later)
    const a = Number(e.a), from = e.f | 0, valid = Number.isFinite(a) && a >= 0;
    const { code, sent } = valid ? sabDecode(Math.round(a)) : { code: 0, sent: 0 };
    if (!this.on()) return this.drop(code, from, 'off');
    const key = from + ':' + (e.q ?? 0);
    if (this.seen.has(key)) return this.drop(code, from, 'dup');
    this.seen.add(key);
    if (!valid) return this.drop(0, from, 'bad');
    const link = this.versus.link, R = SAB.recv, now = link.clock();
    if (sent < this.joinT - R.joinGrace || now - sent > R.stale || sent - now > R.ahead) return this.drop(code, from, 'old');
    const p = this.versus.peer(from);
    if (!p || !p.alive) return this.drop(code, from, 'out');
    const big = sabBig(code), bigs = this.bigsFrom.get(from) || 0;
    if (!sabKnown(code) || big !== (e.to === -1)) return this.drop(code, from, 'bad');
    if (big && !this.trust && bigs >= this.earned(p)) return this.drop(code, from, 'bad');
    const t = this.versus.t, lastS = this.lastSent.get(from), lastR = this.lastFrom.get(from);
    if ((lastS != null && sent - lastS < R.perSender - EPS) || (lastR != null && t - lastR < R.floor - EPS)) return this.drop(code, from, 'spam');
    if (this.pending.length >= R.queue) return this.drop(code, from, 'full');
    this.lastFrom.set(from, t); this.lastSent.set(from, sent);
    if (big) this.bigsFrom.set(from, bigs + 1);
    this.stats.accepted++;
    const item = { id: this.nextId++, code, big, from, name: p.name, recvT: t, state: 'warn', waitT: 0 };
    this.pending.push(item);
    this.warn(item, false);
    if (sabRoad(code) && !this.fx.canLand(code)) this.toWait(item);
  }

  /** Big ones rival p can have earned: one per boss, and boss n stands at n x 700 u (its reported distance). */
  earned(p) { return Math.floor(((p.dist || 0) + SAB.recv.earnSlack) / ENDLESS.bossEvery); }

  warn(item, again) {
    item.state = 'warn';
    this.game.events.emit('sab:warn', { id: item.id, code: item.code, big: item.big, from: item.from, name: item.name, lands: SAB.recv.delay, again });
  }

  toWait(item) {
    item.state = 'wait'; item.waitT = this.versus.t;
    this.game.events.emit('sab:wait', { id: item.id, code: item.code, from: item.from, name: item.name });
  }

  /** A rival is out: its sabotages that have not landed are dropped (effects already running finish). */
  dropFrom(slot) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.from !== slot) continue;
      this.pending.splice(i, 1);
      this.drop(p.code, p.from, 'gone');
    }
  }

  /** Versus.step, right after ramp.step, while my run is active: meter, landings, effect mods. */
  step(raw) {
    const g = this.game, run = g.run;
    if (!this.on()) return;
    this.meter(run);
    const t = this.versus.t, R = SAB.recv;
    for (let i = 0; i < this.pending.length && this.on(); i++) {
      const p = this.pending[i];
      if (p.state === 'wait') {
        if (sabRoad(p.code) && this.fx.canLand(p.code)) { p.recvT = t; this.warn(p, true); }
        else if (t - p.waitT >= R.waitMax - EPS) { p.code = SAB.code.wave; p.big = false; p.recvT = t; this.warn(p, true); }
        continue;
      }
      if (t - p.recvT < R.delay - EPS) continue;
      if (sabRoad(p.code) && !this.fx.canLand(p.code)) { this.toWait(p); continue; }
      this.pending.splice(i--, 1);
      const r = this.fx.land(p.code);
      this.stats.landed++;
      g.events.emit('sab:land', { id: p.id, code: p.code, big: p.big, from: p.from, name: p.name, dur: r.dur, count: r.count });
    }
    if (!this.on()) return;
    for (const code of this.fx.step(raw)) g.events.emit('sab:end', { code });
  }

  // ---------------- read-outs ----------------
  /** Sent with every state sample: flags bits 2-4 (codec.js FLAG) and the 0..35 charge. */
  flags() {
    const busy = this.pending.length > 0 || this.fx.busy(this.versus.t);
    return (busy ? 4 : 0) | (this.fx.left.freeze > 0 ? 8 : 0) | (this.big ? 16 : 0);
  }

  charge() { return this.ready >= SAB.meter.store ? 35 : Math.min(35, this.ready * 12 + Math.floor(this.frac() * 12)); }

  frac() { return this.ready >= SAB.meter.store ? 1 : Math.max(0, Math.min(1, this.fill / sabCost(this.sent))); }

  view() {
    const V = this.V, on = this.on(), tgt = on ? this.target() : null, L = this.fx.left;
    V.on = on; V.ready = this.ready; V.fill = this.frac(); V.next = this.nextCode(); V.big = this.big;
    V.wait = on ? this.wait() : 0;
    V.target = tgt ? tgt.slot : null; V.targetDanger = tgt ? tgt.danger | 0 : 0;
    V.can = on && (this.big !== 0 || this.ready > 0) && V.wait <= EPS && tgt !== null;
    if (V.wait <= EPS) V.wait = 0;
    V.incoming = this.pending.length;
    V.frozen = L.freeze; V.fog = L.fog; V.speed = L.speed; V.blackout = L.blackout;
    return V;
  }
}
