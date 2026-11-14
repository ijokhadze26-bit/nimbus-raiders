// Minimal HUD: squad count bubble projected above Pip, tap-to-start, pause, boss bar + title card,
// weapon-tier banner, and win/lose overlays with Retry / Next. A later stage replaces this with the full UI.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Hud {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.count = -1;
    this.bubble = el('div', 'squad-bubble');
    this.bubbleInner = el('div', 'inner');
    this.bubble.appendChild(this.bubbleInner);
    root.appendChild(this.bubble);

    // boss bar + title card + tier banner
    this.bossBar = el('div', 'boss-bar hidden');
    this.bossBar.innerHTML = '<div class="boss-name"></div><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div><div class="boss-shine"></div></div>';
    root.appendChild(this.bossBar);
    this.bossName = this.bossBar.querySelector('.boss-name');
    this.bossFill = this.bossBar.querySelector('.boss-fill');
    this.bossLag = this.bossBar.querySelector('.boss-lag');
    this.card = el('div', 'boss-card hidden');
    root.appendChild(this.card);
    this.banner = el('div', 'tier-banner hidden');
    root.appendChild(this.banner);
    this.hpFrac = 1; this.lagFrac = 1;

    this.overlay = el('div', 'overlay hidden');
    this.overlay.setAttribute('data-ui', '');
    this.overlay.setAttribute('role', 'button');
    this.overlay.addEventListener('click', (e) => this.onTap(e));
    root.appendChild(this.overlay);
    this.mode = null;

    const ev = game.events;
    ev.on('squad:change', (p) => this.onSquadChange(p));
    ev.on('game:state', ({ state }) => this.onState(state));
    ev.on('run:start', () => { this.show(null); this.hideBoss(true); });
    ev.on('boss:spawn', (p) => this.onBossSpawn(p));
    ev.on('boss:hp', (p) => { this.hpFrac = p.max ? Math.max(0, p.hp / p.max) : 0; });
    ev.on('boss:phase', () => this.bossBar.classList.add('enraged'));
    ev.on('boss:defeated', () => setTimeout(() => this.hideBoss(), 900));
    ev.on('weapon:tier', (p) => this.onTier(p));
    this.onState(game.state);
  }

  onSquadChange(p) {
    if (!this.bubbleInner.animate) return;
    if (p.delta > 0) this.bubbleInner.animate([{ transform: 'translate(-50%,-100%) scale(1.35)' }, { transform: 'translate(-50%,-100%) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
    else if (p.delta < 0) {
      this.bubble.classList.add('loss');
      clearTimeout(this.lossT);
      this.lossT = setTimeout(() => this.bubble.classList.remove('loss'), 260);
      this.bubbleInner.animate([{ transform: 'translate(-50%,-100%) scale(0.85)' }, { transform: 'translate(-50%,-100%) scale(1)' }], { duration: 200 });
    }
  }

  onBossSpawn(p) {
    this.bossName.textContent = p.name;
    this.hpFrac = 1; this.lagFrac = 1;
    this.bossBar.classList.remove('hidden', 'enraged');
    this.card.innerHTML = `<div class="warn">&#9888; BOSS &#9888;</div><div class="name">${p.name}</div>`;
    this.card.classList.remove('hidden');
    restartAnim(this.card);
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => this.card.classList.add('hidden'), 1400);
  }

  hideBoss(now) {
    this.bossBar.classList.add('hidden');
    if (now) { this.card.classList.add('hidden'); clearTimeout(this.cardT); }
  }

  onTier(p) {
    this.banner.innerHTML = `<div class="sub">WEAPON UP!</div><div class="name">${p.name.toUpperCase()}!</div>`;
    this.banner.dataset.tier = p.tier;
    this.banner.classList.remove('hidden');
    restartAnim(this.banner);
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => this.banner.classList.add('hidden'), 1500);
  }

  onState(state) {
    if (state === 'title') { this.show('title'); this.hideBoss(true); }
    else if (state === 'paused') this.show('paused');
    else if (state === 'result') this.show('result');
    else this.show(null);
  }

  show(mode) {
    this.mode = mode;
    const o = this.overlay;
    o.className = 'overlay' + (mode ? '' : ' hidden') + (mode === 'paused' || mode === 'result' ? ' dim' : '');
    o.tabIndex = mode ? 0 : -1;
    if (mode === 'title') {
      o.innerHTML = `<div class="title-word">NIMBUS<br>RA<span class="bolt">&#9889;</span>DERS</div>
        <div class="title-sub">SKY SQUAD SHOOTER</div><div class="tap">TAP TO START</div>`;
    } else if (mode === 'paused') {
      o.innerHTML = `<div class="big-msg">PAUSED</div><div class="tap">TAP TO RESUME</div>`;
    } else if (mode === 'result') {
      const r = this.game.lastResult || {};
      if (r.win) {
        const stars = [1, 2, 3].map((i) => `<span class="${i <= r.stars ? '' : 'off'}">&#9733;</span>`).join('');
        o.innerHTML = `<div class="big-msg">LEVEL CLEAR!</div><div class="stars">${stars}</div>
          <div class="detail">Squad ${r.squad} &middot; +${r.coins} coins</div>
          <div class="btn-row"><button type="button" class="btn btn-gold" data-act="next">NEXT</button>
          <button type="button" class="btn btn-blue" data-act="retry">RETRY</button></div>`;
      } else {
        o.innerHTML = `<div class="big-msg lose">SQUAD DOWN</div><div class="detail">${r.dist || 0} m &middot; +${r.coins || 0} coins</div>
          <div class="btn-row"><button type="button" class="btn btn-gold" data-act="retry">RETRY</button></div>`;
      }
    } else {
      o.innerHTML = '';
    }
  }

  onTap(e) {
    const g = this.game;
    const act = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (this.mode === 'title') g.startLevel(1);
    else if (this.mode === 'paused') g.resume();
    else if (this.mode === 'result') {
      if (!act) return;
      g.events.emit('ui:click', {});
      if (act.dataset.act === 'next') g.nextLevel(); else g.retry();
    }
  }

  /** Per-frame: project the bubble above the leader; ease the boss bar. */
  update() {
    const g = this.game;
    const sq = g.squad;
    this.lagFrac += (this.hpFrac - this.lagFrac) * 0.06;
    if (this.lagFrac < this.hpFrac) this.lagFrac = this.hpFrac;
    this.bossFill.style.transform = `scaleX(${this.hpFrac.toFixed(4)})`;
    this.bossLag.style.transform = `scaleX(${this.lagFrac.toFixed(4)})`;
    const visible = (g.state === 'playing' || g.state === 'paused') && sq.count > 0;
    this.bubble.style.display = visible ? '' : 'none';
    if (!visible) return;
    if (sq.count !== this.count) { this.count = sq.count; this.bubbleInner.textContent = String(sq.count); }
    const L = sq.leader;
    _v.set(L.x, 2.25 + sq.pip.body.position.y, L.z).project(g.camera);
    const w = g.engine.width, h = g.engine.height;
    const x = Math.max(34, Math.min(w - 34, (_v.x * 0.5 + 0.5) * w)), y = Math.max(60, Math.min(h - 20, (-_v.y * 0.5 + 0.5) * h));
    this.bubble.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
function restartAnim(node) { node.style.animation = 'none'; void node.offsetWidth; node.style.animation = ''; }
