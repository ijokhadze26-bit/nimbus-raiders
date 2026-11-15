// COMPARE (SPEC2 §5): two weapons or two heroes side by side. Item A is the page's current item; B is picked
// from the chip row. Two scissored 3D previews (ui/preview.js), both items' bars overlaid (A blue, B gold),
// exact numbers side by side, strong / weak icons, one shared Mk control (weapons) or "Ability power at Mk N"
// (heroes: Meteor / Shockwave / Fortress numbers only), and TRY IT per column.
// Opened with ui.openModal('compare', { kind: 'weapon' | 'hero', a, b, mk, page, opts }). It is a full-height
// sheet made of opaque bands around the two preview holes; the page below is hidden (and its preview paused)
// while the sheet is fully shown, so the holes look straight at the canvas.
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';
import { WEAPON_DEFS, WEAPON_BY_ID } from '../../data/weapons.js';
import { HERO_DEFS, HERO_DEF_BY_ID } from '../../data/heroes.js';
import { isWeaponUnlocked, isHeroUnlocked, heroWeapon, lockText } from '../../save/unlocks.js';
import { weaponBars, heroBars, weaponParts, abilityParts, healthLine, speedLine, bonusLine, favouriteInfo, targets, mkLabel, SCALED_ABILITIES } from '../infofmt.js';
import { weaponIcon, heroIcon, targetIcon } from '../icons2.js';
import { createPreview } from '../preview.js';
import { chipHtml, mkControl, ENTER_MS } from './armory.js';
import '../info.css';

export function createCompare(ui) {
  const el = screenEl('compare', 'cmp-screen');
  el.innerHTML = `
    <div class="cmp-head">
      <div class="cmp-top"><div class="plaque plaque-purple"><span>COMPARE</span></div>
        <button type="button" class="ibtn ibtn-red cmp-close" data-act="close" aria-label="Close">${icon('close')}</button></div>
      <div class="chip-row cmp-chips" role="toolbar" aria-label="Compare with"></div>
    </div>
    <div class="cmp-pvrow"><div class="cmp-gap"></div><div class="pv cmp-pv a"><div class="pv-fade"></div><span class="cmp-tag a">A</span></div><div class="cmp-gap mid"></div><div class="pv cmp-pv b"><div class="pv-fade"></div><span class="cmp-tag b">B</span></div><div class="cmp-gap"></div></div>
    <div class="info-scroll cmp-body"></div>`;
  const chips = el.querySelector('.cmp-chips'), body = el.querySelector('.cmp-body');
  const pvA = el.querySelector('.cmp-pv.a'), pvB = el.querySelector('.cmp-pv.b');
  const prevA = createPreview(ui), prevB = createPreview(ui);
  let o = {}, mk = 3, hideT = 0, pageEl = null, pagePrev = null;

  const isHero = () => o.kind === 'hero';
  const defs = () => (isHero() ? HERO_DEFS : WEAPON_DEFS);
  const byId = (id) => (isHero() ? HERO_DEF_BY_ID[id] : WEAPON_BY_ID[id]);
  const unlocked = (id) => (isHero() ? isHeroUnlocked(ui.save.data, id) : isWeaponUnlocked(ui.save.data, id));
  const iconOf = (id) => (isHero() ? heroIcon(id) : weaponIcon(id));
  const heroWpn = (id) => heroWeapon(ui.save.data, id, ui.save.data.arsenal.selected);
  const item = (id) => (isHero() ? { kind: 'hero', id, weapon: heroWpn(id), mk: 3, locked: !unlocked(id) } : { kind: 'weapon', id, mk, locked: !unlocked(id) });

  function overlayBars(a, b) {
    const A = isHero() ? heroBars(a) : weaponBars(a), B = isHero() ? heroBars(b) : weaponBars(b);
    const w = (v) => Math.round(Math.max(0.04, Math.min(1, v)) * 100);
    return `<div class="bars cmp-bars">${A.map((x, i) => `<div class="bar"><span class="bar-l">${x.label.replace(/^Special: /, '')}</span><span class="bar-t two">`
      + `<i class="a" style="width:${w(x.value)}%"></i><i class="b" style="width:${w(B[i].value)}%"></i></span>`
      + `${x.text != null ? `<span class="bar-v num"><b class="a">${x.text}</b><b class="b">${B[i].text}</b></span>` : ''}</div>`).join('')}</div>`;
  }
  function lines(d) {
    if (!isHero()) return weaponParts(d, mk);
    const fav = favouriteInfo(d, ui.save.data);
    return [healthLine(d), speedLine(d), bonusLine(d), `${d.passive.name}: ${d.passive.text}`, `${d.ability.name}: ${abilityParts(d, mk).join('. ')}`, fav.text];
  }
  const sw = (d, key) => `<ul class="cmp-sw">${targets(d[key]).map((t) => `<li title="${t.name}${t.why ? ': ' + t.why : ''}"><span class="sw-ico">${targetIcon(t.id)}</span><span>${t.name}</span></li>`).join('')}</ul>`;
  function col(d, side) {
    const lk = !unlocked(d.id);
    return `<div class="cmp-col ${side}"><div class="cmp-name"><span class="ip-ico">${iconOf(d.id)}</span><b>${d.name}</b></div>`
      + (lk ? `<div class="lock-line small">${lockText(d)}</div>` : '')
      + `<ul class="cmp-lines">${lines(d).map((t) => `<li>${t}</li>`).join('')}</ul>`
      + `<h5>STRONG</h5>${sw(d, 'strong')}<h5>WEAK</h5>${sw(d, 'weak')}`
      + `<button type="button" class="btn btn-blue cmp-try" data-act="try" data-side="${side}">${icon('play')}<span>TRY IT</span></button></div>`;
  }
  function render(keep = false) {
    const y = body.scrollTop;
    const a = byId(o.a), b = byId(o.b);
    chips.innerHTML = defs().map((x) => chipHtml({ id: x.id, name: x.name, short: x.short || x.name, ico: iconOf(x.id), locked: unlocked(x.id) ? '' : lockText(x), sel: x.id === o.b, act: 'pickb',
      badge: x.id === o.a ? '<i class="cmp-a">A</i>' : '' })).join('');
    const showMk = !isHero() || SCALED_ABILITIES.has(a.ability.id) || SCALED_ABILITIES.has(b.ability.id);
    body.innerHTML = `<div class="cmp-legend"><span class="a">${a.name}</span><span class="vs">VS</span><span class="b">${b.name}</span></div>`
      + (showMk ? mkControl(mk, isHero() ? `Ability power at ${mkLabel(mk)}` : 'Power level') : '')
      + overlayBars(a, b) + `<div class="cmp-cols">${col(a, 'a')}${col(b, 'b')}</div>`;
    if (keep) body.scrollTop = y;
  }
  function suspendPage(on) {
    if (!pageEl) return;
    pageEl.style.visibility = on ? 'hidden' : '';
    pagePrev?.suspend(on);
  }

  return {
    el,
    show(opts = {}) {
      o = { kind: 'weapon', ...opts };
      if (!byId(o.a)) o.a = defs()[0].id;
      if (!byId(o.b) || o.b === o.a) o.b = defs()[(defs().findIndex((x) => x.id === o.a) + 1) % defs().length].id;
      mk = Math.max(1, Math.min(5, o.mk | 0 || 3));
      const pg = o.page && ui.screens[o.page];
      pageEl = pg ? pg.el : null;
      pagePrev = pg ? pg.preview : null;
      render();
      prevA.show(pvA, item(o.a));
      prevB.show(pvB, item(o.b));
      clearTimeout(hideT);
      hideT = setTimeout(() => { if (ui.modals.includes('compare')) { suspendPage(true); prevA.measure(); prevB.measure(); } }, ENTER_MS);
    },
    hide() {
      clearTimeout(hideT);
      suspendPage(false);
      prevA.hide(); prevB.hide();
      pageEl = null; pagePrev = null;
    },
    onAct(act, btn) {
      if (act === 'close') ui.closeModal('compare');
      else if (act === 'pickb') {
        const id = btn.dataset.id;
        if (id === o.a || id === o.b) return;
        o.b = id;
        render(true);
        prevB.set(item(o.b));
      } else if (act === 'mk') {
        mk = Number(btn.dataset.mk) || 3;
        render(true);
        if (!isHero()) { prevA.set(item(o.a)); prevB.set(item(o.b)); }
      } else if (act === 'try') {
        const id = btn.dataset.side === 'b' ? o.b : o.a;
        const key = isHero() ? 'hero' : 'weapon';
        ui.game.practiceReturn = { screen: o.page || (isHero() ? 'heroes' : 'armory'), opts: { ...(o.opts || {}), [key]: o.a, mk } };
        ui.closeModal('compare');
        if (isHero()) ui.game.startPractice({ hero: id, weapon: heroWpn(id), mk: 3 });
        else ui.game.startPractice({ weapon: id, hero: ui.game.loadout.hero, mk });
      }
    },
    onBack() { ui.closeModal('compare'); },
  };
}
