// Run modifier UI bits (update 3 stage 5): the loadout MODIFIERS grid (toggle cards, data-act="mod"), the coin bonus
// tag, and the result-screen row of the modifiers a run used. Styles in mods.css. Data: data/modifiers.js.
import { icon } from './icons.js';
import { PLAYER_MODS, MOD_BY_ID, modsBonus, cleanIds } from '../data/modifiers.js';
import './mods.css';

const S = (body) => `<svg viewBox="0 0 32 32" class="mod-svg" aria-hidden="true">${body}</svg>`;
const O = 'stroke="#1b3a8a" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
/** Original glyphs for the player modifiers (the twists use the shared icon set). */
const GLYPH = {
  noUpgrades: S(`<path d="M16 4 26 15h-6v9h-8v-9H6z" fill="#c99bff" ${O}/><circle cx="16" cy="17" r="12" fill="none" stroke="#ff3b4e" stroke-width="3.4"/><path d="M7.5 25.5 24.5 8.5" stroke="#ff3b4e" stroke-width="3.4" stroke-linecap="round"/>`),
  halfSquad: S(`<circle cx="11" cy="10" r="5" fill="#59c1ff" ${O}/><path d="M3 27c0-5 3.6-9 8-9s8 4 8 9z" fill="#59c1ff" ${O}/><circle cx="22" cy="10" r="5" fill="#fff" ${O} stroke-dasharray="3 3"/><path d="M14 27c0-5 3.6-9 8-9s8 4 8 9z" fill="#fff" ${O} stroke-dasharray="3 3"/>`),
  oneLife: S(`<path d="M16 28S3 20 3 11.5C3 7 6.4 4 10 4c2.6 0 4.6 1.4 6 3.4C17.4 5.4 19.4 4 22 4c3.6 0 7 3 7 7.5C29 20 16 28 16 28z" fill="#ff5a6b" ${O}/><path d="M13.6 11.6 16.6 9.8V20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  fog: S(`<path d="M8 17a5 5 0 0 1 .6-10A7 7 0 0 1 22 8.5 4.5 4.5 0 0 1 24 17z" fill="#e6eefc" ${O}/><path d="M4 21h18M9 25.5h19M5 29h12" stroke="#7d8db0" stroke-width="2.8" stroke-linecap="round"/>`),
};

export const modGlyph = (id) => GLYPH[id] || icon(MOD_BY_ID[id] ? MOD_BY_ID[id].icon : 'star');
export const pct = (f) => `+${Math.round(f * 100)}%`;

/** The loadout grid: one toggle card per player modifier (`on` = ids switched on). */
export function modsGridHtml(on) {
  return PLAYER_MODS.map((m) => {
    const sel = on.includes(m.id);
    return `<button type="button" class="mod-card${sel ? ' on' : ''}" data-act="mod" data-id="${m.id}" role="switch" aria-checked="${sel}" style="--mc:${m.color}">`
      + `<span class="mod-ico">${modGlyph(m.id)}</span>`
      + `<span class="mod-t"><b>${m.name}</b><small>${m.desc}</small></span>`
      + `<span class="mod-bonus">${pct(m.bonus)}</span>`
      + `<span class="mod-check">${icon(sel ? 'check' : 'close')}</span></button>`;
  }).join('');
}

/** "+70% COINS" (empty string when nothing is on). */
export function modsBonusText(ids) { const b = modsBonus(ids); return b > 0 ? `${pct(b)} COINS` : ''; }

/** Result screen: the modifiers this run used + their coin bonus (nothing when none). */
export function modsResultHtml(a) {
  const ids = cleanIds(a && a.mods);
  if (!ids.length) return '';
  const bonus = a.modMul > 1 ? `<span class="rm-bonus">${pct(a.modMul - 1)} COINS</span>` : '';
  const why = !a.win && a.failReason === 'oneLife' ? '<div class="rm-why">ONE LIFE: the squad fell below half its biggest size</div>' : '';
  return `<div class="res-mods"><div class="rm-row">${ids.map((id) => `<span class="rm-tag" style="--mc:${MOD_BY_ID[id].color}"><i>${modGlyph(id)}</i>${MOD_BY_ID[id].name}</span>`).join('')}${bonus}</div>${why}</div>`;
}
