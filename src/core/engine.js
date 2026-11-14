// Renderer, scene, camera, portrait-frame resize, quality switching and render stats.
import * as THREE from 'three';
import { CAMERA, QUALITY, VIEW } from '../config.js';

export class Engine {
  constructor(container) {
    this.container = container;
    // MSAA only below DPR 2: at 2x the extra resolution already hides most aliasing, and MSAA on a
    // 2x/3x phone target costs a lot of fill + resolve bandwidth (it can't be toggled after creation).
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = true;
    const canvas = this.renderer.domElement;
    canvas.id = 'game-canvas';
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 0.5625, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.quality = 'high';
    this.stats = { calls: 0, tris: 0 };
    this.width = 1; this.height = 1;
    this.onResize = [];

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(this.resize).observe(container);
    this.applyQuality('high');
    this.resize();
  }

  pixelRatioFor(q) {
    return q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  }

  /** 'high' | 'low' (auto is resolved by the game). */
  applyQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(this.pixelRatioFor(q));
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      // Materials must recompile to drop/add shadow sampling.
      this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
    }
    this.resize();
  }

  get shadowMapSize() { return QUALITY.shadowMapSize; }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovForAspect(this.camera.aspect);
    this.camera.updateProjectionMatrix();
    for (const fn of this.onResize) fn(w, h);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    const r = this.renderer.info.render;
    this.stats.calls = r.calls;
    this.stats.tris = r.triangles;
  }
}

const HALF_H_TAN = Math.tan((CAMERA.fov * Math.PI) / 360) * VIEW.aspect;
/**
 * Vertical fov that keeps the horizontal view of the 9:16 frame on taller/narrower screens (19.5:9 phones),
 * so the whole road width (Pip at the clamp, the blob's outer edge) stays in frame. Wider screens keep fov 52.
 */
export function fovForAspect(aspect) {
  if (aspect >= VIEW.aspect) return CAMERA.fov;
  return (Math.atan(HALF_H_TAN / aspect) * 360) / Math.PI;
}
