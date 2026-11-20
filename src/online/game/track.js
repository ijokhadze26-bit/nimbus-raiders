// Jitter-buffer playback of one rival (SPEC4 §5.4). Pure: no three, no DOM (ghost.js draws what play() returns).
// A rival sends 10 samples a second, bundled into one message every 250-500 ms: the newest sample's full state plus
// the lane positions `xs` of every sample in the bundle (0.1 s apart, oldest first). The ghost is drawn at
//   playhead = match clock - D,   D = the worst arrival offset of the last 10 messages + pad (clamped),
// and the playhead closes in on that goal at 0.95-1.05x speed, never by jumping (only a gap over `snap` s re-seats
// it: a long stall is covered by the starve fade). Distance and lane are interpolated, the squad count eases.
// Out of data: distance runs on for `extrapolate` s at the last speed, the lane holds, then the ghost fades.
import { VS } from './vsdata.js';

const MAX_X = 96, MAX_KEYS = 32;

export class Track {
  constructor() { this.out = { ok: false, dist: 0, x: 0, n: 0, form: 0, starve: 0, alpha: 1 }; this.reset(); }

  reset() {
    this.xt = []; this.xv = [];   // lane samples (time, x)
    this.keys = [];               // bundle keyframes { t, dist, n, form }
    this.offs = [];               // arrival offsets of the last 10 messages
    this.goalD = VS.ghost.delayMin;
    this.ph = null;               // playhead (rival played time)
    this.lastClock = null;
    this.n = 0;
    this.sd = null; this.sx = null; // what is shown (distance never runs backwards, lane eased)
    this.fed = 0;
    this.out.ok = false;
  }

  /** A decoded bundle `s` arrived at match clock `clock`. */
  feed(s, clock) {
    const G = VS.ghost;
    if (!s || !(s.t >= 0)) return;
    const keys = this.keys, last = keys.length ? keys[keys.length - 1].t : -1;
    if (s.t <= last) return; // old or repeated bundle
    this.offs.push(clock - s.t);
    if (this.offs.length > 10) this.offs.shift();
    let worst = 0;
    for (const o of this.offs) if (o > worst) worst = o;
    this.goalD = Math.max(G.delayMin, Math.min(G.delayMax, worst + G.delayPad));
    const xs = s.xs && s.xs.length ? s.xs : [s.x || 0];
    const lastX = this.xt.length ? this.xt[this.xt.length - 1] : -1;
    for (let i = 0; i < xs.length; i++) {
      const t = s.t - (xs.length - 1 - i) * VS.sample;
      if (t > lastX + 1e-6) { this.xt.push(t); this.xv.push(xs[i]); }
    }
    if (this.xt.length > MAX_X) { this.xt.splice(0, this.xt.length - MAX_X); this.xv.splice(0, this.xv.length - MAX_X); }
    keys.push({ t: s.t, dist: s.dist || 0, n: s.n | 0, form: s.form | 0 });
    if (keys.length > MAX_KEYS) keys.shift();
    if (!this.fed) this.n = s.n | 0;
    this.fed++;
  }

  /** Advances the playhead to match clock `clock` and writes the state to draw into this.out (ok = something to draw). */
  play(clock) {
    const G = VS.ghost, o = this.out, keys = this.keys;
    if (!keys.length) { o.ok = false; return o; }
    const want = clock - this.goalD;
    if (this.ph == null || this.lastClock == null || Math.abs(want - this.ph) > G.snap) this.ph = want;
    else {
      const step = Math.max(0, clock - this.lastClock);
      const rate = Math.max(G.rateMin, Math.min(G.rateMax, 1 + (want - this.ph) * 0.5));
      this.ph += step * rate;
    }
    const dtc = this.lastClock == null ? 0 : Math.max(0, Math.min(0.25, clock - this.lastClock));
    this.lastClock = clock;
    const ph = this.ph;
    // distance: between the two keyframes around the playhead, or a short run-on past the newest
    let k = keys.length - 1;
    while (k > 0 && keys[k].t > ph) k--;
    const a = keys[k], b = keys[k + 1];
    let starve = 0;
    let dist;
    const p = keys[k - 1];
    const speed = b ? Math.max(0, Math.min(20, (b.dist - a.dist) / (b.t - a.t))) : p && a.t > p.t ? Math.max(0, Math.min(20, (a.dist - p.dist) / (a.t - p.t))) : 0;
    if (b) dist = a.dist + (b.dist - a.dist) * Math.max(0, Math.min(1, (ph - a.t) / (b.t - a.t)));
    else if (ph <= a.t) dist = a.dist;
    else { starve = ph - a.t; dist = a.dist + speed * Math.min(starve, G.extrapolate); }
    // what is shown never pops: data after a gap is caught up at 1.5x the rival's speed, and a run-on that went too
    // far waits for the rival instead of stepping back (a gap of many metres = a re-seat, covered by the fade)
    if (this.sd == null || dist - this.sd > 12 || this.sd - dist > 8) this.sd = dist;
    else if (dist > this.sd) this.sd = Math.min(dist, this.sd + (speed * 1.5 + 0.5) * dtc);
    o.dist = this.sd;
    o.form = a.form;
    // lane
    const xt = this.xt, xv = this.xv;
    let i = xt.length - 1;
    while (i > 0 && xt[i] > ph) i--;
    const x = i < xt.length - 1 && ph > xt[i] ? xv[i] + (xv[i + 1] - xv[i]) * Math.min(1, (ph - xt[i]) / (xt[i + 1] - xt[i])) : xv[i];
    this.sx = this.sx == null ? x : this.sx + (x - this.sx) * (1 - Math.exp(-12 * dtc)); // eased: data after a gap never pops
    o.x = this.sx;
    // squad count eases toward the keyframe in force
    this.n += (a.n - this.n) * (1 - Math.exp(-7 * dtc));
    if (Math.abs(a.n - this.n) < 0.5) this.n = a.n;
    o.n = this.n;
    o.starve = starve;
    o.alpha = starve <= G.extrapolate ? 1 : Math.max(G.starveAlpha, 1 - (starve - G.extrapolate) / G.starveFade * (1 - G.starveAlpha));
    o.ok = true;
    return o;
  }
}
