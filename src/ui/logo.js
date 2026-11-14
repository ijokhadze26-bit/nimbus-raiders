// NIMBUS RAIDERS wordmark: chunky Lilita One letters, white fill, thick deep-blue outline + drop shadow,
// a yellow lightning bolt replaces the "I" of NIMBUS, ribbon subtitle. Letters drop in one by one, then float.

const BOLT = `<svg class="logo-bolt" viewBox="0 0 40 72" aria-hidden="true">
  <path d="M27 3 6 40h13l-6 29 23-40H22z" fill="#1b3a8a" stroke="#1b3a8a" stroke-width="9" stroke-linejoin="round" transform="translate(0 4)"/>
  <path d="M27 3 6 40h13l-6 29 23-40H22z" fill="#ffd23a" stroke="#1b3a8a" stroke-width="5.5" stroke-linejoin="round"/>
  <path d="M24.5 9 11.6 35.6" stroke="#fff6b8" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;

function word(text, offset) {
  return [...text].map((ch, i) => (ch === '|'
    ? `<span class="logo-l logo-l-bolt" style="--i:${offset + i}">${BOLT}</span>`
    : `<span class="logo-l" style="--i:${offset + i}" data-ch="${ch}">${ch}</span>`)).join('');
}

/** Returns the logo element. size: 'big' (title) | 'small'. */
export function createLogo(size = 'big') {
  const el = document.createElement('div');
  el.className = `logo logo-${size}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Nimbus Raiders');
  el.innerHTML = `
    <div class="logo-glow"></div>
    <div class="logo-row logo-row1">${word('N|MBUS', 0)}</div>
    <div class="logo-row logo-row2">${word('RAIDERS', 6)}</div>
    <div class="logo-ribbon"><span>SKY SQUAD SHOOTER</span></div>`;
  return el;
}

/** Replays the drop-in animation (call when the title screen re-appears). */
export function replayLogo(el) {
  el.classList.remove('logo-play');
  void el.offsetWidth;
  el.classList.add('logo-play');
}
