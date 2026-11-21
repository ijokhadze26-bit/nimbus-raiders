// Two-tab play on one computer with no account (?net=local): one tab hosts a local hub and the
// other tabs reach it over a BroadcastChannel. Manual testing only; the first tab to open is the host,
// and if that tab closes the others lose the "server". A client tab that closes says 'bye' (index.js
// closes its transport on pagehide), which frees its seat.
//
//   const { port, hosting, hub } = await joinChannel({ channel: new BroadcastChannel('nimbus-net'), id, makeHub });
//   const transport = createLocalTransport({ port, uid: id });
//
// Bus messages: { who: 1 } "is a hub here?"  { hub: 1 } "yes"
//               { c: id, up: msg } client -> hub      { c: id, down: msg } hub -> client

/** Post, unless the channel has been closed meanwhile (a tab going away): then nobody is listening. */
const send = (channel, m) => { try { channel.postMessage(m); } catch (e) { /* closed */ } };

const listen = (channel, fn) => {
  const h = (e) => { const d = e && e.data; if (d && typeof d === 'object') fn(d); };
  channel.addEventListener('message', h);
  return () => channel.removeEventListener('message', h);
};

/** Client side: a port ({ post, onmessage }) that reaches the hub tab through the channel. */
export function channelPort(channel, id) {
  const port = { onmessage: null, post: (m) => send(channel, { c: id, up: m }) };
  port.close = listen(channel, (d) => { if (d.c === id && d.down && port.onmessage) port.onmessage(d.down); });
  return port;
}

/** Hub side: answer "is a hub here?" and give every client id that speaks its own hub connection. A client's
 *  'bye' (its tab is closing) detaches that connection, so its seat goes the way a closed tab's seat does online. */
export function serveChannel(hub, channel) {
  const ports = new Map();
  return listen(channel, (d) => {
    if (d.who) { send(channel, { hub: 1 }); return; }
    if (typeof d.c !== 'string' || !d.up) return;
    let p = ports.get(d.c);
    if (d.up.op === 'bye') {
      if (p) { ports.delete(d.c); p.handle.detach(); }
      return;
    }
    if (!p) {
      p = { onmessage: null, post: (m) => send(channel, { c: d.c, down: m }) };
      ports.set(d.c, p);
      p.handle = hub.attach(p);
    }
    if (p.onmessage) p.onmessage(d.up);
  });
}

/**
 * joinChannel({ channel, id, makeHub, waitMs }) -> { port, hosting, hub }
 * Asks whether a hub tab exists; if nobody answers within waitMs this tab becomes the host
 * (makeHub() builds the hub) and gets a same-process port.
 */
export function joinChannel({ channel, id, makeHub, waitMs = 250 }) {
  return new Promise((resolve) => {
    let done = false;
    const stop = listen(channel, (d) => {
      if (!d.hub || done) return;
      done = true;
      stop();
      resolve({ port: channelPort(channel, id), hosting: false, hub: null });
    });
    channel.postMessage({ who: 1 });
    setTimeout(() => {
      if (done) return;
      done = true;
      stop();
      const hub = makeHub();
      serveChannel(hub, channel);
      resolve({ port: hub.connect(), hosting: true, hub });
    }, waitMs);
  });
}
