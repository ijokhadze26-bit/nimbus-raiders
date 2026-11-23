// The on6-hub scenario (run by tests/u2/on6-hub.js at 390x844 and on6-hub-small.js at 360x640): the QUICK MATCH card
// and button on the hub, a tap -> the finding view with its counter and rotating line, CANCEL -> the hub, no ticket.
import { makeHub, until, wait } from '/tests/u2/lib/on2kit.js';
import { openHub, boxes, leftovers, shot, saysKind } from '/tests/u2/lib/on6kit.js';

export async function hubScenario(g) {
  const ui = g.ui;
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  try {
    const hub = await makeHub();
    const P = await openHub(g, hub, 'me-1');
    const flow = P.flow;
    // ---- the card ----
    const card = P.q('.on-quickcard'), btn = P.q('.on-quick');
    ok(card && btn && btn.dataset.act === 'quick', 'no QUICK MATCH card / button');
    ok(card && /QUICK MATCH/.test(card.querySelector('.on-h').textContent) && /Play a rival from anywhere\. Last squad standing wins!/.test(card.textContent), 'card words: ' + (card && card.textContent.replace(/\s+/g, ' ')));
    ok(P.el.querySelector('.on-hub .on-card') === card, 'QUICK MATCH is not the first card');
    const gold = [...P.el.querySelectorAll('.on-hub .btn-gold')];
    ok(gold.length === 1 && gold[0] === btn, `gold buttons on the hub: ${gold.length}`);
    ok(P.q('.on-create').classList.contains('btn-green') && P.q('[data-act="join"]') && P.q('.on-code'), 'CREATE ROOM is not green / JOIN missing');
    ok(P.text('.on-how li') === 'QUICK MATCH finds you a rival in seconds.', 'how-it-works line 1: ' + P.text('.on-how li'));
    // inside the screen, clear of BACK and the name row; the whole hub can be scrolled to (nothing clipped)
    boxes(P.el, ['.topbar [data-act="back"]', '.on-quick', '.on-me'], fails, 'hub');
    const body = P.q('.on-body'), last = P.q('.on-me');
    body.scrollTop = body.scrollHeight;
    const lr = last.getBoundingClientRect();
    ok(lr.bottom <= innerHeight + 0.5, `the name row cannot be reached (bottom ${Math.round(lr.bottom)} > ${innerHeight})`);
    body.scrollTop = 0;
    const br = btn.getBoundingClientRect();
    ok(br.top >= 60 && br.bottom <= innerHeight * 0.6 && br.width >= 200 && br.height >= 50, `QUICK MATCH button at ${Math.round(br.top)}..${Math.round(br.bottom)}, ${Math.round(br.width)} wide`);
    info.button = [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)];
    await shot('hub');
    // the code box, focused, comes up clear of a phone keyboard (QUICK MATCH sits above it)
    const codeBox = P.q('.on-code');
    codeBox.focus();
    await wait(50);
    info.codeBottom = Math.round(codeBox.getBoundingClientRect().bottom);
    ok(info.codeBottom < innerHeight * 0.5, `the focused code box ends at ${info.codeBottom} (lower half: the keyboard covers it)`);
    await shot('typing');
    codeBox.blur();
    body.scrollTop = 0;
    // ---- tap: the finding view ----
    btn.click();
    await until(() => P.view() === 'quick');
    await wait(600);
    ok(P.view() === 'quick' && flow.mode === 'quick' && P.text('.on-title') === 'QUICK MATCH', `after the tap: view ${P.view()}, mode ${flow.mode}, title ${P.text('.on-title')}`);
    ok(P.text('.on-find-h') === 'FINDING A RIVAL...', 'head: ' + P.text('.on-find-h'));
    ok(P.text('.on-find-secs') === '0:00', 'counter at the start: ' + P.text('.on-find-secs'));
    const line0 = P.text('.on-find-line');
    ok(line0 === 'Looking for a rival...', 'first line: ' + line0);
    const cancel = P.q('[data-act="cancel"]');
    ok(cancel && !cancel.hidden && cancel.classList.contains('btn-blue') && cancel.getClientRects().length, 'no blue CANCEL');
    const globe = P.q('.on-globe-in');
    ok(globe && getComputedStyle(globe).animationName === 'on-turn', 'the globe does not turn');
    await until(() => !!hub.admin.get('queue/me-1'), 3000);
    ok(!!hub.admin.get('queue/me-1'), 'no ticket in the queue while searching');
    boxes(P.el, ['.topbar [data-act="back"]', '.on-globe', '.on-find-h', '.on-find-secs', '.on-find-line', '.on-find-cancel'], fails, 'finding');
    // the counter, written only when it changes
    let writes = 0;
    const mo = new MutationObserver((m) => { writes += m.length; });
    mo.observe(P.q('.on-find-secs'), { childList: true, characterData: true, subtree: true });
    await wait(2550);
    mo.disconnect();
    info.secs = P.text('.on-find-secs');
    ok(info.secs === '0:03', 'counter after 3.15 s: ' + info.secs);
    ok(writes >= 3 && writes <= 6, `the counter was written ${writes} times in 3 s`);
    ok(P.text('.on-find-line') !== line0, 'the line did not change after 3 s');
    ok(!saysKind(), 'a word on the page says what kind of rival this is');
    await shot('searching');
    // ---- CANCEL ----
    cancel.click();
    await until(() => P.view() === 'hub');
    await until(() => !hub.admin.get('queue/me-1'), 3000);
    const left = leftovers(hub, 'me-1');
    ok(P.view() === 'hub' && flow.mode === null && !left.ticket && !left.rooms.length, `after CANCEL: view ${P.view()}, mode ${flow.mode}, left ${JSON.stringify(left)}`);
    ok(!flow.quick.q, 'the queue is still there after CANCEL');
    // BACK while searching = CANCEL (back on the hub, not the title)
    P.q('.on-quick').click();
    await until(() => P.view() === 'quick');
    P.scr.onBack();
    await until(() => P.view() === 'hub');
    await until(() => !hub.admin.get('queue/me-1'), 3000);
    ok(P.view() === 'hub' && ui.current === 'online' && !hub.admin.get('queue/me-1'), `BACK while searching: view ${P.view()} screen ${ui.current}`);
    ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  return { pass: fails.length === 0, fails, info };
}
