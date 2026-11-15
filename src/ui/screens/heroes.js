// HEROES page (SPEC2 §5): same layout as the Armory (shared builder in armory.js). The preview shows the hero
// running in place with its favourite weapon (if unlocked, else the selected one) and its ability pose + effect
// every 4 s. Body: stats bars + exact lines, passive, ability (numbers at the 50-raider reference; the
// "Ability power at Mk N" control drives only Meteor / Shockwave / Fortress), favourite weapon with its lock
// note, and STRONG / WEAK with each entry's reason. Opened with ui.nav('heroes', { from, levelId, mode, hero }).
import { icon } from '../icons.js';
import { HERO_DEFS, HERO_DEF_BY_ID } from '../../data/heroes.js';
import { isHeroUnlocked, buyHero, selectHero, heroWeapon } from '../../save/unlocks.js';
import { heroBars, healthLine, speedLine, bonusLine, abilityParts, favouriteInfo, SCALED_ABILITIES, mkLabel } from '../infofmt.js';
import { heroIcon, weaponIcon, abilityIcon } from '../icons2.js';
import { createInfoPage, barsHtml, mkControl, swHtml } from './armory.js';

export function createHeroes(ui) {
  const weaponFor = (h) => heroWeapon(ui.save.data, h.id, ui.save.data.arsenal.selected);
  return createInfoPage(ui, {
    name: 'heroes', title: 'HEROES', kind: 'hero', defs: HERO_DEFS, byId: HERO_DEF_BY_ID, optKey: 'hero',
    unlocked: isHeroUnlocked, buy: buyHero, select: selectHero, selected: (d) => d.heroes.selected, icon: heroIcon,
    item: (h) => ({ kind: 'hero', id: h.id, weapon: weaponFor(h), mk: 3 }),
    tryIt: (h) => ({ hero: h.id, weapon: weaponFor(h), mk: 3 }),
    badge: (h) => `<span class="pv-ab">${abilityIcon(h.ability.id)}<span>${h.ability.name}</span></span>`,
    bodyHtml: (h, p) => {
      const fav = favouriteInfo(h, ui.save.data);
      const scaled = SCALED_ABILITIES.has(h.ability.id);
      return `<div class="ip-title"><span class="ip-ico">${heroIcon(h.id)}</span><div class="ip-tt"><h2>${h.name}</h2><span class="tag hero-tag">${h.title.toUpperCase()}</span></div></div>`
        + `<p class="ip-blurb">${h.blurb}</p>`
        + `<div class="ip-card"><h4>WHAT MAKES ${h.name.toUpperCase()} SPECIAL</h4><p>${h.special}</p></div>`
        + barsHtml(heroBars(h), 'hero-bars')
        + `<div class="exact"><ul><li>${healthLine(h)}</li><li>${speedLine(h)}</li><li>${bonusLine(h)}</li></ul></div>`
        + `<div class="ip-card passive"><h4>PASSIVE · ${h.passive.name.toUpperCase()}</h4><p>${h.passive.text}</p></div>`
        + `<div class="ip-card ability"><div class="ab-head"><span class="ab-ico">${abilityIcon(h.ability.id)}</span><h4>ABILITY · ${h.ability.name.toUpperCase()}</h4></div>`
        + `<ul>${abilityParts(h, p.mk).map((t) => `<li>${t}</li>`).join('')}</ul>`
        + (scaled ? mkControl(p.mk, `Ability power at ${mkLabel(p.mk)}`) : '') + '</div>'
        + `<div class="ip-card fav${fav.locked ? ' locked' : ''}"><span class="fav-ico">${fav.id ? weaponIcon(fav.id) : ''}${fav.locked ? `<span class="chip-lock">${icon('lock')}</span>` : ''}</span>`
        + `<div><h4>${fav.text}</h4><p>${fav.note}</p></div></div>`
        + swHtml(h, true);
    },
  });
}
