// 3D preview windows for the info pages (SPEC2 §5 "3D preview rendering", phone-safe, binding):
// - ONE WebGLRenderer: each preview is an engine overlay fn(renderer) that sets scissor + viewport to a cached
//   rect (measured from layout offsets, so the 340 ms enter scale never skews it; re-measured on resize, never
//   per frame), renders its own small scene / camera, then always restores scissor-test off + the full viewport.
// - The page DOM is opaque except the preview window (a transparent hole over the canvas); the window keeps a
//   CSS backdrop until the first preview frame is drawn (class 'live').
// - Own Hemisphere + one Directional light (no shadows), warmed with compileAsync on open; Low quality uses
//   low-LOD rigs and the pixel ratio already in force; locked items render through a silhouette override.
// - Everything per item (rig, gun, dummies, turret) is disposed in hide() / on item change; FX pools and the
//   pedestal live as long as the preview object (no allocation per frame).
// Contract: createPreview(ui) -> { show(rectEl, item), set(item), hide(), dispose(), suspend(on), stats }.
// item = { kind: 'weapon', id, mk, locked } | { kind: 'hero', id, weapon, mk, locked } | { kind: 'loadout', hero, weapon }
import * as THREE from 'three';
import { toonMaterial } from '../models/materials.js';
import { part, merge, G } from '../models/util.js';
import { buildHero } from '../models/heroes/index.js';
import { buildHeroGunGeometry } from '../models/weapons/guns.js';
import { buildProjectileGeometry } from '../models/weapons/projectiles.js';
import { buildMurklingGeometry } from '../models/murklings.js';
import { weaponDef, MK_SCALE } from '../data/weapons.js';
import { heroDef } from '../data/heroes.js';
import { paintColor, heroLook } from '../game/skins.js';
import { createDemo } from './previewdemo.js';

const SPIN = 0.35;           // turntable rad/s
const BG = '#a9dcff';
const MK_GLOW = [0.25, 0.3, 0.4, 0.45, 0.6];
const CAP = { spark: 72, ring: 12, arc: 40, disc: 10, proj: 24 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color(), _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _box = new THREE.Box3();
const _e = new THREE.Euler();

let silhouetteMat = null;
let sharedGeo = null;
function shared() {
  if (sharedGeo) return sharedGeo;
  const ring = new THREE.RingGeometry(0.86, 1, 40); ring.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 28); disc.rotateX(-Math.PI / 2);
  const arc = new THREE.BoxGeometry(1, 1, 1); arc.translate(0, 0, 0.5);
  sharedGeo = {
    spark: new THREE.OctahedronGeometry(1, 0), ring, disc, arc,
    pedestal: merge([
      part(G.cyl(3.0, 3.2, 0.32, 40), '#f4fbff', { p: [0, -0.16, 0] }),
      part(G.cyl(3.22, 3.22, 0.1, 40), '#2f8cff', { p: [0, -0.3, 0] }),
      part(G.torus(2.95, 0.06, 4, 48), '#ffc531', { p: [0, 0.01, 0], r: [Math.PI / 2, 0, 0] }),
      part(G.cyl(1.2, 1.2, 0.02, 32), '#d8efff', { p: [0, 0.005, 0] }),
    ]),
    stand: merge([
      part(G.cyl(0.08, 0.12, 0.9, 8), '#4b5672', { p: [0, 0.45, 0] }),
      part(G.cyl(0.34, 0.42, 0.12, 16), '#2148b8', { p: [0, 0.06, 0] }),
    ]),
    grunt: buildMurklingGeometry('grunt'),
  };
  return sharedGeo;
}

function instanced(geo, mat, cap, color = true) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.frustumCulled = false;
  m.count = 0;
  if (color) m.setColorAt(0, _c.set('#ffffff'));
  return m;
}

export function createPreview(ui) {
  const engine = ui.game.engine;
  const P = { stats: { calls: 0, tris: 0, frames: 0 }, item: null, ready: false, shown: false };
  let scene = null, cam = null, table = null, pools = null, content = null, demo = null;
  let el = null, rect = { x: 0, y: 0, w: 1, h: 1 }, last = 0, t = 0, suspended = false, token = 0, liveSet = false;

  function build() {
    const g = shared();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 400, 900); // same USE_FOG define as the main scene, no visible effect
    scene.add(new THREE.HemisphereLight('#ffffff', '#9cc2ee', 2));
    const sun = new THREE.DirectionalLight('#fff6e3', 2);
    sun.position.set(3, 7, 5);
    sun.castShadow = false;
    scene.add(sun);
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    table = new THREE.Group();
    scene.add(table);
    const ped = new THREE.Mesh(g.pedestal, toonMaterial());
    table.add(ped);
    const add = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const norm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, fog: false });
    const bullet = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    pools = {
      ped, add, norm,
      spark: { mesh: instanced(g.spark, add, CAP.spark), list: [] },
      ring: { mesh: instanced(g.ring, add, CAP.ring), list: [] },
      arc: { mesh: instanced(g.arc, add, CAP.arc), list: [] },
      disc: { mesh: instanced(g.disc, norm, CAP.disc), list: [] },
      main: { mesh: instanced(g.spark, bullet(), CAP.proj, false), list: [] },
      child: { mesh: instanced(g.spark, bullet(), CAP.proj, false), list: [] },
    };
    pools.disc.mesh.renderOrder = 1;
    for (const k of ['spark', 'ring', 'arc', 'disc', 'main', 'child']) { pools[k].mesh.renderOrder = pools[k].mesh.renderOrder || 4; table.add(pools[k].mesh); }
    if (!silhouetteMat) silhouetteMat = new THREE.MeshBasicMaterial({ color: '#1b3a8a', fog: false });
  }

  // ---------------- FX api (turntable-local coordinates) ----------------
  const low = () => engine.quality === 'low';
  const n = (x) => (x < 1 ? x : Math.max(1, Math.round(low() ? x * 0.5 : x))); // Low halves, never to zero
  const push = (pool, o) => { if (pool.list.length >= pool.mesh.instanceMatrix.count) pool.list.shift(); pool.list.push(o); return o; };
  const fx = {
    n,
    spark(x, y, z, vx, vy, vz, color, size = 0.08, life = 0.5, grav = 0) {
      return push(pools.spark, { x, y, z, vx, vy, vz, c: color, size, life, max: life, g: grav });
    },
    burst(x, y, z, count, color, speed = 2, size = 0.07, life = 0.45, up = 0.5) {
      for (let i = 0, k = n(count); i < k; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
        fx.spark(x, y, z, Math.cos(a) * s, up * speed * Math.random(), Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.5), 3);
      }
    },
    ring(x, y, z, r0, r1, color, life = 0.5, w = 1) { return push(pools.ring, { x, y, z, r0, r1, c: color, life, max: life, w }); },
    arc(ax, ay, az, bx, by, bz, color, width = 0.05, life = 0.12) { return push(pools.arc, { ax, ay, az, bx, by, bz, c: color, w: width, life, max: life }); },
    /** Jagged lightning between two points (segments of the arc pool). */
    zap(ax, ay, az, bx, by, bz, color, width = 0.05, life = 0.12, segs = 4, jag = 0.25) {
      let px = ax, py = ay, pz = az;
      for (let i = 1; i <= segs; i++) {
        const k = i / segs, j = i === segs ? 0 : jag;
        const qx = ax + (bx - ax) * k + (Math.random() - 0.5) * j * 2, qy = ay + (by - ay) * k + (Math.random() - 0.5) * j, qz = az + (bz - az) * k + (Math.random() - 0.5) * j * 2;
        fx.arc(px, py, pz, qx, qy, qz, color, width, life);
        px = qx; py = qy; pz = qz;
      }
    },
    disc(x, z, r, color, life = 1, opts = {}) { return push(pools.disc, { x, z, r, c: color, life, max: life, y: opts.y ?? 0.02, grow: opts.grow ?? 0, fade: opts.fade ?? 0.3, spin: opts.spin || 0 }); },
    /** Projectile of the item's weapon: part 'main' | 'child'. Fields the demo may change: vx vy vz g sx sy sz roll spin life. */
    proj(partName, x, y, z, vx, vy, vz, opts = {}) {
      const pool = partName === 'child' ? pools.child : pools.main;
      return push(pool, { x, y, z, vx, vy, vz, g: opts.g || 0, s: opts.s ?? 1, sx: opts.sx ?? 1, sy: opts.sy ?? 1, sz: opts.sz ?? 1, roll: 0, spin: opts.spin || 0, life: opts.life ?? 2, age: 0, hits: 0, data: opts.data ?? 0, dead: false });
    },
  };

  function stepPools(dt) {
    const S = pools.spark;
    for (let i = S.list.length - 1; i >= 0; i--) {
      const o = S.list[i];
      o.life -= dt;
      if (o.life <= 0) { S.list.splice(i, 1); continue; }
      o.vy -= o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    }
    for (const k of ['ring', 'arc', 'disc']) {
      const L = pools[k].list;
      for (let i = L.length - 1; i >= 0; i--) { L[i].life -= dt; if (L[i].life <= 0) L.splice(i, 1); }
    }
    for (const k of ['main', 'child']) {
      const L = pools[k].list;
      for (let i = L.length - 1; i >= 0; i--) {
        const o = L[i];
        o.age += dt;
        o.vy -= o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.roll += o.spin * dt;
        if (o.dead || o.age > o.life) L.splice(i, 1);
      }
    }
  }

  function writePools() {
    let m = pools.spark.mesh, L = pools.spark.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i], k = Math.min(1, o.life / (o.max * 0.6));
      _m.makeScale(o.size * k, o.size * k, o.size * k).setPosition(o.x, o.y, o.z);
      m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(o.c));
    }
    flush(m, L.length);
    m = pools.ring.mesh; L = pools.ring.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i], u = 1 - o.life / o.max, r = o.r0 + (o.r1 - o.r0) * (1 - (1 - u) * (1 - u));
      _m.makeScale(r, 1, r).setPosition(o.x, o.y, o.z);
      m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(o.c).multiplyScalar(1 - u));
    }
    flush(m, L.length);
    m = pools.arc.mesh; L = pools.arc.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      _d.set(o.bx - o.ax, o.by - o.ay, o.bz - o.az);
      const len = _d.length() || 0.001;
      _q.setFromUnitVectors(_z, _d.multiplyScalar(1 / len));
      _m.compose(_p.set(o.ax, o.ay, o.az), _q, _s.set(o.w, o.w, len));
      m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(o.c).multiplyScalar(Math.min(1, o.life / o.max + 0.3)));
    }
    flush(m, L.length);
    m = pools.disc.mesh; L = pools.disc.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i], u = 1 - o.life / o.max, fade = o.fade > 0 ? Math.min(1, (o.life / o.max) / o.fade) : 1;
      const r = o.r * (o.grow ? Math.min(1, u / o.grow) : 1) * (0.4 + 0.6 * fade);
      _q.setFromEuler(_e.set(0, o.spin * u * 6, 0));
      _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(r, 1, r));
      m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(o.c));
    }
    flush(m, L.length);
    for (const k of ['main', 'child']) {
      m = pools[k].mesh; L = pools[k].list;
      for (let i = 0; i < L.length; i++) {
        const o = L[i];
        _q.setFromEuler(_e.set(o.spin ? 0 : Math.atan2(o.vy, Math.hypot(o.vx, o.vz)), Math.atan2(-o.vx, -o.vz), o.roll, 'YXZ'));
        _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(o.s * o.sx, o.s * o.sy, o.s * o.sz));
        m.setMatrixAt(i, _m);
      }
      flush(m, L.length);
    }
  }
  function flush(m, count) {
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---------------- content ----------------
  function gunMesh(weaponId, mk) {
    const mat = toonMaterial({ color: paintColor('factory', weaponId, mk), emissive: '#ffffff', emissiveIntensity: MK_GLOW[mk - 1] * 0.35 });
    const mesh = new THREE.Mesh(buildHeroGunGeometry(weaponId, mk), mat);
    return { mesh, mat };
  }

  function buildContent(item) {
    const g = shared();
    const lod = low() ? 'low' : 'high';
    const c = { root: new THREE.Group(), mats: [], rig: null, dummies: [], gun: null, gunPivot: null, muzzle: new THREE.Vector3(), extra: [] };
    table.add(c.root);
    if (item.kind === 'weapon') {
      const def = weaponDef(item.id), mk = item.mk || 3;
      const stand = new THREE.Mesh(g.stand, toonMaterial());
      stand.position.set(0, 0, 1.5);
      c.mats.push(stand.material);
      c.root.add(stand);
      c.stand = stand;
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.9, 1.5);
      const { mesh, mat } = gunMesh(def.id, mk);
      mesh.rotation.x = Math.PI / 2;
      mesh.scale.setScalar(2.9 * MK_SCALE[mk - 1] ** 0.5);
      pivot.add(mesh);
      c.root.add(pivot);
      c.mats.push(mat);
      c.gun = mesh; c.gunPivot = pivot;
      // sit the gun's box on the stand (bottom centre at the pivot); muzzle = the front (-Z) end, centre height
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      mesh.updateMatrix();
      _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrix);
      const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2;
      mesh.position.set(-cx, -_box.min.y, -cz);
      c.muzzle.set(0, (_box.max.y - _box.min.y) / 2, _box.min.z - cz).add(pivot.position);
      const column = def.preview && def.preview.pattern === 'pierce';
      const spots = column ? [[0, -0.6], [0, -1.7], [0, -2.8]] : [[-1.25, -1.5], [0.1, -2.3], [1.3, -1.3]];
      for (const [x, z] of spots) {
        const mat = toonMaterial({ emissive: '#ffffff', emissiveIntensity: 0 });
        const mesh = new THREE.Mesh(g.grunt, mat);
        mesh.scale.setScalar(1.5);
        mesh.position.set(x, 0, z);
        c.root.add(mesh);
        c.mats.push(mat);
        c.dummies.push({ mesh, mat, hx: x, hz: z, x, z, flash: 0, squash: 0, ice: 0, burn: 0, lean: 0, lx: 0, lz: 0 });
      }
    } else {
      const heroId = item.kind === 'loadout' ? item.hero : item.id;
      const def = heroDef(heroId);
      const outfit = heroId === 'pip' ? heroLook(ui.save?.data?.skins?.hero || 'classic') : null;
      const rig = buildHero(heroId, { lod, outfit: outfit && outfit.pip ? { ...outfit.pip, glow: outfit.glow } : {} });
      const weapon = item.weapon || def.favourite, mk = item.mk || 3;
      rig.gun.geometry = buildHeroGunGeometry(weapon, mk);
      rig.gunMat.color.set(paintColor(ui.save?.data?.skins?.weapon || 'factory', weapon, mk));
      if (rig.gunMat.emissive) rig.gunMat.emissiveIntensity = MK_GLOW[mk - 1] * 0.5;
      rig.root.rotation.y = 0;
      c.root.add(rig.root);
      c.rig = rig;
      rig.root.updateMatrixWorld(true);
      const s = rig.scale || rig.root.scale.x, m = rig.muzzle || { x: 0.25, y: 0.72, z: -0.6 };
      c.muzzle.set(m.x * s, m.y * s, m.z * s);
    }
    return c;
  }

  function disposeContent() {
    if (demo) { demo.dispose(); demo = null; }
    if (!content) return;
    table.remove(content.root);
    if (content.rig) content.rig.dispose?.();
    for (const m of content.mats) m.dispose();
    for (const e of content.extra) e.dispose?.();
    content = null;
    for (const k of ['spark', 'ring', 'arc', 'disc', 'main', 'child']) { pools[k].list.length = 0; pools[k].mesh.count = 0; }
  }

  function applyItem(item) {
    disposeContent();
    P.item = item;
    content = buildContent(item);
    const weaponId = item.kind === 'weapon' ? item.id : item.weapon || heroDef(item.kind === 'loadout' ? item.hero : item.id).favourite;
    const mk = item.mk || 3;
    pools.main.mesh.geometry = buildProjectileGeometry(weaponId, mk, 'main');
    pools.child.mesh.geometry = buildProjectileGeometry(weaponId, mk, 'child');
    const locked = !!item.locked;
    scene.overrideMaterial = locked ? silhouetteMat : null;
    pools.ped.visible = !locked; // the item's own shape reads as the silhouette against the sky
    if (content.stand) content.stand.visible = !locked;
    for (const k of ['spark', 'ring', 'arc', 'disc', 'main', 'child']) pools[k].mesh.visible = !locked;
    if (content.rig) content.rig.root.traverse((o) => { if (o.isSprite || (o.material && o.material.blending === THREE.AdditiveBlending)) o.visible = !locked; });
    const hero = item.kind !== 'weapon';
    const tall = hero ? (content.rig.scale || 1.25) / 1.25 : 1;
    P.view = hero ? { y: 1.3 * tall + 0.6, dist: 4.4 + 1.9 * tall, look: 0.8 * tall } : { y: 3.4, dist: 9.4, look: 0.55 };
    table.rotation.y = hero ? Math.PI - 0.5 : -0.75;
    frame();
    demo = createDemo({ THREE, fx, item, content, R: hero ? null : dummyRig(content, fx), weapon: weaponDef(weaponId), mk, hero: hero ? heroDef(item.kind === 'loadout' ? item.hero : item.id) : null, low, ui, table,
      flash: (c) => { try { el?.animate?.([{ backgroundColor: c }, { backgroundColor: 'rgba(255,255,255,0)' }], { duration: 550, easing: 'ease-out' }); } catch { /* optional */ } } });
    t = 0;
  }

  function frame() {
    if (!cam || !P.view) return;
    const a = rect.w / Math.max(1, rect.h), v = P.view;
    cam.aspect = a;
    const d = v.dist / Math.min(1, a * 1.05);
    cam.position.set(0, v.y * d / v.dist, d);
    cam.lookAt(0, v.look, 0);
    cam.updateProjectionMatrix();
  }

  // ---------------- overlay ----------------
  function measure() {
    if (!el || !el.isConnected) return;
    const root = ui.root;
    let x = 0, y = 0, n2 = el;
    while (n2 && n2 !== root && n2 !== document.body) { x += n2.offsetLeft; y += n2.offsetTop; n2 = n2.offsetParent; }
    rect = { x, y, w: el.offsetWidth, h: el.offsetHeight };
    frame();
  }

  const overlay = (renderer) => {
    if (!P.shown || suspended || !P.ready || rect.w < 4 || rect.h < 4) return;
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    table.rotation.y += SPIN * dt;
    if (demo) demo.update(dt, t);
    stepPools(dt);
    writePools();
    const H = engine.height;
    const y = H - rect.y - rect.h;
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, y, rect.w, rect.h);
    renderer.setViewport(rect.x, y, rect.w, rect.h);
    try {
      renderer.render(scene, cam);
      const r = renderer.info.render;
      P.stats.calls = r.calls; P.stats.tris = r.triangles; P.stats.frames++;
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, engine.width, engine.height);
    }
    if (!liveSet && el) { liveSet = true; el.classList.add('live'); }
  };
  const onResize = () => { if (P.shown) measure(); };

  function warm() {
    const my = ++token;
    P.ready = false;
    const r = engine.renderer;
    const done = () => { if (my === token) P.ready = true; };
    try {
      if (r.compileAsync) r.compileAsync(scene, cam).then(done, done);
      else { r.compile(scene, cam); done(); }
    } catch { done(); }
  }

  P.show = (rectEl, item) => {
    if (!scene) build();
    el = rectEl;
    liveSet = false;
    el.classList.remove('live');
    P.shown = true;
    suspended = false;
    last = 0;
    measure();
    applyItem(item);
    warm();
    engine.addOverlay(overlay);
    if (!engine.onResize.includes(onResize)) engine.onResize.push(onResize);
  };
  P.set = (item) => {
    if (!P.shown) return;
    const same = P.item && JSON.stringify(P.item) === JSON.stringify(item);
    if (same) return;
    applyItem(item);
    warm();
  };
  P.measure = measure;
  P.suspend = (on) => {
    suspended = !!on;
    if (el) el.classList.toggle('live', !on && liveSet);
    last = 0;
  };
  P.hide = () => {
    if (!P.shown) return;
    P.shown = false;
    token++;
    engine.removeOverlay(overlay);
    const i = engine.onResize.indexOf(onResize);
    if (i >= 0) engine.onResize.splice(i, 1);
    disposeContent();
    if (el) el.classList.remove('live');
    el = null;
    P.item = null;
  };
  P.dispose = () => { P.hide(); };
  P.fx = fx;
  return P;
}

// ---------------- dummies + gun recoil (the weapon demos drive these through ctx.R) ----------------
const ICE = { r: 0.62, g: 0.9, b: 1 };
export function dummyRig(content, fx) {
  const D = content.dummies, pivot = content.gunPivot, baseZ = pivot ? pivot.position.z : 0;
  let kick = 0;
  const api = {
    D, fx, m: content.muzzle,
    hit(d, color = '#ffffff', n = 5) {
      d.flash = 1; d.squash = 1;
      fx.burst(d.x, 0.75, d.z, n, color, 2.2, 0.07, 0.4);
    },
    kick(k = 1) { kick = Math.min(1.5, kick + k); },
    /** First dummy within r of p not in p.hitMask. */
    touch(p, r = 0.6) {
      for (let i = 0; i < D.length; i++) {
        if (p.hits & (1 << i)) continue;
        const d = D[i], dx = p.x - d.x, dz = p.z - d.z;
        if (dx * dx + dz * dz < r * r && p.y < 1.6) return i;
      }
      return -1;
    },
    update(dt) {
      kick = Math.max(0, kick - dt * 8);
      if (pivot) pivot.position.z = baseZ + kick * 0.12;
      for (const d of D) {
        d.flash = Math.max(0, d.flash - dt * 6);
        d.squash = Math.max(0, d.squash - dt * 5);
        d.ice = Math.max(0, d.ice - dt * (d.ice > 0.5 ? 0.7 : 0.4));
        d.burn = Math.max(0, d.burn - dt);
        d.mesh.position.set(d.x, 0, d.z);
        const sq = Math.sin(d.squash * Math.PI) * 0.18;
        d.mesh.scale.set(1.5 * (1 + sq * 0.5), 1.5 * (1 - sq), 1.5 * (1 + sq * 0.5));
        d.mesh.rotation.set(d.lz * 0.5, 0, -d.lx * 0.5);
        const ice = Math.min(1, d.ice);
        d.mat.color.setRGB(1 + (ICE.r - 1) * ice, 1 + (ICE.g - 1) * ice, 1 + (ICE.b - 1) * ice);
        if (d.burn > 0) { d.mat.emissive.setRGB(1, 0.42, 0.1); d.mat.emissiveIntensity = 0.35 + 0.25 * Math.sin(d.burn * 30) + d.flash * 0.5; } else { d.mat.emissive.setRGB(1, 1, 1); d.mat.emissiveIntensity = d.flash * 0.75; }
      }
    },
    flashMuzzle(color, core, n = 4) {
      const m = content.muzzle;
      fx.burst(m.x, m.y, m.z - 0.1, n, core, 1.6, 0.06, 0.18, 0.3);
      fx.spark(m.x, m.y, m.z - 0.15, 0, 0, -0.5, color, 0.22, 0.08);
    },
  };
  return api;
}
