// Online survival match, game side (SPEC4 §5-6, STAGE1 "GAME side API"). game.versus is one of these once the
// online chunk is loaded (src/online/index.js); before that it is undefined and nothing here exists.
// A match is a normal run in mode 'versus' on the endless road of the match seed, so every player gets the same gates,
// hordes, crates and bosses; shop upgrades and bought Raider types are off; the pressure of ramp.js makes it end.
// The network side hands in one LINK (STAGE1): this class pushes a sample 10 times a second, reports its own fall once
// and listens for the rivals' state, their falls and the verdict. It never decides who won.
//
//   start(link, { hero, weapon, heroSkin, weaponSkin })
//                                  begins the run; frozen at the start line until link.clock() >= 0 (the skins are
//                                  only remembered for the VS card: the squad wears what the save has equipped)
//   live                           true from start() until the result screen (game.pause() is blocked meanwhile)
//   pump(dt, real)                 game.frame's step while live: countdown freeze + catch-up steps (SPEC4 §5.3)
//   t                              played clock: real seconds of simulation stepped while my squad was alive
//   view()                         numbers for the HUD (same objects every call)
//   result                         { result, place, places, t, d, reason, seed, provisional, revised } once the verdict
//                                  is in. A verdict marked provisional may be followed by ONE more (revised: true,
//                                  src/online/match.js): `result` is then replaced and 'versus:revised' is emitted,
//                                  also after the result screen is up (the verdict listener lives as long as the link)
//   picks                          my own { hero, weapon, heroSkin, weaponSkin } of this match (for the VS card)
//   stop()                         leaves the match (my fall is reported as 'quit' when I was alive)
//   simulate(seconds, dt)          tests / calibration: pump without rendering
//   sab                            the sabotage of this match (sabotage.js: view(), send(), test; sab:* events)
// Game bus: versus:start { seed, peers }, versus:go, versus:sudden, versus:storm, versus:peerdown { slot, name, by },
// versus:end { result, ... }, versus:revised { result, ... }; run:lose / run:win carry mode 'versus'. Nothing of a versus run reaches the save
// (save/progress.js pays 'level' and 'endless' only; achievements skip 'versus').
import { endlessDef } from '../../data/endless.js';
import { FORMATIONS } from '../../game/formation.js';
import { Ramp } from './ramp.js';
import { Ghost } from './ghost.js';
import { VS, vsBossHp, vsBossTier } from './vsdata.js';
import { Sabotage } from './sabotage.js';

const HINT = { sudden: ['SUDDEN DEATH! The horde keeps growing', '#ff5a4d'], storm: ['STORM! Hold on as long as you can', '#b49dff'] }; // (RIVAL DOWN! is the UI's big moment)

export class Versus {
  constructor(game) {
    this.game = game;
    this.live = false;
    this.link = null;
    this.result = null; this.picks = {}; this.offVerdict = null;
    this.t = 0; this.simT = 0;
    this.ramp = new Ramp(game);
    this.ghost = new Ghost(game);
    this.sab = new Sabotage(game, this); // sabotage: meter, sending, the receive queue (sabotage.js)
    this.offs = [];
    this.v = { t: 0, sudden: false, storm: false, go: false, net: 'on', me: { n: 0, dist: 0, danger: 0 }, peers: [] };
    this.counts = new Float32Array(Math.round(VS.danger.window / VS.sample));
    const ev = game.events;
    game.runMods.ext.push((dt, raw) => this.step(dt, raw));
    ev.on('run:lose', (p) => this.onLose(p));
    ev.on('endless:boss', () => this.onZone());
    ev.on('boss:spawn', () => this.onBossSpawn());
    ev.on('game:state', (p) => this.onState(p.state));
    ev.on('run:start', (p) => {
      if (p.mode !== 'versus') { if (this.live) this.stop({ toTitle: false }); return; } // another run began: the match is left
      if (this.live) return;
      // A 'versus' run nobody started through start() (RETRY on a result screen after a match: game.retry() repeats
      // the last run def): there is no link, no rival and no ramp, so it is not a match. Back to the title, once the
      // caller is done starting it (the other run:start listeners still expect game.run).
      const run = this.game.run;
      queueMicrotask(() => { const g = this.game; if (!this.live && g.run === run && g.state === 'playing') g.toTitle(); });
    });
  }

  // ---------------- lifecycle ----------------
  start(link, picks = {}) {
    if (this.live) this.stop({ toTitle: false });
    const g = this.game;
    if (this.offVerdict) { this.offVerdict(); this.offVerdict = null; } // (the last match's late verdict no longer counts)
    this.link = link; // (the link of a finished match is not left here: after a result it belongs to the UI)
    this.picks = { hero: picks.hero || null, weapon: picks.weapon || null, heroSkin: picks.heroSkin || null, weaponSkin: picks.weaponSkin || null };
    this.seed = link.seed >>> 0;
    this.t = 0; this.simT = 0; this.stall = 0; this.sampleT = 0; this.ci = 0;
    this.counts.fill(0);
    this.go = false; this.inPump = false;
    this.fallen = false; this.reported = false; this.sinceFall = 0; this.fellAt = 0; this.closing = false;
    this.verdict = null; this.result = null; this.myT = null; this.myD = null; this.rivalSlow = false;
    this.quitReason = null; this.dNow = 0;
    const v = this.v;
    v.t = 0; v.sudden = false; v.storm = false; v.go = false; v.net = 'on';
    v.me.n = 0; v.me.dist = 0; v.me.danger = 0; // (danger is only rewritten by the first sample after GO)
    v.peers = (link.peers || []).map((p) => ({ slot: p.slot, name: p.name, hero: p.hero, weapon: p.weapon, heroSkin: p.heroSkin || null, weaponSkin: p.weaponSkin || null, bot: !!p.bot, n: 0, dist: 0, danger: 0, x: 0, form: 0, flags: 0, charge: 0, boss: 0, zone: 1, alive: true, silent: 0, countdown: null, place: null, T: null, d: null, by: null }));
    this.offs = [
      link.on('state', (slot, s) => this.onPeerState(slot, s)),
      link.on('out', (slot, o) => this.onPeerOut(slot, o)),
      link.on('peer', (slot, o) => { const p = this.peer(slot); if (p) { p.silent = o.silent || 0; p.countdown = o.countdown ?? null; } }),
      link.on('status', (s) => { v.net = s; }),
      link.on('event', (e) => this.sab.onEvent(e)),
    ];
    this.offVerdict = link.on('verdict', (o) => this.onVerdict(o));
    this.live = true;
    g.beginRun({ ...endlessDef(1), name: 'ONLINE', versus: true }, 'versus', this.seed, { hero: picks.hero, weapon: picks.weapon, mods: ['noUpgrades'] });
    // bought Raider types (Shield Bearer / Medic / Heavy Gunner) are shop upgrades too: off for everyone
    g.squadTypes.begin(null);
    for (const m of g.squad.members) { m.type = 0; m.shield = false; }
    this.bossHp();
    this.ramp.begin(this.seed);
    this.sab.start(link, this.seed);
    this.ghost.begin(link.peers);
    g.events.emit('versus:start', { seed: this.seed, peers: link.peers || [] });
  }

  /** Leaves the match: reports my fall as 'quit' when I was still alive, drops the link, back to the title. */
  stop(opts = {}) {
    if (!this.live && !this.link) return;
    const g = this.game, run = g.run, link = this.link;
    if (this.live && link && !this.fallen && !this.reported && !this.verdict) {
      this.reported = true;
      link.fall({ t: this.t, d: this.metres(), by: 'quit' });
    }
    const mine = run && run.mode === 'versus';
    this.close(true);
    if (mine && opts.toTitle !== false && (g.state === 'playing' || g.state === 'result')) g.toTitle();
  }

  /** End of the live part (result screen reached, match left): listeners off, ghosts and ramp cleared. */
  close(leave = false) {
    this.live = false;
    for (const off of this.offs) if (typeof off === 'function') off();
    this.offs = [];
    this.ramp.end();
    this.sab.end();
    this.ghost.clear();
    // the link kept for the result screen still delivers a revised verdict; a link that is left delivers nothing more
    if (leave || !this.link) { if (typeof this.offVerdict === 'function') this.offVerdict(); this.offVerdict = null; }
    if (leave && this.link) { const l = this.link; this.link = null; l.leave(); }
  }

  onState(state) {
    if (!this.live) return;
    if (state === 'result') this.close(false);          // the link stays for the result screen / rematch (owner: UI)
    else if (state !== 'playing' && state !== 'paused') this.stop({ toTitle: false }); // HOME etc. in the middle of a match
  }

  // ---------------- the step hooks ----------------
  /** game.frame while live. dt = clamped frame time, real = wall-clock frame time. */
  pump(dt, real = dt) {
    const g = this.game, link = this.link, P = VS.pump;
    this.inPump = true;
    try {
      if (link && link.tick) link.tick();
      const run = g.run;
      if (g.state !== 'playing' || !run || run.mode !== 'versus' || !link) { g.step(dt); return; }
      const clock = link.clock();
      if (!this.go) {
        if (clock < 0) return; // countdown: the run waits at the start line
        this.go = true; this.v.go = true;
        g.events.emit('versus:go', {});
      }
      g.step(dt);
      if (!run.active) return;
      let gap = clock - this.t - this.stall;
      if (gap > P.maxGap) { this.stall += gap; gap = 0; } // a freeze / hidden tab is not replayed: that time is lost
      for (let k = 0; k < P.extra && gap >= P.step && run.active && g.state === 'playing'; k++) { g.step(P.step); gap -= P.step; }
      if (this.stall > P.forfeit && run.active) this.giveUp('stall');
    } finally {
      this.inPump = false;
      if (link) this.ghost.sync(real, link.clock());
    }
  }

  /** End of every playing game.step (runMods.ext). */
  step(dt, raw) {
    if (!this.live) return;
    const g = this.game, run = g.run, link = this.link;
    if (!run || run.mode !== 'versus' || !link) return;
    if (!this.inPump && link.tick) link.tick(); // stepped by hand (debug.simulate): the link still gets its tick
    this.simT += raw;
    if (run.active) {
      this.t += raw;
      const began = this.ramp.step(dt, raw, this.t);
      if (began) this.phase(began);
      this.sab.step(raw); // after ramp.step: the hazards reset the mods earlier in this step
      this.sampleT += raw;
      if (run.active && this.sampleT >= VS.sample) { this.sampleT = Math.min(this.sampleT - VS.sample, VS.sample); this.sample(); }
      return;
    }
    if (!this.fallen) return;
    // my squad is down: the result screen waits for the verdict (the slow-motion moment covers the wait)
    const E = VS.end;
    this.sinceFall += raw;
    // The verdict is the network side's to give, and it always gives one: at once when the rival plays on, after its
    // 3 s + 10 s countdown when the rival went silent, after ~20 s when the rival's clock stalled, after 8 s when I am
    // offline myself. Only if none of that arrives (a broken link) does the run end here, so the screen never hangs.
    if (!this.verdict && link.clock() - this.fellAt > E.verdictWait) this.onVerdict({ result: 'lose', place: null, places: [], reason: 'noverdict' });
    if (!this.verdict) g.resultTimer = 9;
    else if (!this.closing) { this.closing = true; g.resultTimer = Math.max(E.minHold, E.loseHold - this.sinceFall); }
  }

  phase(kind) {
    const g = this.game;
    this.v[kind] = true;
    g.events.emit('versus:' + kind, { t: this.t });
    g.events.emit('hazard:hint', { kind, text: HINT[kind][0], color: HINT[kind][1] });
  }

  // ---------------- my side ----------------
  /** Metres for the ranking: distance + up to 30 for the damage done to the boss I am fighting (as endless scores it). */
  metres() {
    const g = this.game, run = g.run;
    if (!run || run.mode !== 'versus') return this.myD ?? this.dNow; // the run is already gone (left through HOME)
    const b = run.phase === 'boss' && g.boss && g.boss.alive ? g.boss : null;
    return (this.dNow = Math.round(run.dist) + (b ? Math.floor(30 * (1 - b.hp / b.maxHp)) : 0));
  }

  danger() {
    const D = VS.danger, c = this.counts, n = this.game.squad.count;
    c[this.ci] = n; this.ci = (this.ci + 1) % c.length;
    let peak = n;
    for (let i = 0; i < c.length; i++) if (c[i] > peak) peak = c[i];
    const lost = peak > 0 ? (peak - n) / peak : 0;
    const low = this.t >= D.grace ? 1 - n / D.low : 0;
    return Math.max(0, Math.min(9, Math.round(9 * Math.max(low, lost))));
  }

  sample() {
    const g = this.game, run = g.run, b = run.phase === 'boss' && g.boss && g.boss.alive ? g.boss : null;
    const danger = this.danger();
    this.v.me.danger = danger;
    this.metres(); // keeps dNow fresh for a fall reported after the run is gone
    this.link.push({
      t: this.t, dist: run.dist, n: g.squad.count, form: Math.max(0, FORMATIONS.indexOf(g.formation.mode)),
      flags: (run.phase === 'boss' ? 1 : 0) | (g.shielded() ? 2 : 0) | this.sab.flags(),
      boss: b ? Math.max(0, Math.min(1, b.hp / b.maxHp)) : 0, zone: g.endless.zone, charge: this.sab.charge(), danger, x: g.squad.leader.x,
    });
  }

  bossHp() { const run = this.game.run, n = this.game.endless.zone; if (run && run.boss) run.boss = { ...run.boss, hp: vsBossHp(n), tier: vsBossTier(n) }; }

  /** A boss fell and the next zone exists: its boss gets the versus hp, its gate rows their red sides. */
  onZone() { if (!this.live) return; this.bossHp(); this.ramp.redden(); this.sab.onZone(); }

  /** Same opening attacks for every player: the boss dice restart from the match seed and the arena number. */
  onBossSpawn() { if (this.live && this.game.run && this.game.run.mode === 'versus') this.game.rng.seed((this.seed ^ (this.game.endless.zone * 0x9E37)) >>> 0); }

  onLose(p) {
    if (!this.live || !p || p.mode !== 'versus') return;
    // An online match pays nothing: the coins picked up on the road must not be shown as won. (This listener is the
    // newest on run:lose, so it runs first: the result screen, audio and fx read 0 like on the win path.)
    const g = this.game;
    if (p.coins) { g.bank.coins -= p.coins; p.coins = 0; }
    if (g.lastResult && g.lastResult.mode === 'versus') g.lastResult.coins = 0;
    if (g.run && g.run.mode === 'versus') g.run.coinsEarned = 0;
    if (this.fallen) return;
    this.fallen = true; this.sinceFall = 0; this.fellAt = this.link.clock();
    this.myT = this.t;
    this.myD = (p.dist || 0) + (p.bossMax ? Math.floor(30 * (1 - p.bossHp / p.bossMax)) : 0);
    if (!this.reported && !this.verdict) { this.reported = true; this.link.fall({ t: this.t, d: this.myD, by: 'dead' }); }
    this.sab.end();
    g.events.emit('fx:slowmo', VS.end.loseSlow);
  }

  /** Out without dying (stalled too long): reported as 'quit', then the run ends like a wipe-out. */
  giveUp(reason) {
    const run = this.game.run;
    if (!this.live || !run || !run.active || this.reported) return;
    this.reported = true; this.quitReason = reason;
    this.link.fall({ t: this.t, d: this.metres(), by: 'quit' });
    this.game.squad.setCount(0, 'versus');
  }

  // ---------------- the rivals ----------------
  peer(slot) { const ps = this.v.peers; for (let i = 0; i < ps.length; i++) if (ps[i].slot === slot) return ps[i]; return null; }

  onPeerState(slot, s) {
    const p = this.peer(slot);
    if (!p || !s || !p.alive) return;
    p.n = s.n | 0; p.dist = s.dist || 0; p.danger = s.danger | 0; p.x = s.x || 0; p.form = s.form | 0; p.flags = s.flags | 0; p.charge = s.charge | 0; p.boss = s.boss || 0; p.zone = s.zone || 1;
    p.silent = 0;
    this.ghost.feed(slot, s, this.link.clock());
  }

  onPeerOut(slot, o) {
    const p = this.peer(slot), g = this.game;
    if (!p || !p.alive) return;
    let alive = 0;
    for (const q of this.v.peers) if (q.alive && q !== p) alive++;
    p.alive = false; p.n = 0; p.danger = 9; p.silent = 0; p.countdown = null;
    p.T = o ? o.T : null; p.d = o ? o.d : null; p.by = o ? o.by : null;
    p.place = alive + (this.fallen ? 0 : 1) + 1; // provisional: the verdict has the final places
    this.ghost.fall(slot);
    this.sab.dropFrom(slot);
    g.events.emit('versus:peerdown', { slot, name: p.name, by: p.by });
    if (!alive && !this.fallen && g.run && g.run.active && !this.rivalSlow) {
      // the last rival is down: slow motion while the 1 s tie window runs (I must not fall inside it)
      this.rivalSlow = true;
      g.events.emit('fx:slowmo', VS.end.rivalSlow);
    }
  }

  onVerdict(o) {
    if (!o) return;
    if (this.verdict) { this.revise(o); return; }
    if (!this.live) return;
    const g = this.game, run = g.run;
    this.verdict = o;
    if (run && run.mode === 'versus' && run.active) {
      if (o.result === 'win') this.win();
      else { this.reported = true; g.squad.setCount(0, 'versus'); } // beaten while standing (forfeit by connection): the run ends now
    }
    this.result = this.makeResult(o);
    g.events.emit('versus:end', this.result);
  }

  makeResult(o) {
    for (const r of o.places || []) { const p = this.peer(r.slot); if (p) { p.place = (o.places.indexOf(r) + 1); if (r.T != null) p.T = r.T; if (r.d != null) p.d = r.d; if (r.by) p.by = r.by; } }
    // my own fall reads as its record holds it (whole tenths, capped by the server's stamp), so both screens show the same numbers
    const rec = this.link ? (o.places || []).find((r) => r.slot === this.link.slot && r.T != null) : null;
    return { result: o.result, place: o.place ?? null, places: o.places || [], t: Math.round((rec ? rec.T : this.myT ?? this.t) * 10) / 10, d: rec && rec.d != null ? rec.d : this.myD ?? this.metres(), reason: o.reason || this.quitReason || null, seed: this.seed, provisional: !!o.provisional, revised: !!o.revised };
  }

  /**
   * The network side could not be sure of its first verdict (I fell offline, or the last rival went silent after my
   * fall: `provisional`) and now the fall records have settled: this later verdict is the one that counts. My run is
   * over either way (both cases start with my own fall), so only the result changes; the result screen follows
   * 'versus:revised'. Anything else that arrives after a verdict is ignored: a match has one result.
   */
  revise(o) {
    if (!o.revised || !this.verdict.provisional || !this.link || !this.result) return;
    this.verdict = o;
    this.result = this.makeResult(o);
    const g = this.game;
    if (g.lastResult && g.lastResult.mode === 'versus') g.lastResult.win = o.result === 'win';
    g.events.emit('versus:revised', this.result);
  }

  /** Last squad standing: the run ends as a win (no payout, nothing saved). */
  win() {
    const g = this.game, run = g.run, E = VS.end;
    this.myT = this.t; this.myD = this.metres();
    const squad = g.squad.count;
    this.sab.end();
    run.setPhase('won');
    g.heroes.invulnT = Math.max(g.heroes.invulnT, E.winHold + 3); // nothing may thin the squad during the cheer
    g.horde.skipAll();
    g.lastResult = { win: true, levelId: run.levelId, mode: 'versus', stars: 0, coins: 0, squad, kills: run.kills, time: run.time };
    g.events.emit('run:win', { levelId: run.levelId, mode: 'versus', stars: 0, coins: 0, squad, kills: run.kills, time: Math.round(this.t * 10) / 10 });
    g.resultTimer = E.winHold;
  }

  // ---------------- read-outs ----------------
  /** HUD numbers; the same objects every call (no allocation). */
  view() {
    const g = this.game, v = this.v, run = g.run;
    v.t = this.t;
    v.sudden = this.ramp.sudden; v.storm = this.ramp.storm;
    v.me.n = g.squad.count;
    if (run && run.mode === 'versus') v.me.dist = run.dist;
    return v;
  }

  /** Tests / calibration: `seconds` of match through pump() without rendering; stops when the run leaves 'playing'. */
  simulate(seconds = 10, dt = 1 / 60) {
    const g = this.game, n = Math.max(0, Math.round(seconds / dt));
    for (let i = 0; i < n && this.live && g.state === 'playing'; i++) this.pump(dt, dt);
    g.sync(0);
    return g.debug.state();
  }
}
