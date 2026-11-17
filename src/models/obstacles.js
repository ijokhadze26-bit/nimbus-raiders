// Obstacle models: the spinning hazard rotor (pedestal + double blade + blur disc + danger decal + glint),
// its slide track, and road-gap dressing (broken tile lips, dark depth walls, pit shade, glowing chevrons).
// Geometries and textures are cached; materials are per visual only where they animate.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial, glowTexture } from './materials.js';
import { DIVIDER, ROAD_HALF } from '../config.js';

export const BLADE_R = 1.9;
export const ROTOR_Y = 0.62;
const YELLOW = '#ffc531', BLACK = '#2a2e3a', STEEL = '#6f7f99', STEEL_D = '#3c475c';

const cache = {};
/** Light coming up out of a hole, by world id (world 1, the Sky Bridge, has only the dark pit). */
const PIT_GLOW = { 2: '#ff5a14', 3: '#7fdcff', 4: '#ff6ac8', 5: '#9a7bff' };
const once = (k, make) => cache[k] || (cache[k] = make());

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeatY) t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Box tapered toward +x (z half-width scales from 1 at x0 to `tip` at x1). */
function taperBox(len, h, w, tip) {
  const g = G.box(len, h, w);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + len / 2) / len;
    p.setZ(i, p.getZ(i) * (1 - u * (1 - tip)));
  }
  return g;
}

// ---------------- blade ----------------
function pedestalGeometry() {
  return once('pedestal', () => {
    const parts = [
      part(G.cyl(0.84, 0.9, 0.08, 24), '#3d4558', { p: [0, 0.04, 0] }),
      part(G.cyl(0.6, 0.66, 0.06, 20), '#5a6378', { p: [0, 0.1, 0] }),
      part(G.cyl(0.26, 0.36, 0.5, 14), '#9aa6ba', { p: [0, 0.36, 0] }),
      part(G.cyl(0.275, 0.275, 0.1, 14), '#ff3b4e', { p: [0, 0.42, 0], bright: 1.1 }),
    ];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push(part(G.box(0.24, 0.05, 0.12), i % 2 ? BLACK : YELLOW, { p: [Math.cos(a) * 0.74, 0.085, Math.sin(a) * 0.74], r: [0, -a + Math.PI / 2, 0], bright: i % 2 ? 1 : 1.12 }));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      parts.push(part(G.cyl(0.045, 0.045, 0.05, 6), '#d9dfe8', { p: [Math.cos(a) * 0.48, 0.14, Math.sin(a) * 0.48] }));
    }
    return merge(parts);
  });
}

/** Two arms + hub in the XZ plane (rotor spins about Y). Broad scythe planform so it reads from above. */
function rotorGeometry() {
  return once('rotor', () => {
    const parts = [
      part(G.cyl(0.42, 0.46, 0.2, 20), '#e6ebf2', { p: [0, 0, 0] }),
      part(G.cyl(0.3, 0.36, 0.12, 18), '#3d4558', { p: [0, 0.14, 0] }),
      part(G.sphere(0.26, 16, 8), '#ff3b4e', { p: [0, 0.2, 0], s: [1, 0.75, 1], bright: 1.1 }),
      part(G.sphere(0.08, 8, 6), '#ffffff', { p: [-0.08, 0.34, 0.08], bright: 1.4 }),
    ];
    for (const side of [1, -1]) {
      const rot = side > 0 ? 0 : Math.PI;
      const arm = [];
      // hazard-striped root (chevron-ish diagonal bands)
      for (let i = 0; i < 4; i++) {
        const x0 = 0.38 + i * 0.17;
        arm.push(part(G.box(0.17, 0.11, 0.56), i % 2 ? BLACK : YELLOW, { p: [x0 + 0.085, 0, 0], bright: i % 2 ? 1 : 1.12 }));
      }
      // polished steel blade: broad, tapering, swept back toward the spin direction
      arm.push(part(taperBox(0.78, 0.09, 0.56, 0.7), STEEL, { p: [1.44, 0, -0.01], bright: 1.05 }));
      arm.push(part(taperBox(0.34, 0.08, 0.4, 0.06), STEEL, { p: [1.92, 0, -0.06], r: [0, 0.22, 0], bright: 1.08 }));
      // bright sharpened leading edge, dark trailing bevel, red tip guard
      arm.push(part(taperBox(1.15, 0.05, 0.09, 0.4), '#ffffff', { p: [1.58, 0.03, 0.26], bright: 1.45 }));
      arm.push(part(taperBox(1.0, 0.095, 0.07, 0.6), STEEL_D, { p: [1.5, -0.005, -0.27] }));
      arm.push(part(G.box(0.7, 0.015, 0.16), '#ffffff', { p: [1.4, 0.05, 0.06], bright: 1.3 }));
      arm.push(part(G.box(0.1, 0.12, 0.5), '#ff3b4e', { p: [1.08, 0, 0], bright: 1.05 }));
      for (const g of arm) { g.rotateY(rot); parts.push(g); }
    }
    return merge(parts);
  });
}

function blurTexture() {
  return once('blurTex', () => canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    for (let k = 0; k < 2; k++) {
      const a0 = k * Math.PI;
      for (let i = 0; i < 60; i++) {
        const f = i / 60, a = a0 - f * 2.4;
        // dark steel smear trailing each arm, bright sharpened rim, hazard-yellow root band
        g.strokeStyle = `rgba(52,62,82,${(1 - f) * 0.5})`;
        g.lineWidth = 58;
        g.beginPath(); g.arc(c, c, c * 0.66, a - 0.03, a + 0.03); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${(1 - f) * 0.85})`;
        g.lineWidth = 7;
        g.beginPath(); g.arc(c, c, c * 0.9, a - 0.03, a + 0.03); g.stroke();
        g.strokeStyle = `rgba(255,197,49,${(1 - f) * 0.45})`;
        g.lineWidth = 22;
        g.beginPath(); g.arc(c, c, c * 0.3, a - 0.03, a + 0.03); g.stroke();
      }
    }
  }));
}

function dangerTexture() {
  return once('dangerTex', () => canvasTex(256, 256, (g, w) => {
    const c = w / 2, r = c * 0.93;
    const grd = g.createRadialGradient(c, c, r * 0.2, c, c, r);
    grd.addColorStop(0, 'rgba(255,59,78,0.1)');
    grd.addColorStop(0.65, 'rgba(255,59,78,0.2)');
    grd.addColorStop(1, 'rgba(255,59,78,0.42)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
    const n = 20;
    g.lineWidth = 10;
    for (let i = 0; i < n; i++) {
      g.strokeStyle = i % 2 ? 'rgba(255,197,49,0.95)' : 'rgba(232,33,58,0.95)';
      g.beginPath(); g.arc(c, c, r - 5, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(c, c, r - 14, 0, Math.PI * 2); g.stroke();
  }));
}

export function glintTexture() {
  return once('glintTex', () => canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.12, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [sx, sy] of [[1, 0.06], [0.06, 1]]) {
      g.beginPath(); g.ellipse(c, c, c * sx, c * sy, 0, 0, Math.PI * 2); g.fill();
    }
  }));
}

function trackTexture() {
  return once('trackTex', () => canvasTex(512, 64, (g, w, h) => {
    const r = 26;
    g.fillStyle = '#2a2e3a';
    roundRect(g, 4, 6, w - 8, h - 12, r); g.fill();
    g.save(); roundRect(g, 4, 6, w - 8, h - 12, r); g.clip();
    for (let x = -40; x < w + 40; x += 28) {
      g.fillStyle = YELLOW;
      g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 14, 6); g.lineTo(x + 4, 16); g.lineTo(x - 10, 16); g.fill();
      g.beginPath(); g.moveTo(x, h - 16); g.lineTo(x + 14, h - 16); g.lineTo(x + 4, h - 6); g.lineTo(x - 10, h - 6); g.fill();
    }
    g.restore();
    g.fillStyle = '#12151d';
    roundRect(g, 26, 24, w - 52, h - 48, 8); g.fill();
  }));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const decalMat = (map, extra = {}) => new THREE.MeshBasicMaterial({
  map, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra,
});

/** One blade visual (pooled by the obstacle system). Materials are per visual (hit flash, glint). */
export function buildBladeVisual() {
  const group = new THREE.Group();
  const mat = toonMaterial({ emissive: '#ff3b4e', emissiveIntensity: 0 });
  const pedestal = new THREE.Mesh(pedestalGeometry(), mat);
  pedestal.castShadow = true;
  const rotor = new THREE.Mesh(rotorGeometry(), mat);
  rotor.position.y = ROTOR_Y;
  rotor.castShadow = true;
  const blur = new THREE.Mesh(once('blurGeo', () => new THREE.CircleGeometry(BLADE_R + 0.2, 40).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: blurTexture(), transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }));
  blur.position.y = ROTOR_Y + 0.045;
  blur.renderOrder = 3;
  const danger = new THREE.Mesh(once('dangerGeo', () => new THREE.PlaneGeometry(2 * (BLADE_R + 0.25), 2 * (BLADE_R + 0.25)).rotateX(-Math.PI / 2)), decalMat(dangerTexture()));
  danger.position.y = 0.02;
  danger.renderOrder = 1;
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glint.scale.set(1.1, 1.1, 1);
  glint.renderOrder = 5;
  const track = new THREE.Mesh(once('trackGeo', () => new THREE.PlaneGeometry(1, 1.3).rotateX(-Math.PI / 2)), decalMat(trackTexture()));
  track.position.y = 0.012;
  track.renderOrder = 1;
  track.visible = false;
  group.add(track, danger, pedestal, rotor, blur, glint);
  return { group, mat, pedestal, rotor, blur, danger, glint, track };
}

// ---------------- gaps ----------------
/** Lane hole span in x: [x0, x1]. `edge` (> 0) = the hole only starts that far from the centre line. */
export function gapSpan(lane, edge = 0) {
  const inner = edge > 0 ? edge : DIVIDER.width / 2, outer = ROAD_HALF + 0.1;
  if (lane === 'L') return [-outer, -inner];
  if (lane === 'R') return [inner, outer];
  return [-outer, outer];
}

function rnd(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Broken lip along one edge of a hole (x from 0 to width, protruding toward -z, top at y=0).
 * Jagged slab chunks (white top, theme side color) sag a little, with cracks and a few loose shards.
 */
export function gapLipGeometry(width, theme, seed = 1) {
  return once(`lip:${width.toFixed(2)}:${theme.id}:${seed}`, () => {
    const r = rnd(seed * 977 + 13);
    const parts = [];
    let x = 0;
    while (x < width - 0.05) {
      const w = Math.min(width - x, 0.35 + r() * 0.5);
      const d = 0.12 + r() * 0.42;
      const tilt = 0.04 + r() * 0.16;
      const top = new THREE.BoxGeometry(w * 0.96, 0.06, d);
      parts.push(part(top, theme.road.a, { p: [x + w / 2, -0.03 - d * tilt * 0.5, -d / 2], r: [-tilt, (r() - 0.5) * 0.12, (r() - 0.5) * 0.08] }));
      parts.push(part(G.box(w * 0.94, 0.62, d * 0.9), theme.road.side, { p: [x + w / 2, -0.38 - d * tilt * 0.6, -d * 0.45], r: [-tilt, 0, 0], bright: 0.82 }));
      x += w;
    }
    // a hazard-painted strip right at the edge (on the solid tile)
    const n = Math.max(4, Math.round(width / 0.42));
    for (let i = 0; i < n; i++) {
      const sw = width / n;
      parts.push(part(G.box(sw * 0.98, 0.012, 0.22), i % 2 ? BLACK : YELLOW, { p: [(i + 0.5) * sw, 0.008, 0.16], r: [0, 0, 0], bright: i % 2 ? 1 : 1.15 }));
    }
    // loose shards hanging below the lip
    for (let i = 0; i < 5; i++) {
      const s = 0.12 + r() * 0.2;
      parts.push(part(new THREE.TetrahedronGeometry(s, 0), r() > 0.5 ? theme.road.side : theme.road.under, { p: [0.3 + r() * (width - 0.6), -0.85 - r() * 0.6, -0.2 - r() * 0.4], r: [r() * 3, r() * 3, r() * 3], bright: 0.75 }));
    }
    return merge(parts);
  });
}

/** Vertical gradient curtain (unit width/length, top at y=0 going down `depth`), RGBA vertex colors. */
function curtainGeometry(depth, color, a0, a1) {
  const g = new THREE.PlaneGeometry(1, depth, 1, 4);
  g.translate(0, -depth / 2, 0);
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 4);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, -p.getY(i) / depth);
    col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b;
    col[i * 4 + 3] = a0 + (a1 - a0) * Math.pow(f, 0.7);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.deleteAttribute('uv');
  return g;
}

export function gapWallGeometry() { return once('gapWall', () => curtainGeometry(5, '#0b1530', 0.92, 0)); }

/** Pit shade: dark radial-ish plane seen through the hole (unit size, lies flat). */
export function gapPitTexture() {
  return once('pitTex', () => canvasTex(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w * 0.7);
    grd.addColorStop(0, 'rgba(8,16,44,0.82)');
    grd.addColorStop(0.6, 'rgba(10,22,58,0.55)');
    grd.addColorStop(1, 'rgba(14,30,72,0.0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }));
}

/** Chevrons pointing toward -z (the gap), tiling along v. Painted look: yellow with a dark outline. */
export function chevronTexture() {
  return once('chevTex', () => canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const path = (cy, t) => {
      g.beginPath();
      g.moveTo(w * 0.08, cy + h * 0.26);
      g.lineTo(w * 0.5, cy - h * 0.06);
      g.lineTo(w * 0.92, cy + h * 0.26);
      g.lineTo(w * 0.92, cy + h * 0.26 + t);
      g.lineTo(w * 0.5, cy - h * 0.06 + t);
      g.lineTo(w * 0.08, cy + h * 0.26 + t);
      g.closePath();
    };
    const cy = h * 0.2, t = h * 0.3;
    g.lineJoin = 'round';
    path(cy, t); g.strokeStyle = 'rgba(40,14,0,0.6)'; g.lineWidth = 14; g.stroke();
    const grd = g.createLinearGradient(0, cy - h * 0.06, 0, cy + h * 0.56);
    grd.addColorStop(0, '#fff3a6');
    grd.addColorStop(0.35, '#ffc531');
    grd.addColorStop(1, '#ff8a1f');
    path(cy, t); g.fillStyle = grd; g.fill();
  }, { repeatY: true }));
}

/** Soft additive glow version of the chevrons (pulses). */
export function chevronGlowTexture() {
  return once('chevGlow', () => canvasTex(128, 128, (g, w, h) => {
    g.filter = 'blur(7px)';
    g.fillStyle = 'rgba(255,160,40,1)';
    g.beginPath();
    g.moveTo(w * 0.06, h * 0.46); g.lineTo(w * 0.5, h * 0.12); g.lineTo(w * 0.94, h * 0.46);
    g.lineTo(w * 0.94, h * 0.78); g.lineTo(w * 0.5, h * 0.44); g.lineTo(w * 0.06, h * 0.78);
    g.closePath(); g.fill();
  }, { repeatY: true }));
}

/** Warning board for cliffs and narrow bridges: hazard-striped frame, red headline, an arrow to the safe side. */
export function cliffSignTexture(head, text) {
  return once(`sign:${head}:${text}`, () => canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#20263a'; g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.rect(8, 8, w - 16, h - 16); g.clip();
    for (let i = -h; i < w + h; i += 44) { g.fillStyle = '#ffc531'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i + 22 - h, h); g.lineTo(i - h, h); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = '#fff6d6'; g.fillRect(22, 22, w - 44, h - 44);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 54px "Lilita One", "Arial Black", sans-serif';
    g.fillStyle = '#e02634'; g.fillText(head, w / 2, 62);
    g.font = '900 62px "Lilita One", "Arial Black", sans-serif';
    g.fillStyle = '#20263a'; g.fillText(text, w / 2, 132, w - 70);
  }));
}

/**
 * Gap dressing for one hole (world space). lane L|R|C, from/to = distance range (tile aligned).
 * opts: inner (void starts this far from the centre line), style 'cliff' (jagged broken edge along the
 * whole length), sign (warning board beside the road; default on for cliffs and narrow bridges).
 * Returns { group, hole, chev, glow, sign }: chev/glow materials animate (scroll + pulse) in World.sync;
 * `hole` holds everything that only makes sense once the tiles are gone (a cliff shows it when it opens).
 */
export function buildGapView(theme, lane, from, to, opts = {}) {
  const root = new THREE.Group();
  const group = new THREE.Group();   // the hole itself
  root.add(group);
  const edge = opts.inner > 0 ? opts.inner : 0;
  const cliff = opts.style === 'cliff';
  const fork = lane === 'M';
  const [x0, x1] = fork ? [-(opts.xa || 1.5), opts.xb || 1.5] : gapSpan(lane, edge);
  const width = x1 - x0;
  const len = to - from;
  const zNear = -from, zFar = -to;
  const lipMat = cache.lipMat || (cache.lipMat = toonMaterial());
  const near = new THREE.Mesh(gapLipGeometry(width, theme, Math.round(from)), lipMat);
  near.position.set(x0, 0, zNear);
  const far = new THREE.Mesh(gapLipGeometry(width, theme, Math.round(to) + 7), lipMat);
  far.position.set(x1, 0, zFar);
  far.rotation.y = Math.PI;
  far.receiveShadow = near.receiveShadow = true;
  if (opts.capNear !== false) group.add(near);
  if (opts.capFar !== false) group.add(far);

  const wallMat = cache.wallMat || (cache.wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: true }));
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(gapWallGeometry(), wallMat);
    m.scale.set(w, 1, 1);
    m.position.set(x, -0.02, z);
    m.rotation.y = ry;
    m.renderOrder = 2;
    group.add(m);
  };
  if (opts.capFar !== false) wall(width, (x0 + x1) / 2, zFar + 0.02, 0); // far cut face (faces the camera)
  if (fork) {
    // a hole down the middle: a cut face and a broken edge on both sides
    wall(len, x0 + 0.01, (zNear + zFar) / 2, Math.PI / 2);
    wall(len, x1 - 0.01, (zNear + zFar) / 2, Math.PI / 2);
    const sl = new THREE.Mesh(gapLipGeometry(len, theme, Math.round(from) * 3 + 4), lipMat);
    sl.position.set(x0, 0, zFar); sl.rotation.y = -Math.PI / 2;   // left strip's edge, crumbling toward +x
    const sr = new THREE.Mesh(gapLipGeometry(len, theme, Math.round(from) * 3 + 5), lipMat);
    sr.position.set(x1, 0, zNear); sr.rotation.y = Math.PI / 2;   // right strip's edge, crumbling toward -x
    sl.receiveShadow = sr.receiveShadow = true;
    group.add(sl, sr);
  } else if (lane !== 'C') {
    const xi = lane === 'R' ? x0 + 0.01 : x1 - 0.01;
    wall(len, xi, (zNear + zFar) / 2, Math.PI / 2);              // inner side under the divider
    if (cliff || edge) {
      // the long broken edge of a cliff / narrow bridge: the same jagged lip, run along the road
      const side = new THREE.Mesh(gapLipGeometry(len, theme, Math.round(from) * 3 + (lane === 'R' ? 1 : 2)), lipMat);
      if (lane === 'L') { side.position.set(x1, 0, zNear); side.rotation.y = Math.PI / 2; }
      else { side.position.set(x0, 0, zFar); side.rotation.y = -Math.PI / 2; }
      side.receiveShadow = true;
      group.add(side);
    }
  }
  const pitMat = cache.pitMat || (cache.pitMat = new THREE.MeshBasicMaterial({ map: gapPitTexture(), transparent: true, depthWrite: false, fog: true }));
  const pit = new THREE.Mesh(cache.unitPlane || (cache.unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), pitMat);
  pit.scale.set(width * 1.25, 1, len * 1.15);
  pit.position.set((x0 + x1) / 2, -2.4, (zNear + zFar) / 2);
  pit.renderOrder = 1;
  group.add(pit);
  // what lies below depends on the world: lava glow in the Forge, ice light in the Peaks, ...
  const pg = PIT_GLOW[opts.world];
  if (pg) {
    const gm = once('pitGlow:' + opts.world, () => new THREE.MeshBasicMaterial({ map: glowTexture(), color: pg, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    const glowPlane = new THREE.Mesh(cache.unitPlane, gm);
    glowPlane.scale.set(width * 1.5, 1, len * 1.25);
    glowPlane.position.set((x0 + x1) / 2, -2.1, (zNear + zFar) / 2);
    glowPlane.renderOrder = 2;
    group.add(glowPlane);
  }

  // chevrons + glow painted on the road before the hole
  const cw = Math.min(width - 0.5, 4.2), cl = 6.4;
  const cx = (x0 + x1) / 2 - (lane === 'R' ? 0.05 : lane === 'L' ? -0.05 : 0);
  const chevTex = chevronTexture().clone();
  chevTex.repeat.set(1, 3);
  chevTex.needsUpdate = true;
  const chev = new THREE.Mesh(cache.unitPlane, decalMat(chevTex, { opacity: 0.95 }));
  chev.scale.set(cw, 1, cl);
  chev.position.set(cx, 0.014, zNear + 0.55 + cl / 2);
  chev.renderOrder = 1;
  const glowTex = chevronGlowTexture().clone();
  glowTex.repeat.set(1, 3);
  glowTex.needsUpdate = true;
  const glow = new THREE.Mesh(cache.unitPlane, decalMat(glowTex, { blending: THREE.AdditiveBlending, opacity: 0.5 }));
  glow.scale.set(cw * 1.12, 1, cl);
  glow.position.set(cx, 0.03, zNear + 0.55 + cl / 2);
  glow.renderOrder = 2;
  if (opts.capNear !== false) root.add(chev, glow);

  // warning board on a post beside the doomed side, a little before the edge
  let sign = null;
  if (lane !== 'C' && opts.sign !== false && (cliff || edge || fork || opts.label)) {
    const dir = fork ? 0 : lane === 'L' ? 1 : -1; // +1: safe side is to the right, 0: either side (fork)
    const head = opts.label || (fork ? 'FORK!' : cliff ? 'CLIFF!' : 'NARROW!');
    const text = opts.signText || (fork ? '\u2B05 PICK A SIDE \u27A1' : dir > 0 ? 'KEEP RIGHT \u27A1' : '\u2B05 KEEP LEFT');
    sign = new THREE.Group();
    const board = new THREE.Mesh(cache.signPlane || (cache.signPlane = new THREE.PlaneGeometry(3.3, 1.29)),
      once(`signMat:${head}:${text}`, () => new THREE.MeshBasicMaterial({ map: cliffSignTexture(head, text), fog: true })));
    board.position.y = 2.55;
    const post = new THREE.Mesh(once('signPost', () => merge([
      part(G.cyl(0.07, 0.09, 2.9, 6), STEEL, { p: [-1.2, 0.75, -0.04] }),
      part(G.cyl(0.07, 0.09, 2.9, 6), STEEL, { p: [1.2, 0.75, -0.04] }),
      part(G.box(3.42, 1.41, 0.07), STEEL_D, { p: [0, 2.55, -0.045] }),
      part(G.sphere(0.16, 6, 4), '#ff4a4a', { p: [-1.45, 3.34, 0], bright: 1.3 }),
      part(G.sphere(0.16, 6, 4), '#ff4a4a', { p: [1.45, 3.34, 0], bright: 1.3 }),
    ])), lipMat);
    sign.add(post, board);
    // stands on the solid road right before the edge, on the side that is about to go, turned to the squad
    sign.position.set(fork ? (x0 + x1) / 2 : -dir * (ROAD_HALF - 1.75), 0, zNear + 1.2);
    sign.rotation.y = -dir * 0.2;
    root.add(sign);
  }
  return { group: root, hole: group, chev, glow, sign, textures: [chevTex, glowTex] };
}

export function disposeGapView(v) {
  for (const t of v.textures) t.dispose();
  v.chev.material.dispose();
  v.glow.material.dispose();
}
