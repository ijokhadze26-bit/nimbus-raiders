// The on9-hub scenario (tests/u2/on9-hub.js at 390x844, on9-hub-small.js at 360x640): the hub of stage 4. My league
// badge and trophies in the name row with PROFILE next to CHANGE, a purple LEADERBOARDS button between the QUICK MATCH
// card and PLAY A FRIEND; QUICK MATCH is still the only gold button; the stage 1-3 selectors are all there; nothing
// overlaps or sticks out and the whole hub can be scrolled to; no board is read on the hub alone; the name screen
// says the name is public. LEADERBOARDS / PROFILE open their views and BACK comes home.
import * as N from '/tests/u2/lib/on9kit.js';

export async function hubScenario(g) {
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  try {
    const hub = await N.makeHub();
    const P = await N.openHub(g, hub, 'me-1', 'Sky Rider');
    const flow = P.flow, V = N.views(P);
    const reads0 = V.boards.boards.stats.reads;
    // ---------- the pieces ----------
    for (const sel of ['.on-quickcard', '.on-quick[data-act="quick"]', '.on-create[data-act="create"]', '.on-code', '[data-act="join"]', '.on-me', '.on-me-n', '[data-act="rename"]', '.on-how'])
      ok(!!P.q(sel), 'a stage 1-3 piece is missing: ' + sel);
    const gold = [...P.el.querySelectorAll('.on-hub .btn-gold')];
    ok(gold.length === 1 && gold[0] === P.q('.on-quick'), `gold buttons on the hub: ${gold.length}`);
    const boards = P.q('[data-act="boards"]'), prof = P.q('[data-act="profile"]');
    ok(boards && boards.classList.contains('btn-purple') && /LEADERBOARDS/.test(boards.textContent), 'no purple LEADERBOARDS button');
    const kids = [...P.q('.on-hub').children];
    const iq = kids.indexOf(P.q('.on-quickcard')), ib = kids.indexOf(boards), ifr = kids.indexOf(P.q('.on-create').closest('.on-card'));
    ok(iq >= 0 && ib === iq + 1 && ifr === ib + 1, `LEADERBOARDS is not between QUICK MATCH and PLAY A FRIEND (${iq}, ${ib}, ${ifr})`);
    ok(prof && prof.closest('.on-me') && prof.classList.contains('btn-purple'), 'no PROFILE in the name row');
    ok(P.text('.on-me-n') === 'Sky Rider' && /0 TROPHIES/.test(P.text('.on-me-tr')) && P.q('.on-me-bg').children.length === 1, 'name row: ' + P.text('.on-me'));
    // ---------- layout ----------
    N.boxes(P.el, ['.topbar [data-act="back"]', '.on-quick', '[data-act="boards"]', '.on-create', '.on-me-bg', '.on-me-t', '[data-act="profile"]', '[data-act="rename"]'], fails, 'hub');
    N.layout(P.q('.on-hub'), ['.on-quickcard', '.on-boards', '.on-hub > .on-card:nth-of-type(2)', '.on-me', '.on-how'], fails, 'hub order');
    const body = P.q('.on-body');
    ok(body.scrollWidth <= body.clientWidth + 1, 'the hub scrolls sideways');
    const nameR = P.q('.on-me-n').getBoundingClientRect(), btns = P.q('.on-me-btns').getBoundingClientRect();
    ok(nameR.right <= btns.left + 1, 'the name runs under PROFILE / CHANGE');
    await N.shotAt(P, 'hub', 0);
    body.scrollTop = body.scrollHeight;
    ok(P.q('.on-me').getBoundingClientRect().bottom <= innerHeight + 0.5, 'the name row cannot be reached');
    await N.shotAt(P, 'hub-bottom', body.scrollHeight);
    body.scrollTop = 0;
    ok(V.boards.boards.stats.reads === reads0 && reads0 === 0, `the hub alone read a board (${V.boards.boards.stats.reads})`);
    // ---------- my trophies change: the badge and the number follow ----------
    const badge0 = P.q('.on-me-bg').innerHTML;
    await N.setMine(hub, flow, 'me-1', { tr: 734, pk: 800 });
    await N.until(() => /734/.test(P.text('.on-me-tr')));
    ok(/734 TROPHIES/.test(P.text('.on-me-tr')) && P.q('.on-me-bg').innerHTML !== badge0 && /GOLD/.test(P.q('.on-me-bg').innerHTML), 'after a trophy change: ' + P.text('.on-me-tr') + ' ' + P.q('.on-me-bg').innerHTML.slice(0, 120));
    await N.shotAt(P, 'hub-gold', 0);
    // ---------- the two new views and BACK ----------
    P.tap('[data-act="boards"]');
    await N.until(() => P.view() === 'boards');
    await N.settle(P);
    ok(P.view() === 'boards' && P.text('.on-title') === 'LEADERBOARDS' && V.boards.boards.stats.reads >= 1, 'LEADERBOARDS did not open: ' + P.view());
    N.boxes(P.el, ['.topbar [data-act="back"]', '.topbar .plaque'], fails, 'boards title');
    P.tap('.topbar [data-act="back"]');
    await N.until(() => P.view() === 'hub');
    ok(P.view() === 'hub' && g.ui.current === 'online', 'BACK from LEADERBOARDS: ' + P.view());
    P.tap('[data-act="profile"]');
    await N.until(() => P.view() === 'profile');
    ok(P.view() === 'profile' && P.text('.on-title') === 'MY PROFILE', 'PROFILE did not open: ' + P.view());
    N.boxes(P.el, ['.topbar [data-act="back"]', '.topbar .plaque'], fails, 'profile title');
    P.tap('.topbar [data-act="back"]');
    await N.until(() => P.view() === 'hub');
    ok(P.view() === 'hub', 'BACK from MY PROFILE: ' + P.view());
    // QUICK MATCH from the hub still searches (and CANCEL brings the hub back)
    P.q('.on-quick').click();
    await N.until(() => P.view() === 'quick');
    ok(P.view() === 'quick', 'QUICK MATCH: ' + P.view());
    P.scr.onBack();
    await N.until(() => P.view() === 'hub');
    // ---------- the name screen says the name is public ----------
    P.tap('[data-act="rename"]');
    await N.until(() => P.view() === 'name');
    await N.wait(400);
    ok(P.text('.on-public') === 'Everyone can see this name on the leaderboards. Do not use your real name!', 'name screen line: ' + P.text('.on-public'));
    N.layout(P.q('.on-name'), ['.on-h', '.on-p', '.on-nameinput', '.on-rules', '.on-public', '.btn-row', '.on-fine:not(.on-public)'], fails, 'name');
    const card = P.q('.on-name').getBoundingClientRect();
    ok(card.bottom <= innerHeight + 0.5 || body.scrollHeight > body.clientHeight, 'the name card is cut off');
    await N.shotAt(P, 'name', 0);
    P.scr.onBack();
    await N.until(() => P.view() === 'hub');
    ok(V.boards.boards.stats.reads === 2, 'reads after one LEADERBOARDS open (the board and my rank): ' + V.boards.boards.stats.reads);
    g.ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  return { pass: fails.length === 0, fails, info };
}
