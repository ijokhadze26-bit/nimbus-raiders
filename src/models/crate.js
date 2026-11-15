// Weapon crate (SPEC2 §2.10): a toon-framed glass crate in the weapon's colour with the weapon's Mk I gun
// spinning inside, a weapon-coloured ground ring and a floating label with the short name. Three draw calls:
//   frame  toon (navy bars; material tinted toward the weapon colour)
//   gun    toon, the weapon's Mk I gun x3 (cached per weapon), spinning + bobbing
//   shell  one MeshBasic with the label canvas as its map: glass box + ground ring sample a white texel
//          block in the canvas corner, the label quad samples the text (material colour = weapon colour)
// <= 300 triangles. Contract: buildCrate(weaponId) -> { root, setWeapon(id), update(t, crate) }; pooled by
// game/crates.js (max 2 alive) and registered for warm-up.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial } from './materials.js';
import { createLabel, drawLabel } from './labels.js';
import { weaponDef } from '../data/weapons.js';
import { buildGunGeometry } from './weapons/guns.js';
import { registerWarm } from '../game/warmup.js';

const S = 1.3, NAVY = '#1b3a8a';
const WU = 0.985, WV = 0.04; // white texel block (canvas bottom-right corner) in uv space
let frameGeo = null, shellGeo = null;
const gunGeos = new Map();
const _c = new THREE.Color();

function setUv(g, u, v) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return g; }

function geos() {
  if (frameGeo) return;
  const h = S / 2, t = 0.1, bars = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bars.push(part(G.box(t, S, t), NAVY, { p: [sx * h, 0.95, sz * h] }));
  for (const y of [0.95 - h, 0.95 + h]) {
    for (const s of [-1, 1]) {
      bars.push(part(G.box(S + t, t, t), NAVY, { p: [0, y, s * h] }));
      bars.push(part(G.box(t, t, S + t), NAVY, { p: [s * h, y, 0] }));
    }
  }
  frameGeo = merge(bars);
  const glass = setUv(new THREE.BoxGeometry(S - 0.04, S - 0.04, S - 0.04), WU, WV);
  part(glass, '#ffffff', { p: [0, 0.95, 0], a: 0.26, keepUv: true });
  const ring = setUv(new THREE.RingGeometry(1.05, 1.42, 18), WU, WV);
  part(ring, '#ffffff', { p: [0, 0.04, 0], r: [-Math.PI / 2, 0, 0], a: 0.75, keepUv: true });
  const label = new THREE.PlaneGeometry(1.9, 0.62);
  const uv = label.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.94, 0.12 + uv.getY(i) * 0.88);
  part(label, '#ffffff', { p: [0, 2.15, 0.2], a: 1, keepUv: true });
  shellGeo = merge([glass, ring, label]);
}

function gunGeo(id) {
  if (!gunGeos.has(id)) {
    const g = buildGunGeometry(id, 1).clone();
    g.center();
    gunGeos.set(id, g);
  }
  return gunGeos.get(id);
}

function drawName(label, id) {
  const def = weaponDef(id);
  drawLabel(label, def.short || def.name, {
    fill: '#ffffff', stroke: '#0e2a66', size: 74, strokeWidth: 13, y: 0.46, maxWidth: 0.9, shadow: false,
    after: (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(w - 16, h - 16, 16, 16); },
  });
}

export function buildCrate(weaponId) {
  geos();
  const root = new THREE.Group();
  const frameMat = toonMaterial({ emissive: '#ffffff', emissiveIntensity: 0.12 });
  const gunMat = toonMaterial({ emissive: '#ffffff', emissiveIntensity: 0.35 });
  const label = createLabel(256, 128);
  const shellMat = new THREE.MeshBasicMaterial({ map: label.texture, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  const gun = new THREE.Mesh(gunGeo(weaponId), gunMat);
  gun.position.y = 0.95;
  gun.scale.setScalar(3);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.renderOrder = 5;
  root.add(frame, gun, shell);
  const crate = {
    root, frame, gun, shell, label, weapon: null,
    setWeapon(id) {
      if (id === crate.weapon) return;
      crate.weapon = id;
      const def = weaponDef(id);
      const c = def.look.mk[0].color, tint = (def.gunTint && def.gunTint[0]) || c;
      frameMat.color.set('#ffffff').lerp(_c.set(c), 0.45); frameMat.emissive.set(c);
      gunMat.color.set(tint); gunMat.emissive.set(tint);
      shellMat.color.set(c);
      gun.geometry = gunGeo(id);
      drawName(label, id);
    },
    update(t, c) {
      const k = c && c.state === 'taken' ? 4 : 1;
      gun.rotation.y = t * 1.8 * k;
      gun.position.y = 0.95 + Math.sin(t * 2.6) * 0.1;
      frameMat.emissiveIntensity = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 4));
    },
  };
  crate.setWeapon(weaponId);
  return crate;
}

/** Triangles of one crate (tests: <= 300). */
export function crateTris(id = 'thunderclap') {
  geos();
  const t = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return t(frameGeo) + t(shellGeo) + t(gunGeo(id));
}

registerWarm(() => buildCrate('thunderclap').root);
