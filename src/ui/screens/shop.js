// Shop: Upgrades / Hero / Weapons tabs. Buying spends saved coins (debounced autosave), equips persist.
import { screenEl, coinPill, el, bump, fmt } from '../ui.js';
import { icon } from '../icons.js';
import { UPGRADES, upgradeCost, upgradeLabel } from '../../data/shop.js';
import { HERO_SKINS, WEAPON_SKINS } from '../../data/skins.js';
import { WEAPONS } from '../../data/weapons.js';
import { buySkin, buyUpgrade, equipSkin } from '../../save/progress.js';

const TABS = [['upgrades', 'UPGRADES'], ['hero', 'HERO'], ['weapons', 'WEAPONS']];

export function createShop(ui) {
  const root = screenEl('shop');
  root.innerHTML = `
    <div class="menu-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque">${icon('cart')}<span>SHOP</span></div>
      ${coinPill()}
    </div>
    <div class="tabs">${TABS.map(([id, n]) => `<button type="button" class="tab" data-act="tab" data-tab="${id}">${n}</button>`).join('')}</div>
    <div class="shop-body"><div class="shop-list"></div></div>`;
  const list = root.querySelector('.shop-list');
  const body = root.querySelector('.shop-body');
  let tab = 'upgrades';

  function render() {
    for (const b of root.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
    list.className = `shop-list list-${tab}`;
    list.innerHTML = tab === 'upgrades' ? upgradesHtml(ui.save.data) : skinsHtml(ui.save.data, tab);
  }

  /** Re-render buttons/levels in place (keeps scroll); `flashId` gets the purchase animation. */
  function refresh(flashId) {
    const y = body.scrollTop;
    render();
    body.scrollTop = y;
    if (!flashId) return;
    const card = list.querySelector(`[data-id="${flashId}"]`);
    if (card) {
      bump(card, 'bought');
      const fl = el('div', 'buy-float', tab === 'upgrades' ? 'LEVEL UP!' : 'UNLOCKED!');
      card.appendChild(fl);
      setTimeout(() => fl.remove(), 900);
    }
  }

  return {
    el: root,
    show(opts) {
      if (opts?.tab) tab = opts.tab;
      render();
      body.scrollTop = 0;
      ui.refreshCoins(true);
    },
    onAct(act, btn) {
      const save = ui.save;
      if (act === 'back') ui.nav('title');
      else if (act === 'tab') { tab = btn.dataset.tab; render(); body.scrollTop = 0; }
      else if (act === 'buy-up') {
        if (buyUpgrade(save, btn.dataset.id)) { ui.sfx('purchase'); ui.vibrate(25); refresh(btn.dataset.id); }
      } else if (act === 'buy-skin') {
        if (buySkin(save, btn.dataset.id)) { ui.sfx('purchase'); ui.vibrate(25); refresh(btn.dataset.id); }
      } else if (act === 'equip') {
        if (equipSkin(save, btn.dataset.id)) { refresh(); const c = list.querySelector(`[data-id="${btn.dataset.id}"]`); if (c) bump(c, 'equipped-pop'); }
      }
    },
    onBack() { ui.nav('title'); },
  };
}

function costBtn(act, id, cost, coins) {
  const can = coins >= cost;
  return `<button type="button" class="btn btn-sm ${can ? 'btn-green' : 'btn-grey is-disabled'}" data-act="${act}" data-id="${id}" ${can ? '' : 'aria-disabled="true"'}>
    <span class="coin-ico">${icon('coin')}</span><span class="num">${fmt(cost)}</span></button>`;
}

function upgradesHtml(d) {
  return UPGRADES.map((u) => {
    const lv = d.upgrades[u.id] | 0;
    const cost = upgradeCost(u.id, lv);
    const pct = (lv / u.max) * 100;
    const pips = u.max <= 15 ? Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('') : '';
    const next = cost == null ? '' : `<span class="next">${icon('back', 'arr')}${upgradeLabel(u.id, lv + 1)}</span>`;
    return `<div class="card up-card c-${u.color}" data-id="${u.id}">
      <div class="up-icon">${icon(u.icon)}</div>
      <div class="up-info">
        <div class="up-name">${u.name}</div>
        <div class="up-desc">${u.desc}</div>
        <div class="up-level"><span class="lv">LV ${lv}/${u.max}</span><span class="cur">${upgradeLabel(u.id, lv)}</span>${next}</div>
        ${pips ? `<div class="pips">${pips}</div>` : `<div class="meter"><i style="width:${pct}%"></i></div>`}
      </div>
      <div class="up-buy">${cost == null ? '<div class="maxed">MAX</div>' : costBtn('buy-up', u.id, cost, d.coins)}</div>
    </div>`;
  }).join('');
}

function skinsHtml(d, tab) {
  const skins = tab === 'hero' ? HERO_SKINS : WEAPON_SKINS;
  const equipped = tab === 'hero' ? d.skins.hero : d.skins.weapon;
  const threes = Object.values(d.stars).filter((n) => n >= 3).length;
  return skins.map((s) => {
    const owned = d.skins.owned.includes(s.id);
    const isEq = equipped === s.id;
    let action;
    if (isEq) action = `<div class="equipped">${icon('check')}EQUIPPED</div>`;
    else if (owned) action = `<button type="button" class="btn btn-sm btn-blue" data-act="equip" data-id="${s.id}">EQUIP</button>`;
    else action = costBtn('buy-skin', s.id, s.cost, d.coins);
    const hint = !owned && s.unlock?.threeStars ? `<div class="skin-hint">${icon('star')}${icon('star')}${icon('star')} ${threes}/${s.unlock.threeStars} levels</div>` : '';
    const preview = tab === 'hero' ? heroPreview(s) : weaponPreview(s);
    return `<div class="card skin-card r-${s.rarity} ${isEq ? 'is-eq' : ''} ${owned ? 'owned' : ''}" data-id="${s.id}">
      <div class="rarity">${s.rarity.toUpperCase()}</div>
      <div class="skin-prev">${preview}</div>
      <div class="skin-name">${s.name}</div>
      ${hint}
      <div class="skin-act">${action}</div>
    </div>`;
  }).join('');
}

/** Chibi Pip drawn with the skin palette. */
export function heroPreview(s) {
  const p = s.pip;
  return `<svg viewBox="0 0 100 112" class="hero-svg" aria-hidden="true">
    <ellipse cx="50" cy="106" rx="26" ry="5" fill="#1b3a8a" opacity=".22"/>
    <rect x="66" y="58" width="16" height="28" rx="6" fill="${p.jet}" stroke="#1b3a8a" stroke-width="3"/>
    <ellipse cx="74" cy="90" rx="5" ry="6" fill="${p.glow}" class="jet-glow"/>
    <rect x="34" y="82" width="11" height="20" rx="5" fill="${p.suit}" stroke="#1b3a8a" stroke-width="3"/>
    <rect x="55" y="82" width="11" height="20" rx="5" fill="${p.suit}" stroke="#1b3a8a" stroke-width="3"/>
    <rect x="28" y="56" width="44" height="34" rx="14" fill="${p.suit}" stroke="#1b3a8a" stroke-width="3"/>
    <path d="M30 60c8 6 32 6 40 0l-2 9c-8 5-28 5-36 0z" fill="${p.scarf}" stroke="#1b3a8a" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M30 63c-6 3-12 4-17 2 3 5 9 7 15 5z" fill="${p.scarf}" stroke="#1b3a8a" stroke-width="2.6" stroke-linejoin="round" class="scarf-tail"/>
    <circle cx="50" cy="34" r="27" fill="${p.helmet}" stroke="#1b3a8a" stroke-width="3.4"/>
    <path d="M28 35c0-8 9-13 22-13s22 5 22 13-9 13-22 13-22-5-22-13z" fill="${p.visor}" stroke="#1b3a8a" stroke-width="3"/>
    <path d="M35 30c4-2.4 9-3.4 15-3.4" stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".75"/>
    <circle cx="66" cy="40" r="2.6" fill="#fff" opacity=".6"/>
  </svg>`;
}

/** Six tier bullets (shape per tier) in the skin's colors. */
export function weaponPreview(s) {
  const cols = WEAPONS.map((w, i) => (s.tiers ? s.tiers[i] : { color: w.color, core: w.style.core, trail: w.style.trail || w.color }));
  const SIZE = { bolt: [9, 24], tracer: [8, 38], laser: [5, 44], beam: [13, 40] };
  const shapes = cols.map((c, i) => {
    const cx = 20 + (i % 3) * 30, cy = 28 + Math.floor(i / 3) * 46;
    const shape = WEAPONS[i].style.shape;
    if (shape === 'orb' || shape === 'nova') {
      const r = shape === 'nova' ? 12 : 9;
      return `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="${c.trail}" opacity=".3"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.color}"/><circle cx="${cx - r * 0.15}" cy="${cy - r * 0.15}" r="${r * 0.5}" fill="${c.core}"/>`;
    }
    const [w, h] = SIZE[shape] || SIZE.bolt;
    const x = cx - w / 2, y = cy - h / 2;
    return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="${(w + 6) / 2}" fill="${c.trail}" opacity=".3"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="${c.color}"/><rect x="${cx - w / 4}" y="${y + 3}" width="${w / 2}" height="${h - 6}" rx="${w / 4}" fill="${c.core}"/>`;
  }).join('');
  return `<svg viewBox="0 0 100 100" class="wpn-svg ${s.prism ? 'prism' : ''}" aria-hidden="true">${shapes}</svg>`;
}
