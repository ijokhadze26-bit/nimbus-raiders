// Ability button (SPEC2 §5 HUD). FOUNDATION STUB (owned by the HEROES builder): a plain round button with a
// conic recharge ring. Contract: mountAbility(hud, mountEl) -> { el, update() } | null; hud.update() calls
// update() every frame. Triggers on pointerdown (works while another finger drags; the following click is
// ignored), Space / E on a keyboard. Hidden while hinting, outside run.active and on the result screen.
import './hudability.css';

export function mountAbility(hud, mountEl) {
  const game = hud.game;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ability-btn';
  btn.setAttribute('data-ui', '');
  btn.setAttribute('aria-label', 'Ability');
  btn.innerHTML = '<span class="ab-ring"></span><span class="ab-lbl">GO</span>';
  mountEl.appendChild(btn);
  const fire = () => game.heroes && game.heroes.useAbility();
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fire(); });
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  window.addEventListener('keydown', (e) => {
    if (game.state !== 'playing' || e.repeat) return;
    if (e.code === 'Space' || e.key === 'e' || e.key === 'E') { e.preventDefault(); fire(); }
  });
  let lastF = -1, lastShow = null;
  return {
    el: btn,
    update() {
      const H = game.heroes, run = game.run;
      const show = !!(run && run.active && game.state === 'playing' && !hud.hintOn && H);
      if (show !== lastShow) { lastShow = show; btn.style.display = show ? '' : 'none'; }
      if (!show) return;
      const ab = H.ability;
      const f = ab.ready ? 1 : Math.round((1 - ab.left / Math.max(0.01, ab.cd)) * 200) / 200;
      if (f !== lastF) { lastF = f; btn.style.setProperty('--f', `${(f * 360).toFixed(1)}deg`); btn.classList.toggle('ready', ab.ready); }
    },
  };
}
