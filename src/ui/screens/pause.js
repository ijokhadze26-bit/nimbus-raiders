// Pause menu (modal while game.state === 'paused'): resume, retry, settings, home. A TRY IT practice run shows
// END PRACTICE instead of HOME (back to the Armory / Heroes item it came from).
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';
import { weaponDef } from '../../data/weapons.js';
import { heroDef } from '../../data/heroes.js';

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
        <button type="button" class="sq-btn btn-red sq-wide" data-act="endpractice" aria-label="End practice">${icon('back')}<span>END PRACTICE</span></button>
      </div>
    </div>`;
  const lvl = root.querySelector('.pause-level');
  const home = root.querySelector('[data-act="home"]'), endP = root.querySelector('[data-act="endpractice"]');
  return {
    el: root,
    show() {
      const r = ui.game.run;
      const practice = !!r && r.mode === 'practice';
      lvl.textContent = !r ? '' : r.mode === 'endless' ? 'ENDLESS RUN' : ui.game.modes?.owns(r.mode) ? r.name // stage 5 modes
        : practice ? `PRACTICE · ${heroDef(r.hero).name} + ${weaponDef(r.weapon).name}` : `LEVEL ${r.levelId} · ${r.name}`;
      home.hidden = practice;
      endP.hidden = !practice;
    },
    onAct(act) {
      const g = ui.game;
      if (act === 'resume') { ui.closeModal('pause'); g.resume(); }
      else if (act === 'retry') { ui.closeModals(); g.retry(); }
      else if (act === 'settings') ui.openModal('settings', { modal: true });
      else if (act === 'home') { ui.closeModals(); g.quitToMenu(); }
      else if (act === 'endpractice') { const p = g.practiceReturn || { screen: 'armory', opts: {} }; ui.closeModals(); ui.nav(p.screen, p.opts); }
    },
    onBack() { ui.closeModal('pause'); ui.game.resume(); },
  };
}
