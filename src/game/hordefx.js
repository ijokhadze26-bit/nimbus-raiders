// Horde extras view (update 3, stage 3 "enemies"), owned by HordeView: ground rings (Boomling swell blast
// radius, Spitling goo landing markers that fill up, Mendling heal pulses, goo splats), goo globs in flight and
// the elite halos. One InstancedMesh each (instance colours; rings also a per-instance alpha), no lights, no shadows; Low quality drops the
// halos (elites keep their gold rim, which is in the shader) - the telegraphs stay on every quality.
import * as THREE from 'three';
import { buildRingGeometry, buildGooGeometry, haloTexture } from '../models/murklings2.js';
import { XF, writeXfYaw, writeXfYawRoll, markInstances } from '../core/pool.js';
import { ELITE } from '../data/enemies.js';

const RING_CAP = 96, GOO_CAP = 24, HALO_CAP = 200;
const C_SWELL = new THREE.Color('#ff4a1a'), C_SPIT = new THREE.Color('#86f01a'), C_HEAL = new THREE.Color('#3fe89a'), C_SPLAT = new THREE.Color('#a8e82a');
const C_ELITE = new THREE.Color(ELITE.color);
const _c = new THREE.Color();

export class HordeFx {
  constructor(game) {
    this.game = game;
    const add = (mesh, order) => { mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = order; mesh.setColorAt(0, _c.set(1, 1, 1)); game.scene.add(mesh); return mesh; };
    const rg = buildRingGeometry();
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(RING_CAP), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('aAlpha', this.alpha);
    this.rings = add(new THREE.InstancedMesh(rg, ringMaterial(), RING_CAP), 3);
    this.goo = add(new THREE.InstancedMesh(buildGooGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), GOO_CAP), 5);
    const halo = new THREE.PlaneGeometry(1, 1);
    // normal blending (an additive glow vanishes on the bright Sky Bridge road): a gold ring behind each elite
    this.halos = add(new THREE.InstancedMesh(halo, new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false }), HALO_CAP), 2);
    this.nr = 0;
  }

  ring(x, z, r, col, k) {
    if (this.nr >= RING_CAP) return;
    XF[0] = x; XF[1] = 0.05 + this.nr * 0.0004; XF[2] = z; XF[3] = 0; XF[5] = r; XF[6] = 1; XF[7] = r;
    writeXfYaw(this.rings.instanceMatrix.array, this.nr);
    this.rings.setColorAt(this.nr, col);
    this.alpha.array[this.nr] = Math.max(0, Math.min(1, k));
    this.nr++;
  }

  /** h = the Horde (shots, pulses); list = its enemies (SWELL = 2, elites). */
  sync(dt, list, time, h) {
    this.nr = 0;
    let ng = 0, nh = 0;
    const low = this.game.engine.quality === 'low';
    const hArr = this.halos.instanceMatrix.array, gArr = this.goo.instanceMatrix.array;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.state === 2) { // Boomling swell: the blast radius flashes and fills up
        const r = e.def.boom.r, f = e.sw;
        const blink = 0.75 + 0.25 * Math.sin(time * 40);
        this.ring(e.x, e.z, r, C_SWELL, 0.7 * blink);
        this.ring(e.x, e.z, r * (0.25 + 0.75 * f), C_SWELL, 0.9);
        continue;
      }
      if (e.state !== 0 || !e.elite || low || nh >= HALO_CAP) continue;
      const s = (e.def.r * 2.9 + 0.5) * e.size * (1 + 0.06 * Math.sin(time * 5 + e.ph));
      XF[0] = e.x; XF[1] = (e.y || 0) + e.def.r * 1.05 * e.size + 0.12; XF[2] = e.z - 0.3; XF[3] = 0; XF[4] = 0; XF[5] = s; XF[6] = s; XF[7] = 1;
      writeXfYawRoll(hArr, nh);
      this.halos.setColorAt(nh, C_ELITE);
      nh++;
    }
    // Spitling globs: an arc from the snout to the marker, which fills up until it lands
    for (const s of h.shots) {
      const f = Math.min(1, s.t / s.T);
      this.ring(s.x1, s.z1, s.r, C_SPIT, 0.55 + 0.25 * Math.sin(time * (12 + f * 20)));
      this.ring(s.x1, s.z1, s.r * (0.15 + 0.85 * f), C_SPIT, 0.85);
      if (ng < GOO_CAP) {
        const d = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
        XF[0] = s.x0 + (s.x1 - s.x0) * f; XF[2] = s.z0 + (s.z1 - s.z0) * f;
        XF[1] = 0.8 * (1 - f) + 0.15 + (3 + d * 0.09) * 4 * f * (1 - f);
        XF[3] = time * 6; XF[4] = 0; XF[5] = XF[6] = XF[7] = 1 + 0.15 * Math.sin(time * 18);
        writeXfYawRoll(gArr, ng++);
      }
    }
    // heal pulses (kind 0) and goo splats (kind 1): quick expanding rings
    for (const p of h.pulses) {
      const f = Math.min(1, p.t / 0.6);
      this.ring(p.x, p.z, p.r * (0.3 + 0.7 * f), p.kind ? C_SPLAT : C_HEAL, (1 - f) * (p.kind ? 1 : 0.5));
    }
    this.rings.count = this.nr; if (this.nr) { markInstances(this.rings.instanceMatrix, this.nr); markInstances(this.rings.instanceColor, this.nr); markInstances(this.alpha, this.nr); }
    this.goo.count = ng; if (ng) markInstances(this.goo.instanceMatrix, ng);
    this.halos.count = nh; if (nh) { markInstances(this.halos.instanceMatrix, nh); markInstances(this.halos.instanceColor, nh); }
  }
}

/** Basic unlit RGBA material with a per-instance alpha (aAlpha), so markers read on bright and dark roads. */
function ringMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  m.customProgramCacheKey = () => 'hordeRing';
  return m;
}
