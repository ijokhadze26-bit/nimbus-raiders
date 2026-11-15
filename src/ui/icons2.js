// Icons for update 2 (enemies, bosses, weapons, heroes, abilities). FOUNDATION STUB (owned by the UI
// builder): generic coloured SVG discs with an initial. Contract: enemyIcon(id), bossIcon(id), weaponIcon(id),
// heroIcon(id), abilityIcon(id) -> inline <svg> string (class "ico"), colours from data.
import { ENEMIES } from '../data/enemies.js';
import { weaponDef } from '../data/weapons.js';
import { heroDef } from '../data/heroes.js';

const disc = (color, letter, ring = '#1b3a8a') => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="${color}" stroke="${ring}" stroke-width="2"/><text x="12" y="16.2" text-anchor="middle" font-size="11" font-family="sans-serif" font-weight="700" fill="#fff">${letter}</text></svg>`;
const BOSS_COLORS = { grawlstone: '#6f8f4a', oculon: '#6d7aa8', mothermurk: '#6a3fb0', ironhorn: '#8e99ab', tempestking: '#5d6487' };

export function enemyIcon(id) { const e = ENEMIES[id]; return disc(e ? e.color : '#8a4dff', (e ? e.name : id || '?')[0]); }
export function bossIcon(id) { return disc(BOSS_COLORS[id] || '#5d6487', (id || '?')[0].toUpperCase(), '#3a1630'); }
export function weaponIcon(id) { const d = weaponDef(id); return disc(d.look.mk[2].color, d.name[0]); }
export function heroIcon(id) { const h = heroDef(id); return disc(h.raider ? h.raider.body : '#2f8cff', h.name[0]); }
export function abilityIcon(id) { return disc('#ffb21f', (id || '?')[0].toUpperCase()); }
/** Strong / weak list entry id -> icon (enemy or boss). */
export function targetIcon(id) { return ENEMIES[id] ? enemyIcon(id) : bossIcon(id); }
