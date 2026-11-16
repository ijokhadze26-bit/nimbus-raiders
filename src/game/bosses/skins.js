// Boss world skins (update 3): recolour a cached boss model in place, restore it for the next fight.
// Vertex-coloured meshes get a palette remap: brightness -> the skin's ramp (stone becomes basalt / ice / grape /
// storm steel), strongly coloured parts (moss, goo, crystals) -> the skin's accent colours (green hues -> accent2).
// The remapped colour arrays are computed once per geometry + skin (at run start via prepare()) and swapped with
// a typed-array copy at spawn. Plain-colour materials (eyes, cracks, glow sprites, rings) are animated by each
// boss class every frame, so tintGlows() re-hues them after the class's own animate(): brightness and white
// flashes survive, the hue becomes the skin's glow colour. Contact shadows take the theme's blob colour.
import * as THREE from 'three';

export const BOSS_SKINS = {
  forge: {
    ramp: [[0, '#140806'], [0.3, '#2e1a16'], [0.55, '#5a372c'], [0.8, '#8c5e4c'], [1, '#c8957e']],
    accent: '#ff5a12', accent2: '#ffb024', glow: '#ff7a1e', boulder: '#c8846a', k: 0.88,
  },
  frost: {
    ramp: [[0, '#0c2248'], [0.35, '#2a5a9c'], [0.7, '#5e9ad4'], [1, '#cfe8ff']],
    accent: '#56d6ff', accent2: '#eefaff', glow: '#86ecff', boulder: '#d6efff', k: 0.9,
  },
  candy: {
    ramp: [[0, '#4a1e6a'], [0.35, '#9a5ad0'], [0.65, '#ffb0d8'], [1, '#fff6e6']],
    accent: '#ff4aa8', accent2: '#4ee6b8', glow: '#ff7ad1', boulder: '#ffa8d8', k: 0.9,
  },
  citadel: {
    ramp: [[0, '#0c0818'], [0.35, '#28243f'], [0.7, '#57508a'], [1, '#aea2dc']],
    accent: '#b47aff', accent2: '#7a5aff', glow: '#c08aff', boulder: '#8a86a8', k: 0.85,
  },
};

const _c = new THREE.Color(), _a = new THREE.Color(), _b = new THREE.Color(), _w = new THREE.Color(1, 1, 1);
const _hsl = { h: 0, s: 0, l: 0 };
const toSrgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

function compile(skin) {
  if (skin._ramp) return skin;
  skin._ramp = skin.ramp.map(([t, c]) => [t, new THREE.Color(c)]);
  skin._accent = new THREE.Color(skin.accent); skin._accent2 = new THREE.Color(skin.accent2);
  skin._glow = new THREE.Color(skin.glow); skin._boulder = new THREE.Color(skin.boulder);
  return skin;
}

function ramp(skin, t, out) {
  const r = skin._ramp;
  if (t <= r[0][0]) return out.copy(r[0][1]);
  for (let i = 1; i < r.length; i++) {
    if (t <= r[i][0]) return out.copy(r[i - 1][1]).lerp(r[i][1], (t - r[i - 1][0]) / (r[i][0] - r[i - 1][0]));
  }
  return out.copy(r[r.length - 1][1]);
}

/** Remapped copy of one colour array (itemSize 3 or 4; alpha kept). */
function remap(src, size, skin) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += size) {
    _c.setRGB(src[i], src[i + 1], src[i + 2]); // linear
    const r = toSrgb(Math.min(1, _c.r)), g = toSrgb(Math.min(1, _c.g)), b = toSrgb(Math.min(1, _c.b));
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ramp(skin, lum, _a);
    if (sat > 0.45 && mx > 0.35) {
      _c.getHSL(_hsl);
      const green = _hsl.h > 0.17 && _hsl.h < 0.47;
      _b.copy(green ? skin._accent2 : skin._accent).multiplyScalar(0.55 + 0.6 * mx);
      _a.lerp(_b, Math.min(1, (sat - 0.45) * 4));
    }
    _c.lerp(_a, skin.k);
    out[i] = _c.r; out[i + 1] = _c.g; out[i + 2] = _c.b;
    if (size === 4) out[i + 3] = src[i + 3];
  }
  return out;
}

function eachGeometry(root, fn) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m && m.vertexColors)) return;
    const col = o.geometry.attributes.color;
    if (!col) return;
    seen.add(o.geometry);
    fn(o.geometry, col);
  });
}

/** Computes (and caches) the skinned colour arrays of a model; cheap when already done. */
export function prepare(root, skinId) {
  const skin = BOSS_SKINS[skinId];
  if (!skin) return;
  compile(skin);
  eachGeometry(root, (geo, col) => {
    const u = (geo.userData.skinCols ||= {});
    if (!u['']) u[''] = col.array.slice();
    if (!u[skinId]) u[skinId] = remap(u[''], col.itemSize, skin);
  });
}

/**
 * Applies skinId (null / unknown = the original colours) to a cached model. Returns the glow state for
 * tintGlows(): { skin, mats } or null when unskinned.
 */
export function applySkin(root, skinId, blobColor) {
  const skin = BOSS_SKINS[skinId] || null;
  if (skin) prepare(root, skinId);
  const key = skin ? skinId : '';
  eachGeometry(root, (geo, col) => {
    const u = geo.userData.skinCols;
    if (!u || (geo.userData.skinNow || '') === key) return;
    const arr = u[key];
    if (!arr || arr.length !== col.array.length) return;
    col.array.set(arr);
    col.needsUpdate = true;
    geo.userData.skinNow = key;
  });
  const mats = [];
  const seen = new Set();
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m || seen.has(m) || !m.color) continue;
      seen.add(m);
      if (m.alphaMap) { // soft contact shadow
        if (!m.userData.shadowCol) m.userData.shadowCol = m.color.clone();
        if (blobColor) m.color.set(blobColor); else m.color.copy(m.userData.shadowCol);
      } else if (!m.vertexColors) {
        // colours no class animates (shines) would keep a tint into the next, unskinned fight: restore first
        if (!m.userData.origCol) m.userData.origCol = m.color.clone(); else m.color.copy(m.userData.origCol);
        m.userData.tintCol = null;
        if (skin) mats.push(m);
      }
    }
  });
  return skin ? { skin, mats } : null;
}

/** Re-hues the plain-colour (glow) materials after the boss class animated them this frame. */
export function tintGlows(state) {
  if (!state) return;
  const g = state.skin._glow;
  for (const m of state.mats) {
    const c = m.color, last = m.userData.tintCol;
    if (last && c.equals(last)) continue; // the class did not touch it since our last tint
    const L = Math.max(c.r, c.g, c.b);
    if (L <= 0) continue;
    const white = Math.min(c.r, c.g, c.b) / L;
    c.copy(g).multiplyScalar(L).lerp(_w.setScalar(L), white * white * 0.8);
    if (last) last.copy(c); else m.userData.tintCol = c.clone();
  }
}

/** Shared boulder material tint (Grawlstone's rolling / falling rocks), white when unskinned. */
export function boulderTint(state, out) { return state ? out.copy(state.skin._boulder) : out.setRGB(1, 1, 1); }
