// ARMORY page (SPEC2 §5) + the shared info-page builder the HEROES page uses. Layout (opaque bands around one
// transparent preview window): top bar + selector strip | 3D preview (engine overlay, ui/preview.js) |
// scrolling .info-scroll body | EQUIP / BUY, COMPARE, TRY IT. Opened with ui.nav('armory', { from, levelId,
// mode, weapon, mk }); BACK returns to opts.from || 'title' with the same opts. Every number comes from
// ui/infofmt.js (data), never typed here.
import { screenEl, coinPill, bump } from '../ui.js';
import { icon } from '../icons.js';
import { WEAPON_DEFS, WEAPON_BY_ID } from '../../data/weapons.js';
import { isWeaponUnlocked, buyWeapon, selectWeapon, markSeen, canBuy, isNew } from '../../save/unlocks.js';
import { lockText, weaponParts, weaponBars, weaponMkTable, targets, shieldRule, mkLabel, ROMAN, MAX_MK } from '../infofmt.js';
import { weaponIcon, targetIcon } from '../icons2.js';
import { createPreview } from '../preview.js';
import '../info.css';

export const ENTER_MS = 360; // the screen enter animation (styles.css scr-in 0.34 s) + a frame

/** Selector chip (locked = silhouette + lock, NEW dot until its page was opened). */
export function chipHtml({ id, name, short, ico, locked, sel, fresh, act = 'pick', badge = '' }) {
  const label = locked ? `${name}, ${locked}` : name;
  return `<button type="button" class="chip${sel ? ' sel' : ''}${locked ? ' locked' : ''}" data-act="${act}" data-id="${id}" aria-label="${label}" title="${label}" aria-pressed="${sel ? 'true' : 'false'}">`
    + `<span class="chip-ico">${ico}</span><span class="chip-lbl">${short || name}</span>`
    + `${locked ? `<span class="chip-lock">${icon('lock')}</span>` : ''}${fresh ? '<i class="new-dot">NEW</i>' : ''}${badge}</button>`;
}

export function barsHtml(bars, cls = '') {
  return `<div class="bars ${cls}">${bars.map((b) => `<div class="bar" data-k="${b.key}"><span class="bar-l">${b.label}</span>`
    + `<span class="bar-t"><i style="width:${Math.round(Math.max(0.04, Math.min(1, b.value)) * 100)}%"></i></span>${b.text != null ? `<span class="bar-v num">${b.text}</span>` : ''}</div>`).join('')}</div>`;
}

export function mkControl(mk, label = 'Power level') {
  let h = `<div class="mk-ctl" role="group" aria-label="${label}"><span class="mk-lbl">${label}</span><span class="mk-seg">`;
  for (let i = 1; i <= MAX_MK; i++) h += `<button type="button" class="mk-b${i === mk ? ' on' : ''}" data-act="mk" data-mk="${i}" aria-pressed="${i === mk}" aria-label="${mkLabel(i)}">${ROMAN[i]}</button>`;
  return h + '</span></div>';
}

/** STRONG AGAINST / WEAK AGAINST blocks with enemy / boss icons (heroes show each entry's why). */
export function swHtml(def, showWhy) {
  const list = (arr) => targets(arr).map((t) => `<li class="sw-i${t.boss ? ' boss' : ''}"><span class="sw-ico">${targetIcon(t.id)}</span><span class="sw-n">${t.name}</span>${showWhy && t.why ? `<small>${t.why}</small>` : ''}</li>`).join('');
  return `<div class="sw"><div class="sw-col strong"><h4>STRONG AGAINST</h4><ul>${list(def.strong)}</ul></div>`
    + `<div class="sw-col weak"><h4>WEAK AGAINST</h4><ul>${list(def.weak)}</ul></div></div>`;
}

/**
 * Shared ARMORY / HEROES page. cfg = { name, title, kind: 'weapon' | 'hero', defs, byId, optKey, unlocked(d, id),
 * buy(save, id), select(save, id), selected(d), icon(id), bodyHtml(def, page), item(def, page), tryIt(def, page) }.
 */
export function createInfoPage(ui, cfg) {
  const el = screenEl(cfg.name, 'info-page');
  el.innerHTML = `
    <div class="ip-head">
      <div class="topbar ip-top">
        <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
        <div class="plaque plaque-purple"><span>${cfg.title}</span></div>
        ${coinPill()}
      </div>
      <div class="chip-row ip-chips" role="toolbar" aria-label="${cfg.title}"></div>
    </div>
    <div class="pv ip-pv"><div class="pv-fade"></div><div class="pv-badge"></div></div>
    <div class="info-scroll ip-body"></div>
    <div class="info-foot ip-foot"></div>`;
  const row = el.querySelector('.ip-chips'), body = el.querySelector('.ip-body'), foot = el.querySelector('.ip-foot');
  const pvEl = el.querySelector('.ip-pv'), badge = el.querySelector('.pv-badge');
  const preview = createPreview(ui);
  const page = { el, cfg, cur: null, mk: 3, opts: {}, preview, shownAt: 0 };
  let skipT = 0;

  function locked(id) { return !cfg.unlocked(ui.save.data, id); }
  function renderChips() {
    const d = ui.save.data;
    row.innerHTML = cfg.defs.map((x) => chipHtml({ id: x.id, name: x.name, short: x.short || x.name, ico: cfg.icon(x.id), locked: locked(x.id) ? lockText(x) : '',
      sel: x.id === page.cur, fresh: isNew(d, cfg.kind, x.id) })).join('');
    const sel = row.querySelector('.chip.sel');
    if (sel) row.scrollLeft = Math.max(0, sel.offsetLeft - (row.clientWidth - sel.offsetWidth) / 2);
  }
  function renderFoot() {
    const d = ui.save.data, id = page.cur, def = cfg.byId[id];
    let first;
    if (!locked(id)) {
      const eq = cfg.selected(d) === id;
      first = `<button type="button" class="btn btn-green ip-btn${eq ? ' is-eq' : ''}" data-act="equip" ${eq ? 'aria-pressed="true"' : ''}>${eq ? `${icon('check')}<span>EQUIPPED</span>` : '<span>EQUIP</span>'}</button>`;
    } else {
      const can = canBuy(ui.save, cfg.kind, id);
      first = `<button type="button" class="btn ${can ? 'btn-gold' : 'btn-grey is-disabled'} ip-btn" data-act="buy" ${can ? '' : 'aria-disabled="true"'}><span class="coin-ico">${icon('coin')}</span><span class="num">${def.unlock.coins}</span></button>`;
    }
    foot.innerHTML = first + `<button type="button" class="btn btn-purple ip-btn" data-act="compare"><span>COMPARE</span></button>`
      + `<button type="button" class="btn btn-blue ip-btn" data-act="try">${icon('play')}<span>TRY IT</span></button>`;
  }
  function render(keepScroll = false) {
    const def = cfg.byId[page.cur];
    const y = body.scrollTop;
    const lk = locked(page.cur);
    body.innerHTML = (lk ? `<div class="lock-line">${icon('lock')}<span>${lockText(def)}</span></div>` : '') + cfg.bodyHtml(def, page);
    badge.innerHTML = cfg.badge ? cfg.badge(def, page) : '';
    pvEl.classList.toggle('is-locked', lk);
    renderFoot();
    if (keepScroll) body.scrollTop = y; else body.scrollTop = 0;
  }
  function item() { return { ...cfg.item(cfg.byId[page.cur], page), locked: locked(page.cur) }; }
  function pick(id) {
    page.cur = id;
    markSeen(ui.save, cfg.kind, id);
    renderChips();
    render();
    preview.set(item());
  }
  function back() {
    const o = page.opts || {};
    const to = o.from && o.from !== 'result' ? o.from : (o.from === 'result' ? 'map' : 'title');
    ui.nav(to, to === 'loadout' ? { levelId: o.levelId, mode: o.mode } : null);
  }

  page.render = render;
  page.renderFoot = renderFoot;
  page.locked = locked;
  page.show = (o = {}) => {
    page.opts = o || {};
    page.cur = cfg.byId[page.opts[cfg.optKey]] ? page.opts[cfg.optKey] : cfg.selected(ui.save.data);
    page.mk = Math.max(1, Math.min(MAX_MK, page.opts.mk | 0 || 3));
    markSeen(ui.save, cfg.kind, page.cur);
    ui.refreshCoins(true);
    renderChips();
    render();
    preview.show(pvEl, item());
    const eng = ui.game.engine;
    clearTimeout(skipT);
    // the main scene is skipped only once this opaque page is fully shown (not during the enter fade)
    skipT = setTimeout(() => { if (ui.current === cfg.name && el.isConnected && !el.classList.contains('leave')) { eng.skipMain = true; preview.measure(); } }, ENTER_MS);
  };
  page.hide = () => {
    clearTimeout(skipT);
    ui.game.engine.skipMain = false;
    preview.hide();
  };
  page.onAct = (act, btn) => {
    const def = cfg.byId[page.cur];
    if (act === 'back') back();
    else if (act === 'pick') { if (btn.dataset.id !== page.cur) pick(btn.dataset.id); }
    else if (act === 'mk') {
      page.mk = Number(btn.dataset.mk) || 3;
      render(true);
      preview.set(item());
    } else if (act === 'equip') {
      if (cfg.select(ui.save, page.cur)) { renderFoot(); render(true); const b = foot.querySelector('[data-act="equip"]'); if (b) bump(b); }
    } else if (act === 'buy') {
      if (cfg.buy(ui.save, page.cur)) { ui.sfx('purchase'); ui.vibrate(25); renderChips(); render(true); preview.set(item()); const b = foot.querySelector('.ip-btn'); if (b) bump(b); }
    } else if (act === 'compare') {
      const i = cfg.defs.findIndex((x) => x.id === page.cur);
      ui.openModal('compare', { kind: cfg.kind, a: page.cur, b: cfg.defs[(i + 1) % cfg.defs.length].id, mk: page.mk, page: cfg.name, opts: { ...page.opts, [cfg.optKey]: page.cur, mk: page.mk } });
    } else if (act === 'try') {
      ui.game.practiceReturn = { screen: cfg.name, opts: { ...page.opts, [cfg.optKey]: page.cur, mk: page.mk } };
      ui.game.startPractice(cfg.tryIt(def, page));
    } else if (cfg.onAct) cfg.onAct(act, btn, page);
  };
  return { el, page, preview, show: page.show, hide: page.hide, onAct: page.onAct, onBack: back };
}

export function createArmory(ui) {
  return createInfoPage(ui, armoryCfg(ui));
}

function armoryCfg(ui) {
  return {
    name: 'armory', title: 'ARMORY', kind: 'weapon', defs: WEAPON_DEFS, byId: WEAPON_BY_ID, optKey: 'weapon',
    unlocked: isWeaponUnlocked, buy: buyWeapon, select: selectWeapon, selected: (d) => d.arsenal.selected, icon: weaponIcon,
    item: (def, p) => ({ kind: 'weapon', id: def.id, mk: p.mk }),
    tryIt: (def, p) => ({ weapon: def.id, hero: ui.game.loadout.hero, mk: p.mk }),
    badge: (def, p) => `<span class="pv-mk">${mkLabel(p.mk)}</span>`,
    bodyHtml: (def, p) => {
      const rule = shieldRule(def);
      return `<div class="ip-title"><span class="ip-ico">${weaponIcon(def.id)}</span><div class="ip-tt"><h2>${def.name}</h2><span class="tag el-${def.id}">${def.tag}</span></div></div>`
        + `<p class="ip-blurb">${def.blurb}</p>`
        + `<div class="ip-card"><h4>WHAT MAKES IT SPECIAL</h4><p>${def.special}</p>${rule ? `<p class="rule">${icon('shield')}<span>${rule}</span></p>` : ''}</div>`
        + mkControl(p.mk)
        + barsHtml(weaponBars(def))
        + `<div class="exact"><h4>${mkLabel(p.mk)} NUMBERS</h4><ul>${weaponParts(def, p.mk).map((t) => `<li>${t}</li>`).join('')}</ul></div>`
        + swHtml(def, true)
        + `<div class="mk-table"><h4>WHAT EACH POWER LEVEL ADDS</h4>${weaponMkTable(def).map((r) => `<div class="mk-row${r.mk === p.mk ? ' on' : ''}"><span class="mk-n">${r.label}</span>`
          + `<span class="mk-d"><b>${r.dmg} · ${r.rate}</b><span>${r.special}</span><em>${r.look}</em></span></div>`).join('')}</div>`;
    },
  };
}
