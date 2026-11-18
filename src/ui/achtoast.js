// Achievement toast (update 3 stage 5): 'achievement:done' { def } -> a gold pill "ACHIEVEMENT! / name / +coins"
// slides in under the top bar for 3 s; several in a row queue up. pointer-events none (never blocks steering).
import './achievements.css';
import { icon } from './icons.js';
import { fmt } from './ui.js';

const SHOW_MS = 3000;

export function mountAchToast(ui) {
  const node = document.createElement('div');
  node.className = 'ach-toast';
  node.setAttribute('aria-live', 'polite');
  node.innerHTML = `<span class="t-ico">${icon('trophy')}</span><span class="t-col"><span class="t-k">ACHIEVEMENT!</span><span class="t-n"></span></span><span class="t-c">+${icon('coin')}<span></span></span>`;
  ui.root.appendChild(node);
  const name = node.querySelector('.t-n'), coins = node.querySelector('.t-c span');
  const queue = [];
  let busy = false, timer = 0;

  function next() {
    const def = queue.shift();
    if (!def) { busy = false; node.classList.remove('show'); return; }
    busy = true;
    name.textContent = def.name;
    coins.textContent = fmt(def.reward);
    node.classList.remove('show');
    void node.offsetWidth;
    node.classList.add('show');
    ui.sfx('star', { index: 2 });
    ui.vibrate(30);
    clearTimeout(timer);
    timer = setTimeout(next, SHOW_MS + 150);
  }

  ui.game.events.on('achievement:done', (p) => {
    if (!p || !p.def) return;
    queue.push(p.def);
    if (!busy) next();
    ui.screens.title?.refreshAch?.();
  });
  return { el: node, pending: () => queue.length + (busy ? 1 : 0) };
}
