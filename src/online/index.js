// Online mode entry (SPEC4 §3.1): the ONLY door into src/online/**. Nothing in the main bundle imports this file
// statically; the UI reaches it through one dynamic import('../online/index.js') (src/ui/onlinegate.js), so
// single-player never loads it.
//
//   installOnline(game[, ui])                         the game side only: game.versus + a warm ghost shader
//                                                     (tests and calibration: they never touch a network)
//   installOnline(game, ui, { full: true, ...opts })  everything (what the ONLINE button does): picks the network,
//                                                     signs in, builds the FLOW (src/online/flow.js), registers the
//                                                     ONLINE page and the match screens, then connects.
//                                                     -> { versus, flow, ok, reason, gate }
//     ok false + reason 'unconfigured'  the game has no online service yet            (button: COMING SOON)
//     ok false + anything else          the service did not answer / could not load   (button: UNAVAILABLE)
//   Calling it again (every tap on ONLINE) only reconnects and re-reads the profile.
//
// Which network (opts come from the page address through main.js, or from a test):
//   default        the real service (src/online/config.js; nothing is loaded while it has no apiKey)
//   net: 'local'   two tabs of ONE browser on one computer, no account: the first tab runs a tiny local "server"
//                  (localhub.js with the real rules) and the others reach it over a BroadcastChannel
//   net: 'bridge'  the two-page test harness: the page waits for window.__netPort = { post(msg), onmessage }
//   hub            a local hub object in this very page (the one-page tests)
//   pid            this tab's player id on a local network;  nettest: 'lat400,jit200,loss5' slows any of them down
import './ui/online.css';
import { Versus } from './game/versus.js';
import { createTransport } from './transport.js';
import { createSession } from './session.js';
import { createFlow } from './flow.js';
import { createOnlineScreen } from './ui/hub.js';

// The match screens (VS card, versus bar, result) are their own module; a build without it still opens the lobby.
const MATCH_UI = import.meta.glob('./ui/matchui.js', { eager: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A player id for this tab on a local network (tabs of one browser share localStorage, so it lives per tab). */
function tabId(pid) {
  if (pid) return String(pid);
  try {
    let id = sessionStorage.getItem('nimbusRaiders.pid');
    if (!id) { id = `tab-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem('nimbusRaiders.pid', id); }
    return id;
  } catch { return `tab-${Math.random().toString(36).slice(2, 10)}`; }
}

async function pickTransport(opts) {
  const nettest = opts.nettest || null;
  if (opts.hub) return createTransport('local', { hub: opts.hub, uid: tabId(opts.pid), nettest });
  if (opts.net === 'local') {
    if (typeof BroadcastChannel !== 'function') return { transport: null, reason: 'no-channel' };
    const [{ joinChannel }, { createHub }, { createRules }, rules] = await Promise.all([
      import('./localchannel.js'), import('./localhub.js'), import('./rulescheck.js'), import('../../config/firebase/database.rules.json'),
    ]);
    const id = tabId(opts.pid);
    const { port } = await joinChannel({ channel: new BroadcastChannel('nimbus-net'), id, makeHub: () => createHub({ rules: createRules(rules.default || rules) }) });
    return createTransport('local', { port, uid: id, nettest });
  }
  if (opts.net === 'bridge') {
    for (let i = 0; i < 80 && !window.__netPort; i++) await wait(100); // the harness injects it right after load
    const port = window.__netPort;
    if (!port) return { transport: null, reason: 'no-bridge' };
    // the harness owns the clock (a virtual one): this page's "now" is whatever the hub last said
    return createTransport('local', { port, uid: tabId(opts.pid), follow: port.follow !== false, nettest });
  }
  return createTransport('fire', { nettest });
}

/**
 * @param game  the Game
 * @param ui    the Ui; leave it out for the game side only
 * @param opts  { full, net, pid, nettest, hub } (see the top of this file)
 */
export async function installOnline(game, ui, opts = {}) {
  if (!game.versus) {
    game.versus = new Versus(game);
    game.versus.ghost.warm();
  }
  const versus = game.versus;
  if (!ui || !opts || opts.full !== true) return { versus };
  let on = game.online;
  if (!on) {
    const made = await pickTransport(opts || {});
    if (!made.transport) return { versus, flow: null, ok: false, reason: made.reason || 'failed' };
    if (game.online) on = game.online; // (two calls at once: the first one built it)
    else {
      const session = createSession({ transport: made.transport });
      const flow = createFlow(game, ui, { transport: made.transport, session });
      on = game.online = { flow };
      ui.addScreen('online', createOnlineScreen(ui, flow));
      const mu = MATCH_UI['./ui/matchui.js'];
      if (mu && typeof mu.installMatchUi === 'function') mu.installMatchUi(game, ui, flow);
    }
  }
  const res = await on.flow.connect();
  return { versus, flow: on.flow, ...res };
}
