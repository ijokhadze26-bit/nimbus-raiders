// Level map: a vertical winding path of 15 nodes climbing through the clouds (level 1 at the bottom).
// Nodes are locked / unlocked / current with earned stars; opens scrolled to the current node.
// Tap a node to start it; the big footer button plays the current level.
import { screenEl, coinPill, el } from '../ui.js';
import { icon } from '../icons.js';
import { getLevel, LEVEL_COUNT, LAST_LEVEL } from '../../data/levels.js';

const STEP = 124;        // px between nodes
const TOP_PAD = 150;
const BOTTOM_PAD = 210;
const THEME_CYCLE = ['noon', 'sunset', 'dusk', 'dawn', 'storm', 'night'];
const THEME_RING = { noon: '#59c1ff', dawn: '#ff9cc8', sunset: '#ff9a3d', dusk: '#a46bff', storm: '#7d8fb3', night: '#3d4fd6' };
const PIP = `<svg viewBox="0 0 40 40" class="pip-head" aria-hidden="true">
  <ellipse cx="20" cy="37" rx="9" ry="2.2" fill="#1b3a8a" opacity=".25"/>
  <circle cx="20" cy="18" r="15" fill="#fff" stroke="#1b3a8a" stroke-width="3"/>
  <path d="M8.6 18.5c0-4 4.6-6.6 11.4-6.6s11.4 2.6 11.4 6.6-4.4 7-11.4 7-11.4-3-11.4-7z" fill="#2fd6c8" stroke="#1b3a8a" stroke-width="2.4"/>
  <path d="M13 15.6c2.2-1 4.6-1.4 7-1.4" stroke="#d9fffb" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M7 27c4 3 9 4.4 13 4.4S29 30 33 27" stroke="#ff8a2a" stroke-width="4.5" stroke-linecap="round" fill="none"/>
</svg>`;

export function createMap(ui) {
  const root = screenEl('map');
  root.innerHTML = `
    <div class="map-sky"></div>
    <div class="map-scroll"><div class="map-inner"><svg class="map-path"></svg></div></div>
    <div class="map-fade"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque">${icon('map')}<span>SKY MAP</span></div>
      ${coinPill()}
    </div>
    <div class="map-footer">
      <button type="button" class="btn btn-gold btn-xl" data-act="play-current">
        <span class="play-ico">${icon('play')}</span><span class="col"><span class="big">PLAY</span><span class="sub cur-lbl">LEVEL 1</span></span>
      </button>
    </div>`;
  const scroll = root.querySelector('.map-scroll');
  const inner = root.querySelector('.map-inner');
  const svg = root.querySelector('.map-path');
  const curLbl = root.querySelector('.cur-lbl');
  const height = TOP_PAD + BOTTOM_PAD + STEP * (LEVEL_COUNT - 1);
  inner.style.height = `${height}px`;
  decorate(inner, height);

  const nodes = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const def = getLevel(id);
    const theme = def?.theme || THEME_CYCLE[(id - 1) % THEME_CYCLE.length];
    const n = el('button', 'map-node');
    n.type = 'button';
    n.dataset.act = 'node';
    n.dataset.id = id;
    n.style.setProperty('--ring', THEME_RING[theme] || '#59c1ff');
    n.innerHTML = `<span class="disc"><span class="num">${id}</span><span class="lock">${icon('lock')}</span></span>
      <span class="stars">${icon('star', 's1')}${icon('star', 's2')}${icon('star', 's3')}</span>
      <span class="pip">${PIP}</span>`;
    if (id % 5 === 0) n.classList.add('major');
    const label = el('div', 'map-label', `<span class="n">LEVEL ${id}</span>${def?.name ? `<span class="t">${def.name}</span>` : '<span class="t soon">COMING SOON</span>'}`);
    if (!def) { n.classList.add('soon'); label.classList.add('soon'); }
    inner.appendChild(n);
    inner.appendChild(label);
    nodes.push({ id, n, label, y: 0, x: 0 });
  }

  let lastW = 0;
  let pathPts = null;
  function layout() {
    const w = scroll.clientWidth || 390;
    if (w === lastW) return;
    lastW = w;
    const pts = nodes.map((o, i) => {
      o.y = height - BOTTOM_PAD - i * STEP;
      o.x = w * 0.5 + Math.sin(i * 0.95 + 0.4) * w * 0.26;
      o.n.style.left = `${o.x}px`; o.n.style.top = `${o.y}px`;
      const right = o.x < w * 0.5;
      o.label.classList.toggle('right', right);
      o.label.style.top = `${o.y}px`;
      o.label.style.left = right ? `${o.x + 50}px` : '';
      o.label.style.right = right ? '' : `${w - o.x + 50}px`;
      return [o.x, o.y];
    });
    svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
    svg.setAttribute('width', w); svg.setAttribute('height', height);
    const d = smoothPath(pts);
    svg.innerHTML = `<path d="${d}" class="p-shadow"/><path d="${d}" class="p-base"/><path class="p-done"/><path d="${d}" class="p-dash"/>`;
    pathPts = pts;
    sync();
  }

  function sync() {
    const d = ui.save.data;
    const cur = current();
    curLbl.textContent = `LEVEL ${cur}`;
    for (const o of nodes) {
      const locked = o.id > cur;
      const stars = d.stars[o.id] || 0;
      o.n.classList.toggle('locked', locked);
      o.n.classList.toggle('current', o.id === cur);
      o.n.classList.toggle('done', stars > 0);
      o.n.dataset.stars = stars;
      o.label.classList.toggle('locked', locked);
    }
    // the gold "travelled" part of the path runs from level 1 to the current node
    const done = svg.querySelector('.p-done');
    if (done && pathPts) done.setAttribute('d', cur > 1 ? smoothPath(pathPts, cur - 1) : '');
  }

  /** The node to play next: the highest unlocked level that has data. */
  function current() { return Math.max(1, Math.min(LAST_LEVEL, ui.save.data.unlockedLevel)); }

  function scrollToCurrent(smooth) {
    const o = nodes[current() - 1];
    const top = Math.max(0, o.y - scroll.clientHeight * 0.55);
    if (smooth && scroll.scrollTo) scroll.scrollTo({ top, behavior: 'smooth' });
    else scroll.scrollTop = top;
  }

  function start(id) {
    if (id > current()) return;
    ui.game.startLevel(id);
  }

  return {
    el: root,
    show() {
      ui.refreshCoins(true);
      lastW = 0;
      requestAnimationFrame(() => { layout(); sync(); scrollToCurrent(false); });
      layout(); sync();
      scroll.scrollTop = Math.max(0, height - scroll.clientHeight);
    },
    onAct(act, btn) {
      if (act === 'back') ui.nav('title');
      else if (act === 'play-current') start(current());
      else if (act === 'node') {
        const id = Number(btn.dataset.id);
        if (id > current()) {
          btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope');
          ui.vibrate(30);
          return;
        }
        start(id);
      }
    },
    onBack() { ui.nav('title'); },
    relayout() { lastW = 0; layout(); },
  };
}

/** Catmull-Rom -> cubic bezier through the node centers (first `segs` segments only, same curve). */
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

/** Clouds, floating islands and stars scattered behind the path (deterministic layout). */
function decorate(inner, height) {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const frag = document.createDocumentFragment();
  for (let y = 60; y < height; y += 120 + rnd() * 60) {
    const c = el('div', 'map-cloud');
    const s = 0.6 + rnd() * 0.9;
    c.style.cssText = `top:${y}px;left:${-10 + rnd() * 90}%;--s:${s.toFixed(2)};--d:${(14 + rnd() * 12).toFixed(1)}s;opacity:${(0.55 + rnd() * 0.4).toFixed(2)}`;
    frag.appendChild(c);
  }
  for (let i = 0; i < 6; i++) {
    const isl = el('div', 'map-island');
    isl.style.cssText = `top:${200 + rnd() * (height - 500)}px;left:${rnd() < 0.5 ? 2 + rnd() * 12 : 74 + rnd() * 14}%;--s:${(0.6 + rnd() * 0.5).toFixed(2)};--d:${(4 + rnd() * 3).toFixed(1)}s`;
    frag.appendChild(isl);
  }
  for (let i = 0; i < 40; i++) {
    const st = el('div', 'map-star');
    st.style.cssText = `top:${rnd() * height * 0.38}px;left:${rnd() * 100}%;--d:${(1.5 + rnd() * 2.5).toFixed(1)}s;--z:${(0.5 + rnd()).toFixed(2)}`;
    frag.appendChild(st);
  }
  inner.insertBefore(frag, inner.firstChild);
}
