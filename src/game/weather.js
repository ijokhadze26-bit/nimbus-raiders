// Weather layer (update 3 world looks): one THREE.Points cloud around the camera, animated entirely in the
// vertex shader (no per-frame CPU work besides 3 uniforms, no allocation). Kinds: snow (soft flakes drifting
// down), ember (glowing sparks rising, additive), sparkle (twinkling candy stars, additive), rain (thin violet
// streaks falling fast). Low quality draws 40% of the points. Hidden for themes without `weather`.
import * as THREE from 'three';

const MAX = 320;
const BOX = { w: 44, h: 18, d: 120 };
const KIND = { snow: 0, ember: 1, sparkle: 2, rain: 3 };

const VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform float uCamZ; uniform float uCamX; uniform float uKind; uniform float uSize; uniform float uScale;
varying float vFade; varying float vTw;
void main() {
  vec3 p = position;
  float k = uKind;
  float sp = k < 0.5 ? 1.6 : k < 1.5 ? -2.2 : k < 2.5 ? -0.25 : 26.0;   // fall (+) / rise (-) speed
  float y = mod(p.y - uTime * sp * (0.7 + aSeed.x * 0.6), ${BOX.h.toFixed(1)});
  float dr = k < 2.5 ? 1.0 : 0.15;
  float x = p.x + sin(uTime * (0.6 + aSeed.y) + aSeed.z * 6.28) * 1.2 * dr + uCamX * 0.6;
  float z = uCamZ + 12.0 - mod(uCamZ + 12.0 - p.z, ${BOX.d.toFixed(1)});
  vec4 mv = modelViewMatrix * vec4(x, y - 4.0, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vFade = (1.0 - smoothstep(60.0, 110.0, dist)) * smoothstep(1.5, 5.0, dist);
  vTw = 0.55 + 0.45 * sin(uTime * (3.0 + aSeed.w * 5.0) + aSeed.z * 30.0);
  gl_PointSize = uSize * (0.7 + aSeed.w * 0.6) * uScale / max(dist, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uKind; uniform float uOpacity;
varying float vFade; varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uKind < 0.5) a = 1.0 - smoothstep(0.25, 0.5, length(c));                         // snow flake
  else if (uKind < 1.5) a = (1.0 - smoothstep(0.0, 0.5, length(c))) * (0.6 + 0.4 * vTw); // ember glow
  else if (uKind < 2.5) {                                                              // 4-point sparkle
    float cr = max(1.0 - smoothstep(0.0, 0.07, abs(c.x)) , 1.0 - smoothstep(0.0, 0.07, abs(c.y)));
    a = (cr * (1.0 - smoothstep(0.2, 0.5, length(c))) + (1.0 - smoothstep(0.0, 0.16, length(c)))) * vTw;
  } else a = (1.0 - smoothstep(0.02, 0.07, abs(c.x))) * 0.6;                              // rain streak
  a *= vFade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (uKind > 0.5 && uKind < 2.5 ? 1.6 : 1.0), a);
}`;

export class Weather {
  constructor(scene) {
    const pos = new Float32Array(MAX * 3), seed = new Float32Array(MAX * 4);
    let s = 97;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < MAX; i++) {
      pos[i * 3] = (r() - 0.5) * BOX.w; pos[i * 3 + 1] = r() * BOX.h; pos[i * 3 + 2] = r() * BOX.d;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uTime: { value: 0 }, uCamZ: { value: 0 }, uCamX: { value: 0 }, uKind: { value: 0 }, uSize: { value: 0.2 },
      uScale: { value: 800 }, uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.Points(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.count = 0;
    this.low = false;
    scene.add(this.mesh);
  }

  /** w: theme.weather ({ kind, color, count, size }) or null. */
  set(w) {
    this.def = w || null;
    this.mesh.visible = !!w;
    if (!w) return;
    const u = this.uniforms;
    u.uKind.value = KIND[w.kind] ?? 0;
    u.uColor.value.set(w.color || '#ffffff');
    u.uSize.value = w.size || 0.2;
    u.uOpacity.value = w.kind === 'rain' ? 0.55 : 0.95;
    this.material.blending = w.kind === 'ember' || w.kind === 'sparkle' ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.count = Math.min(MAX, w.count || 200);
    this.apply();
  }

  setQuality(q) { this.low = q === 'low'; this.apply(); }

  apply() { this.mesh.geometry.setDrawRange(0, Math.round(this.count * (this.low ? 0.4 : 1))); }

  /** Per rendered frame: time + camera follow (uniforms only). */
  sync(time, camX, camZ, pxHeight) {
    if (!this.mesh.visible) return;
    const u = this.uniforms;
    u.uTime.value = time; u.uCamZ.value = camZ; u.uCamX.value = camX;
    u.uScale.value = pxHeight * 0.9;
  }
}
