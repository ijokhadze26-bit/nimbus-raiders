// Floating text popups: pooled DOM nodes projected from 3D each frame. Anchors are either a fixed world
// point (gate hits, barrels, boss) or the squad leader (gate results ride along with the running squad).
import * as THREE from 'three';

const POOL = 28;
const _v = new THREE.Vector3();

// motion presets: life (s), rise (px over life), pop (start scale overshoot), fade start (0..1)
const KINDS = {
  big: { life: 1.15, rise: 70, pop: 1.9, fade: 0.62 },
  reward: { life: 1.1, rise: 60, pop: 1.6, fade: 0.6 },
  tick: { life: 0.55, rise: 34, pop: 1.5, fade: 0.45 },
  coin: { life: 0.8, rise: 50, pop: 1.5, fade: 0.55 },
  dmg: { life: 0.75, rise: 44, pop: 1.7, fade: 0.5 },
};

export class Popups {
  constructor(layer, game) {
    this.game = game;
    this.items = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'fxp';
      const span = document.createElement('span');
      el.appendChild(span);
      layer.appendChild(el);
      this.items.push({ el, span, on: false, age: 0, life: 1, k: KINDS.tick, x: 0, y: 0, z: 0, follow: false, dx: 0, cls: '', scale: 1, html: '' });
    }
    this.next = 0;
  }

  /**
   * kind: big|reward|tick|coin|dmg. html is trusted markup built by fx (numbers + fixed words only).
   * follow = anchor to the leader (x/y/z become an offset from it).
   */
  show(kind, html, x, y, z, { color = null, outline = null, follow = false, scale = 1, dx = 0 } = {}) {
    // reuse a free node, else recycle the oldest
    let it = null;
    for (let i = 0; i < POOL; i++) {
      const c = this.items[(this.next + i) % POOL];
      if (!c.on) { it = c; break; }
    }
    if (!it) { let best = this.items[0]; for (const c of this.items) if (c.age / c.life > best.age / best.life) best = c; it = best; }
    this.next = (this.items.indexOf(it) + 1) % POOL;
    const k = KINDS[kind] || KINDS.tick;
    it.on = true; it.age = 0; it.life = k.life; it.k = k;
    it.x = x; it.y = y; it.z = z; it.follow = follow; it.scale = scale; it.dx = dx;
    if (it.cls !== kind) { it.cls = kind; it.el.className = 'fxp ' + kind; }
    if (it.html !== html) { it.html = html; it.span.innerHTML = html; }
    it.el.style.color = color || '';
    if (outline) it.el.style.setProperty('--o', outline); else it.el.style.removeProperty('--o');
    it.el.style.display = 'block';
    return it;
  }

  clear() { for (const it of this.items) if (it.on) { it.on = false; it.el.style.display = 'none'; } }

  update(dt) {
    const g = this.game, cam = g.camera, w = g.engine.width, h = g.engine.height;
    const L = g.squad.leader;
    for (let i = 0; i < POOL; i++) {
      const it = this.items[i];
      if (!it.on) continue;
      it.age += dt;
      const t = it.age / it.life;
      if (t >= 1) { it.on = false; it.el.style.display = 'none'; continue; }
      if (it.follow) _v.set(L.x + it.x, it.y, L.z + it.z); else _v.set(it.x, it.y, it.z);
      _v.project(cam);
      if (_v.z > 1) { it.el.style.opacity = '0'; continue; }
      const k = it.k;
      const sx = (_v.x * 0.5 + 0.5) * w + it.dx * t;
      const sy = (-_v.y * 0.5 + 0.5) * h - k.rise * (1 - (1 - t) * (1 - t));
      // punchy entrance: overshoot -> settle, then a slight shrink while fading
      const pop = t < 0.12 ? k.pop - (k.pop - 0.92) * (t / 0.12) : (t < 0.22 ? 0.92 + 0.08 * ((t - 0.12) / 0.1) : 1 - (t > k.fade ? (t - k.fade) * 0.25 : 0));
      const s = pop * it.scale;
      const op = t < k.fade ? 1 : 1 - (t - k.fade) / (1 - k.fade);
      const cx = Math.max(24, Math.min(w - 24, sx));
      it.el.style.transform = `translate3d(${cx.toFixed(1)}px,${sy.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      it.el.style.opacity = op.toFixed(2);
    }
  }
}
