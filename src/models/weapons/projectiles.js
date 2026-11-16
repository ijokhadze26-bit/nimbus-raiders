// Projectile geometries per weapon / Mk / part (WEAPONS builder, SPEC2 §2 visuals).
//   buildProjectileGeometry(id, mk, part = 'main' | 'child' | 'tracer') -> BufferGeometry (cached; callers never
//   dispose it). Oriented along -Z, centred on the bullet position, RGBA vertex colours for the shared bullet
//   MeshBasicMaterial (transparent, no depth write). <= 120 triangles per style (SPEC2 §6.9).
// Every Mk changes the colours (def.look.mk) and adds a flourish; MK_SCALE is applied per bullet (b.sx/sy/sz).
//   emberstorm  soft teardrop puff (outer glow, flame, hot core); Mk V adds a white inner flame
//   glacier     long hexagonal crystal with a frost trail; Mk V twin crystal
//   sugarrush   round candy ball painted in four candy swirls + gloss; bigger every Mk
//   spectra     unit-length rainbow sleeve (red -> violet along its length) round a white core; sz = beamLen
//   gearworks   flat saw gear facing the camera (spins as roll); III red-hot teeth; V double layer
//   thunderclap zig-zag lightning dart in an indigo glow sleeve; thicker at Mk V
//   voidsiphon  dark violet orb with an off-centre magenta core and a thin ring
// Low look (geo.userData.low, drawn by bullets.sync on Low): Ember's glow shell is narrower, Glacier drops the
// frost trail cone, Sugar the Mk III+ halo, Spectra the Mk III+ outer sleeve. Colours and Mk flourishes stay.
// geo.userData.lowKeep (LOW_KEEP): the share of a style's Low-drawn bullets that is drawn at all on Low.
// Tracers (drawn only for Ember / Sugar / Void): ember sparks, sugar sprinkles, violet motes.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { weaponDef } from '../../data/weapons.js';

const cache = new Map();
const ALONG = [Math.PI / 2, 0, 0];   // cylinder / capsule axis Y -> Z
const C = (c) => new THREE.Color(c);

function cyl(rt, rb, h, rad, hs = 1, open = false) { return new THREE.CylinderGeometry(rt, rb, h, rad, hs, open); }
function cone(r, h, rad, open = true) { return new THREE.ConeGeometry(r, h, rad, 1, open); }

/** Recolours an RGBA geometry per vertex: fn(x, y, z, out Color) -> alpha multiplier (or undefined). */
function paint(g, fn) {
  const p = g.attributes.position, c = g.attributes.color, n = p.count, s = c.itemSize, o = new THREE.Color();
  for (let i = 0; i < n; i++) {
    o.setRGB(c.array[i * s], c.array[i * s + 1], c.array[i * s + 2]);
    const a = fn(p.getX(i), p.getY(i), p.getZ(i), o);
    c.array[i * s] = o.r; c.array[i * s + 1] = o.g; c.array[i * s + 2] = o.b;
    if (s === 4 && a !== undefined) c.array[i * s + 3] *= a;
  }
  return g;
}

/** Flat gear facing +-Z: `teeth` teeth (4 rim points each), triangle fan; back face optional. */
function gearGeometry(R, r, teeth, color, opts = {}) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2 + (opts.rot || 0), w = (Math.PI * 2) / teeth;
    pts.push([r, a0], [R, a0 + w * 0.18], [R, a0 + w * 0.5], [r, a0 + w * 0.68]);
  }
  const pos = [], z = opts.z || 0;
  const faces = opts.back === false ? [1] : [1, -1];
  for (const f of faces) {
    for (let i = 0; i < pts.length; i++) {
      const [ra, aa] = pts[i], [rb, ab] = pts[(i + 1) % pts.length];
      const A = [0, 0, z + f * 0.02], B = [Math.cos(aa) * ra, Math.sin(aa) * ra, z], Cc = [Math.cos(ab) * rb, Math.sin(ab) * rb, z];
      if (f > 0) pos.push(...A, ...B, ...Cc); else pos.push(...A, ...Cc, ...B);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, color, { a: opts.a ?? 1, bright: opts.bright });
}

// ---------------- per weapon ----------------
function ember(L, mk, low) {
  const len = 0.35 + (mk - 1) * 0.0625;
  const tail = (zmax) => (x, y, z, o) => (z > 0 ? Math.max(0.1, 1 - (z / zmax) * 0.85) : 1); // the tail fades out
  const parts = [
    // Low: the faint glow shell is half as wide (it is most of the flame's pixels, at 26% alpha)
    paint(part(G.sphere(low ? 0.2 : 0.3, 8, 5), C(L.color), { s: [1, 0.85, len / (low ? 0.15 : 0.19)], a: low ? 0.34 : 0.26, bright: 1.1 }), tail(len * 1.6)),
    paint(part(G.sphere(0.13, 6, 4), C(L.core), { s: [1, 0.9, len / 0.16], p: [0, 0.01, -len * 0.25], a: 0.85 }), tail(len)),
  ];
  if (mk >= 5) parts.push(part(G.sphere(0.06, 4, 3), C('#ffffff'), { s: [1, 1, 2.4], p: [0, 0.01, -len * 0.35], a: 1, bright: 1.3 }));
  return merge(parts);
}

function glacier(L, mk, low) {
  const len = 0.9 + (mk - 1) * 0.15, r = 0.075 + (mk - 1) * 0.008;
  const crystal = (dx) => [
    part(cyl(r, r, len * 0.62, 6, 1, true), C(L.color), { r: ALONG, p: [dx, 0, 0], a: 0.92, bright: 1.1 }),
    part(cone(r, len * 0.24, 6), C(L.core), { r: [-Math.PI / 2, 0, 0], p: [dx, 0, -len * 0.43], a: 1 }),
    part(cone(r, len * 0.14, 6), C(L.color), { r: [Math.PI / 2, 0, 0], p: [dx, 0, len * 0.38], a: 0.9 }),
  ];
  const parts = mk >= 5 ? [...crystal(-0.09), ...crystal(0.09)] : crystal(0);
  if (!low) parts.push(part(cone(r * (mk >= 5 ? 2.6 : 1.6), len * 0.9, 6), C(L.trail), { r: ALONG, p: [0, 0, len * 0.75], a: 0.3 }));
  return merge(parts);
}

function sugar(L, mk, def, low) {
  const R = 0.2 + (mk - 1) * 0.025;
  const candy = def.look.candy.map(C), white = C('#ffffff');
  const ball = paint(part(G.sphere(R, 8, 5), white, { a: 1 }), (x, y, z, o) => {
    const t = Math.atan2(x, z) / (Math.PI * 2) + y / R * 0.22 + 1;
    const band = (t * 4) % 4, i = Math.floor(band), f = band - i;
    o.copy(f > 0.82 ? white : candy[i]);
    if (y > R * 0.55) o.lerp(white, 0.35);
    return 1;
  });
  const parts = [ball, part(G.sphere(R * 0.32, 4, 3), white, { p: [-R * 0.42, R * 0.48, R * 0.35], a: 0.85, bright: 1.2 })];
  if (mk >= 3 && !low) parts.push(part(G.sphere(R * 1.35, 6, 4), C(L.color), { a: 0.22 }));
  return merge(parts);
}

function spectra(L, mk, def, low) {
  const r = 0.055 + (mk - 1) * 0.009;
  const bands = def.look.rainbow.map(C);
  const sleeve = paint(part(cyl(r * 2.1, r * 2.1, 1, 6, 5, true), C('#ffffff'), { r: ALONG, a: 0.92 }), (x, y, z, o) => {
    const t = Math.min(0.999, Math.max(0, z + 0.5)) * (bands.length - 1), i = Math.floor(t);
    o.copy(bands[i]).lerp(bands[Math.min(bands.length - 1, i + 1)], t - i);
    return z < -0.45 ? 0.5 : 1;
  });
  const parts = [sleeve, part(cyl(r * 0.7, r * 0.7, 1.04, 4, 1, true), C(L.core), { r: ALONG, a: 1, bright: 1.3 })];
  if (mk >= 3 && !low) parts.push(part(cyl(r * 3.2, r * 3.2, 0.9, 5, 1, true), C(L.trail), { r: ALONG, a: 0.22 }));
  if (mk >= 5) parts.push(part(G.sphere(r * 2.6, 5, 3), C('#ffffff'), { p: [0, 0, -0.5], a: 0.9 }));
  return merge(parts);
}

function gear(L, mk, small = false) {
  const k = small ? 0.55 : 1, R = (0.24 + (mk - 1) * 0.012) * k, r = R * 0.74;
  const teeth = small ? 6 : 8;
  const parts = [
    gearGeometry(R, r, teeth, C(L.color), { a: 1, bright: 1.05, back: !(mk >= 5 && !small) }),
    part(cyl(R * 0.36, R * 0.36, 0.08, 5, 1, true), C(L.core), { r: ALONG, a: 1 }),
  ];
  if (mk >= 3 && !small) { // red-hot teeth: a glowing rim ring behind the teeth
    parts.push(gearGeometry(R * 1.04, R * 0.9, teeth, C('#ff6a3a'), { a: 0.85, bright: 1.25, z: -0.012, back: false }));
  }
  if (mk >= 5 && !small) parts.push(gearGeometry(R * 0.82, R * 0.6, teeth, C('#fff3c4'), { a: 1, z: 0.035, rot: Math.PI / teeth, back: false }));
  return merge(parts);
}

function thunder(L, mk, def) {
  const len = 1.15 + (mk - 1) * 0.14, w = 0.09 + (mk >= 5 ? 0.03 : 0), th = 0.05 + (mk - 1) * 0.006 + (mk >= 5 ? 0.02 : 0);
  const pts = [[0, -len / 2], [w, -len / 6], [-w, len / 6], [w * 0.6, len / 2]];
  const electric = def.look.mk[0].color; // the storm's electric yellow under every Mk's own core colour
  const zig = (k, color, a, bright, dy = 0) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
      out.push(part(G.box(th * k, th * k, l * 1.1), C(color), { p: [(x0 + x1) / 2, dy, (z0 + z1) / 2], r: [0, Math.atan2(dx, dz), 0], a, bright }));
    }
    return out;
  };
  const parts = [...zig(3.4, L.trail, 0.55, 1), ...zig(1.7, electric, 0.95, 1.2), ...zig(0.8, L.core, 1, 1.4, 0.01)];
  if (mk >= 3) parts.push(part(G.box(th * 0.9, th * 0.9, len * 0.35), C(electric), { p: [w * 1.7, 0, -len * 0.05], r: [0, 0.8, 0], a: 0.9 }));
  return merge(parts);
}

function voidOrb(L, mk) {
  const R = 0.2 + (mk - 1) * 0.02;
  return merge([
    part(G.sphere(R, 6, 4), C(L.color), { a: 0.82 }),
    part(G.sphere(R * 0.5, 5, 3), C(L.core), { p: [R * 0.18, R * 0.12, -R * 0.2], a: 1, bright: 1.3 }),
    part(cyl(R * 1.45, R * 1.45, 0.03, 8, 1, true), C(L.trail), { r: [0.35, 0, 0], a: 0.7 }),
  ]);
}

function tracer(id, L, def) {
  switch (def.tracerLook) {
    case 'ember': return merge([
      part(G.capsule(0.03, 0.22, 1, 3), C(L.core), { r: ALONG, a: 1, bright: 1.2 }),
      part(G.capsule(0.06, 0.18, 1, 3), C(L.color), { r: ALONG, p: [0, 0, 0.05], a: 0.45 }),
    ]);
    case 'sugar': {
      const c = def.look.candy;
      return merge([
        part(G.capsule(0.028, 0.1, 1, 3), C(c[0]), { r: [Math.PI / 2, 0.6, 0], p: [-0.05, 0, 0], a: 1 }),
        part(G.capsule(0.028, 0.1, 1, 3), C(c[1]), { r: [Math.PI / 2, -0.5, 0], p: [0.05, 0.03, 0.06], a: 1 }),
        part(G.capsule(0.028, 0.1, 1, 3), C(c[2]), { r: [0.4, 0, 0.9], p: [0, -0.03, -0.07], a: 1 }),
      ]);
    }
    case 'void': return merge([
      part(G.sphere(0.06, 4, 3), C(L.core), { a: 1, bright: 1.2 }),
      part(G.sphere(0.12, 4, 3), C(L.trail), { a: 0.35 }),
    ]);
    default: return merge([part(G.capsule(0.03, 0.2, 1, 3), C(L.trail), { r: ALONG, a: 0.8 })]);
  }
}

export function buildProjectileGeometry(id, mk = 1, partName = 'main', lod = 'high') {
  const m = Math.max(1, Math.min(5, mk | 0));
  const low = lod === 'low';
  const key = id + ':' + m + ':' + partName + (low ? ':low' : '');
  if (cache.has(key)) return cache.get(key);
  const def = weaponDef(id);
  const L = def.look.mk[m - 1];
  let geo;
  if (partName === 'tracer') geo = tracer(id, L, def);
  else {
    switch (id) {
      case 'emberstorm': geo = ember(L, m, low); break;
      case 'glacier': geo = glacier(L, m, low); break;
      case 'sugarrush': geo = sugar(L, m, def, low); break;
      case 'spectra': geo = spectra(L, m, def, low); break;
      case 'gearworks': geo = gear(L, m, partName === 'child'); break;
      case 'thunderclap': geo = thunder(L, m, def); break;
      case 'voidsiphon': geo = voidOrb(L, m); break;
      default: geo = merge([ // 'ref' and unknown ids: a plain white bolt
        part(G.capsule(0.15, 0.55, 1, 5), C(L.color), { r: ALONG, a: 0.35 }),
        part(G.capsule(0.08, 0.5, 1, 5), C(L.core), { r: ALONG, a: 1 }),
      ]);
    }
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  cache.set(key, geo);
  // the Low-quality look rides on the High geometry (bullets.sync swaps it in on Low; built now, not mid-run)
  if (!low && LOW_LOOK.has(id) && partName !== 'tracer') geo.userData.low = buildProjectileGeometry(id, m, partName, 'low');
  if (!low && partName !== 'tracer' && LOW_KEEP[id]) geo.userData.lowKeep = LOW_KEEP[id];
  return geo;
}

/** Weapons whose bullets have a lighter Low look (fewer / smaller translucent shells; SPEC2 §6.9 Low variants). */
const LOW_LOOK = new Set(['emberstorm', 'glacier', 'sugarrush', 'spectra']);
/**
 * Share of the Low-drawn (`show`) bullets of a style that bullets.sync still draws on Low, for the big translucent
 * styles (flame wall, candy bombs, long beams, saw gears). Stable per bullet (b.lod), so nothing flickers.
 */
const LOW_KEEP = { emberstorm: 0.75, sugarrush: 0.75, spectra: 0.65, gearworks: 0.8 };

/** Triangle count of a geometry (tests / budgets). */
export function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
