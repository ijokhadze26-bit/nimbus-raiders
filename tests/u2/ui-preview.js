// SPEC2 §9 ui-preview: the scissored preview draws inside its rect (pixel differs from the panel background);
// engine.skipMain is true only after the enter animation and false after hide; scissor + viewport are restored
// (a full-canvas sample after leaving shows the game); programs and geometries do not grow when the Armory is
// reopened 5 times; <= 30 calls per preview (Armory, Heroes, Loadout, both Compare columns, High and Low);
// on Low every weapon / hero demo still spawns FX; locked items use the silhouette override.
const g = window.__game, ui = g.ui, eng = g.engine, R = eng.renderer;
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const { HERO_IDS } = await import('/src/data/heroes.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const gl = R.getContext();
const pr = R.getPixelRatio();
/** Renders one frame now and reads the pixel at CSS (x, y) of the canvas (same task, so the buffer is valid). */
function pixel(x, y) {
  eng.render();
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(x * pr), Math.floor((eng.height - y) * pr) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [...px.slice(0, 3)];
}
const near = (a, b, t = 10) => a.every((v, i) => Math.abs(v - b[i]) <= t);
const info = {};
g.debug.unlockAll();

// ---- skipMain timing + pixels ----
ui.nav('armory', { from: 'title', weapon: 'thunderclap' });
check(eng.skipMain === false, 'skipMain true during the enter animation');
await wait(150);
check(eng.skipMain === false, 'skipMain true at 150 ms');
await wait(600);
check(eng.skipMain === true, 'skipMain not set after the enter animation');
const page = ui.screens.armory, pv = page.el.querySelector('.ip-pv');
for (let i = 0; i < 50 && !pv.classList.contains('live'); i++) await wait(100); // async shader compile (software GL is slow)
check(pv.classList.contains('live'), 'preview window not live');
let ox = 0, oy = 0; for (let n = pv; n && n !== ui.root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; } // layout rect (no enter scale)
const r = { left: ox, top: oy, width: pv.offsetWidth, height: pv.offsetHeight }, app = { left: 0, top: 0 };
const panel = [246, 251, 255]; // the info body background (#f6fbff)
const inside = pixel(r.left + r.width / 2, r.top + 10);
info.inside = inside; info.pv = { r: [r.left, r.top, r.width, r.height], frames: page.preview.stats.frames, ready: page.preview.ready, app: [app.left, app.top] };
check(!near(inside, panel), 'preview pixel equals the panel background ' + inside);
check(page.preview.stats.calls > 0 && page.preview.stats.calls <= 30, 'armory preview calls ' + page.preview.stats.calls);
check(eng.stats.calls === 0, 'main scene drawn while skipMain');
// ---- leave: skipMain off, scissor off, full viewport, the game shows again ----
ui.nav('title');
check(eng.skipMain === false, 'skipMain still on after hide');
await wait(400);
pixel(1, 1);
check(!gl.isEnabled(gl.SCISSOR_TEST), 'scissor test left on');
const vp = gl.getParameter(gl.VIEWPORT);
check(vp[0] === 0 && vp[1] === 0 && vp[2] === gl.drawingBufferWidth && vp[3] === gl.drawingBufferHeight, 'viewport not restored ' + [...vp]);
check(eng.stats.calls > 20, 'main scene not drawn after leaving (' + eng.stats.calls + ' calls)');
const full = pixel(eng.width / 2, eng.height * 0.15);
check(!near(full, inside, 3), 'full-canvas sample still shows the preview');

// ---- reopen 5 times: programs + geometries stable ----
const cycle = async () => { for (let i = 0; i < 5; i++) { ui.nav('armory', { from: 'title', weapon: WEAPON_IDS[i] }); await wait(500); ui.nav('title'); await wait(300); } };
await cycle(); // fills the per-weapon gun / projectile geometry caches
const p0 = R.info.programs.length, g0 = R.info.memory.geometries;
await cycle();
info.programs = [p0, R.info.programs.length]; info.geometries = [g0, R.info.memory.geometries];
check(R.info.programs.length === p0, `programs grew ${p0} -> ${R.info.programs.length}`);
check(R.info.memory.geometries === g0, `geometries grew ${g0} -> ${R.info.memory.geometries}`);

// ---- call budget on every preview, High and Low; FX on Low for every demo ----
const calls = {};
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  for (const id of WEAPON_IDS) {
    ui.nav('armory', { from: 'title', weapon: id }); await wait(1300);
    const pr2 = ui.screens.armory.preview;
    calls[`${q}:${id}`] = pr2.stats.calls;
    check(pr2.stats.calls > 0 && pr2.stats.calls <= 30, `${q} ${id}: calls ${pr2.stats.calls}`);
    if (q === 'low') check(pr2.fx && pr2.stats.frames > 0, `low ${id}: no frames`);
  }
  for (const id of HERO_IDS) {
    ui.nav('heroes', { from: 'title', hero: id }); await wait(4600); // one full ability cycle (every 4 s)
    const pr2 = ui.screens.heroes.preview;
    calls[`${q}:${id}`] = pr2.stats.calls;
    check(pr2.stats.calls > 0 && pr2.stats.calls <= 30, `${q} ${id}: calls ${pr2.stats.calls}`);
  }
  ui.nav('loadout', { levelId: 3 }); await wait(900);
  calls[`${q}:loadout`] = ui.screens.loadout.preview.stats.calls;
  check(calls[`${q}:loadout`] > 0 && calls[`${q}:loadout`] <= 30, `${q} loadout calls ${calls[`${q}:loadout`]}`);
  ui.nav('armory', { from: 'title', weapon: 'voidsiphon' }); await wait(500);
  ui.screens.armory.onAct('compare'); await wait(900);
  const cmp = ui.screens.compare;
  check(page.el.style.visibility === 'hidden', 'page under compare not hidden');
  check(cmp.el.querySelectorAll('.cmp-pv.live').length === 2, 'compare previews not live');
  ui.closeModal('compare'); await wait(300);
  check(page.el.style.visibility === '', 'page not restored after compare');
}
info.calls = calls;
g.applyQuality('high');

// ---- locked = silhouette override ----
g.save.reset();
ui.nav('armory', { from: 'title', weapon: 'voidsiphon' }); await wait(600);
check(ui.screens.armory.preview.item.locked === true && pv.classList.contains('is-locked'), 'locked weapon not flagged');
ui.nav('title'); await wait(200);
return { pass: fails.length === 0, fails, info };
