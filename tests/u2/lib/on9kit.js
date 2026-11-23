// Helpers for tests/u2/on9-*.js (online stage 4, builder BOARDS: leaderboards, profile, share picture, emotes, hub).
// One page, the in-page hub with the REAL rules (on2kit), profiles and rk seeded with hub.admin (the owner's console:
// it skips the rules, which is the only way to seed trophies). Never the real service.
// Import with: const N = await import('/tests/u2/lib/on9kit.js');
import { makeHub, until, wait, layout } from '/tests/u2/lib/on2kit.js';
import { openHub, boxes, shot } from '/tests/u2/lib/on6kit.js';

export { makeHub, until, wait, layout, openHub, boxes, shot };

/** A whole profile the rules would accept (name + the ten numbers). */
export const prof = (n, o = {}) => ({ n, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0, ...o, pk: Math.max(o.pk || 0, o.tr || 0) });

/** This week's base (the rules' WK) for a time in ms. */
export const weekBase = (now) => { const x = now - 345600000; return (x - (x % 604800000)) / 6048; };

/** Seeds players: users/{uid} and rk/{uid} = tr. `list` = [{ uid, n, ...numbers }]. */
export function seed(hub, list) {
  const map = {};
  for (const p of list) {
    const { uid, ...rest } = p;
    map[`users/${uid}`] = prof(rest.n, rest);
    map[`rk/${uid}`] = Math.max(0, rest.tr || 0);
  }
  hub.admin.update(map);
}

/** My own profile numbers changed on the server (admin), then the flow re-reads it (as every visit does). */
export async function setMine(hub, flow, uid, fields) {
  const cur = hub.admin.get(`users/${uid}`) || prof(flow.name || 'Sky Rider');
  hub.admin.update({ [`users/${uid}`]: { ...cur, ...fields }, [`rk/${uid}`]: Math.max(0, (fields.tr ?? cur.tr) || 0) });
  await flow.connect();
  await wait(30);
}

/** The ONLINE page's views of stage 4. */
export function views(P) {
  return { boards: P.scr.views.boards, profile: P.scr.views.profile, hub: P.scr.views.hub };
}

/** Opens LEADERBOARDS from the hub (a real tap) and waits for the first tab to settle. */
export async function openBoards(P) {
  P.tap('[data-act="boards"]');
  await until(() => P.view() === 'boards');
  await settle(P);
}
export const settle = (P) => until(() => { const b = P.q('.bd'); return b && b.dataset.state && b.dataset.state !== 'loading'; }, 9000);

/** The rows a board shows: [{ rank, name, v, me }]. */
export function rowsOf(P) {
  return [...P.el.querySelectorAll('.bd-list .bd-row')].map((li) => ({
    rank: Number(li.querySelector('.bd-rk').textContent), name: li.querySelector('.bd-nm').firstChild.textContent.trim(),
    v: li.querySelector('.bd-v').textContent, me: li.classList.contains('me'), uid: li.dataset.uid,
  }));
}

/** A tab tap, then the load. */
export async function tab(P, id) {
  P.tap(`.bd-tab[data-tab="${id}"]`);
  await until(() => P.q('.bd') && P.q('.bd').dataset.tab === id);
  await settle(P);
  await wait(30);
}

/** Every visible piece of a view inside the frame horizontally (no sideways scroll). */
export function fitsWidth(root, sel, fails, what) {
  const app = document.getElementById('app').getBoundingClientRect();
  for (const n of root.querySelectorAll(sel)) {
    if (!n.getClientRects().length) continue;
    const r = n.getBoundingClientRect();
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5) { fails.push(`${what}: ${sel} sticks out sideways (${Math.round(r.left)}..${Math.round(r.right)})`); return; }
  }
}

/** Takes a screenshot with the page scrolled to `y` (the ONLINE page's body). */
export async function shotAt(P, name, y = 0) {
  const body = P.q('.on-body');
  if (body) body.scrollTop = y;
  await shot(name);
}
