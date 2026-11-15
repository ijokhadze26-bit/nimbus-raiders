// SPEC2 §9 ui-scroll (phone emulation, touch): the info bodies and chip rows scroll by touch. A page script cannot
// make a trusted touch gesture, so this checks every link of it: core/mobile.js lets a touchmove inside
// .info-scroll / .chip-row through (not cancelled) while it cancels one elsewhere; the containers really
// overflow with the right overflow + touch-action; and moving their scroll position changes scrollTop/Left.
const g = window.__game, ui = g.ui;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const touchmove = (el) => {
  const t = new Touch({ identifier: 1, target: el, clientX: 100, clientY: 300 });
  const e = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};
const out = {};
check(navigator.maxTouchPoints > 0, 'not a touch emulation');
for (const [name, opts] of [['armory', { from: 'title', weapon: 'glacier' }], ['heroes', { from: 'title', hero: 'bolt' }], ['loadout', { levelId: 5 }]]) {
  ui.nav(name, opts);
  await wait(500);
  const el = ui.screens[name].el, body = el.querySelector('.info-scroll'), row = el.querySelector('.chip-row');
  const cs = getComputedStyle(body);
  check(cs.overflowY === 'auto' && cs.touchAction.includes('pan-y'), `${name}: body overflow ${cs.overflowY} / touch-action ${cs.touchAction}`);
  check(getComputedStyle(row).touchAction.includes('pan-x'), `${name}: chip row touch-action`);
  const inner = body.querySelector('li, p, .chip, h4') || body;
  check(touchmove(inner) === false, `${name}: touchmove inside .info-scroll was cancelled`);
  check(touchmove(row.querySelector('.chip')) === false, `${name}: touchmove inside .chip-row was cancelled`);
  check(touchmove(el.querySelector('.plaque')) === true, `${name}: touchmove on the plaque not cancelled (page would rubber-band)`);
  if (name !== 'loadout') {
    check(body.scrollHeight > body.clientHeight + 40, `${name}: body does not overflow (${body.scrollHeight} / ${body.clientHeight})`);
    const y0 = body.scrollTop;
    body.scrollBy(0, 200);
    await wait(50);
    check(body.scrollTop > y0, `${name}: scrollTop did not change`);
    out[name] = [y0, body.scrollTop];
  }
  check(row.scrollWidth > row.clientWidth, `${name}: chip row does not overflow`);
  const x0 = row.scrollLeft;
  row.scrollLeft = x0 > 0 ? 0 : x0 + 60;
  check(row.scrollLeft !== x0, `${name}: chip row scrollLeft did not change`);
}
// compare body scrolls too
ui.nav('armory', { from: 'title' }); await wait(400);
ui.screens.armory.onAct('compare'); await wait(500);
const cb = ui.screens.compare.el.querySelector('.info-scroll');
check(touchmove(cb.querySelector('li') || cb) === false, 'compare: touchmove cancelled');
cb.scrollBy(0, 150); await wait(50);
check(cb.scrollTop > 0, 'compare body did not scroll');
ui.closeModal('compare');
ui.nav('title');
return { pass: fails.length === 0, fails, out };
