// HUD add-on for the stage 5 modes (mounted by ui.js next to the HUD; game.modes drives it):
// - the top-left level label says BOSS RUSH (+ the run timer) / DAILY / CHAOS instead of "LV n"
// - a chip under the top bar: Boss Rush "BOSS 3/10", Daily / Chaos the twist tags
// - a start banner ("CHAOS: x2 SPEED + FOG") and a Boss Rush "BOSS 3 DOWN!" banner between fights
// Pure DOM, updated from ui.update (timer text only changes 10x a second).
import './modes.css';
import { icon } from './icons.js';
import { fmt } from './ui.js';
import { fmtTime, RUSH_COUNT } from '../game/modes/bossrush.js';
import { twistLabel, TWISTS } from '../game/modes/twists.js';
import { bossLook } from '../data/bosses.js';

const LABEL = { bossrush: ['skull', 'BOSS RUSH'], daily: ['gift', 'DAILY'], chaos: ['bolt', 'CHAOS'] };
const BANNER_MS = 2200;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountModeHud(hud) {
  const g = hud.game, ev = g.events;
  const chip = document.createElement('div');
  chip.className = 'mode-chip hidden';
  const chipRow = document.createElement('div');
  chipRow.className = 'mode-chip-row';
  chipRow.appendChild(chip);
  hud.root.appendChild(chipRow);
  const banner = document.createElement('div');
  banner.className = 'mode-banner hidden';
  hud.root.appendChild(banner);
  let timeEl = null, shownT = -1, bannerT = 0, kind = null;

  function showBanner(html, color) {
    banner.innerHTML = html;
    banner.style.setProperty('--mc', color);
    banner.classList.remove('hidden');
    banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
    clearTimeout(bannerT);
    bannerT = setTimeout(() => banner.classList.add('hidden'), BANNER_MS);
  }
  function rushChip(n) { chip.innerHTML = `<span class="mc-k">${icon('skull')}BOSS</span><b class="num">${Math.min(RUSH_COUNT, n + 1)}/${RUSH_COUNT}</b>`; }
  function hide() { kind = null; timeEl = null; chip.classList.add('hidden'); banner.classList.add('hidden'); clearTimeout(bannerT); }

  ev.on('mode:start', (p) => {
    kind = p.mode;
    const [ico, name] = LABEL[kind] || ['star', String(kind).toUpperCase()];
    hud.levelEl.innerHTML = `${icon(ico)}<span>${name}</span>` + (kind === 'bossrush' ? '<span class="lv dist mode-time">0:00.0</span>' : `<span class="lv">LV ${p.levelId}</span>`);
    timeEl = hud.levelEl.querySelector('.mode-time');
    shownT = -1;
    chip.className = `mode-chip m-${kind}`;
    if (kind === 'bossrush') rushChip(0);
    else chip.innerHTML = p.twists.map((id) => `<span class="mc-tag">${icon((TWISTS[id] && TWISTS[id].ico) || 'star')}${esc(twistLabel(id))}</span>`).join('');
    const title = kind === 'bossrush' ? 'BOSS RUSH' : kind === 'daily' ? 'DAILY CHALLENGE' : 'CHAOS MODE';
    const sub = kind === 'bossrush' ? `${RUSH_COUNT} BOSSES · BEAT THE CLOCK` : esc(p.text);
    showBanner(`<div class="mb-sub">${title}</div><div class="mb-name">${sub}</div>`, kind === 'bossrush' ? '#ff5a6a' : kind === 'daily' ? '#ffd34d' : '#57f0a0');
  });
  ev.on('bossrush:next', (p) => {
    rushChip(p.n);
    const look = bossLook(p.next || {});
    showBanner(`<div class="mb-sub">BOSS ${p.n} DOWN!</div><div class="mb-name">NEXT: ${esc(look.name)}</div>`
      + `<div class="mb-sub small">+${p.troops} RAIDERS · +${fmt(p.coins)} COINS${p.mkUp ? ' · MK UP' : ''}</div>`, '#ffd34d');
  });
  ev.on('run:phase', ({ phase }) => chip.classList.toggle('in-boss', phase === 'boss')); // the boss bar takes the spot
  ev.on('run:start', (p) => { if (!g.modes || !g.modes.owns(p.mode)) hide(); });
  ev.on('game:state', ({ state }) => { if (state !== 'playing' && state !== 'paused') { chip.classList.add('hidden'); banner.classList.add('hidden'); } else if (kind) chip.classList.remove('hidden'); });

  return {
    update() {
      if (!timeEl || !g.run || kind !== 'bossrush') return;
      const t = Math.floor(g.run.time * 10);
      if (t !== shownT) { shownT = t; timeEl.textContent = fmtTime(g.run.time); }
    },
  };
}
