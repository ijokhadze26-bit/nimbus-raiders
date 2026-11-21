// node tests/online/channel.mjs — the two-tab mode (?net=local): a hub shared over a real BroadcastChannel.
// Runs on the real clock (a few hundred ms).
import { test, ok, eq, run, RULES } from './kit.mjs';
import { createHub } from '../../src/online/localhub.js';
import { createLocalTransport } from '../../src/online/transport-local.js';
import { joinChannel } from '../../src/online/localchannel.js';
import { createSession } from '../../src/online/session.js';
import { createRoom, joinRoom } from '../../src/online/room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('the first tab hosts the hub, the second finds it, and they share a room', async () => {
  const name = `nimbus-test-${process.pid}`;
  const tab1 = new BroadcastChannel(name);
  const tab2 = new BroadcastChannel(name);
  const one = await joinChannel({ channel: tab1, id: 'tabA', makeHub: () => createHub({ rules: RULES }), waitMs: 80 });
  const two = await joinChannel({ channel: tab2, id: 'tabB', makeHub: () => createHub({ rules: RULES }), waitMs: 80 });
  eq([one.hosting, two.hosting], [true, false]);
  const a = createLocalTransport({ port: one.port, uid: 'tabA' });
  const b = createLocalTransport({ port: two.port, uid: 'tabB' });
  eq([(await a.connect()).uid, (await b.connect()).uid], ['tabA', 'tabB']);
  ok(Math.abs(a.now() - b.now()) < 100, 'both tabs share the hub clock');
  const sa = createSession({ transport: a }), sb = createSession({ transport: b });
  await sa.connect(); await sb.connect();
  const pa = (await sa.ensureProfile('Tab One')).profile;
  const pb = (await sb.ensureProfile('Tab Two')).profile;
  const ra = await createRoom({ transport: a, profile: pa });
  const rb = await joinRoom({ transport: b, code: ra.code, profile: pb });
  await sleep(50);
  eq(ra.state.seats.map((s) => s.n), ['Tab One', 'Tab Two']);
  eq(rb.state.me, 1);
  const started = new Promise((r) => rb.on('start', r));
  await Promise.all([ra.ready(true), rb.ready(true)]);
  const s = await started;
  await sleep(50);
  eq(ra.state.seed, s.seed);
  ok(s.t0 > a.now() && s.t0 - a.now() < 4100, 'GO is about 4 s away');
  // a guest tab that closes says bye: its seat goes at once and the hub forgets that client
  const before = one.hub.clients();
  b.close();
  await sleep(50);
  eq(one.hub.admin.get(`rooms/${ra.code}/sl/1`), null, 'the closed tab still holds its seat');
  eq(one.hub.clients(), before - 1, 'the closed tab still has a hub connection');
  a.close();
  await sleep(30); // closing drops both seats (a seat is presence): let the hub say so before the tabs go
  eq(one.hub.admin.get(`rooms/${ra.code}/sl`), null, 'both seats were freed when the tabs closed');
  tab1.close(); tab2.close();
});

run('channel');
