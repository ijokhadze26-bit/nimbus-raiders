// Hazard hint line (update 3 world hazards): "LAVA! Stay on the stones" slides in under the top bar the first
// time a level shows a hazard kind (hazard:hint from game/hazards, set by data/hazardplan.js on intro levels).
// Pure DOM + CSS animation, never blocks input; hidden on a new run / leaving the run.
import './hudhazard.css';

const SHOW_MS = 2800;

export function mountHazardHint(hud) {
  const el = document.createElement('div');
  el.className = 'hazard-hint hidden';
  hud.root.appendChild(el);
  let timer = 0;
  const hide = () => { clearTimeout(timer); el.classList.add('hidden'); };
  const ev = hud.game.events;
  ev.on('hazard:hint', (p) => {
    if (!p || !p.text) return;
    const [head, ...rest] = String(p.text).split('!');
    el.innerHTML = rest.length ? `<span class="hh-head">${esc(head)}!</span> <span class="hh-tail">${esc(rest.join('!').trim())}</span>` : `<span class="hh-head">${esc(p.text)}</span>`;
    el.style.setProperty('--hc', p.color || '#ffd34d');
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.add('hidden'), SHOW_MS);
  });
  ev.on('run:start', hide);
  ev.on('game:state', ({ state }) => { if (state !== 'playing' && state !== 'paused') hide(); });
  return { el, hide };
}

function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
