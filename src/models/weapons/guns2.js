// Gun part lists per weapon (used by guns.js). gunParts(id, mk, detail) -> [BufferGeometry] with RGB vertex
// colours; detail 0 = raider Low (<= 36 tris), 1 = raider High (<= 60), 2 = hero gun (<= 160, more segments
// and a gold trim). Grip at the origin, pointing -Z, ~0.34 u long. White parts take the gun tint.
// Each weapon has its own silhouette:
//   emberstorm  stubby flared nozzle + round fuel tank on top (charcoal body)
//   glacier     long hexagonal crystal barrel on a white stock
//   sugarrush   chunky round mortar tube with swirl stripes and a candy ball at the mouth
//   spectra     triangular glass prism with rainbow faces and a lens ring
//   gearworks   boxy brass launcher with an exposed gear disc at the back
//   thunderclap two forked prongs (tuning fork) with copper coil rings
//   voidsiphon  orb held in a three-prong claw cage
import * as THREE from 'three';
import { part } from '../util.js';

const ALONG = [Math.PI / 2, 0, 0];
const W = '#ffffff', GOLD = '#ffc531';

const box = (w, h, d, c, o) => part(new THREE.BoxGeometry(w, h, d), c, o);
const oct = (r, c, o) => part(new THREE.OctahedronGeometry(r, 0), c, o);
const tet = (r, c, o) => part(new THREE.TetrahedronGeometry(r, 0), c, o);
const ring = (r, h, seg, c, o) => part(new THREE.CylinderGeometry(r, r, h, seg, 1, true), c, o);
const tube = (rt, rb, h, seg, c, o) => part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), c, o);
const coneO = (r, h, seg, c, o) => part(new THREE.ConeGeometry(r, h, seg, 1, true), c, o);
const sph = (r, ws, hs, c, o) => part(new THREE.SphereGeometry(r, ws, hs), c, o);

/** Prism with one colour per triangle (rainbow faces): non-indexed, coloured by face normal angle. */
function prism(r, len, cols, o) {
  const g = new THREE.CylinderGeometry(r, r, len, 3, 1, false).toNonIndexed();
  part(g, W, o);
  g.computeVertexNormals();
  const n = g.attributes.normal, c = g.attributes.color, v = new THREE.Vector3(), col = new THREE.Color();
  for (let t = 0; t < n.count; t += 3) {
    v.set(n.getX(t) + n.getX(t + 1) + n.getX(t + 2), n.getY(t) + n.getY(t + 1) + n.getY(t + 2), n.getZ(t) + n.getZ(t + 1) + n.getZ(t + 2));
    const a = Math.atan2(v.x, v.y);
    const k = Math.abs(v.z) > 2 ? cols.length - 1 : Math.floor(((a / (Math.PI * 2) + 1) % 1) * (cols.length - 1));
    col.set(cols[k]);
    for (let j = 0; j < 3; j++) c.setXYZ(t + j, col.r, col.g, col.b);
  }
  return g;
}
const RAINBOW = ['#ff5a7a', '#ffd34d', '#5ad8ff', '#ffffff'];

/** f(min Mk, low too?, builder) list -> parts for this Mk / detail. */
function pick(list, mk, detail) {
  const out = [];
  for (const [min, lo, fn] of list) if (mk >= min && (detail > 0 || lo)) { const g = fn(); if (g) out.push(g); }
  return out;
}

export function gunParts(id, mk, detail) {
  const hi = detail === 2, s = hi ? 2 : 1; // segment boost for the hero gun
  const L = [];
  switch (id) {
    case 'emberstorm':
      L.push([1, true, () => box(0.085, 0.08, 0.2, '#5a4848', { p: [0, 0, -0.05] })],
        [1, true, () => oct(0.07, W, { p: [0, 0.08, -0.02], s: [1, 0.85, 1.15] })],                     // fuel tank
        [1, true, () => coneO(0.05, 0.1, detail ? 6 : 4, '#a89a96', { p: [0, 0.005, -0.2], r: [Math.PI / 2, 0, 0] })], // flared nozzle
        [2, detail > 0 || mk === 2, () => oct(0.074, '#3a2a2a', { p: [0, 0.08, -0.02], s: [1.12, 0.28, 1.25] })],  // tank stripe
        [3, mk <= 4 || detail > 0, () => oct(0.03, '#ffe08a', { p: [0, 0.005, -0.255], bright: 1.7 })],            // hot core
        [4, true, () => coneO(0.038, 0.09, detail ? 5 : 4, '#a89a96', { p: [0, -0.05, -0.18], r: [Math.PI / 2, 0, 0] })], // twin nozzle
        [5, true, () => ring(0.066, 0.025, detail ? 6 : 4, GOLD, { p: [0, 0.005, -0.235], r: ALONG, bright: 1.2 })]);
      if (hi) L.push([1, false, () => sph(0.025, 6, 4, '#4d9bff', { p: [0, -0.04, -0.235], bright: 1.6 })]); // blue pilot
      break;
    case 'glacier':
      L.push([1, true, () => oct(0.06, '#f4fbff', { p: [0, -0.005, 0.03], s: [0.8, 1.05, 1.6] })],        // white stock
        [1, true, () => ring(0.03, 0.3, detail ? 6 : 4, W, { p: [0, 0.012, -0.17], r: ALONG })],           // hexagonal crystal
        [1, true, () => coneO(0.03, 0.08, detail ? 6 : 4, W, { p: [0, 0.012, -0.36], r: [-Math.PI / 2, 0, 0], bright: 1.2 })],
        [2, detail > 0 || mk === 2, () => oct(0.07, '#d8f6ff', { p: [0, 0.012, -0.08], s: [1.4, 0.12, 0.6] })], // frost fins
        [3, detail > 0 || mk === 3, () => oct(0.022, '#ffffff', { p: [0, 0.012, -0.24], s: [1, 1, 3], bright: 1.9 })],
        [4, true, () => coneO(0.018, 0.26, 4, W, { p: [0, 0.06, -0.2], r: [-Math.PI / 2, 0, 0], bright: 1.1 })], // second spike
        [5, true, () => ring(0.05, 0.022, detail ? 6 : 4, GOLD, { p: [0, 0.012, -0.05], r: ALONG, bright: 1.2 })]);
      if (hi) L.push([1, false, () => box(0.02, 0.05, 0.05, '#9fc8e8', { p: [0, -0.06, 0.02] })]);
      break;
    case 'sugarrush':
      L.push([1, true, () => oct(0.06, '#8affc8', { p: [0, -0.01, 0.02], s: [1, 0.9, 1.4] })],             // mount
        [1, true, () => tube(0.06, 0.05, 0.17, detail ? 6 : 5, W, { p: [0, 0.03, -0.12], r: ALONG })],     // fat mortar tube
        [1, true, () => sph(0.045, 4 * s, 3 * s, mk >= 3 ? '#fff08a' : '#ff8ad8', { p: [0, 0.03, -0.215], bright: mk >= 3 ? 1.6 : 1 })], // ball
        [2, detail > 0 || mk <= 3, () => oct(0.066, '#8affc8', { p: [0, 0.03, -0.12], s: [1, 1, 0.22] })], // swirl stripe band
        [4, true, () => tube(0.032, 0.028, 0.12, 4, '#ff8ad8', { p: [0.055, -0.01, -0.08], r: ALONG })],  // second tube
        [5, true, () => ring(0.07, 0.022, detail ? 6 : 4, GOLD, { p: [0, 0.03, -0.2], r: ALONG, bright: 1.2 })]);
      if (hi) L.push([1, false, () => oct(0.064, '#b48aff', { p: [0, 0.03, -0.06], s: [1, 1, 0.22] })]);
      break;
    case 'spectra':
      L.push([1, true, () => prism(0.06, 0.22, RAINBOW, { p: [0, 0.01, -0.1], r: ALONG })],                // glass prism
        [1, true, () => ring(0.052, 0.025, detail ? 6 : 4, W, { p: [0, 0.01, -0.225], r: ALONG, bright: 1.15 })], // lens ring
        [2, detail > 0 || mk === 2, () => oct(0.06, '#e8f0ff', { p: [0, 0.07, -0.06], s: [0.18, 1, 1.4] })], // lens fin
        [3, detail > 0 || mk === 3, () => oct(0.03, '#ffffff', { p: [0, 0.01, -0.225], bright: 1.9 })],
        [4, true, () => prism(0.03, 0.12, RAINBOW, { p: [0, -0.05, -0.08], r: ALONG })],
        [5, true, () => ring(0.07, 0.02, 4, GOLD, { p: [0, 0.01, -0.17], r: ALONG, bright: 1.25 })]);
      if (hi) L.push([1, false, () => box(0.03, 0.06, 0.06, '#c8d0dc', { p: [0, -0.05, 0.02] })]);
      break;
    case 'gearworks':
      L.push([1, true, () => box(0.09, 0.085, 0.24, '#d9a441', { p: [0, 0, -0.07] })],                    // brass launcher
        [1, true, () => gearDisc(0.07, 0.05, detail ? 5 : 4, '#c8d0dc', { p: [0, 0.06, 0.06] })],          // exposed gear
        [2, detail > 0 || mk === 2, () => oct(0.06, '#c8d0dc', { p: [0, 0.06, -0.08], s: [0.15, 0.6, 1.6] })], // steel fin
        [3, detail > 0 || mk === 3, () => oct(0.03, '#ff6a3a', { p: [0, 0, -0.195], bright: 1.8 })],        // red-hot core
        [4, true, () => coneO(0.03, 0.12, 4, '#c8d0dc', { p: [0.06, -0.02, -0.12], r: [-Math.PI / 2, 0, 0] })],
        [5, true, () => ring(0.07, 0.022, 4, GOLD, { p: [0, 0, -0.17], r: ALONG, bright: 1.2 })]);
      if (hi) L.push([1, false, () => ring(0.03, 0.04, 6, '#5b6474', { p: [0, 0.06, 0.06], r: ALONG })]);
      break;
    case 'thunderclap':
      L.push([1, true, () => oct(0.055, '#c87a3a', { p: [0, -0.005, 0.02], s: [0.9, 1, 1.6] })],           // handle
        [1, true, () => oct(0.03, W, { p: [-0.034, 0.012, -0.18], s: [0.6, 0.8, 6], r: [0, -0.12, 0], bright: 1.15 })], // prongs
        [1, true, () => oct(0.03, W, { p: [0.034, 0.012, -0.18], s: [0.6, 0.8, 6], r: [0, 0.12, 0], bright: 1.15 })],
        [1, true, () => ring(0.05, 0.03, 3, '#d9893e', { p: [0, 0.01, -0.06], r: ALONG })],                // copper coil
        [2, detail > 0 || mk === 2, () => ring(0.055, 0.025, 3, '#d9893e', { p: [0, 0.01, -0.11], r: ALONG })],
        [3, detail > 0 || mk === 3, () => oct(0.026, '#fff7b0', { p: [0, 0.012, -0.2], bright: 1.9 })],
        [4, true, () => oct(0.024, W, { p: [0, 0.045, -0.17], s: [0.6, 0.8, 5], bright: 1.15 })],          // third prong
        [5, true, () => ring(0.075, 0.02, 4, GOLD, { p: [0, 0.01, -0.03], r: ALONG, bright: 1.2 })]);
      if (hi) L.push([1, false, () => ring(0.045, 0.02, 6, '#6f6bff', { p: [0, 0.01, -0.15], r: ALONG, bright: 1.4 })]);
      break;
    case 'voidsiphon':
      L.push([1, true, () => oct(0.05, '#3a2a55', { p: [0, -0.02, 0.02], s: [1, 0.9, 1.5] })],            // base
        [1, true, () => sph(0.05, 4 * s, 3 * s, '#ff4bd8', { p: [0, 0.02, -0.15], bright: mk >= 3 ? 1.8 : 1.2 })], // orb
        ...[0, 1, 2].map((i) => [1, true, () => tet(0.04, W, { p: [Math.sin(i * 2.094) * 0.05, 0.02 + Math.cos(i * 2.094) * 0.05, -0.12], s: [0.5, 0.5, 2.2] })]),
        [2, detail > 0 || mk <= 3, () => oct(0.05, '#8a4dff', { p: [0, 0.02, -0.05], s: [1.6, 0.14, 0.8] })], // violet fins
        [4, true, () => oct(0.025, '#ff7ae6', { p: [0, 0.075, -0.06], bright: 1.6 })],                      // second orb
        [5, true, () => ring(0.075, 0.02, 4, GOLD, { p: [0, 0.02, -0.15], r: ALONG, bright: 1.25 })]);
      if (hi) L.push([1, false, () => sph(0.075, 6, 4, '#b44bff', { p: [0, 0.02, -0.15], bright: 1.1 })]);
      break;
    default: // 'ref' and unknown ids: the shipped pistol shape
      L.push([1, true, () => box(0.07, 0.08, 0.2, W, { p: [0, 0, -0.05] })],
        [1, true, () => box(0.04, 0.04, 0.12, W, { p: [0, 0.02, -0.19], bright: 1.25 })]);
  }
  if (hi && mk >= 5) L.push([5, false, () => box(0.012, 0.012, 0.16, GOLD, { p: [0, -0.055, -0.08], bright: 1.2 })]); // gold trim
  return pick(L, mk, detail);
}

/** Flat gear facing +Z (one face, `teeth` teeth) for the Gearworks gun. */
function gearDisc(R, r, teeth, color, o) {
  const pos = [];
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, w = (Math.PI * 2) / teeth;
    pts.push([r, a0], [R, a0 + w * 0.2], [R, a0 + w * 0.5], [r, a0 + w * 0.7]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [ra, aa] = pts[i], [rb, ab] = pts[(i + 1) % pts.length];
    pos.push(0, 0, 0.012, Math.cos(aa) * ra, Math.sin(aa) * ra, 0, Math.cos(ab) * rb, Math.sin(ab) * rb, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, color, o);
}
