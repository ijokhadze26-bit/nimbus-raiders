// Ability button (SPEC2 §5 HUD). mountAbility(hud, mountEl) -> { el, update() }; hud.update() calls update()
// every frame. A 68 px round button with the hero's ability icon and a conic recharge ring (quantised to
// 1/200), a .ready pulse and a one-shot "READY" chip, a small countdown while recharging. Triggers on
// pointerdown (works while another finger drags; the following click is swallowed) and on Space / E.
// Hidden while the drag hint shows, outside run.active and on the result screen. While a lasting ability
// runs (Whiteout, Sugar Shield, Fortress) a timer pill in the power-up column (.pw style) counts it down.
import './hudability.css';
import { heroDef } from '../data/heroes.js';

const HERO_COLOR = { pip: '#2f8cff', cinder: '#ff7a1f', rime: '#4dc3ff', bonbon: '#ff8ad8', bolt: '#ffc531', vex: '#9b6bff' };
const SHORT = { rally: 'RALLY', meteor: 'METEOR', whiteout: 'WHITEOUT', sugarshield: 'SHIELD', fortress: 'FORTRESS', shockwave: 'SHOCK' };

/** Ability icons (inline SVG, 48 x 48, white + accent); exported so menus can reuse them. */
export const ABILITY_SVG = {
  rally: '<path d="M8 22h16l10-8v26l-10-8H8z" fill="#fff"/><path d="M38 17q6 7 0 14M42 12q10 12 0 24" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="11" y="32" width="7" height="9" rx="2" fill="#fff"/>',
  meteor: '<path d="M6 6l22 14M10 2l18 13M2 12l20 11" stroke="#ffd34d" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="30" r="12" fill="#fff"/><circle cx="27" cy="27" r="3.5" fill="#ff7a1f"/><circle cx="35" cy="34" r="2.5" fill="#ff7a1f"/>',
  whiteout: '<g stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M24 4v40M6.7 14l34.6 20M6.7 34l34.6-20"/><path d="M18 7l6 5 6-5M18 41l6-5 6 5M5 21l8-1-3-7M43 27l-8 1 3 7M5 27l8 1-3 7M43 21l-8-1 3-7" fill="none" stroke-width="3"/></g>',
  sugarshield: '<path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z" fill="#fff"/><path d="M14 12l6 28M22 8l6 33M30 9l5 22" stroke="#ff8ad8" stroke-width="3.5"/>',
  fortress: '<rect x="6" y="28" width="36" height="12" rx="3" fill="#fff"/><rect x="13" y="18" width="20" height="12" rx="3" fill="#fff"/><path d="M30 21h15M30 26h15" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M14 17l-4-8m-3 2a6 6 0 0 1 8-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>',
  shockwave: '<path d="M4 40h40" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M12 34q12-12 24 0M6 30q18-20 36 0" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="19" y="6" width="10" height="20" rx="3" fill="#fff"/>',
};
export function abilitySvg(id) { return `<svg class="ab-svg" viewBox="0 0 48 48" aria-hidden="true">${ABILITY_SVG[id] || ABILITY_SVG.rally}</svg>`; }

export function mountAbility(hud, mountEl) {
  const game = hud.game;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ability-btn';
  btn.setAttribute('data-ui', '');
  btn.innerHTML = '<span class="ab-ring"></span><span class="ab-face"><span class="ab-ico"></span><span class="ab-cd"></span></span><span class="ab-chip">READY</span>';
  mountEl.appendChild(btn);
  const ico = btn.querySelector('.ab-ico'), cd = btn.querySelector('.ab-cd'), chip = btn.querySelector('.ab-chip');

  let swallowClick = false;
  const fire = () => {
    const ok = !!(game.heroes && game.heroes.useAbility());
    if (ok) { btn.classList.remove('used'); void btn.offsetWidth; btn.classList.add('used'); hud.ui?.vibrate?.(18); }
    return ok;
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); swallowClick = true; fire(); });
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (!swallowClick) fire(); swallowClick = false; });
  window.addEventListener('keydown', (e) => {
    if (game.state !== 'playing' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space' || e.code === 'KeyE' || e.key === 'e' || e.key === 'E') { e.preventDefault(); fire(); }
  });

  // active-ability timer pill in the power-up column
  let pill = null;
  const dropPill = () => { if (!pill) return; const n = pill.node; pill = null; n.classList.add('out'); setTimeout(() => n.remove(), 260); };
  const ev = game.events;
  ev.on('ability:start', (p) => {
    let dur = p.duration || 0;
    if (p.ability === 'fortress') { const f = game.heroes.abilities.fortress.last; if (f) dur = f.maxLife; }
    if (dur < 1.5 || !hud.powersEl) return;
    dropPill();
    const node = document.createElement('div');
    node.className = 'pw ab-pill in';
    node.style.setProperty('--pc', HERO_COLOR[p.hero] || '#ffd34d');
    node.innerHTML = `<div class="pw-ring"></div><div class="pw-ico">${abilitySvg(p.ability)}</div><div class="pw-lbl">${SHORT[p.ability] || ''}</div>`;
    hud.powersEl.appendChild(node);
    pill = { node, ring: node.querySelector('.pw-ring'), start: game.time, dur, last: -1 };
  });
  ev.on('run:start', dropPill);
  ev.on('ability:ready', () => { chipT = 1.4; chip.classList.remove('show'); void chip.offsetWidth; chip.classList.add('show'); });

  let lastF = -1, lastShow = null, lastHero = null, lastCd = '', lastReady = null, chipT = 0, lastT = 0;
  return {
    el: btn,
    update() {
      const H = game.heroes, run = game.run;
      const show = !!(run && run.active && game.state === 'playing' && !hud.hintOn && H && H.usable());
      if (show !== lastShow) { lastShow = show; btn.style.display = show ? '' : 'none'; if (!show) dropPill(); }
      if (pill) {
        const left = pill.dur - (game.time - pill.start);
        if (left <= 0 || !run || !run.active) dropPill();
        else {
          const f = Math.round((left / pill.dur) * 200) / 200;
          if (f !== pill.last) { pill.last = f; pill.ring.style.setProperty('--f', `${(f * 360).toFixed(1)}deg`); }
          pill.node.classList.toggle('ending', left < 1.5);
        }
      }
      if (!show) return;
      const ab = H.ability;
      if (H.id !== lastHero) {
        lastHero = H.id;
        const def = heroDef(H.id);
        ico.innerHTML = abilitySvg(ab.id);
        btn.style.setProperty('--hc', HERO_COLOR[H.id] || '#2f8cff');
        btn.setAttribute('aria-label', `${def.ability.name} (Space or E)`);
        btn.title = `${def.ability.name}: ${def.ability.text}`;
        lastF = -1;
      }
      const f = ab.ready ? 1 : Math.round((1 - ab.left / Math.max(0.01, ab.cd)) * 200) / 200;
      if (f !== lastF) { lastF = f; btn.style.setProperty('--f', `${(f * 360).toFixed(1)}deg`); }
      if (ab.ready !== lastReady) { lastReady = ab.ready; btn.classList.toggle('ready', ab.ready); }
      const c = ab.ready ? '' : String(Math.ceil(ab.left));
      if (c !== lastCd) { lastCd = c; cd.textContent = c; }
      const now = game.time, dt = Math.max(0, Math.min(0.1, now - lastT));
      lastT = now;
      if (chipT > 0) { chipT -= dt; if (chipT <= 0) chip.classList.remove('show'); }
    },
  };
}
