// Helpers for tests/u2/on2-*.js (online stage 1, the screens): a local hub with the REAL rules living in the page
// (no network, no account), plain second / third players made of bare transport + session + room.js calls, and small
// waiting helpers. Import with: const K = await import('/tests/u2/lib/on2kit.js');
import { createHub } from '/src/online/localhub.js';
import { createRules } from '/src/online/rulescheck.js';
import { createLocalTransport } from '/src/online/transport-local.js';
import { createSession } from '/src/online/session.js';
import { createRoom, joinRoom } from '/src/online/room.js';
import { createMatch } from '/src/online/match.js';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until fn() is truthy (returns it) or `ms` passed (returns the last value, falsy). */
export async function until(fn, ms = 4000, step = 25) {
  const end = performance.now() + ms;
  for (;;) {
    const v = fn();
    if (v || performance.now() > end) return v;
    await wait(step);
  }
}

/** A hub with the rules the owner will paste (config/firebase/database.rules.json), on the real clock.
 *  dropMs: how long a dead connection goes unnoticed (5 s like the real thing unless a test wants it shorter). */
export async function makeHub({ dropMs = 5000 } = {}) {
  const json = await (await fetch('/config/firebase/database.rules.json')).json();
  const hub = createHub({ rules: createRules(json), dropMs });
  hub.denials = [];
  hub.onDeny = (d) => hub.denials.push(d);
  return hub;
}

/** A signed-in player that is not this page's UI: { tp, session, uid, create(picks), join(code, picks), match(room) }. */
export async function player(hub, uid, name) {
  const tp = createLocalTransport({ hub, uid });
  const session = createSession({ transport: tp });
  await session.connect();
  const made = await session.ensureProfile(name);
  if (!made.ok) throw new Error(`profile for ${uid}: ${made.reason}`);
  const picks = { he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' };
  return {
    tp, session, uid,
    create: (p) => createRoom({ transport: tp, profile: session.profile, picks: { ...picks, ...p } }),
    join: (code, p) => joinRoom({ transport: tp, code, profile: session.profile, picks: { ...picks, ...p } }),
    /** The link of the room's live match (call it once the room state has `mid`). */
    match: (room) => createMatch({ transport: tp, room, cfg: session.cfg }),
  };
}

/** The ONLINE page's pieces, once it is open. */
export function page(g) {
  const ui = g.ui, scr = ui.screens.online;
  return {
    scr,
    flow: g.online && g.online.flow,
    view: () => (scr ? scr.view() : null),
    el: scr ? scr.el : null,
    q: (sel) => (scr ? scr.el.querySelector(sel) : null),
    text: (sel) => { const n = scr && scr.el.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; },
    /** A real click through the UI's own delegated handler. */
    tap(sel) { const b = scr.el.querySelector(sel); if (!b) throw new Error('no button ' + sel); b.click(); return b; },
    /** Type into a text box the way a keyboard does (value + input event). */
    type(sel, text) { const i = scr.el.querySelector(sel); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); return i; },
  };
}

/** Nothing on the page may stick out of the game frame or sit on top of another piece (`sels` in reading order). */
export function layout(root, sels, fails, what) {
  const app = document.getElementById('app').getBoundingClientRect();
  let prev = null;
  for (const sel of sels) {
    const n = root.querySelector(sel);
    if (!n || n.hidden || !n.getClientRects().length) continue;
    const r = n.getBoundingClientRect();
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5) fails.push(`${what}: ${sel} sticks out sideways (${Math.round(r.left)}..${Math.round(r.right)})`);
    if (prev && r.top < prev.r.bottom - 1) fails.push(`${what}: ${sel} overlaps ${prev.sel} (${Math.round(r.top)} < ${Math.round(prev.r.bottom)})`);
    prev = { sel, r };
  }
}
