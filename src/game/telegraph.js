// Telegraph: warning markers painted on the road before an attack lands.
//   circle(x, z, r, duration, opts) / lane(x0, x1, zNear, zFar, duration, opts) -> handle
// A handle fills up over `duration`; at the end handle.fired = true (the attacker resolves damage),
// then it flashes and fades. Normal alpha blending (saturated red reads on the white road; additive would not).
import * as THREE from 'three';

const FADE = 0.22;
// Circle markers are repeated as a reticle hovering just above the Raiders' helmets: a big squad
// stands on (and hides) the ground decal, but the camera looks down onto the overhead reticle.
const OVERHEAD_Y = 1.3;
let circleTex = null, stripeTex = null, wallTex = null;

function makeWallTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 64, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 30, 128, 128, 124);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.4)');
  grd.addColorStop(0.9, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.stroke();
  // dashed inner ring
  g.lineWidth = 6;
  g.setLineDash([18, 14]);
  g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeStripeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = -2; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32 + 128, 128); g.lineTo(i * 64 + 128, 128);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const mat = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts });
const circleGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0);

export class Telegraph {
  init(game) {
    this.game = game;
    this.list = [];
    this.pools = { circle: [], lane: [] };
    this.time = 0;
    circleTex = circleTex || makeCircleTexture();
    stripeTex = stripeTex || makeStripeTexture();
    wallTex = wallTex || makeWallTexture();
  }

  reset() {
    for (const h of this.list) this.release(h);
    this.list.length = 0;
  }

  get active() { return this.list; }

  visual(kind) {
    const pool = this.pools[kind];
    if (pool.length) return pool.pop();
    const group = new THREE.Group();
    let v;
    if (kind === 'circle') {
      const base = new THREE.Mesh(circleGeo, mat({ map: circleTex, opacity: 1 }));
      const fill = new THREE.Mesh(circleGeo, mat({ opacity: 0.42 }));
      fill.position.y = 0.006;
      const wall = new THREE.Mesh(wallGeo, mat({ map: wallTex, side: THREE.DoubleSide, opacity: 0.8 }));
      const top = new THREE.Mesh(circleGeo, mat({ map: circleTex, opacity: 0.9, side: THREE.DoubleSide }));
      const topFill = new THREE.Mesh(circleGeo, mat({ opacity: 0.2, side: THREE.DoubleSide }));
      group.add(base, fill, wall, top, topFill);
      v = { group, base, fill, wall, top, topFill };
    } else {
      const tex = stripeTex.clone();
      tex.needsUpdate = true;
      const base = new THREE.Mesh(planeGeo, mat({ map: tex, opacity: 0.9 }));
      const fill = new THREE.Mesh(planeGeo, mat({ opacity: 0.38 }));
      fill.position.y = 0.006;
      const edgeA = new THREE.Mesh(planeGeo, mat({ opacity: 1 }));
      const edgeB = new THREE.Mesh(planeGeo, mat({ opacity: 1 }));
      // raised copy hovering over the helmets (a big squad hides the road decal): faint striped sheet + two
      // glowing rails along the lane edges
      const top = new THREE.Mesh(planeGeo, mat({ map: tex, opacity: 0.35, side: THREE.DoubleSide }));
      const railA = new THREE.Mesh(planeGeo, mat({ opacity: 0.9, side: THREE.DoubleSide }));
      const railB = new THREE.Mesh(planeGeo, mat({ opacity: 0.9, side: THREE.DoubleSide }));
      group.add(base, fill, edgeA, edgeB, top, railA, railB);
      v = { group, base, fill, edgeA, edgeB, tex, top, railA, railB };
    }
    for (const m of group.children) m.renderOrder = 2;
    if (v.topFill) { v.top.renderOrder = 8; v.topFill.renderOrder = 8; }
    if (v.railA) { v.top.renderOrder = 8; v.railA.renderOrder = 8; v.railB.renderOrder = 8; }
    v.kind = kind;
    return v;
  }

  add(h) {
    h.t = 0; h.fired = false; h.done = false;
    h.v = this.visual(h.kind);
    const color = h.color || '#ff2a3a';
    for (const m of h.v.group.children) m.material.color.set(color);
    this.game.scene.add(h.v.group);
    this.list.push(h);
    this.game.events.emit('boss:telegraph', { attack: h.attack || 'attack', pos: { x: h.x, y: 0, z: h.z }, duration: h.duration });
    return h;
  }

  /** Red fill-up circle on the road. */
  circle(x, z, r, duration, opts = {}) {
    return this.add({ kind: 'circle', x, z, r, duration: Math.max(0.9, duration), color: opts.color, attack: opts.attack });
  }

  /** Striped lane warning covering x0..x1 and zFar..zNear (zFar < zNear). */
  lane(x0, x1, zNear, zFar, duration, opts = {}) {
    return this.add({ kind: 'lane', x0: Math.min(x0, x1), x1: Math.max(x0, x1), zNear, zFar, x: (x0 + x1) / 2, z: (zNear + zFar) / 2, duration: Math.max(0.9, duration), color: opts.color, attack: opts.attack });
  }

  /** True if point (x, z) is inside the marked area (pad widens it). */
  contains(h, x, z, pad = 0) {
    if (h.kind === 'circle') { const dx = x - h.x, dz = z - h.z, r = h.r + pad; return dx * dx + dz * dz < r * r; }
    return x > h.x0 - pad && x < h.x1 + pad && z > h.zFar - pad && z < h.zNear + pad;
  }

  /** Remaining warning time (0 once fired). */
  remaining(h) { return Math.max(0, h.duration - h.t); }

  release(h) {
    if (!h.v) return;
    this.game.scene.remove(h.v.group);
    this.pools[h.v.kind].push(h.v);
    h.v = null;
  }

  cancel(h) { h.done = true; }

  update(dt) {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      if (!h.fired && h.t >= h.duration) h.fired = true;
      if (h.done || h.t >= h.duration + FADE) {
        h.done = true;
        this.release(h);
        this.list.splice(i, 1);
      }
    }
  }

  sync() {
    const time = this.time;
    for (const h of this.list) {
      const v = h.v;
      if (!v) continue;
      const p = Math.min(1, h.t / h.duration);
      const pulse = 0.5 + 0.5 * Math.sin(time * (10 + p * 18));
      const after = h.t > h.duration ? (h.t - h.duration) / FADE : 0;
      const fade = 1 - after;
      const ease = 1 - (1 - p) * (1 - p);
      if (h.kind === 'circle') {
        v.group.position.set(h.x, 0.045, h.z);
        const pop = Math.min(1, h.t / 0.12);
        v.base.scale.setScalar(h.r * (0.6 + 0.4 * pop) * (1 + (1 - p) * 0.04 * pulse));
        v.base.material.opacity = (0.75 + 0.25 * pulse) * fade;
        v.fill.scale.setScalar(Math.max(0.01, h.r * 0.98 * ease));
        v.fill.material.opacity = (after > 0 ? 0.9 : 0.34 + 0.3 * p) * fade;
        // the wall rises from the ground up to the overhead reticle as the warning fills
        v.wall.scale.set(h.r * 0.99, 0.35 + (OVERHEAD_Y - 0.35) * ease, h.r * 0.99);
        v.wall.material.opacity = (0.45 + 0.4 * pulse) * fade;
        // overhead reticle: drops in from above, tightens, and fills as impact nears
        const drop = (1 - pop) * 1.2;
        v.top.position.y = OVERHEAD_Y + drop;
        v.top.scale.setScalar(h.r * (1.25 - 0.25 * ease) * (1 + (1 - p) * 0.05 * pulse));
        v.top.material.opacity = (0.55 + 0.35 * pulse) * fade * pop;
        v.topFill.position.y = OVERHEAD_Y + drop + 0.004;
        v.topFill.scale.setScalar(Math.max(0.01, h.r * 0.98 * ease));
        v.topFill.material.opacity = (after > 0 ? 0.55 : 0.12 + 0.22 * p) * fade;
        if (after > 0) { v.fill.material.color.setRGB(1, 0.85, 0.8); v.topFill.material.color.setRGB(1, 0.85, 0.8); }
        else { v.fill.material.color.set(h.color || '#ff2a3a'); v.topFill.material.color.set(h.color || '#ff2a3a'); }
      } else {
        const w = h.x1 - h.x0, len = h.zNear - h.zFar;
        v.group.position.set(h.x, 0.045, h.z);
        v.base.scale.set(w, 1, len);
        v.tex.repeat.set(w / 2.2, len / 2.2);
        v.tex.offset.y = -time * 1.6;
        v.base.material.opacity = (0.7 + 0.3 * pulse) * fade;
        // fill sweeps from the far end toward the squad
        v.fill.scale.set(w, 1, Math.max(0.01, len * ease));
        v.fill.position.z = -len / 2 + (len * ease) / 2;
        v.fill.material.opacity = (after > 0 ? 0.8 : 0.22 + 0.2 * p) * fade;
        v.edgeA.scale.set(0.16, 1, len); v.edgeA.position.x = -w / 2;
        v.edgeB.scale.set(0.16, 1, len); v.edgeB.position.x = w / 2;
        v.edgeA.material.opacity = v.edgeB.material.opacity = (0.8 + 0.2 * pulse) * fade;
        const pop = Math.min(1, h.t / 0.12), y = OVERHEAD_Y + (1 - pop) * 1.2;
        v.top.position.y = y;
        v.top.scale.set(w, 1, len);
        v.top.material.opacity = (after > 0 ? 0.55 : 0.18 + 0.2 * p + 0.08 * pulse) * fade * pop;
        v.railA.scale.set(0.2, 1, len); v.railA.position.set(-w / 2, y + 0.005, 0);
        v.railB.scale.set(0.2, 1, len); v.railB.position.set(w / 2, y + 0.005, 0);
        v.railA.material.opacity = v.railB.material.opacity = (0.65 + 0.35 * pulse) * fade * pop;
      }
    }
  }

  dispose() {}
}
