// Title: animated logo over the live attract scene, big PLAY (-> level map), ENDLESS / SHOP / SETTINGS,
// music + sound toggles, daily reward badge and the coin total. Update 2: an ARMORY / HEROES tile row (same
// .tbtn tiles) sits between the logo and the attract squad, with a NEW dot while an unlocked item is unseen.
import { screenEl, coinPill } from '../ui.js';
import { icon } from '../icons.js';
import { createLogo, replayLogo } from '../logo.js';
import { LAST_LEVEL } from '../../data/levels.js';
import { WEAPON_IDS } from '../../data/weapons.js';
import { HERO_IDS } from '../../data/heroes.js';
import { isNew } from '../../save/unlocks.js';
import { weaponIcon, heroIcon } from '../icons2.js';

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
    <div class="title-upper"><div class="title-logo"></div>
      <div class="title-row title-row2">
        <button type="button" class="tbtn btn-gold" data-act="armory">${weaponIcon('thunderclap')}<span>ARMORY</span><i class="tdot" hidden>NEW</i></button>
        <button type="button" class="tbtn btn-red" data-act="heroes">${heroIcon('pip')}<span>HEROES</span><i class="tdot" hidden>NEW</i></button>
      </div>
    </div>
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
  const dots = { armory: el.querySelector('[data-act="armory"] .tdot'), heroes: el.querySelector('[data-act="heroes"] .tdot') };
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
      lvl.textContent = `LEVEL ${Math.min(LAST_LEVEL, d.unlockedLevel)}`;
      daily.classList.toggle('ready', ui.screens.daily.available());
      dots.armory.hidden = !WEAPON_IDS.some((id) => isNew(d, 'weapon', id) && id !== 'thunderclap');
      dots.heroes.hidden = !HERO_IDS.some((id) => isNew(d, 'hero', id) && id !== 'pip');
      syncToggles();
      ui.refreshCoins(true);
      replayLogo(logo);
    },
    onAct(act) {
      if (act === 'play') ui.nav('map');
      else if (act === 'endless') ui.nav('endless');
      else if (act === 'shop') ui.nav('shop');
      else if (act === 'settings') ui.nav('settings');
      else if (act === 'armory') ui.nav('armory', { from: 'title' });
      else if (act === 'heroes') ui.nav('heroes', { from: 'title' });
      else if (act === 'daily') ui.openModal('daily');
      else if (act === 'music' || act === 'sfx') toggle(act);
    },
    refreshDaily() { daily.classList.toggle('ready', ui.screens.daily.available()); },
  };
}
