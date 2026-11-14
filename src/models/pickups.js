// Pickup + power models: glowing power tokens with icon faces (shield / rapid / magnet / freeze), the gold
// coin used by the instanced coin field, magnet pull streaks, the hex shield bubble and ground aura rings.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial, glowTexture } from './materials.js';

export const POWER_STYLE = {
  shield: { color: '#4dc3ff', deep: '#1257b8', glow: '#59c1ff' },
  rapid: { color: '#ffb21f', deep: '#b04a00', glow: '#ffd34d' },
  magnet: { color: '#ff4f6a', deep: '#9a1030', glow: '#ff7a8e' },
  freeze: { color: '#7fe8ff', deep: '#1d6f9e', glow: '#bff6ff' },
};

// Same artwork as the HUD power timers (ui/icons.js), drawn with Path2D.
const ICON_PATHS = {
  shield: [['M12 2.5 4 5.6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z', 'fill'], ['M12 5.4 6.6 7.5v4.1c0 3.4 2.2 5.9 5.4 7z', 'shine']],
  rapid: [['M13.6 2 4.8 13.4h6l-1.6 8.6 9-11.6h-6.2z', 'fill']],
  magnet: [['M5 3.5h4.4v8.2a2.6 2.6 0 0 0 5.2 0V3.5H19v8.4a7 7 0 0 1-14 0z', 'fill'], ['M5 3.5h4.4v3H5zM14.6 3.5H19v3h-4.4z', 'tips']],
  freeze: [['M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.4 3.8 12 6.2l2.6-2.4M9.4 20.2 12 17.8l2.6 2.4', 'stroke']],
};

const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Token face: kind-colored glossy disc, white rim, white icon with a dark outline. */
export function tokenFaceTexture(kind) {
  return once('face:' + kind, () => canvasTex(256, 256, (g, w) => {
    const st = POWER_STYLE[kind] || POWER_STYLE.shield;
    const c = w / 2;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
    const grd = g.createRadialGradient(c * 0.75, c * 0.65, 8, c, c, c * 0.9);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.18, st.color);
    grd.addColorStop(1, st.deep);
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c - 16, 0, Math.PI * 2); g.fill();
    // glossy top highlight
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.ellipse(c, c * 0.62, c * 0.62, c * 0.34, 0, Math.PI, 0); g.fill();
    g.save();
    const s = (w * 0.56) / 24;
    g.translate(c - 12 * s, c - 12 * s + 4);
    g.scale(s, s);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [d, mode] of ICON_PATHS[kind] || ICON_PATHS.shield) {
      const p = new Path2D(d);
      if (mode === 'stroke') {
        g.strokeStyle = 'rgba(10,30,70,0.6)'; g.lineWidth = 5.2; g.stroke(p);
        g.strokeStyle = '#ffffff'; g.lineWidth = 2.8; g.stroke(p);
      } else if (mode === 'fill') {
        g.strokeStyle = 'rgba(10,30,70,0.55)'; g.lineWidth = 2.6; g.stroke(p);
        g.fillStyle = '#ffffff'; g.fill(p);
      } else if (mode === 'tips') {
        g.fillStyle = '#c9d4e6'; g.fill(p);
      } else {
        g.fillStyle = st.color; g.globalAlpha = 0.35; g.fill(p); g.globalAlpha = 1;
      }
    }
    g.restore();
  }));
}

function tokenRimGeometry() {
  return once('rim', () => merge([
    part(G.cyl(0.62, 0.62, 0.16, 32, true), '#ffffff', { r: [Math.PI / 2, 0, 0] }),
    part(G.torus(0.62, 0.06, 6, 32), '#ffffff', { p: [0, 0, 0.08], bright: 1.15 }),
    part(G.torus(0.62, 0.06, 6, 32), '#ffffff', { p: [0, 0, -0.08], bright: 0.9 }),
  ]));
}

/** Floating power token: icon disc + rim, inner glow, outer halo, light pillar and ground ring. */
export function buildPowerToken(kind, { ground = true } = {}) {
  const st = POWER_STYLE[kind] || POWER_STYLE.shield;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const rimMat = toonMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.35 });
  const rim = new THREE.Mesh(tokenRimGeometry(), rimMat);
  spin.add(rim);
  const faceMat = new THREE.MeshBasicMaterial({ map: tokenFaceTexture(kind), toneMapped: false });
  const faceGeo = once('faceGeo', () => new THREE.CircleGeometry(0.6, 32));
  const front = new THREE.Mesh(faceGeo, faceMat);
  front.position.z = 0.081;
  const back = new THREE.Mesh(faceGeo, faceMat);
  back.position.z = -0.081;
  back.rotation.y = Math.PI;
  spin.add(front, back);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: st.glow, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(2.6, 2.6, 1);
  halo.renderOrder = 3;
  root.add(halo);
  const pillar = new THREE.Mesh(once('pillar', () => {
    const g = new THREE.CylinderGeometry(0.42, 0.62, 2.2, 18, 1, true);
    g.translate(0, 1.1, 0);
    const n = g.attributes.position.count, col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i) / 2.2; col.set([1, 1, 1, 0.55 * (1 - y)], i * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    return g;
  }), new THREE.MeshBasicMaterial({ color: st.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  pillar.renderOrder = 2;
  const ring = new THREE.Mesh(once('ring', () => new THREE.RingGeometry(0.55, 0.78, 36).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ring.position.y = 0.03;
  ring.renderOrder = 2;
  if (ground) root.add(pillar, ring);
  return { root, spin, halo, pillar, ring, rimMat, kind };
}

/** Gold coin standing upright (face in XY), spins about Y. ~150 tris. */
export function coinGeometry() {
  return once('coin', () => {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.09 : 0.2, a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = (z) => {
      const g = new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false });
      g.translate(0, 0, z);
      return g;
    };
    return merge([
      part(G.cyl(0.36, 0.36, 0.1, 20), '#ffc531', { r: [Math.PI / 2, 0, 0] }),
      part(G.torus(0.33, 0.045, 5, 20), '#ffe07a', { p: [0, 0, 0.05], bright: 1.1 }),
      part(G.torus(0.33, 0.045, 5, 20), '#ffe07a', { p: [0, 0, -0.05], bright: 1.1 }),
      part(starGeo(0.045), '#fff1b0', { bright: 1.15 }),
      part(starGeo(-0.065), '#fff1b0', { bright: 1.15 }),
    ]);
  });
}

export function coinMaterial() {
  return once('coinMat', () => toonMaterial({ emissive: '#ff9d00', emissiveIntensity: 0.32 }));
}

/** Streak: soft line, bright head at v=1 fading to the tail. */
export function streakTexture() {
  return once('streak', () => canvasTex(32, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.32, h / 2, 0, 0, Math.PI * 2); g.fill();
  }));
}

/** Unit streak quad lying flat (XZ), length along +z from 0 (head) to 1 (tail). */
export function streakGeometry() {
  return once('streakGeo', () => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
  });
}

/** Hex-cell energy dome (ShaderMaterial): fresnel rim, scrolling hex lines, impact ripple, blink. */
export function buildShieldBubble() {
  const uniforms = {
    uTime: { value: 0 }, uColor: { value: new THREE.Color('#2f9bff') }, uAlpha: { value: 1 },
    uHit: { value: new THREE.Vector3(0, 0, 0) }, uHitT: { value: 9 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vL;
      void main() {
        vUv = uv; vL = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uAlpha; uniform vec3 uHit; uniform float uHitT;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vL;
      float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
      void main() {
        vec2 uv = vec2(vUv.x * 18.0, vUv.y * 7.0 - uTime * 0.25);
        vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        float edge = smoothstep(0.38, 0.47, hexDist(gv));
        edge *= 1.0 - smoothstep(0.7, 0.95, vUv.y); // cells pinch at the pole
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float d = length(vL - uHit);
        float ring = uHitT < 1.0 ? smoothstep(0.35, 0.0, abs(d - uHitT * 2.4)) * (1.0 - uHitT) : 0.0;
        float shimmer = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.y * 12.0);
        float bottom = smoothstep(0.0, 0.1, vUv.y);
        float alpha = (0.1 + fres * 0.6 + edge * (0.28 + fres * 0.45)) * shimmer + ring * 0.8;
        vec3 col = mix(uColor, vec3(0.85, 0.97, 1.0), clamp(edge * fres * 0.6 + ring * 0.7 + fres * 0.25, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95) * bottom * uAlpha);
      }`,
  });
  // upper hemisphere; uv.y runs 0 (equator, road) -> 1 (top)
  const geo = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** Flat ground ring (aura under the squad / expanding power pulse). */
export function auraTexture(dashes = 0) {
  return once('aura:' + dashes, () => canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    if (dashes) {
      g.lineWidth = 12; g.strokeStyle = '#ffffff';
      for (let i = 0; i < dashes; i++) {
        g.beginPath(); g.arc(c, c, c - 10, (i / dashes) * Math.PI * 2, ((i + 0.55) / dashes) * Math.PI * 2); g.stroke();
      }
      const grd = g.createRadialGradient(c, c, c * 0.5, c, c, c - 10);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(255,255,255,0.22)');
      g.fillStyle = grd; g.beginPath(); g.arc(c, c, c - 10, 0, Math.PI * 2); g.fill();
    } else {
      const grd = g.createRadialGradient(c, c, c * 0.6, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.82, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
    }
  }));
}
