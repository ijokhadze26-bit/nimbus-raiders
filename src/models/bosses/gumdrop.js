// GUMDROP GOLIATH: a huge chewy tangerine gumdrop. A lathe-turned gumdrop body with a jelly gradient, coated in
// sugar crystals (tiny merged facets), big grumpy eyes under thick gummy brows, a wide pouty grin, stubby gummy
// arms and feet, glossy highlights and a tiny tilted gold crown with a mint gem. The body group squashes and
// stretches (wobble / bounce); sparkles twinkle on the sugar coat (hidden on Low). Faces +Z. ~6.9u tall.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { contactShadow, glowSprite } from './common.js';

const JELLY_DARK = '#c2410e', JELLY = '#ff7a1a', JELLY_LIGHT = '#ffb15c', SUGAR = '#fff6e8', SUGAR2 = '#ffe2c4';
const GOLD = '#ffc531', GOLD_DARK = '#c98a12', MINT = '#5fffc8', FACE = '#5a1606', BROW = '#8a2a08';

// gumdrop silhouette (radius, height): flat chewy base, bulging sides, rounded dome
const PROFILE = [[0, 0], [2.55, 0], [3.0, 0.22], [3.2, 0.65], [3.18, 1.35], [3.0, 2.25], [2.65, 3.25], [2.15, 4.2], [1.55, 4.95], [0.85, 5.42], [0.3, 5.6], [0, 5.62]];
const H = 5.62;

/** Body radius at height y (linear in the profile). */
export function gumRadius(y) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i], [r0, y0] = PROFILE[i - 1];
    if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
  }
  return 0;
}

function hash(n) { const x = Math.sin(n * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); }

/** Lathe body with a vertical jelly gradient (dark chewy base -> bright top). */
function jellyBody() {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const g = part(new THREE.LatheGeometry(pts, 36), '#ffffff');
  const pos = g.attributes.position, col = g.attributes.color;
  const a = new THREE.Color(JELLY_DARK), b = new THREE.Color(JELLY), c = new THREE.Color(JELLY_LIGHT), o = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const f = pos.getY(i) / H;
    if (f < 0.35) o.copy(a).lerp(b, f / 0.35); else o.copy(b).lerp(c, (f - 0.35) / 0.65);
    col.setXYZ(i, o.r, o.g, o.b);
  }
  return g;
}

/** Point on the body surface at height y and angle a (0 = facing +Z), pushed out by `out`. */
function surf(y, a, out = 0) {
  const r = gumRadius(y) + out;
  return [Math.sin(a) * r, y, Math.cos(a) * r];
}

export function buildGumdrop() {
  const mat = toonMaterial();
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const root = new THREE.Group();
  const body = new THREE.Group(); // squash / stretch pivot at the base
  root.add(body);
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // ---- sugar coat: small crystal facets scattered over the surface (deterministic) ----
  const sugar = [];
  for (let i = 0; i < 170; i++) {
    const y = 0.35 + hash(i * 3.1) * (H - 0.6);
    const a = (hash(i * 7.7) - 0.5) * Math.PI * 2;
    // keep the face clear
    if (Math.abs(a) < 0.95 && y > 1.5 && y < 4.0) continue;
    const s = 0.07 + hash(i * 1.9) * 0.08;
    sugar.push(part(G.box(s, s, s), hash(i * 5.3) > 0.4 ? SUGAR : SUGAR2, {
      p: surf(y, a, 0.02), r: [hash(i) * 3, hash(i * 2.3) * 3, hash(i * 4.1) * 3], bright: 1.15,
    }));
  }
  // ---- face: brows, mouth, cheeks, pupils (eye whites glow, separate) ----
  const fz = (y, x) => Math.sqrt(Math.max(0, gumRadius(y) ** 2 - x * x));
  const face = [
    // grumpy gummy brows (thick, slanted down to the middle)
    part(G.capsule(0.2, 0.75, 3, 8), BROW, { p: [-0.92, 3.88, fz(3.88, 0.92) + 0.1], r: [0, 0, 1.25] }),
    part(G.capsule(0.2, 0.75, 3, 8), BROW, { p: [0.92, 3.88, fz(3.88, 0.92) + 0.1], r: [0, 0, -1.25] }),
    // pouty wide mouth + tongue + two chewy teeth
    part(G.sphere(1, 20, 12), FACE, { p: [0, 2.15, fz(2.15, 0) - 0.12], s: [1.05, 0.48, 0.32] }),
    part(G.sphere(0.5, 14, 8), '#ff5a7a', { p: [0, 1.95, fz(1.95, 0) + 0.02], s: [1.1, 0.4, 0.3] }),
    part(G.box(0.34, 0.3, 0.12), '#ffffff', { p: [-0.36, 2.42, fz(2.42, 0.36) + 0.08] }),
    part(G.box(0.34, 0.3, 0.12), '#ffffff', { p: [0.36, 2.42, fz(2.42, 0.36) + 0.08] }),
    // cheeks
    part(G.sphere(0.42, 12, 8), '#ff4a5a', { p: [-1.75, 2.6, fz(2.6, 1.75) - 0.05], s: [1, 0.6, 0.35], r: [0, -0.6, 0] }),
    part(G.sphere(0.42, 12, 8), '#ff4a5a', { p: [1.75, 2.6, fz(2.6, 1.75) - 0.05], s: [1, 0.6, 0.35], r: [0, 0.6, 0] }),
    // pupils (looking down at the squad)
    part(G.sphere(0.27, 12, 10), '#1a0a04', { p: [-0.78, 3.1, fz(3.1, 0.78) + 0.24], s: [1, 1.1, 0.5] }),
    part(G.sphere(0.27, 12, 10), '#1a0a04', { p: [0.78, 3.1, fz(3.1, 0.78) + 0.24], s: [1, 1.1, 0.5] }),
  ];
  // stubby feet
  const feet = [-1, 1].map((s) => part(G.sphere(0.85, 14, 10), JELLY_DARK, { p: [1.35 * s, 0.32, 2.05], s: [1.1, 0.5, 1.3] }));
  const bodyMesh = mk(merge([jellyBody(), ...sugar, ...face, ...feet]), body);
  const eyes = mk(merge([
    part(G.sphere(0.6, 18, 14), '#ffffff', { p: [-0.8, 3.2, fz(3.2, 0.8) - 0.08], s: [1, 1.12, 0.5] }),
    part(G.sphere(0.6, 18, 14), '#ffffff', { p: [0.8, 3.2, fz(3.2, 0.8) - 0.08], s: [1, 1.12, 0.5] }),
  ]), body, eyeMat, false);
  // pupil glints (white dots), shine streaks
  const shine = mk(merge([
    part(G.sphere(0.1, 8, 6), '#ffffff', { p: [-0.68, 3.3, fz(3.3, 0.68) + 0.36], s: [1, 1, 0.4] }),
    part(G.sphere(0.1, 8, 6), '#ffffff', { p: [0.9, 3.3, fz(3.3, 0.9) + 0.36], s: [1, 1, 0.4] }),
    part(G.sphere(0.6, 12, 8), '#ffffff', { p: surf(4.3, -0.75, 0.02), s: [0.5, 1.25, 0.3], r: [0, -0.75, 0.55] }),
    part(G.sphere(0.25, 10, 6), '#ffffff', { p: surf(3.55, -1.1, 0.02), s: [0.5, 0.8, 0.3], r: [0, -1.1, 0.4] }),
    part(G.sphere(0.4, 10, 6), '#ffffff', { p: surf(1.2, 1.15, 0.02), s: [0.4, 0.9, 0.3], r: [0, 1.15, -0.3] }),
  ]), body, shineMat, false);

  // ---- tiny tilted crown ----
  const crown = new THREE.Group();
  crown.position.set(0.25, H - 0.08, 0.1);
  crown.rotation.set(0.12, 0, -0.22);
  body.add(crown);
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    pts.push(part(G.cone(0.13, 0.36, 4), GOLD, { p: [Math.sin(a) * 0.5, 0.42, Math.cos(a) * 0.5] }));
    pts.push(part(G.sphere(0.07, 6, 5), GOLD_DARK, { p: [Math.sin(a) * 0.5, 0.62, Math.cos(a) * 0.5] }));
  }
  mk(merge([
    part(G.cyl(0.55, 0.5, 0.4, 14, true), GOLD, { p: [0, 0.12, 0] }),
    part(G.torus(0.53, 0.06, 5, 16), GOLD_DARK, { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0] }),
    part(new THREE.OctahedronGeometry(0.18), MINT, { p: [0, 0.15, 0.55], s: [0.8, 1.1, 0.5], bright: 1.25 }),
    ...pts,
  ]), crown);

  // ---- stubby gummy arms (shoulder pivot) ----
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(2.85 * s, 2.35, 0.35);
    body.add(g);
    mk(merge([
      part(G.capsule(0.42, 0.9, 4, 10), JELLY, { p: [0.45 * s, -0.25, 0], r: [0, 0, 0.9 * s] }),
      part(G.sphere(0.5, 12, 10), JELLY_LIGHT, { p: [0.95 * s, -0.62, 0.05] }),
      ...[-0.25, 0.25].map((dz) => part(G.box(0.08, 0.08, 0.08), SUGAR, { p: [0.95 * s + 0.2 * s, -0.4, dz], bright: 1.15 })),
    ]), g);
    return g;
  });

  // ---- sugar glints (twinkling stars on the coat, High only) ----
  const glintPos = [surf(4.7, -0.4, 0.06), surf(3.9, 1.3, 0.06), surf(1.6, -1.4, 0.06), surf(5.2, 0.6, 0.06), surf(0.9, 0.5, 0.06), surf(2.7, -1.9, 0.06)];
  const glints = mk(merge(glintPos.map((p, i) => part(new THREE.OctahedronGeometry(0.16), '#ffffff', { p, s: [0.35, 1.4, 0.35], r: [0, 0, i * 0.4] }))), body, glintMat, false);

  const aura = glowSprite('#ff7ad1', 11, 0);
  aura.position.set(0, 2.8, 0.6);
  root.add(aura);
  const shadow = contactShadow(8, 6.5, 0.42);
  root.add(shadow);
  root.scale.setScalar(1.12);
  return { root, body, bodyMesh, eyes, shine, crown, arms, glints, mat, eyeMat, glintMat, aura, shadow };
}

// ---------------- syrup puddle texture (strawberry syrup, glossy rim) ----------------
let syrupTex = null;
export function syrupTexture() {
  if (syrupTex) return syrupTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const blob = (fill, k) => {
    g.fillStyle = fill;
    g.beginPath(); g.arc(0, 0, 44 * k, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8 + 0.2, d = (38 + (i % 3) * 7) * k;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, (12 + (i % 4) * 3) * k, 0, Math.PI * 2); g.fill();
    }
  };
  blob('rgba(176,24,72,0.95)', 1);
  blob('rgba(255,72,128,0.95)', 0.84);
  blob('rgba(255,140,180,0.55)', 0.55);
  g.fillStyle = 'rgba(255,240,248,0.9)';
  [[-16, -16, 8], [12, 12, 5], [-4, 22, 4], [24, -12, 3.5], [4, -4, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  syrupTex = new THREE.CanvasTexture(c);
  syrupTex.colorSpace = THREE.SRGBColorSpace;
  return syrupTex;
}
