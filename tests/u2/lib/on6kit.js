// Helpers for tests/u2/on6-*.js (online stage 3, QUICK MATCH): this page's ONLINE page on a local hub with the real
// rules (tests/u2/lib/on2kit.js), other searchers made of a bare transport + session + quick.js (what the flow does
// for them: READY once paired, a match.js link at the room's start), and small checks.
// Import with: const Q = await import('/tests/u2/lib/on6kit.js');
import { createQuick } from '/src/online/quick.js';
import { createMatch } from '/src/online/match.js';
import { player, page, until, wait } from '/tests/u2/lib/on2kit.js';

/** Opens ONLINE in this page as `pid` with the name `name` and waits for the hub. -> on2kit page() */
export async function openHub(g, hub, pid = 'me-1', name = 'Sky Rider') {
  try { localStorage.removeItem('nimbusRaiders.online.pending'); localStorage.removeItem('nimbusRaiders.online.bot'); } catch { /* blocked */ }
  g.ui.nav('title');
  const opened = await g.ui.openOnline({ hub, pid });
  if (!opened.ok) throw new Error('ONLINE did not open: ' + JSON.stringify(opened));
  const P = page(g);
  if (!P.flow.name) await P.flow.setName(name);
  await until(() => P.view() === 'hub');
  await wait(800); // (the page's pop-in animation is over: sizes are final)
  return P;
}

/** Another player searching like the flow does: READY once paired, a link at the start. */
export async function searcher(hub, uid, name) {
  const p = await player(hub, uid, name);
  const picks = { he: 'cinder', we: 'emberstorm', hs: 'classic', ws: 'factory' };
  const s = { ...p, room: null, link: null, bot: null };
  s.q = createQuick({ transport: p.tp, profile: p.session.profile, picks, cfg: p.session.cfg });
  s.q.on('paired', (room) => {
    s.room = room;
    room.on('start', () => { if (!s.link) s.link = createMatch({ transport: p.tp, room, cfg: p.session.cfg }); });
    setTimeout(() => room.ready(true), 300);
  });
  s.q.on('bot', (b) => { s.bot = b.why; });
  s.tap = () => s.q.start();
  s.stop = async () => { if (s.link) s.link.leave(); await s.q.cancel(); if (s.room) await s.room.leave(); };
  return s;
}

/** Everything of the queue a page left behind: its ticket, rooms it hosts or sits in. */
export function leftovers(hub, uid) {
  const rooms = Object.entries(hub.admin.get('rooms') || {}).filter(([, r]) => r && (r.h === uid || Object.values(r.sl || {}).includes(uid)) && r.st === 'lobby');
  const seats = Object.entries(hub.admin.get('rooms') || {}).filter(([, r]) => r && Object.values(r.sl || {}).includes(uid));
  return { ticket: hub.admin.get(`queue/${uid}`), rooms: rooms.map(([c]) => c), seats: seats.map(([c]) => c) };
}

/** A box sits inside the game frame and does not overlap the others (rects of visible elements). */
export function boxes(root, sels, fails, what) {
  const app = document.getElementById('app').getBoundingClientRect();
  const rs = [];
  for (const sel of sels) {
    const n = typeof sel === 'string' ? root.querySelector(sel) : sel;
    if (!n || !n.getClientRects().length) { fails.push(`${what}: ${sel} is missing`); continue; }
    const r = n.getBoundingClientRect();
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5 || r.top < app.top - 0.5) fails.push(`${what}: ${sel} sticks out (${Math.round(r.left)},${Math.round(r.top)} .. ${Math.round(r.right)},${Math.round(r.bottom)})`);
    for (const o of rs) if (r.left < o.r.right - 1 && r.right > o.r.left + 1 && r.top < o.r.bottom - 1 && r.bottom > o.r.top + 1) fails.push(`${what}: ${sel} overlaps ${o.sel}`);
    rs.push({ sel, r });
  }
}

/** A screenshot when the screenshot harness runs this file (window.__shot); nothing in the plain u2 run. */
export async function shot(name) {
  if (typeof window.__shot === 'function') { await wait(350); await window.__shot(`${name}-${innerWidth}x${innerHeight}`); }
}

/** Nothing on the page may say what kind of rival this is. */
export const saysKind = () => /\b(BOT|COMPUTER|HUMAN|PLAYER FOUND)\b/i.test(document.body.innerText);

export { until, wait };
