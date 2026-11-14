// Win confetti: 2D canvas overlay in #app. Two cannon bursts from the bottom corners, then a gentle rain
// from the top. Pieces are preallocated paper rectangles / ribbons that flutter (cosine flip) as they fall.
const COLORS = ['#ffc531', '#2f8cff', '#59c1ff', '#ff3b4e', '#45ff7a', '#d64dff', '#ffffff', '#ff8a3d'];

export class Confetti {
  constructor(app) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-confetti';
    app.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.cap = 220;
    this.max = 220;
    this.p = [];
    for (let i = 0; i < this.cap; i++) this.p.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, w: 0, h: 0, ph: 0, fr: 0, c: COLORS[0], age: 0, life: 0, ribbon: false });
    this.active = 0;
    this.rain = 0;      // seconds of rain left
    this.rainAcc = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.shown = false;
  }

  setQuality(q) { this.max = q === 'low' ? 110 : this.cap; this.low = q === 'low'; }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = this.low ? 1 : Math.min(window.devicePixelRatio || 1, 2); // low quality: 1x overlay canvas
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
  }

  piece() {
    for (let i = 0; i < this.max; i++) if (!this.p[i].on) return this.p[i];
    return null;
  }

  init(q, x, y, vx, vy) {
    q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy;
    q.rot = Math.random() * 6.28; q.vr = (Math.random() - 0.5) * 10;
    q.ribbon = Math.random() < 0.22;
    q.w = q.ribbon ? 4 + Math.random() * 2 : 7 + Math.random() * 5;
    q.h = q.ribbon ? 16 + Math.random() * 10 : 9 + Math.random() * 6;
    q.ph = Math.random() * 6.28; q.fr = 7 + Math.random() * 8;
    q.c = COLORS[(Math.random() * COLORS.length) | 0];
    q.age = 0; q.life = 3.2 + Math.random() * 1.6;
    this.active++;
  }

  /** Two corner cannons + rain for `rain` seconds. */
  burst(rain = 2.6) {
    this.resize();
    const w = this.w, h = this.h;
    const n = Math.round(this.max * 0.32);
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < n; i++) {
        const q = this.piece(); if (!q) break;
        const dir = side === 0 ? 1 : -1;
        const a = (-62 + (Math.random() - 0.5) * 34) * Math.PI / 180;
        const sp = h * (1.05 + Math.random() * 0.75);
        this.init(q, side === 0 ? -6 : w + 6, h * (0.78 + Math.random() * 0.1), Math.cos(a) * sp * dir * 0.62, Math.sin(a) * sp);
      }
    }
    this.rain = rain;
    this.show(true);
  }

  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  clear() { for (const q of this.p) q.on = false; this.active = 0; this.rain = 0; this.show(false); }

  update(dt) {
    if (!this.shown) return;
    const w = this.w, h = this.h;
    if (this.rain > 0) {
      this.rain -= dt;
      this.rainAcc += dt * (this.max * 0.14);
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        const q = this.piece(); if (!q) break;
        this.init(q, Math.random() * w, -20 - Math.random() * 30, (Math.random() - 0.5) * 60, 60 + Math.random() * 90);
      }
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = h * 0.9;
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      const q = this.p[i];
      if (!q.on) continue;
      q.age += dt;
      // air drag strongly limits speed so the bursts hang and flutter down
      const k = Math.exp(-dt * 2.1);
      q.vx *= k; q.vy = q.vy * k + g * dt * 0.62;
      if (q.vy > 150) q.vy += (150 - q.vy) * Math.min(1, dt * 4);
      q.x += (q.vx + Math.sin(q.age * 2.3 + q.ph) * 26) * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      if (q.age > q.life || q.y > h + 40) { q.on = false; this.active--; continue; }
      live++;
      const flip = Math.cos(q.age * q.fr + q.ph);
      const fade = q.life - q.age < 0.5 ? (q.life - q.age) / 0.5 : 1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = q.c;
      const c = Math.cos(q.rot), s = Math.sin(q.rot);
      ctx.setTransform(c * this.dpr, s * this.dpr, -s * flip * this.dpr, c * flip * this.dpr, q.x * this.dpr, q.y * this.dpr);
      ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      if (Math.abs(flip) < 0.35) { ctx.globalAlpha = fade * 0.5; ctx.fillStyle = '#ffffff'; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); }
    }
    ctx.globalAlpha = 1;
    if (live === 0 && this.rain <= 0) this.show(false);
  }
}
