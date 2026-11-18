// Road boulder (update 3 road object): a big lumpy rock resting in a lane (mossy / scorched / snowy / sugary /
// storm-stone tint per world), a push arrow painted behind it, a blob shadow. The squad runs into it from behind
// and it rolls ahead crushing enemies. buildBoulder(world, low) -> { group, rock, arrow, shadow }.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { once, hash, flatPlane, decalMat } from './common.js';
import { toonMaterial, blobShadowTexture } from '../materials.js';

export const BOULDER_R = 1.2;
// rock / spot colours per world key
const TINTS = {
  sky: ['#9a8f84', '#6f9a4a'], forge: ['#4a3f3c', '#ff7a2b'], frost: ['#8ea1b5', '#f4fbff'],
  candy: ['#c98fb3', '#fff1a8'], citadel: ['#6f6a86', '#b49dff'],
};

function rockGeometry(world, low) {
  const [base, spot] = TINTS[world] || TINTS.sky;
  const g = new THREE.IcosahedronGeometry(BOULDER_R, low ? 1 : 2).toNonIndexed();
  const pos = g.attributes.position;
  // lumpy: push every vertex in or out by a hash of its (rounded) direction, so shared corners stay shut
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = hash(Math.round(x * 40) * 7.13 + Math.round(y * 40) * 3.71 + Math.round(z * 40) * 1.97);
    const f = 0.86 + 0.24 * k;
    pos.setXYZ(i, x * f, y * f * 0.94, z * f);
  }
  g.computeVertexNormals();
  const c = new THREE.Color(), cb = new THREE.Color(base), cs = new THREE.Color(spot), cd = new THREE.Color(base).multiplyScalar(0.72);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) { // per face
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const k = hash(i * 0.37 + 5);
    if (y > BOULDER_R * 0.35 && k < 0.45) c.copy(cs); else if (k > 0.78) c.copy(cd); else c.copy(cb);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

function arrowTexture() {
  return once('boulderArrow', () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 2; k++) {
      const y = 10 + k * 56;
      g.beginPath(); g.moveTo(32, y); g.lineTo(60, y + 34); g.lineTo(46, y + 34); g.lineTo(32, y + 18); g.lineTo(18, y + 34); g.lineTo(4, y + 34); g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

const rockMaterial = () => once('rockMat', () => toonMaterial({ flatShading: true }));
const shadowMaterial = () => once('rockShadow', () => new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: '#000000' }));

export function buildBoulder(world, low) {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(once(`rock${world}${low ? 'L' : ''}`, () => rockGeometry(world, low)), rockMaterial());
  rock.castShadow = !low;
  rock.position.y = BOULDER_R * 0.92;
  group.add(rock);
  const shadow = new THREE.Mesh(flatPlane(), shadowMaterial());
  shadow.scale.set(BOULDER_R * 2.6, 1, BOULDER_R * 2.6);
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;
  group.add(shadow);
  const arrow = new THREE.Mesh(flatPlane(), decalMat(arrowTexture(), { opacity: 0.9 }));
  arrow.scale.set(1.2, 1, 2.4);
  arrow.position.set(0, 0.06, BOULDER_R + 1.9);
  arrow.renderOrder = 2;
  group.add(arrow);
  return { group, rock, arrow, shadow };
}

/** Pebbles thrown up while rolling (debris colour per world). */
export const rockColor = (world) => new THREE.Color((TINTS[world] || TINTS.sky)[0]).getHex();
