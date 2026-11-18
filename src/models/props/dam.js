// Road dam (update 3 road object): a wooden water tank held back by a little stone dam wall on a ledge
// beside one lane, with a chute toward the road closed by a red sluice gate (the target). Shot open, the
// chute pours a flood down the lane: a scrolling water sheet with a foam crest at its front.
// buildDam(side) -> { group, body, gate (flash material), jet, flood, crest, tag, side }.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { once, propMaterial, flashMaterial, ledgeParts, hpTag } from './common.js';
import { ROAD_HALF } from '../../config.js';

export const DAM = { chuteX: ROAD_HALF - 0.55, chuteY: 1.55 };
const WOOD = '#a86d36', WOOD_D = '#7a4a22', STONE = '#a4adbd', STONE_D = '#737b8e', WATER = '#3cb4ff';

function bodyGeometry(side) {
  const bx = side * 6.35;
  const parts = ledgeParts(side, 3.0, 3.6);
  // stone dam wall (front + back), the water held between them in the tank
  for (const z of [-1.35, 1.35]) parts.push(part(G.box(2.4, 1.3, 0.4), STONE, { p: [bx, 0.65, z] }));
  for (let i = 0; i < 4; i++) parts.push(part(G.box(0.5, 0.2, 0.42), STONE_D, { p: [bx - 0.9 + i * 0.6, 1.36, 1.35] }));
  // tank: wooden staves + iron hoops, water on top
  const r = 1.05, h = 2.0, y0 = 0.9;
  parts.push(part(G.cyl(r, r * 1.04, h, 14), WOOD, { p: [bx, y0 + h / 2, 0] }));
  for (const y of [0.35, 1.0, 1.65]) parts.push(part(G.cyl(r + 0.05, r + 0.05, 0.1, 14, true), '#3d3f4a', { p: [bx, y0 + y, 0] }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(part(G.box(0.05, h, 0.06), WOOD_D, { p: [bx + Math.cos(a) * (r + 0.01), y0 + h / 2, Math.sin(a) * (r + 0.01)], r: [0, -a, 0] }));
  }
  parts.push(part(G.cyl(r * 0.95, r * 0.95, 0.06, 14), WATER, { p: [bx, y0 + h - 0.08, 0] }));
  parts.push(part(G.cone(r * 1.15, 0.7, 14), '#c0453a', { p: [bx, y0 + h + 0.55, 0] }));
  // water drop sign on the front
  parts.push(part(G.sphere(0.24, 10, 8), '#ffffff', { p: [bx, y0 + 1.0, r + 0.05], s: [1, 1, 0.3] }));
  parts.push(part(G.cone(0.2, 0.32, 10), '#ffffff', { p: [bx, y0 + 1.27, r + 0.05], s: [1, 1, 0.3] }));
  parts.push(part(G.sphere(0.15, 10, 8), WATER, { p: [bx, y0 + 0.98, r + 0.11], s: [1, 1, 0.3] }));
  // chute from the tank to the road edge (a wooden trough)
  const x0 = bx - side * 0.7, x1 = side * DAM.chuteX, len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
  parts.push(part(G.box(len, 0.12, 0.9), WOOD_D, { p: [mid, DAM.chuteY - 0.25, 0] }));
  for (const z of [-0.45, 0.45]) parts.push(part(G.box(len, 0.4, 0.1), WOOD, { p: [mid, DAM.chuteY - 0.05, z] }));
  parts.push(part(G.box(0.18, DAM.chuteY, 0.18), WOOD_D, { p: [x1 + side * 0.4, DAM.chuteY / 2 - 0.2, 0.35] }));
  return merge(parts);
}

/** Red sluice gate with a valve wheel, closing the chute mouth (local origin = the mouth). */
function gateGeometry() {
  return once('damGate', () => merge([
    part(G.box(0.16, 0.9, 1.05), '#e23b3b', { p: [0, 0, 0] }),
    part(G.box(0.2, 0.12, 1.1), '#ffd34d', { p: [0, 0.4, 0] }),
    part(G.box(0.2, 0.12, 1.1), '#ffd34d', { p: [0, -0.4, 0] }),
    part(G.torus(0.3, 0.06, 5, 12), '#3d3f4a', { p: [0, 0.05, 0.6] }),
    part(G.box(0.05, 0.6, 0.05), '#3d3f4a', { p: [0, 0.05, 0.6] }),
    part(G.box(0.6, 0.05, 0.05), '#3d3f4a', { p: [0, 0.05, 0.6] }),
  ]));
}

export function waterTexture() {
  return once('damWater', () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, '#9fe6ff'); grd.addColorStop(0.2, '#3cb4ff'); grd.addColorStop(0.8, '#2a98ef'); grd.addColorStop(1, '#9fe6ff');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 128);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = i * 18 + 4, x = (i * 23) % 40 + 6;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y + 5, x + 18, y); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export const waterMaterial = () => once('damWaterMat', () => new THREE.MeshBasicMaterial({ map: waterTexture(), transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false }));
const crestMaterial = () => once('damCrest', () => new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0.92, toneMapped: false }));

export function buildDam(side, laneW) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(once('damBody' + side, () => bodyGeometry(side)), propMaterial());
  group.add(body);
  const gate = new THREE.Mesh(gateGeometry(), flashMaterial());
  gate.position.set(side * (DAM.chuteX + 0.05), DAM.chuteY, 0);
  group.add(gate);
  // pouring jet from the chute mouth down to the road (scaled in y when it runs)
  const jet = new THREE.Mesh(once('damJet', () => new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0)), waterMaterial());
  jet.position.set(side * (DAM.chuteX - 0.3), DAM.chuteY, 0.01);
  jet.scale.set(0.95, DAM.chuteY, 1);
  jet.visible = false;
  group.add(jet);
  // flood sheet: lies on the lane, grows toward the squad (+z) from the dam (origin at its far edge)
  const flood = new THREE.Mesh(once('damFlood', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)), waterMaterial());
  flood.position.set(0, 0.09, 0);
  flood.scale.set(laneW, 1, 0.01);
  flood.renderOrder = 2;
  flood.visible = false;
  group.add(flood);
  const crest = new THREE.Mesh(once('damCrestGeo', () => new THREE.CylinderGeometry(0.42, 0.42, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), crestMaterial());
  crest.scale.set(laneW, 1, 1);
  crest.visible = false;
  group.add(crest);
  const tag = hpTag(1.25);
  tag.mesh.position.set(side * 6.35, 2.3, 1.15);
  group.add(tag.mesh);
  return { group, body, gate, jet, flood, crest, tag, side };
}
