// Display guns for the Armory / Compare preview stand (UI only, never in a run). Higher detail than the squad
// and hero guns: each weapon keeps its silhouette from guns2.js (nozzle + tank, crystal lance, mortar tube,
// prism, gear launcher, tuning fork, orb cage) but with real barrels, bodies and trim in the weapon's colours.
//   buildDisplayGun(id, mk) -> { body, glow } BufferGeometries (cached; callers never dispose them).
//   body: RGB vertex colours for a toon material; glow: RGB vertex colours for an unlit basic material.
// Grip at the origin, pointing -Z, about 1 u long (the preview scales it). Mk ladder as everywhere:
// I plain, II a fin or stripe, III a glowing core, IV a second barrel or element, V a gold halo and trim.
// Budget: <= 6k triangles per gun (the preview window allows 40k).
import * as THREE from 'three';
import { part, merge, G } from '../util.js';

const GOLD = '#ffc531';
const ALONG = [Math.PI / 2, 0, 0];   // cylinder axis Y -> +Z (top radius at the back)
const FWD = [-Math.PI / 2, 0, 0];    // cone tip -> -Z
const cache = new Map();

const box = (w, h, d, c, o) => part(G.box(w, h, d), c, o);
const cyl = (rBack, rFront, len, seg, c, o) => part(G.cyl(rBack, rFront, len, seg), c, { r: ALONG, ...o });
const ring = (R, t, c, o) => part(G.torus(R, t, 8, 28), c, o);             // torus faces +Z (around the barrel)
const sph = (r, c, o) => part(G.sphere(r, 16, 12), c, o);
const cone = (r, len, seg, c, o) => part(G.cone(r, len, seg), c, { r: FWD, ...o });
const oct = (r, c, o) => part(new THREE.OctahedronGeometry(r, 0), c, o);

/** Side gear (faces +X so the side profile shows it): hub + teeth. */
function gear(R, teeth, thick, c, o) {
  const parts = [part(G.cyl(R * 0.78, R * 0.78, thick, 20), c)];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    parts.push(part(G.box(thick, R * 0.36, R * 0.3), c, { p: [0, Math.sin(a) * R * 0.92, Math.cos(a) * R * 0.92], r: [-a, 0, 0] }));
  }
  parts.push(part(G.cyl(R * 0.3, R * 0.3, thick * 1.3, 12), '#5b6474'));
  const g = merge(parts.map((p) => p.index ? p.toNonIndexed() : p));
  g.rotateZ(Math.PI / 2);
  const p = o.p || [0, 0, 0];
  g.translate(p[0], p[1], p[2]);
  return g;
}

/** Triangular glass prism along Z, one colour per side face. */
function prism(r, len, cols, o) {
  const g = new THREE.CylinderGeometry(r, r, len, 3, 1, false).toNonIndexed();
  part(g, '#ffffff', { r: ALONG, ...o });
  g.computeVertexNormals();
  const n = g.attributes.normal, c = g.attributes.color, col = new THREE.Color();
  for (let t = 0; t < n.count; t += 3) {
    const nx = n.getX(t), ny = n.getY(t), nz = n.getZ(t);
    const k = Math.abs(nz) > 0.9 ? 3 : Math.floor(((Math.atan2(nx, ny) / (Math.PI * 2)) + 1) % 1 * 3);
    col.set(cols[k]);
    for (let j = 0; j < 3; j++) c.setXYZ(t + j, col.r, col.g, col.b);
  }
  return g;
}

function grip(c, z = 0.08) { return box(0.09, 0.24, 0.12, c, { p: [0, -0.16, z], r: [0.32, 0, 0] }); }

function parts(id, mk) {
  const B = [], L = []; // body, glow
  const at = (min, list, ...gs) => { if (mk >= min) list.push(...gs); };
  switch (id) {
    case 'emberstorm':
      B.push(box(0.17, 0.17, 0.42, '#4a3a3a', { p: [0, 0, -0.02] }), grip('#2e2424'),
        box(0.1, 0.06, 0.3, '#2e2424', { p: [0, -0.1, 0.0] }),
        part(G.capsule(0.085, 0.24, 4, 14), '#ff7a1f', { p: [0, 0.16, 0.02], r: ALONG }),           // fuel tank
        ring(0.088, 0.018, '#3a2a2a', { p: [0, 0.16, 0.08] }), ring(0.088, 0.018, '#3a2a2a', { p: [0, 0.16, -0.06] }),
        cyl(0.02, 0.02, 0.3, 8, '#c8b8a0', { p: [0, 0.1, -0.3] }),                                      // fuel pipe
        cyl(0.075, 0.075, 0.2, 16, '#6a5a58', { p: [0, 0, -0.32] }),
        cyl(0.08, 0.135, 0.2, 18, '#a89a96', { p: [0, 0, -0.5] }),                                      // flared nozzle
        ring(0.13, 0.016, '#5a4848', { p: [0, 0, -0.6] }));
      L.push(part(G.cyl(0.11, 0.11, 0.01, 18), '#ff9a2a', { p: [0, 0, -0.598], r: ALONG }),             // hot mouth
        sph(0.024, '#4d9bff', { p: [0, -0.09, -0.6] }));                                                 // pilot flame
      at(2, B, ...[-0.36, -0.42, -0.48].map((z) => box(0.3, 0.012, 0.025, '#ff8a2a', { p: [0, 0, z] })));   // heat fins
      at(3, L, box(0.176, 0.025, 0.3, '#ffd34d', { p: [0, 0.02, -0.02] }));                             // glowing core slit
      at(4, B, cyl(0.05, 0.085, 0.24, 14, '#a89a96', { p: [0, -0.13, -0.42] }), part(G.capsule(0.05, 0.14, 3, 10), '#ff7a1f', { p: [0.13, 0.12, 0.05], r: ALONG }));
      at(4, L, part(G.cyl(0.07, 0.07, 0.01, 14), '#ffb03a', { p: [0, -0.13, -0.541], r: ALONG }));
      at(5, B, ring(0.165, 0.024, GOLD, { p: [0, 0, -0.56] }), box(0.18, 0.02, 0.4, GOLD, { p: [0, -0.085, -0.02] }));
      break;
    case 'glacier':
      B.push(box(0.12, 0.15, 0.32, '#f4fbff', { p: [0, 0, 0.18] }), grip('#9fc8e8', 0.12),
        box(0.08, 0.1, 0.12, '#c8e8f8', { p: [0, -0.02, 0.38] }),
        cyl(0.065, 0.06, 0.62, 6, '#9fe8ff', { p: [0, 0.02, -0.28] }),                                  // hexagonal crystal lance
        cone(0.06, 0.18, 6, '#e8fbff', { p: [0, 0.02, -0.68] }),
        ring(0.075, 0.018, '#d8f6ff', { p: [0, 0.02, -0.04] }), ring(0.072, 0.016, '#d8f6ff', { p: [0, 0.02, -0.3] }));
      L.push(box(0.02, 0.02, 0.56, '#bff4ff', { p: [0, 0.085, -0.28] }));                                // frost line
      at(2, B, oct(0.1, '#d8f6ff', { p: [0, 0.02, -0.14], s: [1.6, 0.14, 0.9] }));                         // frost fins
      at(3, L, oct(0.05, '#ffffff', { p: [0, 0.02, -0.62], s: [1, 1, 2.4] }), oct(0.035, '#bff4ff', { p: [0, 0.09, 0.1] }));
      at(4, B, cone(0.03, 0.42, 6, '#c8f4ff', { p: [0, 0.13, -0.32] }));                                    // second spike
      at(5, B, ring(0.1, 0.02, GOLD, { p: [0, 0.02, -0.12] }), box(0.125, 0.02, 0.3, GOLD, { p: [0, -0.07, 0.18] }));
      break;
    case 'sugarrush':
      B.push(part(G.sphere(0.13, 16, 10), '#8affc8', { p: [0, -0.03, 0.08], s: [1, 0.8, 1.5] }), grip('#ff9ade', 0.14),
        cyl(0.12, 0.135, 0.46, 20, '#ffffff', { p: [0, 0.06, -0.22] }),                                  // mortar tube
        ring(0.14, 0.03, '#ff8ad8', { p: [0, 0.06, -0.46] }));                                           // mouth rim
      for (let i = 0; i < 4; i++) B.push(ring(0.128, 0.016, i % 2 ? '#b48aff' : '#ff8ad8', { p: [0, 0.06, -0.06 - i * 0.09], r: [0, 0.25, 0] }));
      (mk >= 3 ? L : B).push(sph(0.09, mk >= 3 ? '#fff08a' : '#ff8ad8', { p: [0, 0.06, -0.47] }));    // candy ball
      L.push(sph(0.022, '#ffffff', { p: [0.035, 0.12, -0.5] }));                                         // gloss
      at(2, B, ...[[0.1, 0.16, -0.1, '#ffd34d'], [-0.1, 0.15, -0.2, '#5ad8ff'], [0.06, 0.18, -0.3, '#ff5a7a'], [-0.05, 0.19, -0.05, '#8affc8']]
        .map(([x, y, z, c]) => box(0.03, 0.012, 0.012, c, { p: [x, y, z], r: [0, z * 9, 0.4] })));       // sprinkles
      at(4, B, cyl(0.06, 0.065, 0.3, 14, '#ff8ad8', { p: [0.15, -0.02, -0.16] }), ring(0.068, 0.014, '#ffffff', { p: [0.15, -0.02, -0.31] }));
      at(5, B, ring(0.16, 0.026, GOLD, { p: [0, 0.06, -0.4] }));
      break;
    case 'spectra':
      B.push(box(0.14, 0.15, 0.26, '#e8f0ff', { p: [0, -0.01, 0.2] }), grip('#c8d0dc', 0.16),
        prism(0.14, 0.44, ['#ff5a7a', '#ffd34d', '#5ad8ff', '#ffffff'], { p: [0, 0.01, -0.14] }),
        ring(0.1, 0.022, '#e8f0ff', { p: [0, 0.01, -0.4] }), cyl(0.06, 0.08, 0.1, 16, '#c8d0dc', { p: [0, 0.01, -0.4] }));
      L.push(part(G.cyl(0.07, 0.07, 0.01, 16), '#ffffff', { p: [0, 0.01, -0.451], r: ALONG }));            // lens
      at(2, B, oct(0.12, '#e8f0ff', { p: [0, 0.14, -0.08], s: [0.12, 0.8, 1.3] }));                        // lens fin
      at(3, L, oct(0.05, '#fff6fe', { p: [0, 0.01, -0.5] }), box(0.02, 0.02, 0.2, '#ff8ad8', { p: [0, 0.09, 0.2] }));
      at(4, B, prism(0.065, 0.26, ['#7dff6a', '#4dc3ff', '#a26bff', '#ffffff'], { p: [0, -0.13, -0.12] }));
      at(5, B, ring(0.15, 0.022, GOLD, { p: [0, 0.01, -0.3] }), box(0.145, 0.02, 0.26, GOLD, { p: [0, 0.07, 0.2] }));
      break;
    case 'gearworks':
      B.push(box(0.19, 0.18, 0.46, '#d9a441', { p: [0, 0, -0.04] }), grip('#5b6474', 0.12),
        box(0.21, 0.03, 0.48, '#8a6a2a', { p: [0, -0.09, -0.04] }),
        cyl(0.06, 0.07, 0.22, 8, '#c8d0dc', { p: [0, 0.02, -0.36] }), ring(0.075, 0.016, '#5b6474', { p: [0, 0.02, -0.47] }),
        gear(0.13, 10, 0.04, '#c8d0dc', { p: [0.12, 0.05, 0.1] }));                                    // exposed side gear
      for (const [x, z] of [[0.097, -0.2], [0.097, -0.06], [-0.097, -0.2], [-0.097, -0.06]]) B.push(sph(0.014, '#8a6a2a', { p: [x, 0.05, z] }));
      L.push(sph(0.022, '#ffd34d', { p: [0, 0.1, 0.16] }));                                              // pilot lamp
      at(2, B, oct(0.12, '#c8d0dc', { p: [0, 0.13, -0.08], s: [0.12, 0.7, 1.6] }));                        // steel fin
      at(3, L, oct(0.045, '#ff6a3a', { p: [0, 0.02, -0.49] }), box(0.012, 0.03, 0.3, '#ff8a3c', { p: [-0.1, 0.02, -0.04] }));
      at(4, B, cyl(0.04, 0.045, 0.3, 8, '#c8d0dc', { p: [-0.07, -0.13, -0.26] }), gear(0.08, 8, 0.03, '#efb64e', { p: [-0.12, 0.05, 0.12] }));
      at(5, B, ring(0.11, 0.022, GOLD, { p: [0, 0.02, -0.4] }), box(0.2, 0.02, 0.46, GOLD, { p: [0, 0.095, -0.04] }));
      break;
    case 'thunderclap':
      B.push(cyl(0.07, 0.075, 0.24, 14, '#c87a3a', { p: [0, 0, 0.16] }), grip('#8a4a22', 0.14),
        cyl(0.085, 0.09, 0.2, 16, '#3a3a6e', { p: [0, 0, -0.06] }));
      for (let i = 0; i < 3; i++) B.push(ring(0.092, 0.02, '#d9893e', { p: [0, 0, 0.02 - i * 0.07] }));     // copper coils
      for (const s of [-1, 1]) B.push(box(0.04, 0.05, 0.44, '#ffe14d', { p: [s * 0.065, 0, -0.36], r: [0, s * -0.1, 0] }),
        cone(0.03, 0.08, 6, '#fff7b0', { p: [s * 0.088, 0, -0.62] }));                                   // fork prongs
      L.push(sph(0.035, '#fff7b0', { p: [0, 0, -0.5] }));                                                // spark between prongs
      at(2, B, ring(0.1, 0.018, '#6f6bff', { p: [0, 0, 0.12] }));                                         // coil stripe
      at(3, L, sph(0.05, '#ffffff', { p: [0, 0, -0.18] }), oct(0.025, '#fff7b0', { p: [0.1, 0.05, -0.4] }), oct(0.025, '#fff7b0', { p: [-0.1, -0.05, -0.44] }));
      at(4, B, box(0.035, 0.04, 0.38, '#ffe14d', { p: [0, 0.075, -0.34] }));                               // third prong
      at(5, B, ring(0.13, 0.022, GOLD, { p: [0, 0, -0.18] }), box(0.02, 0.02, 0.22, GOLD, { p: [0, 0.08, 0.16] }));
      break;
    case 'voidsiphon':
      B.push(cyl(0.08, 0.1, 0.34, 16, '#1d1530', { p: [0, 0, 0.1] }), grip('#3a2a55', 0.14),
        ring(0.105, 0.02, '#3b1a6e', { p: [0, 0, -0.08] }));
      for (let i = 0; i < 3; i++) {                                                                       // claw cage
        const a = i * 2.094 + 0.5, x = Math.sin(a), y = Math.cos(a);
        B.push(box(0.035, 0.035, 0.26, '#8a4dff', { p: [x * 0.12, y * 0.12, -0.22], r: [y * 0.35, -x * 0.35, 0] }),
          box(0.03, 0.03, 0.12, '#b25cff', { p: [x * 0.13, y * 0.13, -0.38], r: [-y * 0.5, x * 0.5, 0] }));
      }
      L.push(sph(0.1, mk >= 3 ? '#ff7ae6' : '#ff4bd8', { p: [0, 0, -0.3] }));                           // orb
      B.push(part(G.torus(0.13, 0.008, 4, 32), '#3b1a6e', { p: [0, 0, -0.3], r: [0.4, 0, 0] }));
      at(2, B, oct(0.11, '#8a4dff', { p: [0, 0, 0.12], s: [1.7, 0.12, 0.8] }));                            // violet fins
      at(3, L, sph(0.03, '#ffffff', { p: [0.03, 0.03, -0.36] }));
      at(4, L, sph(0.045, '#ff7ae6', { p: [0, 0.18, -0.18] }));
      at(5, B, ring(0.17, 0.02, GOLD, { p: [0, 0, -0.3], r: [0.4, 0, 0] }));
      at(5, L, ...[0, 1, 2, 3, 4].map((i) => oct(0.02, '#fff0c0', { p: [Math.sin(i * 1.26) * 0.17, Math.cos(i * 1.26) * 0.17 * 0.92, -0.3 + Math.cos(i * 1.26) * 0.065] })));
      break;
    default:
      B.push(box(0.12, 0.14, 0.4, '#c8d0dc', { p: [0, 0, -0.05] }), grip('#5b6474'));
      L.push(box(0.04, 0.04, 0.1, '#ffffff', { p: [0, 0.02, -0.3] }));
  }
  return { B, L };
}

const plain = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));

export function buildDisplayGun(id, mk = 1) {
  const m = Math.max(1, Math.min(5, mk | 0)), key = id + m;
  if (!cache.has(key)) {
    const { B, L } = parts(id, m);
    const body = merge(plain(B)), glow = merge(plain(L));
    body.computeVertexNormals();
    cache.set(key, { body, glow });
  }
  return cache.get(key);
}

/** Triangles of a display gun (tests / budgets). */
export function displayGunTris(id, mk) {
  const { body, glow } = buildDisplayGun(id, mk);
  return (body.attributes.position.count + glow.attributes.position.count) / 3;
}
