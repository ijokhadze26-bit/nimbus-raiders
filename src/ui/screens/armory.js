// ARMORY page (SPEC2 §5). FOUNDATION STUB (owned by the UI builder): a weapon chip strip, the selected weapon's
// name / blurb / lock line / exact numbers, and EQUIP, BUY, COMPARE, TRY IT. Opened with ui.nav('armory',
// { from, levelId, weapon }); BACK returns to opts.from || 'title' with the opts.
import { screenEl, coinPill } from '../ui.js';
import { icon } from '../icons.js';
import { WEAPON_DEFS, WEAPON_BY_ID } from '../../data/weapons.js';
import { isWeaponUnlocked, buyWeapon, selectWeapon, markSeen, canBuy } from '../../save/unlocks.js';
import { lockText, weaponLines } from '../infofmt.js';
import { weaponIcon } from '../icons2.js';
import '../info.css';

export function createArmory(ui) {
  const el = screenEl('armory', 'info-page');
  el.innerHTML = `
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple"><span>ARMORY</span></div>
      ${coinPill()}
    </div>
    <div class="chip-row"></div>
    <div class="info-scroll"></div>
    <div class="info-foot"></div>`;
  const row = el.querySelector('.chip-row'), body = el.querySelector('.info-scroll'), foot = el.querySelector('.info-foot');
  let opts = {}, cur = null;
  function render() {
    const d = ui.save.data;
    row.innerHTML = WEAPON_DEFS.map((w) => {
      const un = isWeaponUnlocked(d, w.id);
      const label = un ? w.name : `${w.name}, ${lockText(w)}`;
      return `<button type="button" class="chip${w.id === cur ? ' sel' : ''}${un ? '' : ' locked'}" data-act="pick" data-id="${w.id}" aria-label="${label}" title="${label}">${weaponIcon(w.id)}<span>${w.short}</span></button>`;
    }).join('');
    const w = WEAPON_BY_ID[cur], un = isWeaponUnlocked(d, cur);
    body.innerHTML = `<div class="info-item">${un ? '' : `<div class="lock-line">${lockText(w)}</div>`}<h3>${w.name} <small>${w.tag}</small></h3><p>${w.blurb}</p><p>${w.special}</p>${weaponLines(w, 3).map((t) => `<div>${t}</div>`).join('')}</div>`;
    foot.innerHTML = (un ? `<button type="button" class="btn btn-green btn-md" data-act="equip">EQUIP</button>`
      : `<button type="button" class="btn btn-gold btn-md${canBuy(ui.save, 'weapon', cur) ? '' : ' is-disabled'}" data-act="buy">BUY ${w.unlock.coins}</button>`)
      + `<button type="button" class="btn btn-blue btn-md" data-act="try">TRY IT</button>`;
  }
  return {
    el,
    show(o = {}) {
      opts = o || {};
      cur = WEAPON_BY_ID[opts.weapon] ? opts.weapon : ui.save.data.arsenal.selected;
      markSeen(ui.save, 'weapon', cur);
      ui.refreshCoins(true);
      render();
    },
    onAct(act, btn) {
      if (act === 'back') ui.nav(opts.from || 'title', opts);
      else if (act === 'pick') { cur = btn.dataset.id; markSeen(ui.save, 'weapon', cur); render(); }
      else if (act === 'equip') { selectWeapon(ui.save, cur); render(); }
      else if (act === 'buy') { if (buyWeapon(ui.save, cur)) ui.sfx('purchase'); render(); }
      else if (act === 'try') { ui.game.practiceReturn = { screen: 'armory', opts: { ...opts, weapon: cur } }; ui.game.startPractice({ weapon: cur, hero: ui.game.loadout.hero, mk: 3 }); }
    },
    onBack() { ui.nav(opts.from || 'title', opts); },
  };
}
