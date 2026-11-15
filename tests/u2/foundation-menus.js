// SPEC2 §5 / §9 foundation-menus: the new pages are reachable through ui.nav and back, the attract scene keeps
// stepping behind them, the title still shows, and the HUD has the ability button mount.
const g = window.__game, d = g.debug, ui = g.ui;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const shown = (name) => { const s = ui.screens[name]; return !!(s && s.el.isConnected && !s.el.classList.contains('leave')); };
for (const [state, opts] of [['armory', { from: 'title' }], ['heroes', { from: 'title' }], ['loadout', { levelId: 3 }]]) {
  ui.nav(state, opts);
  await wait(450);
  if (g.state !== state || ui.current !== state || !shown(state)) fails.push(`${state}: state ${g.state}, current ${ui.current}`);
  const a = d.state().dist;
  let b = a;
  for (let i = 0; i < 20 && b === a; i++) { await wait(150); b = d.state().dist; } // headless frames can be slow

  if (a === b) fails.push(`${state}: attract stopped (dist ${a})`);
  ui.screens[state].onBack();
  await wait(350);
  const back = state === 'loadout' ? 'map' : 'title';
  if (g.state !== back || ui.current !== back) fails.push(`${state} back -> ${g.state}/${ui.current}, want ${back}`);
}
// opts reach the page
ui.nav('armory', { from: 'title', weapon: 'glacier' });
await wait(400);
if (!ui.screens.armory.el.querySelector('.chip.sel[data-id="glacier"]')) fails.push('armory did not open on the requested weapon');
ui.nav('title');
await wait(400);
if (!shown('title') || !ui.screens.title.el.querySelector('[data-act="play"]')) fails.push('title not shown');
if (!document.querySelector('.hud-ability-mount')) fails.push('no ability mount in the HUD');
if (!document.querySelector('.hud-ability-mount .ability-btn')) fails.push('no ability button mounted');
// compare modal opens and closes
ui.openModal('compare', { kind: 'weapon', a: 'glacier', b: 'spectra' });
await wait(300);
if (!shown('compare')) fails.push('compare modal not shown');
ui.closeModal('compare');
return { pass: fails.length === 0, fails };
