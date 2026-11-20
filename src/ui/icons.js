// Inline SVG icons (no asset files). icon(name, cls) returns an <svg> string; most use currentColor so
// buttons tint them, a few (coin, star, skull, gift, lock) carry their own colors.

const S = (body, vb = '0 0 24 24') => (cls = '') =>
  `<svg class="ico ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

const R = 'stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  pause: S('<rect x="5.5" y="4" width="4.6" height="16" rx="1.8" fill="currentColor"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.8" fill="currentColor"/>'),
  play: S('<path d="M7 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.4-7.4c.8-.5.8-1.7 0-2.2L8.9 3.5C8.1 3 7 3.6 7 4.6z" fill="currentColor"/>'),
  home: S(`<path d="M3.5 11.2 12 4l8.5 7.2" fill="none" stroke="currentColor" stroke-width="2.8" ${R}/><path d="M6 10.5V19a1.5 1.5 0 0 0 1.5 1.5h3v-5h3v5h3A1.5 1.5 0 0 0 18 19v-8.5L12 5.5z" fill="currentColor"/>`),
  retry: S(`<path d="M19.2 12.6A7.3 7.3 0 1 1 16.9 6.6" fill="none" stroke="currentColor" stroke-width="3" ${R}/><path d="M18.6 2.6v5.6H13" fill="none" stroke="currentColor" stroke-width="3" ${R}/>`),
  gear: S('<path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6c.7.2 1.4.5 2 .9l2.2-1.5 2.4 2.4-1.5 2.2c.4.6.7 1.3.9 2l2.6.5v3.4l-2.6.5c-.2.7-.5 1.4-.9 2l1.5 2.2-2.4 2.4-2.2-1.5c-.6.4-1.3.7-2 .9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.4-.5-2-.9l-2.2 1.5-2.4-2.4 1.5-2.2c-.4-.6-.7-1.3-.9-2L1.6 13.7v-3.4l2.6-.5c.2-.7.5-1.4.9-2L3.6 5.6 6 3.2l2.2 1.5c.6-.4 1.3-.7 2-.9zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>'),
  music: S('<path fill="currentColor" d="M9 17.2V6.4c0-.6.4-1.1 1-1.2l8.6-2c.8-.2 1.4.4 1.4 1.1v11.1a3 3 0 1 1-2-2.8V7.6l-7 1.6v8.2a3 3 0 1 1-2-2.8z"/>'),
  sound: S(`<path fill="currentColor" d="M3.5 9.2h3.3L11.6 5c.7-.6 1.7-.1 1.7.8v12.4c0 .9-1 1.4-1.7.8L6.8 14.8H3.5c-.6 0-1-.4-1-1V10.2c0-.6.4-1 1-1z"/><path d="M16.2 8.6a5 5 0 0 1 0 6.8M19 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" ${R}/>`),
  mute: S(`<path d="M4 4l16 16" stroke="currentColor" stroke-width="3" ${R}/>`),
  coin: S('<circle cx="12" cy="12.8" r="9.4" fill="#d98a00"/><circle cx="12" cy="11.6" r="9.4" fill="#ffc531"/><circle cx="12" cy="11.6" r="6.6" fill="none" stroke="#e09a00" stroke-width="1.6"/><path d="M12 7.4l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z" fill="#fff3b8"/><path d="M6.2 8.6a7 7 0 0 1 4-3.6" stroke="#fff6cf" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  star: S('<path d="M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="currentColor" stroke-linejoin="round"/>'),
  lock: S('<rect x="4.5" y="10" width="15" height="11" rx="3" fill="#8b98b8"/><rect x="4.5" y="10" width="15" height="5" rx="2.5" fill="#a9b5d1"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10" fill="none" stroke="#8b98b8" stroke-width="2.8"/><circle cx="12" cy="15.3" r="1.7" fill="#4a5578"/>'),
  cart: S(`<path d="M2.5 4h2.8l2.3 10.6c.1.6.7 1 1.3 1h8.6c.6 0 1.1-.4 1.3-1L21 7.5H6.3" fill="none" stroke="currentColor" stroke-width="2.6" ${R}/><circle cx="9.4" cy="19.6" r="1.9" fill="currentColor"/><circle cx="17.2" cy="19.6" r="1.9" fill="currentColor"/>`),
  infinity: S(`<path d="M12 12c-2-2.6-3.6-4-5.6-4a4 4 0 0 0 0 8c2 0 3.6-1.4 5.6-4zm0 0c2 2.6 3.6 4 5.6 4a4 4 0 0 0 0-8c-2 0-3.6 1.4-5.6 4z" fill="none" stroke="currentColor" stroke-width="3" ${R}/>`),
  gift: S('<rect x="3" y="9" width="18" height="12" rx="2.4" fill="#ff4f6a"/><rect x="3" y="9" width="18" height="4" rx="2" fill="#ff7a8e"/><rect x="10.4" y="9" width="3.2" height="12" fill="#ffd34d"/><path d="M12 9c-1.6-3.6-6-4.4-6-1.8C6 9 9.5 9 12 9zm0 0c1.6-3.6 6-4.4 6-1.8C18 9 14.5 9 12 9z" fill="#ffd34d" stroke="#e09a00" stroke-width="1.2"/>'),
  skull: S('<path d="M12 2.6c-5 0-8.6 3.4-8.6 8 0 2.8 1.3 4.6 3 5.6v2.4c0 1 .8 1.8 1.8 1.8h7.6c1 0 1.8-.8 1.8-1.8v-2.4c1.7-1 3-2.8 3-5.6 0-4.6-3.6-8-8.6-8z" fill="#fff"/><circle cx="8.6" cy="11.2" r="2.3" fill="#3a1630"/><circle cx="15.4" cy="11.2" r="2.3" fill="#3a1630"/><path d="M12 13.6l-1.4 2.4h2.8z" fill="#3a1630"/><path d="M9.6 18.4v2.2M12 18.4v2.2M14.4 18.4v2.2" stroke="#3a1630" stroke-width="1.2"/>'),
  close: S(`<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3.4" ${R}/>`),
  back: S(`<path d="M14.8 4.6 7.4 12l7.4 7.4" fill="none" stroke="currentColor" stroke-width="3.6" ${R}/>`),
  check: S(`<path d="M4.6 12.6l4.8 4.8L19.6 7" fill="none" stroke="currentColor" stroke-width="3.6" ${R}/>`),
  hand: S('<path d="M9.2 3.2c.9 0 1.6.7 1.6 1.6v6.3l.6-.1V9.4c0-.9.7-1.5 1.5-1.5s1.5.7 1.5 1.5v1.8l.5-.1v-.9c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5v1.4l.4-.1c.8 0 1.5.7 1.5 1.5v3.6c0 3.3-2.6 6-6 6h-1.4c-1.9 0-3.6-.9-4.7-2.5L4.4 14.4c-.5-.8-.3-1.8.4-2.3.7-.5 1.7-.4 2.2.3l.6.9V4.8c0-.9.7-1.6 1.6-1.6z" fill="#fff" stroke="#1b3a8a" stroke-width="1.5" stroke-linejoin="round"/>'),
  shield: S('<path d="M12 2.5 4 5.6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z" fill="currentColor"/><path d="M12 5.4 6.6 7.5v4.1c0 3.4 2.2 5.9 5.4 7z" fill="#fff" opacity=".45"/>'),
  bolt: S('<path d="M13.6 2 4.8 13.4h6l-1.6 8.6 9-11.6h-6.2z" fill="currentColor" stroke-linejoin="round"/>'),
  magnet: S('<path d="M5 3.5h4.4v8.2a2.6 2.6 0 0 0 5.2 0V3.5H19v8.4a7 7 0 0 1-14 0z" fill="currentColor"/><path d="M5 3.5h4.4v3H5zM14.6 3.5H19v3h-4.4z" fill="#fff"/>'),
  freeze: S(`<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.4 3.8 12 6.2l2.6-2.4M9.4 20.2 12 17.8l2.6 2.4" fill="none" stroke="currentColor" stroke-width="2.4" ${R}/>`),
  vibration: S(`<rect x="7.4" y="3" width="9.2" height="18" rx="2.4" fill="currentColor"/><rect x="9.4" y="5.6" width="5.2" height="10.6" rx="1" fill="#fff" opacity=".5"/><path d="M3.6 8.5v7M20.4 8.5v7" stroke="currentColor" stroke-width="2.4" ${R}/>`),
  quality: S('<path d="M12 2.2l2.2 6.1 6.4.4-5 4 1.7 6.3L12 15.4 6.7 19l1.7-6.3-5-4 6.4-.4z" fill="currentColor" opacity=".35"/><path d="M12 6l1.2 3.4 3.6.2-2.8 2.2 1 3.5L12 13.4l-3 1.9 1-3.5-2.8-2.2 3.6-.2z" fill="currentColor"/>'),
  trophy: S('<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#ffc531"/><path d="M7 5H3.8c0 3 1.4 5 4 5.4M17 5h3.2c0 3-1.4 5-4 5.4" fill="none" stroke="#ffc531" stroke-width="2"/><rect x="10.6" y="13" width="2.8" height="4.4" fill="#e09a00"/><rect x="7.4" y="17.4" width="9.2" height="3.4" rx="1.2" fill="#ffc531"/>'),
  squad: S('<circle cx="12" cy="7.2" r="3.6" fill="currentColor"/><path d="M5.6 20.4c0-3.8 2.9-6.6 6.4-6.6s6.4 2.8 6.4 6.6z" fill="currentColor"/><circle cx="5" cy="9.4" r="2.5" fill="currentColor" opacity=".6"/><circle cx="19" cy="9.4" r="2.5" fill="currentColor" opacity=".6"/><path d="M.8 18.6c0-2.8 1.8-4.8 4.2-4.8 1 0 1.8.3 2.5.8a8.4 8.4 0 0 0-2.4 4zM23.2 18.6c0-2.8-1.8-4.8-4.2-4.8-1 0-1.8.3-2.5.8a8.4 8.4 0 0 1 2.4 4z" fill="currentColor" opacity=".6"/>'),
  damage: S('<path d="M12 1.8l2.3 6.3 6.6-1.6-4.2 5.3 4.6 5-6.7-.6-1.1 6.6-2.8-6.1-6.3 2.6 3.6-5.6L2.4 9l6.7-.2z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="#fff" opacity=".55"/>'),
  rate: S('<path d="M4 7h9.5a2.6 2.6 0 0 1 0 5.2H4zM4 13.6h9.5a2.6 2.6 0 0 1 0 5.2H4z" fill="currentColor"/><path d="M18.4 6.2h3.2M19.4 12h2.2M18.4 17.8h3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>'),
  tier: S('<path d="M2.4 8.4h14.4l2-1.6h2.8v6h-3.4l-1.4 1.4h-3.4l-1.2 5.6H7.6l1.2-5.6H2.4z" fill="currentColor" stroke-linejoin="round"/><rect x="4.4" y="10" width="7" height="1.8" rx=".9" fill="#fff" opacity=".5"/>'),
  coinbonus: S('<ellipse cx="9" cy="17.6" rx="6.6" ry="2.8" fill="#d98a00"/><ellipse cx="9" cy="16" rx="6.6" ry="2.8" fill="#ffc531"/><ellipse cx="9" cy="13" rx="6.6" ry="2.8" fill="#d98a00"/><ellipse cx="9" cy="11.4" rx="6.6" ry="2.8" fill="#ffc531"/><path d="M18.6 3.6v7M15.1 7.1h7" stroke="#2fbf5a" stroke-width="2.8" stroke-linecap="round"/>'),
  map: S('<path d="M3 6.2 8.6 4l6.8 2.4L21 4.2v13.6L15.4 20l-6.8-2.4L3 19.8z" fill="currentColor" opacity=".35"/><path d="M8.6 4v13.6M15.4 6.4V20" stroke="currentColor" stroke-width="2"/><path d="M3 6.2 8.6 4l6.8 2.4L21 4.2v13.6L15.4 20l-6.8-2.4L3 19.8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
  heart: S('<path d="M12 20.6S3 15 3 8.8A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 9 1.9C21 15 12 20.6 12 20.6z" fill="currentColor"/>'),
  globe: S(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M3.4 12h17.2M12 3c3.4 3.4 3.4 14.6 0 18M12 3c-3.4 3.4-3.4 14.6 0 18" fill="none" stroke="currentColor" stroke-width="2.2" ${R}/>`),
  flag: S('<path d="M5 21V3.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6 4h12.4l-2.6 4 2.6 4H6z" fill="currentColor"/>'),
};

export function icon(name, cls = '') {
  const f = ICONS[name];
  return f ? f(cls) : '';
}

/** Colors for power-up timer slots and their icon names. */
export const POWER_LOOK = {
  shield: { icon: 'shield', color: '#4dc3ff', label: 'SHIELD' },
  rapid: { icon: 'bolt', color: '#ffb21f', label: 'RAPID' },
  magnet: { icon: 'magnet', color: '#ff4f6a', label: 'MAGNET' },
  freeze: { icon: 'freeze', color: '#7fe8ff', label: 'FREEZE' },
};
