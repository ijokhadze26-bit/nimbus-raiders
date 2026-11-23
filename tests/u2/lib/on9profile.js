// The on9-profile scenario (tests/u2/on9-profile.js at 390x844, on9-profile-small.js at 360x640): MY PROFILE from the
// hub's PROFILE button. 0 and 20 history rows, the streaks (an open stake shows its streak), the league bar and the
// words to the next league, the top league, the four online skin tiles locked (with how to earn them) and owned.
import * as N from '/tests/u2/lib/on9kit.js';

export async function profileScenario(g) {
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  const save = g.save, keepOwned = [...save.data.skins.owned], keepHist = save.data.online.hist;
  try {
    const hub = await N.makeHub();
    const P = await N.openHub(g, hub, 'me-1', 'Sky Rider');
    const flow = P.flow;
    const stat = (k) => { const s = [...P.el.querySelectorAll('.pf-stat')].find((n) => n.querySelector('span').textContent === k); return s ? s.querySelector('b').textContent : null; };
    const fits = (what) => { N.fitsWidth(P.el, '.pf-head, .pf-stat, .pf-skin, .pf-m', fails, what); const b = P.q('.on-body'); ok(b.scrollWidth <= b.clientWidth + 1, `${what}: the page scrolls sideways`); };
    save.update((d) => { d.online.hist = []; });

    // ---------- a new player: nothing yet ----------
    P.tap('[data-act="profile"]');
    await N.until(() => P.view() === 'profile');
    await N.wait(400);
    ok(P.text('.on-title') === 'MY PROFILE', 'title: ' + P.text('.on-title'));
    ok(P.text('.pf-name') === 'SKY RIDER' && /BRONZE LEAGUE/.test(P.text('.pf-league')), 'head: ' + P.text('.pf-head'));
    ok(P.text('.pf-next') === '300 MORE TO SILVER', 'next league: ' + P.text('.pf-next'));
    ok(stat('WINS') === '0' && stat('LOSSES') === '0' && stat('WIN STREAK') === '0' && stat('BEST SURVIVAL') === '-' && stat('THIS WEEK') === '0', 'new stats: ' + P.text('.pf-stats'));
    ok(P.text('.pf-none') === 'NO MATCHES YET - PLAY ONE!' && !P.q('.pf-m'), 'no history: ' + P.text('.pf-hist'));
    const tiles = [...P.el.querySelectorAll('.pf-skin')];
    ok(tiles.length === 4 && tiles.every((t) => !t.classList.contains('owned') && t.querySelector('.pf-lock')), 'skin tiles: ' + tiles.length);
    ok(['on-silver', 'on-wins10', 'on-streak5', 'on-champion'].every((id) => P.q(`.pf-skin[data-id="${id}"]`)), 'skin ids: ' + tiles.map((t) => t.dataset.id));
    ok(/Reach SILVER league online/.test(P.text('.pf-skin[data-id="on-silver"]')) && /0 \/ 10/.test(P.text('.pf-skin[data-id="on-wins10"]')), 'hints: ' + P.text('.pf-skins'));
    fits('new');
    await N.shotAt(P, 'profile-new', 0);
    await N.shotAt(P, 'profile-new-end', 1e5);

    // ---------- a seasoned player: numbers, 20 matches, an open stake (fresh: settle() closes one over 360 s old),
    // three skins earned (pk 512, w 31, bs 7: rewards.js grants them from the profile) ----------
    const WK = N.weekBase(flow.transport.now()), now = Math.floor(Date.now() / 1000);
    const rows = [];
    for (let i = 0; i < 20; i++) {
      rows.push({ a: now - 300 - i * 4000, r: i % 4 === 3 ? 'l' : i % 7 === 6 ? 'd' : 'w', t: 60 + i * 7.3, d: 200 + i * 31, n: i === 2 ? 'b1tch face' : `Rival ${i}`, k: i % 3 ? 'q' : 'f', ...(i % 3 ? { g: i % 4 === 3 ? -10 : 28, c: 90 } : { c: 20 }) });
    }
    await N.setMine(hub, flow, 'me-1', N.prof('Sky Rider', { tr: 420, pk: 512, w: 31, l: 9, st: 0, bs: 7, bt: 2075, ws: WK + 56, sk: { a: flow.transport.now() - 5000, s: 10, st: 4, b: true } }));
    save.update((d) => { d.online.hist = rows; });
    N.views(P).profile.sync();
    await N.until(() => P.text('.pf-next') === '280 MORE TO GOLD', 3000);
    ok(/SILVER LEAGUE/.test(P.text('.pf-league')) && P.text('.pf-next') === '280 MORE TO GOLD', 'silver head: ' + P.text('.pf-head'));
    const bar = P.q('.pf-bar i');
    ok(bar && Math.abs(parseFloat(bar.style.width) - 30) < 0.2, 'league bar: ' + (bar && bar.style.width));
    ok(/420/.test(P.text('.pf-tr')) && /BEST 512/.test(P.text('.pf-tr')), 'trophies: ' + P.text('.pf-tr'));
    ok(stat('WINS') === '31' && stat('LOSSES') === '9' && stat('WIN STREAK') === '4' && stat('BEST STREAK') === '7' && stat('BEST SURVIVAL') === '3:27.5' && stat('THIS WEEK') === '+56', 'stats: ' + P.text('.pf-stats'));
    const ms = [...P.el.querySelectorAll('.pf-m')];
    ok(ms.length === 20, 'history rows: ' + ms.length);
    const first = ms[0] && ms[0].textContent.replace(/\s+/g, ' ');
    ok(ms[0] && ms[0].classList.contains('r-w') && /RIVAL 0/.test(first) && /1:00\.0/.test(first) && /200m/.test(first) && /FRIEND/.test(first) && /5 min ago/.test(first), 'first row: ' + first);
    const row1 = ms[1] && ms[1].textContent.replace(/\s+/g, ' ');
    ok(/\+28/.test(row1) && /QUICK/.test(row1) && /1 h ago/.test(row1), 'second row: ' + row1);
    ok(ms[7] && ms[7].querySelector('.pf-chip').textContent === 'L' && /-10/.test(ms[7].textContent) && ms[7].querySelector('.pf-g.down'), 'a loss row: ' + (ms[7] && ms[7].textContent));
    ok(ms[2] && /RAIDER-\d{4}/.test(ms[2].textContent) && !/b1tch/i.test(P.el.textContent), 'the rude rival name: ' + (ms[2] && ms[2].textContent));
    ok(ms.filter((m) => m.classList.contains('r-d')).length === 2, 'draw rows');
    const owned = [...P.el.querySelectorAll('.pf-skin.owned')].map((t) => t.dataset.id);
    ok(owned.join() === 'on-silver,on-wins10,on-streak5' && P.el.querySelectorAll('.pf-skin .pf-lock').length === 1, 'owned tiles: ' + owned);
    ok(/YOURS/.test(P.text('.pf-skin[data-id="on-silver"]')) && /YOURS/.test(P.text('.pf-skin[data-id="on-streak5"]')) && /512 \/ 1,800/.test(P.text('.pf-skin[data-id="on-champion"]')), 'tile words: ' + P.text('.pf-skins'));
    fits('seasoned');
    await N.shotAt(P, 'profile-full', 0);
    await N.shotAt(P, 'profile-skins', P.q('.pf-skins').offsetTop - 10);
    await N.shotAt(P, 'profile-hist', P.q('.pf-hist').offsetTop - 10);
    await N.shotAt(P, 'profile-end', 1e5);

    // ---------- the top league ----------
    await N.setMine(hub, flow, 'me-1', { tr: 1900, pk: 1950, sk: null });
    await N.until(() => /STORM CHAMPION/.test(P.text('.pf-league')), 3000);
    ok(/STORM CHAMPION LEAGUE/.test(P.text('.pf-league')) && P.text('.pf-next') === 'TOP LEAGUE - AMAZING!' && parseFloat(P.q('.pf-bar i').style.width) === 100, 'champion: ' + P.text('.pf-head'));
    ok(stat('WIN STREAK') === '0', 'the streak without a stake: ' + stat('WIN STREAK'));
    await N.shotAt(P, 'profile-champion', 0);
    P.scr.onBack();
    await N.until(() => P.view() === 'hub');
    ok(P.view() === 'hub', 'BACK from MY PROFILE: ' + P.view());
    g.ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  save.update((d) => { d.skins.owned = keepOwned; d.online.hist = keepHist; });
  return { pass: fails.length === 0, fails, info };
}
