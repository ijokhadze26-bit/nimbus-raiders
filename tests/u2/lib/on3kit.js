// Shared setup of the tests/u2/on3-*.js scenarios (the online match UI, src/online/ui/match*). One page, no network:
// the online chunk is installed the minimal way (installOnline), the match UI gets a FAKE flow with the shape of
// src/online/flow.js, and matches are driven by the scripted link of src/online/game/testlink.js.
//
//   const k = await (await import('/tests/u2/lib/on3kit.js')).on3(window.__game);
//   k.start({ rivals: [...], clock, referee, picks })   -> link   (what flow.startMatch does: versus.start(link, picks))
//   k.frames(seconds, until?)                           pump + ui.update at 60 steps a second, no rendering
//   k.flow                                              the fake flow: .calls { rematch, leave: [to...] }, .rs (rematch
//                                                       state, change it and call .emit('change')), .picks, .session
//   k.text(sel) / k.q(sel) / k.shown(sel)               DOM helpers in the UI root
//   k.watch(nodes) -> { take() }                        counts DOM writes under `nodes` (MutationObserver)
//   k.end()                                             leaves a match, autopilot off, back to the title
export async function on3(g, opts = {}) {
  const [{ installOnline }, { createTestLink }, { installMatchUi }, { VS }] = await Promise.all([
    import('/src/online/index.js'), import('/src/online/game/testlink.js'), import('/src/online/ui/matchui.js'), import('/src/online/game/vsdata.js'),
  ]);
  const ui = g.ui, d = g.debug, root = document.getElementById('ui');
  g.loop.stop();
  const { versus } = await installOnline(g, ui);
  // Builder SHELL owns src/ui/ui.js: it adds ui.addScreen and routes a finished 'versus' run to 'vsresult'
  // (ui.js:94-96). A ui.js without them gets the same two things here, so these scenarios pass before and after.
  if (typeof ui.addScreen !== 'function') {
    ui.addScreen = (name, screen) => { ui.screens[name] = screen; };
    const go = ui.go;
    ui.go = function route(name, o) { return go.call(this, name === 'result' && g.run && g.run.mode === 'versus' && this.screens.vsresult ? 'vsresult' : name, o); };
  }

  const listeners = { change: [] };
  const flow = {
    session: { uid: 'me', profile: { n: opts.name || 'Nino' } },
    transport: null,
    room: null,
    link: null,
    picks: { hero: 'pip', weapon: 'thunderclap', heroSkin: 'ninja', weaponSkin: 'candy' },
    calls: { rematch: 0, leave: [], start: 0 },
    rs: { can: true, mine: false, others: [{ slot: 1, name: 'Mika', here: true, wants: false }], waitingFor: null, lost: false, hostLeft: false },
    startMatch(o = {}) {
      flow.calls.start++;
      flow.link = createTestLink({ game: g, seed: 7, ...o });
      versus.start(flow.link, flow.picks);
      return flow.link;
    },
    rematchState() { return flow.rs; },
    rematch() { flow.calls.rematch++; flow.rs = { ...flow.rs, mine: true, waitingFor: (flow.rs.others.find((x) => x.here && !x.wants) || {}).name || null }; flow.emit('change'); },
    leave(to = 'online') {
      flow.calls.leave.push(to);
      versus.stop({ toTitle: false });
      flow.link = null;
      ui.nav('title'); // (the real flow goes to the hub: this page has no 'online' screen)
    },
    on(type, cb) { listeners[type].push(cb); return () => { const i = listeners[type].indexOf(cb); if (i >= 0) listeners[type].splice(i, 1); }; },
    emit(type) { for (const cb of listeners[type].slice()) cb(); },
    listeners,
  };
  const mu = installMatchUi(g, ui, flow);

  const k = {
    g, d, ui, root, versus, flow, mu, VS, createTestLink,
    q: (sel) => root.querySelector(sel),
    qa: (sel) => [...root.querySelectorAll(sel)],
    text: (sel) => { const e = root.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; },
    shown: (sel) => { const e = root.querySelector(sel); return !!e && e.isConnected && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    start(o = {}) {
      const { picks, hero, weapon, autopilot = 'pro', ...link } = o;
      if (picks) flow.picks = picks;
      d.setLoadout(flow.picks.hero || hero || 'pip', flow.picks.weapon || weapon || 'thunderclap');
      if (autopilot) d.setAutopilot(autopilot, 1); else d.setAutopilot(false);
      flow.rs = { can: true, mine: false, others: (link.rivals || [{ slot: 1, name: 'Mika' }]).map((r, i) => ({ slot: r.slot ?? i + 1, name: r.name || 'Rival', here: true, wants: false })), waitingFor: null, lost: false, hostLeft: false };
      return flow.startMatch({ rivals: [{ slot: 1, name: 'Mika' }], ...link });
    },
    /** One game frame without rendering: the match's pump (or a plain step) and the UI update. */
    frame(dt = 1 / 60) {
      if (versus.live) versus.pump(dt, dt); else if (g.state === 'playing' || g.state === 'result') g.step(dt);
      ui.update(dt);
    },
    frames(seconds, until) { for (let i = 0; i < seconds * 60 && !(until && until()); i++) k.frame(); },
    wipe: () => g.squad.setCount(0, 'horde'),
    watch(nodes) {
      const mo = new MutationObserver(() => {});
      for (const n of nodes) if (n) mo.observe(n, { subtree: true, childList: true, attributes: true, characterData: true });
      return { take: () => mo.takeRecords(), stop: () => mo.disconnect() };
    },
    end() {
      if (versus.live || versus.link) versus.stop({ toTitle: false });
      ui.closeModals();
      d.setAutopilot(false);
      d.toTitle();
    },
  };
  return k;
}
