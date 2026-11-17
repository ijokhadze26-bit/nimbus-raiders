// In-run HUD: top bar (pause, level name + progress bar ending in a boss skull, run coins), squad count
// bubble projected above Pip, weapon tier badge, power-up timer slots, boss name + hp bar + title card,
// WEAPON UP banner, DRAG TO MOVE hint (levels 1-2), haptics on losses / gates / boss hits.
// Update 2: weapon badge (weapon icon, short name, "Mk III", 5 pips in the weapon's colour), MK UP / NEW WEAPON
// banners, Guard hearts under the squad bubble, PRACTICE label, and a mount point for the ability button
// (ui/hudability.js, HEROES builder: mountAbility(hud, mountEl)).
import * as THREE from 'three';
import { icon, POWER_LOOK } from './icons.js';
import { weaponIcon } from './icons2.js';
import { MAX_MK, mkLabel, weaponDef, weaponUiColor } from '../data/weapons.js';
import { mountAbility } from './hudability.js';
import { fmt } from './ui.js';
import { WORLDS } from '../data/worlds.js';
import { isCampaign } from '../game/worldlook.js';
import { mountHazardHint } from './hudhazard.js';
import { mountBossAlerts } from './hudboss.js';

const _v = new THREE.Vector3();

export class Hud {
  constructor(game, root, ui = null) {
    this.game = game;
    this.ui = ui;
    this.root = root;
    this.count = -1;

    this.el = el('div', 'hud hidden');
    this.el.innerHTML = `
      <div class="hud-top">
        <button type="button" class="ibtn ibtn-blue hud-pause" data-act="pause" aria-label="Pause">${icon('pause')}</button>
        <div class="hud-center">
          <div class="hud-level"></div>
          <div class="hud-prog"><div class="track"><i class="fill"></i><i class="shine"></i></div><span class="hud-boss-ico">${icon('skull')}</span></div>
        </div>
        <div class="coin-pill hud-coins"><span class="coin-ico">${icon('coin')}</span><span class="num">0</span></div>
      </div>
      <div class="hud-powers"></div>
      <div class="hud-weapon"><span class="w-ico">${icon('tier')}</span><span class="w-col"><span class="w-tier">MK I</span><span class="w-name"></span><span class="w-pips">${'<i></i>'.repeat(MAX_MK)}</span></span></div>
      <div class="hud-ability-mount"></div>
      <div class="hud-hint hidden"><div class="hint-track"><span class="arrow l">${icon('back')}</span><span class="hand">${icon('hand')}</span><span class="arrow r">${icon('back')}</span></div><div class="hint-text">DRAG TO MOVE</div></div>`;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      e.stopPropagation();
      game.events.emit('ui:click', {});
      ui?.vibrate(8);
      this.onAct(b.dataset.act);
    });
    const q = (s) => this.el.querySelector(s);
    this.levelEl = q('.hud-level');
    this.progFill = q('.hud-prog .fill');
    this.progEl = q('.hud-prog');
    this.coinPill = q('.hud-coins');
    this.coinNum = q('.hud-coins .num');
    this.powersEl = q('.hud-powers');
    this.weaponEl = q('.hud-weapon');
    this.hintEl = q('.hud-hint');
    this.powers = new Map();
    this.prog = 0; this.progTarget = 0; this.progW = -1;
    this.coins = -1;
    this.hintOn = false;
    this.lastBuzz = 0;

    this.bubble = el('div', 'squad-bubble');
    this.bubbleInner = el('div', 'inner');
    this.bubble.appendChild(this.bubbleInner);
    this.guardEl = el('div', 'guard-dots');
    this.bubble.appendChild(this.guardEl);
    this.guardShown = '';
    root.appendChild(this.bubble);

    this.bossBar = el('div', 'boss-bar hidden');
    this.bossBar.innerHTML = '<div class="boss-name"><span class="skull">' + icon('skull') + '</span><span class="n"></span></div><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div><div class="boss-shine"></div><div class="boss-ticks"></div></div>';
    root.appendChild(this.bossBar);
    this.bossName = this.bossBar.querySelector('.boss-name .n');
    this.bossFill = this.bossBar.querySelector('.boss-fill');
    this.bossLag = this.bossBar.querySelector('.boss-lag');
    this.bossAlerts = mountBossAlerts(this); // update 3: RAGE!, PHASE n, safe-spot call, bar marks
    this.card = el('div', 'boss-card hidden');
    root.appendChild(this.card);
    this.banner = el('div', 'tier-banner hidden');
    root.appendChild(this.banner);
    this.worldBanner = el('div', 'world-banner hidden'); // update 3: "WORLD 2 · VOLCANIC FORGE" at a level start
    root.appendChild(this.worldBanner);
    this.hpFrac = 1; this.lagFrac = 1;
    this.bossShown = false; this.fillW = -1; this.lagW = -1;
    this.pendingGain = false; this.pendingLoss = false; this.pulse = null; this.lossUntil = 0;

    const ev = game.events;
    ev.on('squad:change', (p) => this.onSquadChange(p));
    ev.on('game:state', ({ state }) => this.onState(state));
    ev.on('run:start', (p) => this.onRunStart(p));
    ev.on('run:progress', (p) => {
      this.progTarget = p.length ? Math.min(1, p.dist / p.length) : 0;
      if (p.total != null && this.distEl && p.total !== this.distShown) { this.distShown = p.total; this.distEl.textContent = fmt(p.total) + 'm'; }
    });
    ev.on('endless:boss', (p) => this.onEndlessBoss(p));
    ev.on('run:phase', ({ phase }) => this.el.classList.toggle('boss-phase', phase === 'boss'));
    ev.on('boss:spawn', (p) => this.onBossSpawn(p));
    ev.on('boss:hp', (p) => {
      const f = p.max ? Math.max(0, p.hp / p.max) : 0;
      if (this.hpFrac - f > 0.04) this.buzz(25, 140);
      this.hpFrac = f;
    });
    ev.on('boss:phase', () => this.bossBar.classList.add('enraged'));
    ev.on('boss:attack', () => this.buzz(35, 200));
    ev.on('boss:defeated', () => { this.buzz(120, 0); clearTimeout(this.bossT); this.bossT = setTimeout(() => this.hideBoss(), 900); });
    ev.on('weapon:tier', (p) => this.onTier(p));
    ev.on('weapon:swap', (p) => this.onSwap(p));
    ev.on('gate:pass', (p) => this.buzz(p.after >= p.before ? 15 : 45, 120));
    ev.on('power:start', (p) => this.showPower(p.kind, p.duration));
    ev.on('power:end', (p) => this.hidePower(p.kind));
    this.abilityMount = this.el.querySelector('.hud-ability-mount');
    this.ability = mountAbility(this, this.abilityMount) || null;
    this.hazardHint = mountHazardHint(this); // update 3: world hazard hint line
    this.onState(game.state);
  }

  onAct(act) {
    if (act === 'pause') this.game.pause();
  }

  /** Throttled vibration (settings respected by ui.vibrate). */
  buzz(ms, gap) {
    const now = performance.now();
    if (now - this.lastBuzz < gap) return;
    this.lastBuzz = now;
    this.ui?.vibrate(ms);
  }

  onRunStart(p) {
    const g = this.game;
    const run = g.run;
    const endless = p.mode === 'endless';
    this.levelEl.innerHTML = endless ? `${icon('infinity')}<span>ENDLESS</span><span class="lv dist">0m</span>`
      : p.mode === 'practice' ? `<span class="lv">PRACTICE</span><span>${weaponDef(p.weapon).name}</span>`
        : `<span class="lv">LV ${p.levelId}</span><span>${run?.name || ''}</span>`;
    this.distEl = endless ? this.levelEl.querySelector('.dist') : null;
    this.distShown = 0;
    this.el.classList.toggle('endless', endless);
    this.el.classList.remove('boss-phase');
    this.prog = this.progTarget = 0; this.progW = -1;
    this.setEndIcon(!!(run && run.def && run.def.finish && !run.boss && !endless));
    this.coins = -1;
    this.hideBoss(true);
    for (const k of [...this.powers.keys()]) this.hidePower(k);
    this.setWeapon(g.weapons?.mk || 1, false);
    this.count = -1;
    this.hintOn = !endless && p.levelId <= 2 && !g.autopilot?.enabled;
    this.hintEl.classList.toggle('hidden', !this.hintOn);
    this.el.classList.toggle('hinting', this.hintOn);
    this.compact = null; this.faded = null;
    this.banner.classList.add('hidden');
    this.showWorldBanner(run, p);
  }

  /** End of the progress bar: a boss skull, or a finish flag on boss-less levels (update 3, def.finish). */
  setEndIcon(flag) {
    const ico = this.progEl.querySelector('.hud-boss-ico'), want = flag ? 'flag' : 'skull';
    if (ico.dataset.end === want) return;
    ico.dataset.end = want;
    ico.innerHTML = icon(want);
    ico.classList.toggle('finish', flag);
  }

  /** Campaign level start: world number + name and the level name, 2 s CSS animation, never blocks input. */
  showWorldBanner(run, p) {
    clearTimeout(this.worldT);
    const w = run && isCampaign(run.def, p.mode) ? WORLDS[(run.worldId || 1) - 1] : null;
    if (!w) { this.worldBanner.classList.add('hidden'); return; }
    this.worldBanner.style.setProperty('--wc', w.color);
    this.worldBanner.innerHTML = `<div class="wb-world">WORLD ${w.id} · ${w.name}</div><div class="wb-level">${esc(run.name || 'LEVEL ' + p.levelId)}</div>`;
    this.worldBanner.classList.remove('hidden');
    restartAnim(this.worldBanner);
    this.worldT = setTimeout(() => this.worldBanner.classList.add('hidden'), 2000);
  }

  /** Badge: weapon icon, short name, "Mk III" and 5 pips in the weapon's own colour. */
  setWeapon(mk, pop, id = this.game.weapons?.id) {
    const def = weaponDef(id);
    const col = weaponUiColor(def, mk);
    this.weaponEl.style.setProperty('--tc', col);
    this.weaponEl.style.setProperty('--ic', def.look.mk[Math.max(1, Math.min(MAX_MK, mk)) - 1].color);
    if (this.weaponId !== id) { this.weaponId = id; this.weaponEl.querySelector('.w-ico').innerHTML = weaponIcon(id); }
    this.weaponEl.querySelector('.w-tier').textContent = mkLabel(mk).toUpperCase();
    this.weaponEl.querySelector('.w-name').textContent = def.short;
    this.weaponEl.querySelectorAll('.w-pips i').forEach((p, i) => p.classList.toggle('on', i < mk));
    if (pop) restartClass(this.weaponEl, 'pop');
  }

  banner2(sub, name, color) {
    this.banner.innerHTML = `<div class="sub">${sub}</div><div class="name">${name}</div>`;
    this.banner.style.setProperty('--tc', color);
    this.banner.classList.remove('hidden');
    restartAnim(this.banner);
    clearTimeout(this.bannerT);
    if (this.hazardHint) this.hazardHint.dodge(true); // an INCOMING! / hazard line steps below the banner
    this.bannerT = setTimeout(() => { this.banner.classList.add('hidden'); if (this.hazardHint) this.hazardHint.dodge(false); }, 1500);
  }

  // ---------------- power-up timers ----------------
  /** Shows (or restarts) a circular timer for a power kind; duration in game seconds. */
  showPower(kind, duration = 8) {
    const look = POWER_LOOK[kind] || { icon: 'bolt', color: '#ffd34d', label: String(kind).toUpperCase() };
    let p = this.powers.get(kind);
    if (!p) {
      const node = el('div', 'pw');
      node.style.setProperty('--pc', look.color);
      node.innerHTML = `<div class="pw-ring"></div><div class="pw-ico">${icon(look.icon)}</div><div class="pw-lbl">${look.label}</div>`;
      this.powersEl.appendChild(node);
      p = { node, ring: node.querySelector('.pw-ring') };
      this.powers.set(kind, p);
    }
    p.start = this.game.time;
    p.duration = Math.max(0.1, duration);
    p.last = -1;
    restartClass(p.node, 'in');
  }

  hidePower(kind) {
    const p = this.powers.get(kind);
    if (!p) return;
    this.powers.delete(kind);
    p.node.classList.add('out');
    setTimeout(() => p.node.remove(), 260);
  }

  updatePowers() {
    for (const [kind, p] of this.powers) {
      const left = p.duration - (this.game.time - p.start);
      if (left <= 0) { this.hidePower(kind); continue; }
      const f = Math.round((left / p.duration) * 200) / 200;
      if (f !== p.last) { p.last = f; p.ring.style.setProperty('--f', `${(f * 360).toFixed(1)}deg`); }
      p.node.classList.toggle('ending', left < 2);
    }
  }

  // ---------------- squad bubble ----------------
  /** squad:change can fire many times per frame (one per member lost): only record it; update() animates once. */
  onSquadChange(p) {
    if (p.delta > 0) this.pendingGain = true;
    else if (p.delta < 0) {
      this.pendingLoss = true;
      if (p.reason !== 'gate') this.buzz(12, 150);
    }
  }

  flushSquadPulse(now) {
    const gain = this.pendingGain, loss = this.pendingLoss;
    if (!gain && !loss) return;
    this.pendingGain = this.pendingLoss = false;
    if (loss) { this.bubble.classList.add('loss'); this.lossUntil = now + 260; }
    if (!this.bubbleInner.animate) return;
    if (this.pulse) this.pulse.cancel();
    this.pulse = gain
      ? this.bubbleInner.animate([{ transform: 'translate(-50%,-100%) scale(1.35)' }, { transform: 'translate(-50%,-100%) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' })
      : this.bubbleInner.animate([{ transform: 'translate(-50%,-100%) scale(0.85)' }, { transform: 'translate(-50%,-100%) scale(1)' }], { duration: 200 });
  }

  // ---------------- boss ----------------
  onBossSpawn(p) {
    this.bossName.textContent = p.name;
    this.hpFrac = 1; this.lagFrac = 1; this.fillW = this.lagW = -1;
    clearTimeout(this.bossT);
    this.bossBar.classList.remove('hidden', 'enraged');
    this.bossShown = true;
    this.card.style.setProperty('--n', Math.max(6, String(p.name).length));
    this.card.innerHTML = `<div class="warn">${icon('skull')}<span>BOSS</span>${icon('skull')}</div><div class="name">${p.name}</div>`;
    this.card.classList.remove('hidden');
    restartAnim(this.card);
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => this.card.classList.add('hidden'), 1400);
    this.buzz(60, 0);
  }

  hideBoss(now) {
    this.bossBar.classList.add('hidden');
    this.bossShown = false;
    if (now) { this.card.classList.add('hidden'); clearTimeout(this.cardT); clearTimeout(this.bossT); }
  }

  onTier(p) {
    const mk = p.mk || p.tier, def = weaponDef(p.weapon || this.game.weapons.id);
    this.banner.dataset.tier = mk;
    this.banner2('MK UP!', `→ ${mkLabel(mk)}`, weaponUiColor(def, mk));
    this.setWeapon(mk, true, def.id);
    this.buzz(30, 0);
  }

  /** Crate swap: NEW WEAPON banner, badge follows. */
  onSwap(p) {
    const def = weaponDef(p.to);
    this.banner2('NEW WEAPON:', def.name.toUpperCase(), weaponUiColor(def, p.mk || 1));
    this.setWeapon(p.mk || 1, true, def.id);
    this.buzz(30, 0);
  }

  /** Endless: a boss fell, the run goes on - reward banner (reuses the WEAPON UP banner look). */
  onEndlessBoss(p) {
    const extra = p.drone ? ' · +1 DRONE' : '';
    this.banner.innerHTML = `<div class="sub">BOSS ${p.n} DOWN!</div><div class="name">+${p.troops} RAIDERS</div><div class="sub">+${fmt(p.coins)} COINS${extra}</div>`;
    this.banner.style.setProperty('--tc', '#ffd34d');
    this.banner.classList.remove('hidden');
    restartAnim(this.banner);
    clearTimeout(this.bannerT);
    if (this.hazardHint) this.hazardHint.dodge(true); // an INCOMING! / hazard line steps below the banner
    this.bannerT = setTimeout(() => { this.banner.classList.add('hidden'); if (this.hazardHint) this.hazardHint.dodge(false); }, 1500);
    this.buzz(60, 0);
  }

  onState(state) {
    const inRun = state === 'playing' || state === 'paused';
    this.el.classList.toggle('hidden', !inRun);
    this.el.classList.toggle('paused', state === 'paused');
    if (!inRun) {
      this.hintEl.classList.add('hidden'); this.hintOn = false; this.el.classList.remove('hinting');
      if (state !== 'result') this.hideBoss(true);
      else this.bossBar.classList.add('hidden');
      this.banner.classList.add('hidden');
      this.worldBanner.classList.add('hidden'); clearTimeout(this.worldT);
    }
  }

  /** Per-frame: project the bubble above the leader; ease the bars; poll coins. */
  update() {
    const g = this.game;
    const sq = g.squad;
    const now = performance.now();
    const run = g.run;
    const inRun = (g.state === 'playing' || g.state === 'paused') && run;
    if (inRun) {
      // progress toward the boss (endless reuses a level's length until its segment generator lands)
      const target = this.progTarget;
      this.prog += (target - this.prog) * 0.2;
      if (target < this.prog - 0.2) this.prog = target;
      const pw = Math.round(this.prog * 1000);
      if (pw !== this.progW) { this.progW = pw; this.progFill.style.transform = `scaleX(${pw / 1000})`; this.progEl.classList.toggle('near', pw > 900); }
      if (run.coins !== this.coins) {
        if (this.coins >= 0 && run.coins > this.coins) restartClass(this.coinPill, 'gain');
        this.coins = run.coins;
        this.coinNum.textContent = fmt(run.coins);
      }
      if (this.hintOn && (run.dist > 46 || g.input?.dragging || g.input?.axis)) {
        this.hintOn = false;
        this.hintEl.classList.add('hidden');
        this.el.classList.remove('hinting');
      }
      // big squads reach the bottom of the frame: badge shrinks to icon + pips
      const compact = sq.members.length > 60;
      if (compact !== this.compact) { this.compact = compact; this.weaponEl.classList.toggle('compact', compact); }
      this.updatePowers();
    }
    if (this.ability && this.ability.update) this.ability.update();
    this.flushSquadPulse(now);
    if (this.lossUntil && now >= this.lossUntil) { this.lossUntil = 0; this.bubble.classList.remove('loss'); }
    if (this.bossShown) {
      this.lagFrac += (this.hpFrac - this.lagFrac) * 0.06;
      if (this.lagFrac < this.hpFrac) this.lagFrac = this.hpFrac;
      const fw = Math.round(this.hpFrac * 2000), lw = Math.round(this.lagFrac * 2000);
      if (fw !== this.fillW) { this.fillW = fw; this.bossFill.style.transform = `scaleX(${fw / 2000})`; }
      if (lw !== this.lagW) { this.lagW = lw; this.bossLag.style.transform = `scaleX(${lw / 2000})`; }
    }
    const visible = (g.state === 'playing' || g.state === 'paused') && sq.count > 0;
    if (visible !== this.bubbleShown) { this.bubbleShown = visible; this.bubble.style.display = visible ? '' : 'none'; }
    if (!visible) return;
    if (sq.count !== this.count) { this.count = sq.count; this.bubbleInner.textContent = String(sq.count); }
    const H = g.heroes;
    const gk = H ? H.guard + '/' + H.guardMax : '';
    if (gk !== this.guardShown) {
      this.guardShown = gk;
      this.guardEl.innerHTML = H ? '<i class="on"></i>'.repeat(H.guard) + '<i></i>'.repeat(Math.max(0, H.guardMax - H.guard)) : '';
    }
    const L = sq.leader;
    // fade the bubble while the gate the leader runs into is close: its number must stay readable
    let near = false;
    for (const gt of g.gates.live) {
      if (gt.state === 'live' && gt.z < L.z && L.z - gt.z < 5 && Math.abs(gt.x - L.x) < gt.halfW + 0.8) { near = true; break; }
    }
    if (near !== this.faded) { this.faded = near; this.bubble.classList.toggle('faded', near); }
    _v.set(L.x, 2.25 * (sq.pipScale || 1.25) / 1.25 + sq.pip.body.position.y, L.z).project(g.camera);
    const w = g.engine.width, h = g.engine.height;
    const x = Math.round(Math.max(34, Math.min(w - 34, (_v.x * 0.5 + 0.5) * w)) * 2) / 2, y = Math.round(Math.max(120, Math.min(h - 20, (-_v.y * 0.5 + 0.5) * h)) * 2) / 2;
    if (x !== this.bx || y !== this.by) { this.bx = x; this.by = y; this.bubble.style.transform = `translate3d(${x}px, ${y}px, 0)`; }
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ESC[c]); }
function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
// Restarting a CSS animation by reading offsetWidth forces a synchronous layout of the whole HUD (it ran on
// every coin pickup). Rewinding the element's running animations does the same without layout.
function rewind(node) {
  if (!node.getAnimations) return false;
  const list = node.getAnimations();
  for (const a of list) { a.currentTime = 0; a.play(); }
  return list.length > 0;
}
function restartAnim(node) {
  if (rewind(node)) return;
  node.style.animation = 'none';
  requestAnimationFrame(() => { node.style.animation = ''; }); // restarts after this frame's style pass
}
function restartClass(node, cls) {
  if (!node.classList.contains(cls)) { node.classList.add(cls); return; }
  if (rewind(node)) return;
  node.classList.remove(cls); // finished animation: re-add next frame (no forced layout)
  requestAnimationFrame(() => node.classList.add(cls));
}
