// Barrel: red metal drum with a white HP band (number label in front) and floating reward displays.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial, glowTexture } from './materials.js';
import { createLabel, labelMesh } from './labels.js';
import { buildRaiderGeometry } from './raider.js';
import { buildGunGeometry } from './weapons/guns.js';
import { buildDroneGeometry, buildRotorGeometry, buildTurretGeometry, buildCannonGeometry } from './helpers.js';
import { weaponDef } from '../data/weapons.js';
import { buildPowerToken, POWER_STYLE } from './pickups.js';

export const BARREL_R = 0.82, BARREL_H = 1.8;

let barrelGeo = null;
function barrelGeometry() {
  if (barrelGeo) return barrelGeo;
  const r = BARREL_R, h = BARREL_H;
  const red = '#ff3b4e', redDark = '#c81f35', rib = '#a3162a', lid = '#ff6b78';
  barrelGeo = merge([
    part(G.cyl(r, r, h, 16), red, { p: [0, h / 2, 0] }),
    part(G.cyl(r * 0.98, r * 0.92, 0.12, 16), redDark, { p: [0, 0.06, 0] }),
    part(G.cyl(r + 0.03, r + 0.03, 0.09, 16, true), rib, { p: [0, 0.2, 0] }),
    part(G.cyl(r + 0.03, r + 0.03, 0.09, 16, true), rib, { p: [0, h - 0.2, 0] }),
    // white HP band
    part(G.cyl(r + 0.015, r + 0.015, 0.62, 18, true), '#ffffff', { p: [0, h * 0.5, 0] }),
    // lid + cap
    part(G.cyl(r * 0.92, r * 0.92, 0.04, 16), lid, { p: [0, h + 0.01, 0] }),
    part(G.cyl(0.13, 0.13, 0.08, 8), '#ffd34d', { p: [0.3, h + 0.05, 0.1] }),
    // hazard stripes on the lower band
    part(G.box(0.12, 0.18, 0.02), '#ffd34d', { p: [-0.28, 0.42, r - 0.05], r: [0, 0.4, 0.5] }),
    part(G.box(0.12, 0.18, 0.02), '#ffd34d', { p: [0.28, 0.42, r - 0.05], r: [0, -0.4, 0.5] }),
  ]);
  return barrelGeo;
}

export function buildBarrelVisual() {
  const group = new THREE.Group();
  const mat = toonMaterial({ emissive: '#ffffff', emissiveIntensity: 0 });
  const body = new THREE.Mesh(barrelGeometry(), mat);
  body.castShadow = true;
  group.add(body);
  const label = createLabel(256, 128);
  const lm = labelMesh(label, 1.55, 1.55 * (128 / 256));
  lm.position.set(0, BARREL_H * 0.5, BARREL_R + 0.06);
  group.add(lm);
  const reward = new THREE.Group();
  reward.position.set(0, BARREL_H + 1.3, 0);
  group.add(reward);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
  glow.scale.set(2.8, 2.8, 1);
  glow.renderOrder = 3;
  reward.add(glow);
  return { group, body, mat, label, labelMesh: lm, reward, glow, display: null };
}

// ---------------- reward displays (pooled per kind/tier key) ----------------
const shared = {};
function sharedMat(key, make) { return shared[key] || (shared[key] = make()); }

/**
 * Builds a floating reward display. kind: weapon|troops|drone|turret|coins|<power>. For 'weapon', gun =
 * { weapon, mk }: the current weapon's gun at the Mk the barrel grants (a number = Mk of the default weapon).
 */
export function buildRewardDisplay(kind, amount, gun = {}) {
  const root = new THREE.Group();
  let glowColor = '#ffffff';
  if (kind === 'weapon') {
    const wid = (gun && gun.weapon) || 'thunderclap', mk = typeof gun === 'number' ? gun : (gun && gun.mk) || 2;
    const color = weaponDef(wid).look.mk[Math.max(1, Math.min(5, mk)) - 1].color;
    const w = { color };
    const m = new THREE.MeshToonMaterial({ gradientMap: toonMaterial().gradientMap, vertexColors: true, color: w.color, emissive: w.color, emissiveIntensity: 0.35 });
    const geo = buildGunGeometry(wid, mk).clone();
    geo.center();
    const gun3 = new THREE.Mesh(geo, m);
    gun3.scale.setScalar(3.2);
    gun3.rotation.y = Math.PI / 2;
    root.add(gun3);
    // 'MK UP' badge (drawn by barrels.js): a gun model alone read as a thin stick next to the drone reward
    const lab = createLabel(256, 128);
    const lm = labelMesh(lab, 1.25, 0.62);
    lm.position.set(0, 0.78, 0.05);
    root.add(lm);
    root.userData.label = lab;
    root.userData.labelMesh = lm;
    glowColor = w.color;
  } else if (kind === 'troops') {
    const m = sharedMat('raider', () => toonMaterial());
    const mini = new THREE.Mesh(buildRaiderGeometry(), m);
    mini.scale.setScalar(1.15);
    mini.position.set(0, -0.55, 0);
    mini.rotation.y = Math.PI;
    root.add(mini);
    const lab = createLabel(256, 128);
    const lm = labelMesh(lab, 1.3, 0.65);
    lm.position.set(0, 0.55, 0.05);
    root.add(lm);
    root.userData.label = lab;
    root.userData.labelMesh = lm;
    glowColor = '#59c1ff';
  } else if (kind === 'drone') {
    const m = sharedMat('helper', () => toonMaterial());
    const d = new THREE.Mesh(buildDroneGeometry(), m);
    d.scale.setScalar(1.7);
    const rotor = new THREE.Mesh(buildRotorGeometry(), sharedMat('rotor', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
    d.add(rotor);
    root.add(d);
    root.userData.rotor = rotor;
    glowColor = '#45ff7a';
  } else if (kind === 'turret') {
    const m = sharedMat('helper', () => toonMaterial());
    const t = new THREE.Mesh(buildTurretGeometry(), m);
    const c = new THREE.Mesh(buildCannonGeometry(), m);
    c.position.set(0, 0.6, -0.05);
    t.add(c);
    t.scale.setScalar(1.15);
    t.position.y = -0.55;
    root.add(t);
    glowColor = '#ff9a3d';
  } else if (kind === 'coins') {
    const m = sharedMat('coin', () => new THREE.MeshToonMaterial({ gradientMap: toonMaterial().gradientMap, vertexColors: true, emissive: '#ffb000', emissiveIntensity: 0.25 }));
    const coin = (x, y, z, rx, rz) => part(G.cyl(0.28, 0.28, 0.08, 14), '#ffc531', { p: [x, y, z], r: [rx, 0, rz] });
    const rim = (x, y, z, rx, rz) => part(G.cyl(0.17, 0.17, 0.09, 10), '#ffe27a', { p: [x, y, z], r: [rx, 0, rz] });
    const pile = new THREE.Mesh(merge([
      coin(0, -0.5, 0, 0, 0), coin(0.05, -0.41, 0.02, 0, 0), coin(-0.03, -0.32, -0.01, 0, 0),
      coin(0.42, -0.42, 0.1, 0.4, 0.3), coin(-0.4, -0.45, -0.05, -0.2, -0.4),
      coin(0, 0.12, 0, Math.PI / 2, 0), rim(0, 0.12, 0.0, Math.PI / 2, 0),
    ]), m);
    root.add(pile);
    glowColor = '#ffc531';
  } else if (kind === 'bridge') {
    // shoot-to-build bridge: a little stack of planks on two rails
    const m = sharedMat('bridge', () => toonMaterial());
    const parts = [
      part(G.box(1.25, 0.08, 0.1), '#8a5a2b', { p: [0, -0.34, -0.3] }),
      part(G.box(1.25, 0.08, 0.1), '#8a5a2b', { p: [0, -0.34, 0.3] }),
    ];
    for (let i = 0; i < 5; i++) parts.push(part(G.box(0.2, 0.09, 0.86), i % 2 ? '#f2c26b' : '#ffd98a', { p: [-0.5 + i * 0.25, -0.25, 0], r: [0, (i - 2) * 0.03, 0] }));
    parts.push(part(G.cone(0.22, 0.34, 4), '#59c1ff', { p: [0, 0.22, 0], r: [0, Math.PI / 4, 0], bright: 1.15 }));
    parts.push(part(G.box(0.14, 0.3, 0.14), '#59c1ff', { p: [0, -0.02, 0], bright: 1.15 }));
    const planks = new THREE.Mesh(merge(parts), m);
    planks.scale.setScalar(1.15);
    root.add(planks);
    glowColor = '#ffd34d';
  } else {
    // power kinds: the same icon token as the road pickups (no ground pillar)
    const tok = buildPowerToken(POWER_STYLE[kind] ? kind : 'shield', { ground: false });
    tok.halo.visible = false; // the barrel's reward glow already sits behind it
    tok.root.scale.setScalar(0.8);
    root.add(tok.root);
    glowColor = (POWER_STYLE[kind] || POWER_STYLE.shield).glow;
  }
  root.scale.setScalar(1.45);
  root.userData.glowColor = glowColor;
  root.userData.kind = kind;
  return root;
}
