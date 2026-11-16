// Renderer, scene, camera, portrait-frame resize, quality switching, WebGL context loss and render stats.
import * as THREE from 'three';
import { CAMERA, QUALITY, VIEW } from '../config.js';

/** Phones with few cores / little memory: lower resolution cap, no MSAA. */
export function isLowEndDevice() {
  const n = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return n <= 4 || mem <= 3;
}

export class Engine {
  constructor(container) {
    this.container = container;
    this.lowEnd = isLowEndDevice();
    // MSAA only below DPR 2: at 2x the extra resolution already hides most aliasing, and MSAA on a
    // 2x/3x phone target costs a lot of fill + resolve bandwidth (it can't be toggled after creation).
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 2 && !this.lowEnd, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = true;
    // getProgramInfoLog after every link blocks the main thread until the GPU process finished compiling;
    // the shipped shaders are known good, so only dev builds pay for the error check
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    const canvas = this.renderer.domElement;
    canvas.id = 'game-canvas';
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 0.5625, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.quality = 'high';
    this.dprScale = 1;       // auto quality step 1: render resolution scale (1 = full)
    this.shadowsOn = true;   // what the shaders were compiled for (renderer.shadowMap.enabled)
    this.pendingShadows = null; // deferred shader rebuild (see applyQuality)
    this.stats = { calls: 0, tris: 0 };
    this.width = 1; this.height = 1; this.pr = 0;
    this.onResize = [];
    this.onContext = [];     // fn(lost: boolean)
    this.lost = false;
    this.needsFrame = true;
    this.sun = null;         // directional light whose shadow follows quality (set by World)
    // update 2: info-page 3D previews render as overlays into scissored rects of the ONE renderer
    this.overlays = [];
    this.skipMain = false;   // true only while an opaque info page is fully shown (no main scene draw)

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => { this.resize(); setTimeout(this.resize, 300); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.resize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(this.resize).observe(container);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // allows the browser to restore the context
      this.lost = true;
      for (const fn of this.onContext) fn(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // three re-creates its GL state and re-uploads geometry / textures on the next render
      this.lost = false;
      this.pr = 0;
      this.resize();
      for (const fn of this.onContext) fn(false);
    });
    this.applyQuality('high');
    this.resize();
  }

  /** Device pixel ratio cap: 2 (1.5 on low-end phones), x the auto-quality resolution scale; low = 1. */
  pixelRatioFor(q) {
    if (q === 'low') return 1;
    const cap = this.lowEnd ? 1.5 : 2;
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap) * this.dprScale);
  }

  /**
   * 'high' | 'low' (auto is resolved by the game). Shadows on/off changes every lit shader, so a switch in the
   * middle of a run (auto quality) only hides the shadows (uniform) and stops the shadow pass right away; the
   * shader rebuild waits for flushQuality() at the next run start / menu, where a compile hitch can't be felt.
   */
  applyQuality(q, { defer = false } = {}) {
    this.quality = q;
    const shadows = q !== 'low';
    if (this.sun) {
      this.sun.shadow.intensity = shadows ? 1 : 0;
      this.renderer.shadowMap.autoUpdate = shadows;
      if (shadows) this.renderer.shadowMap.needsUpdate = true;
    }
    if (shadows !== this.shadowsOn) {
      this.pendingShadows = shadows;
      if (!defer) this.flushQuality();
    } else this.pendingShadows = null;
    this.needsFrame = true;
    this.resize();
  }

  /** Applies a deferred shadow on/off switch (recompiles lit materials). Safe points only. */
  flushQuality() {
    if (this.pendingShadows === null) return;
    const shadows = this.pendingShadows;
    this.pendingShadows = null;
    this.shadowsOn = shadows;
    this.renderer.shadowMap.enabled = shadows;
    // Materials must recompile to drop/add shadow sampling.
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
    // recompile now (hidden pooled meshes included) instead of on their first draw mid-run
    this.precompile();
  }

  /** Resolution scale for auto quality (keeps the 'high' look, renders fewer pixels). */
  setDprScale(s) {
    this.dprScale = s;
    this.resize();
  }

  get shadowMapSize() { return QUALITY.shadowMapSize; }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const pr = this.pixelRatioFor(this.quality);
    // ResizeObserver + resize + visualViewport fire together: reallocating the drawing buffer is not free
    if (w === this.width && h === this.height && pr === this.pr) return;
    this.width = w; this.height = h; this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovForAspect(this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.needsFrame = true; // resizing cleared the drawing buffer
    for (const fn of this.onResize) fn(w, h);
  }

  /**
   * Compiles every material in `root` (default: the scene) ahead of its first draw, with the scene's lights,
   * so a boss / effect appearing mid-fight doesn't stall a frame on a shader compile. Uses the parallel
   * compile extension when available (never blocks).
   */
  precompile(root = this.scene) {
    if (this.lost) return;
    // three only compiles visible objects: show hidden pooled parts for the (synchronous) compile call
    const hidden = [];
    root.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      const r = this.renderer;
      if (r.compileAsync && r.extensions.has('KHR_parallel_shader_compile')) r.compileAsync(root, this.camera, this.scene).catch(() => {});
      else {
        r.compile(root, this.camera, this.scene);
        // without the parallel-compile extension the driver links lazily, on the first draw: finish every
        // link now (fetching uniforms forces it), while we are at boot / a run start, not mid-fight
        for (const p of r.info.programs) p.getUniforms();
      }
    } catch { /* best effort */ }
    for (const o of hidden) o.visible = false;
  }

  render() {
    if (this.lost) return;
    const r = this.renderer.info.render;
    if (!this.skipMain) {
      this.renderer.render(this.scene, this.camera);
      this.stats.calls = r.calls;
      this.stats.tris = r.triangles;
    } else { this.stats.calls = 0; this.stats.tris = 0; }
    // overlays set their own scissor / viewport and must restore scissor-test off + the full viewport
    for (let i = 0; i < this.overlays.length; i++) {
      try { this.overlays[i](this.renderer); } catch (e) { console.error('[engine] overlay failed', e); }
    }
  }

  /** Registers a per-frame overlay renderer fn(renderer) (called after the main scene). */
  addOverlay(fn) { if (!this.overlays.includes(fn)) this.overlays.push(fn); this.needsFrame = true; }
  removeOverlay(fn) { const i = this.overlays.indexOf(fn); if (i >= 0) this.overlays.splice(i, 1); this.needsFrame = true; }
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
