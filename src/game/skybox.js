// Sky dome (gradient + sun/moon disc + stars) and the cloud-sea plane, both custom shaders.
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize; uniform float uGlow;
uniform float uStars; uniform float uMoon; uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHorizon, uMid, smoothstep(0.0, 0.1, h));
    col = mix(col, uTop, smoothstep(0.09, 0.45, h));
  } else {
    col = mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
  }
  float sd = dot(d, normalize(uSunDir));
  float r = radians(uSunSize);
  float disc = smoothstep(cos(r * 1.08), cos(r * 0.92), sd);
  float glow = pow(max(sd, 0.0), 900.0) * 0.9 + pow(max(sd, 0.0), 60.0) * 0.45 + pow(max(sd, 0.0), 8.0) * 0.22;
  col += uSunColor * glow * uGlow;
  if (uMoon > 0.5) {
    // crescent: subtract an offset disc
    vec3 off = normalize(uSunDir + vec3(0.012, 0.01, 0.0));
    float cut = smoothstep(cos(r * 0.95), cos(r * 0.8), dot(d, off));
    disc *= 1.0 - cut * 0.85;
  }
  // hot white core fading to the warm rim
  float core = smoothstep(cos(r * 0.95), 1.0, sd);
  vec3 sunCol = mix(uSunColor, vec3(1.0), 0.35 + core * 0.65);
  col = mix(col, sunCol, disc);
  if (uStars > 0.0 && h > 0.02) {
    vec3 cell = floor(d * 220.0);
    float s = hash(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    float star = step(0.985, s) * smoothstep(0.02, 0.3, h) * tw;
    col += vec3(star) * uStars * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) }, uSunColor: { value: new THREE.Color() },
    uSunSize: { value: 3 }, uGlow: { value: 1 }, uStars: { value: 0 }, uMoon: { value: 0 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const SEA_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SEA_FRAG = /* glsl */`
uniform vec3 uLight; uniform vec3 uShade; uniform vec3 uDeep; uniform vec3 uHorizon;
uniform vec3 uCam; uniform float uTime; uniform float uFadeNear; uniform float uFadeFar;
varying vec3 vWorld;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vWorld.xz * 0.028 + vec2(uTime * 0.012, uTime * 0.02);
  float n = fbm(p);
  float m = fbm(p * 2.6 + vec2(4.1, 2.3) - uTime * 0.01);
  float puff = smoothstep(0.42, 0.78, n * 0.75 + m * 0.35);
  vec3 col = mix(uDeep, uShade, smoothstep(0.25, 0.6, n));
  col = mix(col, uLight, puff);
  // soft rim light on puff edges
  col += (uLight - col) * smoothstep(0.55, 0.9, m) * 0.35;
  float d = distance(vWorld.xz, uCam.xz);
  col = mix(col, uHorizon, smoothstep(uFadeNear, uFadeFar, d));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSea() {
  const uniforms = {
    uLight: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uFadeNear: { value: 60 }, uFadeFar: { value: 260 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, depthWrite: true, fog: false });
  const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -16;
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return { mesh, uniforms };
}
