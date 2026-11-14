// Endless intro: best distance, a short pitch, PLAY (-> game.startEndless()).
import { screenEl, coinPill, fmt } from '../ui.js';
import { icon } from '../icons.js';

export function createEndless(ui) {
  const root = screenEl('endless');
  root.innerHTML = `
    <div class="menu-bg endless-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple">${icon('infinity')}<span>ENDLESS</span></div>
      ${coinPill()}
    </div>
    <div class="endless-body">
      <div class="endless-emblem">${icon('infinity')}</div>
      <div class="endless-title">HOW FAR CAN<br>YOU RAID?</div>
      <div class="panel panel-best">
        <div class="best-label">${icon('trophy')} BEST DISTANCE</div>
        <div class="best-val num"><span class="bv">0</span><small>m</small></div>
      </div>
      <ul class="endless-points">
        <li>${icon('flag')}<span>The bridge never ends - it only gets harder</span></li>
        <li>${icon('skull')}<span>A boss guards every 700 m</span></li>
        <li>${icon('coin')}<span>Earn coins for distance and kills</span></li>
      </ul>
    </div>
    <div class="map-footer">
      <button type="button" class="btn btn-purple btn-xl" data-act="play">
        <span class="play-ico">${icon('play')}</span><span class="col"><span class="big">PLAY</span><span class="sub">ENDLESS RUN</span></span>
      </button>
    </div>`;
  const bv = root.querySelector('.bv');
  return {
    el: root,
    show() { bv.textContent = fmt(ui.save.data.endlessBest); ui.refreshCoins(true); },
    onAct(act) {
      if (act === 'back') ui.nav('title');
      else if (act === 'play') ui.game.startEndless();
    },
    onBack() { ui.nav('title'); },
  };
}
