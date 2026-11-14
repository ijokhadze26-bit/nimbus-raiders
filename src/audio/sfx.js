// SFX engine: plays the synthesized sounds in sfxdefs.js with
//  - per-sound throttle (min gap between starts, measured on the audio clock),
//  - per-sound voice caps (steal the oldest voice or skip),
//  - a global voice cap with priorities (spam never starves important sounds),
//  - density-adaptive gain so a wall of shots gets quieter instead of louder,
//  - small random pitch variation per play.
import { SFX } from './sfxdefs.js';

const GLOBAL_CAP = 30;

export class Sfx {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.voices = [];          // { name, g, end, pri, dead }
    this.last = new Map();     // name -> last start time
    this.loops = new Map();    // name -> { stop(t) }
    this.stats = { played: 0, throttled: 0, capped: 0, stolen: 0 };
  }

  has(name) { return !!SFX[name]; }

  /** Play sound `name` now (or at context time `at`). opts are passed to the sound (pitch, vol, ...). */
  play(name, opts = {}, at) {
    const def = SFX[name];
    if (!def) return false;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime + 0.004;
    const gap = def.gap ?? 0.03;
    const last = this.last.get(name);
    if (last !== undefined && t - last < gap && t >= last) { this.stats.throttled++; return false; }
    this.purge(t);
    const pri = def.pri ?? 1;
    // per-sound cap
    let same = 0, oldestSame = null;
    for (const v of this.voices) {
      if (v.dead || v.name !== name) continue;
      same++;
      if (!oldestSame || v.start < oldestSame.start) oldestSame = v;
    }
    const max = def.max ?? 4;
    if (same >= max) {
      if (def.steal === false || !oldestSame) { this.stats.capped++; return false; }
      this.kill(oldestSame, t); same--;
    }
    // global cap
    const live = this.liveCount();
    if (live >= GLOBAL_CAP) {
      if (pri === 0) { this.stats.capped++; return false; }
      const victim = this.lowest(pri);
      if (!victim) { this.stats.capped++; return false; }
      this.kill(victim, t);
    }
    const g = ctx.createGain();
    let vol = (def.vol ?? 1) * (opts.vol ?? 1);
    if (pri === 0) vol /= 1 + 0.22 * same;
    g.gain.value = vol;
    g.connect(this.out);
    const vary = def.vary ?? 1;
    const p = (opts.pitch ?? 1) * Math.pow(2, ((Math.random() * 2 - 1) * vary) / 12);
    let end;
    try { end = def.fn(ctx, g, t, p, opts); } catch (e) { try { g.disconnect(); } catch { /* */ } console.error('[audio] sfx ' + name, e); return false; }
    this.voices.push({ name, g, start: t, end: end || t + 0.5, pri, dead: false });
    this.last.set(name, t);
    this.stats.played++;
    return end || t + 0.5;
  }

  liveCount() { let n = 0; for (const v of this.voices) if (!v.dead) n++; return n; }

  lowest(pri) {
    let best = null;
    for (const v of this.voices) {
      if (v.dead || v.pri >= pri) continue;
      if (!best || v.pri < best.pri || (v.pri === best.pri && v.start < best.start)) best = v;
    }
    return best;
  }

  kill(v, t) {
    v.dead = true;
    const g = v.g.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.015);
    v.end = t + 0.03;
    this.stats.stolen++;
  }

  purge(t) {
    const vs = this.voices;
    for (let i = vs.length - 1; i >= 0; i--) {
      if (vs[i].end < t - 0.05) {
        try { vs[i].g.disconnect(); } catch { /* gone */ }
        vs.splice(i, 1);
      }
    }
  }

  /** Sustained loop (e.g. shield hum). Returns false if the sound has no loop form. */
  startLoop(name, opts = {}) {
    const def = SFX[name];
    if (!def || !def.loop) return false;
    this.stopLoop(name);
    const g = this.ctx.createGain();
    g.gain.value = def.vol ?? 1;
    g.connect(this.out);
    const t = this.ctx.currentTime + 0.01;
    let handle;
    try { handle = def.loop(this.ctx, g, t, opts); } catch (e) { console.error('[audio] loop ' + name, e); return false; }
    this.loops.set(name, { g, handle });
    return true;
  }

  stopLoop(name, fade = 0.35) {
    const l = this.loops.get(name);
    if (!l) return;
    this.loops.delete(name);
    const t = this.ctx.currentTime;
    l.g.gain.cancelScheduledValues(t);
    l.g.gain.setValueAtTime(l.g.gain.value, t);
    l.g.gain.linearRampToValueAtTime(0, t + fade);
    try { l.handle.stop(t + fade + 0.05); } catch { /* already stopped */ }
    setTimeout(() => { try { l.g.disconnect(); } catch { /* gone */ } }, (fade + 0.3) * 1000);
  }

  stopAllLoops() { for (const k of [...this.loops.keys()]) this.stopLoop(k, 0.15); }
}
