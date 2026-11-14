// CanvasTexture labels (numbers / short text) with cheap redraw-on-change.
import * as THREE from 'three';

export const FONT_DISPLAY = "'Lilita One', 'Nunito Variable', system-ui, sans-serif";

export function createLabel(width = 256, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { canvas, ctx, texture, key: null };
}

/**
 * Draws outlined text centered in the label. Only redraws when (text + style key) changed.
 * opts: fill, stroke, strokeWidth (px), size (px), y (0..1 center), shadow, key (extra cache key), clear,
 *       before(ctx, w, h) (background, drawn under the text), after(ctx, w, h)
 */
export function drawLabel(label, text, opts = {}) {
  const key = text + '|' + (opts.key || '') + '|' + (opts.fill || '') + (opts.stroke || '');
  if (label.key === key && !opts.force) return false;
  label.key = key;
  const { ctx, canvas } = label;
  const w = canvas.width, h = canvas.height;
  if (opts.clear !== false) ctx.clearRect(0, 0, w, h);
  if (opts.before) opts.before(ctx, w, h);
  let size = opts.size || h * 0.78;
  ctx.font = `${size}px ${FONT_DISPLAY}`;
  const maxW = w * (opts.maxWidth || 0.9);
  const mw = ctx.measureText(text).width;
  if (mw > maxW) { size *= maxW / mw; ctx.font = `${size}px ${FONT_DISPLAY}`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const cx = w / 2, cy = h * (opts.y ?? 0.54);
  const sw = opts.strokeWidth ?? size * 0.16;
  if (opts.shadow !== false) {
    ctx.fillStyle = opts.shadowColor || 'rgba(10,25,70,0.35)';
    ctx.strokeStyle = opts.shadowColor || 'rgba(10,25,70,0.35)';
    ctx.lineWidth = sw;
    ctx.strokeText(text, cx, cy + size * 0.07);
    ctx.fillText(text, cx, cy + size * 0.07);
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = sw;
    ctx.strokeText(text, cx, cy);
  }
  ctx.fillStyle = opts.fill || '#ffffff';
  ctx.fillText(text, cx, cy);
  if (opts.after) opts.after(ctx, w, h);
  label.texture.needsUpdate = true;
  return true;
}

/** A camera-facing-ready plane mesh showing the label. */
export function labelMesh(label, worldW, worldH) {
  const mat = new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), mat);
  mesh.renderOrder = 5;
  return mesh;
}

/** Signed number text used by gates: +5, −3, +0. Uses a real minus sign. */
export function signed(n) {
  return n < 0 ? '−' + Math.abs(n) : '+' + n;
}

/**
 * Reward badge: "+N" on a glossy coloured pill with a white rim. Deliberately unlike gate numbers
 * (bare outlined digits on glass), so a badge floating in front of a gate never reads as part of it.
 */
export function drawBadge(label, text, color = '#2f8cff', dark = '#0e3d9c') {
  return drawLabel(label, text, {
    fill: '#ffffff', stroke: dark, size: 78, strokeWidth: 12, shadow: false, y: 0.53, maxWidth: 0.7,
    before: (ctx, w, h) => {
      const pad = 10, r = (h - pad * 2) / 2;
      const pill = () => { ctx.beginPath(); ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r); };
      ctx.fillStyle = 'rgba(10,25,70,0.35)';
      ctx.beginPath(); ctx.roundRect(pad, pad + 7, w - pad * 2, h - pad * 2, r); ctx.fill();
      const g = ctx.createLinearGradient(0, pad, 0, h - pad);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.12, color); g.addColorStop(1, dark);
      pill(); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff'; pill(); ctx.stroke();
    },
  });
}
