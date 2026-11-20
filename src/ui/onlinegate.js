// The door to online play (update 5, SPEC4 §3.1 / §11). This is the ONLY place in the main bundle that reaches
// src/online/**, and it does so through one dynamic import(), so single-player never downloads the online code.
// ui.openOnline(opts) -> loads the chunk (8 s limit), lets it connect, then opens the ONLINE page. What the title
// button shows while that happens is `gate.state`:
//   'idle'         ONLINE
//   'loading'      ONLINE · LOADING      (a second tap while loading does nothing new)
//   'unavailable'  ONLINE · UNAVAILABLE  the chunk did not load or the service did not answer; tap again = try again
//   'soon'         ONLINE · COMING SOON  the game has no online service set up yet
// Every change is announced as 'online:gate' { state, reason } on the game bus. Single-player is never touched.
export const ONLINE_LABEL = { idle: 'ONLINE', loading: 'ONLINE · LOADING', unavailable: 'ONLINE · UNAVAILABLE', soon: 'ONLINE · COMING SOON' };

const within = (p, ms, reason) => new Promise((res, rej) => {
  const t = setTimeout(() => { const e = new Error(`online: ${reason} took too long`); e.reason = reason; rej(e); }, ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export function createOnlineGate(ui) {
  const gate = {
    state: 'idle',
    reason: null,
    busy: null,
    timeoutMs: 8000,
    /** The lazy chunk (tests swap this to imitate a download that fails or hangs). */
    importer: () => import('../online/index.js'),
    label: () => ONLINE_LABEL[gate.state],
    /** opts: { room, watch } from a share link; { net, pid, nettest, hub } pick a local test network. -> { ok, reason } */
    open(opts = {}) {
      if (!gate.busy) gate.busy = run(opts || {}).finally(() => { gate.busy = null; });
      return gate.busy;
    },
  };
  const set = (state, reason = null) => {
    gate.state = state; gate.reason = reason;
    ui.game.events.emit('online:gate', { state, reason });
  };

  async function run(opts) {
    set('loading');
    let res;
    try {
      const mod = await within(gate.importer(), gate.timeoutMs, 'chunk');
      const p = ui.params || {};
      // (the connection has its own 8 s limit inside; the extra seconds here only catch a promise that never settles)
      res = await within(mod.installOnline(ui.game, ui, { net: p.net, pid: p.pid, nettest: p.nettest, ...opts, full: true }), gate.timeoutMs + 6000, 'connect');
    } catch (e) {
      console.warn('[nimbus] online is not available:', (e && e.message) || e);
      res = { ok: false, reason: (e && e.reason) || 'failed' };
    }
    if (!res || !res.ok) {
      const reason = (res && res.reason) || 'failed';
      set(reason === 'unconfigured' ? 'soon' : 'unavailable', reason);
      return { ok: false, reason };
    }
    set('idle');
    // the player may have walked on while it loaded: only someone still on the title is taken to the ONLINE page
    if (ui.game.state === 'title' || ui.game.state === 'online') ui.nav('online', { room: opts.room || null, watch: !!opts.watch });
    return { ok: true, reason: null };
  }
  return gate;
}
