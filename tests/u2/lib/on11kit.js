// Helpers for tests/u2/on11-*.js (online stage 5, builder WATCH): the watch cards on the fake link (on11link.js) in a
// stand-in page, and for the spectator scenarios this page's ONLINE page on the in-page hub with the REAL rules
// (on2kit / on6kit) plus plain players made of transport + session + room.js / match.js that run a scripted road.
// Never the real service. Import with: const W = await import('/tests/u2/lib/on11kit.js');
import { makeHub, player, page, until, wait, layout } from '/tests/u2/lib/on2kit.js';
import { openHub, boxes, shot as shot6 } from '/tests/u2/lib/on6kit.js';
import { createRoom, joinRoom } from '/src/online/room.js';
import { createMatch } from '/src/online/match.js';
import { defaultCurve } from '/src/online/game/testlink.js';
import { sabEncode } from '/src/online/game/sabdata.js';

export { makeHub, player, page, until, wait, layout, openHub, boxes };

/** A screenshot (only under the screenshot harness): a few real frames first, so pop-in animations have played. */
export async function shot(name) {
  if (typeof window.__shot !== 'function') return;
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
  await shot6(name);
}

/** A stand-in for where the cards live: the ONLINE page's body (spectator) or a result panel (fallen). */
export function fixture(mode = 'spectator') {
  const app = document.getElementById('app');
  const el = document.createElement('div');
  el.className = 'wv-fix';
  el.style.cssText = 'position:absolute;inset:0;z-index:50;overflow-y:auto;padding:84px 14px 18px;display:flex;flex-direction:column;align-items:center;'
    + 'background:linear-gradient(180deg,rgba(26,60,160,.95),rgba(14,22,84,.97));';
  const host = document.createElement('div');
  if (mode === 'fallen') {
    host.style.cssText = 'width:min(370px,100%);padding:12px 12px 16px;border-radius:24px;background:linear-gradient(180deg,#fff,#e2f1ff);border:4px solid #fff;box-shadow:0 0 0 3px #1b3a8a;';
    host.innerHTML = '<div style="font:400 22px/1.1 var(--font-display);color:#ff3b4e;text-align:center">YOU CAME 4TH</div><div style="font:800 13px/1.3 var(--font-body);color:#24468f;text-align:center;margin-bottom:8px">OF 4 · WATCHING THE OTHERS...</div>';
  } else host.style.cssText = 'width:min(400px,100%);';
  el.appendChild(host);
  app.appendChild(el);
  return { el, host, remove: () => el.remove() };
}

/** Steps a fake link and the model + view together (frames of 1/20 s). */
export function step(link, watch, view, to) {
  while (link.test.t < to - 1e-9) {
    link.test.to(Math.min(to, link.test.t + 0.1));
    for (let i = 0; i < 2; i++) { watch.update(0.05); view.update(0.05); }
  }
}
/** Runs only the model + view clocks (seconds). */
export function idle(watch, view, s) { for (let k = 0; k < Math.round(s * 20); k++) { watch.update(0.05); view.update(0.05); } }

/** Nothing in `root` may stick out of the game frame sideways, and a list of pieces must not overlap. */
export function fits(root, fails, what) {
  const app = document.getElementById('app').getBoundingClientRect();
  for (const n of root.querySelectorAll('.wv-card, .wv-feed li, .wv-rows li, .wv-top, .wv-leave, .wv-seats li')) {
    if (!n.getClientRects().length) continue;
    const r = n.getBoundingClientRect();
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5) { fails.push(`${what}: ${n.className || n.tagName} sticks out sideways (${Math.round(r.left)}..${Math.round(r.right)})`); return; }
  }
  const cards = [...root.querySelectorAll('.wv-card')].filter((c) => c.getClientRects().length).map((c) => c.getBoundingClientRect());
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) fails.push(`${what}: cards ${i} and ${j} overlap`);
  }
}

/** The lowest bottom of the visible pieces of `root` (to check a page does not need to scroll). */
export function bottom(root, sel = '*') {
  let b = 0;
  for (const n of root.querySelectorAll(sel)) { if (n.getClientRects().length) b = Math.max(b, n.getBoundingClientRect().bottom); }
  return b;
}

/**
 * A plain player that runs a scripted road once its room starts: samples every 100 ms on the match clock
 * (testlink's defaultCurve), its fall at `fallAt` s. -> { ...player, room, link, make4(), sit(code), ready(), sab, emote }
 */
export async function runner(hub, uid, name, { fallAt = Infinity } = {}) {
  const p = await player(hub, uid, name);
  const picks = { he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' };
  const r = { ...p, room: null, link: null, fallAt, links: 0, timer: null, curve: defaultCurve(fallAt, uid.length) };
  const begin = () => {
    if (r.link && r.link.mid === r.room.state.mid) return;
    if (r.link) r.link.leave();
    if (r.timer) clearInterval(r.timer);
    r.link = createMatch({ transport: p.tp, room: r.room, cfg: p.session.cfg });
    r.links++;
    const link = r.link;
    r.timer = setInterval(() => {
      if (link !== r.link) return;
      const t = link.clock();
      if (t < 0) return;
      if (t >= r.fallAt) { const T = r.fallAt; link.fall({ t: T, d: r.curve(T).dist }); clearInterval(r.timer); r.timer = null; return; }
      link.push({ t, charge: 0, ...r.curve(t) });
    }, 100);
  };
  const adopt = (room) => { r.room = room; room.on('start', begin); return room; };
  r.make4 = async () => adopt(await createRoom({ transport: p.tp, profile: p.session.profile, picks, max: 4 }));
  r.make2 = async () => adopt(await createRoom({ transport: p.tp, profile: p.session.profile, picks }));
  r.sit = async (code) => adopt(await joinRoom({ transport: p.tp, code, profile: p.session.profile, picks }));
  r.ready = () => r.room.ready(true);
  r.sab = (code, to) => r.link.sendEvent({ k: 's', a: sabEncode(code, Math.max(0, r.link.clock())), to });
  r.emote = (a) => r.link.sendEvent({ k: 'e', a, to: -1 });
  r.stop = async () => { if (r.timer) clearInterval(r.timer); if (r.link) r.link.leave(); if (r.room) await r.room.leave(); };
  return r;
}

/** Every write this page's own client sends to the hub, from now on: wraps hub.connect before the page connects. */
export function logWrites(hub) {
  const log = [];
  const connect = hub.connect.bind(hub);
  hub.connect = () => {
    const port = connect();
    let uid = null;
    const post = port.post.bind(port);
    port.post = (m) => {
      if (m && m.op === 'hello') uid = m.uid;
      if (m && ['write', 'tx', 'od'].includes(m.op)) log.push({ uid, op: m.op, paths: m.op === 'write' ? m.w.map((w) => w[0]) : [m.path] });
      post(m);
    };
    return port;
  };
  return log;
}
