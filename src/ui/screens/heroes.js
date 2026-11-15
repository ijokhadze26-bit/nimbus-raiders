// HEROES page (SPEC2 §5). FOUNDATION STUB (owned by the UI builder): a hero chip strip and the selected hero's
// name / blurb / lock line / stats, with EQUIP, BUY, TRY IT. Opened with ui.nav('heroes', { from, levelId, hero }).
import { screenEl, coinPill } from '../ui.js';
import { icon } from '../icons.js';
import { HERO_DEFS, HERO_DEF_BY_ID } from '../../data/heroes.js';
import { isHeroUnlocked, buyHero, selectHero, markSeen, canBuy, heroWeapon } from '../../save/unlocks.js';
import { lockText, heroLines } from '../infofmt.js';
import { heroIcon } from '../icons2.js';
import '../info.css';

export function createHeroes(ui) {
  const el = screenEl('heroes', 'info-page');
  el.innerHTML = `
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple"><span>HEROES</span></div>
      ${coinPill()}
    </div>
    <div class="chip-row"></div>
    <div class="info-scroll"></div>
    <div class="info-foot"></div>`;
  const row = el.querySelector('.chip-row'), body = el.querySelector('.info-scroll'), foot = el.querySelector('.info-foot');
  let opts = {}, cur = null;
  function render() {
    const d = ui.save.data;
    row.innerHTML = HERO_DEFS.map((h) => {
      const un = isHeroUnlocked(d, h.id);
      const label = un ? h.name : `${h.name}, ${lockText(h)}`;
      return `<button type="button" class="chip${h.id === cur ? ' sel' : ''}${un ? '' : ' locked'}" data-act="pick" data-id="${h.id}" aria-label="${label}" title="${label}">${heroIcon(h.id)}<span>${h.name}</span></button>`;
    }).join('');
    const h = HERO_DEF_BY_ID[cur], un = isHeroUnlocked(d, cur);
    body.innerHTML = `<div class="info-item">${un ? '' : `<div class="lock-line">${lockText(h)}</div>`}<h3>${h.name} <small>${h.title}</small></h3><p>${h.blurb}</p>${heroLines(h).map((t) => `<div>${t}</div>`).join('')}</div>`;
    foot.innerHTML = (un ? `<button type="button" class="btn btn-green btn-md" data-act="equip">EQUIP</button>`
      : `<button type="button" class="btn btn-gold btn-md${canBuy(ui.save, 'hero', cur) ? '' : ' is-disabled'}" data-act="buy">BUY ${h.unlock.coins}</button>`)
      + `<button type="button" class="btn btn-blue btn-md" data-act="try">TRY IT</button>`;
  }
  return {
    el,
    show(o = {}) {
      opts = o || {};
      cur = HERO_DEF_BY_ID[opts.hero] ? opts.hero : ui.save.data.heroes.selected;
      markSeen(ui.save, 'hero', cur);
      ui.refreshCoins(true);
      render();
    },
    onAct(act, btn) {
      if (act === 'back') ui.nav(opts.from || 'title', opts);
      else if (act === 'pick') { cur = btn.dataset.id; markSeen(ui.save, 'hero', cur); render(); }
      else if (act === 'equip') { selectHero(ui.save, cur); render(); }
      else if (act === 'buy') { if (buyHero(ui.save, cur)) ui.sfx('purchase'); render(); }
      else if (act === 'try') {
        ui.game.practiceReturn = { screen: 'heroes', opts: { ...opts, hero: cur } };
        ui.game.startPractice({ hero: cur, weapon: heroWeapon(ui.save.data, cur, ui.save.data.arsenal.selected), mk: 3 });
      }
    },
    onBack() { ui.nav(opts.from || 'title', opts); },
  };
}
