// Pause menu (modal while game.state === 'paused'): resume, retry, settings, home.
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';

export function createPause(ui) {
  const root = screenEl('pause', 'dim-screen');
  root.innerHTML = `
    <div class="panel panel-pause pop">
      <div class="ribbon ribbon-blue"><span>PAUSED</span></div>
      <div class="pause-level"></div>
      <button type="button" class="btn btn-gold btn-lg" data-act="resume"><span class="play-ico">${icon('play')}</span><span>RESUME</span></button>
      <div class="btn-row">
        <button type="button" class="sq-btn btn-blue" data-act="retry" aria-label="Retry">${icon('retry')}<span>RETRY</span></button>
        <button type="button" class="sq-btn btn-blue" data-act="settings" aria-label="Settings">${icon('gear')}<span>SETTINGS</span></button>
        <button type="button" class="sq-btn btn-red" data-act="home" aria-label="Home">${icon('home')}<span>HOME</span></button>
      </div>
    </div>`;
  const lvl = root.querySelector('.pause-level');
  return {
    el: root,
    show() {
      const r = ui.game.run;
      lvl.textContent = !r ? '' : r.mode === 'endless' ? 'ENDLESS RUN' : `LEVEL ${r.levelId} · ${r.name}`;
    },
    onAct(act) {
      const g = ui.game;
      if (act === 'resume') { ui.closeModal('pause'); g.resume(); }
      else if (act === 'retry') { ui.closeModals(); g.retry(); }
      else if (act === 'settings') ui.openModal('settings', { modal: true });
      else if (act === 'home') { ui.closeModals(); g.quitToMenu(); }
    },
    onBack() { ui.closeModal('pause'); ui.game.resume(); },
  };
}
