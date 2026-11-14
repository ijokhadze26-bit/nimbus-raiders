// Title: animated logo over the live attract scene, big PLAY (-> level map), ENDLESS / SHOP / SETTINGS,
// music + sound toggles, daily reward badge and the coin total.
import { screenEl, coinPill } from '../ui.js';
import { icon } from '../icons.js';
import { createLogo, replayLogo } from '../logo.js';

export function createTitle(ui) {
  const el = screenEl('title');
  el.innerHTML = `
    <div class="title-vignette"></div>
    <div class="topbar">
      <div class="row-gap">
        <button type="button" class="ibtn ibtn-blue" data-act="music" aria-label="Music">${icon('music')}<span class="slash">${icon('mute')}</span></button>
        <button type="button" class="ibtn ibtn-blue" data-act="sfx" aria-label="Sound">${icon('sound')}<span class="slash">${icon('mute')}</span></button>
      </div>
      <div class="row-gap right">
        <button type="button" class="daily-badge" data-act="daily" aria-label="Daily reward">
          <span class="gift">${icon('gift')}</span><span class="dot">!</span><span class="lbl">DAILY</span>
        </button>
        ${coinPill()}
      </div>
    </div>
    <div class="title-logo"></div>
    <div class="title-menu">
      <button type="button" class="btn btn-gold btn-xl btn-play" data-act="play">
        <span class="play-ico">${icon('play')}</span><span class="col"><span class="big">PLAY</span><span class="sub lvl">LEVEL 1</span></span>
      </button>
      <div class="title-row">
        <button type="button" class="tbtn btn-purple" data-act="endless">${icon('infinity')}<span>ENDLESS</span></button>
        <button type="button" class="tbtn btn-green" data-act="shop">${icon('cart')}<span>SHOP</span></button>
        <button type="button" class="tbtn btn-blue" data-act="settings">${icon('gear')}<span>SETTINGS</span></button>
      </div>
    </div>`;
  const logo = createLogo('big');
  el.querySelector('.title-logo').appendChild(logo);
  const lvl = el.querySelector('.lvl');
  const daily = el.querySelector('.daily-badge');
  const musicBtn = el.querySelector('[data-act="music"]');
  const sfxBtn = el.querySelector('[data-act="sfx"]');

  function syncToggles() {
    const st = ui.save.data.settings;
    const a = ui.audio();
    const music = a?.isMusic ? a.isMusic() : st.music;
    const sfx = a?.isSfx ? a.isSfx() : st.sfx;
    musicBtn.classList.toggle('off', !music);
    sfxBtn.classList.toggle('off', !sfx);
  }

  function toggle(kind) {
    const st = ui.save.data.settings;
    const a = ui.audio();
    const cur = kind === 'music' ? (a?.isMusic ? a.isMusic() : st.music) : (a?.isSfx ? a.isSfx() : st.sfx);
    const on = !cur;
    try { if (kind === 'music') a?.setMusic?.(on); else a?.setSfx?.(on); } catch { /* optional */ }
    ui.save.setSetting(kind, on);
    syncToggles();
  }

  return {
    el,
    show() {
      const d = ui.save.data;
      lvl.textContent = `LEVEL ${d.unlockedLevel}`;
      daily.classList.toggle('ready', ui.screens.daily.available());
      syncToggles();
      ui.refreshCoins(true);
      replayLogo(logo);
    },
    onAct(act) {
      if (act === 'play') ui.nav('map');
      else if (act === 'endless') ui.nav('endless');
      else if (act === 'shop') ui.nav('shop');
      else if (act === 'settings') ui.nav('settings');
      else if (act === 'daily') ui.openModal('daily');
      else if (act === 'music' || act === 'sfx') toggle(act);
    },
    refreshDaily() { daily.classList.toggle('ready', ui.screens.daily.available()); },
  };
}
