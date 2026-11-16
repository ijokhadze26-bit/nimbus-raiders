// Update 3 world map art + names (no asset files): boss / mini-boss names per level, the per-world colours,
// chip glyphs, boss-node icons, the band scenery (cheap absolutely placed SVG / CSS shapes, built once) and the
// seam where one world's band meets the one below. Used by screens/map.js; bossName / kindTag also by the loadout.
import { worldOf, levelKind } from '../data/worlds.js';
import { bossDef } from '../data/bosses.js';

const O = '#1b3a8a';

/** Who waits at the end of each boss / mini-boss level (the displayed name; skins rename some bosses). */
export const BOSS_NAMES = {
  5: 'OCULON', 10: 'GRAWLSTONE',
  15: 'MAGMA GRAWLSTONE', 20: 'IRONHORN',
  25: 'FROSTHORN', 30: 'GLACIUS',
  35: 'GUMDROP GOLIATH', 40: 'CANDY QUEEN',
  45: 'OCULON', 50: 'TEMPEST KING',
};

/** Display name of the boss at the end of a level: the world table for boss / mini levels, else def.boss. */
export function bossName(levelId, def = null) {
  const k = levelKind(levelId);
  if ((k === 'boss' || k === 'mini') && BOSS_NAMES[levelId]) return BOSS_NAMES[levelId];
  if (def && def.boss && def.boss.type) return bossDef(def.boss.type).name;
  return null;
}

/** 'BOSS' | 'MINI-BOSS' | 'FINAL RUSH' for what ends a level (def.boss null = a final rush to the finish arch). */
export function kindTag(levelId, def = null) {
  if (def && !def.boss) return 'FINAL RUSH';
  const k = levelKind(levelId);
  if (k === 'mini') return 'MINI-BOSS';
  if (k === 'boss' || (def && def.boss)) return 'BOSS';
  return 'FINAL RUSH';
}

/** "WORLD 2 · LEVEL 14" */
export const worldLevelText = (levelId) => `WORLD ${worldOf(levelId).id} · LEVEL ${levelId}`;

/** Button-like colour triples per world (light, mid, outline) + the band's top / bottom colours. */
export const WORLD_LOOK = {
  sky: { c1: '#74d4ff', c2: '#2f8cff', c3: '#143f9a', top: '#3a86e4' },
  forge: { c1: '#ffb35a', c2: '#ff5a1f', c3: '#7a1c08', top: '#2c0c0b' },
  frost: { c1: '#d8f6ff', c2: '#5fbdea', c3: '#1d4f8c', top: '#5a86c8' },
  candy: { c1: '#ffc0ea', c2: '#ff5ab8', c3: '#8e1763', top: '#b98aff' },
  citadel: { c1: '#c3a8ff', c2: '#7a4df0', c3: '#2c1878', top: '#140d36' },
};

const svg = (vb, body, cls = '', style = '') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;

/** Small world glyphs for the chips (24-unit box). */
export const WORLD_GLYPH = {
  sky: svg('0 0 24 24', `<path d="M6 18.5a4 4 0 0 1-.4-8 5.6 5.6 0 0 1 10.8-1.2A4.6 4.6 0 0 1 18 18.5z" fill="#fff" stroke="${O}" stroke-width="1.8"/>`, 'ico'),
  forge: svg('0 0 24 24', `<path d="M2 21l6.6-11.5h6.8L22 21z" fill="#5a1e14" stroke="#3a0c08" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.6 9.5h6.8l-1.6 2.8-1.8-1-1.8 1z" fill="#ffb21f"/><path d="M10.5 6.5c0-2 1.5-2 1.5-4 1 1.4 2.4 2 1.6 4" fill="#ff7a1f" stroke="#ffd34d" stroke-width="1"/>`, 'ico'),
  frost: svg('0 0 24 24', `<path d="M1.5 21L9 7l3.6 5.6L15.5 9 22.5 21z" fill="#8fc4ee" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 7l-2.3 4.3 1.6-.6L9.6 12l1.6-1.4zM15.5 9l-1.4 2.6 1.4-.4 1.2 1 .6-.8z" fill="#fff"/>`, 'ico'),
  candy: svg('0 0 24 24', `<rect x="11" y="12" width="2.4" height="10" rx="1.2" fill="#fff" stroke="${O}" stroke-width="1.2"/><circle cx="12.2" cy="9" r="7" fill="#ff5ab8" stroke="${O}" stroke-width="1.8"/><path d="M12.2 9a2 2 0 1 1 2.2 2 3.8 3.8 0 1 1-4.2-4.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`, 'ico'),
  citadel: svg('0 0 24 24', `<path d="M5 22V9h3v2h2V9h4v2h2V9h3v13z" fill="#3a2a7a" stroke="#140d36" stroke-width="1.4" stroke-linejoin="round"/><rect x="10.6" y="14" width="2.8" height="4" rx="1.4" fill="#d8c4ff"/><path d="M14 1.5 10.5 6.6h2.6L11.6 10l4.2-5.2h-2.6z" fill="#ffe36b" stroke="#a85400" stroke-width=".8" stroke-linejoin="round"/>`, 'ico'),
};

/** Boss node: a horned skull under a crown (original art). */
export const BOSS_SKULL = svg('0 0 40 40', `
  <path d="M8 15C4 13 2 9 3 5c2 4 5 5 8 5zM32 15c4-2 6-6 5-10-2 4-5 5-8 5z" fill="#ffd34d" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M20 7c-7.5 0-12.6 4.8-12.6 11.4 0 4 1.9 6.6 4.4 8v3.4c0 1.4 1.1 2.6 2.6 2.6h11.2c1.4 0 2.6-1.2 2.6-2.6v-3.4c2.5-1.4 4.4-4 4.4-8C32.6 11.8 27.5 7 20 7z" fill="#fff" stroke="${O}" stroke-width="2"/>
  <path d="M10.8 19.6c1.6-2.4 5.2-2.6 6.4-.4.9 1.8-.6 3.8-3 3.8s-4.4-1.6-3.4-3.4zM29.2 19.6c-1.6-2.4-5.2-2.6-6.4-.4-.9 1.8.6 3.8 3 3.8s4.4-1.6 3.4-3.4z" fill="#3a1630"/>
  <circle cx="14.4" cy="20.2" r="1" fill="#ff5a5a"/><circle cx="25.6" cy="20.2" r="1" fill="#ff5a5a"/>
  <path d="M20 23.4l-1.8 3h3.6z" fill="#3a1630"/><path d="M16.4 29.4v3M20 29.4v3M23.6 29.4v3" stroke="#3a1630" stroke-width="1.4"/>`, 'wm-skull');
export const BOSS_CROWN = svg('0 0 40 20', `<path d="M4 18l-2-13 9 6 9-10 9 10 9-6-2 13z" fill="#ffc531" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="11" r="2.4" fill="#ff3b4e" stroke="${O}" stroke-width="1"/><path d="M6 15h28" stroke="#fff3b8" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`, 'wm-crown');
export const MINI_BADGE = svg('0 0 24 24', `<circle cx="12" cy="12" r="10.5" fill="#8a4dff" stroke="#fff" stroke-width="2.4"/>
  <path d="M12 5.4c-3.8 0-6.2 2.4-6.2 5.6 0 2 1 3.2 2.2 4v1.6c0 .7.5 1.2 1.2 1.2h5.6c.7 0 1.2-.5 1.2-1.2V15c1.2-.8 2.2-2 2.2-4 0-3.2-2.4-5.6-6.2-5.6z" fill="#fff"/>
  <circle cx="9.6" cy="11.2" r="1.6" fill="#3a1630"/><circle cx="14.4" cy="11.2" r="1.6" fill="#3a1630"/>`, 'wm-mini');

// ---------------- scenery ----------------
const VOLCANO = svg('0 0 200 170', `
  <path d="M-4 170L66 46q34-14 68 0l70 124z" fill="#3b1411"/><path d="M100 40q17 0 34 6l70 124h-70z" fill="#260a09"/>
  <path d="M66 46q34-14 68 0l-12 18q-22-9-44 0z" fill="#ff7a1f"/><path d="M76 52q24-8 48 0" stroke="#ffd34d" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M92 58q-8 26-24 50q-8 14-6 40M112 58q4 30 20 52q6 10 4 22" stroke="#ff8a2a" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M92 58q-8 26-24 50q-8 14-6 40" stroke="#ffd34d" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <circle cx="84" cy="24" r="12" fill="#5a3a38" opacity=".7"/><circle cx="102" cy="12" r="15" fill="#5a3a38" opacity=".55"/><circle cx="122" cy="20" r="10" fill="#5a3a38" opacity=".6"/>`, 'wm-dec');
const LAVA_RIVER = svg('0 0 400 44', `<path d="M0 10q50-12 100 0t100 0 100 0 100 0v26q-50 12-100 0t-100 0-100 0-100 0z" fill="#ff6a1a" stroke="#2c0c0b" stroke-width="3"/>
  <path d="M0 18q50-10 100 0t100 0 100 0 100 0" stroke="#ffd34d" stroke-width="3" fill="none" opacity=".8"/>`, 'wm-dec wm-river');
const ROCK = (c) => svg('0 0 60 40', `<path d="M2 40l6-22 14-12 16 4 12 10 8 20z" fill="${c}" stroke="#1c0706" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 6l4 14 12-10" stroke="#ff7a1f" stroke-width="2" fill="none" opacity=".75"/>`, 'wm-dec');

const PEAKS = svg('0 0 260 170', `
  <path d="M-4 170L64 58l36 52 48-92 116 152z" fill="#86b2e2" stroke="#3d6aa8" stroke-width="3" stroke-linejoin="round"/>
  <path d="M148 18l116 152h-70z" fill="#6390c8"/><path d="M64 58l36 52-18 60H-4z" fill="#9cc4ec" opacity=".6"/>
  <path d="M148 18l-24 46 12-6 12 12 14-12 10 6z" fill="#fff"/><path d="M64 58l-16 26 10-4 8 8 10-8 8 4z" fill="#fff"/>`, 'wm-dec');
const PINE = svg('0 0 40 60', `<rect x="17" y="46" width="6" height="12" rx="2" fill="#6b4a3a"/><path d="M20 2L4 30h8L2 48h36L28 30h8z" fill="#2f8f7a" stroke="#1d4f5a" stroke-width="2" stroke-linejoin="round"/><path d="M20 2l-8 14 4-1 4 3 4-3 4 1zM12 30l-4 8 6-2 6 3 6-3 6 2-4-8z" fill="#fff"/>`, 'wm-dec');
const ICE = svg('0 0 40 50', `<path d="M20 2l8 18-8 28-8-28z" fill="#c8f2ff" stroke="#3d7ab8" stroke-width="2" stroke-linejoin="round"/><path d="M8 18l6 8-2 18-6-14zM32 18l-6 8 2 18 6-14z" fill="#a6e4ff" stroke="#3d7ab8" stroke-width="2" stroke-linejoin="round"/>`, 'wm-dec');

const HILL = svg('0 0 220 120', `<path d="M-4 120c10-60 50-96 114-96s104 36 114 96z" fill="#7de8c8" stroke="#2f9a8a" stroke-width="3"/>
  <path d="M8 74c10-30 46-50 102-50s92 20 102 50c-12-6-18 8-30 2s-18 10-32 4-20 10-36 4-22 10-38 4-20 8-34 2-22 4-34-16z" fill="#fff"/>
  <circle cx="60" cy="92" r="5" fill="#ff5ab8"/><circle cx="110" cy="100" r="5" fill="#ffd34d"/><circle cx="160" cy="90" r="5" fill="#59c1ff"/>`, 'wm-dec');
const LOLLI = (c) => svg('0 0 60 112', `<rect x="27" y="50" width="6" height="60" rx="3" fill="#fff" stroke="#8e1763" stroke-width="2"/>
  <circle cx="30" cy="30" r="26" fill="${c}" stroke="#8e1763" stroke-width="3"/>
  <path d="M30 30a5 5 0 1 1 5 5 11 11 0 1 1-11-11 17 17 0 1 1 17 17" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`, 'wm-dec');
const GUMDROP = (c) => svg('0 0 40 32', `<path d="M3 30c0-16 7-27 17-27s17 11 17 27z" fill="${c}" stroke="#8e1763" stroke-width="2.4"/><path d="M11 12q3-5 8-6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".7"/>`, 'wm-dec');
const CANE = svg('0 0 40 100', `<path d="M12 98V30a12 12 0 0 1 24 0v6" fill="none" stroke="#8e1763" stroke-width="11" stroke-linecap="round"/><path d="M12 98V30a12 12 0 0 1 24 0v6" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M12 98V30a12 12 0 0 1 24 0v6" fill="none" stroke="#ff3b4e" stroke-width="7" stroke-dasharray="6 6"/>`, 'wm-dec');

const TOWER = (h) => svg(`0 0 80 ${h}`, `<path d="M40 0l22 40H18z" fill="#5a3fb0" stroke="#0d0826" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M14 40h52v8h-6v${h - 48}H20V48h-6z" fill="#2a1f62" stroke="#0d0826" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M40 40h20v${h - 40}H40z" fill="#000" opacity=".22"/>
  <rect x="33" y="62" width="14" height="22" rx="7" fill="#d8c4ff"/><rect x="33" y="${Math.round(h * 0.62)}" width="14" height="20" rx="7" fill="#b99aff" opacity=".85"/>
  <path d="M38 6v-6" stroke="#ffe36b" stroke-width="3"/>`, 'wm-dec');
const BOLT = svg('0 0 50 120', `<path d="M30 0L6 62h16L12 120l34-74H28L40 0z" fill="#ffe36b" stroke="#fff6cc" stroke-width="3" stroke-linejoin="round"/>`, 'wm-dec wm-bolt anim');

/** Deterministic pseudo-random for decor placement (seeded per world). */
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/** Side positions keep the scenery mostly at the band edges (the road winds through the middle). */
const side = (r, i) => (i % 2 ? `right:${(-8 + r() * 14).toFixed(1)}%` : `left:${(-8 + r() * 14).toFixed(1)}%`);
const at = (y, pos, w, extra = '') => `style="top:${Math.round(y)}px;${pos};width:${w}px${extra}"`;
const place = (html, y, pos, w, extra) => html.replace('<svg ', `<svg ${at(y, pos, w, extra)} `);

/** Scenery HTML for a band of height h (band-local px; x in %), built once at map creation. */
export function bandDecor(key, h) {
  const r = rng(11 + key.length * 97);
  const out = [];
  if (key === 'sky') {
    for (let y = 40, i = 0; y < h - 120; y += 120 + r() * 70, i++) {
      const s = 0.55 + r() * 0.8;
      out.push(`<div class="wm-cloud${i % 3 === 0 ? ' anim' : ''}" style="top:${Math.round(y)}px;left:${(-12 + r() * 92).toFixed(1)}%;--s:${s.toFixed(2)};--d:${(12 + r() * 10).toFixed(1)}s;opacity:${(0.6 + r() * 0.35).toFixed(2)}"></div>`);
    }
    for (let i = 0; i < 4; i++) out.push(`<div class="wm-island" style="top:${Math.round(120 + i * (h - 360) / 4 + r() * 80)}px;${side(r, i)};--s:${(0.65 + r() * 0.45).toFixed(2)}"></div>`);
  } else if (key === 'forge') {
    out.push(place(VOLCANO, 90, 'left:-10%', 230), place(VOLCANO, 610, 'right:-12%', 170));
    out.push(`<div class="wm-glow anim" style="top:112px;left:calc(-10% + 75px);width:80px;height:60px"></div>`);
    out.push(place(LAVA_RIVER, 420, 'left:0', 0, ';width:100%;height:44px'), place(LAVA_RIVER, h - 470, 'left:0', 0, ';width:100%;height:44px'));
    for (let i = 0; i < 6; i++) out.push(place(ROCK(i % 2 ? '#3b1411' : '#4a1a14'), 200 + i * (h - 420) / 6 + r() * 60, side(r, i + 1), 44 + r() * 30));
    for (let i = 0; i < 14; i++) out.push(`<i class="wm-ember" style="top:${Math.round(r() * (h - 200))}px;left:${(r() * 100).toFixed(1)}%;--z:${(0.6 + r()).toFixed(2)}"></i>`);
  } else if (key === 'frost') {
    out.push(place(PEAKS, 80, 'left:-16%', 280), place(PEAKS, 560, 'right:-18%', 260), place(PEAKS, h - 420, 'left:-20%', 220));
    for (let i = 0; i < 7; i++) out.push(place(PINE, 260 + i * (h - 480) / 7 + r() * 40, side(r, i), 30 + r() * 18));
    for (let i = 0; i < 3; i++) out.push(place(ICE, 380 + i * 280 + r() * 60, side(r, i + 1), 28 + r() * 12));
    for (let i = 0; i < 22; i++) out.push(`<i class="wm-snow" style="top:${Math.round(r() * (h - 160))}px;left:${(r() * 100).toFixed(1)}%;--z:${(0.5 + r()).toFixed(2)}"></i>`);
  } else if (key === 'candy') {
    out.push(place(HILL, 160, 'left:-22%', 240), place(HILL, 660, 'right:-24%', 250), place(HILL, h - 400, 'left:-26%', 210));
    const cols = ['#ff5ab8', '#59c1ff', '#ffb21f', '#8a4dff'];
    for (let i = 0; i < 5; i++) out.push(place(LOLLI(cols[i % 4]), 60 + i * (h - 300) / 5 + r() * 60, side(r, i + 1), 34 + r() * 16));
    for (let i = 0; i < 2; i++) out.push(place(CANE, 330 + i * 470, side(r, i), 30));
    const gd = ['#ff3b4e', '#35c95a', '#ffd34d', '#59c1ff'];
    for (let i = 0; i < 8; i++) out.push(place(GUMDROP(gd[i % 4]), 120 + i * (h - 300) / 8 + r() * 40, side(r, i), 22 + r() * 12));
    for (let i = 0; i < 16; i++) out.push(`<i class="wm-sprinkle" style="top:${Math.round(r() * (h - 160))}px;left:${(r() * 100).toFixed(1)}%;--c:${gd[i % 4]};rotate:${Math.round(r() * 180)}deg"></i>`);
  } else if (key === 'citadel') {
    out.push(place(TOWER(220), 60, 'left:-3%', 70), place(TOWER(170), 300, 'right:-2%', 62), place(TOWER(240), 640, 'left:-4%', 74), place(TOWER(190), h - 470, 'right:-3%', 66));
    for (let i = 0; i < 6; i++) {
      const s = 0.6 + r() * 0.7;
      out.push(`<div class="wm-cloud wm-storm" style="top:${Math.round(30 + i * (h - 200) / 6 + r() * 60)}px;left:${(-14 + r() * 90).toFixed(1)}%;--s:${s.toFixed(2)};opacity:${(0.65 + r() * 0.3).toFixed(2)}"></div>`);
    }
    for (let i = 0; i < 3; i++) out.push(place(BOLT, 140 + i * (h - 360) / 3, side(r, i + 1), 30 + r() * 12, `;--d:${(3.2 + r() * 2.4).toFixed(1)}s;--o:${(r() * 2).toFixed(1)}s`));
    for (let i = 0; i < 26; i++) out.push(`<i class="wm-spark" style="top:${Math.round(r() * (h - 160))}px;left:${(r() * 100).toFixed(1)}%;--z:${(0.5 + r()).toFixed(2)}"></i>`);
  }
  return out.join('');
}

/**
 * Seam at the bottom of a world's band: below the edge line it is the previous world's top colour (so the
 * straight band border never shows), the line itself is this world's edge (rock, snow bank, frosting, storm cloud).
 */
export function bandSeam(key, prevTop) {
  const E = {
    forge: { d: 'M0 34L18 20 34 34 56 14 78 30 100 10 124 28 146 16 170 36 196 12 222 30 246 16 268 34 292 12 316 28 340 14 364 32 384 18 400 26', rim: '#ff8a2a', w: 4 },
    frost: { d: 'M0 30q12-18 28-6 14-18 32-4 16-16 34 0 16-16 34-2 16-16 34 0 18-16 34-2 14-16 32 0 16-14 34 0 16-16 34-2 18-16 34 0 16-14 30 2 14-12 20-2', rim: '#fff', w: 9 },
    candy: { d: 'M0 22q10 0 14 10t8 18 6-14 12-12 16 0 10 20 8 4 8-16 14-10 20 6 8 22 8 4 6-18 14-8 18 4 10 24 8 2 8-20 16-8 18 8 6 18 8-2 8-16 14-6 22 6 6 16 8-4 6-14 16-4', rim: '#fff', w: 7 },
    citadel: { d: 'M0 30q14-22 34-8 16-22 40-6 18-20 40 0 18-22 42-4 20-20 40 2 16-18 38-2 20-22 40 0 18-18 38 0 20-20 38 2 14-12 30 0', rim: '#5d4fa0', w: 8 },
  }[key];
  if (!E) return '';
  return svg('0 0 400 70', `<path d="${E.d}H404V70H-4z" fill="${prevTop}"/><path d="${E.d}H404" fill="none" stroke="${E.rim}" stroke-width="${E.w}" stroke-linecap="round" stroke-linejoin="round"/>`,
    'wm-seam', 'width:100%;height:70px').replace('<svg ', '<svg preserveAspectRatio="none" ');
}
