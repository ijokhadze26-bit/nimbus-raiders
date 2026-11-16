// Update 3 boss alerts on the HUD (mounted by hud.js): a red "RAGE!" flash when a boss drops below 25% hp (the
// boss bar then pulses red), a "PHASE 2" / "PHASE 3" banner for multi-phase bosses (the Tempest King), a green
// "MOVE TO THE SAFE SPOT!" call while a safe-spot warning is up, and threshold marks on the boss bar (phase
// changes + the 25% rage line). Pure DOM + CSS animations, nothing per frame.
import './hudboss.css';
import { RAGE } from '../data/bosses.js';

export function mountBossAlerts(hud) {
  const game = hud.game, ev = game.events;
  const mk = (cls) => { const e = document.createElement('div'); e.className = cls; return e; };
  const rage = mk('boss-alert rage-alert hidden');
  rage.innerHTML = '<div class="ba-big">RAGE!</div><div class="ba-sub">ATTACKS COME FASTER</div>';
  const phase = mk('boss-alert phase-alert hidden');
  const safe = mk('safe-call hidden');
  safe.innerHTML = '<span class="sc-dot"></span><span>MOVE TO THE SAFE SPOT!</span><span class="sc-dot"></span>';
  hud.root.appendChild(rage); hud.root.appendChild(phase); hud.root.appendChild(safe);
  const track = hud.bossBar.querySelector('.boss-track');
  const marks = mk('boss-marks');
  track.appendChild(marks);
  const timers = {};
  const show = (node, ms, key) => {
    node.classList.remove('hidden');
    node.style.animation = 'none';
    requestAnimationFrame(() => { node.style.animation = ''; });
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => node.classList.add('hidden'), ms);
  };
  const hideAll = () => {
    for (const k of Object.keys(timers)) clearTimeout(timers[k]);
    rage.classList.add('hidden'); phase.classList.add('hidden'); safe.classList.add('hidden');
    hud.bossBar.classList.remove('rage');
  };

  ev.on('boss:spawn', () => {
    hideAll();
    const b = game.boss;
    const at = [...((b && b.phaseAt) || [0.5]).map((f) => ({ f, k: 'ph' })), { f: RAGE.at, k: 'rg' }];
    marks.innerHTML = at.map((m) => `<i class="${m.k}" style="left:${(m.f * 100).toFixed(1)}%"></i>`).join('');
  });
  ev.on('boss:rage', () => {
    hud.bossBar.classList.add('rage');
    phase.classList.add('hidden'); // the newest alert wins (a big hit can cross a phase line and 25% at once)
    show(rage, 1500, 'rage');
    hud.buzz(90, 0);
  });
  ev.on('boss:phase', (p) => {
    if (!p || !(p.phases > 2)) return;
    phase.innerHTML = `<div class="ba-sub">${p.phase >= p.phases ? 'FINAL PHASE' : 'THE STORM GROWS'}</div><div class="ba-big">PHASE ${p.phase}</div>`;
    rage.classList.add('hidden');
    show(phase, 1700, 'phase');
  });
  ev.on('boss:safespot', (p) => {
    show(safe, Math.max(900, ((p && p.duration) || 2) * 1000 / Math.max(0.25, game.timeScale || 1)), 'safe');
    hud.buzz(40, 0);
  });
  ev.on('boss:attack', (p) => { if (p && p.attack === 'safespot') { clearTimeout(timers.safe); timers.safe = setTimeout(() => safe.classList.add('hidden'), 250); } });
  ev.on('boss:defeated', hideAll);
  ev.on('run:start', hideAll);
  ev.on('game:state', ({ state }) => { if (state !== 'playing' && state !== 'paused') hideAll(); });
  return { rage, phase, safe, marks };
}
