// @smoke --size 360x780
// SPEC2 §5 title gate at 360x780 (ui-screens.js covers 390x844): the ARMORY / HEROES tiles overlap neither the
// logo, the PLAY button nor the attract squad, and the squad stays visible.
const g = window.__game, ui = g.ui;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
// ---- title: ARMORY / HEROES tiles clear of the logo, PLAY and the attract squad ----
ui.nav('title');
await wait(900);
const R = (s) => document.querySelector('.screen-title ' + s).getBoundingClientRect();
const logo = R('.title-logo'), row2 = R('.title-row2'), play = R('.btn-play');
const cam = g.camera, L = g.squad.leader, app = document.getElementById('app').getBoundingClientRect();
const proj = (x, y, z) => { const p = new cam.position.constructor(x, y, z).project(cam); return app.top + (1 - p.y) / 2 * app.height; };
const head = proj(L.x, 2.1, L.z), feet = proj(L.x, 0, L.z + 2.2);
if (row2.top < logo.bottom - 1) fails.push(`title: row overlaps logo ${row2.top} < ${logo.bottom}`);
if (row2.bottom > head) fails.push(`title: row overlaps squad ${row2.bottom} > ${Math.round(head)}`);
if (row2.bottom > play.top) fails.push('title: row overlaps PLAY');
for (const b of document.querySelectorAll('.screen-title .title-row2 .tbtn')) if (b.getBoundingClientRect().height < 84) fails.push('title tile < 84 px');
if (head < row2.bottom || feet > play.top + 40) fails.push('squad hidden');
return { pass: fails.length === 0, fails, title: { logo: [logo.top, logo.bottom], row2: [row2.top, row2.bottom], head: Math.round(head), feet: Math.round(feet), play: play.top } };
