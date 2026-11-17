// Shop SQUAD tab (update 3 stage 5): unlock Raider types with coins (data/squadtypes.js) and set how many of each
// join the formation (OFF / FEW / MANY). Cards reuse the shop card style; the art is an original chibi Raider
// with the type's gear (the same gear the 3D squad shows, models/raider.js accessories).
import { icon } from '../icons.js';
import { fmt } from '../ui.js';
import { SQUAD_TYPES, MIX_LEVELS, mixLevel, typeShare } from '../../data/squadtypes.js';
import './shopsquad.css';

const OL = 'stroke="#1b3a8a" stroke-width="3" stroke-linejoin="round"';

/** Chibi Raider (front view) with the type's gear. */
export function raiderTypeSvg(id) {
  const gear = {
    shield: `<g transform="rotate(-8 30 70)"><circle cx="28" cy="70" r="21" fill="#2f8cff" ${OL}/><circle cx="28" cy="70" r="15.5" fill="none" stroke="#f2f7ff" stroke-width="4"/>
      <rect x="25.5" y="53" width="5" height="34" rx="2" fill="#f2f7ff"/><circle cx="28" cy="70" r="6.5" fill="#ffd34d" stroke="#1b3a8a" stroke-width="2.4"/></g>`,
    medic: `<rect x="40" y="58" width="20" height="20" rx="5" fill="#fff" stroke="#1b3a8a" stroke-width="2.4"/><path d="M50 61.5v13M43.5 68h13" stroke="#ff2b3e" stroke-width="4.6" stroke-linecap="round"/>
      <rect x="27" y="58" width="9" height="10" rx="3" fill="#ff2b3e" stroke="#1b3a8a" stroke-width="2.2"/><path d="M50 13.5v9M45.5 18h9" stroke="#ff2b3e" stroke-width="3.6" stroke-linecap="round"/>`,
    gunner: `<rect x="56" y="40" width="16" height="18" rx="4" fill="#3d4a66" ${OL}/><rect x="60" y="14" width="10" height="30" rx="4" fill="#4b5672" ${OL}/>
      <rect x="58" y="9" width="14" height="8" rx="3" fill="#ffae1a" ${OL}/><rect x="56" y="46" width="16" height="5" fill="#ffae1a"/>`,
  }[id] || '';
  return `<svg viewBox="0 0 100 112" class="rt-svg" aria-hidden="true">
    <ellipse cx="50" cy="106" rx="26" ry="5" fill="#1b3a8a" opacity=".22"/>
    <rect x="35" y="84" width="11" height="18" rx="5" fill="#2353c4" ${OL}/><rect x="54" y="84" width="11" height="18" rx="5" fill="#2353c4" ${OL}/>
    <rect x="29" y="52" width="42" height="36" rx="14" fill="#2f7bff" ${OL}/>
    <path d="M33 56c8 5 26 5 34 0l-1.6 7c-8 4.5-22.8 4.5-30.8 0z" fill="#ff8a2b" stroke="#1b3a8a" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="50" cy="31" r="23" fill="#f2f7ff" stroke="#1b3a8a" stroke-width="3.2"/>
    <path d="M30 33c0-6.5 8.5-11 20-11s20 4.5 20 11-8.5 11-20 11-20-4.5-20-11z" fill="#22d3c5" stroke="#1b3a8a" stroke-width="2.8"/>
    <path d="M36 29c4-2 8.4-3 14-3" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".75"/>
    ${gear}
  </svg>`;
}

export const SQUAD_NOTE = 'Bought Raider types join your squad as it grows. Choose how many: FEW = 1 in 10, MANY = 1 in 5.';

/** The SQUAD tab list (shop-list list-squad). */
export function squadHtml(d) {
  const cards = SQUAD_TYPES.map((t) => {
    const owned = d.squadTypes.owned.includes(t.id);
    const can = d.coins >= t.cost;
    const lv = owned ? mixLevel(typeShare(d, t.id)).id : null;
    const act = owned
      ? `<div class="mix-seg" role="radiogroup" aria-label="${t.name} amount">${MIX_LEVELS.map((m) => `<button type="button" class="mix-b${m.id === lv ? ' on' : ''} m-${m.id}" data-act="mix" data-id="${t.id}" data-mix="${m.id}" role="radio" aria-checked="${m.id === lv}">${m.label}</button>`).join('')}</div>`
      : `<button type="button" class="btn btn-sm ${can ? 'btn-green' : 'btn-grey is-disabled'}" data-act="buy-type" data-id="${t.id}" ${can ? '' : 'aria-disabled="true"'}>`
        + `<span class="coin-ico">${icon('coin')}</span><span class="num">${fmt(t.cost)}</span></button>`;
    return `<div class="card sq-card${owned ? ' owned' : ''}${owned && lv !== 'off' ? ' in-squad' : ''}" data-id="${t.id}" style="--tc:${t.color}">
      <div class="sq-prev">${raiderTypeSvg(t.id)}</div>
      <div class="sq-info">
        <div class="sq-name">${t.name}</div>
        <div class="sq-short">${t.short}</div>
        <div class="sq-desc">${t.desc}</div>
        <div class="sq-act">${owned ? `<span class="sq-owned">${icon('check')}${lv === 'off' ? 'OWNED' : 'IN SQUAD'}</span>` : ''}${act}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="paint-note">${icon('squad')}<span>${SQUAD_NOTE}</span></div>${cards}`;
}
