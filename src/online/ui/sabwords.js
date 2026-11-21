// Words, colours, sounds and icons of the sabotage UI (STAGE2 "Builder SABUI" point 8). Pure: no DOM, no game.
// The codes are SABGAME's (src/online/game/sabdata.js SAB.code); this file reads codes only.
//   sabKind(code)          -> { head, name, color, sfx, big } or null for an unknown code
//   sabIcon(code)          -> inline SVG (48 x 48) of a kind
//   flagIcon(kind)         -> small SVG for the versus bar ('sabotaged' | 'frozen' | 'bigReady')
//   fromWords(name)        "FROM ANN"
//   sentWords(code, names) "FOG SENT TO ANN" / "HORDE STORM SENT TO EVERYONE"
//   outWords(name, left)   "ANN IS OUT! 2 LEFT"
//   dangerWords(name)      "ANN IS IN DANGER!"
//   waitWords(code)        "RED GATE COMES AFTER THE BOSS"
// Plain kid-friendly English; the duo tests grep these words.
import { up } from './vswords.js';

export const SAB_COLOR = '#b49dff';   // the sabotage purple (button ring, crate, feed)
export const BIG_COLOR = '#ffd34d';   // a big one is gold

const KIND = {
  1: { head: 'EXTRA WAVE!', name: 'EXTRA WAVE', color: '#ff7a3d', sfx: 'horde', big: false },
  2: { head: 'FOG!', name: 'FOG', color: '#c9d8f2', sfx: 'swell', big: false },
  3: { head: 'RED GATE!', name: 'RED GATE', color: '#ff3b4e', sfx: 'gateBad', big: false },
  4: { head: 'SPEED UP!', name: 'SPEED UP', color: '#ffc531', sfx: 'rush', big: false },
  5: { head: 'FREEZE!', name: 'FREEZE', color: '#7fe3ff', sfx: 'freeze', big: false },
  11: { head: 'HORDE STORM!', name: 'HORDE STORM', color: '#ff4fd8', sfx: 'horde', big: true },
  12: { head: 'BLACKOUT!', name: 'BLACKOUT', color: '#8a7dff', sfx: 'swell', big: true },
};
export const SAB_CODES = Object.freeze(Object.keys(KIND).map(Number));
export const sabKind = (code) => KIND[code] || null;

const SVG = {
  // three little horde blobs
  1: '<g fill="#fff"><circle cx="13" cy="30" r="9"/><circle cx="35" cy="30" r="9"/><circle cx="24" cy="17" r="10"/></g><g fill="#2a1060"><circle cx="21" cy="16" r="2.4"/><circle cx="28" cy="16" r="2.4"/><circle cx="10" cy="29" r="2"/><circle cx="16" cy="29" r="2"/><circle cx="32" cy="29" r="2"/><circle cx="38" cy="29" r="2"/></g><path d="M6 42h36" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
  // a cloud with drifting lines
  2: '<path d="M12 28a8 8 0 0 1 2-15.6A11 11 0 0 1 35 13a7.5 7.5 0 0 1 1 15z" fill="#fff"/><g stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.85"><path d="M6 35h26M14 42h28"/></g>',
  // a gate frame with a big minus
  3: '<path d="M8 42V12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v30" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/><rect x="14" y="21" width="20" height="7" rx="3" fill="#fff"/>',
  // double chevron
  4: '<g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10l13 14-13 14"/><path d="M25 10l13 14-13 14"/></g>',
  // snowflake
  5: '<g stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"><path d="M24 4v40M6.7 14l34.6 20M6.7 34l34.6-20"/><path d="M18 8l6 5 6-5M18 40l6-5 6 5" stroke-width="3"/></g>',
  // a big blob with a lightning bolt
  11: '<circle cx="24" cy="28" r="15" fill="#fff"/><g fill="#2a1060"><circle cx="18" cy="26" r="3"/><circle cx="30" cy="26" r="3"/></g><path d="M25 2l-9 13h7l-4 10 11-14h-7l4-9z" fill="#ffd34d" stroke="#2a1060" stroke-width="1.5" stroke-linejoin="round"/>',
  // a crescent moon and two stars (the lights go out)
  12: '<path d="M27 5a19 19 0 1 0 16 28A15 15 0 0 1 27 5z" fill="#fff"/><g fill="#fff"><circle cx="38" cy="12" r="2.6"/><circle cx="31" cy="21" r="1.8"/></g>',
};
export function sabIcon(code) { return `<svg class="sab-svg" viewBox="0 0 48 48" aria-hidden="true">${SVG[code] || SVG[1]}</svg>`; }

const FLAG_SVG = {
  sabotaged: '<path d="M14 2L4 14h6l-2 8 10-12h-6z" fill="#fff"/>',
  frozen: '<g stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/></g>',
  bigReady: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" fill="#fff"/>',
};
export const FLAG_COLOR = { sabotaged: '#9b6bff', frozen: '#2fb7ff', bigReady: '#ffb21f' };
export function flagIcon(kind) { return `<b class="vs-fi ${kind}" style="--fc:${FLAG_COLOR[kind]}"><svg viewBox="0 0 24 24" aria-hidden="true">${FLAG_SVG[kind]}</svg></b>`; }

export const fromWords = (name) => `FROM ${up(name || 'RIVAL')}`;

/** "A", "A AND B", three or more: "EVERYONE". */
export function namesWords(names) {
  const n = (names || []).filter(Boolean).map(up);
  if (!n.length) return 'YOUR RIVAL';
  if (n.length === 1) return n[0];
  return n.length === 2 ? `${n[0]} AND ${n[1]}` : 'EVERYONE';
}

export const sentWords = (code, names) => `${(sabKind(code) || KIND[1]).name} SENT TO ${namesWords(names)}`;
export const outWords = (name, left) => `${up(name || 'RIVAL')} IS OUT!${left > 1 ? ` ${left} LEFT` : ''}`;
export const dangerWords = (name) => `${up(name || 'RIVAL')} IS IN DANGER!`;
export const waitWords = (code) => `${(sabKind(code) || KIND[1]).name} COMES AFTER THE BOSS`;
export const CRATE_WORDS = 'SABOTAGE CRATE! +1';
export const FULL_WORDS = 'SABOTAGE IS FULL!';
export const BIG_WORDS = 'BIG SABOTAGE READY!';

/** The banner of the big moment for the way the last rival went out (versus:peerdown `by`). */
export function rivalDownWords(by) { return by === 'quit' ? 'RIVAL LEFT!' : by === 'dc' ? 'RIVAL OFFLINE!' : 'RIVAL DOWN!'; }
