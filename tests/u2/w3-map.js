// Update 3 world map (stage 1): 5 world bands / chips / banners and 50 nodes (boss 10/20/.., mini 5/15/..) with
// the boss names; locked worlds say who to beat; levels without data say COMING SOON (works with 15 or 50
// levels built); opens on the current level; chips scroll to a world; node -> loadout (world name + kind tag),
// locked node stays; PLAY = current level; title shows "WORLD n · LEVEL m"; no horizontal overflow, labels
// on screen, banners clear of nodes, tap targets >= 44 px.
// Screenshot cases: --query "test=1&mapcase=1|12|12w3|12n10|50w5|lo15" (unlocked level, then w = world chip,
// n = node in the middle, lo = loadout of that level; the scenario stops on that view).
const g = window.__game, ui = g.ui;
const { getLevel, LAST_LEVEL } = await import('/src/data/levels.js');
const { WORLDS, levelKind } = await import('/src/data/worlds.js');
const { BOSS_NAMES, kindTag } = await import('/src/ui/worldart.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const act = (name, a, data = {}) => ui.screens[name].onAct(a, { dataset: data });
const M = () => ui.screens.map;
const $$ = (s) => [...M().el.querySelectorAll(s)];
const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
const setUnlocked = (n) => g.save.update((d) => { d.unlockedLevel = n; d.stars = {}; for (let i = 1; i < n; i++) d.stars[i] = 1 + (i % 3); });
async function openMap(n) { setUnlocked(n); ui.nav('title'); await wait(260); ui.nav('map'); await wait(450); }
const cur = (n) => Math.min(LAST_LEVEL, n);

const mapcase = new URLSearchParams(location.search).get('mapcase');
g.save.reset();
if (mapcase) {
  const m = /^(lo)?(\d+)(?:w(\d)|n(\d+))?$/.exec(mapcase);
  // headless desktop does not advance CSS animations: finish the one-shot screen enter so the shot shows the page
  const settle = (s) => { for (const a of ui.screens[s].el.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); };
  if (m[1]) { setUnlocked(Number(m[2])); ui.nav('loadout', { levelId: Number(m[2]) }); await wait(900); settle('loadout'); return { mapcase }; }
  await openMap(Number(m[2]));
  settle('map');
  if (m[3]) { await wait(1200); M().scrollToWorld(Number(m[3]), false); await wait(300); }
  if (m[4]) { await wait(1200); const sc = M().el.querySelector('.map-scroll'); sc.scrollTop += M().el.querySelector(`.map-node[data-id="${m[4]}"]`).getBoundingClientRect().top - sc.clientHeight * 0.45; await wait(300); }
  return { mapcase, inView: M().worldInView(), scrollTop: M().el.querySelector('.map-scroll').scrollTop };
}

// ---- structure ----
await openMap(1);
const nodes = $$('.map-node'), bands = $$('.wm-band'), chips = $$('.wm-chip');
check(nodes.length === 50 && bands.length === 5 && chips.length === 5, `counts ${nodes.length}/${bands.length}/${chips.length}`);
for (let id = 1; id <= 50; id++) {
  const n = M().el.querySelector(`.map-node[data-id="${id}"]`), k = levelKind(id);
  const want = id % 10 === 0 ? 'boss' : id % 10 === 5 ? 'mini' : (id === 11 || id === 21 || id === 31 || id === 41) ? 'intro' : 'normal';
  check(k === want && n.classList.contains('k-' + k), `L${id} kind ${k}`);
  const label = n.nextElementSibling;
  if (k === 'boss' || k === 'mini') check(txt(label).includes(BOSS_NAMES[id]), `L${id} label "${txt(label)}" lacks ${BOSS_NAMES[id]}`);
  if (k === 'boss') check(n.querySelector('.wm-crown') && n.querySelector('.wm-skull'), `L${id} boss art`);
  if (k === 'mini') check(n.querySelector('.wm-mini'), `L${id} mini badge`);
  if (!getLevel(id)) check(n.classList.contains('soon') && txt(label).includes('COMING SOON'), `L${id} no data but not COMING SOON`);
}
for (const [i, w] of WORLDS.entries()) check(txt(bands[i].querySelector('.wm-bn-name')) === w.name, `banner ${i + 1} name`);
const big = (id) => M().el.querySelector(`.map-node[data-id="${id}"]`).getBoundingClientRect().width;
check(big(10) > big(5) && big(5) > big(4), `node sizes boss ${big(10)} mini ${big(5)} normal ${big(4)}`);

// ---- unlockedLevel 1: world 1 at the bottom, everything else locked ----
const sc = M().el.querySelector('.map-scroll');
check(sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 2, `L1: not scrolled to the bottom (${sc.scrollTop})`);
check(M().worldInView() === 1 && chips[0].classList.contains('on'), 'L1: world 1 chip not on');
check(M().el.querySelector('.map-node[data-id="1"]').classList.contains('current'), 'L1 not current');
check(M().el.querySelector('.map-node[data-id="1"] .pip'), 'Pip not on L1');
for (let i = 1; i < 5; i++) {
  check(chips[i].classList.contains('locked') && bands[i].classList.contains('w-locked'), `L1: world ${i + 1} not locked`);
  check(txt(bands[i].querySelector('.wm-bn-sub')).includes(`BEAT ${BOSS_NAMES[WORLDS[i].first - 1]} TO UNLOCK`), `L1: world ${i + 1} banner "${txt(bands[i].querySelector('.wm-bn-sub'))}"`);
}
check(txt(M().el.querySelector('.cur-lbl')) === 'WORLD 1 · LEVEL 1', 'footer ' + txt(M().el.querySelector('.cur-lbl')));
check(sc.scrollWidth <= sc.clientWidth + 1, `horizontal overflow ${sc.scrollWidth} > ${sc.clientWidth}`);
// tap targets + layout on the visible part
const W0 = M().el.getBoundingClientRect();
for (const c of chips) { const r = c.getBoundingClientRect(); check(r.height >= 44 && r.width >= 44, `chip ${c.dataset.w} ${r.width}x${r.height}`); }
for (const n of nodes) { const r = n.getBoundingClientRect(); check(r.width >= 44, `node ${n.dataset.id} ${r.width}`); }
const labels = $$('.map-label');
labels.forEach((l) => { const r = l.getBoundingClientRect(); check(r.left >= W0.left - 1 && r.right <= W0.right + 1, `label ${txt(l)} off screen ${r.left}..${r.right}`); });
const discs = nodes.map((n) => n.querySelector('.disc').getBoundingClientRect());
labels.forEach((l, i) => { const r = l.getBoundingClientRect(); discs.forEach((d, j) => { if (j !== i && overlap(r, d)) fails.push(`label L${i + 1} overlaps node L${j + 1}`); }); });
bands.forEach((b, i) => { const r = b.querySelector('.wm-banner').getBoundingClientRect(); discs.forEach((d, j) => { if (overlap(r, d)) fails.push(`banner ${i + 1} overlaps node L${j + 1}`); }); });

// locked node: stays on the map; chip -> world 3
act('map', 'node', { id: '2' });
check(g.state === 'map', 'locked node left the map: ' + g.state);
// the chip jump is an rAF tween; headless Chrome stalls frames for a few seconds after boot (any screen), so wait
// until frames flow before timing it
const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 150) await wait(150); };
const frames = (n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
await frames(4);
M().onAct('world', { dataset: { w: '3' } });
await until(() => !M().scrolling(), 20000);
check(M().worldInView() === 3 && chips[2].classList.contains('on'), `chip 3 -> world in view ${M().worldInView()} (scrollTop ${Math.round(sc.scrollTop)} / ${sc.scrollHeight})`);
M().onAct('world', { dataset: { w: '1' } });
await until(() => !M().scrolling(), 20000);
check(M().worldInView() === 1, `chip 1 -> world in view ${M().worldInView()}`);

// ---- unlockedLevel 12: world 2 open, world 3 locked (beat Ironhorn) ----
await openMap(12);
check(M().el.querySelector('.map-node[data-id="12"]').classList.contains('current'), 'L12 not current');
check(M().worldInView() === 2, 'L12: world in view ' + M().worldInView());
check(!bands[1].classList.contains('w-locked') && txt(bands[1].querySelector('.wm-bn-sub')).includes('/ 30'), 'L12: world 2 banner ' + txt(bands[1].querySelector('.wm-bn-sub')));
check(txt(bands[2].querySelector('.wm-bn-sub')).includes('BEAT IRONHORN TO UNLOCK'), 'L12: world 3 banner');
check(txt(M().el.querySelector('.cur-lbl')) === 'WORLD 2 · LEVEL 12', 'footer ' + txt(M().el.querySelector('.cur-lbl')));
act('map', 'node', { id: '13' });
check(g.state === 'map', 'locked L13 opened ' + g.state);
act('map', 'node', { id: '11' });
check(g.state === 'loadout', 'node 11 -> ' + g.state);
const lt = txt(ui.screens.loadout.el.querySelector('.lo-level'));
check(lt.includes('VOLCANIC FORGE') && lt.includes(kindTag(11, getLevel(11))), 'loadout L11: ' + lt);
act('loadout', 'back'); await wait(300);
check(g.state === 'map', 'loadout back -> ' + g.state);
act('map', 'play-current');
check(g.state === 'loadout' && ui.screens.loadout.el.querySelector('.lo-title').textContent === 'LEVEL 12', 'PLAY -> ' + g.state);
for (const id of [5, 10, 3]) {
  ui.nav('loadout', { levelId: id }); await wait(60);
  const t = txt(ui.screens.loadout.el.querySelector('.lo-level'));
  check(t.includes('SKY BRIDGE') && t.includes(kindTag(id, getLevel(id))), `loadout L${id}: ${t}`);
  if (id === 5 || id === 10) check(t.includes(BOSS_NAMES[id]) && t.includes(id === 5 ? 'MINI-BOSS' : 'BOSS'), `loadout L${id} boss: ${t}`);
}
ui.nav('title'); await wait(300);
check(txt(ui.screens.title.el.querySelector('.lvl')) === 'WORLD 2 · LEVEL 12', 'title ' + txt(ui.screens.title.el.querySelector('.lvl')));

// ---- unlockedLevel 50: every built world open; current = the last built level ----
await openMap(50);
const c = cur(50);
check(M().el.querySelector(`.map-node[data-id="${c}"]`).classList.contains('current'), `L50 save: L${c} not current`);
for (const [i, w] of WORLDS.entries()) {
  const built = !!getLevel(w.first), sub = txt(bands[i].querySelector('.wm-bn-sub'));
  check(bands[i].classList.contains('w-locked') === !built, `L50 save: world ${i + 1} locked=${bands[i].classList.contains('w-locked')}`);
  if (!built) check(sub.includes('COMING SOON'), `L50 save: world ${i + 1} banner ${sub}`);
}
if (LAST_LEVEL >= 50) check(M().worldInView() === 5, 'L50: world 5 not in view');
const out = { LAST_LEVEL, inView: M().worldInView(), height: sc.scrollHeight, dom: M().el.querySelectorAll('*').length };
g.save.reset();
ui.nav('title');
return { pass: fails.length === 0, fails, out };
