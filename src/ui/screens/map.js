// World map (update 3): one vertical scroll of 5 themed world bands (world 1 at the bottom), each with a title
// banner at its entrance and 10 level nodes on a winding road; boss nodes (10/20/..) are big with a crowned
// skull and the boss name, mini-boss nodes are medium with a badge, normal nodes show stars. A row of world
// chips under the top bar jumps to a world; locked worlds say who to beat. Levels without data (not built yet)
// show COMING SOON. Opens scrolled to the current level. Tap a node (or the big footer button) to open the
// pre-level LOADOUT screen for that level. Phone-cheap: ~50 nodes, static CSS / SVG scenery built once, the
// scroll handler only reads scrollTop and toggles classes when the world in view changes.
// Update 3 stage 3: an ELITE tag beside a node (away from its label) once the level has 3 stars (dim pulse = ELITE open, bright
// with purple stars = cleared on ELITE, save.elite).
import { screenEl, coinPill, el } from '../ui.js';
import { icon } from '../icons.js';
import { getLevel, LAST_LEVEL } from '../../data/levels.js';
import { WORLDS, TOTAL_LEVELS, LEVELS_PER_WORLD, levelKind, isWorldUnlocked } from '../../data/worlds.js';
import { BOSS_NAMES, bossName, worldLevelText, WORLD_LOOK, WORLD_GLYPH, BOSS_SKULL, BOSS_CROWN, MINI_BADGE, bandDecor, bandSeam } from '../worldart.js';
import { ENTER_MS } from './armory.js';
import '../worldmap.css';
import { ELITE_BADGE, eliteStarsHtml } from '../elite.js';

const STEP = 106;          // px between nodes inside a world
const TOPGAP = 104;        // band top -> its boss node (room for the crown + Pip)
const BOTGAP = 46;         // banner top -> the world's first node
const BANNER = 176;        // the world title banner at the bottom (entrance) of each band
const BAND_H = TOPGAP + STEP * (LEVELS_PER_WORLD - 1) + BOTGAP + BANNER;
const TOP_PAD = 190;       // above world 5: under the top bar + chips (+ safe-area padding in CSS)
const BOTTOM_PAD = 150;    // below world 1: the PLAY footer
const HEIGHT = TOP_PAD + BOTTOM_PAD + BAND_H * WORLDS.length;
const PIP = `<svg viewBox="0 0 40 40" class="pip-head" aria-hidden="true">
  <ellipse cx="20" cy="37" rx="9" ry="2.2" fill="#1b3a8a" opacity=".25"/>
  <circle cx="20" cy="18" r="15" fill="#fff" stroke="#1b3a8a" stroke-width="3"/>
  <path d="M8.6 18.5c0-4 4.6-6.6 11.4-6.6s11.4 2.6 11.4 6.6-4.4 7-11.4 7-11.4-3-11.4-7z" fill="#2fd6c8" stroke="#1b3a8a" stroke-width="2.4"/>
  <path d="M13 15.6c2.2-1 4.6-1.4 7-1.4" stroke="#d9fffb" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M7 27c4 3 9 4.4 13 4.4S29 30 33 27" stroke="#ff8a2a" stroke-width="4.5" stroke-linecap="round" fill="none"/>
</svg>`;
const STARS = `<span class="stars">${icon('star', 's1')}${icon('star', 's2')}${icon('star', 's3')}</span>`;

/** Band b (0 = world 1) top in map px; node y inside its band. */
const bandTop = (b) => HEIGHT - BOTTOM_PAD - (b + 1) * BAND_H;
const nodeLocalY = (i) => TOPGAP + (LEVELS_PER_WORLD - 1 - i) * STEP;
const gateLocalY = () => BAND_H - BANNER * 0.5;

export function createMap(ui) {
  const root = screenEl('map');
  root.innerHTML = `
    <div class="map-scroll"><div class="map-inner"><svg class="map-path" aria-hidden="true"></svg></div></div>
    <div class="map-fade"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque">${icon('map')}<span>WORLD MAP</span></div>
      ${coinPill()}
    </div>
    <div class="wm-chips" role="toolbar" aria-label="Worlds"></div>
    <div class="map-footer">
      <button type="button" class="btn btn-gold btn-xl" data-act="play-current">
        <span class="play-ico">${icon('play')}</span><span class="col"><span class="big">PLAY</span><span class="sub wl cur-lbl">WORLD 1 · LEVEL 1</span></span>
      </button>
    </div>`;
  const scroll = root.querySelector('.map-scroll');
  const inner = root.querySelector('.map-inner');
  const svg = root.querySelector('.map-path');
  const curLbl = root.querySelector('.cur-lbl');
  const chipsEl = root.querySelector('.wm-chips');
  inner.style.height = `${HEIGHT}px`;

  // ---- world bands (scenery, seam, banner) + world chips ----
  const bands = WORLDS.map((w, b) => {
    const look = WORLD_LOOK[w.key];
    const band = el('div', `wm-band w-${w.key}`);
    band.style.top = `${bandTop(b)}px`;
    band.style.height = `${BAND_H}px`;
    band.style.setProperty('--c1', look.c1); band.style.setProperty('--c2', look.c2); band.style.setProperty('--c3', look.c3);
    const prev = WORLDS[b - 1];
    band.innerHTML = `<div class="wm-decor">${bandDecor(w.key, BAND_H)}${prev ? bandSeam(w.key, WORLD_LOOK[prev.key].top) : ''}</div>
      <div class="wm-banner" style="top:${BAND_H - BANNER + 18}px">
        <span class="wm-bn-tag">WORLD ${w.id}</span><span class="wm-bn-name">${w.name}</span><span class="wm-bn-sub"></span>
      </div>`;
    inner.appendChild(band);
    const chip = el('button', `wm-chip w-${w.key}`, `<span class="g">${WORLD_GLYPH[w.key]}</span><span class="l">${icon('lock')}</span><span class="t">${w.short.toUpperCase()}</span>`);
    chip.type = 'button';
    chip.dataset.act = 'world';
    chip.dataset.w = w.id;
    chip.setAttribute('aria-label', `World ${w.id}: ${w.name}`);
    chip.style.setProperty('--c1', look.c1); chip.style.setProperty('--c2', look.c2); chip.style.setProperty('--c3', look.c3);
    chipsEl.appendChild(chip);
    return { w, b, band, chip, sub: band.querySelector('.wm-bn-sub'), banner: band.querySelector('.wm-banner') };
  });

  // ---- level nodes + labels (inside their band) ----
  const nodes = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const def = getLevel(id);
    const kind = levelKind(id);
    const b = Math.floor((id - 1) / LEVELS_PER_WORLD), i = (id - 1) % LEVELS_PER_WORLD;
    const W = WORLDS[b];
    const boss = kind === 'boss' || kind === 'mini' ? bossName(id, def) || BOSS_NAMES[id] : null;
    const n = el('button', `map-node k-${kind}`);
    n.type = 'button';
    n.dataset.act = 'node';
    n.dataset.id = id;
    n.style.setProperty('--ring', W.color);
    n.setAttribute('aria-label', `Level ${id}${boss ? `, ${kind === 'boss' ? 'boss' : 'mini-boss'} ${boss}` : def ? `, ${def.name}` : ', coming soon'}`);
    n.innerHTML = kind === 'boss'
      ? `${BOSS_CROWN}<span class="disc">${BOSS_SKULL}<span class="num">${id}</span><span class="lock">${icon('lock')}</span></span>${STARS}`
      : `<span class="disc"><span class="num">${id}</span><span class="lock">${icon('lock')}</span></span>${kind === 'mini' ? MINI_BADGE : ''}${STARS}`;
    n.insertAdjacentHTML('beforeend', `<span class="wm-elite">${ELITE_BADGE}${eliteStarsHtml(0)}</span>`);
    const head = kind === 'boss' ? `LEVEL ${id} · BOSS` : kind === 'mini' ? `LEVEL ${id} · MINI-BOSS` : `LEVEL ${id}`;
    const title = boss || (def?.name ? def.name : '');
    const label = el('div', `map-label k-${kind}`, `<span class="n">${head}</span>${title ? `<span class="t">${title}</span>` : ''}${!def ? '<span class="t soon">COMING SOON</span>' : ''}`);
    if (!def) { n.classList.add('soon'); label.classList.add('soon'); }
    const y = nodeLocalY(i);
    n.style.top = `${y}px`;
    label.style.top = `${y}px`;
    bands[b].band.append(n, label);
    nodes.push({ id, n, label, kind, b, y, gy: bandTop(b) + y, x: 0 });
  }
  const pip = el('span', 'pip', PIP);

  let lastW = 0, viewH = 700, pathPts = null, nodePt = [], inView = -1, raf = 0, skipT = 0;
  function layout() {
    const w = scroll.clientWidth || 390;
    viewH = scroll.clientHeight || viewH;
    if (w === lastW) return;
    lastW = w;
    const amp = Math.min(w * 0.26, 132);
    const pts = [];
    nodePt = [];
    for (const o of nodes) {
      const gi = o.id - 1;
      if (gi % LEVELS_PER_WORLD === 0) pts.push([w * 0.5, bandTop(o.b) + gateLocalY()]); // road runs through each world's gate banner
      o.x = w * 0.5 + Math.sin(gi * 0.95 + 0.4) * amp;
      o.n.style.left = `${o.x}px`;
      const r = o.kind === 'boss' ? 66 : o.kind === 'mini' ? 56 : 48;
      const right = o.x < w * 0.5;
      o.label.classList.toggle('right', right);
      o.n.classList.toggle('lab-right', right); // the ELITE tag sits on the side away from the label
      o.label.style.left = right ? `${o.x + r}px` : '';
      o.label.style.right = right ? '' : `${w - o.x + r}px`;
      o.label.style.maxWidth = `${Math.max(90, Math.round(right ? w - o.x - r - 8 : o.x - r - 8))}px`;
      nodePt.push(pts.length);
      pts.push([o.x, o.gy]);
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${HEIGHT}`);
    svg.setAttribute('width', w); svg.setAttribute('height', HEIGHT);
    const d = smoothPath(pts);
    svg.innerHTML = `<path d="${d}" class="p-shadow"/><path d="${d}" class="p-base"/><path class="p-done"/><path d="${d}" class="p-dash"/>`;
    pathPts = pts;
    sync();
  }

  function sync() {
    const d = ui.save.data;
    const cur = current();
    curLbl.textContent = worldLevelText(cur);
    for (const o of nodes) {
      const locked = o.id > cur;
      const stars = d.stars[o.id] || 0;
      o.n.classList.toggle('locked', locked);
      o.n.classList.toggle('current', o.id === cur);
      o.n.classList.toggle('done', stars > 0);
      o.n.dataset.stars = stars;
      const es = d.elite[o.id] || 0, eo = !locked && stars >= 3;
      o.n.classList.toggle('elite-open', eo && !es);
      o.n.classList.toggle('elite-done', eo && es > 0);
      if (eo && es && o.es !== es) { o.es = es; o.n.querySelector('.wm-elite .e-stars').outerHTML = eliteStarsHtml(es); }
      o.label.classList.toggle('locked', locked);
    }
    const cn = nodes[cur - 1];
    if (cn && pip.parentNode !== cn.n) cn.n.appendChild(pip);
    for (const B of bands) {
      const { w } = B;
      const built = !!getLevel(w.first);
      const open = isWorldUnlocked(d, w.id) && built;
      B.band.classList.toggle('w-locked', !open);
      B.chip.classList.toggle('locked', !open);
      let stars = 0;
      for (let id = w.first; id <= w.last; id++) stars += d.stars[id] || 0;
      B.sub.className = `wm-bn-sub${open ? '' : ' lk'}`;
      B.sub.innerHTML = open ? `${icon('star')}<b>${stars} / ${LEVELS_PER_WORLD * 3}</b>`
        : !isWorldUnlocked(d, w.id) ? `${icon('lock')}<b>BEAT ${BOSS_NAMES[w.first - 1] || 'THE BOSS'} TO UNLOCK</b>`
          : `${icon('lock')}<b>COMING SOON</b>`;
    }
    // the gold "travelled" part of the road runs from the world 1 gate to the current node
    const done = svg.querySelector('.p-done');
    if (done && pathPts) done.setAttribute('d', smoothPath(pathPts, nodePt[cur - 1] || 0));
    inView = -1;
    onScroll();
  }

  /** The node to play next: the highest unlocked level that has data. */
  function current() { return Math.max(1, Math.min(LAST_LEVEL, TOTAL_LEVELS, ui.save.data.unlockedLevel)); }

  // chip jumps tween scrollTop in rAF (works where smooth scrollTo does not: old iOS Safari, headless);
  // a finger or wheel on the map stops the tween
  let tween = 0;
  const stopTween = () => { cancelAnimationFrame(tween); tween = 0; };
  function scrollTo(top, smooth) {
    top = Math.max(0, Math.min(HEIGHT - viewH, top));
    stopTween();
    if (!smooth) { scroll.scrollTop = top; onScroll(); return; }
    const from = scroll.scrollTop, dist = top - from, ms = Math.min(900, 280 + Math.abs(dist) * 0.18);
    let t0 = 0;
    const step = (t) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / ms);
      scroll.scrollTop = from + dist * (1 - Math.pow(1 - k, 3));
      tween = k < 1 ? requestAnimationFrame(step) : 0;
      if (!tween) onScroll();
    };
    tween = requestAnimationFrame(step);
  }
  function scrollToCurrent(smooth) { scrollTo(nodes[current() - 1].gy - viewH * 0.55, smooth); }
  /** A world chip: the current level when it is in that world, else the world's banner low in the view. */
  function scrollToWorld(id, smooth = true) {
    const B = bands[id - 1];
    if (!B) return;
    const cur = current();
    if (cur >= B.w.first && cur <= B.w.last) scrollToCurrent(smooth);
    else scrollTo(bandTop(B.b) + BAND_H - BANNER * 0.5 - viewH * 0.66, smooth);
  }

  // which world is in the middle of the view: chip highlight + only nearby bands animate
  function onScroll() {
    raf = 0;
    const mid = scroll.scrollTop + viewH * 0.5;
    const b = Math.max(0, Math.min(WORLDS.length - 1, Math.floor((HEIGHT - BOTTOM_PAD - mid) / BAND_H)));
    if (b === inView) return;
    inView = b;
    for (const B of bands) {
      B.chip.classList.toggle('on', B.b === b);
      B.band.classList.toggle('near', Math.abs(B.b - b) <= 1);
    }
  }
  scroll.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
  for (const ev of ['touchstart', 'wheel', 'mousedown']) scroll.addEventListener(ev, stopTween, { passive: true });
  window.addEventListener('resize', () => { if (root.isConnected) { lastW = 0; layout(); } });

  function start(id) {
    if (id > current() || !getLevel(id)) return false;
    ui.nav('loadout', { levelId: id });
    return true;
  }

  return {
    el: root,
    show() {
      ui.refreshCoins(true);
      lastW = 0;
      layout(); sync();
      scrollToCurrent(false);
      const st0 = scroll.scrollTop; // the next frame re-measures; it re-centres only if nobody scrolled meanwhile
      requestAnimationFrame(() => { lastW = 0; layout(); if (!tween && Math.abs(scroll.scrollTop - st0) < 2) scrollToCurrent(false); });
      // the map is opaque: once its enter animation is over the 3D attract scene behind it is not drawn
      clearTimeout(skipT);
      skipT = setTimeout(() => { if (ui.current === 'map' && root.isConnected && !root.classList.contains('leave')) ui.game.engine.skipMain = true; }, ENTER_MS);
    },
    hide() { clearTimeout(skipT); stopTween(); ui.game.engine.skipMain = false; },
    onAct(act, btn) {
      if (act === 'back') ui.nav('title');
      else if (act === 'play-current') start(current());
      else if (act === 'world') scrollToWorld(Number(btn.dataset.w));
      else if (act === 'node') {
        const id = Number(btn.dataset.id);
        if (!start(id) && btn.classList) {
          btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope');
          ui.vibrate(30);
        }
      }
    },
    onBack() { ui.nav('title'); },
    relayout() { lastW = 0; layout(); },
    scrollToWorld,
    /** Test/debug hooks: the world in the middle of the view; whether a chip jump is still tweening. */
    worldInView: () => inView + 1,
    scrolling: () => !!tween,
  };
}

/** Catmull-Rom -> cubic bezier through the points (first `segs` segments only, same curve). */
function smoothPath(p, segs = p.length - 1) {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < Math.min(segs, p.length - 1); i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
