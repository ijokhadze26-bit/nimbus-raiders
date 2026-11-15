// SPEC2 §9 ui-screens (390x844): every info screen shows the numbers infofmt computes from data (so balance
// changes cannot break the checks), strong / weak lists with icons, lock lines on pages and chips, the shop's
// GUN PAINT note, the L13 loadout favours, the Compare sheet, >= 44 px tap targets and a clear title layout.
const g = window.__game, ui = g.ui, d = g.debug;
const F = await import('/src/ui/infofmt.js');
const { WEAPON_BY_ID } = await import('/src/data/weapons.js');
const { HERO_DEFS, HERO_DEF_BY_ID } = await import('/src/data/heroes.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const txt = (name) => ui.screens[name].el.textContent.replace(/\s+/g, ' ');
const has = (name, s, why) => { if (!txt(name).includes(s)) fails.push(`${name}: missing "${s}"${why ? ' (' + why + ')' : ''}`); };
const W = (id) => WEAPON_BY_ID[id], H = (id) => HERO_DEF_BY_ID[id];

g.save.reset();
// ---- armory: Emberstorm Mk III exact numbers (pre-balance: "21 per flame", "14/second for 1.5 s") ----
ui.nav('armory', { from: 'title', weapon: 'emberstorm' });
await wait(500);
for (const part of F.weaponParts(W('emberstorm'), 3)) has('armory', part, 'ember Mk III');
const e3 = F.weaponParts(W('emberstorm'), 3)[0];
const info = { ember: e3 };
has('armory', F.lockText(W('emberstorm')));
const lockFirst = ui.screens.armory.el.querySelector('.info-scroll').firstElementChild;
if (!lockFirst || !lockFirst.classList.contains('lock-line')) fails.push('armory: lock line is not the first body line');
for (const row of F.weaponMkTable(W('emberstorm'))) has('armory', row.dmg, 'Mk table ' + row.label);
// Void Siphon: lock text on the page and on its chip
ui.screens.armory.onAct('pick', { dataset: { id: 'voidsiphon' } });
await wait(100);
const vLock = F.lockText(W('voidsiphon'));
if (!vLock.includes('level 13') || !vLock.includes('3200')) fails.push('void lock text: ' + vLock);
has('armory', vLock);
const vChip = ui.screens.armory.el.querySelector('.chip[data-id="voidsiphon"]');
if (!vChip || !vChip.getAttribute('aria-label').includes(vLock) || !vChip.title.includes(vLock)) fails.push('void chip aria-label/title lacks the lock text');
if (!vChip.classList.contains('locked')) fails.push('void chip not a silhouette');
// strong / weak of every weapon: one icon + name per entry
for (const id of Object.keys(WEAPON_BY_ID)) {
  ui.screens.armory.onAct('pick', { dataset: { id } });
  const el = ui.screens.armory.el;
  for (const [key, cls] of [['strong', 'strong'], ['weak', 'weak']]) {
    const items = el.querySelectorAll(`.sw-col.${cls} li`);
    if (items.length !== W(id)[key].length) fails.push(`${id} ${key}: ${items.length} entries vs ${W(id)[key].length}`);
    F.targets(W(id)[key]).forEach((t, i) => { if (!items[i] || !items[i].querySelector('svg') || !items[i].textContent.includes(t.name)) fails.push(`${id} ${key} ${t.id} icon/name`); });
  }
}

// ---- heroes ----
ui.nav('heroes', { from: 'title', hero: 'rime' });
await wait(400);
for (const s of ['Whiteout', `${F.num(H('rime').ability.duration)} s`, `${F.num(H('rime').ability.cd)} s`]) has('heroes', s, 'rime');
ui.screens.heroes.onAct('pick', { dataset: { id: 'cinder' } });
await wait(50);
const meteor = F.abilityParts(H('cinder'), 3)[0];
info.meteor = meteor;
has('heroes', meteor, 'cinder meteor Mk III');
has('heroes', F.favouriteInfo(H('cinder'), g.save.data).text);
if (F.favouriteInfo(H('cinder'), g.save.data).text !== 'Favourite: Emberstorm (unlocks at level 5)') fails.push('cinder favourite text: ' + F.favouriteInfo(H('cinder'), g.save.data).text);
ui.screens.heroes.onAct('pick', { dataset: { id: 'vex' } });
has('heroes', 'Dodge speed 70% (moves side to side slower)');
const xLock = F.lockText(H('vex'));
if (!xLock.includes('level 12') || !xLock.includes('2800')) fails.push('vex lock text: ' + xLock);
has('heroes', xLock);
const xChip = ui.screens.heroes.el.querySelector('.chip[data-id="vex"]');
if (!xChip || !xChip.getAttribute('aria-label').includes(xLock)) fails.push('vex chip aria-label lacks the lock text');
for (const h of HERO_DEFS) {
  ui.screens.heroes.onAct('pick', { dataset: { id: h.id } });
  const el = ui.screens.heroes.el;
  for (const key of ['strong', 'weak']) {
    const items = el.querySelectorAll(`.sw-col.${key} li`);
    F.targets(h[key]).forEach((t, i) => {
      if (!items[i] || !items[i].querySelector('svg') || !items[i].textContent.includes(t.name) || !items[i].textContent.includes(t.why)) fails.push(`${h.id} ${key} ${t.id}`);
    });
  }
  has('heroes', F.healthLine(h)); has('heroes', F.speedLine(h)); has('heroes', h.passive.name.toUpperCase());
}
// the hero Mk control changes the squad-scaled numbers only
ui.screens.heroes.onAct('pick', { dataset: { id: 'cinder' } });
ui.screens.heroes.onAct('mk', { dataset: { mk: '5' } });
has('heroes', F.abilityParts(H('cinder'), 5)[0], 'meteor at Mk V');

// ---- tap targets on the info pages ----
async function targets(name) {
  await wait(420);
  for (const b of ui.screens[name].el.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width && (r.width < 44 || r.height < 44)) fails.push(`${name}: tap target ${b.dataset.act}/${b.dataset.id || b.dataset.mk || ''} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
}
await targets('heroes');
ui.nav('armory', { from: 'title' }); await targets('armory');

// ---- compare ----
ui.screens.armory.onAct('compare');
await wait(450);
const cmp = ui.screens.compare.el;
if (!ui.modals.includes('compare') || cmp.querySelectorAll('.cmp-col').length !== 2 || cmp.querySelectorAll('.cmp-pv').length !== 2) fails.push('compare sheet: two columns / two previews');
if (cmp.querySelectorAll('.bar-t.two').length !== 4) fails.push('compare: 4 overlaid bars');
await targets('compare');
ui.closeModal('compare');

// ---- loadout: L13 favours gearworks + spectra ----
ui.nav('loadout', { levelId: 13 });
await wait(400);
const favs = [...ui.screens.loadout.el.querySelectorAll('.lo-fav .lo-favw')].map((x) => x.title);
for (const id of ['gearworks', 'spectra']) if (!favs.includes(W(id).name)) fails.push('loadout L13 favours: ' + favs.join(','));
if (!txt('loadout').includes('FAVOURED')) fails.push('loadout: no FAVOURED line');
await targets('loadout');

// ---- shop: GUN PAINT tab ----
ui.nav('shop', { tab: 'weapons' });
await wait(300);
has('shop', 'Gun paint recolours your guns. Each weapon keeps its own bullets and effects.');
has('shop', 'GUN PAINT'); has('shop', 'PIP OUTFITS');

// ---- title: ARMORY / HEROES tiles clear of the logo, PLAY and the attract squad ----
ui.nav('title');
await wait(700);
const R = (s) => document.querySelector('.screen-title ' + s).getBoundingClientRect();
const logo = R('.title-logo'), row2 = R('.title-row2'), play = R('.btn-play');
const cam = g.camera, L = g.squad.leader, app = document.getElementById('app').getBoundingClientRect();
const proj = (x, y, z) => { const p = new cam.position.constructor(x, y, z).project(cam); return app.top + (1 - p.y) / 2 * app.height; };
const head = proj(L.x, 2.1, L.z), feet = proj(L.x, 0, L.z + 2.2);
if (row2.top < logo.bottom - 1) fails.push(`title: row overlaps logo ${row2.top} < ${logo.bottom}`);
if (row2.bottom > head) fails.push(`title: row overlaps squad ${row2.bottom} > ${Math.round(head)}`);
if (row2.bottom > play.top) fails.push('title: row overlaps PLAY');
for (const b of document.querySelectorAll('.screen-title .title-row2 .tbtn')) if (b.getBoundingClientRect().height < 84) fails.push('title tile < 84 px');
ui.screens.title.onAct('armory'); await wait(350);
if (g.state !== 'armory') fails.push('title ARMORY -> ' + g.state);
ui.nav('title'); await wait(300);
ui.screens.title.onAct('heroes'); await wait(350);
if (g.state !== 'heroes') fails.push('title HEROES -> ' + g.state);
ui.nav('title');
g.save.reset();
return { pass: fails.length === 0, fails, info, title: { logo: [logo.top, logo.bottom], row2: [row2.top, row2.bottom], head: Math.round(head), feet: Math.round(feet), play: play.top } };
