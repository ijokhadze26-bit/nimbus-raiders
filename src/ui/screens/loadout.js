// Pre-level LOADOUT (SPEC2 §5). FOUNDATION STUB (owned by the UI builder): hero + weapon chip rows (locked =
// disabled, with the lock line), START (stores the selection, then starts the level / endless run) and BACK.
// Opened with ui.nav('loadout', { levelId }) or { mode: 'endless' }.
import { screenEl, coinPill } from '../ui.js';
import { icon } from '../icons.js';
import { HERO_DEFS } from '../../data/heroes.js';
import { WEAPON_DEFS } from '../../data/weapons.js';
import { getLevel } from '../../data/levels.js';
import { isHeroUnlocked, isWeaponUnlocked, selectHero, selectWeapon } from '../../save/unlocks.js';
import { lockText } from '../infofmt.js';
import { heroIcon, weaponIcon } from '../icons2.js';
import '../info.css';

export function createLoadout(ui) {
  const el = screenEl('loadout', 'info-page');
  el.innerHTML = `
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple"><span class="lo-title">LOADOUT</span></div>
      ${coinPill()}
    </div>
    <div class="info-scroll"><div class="lo-fav info-item"></div><div class="chip-row lo-heroes"></div><div class="chip-row lo-weapons"></div></div>
    <div class="info-foot"><button type="button" class="btn btn-gold btn-lg" data-act="start">${icon('play')}<span>START</span></button></div>`;
  const heroes = el.querySelector('.lo-heroes'), weapons = el.querySelector('.lo-weapons'), fav = el.querySelector('.lo-fav'), title = el.querySelector('.lo-title');
  let opts = {};
  function chips(list, sel, kind, unlocked, ico) {
    return list.map((x) => {
      const un = unlocked(x.id), label = un ? x.name : `${x.name}, ${lockText(x)}`;
      return `<button type="button" class="chip${x.id === sel ? ' sel' : ''}${un ? '' : ' locked'}" data-act="${kind}" data-id="${x.id}" aria-label="${label}" title="${label}">${ico(x.id)}<span>${x.short || x.name}</span></button>`;
    }).join('');
  }
  function render() {
    const d = ui.save.data;
    const def = opts.levelId ? getLevel(opts.levelId) : null;
    title.textContent = def ? `LV ${def.id} ${def.name.toUpperCase()}` : 'ENDLESS';
    fav.textContent = def && def.favours ? 'FAVOURED: ' + def.favours.join(', ') : '';
    heroes.innerHTML = chips(HERO_DEFS, d.heroes.selected, 'hero', (id) => isHeroUnlocked(d, id), heroIcon);
    weapons.innerHTML = chips(WEAPON_DEFS, d.arsenal.selected, 'weapon', (id) => isWeaponUnlocked(d, id), weaponIcon);
  }
  return {
    el,
    show(o = {}) { opts = o || {}; ui.refreshCoins(true); render(); },
    onAct(act, btn) {
      if (act === 'back') ui.nav(opts.mode === 'endless' ? 'endless' : 'map');
      else if (act === 'hero') { selectHero(ui.save, btn.dataset.id); render(); }
      else if (act === 'weapon') { selectWeapon(ui.save, btn.dataset.id); render(); }
      else if (act === 'start') {
        ui.game.loadout.syncFromSave();
        if (opts.mode === 'endless') ui.game.startEndless(); else ui.game.startLevel(opts.levelId || 1);
      }
    },
    onBack() { ui.nav(opts.mode === 'endless' ? 'endless' : 'map'); },
  };
}
