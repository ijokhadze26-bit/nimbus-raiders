// Minimal HUD (stage 1): squad count bubble projected above Pip, tap-to-start, pause + win/lose overlays.
// A later stage replaces this with the full UI; keep it self-contained.
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

    this.overlay = el('button', 'overlay hidden');
    this.overlay.type = 'button';
    this.overlay.setAttribute('data-ui', '');
    this.overlay.addEventListener('click', () => this.onTap());
    root.appendChild(this.overlay);
    this.mode = null;

    const ev = game.events;
    ev.on('squad:change', (p) => this.onSquadChange(p));
    ev.on('game:state', ({ state }) => this.onState(state));
    ev.on('run:start', () => this.show(null));
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

  onState(state) {
    if (state === 'title') this.show('title');
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
          <div class="detail">Squad ${r.squad} &middot; +${r.coins} coins</div><div class="tap">TAP TO CONTINUE</div>`;
      } else {
        o.innerHTML = `<div class="big-msg lose">SQUAD DOWN</div><div class="detail">${r.dist || 0} m</div><div class="tap">TAP TO RETRY</div>`;
      }
    } else {
      o.innerHTML = '';
    }
  }

  onTap() {
    const g = this.game;
    if (this.mode === 'title') g.startLevel(1);
    else if (this.mode === 'paused') g.resume();
    else if (this.mode === 'result') { if (g.lastResult && g.lastResult.win) g.nextLevel(); else g.retry(); }
  }

  /** Per-frame: project the bubble above the leader. */
  update() {
    const g = this.game;
    const sq = g.squad;
    const visible = (g.state === 'playing' || g.state === 'paused') && sq.count > 0;
    this.bubble.style.display = visible ? '' : 'none';
    if (!visible) return;
    if (sq.count !== this.count) { this.count = sq.count; this.bubbleInner.textContent = String(sq.count); }
    const L = sq.leader;
    _v.set(L.x, 2.25 + sq.pip.body.position.y, L.z).project(g.camera);
    const w = g.engine.width, h = g.engine.height;
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    this.bubble.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
