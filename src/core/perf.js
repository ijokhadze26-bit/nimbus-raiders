// Frame profiler for the measurement harness (debug.perf.*): per-frame JS time of step / sync / render / ui,
// frame interval, renderer counters and JS heap growth between frames (performance.memory; Chrome updates it
// once per task, so per-phase attribution comes from smoke.mjs --heap-sample instead).
// Off by default: when off, Game.frame pays one boolean check.
const N = 4096;
const KEYS = ['step', 'sync', 'render', 'ui', 'total', 'dt'];

export class PerfProbe {
  constructor(engine) {
    this.engine = engine;
    this.on = false;
    this.buf = {};
    for (const k of KEYS) this.buf[k] = new Float32Array(N);
    this.n = 0;
    this.cur = { step: 0, sync: 0, render: 0, ui: 0 };

  }

  start() {
    this.on = true;
    this.n = 0;
    this.t0 = performance.now();
    this.calls = 0; this.callsMax = 0; this.tris = 0; this.trisMax = 0;
    const m = performance.memory;
    this.heap0 = m ? m.usedJSHeapSize : 0;
    this.heapLast = this.heap0;
    this.alloc = 0; this.gcs = 0; this.heapMax = this.heap0;
  }

  /** Called once per rendered frame by Game.frame / the loop with the phase timings (ms). */
  record(dtMs) {
    if (!this.on || this.n >= N) return;
    const i = this.n++, b = this.buf, c = this.cur;
    b.step[i] = c.step; b.sync[i] = c.sync; b.render[i] = c.render; b.ui[i] = c.ui;
    b.total[i] = c.step + c.sync + c.render + c.ui;
    b.dt[i] = dtMs;
    const s = this.engine.stats;
    this.calls += s.calls; this.tris += s.tris;
    if (s.calls > this.callsMax) this.callsMax = s.calls;
    if (s.tris > this.trisMax) this.trisMax = s.tris;
    const m = performance.memory;
    if (m) {
      const h = m.usedJSHeapSize;
      if (h >= this.heapLast) this.alloc += h - this.heapLast; else this.gcs++;
      this.heapLast = h;
      if (h > this.heapMax) this.heapMax = h;
    }
  }

  stop() {
    this.on = false;
    const n = Math.max(1, this.n);
    const secs = (performance.now() - this.t0) / 1000;
    const out = { frames: this.n, seconds: round(secs, 2), fps: round(this.n / Math.max(0.001, secs), 1) };
    for (const k of KEYS) out[k] = stats(this.buf[k], this.n);
    const info = this.engine.renderer.info;
    out.calls = { avg: Math.round(this.calls / n), max: this.callsMax };
    out.tris = { avg: Math.round(this.tris / n), max: this.trisMax };
    out.geometries = info.memory.geometries;
    out.textures = info.memory.textures;
    out.programs = info.programs ? info.programs.length : 0;
    out.longFrames = countOver(this.buf.total, this.n, 16.7);
    if (performance.memory) {
      out.heap = {
        allocKBPerFrame: round(this.alloc / 1024 / n, 1),
        allocKBPerSec: round(this.alloc / 1024 / Math.max(0.001, secs), 0),
        gcs: this.gcs,
        usedMB: round(this.heapLast / 1048576, 1),
        maxMB: round(this.heapMax / 1048576, 1),
      };
    }
    out.pixelRatio = this.engine.renderer.getPixelRatio();
    out.quality = this.engine.quality;
    return out;
  }
}

function stats(a, n) {
  if (!n) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += s[i];
  return { avg: round(sum / n, 2), p50: round(s[n >> 1], 2), p95: round(s[Math.min(n - 1, Math.floor(n * 0.95))], 2), max: round(s[n - 1], 2) };
}

function countOver(a, n, t) { let c = 0; for (let i = 0; i < n; i++) if (a[i] > t) c++; return c; }
function round(v, d) { const k = 10 ** d; return Math.round(v * k) / k; }
