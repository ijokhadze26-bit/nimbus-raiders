// World: recycled sky-bridge tiles (+trim, divider), sky dome, cloud sea, puffs, islands, lights, themes, gaps.
import * as THREE from 'three';
import { getTheme } from '../data/themes.js';
import { createSky, createSea } from './skybox.js';
import { TILE_LEN, roadTexture, halfTileGeometry, trimGeometry, dividerGeometry, islandGeometry, puffGeometry } from '../models/props.js';
import { toonGradient } from '../models/materials.js';
import { QUALITY } from '../config.js';
import { markInstances } from '../core/pool.js';
import { buildGapView, disposeGapView } from '../models/obstacles.js';

const AHEAD = 196, BEHIND = 24;
const ROWS = Math.ceil((AHEAD + BEHIND) / TILE_LEN) + 2;
const SEA_PUFFS = 150, SKY_PUFFS = 70, ISLANDS = 7;
// low quality draws the cluster centres plus fewer satellites (same layout, lighter sky)
const LOW_PUFFS = { sea: 84, sky: 36 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color(), _c2 = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI);
const IDENT = new THREE.Quaternion();

export class World {
  init(game) {
    this.game = game;
    const scene = (this.scene = game.scene);
    this.theme = getTheme('noon');
    this.time = 0;
    this.gaps = [];
    this.gapViews = new Map(); // gap object -> dressing (lips, depth walls, pit shade, chevrons)
    this.baseRow = null;
    this.camZ = 0;

    // Sky + sea
    this.sky = createSky();
    scene.add(this.sky.mesh);
    this.sea = createSea(this.sky);
    scene.add(this.sea.mesh);
    scene.fog = new THREE.Fog('#cdeeff', 70, 210);

    // Lights
    this.hemi = new THREE.HemisphereLight('#ffffff', '#9cc2ee', 2);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff6e3', 2));
    sun.castShadow = true;
    const ext = QUALITY.shadowExtent;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 70 });
    sun.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.layers.enable(1); // shadow-only proxies (see squad.js SHADOW_LAYER)
    scene.add(sun, sun.target);
    game.engine.sun = sun; // quality switches toggle its shadow
    this.quality = 'high';

    // Road (half tiles, trims share the same instance matrices)
    const tex = roadTexture();
    this.roadMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
    this.road = new THREE.InstancedMesh(halfTileGeometry(this.theme), this.roadMat, ROWS * 2);
    this.road.receiveShadow = true;
    this.road.frustumCulled = false;
    this.road.setColorAt(0, _c.set(1, 1, 1)); // instanceColor exists before the shader warm-up compiles it
    this.trimMat = new THREE.MeshLambertMaterial({ color: '#f4c24f', emissive: '#b8801a', emissiveIntensity: 0.35, vertexColors: true });
    this.trim = new THREE.InstancedMesh(trimGeometry(), this.trimMat, ROWS * 2);
    this.trim.instanceMatrix = this.road.instanceMatrix;
    this.trim.receiveShadow = true;
    this.trim.frustumCulled = false;
    this.dividerMat = new THREE.MeshLambertMaterial({ color: '#a8d6ff', emissive: '#4f8fd8', emissiveIntensity: 0.18, vertexColors: true });
    this.divider = new THREE.InstancedMesh(dividerGeometry(), this.dividerMat, ROWS);
    this.divider.receiveShadow = true;
    this.divider.castShadow = false;
    this.divider.frustumCulled = false;
    scene.add(this.road, this.trim, this.divider);

    // Cloud puffs below / beside the bridge (static, recycled) and high distant clouds (follow camera)
    this.cloudMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient(), emissive: '#ffffff', emissiveIntensity: 0.3 });
    this.puffs = new THREE.InstancedMesh(puffGeometry(), this.cloudMat, SEA_PUFFS);
    this.puffs.frustumCulled = false;
    this.skyCloudMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient(), emissive: '#ffffff', emissiveIntensity: 0.45, fog: false });
    this.skyPuffs = new THREE.InstancedMesh(puffGeometry(), this.skyCloudMat, SKY_PUFFS);
    this.skyPuffs.frustumCulled = false;
    scene.add(this.puffs, this.skyPuffs);
    this.seaPuffData = [];
    this.skyPuffData = [];
    this.islandData = [];
    this.islandMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.islands = null;
    this.rng = mulberry(7);
    this.buildClouds();
    this.setTheme('noon');
  }

  /** Low quality: fewer cloud puffs, 2-octave cloud sea (uniforms / counts only: no shader rebuild). */
  setQuality(q) {
    this.quality = q;
    const low = q === 'low';
    this.puffs.count = low ? LOW_PUFFS.sea : SEA_PUFFS;
    this.skyPuffs.count = low ? LOW_PUFFS.sky : SKY_PUFFS;
    this.sea.uniforms.uOctaves.value = low ? 2 : 4;
  }

  /** Cosmetic layout of puffs/islands (own RNG so gameplay determinism is untouched). */
  buildClouds() {
    const r = this.rng;
    this.seaPuffData.length = 0;
    const clusters = 30;
    for (let i = 0; i < SEA_PUFFS; i++) {
      const ci = i % clusters;
      const side = ci % 2 ? 1 : -1;
      const base = { x: side * (9 + r() * 55), z: -r() * 240 + 20, y: -9 - r() * 4 };
      if (i >= clusters) {
        const c = this.seaPuffData[ci];
        base.x = c.x + (r() - 0.5) * 9; base.z = c.z + (r() - 0.5) * 7; base.y = c.y + (r() - 0.3) * 2;
      }
      const s = i < clusters ? 3.5 + r() * 3.5 : 1.8 + r() * 3;
      this.seaPuffData.push({ x: base.x, y: base.y, z: base.z, s, sy: s * (0.55 + r() * 0.25) });
    }
    this.skyPuffData.length = 0;
    const sc = 12;
    for (let i = 0; i < SKY_PUFFS; i++) {
      const ci = i % sc;
      let d;
      if (i < sc) d = { x: (r() - 0.5) * 380, y: 10 + r() * 22, dz: -260 - r() * 120, s: 5 + r() * 6 };
      else { const c = this.skyPuffData[ci]; d = { x: c.x + (r() - 0.5) * c.s * 3, y: c.y + (r() - 0.4) * c.s * 0.5, dz: c.dz + (r() - 0.5) * 20, s: c.s * (0.5 + r() * 0.5) }; }
      d.sy = d.s * (0.5 + r() * 0.2);
      d.drift = 0.6 + r() * 0.8;
      this.skyPuffData.push(d);
    }
    this.islandData.length = 0;
    for (let i = 0; i < ISLANDS; i++) {
      const side = i % 2 ? 1 : -1;
      this.islandData.push({ x: side * (15 + r() * 26), y: -3 + r() * 5, z: -i * 34 - r() * 20, s: 0.7 + r() * 0.8, ry: r() * 6.28, ph: r() * 6.28 });
    }
  }

  setTheme(id) {
    const t = (this.theme = getTheme(id));
    const u = this.sky.uniforms;
    u.uTop.value.set(t.sky.top); u.uMid.value.set(t.sky.mid); u.uHorizon.value.set(t.sky.horizon); u.uBottom.value.set(t.sky.bottom);
    u.uSunColor.value.set(t.sun.color);
    u.uSunSize.value = t.sun.size; u.uGlow.value = t.sun.glow; u.uStars.value = t.stars; u.uMoon.value = t.sun.moon ? 1 : 0;
    const az = THREE.MathUtils.degToRad(t.sun.az), el = THREE.MathUtils.degToRad(t.sun.el);
    u.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const s = this.sea.uniforms;
    s.uLight.value.set(t.sea.light); s.uShade.value.set(t.sea.shade); s.uDeep.value.set(t.sea.deep); // uHorizon etc. are the sky's own uniforms
    this.scene.fog.color.set(t.sky.horizon);
    this.scene.fog.near = t.fog.near; this.scene.fog.far = t.fog.far;
    this.hemi.color.set(t.hemi.sky); this.hemi.groundColor.set(t.hemi.ground); this.hemi.intensity = t.hemi.intensity;
    this.sun.color.set(t.dir.color); this.sun.intensity = t.dir.intensity;
    this.trimMat.color.set(t.road.trim);
    this.dividerMat.color.set(t.road.divider);
    this.cloudMat.color.set(t.cloud.light);
    this.cloudMat.emissive.set(t.cloud.light); this.cloudMat.emissiveIntensity = t.cloud.emissive;
    this.skyCloudMat.color.set(t.cloud.light);
    _c.set(t.cloud.light).lerp(_c2.set(t.sky.horizon), 0.35);
    this.skyCloudMat.emissive.copy(_c); this.skyCloudMat.emissiveIntensity = t.cloud.emissive + 0.2;
    // road geometry carries theme side colors; rebuild cheaply on theme change
    this.road.geometry.dispose();
    this.road.geometry = halfTileGeometry(t);
    if (this.islands) { this.islands.geometry.dispose(); this.scene.remove(this.islands); }
    this.islands = new THREE.InstancedMesh(islandGeometry(t), this.islandMat, ISLANDS);
    this.islands.frustumCulled = false;
    this.scene.add(this.islands);
    this.baseRow = null;
    this.clearGapViews();
    this.syncGapViews();
  }

  /** gaps: [{ lane:'L'|'R'|'C', from, to }] in distance units. */
  setGaps(gaps) { this.gaps = gaps || []; this.baseRow = null; this.syncGapViews(); }

  /** Builds dressing for new gaps, drops it for gaps that are gone. */
  syncGapViews() {
    if (!this.gapViews) return;
    for (const [g, v] of this.gapViews) {
      if (this.gaps.includes(g)) continue;
      this.scene.remove(v.group);
      disposeGapView(v);
      this.gapViews.delete(g);
    }
    for (const g of this.gaps) {
      if (this.gapViews.has(g)) continue;
      const v = buildGapView(this.theme, g.lane, g.from, g.to);
      this.scene.add(v.group);
      this.gapViews.set(g, v);
    }
  }

  clearGapViews() {
    if (!this.gapViews) return;
    for (const v of this.gapViews.values()) { this.scene.remove(v.group); disposeGapView(v); }
    this.gapViews.clear();
  }

  /** Chevrons flow toward the hole and pulse. */
  animateGaps() {
    if (!this.gapViews.size) return;
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    for (const v of this.gapViews.values()) {
      v.chev.material.map.offset.y = -t * 0.9;
      v.glow.material.map.offset.y = -t * 0.9;
      v.glow.material.opacity = 0.25 + pulse * 0.55;
      v.chev.material.opacity = 0.8 + pulse * 0.2;
    }
  }

  reset() { this.baseRow = null; this.time = 0; }

  isGap(lane, zCenter) {
    const d = -zCenter;
    for (const g of this.gaps) {
      if ((g.lane === lane || g.lane === 'C') && d + TILE_LEN / 2 > g.from && d - TILE_LEN / 2 < g.to) return true;
    }
    return false;
  }

  /** Visual update (called once per rendered frame). focusX/Z = leader, camZ = camera z. */
  sync(dt, focusX, focusZ, camZ) {
    this.time += dt;
    this.camZ = camZ;
    this.updateRoad(focusZ);
    this.animateGaps();
    this.updatePuffs(camZ);
    this.updateIslands(camZ);
    // sky/sea follow camera
    this.sky.mesh.position.set(focusX * 0.3, 0, camZ);
    this.sky.uniforms.uTime.value = this.time;
    this.sea.mesh.position.set(0, -16, camZ);
    this.sea.uniforms.uCam.value.set(focusX, 0, camZ);
    this.sea.uniforms.uTime.value = this.time;
    // shadow camera follows the squad tightly (snapped to texels to avoid shimmer)
    const snap = (QUALITY.shadowExtent * 2) / QUALITY.shadowMapSize;
    const tx = Math.round(focusX / snap) * snap, tz = Math.round((focusZ - 5) / snap) * snap;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + 7, 18, tz + 9);
  }

  updateRoad(focusZ) {
    const base = Math.floor(-(focusZ + BEHIND) / TILE_LEN);
    if (base === this.baseRow) return;
    this.baseRow = base;
    const t = this.theme;
    const ca = _c.set(t.road.a), cb = _c2.set(t.road.b);
    let n = 0, nd = 0;
    for (let i = 0; i < ROWS; i++) {
      const k = base + i;
      const z = -(k + 0.5) * TILE_LEN;
      const col = (k & 1) ? cb : ca;
      for (let h = 0; h < 2; h++) {
        const lane = h === 0 ? 'R' : 'L';
        if (this.gaps.length && this.isGap(lane, z)) continue;
        _m.compose(_p.set(0, 0, z), h === 0 ? IDENT : FLIP, _s.set(1, 1, 1));
        this.road.setMatrixAt(n, _m);
        this.road.setColorAt(n, col);
        n++;
      }
      if (this.gaps.length && this.isGap('L', z) && this.isGap('R', z)) continue;
      _m.makeTranslation(0, 0, z);
      this.divider.setMatrixAt(nd++, _m);
    }
    this.road.count = n; this.trim.count = n; this.divider.count = nd;
    markInstances(this.road.instanceMatrix, n);
    if (this.road.instanceColor) markInstances(this.road.instanceColor, n);
    markInstances(this.divider.instanceMatrix, nd);
  }

  updatePuffs(camZ) {
    const span = 260;
    const ns = this.puffs.count, nk = this.skyPuffs.count;
    for (let i = 0; i < ns; i++) {
      const d = this.seaPuffData[i];
      while (d.z > camZ + 30) d.z -= span;
      while (d.z < camZ - span + 30) d.z += span;
      _m.compose(_p.set(d.x, d.y, d.z), IDENT, _s.set(d.s, d.sy, d.s));
      this.puffs.setMatrixAt(i, _m);
    }
    markInstances(this.puffs.instanceMatrix, ns);
    const t = this.time;
    for (let i = 0; i < nk; i++) {
      const d = this.skyPuffData[i];
      let x = d.x + t * d.drift;
      x = ((x + 200) % 400 + 400) % 400 - 200;
      _m.compose(_p.set(x, d.y, camZ + d.dz), IDENT, _s.set(d.s, d.sy, d.s * 0.8));
      this.skyPuffs.setMatrixAt(i, _m);
    }
    markInstances(this.skyPuffs.instanceMatrix, nk);
  }

  updateIslands(camZ) {
    const span = ISLANDS * 34;
    for (let i = 0; i < this.islandData.length; i++) {
      const d = this.islandData[i];
      while (d.z > camZ + 20) d.z -= span;
      const bob = Math.sin(this.time * 0.6 + d.ph) * 0.5;
      _e.set(0, d.ry + this.time * 0.03, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(d.x, d.y + bob, d.z), _q, _s.set(d.s, d.s, d.s));
      this.islands.setMatrixAt(i, _m);
    }
    this.islands.instanceMatrix.needsUpdate = true;
  }

  dispose() {}
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
