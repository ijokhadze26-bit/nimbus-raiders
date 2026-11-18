// Gate colour source (update 3 stage 5 settings): the normal red / blue palette, or the COLOURBLIND one (good =
// blue + "▲" marks, bad = orange + "▼" marks + diagonal stripes on the glass) so a gate reads without colour.
// gates.js asks gatePalette(save.settings.colorblind) every frame (two frozen objects, no allocation).
import * as THREE from 'three';
import { COLORS } from '../config.js';

const pal = (bad, good, badGlow, goodGlow, badStroke, goodStroke, cb) => Object.freeze({
  bad: new THREE.Color(bad), good: new THREE.Color(good), badGlow: new THREE.Color(badGlow), goodGlow: new THREE.Color(goodGlow),
  badStroke, goodStroke, cb,
});

export const NORMAL = pal(COLORS.bad, COLORS.good, '#ff6b7a', '#7fd0ff', '#8e0f22', '#0e3d9c', false);
export const COLORBLIND = pal('#ff8a00', '#1f6fe0', '#ffb347', '#8ec9ff', '#7a3300', '#0b2f7a', true);

export function gatePalette(colorblind) { return colorblind ? COLORBLIND : NORMAL; }

let stripes = null;
/** Glass texture with bold diagonal stripes (bad gates in colourblind mode); same layout as the plain glass. */
export function stripeTexture(base) {
  if (stripes) return stripes;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  if (base && base.image) g.drawImage(base.image, 0, 0, 128, 256);
  else { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, 128, 256); }
  g.save();
  g.beginPath(); g.rect(0, 0, 128, 256); g.clip();
  g.strokeStyle = 'rgba(40,20,0,0.55)';
  g.lineWidth = 12;
  for (let x = -256; x < 256; x += 34) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 256, 0); g.stroke(); }
  g.restore();
  stripes = new THREE.CanvasTexture(c);
  stripes.colorSpace = THREE.SRGBColorSpace;
  return stripes;
}

/** Draws three ▲ (good) or ▼ (bad) marks across the top of a gate label canvas. */
export function drawMarks(ctx, w, good, stroke) {
  const s = 15, y = 16, gap = 38;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = '#ffffff';
  for (let i = -1; i <= 1; i++) {
    const x = w / 2 + i * gap;
    ctx.beginPath();
    if (good) { ctx.moveTo(x, y - s * 0.75); ctx.lineTo(x + s, y + s * 0.75); ctx.lineTo(x - s, y + s * 0.75); }
    else { ctx.moveTo(x, y + s * 0.75); ctx.lineTo(x + s, y - s * 0.75); ctx.lineTo(x - s, y - s * 0.75); }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}
