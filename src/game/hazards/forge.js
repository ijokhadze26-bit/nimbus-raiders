// Volcanic Forge hazards (update 3):
//   lava    { at, length, lane:'L'|'R'|'both', paths?:[x], pathHalf?, rate? }  glowing river across a lane (or the
//           whole road with stepping-stone causeways); members in it burn up (rate-limited).
//   ember   { at, length, every, r, warn }  falling embers: telegraphed circles land on the squad's path.
//   crack   { at, length, lane:'L'|'R', delay }  cracked tiles: once the squad steps on them they glow, shake and
//           collapse into a road gap (obstacles' gap system) `delay` s later - linger and the back falls.
//   geyser  { at, lane, count, spacing, period, on, warn, r, dx? }  fire vents in a lane: a warning glow, then a
//           fire column on a cycle (vents alternate); members in a column burn.
import * as THREE from 'three';
import { LANES } from '../../config.js';
import { TILE_LEN } from '../../models/props.js';
import { FALLER, TMP } from './common.js';
import { InstPool, columnTexture } from '../../models/hazards/common.js';
import {
  lavaMaterial, lavaGeometry, lavaRimGeometry, rockMaterial, emberRockGeometry, emberRockMaterial, emberTrailGeometry,
  emberTrailMaterial, crackDarkMaterial, crackGlowMaterial, crackGeometry, ventGeometry, coreGeometry, coreMaterial,
  ringGeometry, ringMaterial, flameGeometry, flameMaterial,
} from '../../models/hazards/forge.js';

const { m: _m, q: _q, p: _p, s: _s } = TMP;
const _e = new THREE.Euler();
const ORANGE = 0xff7a1f;
const _c = { x: 0, z: 0, r: 0 };

// ---------------- lava ----------------
function lavaZones(o) {
  const xs = [o.x0];
  for (const p of o.paths.slice().sort((a, b) => a - b)) xs.push(p - o.ph, p + o.ph);
  xs.push(o.x1);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > 0.2) out.push({ kind: 'lane', x0: xs[i], x1: xs[i + 1], zNear: -o.from, zFar: -o.to, pad: 0.35 });
  }
  return out;
}

export const lava = {
  kind: 'lava',
  create(sys, ev) {
    const r = sys.laneRange(ev.lane || 'both', {});
    const len = ev.length || 6;
    const o = { x0: r.x0, x1: r.x1, from: ev.at, to: ev.at + len, paths: ev.paths || [], ph: ev.pathHalf || 1.15, rate: ev.rate || 14, spark: 0 };
    o.zones = lavaZones(o);
    o.test = (x, z) => {
      const d = -z;
      if (d < o.from + 0.2 || d > o.to - 0.2 || x < o.x0 || x > o.x1) return false;
      for (const p of o.paths) if (Math.abs(x - p) < o.ph) return false;
      return true;
    };
    const w = o.x1 - o.x0;
    const group = new THREE.Group();
    const surf = new THREE.Mesh(lavaGeometry(w, len), lavaMaterial());
    surf.position.set((o.x0 + o.x1) / 2, 0.035, -len / 2);
    const rim = new THREE.Mesh(lavaRimGeometry(o.x0, o.x1, len, o.paths, o.ph, sys.low), rockMaterial());
    group.add(surf, rim);
    group.position.z = -o.from;
    sys.game.scene.add(group);
    o.vis = { group, surf, rim };
    return o;
  },
  update(sys, o) {
    const dist = sys.dist;
    if (dist > o.to + 30) return false;
    for (const z of o.zones) sys.danger.push(z);
    if (dist >= o.from && dist <= o.to + 14) sys.killIn(o.test, o.rate, 'lava', o);
    return true;
  },
  sync(sys, o, dt) {
    if (sys.low) return;
    o.spark -= dt;
    const B = sys.fxB();
    if (o.spark > 0 || !B) return;
    o.spark = 0.18 + Math.random() * 0.2; // visual only
    const x = o.x0 + Math.random() * (o.x1 - o.x0), z = -(o.from + Math.random() * (o.to - o.from));
    let onPath = false;
    for (const p of o.paths) if (Math.abs(x - p) < o.ph) onPath = true;
    if (!onPath) B.sparks(x, 0.15, z, 0xffb347, 2, 0.5);
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.surf.geometry.dispose(); o.vis.rim.geometry.dispose();
    o.vis = null;
  },
  pre(sys) {
    const map = lavaMaterial().map, t = sys.time;
    map.offset.set(Math.sin(t * 0.3) * 0.05, -t * 0.06);
  },
  warm() {
    return [new THREE.Mesh(lavaGeometry(1, 1), lavaMaterial()), new THREE.Mesh(emberRockGeometry(), rockMaterial())];
  },
};

// ---------------- ember (falling embers) ----------------
const EMBER = {
  reason: 'ember', color: '#ff4a12', fallT: 0.55, height: 15, killRate: 45,
  land(sys, d) {
    const B = sys.fxB();
    if (B) { B.impact(d.x, d.z, ORANGE); if (!sys.low) B.slam(d.x, d.z, d.r * 0.7); }
    sys.sfx('slam');
    const L = sys.game.squad.leader;
    if (Math.abs(L.z - d.z) < 12) sys.shake(0.12);
  },
};
function emberPools(sys) {
  return sys.view('ember', () => ({
    rocks: new InstPool(sys.game.scene, emberRockGeometry(), emberRockMaterial(), 16),
    trails: new InstPool(sys.game.scene, emberTrailGeometry(), emberTrailMaterial(), 16),
  }));
}
export const ember = {
  kind: 'ember',
  create(sys, ev) { emberPools(sys); return FALLER.create(sys, ev, EMBER); },
  update: FALLER.update,
  sync(sys, o) {
    const v = emberPools(sys), H = o.cfg.height, side = 3.2;
    for (const d of o.drops) {
      if (d.landed || d.u <= 0) continue;
      const k = 1 - d.u;
      _p.set(d.x + side * k, H * k + 0.3, d.z - side * 0.4 * k);
      _e.set(0, 0, 0); _q.setFromEuler(_e);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      v.rocks.put(_m);
      _e.set(0.12, 0, Math.atan2(side, H)); _q.setFromEuler(_e);
      _m.compose(_p, _q, _s.set(1, 0.6 + d.u * 0.6, 1));
      v.trails.put(_m);
    }
  },
  release: FALLER.release,
  pre(sys) { const v = emberPools(sys); v.rocks.begin(); v.trails.begin(); columnTexture().offset.x = (sys.time * 0.9) % 1; },
  post(sys) { const v = emberPools(sys); v.rocks.end(); v.trails.end(); },
  warm() { return [new THREE.InstancedMesh(emberRockGeometry(), emberRockMaterial(), 1), new THREE.InstancedMesh(emberTrailGeometry(), emberTrailMaterial(), 1)]; },
};

// ---------------- crack (cracking floor) ----------------
export const crack = {
  kind: 'crack',
  create(sys, ev) {
    const lane = ev.lane === 'R' ? 'R' : 'L';
    const r = sys.laneRange(lane, {});
    const from = Math.floor(ev.at / TILE_LEN) * TILE_LEN;
    const to = Math.max(from + TILE_LEN, Math.ceil((ev.at + (ev.length || 20)) / TILE_LEN) * TILE_LEN);
    const o = { lane, x0: r.x0, x1: r.x1, from, to, delay: ev.delay || 2.4, state: 'idle', t: 0, gap: null };
    o.zone = { kind: 'lane', x0: r.x0, x1: r.x1, zNear: -from, zFar: -to, pad: 0.45 };
    const w = r.x1 - r.x0, len = to - from;
    const group = new THREE.Group();
    const geo = crackGeometry(w - 0.1, len);
    const dark = new THREE.Mesh(geo, crackDarkMaterial());
    const glow = new THREE.Mesh(geo, crackGlowMaterial());
    dark.position.y = 0.03; glow.position.y = 0.04;
    dark.renderOrder = 1; glow.renderOrder = 1;
    group.add(dark, glow);
    group.position.set((r.x0 + r.x1) / 2, 0, -(from + len / 2));
    sys.game.scene.add(group);
    o.vis = { group, geo, glow, baseX: group.position.x, debris: 0 };
    return o;
  },
  /** Any of the squad standing on the cracked tiles. */
  stepped(sys, o) {
    const sq = sys.game.squad, L = sq.leader, ms = sq.members;
    const on = (x, z) => x > o.x0 && x < o.x1 && -z > o.from && -z < o.to;
    if (!sq.pipGone && on(L.x, L.z)) return true;
    const stride = Math.max(1, Math.floor(ms.length / 40));
    for (let i = 0; i < ms.length; i += stride) if (on(ms[i].x, ms[i].z)) return true;
    return false;
  },
  update(sys, o, dt) {
    const dist = sys.dist;
    if (o.state === 'idle') {
      if (dist > o.to + 30) return false;
      if (dist >= o.from && dist < o.to + 14 && sys.live && crack.stepped(sys, o)) { o.state = 'crack'; o.t = 0; sys.sfx('rumble'); }
    } else if (o.state === 'crack') {
      o.t += dt;
      sys.danger.push(o.zone);
      if (o.t >= o.delay) crack.collapse(sys, o);
    } else if (dist > o.to + 30) return false;
    return true;
  },
  collapse(sys, o) {
    o.state = 'gone';
    const obs = sys.game.obstacles;
    o.gap = { lane: o.lane, from: o.from, to: o.to, at: o.from, crack: true };
    obs.gaps.push(o.gap);
    sys.game.world.setGaps(obs.gaps);
    o.vis.group.visible = false;
    const B = sys.fxB();
    if (B && B.D) {
      const n = sys.low ? 6 : 16;
      for (let i = 0; i < n; i++) { // visual only
        const x = o.x0 + Math.random() * (o.x1 - o.x0), z = -(o.from + Math.random() * (o.to - o.from));
        B.D.spawn(x, 0.1, z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.2, 0.3 + Math.random() * 0.25, Math.random() < 0.5 ? 0x4a3a3c : 0xff7a1f);
      }
    }
    sys.sfx('fall');
    sys.shake(0.25);
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v || o.state === 'gone') return;
    const t = sys.time;
    if (o.state === 'idle') {
      v.glow.material.opacity = 0.34 + 0.12 * Math.sin(t * 2 + o.from);
      v.group.position.x = v.baseX;
      return;
    }
    const k = Math.min(1, o.t / o.delay);
    v.glow.material.opacity = 0.45 + 0.55 * k * (0.6 + 0.4 * Math.sin(t * (14 + 20 * k)));
    const j = 0.025 + 0.06 * k;
    v.group.position.x = v.baseX + Math.sin(t * 61) * j;
    v.group.position.y = Math.sin(t * 47) * j * 0.5;
    v.debris -= dt;
    const B = sys.fxB();
    if (!sys.low && B && B.D && v.debris <= 0) {
      v.debris = 0.12;
      const x = o.x0 + Math.random() * (o.x1 - o.x0), z = -(o.from + Math.random() * (o.to - o.from));
      B.D.spawn(x, 0.05, z, 0, 1.5 + Math.random(), 0, 0.6, 0.18, 0x5a4848);
    }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.geo.dispose(); o.vis.glow.material.dispose();
    o.vis = null;
  },
  warm() { const g = crackGeometry(1, 1); return [new THREE.Mesh(g, crackDarkMaterial()), new THREE.Mesh(g, crackGlowMaterial())]; },
};

// ---------------- geyser ----------------
const GEYSER_H = 6.5;
function phaseOf(sys, o, v, dt = 0) { const c = (sys.time + dt + v.ph) % o.period; return c < 0 ? c + o.period : c; }
/** True when vent v erupts at any point between t0 and t1 seconds from now. */
function hotBetween(sys, o, v, t0, t1) {
  for (let t = Math.max(0, t0); t <= t1; t += 0.1) if (phaseOf(sys, o, v, t) < o.on) return true;
  return false;
}

export const geyser = {
  kind: 'geyser',
  create(sys, ev) {
    const lane = ev.lane === 'R' ? 'R' : ev.lane === 'C' ? 'C' : 'L';
    const n = Math.max(1, ev.count || 1), sp = ev.spacing || 9;
    const o = { vents: [], period: ev.period || 3.4, on: ev.on || 1.0, warn: ev.warn || 1.0, r: ev.r || 1.5, rate: ev.rate || 30, from: ev.at, to: ev.at + (n - 1) * sp + 4 };
    const x = Math.max(-4, Math.min(4, (LANES[lane] ?? 0) + (ev.dx || 0)));
    for (let i = 0; i < n; i++) {
      const z = -(ev.at + 2 + i * sp);
      const v = { x: (i % 2 && ev.zigzag ? -x : x), z, ph: (i * o.period) / Math.max(2, n) + (ev.at % 7) * 0.3, erupt: false, warnK: 0, h: 0 };
      const r2 = o.r * o.r;
      v.test = (mx, mz) => { const dx = mx - v.x, dz = mz - v.z; return dx * dx + dz * dz < r2; };
      v.zone = { kind: 'circle', x: v.x, z: v.z, r: o.r + 0.15, pad: 0.35 };
      v.vis = geyser.buildVent(sys, v);
      o.vents.push(v);
    }
    return o;
  },
  buildVent(sys, v) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(ventGeometry(), rockMaterial());
    const core = new THREE.Mesh(coreGeometry(), coreMaterial());
    core.position.y = 0.5;
    const ring = new THREE.Mesh(ringGeometry(), ringMaterial());
    ring.position.y = 0.06; ring.scale.setScalar(4.2);
    const outer = new THREE.Mesh(flameGeometry(), flameMaterial('#ff6a1f'));
    const inner = new THREE.Mesh(flameGeometry(), flameMaterial('#ffe08a'));
    outer.visible = inner.visible = false;
    group.add(base, core, ring, outer, inner);
    group.position.set(v.x, 0, v.z);
    sys.game.scene.add(group);
    return { group, core, ring, outer, inner };
  },
  update(sys, o) {
    const dist = sys.dist, sq = sys.game.squad, L = sq.leader;
    if (dist > o.to + 30) return false;
    const speed = Math.max(1, sys.speed);
    const c = sq.center(_c);
    const blobT = (c.r * 2 + 1.5) / speed;
    for (const v of o.vents) {
      const ph = phaseOf(sys, o, v);
      const was = v.erupt;
      v.erupt = ph < o.on;
      v.warnK = ph >= o.period - o.warn ? (ph - (o.period - o.warn)) / o.warn : 0;
      if (v.erupt && !was && Math.abs(L.z - v.z) < 40) sys.sfx('charge');
      if (v.erupt) sys.killIn(v.test, o.rate, 'geyser', v);
      // the bot steers clear of a vent that is hot while the blob passes it
      const ta = (L.z - v.z) / speed;
      if (ta + blobT > 0 && ta < 4 && hotBetween(sys, o, v, ta - 0.25, ta + blobT)) sys.danger.push(v.zone);
    }
    return true;
  },
  sync(sys, o, dt) {
    const t = sys.time, low = sys.low, B = sys.fxB();
    for (const v of o.vents) {
      const s = v.vis;
      const target = v.erupt ? 1 : 0;
      v.h += (target - v.h) * Math.min(1, dt * (v.erupt ? 14 : 7));
      const show = v.h > 0.03;
      s.outer.visible = show;
      s.inner.visible = show && !low;
      if (show) {
        const wob = 1 + 0.08 * Math.sin(t * 23 + v.ph);
        s.outer.scale.set(1.25 * wob, GEYSER_H * v.h, 1.25 * wob);
        s.inner.scale.set(0.7, GEYSER_H * 1.08 * v.h, 0.7);
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * (8 + 14 * v.warnK));
      s.ring.material.opacity = v.erupt ? 0.9 : v.warnK > 0 ? 0.35 + 0.6 * v.warnK * pulse : 0.12;
      s.core.material.opacity = 0.55 + 0.45 * Math.max(v.h, v.warnK * pulse);
      s.core.material.color.setRGB(1, 0.45 + 0.4 * Math.max(v.h, v.warnK), 0.15);
      if (!low && B && v.warnK > 0.4 && Math.random() < dt * 10) B.sparks(v.x, 0.5, v.z, 0xffb347, 1, 0.6);
    }
  },
  pre(sys) { columnTexture().offset.x = (sys.time * 0.9) % 1; },
  release(sys, o) {
    for (const v of o.vents) {
      if (!v.vis) continue;
      sys.game.scene.remove(v.vis.group);
      v.vis.core.material.dispose(); v.vis.ring.material.dispose();
      v.vis = null;
    }
  },
  warm() {
    return [new THREE.Mesh(ventGeometry(), rockMaterial()), new THREE.Mesh(coreGeometry(), coreMaterial()), new THREE.Mesh(ringGeometry(), ringMaterial()),
      new THREE.Mesh(flameGeometry(), flameMaterial('#ff6a1f'))];
  },
};

export const FORGE_KINDS = [lava, ember, crack, geyser];
