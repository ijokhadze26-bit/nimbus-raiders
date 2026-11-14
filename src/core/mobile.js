// Mobile browser robustness: viewport height on iOS Safari (no 100dvh before 15.4, URL bar resizes),
// no rubber-band / pinch / double-tap zoom / long-press menus outside the scrollable menu lists, pause on
// page hide / freeze, and a WebGL context-loss overlay (pause, wait for the browser to restore, else reload).
const SCROLLERS = '.map-scroll, .shop-body';

export function installMobile(game, engine) {
  const root = document.documentElement;

  // Visible viewport height as a CSS var (#app falls back to it where 100dvh is unsupported).
  const vv = window.visualViewport;
  const setVh = () => {
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-h', `${Math.round(h)}px`);
    // iOS can leave the page scrolled after a rotation / URL-bar collapse: the game must stay pinned
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  };
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', () => { setVh(); setTimeout(setVh, 350); });
  if (vv) vv.addEventListener('resize', setVh);

  // touch-action covers modern browsers; older iOS Safari still rubber-bands and pinch-zooms without these
  const inScroller = (t) => t && t.closest && t.closest(SCROLLERS);
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || !inScroller(e.target)) e.preventDefault();
  }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Page lifecycle: pause the run whenever the page stops being visible (tab switch, app switcher, lock).
  const hide = () => game.pause();
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('pagehide', hide);
  document.addEventListener('freeze', hide);

  // WebGL context loss (GPU reset, too many tabs, iOS backgrounding): pause and show a notice; three
  // rebuilds everything when the browser restores the context, otherwise offer a reload.
  let overlay = null, reloadT = 0;
  const showLost = () => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'gl-lost';
      overlay.setAttribute('data-ui', '');
      overlay.innerHTML = '<div class="gl-lost-card"><div class="gl-lost-title">ONE MOMENT…</div><div class="gl-lost-text">Getting the graphics back</div><button type="button" class="btn gl-lost-btn" hidden>TAP TO RELOAD</button></div>';
      overlay.querySelector('button').addEventListener('click', () => location.reload());
      (document.getElementById('app') || document.body).appendChild(overlay);
    }
    overlay.hidden = false;
    overlay.querySelector('button').hidden = true;
    clearTimeout(reloadT);
    reloadT = setTimeout(() => {
      if (!engine.lost || !overlay) return;
      overlay.querySelector('.gl-lost-title').textContent = 'GRAPHICS RESET';
      overlay.querySelector('.gl-lost-text').textContent = 'Your progress is saved.';
      overlay.querySelector('button').hidden = false;
    }, 3000);
  };
  engine.onContext.push((lost) => {
    if (lost) { game.pause(); showLost(); return; }
    clearTimeout(reloadT);
    if (overlay) overlay.hidden = true;
    game.engine.precompile(); // recompile up front instead of stalling on the first frames
  });
}
