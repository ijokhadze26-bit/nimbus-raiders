// Screen manager: DOM overlay screens driven by game.state, modal stack, delegated button handling
// ('ui:click' + haptics), screen transitions, live coin counters, audio/settings bridges.
import './hud.css';
import './title-map.css';
import './menus.css';
import { Hud } from './hud.js';
import { icon } from './icons.js';
import { createTitle } from './screens/title.js';
import { createMap } from './screens/map.js';
import { createShop } from './screens/shop.js';
import { createSettings } from './screens/settings.js';
import { createPause } from './screens/pause.js';
import { createResult } from './screens/result.js';
import { createDaily } from './screens/daily.js';
import { createEndless } from './screens/endless.js';
import { createConfirm } from './screens/confirm.js';

const MENU_STATES = ['title', 'map', 'shop', 'settings', 'endless'];
const LEAVE_MS = 240;

export class UI {
  constructor(game, root, params = {}) {
    this.game = game;
    this.root = root;
    this.params = params;
    this.save = game.save;
    this.layer = el('div', 'screens');
    root.appendChild(this.layer);
    this.hud = new Hud(game, root, this);
    this.screens = {};
    const make = { title: createTitle, map: createMap, shop: createShop, settings: createSettings, pause: createPause,
      result: createResult, daily: createDaily, endless: createEndless, confirm: createConfirm };
    for (const [k, f] of Object.entries(make)) this.screens[k] = f(this);
    this.current = null;     // page screen name
    this.modals = [];        // stack of modal screen names (pause, settings over pause, daily, confirm)
    this.dailyChecked = false;
    this.navigating = null;

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('touchstart', () => {}, { passive: true }); // enables :active on iOS
    window.addEventListener('keydown', (e) => this.onKey(e));
    const ev = game.events;
    ev.on('game:state', ({ state }) => this.onState(state));
    ev.on('save:changed', () => this.refreshCoins());
    this.applySettings(true);
    this.onState(game.state);
  }

  // ---------------- navigation ----------------
  /** Menu navigation goes through game.state so the game and UI agree on where we are. */
  nav(state) {
    const g = this.game;
    if (g.state === 'playing' || g.state === 'paused' || g.state === 'result') {
      this.navigating = state; // swallow the intermediate 'title' while leaving a run
      try { g.quitToMenu(); } finally { this.navigating = null; }
    }
    if (g.state !== state) g.setState(state);
    else this.onState(state);
  }

  onState(state) {
    if (this.navigating && state !== this.navigating && MENU_STATES.includes(state)) return;
    if (MENU_STATES.includes(state)) {
      this.closeModals();
      this.go(state);
      if (state === 'title') this.maybeDaily();
    } else if (state === 'playing') {
      this.closeModals();
      this.go(null);
    } else if (state === 'paused') {
      this.openModal('pause');
    } else if (state === 'result') {
      this.closeModals();
      this.go('result');
    }
  }

  go(name, opts) {
    if (this.current === name && name) { this.screens[name].show?.(opts); return; }
    const prev = this.current ? this.screens[this.current] : null;
    if (prev) this.leave(prev);
    this.current = name;
    if (!name) return;
    this.enter(this.screens[name], opts);
  }

  enter(s, opts) {
    clearTimeout(s.leaveT);
    s.el.classList.remove('leave');
    if (!s.el.parentNode) this.layer.appendChild(s.el);
    else this.layer.appendChild(s.el); // bring to front
    s.show?.(opts);
    s.el.classList.remove('enter');
    void s.el.offsetWidth;
    s.el.classList.add('enter');
  }

  leave(s) {
    s.hide?.();
    s.el.classList.add('leave');
    clearTimeout(s.leaveT);
    s.leaveT = setTimeout(() => { s.el.classList.remove('leave', 'enter'); s.el.remove(); }, LEAVE_MS);
  }

  openModal(name, opts) {
    const i = this.modals.indexOf(name);
    if (i >= 0) this.modals.splice(i, 1);
    this.modals.push(name);
    const s = this.screens[name];
    s.el.classList.add('modal');
    this.enter(s, opts);
  }

  closeModal(name) {
    const i = this.modals.indexOf(name);
    if (i < 0) return;
    this.modals.splice(i, 1);
    this.leave(this.screens[name]);
  }

  /** Close all modals (or only those in `only`). */
  closeModals(only = null) {
    for (const m of [...this.modals]) if (!only || only.includes(m)) this.closeModal(m);
  }

  top() { return this.modals.length ? this.modals[this.modals.length - 1] : this.current; }

  maybeDaily() {
    if (this.dailyChecked || this.params.test) return;
    this.dailyChecked = true;
    const s = this.screens.daily;
    if (!s.available()) return;
    clearTimeout(this.dailyT);
    this.dailyT = setTimeout(() => { if (this.game.state === 'title' && this.current === 'title') this.openModal('daily'); }, 700);
  }

  confirm(opts) { this.openModal('confirm', opts); }

  // ---------------- input ----------------
  onClick(e) {
    const btn = e.target.closest?.('[data-act]');
    // a tap on the dimmed backdrop of a popup that has a Close X closes it (daily reward, settings)
    if (!btn && e.target.classList?.contains('dim-screen') && !e.target.classList.contains('leave') && e.target.querySelector('.close-x')) {
      this.screens[e.target.dataset.screen]?.onBack?.();
      return;
    }
    if (!btn || btn.disabled || btn.classList.contains('is-disabled')) return;
    const scr = btn.closest('.screen');
    if (scr && scr.classList.contains('leave')) return; // a closing screen is inert (no tap-through)
    this.game.events.emit('ui:click', {});
    this.vibrate(8);
    const name = scr ? scr.dataset.screen : null;
    const s = name ? this.screens[name] : this.hud;
    s?.onAct?.(btn.dataset.act, btn, e);
  }

  onKey(e) {
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
    const g = this.game;
    if (g.state === 'playing') { g.pause(); return; }
    if (e.key !== 'Escape') { if (g.state === 'paused' && this.top() === 'pause') g.resume(); return; }
    const top = this.top();
    if (top && this.screens[top]?.onBack) this.screens[top].onBack();
  }

  // ---------------- feedback ----------------
  vibrate(ms) {
    if (!this.save?.data.settings.vibration) return;
    try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
  }

  audio() { return this.game.audio || window.__game?.audio || null; }

  sfx(name, arg) {
    const a = this.audio();
    try { a?.play?.(name, arg); } catch { /* audio is optional */ }
  }

  // ---------------- settings bridges ----------------
  /** Push saved settings to audio + renderer quality. boot = first call (respects ?quality / ?test). */
  applySettings(boot = false) {
    const st = this.save.data.settings;
    const a = this.audio();
    try { a?.setMusic?.(st.music); a?.setSfx?.(st.sfx); } catch { /* optional */ }
    if (!(boot && (this.params.quality || this.params.test))) this.setQuality(st.quality);
  }

  setQuality(q) {
    const g = this.game;
    if (!g.quality) return;
    g.quality.setting = q;
    const want = q === 'low' ? 'low' : 'high';
    // (an auto-quality resolution step also counts as "not high": picking High restores full resolution)
    if (g.engine.quality !== want || (want === 'high' && g.engine.dprScale !== 1)) g.applyQuality ? g.applyQuality(want) : g.engine.applyQuality(want);
    if (q === 'auto') Object.assign(g.quality, { ema: 60, low: 0, hold: 1.2 });
  }

  // ---------------- coins ----------------
  /** Every element with .coin-live shows the saved coin total and counts toward changes. */
  refreshCoins(instant = false) {
    const v = this.save.data.coins;
    for (const n of this.root.querySelectorAll('.coin-live')) {
      const from = Number(n.dataset.v ?? v);
      if (instant || !n.isConnected || from === v) { n.textContent = fmt(v); n.dataset.v = v; continue; }
      countTo(n, from, v, 450);
      const pill = n.closest('.coin-pill');
      if (pill && v < from) bump(pill, 'spend'); else if (pill) bump(pill, 'gain');
    }
  }

  update(dt) {
    this.hud.update(dt);
    const top = this.top();
    if (top) this.screens[top]?.update?.(dt);
  }
}

// ---------------- shared helpers ----------------
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Root element for a screen: data-ui keeps drags on it from steering the squad. */
export function screenEl(name, cls = '') {
  const e = el('div', `screen screen-${name} ${cls}`);
  e.dataset.screen = name;
  e.setAttribute('data-ui', '');
  return e;
}

export function fmt(n) {
  n = Math.round(n || 0);
  return n >= 100000 ? `${(n / 1000).toFixed(n >= 1e6 ? 0 : 1)}K` : n.toLocaleString('en-US');
}

/** Counts a node's text from `from` to `to` over ms (ease-out); resolves when done. */
export function countTo(node, from, to, ms = 600, prefix = '') {
  node.dataset.v = to;
  cancelAnimationFrame(node._raf || 0);
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = prefix + fmt(from + (to - from) * e);
      if (k < 1) node._raf = requestAnimationFrame(tick); else res();
    };
    node._raf = requestAnimationFrame(tick);
  });
}

export function bump(node, cls = 'bump') {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

export function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function coinPill(extra = '') {
  return `<div class="coin-pill ${extra}"><span class="coin-ico">${icon('coin')}</span><span class="coin-live num">0</span></div>`;
}
