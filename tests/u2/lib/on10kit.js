// Helpers for tests/u2/on10-*.js (online stage 5, friend rooms and matches of 3-4 players): this page's ONLINE page
// on an in-page hub with the REAL rules (never the real service), plain extra players made of transport + session +
// room.js / match.js calls (on2kit's player), a pusher that plays their side of a match on the real clock, and
// layout checks. Import with: const F = await import('/tests/u2/lib/on10kit.js');
import { player, until, wait } from '/tests/u2/lib/on2kit.js';
import { makeHub, openOnline, framer, shot, clearKeys } from '/tests/u2/lib/on8kit.js';

export const NAMES = ['Ben', 'Cyd', 'Dan'];

/** Extra players who sit in my room: [{ ...on2kit player, room, link, play, fall(), stop() }] (seats 1..n in order). */
export async function friends(hub, code, n = 3, names = NAMES) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = await player(hub, `fr-${i + 1}`, names[i]);
    const f = { ...p, name: names[i], room: null, link: null, timer: 0, fallen: false };
    f.room = await p.join(code, { he: ['cinder', 'rime', 'vex'][i] || 'pip', we: ['emberstorm', 'blaster', 'thunderclap'][i] || 'blaster' });
    f.room.on('start', () => { f.stopPlay(); f.link = p.match(f.room); f.fallen = false; f.play(); });
    /** Push a plausible state 10 times a second on the match clock (real time), until they fall or stop. */
    f.play = () => {
      f.stopPlay();
      f.timer = setInterval(() => {
        const l = f.link, t = l ? l.clock() : -1;
        if (!l || t < 0 || f.fallen) return;
        const tt = Math.floor(t * 10) / 10;
        l.push({ t: tt, dist: 9 * tt, n: 30 + i * 7, form: 0, flags: 0, boss: 0, zone: 1, charge: 0, danger: 1, x: Math.sin(tt) * 2 });
        l.tick();
      }, 100);
    };
    f.stopPlay = () => { clearInterval(f.timer); f.timer = 0; };
    f.fall = () => { const l = f.link; if (!l || f.fallen) return; f.fallen = true; const t = Math.max(0, Math.floor(l.clock() * 10) / 10); l.fall({ t, d: Math.round(9 * t), by: 'dead' }); };
    f.stop = async () => { f.stopPlay(); if (f.link) f.link.leave(); f.link = null; await f.room.leave().catch(() => {}); };
    out.push(f);
  }
  return out;
}

/** Elements (selectors or nodes) inside the game frame and not on top of each other. */
export function inside(sels, fails, what, root = document) {
  const app = document.getElementById('app').getBoundingClientRect();
  const rs = [];
  for (const sel of sels) {
    const n = typeof sel === 'string' ? root.querySelector(sel) : sel;
    if (!n || !n.getClientRects().length) { fails.push(`${what}: ${typeof sel === 'string' ? sel : n && n.className} is missing`); continue; }
    const r = n.getBoundingClientRect(), name = typeof sel === 'string' ? sel : `${n.className}[${n.dataset.slot ?? ''}]`;
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5 || r.top < app.top - 0.5 || r.bottom > app.bottom + 0.5) fails.push(`${what}: ${name} sticks out (${Math.round(r.left)},${Math.round(r.top)} .. ${Math.round(r.right)},${Math.round(r.bottom)} in ${Math.round(app.width)}x${Math.round(app.height)})`);
    for (const o of rs) if (r.left < o.r.right - 1 && r.right > o.r.left + 1 && r.top < o.r.bottom - 1 && r.bottom > o.r.top + 1) fails.push(`${what}: ${name} overlaps ${o.name}`);
    rs.push({ name, r });
  }
}

/** Text without extra spaces. */
export const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : null);

export { player, until, wait, makeHub, openOnline, framer, shot, clearKeys };
