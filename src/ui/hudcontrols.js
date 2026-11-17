// In-run controls HUD (update 3 stage 4, STAGE4.md A). mountControls(hud) -> { update() } (hud.update calls it
// every frame). Three pieces:
//  - COMBO meter under the coin pill: count, x1.1 / x1.2 / x1.3 tier chip, a bar to the next tier, a pulse on
//    tier-up and a "COMBO LOST" flash (game/combo.js).
//  - FORMATION button above the ability button: icon + LINE / WEDGE / CIRCLE label; tap or F cycles it
//    (game/formation.js).
//  - DODGE chip beside the ability button: roll icon + conic cooldown ring, tap = roll (swipe up / W / ArrowUp
//    do the same through core/input.js), "DODGED!" pop when a hit is skipped (game/dodge.js).
// The ability button, formation button and dodge chip sit on save.settings.abilitySide (hud.side-left swaps the
// weapon badge over). First-time hint "SWIPE UP TO DODGE" on a campaign level >= 2 (once, kept in localStorage).
import './hudcontrols.css';
import { COMBO_TIERS } from '../game/combo.js';
import { DODGE } from '../game/dodge.js';

const HINT_KEY = 'nimbusRaiders.hint.dodge';
const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="4.2"/>`;
export const FORMATION_SVG = {
  line: [6, 15, 24, 33, 42].map((x) => DOT(x, 19) + DOT(x, 30)).join(''),
  wedge: DOT(24, 10) + DOT(17, 19) + DOT(31, 19) + DOT(10, 28) + DOT(24, 28) + DOT(38, 28) + DOT(4, 37) + DOT(44, 37),
  circle: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => DOT(24 + Math.cos((k * Math.PI) / 4) * 15, 24 + Math.sin((k * Math.PI) / 4) * 15)).join('') + DOT(24, 24),
};
const svg = (body, cls = 'fm-svg') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><g fill="#fff">${body}</g></svg>`;
const ROLL_SVG = '<svg class="dg-svg" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6l11 12h-7v9h-8v-9h-7z" fill="#fff"/><path d="M10 34q14 12 28 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M34 28l5 6-7 2" fill="#fff"/></svg>';
const FORM_TIP = { line: 'LINE: wide, +12% damage vs the horde', wedge: 'WEDGE: arrow, +20% boss damage', circle: 'CIRCLE: packed, shrugs off some hits, -10% damage' };

export function mountControls(hud) {
  const game = hud.game, root = hud.el;
  const mk = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };

  // ---- combo meter ----
  const combo = mk('div', 'combo-meter', '<div class="cm-row"><span class="cm-lbl">COMBO</span><span class="cm-n">0</span><span class="cm-mul">x1.0</span></div><div class="cm-bar"><i></i></div><div class="cm-lost">COMBO LOST</div>');
  root.appendChild(combo);
  const cN = combo.querySelector('.cm-n'), cMul = combo.querySelector('.cm-mul'), cBar = combo.querySelector('.cm-bar i');

  // ---- formation button + dodge chip ----
  const fbtn = mk('button', 'form-btn', `<span class="fm-face"><span class="fm-ico"></span></span><span class="fm-lbl">LINE</span>`);
  fbtn.type = 'button'; fbtn.setAttribute('data-ui', '');
  const dbtn = mk('button', 'dodge-btn', `<span class="dg-ring"></span><span class="dg-face">${ROLL_SVG}</span><span class="dg-lbl">DODGE</span><span class="dg-pop">DODGED!</span>`);
  dbtn.type = 'button'; dbtn.setAttribute('data-ui', ''); dbtn.setAttribute('aria-label', 'Dodge roll (swipe up, W or Up arrow)');
  root.appendChild(fbtn); root.appendChild(dbtn);
  const fIco = fbtn.querySelector('.fm-ico'), fLbl = fbtn.querySelector('.fm-lbl'), dPop = dbtn.querySelector('.dg-pop');

  // ---- hint ----
  const hint = mk('div', 'dodge-hint hidden', `<span class="dh-arrow">${ROLL_SVG}</span><span class="dh-text">SWIPE UP TO DODGE</span>`);
  root.appendChild(hint);

  const press = (btn, fn) => {
    let swallow = false;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); swallow = true; fn(); });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (!swallow) fn(); swallow = false; });
  };
  const cycle = () => { if (game.formation.cycle()) { hud.ui?.vibrate?.(10); game.events.emit('ui:click', {}); } };
  press(fbtn, cycle);
  press(dbtn, () => game.dodge.trigger());
  window.addEventListener('keydown', (e) => {
    if (game.state !== 'playing' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') { e.preventDefault(); cycle(); }
  });

  // ---- events ----
  const ev = game.events;
  let hintT = 0, hintDone = readHint(), lostT = 0;
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  ev.on('combo:tier', () => restart(combo, 'tierup'));
  ev.on('combo:lost', (p) => { if (p.count >= 5) { lostT = 1.1; combo.classList.add('lost'); restart(combo, 'lostflash'); } });
  ev.on('dodge:start', () => { restart(dbtn, 'used'); hud.ui?.vibrate?.(14); if (hintT > 0) { hintT = 0.01; } markHint(); });
  ev.on('dodge:skip', () => restart(dPop, 'show'));
  ev.on('formation:change', () => restart(fbtn, 'swap'));
  const applySide = () => { root.classList.toggle('side-left', game.save?.data?.settings?.abilitySide === 'left'); };
  ev.on('run:start', () => { applySide(); hintT = 0; hint.classList.add('hidden'); lastN = lastTier = lastMode = lastCd = null; });
  ev.on('settings:changed', applySide);
  ev.on('save:changed', applySide);
  applySide();

  function markHint() { if (hintDone) return; hintDone = true; try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ } }

  let lastShow = null, lastN = null, lastTier = null, lastFrac = -1, lastMode = null, lastCd = null, lastReady = null, lastRoll = null, lastT = 0, comboOn = null;
  return {
    combo, fbtn, dbtn, hint,
    update() {
      const run = game.run;
      const show = !!(run && run.active && game.state === 'playing' && !hud.hintOn && game.squad.count > 0);
      if (show !== lastShow) { lastShow = show; fbtn.style.display = dbtn.style.display = show ? '' : 'none'; if (!show) { combo.classList.remove('on'); comboOn = false; } }
      const now = game.time, dt = Math.max(0, Math.min(0.1, now - lastT));
      lastT = now;
      if (!show) { if (hintT > 0) { hintT = 0; hint.classList.add('hidden'); } return; }
      // combo
      const C = game.combo, n = C.n;
      if (lostT > 0) { lostT -= dt; if (lostT <= 0) combo.classList.remove('lost'); }
      const on = n > 0 || lostT > 0;
      if (on !== comboOn) { comboOn = on; combo.classList.toggle('on', on); }
      if (n !== lastN) { lastN = n; cN.textContent = String(n); }
      if (C.tier !== lastTier) { lastTier = C.tier; cMul.textContent = 'x' + COMBO_TIERS[C.tier].mul.toFixed(1); combo.dataset.tier = C.tier; }
      const f = Math.round(C.frac() * 100) / 100;
      if (f !== lastFrac) { lastFrac = f; cBar.style.transform = `scaleX(${f})`; }
      // formation
      const F = game.formation;
      if (F.mode !== lastMode) {
        lastMode = F.mode;
        fIco.innerHTML = svg(FORMATION_SVG[F.mode]); fLbl.textContent = F.name;
        fbtn.dataset.mode = F.mode; fbtn.title = FORM_TIP[F.mode] + ' (F)'; fbtn.setAttribute('aria-label', 'Formation: ' + FORM_TIP[F.mode] + ' (F)');
      }
      // dodge cooldown ring
      const D = game.dodge, cd = Math.round((D.cd / DODGE.cooldown) * 100) / 100;
      if (cd !== lastCd) { lastCd = cd; dbtn.style.setProperty('--f', `${((1 - cd) * 360).toFixed(1)}deg`); }
      const ready = D.ready;
      if (ready !== lastReady) { lastReady = ready; dbtn.classList.toggle('ready', ready); }
      const rolling = D.rollT > 0;
      if (rolling !== lastRoll) { lastRoll = rolling; dbtn.classList.toggle('rolling', rolling); }
      // first-time hint
      if (!hintDone && hintT <= 0 && run.mode === 'level' && run.levelId >= 2 && !game.autopilot?.enabled && run.dist > 50 && run.phase === 'run') {
        hintT = 3.6; hint.classList.remove('hidden'); restart(hint, 'in');
      }
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) { hint.classList.add('hidden'); markHint(); } }
    },
  };
}

function readHint() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } }
