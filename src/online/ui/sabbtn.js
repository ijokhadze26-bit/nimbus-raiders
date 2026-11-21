// The SABOTAGE button of an online match (STAGE2 "Builder SABUI" point 2). A copy of src/ui/hudability.js
// mountAbility in the sabotage purple, on the side OPPOSITE the ability button (.hud.side-left / .hud.left-hand,
// set by ui.applyHand: ability right -> sabotage left, above the weapon badge), 62 px:
//   - conic ring `--f` = progress to the next normal charge, quantised to 1/40 (full while a charge is held);
//   - the icon of the kind a send uses now (`next`), or the big kind in gold with a BIG tag while one is held;
//   - "x2" while two normal charges are stored, the seconds of the 6 s send gap while waiting;
//   - a one-shot READY chip on sab:charge, a NOW! chip + pulse while a send is possible and its target is in danger.
// Pointerdown (works while another finger drags; the next click is swallowed), key Q on desktop (not in INPUT /
// TEXTAREA). A tap calls game.versus.sab.send(); a refused send shakes and plays 'deny'.
// It reads game.versus.sab (src/online/game/sabotage.js; without one the button never shows). It is put into the HUD on
// 'versus:start' and taken out on any other run, so the single-player HUD never has it. DOM writes only on change.
import { sabIcon, sabKind, SAB_COLOR, BIG_COLOR } from './sabwords.js';

const Q = 40;            // ring steps
const CHIP_S = 1.4;      // READY chip
const DANGER = 5;        // targetDanger from this value on: NOW!

export const sabOf = (game) => { const vs = game.versus, s = vs && vs.sab; return s && typeof s.view === 'function' ? s : null; };

export function mountSabButton(ctx) {
  const { game, ui } = ctx;
  const hud = ui.hud, ev = game.events;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sab-btn';
  btn.setAttribute('data-ui', '');
  btn.setAttribute('aria-label', 'Send sabotage (Q)');
  btn.title = 'Sabotage: send trouble to your rival (Q)';
  btn.style.display = 'none';
  btn.innerHTML = '<span class="sb-ring"></span><span class="sb-face"><span class="sb-ico"></span><span class="sb-wait num"></span></span>'
    + '<span class="sb-x2">x2</span><span class="sb-big">BIG</span><span class="sb-chip">READY</span><span class="sb-now">NOW!</span>';
  const ico = btn.querySelector('.sb-ico'), waitEl = btn.querySelector('.sb-wait'), chip = btn.querySelector('.sb-chip');
  let mounted = false, chipT = 0;
  const S = { show: null, f: -1, code: -1, cls: '', wait: '' };

  const inMatch = () => !!(game.run && game.run.mode === 'versus' && game.state === 'playing' && game.versus && game.versus.live);
  const sfx = (name) => ev.emit('hazard:sfx', { sfx: name, opts: null }, true);
  const replay = (cls) => { btn.classList.remove(cls); void btn.offsetWidth; btn.classList.add(cls); };

  function fire() {
    const s = sabOf(game);
    if (!s || !S.show || !inMatch()) return false;
    let r = null;
    try { r = s.send(); } catch (e) { console.warn('[online] sabotage send failed', e); }
    if (r && r.ok) { btn.classList.remove('deny'); replay('used'); ui.vibrate?.(20); return true; }
    btn.classList.remove('used'); replay('deny'); sfx('deny');
    return false;
  }

  let swallowClick = false;
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); swallowClick = true; fire(); });
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (!swallowClick) fire(); swallowClick = false; });
  window.addEventListener('keydown', (e) => {
    if (!mounted || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code !== 'KeyQ' && e.key !== 'q' && e.key !== 'Q') return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || !inMatch()) return;
    e.preventDefault();
    fire();
  });

  function mount() {
    if (!mounted) { hud.el.appendChild(btn); mounted = true; }
    Object.assign(S, { show: null, f: -1, code: -1, cls: '', wait: '' });
    chipT = 0; chip.classList.remove('show');
    btn.className = 'sab-btn';
    btn.style.display = 'none';
  }
  function unmount() {
    if (!mounted) return;
    btn.remove(); mounted = false; S.show = null;
  }

  ev.on('versus:start', mount);
  ev.on('run:start', (p) => { if (p.mode !== 'versus') unmount(); });
  ev.on('sab:charge', (p) => {
    if (!mounted || (p && p.lost)) return;
    chipT = CHIP_S;
    chip.textContent = p && p.source === 'boss' ? 'BIG!' : 'READY';
    chip.classList.remove('show'); void chip.offsetWidth; chip.classList.add('show');
  });

  function update(dt) {
    if (!mounted) return;
    const s = sabOf(game);
    const v = s && inMatch() ? s.view() : null;
    const show = !!(v && v.on);
    if (show !== S.show) { S.show = show; btn.style.display = show ? '' : 'none'; }
    if (chipT > 0) { chipT -= dt || 0; if (chipT <= 0) chip.classList.remove('show'); }
    if (!show) return;
    // (a charge in hand reads as a full ring, like a ready ability; the x2 badge says when a second one is stored)
    const f = v.ready >= 1 || v.big ? 1 : Math.round(Math.max(0, Math.min(1, v.fill || 0)) * Q) / Q;
    if (f !== S.f) { S.f = f; btn.style.setProperty('--f', `${(f * 360).toFixed(1)}deg`); }
    const code = v.big || v.next || 1;
    if (code !== S.code) {
      S.code = code;
      const k = sabKind(code);
      ico.innerHTML = sabIcon(code);
      btn.style.setProperty('--kc', v.big ? BIG_COLOR : (k ? k.color : SAB_COLOR));
      btn.setAttribute('aria-label', `Send ${k ? k.name : 'sabotage'} (Q)`);
    }
    const ready = v.ready > 0 || v.big > 0;
    const now = !!v.can && (v.targetDanger | 0) >= DANGER;
    const cls = 'sab-btn' + (ready ? ' ready' : '') + (v.can ? ' can' : '') + (v.big ? ' big' : '') + (v.ready >= 2 ? ' x2' : '') + (now ? ' now' : '')
      + (btn.classList.contains('used') ? ' used' : '') + (btn.classList.contains('deny') ? ' deny' : '');
    if (cls !== S.cls) { S.cls = cls; btn.className = cls; }
    const w = v.wait > 0 ? String(Math.ceil(v.wait)) : '';
    if (w !== S.wait) { S.wait = w; waitEl.textContent = w; }
  }

  return { el: btn, update, fire, get mounted() { return mounted; }, get shown() { return !!S.show; } };
}
