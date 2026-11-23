// The two-page harness behind `node scripts/duo.mjs` (STAGE1b "INTEGRATOR"): 2-4 REAL pages of the game, each in
// its own browser context, playing through the real screens against ONE hub that lives here in Node.
//
//   hub      src/online/localhub.js with the real rules (config/firebase/database.rules.json) on a VIRTUAL clock
//            owned by this process: time moves only in tick() / step(), so every run is repeatable.
//   bridge   each page is opened with ?net=bridge&pid=A and finds window.__netPort = { post(msg), onmessage }
//            (an init script). page -> Node goes through playwright's exposeBinding, Node -> page through
//            page.evaluate; the page's "now" is the hub time last delivered (follow mode, transport-local.js).
//   wire     one per page, in Node, on the virtual clock: delay / jitter / "loss" (a late resend that holds back
//            everything behind it, the model of src/online/nettest.js) and an offline switch.
//   stepping the pages' own animation loops are stopped. duo.step() moves the clock 0.1 s, hands every page its
//            messages and lets it run `__game.versus.simulate(0.1)` (the match's real pump) and one UI update.
//
//   const A = await duo.page('A');                 // { size, quality, room, query, net: 'lat400,jit300,loss5' }
//   await duo.signIn(A, 'Ann');                    // ONLINE button -> types the name with real key presses
//   const code = await duo.create(A);              // CREATE ROOM -> the code on the tiles
//   await duo.join(B, code);  await duo.ready(A, B);  await duo.go(A, B);   // both READY -> both matches live
//   await duo.play(12, () => ...);                 // seconds of match (stops early when the callback is true)
//   await duo.until(async () => ..., 'what');      // tick + exchange messages until it holds
//   A.ev(fn, arg)  A.click(sel)  A.text(sel)  A.offline(bool)  A.shot(name)  A.view()
//   QUICK MATCH:  await duo.quick(A);  const r = await duo.found(A);  await duo.cancel(A);  await duo.crash(A)
//                 (the page's quick timers follow the hub's virtual clock: src/online/clock.js createFollowClock)
import fs from 'node:fs';
import path from 'node:path';
import { createClock } from '../../src/online/clock.js';
import { createHub } from '../../src/online/localhub.js';
import { createRules } from '../../src/online/rulescheck.js';
import { parseNettest } from '../../src/online/nettest.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const RULES = JSON.parse(fs.readFileSync(path.join(here, '../../config/firebase/database.rules.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const turn = () => new Promise((r) => setImmediate(r));

export class Fail extends Error {}
export function ok(cond, msg) { if (!cond) throw new Fail(msg || 'expected a true value'); }
export function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Fail(`${msg ? `${msg}: ` : ''}got ${ja}, wanted ${jb}`);
}

// Runs inside every page before the game boots.
const INIT = ({ echo }) => {
  let seq = 0;
  window.__netPort = {
    follow: true, // this page's clock is the hub's (virtual) clock
    echo,         // --echo: my own writes show at once, before the hub has answered (what the real SDK does)
    onmessage: null,
    post(msg) { window.__duo.sent++; window.__netSend(JSON.stringify([seq++, msg])); },
  };
  const g = () => window.__game;
  window.__duo = {
    sent: 0,
    ghost: { rel: 0, x: 0, shown: 0, steps: 0, last: null },
    /** Messages from the hub. */
    in(list) { const p = window.__netPort; for (const m of list) if (p.onmessage) p.onmessage(m); },
    /** One harness step: the hub's messages, `dt` seconds of the match through its real pump, one UI update. */
    step(list, dt) {
      this.in(list);
      const game = g(), v = game.versus, flow = game.online && game.online.flow;
      if (v && v.live && game.state === 'playing') v.simulate(dt);
      else if (flow && flow.link && flow.link.tick) flow.link.tick();
      game.ui.update(dt);
      this.watchGhost();
    },
    /** The rival's ghost as it is DRAWN (its place against my own squad, its lane): the biggest move between two
     *  steps while it was on screen (a jump would show here), and how many steps it was on screen at all. */
    watchGhost() {
      const v = g().versus, p = v && v.live && v.go && v.ghost.peers[0], G = this.ghost;
      if (!p || !p.alive || !(v.t > 3)) { G.last = null; return; }
      G.steps++;
      if (!(p.shown > 0) || !p.track.out.ok) { G.last = null; return; }
      const now = { rel: p.rel, x: p.track.out.x };
      if (G.last) { G.rel = Math.max(G.rel, Math.abs(now.rel - G.last.rel)); G.x = Math.max(G.x, Math.abs(now.x - G.last.x)); }
      G.shown++;
      G.last = now;
    },
    /** What the page is showing right now, as plain data. */
    view() {
      const game = g(), ui = game.ui, v = game.versus, flow = game.online && game.online.flow;
      const txt = (sel) => { const n = document.querySelector(sel); return n && n.isConnected ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
      const seen = (sel) => { const n = document.querySelector(sel); return !!n && !n.hidden && !n.classList.contains('hidden') && n.getClientRects().length > 0; };
      const st = flow && flow.room && flow.room.state;
      const res = document.querySelector('.screen-vsresult .vsr, [data-screen="vsresult"] .vsr');
      return {
        state: game.state, screen: ui.current, top: ui.top(), online: ui.online.state,
        view: ui.screens.online && ui.screens.online.view ? ui.screens.online.view() : null,
        net: flow ? flow.net : null, notice: flow && flow.notice ? flow.notice.kind : null,
        room: st ? { code: st.code, st: st.st, me: st.me, rn: st.rn, seats: st.seats.map((s) => (s ? { n: s.n, he: s.he, we: s.we, rdy: !!s.rdy } : null)), hostLeft: !!st.hostLeft } : null,
        live: !!(v && v.live), seed: v ? v.seed : null, t: v ? Math.round(v.t * 100) / 100 : null,
        clock: v && v.link ? Math.round(v.link.clock() * 100) / 100 : null,
        n: game.squad.count, dist: game.run ? Math.round(game.run.dist * 10) / 10 : null, mode: game.run ? game.run.mode : null,
        result: v && v.result ? { result: v.result.result, reason: v.result.reason, t: v.result.t, d: v.result.d, provisional: v.result.provisional, revised: v.result.revised } : null,
        peers: v ? v.v.peers.map((p) => ({ name: p.name, n: p.n, dist: Math.round(p.dist), alive: p.alive, silent: p.silent, countdown: p.countdown })) : [],
        ribbon: res ? txt('.vsr .ribbon') : null, why: res ? txt('.vsr .vsr-why b') : null, rematchNote: res ? txt('.vsr .vsr-rm') : null,
        card: seen('.vs-card') ? txt('.vs-card .vc-num') : null,
        bar: seen('.vs-rivals') ? txt('.vs-rivals') : null, barClock: txt('.vs-clock'),
        chipDc: seen('.vs-chip.c-dc') ? txt('.vs-chip.c-dc') : null, chipNet: seen('.vs-chip.c-net'),
        banner: seen('.on-banner') ? txt('.on-banner') : null, msg: txt('.on-hub .on-msg'), status: txt('.on-status'),
        btn: txt('.btn-online'),
      };
    },
    /** A hash of the road the match generated so far (gate rows with their red sides, hordes, crates, ...), up to `limit` u. */
    road(limit) {
      const run = g().run, out = {};
      let count = 0, far = 0;
      for (const k of Object.keys(run.byType).sort()) {
        out[k] = run.byType[k].filter((e) => e.at <= limit);
        count += out[k].length;
        for (const e of run.byType[k]) if (e.at > far) far = e.at;
      }
      const s = JSON.stringify(out);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return { hash: h.toString(16), count, gates: (out.gate || []).length, far };
    },
  };
};

/** One page's line to the hub: ordered lanes with delay / jitter / loss on the virtual clock, and an offline switch. */
function makeWire(clock, hub, seed, deliver) {
  const cfg = { lat: 0, jit: 0, loss: 0 };
  let rs = (seed >>> 0) || 1, offline = false;
  const rand = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
  const delay = () => cfg.lat + rand() * cfg.jit + (rand() * 100 < cfg.loss ? Math.max(250, 3 * cfg.lat) : 0);
  const lanes = { up: { last: 0, q: [], held: [] }, down: { last: 0, q: [], held: [] } };
  const drain = (lane) => {
    while (lane.q.length && lane.q[0].at <= clock.now()) { const { fn } = lane.q.shift(); if (offline) lane.held.push(fn); else fn(); }
  };
  const sched = (lane, fn) => {
    const now = clock.now(), at = Math.max(lane.last, now + delay());
    lane.last = at;
    lane.q.push({ at, fn });
    if (at <= now) drain(lane); else clock.after(at - now, () => drain(lane));
  };
  const port = { onmessage: null, post(m) { if (m.op === 'time') deliver(m); else sched(lanes.down, () => deliver(m)); } };
  const conn = hub.attach(port);
  return {
    cfg,
    /** A message from the page. (The page's own "network gone" notes are dropped: the switch below owns that.) */
    up(m) { if (m && m.op !== 'net') sched(lanes.up, () => { if (port.onmessage) port.onmessage(m); }); },
    isOffline: () => offline,
    offline(on) {
      if (!!on === offline) return;
      if (on) { offline = true; port.onmessage({ op: 'net', on: false }); return; }
      const down = lanes.down.held.splice(0), up = lanes.up.held.splice(0);
      offline = false;
      for (const fn of down) fn();              // answers that were on their way when the line dropped
      port.onmessage({ op: 'net', on: true });  // a new connection: the hub fires onDisconnect and catches the listeners up
      for (const fn of up) fn();                // the writes the page queued meanwhile, in order
    },
    close() { conn.detach(); },
  };
}

class Player {
  constructor(duo, pid, ctx, page, opts) {
    Object.assign(this, { duo, pid, ctx, page, opts, outbox: [], got: 0, next: 0, early: new Map(), errors: [], logs: [] });
    this.wire = makeWire(duo.clock, duo.hub, 7919 * (duo.players.length + 1) + 13, (m) => this.outbox.push(m));
  }
  /** playwright binding: one message from the page (they are numbered: delivery order is the page's order). */
  recv(text) {
    const [seq, msg] = JSON.parse(text);
    this.early.set(seq, msg);
    while (this.early.has(this.next)) { const m = this.early.get(this.next); this.early.delete(this.next++); this.got++; this.wire.up(m); }
  }
  /** Hands the page what the hub sent (stamped with the hub's time NOW: the page's clock follows it) and lets it react. */
  async flush(dt = null) {
    const now = this.duo.clock.now();
    const list = this.outbox.splice(0).map((m) => (typeof m.t === 'number' ? { ...m, t: now } : m));
    const sent = await this.page.evaluate(async ([l, d]) => {
      if (d === null) window.__duo.in(l); else window.__duo.step(l, d);
      await new Promise((r) => setTimeout(r, 0));
      return window.__duo.sent;
    }, [list, dt]);
    for (let i = 0; i < 200 && this.got < sent; i++) await turn(); // every message the page posted has reached the wire
    if (this.got < sent) throw new Error(`${this.pid}: ${sent - this.got} message(s) from the page never arrived`);
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  view() { return this.page.evaluate(() => window.__duo.view()); }
  text(sel) { return this.page.evaluate((s) => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }, sel); }
  has(sel) { return this.page.evaluate((s) => { const n = document.querySelector(s); return !!n && !n.hidden && n.getClientRects().length > 0; }, sel); }
  /** A real click (the big buttons "breathe", so playwright's wait-until-still is skipped). */
  click(sel) { return this.page.click(sel, { force: true, timeout: 8000 }); }
  /** Real key presses into a text box (whatever was in it is replaced). */
  async type(sel, text) {
    await this.page.click(sel, { force: true, timeout: 8000 });
    await this.page.fill(sel, '');
    await this.page.keyboard.type(text, { delay: 5 });
    return this.page.$eval(sel, (i) => i.value);
  }
  key(k) { return this.page.keyboard.press(k); }
  /** My internet goes away / comes back (the page's transport is told, like a browser tells the real SDK). */
  async offline(on) {
    this.wire.offline(on);
    await this.page.evaluate((o) => { const f = window.__game.online && window.__game.online.flow, t = f && (f.transport.inner || f.transport); if (t && t._net) t._net(!o); }, on);
    await this.duo.pump();
  }
  net(spec) { Object.assign(this.wire.cfg, { lat: 0, jit: 0, loss: 0 }, typeof spec === 'string' ? parseNettest(spec) : spec || {}); }
  /** A screenshot (the canvas is drawn first: the page's own loop is stopped). */
  async shot(name) {
    if (!this.duo.shots) return null;
    await this.page.waitForTimeout(600); // screens fade in and out in real time; the harness is faster than that
    await this.page.evaluate(() => { const g = window.__game; try { g.sync(0); g.engine.render(); } catch { /* menu */ } });
    const file = path.join(this.duo.shots, `${this.duo.label}-${this.pid}-${name}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }
}

export class Duo {
  constructor({ browser, base, shots = null, label = 'duo', verbose = false, echo = false }) {
    Object.assign(this, { browser, base, shots, label, verbose, echo, players: [], notes: [] });
    this.clock = createClock();
    this.hub = createHub({ clock: this.clock, rules: createRules(RULES) });
    this.denials = [];
    this.hub.onDeny = (d) => this.denials.push(d);
    if (shots) fs.mkdirSync(shots, { recursive: true });
  }

  note(text) { this.notes.push(text); if (this.verbose) console.log('     ·', text); }

  /** Opens the game in a new browser context. opts: { size: [w, h], quality, room, query, net, bridge (false = no hub) } */
  async page(pid, opts = {}) {
    const [w, h] = opts.size || [390, 844];
    const ctx = await this.browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const p = new Player(this, pid, ctx, page, opts);
    if (opts.net) p.net(opts.net);
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && !t.includes('Failed to load resource') && !t.includes('GL Driver')) p.errors.push(t);
      else if (m.type() === 'warning' && t.includes('[nimbus]')) p.logs.push(t);
    });
    page.on('pageerror', (e) => p.errors.push(`[pageerror] ${e.stack || e.message}`));
    await page.exposeBinding('__netSend', (src, text) => p.recv(text));
    await page.addInitScript(INIT, { echo: !!this.echo });
    if (opts.before) await opts.before(page);
    const q = new URLSearchParams({ test: '1', quality: opts.quality || 'low', ...(opts.bridge === false ? {} : { net: 'bridge', pid }), ...(opts.room ? { room: opts.room } : {}), ...(opts.query || {}) });
    await page.goto(`${this.base}/?${q}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout: 120000 });
    await page.evaluate(() => window.__game.loop.stop()); // the harness steps the game
    this.players.push(p);
    return p;
  }

  /** Messages go back and forth until nobody has anything left to say. */
  async pump(max = 12) {
    for (let i = 0; i < max; i++) {
      for (const p of this.players) await p.flush();
      await turn();
      if (!this.players.some((p) => p.outbox.length)) return;
    }
  }

  /** Virtual time passes (no match stepping): timers in the hub and on the wires fire, pages hear the new time. */
  async tick(ms = 50) {
    await this.clock.advance(ms);
    this.hub.syncTime();
    await this.pump();
  }

  /** Ticks until `fn()` (may be async) is truthy. Fails with `what` after `max` ms of virtual time. */
  async until(fn, what = 'a condition', { max = 15000, step = 50 } = {}) {
    for (let t = 0; t <= max; t += step) {
      const v = await fn();
      if (v) return v;
      await this.tick(step);
      await sleep(15); // the pages' own short retry timers run on real time
    }
    const views = await Promise.all(this.players.map(async (p) => `${p.pid}: ${JSON.stringify(await p.view().catch((e) => String(e)))}`));
    throw new Fail(`timed out waiting for ${what}\n     ${views.join('\n     ')}`);
  }

  /** One step of a match: 0.1 s on the clock, then every page gets its messages and plays 0.1 s. */
  async step(dt = 0.1) {
    await this.clock.advance(dt * 1000);
    this.hub.syncTime();
    for (const p of this.players) await p.flush(dt);
    await turn();
    if (this.players.some((p) => p.outbox.length)) await this.pump();
  }

  /** `seconds` of match; stops early when `stop()` (may be async, checked every `every` steps) is truthy. */
  async play(seconds, stop = null, every = 5) {
    const n = Math.round(seconds * 10);
    for (let i = 0; i < n; i++) {
      await this.step();
      if (stop && i % every === every - 1) { const v = await stop(); if (v) return v; }
    }
    return stop ? stop() : null;
  }

  // ---------------- the real screens ----------------
  /** Title -> ONLINE button -> (first visit) the name, typed with real key presses. Leaves the page on the hub. */
  async signIn(p, name, { tap = true } = {}) {
    if (tap) await p.click('.btn-online');
    await this.until(() => p.has('.on-nameinput'), `${p.pid}: the name screen`);
    const typed = await p.type('.on-nameinput', name);
    eq(typed, name, `${p.pid}: the name box took the key presses`);
    await p.key('Enter');
    await this.until(async () => (await p.view()).view !== 'name', `${p.pid}: the name to be accepted`);
  }
  async create(p) {
    await p.click('.on-create');
    await this.until(async () => (await p.view()).view === 'lobby', `${p.pid}: the lobby after CREATE ROOM`);
    const code = (await p.text('.on-tiles')).replace(/\s+/g, '');
    ok(/^[A-HJ-NP-Z]{4}$/.test(code), `${p.pid}: room code on the tiles: "${code}"`);
    return code;
  }
  async join(p, code) {
    const typed = await p.type('.on-code', code.toLowerCase());
    eq(typed, code, `${p.pid}: the code box upper-cases the key presses`);
    await p.click('[data-act="join"]');
    await this.until(async () => (await p.view()).view === 'lobby', `${p.pid}: the lobby after JOIN`);
  }
  /** Everyone taps READY (one after the other, each seeing the tick of the one before). */
  async ready(...ps) {
    for (const p of ps) {
      await p.click('.on-ready');
      await this.until(async () => { const v = await p.view(); return (v.room && v.room.me !== null && v.room.seats[v.room.me] && v.room.seats[v.room.me].rdy) || v.live; }, `${p.pid}: READY to show`);
    }
  }
  /** Waits until the match is live on every page given; returns their views. */
  async go(...ps) {
    await this.until(async () => (await Promise.all(ps.map((p) => p.view()))).every((v) => v.live && v.state === 'playing'), 'the match to start on every page');
    return Promise.all(ps.map((p) => p.view()));
  }
  /** Sign in two players, one makes a room, the other types the code: both in the lobby. -> code */
  async lobby(A, B, names = ['Ann', 'Ben']) {
    await this.signIn(A, names[0]);
    await this.signIn(B, names[1]);
    const code = await this.create(A);
    await this.join(B, code);
    await this.until(async () => { const v = await A.view(); return v.room && v.room.seats.filter(Boolean).length === 2; }, 'both seats on the host page');
    return code;
  }

  // ---------------- QUICK MATCH ----------------
  /** Taps QUICK MATCH on the hub (a gold button: it breathes, so the click is forced) -> the finding view. */
  async quick(p) {
    await p.click('.on-quick');
    await this.until(async () => (await p.view()).view === 'quick', `${p.pid}: the finding view after QUICK MATCH`);
  }
  /** CANCEL on the finding view: back on the hub, my ticket gone from the hub. */
  async cancel(p) {
    await p.click('.on-find-cancel');
    await this.until(async () => (await p.view()).view === 'hub' && !this.hub.admin.get(`queue/${p.pid}`), `${p.pid}: the hub again, no ticket`);
  }
  /** Waits for RIVAL FOUND! on the page -> flow.quickView() of that moment ({ phase, secs, name, hero, weapon }). */
  async found(p, opts = {}) {
    return this.until(() => p.ev(() => {
      const f = window.__game.online.flow.quickView(), n = document.querySelector('.on-find.found .on-find-name');
      return f && f.phase === 'found' && n && n.textContent === f.name ? { ...f, shown: n.textContent } : null;
    }), `${p.pid}: RIVAL FOUND!`, { max: 16000, ...opts });
  }
  /** The page dies without a goodbye (a closed lid, a crashed tab): its line goes silent, the hub notices after dropMs. */
  async crash(p) {
    p.wire.offline(true);
    this.players = this.players.filter((x) => x !== p);
    await p.ctx.close().catch(() => {});
  }

  async close() {
    for (const p of this.players) { try { p.wire.close(); } catch { /* gone */ } await p.ctx.close().catch(() => {}); }
  }
  /** Console errors of every page (a scenario with any fails). */
  errors() { return this.players.flatMap((p) => p.errors.map((e) => `${p.pid}: ${e}`)); }
}
