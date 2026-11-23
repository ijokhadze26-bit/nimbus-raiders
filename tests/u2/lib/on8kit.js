// Helpers for tests/u2/on8-*.js (online stage 4, trophies / coins / online skins): this page's ONLINE page on an
// in-page hub with the REAL rules (never the real service) whose clock can jump forward, so the 20 s wait of a win
// claim passes in a moment; profiles seeded through hub.admin (the owner's console); quick bot matches on the
// simulated clock (on6-bot's way); plain second players (on2kit / on6kit).
// Import with: const E = await import('/tests/u2/lib/on8kit.js');
import { createHub } from '/src/online/localhub.js';
import { createRules } from '/src/online/rulescheck.js';
import { QUICK } from '/src/online/quick.js';
import { until, wait, page } from '/tests/u2/lib/on2kit.js';

export const KEYS = ['nimbusRaiders.online.pending', 'nimbusRaiders.online.stake', 'nimbusRaiders.online.coins', 'nimbusRaiders.online.bot', 'nimbusRaiders.online.mute', 'nimbusRaiders.online.skins.v5'];
export const clearKeys = () => { for (const k of KEYS) { try { localStorage.removeItem(k); } catch { /* blocked */ } } };

/** A hub with the published rules; hub.jump(ms) moves its clock (and every client's) forward. */
export async function makeHub() {
  const json = await (await fetch('/config/firebase/database.rules.json')).json();
  let skip = 0;
  const clock = {
    now: () => Date.now() + skip,
    after(ms, fn) { const h = setTimeout(fn, ms); return () => clearTimeout(h); },
    every(ms, fn) { const h = setInterval(fn, ms); return () => clearInterval(h); },
  };
  const hub = createHub({ clock, rules: createRules(json) });
  hub.denials = [];
  hub.onDeny = (d) => hub.denials.push(d);
  hub.jump = (ms) => { skip += ms; hub.syncTime(); };
  return hub;
}

/** Seeds users/{uid} fields (and rk) the way the owner's console would. */
export function seed(hub, uid, fields) {
  hub.admin.update(Object.fromEntries(Object.entries(fields).map(([k, v]) => [`users/${uid}/${k}`, v])));
  if ('tr' in fields) hub.admin.set(`rk/${uid}`, fields.tr);
}

/** Opens ONLINE as `pid` (a name on the first visit); `fields` are seeded and the page reconnects to read them. */
export async function openOnline(g, hub, { pid = 'me-1', name = 'Sky Rider', fields = null } = {}) {
  g.ui.nav('title');
  const opened = await g.ui.openOnline({ hub, pid });
  if (!opened.ok) throw new Error('ONLINE did not open: ' + JSON.stringify(opened));
  const P = page(g);
  if (!P.flow.name) await P.flow.setName(name);
  await until(() => P.view() === 'hub');
  if (fields) { seed(hub, pid, fields); await P.flow.connect(); }
  await wait(600);
  return P;
}

/** One frame without rendering (the match's pump, or a plain step) and the UI. */
export function framer(g) {
  const ui = g.ui;
  const frame = () => { const dt = 1 / 60, v = g.versus; if (v && v.live) v.pump(dt, dt); else if (g.state === 'playing' || g.state === 'result') g.step(dt); ui.update(dt); };
  const frames = async (seconds, stop) => { for (let i = 0; i < seconds * 60 && !(stop && stop()); i++) { frame(); if (i % 30 === 29) await wait(0); } };
  return { frame, frames };
}

/**
 * A quick match against the bot, fast: the search gives up after 1.2 s, the match runs on the simulated clock after
 * the real 4 s countdown. win: the bot falls at `botAt` s (I am kept alive); else I fall at `meAt` s.
 * -> { link, pick, result } on the result screen ('vsresult').
 */
export async function botMatch(g, P, { win = true, botAt = 14, meAt = 16, saveWait = true, hub = null } = {}) {
  const ui = g.ui, flow = P.flow, { frame, frames } = framer(g);
  const keep = QUICK.botAtMs;
  QUICK.botAtMs = 1200;
  flow.quick.test.clockFor = ({ t0, now }) => () => (g.versus.go ? g.versus.simT : (now() - t0) / 1000);
  try {
    P.q('.on-quick').click();
    await until(() => !!flow.link && g.versus.live, 15000, 50);
  } finally { QUICK.botAtMs = keep; }
  const link = flow.link;
  if (!link || !link.bot) throw new Error('no bot match');
  link.bot.test.fallAt(win ? botAt : 300);
  frame();
  await until(() => link.clock() >= 0, 7000, 50);
  frame();
  g.debug.setAutopilot('pro', 1);
  const tough = () => { g.heroes.guard = 99; if (g.run && g.run.active && g.squad.count < 60) g.squad.setCount(60, 'start'); };
  for (let i = 0; i < 400 && g.versus.live && g.state === 'playing'; i++) {
    if (win) tough();
    else if (g.versus.t >= meAt && g.run && g.run.active) g.squad.setCount(0, 'versus');
    else tough();
    g.versus.simulate(0.25);
    if (i % 8 === 7) await wait(0);
  }
  await frames(30, () => ui.current === 'vsresult');
  if (saveWait && hub && win) await claimNow(g, hub, flow);
  return { link, pick: link.bot.pick, result: g.versus.result };
}

/** A win claim waits 20 s after the stake: jump the hub's clock past it, then wait for SAVED (or a failure). */
export async function claimNow(g, hub, flow) {
  await until(() => ['saving', 'saved', 'failed', 'none'].includes(flow.session.ranked.state), 6000);
  if (flow.session.ranked.state === 'saving') hub.jump(21000);
  await until(() => flow.session.ranked.state !== 'saving', 12000);
  await wait(300);
  for (let i = 0; i < 3; i++) g.ui.update(1 / 60);
}

/** A screenshot when the screenshot harness runs this file (window.__shot); nothing in the plain u2 run. */
export async function shot(g, name) {
  if (typeof window.__shot !== 'function') return;
  try { g.snapCamera(); g.sync(1 / 60); g.engine.render(); } catch { /* menus only */ }
  await wait(450);
  await window.__shot(`${name}-${innerWidth}x${innerHeight}`);
}

/** Nothing of these selectors may stick out of the game frame sideways (and each must exist). */
export function inFrame(sels, fails, what) {
  const app = document.getElementById('app').getBoundingClientRect();
  for (const sel of sels) {
    const n = document.querySelector(sel);
    if (!n || !n.getClientRects().length) { fails.push(`${what}: ${sel} is missing`); continue; }
    const r = n.getBoundingClientRect();
    if (r.left < app.left - 0.5 || r.right > app.right + 0.5) fails.push(`${what}: ${sel} sticks out sideways (${Math.round(r.left)}..${Math.round(r.right)})`);
  }
}

/** The result screen's trophies / coins block as text. */
export const rankText = () => { const n = document.querySelector('.screen-vsresult .vsr-rank'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
export const saysKind = () => /\b(BOT|COMPUTER|HUMAN|PLAYER FOUND)\b/i.test(document.body.innerText);
export { until, wait };
