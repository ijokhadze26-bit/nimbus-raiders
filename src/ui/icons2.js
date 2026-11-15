// Icons for update 2 (enemies, bosses, weapons, heroes, abilities): chunky outlined inline SVGs in the game's
// cartoon style. Contract: enemyIcon(id), bossIcon(id), weaponIcon(id), heroIcon(id), abilityIcon(id),
// targetIcon(id) -> inline <svg class="ico"> string. Colours come from data where data has them.
import { ENEMIES } from '../data/enemies.js';
import { weaponDef } from '../data/weapons.js';
import { heroDef } from '../data/heroes.js';

const O = '#1b3a8a';
const svg = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${body}</svg>`;
const eye = (x, y, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + 0.4}" cy="${y + 0.3}" r="${r * 0.5}" fill="#1d1033"/>`;

// ---------------- enemies ----------------
const ENEMY_SVG = {
  grunt: (c) => `<path d="M8 9l2 4M24 9l-2 4" stroke="#5b2cc4" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="16" cy="18.5" rx="11" ry="9.5" fill="${c}" stroke="${O}" stroke-width="2.2"/>
    <circle cx="16" cy="17" r="4.6" fill="#ffd23d" stroke="${O}" stroke-width="1.4"/><circle cx="16.4" cy="17.2" r="2" fill="#1d1033"/>
    <path d="M12.5 23.4h7" stroke="#2c0f55" stroke-width="2" stroke-linecap="round"/>`,
  runner: (c) => `<path d="M9 13L3 6M15 11l-3-8" stroke="#d95a12" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M6 22c0-7 5-11 11-11s10 4 10 9-4 8-10 8H9c-2 0-3-2-3-6z" fill="${c}" stroke="${O}" stroke-width="2.2"/>
    ${eye(15.5, 18)}${eye(21.5, 18)}<path d="M13 14.4l5 1.2M24 14.4l-4 1.2" stroke="#7a2a05" stroke-width="1.8" stroke-linecap="round"/>`,
  tank: (c) => `<rect x="4" y="7" width="24" height="21" rx="6" fill="${c}" stroke="${O}" stroke-width="2.2"/>
    <rect x="7" y="16" width="18" height="9" rx="2.5" fill="#8e99ab" stroke="${O}" stroke-width="1.6"/>
    <path d="M10 18.5h12M10 22h12" stroke="#5b6a8e" stroke-width="1.4"/>${eye(12, 12.2, 2.2)}${eye(20, 12.2, 2.2)}`,
  shield: (c) => `<ellipse cx="13" cy="18" rx="9.5" ry="9" fill="${c}" stroke="${O}" stroke-width="2.2"/>${eye(10, 15.5, 2.2)}
    <path d="M18 9l9 2.4v7c0 5-4 8.6-9 10-1.6-1.6-2-4-2-6V11z" fill="#4dc3ff" stroke="${O}" stroke-width="2"/>
    <path d="M21.5 12.4v12" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  bomber: (c) => `<path d="M19 7c1-3 4-4 6-3" stroke="#6b4a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="26" cy="4.6" r="2.6" fill="#ffd34d"/><circle cx="26" cy="4.6" r="1.2" fill="#fff"/>
    <circle cx="15" cy="18.5" r="11" fill="${c}" stroke="${O}" stroke-width="2.2"/>${eye(11.5, 17)}${eye(18.5, 17)}
    <path d="M10.5 23c3 2 6 2 9 0" stroke="#5a0a14" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};
export function enemyIcon(id) {
  const e = ENEMIES[id];
  const f = ENEMY_SVG[id];
  return f ? svg(f(e ? e.color : '#8a4dff'), 'ico-enemy') : disc(e ? e.color : '#8a4dff', (e ? e.name : id || '?')[0]);
}

// ---------------- bosses ----------------
const BOSS_SVG = {
  grawlstone: `<path d="M4 26l2-12 5-6h10l5 6 2 12z" fill="#7c8a6a" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M8 12c3-3 13-3 16 0" stroke="#6fbf4a" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="12" cy="17" r="2.4" fill="#ffd23d"/><circle cx="20" cy="17" r="2.4" fill="#ffd23d"/><path d="M11 22.5h10" stroke="#3a4030" stroke-width="2.4" stroke-linecap="round"/>`,
  oculon: `<path d="M4 12c0-5 5-8 12-8s12 3 12 8" fill="#6d7aa8" stroke="${O}" stroke-width="2"/>
    <circle cx="16" cy="18" r="10" fill="#e8eeff" stroke="${O}" stroke-width="2.2"/><circle cx="16" cy="18" r="5.4" fill="#4dc3ff"/><circle cx="16" cy="18" r="2.6" fill="#1d1033"/>
    <path d="M14 4l-2 5h3l-2 5" stroke="#ffe14d" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  mothermurk: `<path d="M9 8l2-5 3 4 2-5 2 5 3-4 2 5z" fill="#ffc531" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M3 28c0-12 5-19 13-19s13 7 13 19z" fill="#6a3fb0" stroke="${O}" stroke-width="2.2"/>${eye(12, 18, 2.8)}${eye(20, 18, 2.8)}
    <path d="M12 24c3 1.6 5 1.6 8 0" stroke="#2c0f55" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ironhorn: `<path d="M6 13l-3-8 7 5z" fill="#d9dee8" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="5" y="11" width="22" height="16" rx="6" fill="#8e99ab" stroke="${O}" stroke-width="2.2"/>
    <rect x="9" y="15" width="14" height="5" rx="2" fill="#ff3b4e" stroke="${O}" stroke-width="1.4"/><path d="M10 24h12" stroke="#5b6a8e" stroke-width="2" stroke-linecap="round"/>`,
  tempestking: `<path d="M7 11l2-6 4 4 3-6 3 6 4-4 2 6z" fill="#ffc531" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M4 22c0-7 5-11 12-11s12 4 12 11c0 4-4 6-12 6S4 26 4 22z" fill="#5d6487" stroke="${O}" stroke-width="2.2"/>
    <path d="M17 13l-4 7h4l-3 7 7-9h-4l3-5z" fill="#ffe14d" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`,
};
export function bossIcon(id) { return BOSS_SVG[id] ? svg(BOSS_SVG[id], 'ico-boss') : disc('#5d6487', (id || '?')[0].toUpperCase()); }
/** Strong / weak list entry id -> icon (enemy or boss). */
export function targetIcon(id) { return ENEMIES[id] ? enemyIcon(id) : bossIcon(id); }

// ---------------- weapons ----------------
const WEAPON_SVG = {
  emberstorm: (c) => `<path d="M16 2c2 6 9 8 9 17a9 9 0 0 1-18 0c0-5 3-7 4-11 2 3 2 5 3 6 2-3 2-7 2-12z" fill="${c.color}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 15c2 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-5 1 1 1 2 2 2z" fill="${c.core}"/>`,
  glacier: (c) => `<path d="M16 2l6 8-6 20-6-20z" fill="${c.color}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 2v28M10 10h12" stroke="#fff" stroke-width="1.6" opacity=".8"/><path d="M6 14l-3 3 3 3M26 14l3 3-3 3" stroke="${c.color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  sugarrush: () => `<circle cx="16" cy="16" r="10.5" fill="#ff8ad8" stroke="${O}" stroke-width="2.2"/>
    <path d="M8 11c5 1 9 5 9 15M12 6.5c4 3 8 9 13 10" stroke="#8affc8" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="11" r="2.2" fill="#fff" opacity=".7"/><path d="M3 9l2 1M28 23l2 1M26 5l1 2" stroke="#fff08a" stroke-width="2.4" stroke-linecap="round"/>`,
  spectra: () => `<path d="M16 3l12 23H4z" fill="#f4f8ff" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 3L10 26M16 3l6 23" stroke="#cfd9ff" stroke-width="1.4"/><path d="M20 15l10-2M20 16.5l10 1M20 18l10 4" stroke-width="2.2" stroke-linecap="round" stroke="#ff5a7a"/>
    <path d="M20 16.5l10 1" stroke="#7dff6a" stroke-width="2.2" stroke-linecap="round"/><path d="M20 18l10 4" stroke="#4dc3ff" stroke-width="2.2" stroke-linecap="round"/>`,
  gearworks: (c) => `<path fill="${c.color}" stroke="${O}" stroke-width="2" stroke-linejoin="round" d="M13.6 2.5h4.8l.8 3.6 3.2 1.4 3.1-2 3.4 3.4-2 3.1 1.4 3.2 3.6.8v4.8l-3.6.8-1.4 3.2 2 3.1-3.4 3.4-3.1-2-3.2 1.4-.8 3.6h-4.8l-.8-3.6-3.2-1.4-3.1 2-3.4-3.4 2-3.1-1.4-3.2-3.6-.8v-4.8l3.6-.8 1.4-3.2-2-3.1 3.4-3.4 3.1 2 3.2-1.4z"/>
    <circle cx="16" cy="16" r="5" fill="#c8d0dc" stroke="${O}" stroke-width="2"/><circle cx="16" cy="16" r="1.8" fill="${O}"/>`,
  thunderclap: (c) => `<path d="M18.5 2L6 18h8l-3 12 15-18h-8.5z" fill="${c.color}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M17 7l-6 8h4" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8"/>`,
  voidsiphon: () => `<circle cx="16" cy="16" r="12" fill="#3b1a6e" stroke="${O}" stroke-width="2.2"/>
    <path d="M16 6a10 10 0 0 1 9 6M16 26a10 10 0 0 1-9-6M8 9a9 9 0 0 1 5-3M24 23a9 9 0 0 1-5 3" stroke="#ff4bd8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="4.6" fill="#120822"/><circle cx="16" cy="16" r="2" fill="#ff7ae6"/>`,
};
export function weaponIcon(id) {
  const d = weaponDef(id);
  const c = d.look.mk[2];
  return WEAPON_SVG[d.id] ? svg(WEAPON_SVG[d.id](c), 'ico-weapon') : disc(c.color, d.name[0]);
}

// ---------------- heroes (head portraits) ----------------
const HERO_SVG = {
  pip: `<circle cx="16" cy="16" r="12.5" fill="#fff" stroke="${O}" stroke-width="2.2"/>
    <path d="M6 16.5c0-3.4 4.4-5.6 10-5.6s10 2.2 10 5.6-4 6-10 6-10-2.6-10-6z" fill="#2fd6c8" stroke="${O}" stroke-width="2"/>
    <path d="M10 14c2-1 4-1.4 6-1.4" stroke="#d9fffb" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M5 26c4 3 8 4 11 4s7-1 11-4" stroke="#ff8a2a" stroke-width="3.6" stroke-linecap="round" fill="none"/>`,
  cinder: `<path d="M9 9l-2-7 6 4 3-5 3 5 6-4-2 7z" fill="#ff7a1f" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 5l1-2M20 5l-1-2" stroke="#ffd34d" stroke-width="2"/>
    <circle cx="16" cy="18" r="10.5" fill="#c98a5e" stroke="${O}" stroke-width="2.2"/>
    <rect x="7" y="10.5" width="18" height="5" rx="2.5" fill="#3a2420" stroke="${O}" stroke-width="1.4"/><circle cx="12" cy="13" r="2" fill="#ffb21f"/><circle cx="20" cy="13" r="2" fill="#ffb21f"/>
    <circle cx="12.5" cy="19.5" r="1.4" fill="#2a1410"/><circle cx="19.5" cy="19.5" r="1.4" fill="#2a1410"/><path d="M13 24c2 1 4 1 6 0" stroke="#2a1410" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  rime: `<path d="M3 30c0-12 5-26 13-26s13 14 13 26z" fill="#9fc8e8" stroke="${O}" stroke-width="2.2"/>
    <path d="M6 30c0-9 4-19 10-19s10 10 10 19" fill="#e8f6ff" stroke="${O}" stroke-width="1.6"/>
    <rect x="8.5" y="16" width="15" height="3.6" rx="1.8" fill="#4dc3ff" stroke="${O}" stroke-width="1.4"/><path d="M5 28h22" stroke="#6f9bff" stroke-width="3"/>`,
  bonbon: `<circle cx="7" cy="8" r="5.2" fill="#ff8ad8" stroke="${O}" stroke-width="2"/><circle cx="25" cy="8" r="5.2" fill="#ff8ad8" stroke="${O}" stroke-width="2"/>
    <circle cx="16" cy="18" r="11" fill="#ffe0c8" stroke="${O}" stroke-width="2.2"/><path d="M5.5 15c2-6 6-8 10.5-8s8.5 2 10.5 8c-4-2-17-2-21 0z" fill="#ff8ad8" stroke="${O}" stroke-width="1.6"/>
    <circle cx="12" cy="19" r="1.6" fill="#3a1630"/><circle cx="20" cy="19" r="1.6" fill="#3a1630"/><circle cx="9.5" cy="22" r="1.8" fill="#ff8ad8" opacity=".6"/><circle cx="22.5" cy="22" r="1.8" fill="#ff8ad8" opacity=".6"/>
    <path d="M13 23.5c2 1.6 4 1.6 6 0" stroke="#3a1630" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  bolt: `<circle cx="16" cy="19" r="10" fill="#e8b48a" stroke="${O}" stroke-width="2.2"/>
    <path d="M4 15c0-7 5-11 12-11s12 4 12 11z" fill="#ffd34d" stroke="${O}" stroke-width="2.2"/><path d="M2 15h28" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="16" cy="9.5" r="2.6" fill="#fff6c4" stroke="${O}" stroke-width="1.4"/>
    <circle cx="12" cy="20" r="3" fill="#2fd6c8" stroke="${O}" stroke-width="1.6"/><circle cx="20" cy="20" r="3" fill="#2fd6c8" stroke="${O}" stroke-width="1.6"/><path d="M13 26h6" stroke="#4b3020" stroke-width="1.6" stroke-linecap="round"/>`,
  vex: `<path d="M12 2h8l1 6h-10z" fill="#ffc531" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="4" y="7" width="24" height="22" rx="7" fill="#5a3fa8" stroke="${O}" stroke-width="2.2"/>
    <rect x="7" y="14" width="18" height="5" rx="2" fill="#ff3b4e" stroke="${O}" stroke-width="1.4"/><path d="M7 23h18" stroke="#2a2d3e" stroke-width="3" stroke-linecap="round"/><path d="M4 12h24" stroke="#ffc531" stroke-width="1.6"/>`,
};
export function heroIcon(id) {
  const h = heroDef(id);
  return HERO_SVG[h.id] ? svg(HERO_SVG[h.id], 'ico-hero') : disc(h.raider ? h.raider.body : '#2f8cff', h.name[0]);
}

// ---------------- abilities ----------------
const ABILITY_SVG = {
  rally: `<path d="M5 13v6l14 6V7z" fill="#ffc531" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><rect x="3" y="12" width="5" height="8" rx="1.5" fill="#2f8cff" stroke="${O}" stroke-width="1.6"/>
    <path d="M23 11l4-3M24 16h5M23 21l4 3" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  meteor: `<path d="M3 3l13 13M8 2l11 11M2 9l11 11" stroke="#ffb21f" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>
    <circle cx="21" cy="21" r="8" fill="#7a3a2a" stroke="${O}" stroke-width="2.2"/><circle cx="19" cy="19" r="2.2" fill="#ff7a1f"/><circle cx="24" cy="23" r="1.6" fill="#ff7a1f"/>`,
  whiteout: `<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" stroke="#e8f6ff" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M12.5 5l3.5 3 3.5-3M12.5 27l3.5-3 3.5 3" stroke="#9fe8ff" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="16" r="3" fill="#4dc3ff"/>`,
  sugarshield: `<circle cx="16" cy="16" r="12" fill="#ffd0f0" stroke="${O}" stroke-width="2.2"/><path d="M6 11c6 3 14 3 20 0M5 18c7 3 15 3 22 0" stroke="#8affc8" stroke-width="2.8" fill="none"/>
    <circle cx="11" cy="9.5" r="2.4" fill="#fff" opacity=".85"/>`,
  fortress: `<rect x="5" y="16" width="22" height="12" rx="3" fill="#8e99ab" stroke="${O}" stroke-width="2.2"/><rect x="9" y="10" width="14" height="8" rx="3" fill="#ffd34d" stroke="${O}" stroke-width="2"/>
    <path d="M14 13h15M14 16h13" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M8 22h16" stroke="#5b6a8e" stroke-width="2" stroke-linecap="round"/><path d="M12 4l4 6M20 4l-4 6" stroke="#fff" stroke-width="1.8"/>`,
  shockwave: `<ellipse cx="16" cy="22" rx="13" ry="5" fill="none" stroke="#c99bff" stroke-width="2.4"/><ellipse cx="16" cy="22" rx="8" ry="3" fill="none" stroke="#fff" stroke-width="2.4"/>
    <path d="M10 4h12l-1 12h-10z" fill="#5a3fa8" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><path d="M12 8h8" stroke="#ffc531" stroke-width="2"/>`,
};
export function abilityIcon(id) { return ABILITY_SVG[id] ? svg(ABILITY_SVG[id], 'ico-ability') : disc('#ffb21f', (id || '?')[0].toUpperCase()); }

function disc(color, letter, ring = O) {
  return svg(`<circle cx="16" cy="16" r="13" fill="${color}" stroke="${ring}" stroke-width="2.4"/><text x="16" y="21.4" text-anchor="middle" font-size="15" font-family="sans-serif" font-weight="700" fill="#fff">${letter}</text>`);
}

/** Small "i" info glyph (currentColor). */
export function infoIcon() {
  return svg('<circle cx="16" cy="16" r="13" fill="currentColor"/><circle cx="16" cy="9.6" r="2.4" fill="#2f8cff"/><rect x="13.6" y="13.4" width="4.8" height="11" rx="2.2" fill="#2f8cff"/>', 'ico-info');
}
