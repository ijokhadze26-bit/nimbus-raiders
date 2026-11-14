// Shared materials (created once). Toon shading with a soft 3-band gradient keeps characters cute and readable.
import * as THREE from 'three';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMaterial(opts = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, ...opts });
}

/** Soft radial glow sprite texture (white, alpha falloff). */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * Toon material with a per-instance effect attribute `aFx` (vec3 on the geometry):
 *   x = white hit flash (0..1), y = ice tint (0..1), z = glow amount (adds `glow` color).
 * Used by the horde InstancedMeshes so hit flashes need no extra draw calls.
 */
export function fxToonMaterial(glow = '#ffffff', opts = {}) {
  const m = toonMaterial(opts);
  const uGlow = { value: new THREE.Color(glow) };
  m.userData.uGlow = uGlow;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFx;\nvarying vec3 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = aFx;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFx;\nuniform vec3 uGlow;')
      .replace('#include <opaque_fragment>',
        'outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.55, 0.8, 1.15) + vec3(0.18, 0.34, 0.5), vFx.y);\n' +
        'outgoingLight += uGlow * vFx.z;\n' +
        'outgoingLight = mix(outgoingLight, vec3(1.0), clamp(vFx.x, 0.0, 1.0));\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'fxtoon1';
  return m;
}

/** Soft dark disc used for cheap blob shadows (alpha falloff). */
let blobTex = null;
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
