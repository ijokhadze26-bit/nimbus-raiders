// SPEC2 §5 / §9 heroes-hud: a pointerdown on the ability button while another pointer drags on #app uses the
// ability (and the drag keeps going); the recharge ring --f follows the cooldown; Space and E work; the button
// is hidden during the L1-2 drag hint, outside an active run and on the result screen; a lasting ability
// shows its timer pill; the button does not cover the squad bubble at 320 raiders.
const g = window.__game, d = g.debug, ui = g.ui;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], info = {};
const btn = document.querySelector('.ability-btn');
if (!btn) return { pass: false, fails: ['no .ability-btn'] };
const frame = () => ui.update(1 / 60);
const shown = () => btn.style.display !== 'none' && btn.offsetParent !== null;
g.loop.stop();
d.setAutopilot(false);
const ready = () => { const a = g.heroes.ability; a.ready = true; a.left = 0; };

// hint level (L1, no autopilot): hidden while the drag hint shows
d.setLoadout('pip', 'thunderclap');
d.startLevel(1); d.simulate(0.2); frame();
info.hint = ui.hud.hintOn;
if (ui.hud.hintOn && shown()) fails.push('button visible during the drag hint');

// L5: visible; pointerdown while a drag is active on #app uses the ability
d.startLevel(5); d.simulate(0.5); frame();
if (!shown()) fails.push('button hidden in an active run');
const app = document.getElementById('app');
const surf = g.input.surface || app;
const r = surf.getBoundingClientRect();
const P = (type, id, x, y, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1, pointerType: 'touch' }));
P('pointerdown', 1, r.width / 2, r.height * 0.7, surf);
P('pointermove', 1, r.width / 2 + 40, r.height * 0.7, window);
if (!g.input.dragging) fails.push('drag did not start');
ready(); frame();
const c0 = g.squad.count;
const br = btn.getBoundingClientRect();
P('pointerdown', 2, br.x + br.width / 2, br.y + br.height / 2, btn);
P('pointerup', 2, br.x + br.width / 2, br.y + br.height / 2, btn);
btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));     // the click that follows is swallowed
info.rally = g.squad.count - c0;
if (!(g.squad.count > c0) || g.heroes.used !== 1) fails.push(`pointerdown during a drag: used ${g.heroes.used}, squad ${c0} -> ${g.squad.count}`);
if (!g.input.dragging || g.input.pointerId !== 1) fails.push('the drag was interrupted by the button press');
P('pointerup', 1, r.width / 2 + 40, r.height * 0.7, window);
// ring --f follows the recharge
frame();
const f0 = btn.style.getPropertyValue('--f');
d.simulate(5); frame();
const f1 = btn.style.getPropertyValue('--f');
info.ring = [f0, f1];
if (!(parseFloat(f1) > parseFloat(f0))) fails.push(`ring did not advance: ${f0} -> ${f1}`);
const want = Math.round((1 - g.heroes.ability.left / g.heroes.ability.cd) * 200) / 200 * 360;
if (Math.abs(parseFloat(f1) - want) > 0.2) fails.push(`ring ${f1} vs expected ${want.toFixed(1)}deg`);
if (btn.classList.contains('ready')) fails.push('ready class while recharging');
ready(); frame();
if (!btn.classList.contains('ready')) fails.push('no ready class');
// keyboard: Space, then E
let n = g.heroes.used;
g.state = 'playing';
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
if (g.heroes.used !== n + 1) fails.push('Space did not use the ability');
ready(); n = g.heroes.used;
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
if (g.heroes.used !== n + 1) fails.push('E did not use the ability');

// a lasting ability shows a timer pill (Sugar Shield 5 s)
d.setLoadout('bonbon', 'sugarrush');
d.startLevel(5); d.simulate(0.3); ready(); frame();
d.useAbility(); frame();
const pill = document.querySelector('.hud-powers .ab-pill');
if (!pill) fails.push('no ability timer pill');
d.simulate(5.2); frame();
await wait(300);
if (document.querySelector('.hud-powers .ab-pill:not(.out)')) fails.push('pill outlived the ability');

// does not cover the squad bubble at 320 raiders (leader on the right lane)
d.setLoadout('pip', 'thunderclap');
d.startLevel(5); d.give('troops', 320 - g.squad.count);
g.input.setTarget(4.4); d.simulate(1.5);
g.loop.start(); await wait(600); g.loop.stop(); frame();
const bb = document.querySelector('.squad-bubble .inner').getBoundingClientRect(), ab = btn.getBoundingClientRect();
const overlap = !(bb.right < ab.left || bb.left > ab.right || bb.bottom < ab.top || bb.top > ab.bottom);
info.bubble = { bubble: [Math.round(bb.left), Math.round(bb.top), Math.round(bb.right), Math.round(bb.bottom)], button: [Math.round(ab.left), Math.round(ab.top), Math.round(ab.right), Math.round(ab.bottom)] };
if (overlap) fails.push('ability button covers the squad bubble');
// result screen: hidden
g.win(); d.simulate(3); frame();
info.resultState = g.state;
if (shown()) fails.push('button visible on the result screen');
// menus: hidden
d.toTitle(); frame();
if (shown()) fails.push('button visible on the title');
g.loop.start();
return { pass: fails.length === 0, fails, info };
