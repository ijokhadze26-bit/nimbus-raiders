// Shared Web Audio building blocks for sfx + music: noise buffers, enveloped oscillators,
// filtered noise bursts. Every helper schedules at absolute context time `t` and stops its
// sources itself, so callers never hold on to nodes.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const noiseCache = new WeakMap();

/** One shared ~1.5 s white-noise buffer (+ a softer "pink-ish" one) per context. */
export function noiseBuffers(ctx) {
  let n = noiseCache.get(ctx);
  if (n) return n;
  const len = Math.floor(ctx.sampleRate * 1.5);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0), p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const r = Math.random() * 2 - 1;
    w[i] = r;
    // Paul Kellet's economy pink filter
    b0 = 0.99765 * b0 + r * 0.099046;
    b1 = 0.963 * b1 + r * 0.2965164;
    b2 = 0.57 * b2 + r * 1.0526913;
    p[i] = (b0 + b1 + b2 + r * 0.1848) * 0.2;
  }
  n = { white, pink };
  noiseCache.set(ctx, n);
  return n;
}

function cleanup(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } };
}

/**
 * Amp envelope on a GainNode param: attack -> peak, exponential-ish decay to `sus`*peak over `decay`,
 * hold until `dur`, release `rel`. Returns the time the voice is silent.
 */
export function ampEnv(g, t, { a = 0.003, peak = 0.5, decay = 0.1, sus = 0, dur = 0, rel = 0.05 }) {
  const p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  const susV = Math.max(0.0001, peak * sus);
  if (sus > 0) {
    p.setTargetAtTime(susV, t + a, decay / 3);
    const end = t + Math.max(a + decay, dur);
    p.setTargetAtTime(0, end, rel / 4);
    return end + rel;
  }
  p.setTargetAtTime(0, t + a, decay / 4);
  return t + a + decay + 0.02;
}

/**
 * Enveloped oscillator.
 * o: { type, f, f2 (glide target), glide (s), a, peak, decay, sus, dur, rel, detune, pan,
 *      lp (lowpass hz), lp2 (lowpass target), q, vib:{rate, depth (cents)}, dest }
 */
export function tone(ctx, dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  const f = Math.max(10, o.f || 440);
  osc.frequency.setValueAtTime(f, t);
  if (o.f2) {
    const g = o.glide ?? (o.decay || 0.1);
    if (o.lin) osc.frequency.linearRampToValueAtTime(Math.max(10, o.f2), t + g);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + g);
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const nodes = [osc];
  let head = osc;
  if (o.lp) {
    const flt = ctx.createBiquadFilter();
    flt.type = o.ftype || 'lowpass';
    flt.frequency.setValueAtTime(o.lp, t);
    if (o.lp2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp2), t + (o.lpT ?? o.decay ?? 0.1));
    flt.Q.value = o.q ?? 0.7;
    head.connect(flt); head = flt; nodes.push(flt);
  }
  const g = ctx.createGain();
  head.connect(g); nodes.push(g);
  let out = g;
  if (o.pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = o.pan;
    g.connect(pn); out = pn; nodes.push(pn);
  }
  out.connect(dest);
  let lfo = null;
  if (o.vib) {
    lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vib.rate || 6;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(o.vib.depth || 20, t + (o.vib.delay || 0.05));
    lfo.connect(lg); lg.connect(osc.detune);
    nodes.push(lfo, lg);
  }
  const end = ampEnv(g, t, o);
  osc.start(t); osc.stop(end + 0.02);
  if (lfo) { lfo.start(t); lfo.stop(end + 0.02); }
  cleanup(osc, nodes);
  return end;
}

/**
 * Filtered noise burst.
 * o: { pink, type ('lowpass'|'highpass'|'bandpass'), f, f2, fT, q, a, peak, decay, sus, dur, rel, pan, rate }
 */
export function noise(ctx, dest, t, o) {
  const nb = noiseBuffers(ctx);
  const src = ctx.createBufferSource();
  src.buffer = o.pink ? nb.pink : nb.white;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const flt = ctx.createBiquadFilter();
  flt.type = o.type || 'lowpass';
  flt.frequency.setValueAtTime(o.f || 2000, t);
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.fT ?? o.decay ?? 0.1));
  flt.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  src.connect(flt); flt.connect(g);
  const nodes = [src, flt, g];
  let out = g;
  if (o.pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = o.pan;
    g.connect(pn); out = pn; nodes.push(pn);
  }
  out.connect(dest);
  const end = ampEnv(g, t, o);
  src.start(t, Math.random() * 1.2); src.stop(end + 0.02);
  cleanup(src, nodes);
  return end;
}

/** Tiny FM bell/ding: carrier + modulator at `ratio`, index decays (bright -> pure). */
export function bell(ctx, dest, t, { f = 1000, ratio = 3.5, index = 2, peak = 0.3, decay = 0.6, pan = 0 }) {
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  const g = ctx.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + decay * 0.6);
  mod.connect(mg); mg.connect(car.frequency);
  car.connect(g);
  const nodes = [car, mod, mg, g];
  let out = g;
  if (pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan; g.connect(pn); out = pn; nodes.push(pn);
  }
  out.connect(dest);
  const end = ampEnv(g, t, { a: 0.002, peak, decay });
  car.start(t); mod.start(t); car.stop(end + 0.02); mod.stop(end + 0.02);
  cleanup(car, nodes);
  return end;
}

/** Soft saturation curve (tanh) for a WaveShaper; cached per amount. */
const curves = new Map();
export function softClipCurve(amount = 1.5) {
  let c = curves.get(amount);
  if (c) return c;
  c = new Float32Array(1024);
  const k = Math.tanh(amount);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * amount) / k; }
  curves.set(amount, c);
  return c;
}
