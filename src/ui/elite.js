// ELITE mode UI bits (update 3 stage 3) shared by the loadout (toggle), the world map (node badge) and the
// result screen (ELITE CLEAR ribbon + elite stars). Styles in elite.css.
import { icon } from './icons.js';
import { ELITE_TEXT } from '../data/elite.js';
import './elite.css';

/** Purple shield with a horned skull (original glyph). */
export const ELITE_BADGE = `<svg viewBox="0 0 24 24" class="elite-ico" aria-hidden="true">
  <path d="M12 1.6 21 5v6.2c0 5.4-3.8 9.6-9 11.2-5.2-1.6-9-5.8-9-11.2V5z" fill="#7b2bd6" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 3.8 19 6.5v4.7c0 4.2-2.8 7.6-7 9V3.8z" fill="#5a1aa8"/>
  <path d="M6.6 6.9c.3 1.5 1 2.7 2.2 3.4M17.4 6.9c-.3 1.5-1 2.7-2.2 3.4" stroke="#ffd34d" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M12 8.4c-2.9 0-4.6 1.8-4.6 4.2 0 1.5.7 2.4 1.6 3v1.2c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9v-1.2c.9-.6 1.6-1.5 1.6-3 0-2.4-1.7-4.2-4.6-4.2z" fill="#fff"/>
  <circle cx="10.2" cy="12.8" r="1.25" fill="#2b0a52"/><circle cx="13.8" cy="12.8" r="1.25" fill="#2b0a52"/>
</svg>`;

/** Three small stars, `n` of them lit (purple elite stars). */
export function eliteStarsHtml(n, cls = 'e-stars') {
  return `<span class="${cls}" data-n="${n | 0}">${[1, 2, 3].map((i) => icon('star', i <= n ? 'on' : '')).join('')}</span>`;
}

/**
 * Loadout ELITE row: locked (needs 3 stars) / off / on. `best` = elite stars so far.
 * The whole row is the switch (data-act="elite").
 */
export function eliteRowHtml({ unlocked, on, best }) {
  if (!unlocked) {
    return `<div class="lo-elite locked" data-act="elite" aria-disabled="true"><span class="le-badge">${ELITE_BADGE}</span>`
      + `<span class="le-t"><b>ELITE ${icon('lock')}</b><small>Get 3 ${icon('star')} on this level to unlock</small></span></div>`;
  }
  return `<button type="button" class="lo-elite${on ? ' on' : ''}" data-act="elite" role="switch" aria-checked="${on}" aria-label="Elite mode">`
    + `<span class="le-badge">${ELITE_BADGE}</span>`
    + `<span class="le-t"><b>ELITE${best ? eliteStarsHtml(best, 'le-best') : ''}</b><small>${ELITE_TEXT}</small></span>`
    + `<span class="switch${on ? ' is-on' : ''}"><span class="knob"></span><span class="on">ON</span><span class="off">OFF</span></span></button>`;
}
