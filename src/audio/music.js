// Procedural music: a lookahead step sequencer (16ths) that plays the TRACKS song data,
// crossfades between tracks, ducks under pause, and can render deterministically into an
// OfflineAudioContext for tests (scheduleUntil()).
import { TRACKS } from './tracks.js';
import { parseChord } from './instruments.js';
import * as I from './instruments.js';

const LOOKAHEAD = 0.2;   // s scheduled ahead of currentTime
const TICK_MS = 25;

const TONE = { r: 0, t: 1, f: 2, s: 3, n: 4, o: 5 };

class Player {
  constructor(music, name, def, t0, fadeIn) {
    const ctx = music.ctx;
    this.music = music; this.ctx = ctx; this.name = name; this.def = def;
    this.stepDur = 60 / def.bpm / 4;
    this.chords = def.chords.map(parseChord);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setValueAtTime(0, t0);
    this.out.gain.linearRampToValueAtTime(def.gain ?? 1, t0 + Math.max(0.02, fadeIn));
    this.out.connect(music.input);
    this.wet = ctx.createGain();
    this.wet.connect(this.out);
    this.wet.connect(music.delaySend);
    this.step = 0;
    this.t0 = t0;
    this.next = t0;
    this.stopAt = Infinity;
    this.parts = def.parts.map((p) => ({ ...p, pats: p.pat ? (Array.isArray(p.pat) ? p.pat : [p.pat]) : null }));
  }

  fadeOut(now, fade) {
    if (this.stopAt !== Infinity) return;
    this.stopAt = now + fade;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
  }

  done(now) { return now > this.stopAt + 1.5; }

  dispose() { try { this.out.disconnect(); this.wet.disconnect(); } catch { /* gone */ } }

  schedule(until, live) {
    const now = this.ctx.currentTime;
    // fell behind (tab throttled, long GC): jump forward instead of a burst of late notes
    if (live && this.next < now - 0.05) this.next = now + 0.03;
    const sw = this.def.swing || 0;
    while (this.next < until && this.next < this.stopAt) {
      this.playStep(this.step, this.next);
      this.next += this.stepDur * (this.step % 2 === 0 ? 1 + sw : 1 - sw);
      this.step++;
    }
  }

  chordNotes(chord, lo) {
    const root = lo + ((chord.root - (lo % 12) + 120) % 12);
    return { root, iv: chord.iv };
  }

  noteFor(ch, lo, c) {
    const up = c >= 'A' && c <= 'Z';
    const k = TONE[c.toLowerCase()];
    if (k === undefined) return null;
    const { root, iv } = this.chordNotes(ch, lo);
    let off;
    if (k === 0) off = 0;
    else if (k === 1) off = iv[1];
    else if (k === 2) off = iv[2];
    else if (k === 3) off = iv[3] ?? 12;
    else if (k === 4) off = 14;
    else off = 12;
    return root + off + (up ? 12 : 0);
  }

  playStep(step, t) {
    const def = this.def;
    const s = step % 16;
    const bar = Math.floor(step / 16) % def.bars;
    const ch = this.chords[bar % this.chords.length];
    const ctx = this.ctx, dry = this.out, wet = this.wet;
    const barLen = this.stepDur * 16;
    for (const p of this.parts) {
      if (p.from !== undefined && (bar < p.from || bar >= p.to)) continue;
      if (p.only && !p.only.includes(bar)) continue;
      const v = p.v ?? 1;
      if (p.inst === 'pad') {
        if (s !== 0) continue;
        const { root, iv } = this.chordNotes(ch, p.lo || 55);
        I.pad(ctx, wet, t, iv.slice(0, 4).map((x) => root + x), barLen * 0.96, v);
        continue;
      }
      if (p.mel) {
        const notes = p.mel[bar - (p.from || 0)];
        if (!notes) continue;
        for (const n of notes) {
          if (n[0] !== s) continue;
          const len = n[2] * this.stepDur;
          if (p.inst === 'mallet') I.mallet(ctx, wet, t, n[1], v, 0.15);
          else I.lead(ctx, wet, t, n[1], len, v, p.inst === 'leadSaw' ? 'sawtooth' : 'square');
        }
        continue;
      }
      const pat = (p.fills && p.fills[bar]) || p.pats[bar % p.pats.length];
      const c = pat[s];
      if (!c || c === '.' || c === '-') continue;
      const vel = c === 'X' ? v * 1.2 : c === 'o' && !TONE_PART[p.inst] ? v * 0.5 : v;
      switch (p.inst) {
        case 'kick': I.kick(ctx, dry, t, vel); break;
        case 'kickH': I.kick(ctx, dry, t, vel, true); break;
        case 'snare': I.snare(ctx, dry, t, vel); break;
        case 'snareF': I.snare(ctx, dry, t, vel, true); break;
        case 'clap': I.clap(ctx, wet, t, vel); break;
        case 'rim': I.rim(ctx, wet, t, vel); break;
        case 'hat': I.hat(ctx, dry, t, vel, !!p.open); break;
        case 'shaker': I.shaker(ctx, dry, t, vel); break;
        case 'tom': I.tom(ctx, wet, t, vel, 200 - s * 9); break;
        case 'crash': I.crash(ctx, dry, t, vel); break;
        case 'riser': I.riser(ctx, dry, t, barLen, vel); break;
        case 'stab': {
          const { root, iv } = this.chordNotes(ch, p.lo || 57);
          I.stab(ctx, wet, t, iv.slice(0, 3).map((x) => root + x), vel, this.stepDur * 1.5);
          break;
        }
        default: {
          const m = this.noteFor(ch, p.lo || 48, c);
          if (m === null) break;
          let n = 1;
          while (pat[s + n] === '-') n++;
          if (p.inst === 'bass') I.bass(ctx, dry, t, m, n * this.stepDur, vel, p.bright ?? 0.5);
          else if (p.inst === 'mallet') I.mallet(ctx, wet, t, m, vel, -0.2);
          else I.pluck(ctx, wet, t, m, vel, (s % 4 - 1.5) * 0.12);
        }
      }
    }
  }
}

const TONE_PART = { bass: 1, pluck: 1, mallet: 1 };

export class Music {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.duckGain = ctx.createGain();
    this.input.connect(this.filter);
    this.filter.connect(this.duckGain);
    this.duckGain.connect(dest);
    // shared tempo delay (send/return) for leads + plucks
    this.delaySend = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    const ret = ctx.createGain(); ret.gain.value = 0.24;
    this.delaySend.connect(this.delay);
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    dlp.connect(ret); ret.connect(this.input);
    this.players = [];
    this.current = null;
    this.want = null;
    this.enabled = true;
    this.timer = null;
    this.paused = false;
  }

  /** Begin the realtime scheduler (call once the context is running). */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  tick() {
    const now = this.ctx.currentTime;
    this.scheduleUntil(now + LOOKAHEAD, true);
  }

  scheduleUntil(until, live = false) {
    const now = this.ctx.currentTime;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      try { p.schedule(until, live); } catch (e) { p.stopAt = 0; console.error('[audio] music', e); }
      if (p.done(now)) { p.dispose(); this.players.splice(i, 1); if (this.current === p) this.current = null; }
    }
  }

  /** Crossfade to `name` (no-op if already playing it, unless restart). */
  play(name, { fade = 1.0, restart = false, delay = 0 } = {}) {
    this.want = name;
    if (!this.enabled || !TRACKS[name]) return;
    const cur = this.current;
    if (cur && cur.name === name && cur.stopAt === Infinity && !restart) return;
    const now = this.ctx.currentTime;
    if (cur) cur.fadeOut(now, fade);
    const def = TRACKS[name];
    this.delay.delayTime.setTargetAtTime((def.delayBeats || 0.75) * 60 / def.bpm, now, 0.05);
    // start on the next beat-ish boundary; fade in a little faster than the old one fades out
    const t0 = now + 0.06 + delay;
    const p = new Player(this, name, def, t0, cur ? fade * 0.7 : 0.25);
    this.players.push(p);
    this.current = p;
  }

  /** Fade the current track out and remember that nothing should play. */
  stop(fade = 0.6) {
    this.want = null;
    if (this.current) this.current.fadeOut(this.ctx.currentTime, fade);
    this.current = null;
  }

  setEnabled(on) {
    on = !!on;
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      const want = this.want;
      const now = this.ctx.currentTime;
      for (const p of this.players) p.fadeOut(now, 0.25);
      this.current = null;
      this.want = want;
    } else if (this.want) {
      const w = this.want; this.want = null;
      this.play(w, { fade: 0.4 });
    }
  }

  /** Muffle + lower the music (pause menu, big moments). */
  duck(on, depth = 0.45) {
    const now = this.ctx.currentTime;
    this.paused = on;
    this.filter.frequency.cancelScheduledValues(now);
    this.duckGain.gain.cancelScheduledValues(now);
    this.filter.frequency.setTargetAtTime(on ? 1100 : 20000, now, 0.12);
    this.duckGain.gain.setTargetAtTime(on ? depth : 1, now, 0.12);
  }

  /** Brief sidechain-style dip under a big sfx (explosions, roars). */
  dip(amount = 0.5, hold = 0.35) {
    if (this.paused) return;
    const now = this.ctx.currentTime;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1 - amount, now, 0.03);
    g.setTargetAtTime(1, now + hold, 0.25);
  }

  dispose() {
    this.stopTimer();
    for (const p of this.players) p.dispose();
    this.players.length = 0;
  }
}
