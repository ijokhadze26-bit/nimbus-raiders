// Shared hazard visuals (update 3 world hazards): canvas textures and materials, cached and created lazily so
// a sky-only session never pays for them. Everything is unlit or Lambert, never a shadow caster, no lights.
import * as THREE from 'three';

const cache = {};
export const once = (k, make) => cache[k] || (cache[k] = make());

/** Seeded cosmetic rng for texture painting (never game logic). */
export function paintRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

/** Unlit glowing material (lava, fire, glows): toneMapped off so it stays hot under any theme light. */
export function glowMaterial(opts = {}) {
  return new THREE.MeshBasicMaterial({ toneMapped: false, ...opts });
}

/**
 * Additive soft material for flames / sheens / auras. Double-sided ones draw in one pass (three splits a
 * transparent double-sided mesh into a back pass + a front pass: two draw calls; additive blending without
 * depth writes gives the same picture in either order, so the second pass only cost a draw call).
 */
export function addMaterial(opts = {}) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...opts });
  if (m.side === THREE.DoubleSide && m.blending === THREE.AdditiveBlending && !m.depthWrite) m.forceSinglePass = true;
  return m;
}

/** Decal on the road (sits above the tiles, below telegraphs). */
export function decalMaterial(opts = {}) {
  return new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...opts });
}

/** Flat 1x1 plane lying on the road (scale x = width, z = length). */
export const flatPlane = () => once('flatPlane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

/** Vertical gradient for flame columns / waves (white core fading up). */
export function columnTexture() {
  return once('columnTex', () => canvasTexture(64, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // tongues: darker vertical stripes so the scroll reads as flicker
    const r = paintRng(5);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const x = r() * w, ww = 4 + r() * 8;
      const gg = g.createLinearGradient(0, h, 0, 0);
      gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, 'rgba(0,0,0,0.45)'); gg.addColorStop(1, 'rgba(0,0,0,0.8)');
      g.fillStyle = gg; g.fillRect(x, 0, ww, h);
    }
  }, { repeat: true }));
}

/** Soft round glow (rings under geysers, impact flashes). */
export function softDiscTexture() {
  return once('softDisc', () => canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));
}

/** Ring glow (warning ring). */
export function ringTexture() {
  return once('ringTex', () => canvasTexture(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grd.addColorStop(0.86, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }));
}

/**
 * A fixed-size pool of InstancedMesh slots: begin() each frame, put(matrix-ish) per visible item, end() sets
 * the count. Used for falling embers / icicles / shadows (one draw call per pool, no per-frame allocation).
 */
export class InstPool {
  constructor(scene, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.max = max;
    this.n = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  put(m) { if (this.n < this.max) this.mesh.setMatrixAt(this.n++, m); }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0; // an empty pool still cost the renderer a program + uniform setup per frame
    if (this.n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
