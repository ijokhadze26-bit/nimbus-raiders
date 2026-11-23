// Body of tests/u2/on8-card.js (390 x 844) and on8-card-small.js (360 x 640): the VS card of a friend room shows each
// player's league badge and trophies under the name (mine from my profile at 'versus:start', the rival's from its
// seat), inside the frame, the two cards apart. This page and a plain second player "Buddy" on an in-page hub.
import * as E from '/tests/u2/lib/on8kit.js';
import { player } from '/tests/u2/lib/on2kit.js';
import { boxes } from '/tests/u2/lib/on6kit.js';

export async function cardScenario(g) {
  const ui = g.ui;
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  const { frame } = E.framer(g);
  try {
    E.clearKeys();
    const hub = await E.makeHub();
    const P = await E.openOnline(g, hub, { fields: { tr: 350, pk: 350 } });
    const flow = P.flow;
    const buddy = await player(hub, 'buddy-2', 'Buddy Longnm');
    E.seed(hub, 'buddy-2', { tr: 1250, pk: 1250 });
    await buddy.session.refresh();
    await flow.createRoom();
    const roomB = await buddy.join(flow.room.code);
    await flow.ready(true); await roomB.ready(true);
    await E.until(() => !!flow.link && g.versus.live, 8000, 50);
    frame();
    const cards = [...document.querySelectorAll('.vs-card .vc-p')];
    info.cards = cards.map((c) => c.querySelector('.vc-head').textContent.replace(/\s+/g, ' ').trim());
    ok(cards.length === 2, 'two cards');
    const t = cards.map((c) => c.querySelector('.vc-tr'));
    ok(t[0] && t[0].textContent.trim() === '350' && t[0].querySelector('.lg-badge.lg-silver'), 'my trophies + SILVER badge: ' + info.cards[0]);
    ok(t[1] && t[1].textContent.trim() === '1250' && t[1].querySelector('.lg-badge.lg-diamond'), "the rival's trophies + DIAMOND badge: " + info.cards[1]);
    ok(t.every((n) => n && n.querySelector('.lg-badge').getAttribute('aria-label').endsWith('LEAGUE')), 'badges carry their league name');
    await E.wait(600); // (the cards have flown in)
    boxes(document, [cards[0], cards[1]], fails, 'VS card');
    for (const c of cards) {
      const n = c.querySelector('.vc-name'), tr = c.querySelector('.vc-tr'), you = c.querySelector('.vc-you');
      const rn = n.getBoundingClientRect(), rt = tr.getBoundingClientRect();
      ok(rt.top >= rn.bottom - 2, 'trophies sit under the name');
      if (you) { const ry = you.getBoundingClientRect(); ok(ry.left >= Math.max(rn.right, rt.right) - 1, 'the YOU chip overlaps the name / trophies'); }
    }
    await E.shot(g, 'card-friend');
    flow.leave('online');
    await E.until(() => P.view() === 'hub', 3000);
    await roomB.leave().catch(() => {});
    ui.nav('title');
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  E.clearKeys();
  return { pass: fails.length === 0, fails, info };
}
