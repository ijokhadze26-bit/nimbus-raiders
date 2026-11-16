// Pooled billboard particles: ONE instanced draw call for every sprite effect (puffs, goo drops, sparks,
// stars, rings, ground splats, speed streaks). Premultiplied blending lets each particle choose how
// additive it is (add 0 = solid paint that reads on the white road, add 1 = pure glow).
// Struct-of-arrays simulation, swap-remove compaction, no per-frame allocation.
import * as THREE from 'three';

// shapes (fragment shader switch)
export const SOFT = 0;    // radial glow
export const BLOB = 1;    // toon-shaded ball (puffs, goo, fire balls); stretches along velocity
export const RING = 2;    // billboard ring (ripples, shock fronts)
export const STREAK = 3;  // velocity-aligned spark / speed line
export const STAR = 4;    // 4-point sparkle
export const FLAT_RING = 5; // ring lying on the ground (XZ plane)
export const FLAT_DISC = 6; // soft-edged wobbly disc on the ground (goo splats, scorch, dust)
export const SHARD = 7;   // diamond chip
export const PUFF = 8;    // soft-edged toon cloud ball (smoke, dust, fire); stretches along velocity

const VERT = /* glsl */`
attribute vec4 aPosSize;
attribute vec4 aColor;
attribute vec4 aExt;
uniform float uMaxK; // Low: largest quad size per unit of view depth (caps sprites near the camera)
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vAdd;
varying float vSeed;
void main() {
  float shape = floor(aExt.w);
  vShape = shape;
  vAdd = fract(aExt.w) * 1.0101;
  vColor = aColor;
  vUv = position.xy * 2.0;
  vSeed = aExt.x;
  float size = aPosSize.w;
  vec4 clip;
  if (shape > 4.5 && shape < 6.5) {
    float a = aExt.x, c = cos(a), s = sin(a);
    size = min(size, uMaxK * max(0.05, -(viewMatrix * vec4(aPosSize.xyz, 1.0)).z));
    vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
    clip = projectionMatrix * (viewMatrix * vec4(aPosSize.xyz + vec3(q.x, 0.0, q.y), 1.0));
  } else if (shape > 0.5 && shape < 1.5 || shape > 2.5 && shape < 3.5 || shape > 7.5) {
    // perspective-correct streak: head = particle, tail = particle - dir (world), quad spans tail..head
    vec3 H = (viewMatrix * vec4(aPosSize.xyz, 1.0)).xyz;
    vec3 T = (viewMatrix * vec4(aPosSize.xyz - aExt.xyz, 1.0)).xyz;
    size = min(size, uMaxK * max(0.05, -H.z));
    vec2 sd = H.xy / max(0.05, -H.z) - T.xy / max(0.05, -T.z);
    float L = length(sd);
    vec2 ax = L > 0.00001 ? sd / L : vec2(0.0, 1.0);
    vec2 ay = vec2(-ax.y, ax.x);
    vec3 P = mix(T, H, position.y + 0.5);
    P.xy += ax * (position.y * size) + ay * (position.x * size);
    clip = projectionMatrix * vec4(P, 1.0);
  } else {
    vec4 mv = viewMatrix * vec4(aPosSize.xyz, 1.0);
    size = min(size, uMaxK * max(0.05, -mv.z));
    float a = aExt.x, c = cos(a), s = sin(a);
    mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
    clip = projectionMatrix * mv;
  }
  gl_Position = clip;
}`;

const FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vAdd;
varying float vSeed;
void main() {
  vec2 p = vUv;
  float r = length(p);
  float m = 0.0;
  vec3 col = vColor.rgb;
  if (vShape < 0.5) {                       // soft glow
    float k = max(0.0, 1.0 - r);
    m = k * k * (0.6 + 0.4 * k);
    col = mix(col, vec3(1.0), k * k * k * 0.6);
  } else if (vShape < 1.5) {                // toon ball
    m = (1.0 - smoothstep(0.9, 1.0, r));
    float z = sqrt(max(0.0, 1.0 - r * r));
    float d = dot(vec3(p.x, p.y, z), vec3(-0.42, 0.55, 0.72));
    float band = d > 0.42 ? 1.0 : (d > 0.0 ? 0.86 : 0.7);
    col *= band;
    float hl = (1.0 - smoothstep(0.12, 0.24, length(p - vec2(-0.34, 0.38))));
    col = mix(col, vec3(1.0), hl * 0.75);
    col *= mix(1.0, 0.72, smoothstep(0.8, 0.95, r));
  } else if (vShape < 2.5 || (vShape > 4.5 && vShape < 5.5)) { // rings
    m = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.9, 1.0, r));
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.08, abs(r - 0.84))) * 0.4);
  } else if (vShape < 3.5) {                // streak
    float ax = abs(p.x), ay = abs(p.y);
    m = (1.0 - ax) * (1.0 - ax) * (1.0 - ay * ay);
    m = clamp(m, 0.0, 1.0);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.55, ax)) * 0.7);
  } else if (vShape < 4.5) {                // 4-point star
    float ax = abs(p.x), ay = abs(p.y);
    float cr = max(1.0 - ax * 7.0 - ay * 1.05, 1.0 - ay * 7.0 - ax * 1.05);
    float g = max(0.0, 1.0 - r * 1.6);
    m = clamp(max(cr, 0.0) + g * g, 0.0, 1.0);
    col = mix(col, vec3(1.0), clamp(g * 1.4, 0.0, 1.0));
  } else if (vShape < 6.5) {                // wobbly ground disc
    float a = atan(p.y, p.x);
    float rr = r * (1.0 + 0.1 * sin(a * 5.0 + vSeed * 3.0) + 0.06 * sin(a * 9.0 - vSeed * 5.0));
    m = (1.0 - smoothstep(0.8, 1.0, rr));
    col *= mix(1.0, 0.82, smoothstep(0.55, 0.95, rr));
  } else if (vShape > 7.5) {               // cloud puff
    m = 1.0 - smoothstep(0.72, 1.0, r);
    float z = sqrt(max(0.0, 1.0 - r * r));
    float d = dot(vec3(p.x, p.y, z), vec3(-0.4, 0.6, 0.7));
    col *= d > 0.3 ? 1.0 : (d > -0.1 ? 0.9 : 0.8);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.5, length(p - vec2(-0.3, 0.35)))) * 0.22);
  } else {                                  // diamond chip
    float d = abs(p.x) * 1.6 + abs(p.y);
    m = (1.0 - smoothstep(0.85, 1.0, d));
    col *= p.y > 0.0 ? 1.08 : 0.8;
  }
  float a = m * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
}`;

// Low: a sprite is never drawn wider than LOW_MAX_K x its view depth (~1/3 of the screen height at fov 52), so a
// puff or ground ring passing close to the camera can't fill the phone screen (software fill rate). High: no cap.
const LOW_MAX_K = 0.3, NO_CAP = 1e6;

const FIELDS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'r0', 'g0', 'b0', 'r1', 'g1', 'b1',
  'al', 'add', 'shape', 'grav', 'drag', 'str', 'rot', 'spin', 'fade', 'flo'];

export class Particles {
  constructor(scene, capacity = 1500) {
    this.capacity = capacity;
    this.cap = capacity;     // live cap (quality)
    this.n = 0;
    const d = {};
    for (const f of FIELDS) d[f] = new Float32Array(capacity);
    this.d = d;
    this.fields = FIELDS.map((f) => d[f]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aExt = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPosSize', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aExt', this.aExt);
    geo.instanceCount = 0;
    this.geo = geo;
    this.attrs = [this.aPos, this.aCol, this.aExt];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uMaxK: { value: NO_CAP } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setQuality(q) {
    this.cap = q === 'low' ? Math.min(this.capacity, 700) : this.capacity;
    this.mat.uniforms.uMaxK.value = q === 'low' ? LOW_MAX_K : NO_CAP;
  }

  get free() { return this.cap - this.n; }

  /**
   * Spawns one particle. Colors are 0xRRGGBB (sRGB, written straight to the screen); c1 = end color (-1 = same).
   * delay > 0 keeps the particle invisible for that long (staged effects without timers).
   * Returns the slot index (or -1 when full) so callers can tweak rarely-used fields (rot/spin/fade/floor).
   */
  spawn(shape, x, y, z, vx, vy, vz, life, s0, s1, c0, alpha, add = 0, grav = 0, drag = 0, str = 0, c1 = -1, delay = 0) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    const d = this.d;
    d.px[i] = x; d.py[i] = y; d.pz[i] = z;
    d.vx[i] = vx; d.vy[i] = vy; d.vz[i] = vz;
    d.age[i] = -delay; d.life[i] = Math.max(0.01, life);
    d.s0[i] = s0; d.s1[i] = s1;
    d.r0[i] = ((c0 >> 16) & 255) / 255; d.g0[i] = ((c0 >> 8) & 255) / 255; d.b0[i] = (c0 & 255) / 255;
    if (c1 < 0) { d.r1[i] = d.r0[i]; d.g1[i] = d.g0[i]; d.b1[i] = d.b0[i]; }
    else { d.r1[i] = ((c1 >> 16) & 255) / 255; d.g1[i] = ((c1 >> 8) & 255) / 255; d.b1[i] = (c1 & 255) / 255; }
    d.al[i] = alpha; d.add[i] = Math.min(0.99, Math.max(0, add));
    d.shape[i] = shape; d.grav[i] = grav; d.drag[i] = drag; d.str[i] = str;
    d.rot[i] = Math.random() * 6.283; d.spin[i] = 0; d.fade[i] = 0.45; d.flo[i] = -1e9;
    return i;
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }

  update(dt) {
    const d = this.d, F = this.fields, nf = F.length;
    const { px, py, pz, vx, vy, vz, age, life } = d;
    let n = this.n;
    for (let i = n - 1; i >= 0; i--) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        n--;
        if (i !== n) for (let k = 0; k < nf; k++) F[k][i] = F[k][n];
        continue;
      }
      if (age[i] < 0) continue;
      const dr = d.drag[i];
      if (dr > 0) { const k = Math.exp(-dr * dt); vx[i] *= k; vy[i] *= k; vz[i] *= k; }
      vy[i] -= d.grav[i] * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      if (py[i] < d.flo[i]) { py[i] = d.flo[i]; vy[i] *= -0.3; vx[i] *= 0.6; vz[i] *= 0.6; }
      d.rot[i] += d.spin[i] * dt;
    }
    this.n = n;
    this.write();
  }

  write() {
    const n = this.n, d = this.d;
    const P = this.aPos.array, C = this.aCol.array, E = this.aExt.array;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a = d.age[i];
      if (a < 0) { P[o] = d.px[i]; P[o + 1] = d.py[i]; P[o + 2] = d.pz[i]; P[o + 3] = 0; C[o + 3] = 0; E[o + 3] = 0; continue; }
      const t = a / d.life[i];
      const e = 1 - (1 - t) * (1 - t);
      P[o] = d.px[i]; P[o + 1] = d.py[i]; P[o + 2] = d.pz[i];
      P[o + 3] = d.s0[i] + (d.s1[i] - d.s0[i]) * e;
      C[o] = d.r0[i] + (d.r1[i] - d.r0[i]) * t;
      C[o + 1] = d.g0[i] + (d.g1[i] - d.g0[i]) * t;
      C[o + 2] = d.b0[i] + (d.b1[i] - d.b0[i]) * t;
      const fs = d.fade[i];
      const fin = a < 0.035 ? a / 0.035 : 1;
      C[o + 3] = d.al[i] * fin * (t < fs ? 1 : 1 - (t - fs) / (1 - fs));
      const sh = d.shape[i], st = d.str[i];
      if (sh === BLOB || sh === STREAK || sh === PUFF) { E[o] = d.vx[i] * st; E[o + 1] = d.vy[i] * st; E[o + 2] = d.vz[i] * st; }
      else { E[o] = d.rot[i]; E[o + 1] = 0; E[o + 2] = 0; }
      E[o + 3] = sh + d.add[i] * 0.99;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) for (let k = 0; k < 3; k++) { const at = this.attrs[k]; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
