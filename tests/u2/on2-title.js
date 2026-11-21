// @smoke --size 360x640
// Online stage 1 (builder SHELL): the ONLINE button on the title, on the smallest phone (360x640).
// 1. Before the first tap nothing of src/online (or firebase) has been downloaded: the online code is a lazy chunk.
// 2. The wide ONLINE button sits under PLAY, above MODES / SHOP / SETTINGS, inside the frame, overlapping nothing.
// 3. No online service set up (config.js has no apiKey) and no local network asked for: ONLINE · COMING SOON, the
//    title stays, a level still starts.
// 4. The chunk does not load (thrown, then never answering): ONLINE · LOADING while it tries, ONLINE · UNAVAILABLE
//    after; tapping again tries again; the service not answering reads UNAVAILABLE too.
// 5. A working (local) network: the ONLINE page opens and the button is plain ONLINE again; BACK returns to the title.
// 6. Service switched off by the owner: ONLINE IS PAUSED; an old build: UPDATE NEEDED - REFRESH THE PAGE.
// The label fits the button in every state.
const g = window.__game, ui = g.ui;
const K = await import('/tests/u2/lib/on2kit.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const loaded = () => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/online\/|firebase/.test(n));

try {
  ui.nav('title');
  await K.wait(700);
  // ---- 1. lazy ----
  ok(loaded().length === 0, 'online code was downloaded before the first tap: ' + loaded().slice(0, 3).join(', '));
  // (the browser only remembers the first 250 downloads, so also walk the STATIC imports from main.js through every
  //  src file: none may lead into src/online or to firebase; a dynamic import( is the only door)
  const seenMods = new Set(['/src/main.js']), queue = ['/src/main.js'], bad = [];
  const STATIC = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'"()]*?\sfrom\s*)?["']([^"']+)["']/g;
  while (queue.length) {
    const url = queue.pop();
    const code = await (await fetch(url)).text();
    for (const m of code.matchAll(STATIC)) {
      const dep = new URL(m[1], location.origin + url).pathname;
      if (/\/src\/online\/|firebase/.test(dep)) bad.push(`${url} -> ${dep}`);
      if (dep.startsWith('/src/') && !seenMods.has(dep)) { seenMods.add(dep); queue.push(dep + (dep.endsWith('.css') ? '?import' : '')); }
    }
  }
  info.staticModules = seenMods.size;
  ok(bad.length === 0, 'a static import reaches the online code: ' + bad.slice(0, 3).join(', '));
  ok(seenMods.size > 100 && seenMods.has('/src/ui/onlinegate.js') && seenMods.has('/src/save/onlinesave.js'), `the import walk looks wrong: ${seenMods.size} modules`);
  ok(g.versus === undefined && !ui.screens.online, 'game.versus / the online screen exist before the chunk');
  performance.clearResourceTimings(); performance.setResourceTimingBufferSize(4000);
  // ---- 2. layout ----
  const T = ui.screens.title.el, btn = T.querySelector('.btn-online'), lbl = btn.querySelector('.btn-online-lbl');
  const label = () => lbl.textContent;
  const fits = (what) => { const b = btn.getBoundingClientRect(), l = lbl.getBoundingClientRect(); ok(l.left >= b.left + 20 && l.right <= b.right - 8 && btn.scrollWidth <= btn.clientWidth + 1, `"${label()}" does not fit the button (${what}): ${Math.round(l.left)}..${Math.round(l.right)} in ${Math.round(b.left)}..${Math.round(b.right)}`); };
  K.layout(T, ['.btn-play', '.btn-online', '.title-menu .title-row'], fails, 'title');
  const br = btn.getBoundingClientRect();
  ok(label() === 'ONLINE' && btn.dataset.state === 'idle' && br.height >= 42 && br.width >= 250, `button: "${label()}" ${btn.dataset.state} ${Math.round(br.width)}x${Math.round(br.height)}`);
  for (const t of T.querySelectorAll('.title-menu .title-row .tbtn')) ok(t.getBoundingClientRect().height >= 64, 'a bottom tile is too small to tap');
  fits('idle');
  // (the online page's stylesheet arrives with the chunk: it must not restyle the title's label)
  const look = () => { const cs = getComputedStyle(lbl); return `${cs.fontSize} ${cs.color}`; };
  const look0 = look();
  // ---- 3. no service yet ----
  btn.click(); // a real tap through the UI's click handler
  ok(label() === 'ONLINE · LOADING' && btn.dataset.state === 'loading', `while loading: "${label()}"`);
  fits('loading');
  let r = await ui.openOnline(); // (the tap's own attempt: a second call while loading joins it)
  ok(r.ok === false && r.reason === 'unconfigured' && label() === 'ONLINE · COMING SOON' && btn.classList.contains('btn-grey') && !btn.classList.contains('is-disabled'), `no service: ${JSON.stringify(r)} "${label()}"`);
  ok(g.state === 'title' && ui.current === 'title' && !ui.screens.online, 'COMING SOON left the title');
  ok(loaded().some((n) => n.includes('/src/online/index.js')) && !loaded().some((n) => /firebase/.test(n)), 'the chunk did not load on the tap, or firebase loaded without a config');
  fits('soon');
  ok(look() === look0, `the label changed look once the online styles loaded: ${look0} -> ${look()}`);
  ok(g.startLevel(1) && g.state === 'playing', 'single-player does not start after COMING SOON');
  ui.nav('title');
  ok(label() === 'ONLINE · COMING SOON', 'the label is lost when the title comes back');
  // ---- 4. the chunk fails ----
  const real = ui.online.importer;
  ui.online.importer = () => Promise.reject(new Error('chunk 404'));
  r = await ui.openOnline();
  ok(r.ok === false && label() === 'ONLINE · UNAVAILABLE' && btn.dataset.state === 'unavailable' && g.state === 'title', `chunk failed: ${JSON.stringify(r)} "${label()}"`);
  fits('unavailable');
  // a friend's link that fails the first time: the address has dropped ?room= already, so the next tap still joins it
  let seen = null;
  ui.online.importer = () => Promise.resolve({ installOnline: async (g2, u2, o) => { seen = o; return { ok: false, reason: 'offline' }; } });
  await ui.openOnline({ room: 'ABCD' });
  seen = null;
  await ui.openOnline();
  ok(seen && seen.room === 'ABCD' && ui.online.pending && ui.online.pending.room === 'ABCD', `the room code was lost after a failed open: ${JSON.stringify(seen)}`);
  ui.online.pending = null;
  ui.online.importer = () => new Promise(() => {}); // never answers
  ui.online.timeoutMs = 250;
  const t0 = performance.now();
  const p = ui.openOnline();
  ok(label() === 'ONLINE · LOADING', 'a retry does not show LOADING');
  ok(ui.openOnline() === p, 'a second tap while loading started a second attempt');
  r = await p;
  info.hangMs = Math.round(performance.now() - t0);
  ok(r.ok === false && r.reason === 'chunk' && label() === 'ONLINE · UNAVAILABLE' && info.hangMs < 1500, `chunk hangs: ${JSON.stringify(r)} after ${info.hangMs} ms`);
  ui.online.timeoutMs = 8000;
  ui.online.importer = real;
  // ---- 5. a working network ----
  const hub = await K.makeHub();
  r = await ui.openOnline({ hub, pid: 'solo' });
  ok(r.ok && g.state === 'online' && ui.current === 'online' && label() === 'ONLINE' && btn.dataset.state === 'idle', `local hub: ${JSON.stringify(r)} state ${g.state} "${label()}"`);
  ok(!!g.versus && !!ui.screens.online && !!g.online.flow, 'the chunk did not install versus / screens / flow');
  const P = K.page(g);
  K.layout(P.el, ['.topbar', '.on-name'], fails, 'name view 360x640');
  const nb = P.q('.on-nameinput').getBoundingClientRect();
  ok(nb.bottom < 640 * 0.5, `the name box sits at ${Math.round(nb.bottom)} px: a phone keyboard would cover it`);
  ui.onKey({ key: 'Escape' });
  ok(g.state === 'title' && g.online.flow.listeners('change') === 0, 'BACK from the first-visit name view');
  // ---- 6. the owner's switches ----
  hub.admin.set('cfg/on', false);
  r = await ui.openOnline({});
  ok(r.ok && P.view() === 'gate' && /ONLINE IS PAUSED/.test(P.text('.on-gate')), `paused: view ${P.view()} "${P.text('.on-gate')}"`);
  hub.admin.update({ 'cfg/on': true, 'cfg/minBuild': 99 });
  ui.nav('title');
  r = await ui.openOnline({});
  ok(P.view() === 'gate' && /UPDATE NEEDED/.test(P.text('.on-gate')) && /REFRESH THE PAGE/.test(P.text('.on-gate')), `old build: "${P.text('.on-gate')}"`);
  P.tap('.on-gate [data-act="back"]');
  ok(g.state === 'title', 'BACK on the gate view');
  hub.admin.set('cfg/minBuild', 1);
  // ---- 4b. the chunk is there but the service does not answer (session.connect gives up after 8 s: imitated) ----
  const flow = g.online.flow, connect = flow.session.connect;
  flow.session.connect = () => Promise.reject(new Error('timeout'));
  r = await ui.openOnline({});
  ok(r.ok === false && r.reason === 'offline' && label() === 'ONLINE · UNAVAILABLE' && g.state === 'title', `service silent: ${JSON.stringify(r)} "${label()}" ${g.state}`);
  flow.session.connect = connect;
  r = await ui.openOnline({});
  ok(r.ok && g.state === 'online' && label() === 'ONLINE', 'tap again after UNAVAILABLE did not get in');
  ui.nav('title');
  ok(look() === look0, `back on the title after the online pages the label looks different: ${look0} -> ${look()}`);
} catch (e) { fails.push('threw: ' + (e.stack || e)); }
return { pass: fails.length === 0, fails, info };
