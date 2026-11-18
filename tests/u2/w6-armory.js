// Stage 6 w6-armory: the five new enemy types have their own matchup columns (each averages ~1.0, values in
// 0.6..1.8), BOSS_MUL covers every boss type, the weapon / hero STRONG / WEAK lists name the new enemies and
// bosses where the table says so, every chip on the Armory / Heroes / Compare screens shows a real name (never
// an id) plus a one-line description on tap, nothing overflows at 390 px, and Cinder's Meteor Drop demo on the
// Heroes page never puts a disc on the pedestal (the old brown scorch) - High and Low.
const g = window.__game, ui = g.ui;
const M = await import('/src/data/matchups.js');
const W = await import('/src/data/weapons.js');
const H = await import('/src/data/heroes.js');
const E = await import('/src/data/enemies.js');
const B = await import('/src/data/bosses.js');
const F = await import('/src/ui/infofmt.js');
const { targetBlurb } = await import('/src/ui/enemyblurbs.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const info = {};
const NEW_ENEMIES = ['blaster', 'healer', 'spawner', 'sniper', 'flyer'];
const NEW_BOSSES = ['glacius', 'gumdrop'];
const weapons = W.WEAPON_DEFS;
const ids = (list) => list.map((x) => x.id);

// ---- tables ----
info.cols = {};
for (const t of E.ENEMY_TYPES) {
  const vals = weapons.map((w) => M.VS[w.id][t]);
  check(vals.every((v) => typeof v === 'number'), `VS column ${t} missing for some weapon`);
  if (!NEW_ENEMIES.includes(t)) continue;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  info.cols[t] = Math.round(avg * 1000) / 1000;
  check(avg >= 0.95 && avg <= 1.08, `VS ${t} averages ${avg.toFixed(3)} (want ~1.0)`);
  check(vals.every((v) => v >= 0.6 && v <= 1.8), `VS ${t} has a value outside 0.6..1.8: ${vals.join(',')}`);
  check(new Set(vals).size >= 4, `VS ${t} is too flat: ${vals.join(',')}`);
  check(M.VS.neutral[t] === 1, `neutral ${t} != 1`);
}
for (const type of Object.keys(B.BOSSES)) for (const el of M.ELEMENTS) check(typeof M.BOSS_MUL[el][type] === 'number', `BOSS_MUL.${el}.${type} missing`);
// the hot-path index table follows VS
for (const w of weapons) for (const t of NEW_ENEMIES) check(Math.abs(M.VS_INDEX[w.id][E.ENEMY_INDEX[t]] - M.VS[w.id][t]) < 1e-6, `VS_INDEX ${w.id}.${t}`);

// ---- strong / weak lists: the table's clear cases are listed, every entry is a real target ----
for (const w of weapons) {
  const S = ids(w.strong), Wk = ids(w.weak);
  for (const t of NEW_ENEMIES) {
    const v = M.VS[w.id][t];
    if (v >= 1.4) check(S.includes(t), `${w.id} x${v} vs ${t} but not in strong`);
    if (v <= 0.7) check(Wk.includes(t), `${w.id} x${v} vs ${t} but not in weak`);
  }
  for (const b of NEW_BOSSES) {
    const v = M.BOSS_MUL[w.id][b];
    if (v >= 1.3) check(S.includes(b), `${w.id} x${v} vs ${b} but not in strong`);
    if (v <= 0.8) check(Wk.includes(b), `${w.id} x${v} vs ${b} but not in weak`);
  }
  check(!S.some((x) => Wk.includes(x)), `${w.id} lists a target as both strong and weak`);
}
const all = [...weapons, ...H.HERO_DEFS];
for (const t of [...NEW_ENEMIES, ...NEW_BOSSES]) check(all.some((d) => ids(d.strong).includes(t) || ids(d.weak).includes(t)), `${t} is on no strong / weak list`);
for (const t of NEW_ENEMIES) check(H.HERO_DEFS.some((h) => ids(h.strong).includes(t) || ids(h.weak).includes(t)), `${t} is on no hero list`);
for (const d of all) for (const x of [...d.strong, ...d.weak]) {
  check(!!(E.ENEMIES[x.id] || B.BOSSES[x.id]), `${d.id}: unknown target ${x.id}`);
  const name = F.targetName(x.id);
  check(name !== x.id && /^[A-Z]/.test(name), `${d.id}: chip name "${name}" for ${x.id}`);
  check(targetBlurb(x.id).length > 10, `${d.id}: no description for ${x.id}`);
  check(!x.why || x.why.length <= 70, `${d.id}: why for ${x.id} is long (${x.why && x.why.length})`);
}
info.bossLines = { mothermurk: targetBlurb('mothermurk'), ironhorn: targetBlurb('ironhorn') };
check(targetBlurb('mothermurk').includes('Candy Queen') && targetBlurb('mothermurk').includes('level 40'), 'Mother Murk line does not name the Candy Queen fight: ' + targetBlurb('mothermurk'));
check(targetBlurb('ironhorn').includes('Frosthorn'), 'Ironhorn line does not name Frosthorn: ' + targetBlurb('ironhorn'));

// ---- screens at 390 px: real names, tap -> description, no overflow ----
g.debug.unlockAll();
const overflow = (el) => { const bad = []; for (const n of el.querySelectorAll('.sw-i, .sw-col, .cmp-sw li, .cmp-col')) { const p = n.parentElement.getBoundingClientRect(), r = n.getBoundingClientRect(); if (r.right > p.right + 1.5 || r.left < p.left - 1.5) bad.push(n.className + ':' + (n.textContent || '').slice(0, 20)); } return bad; };
for (const [scr, list, key] of [['armory', weapons, 'weapon'], ['heroes', H.HERO_DEFS, 'hero']]) {
  ui.nav(scr, { from: 'title', [key]: list[0].id }); await wait(450);
  const page = ui.screens[scr];
  for (const d of list) {
    page.onAct('pick', { dataset: { id: d.id } }); await wait(30);
    const body = page.el.querySelector('.ip-body');
    const names = [...body.querySelectorAll('.sw-n')].map((n) => n.textContent);
    const want = [...d.strong, ...d.weak].map((x) => F.targetName(x.id));
    check(JSON.stringify(names) === JSON.stringify(want), `${scr} ${d.id}: chips ${names.join('/')} vs ${want.join('/')}`);
    check(body.scrollWidth <= body.clientWidth + 1, `${scr} ${d.id}: body scrolls sideways (${body.scrollWidth} > ${body.clientWidth})`);
    const ob = overflow(body); check(!ob.length, `${scr} ${d.id}: overflow ${ob.slice(0, 3).join(', ')}`);
  }
  // tap the first entry: its description opens, a second tap closes it
  const li = page.el.querySelector('.sw-i[data-act="sw"]');
  li.click(); await wait(20);
  const dsc = li.querySelector('.sw-d');
  check(li.classList.contains('open') && dsc && getComputedStyle(dsc).display !== 'none' && dsc.textContent === targetBlurb(li.dataset.id), `${scr}: tapping a chip does not show its description`);
  li.click(); await wait(20);
  check(!li.classList.contains('open') && getComputedStyle(dsc).display === 'none', `${scr}: second tap does not close the description`);
  check(page.el.textContent.includes('Tap an enemy or boss'), `${scr}: no tap hint`);
}
// compare: chips show names and a tap shows the description line
ui.nav('armory', { from: 'title', weapon: 'emberstorm' }); await wait(400);
ui.screens.armory.onAct('compare', {}); await wait(450);
const cmp = ui.screens.compare.el;
const cli = cmp.querySelector('.cmp-sw li[data-act="swc"]');
check(!!cli, 'compare: no tappable strong / weak chips');
if (cli) {
  cli.click(); await wait(20);
  const p = cli.parentElement.nextElementSibling;
  check(p && !p.hidden && p.textContent.includes(targetBlurb(cli.dataset.id)), 'compare: tap shows no description');
}
const cb = cmp.querySelector('.cmp-body');
check(cb.scrollWidth <= cb.clientWidth + 1, `compare body scrolls sideways (${cb.scrollWidth} > ${cb.clientWidth})`);
const weakH = [...cmp.querySelectorAll('.cmp-col h5')].filter((h) => h.textContent === 'WEAK');
check(weakH.length === 2 && weakH.every((h) => getComputedStyle(h).color === 'rgb(224, 40, 60)'), 'compare WEAK heading lost its red colour');
ui.closeModal('compare'); await wait(400);

// ---- Cinder demo: never a disc on the pedestal; the meteor is cleaned up (High and Low) ----
info.cinder = {};
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  ui.nav('title'); await wait(300);
  ui.nav('heroes', { from: 'title', hero: 'cinder' });
  const pv = ui.screens.heroes.el.querySelector('.ip-pv');
  for (let i = 0; i < 60 && !pv.classList.contains('live'); i++) await wait(100);
  const P = ui.screens.heroes.preview, table = P.root() && P.root().parent;
  check(!!table, `${q}: no preview table`);
  if (!table) continue;
  const disc = table.children.find((c) => c.isInstancedMesh && c.geometry.type === 'CircleGeometry');
  const ring = table.children.find((c) => c.isInstancedMesh && c.geometry.type === 'RingGeometry');
  const root = P.root(), base = root.children.length;
  let maxDisc = 0, maxRing = 0, maxKids = 0, backToBase = false;
  const frames0 = P.stats.frames, t0 = performance.now();
  while (performance.now() - t0 < 6500) { // more than one 4 s ability loop + its 1.8 s meteor cleanup
    maxDisc = Math.max(maxDisc, disc.count); maxRing = Math.max(maxRing, ring.count); maxKids = Math.max(maxKids, root.children.length); if (maxKids > base && root.children.length === base) backToBase = true;
    await wait(50);
  }
  info.cinder[q] = { maxDisc, maxRing, maxKids, base, backToBase, frames: P.stats.frames - frames0 };
  check(maxDisc === 0, `${q}: Cinder demo drew ${maxDisc} disc(s) on the pedestal`);
  check(maxRing > 0, `${q}: Cinder demo shows no Meteor Drop flash (ability loop not seen)`);
  check(maxKids > base && backToBase, `${q}: the meteor rock did not appear and get cleaned up (max ${maxKids}, base ${base})`);
}
g.applyQuality('high');
ui.nav('title'); await wait(300);
return { pass: fails.length === 0, fails, info };
