// Pre-level LOADOUT (SPEC2 §5). Every level start goes through it (map node, map PLAY, result NEXT, endless
// PLAY; RETRY, ?level=N and debug.startLevel skip it). Top: level, boss and the weapons this level favours
// (unlocked ones get a gold star), and since update 3 the world name + a BOSS / MINI-BOSS / FINAL RUSH tag.
// Middle: 3D preview of the chosen hero holding the chosen weapon. Below: HERO
// and WEAPON chip rows (locked chips are silhouettes; tapping one shows the lock line + BUY when affordable),
// INFO buttons to the Heroes / Armory pages, START and BACK.
// Opened with ui.nav('loadout', { levelId }) or { mode: 'endless' }.
// Update 3 stage 3: an ELITE switch above START (campaign levels only; locked until the level has 3 stars).
// The choice is remembered while the game is open (eliteOn) and applies to every elite-open level.
import { screenEl, coinPill, bump, fmt } from '../ui.js';
import { icon } from '../icons.js';
import { HERO_DEFS, HERO_DEF_BY_ID } from '../../data/heroes.js';
import { WEAPON_DEFS, WEAPON_BY_ID } from '../../data/weapons.js';
import { getLevel } from '../../data/levels.js';
import { bossDef } from '../../data/bosses.js';
import { isHeroUnlocked, isWeaponUnlocked, selectHero, selectWeapon, canBuy, buyHero, buyWeapon, isNew } from '../../save/unlocks.js';
import { lockText } from '../infofmt.js';
import { heroIcon, weaponIcon, bossIcon, infoIcon } from '../icons2.js';
import { createPreview } from '../preview.js';
import { chipHtml, ENTER_MS } from './armory.js';
import { worldOf } from '../../data/worlds.js';
import { bossName, kindTag } from '../worldart.js';
import '../info.css';
import { eliteUnlocked, eliteStars } from '../../data/elite.js';
import { eliteRowHtml } from '../elite.js';
import { modeHeader } from './modes.js';

const STAR = `<i class="fav-star" aria-hidden="true">${icon('star')}</i>`;

export function createLoadout(ui) {
  const el = screenEl('loadout', 'info-page lo-page');
  el.innerHTML = `
    <div class="ip-head lo-head">
      <div class="topbar ip-top">
        <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
        <div class="plaque plaque-purple"><span class="lo-title">LOADOUT</span></div>
        ${coinPill()}
      </div>
      <div class="lo-level"></div>
    </div>
    <div class="pv lo-pv"><div class="pv-fade"></div><div class="lo-cap"></div></div>
    <div class="info-scroll lo-body">
      <div class="lo-sec"><h4>HERO</h4><button type="button" class="btn btn-blue lo-info" data-act="info-hero" aria-label="Hero info">${infoIcon()}<span>INFO</span></button></div>
      <div class="chip-row lo-heroes" role="toolbar" aria-label="Hero"></div>
      <div class="lo-sec"><h4>WEAPON</h4><button type="button" class="btn btn-blue lo-info" data-act="info-weapon" aria-label="Weapon info">${infoIcon()}<span>INFO</span></button></div>
      <div class="chip-row lo-weapons" role="toolbar" aria-label="Weapon"></div>
      <div class="lo-lock" hidden></div>
    </div>
    <div class="info-foot lo-foot"><div class="lo-elite-slot" hidden></div><button type="button" class="btn btn-gold btn-lg lo-start" data-act="start">${icon('play')}<span>START</span></button></div>`;
  const $ = (s) => el.querySelector(s);
  const heroesRow = $('.lo-heroes'), weaponsRow = $('.lo-weapons'), level = $('.lo-level'), title = $('.lo-title');
  const cap = $('.lo-cap'), lock = $('.lo-lock'), pvEl = $('.lo-pv');
  const preview = createPreview(ui);
  const eliteSlot = $('.lo-elite-slot'), foot = $('.lo-foot'), startBtn = $('.lo-start');
  let opts = {}, skipT = 0, pending = null; // pending = { kind, id } of a tapped locked chip
  let eliteOn = false;                       // the ELITE switch (kept across levels while the game is open)

  const def = () => (opts.levelId ? getLevel(opts.levelId) : null);
  const favours = () => (def() && def().favours) || [];

  function renderLevel() {
    const L = def(), d = ui.save.data;
    if (!L) { const h = modeHeader(opts, ui); title.textContent = h.title; level.innerHTML = h.html; return; } // endless / stage 5 modes
    title.textContent = `LEVEL ${L.id}`;
    const B = L.boss ? bossDef(L.boss.type) : null;
    const fav = favours().map((id) => `<span class="lo-favw${isWeaponUnlocked(d, id) ? ' on' : ''}" title="${WEAPON_BY_ID[id].name}">${weaponIcon(id)}${isWeaponUnlocked(d, id) ? STAR : ''}</span>`).join('');
    const W = worldOf(L.id), tag = kindTag(L.id, L);
    level.innerHTML = `<div class="lo-world" style="--wc:${W.color}"><span class="lo-wname">WORLD ${W.id} · ${W.name}</span>`
      + `<span class="lo-tag t-${tag === 'FINAL RUSH' ? 'rush' : tag === 'BOSS' ? 'boss' : 'mini'}">${tag}</span></div>`
      + `<div class="lo-name">${L.name.toUpperCase()}</div>`
      + `<div class="lo-sub">${B ? `<span class="lo-boss">${bossIcon(B.type)}<span>${bossName(L.id, L) || B.name}</span></span>` : ''}`
      + (fav ? `<span class="lo-fav"><b>FAVOURED:</b>${fav}</span>` : '') + '</div>';
  }
  function renderChips() {
    const d = ui.save.data, fav = favours();
    heroesRow.innerHTML = HERO_DEFS.map((h) => chipHtml({ id: h.id, name: h.name, ico: heroIcon(h.id), act: 'hero', sel: h.id === d.heroes.selected,
      locked: isHeroUnlocked(d, h.id) ? '' : lockText(h), fresh: isNew(d, 'hero', h.id) })).join('');
    weaponsRow.innerHTML = WEAPON_DEFS.map((w) => chipHtml({ id: w.id, name: w.name, short: w.short, ico: weaponIcon(w.id), act: 'weapon', sel: w.id === d.arsenal.selected,
      locked: isWeaponUnlocked(d, w.id) ? '' : lockText(w), fresh: isNew(d, 'weapon', w.id), badge: fav.includes(w.id) ? STAR : '' })).join('');
    for (const row of [heroesRow, weaponsRow]) {
      const s = row.querySelector('.chip.sel');
      if (s) row.scrollLeft = Math.max(0, s.offsetLeft - (row.clientWidth - s.offsetWidth) / 2);
    }
  }
  function renderCap() {
    const d = ui.save.data, h = HERO_DEF_BY_ID[d.heroes.selected], w = WEAPON_BY_ID[d.arsenal.selected];
    const favd = favours().includes(w.id), heroFav = h.favourite === w.id;
    cap.innerHTML = `<span class="lo-cap-h">${h.name}</span><span class="lo-cap-w">${w.name}</span>`
      + `${favd ? `<span class="lo-good">${icon('star')}FAVOURED HERE</span>` : ''}${heroFav ? `<span class="lo-good blue">+15% ${h.name.toUpperCase()}'S FAVOURITE</span>` : ''}`;
  }
  function renderLock() {
    if (!pending) { lock.hidden = true; lock.innerHTML = ''; return; }
    const D = pending.kind === 'hero' ? HERO_DEF_BY_ID[pending.id] : WEAPON_BY_ID[pending.id];
    const can = canBuy(ui.save, pending.kind, pending.id);
    lock.hidden = false;
    lock.innerHTML = `<span class="lo-lock-ico">${pending.kind === 'hero' ? heroIcon(D.id) : weaponIcon(D.id)}</span><div class="lo-lock-t"><b>${D.name}</b><span>${lockText(D)}</span></div>`
      + (can ? `<button type="button" class="btn btn-gold btn-sm" data-act="buy"><span class="coin-ico">${icon('coin')}</span><span class="num">${D.unlock.coins}</span></button>` : '')
      + `<button type="button" class="ibtn ibtn-blue lo-lock-x" data-act="lock-close" aria-label="Close">${icon('close')}</button>`;
  }
  // the gun shown is the Mk the run starts at (shop Starting Weapon upgrade)
  function item() { const d = ui.save.data; return { kind: 'loadout', hero: d.heroes.selected, weapon: d.arsenal.selected, mk: Math.min(5, 1 + (d.upgrades.tier | 0)) }; }
  const eliteOpen = () => !!def() && eliteUnlocked(ui.save.data, def().id);
  function renderElite() {
    const L = def();
    eliteSlot.hidden = !L;
    foot.classList.toggle('has-elite', !!L);
    const on = eliteOn && eliteOpen();
    eliteSlot.innerHTML = L ? eliteRowHtml({ unlocked: eliteOpen(), on, best: eliteStars(ui.save.data, L.id) }) : '';
    startBtn.classList.toggle('is-elite', on);
    startBtn.classList.toggle('btn-gold', !on);
    startBtn.querySelector('span').textContent = on ? 'START ELITE' : 'START';
  }
  function render() { renderLevel(); renderChips(); renderCap(); renderLock(); renderElite(); }
  function back() { ui.nav(opts.mode === 'endless' ? 'endless' : opts.mode ? 'modes' : 'map'); }
  function tap(kind, id) {
    const d = ui.save.data;
    const ok = kind === 'hero' ? isHeroUnlocked(d, id) : isWeaponUnlocked(d, id);
    if (!ok) { pending = { kind, id }; renderLock(); bump(lock); return; }
    pending = null;
    if (kind === 'hero') selectHero(ui.save, id); else selectWeapon(ui.save, id); // hero: favourite weapon if unlocked
    renderChips(); renderCap(); renderLock();
    preview.set(item());
  }

  return {
    el,
    preview,
    show(o = {}) {
      opts = o || {};
      pending = null;
      ui.refreshCoins(true);
      render();
      preview.show(pvEl, item());
      clearTimeout(skipT);
      skipT = setTimeout(() => { if (ui.current === 'loadout' && el.isConnected && !el.classList.contains('leave')) { ui.game.engine.skipMain = true; preview.measure(); } }, ENTER_MS);
    },
    hide() { clearTimeout(skipT); ui.game.engine.skipMain = false; preview.hide(); },
    onAct(act, btn) {
      const d = ui.save.data;
      if (act === 'back') back();
      else if (act === 'hero' || act === 'weapon') tap(act, btn.dataset.id);
      else if (act === 'lock-close') { pending = null; renderLock(); }
      else if (act === 'elite') {
        if (eliteOpen()) { eliteOn = !eliteOn; renderElite(); } else { const r = eliteSlot.firstElementChild; if (r) bump(r); ui.vibrate(30); }
      }
      else if (act === 'buy' && pending) {
        const ok = pending.kind === 'hero' ? buyHero(ui.save, pending.id) : buyWeapon(ui.save, pending.id);
        if (ok) { ui.sfx('purchase'); ui.vibrate(25); pending = null; render(); preview.set(item()); }
      } else if (act === 'info-hero' || act === 'info-weapon') {
        const back2 = { from: 'loadout', levelId: opts.levelId, mode: opts.mode, world: opts.world, roll: opts.roll };
        if (act === 'info-hero') ui.nav('heroes', { ...back2, hero: pending?.kind === 'hero' ? pending.id : d.heroes.selected });
        else ui.nav('armory', { ...back2, weapon: pending?.kind === 'weapon' ? pending.id : d.arsenal.selected });
      } else if (act === 'start') {
        // the selection is stored in the save on every tap; START copies it into the run's loadout
        ui.game.loadout.syncFromSave();
        if (opts.mode === 'endless') ui.game.startEndless(undefined, opts.world);
        else if (opts.mode) ui.game.startMode(opts.mode, opts); // stage 5: bossrush / daily / chaos
        else if (!ui.game.startLevel(opts.levelId || 1, { elite: eliteOn && eliteOpen() })) ui.nav('map');
      }
    },
    onBack: back,
    /** Test hooks: the ELITE switch state on screen. */
    eliteState: () => ({ open: eliteOpen(), on: eliteOn && eliteOpen() }),
  };
}
